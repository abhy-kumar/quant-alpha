"""
scanner.py
"""
import time
import json
import threading
import concurrent.futures
import queue
from datetime import datetime, timezone, timedelta
from typing import Optional
import requests
import os
import sqlite3
import pandas as pd
import numpy as np
import yfinance as yf
from bs4 import BeautifulSoup

from utils import log, _safe_float, CacheManager
from config import (
    PERIOD, INTERVAL, MIN_ROWS, 
    MAX_WORKERS_OHLCV, MAX_WORKERS_FUNDAMENTALS,
    CACHE_TTL_FUNDAMENTALS, CACHE_TTL_ATH, CACHE_TTL_SECTOR, CACHE_TTL_NEWS
)
from indicators import add_indicators, compute_metrics
from nse_fetcher import get_liquid_universe, download_bhav_copy, get_market_breadth
from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer
from recommendation import compute_fund_score, compute_tech_score, get_conviction_rating

IST = timezone(timedelta(hours=5, minutes=30))
_YF_SESSION = requests.Session()
_YF_SESSION.headers.update({
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
})

cache_manager = CacheManager()
screener_banned = threading.Event()
vader = SentimentIntensityAnalyzer()

def _fetch_ohlcv_with_retry(ticker: str, period: str = PERIOD) -> pd.DataFrame:
    retries = [1, 2, 4]
    for attempt, wait in enumerate(retries + [0]):
        try:
            df = yf.download(
                ticker, period=period, interval=INTERVAL,
                auto_adjust=True, progress=False, session=_YF_SESSION
            )
            if df.empty:
                raise ValueError("Empty OHLCV response")
            df.dropna(inplace=True)
            if isinstance(df.columns, pd.MultiIndex):
                df.columns = df.columns.get_level_values(0)
            if len(df) < MIN_ROWS and period == PERIOD:
                raise ValueError(f"Only {len(df)} rows")
            return df
        except Exception as e:
            if attempt < len(retries):
                time.sleep(wait)
            else:
                raise e

def _get_ath(ticker: str, default_52w: float) -> tuple[float, str]:
    sym = ticker.replace('.NS', '').replace('.BO', '')
    cached_ath = cache_manager.get("ath", sym, ttl=CACHE_TTL_ATH)
    if cached_ath is not None:
        return cached_ath, "Historical"
    return default_52w, "52W"

def _background_fetch_ath(tickers_to_fetch: list[str]):
    for ticker in tickers_to_fetch:
        sym = ticker.replace('.NS', '').replace('.BO', '')
        try:
            df = _fetch_ohlcv_with_retry(ticker, period="max")
            actual_ath = _safe_float(df["High"].max())
            if not np.isnan(actual_ath):
                cache_manager.set("ath", sym, round(actual_ath, 2))
                cache_manager.save_all()
        except Exception:
            pass
        time.sleep(0.5)

