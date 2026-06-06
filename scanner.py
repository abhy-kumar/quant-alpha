"""
scanner.py
----------
Market scanner.

Data sources:
  • Universe   — NSE Bhav Copy top 150 by daily turnover  (nse_fetcher)
  • OHLCV      — yfinance 1-year daily history  (reliable for indicators)
  • Fundamentals — yfinance .info  (P/E, ROE, etc.)

Signals scored  (+1 bull / -1 bear / 0 neutral):
  SMA cross, RSI, MACD cross, MACD histogram, Stochastic,
  Bollinger %B, CCI, Volume confirmation, ADX trend, Supertrend  (10 total)

Tech_Score = (bull - bear) / total_signals  ∈ [-1, +1]
"""

import yfinance as yf
import pandas as pd
import numpy as np
import time
from datetime import datetime
import pytz

IST = pytz.timezone("Asia/Kolkata")

from database import save_to_db, save_scan_log
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
        auto_adjust=True, progress=False
    )
    if df.empty:
        raise ValueError("Empty OHLCV response")
    df.dropna(inplace=True)
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = df.columns.get_level_values(0)
    if len(df) < _MIN_ROWS:
        raise ValueError(f"Only {len(df)} rows — skipping")
    return df


def _fetch_info(ticker: str) -> dict:
    try:
        return yf.Ticker(ticker).info
    except Exception:
        return {}


def _safe_float(val, default=np.nan) -> float:
    try:
        return float(val) if val is not None and not (isinstance(val, float) and np.isnan(val)) else default
    except Exception:
        return default


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

            rows.append({
                # ── Identity ──────────────────────────────────────────────
                "Ticker":           ticker.upper(),
                "Price":            round(close, 2),
                "1d_Chg_%":        round(chg, 2),
                # ── Fundamentals ──────────────────────────────────────────
                "P/E":              info.get("trailingPE", np.nan),
                "Forward_P/E":      info.get("forwardPE",   np.nan),
                "ROE_%":            round((_safe_float(info.get("returnOnEquity"), 0)) * 100, 2),
                "Debt_to_Equity":   info.get("debtToEquity",   np.nan),
                "Div_Yield_%":      round((_safe_float(info.get("dividendYield"), 0)) * 100, 2),
                "Market_Cap_B":     round((_safe_float(info.get("marketCap"), 0)) / 1e9, 2),
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
                "Sharpe":           met["Sharpe"],
                "Max_Drawdown_%":   met["Max_Drawdown_%"],
            })

            log.append({"Ticker": ticker, "Status": "OK", "Error": ""})

        except Exception as exc:
            log.append({"Ticker": ticker, "Status": "FAILED", "Error": str(exc)})

        time.sleep(0.15)    # Gentle on yfinance rate limits

    result_df = pd.DataFrame(rows)
    if not result_df.empty:
        result_df.sort_values("Tech_Score", ascending=False, inplace=True, ignore_index=True)
        save_to_db(result_df, scan_time)

    save_scan_log(log)
    return result_df


if __name__ == "__main__":
    run_scanner()