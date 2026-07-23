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

from utils import log, _safe_float
from sklearn.ensemble import HistGradientBoostingClassifier

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


def train_ml_alpha_model() -> HistGradientBoostingClassifier | None:
    """Train gradient boosted decision tree classifier on historical scan outcomes."""
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

        # Fetch feature vector + 21d forward returns
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
        """
        df = pd.read_sql_query(query, conn)
        conn.close()

        if len(df) < 15:
            log.info(f"[ML Engine] Historical outcome sample count ({len(df)} rows) is developing. Baseline heuristic active.")
            return None

        # Clean null values in feature columns
        for col in FEATURE_COLS:
            if col in df.columns:
                df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0.0)

        # Target: 1 if positive return over 21d, else 0
        y = (df["Return_21d"] > 0).astype(int)
        X = df[FEATURE_COLS]

        # Train model
        model = HistGradientBoostingClassifier(
            max_iter=100,
            max_depth=4,
            learning_rate=0.05,
            random_state=42,
        )
        model.fit(X, y)

        os.makedirs(os.path.dirname(MODEL_PATH), exist_ok=True)
        joblib.dump(model, MODEL_PATH)
        log.info(f"[ML Engine] Successfully trained ML Alpha Model on {len(df)} samples (Win Rate: {y.mean():.2%}).")
        return model

    except Exception as e:
        log.error(f"[ML Engine] Error training ML model: {e}")
        return None


def get_ml_model() -> HistGradientBoostingClassifier | None:
    """Load cached ML model or train if missing."""
    if os.path.exists(MODEL_PATH):
        try:
            return joblib.load(MODEL_PATH)
        except Exception as e:
            log.warning(f"[ML Engine] Failed loading cached model: {e}")

    return train_ml_alpha_model()


def predict_stock_alpha(stock_dict: dict, model: HistGradientBoostingClassifier | None = None) -> dict:
    """
    Predict 21d outperformance probability for a stock feature dictionary.
    Returns:
      {
        "ml_alpha_prob": float (0.0 to 100.0),
        "ml_conviction": str ("Strong Alpha", "Moderate Alpha", "Neutral", "Low Alpha")
      }
    """
    if model is None:
        model = get_ml_model()

    research_score = _safe_float(stock_dict.get("Research_Score"), 5.0)
    tech_score = _safe_float(stock_dict.get("Tech_Score"), 0.0)
    fund_score = _safe_float(stock_dict.get("Fund_Score"), 5.0)

    if model is None:
        # Heuristic ensemble calculation when ML samples are accumulating
        prob = min(95.0, max(5.0, 50.0 + (research_score - 5.0) * 4.5 + tech_score * 12.0 + (fund_score - 5.0) * 3.0))
    else:
        try:
            features = [
                tech_score,
                fund_score,
                research_score,
                _safe_float(stock_dict.get("Piotroski_F"), 5.0),
                _safe_float(stock_dict.get("Gross_Profit_Score"), 5.0),
                _safe_float(stock_dict.get("Earnings_Quality"), 5.0),
                _safe_float(stock_dict.get("Risk_Adj_Mom"), 0.0),
                _safe_float(stock_dict.get("Vol_60D"), 25.0),
                _safe_float(stock_dict.get("Z_Score_60"), 0.0),
                _safe_float(stock_dict.get("RSI_Value"), 50.0),
                _safe_float(stock_dict.get("ADX_Value"), 20.0),
            ]
            X_sample = np.array([features])
            prob_raw = model.predict_proba(X_sample)[0][1]
            prob = float(np.round(prob_raw * 100, 1))
        except Exception as e:
            log.warning(f"[ML Engine] Prediction fallback: {e}")
            prob = min(95.0, max(5.0, 50.0 + (research_score - 5.0) * 4.5 + tech_score * 12.0))

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
        "ml_conviction": conviction,
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
