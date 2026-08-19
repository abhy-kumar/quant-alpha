"""
scanner.py
----------
Main orchestrator for the stock scanning pipeline.
Delegates data acquisition to data_fetcher.py and scoring to scoring.py.
"""

import time
import json
import concurrent.futures
import sqlite3
import os
from datetime import datetime, timezone, timedelta

import numpy as np
import pandas as pd

from utils import log, _safe_float
from config import MAX_WORKERS_OHLCV, MAX_WORKERS_FUNDAMENTALS
from engine.indicators import add_indicators, compute_metrics
from data_pipeline.nse_fetcher import get_liquid_universe, download_bhav_copy, get_market_breadth, get_fii_dii_activity, get_put_call_ratio
from data_pipeline.data_fetcher import (
    fetch_ohlcv_with_retry, fetch_fundamentals, get_ath, get_atl, cache_manager
)
from engine.scoring import compute_rs_score, compute_sector_medians, compute_all_scores, build_output_row
from engine.recommendation import compute_tech_score
from engine.regime_engine import compute_regime_score as _compute_regime_score
from data_pipeline.data_pipeline import (
    store_daily_ohlcv, store_factor_history, create_outcome_entries,
    update_outcome_tracking, store_regime_history, store_scan_summary,
)
from notifications.generate_score_history import generate as generate_score_history
import engine.quant_engine as quant_engine

IST = timezone(timedelta(hours=5, minutes=30))



def _fetch_market_indicators():
    """Fetch market-wide indicators (NIFTY, VIX, FII/DII, PCR, breadth)."""
    nifty_df = None
    vix_df = None
    fii_dii = {"fii_net": 0, "dii_net": 0}
    pcr_data = {"pcr": 1.0}
    breadth_pct = None

    try:
        nifty_df = fetch_ohlcv_with_retry("^NSEI")
    except Exception as e:
        log.warning(f"Failed to fetch NIFTY: {e}")

    try:
        vix_df = fetch_ohlcv_with_retry("^INDIAVIX")
    except Exception as e:
        log.warning(f"Failed to fetch VIX: {e}")

    try:
        fii_dii = get_fii_dii_activity()
    except Exception as e:
        log.warning(f"Failed to fetch FII/DII: {e}")

    try:
        pcr_data = get_put_call_ratio()
    except Exception as e:
        log.warning(f"Failed to fetch PCR: {e}")

    bhav_df, _ = download_bhav_copy()
    if not bhav_df.empty:
        breadth = get_market_breadth(bhav_df)
        breadth_pct = breadth.get("breadth_pct", 0.5)

    return nifty_df, vix_df, fii_dii, pcr_data, breadth_pct


def _fetch_ohlcv_batch(tickers: list, progress_callback=None) -> tuple[dict, int]:
    """Fetch OHLCV data for all tickers in parallel."""
    total = len(tickers)
    ohlcv_results = {}

    def fetch_job(ticker):
        try:
            df = fetch_ohlcv_with_retry(ticker)
            df = add_indicators(df)
            return ticker, df, None
        except Exception as e:
            log.warning(f"OHLCV failed for {ticker}: {type(e).__name__}: {e}")
            return ticker, None, e

    with concurrent.futures.ThreadPoolExecutor(max_workers=MAX_WORKERS_OHLCV) as executor:
        futures = {executor.submit(fetch_job, t): t for t in tickers}
        completed = 0
        for future in concurrent.futures.as_completed(futures):
            t, df, err = future.result()
            if df is not None:
                ohlcv_results[t] = df
            completed += 1
            if progress_callback:
                progress_callback(completed, total * 2, f"Fetching OHLCV {t}")

    return ohlcv_results


