"""
scanner.py
----------
Market scanner.

Data sources:
  • Universe   — NSE Bhav Copy top 150 by daily turnover  (nse_fetcher)
  • OHLCV      — yfinance 1-year daily history  (reliable for indicators)
  • Fundamentals — yfinance .info  (P/E, ROE, sector, etc.)

Signals scored  (+1 bull / -1 bear / 0 neutral):
  SMA cross, RSI, MACD cross, MACD histogram, Stochastic,
  Bollinger %B, CCI, Volume confirmation, ADX trend, Supertrend  (12 total)

Tech_Score  = (bull - bear) / total_signals  ∈ [-1, +1]
Fund_Score  = weighted fundamentals score     ∈ [0, 10]
Conviction_Rating = combined signal label
"""

import time
import json
from datetime import datetime, timezone, timedelta
from typing import Optional
import requests
import pandas as pd
import numpy as np
import yfinance as yf
# Define IST timezone manually to avoid pytz dependency
IST = timezone(timedelta(hours=5, minutes=30))

_YF_SESSION = requests.Session()
_YF_SESSION.headers.update({
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
})

from indicators import add_indicators, compute_metrics
from nse_fetcher import get_liquid_universe

_PERIOD   = "1y"
_INTERVAL = "1d"
_MIN_ROWS = 50      # Discard tickers with < 50 trading days of data


# ---------------------------------------------------------------------------
# Data fetching helpers
# ---------------------------------------------------------------------------

def _fetch_ohlcv(ticker: str) -> pd.DataFrame:
    df = yf.download(
        ticker, period=_PERIOD, interval=_INTERVAL,
        auto_adjust=True, progress=False, session=_YF_SESSION
    )
    if df.empty:
        raise ValueError("Empty OHLCV response")
    df.dropna(inplace=True)
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = df.columns.get_level_values(0)
    if len(df) < _MIN_ROWS:
        raise ValueError(f"Only {len(df)} rows — skipping")
    return df


from bs4 import BeautifulSoup
import re

def _fetch_info(ticker: str) -> dict:
    info = {}
    try:
        t = yf.Ticker(ticker, session=_YF_SESSION)
        info = t.info or {}
    except Exception:
        pass

    # Fallback to Screener.in for critical missing fundamental data on Indian equities
    sym = ticker.replace('.NS', '').replace('.BO', '')
    try:
        url = f"https://www.screener.in/company/{sym}/consolidated/"
        resp = _YF_SESSION.get(url, timeout=5)
        if resp.status_code != 200:
            url = f"https://www.screener.in/company/{sym}/"
            resp = _YF_SESSION.get(url, timeout=5)
            
        if resp.status_code == 200:
            soup = BeautifulSoup(resp.text, 'html.parser')
            
            # Scrape top ratios
            ratios = soup.select('ul#top-ratios li')
            for r in ratios:
                name_elem = r.find('span', class_='name')
                val_elem = r.find('span', class_='number')
                if name_elem and val_elem:
                    name = name_elem.text.strip().lower()
                    val_str = val_elem.text.strip().replace(',', '')
                    try:
                        val = float(val_str)
                    except ValueError:
                        continue
                        
                    if 'market cap' in name and pd.isna(_safe_float(info.get('marketCap'))):
                        info['marketCap'] = val * 10000000 # Screener is in Crores
                    elif 'stock p/e' in name and pd.isna(_safe_float(info.get('trailingPE'))):
                        info['trailingPE'] = val
                    elif 'roce' in name and pd.isna(_safe_float(info.get('returnOnEquity'))):
                        # Use ROCE as fallback for ROE
                        info['returnOnEquity'] = val / 100.0
                    elif 'roe' in name and pd.isna(_safe_float(info.get('returnOnEquity'))):
                        info['returnOnEquity'] = val / 100.0
                    elif 'dividend yield' in name and pd.isna(_safe_float(info.get('dividendYield'))):
                        info['dividendYield'] = val / 100.0

            # Scrape peers table for Debt to Equity
            peers_table = soup.find('table', class_='data-table')
            if peers_table:
                headers = [th.text.strip().lower() for th in peers_table.find_all('th')]
                debt_idx = next((i for i, h in enumerate(headers) if 'debt to eq' in h), -1)
                
                if debt_idx != -1 and pd.isna(_safe_float(info.get('debtToEquity'))):
                    rows = peers_table.find('tbody').find_all('tr')
                    for row in rows:
                        cells = row.find_all('td')
                        if len(cells) > 1 and sym.lower() in cells[1].text.strip().lower():
                            debt_val = cells[debt_idx].text.strip().replace(',', '')
                            try:
                                info['debtToEquity'] = float(debt_val) * 100.0 # yfinance is 0-100 scale
                            except ValueError:
                                pass
                            break
    except Exception as e:
        pass

    return info


