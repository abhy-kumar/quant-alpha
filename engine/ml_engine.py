"""
ml_engine.py
------------
Zero-cost Machine Learning Walk-Forward Alpha Engine for NSE Quantitative Research.
Trains a Scikit-Learn Ensemble Model on historical scan outcome data (21d/63d forward returns)
to estimate forward outperformance probability.
"""

import os
import sqlite3
import numpy as np
import pandas as pd
import joblib
from functools import lru_cache

import sys
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from utils import log, _safe_float
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.metrics import roc_auc_score, accuracy_score
from sklearn.inspection import permutation_importance

MODEL_VERSION = 3
MODEL_PATH = "data/ml_alpha_model.joblib"
DB_PATH = "data/market_scans.db"

FEATURE_COLS = [
    "Tech_Score",
    "Fund_Score",
    "Research_Score",
    "Piotroski_F",
    "Gross_Profit_Score",
    "Earnings_Quality",
    "Risk_Adj_Mom",
    "Vol_60D",
    "Z_Score_60",
    "RSI_Value",
    "ADX_Value",
]


class PurgedGroupTimeSeriesSplit:
    """
    Purged & Embargoed Time-Series Cross-Validator (López de Prado, 2018).
    Prevents temporal data leakage across overlapping forward return evaluation windows.
    """
    def __init__(self, n_splits=5, purge_window=21, embargo_window=10):
        self.n_splits = n_splits
        self.purge_window = purge_window
        self.embargo_window = embargo_window

    def split(self, X, y=None, groups=None):
        if groups is None:
            groups = np.arange(len(X))
        groups = np.asarray(groups)
        unique = np.unique(groups)
        size = len(unique) // (self.n_splits + 1)
        if size < 1:
            return
        for fold in range(1, self.n_splits + 1):
            first = fold * size
            last = (fold+1)*size if fold < self.n_splits else len(unique)
            mature = max(0, first-self.purge_window)
            if mature:
                yield np.flatnonzero(np.isin(groups,unique[:mature])), np.flatnonzero(np.isin(groups,unique[first:last]))


def outperformance_target(stock_percent, benchmark_percent):
    return ((stock_percent - benchmark_percent) >= 1.0).astype(int)