def _fetch_info_batch(ohlcv_results: dict, progress_callback=None) -> tuple[dict, int]:
    """Fetch fundamental info for all valid tickers in parallel with safe fallback."""
    valid_tickers = list(ohlcv_results.keys())
    total = len(valid_tickers)
    info_results = {}

    def fetch_job(ticker, df):
        sym = ticker.replace(".NS", "").replace(".BO", "")
        df_high = _safe_float(df["High"].max()) if df is not None and not df.empty else np.nan
        df_low = _safe_float(df["Low"].min()) if df is not None and not df.empty else np.nan
        try:
            info = fetch_fundamentals(ticker)
            if not info or not isinstance(info, dict):
                info = cache_manager.get("fundamentals", sym) or {}
            fifty_two_high = _safe_float(info.get("fiftyTwoWeekHigh"))
            fifty_two_low = _safe_float(info.get("fiftyTwoWeekLow"))
            base_high = np.nanmax([df_high, fifty_two_high]) if not np.isnan(np.nanmax([df_high, fifty_two_high])) else df_high
            base_low = np.nanmin([df_low, fifty_two_low]) if not np.isnan(np.nanmin([df_low, fifty_two_low])) else df_low
            ath, ath_source = get_ath(ticker, base_high)
            atl, atl_source = get_atl(ticker, base_low)
            return ticker, info, ath, ath_source, atl, atl_source, None
        except Exception as e:
            # Fallback to cached fundamentals or safe neutral defaults
            cached_info = cache_manager.get("fundamentals", sym) or {}
            base_high = df_high
            base_low = df_low
            ath, ath_source = get_ath(ticker, base_high)
            atl, atl_source = get_atl(ticker, base_low)
            fallback_info = {
                "shortName": ticker.replace(".NS", ""),
                "sector": cached_info.get("sector", "Other"),
                "industry": cached_info.get("industry", "Other"),
                "fiftyTwoWeekHigh": base_high,
                "fiftyTwoWeekLow": base_low,
                **cached_info
            }
            return ticker, fallback_info, ath, ath_source, atl, atl_source, e

    with concurrent.futures.ThreadPoolExecutor(max_workers=MAX_WORKERS_FUNDAMENTALS) as executor:
        futures = {executor.submit(fetch_job, t, ohlcv_results[t]): t for t in valid_tickers}
        completed = 0
        for future in concurrent.futures.as_completed(futures):
            t, info, ath, ath_source, atl, atl_source, err = future.result()
            if info is not None:
                info_results[t] = {"info": info, "ath": ath, "ath_source": ath_source, "atl": atl, "atl_source": atl_source}
            if err:
                log.debug(f"Info notice for {t}: {err}")
            completed += 1
            if progress_callback:
                progress_callback(total + completed, total * 2, f"Fetching Info {t}")

    return info_results