def _fetch_info(ticker: str) -> dict:
    sym = ticker.replace('.NS', '').replace('.BO', '')
    cached_info = cache_manager.get("fundamentals", sym, ttl=CACHE_TTL_FUNDAMENTALS)
    cached_sector = cache_manager.get("sector", sym, ttl=CACHE_TTL_SECTOR)
    
    info = cached_info if cached_info else {}
    
    needs_fundamentals = not cached_info or pd.isna(_safe_float(info.get('trailingPE'))) or pd.isna(_safe_float(info.get('returnOnEquity')))
    needs_sector = not cached_sector
    
    if needs_fundamentals or needs_sector:
        try:
            t = yf.Ticker(ticker, session=_YF_SESSION)
            new_info = t.info or {}
            info.update(new_info)
        except Exception:
            pass

        if info.get('quoteType') == 'ETF':
            cache_manager.add_to_etf_list(sym)

    needs_fundamentals = pd.isna(_safe_float(info.get('trailingPE'))) or pd.isna(_safe_float(info.get('returnOnEquity')))
    
    if (needs_fundamentals or needs_sector) and not screener_banned.is_set():
        try:
            url = f"https://www.screener.in/company/{sym}/consolidated/"
            resp = _YF_SESSION.get(url, timeout=5)
            if resp.status_code != 200:
                url = f"https://www.screener.in/company/{sym}/"
                resp = _YF_SESSION.get(url, timeout=5)
                
            if resp.status_code == 200:
                soup = BeautifulSoup(resp.text, 'html.parser')
                
                if needs_sector:
                    market_links = [a.text.strip() for a in soup.find_all('a') if a.get('href', '').startswith('/market/')]
                    if market_links:
                        sec_data = {
                            'sector': market_links[0],
                            'industry': market_links[-1] if len(market_links) > 1 else market_links[0]
                        }
                        cache_manager.set("sector", sym, sec_data)
                        cached_sector = sec_data
                
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
                            info['marketCap'] = val * 10000000
                        elif 'stock p/e' in name and pd.isna(_safe_float(info.get('trailingPE'))):
                            info['trailingPE'] = val
                        elif 'roce' in name:
                            info['roce'] = val
                            if pd.isna(_safe_float(info.get('returnOnEquity'))):
                                info['returnOnEquity'] = val / 100.0
                        elif 'roe' in name and pd.isna(_safe_float(info.get('returnOnEquity'))):
                            info['returnOnEquity'] = val / 100.0
                        elif 'promoter holding' in name:
                            info['promoter_holding'] = val
                        elif 'pledged percentage' in name:
                            info['promoter_pledging'] = val
                        elif 'dividend yield' in name and pd.isna(_safe_float(info.get('dividendYield'))):
                            info['dividendYield'] = val

                peers_table = soup.find('table', class_='data-table')
                if peers_table:
                    headers = [th.text.strip().lower() for th in peers_table.find_all('th')]
                    debt_idx = next((i for i, h in enumerate(headers) if 'debt to eq' in h), -1)
                    pe_idx = next((i for i, h in enumerate(headers) if 'p/e' in h), -1)
                    roe_idx = next((i for i, h in enumerate(headers) if 'roe' in h), -1)
                    
                    peers = []
                    rows = peers_table.find('tbody').find_all('tr')
                    for row in rows:
                        cells = row.find_all('td')
                        if len(cells) > 1:
                            if sym.lower() in cells[1].text.strip().lower():
                                if debt_idx != -1 and pd.isna(_safe_float(info.get('debtToEquity'))):
                                    try: info['debtToEquity'] = float(cells[debt_idx].text.strip().replace(',', '')) * 100.0
                                    except: pass
                            else:
                                peer_data = {}
                                if pe_idx != -1:
                                    try: peer_data['pe'] = float(cells[pe_idx].text.strip().replace(',', ''))
                                    except: pass
                                if roe_idx != -1:
                                    try: peer_data['roe'] = float(cells[roe_idx].text.strip().replace(',', ''))
                                    except: pass
                                if debt_idx != -1:
                                    try: peer_data['debt_eq'] = float(cells[debt_idx].text.strip().replace(',', '')) * 100.0
                                    except: pass
                                peers.append(peer_data)
                    info['screener_peers'] = peers
        except Exception:
            screener_banned.set()
            
    if cached_sector:
        info['sector'] = cached_sector.get('sector', info.get('sector'))
        info['industry'] = cached_sector.get('industry', info.get('industry'))

    cache_manager.set("fundamentals", sym, info)
    
    news_sentiment = 0.0
    cached_news = cache_manager.get("news", sym, ttl=CACHE_TTL_NEWS)
    if cached_news is not None:
        news_sentiment = cached_news
    else:
        try:
            t_obj = yf.Ticker(ticker, session=_YF_SESSION)
            news_items = t_obj.news
            if news_items:
                sentiments = []
                for item in news_items:
                    title = item.get('title', '')
                    if title:
                        score = vader.polarity_scores(title)
                        sentiments.append(score['compound'])
                if sentiments:
                    news_sentiment = sum(sentiments) / len(sentiments)
                cache_manager.set("news", sym, news_sentiment)
        except Exception:
            pass
            
    info['news_sentiment'] = news_sentiment
    return info