def _safe_float(val, default=np.nan) -> float:
    try:
        return float(val) if val is not None and not (isinstance(val, float) and np.isnan(val)) else default
    except Exception:
        return default


# ---------------------------------------------------------------------------
# Fundamentals scoring
# ---------------------------------------------------------------------------

def _compute_fund_score(
    roe_pct: float,
    pe: float,
    fwd_pe: float,
    debt_eq: float,
    div_yield_pct: float,
    mkt_cap_b: float,
    sharpe: float,
) -> int:
    """
    Score fundamental quality on a 0–10 integer scale.

    ROE         → up to 2 pts  (quality of returns)
    P/E         → up to 2 pts  (valuation)
    Debt/Equity → up to 2 pts  (financial risk)
    Fwd vs Ttm  → 1 pt         (growth expectation)
    Div Yield   → 1 pt         (shareholder return)
    Market Cap  → 1 pt         (scale/stability)
    Sharpe      → 1 pt         (risk-adjusted performance)
    """
    score = 0

    # ── ROE ──────────────────────────────────────────────────────────────────
    if not np.isnan(roe_pct):
        if roe_pct >= 15:
            score += 2
        elif roe_pct >= 8:
            score += 1

    # ── P/E ──────────────────────────────────────────────────────────────────
    if not np.isnan(pe) and pe > 0:
        if pe < 20:
            score += 2
        elif pe < 35:
            score += 1

    # ── Debt / Equity ─────────────────────────────────────────────────────────
    if not np.isnan(debt_eq):
        if debt_eq < 0.5:
            score += 2
        elif debt_eq < 1.0:
            score += 1
    else:
        score += 1   # benefit of doubt when no debt data available

    # ── Forward P/E vs Trailing (growth expectation) ─────────────────────────
    if (not np.isnan(fwd_pe) and not np.isnan(pe)
            and pe > 0 and fwd_pe > 0 and fwd_pe < pe):
        score += 1

    # ── Dividend Yield ────────────────────────────────────────────────────────
    if not np.isnan(div_yield_pct) and div_yield_pct > 1.0:
        score += 1

    # ── Market Cap ────────────────────────────────────────────────────────────
    if not np.isnan(mkt_cap_b) and mkt_cap_b >= 10:
        score += 1

    # ── Sharpe ───────────────────────────────────────────────────────────────
    if not np.isnan(sharpe) and sharpe > 1.0:
        score += 1

    return min(score, 10)


def _conviction_rating(tech_score: float, fund_score: int) -> str:
    """Map (Tech_Score, Fund_Score) → qualitative conviction label."""
    if tech_score > 0.4 and fund_score >= 7:
        return "Strong Buy"
    if tech_score > 0.2 and fund_score >= 5:
        return "Buy"
    if tech_score > -0.2 and fund_score >= 3:
        return "Hold"
    if tech_score <= -0.4 or fund_score <= 1:
        return "Avoid"
    return "Caution"


# ---------------------------------------------------------------------------
# Main scanner
# ---------------------------------------------------------------------------