def _build_intermediate_rows(raw_data: dict, nifty_df, etf_list: list) -> tuple[list, dict, list]:
    """Build intermediate rows with tech scores and sector data."""
    rows_intermediate = []
    sector_data = {}
    rs_composites = []

    for ticker, data in raw_data.items():
        df = data["df"]
        info = data["info"]
        latest = df.iloc[-1]
        prev = df.iloc[-2]
        met = compute_metrics(df)

        tech = compute_tech_score(latest, prev, df, nifty_df, fifty_two_high=_safe_float(info.get("fiftyTwoWeekHigh")))

        rs_score, _ = compute_rs_score(tech)
        rs_composites.append(rs_score)

        sym = ticker.replace('.NS', '').replace('.BO', '')
        long_name = info.get("longName") or info.get("shortName") or sym

        is_etf = sym in etf_list or "BEES" in ticker.upper() or "ETF" in ticker.upper() or "ETF" in long_name.upper()

        # Liquidity and Market Cap Gating for non-ETF equities
        if not is_etf:
            adtv_30d = (df["Close"] * df["Volume"]).tail(30).mean()
            mcap = _safe_float(info.get("marketCap"))
            if adtv_30d < 10_000_000 or (not np.isnan(mcap) and mcap > 0 and mcap < 500_000_000):
                log.info(f"[Scanner] Pre-filter: Excluded illiquid/microcap {ticker} (ADTV: ₹{adtv_30d/1e5:.1f}L, MCAP: ₹{mcap/1e7 if not np.isnan(mcap) else 0:.1f}Cr)")
                continue

        sector = "ETF" if is_etf else (info.get("sector", "Unknown") or "Unknown")
        industry = "Exchange Traded Fund" if is_etf else (info.get("industry", "Unknown") or "Unknown")

        pe = _safe_float(info.get("trailingPE"))
        close = _safe_float(latest["Close"])
        if pd.isna(pe):
            eps = _safe_float(info.get("trailingEps"))
            if not pd.isna(eps) and eps != 0 and close > 0:
                pe = close / eps

        roe_pct = round((_safe_float(info.get("returnOnEquity"), 0)) * 100, 2)
        debt_eq = _safe_float(info.get("debtToEquity"))

        if not is_etf and sector != "Unknown":
            if sector not in sector_data:
                sector_data[sector] = {'pe': [], 'roe': [], 'debt_eq': []}
            if not np.isnan(pe):
                sector_data[sector]['pe'].append(pe)
            if not np.isnan(roe_pct):
                sector_data[sector]['roe'].append(roe_pct)
            if not np.isnan(debt_eq):
                sector_data[sector]['debt_eq'].append(debt_eq)

            for p in info.get("screener_peers", []):
                if 'pe' in p:
                    sector_data[sector]['pe'].append(p['pe'])
                if 'roe' in p:
                    sector_data[sector]['roe'].append(p['roe'])
                if 'debt_eq' in p:
                    sector_data[sector]['debt_eq'].append(p['debt_eq'])

        rows_intermediate.append({
            "ticker": ticker, "is_etf": is_etf, "sector": sector, "industry": industry,
            "info": info, "tech": tech, "met": met, "latest": latest, "prev": prev,
            "df": df, "rs_composite": rs_score, "pe": pe, "roe": roe_pct, "debt_eq": debt_eq,
            "ath": data["ath"], "ath_source": data["ath_source"],
            "atl": data["atl"], "atl_source": data["atl_source"],
            "long_name": long_name
        })

    return rows_intermediate, sector_data, rs_composites


def _get_outcome_accuracy() -> dict:
    """Compute outcome accuracy from ML pipeline."""
    outcome_accuracy = {}
    try:
        from data_pipeline.data_pipeline import get_outcome_accuracy
        acc_df = get_outcome_accuracy()
        if not acc_df.empty:
            for _, row in acc_df.iterrows():
                outcome_accuracy[row["Conviction_At_Scan"]] = {
                    "n": int(row["n"]),
                    "win_rate_21d": round(float(row["win_rate_21d"]) * 100, 1) if row["win_rate_21d"] is not None else None,
                    "avg_return_21d": round(float(row["avg_return_21d"]), 2) if row["avg_return_21d"] is not None else None,
                    "win_rate_63d": round(float(row["win_rate_63d"]) * 100, 1) if row["win_rate_63d"] is not None else None,
                    "avg_return_63d": round(float(row["avg_return_63d"]), 2) if row["avg_return_63d"] is not None else None,
                }
    except Exception as e:
        log.warning(f"Could not compute outcome accuracy: {e}")
    return outcome_accuracy


def _get_first_scan_date() -> str | None:
    """Get the first scan date from the database."""
    try:
        from data_pipeline.data_pipeline import _get_conn
        conn = _get_conn()
        cursor = conn.cursor()
        cursor.execute("SELECT MIN(Scan_Date) FROM factor_history")
        row = cursor.fetchone()
        conn.close()
        if row and row[0]:
            return row[0]
    except Exception:
        pass
    return None


