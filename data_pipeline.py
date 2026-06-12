"""
data_pipeline.py
----------------
ML-ready data storage for the stock recommendation system.

Tables:
  - daily_ohlcv:       Raw OHLCV data per stock per day (for backtesting)
  - factor_history:    All factor scores per stock per scan (for feature engineering)
  - outcome_tracking:  Post-scan returns at 1w/1m/3m horizons (for model training)
  - regime_history:    Market regime scores over time (for regime-aware models)
  - scan_summary:      Metadata for each scan run (coverage, timing, regime)
"""

import sqlite3
import os
import logging
from datetime import datetime, timedelta
from typing import Optional

import numpy as np
import pandas as pd

from utils import _safe_float

logger = logging.getLogger("data_pipeline")

DB_PATH = "data/market_scans.db"


def _get_conn() -> sqlite3.Connection:
    os.makedirs("data", exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def init_schema():
    """Create all tables if they don't exist."""
    conn = _get_conn()
    c = conn.cursor()

    c.execute("""
        CREATE TABLE IF NOT EXISTS daily_ohlcv (
            Ticker TEXT NOT NULL,
            Date TEXT NOT NULL,
            Open REAL,
            High REAL,
            Low REAL,
            Close REAL,
            Volume INTEGER,
            PRIMARY KEY (Ticker, Date)
        )
    """)

    c.execute("""
        CREATE TABLE IF NOT EXISTS factor_history (
            Ticker TEXT NOT NULL,
            Scan_Date TEXT NOT NULL,
            Sector TEXT,
            Industry TEXT,
            Price REAL,
            Pct_Change_1d REAL,
            Pct_Weekly REAL,
            Pct_Monthly REAL,
            Pct_3M REAL,
            Pct_6M REAL,
            Pct_12M REAL,
            Composite_Score REAL,
            Tech_Score REAL,
            Fund_Score REAL,
            Research_Score REAL,
            Composite_Score_Tech REAL,
            Composite_Score_Fund REAL,
            Composite_Score_Mom REAL,
            Piotroski_F INTEGER,
            Gross_Profit_Score REAL,
            Earnings_Quality REAL,
            Momentum_1M REAL,
            Momentum_3M REAL,
            Momentum_6M REAL,
            Momentum_12M REAL,
            Risk_Adj_Mom REAL,
            Vol_60D REAL,
            Downside_Dev REAL,
            Reversion_Signal INTEGER,
            Z_Score_60 REAL,
            RSI_Value REAL,
            MACD_Value REAL,
            CCI_Value REAL,
            ATR_Value REAL,
            ADX_Value REAL,
            BB_PctB REAL,
            ST_Signal TEXT,
            Sig_Price_vs_SMA50 INTEGER,
            Sig_Price_vs_SMA200 INTEGER,
            Sig_SMA50_vs_SMA200 INTEGER,
            Sig_RSI INTEGER,
            Sig_MACD INTEGER,
            Sig_ADX INTEGER,
            Sig_Supertrend INTEGER,
            Sig_VPT INTEGER,
            Sig_Ichimoku INTEGER,
            P_E REAL,
            Forward_PE REAL,
            ROE_Pct REAL,
            ROCE_Pct REAL,
            Debt_to_Equity REAL,
            Market_Cap_B REAL,
            Div_Yield_Pct REAL,
            Promoter_Holding_Pct REAL,
            Promoter_Pledging_Pct REAL,
            News_Sentiment REAL,
            Conviction TEXT,
            RS_Percentile REAL,
            Sharpe REAL,
            Total_Return_Pct REAL,
            Ann_Vol_Pct REAL,
            Max_Drawdown_Pct REAL,
            PRIMARY KEY (Ticker, Scan_Date)
        )
    """)

    c.execute("""
        CREATE TABLE IF NOT EXISTS outcome_tracking (
            Ticker TEXT NOT NULL,
            Scan_Date TEXT NOT NULL,
            Conviction_At_Scan TEXT,
            Composite_Score_At_Scan REAL,
            Return_5d REAL,
            Return_10d REAL,
            Return_21d REAL,
            Return_63d REAL,
            Return_126d REAL,
            Return_252d REAL,
            Peak_Return_21d REAL,
            Trough_Return_21d REAL,
            PRIMARY KEY (Ticker, Scan_Date)
        )
    """)

    c.execute("""
        CREATE TABLE IF NOT EXISTS regime_history (
            Scan_Date TEXT PRIMARY KEY,
            Regime_Score INTEGER,
            Nifty_Close REAL,
            Nifty_SMA_200 REAL,
            VIX REAL,
            Breadth_Pct REAL,
            Coverage_Pct REAL,
            Stocks_Scanned INTEGER
        )
    """)

    c.execute("""
        CREATE TABLE IF NOT EXISTS scan_summary (
            Scan_Date TEXT PRIMARY KEY,
            Scan_Date_UTC TEXT,
            Duration_Seconds REAL,
            Tickers_Requested INTEGER,
            Tickers_OHLCV_OK INTEGER,
            Tickers_Info_OK INTEGER,
            Tickers_Final INTEGER,
            Coverage_Pct REAL,
            Regime_Score INTEGER,
            Top_5 TEXT,
            Bottom_5 TEXT
        )
    """)

    c.execute("CREATE INDEX IF NOT EXISTS idx_ohlcv_ticker ON daily_ohlcv(Ticker)")
    c.execute("CREATE INDEX IF NOT EXISTS idx_ohlcv_date ON daily_ohlcv(Date)")
    c.execute("CREATE INDEX IF NOT EXISTS idx_factor_ticker ON factor_history(Ticker)")
    c.execute("CREATE INDEX IF NOT EXISTS idx_factor_date ON factor_history(Scan_Date)")
    c.execute("CREATE INDEX IF NOT EXISTS idx_outcome_date ON outcome_tracking(Scan_Date)")

    conn.commit()
    conn.close()
    logger.info("Data pipeline schema initialized.")


def store_daily_ohlcv(ohlcv_results: dict, scan_date: str):
    """
    Store raw OHLCV data for all stocks.
    ohlcv_results: {ticker: DataFrame} from scanner.
    """
    conn = _get_conn()
    rows = []
    for ticker, df in ohlcv_results.items():
        if df is None or df.empty:
            continue
        for idx, row in df.iterrows():
            date_str = idx.strftime("%Y-%m-%d") if hasattr(idx, "strftime") else str(idx)[:10]
            rows.append((
                ticker, date_str,
                _safe_float(row.get("Open")),
                _safe_float(row.get("High")),
                _safe_float(row.get("Low")),
                _safe_float(row.get("Close")),
                int(_safe_float(row.get("Volume"), default=0)),
            ))

    if rows:
        conn.executemany(
            "INSERT OR REPLACE INTO daily_ohlcv (Ticker, Date, Open, High, Low, Close, Volume) VALUES (?,?,?,?,?,?,?)",
            rows
        )
        conn.commit()
        logger.info(f"Stored {len(rows)} OHLCV rows for {len(ohlcv_results)} tickers.")
    conn.close()


def store_factor_history(rows_data: list[dict], scan_date: str):
    """Store factor scores for all stocks in this scan."""
    conn = _get_conn()
    cols = [
        "Ticker", "Scan_Date", "Sector", "Industry", "Price",
        "Pct_Change_1d", "Pct_Weekly", "Pct_Monthly", "Pct_3M", "Pct_6M", "Pct_12M",
        "Composite_Score", "Tech_Score", "Fund_Score", "Research_Score",
        "Composite_Score_Tech", "Composite_Score_Fund", "Composite_Score_Mom",
        "Piotroski_F", "Gross_Profit_Score", "Earnings_Quality",
        "Momentum_1M", "Momentum_3M", "Momentum_6M", "Momentum_12M",
        "Risk_Adj_Mom", "Vol_60D", "Downside_Dev", "Reversion_Signal", "Z_Score_60",
        "RSI_Value", "MACD_Value", "CCI_Value", "ATR_Value", "ADX_Value", "BB_PctB",
        "ST_Signal", "Sig_Price_vs_SMA50", "Sig_Price_vs_SMA200", "Sig_SMA50_vs_SMA200",
        "Sig_RSI", "Sig_MACD", "Sig_ADX", "Sig_Supertrend", "Sig_VPT", "Sig_Ichimoku",
        "P_E", "Forward_PE", "ROE_Pct", "ROCE_Pct", "Debt_to_Equity", "Market_Cap_B",
        "Div_Yield_Pct", "Promoter_Holding_Pct", "Promoter_Pledging_Pct",
        "News_Sentiment", "Conviction", "RS_Percentile",
        "Sharpe", "Total_Return_Pct", "Ann_Vol_Pct", "Max_Drawdown_Pct",
    ]
    placeholders = ",".join(["?"] * len(cols))
    col_str = ",".join(cols)

    rows = []
    for r in rows_data:
        rows.append((
            r.get("Ticker", ""), scan_date,
            r.get("Sector"), r.get("Industry"),
            _safe_float(r.get("Price")),
            _safe_float(r.get("1d_Chg_%")),
            None, None, None, None, None,
            _safe_float(r.get("Composite_Score")),
            _safe_float(r.get("Tech_Score")),
            _safe_float(r.get("Fund_Score")),
            _safe_float(r.get("Research_Score")),
            _safe_float(r.get("Composite_Score_Tech")),
            _safe_float(r.get("Composite_Score_Fund")),
            _safe_float(r.get("Composite_Score_Mom")),
            int(_safe_float(r.get("Piotroski_F"), default=0)),
            _safe_float(r.get("Gross_Profit_Score")),
            _safe_float(r.get("Earnings_Quality")),
            _safe_float(r.get("Momentum_1M")),
            _safe_float(r.get("Momentum_3M")),
            _safe_float(r.get("Momentum_6M")),
            _safe_float(r.get("Momentum_12M")),
            _safe_float(r.get("Risk_Adj_Mom")),
            _safe_float(r.get("Vol_60D")),
            _safe_float(r.get("Downside_Dev")),
            int(_safe_float(r.get("Reversion_Signal"), default=0)),
            _safe_float(r.get("Z_Score_60")),
            _safe_float(r.get("RSI_Value")),
            _safe_float(r.get("MACD_Value")),
            _safe_float(r.get("CCI_Value")),
            _safe_float(r.get("ATR_Value")),
            _safe_float(r.get("ADX_Value")),
            _safe_float(r.get("BB_%B_Value")),
            r.get("ST_Signal"),
            int(_safe_float(r.get("Sig_Price_vs_SMA50"), default=0)),
            int(_safe_float(r.get("Sig_Price_vs_SMA200"), default=0)),
            int(_safe_float(r.get("Sig_SMA50_vs_SMA200"), default=0)),
            int(_safe_float(r.get("Sig_RSI"), default=0)),
            int(_safe_float(r.get("Sig_MACD_Cross"), default=0)),
            int(_safe_float(r.get("Sig_ADX"), default=0)),
            int(_safe_float(r.get("Sig_Supertrend"), default=0)),
            int(_safe_float(r.get("Sig_VPT"), default=0)),
            int(_safe_float(r.get("Sig_Ichimoku"), default=0)),
            _safe_float(r.get("P/E")),
            _safe_float(r.get("Forward_P/E")),
            _safe_float(r.get("ROE_%")),
            _safe_float(r.get("ROCE_%")),
            _safe_float(r.get("Debt_to_Equity")),
            _safe_float(r.get("Market_Cap_B")),
            _safe_float(r.get("Div_Yield_%")),
            _safe_float(r.get("Promoter_Holding_%")),
            _safe_float(r.get("Promoter_Pledging_%")),
            _safe_float(r.get("News_Sentiment")),
            r.get("Conviction"),
            _safe_float(r.get("RS_Percentile")),
            _safe_float(r.get("Sharpe")),
            _safe_float(r.get("Total_Return_%")),
            _safe_float(r.get("Ann_Vol_%")),
            _safe_float(r.get("Max_Drawdown_%")),
        ))

    if rows:
        conn.executemany(f"INSERT OR REPLACE INTO factor_history ({col_str}) VALUES ({placeholders})", rows)
        conn.commit()
        logger.info(f"Stored factor history for {len(rows)} stocks.")
    conn.close()


def update_outcome_tracking(scan_date: str, ohlcv_results: dict):
    """
    For historical scans, compute actual forward returns and store them.
    Called during each new scan to backfill outcomes for past scans.
    """
    conn = _get_conn()
    c = conn.cursor()

    c.execute("SELECT DISTINCT Scan_Date FROM factor_history WHERE Scan_Date < ? ORDER BY Scan_Date DESC LIMIT 60", (scan_date,))
    past_dates = [row[0] for row in c.fetchall()]

    if not past_dates:
        conn.close()
        return

    all_tickers_ohlcv = {}
    for ticker, df in ohlcv_results.items():
        if df is not None and not df.empty:
            all_tickers_ohlcv[ticker] = df

    updated = 0
    for past_date in past_dates:
        c.execute("SELECT Ticker, Conviction_At_Scan FROM outcome_tracking WHERE Scan_Date = ? AND Return_21d IS NULL", (past_date,))
        pending = c.fetchall()

        if not pending:
            continue

        past_dt = datetime.strptime(past_date, "%Y-%m-%d")
        for ticker, conviction in pending:
            if ticker not in all_tickers_ohlcv:
                continue

            df = all_tickers_ohlcv[ticker]
            try:
                df_idx = df.index
                mask = df_idx >= past_dt
                future = df[mask]
                if len(future) < 2:
                    continue

                base_price = float(future.iloc[0]["Close"])

                def _ret(days):
                    if len(future) > days:
                        return round((float(future.iloc[days]["Close"]) / base_price - 1) * 100, 2)
                    return None

                def _peak_ret(days):
                    if len(future) > days:
                        peak = float(future.iloc[:days+1]["High"].max())
                        return round((peak / base_price - 1) * 100, 2)
                    return None

                def _trough_ret(days):
                    if len(future) > days:
                        trough = float(future.iloc[:days+1]["Low"].min())
                        return round((trough / base_price - 1) * 100, 2)
                    return None

                c.execute("""
                    UPDATE outcome_tracking SET
                        Return_5d = COALESCE(Return_5d, ?),
                        Return_10d = COALESCE(Return_10d, ?),
                        Return_21d = COALESCE(Return_21d, ?),
                        Return_63d = COALESCE(Return_63d, ?),
                        Return_126d = COALESCE(Return_126d, ?),
                        Return_252d = COALESCE(Return_252d, ?),
                        Peak_Return_21d = COALESCE(Peak_Return_21d, ?),
                        Trough_Return_21d = COALESCE(Trough_Return_21d, ?)
                    WHERE Ticker = ? AND Scan_Date = ?
                """, (
                    _ret(5), _ret(10), _ret(21), _ret(63), _ret(126), _ret(252),
                    _peak_ret(21), _trough_ret(21),
                    ticker, past_date
                ))
                updated += 1
            except Exception:
                continue

    conn.commit()
    logger.info(f"Updated outcomes for {updated} stock-scan pairs.")
    conn.close()


def create_outcome_entries(rows_data: list[dict], scan_date: str):
    """Create outcome tracking entries for today's scan (to be backfilled later)."""
    conn = _get_conn()
    rows = []
    for r in rows_data:
        ticker = r.get("Ticker", "")
        rows.append((
            ticker, scan_date,
            r.get("Conviction"),
            _safe_float(r.get("Composite_Score")),
        ))
    if rows:
        conn.executemany(
            "INSERT OR IGNORE INTO outcome_tracking (Ticker, Scan_Date, Conviction_At_Scan, Composite_Score_At_Scan) VALUES (?,?,?,?)",
            rows
        )
        conn.commit()
    conn.close()


def store_regime_history(scan_date: str, regime_score: int, nifty_df=None, breadth_pct: float = None,
                         coverage_pct: float = 0, stocks_scanned: int = 0):
    """Store market regime snapshot."""
    conn = _get_conn()
    nifty_close = None
    nifty_sma200 = None
    if nifty_df is not None and len(nifty_df) > 0:
        nifty_close = _safe_float(nifty_df["Close"].iloc[-1])
        if "SMA_200" in nifty_df.columns:
            nifty_sma200 = _safe_float(nifty_df["SMA_200"].iloc[-1])

    conn.execute("""
        INSERT OR REPLACE INTO regime_history
        (Scan_Date, Regime_Score, Nifty_Close, Nifty_SMA_200, Breadth_Pct, Coverage_Pct, Stocks_Scanned)
        VALUES (?,?,?,?,?,?,?)
    """, (scan_date, regime_score, nifty_close, nifty_sma200, breadth_pct, coverage_pct, stocks_scanned))
    conn.commit()
    conn.close()


def store_scan_summary(scan_date: str, duration: float, requested: int, ohlcv_ok: int,
                       info_ok: int, final: int, coverage: float, regime: int,
                       top_5: list, bottom_5: list):
    """Store scan run metadata."""
    conn = _get_conn()
    conn.execute("""
        INSERT OR REPLACE INTO scan_summary
        (Scan_Date, Scan_Date_UTC, Duration_Seconds, Tickers_Requested, Tickers_OHLCV_OK,
         Tickers_Info_OK, Tickers_Final, Coverage_Pct, Regime_Score, Top_5, Bottom_5)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)
    """, (
        scan_date, datetime.utcnow().isoformat(), duration, requested, ohlcv_ok,
        info_ok, final, coverage, regime,
        ",".join(top_5) if top_5 else None,
        ",".join(bottom_5) if bottom_5 else None,
    ))
    conn.commit()
    conn.close()


def get_ml_dataset(min_date: str = None, max_date: str = None) -> pd.DataFrame:
    """
    Load the factor_history joined with outcomes for ML training.
    Returns a DataFrame with features + forward returns as labels.
    """
    conn = _get_conn()
    query = """
        SELECT f.*, o.Return_5d, o.Return_10d, o.Return_21d, o.Return_63d,
               o.Return_126d, o.Return_252d, o.Peak_Return_21d, o.Trough_Return_21d
        FROM factor_history f
        LEFT JOIN outcome_tracking o ON f.Ticker = o.Ticker AND f.Scan_Date = o.Scan_Date
    """
    params = []
    conditions = []
    if min_date:
        conditions.append("f.Scan_Date >= ?")
        params.append(min_date)
    if max_date:
        conditions.append("f.Scan_Date <= ?")
        params.append(max_date)
    if conditions:
        query += " WHERE " + " AND ".join(conditions)
    query += " ORDER BY f.Scan_Date, f.Ticker"

    df = pd.read_sql_query(query, conn, params=params)
    conn.close()
    return df


def get_stock_timeseries(ticker: str, min_date: str = None) -> pd.DataFrame:
    """Get factor history time series for a single stock."""
    conn = _get_conn()
    query = "SELECT * FROM factor_history WHERE Ticker = ?"
    params = [ticker]
    if min_date:
        query += " AND Scan_Date >= ?"
        params.append(min_date)
    query += " ORDER BY Scan_Date"
    df = pd.read_sql_query(query, conn, params=params)
    conn.close()
    return df


def get_regime_timeseries(min_date: str = None) -> pd.DataFrame:
    """Get regime history time series."""
    conn = _get_conn()
    query = "SELECT * FROM regime_history"
    params = []
    if min_date:
        query += " WHERE Scan_Date >= ?"
        params.append(min_date)
    query += " ORDER BY Scan_Date"
    df = pd.read_sql_query(query, conn, params=params)
    conn.close()
    return df


def get_outcome_accuracy(min_date: str = None) -> pd.DataFrame:
    """
    Compute recommendation accuracy: how often each conviction level
    led to positive forward returns.
    """
    conn = _get_conn()
    query = """
        SELECT Conviction_At_Scan,
               COUNT(*) as n,
               AVG(CASE WHEN Return_21d > 0 THEN 1.0 ELSE 0.0 END) as win_rate_21d,
               AVG(Return_21d) as avg_return_21d,
               AVG(CASE WHEN Return_63d > 0 THEN 1.0 ELSE 0.0 END) as win_rate_63d,
               AVG(Return_63d) as avg_return_63d
        FROM outcome_tracking
        WHERE Return_21d IS NOT NULL
    """
    params = []
    if min_date:
        query += " AND Scan_Date >= ?"
        params.append(min_date)
    query += " GROUP BY Conviction_At_Scan ORDER BY avg_return_21d DESC"
    df = pd.read_sql_query(query, conn, params=params)
    conn.close()
    return df


init_schema()