def train_ml_alpha_model() -> HistGradientBoostingClassifier | None:
    """Train gradient boosted decision tree classifier on historical scan outcomes with Purged Group CV."""
    if not os.path.exists(DB_PATH):
        log.warning(f"[ML Engine] Database {DB_PATH} not found. Skipping ML training.")
        return None

    try:
        conn = sqlite3.connect(DB_PATH)

        cursor = conn.cursor()
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='outcome_tracking'")
        if not cursor.fetchone():
            log.warning("[ML Engine] outcome_tracking table missing. Skipping ML training.")
            conn.close()
            return None

        # Fetch feature vector + 21d forward returns ordered by Scan_Date for proper temporal splitting
        query = """
        SELECT 
            t.Ticker, t.Scan_Date,
            t.Return_21d,
            f.Tech_Score, f.Fund_Score, f.Research_Score,
            f.Piotroski_F, f.Gross_Profit_Score, f.Earnings_Quality,
            f.Risk_Adj_Mom, f.Vol_60D, f.Z_Score_60,
            f.RSI_Value, f.ADX_Value
        FROM outcome_tracking t
        JOIN factor_history f ON t.Ticker = f.Ticker AND t.Scan_Date = f.Scan_Date
        WHERE t.Return_21d IS NOT NULL
        ORDER BY t.Scan_Date ASC
        """
        df = pd.read_sql_query(query, conn)
        benchmark = pd.read_sql_query("SELECT Date, Close FROM daily_ohlcv WHERE Ticker='^NSEI' ORDER BY Date", conn)
        conn.close()
        if benchmark.empty:
            return None
        benchmark['forward'] = (benchmark['Close'].shift(-21) / benchmark['Close'] - 1) * 100
        df = df.merge(benchmark[['Date', 'forward']], left_on='Scan_Date', right_on='Date', how='inner').dropna(subset=['forward'])

        if len(df) < 100 or df['Scan_Date'].nunique() < 60:
            log.info(f"[ML Engine] Historical outcome sample count ({len(df)} rows) is developing. Baseline heuristic active.")
            return None

        # Clean null values in feature columns
        for col in FEATURE_COLS:
            if col in df.columns:
                df[col] = pd.to_numeric(df[col], errors="coerce")

        # Target: 1 if excess return over NIFTY 50 >= 1.0% (100 bps alpha hurdle), else 0
        y = outperformance_target(pd.to_numeric(df['Return_21d'], errors='coerce'), df['forward'])
        if y.nunique() < 2:
            return None
        X = df[FEATURE_COLS]

        # Perform Purged & Embargoed TimeSeries Cross-Validation
        if len(df) >= 30:
            n_splits = min(5, len(df) // 10)
            ptscv = PurgedGroupTimeSeriesSplit(n_splits=n_splits, purge_window=21, embargo_window=10)
            cv_scores = []
            cv_aucs = []
            
            for train_idx, val_idx in ptscv.split(X, groups=df["Scan_Date"].to_numpy()):
                X_tr, X_val = X.iloc[train_idx], X.iloc[val_idx]
                y_tr, y_val = y.iloc[train_idx], y.iloc[val_idx]
                
                # Ensure validation slice has both classes before scoring ROC AUC
                if len(np.unique(y_tr)) > 1 and len(np.unique(y_val)) > 1:
                    cv_model = HistGradientBoostingClassifier(
                        max_iter=100, max_depth=4, learning_rate=0.05, random_state=42
                    )
                    cv_model.fit(X_tr, y_tr)
                    probs = cv_model.predict_proba(X_val)[:, 1]
                    cv_scores.append(accuracy_score(y_val, cv_model.predict(X_val)))
                    cv_aucs.append(roc_auc_score(y_val, probs))
            
            if cv_aucs:
                log.info(f"[ML Engine] Purged Group CV ({n_splits}-fold) - Acc: {np.mean(cv_scores):.2%}, ROC-AUC: {np.mean(cv_aucs):.4f}")

        if not cv_aucs:
            log.info("[ML Engine] Too little mature chronological validation history; heuristic active")
            return None

        # Train final model on full dataset
        model = HistGradientBoostingClassifier(
            max_iter=100,
            max_depth=4,
            learning_rate=0.05,
            random_state=42,
        )
        model.fit(X, y)

        # Compute permutation feature importances
        try:
            perm_imp = permutation_importance(model, X, y, n_repeats=5, random_state=42)
            importances = dict(zip(FEATURE_COLS, perm_imp.importances_mean))
            top_factors = sorted(importances.items(), key=lambda x: x[1], reverse=True)[:3]
            log.info(f"[ML Engine] Top Factor Importances: {', '.join([f'{k}: {v:.4f}' for k, v in top_factors])}")
        except Exception as e:
            log.debug(f"[ML Engine] Permutation importance check skipped: {e}")

        os.makedirs(os.path.dirname(MODEL_PATH), exist_ok=True)
        model.qa_version = MODEL_VERSION
        joblib.dump(model, MODEL_PATH + ".tmp")
        os.replace(MODEL_PATH + ".tmp", MODEL_PATH)
        log.info(f"[ML Engine] Successfully trained ML Alpha Model on {len(df)} samples (Win Rate: {y.mean():.2%}).")
        return model

    except Exception as e:
        log.error(f"[ML Engine] Error training ML model: {e}")
        return None


@lru_cache(maxsize=1)
def get_ml_model() -> HistGradientBoostingClassifier | None:
    """Load cached ML model or train if missing."""
    if os.path.exists(MODEL_PATH):
        try:
            import time
            model = joblib.load(MODEL_PATH)
            if getattr(model, 'qa_version', 0) == MODEL_VERSION and time.time() - os.path.getmtime(MODEL_PATH) < 86400:
                return model
        except Exception as e:
            log.warning(f"[ML Engine] Failed loading cached model: {e}")

    return train_ml_alpha_model()


def predict_stock_alpha(stock_dict: dict, model: HistGradientBoostingClassifier | None = None) -> dict:
    """
    Predict 21d outperformance probability for a stock feature dictionary.
    Returns:
      {
        "ml_alpha_prob": float (0.0 to 100.0),
        "ml_conviction": str ("Strong Alpha", "Moderate Alpha", "Neutral", "Low Alpha"),
        "top_drivers": list of string factor names contributing positively
      }
    """
    if model is None:
        model = get_ml_model()

    research_score = _safe_float(stock_dict.get("Research_Score"), 5.0)
    tech_score = _safe_float(stock_dict.get("Tech_Score"), 0.0)
    fund_score = _safe_float(stock_dict.get("Fund_Score"), 5.0)

    top_drivers = []
    if research_score > 6.5: top_drivers.append("High Multi-Factor Rank")
    if tech_score > 8: top_drivers.append("Strong Technical Momentum")
    if fund_score > 6.5: top_drivers.append("Robust Fundamental Quality")

    if model is None:
        # Heuristic ensemble calculation when ML samples are accumulating
        prob = min(95.0, max(5.0, 50.0 + (research_score - 5.0) * 4.5 + (tech_score - 5.0) * 2.4 + (fund_score - 5.0) * 3.0))
    else:
        try:
            X_sample = pd.DataFrame([stock_dict]).reindex(columns=FEATURE_COLS).apply(pd.to_numeric, errors='coerce')
            prob_raw = model.predict_proba(X_sample)[0][1]
            prob = float(np.round(prob_raw * 100, 1))
        except Exception as e:
            log.warning(f"[ML Engine] Prediction fallback: {e}")
            prob = min(95.0, max(5.0, 50.0 + (research_score - 5.0) * 4.5 + (tech_score - 5.0) * 2.4))

    if prob >= 70.0:
        conviction = "Strong Alpha"
    elif prob >= 55.0:
        conviction = "Moderate Alpha"
    elif prob >= 45.0:
        conviction = "Neutral"
    else:
        conviction = "Low Alpha"

    return {
        "ml_alpha_prob": prob,
        "ml_conviction": conviction if model is not None else "Heuristic rank",
        "method": "NIFTY +1 percentage point / 21 trading days" if model is not None else "Uncalibrated factor heuristic",
        "top_drivers": top_drivers,
    }


if __name__ == "__main__":
    log.info("[ML Engine] Running standalone model check...")
    trained = train_ml_alpha_model()
    sample_stock = {
        "Tech_Score": 0.8,
        "Fund_Score": 7.5,
        "Research_Score": 8.2,
        "Piotroski_F": 8,
        "Gross_Profit_Score": 8.0,
        "Earnings_Quality": 7.5,
        "Risk_Adj_Mom": 1.2,
        "Vol_60D": 22.0,
        "Z_Score_60": 0.5,
        "RSI_Value": 58.0,
        "ADX_Value": 32.0,
    }
    res = predict_stock_alpha(sample_stock, trained)
    print("Sample Prediction Result:", res)