def _archive_scan(result_df: pd.DataFrame, scan_time: datetime) -> None:
    """Archive scan results to SQLite with schema migration support."""
    try:
        os.makedirs("data", exist_ok=True)
        conn = sqlite3.connect("data/market_scans.db")
        sql_df = result_df.copy()
        sql_df["Scan_Date"] = scan_time.strftime("%Y-%m-%d %H:%M:%S")
        sql_df["Scan_Date_UTC"] = scan_time.astimezone(timezone.utc).isoformat()
        cursor = conn.cursor()

        table_exists = cursor.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='historical_scans'"
        ).fetchone() is not None

        if table_exists:
            cursor.execute("PRAGMA table_info(historical_scans)")
            existing_cols = {col[1] for col in cursor.fetchall()}
            for col in sql_df.columns:
                if col not in existing_cols:
                    dtype = "REAL"
                    if sql_df[col].dtype == object:
                        dtype = "TEXT"
                    elif pd.api.types.is_integer_dtype(sql_df[col]):
                        dtype = "INTEGER"
                    cursor.execute(f'ALTER TABLE historical_scans ADD COLUMN "{col}" {dtype}')
        else:
            cursor.execute('''
                CREATE TABLE historical_scans (
                    Scan_Date TEXT,
                    Scan_Date_UTC TEXT,
                    Ticker TEXT,
                    Composite_Score REAL,
                    Tech_Score REAL,
                    Fund_Score REAL,
                    Research_Score REAL,
                    Conviction TEXT,
                    Sector TEXT,
                    Price REAL,
                    UNIQUE(Scan_Date, Ticker)
                )
            ''')
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_scan_date ON historical_scans(Scan_Date)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_ticker ON historical_scans(Ticker)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_composite ON historical_scans(Composite_Score)")

        sql_df.to_sql("historical_scans", conn, if_exists="append", index=False)
        conn.close()
        log.info(f"Successfully archived {len(sql_df)} records to historical_scans database.")
    except Exception as e:
        log.error(f"Failed to archive scan: {e}")


def _store_ml_data(final_rows, ohlcv_results, nifty_df, breadth_pct, coverage_pct,
                   requested, ohlcv_ok, info_ok, final, regime_score, scan_time, duration=0):
    """Store all data for ML pipeline."""
    scan_date = scan_time.strftime("%Y-%m-%d")
    try:
        store_daily_ohlcv(ohlcv_results, scan_date)
        store_factor_history(final_rows, scan_date)
        create_outcome_entries(final_rows, scan_date)
        update_outcome_tracking(scan_date, ohlcv_results)
        store_regime_history(scan_date, regime_score, nifty_df, breadth_pct, coverage_pct, final)

        top_5 = [r["Ticker"] for r in final_rows[:5]]
        bottom_5 = [r["Ticker"] for r in final_rows[-5:]]
        store_scan_summary(scan_date, duration, requested, ohlcv_ok, info_ok, final,
                          coverage_pct, regime_score, top_5, bottom_5)
        log.info(f"ML data pipeline: stored OHLCV, factors, outcomes, regime for {scan_date}")
    except Exception as e:
        log.error(f"ML data pipeline failed: {e}")