def run_scanner(progress_callback=None) -> pd.DataFrame:
    """
    Run a full market scan and persist results to the database.
    Returns the resulting DataFrame (sorted by Tech_Score descending).

    Parameters
    ----------
    progress_callback : callable, optional
        Called after each ticker with (current_index, total, ticker_symbol).
        Use this to drive a progress bar in the UI.
    """
    scan_time = datetime.now(IST)
    tickers   = get_liquid_universe(top_n=150)
    total     = len(tickers)
    rows: list[dict] = []
    log:  list[dict] = []

    for i, ticker in enumerate(tickers):
        if progress_callback is not None:
            try:
                progress_callback(i, total, ticker)
            except Exception:
                pass
        try:
            df   = _fetch_ohlcv(ticker)
            df   = add_indicators(df)
            info = _fetch_info(ticker)
            met  = compute_metrics(df)

            latest = df.iloc[-1]
            prev   = df.iloc[-2]
            close  = _safe_float(latest["Close"])
            chg    = (close / _safe_float(prev["Close"]) - 1) * 100

            # ── Signals ───────────────────────────────────────────────────────
            sma50  = _safe_float(latest["SMA_50"])
            sma200 = _safe_float(latest["SMA_200"])

            sig_price_sma50    = 1 if close > sma50  else -1
            sig_price_sma200   = 1 if close > sma200 else -1
            sig_sma50_sma200   = 1 if sma50  > sma200 else -1

            rsi = _safe_float(latest["RSI"])
            sig_rsi = 1 if rsi < 30 else (-1 if rsi > 70 else 0)

            macd      = _safe_float(latest["MACD"])
            macd_sig  = _safe_float(latest["MACD_Signal"])
            macd_hist = _safe_float(latest["MACD_Hist"])
            prev_hist = _safe_float(prev["MACD_Hist"])
            sig_macd      = 1 if macd > macd_sig  else -1
            sig_macd_hist = 1 if macd_hist > prev_hist else -1

            k, d  = _safe_float(latest["Stoch_%K"]), _safe_float(latest["Stoch_%D"])
            sig_stoch = 1 if (k < 20 and k > d) else (-1 if (k > 80 and k < d) else 0)

            bb_b     = _safe_float(latest["BB_%B"])
            sig_bb   = 1 if bb_b < 0.05 else (-1 if bb_b > 0.95 else 0)

            cci      = _safe_float(latest["CCI"])
            sig_cci  = 1 if cci < -100 else (-1 if cci > 100 else 0)

            price_up  = close > _safe_float(prev["Close"])
            vol_above = _safe_float(latest["Volume"]) > _safe_float(latest["VOL_MA20"])
            sig_vol   = 1 if (price_up and vol_above) else (-1 if (not price_up and vol_above) else 0)

            adx      = _safe_float(latest["ADX"])
            plus_di  = _safe_float(latest["Plus_DI"])
            minus_di = _safe_float(latest["Minus_DI"])
            sig_adx  = (
                1  if adx > 25 and plus_di  > minus_di else
                -1 if adx > 25 and minus_di > plus_di  else 0
            )

            st_dir        = _safe_float(latest.get("ST_Direction", np.nan), default=np.nan)
            sig_supertrend = 0 if np.isnan(st_dir) else int(-st_dir)   # -1→1 (bull), 1→-1 (bear)

            signals = [
                sig_price_sma50, sig_price_sma200, sig_sma50_sma200,
                sig_rsi, sig_macd, sig_macd_hist, sig_stoch,
                sig_bb, sig_cci, sig_vol, sig_adx, sig_supertrend,
            ]

            bull  = sum(1 for v in signals if v == 1)
            bear  = sum(1 for v in signals if v == -1)
            score = (bull - bear) / len(signals)

            # ── Fundamentals ──────────────────────────────────────────────────
            roe_pct       = round((_safe_float(info.get("returnOnEquity"), 0)) * 100, 2)
            pe            = _safe_float(info.get("trailingPE"))
            fwd_pe        = _safe_float(info.get("forwardPE"))
            debt_eq       = _safe_float(info.get("debtToEquity"))
            div_yield_pct = round((_safe_float(info.get("dividendYield"), 0)) * 100, 2)
            mkt_cap_b     = round((_safe_float(info.get("marketCap"), 0)) / 1e9, 2)
            sharpe        = met["Sharpe"]

            fund_score = _compute_fund_score(
                roe_pct, pe, fwd_pe, debt_eq,
                div_yield_pct, mkt_cap_b, sharpe
            )
            conviction = _conviction_rating(score, fund_score)

            rows.append({
                # ── Identity ──────────────────────────────────────────────
                "Ticker":           ticker.upper(),
                "Sector":           info.get("sector",   "Unknown") or "Unknown",
                "Industry":         info.get("industry", "Unknown") or "Unknown",
                "Price":            round(close, 2),
                "1d_Chg_%":        round(chg, 2),
                # ── Fundamentals ──────────────────────────────────────────
                "P/E":              pe,
                "Forward_P/E":      fwd_pe,
                "ROE_%":            roe_pct,
                "Debt_to_Equity":   debt_eq,
                "Div_Yield_%":      div_yield_pct,
                "Market_Cap_B":     mkt_cap_b,
                "Fund_Score":       fund_score,
                "Conviction":       conviction,
                # ── Indicator values ──────────────────────────────────────
                "RSI_Value":        round(rsi, 2),
                "MACD_Value":       round(macd, 4),
                "CCI_Value":        round(cci, 2),
                "ATR_Value":        round(_safe_float(latest["ATR"]), 2),
                "ADX_Value":        round(adx, 2),
                "Plus_DI":          round(plus_di, 2),
                "Minus_DI":         round(minus_di, 2),
                "BB_%B_Value":      round(bb_b, 3),
                "ST_Signal":        "Bullish" if sig_supertrend == 1 else "Bearish",
                "Volume":           int(_safe_float(latest["Volume"], 0)),
                "Vol_vs_Avg_%":     round(
                    (_safe_float(latest["Volume"]) / max(_safe_float(latest["VOL_MA20"]), 1) - 1) * 100, 1
                ),
                "52W_High":         round(float(df["High"].max()), 2),
                "52W_Low":          round(float(df["Low"].min()),  2),
                # ── Signal flags ─────────────────────────────────────────
                "Sig_Price_vs_SMA50":   sig_price_sma50,
                "Sig_Price_vs_SMA200":  sig_price_sma200,
                "Sig_SMA50_vs_SMA200":  sig_sma50_sma200,
                "Sig_RSI":              sig_rsi,
                "Sig_MACD_Cross":       sig_macd,
                "Sig_MACD_Hist":        sig_macd_hist,
                "Sig_Stoch":            sig_stoch,
                "Sig_BB":               sig_bb,
                "Sig_CCI":              sig_cci,
                "Sig_Volume":           sig_vol,
                "Sig_ADX":              sig_adx,
                "Sig_Supertrend":       sig_supertrend,
                # ── Composite scores ─────────────────────────────────────
                "Tech_Score":       round(score, 3),
                "Bull_Count":       bull,
                "Bear_Count":       bear,
                # ── Risk / return ─────────────────────────────────────────
                "Total_Return_%":   met["Total_Return_%"],
                "Ann_Vol_%":        met["Ann_Vol_%"],
                "Sharpe":           sharpe,
                "Max_Drawdown_%":   met["Max_Drawdown_%"],
            })

            log.append({"Ticker": ticker, "Status": "OK", "Error": ""})

        except Exception as exc:
            log.append({"Ticker": ticker, "Status": "FAILED", "Error": str(exc)})

        time.sleep(0.15)    # Gentle on yfinance rate limits

    result_df = pd.DataFrame(rows)
    if not result_df.empty:
        result_df.sort_values("Tech_Score", ascending=False, inplace=True, ignore_index=True)
        # Fill NA values so JSON encoding doesn't break
        result_df = result_df.fillna("")
        
        output_data = {
            "status": "ok",
            "last_updated": scan_time.strftime("%Y-%m-%d %I:%M %p IST"),
            "data": result_df.to_dict(orient="records")
        }
        
        import os
        import sqlite3
        
        os.makedirs("frontend/public", exist_ok=True)
        with open("frontend/public/market_data.json", "w") as f:
            json.dump(output_data, f, indent=2)

        print(f"Successfully saved {len(result_df)} tickers to frontend/public/market_data.json")
        
        # Save to database
        try:
            os.makedirs("data", exist_ok=True)
            conn = sqlite3.connect("data/market_scans.db")
            
            # Prepare dataframe for SQL
            sql_df = result_df.copy()
            sql_df["Scan_Date"] = scan_time.strftime("%Y-%m-%d %H:%M:%S")
            
            sql_df.to_sql("historical_scans", conn, if_exists="append", index=False)
            conn.close()
            print(f"Successfully appended {len(sql_df)} records to historical_scans database.")
        except Exception as e:
            print(f"Failed to save to database: {e}")

    return result_df

if __name__ == "__main__":
    run_scanner()