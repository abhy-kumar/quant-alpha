"""
weekend_update.py
-----------------
Lightweight weekend job that runs without a full market scan.

Steps:
  1. Fetch fresh OHLCV for all tickers that have pending outcome tracking rows
  2. Backfill forward returns (outcome_tracking) using that fresh OHLCV data
  3. Re-run the quant engine to regenerate quant_data.json and backtest_runs/

This lets forward return labels settle over the weekend and keeps the Quant Lab
data current without doing a full 150-stock scan + fundamental fetch.
"""

import logging
import sqlite3
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime

import pandas as pd
import yfinance as yf

import engine.quant_engine as quant_engine
from data_pipeline.data_pipeline import update_outcome_tracking, DB_PATH
from config import PERIOD, INTERVAL, MIN_ROWS

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("weekend_update")

_YF_SESSION = None  # use default yfinance session for simplicity

MAX_WORKERS = 6


def _get_tracked_tickers() -> list[str]:
    """Return distinct tickers that still have NULL forward returns."""
    try:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute("""
            SELECT DISTINCT Ticker FROM outcome_tracking
            WHERE Return_21d IS NULL OR Return_63d IS NULL
        """)
        tickers = [row[0] for row in c.fetchall()]
        conn.close()
        return tickers
    except Exception as e:
        log.error(f"Could not query tracked tickers: {e}")
        return []


def _fetch_ohlcv(ticker: str) -> tuple[str, pd.DataFrame | None]:
    """Fetch 2Y OHLCV for a single ticker via yfinance."""
    try:
        df = yf.download(
            ticker, period=PERIOD, interval=INTERVAL,
            auto_adjust=True, progress=False
        )
        if df.empty:
            return ticker, None
        if isinstance(df.columns, pd.MultiIndex):
            df.columns = df.columns.get_level_values(0)
        df.dropna(subset=["Close"], inplace=True)
        if len(df) < MIN_ROWS:
            return ticker, None
        return ticker, df
    except Exception as e:
        log.warning(f"OHLCV fetch failed for {ticker}: {e}")
        return ticker, None


def fetch_ohlcv_for_tickers(tickers: list[str]) -> dict[str, pd.DataFrame]:
    """Fetch OHLCV concurrently for a list of tickers."""
    results = {}
    log.info(f"Fetching OHLCV for {len(tickers)} tracked tickers ({MAX_WORKERS} workers)...")
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        futures = {executor.submit(_fetch_ohlcv, t): t for t in tickers}
        for i, future in enumerate(as_completed(futures), 1):
            ticker, df = future.result()
            if df is not None:
                results[ticker] = df
            if i % 25 == 0:
                log.info(f"  {i}/{len(tickers)} done")
    log.info(f"OHLCV fetched for {len(results)}/{len(tickers)} tickers")
    return results


def run():
    start = time.time()
    log.info("=== Weekend Update Started ===")

    # Step 1: Find tickers with unsettled outcome rows
    tickers = _get_tracked_tickers()
    if not tickers:
        log.info("No pending outcome rows found — skipping OHLCV fetch.")
        ohlcv_results = {}
    else:
        # Step 2: Fetch fresh OHLCV
        ohlcv_results = fetch_ohlcv_for_tickers(tickers)

        # Step 3: Backfill forward returns using today as the "scan date"
        # update_outcome_tracking uses the OHLCV data to fill past pending rows
        today = datetime.now().strftime("%Y-%m-%d")
        log.info(f"Running outcome backfill (reference date: {today})...")
        update_outcome_tracking(today, ohlcv_results)
        log.info("Outcome backfill complete.")

    # Step 4: Run backtests to generate weekend snapshots in backtest_cache
    log.info("Running all current backtests for weekend snapshot...")
    try:
        import engine.backtest_engine as backtest_engine
        backtest_engine.run_all_current_backtests()
    except Exception as e:
        log.error(f"Failed to run weekend backtests: {e}")

    # Step 5: Regenerate quant_data.json and backtest_runs/
    log.info("Running quant engine to regenerate quant_data.json...")
    quant_engine.generate_quant_data()

    elapsed = time.time() - start
    log.info(f"=== Weekend Update Done in {elapsed:.1f}s ===")


if __name__ == "__main__":
    run()