def run_scanner(progress_callback=None) -> pd.DataFrame:
    """Main scanner entry point. Orchestrates the full scan pipeline."""
    scan_time = datetime.now(IST)
    scan_start = time.time()

    log.info("Fetching market indicators...")
    nifty_df, vix_df, fii_dii, pcr_data, breadth_pct = _fetch_market_indicators()

    log.info("Fetching universe tickers...")
    tickers = get_liquid_universe(top_n=500)
    total = len(tickers)

    log.info(f"Fetching OHLCV for {total} tickers...")
    ohlcv_results = _fetch_ohlcv_batch(tickers, progress_callback)
    log.info(f"OHLCV succeeded for {len(ohlcv_results)} tickers")

    log.info("Fetching fundamental data...")
    info_results = _fetch_info_batch(ohlcv_results, progress_callback)
    log.info(f"Info succeeded for {len(info_results)} tickers")

    raw_data = {}
    for t in ohlcv_results:
        if t in info_results:
            raw_data[t] = {"df": ohlcv_results[t], **info_results[t]}

    coverage_pct = round((len(raw_data) / total) * 100, 1) if total else 0

    regime_score = _compute_regime_score(nifty_df, vix_df, fii_dii, pcr_data, breadth_pct)

    log.info("Building intermediate rows and computing scores...")
    etf_list = cache_manager.get_etf_list()
    rows_intermediate, sector_data, rs_composites = _build_intermediate_rows(raw_data, nifty_df, etf_list)

    sector_medians = compute_sector_medians(raw_data, sector_data)

    final_items = compute_all_scores(rows_intermediate, rs_composites, nifty_df, sector_medians, regime_score)

    log.info("Building output rows...")
    final_rows = [build_output_row(item) for item in final_items]

    result_df = pd.DataFrame(final_rows)
    if not result_df.empty:
        result_df.drop_duplicates(subset=["Ticker"], keep="first", inplace=True)
        result_df.sort_values("Composite_Score", ascending=False, inplace=True, ignore_index=True)
        result_df = result_df.replace({np.nan: None})

        sector_summary = {}
        for sector, group in result_df.groupby("Sector"):
            scores = group["Composite_Score"].dropna()
            sector_summary[sector] = {
                "avg_composite": round(float(scores.mean()), 2) if len(scores) > 0 else 0,
                "avg_tech": round(float(group["Tech_Score"].dropna().mean()), 2) if len(group["Tech_Score"].dropna()) > 0 else 0,
                "avg_fund": round(float(group["Fund_Score"].dropna().mean()), 2) if len(group["Fund_Score"].dropna()) > 0 else 0,
                "avg_research": round(float(group["Research_Score"].dropna().mean()), 2) if len(group["Research_Score"].dropna()) > 0 else 0,
                "strong_buys": int((group["Conviction"] == "Strong Buy").sum()),
                "buys": int((group["Conviction"] == "Buy").sum()),
                "holds": int((group["Conviction"] == "Hold").sum()),
                "avoids": int((group["Conviction"] == "Avoid").sum()),
                "count": len(group),
            }

        outcome_accuracy = _get_outcome_accuracy()

        nifty_close = _safe_float(nifty_df["Close"].iloc[-1]) if nifty_df is not None and not nifty_df.empty else None
        nifty_change = None
        if nifty_df is not None and len(nifty_df) > 1:
            prev_close = _safe_float(nifty_df["Close"].iloc[-2])
            if prev_close and prev_close > 0:
                nifty_change = round((nifty_close / prev_close - 1) * 100, 2)
        vix_level = _safe_float(vix_df["Close"].iloc[-1]) if vix_df is not None and not vix_df.empty else None

        first_scan_date = _get_first_scan_date()

        output_data = {
            "status": "ok",
            "last_updated": scan_time.strftime("%Y-%m-%d %I:%M %p IST"),
            "first_scan_date": first_scan_date,
            "coverage_pct": coverage_pct,
            "market_regime_score": regime_score,
            "nifty_close": nifty_close,
            "nifty_change_pct": nifty_change,
            "vix_level": vix_level,
            "breadth_pct": breadth_pct,
            "fii_net": fii_dii.get("fii_net", 0),
            "dii_net": fii_dii.get("dii_net", 0),
            "pcr": pcr_data.get("pcr", 1.0),
            "scan_version": "2.0",
            "factors": ["tech", "fund", "research", "momentum"],
            "sector_summary": sector_summary,
            "outcome_accuracy": outcome_accuracy,
            "data": result_df.to_dict(orient="records")
        }

        os.makedirs("frontend/public", exist_ok=True)
        with open("frontend/public/market_data.json", "w") as f:
            json.dump(output_data, f, indent=2)

        cache_manager.save_all()
        log.info(f"Successfully saved {len(result_df)} tickers to frontend/public/market_data.json")

        _archive_scan(result_df, scan_time)
        generate_score_history()
        _store_ml_data(final_rows, ohlcv_results, nifty_df, breadth_pct, coverage_pct,
                       len(tickers), len(ohlcv_results), len(info_results), len(final_rows),
                       regime_score, scan_time, time.time() - scan_start)
        
        log.info("Running quant engine...")
        quant_engine.generate_quant_data()

    return result_df


if __name__ == "__main__":
    run_scanner()