def run_scanner(progress_callback=None) -> pd.DataFrame:
    scan_time = datetime.now(IST)
    tickers = get_liquid_universe(top_n=150)
    total = len(tickers)
    
    nifty_df = None
    vix_df = None
    regime_score = 0
    try:
        nifty_df = _fetch_ohlcv_with_retry("^NSEI")
        if not nifty_df.empty:
            nifty_df = add_indicators(nifty_df)
            nifty_latest = nifty_df.iloc[-1]
            if _safe_float(nifty_latest["Close"]) > _safe_float(nifty_latest["SMA_200"]):
                regime_score += 1
            else:
                regime_score -= 1
    except Exception: pass
    
    try:
        vix_df = _fetch_ohlcv_with_retry("^INDIAVIX")
        if not vix_df.empty:
            vix_latest = _safe_float(vix_df["Close"].iloc[-1])
            if vix_latest > 25: regime_score -= 1
            elif vix_latest < 15: regime_score += 1
    except Exception: pass

    raw_data = {}
    
    def fetch_ohlcv_job(ticker):
        try:
            df = _fetch_ohlcv_with_retry(ticker)
            df = add_indicators(df)
            return ticker, df, None
        except Exception as e:
            return ticker, None, e
            
    def fetch_info_job(ticker, df):
        try:
            info = _fetch_info(ticker)
            fifty_two_high = _safe_float(info.get("fiftyTwoWeekHigh"))
            df_high = _safe_float(df["High"].max()) if df is not None and not df.empty else np.nan
            base_high = np.nanmax([df_high, fifty_two_high]) if not np.isnan(np.nanmax([df_high, fifty_two_high])) else np.nan
            ath, ath_source = _get_ath(ticker, base_high)
            return ticker, info, ath, ath_source, None
        except Exception as e:
            return ticker, None, None, None, e

    ohlcv_results = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=MAX_WORKERS_OHLCV) as executor:
        futures = {executor.submit(fetch_ohlcv_job, t): t for t in tickers}
        completed = 0
        for future in concurrent.futures.as_completed(futures):
            t, df, err = future.result()
            if df is not None:
                ohlcv_results[t] = df
            completed += 1
            if progress_callback: progress_callback(completed, total * 2, f"Fetching OHLCV {t}")
            
    info_results = {}
    valid_tickers = list(ohlcv_results.keys())
    with concurrent.futures.ThreadPoolExecutor(max_workers=MAX_WORKERS_FUNDAMENTALS) as executor:
        futures = {executor.submit(fetch_info_job, t, ohlcv_results[t]): t for t in valid_tickers}
        completed = 0
        for future in concurrent.futures.as_completed(futures):
            t, info, ath, ath_source, err = future.result()
            if info is not None:
                info_results[t] = {"info": info, "ath": ath, "ath_source": ath_source}
            completed += 1
            if progress_callback: progress_callback(total + completed, total * 2, f"Fetching Info {t}")

    for t in valid_tickers:
        if t in info_results:
            raw_data[t] = {"df": ohlcv_results[t], **info_results[t]}

    coverage_pct = round((len(raw_data) / total) * 100, 1) if total else 0

    bhav_df, _ = download_bhav_copy()
    if not bhav_df.empty:
        breadth = get_market_breadth(bhav_df)
        breadth_pct = breadth.get("breadth_pct", 0.5)
        if breadth_pct > 0.55: regime_score += 1
        elif breadth_pct < 0.45: regime_score -= 1

    sector_data = {}
    rs_composites = []
    
    rows_intermediate = []
    etf_list = cache_manager.get_etf_list()
    
    for ticker, data in raw_data.items():
        df = data["df"]
        info = data["info"]
        latest = df.iloc[-1]
        prev = df.iloc[-2]
        met = compute_metrics(df)
        
        tech = compute_tech_score(latest, prev, df, nifty_df, fifty_two_high=_safe_float(info.get("fiftyTwoWeekHigh")))
        
        rs_score = 0.0
        rs_components = []
        if not np.isnan(tech["rs_6m"]): rs_components.append((tech["rs_6m"], 0.5))
        if not np.isnan(tech["rs_3m"]): rs_components.append((tech["rs_3m"], 0.3))
        if not np.isnan(tech["rs_1m"]): rs_components.append((tech["rs_1m"], 0.2))
        if rs_components:
            total_weight = sum(w for val, w in rs_components)
            rs_score = sum(val * (w / total_weight) for val, w in rs_components)
            rs_composites.append(rs_score)
            
        sym = ticker.replace('.NS', '').replace('.BO', '')
        long_name = info.get("longName") or info.get("shortName") or sym
        
        is_etf = sym in etf_list or "BEES" in ticker.upper() or "ETF" in ticker.upper() or "ETF" in long_name.upper()
        
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
            if sector not in sector_data: sector_data[sector] = {'pe': [], 'roe': [], 'debt_eq': []}
            if not np.isnan(pe): sector_data[sector]['pe'].append(pe)
            if not np.isnan(roe_pct): sector_data[sector]['roe'].append(roe_pct)
            if not np.isnan(debt_eq): sector_data[sector]['debt_eq'].append(debt_eq)
            
            for p in info.get("screener_peers", []):
                if 'pe' in p: sector_data[sector]['pe'].append(p['pe'])
                if 'roe' in p: sector_data[sector]['roe'].append(p['roe'])
                if 'debt_eq' in p: sector_data[sector]['debt_eq'].append(p['debt_eq'])
            
        rows_intermediate.append({
            "ticker": ticker, "is_etf": is_etf, "sector": sector, "industry": industry,
            "info": info, "tech": tech, "met": met, "latest": latest, "prev": prev,
            "rs_composite": rs_score, "pe": pe, "roe": roe_pct, "debt_eq": debt_eq,
            "ath": data["ath"], "ath_source": data["ath_source"], "long_name": long_name
        })

    sector_medians = {}
    for sec, metrics in sector_data.items():
        sector_medians[sec] = {
            'pe': np.median(metrics['pe']) if metrics['pe'] else np.nan,
            'roe': np.median(metrics['roe']) if metrics['roe'] else np.nan,
            'debt_eq': np.median(metrics['debt_eq']) if metrics['debt_eq'] else np.nan
        }
        
    rs_series = pd.Series(rs_composites)
    
    final_rows = []
    for item in rows_intermediate:
        info = item["info"]
        tech = item["tech"]
        met = item["met"]
        latest = item["latest"]
        
        score = tech["score"]
        
        if len(rs_series) > 0:
            rs_pctile = sum(rs_series < item["rs_composite"]) / len(rs_series) * 100
            if rs_pctile >= 75:
                score = min(score + 0.2, 1.0)
            elif rs_pctile <= 25:
                score = max(score - 0.2, -1.0)
        else:
            rs_pctile = np.nan
            
        fwd_pe = _safe_float(info.get("forwardPE"), item["pe"])
        div_yield_pct = round(_safe_float(info.get("dividendYield"), 0), 2)
        mkt_cap_b = round((_safe_float(info.get("marketCap"), 0)) / 1e9, 2)
        eps_growth = _safe_float(info.get("earningsGrowth"))
        rev_growth = _safe_float(info.get("revenueGrowth"))
        
        if item["is_etf"]:
            fund_score = 5.0
        else:
            medians = sector_medians.get(item["sector"], {})
            fund_score = compute_fund_score(
                item["roe"], item["pe"], fwd_pe, item["debt_eq"],
                div_yield_pct, mkt_cap_b, met["Sharpe"],
                eps_growth, rev_growth,
                roce_pct=_safe_float(info.get("roce")),
                promoter_holding=_safe_float(info.get("promoter_holding")),
                promoter_pledging=_safe_float(info.get("promoter_pledging")),
                sector_medians=medians
            )
            
        norm_tech = (score + 1) * 5
        sentiment = _safe_float(info.get("news_sentiment"))
        if sentiment > 0.5: norm_tech = min(10.0, norm_tech + 0.5)
        elif sentiment < -0.5: norm_tech = max(0.0, norm_tech - 0.5)

        composite_score = (norm_tech * 0.6) + (fund_score * 0.4)
        composite_score_tech = (norm_tech * 0.8) + (fund_score * 0.2)
        composite_score_fund = (norm_tech * 0.3) + (fund_score * 0.7)

        item["composite_score"] = composite_score
        item["composite_score_tech"] = composite_score_tech
        item["composite_score_fund"] = composite_score_fund
        item["fund_score"] = fund_score
        item["final_tech"] = score
        item["rs_pctile"] = rs_pctile

    comp_scores = pd.Series([x["composite_score"] for x in rows_intermediate])
    for item in rows_intermediate:
        if len(comp_scores) > 0:
            comp_pctile = sum(comp_scores <= item["composite_score"]) / len(comp_scores) * 100
        else:
            comp_pctile = 50.0
            
        weekly_st_dir = _safe_float(item["latest"].get("Weekly_ST_Direction", np.nan))
        weekly_bullish = weekly_st_dir == -1
        
        conviction = get_conviction_rating(comp_pctile, regime_score, weekly_bullish)
        
        info = item["info"]
        latest = item["latest"]
        tech = item["tech"]
        met = item["met"]
        is_etf = item["is_etf"]
        
        ceo_name = "Unknown"
        for officer in info.get("companyOfficers", []):
            if 'title' in officer and 'CEO' in officer['title'].upper():
                ceo_name = officer.get('name', 'Unknown')
                break
                
        close = _safe_float(latest["Close"])
        chg = (close / _safe_float(item["prev"]["Close"]) - 1) * 100
        
        final_rows.append({
            "Ticker":           item["ticker"].upper(),
            "Sector":           item["sector"],
            "Industry":         item["industry"],
            "Long_Name":        item["long_name"],
            "CEO":              ceo_name,
            "Total_Revenue":    np.nan if is_etf else _safe_float(info.get("totalRevenue")),
            "Net_Income":       np.nan if is_etf else _safe_float(info.get("netIncomeToCommon")),
            "EBITDA":           np.nan if is_etf else _safe_float(info.get("ebitda")),
            "News_Sentiment":   round(info.get("news_sentiment", 0.0), 3),
            "Price":            round(close, 2),
            "1d_Chg_%":         round(chg, 2),
            "P/E":              np.nan if is_etf else round(item["pe"], 2),
            "Forward_P/E":      np.nan if is_etf else round(_safe_float(info.get("forwardPE"), item["pe"]), 2),
            "ROE_%":            np.nan if is_etf else item["roe"],
            "Debt_to_Equity":   np.nan if is_etf else round(item["debt_eq"], 2),
            "Div_Yield_%":      np.nan if is_etf else round(_safe_float(info.get("dividendYield"), 0), 2),
            "Market_Cap_B":     np.nan if is_etf else round((_safe_float(info.get("marketCap"), 0)) / 1e9, 2),
            "52W_High":         _safe_float(info.get("fiftyTwoWeekHigh")),
            "52W_Low":          _safe_float(info.get("fiftyTwoWeekLow")),
            "All_Time_High":    item["ath"],
            "ATH_Source":       item["ath_source"],
            "Fund_Score":       round(item["fund_score"], 1),
            "Composite_Score":  round(item["composite_score"], 2),
            "Composite_Score_Tech": round(item["composite_score_tech"], 2),
            "Composite_Score_Fund": round(item["composite_score_fund"], 2),
            "ROCE_%":           np.nan if is_etf else _safe_float(info.get("roce")),
            "Promoter_Holding_%": np.nan if is_etf else _safe_float(info.get("promoter_holding")),
            "Promoter_Pledging_%": np.nan if is_etf else _safe_float(info.get("promoter_pledging")),
            "Conviction":       conviction,
            "RS_Percentile":    round(item["rs_pctile"], 1),
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
            "Vol_vs_Avg_%":     round((_safe_float(latest.get("Volume", 0)) / max(_safe_float(latest.get("VOL_MA20", 1)), 1) - 1) * 100, 1),
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
            "Sig_VPT":              tech["sig_vpt"],
            "Sig_Ichimoku":         tech["sig_ichimoku"],
            "Tech_Score":       round(item["final_tech"], 3),
            "Bull_Count":       tech["bull"],
            "Bear_Count":       tech["bear"],
            "Total_Return_%":   met["Total_Return_%"],
            "Ann_Vol_%":        met["Ann_Vol_%"],
            "Sharpe":           met["Sharpe"],
            "Max_Drawdown_%":   met["Max_Drawdown_%"],
        })

    result_df = pd.DataFrame(final_rows)
    if not result_df.empty:
        result_df.sort_values("Tech_Score", ascending=False, inplace=True, ignore_index=True)
        result_df = result_df.where(pd.notnull(result_df), None)
        
        output_data = {
            "status": "ok",
            "last_updated": scan_time.strftime("%Y-%m-%d %I:%M %p IST"),
            "coverage_pct": coverage_pct,
            "market_regime_score": regime_score,
            "data": result_df.to_dict(orient="records")
        }
        
        os.makedirs("frontend/public", exist_ok=True)
        with open("frontend/public/market_data.json", "w") as f:
            json.dump(output_data, f, indent=2)

        cache_manager.save_all()
        log.info(f"Successfully saved {len(result_df)} tickers to frontend/public/market_data.json")
        
        try:
            os.makedirs("data", exist_ok=True)
            conn = sqlite3.connect("data/market_scans.db")
            sql_df = result_df.copy()
            sql_df["Scan_Date"] = scan_time.strftime("%Y-%m-%d %H:%M:%S")
            cursor = conn.cursor()
            cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='historical_scans'")
            if cursor.fetchone():
                cursor.execute("PRAGMA table_info(historical_scans)")
                existing_cols = {col[1] for col in cursor.fetchall()}
                for col in sql_df.columns:
                    if col not in existing_cols:
                        dtype = "REAL"
                        if sql_df[col].dtype == object: dtype = "TEXT"
                        elif pd.api.types.is_integer_dtype(sql_df[col]): dtype = "INTEGER"
                        cursor.execute(f'ALTER TABLE historical_scans ADD COLUMN "{col}" {dtype}')
            sql_df.to_sql("historical_scans", conn, if_exists="append", index=False)
            conn.close()
            log.info(f"Successfully appended {len(sql_df)} records to historical_scans database.")
        except Exception as e:
            log.error(f"Failed to save to database: {e}")

    return result_df

if __name__ == "__main__":
    run_scanner()