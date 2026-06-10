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
from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer
from recommendation import compute_fund_score, compute_tech_score, get_conviction_rating

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
import json
import os

CACHE_FILE = 'data/sector_cache.json'
try:
    with open(CACHE_FILE, 'r') as f:
        SECTOR_CACHE = json.load(f)
except Exception:
    SECTOR_CACHE = {}

FUND_CACHE_FILE = 'data/fundamentals_cache.json'
try:
    with open(FUND_CACHE_FILE, 'r') as f:
        FUND_CACHE = json.load(f)
except Exception:
    FUND_CACHE = {}

NEWS_CACHE_FILE = 'data/news_cache.json'
try:
    with open(NEWS_CACHE_FILE, 'r') as f:
        NEWS_CACHE = json.load(f)
except Exception:
    NEWS_CACHE = {}

def save_caches():
    os.makedirs('data', exist_ok=True)
    with open(CACHE_FILE, 'w') as f:
        json.dump(SECTOR_CACHE, f, indent=2)
    with open(FUND_CACHE_FILE, 'w') as f:
        json.dump(FUND_CACHE, f, indent=2)
    with open(NEWS_CACHE_FILE, 'w') as f:
        json.dump(NEWS_CACHE, f, indent=2)

SCREENER_BANNED = False

def _fetch_info(ticker: str) -> dict:
    global SCREENER_BANNED
    sym = ticker.replace('.NS', '').replace('.BO', '')
    now = datetime.now(timezone.utc).timestamp()
    
    if sym in FUND_CACHE:
        cached_data = FUND_CACHE[sym]
        if now - cached_data.get('timestamp', 0) < 2592000: # 30 days
            return cached_data['info']

    info = {}
    try:
        t = yf.Ticker(ticker, session=_YF_SESSION)
        info = t.info or {}
    except Exception:
        pass

    # Fallback to Screener.in for critical missing fundamental data on Indian equities
    sym = ticker.replace('.NS', '').replace('.BO', '')
    
    needs_fundamentals = pd.isna(_safe_float(info.get('trailingPE'))) or pd.isna(_safe_float(info.get('returnOnEquity')))
    needs_sector = sym not in SECTOR_CACHE
    
    if (needs_fundamentals or needs_sector) and not SCREENER_BANNED:
        try:
            url = f"https://www.screener.in/company/{sym}/consolidated/"
            resp = _YF_SESSION.get(url, timeout=5)
            if resp.status_code != 200:
                url = f"https://www.screener.in/company/{sym}/"
                resp = _YF_SESSION.get(url, timeout=5)
                
            if resp.status_code == 200:
                soup = BeautifulSoup(resp.text, 'html.parser')
                
                # Scrape Sector and Industry if needed
                if needs_sector:
                    market_links = [a.text.strip() for a in soup.find_all('a') if a.get('href', '').startswith('/market/')]
                    if market_links:
                        SECTOR_CACHE[sym] = {
                            'sector': market_links[0],
                            'industry': market_links[-1] if len(market_links) > 1 else market_links[0]
                        }
                
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
                        info['dividendYield'] = val

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
            SCREENER_BANNED = True
            pass

    # Apply cache to info
    if sym in SECTOR_CACHE:
        info['sector'] = SECTOR_CACHE[sym].get('sector', info.get('sector'))
        info['industry'] = SECTOR_CACHE[sym].get('industry', info.get('industry'))

    FUND_CACHE[sym] = {'timestamp': now, 'info': info}
    return info


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
    analyzer = SentimentIntensityAnalyzer()

    # ── Market Regime ────────────────────────────────────────────────────────
    market_regime = "Neutral"
    nifty_df = None
    try:
        nifty_df = _fetch_ohlcv("^NSEI")
        if not nifty_df.empty:
            nifty_df = add_indicators(nifty_df)
            nifty_latest = nifty_df.iloc[-1]
            nifty_close = _safe_float(nifty_latest["Close"])
            nifty_sma200 = _safe_float(nifty_latest["SMA_200"])
            nifty_sma50 = _safe_float(nifty_latest["SMA_50"])
            
            if nifty_close > nifty_sma200 and nifty_sma50 > nifty_sma200:
                market_regime = "Bullish"
            elif nifty_close < nifty_sma200:
                market_regime = "Bearish"
    except Exception as e:
        print(f"Failed to fetch Nifty: {e}")



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

            tech = compute_tech_score(latest, prev, df, nifty_df)
            score = tech["score"]
            bull = tech["bull"]
            bear = tech["bear"]
            
            weekly_st_dir = _safe_float(latest.get("Weekly_ST_Direction", np.nan))
            weekly_bullish = weekly_st_dir == -1

            long_name = info.get("longName") or info.get("shortName") or ticker.replace('.NS', '').replace('.BO', '')
            is_etf = "BEES" in ticker.upper() or "ETF" in ticker.upper() or "ETF" in long_name.upper()

            roe_pct       = round((_safe_float(info.get("returnOnEquity"), 0)) * 100, 2)
            
            pe            = _safe_float(info.get("trailingPE"))
            if pd.isna(pe):
                eps = _safe_float(info.get("trailingEps"))
                if not pd.isna(eps) and eps < 0 and close > 0:
                    pe = close / eps

            fwd_pe        = _safe_float(info.get("forwardPE"))
            if pd.isna(fwd_pe):
                fwd_pe = pe
            debt_eq       = _safe_float(info.get("debtToEquity"))
            div_yield_pct = round(_safe_float(info.get("dividendYield"), 0), 2)
            mkt_cap_b     = round((_safe_float(info.get("marketCap"), 0)) / 1e9, 2)
            sharpe        = met["Sharpe"]

            eps_growth = _safe_float(info.get("earningsGrowth"))
            rev_growth = _safe_float(info.get("revenueGrowth"))

            long_name = info.get("longName") or info.get("shortName") or ticker.replace('.NS', '').replace('.BO', '')
            total_revenue = _safe_float(info.get("totalRevenue"))
            net_income = _safe_float(info.get("netIncomeToCommon"))
            ebitda = _safe_float(info.get("ebitda"))
            
            fifty_two_high = _safe_float(info.get("fiftyTwoWeekHigh"))
            fifty_two_low = _safe_float(info.get("fiftyTwoWeekLow"))
            df_high = _safe_float(df["High"].max()) if not df.empty else np.nan
            df_low = _safe_float(df["Low"].min()) if not df.empty else np.nan
            all_time_high = round(np.nanmax([df_high, fifty_two_high]), 2) if not np.isnan(np.nanmax([df_high, fifty_two_high])) else np.nan
            all_time_low = round(np.nanmin([df_low, fifty_two_low]), 2) if not np.isnan(np.nanmin([df_low, fifty_two_low])) else np.nan
            
            ceo_name = "Unknown"
            officers = info.get("companyOfficers", [])
            if officers:
                for officer in officers:
                    if 'title' in officer and 'CEO' in officer['title'].upper():
                        ceo_name = officer.get('name', 'Unknown')
                        break
                if ceo_name == "Unknown":
                    ceo_name = officers[0].get('name', 'Unknown')

            sym = ticker.replace('.NS', '').replace('.BO', '')
            now_ts = datetime.now(timezone.utc).timestamp()
            news_sentiment = 0.0
            
            if sym in NEWS_CACHE and now_ts - NEWS_CACHE[sym].get('timestamp', 0) < 86400: # 24 hours
                news_sentiment = NEWS_CACHE[sym]['sentiment']
            else:
                try:
                    t_obj = yf.Ticker(ticker, session=_YF_SESSION)
                    news_items = t_obj.news
                    if news_items:
                        sentiments = []
                        for item in news_items:
                            title = item.get('title', '')
                            if title:
                                score = analyzer.polarity_scores(title)
                                sentiments.append(score['compound'])
                        if sentiments:
                            news_sentiment = sum(sentiments) / len(sentiments)
                        NEWS_CACHE[sym] = {'timestamp': now_ts, 'sentiment': news_sentiment}
                except Exception:
                    pass

            if is_etf:
                sector = "ETF"
                industry = "Exchange Traded Fund"
                fund_score = 5  # Neutral fundamental score
            else:
                sector = info.get("sector", "Unknown") or "Unknown"
                industry = info.get("industry", "Unknown") or "Unknown"
                fund_score = compute_fund_score(
                    roe_pct, pe, fwd_pe, debt_eq,
                    div_yield_pct, mkt_cap_b, sharpe,
                    eps_growth, rev_growth
                )
                
            conviction = get_conviction_rating(score, fund_score, market_regime, weekly_bullish)

            rows.append({
                # ── Identity ──────────────────────────────────────────────
                "Ticker":           ticker.upper(),
                "Sector":           sector,
                "Industry":         industry,
                "Long_Name":        long_name,
                "CEO":              ceo_name,
                "Total_Revenue":    np.nan if is_etf else total_revenue,
                "Net_Income":       np.nan if is_etf else net_income,
                "EBITDA":           np.nan if is_etf else ebitda,
                "News_Sentiment":   round(news_sentiment, 3),
                "Price":            round(close, 2),
                "1d_Chg_%":        round(chg, 2),
                # ── Fundamentals ──────────────────────────────────────────
                "P/E":              np.nan if is_etf else (pe if pd.isna(pe) else round(pe, 2)),
                "Forward_P/E":      np.nan if is_etf else (fwd_pe if pd.isna(fwd_pe) else round(fwd_pe, 2)),
                "ROE_%":            np.nan if is_etf else roe_pct,
                "Debt_to_Equity":   np.nan if is_etf else round(debt_eq, 2),
                "Div_Yield_%":      np.nan if is_etf else div_yield_pct,
                "Market_Cap_B":     np.nan if is_etf else mkt_cap_b,
                "52W_High":         fifty_two_high,
                "52W_Low":          fifty_two_low,
                "All_Time_High":    all_time_high,
                "All_Time_Low":     all_time_low,
                "Fund_Score":       fund_score,
                "Conviction":       conviction,
                # ── Indicator values ──────────────────────────────────────
                "RSI_Value":        round(_safe_float(latest.get("RSI", np.nan)), 2),
                "MACD_Value":       round(_safe_float(latest.get("MACD", np.nan)), 4),
                "CCI_Value":        round(_safe_float(latest.get("CCI", np.nan)), 2),
                "ATR_Value":        round(_safe_float(latest.get("ATR", np.nan)), 2),
                "ADX_Value":        round(_safe_float(latest.get("ADX", np.nan)), 2),
                "Plus_DI":          round(_safe_float(latest.get("Plus_DI", np.nan)), 2),
                "Minus_DI":         round(_safe_float(latest.get("Minus_DI", np.nan)), 2),
                "BB_%B_Value":      round(_safe_float(latest.get("BB_%B", np.nan)), 3),
                "ST_Signal":        "Bullish" if tech["sig_supertrend"] == 1 else "Bearish",
                "Volume":           int(_safe_float(latest.get("Volume", 0), 0)),
                "Vol_vs_Avg_%":     round(
                    (_safe_float(latest.get("Volume", 0)) / max(_safe_float(latest.get("VOL_MA20", 1)), 1) - 1) * 100, 1
                ),
                # ── Signal flags ─────────────────────────────────────────
                "Sig_Price_vs_SMA50":   tech["sig_price_sma50"],
                "Sig_Price_vs_SMA200":  tech["sig_price_sma200"],
                "Sig_SMA50_vs_SMA200":  tech["sig_sma50_sma200"],
                "Sig_RSI":              tech["sig_rsi"],
                "Sig_MACD_Cross":       tech["sig_macd"],
                "Sig_MACD_Hist":        tech["sig_macd_hist"],
                "Sig_Stoch":            tech["sig_stoch"],
                "Sig_BB":               tech["sig_bb"],
                "Sig_CCI":              tech["sig_cci"],
                "Sig_Volume":           tech["sig_vol"],
                "Sig_ADX":              tech["sig_adx"],
                "Sig_Supertrend":       tech["sig_supertrend"],
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

        save_caches()
        print(f"Successfully saved {len(result_df)} tickers to frontend/public/market_data.json")
        
        # Save to database
        try:
            os.makedirs("data", exist_ok=True)
            conn = sqlite3.connect("data/market_scans.db")
            
            # Prepare dataframe for SQL
            sql_df = result_df.copy()
            sql_df["Scan_Date"] = scan_time.strftime("%Y-%m-%d %H:%M:%S")
            
            cursor = conn.cursor()
            cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='historical_scans'")
            if cursor.fetchone():
                cursor.execute("PRAGMA table_info(historical_scans)")
                existing_cols = {col[1] for col in cursor.fetchall()}
                for col in sql_df.columns:
                    if col not in existing_cols:
                        cursor.execute(f'ALTER TABLE historical_scans ADD COLUMN "{col}" TEXT')
            
            sql_df.to_sql("historical_scans", conn, if_exists="append", index=False)
            conn.close()
            print(f"Successfully appended {len(sql_df)} records to historical_scans database.")
        except Exception as e:
            print(f"Failed to save to database: {e}")

    return result_df

if __name__ == "__main__":
    run_scanner()