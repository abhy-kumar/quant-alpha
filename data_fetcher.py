"""
data_fetcher.py
---------------
Data acquisition layer for the stock scanner.
Handles OHLCV fetching, fundamental data, and Screener.in scraping.
"""

import time
import threading
import urllib.parse
import numpy as np
import pandas as pd
import requests
import yfinance as yf
import feedparser
from bs4 import BeautifulSoup
from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer

from utils import log, _safe_float, CacheManager
from config import (
    PERIOD, INTERVAL, MIN_ROWS,
    CACHE_TTL_FUNDAMENTALS, CACHE_TTL_ATH, CACHE_TTL_SECTOR, CACHE_TTL_NEWS
)
from bse_fetcher import get_promoter_holding as bse_get_promoter, get_company_info as bse_get_company

_YF_SESSION = requests.Session()
_YF_SESSION.headers.update({
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
})

cache_manager = CacheManager()
_screener_state = {"failures": 0, "disabled_until": 0}
_screener_lock = threading.Lock()
SCREENER_MAX_FAILURES = 10
SCREENER_COOLDOWN = 300
_screener_request_lock = threading.Lock()

vader = SentimentIntensityAnalyzer()


def _fetch_yfinance_statements(t: yf.Ticker, info: dict):
    """
    Fetch cash flow and financial statements from yfinance to fill gaps
    in operatingCashflow, earningsGrowth, revenueGrowth, returnOnAssets.
    Also fetches YoY deltas for Piotroski F-Score and Investment Factor.
    """
    try:
        if pd.isna(_safe_float(info.get('operatingCashflow'))):
            cf = t.cashflow
            if cf is not None and not cf.empty:
                op_idx = next((i for i in cf.index if 'operating' in str(i).lower()), None)
                if op_idx is not None and len(cf.columns) >= 1:
                    info['operatingCashflow'] = _safe_float(cf.loc[op_idx].iloc[0])
    except Exception:
        pass

    try:
        if pd.isna(_safe_float(info.get('revenueGrowth'))) or pd.isna(_safe_float(info.get('earningsGrowth'))):
            qf = t.quarterly_financials
            if qf is not None and not qf.empty and qf.shape[1] >= 2:
                rev_idx = next((i for i in qf.index if 'revenue' in str(i).lower() or 'total revenue' in str(i).lower()), None)
                if rev_idx is not None:
                    curr_rev = _safe_float(qf.loc[rev_idx].iloc[0])
                    prev_rev = _safe_float(qf.loc[rev_idx].iloc[1])
                    if prev_rev and prev_rev > 0 and pd.isna(_safe_float(info.get('revenueGrowth'))):
                        info['revenueGrowth'] = (curr_rev - prev_rev) / abs(prev_rev)

                ni_idx = next((i for i in qf.index if 'net income' in str(i).lower()), None)
                if ni_idx is not None:
                    curr_ni = _safe_float(qf.loc[ni_idx].iloc[0])
                    prev_ni = _safe_float(qf.loc[ni_idx].iloc[1])
                    if prev_ni and prev_ni != 0 and pd.isna(_safe_float(info.get('earningsGrowth'))):
                        info['earningsGrowth'] = (curr_ni - prev_ni) / abs(prev_ni)
    except Exception:
        pass

    try:
        if pd.isna(_safe_float(info.get('returnOnAssets'))):
            bs = t.balance_sheet
            if bs is not None and not bs.empty:
                ta_idx = next((i for i in bs.index if 'total asset' in str(i).lower()), None)
                if ta_idx is not None:
                    total_assets = _safe_float(bs.loc[ta_idx].iloc[0])
                    if total_assets and total_assets > 0:
                        net_income = _safe_float(info.get('netIncomeToCommon'), default=0)
                        if net_income:
                            info['returnOnAssets'] = net_income / total_assets
    except Exception:
        pass

    _fetch_yoy_financials(t, info)


def _fetch_yoy_financials(t: yf.Ticker, info: dict):
    """
    Fetch annual financials and balance sheet to compute YoY deltas for:
    - Piotroski F-Score: ΔLeverage, ΔCurrent Ratio, ΔGross Margin, ΔAsset Turnover
    - Investment Factor: Total asset growth
    
    Stores YoY deltas in info dict for downstream consumption.
    """
    try:
        annual_fs = t.financials
        annual_bs = t.balance_sheet

        if annual_fs is None or annual_fs.empty or annual_bs is None or annual_bs.empty:
            return

        if annual_fs.shape[1] < 2 or annual_bs.shape[1] < 2:
            return

        curr_col = annual_fs.columns[0]
        prev_col = annual_fs.columns[1]

        # Total Revenue YoY
        rev_idx = next((i for i in annual_fs.index if 'total revenue' in str(i).lower() or 'revenue' in str(i).lower()), None)
        curr_rev = _safe_float(annual_fs.loc[rev_idx].iloc[0]) if rev_idx is not None else np.nan
        prev_rev = _safe_float(annual_fs.loc[rev_idx].iloc[1]) if rev_idx is not None else np.nan

        # Gross Profit YoY
        gp_idx = next((i for i in annual_fs.index if 'gross profit' in str(i).lower()), None)
        curr_gp = _safe_float(annual_fs.loc[gp_idx].iloc[0]) if gp_idx is not None else np.nan
        prev_gp = _safe_float(annual_fs.loc[gp_idx].iloc[1]) if gp_idx is not None else np.nan

        # Total Assets YoY
        ta_idx = next((i for i in annual_bs.index if 'total asset' in str(i).lower()), None)
        curr_ta = _safe_float(annual_bs.loc[ta_idx].iloc[0]) if ta_idx is not None else np.nan
        prev_ta = _safe_float(annual_bs.loc[ta_idx].iloc[1]) if ta_idx is not None else np.nan

        # Current Ratio YoY
        curr_cr = _safe_float(info.get('currentRatio'))
        cr_idx = next((i for i in annual_bs.index if 'current' in str(i).lower() and 'ratio' not in str(i).lower()), None)
        if cr_idx is not None:
            curr_ca = _safe_float(annual_bs.loc[cr_idx].iloc[0])
            prev_ca = _safe_float(annual_bs.loc[cr_idx].iloc[1])
            cl_idx = next((i for i in annual_bs.index if 'current liability' in str(i).lower()), None)
            if cl_idx is not None:
                curr_cl = _safe_float(annual_bs.loc[cl_idx].iloc[0])
                prev_cl = _safe_float(annual_bs.loc[cl_idx].iloc[1])
                if curr_cl and curr_cl > 0:
                    curr_cr = curr_ca / curr_cl
                if prev_cl and prev_cl > 0 and not np.isnan(prev_ca):
                    prev_cr_val = prev_ca / prev_cl
                    if not np.isnan(curr_cr):
                        info['yoy_current_ratio_change'] = curr_cr - prev_cr_val

        # Total Debt YoY (for leverage)
        td_idx = next((i for i in annual_bs.index if 'total debt' in str(i).lower() or 'long term debt' in str(i).lower()), None)
        curr_debt = _safe_float(annual_bs.loc[td_idx].iloc[0]) if td_idx is not None else np.nan
        prev_debt = _safe_float(annual_bs.loc[td_idx].iloc[1]) if td_idx is not None else np.nan

        # Shares Outstanding YoY (for dilution)
        so_idx = next((i for i in annual_bs.index if 'share' in str(i).lower() and 'ordinary' in str(i).lower()), None)
        if so_idx is None:
            so_idx = next((i for i in annual_bs.index if 'ordinary share' in str(i).lower()), None)
        curr_shares = _safe_float(annual_bs.loc[so_idx].iloc[0]) if so_idx is not None else np.nan
        prev_shares = _safe_float(annual_bs.loc[so_idx].iloc[1]) if so_idx is not None else np.nan

        # Compute and store YoY deltas
        if not np.isnan(curr_debt) and not np.isnan(prev_debt) and prev_debt != 0:
            info['yoy_leverage_change'] = (curr_debt - prev_debt) / abs(prev_debt)

        if not np.isnan(curr_ta) and not np.isnan(prev_ta) and prev_ta > 0:
            info['yoy_asset_growth'] = (curr_ta - prev_ta) / abs(prev_ta)

            # Gross Margin YoY (GP/Assets)
            if not np.isnan(curr_gp) and not np.isnan(curr_ta) and curr_ta > 0:
                curr_gm = curr_gp / curr_ta
                if not np.isnan(prev_gp) and not np.isnan(prev_ta) and prev_ta > 0:
                    prev_gm = prev_gp / prev_ta
                    info['yoy_gross_margin_change'] = curr_gm - prev_gm

            # Asset Turnover YoY
            if not np.isnan(curr_rev) and not np.isnan(prev_rev):
                curr_turnover = curr_rev / curr_ta if curr_ta > 0 else np.nan
                prev_turnover = prev_rev / prev_ta if prev_ta > 0 else np.nan
                if not np.isnan(curr_turnover) and not np.isnan(prev_turnover):
                    info['yoy_asset_turnover_change'] = curr_turnover - prev_turnover

        if not np.isnan(curr_shares) and not np.isnan(prev_shares) and prev_shares > 0:
            info['yoy_shares_change'] = (curr_shares - prev_shares) / abs(prev_shares)

    except Exception:
        pass

    try:
        if pd.isna(_safe_float(info.get('revenueGrowth'))) or pd.isna(_safe_float(info.get('earningsGrowth'))):
            qf = t.quarterly_financials
            if qf is not None and not qf.empty and qf.shape[1] >= 2:
                rev_idx = next((i for i in qf.index if 'revenue' in str(i).lower() or 'total revenue' in str(i).lower()), None)
                if rev_idx is not None:
                    curr_rev = _safe_float(qf.loc[rev_idx].iloc[0])
                    prev_rev = _safe_float(qf.loc[rev_idx].iloc[1])
                    if prev_rev and prev_rev > 0 and pd.isna(_safe_float(info.get('revenueGrowth'))):
                        info['revenueGrowth'] = (curr_rev - prev_rev) / abs(prev_rev)

                ni_idx = next((i for i in qf.index if 'net income' in str(i).lower()), None)
                if ni_idx is not None:
                    curr_ni = _safe_float(qf.loc[ni_idx].iloc[0])
                    prev_ni = _safe_float(qf.loc[ni_idx].iloc[1])
                    if prev_ni and prev_ni != 0 and pd.isna(_safe_float(info.get('earningsGrowth'))):
                        info['earningsGrowth'] = (curr_ni - prev_ni) / abs(prev_ni)
    except Exception:
        pass

    try:
        if pd.isna(_safe_float(info.get('returnOnAssets'))):
            bs = t.balance_sheet
            if bs is not None and not bs.empty:
                ta_idx = next((i for i in bs.index if 'total asset' in str(i).lower()), None)
                if ta_idx is not None:
                    total_assets = _safe_float(bs.loc[ta_idx].iloc[0])
                    if total_assets and total_assets > 0:
                        net_income = _safe_float(info.get('netIncomeToCommon'), default=0)
                        if net_income:
                            info['returnOnAssets'] = net_income / total_assets
    except Exception:
        pass


def fetch_ohlcv_with_retry(ticker: str, period: str = PERIOD) -> pd.DataFrame:
    """Fetch OHLCV data with exponential backoff retry."""
    retries = [1, 2, 4]
    for attempt, wait in enumerate(retries + [0]):
        try:
            df = yf.download(
                ticker, period=period, interval=INTERVAL,
                auto_adjust=True, progress=False, session=_YF_SESSION
            )
            if df.empty:
                raise ValueError("Empty OHLCV response")
            if isinstance(df.columns, pd.MultiIndex):
                df.columns = df.columns.get_level_values(0)
            df.dropna(subset=['Close'], inplace=True)

            required_cols = ['Open', 'High', 'Low', 'Close', 'Volume']
            missing = [c for c in required_cols if c not in df.columns]
            if missing:
                raise ValueError(f"Missing OHLCV columns: {missing}")

            if (df['Close'] <= 0).any():
                df = df[df['Close'] > 0]

            if (df['High'] < df['Low']).any():
                df.loc[df['High'] < df['Low'], ['High', 'Low']] = df.loc[df['High'] < df['Low'], ['Low', 'High']].values

            if len(df) < MIN_ROWS and period == PERIOD:
                raise ValueError(f"Only {len(df)} rows")
            return df
        except Exception as e:
            if attempt < len(retries):
                time.sleep(wait)
            else:
                raise e


def get_ath(ticker: str, default_52w: float) -> tuple[float, str]:
    """Get all-time high from cache or default to 52-week high."""
    sym = ticker.replace('.NS', '').replace('.BO', '')
    cached_ath = cache_manager.get("ath", sym, ttl=CACHE_TTL_ATH)
    if cached_ath is not None:
        return cached_ath, "Historical"
    return default_52w, "52W"


def get_atl(ticker: str, default_52w_low: float) -> tuple[float, str]:
    """Get all-time low from cache or default to 52-week low."""
    sym = ticker.replace('.NS', '').replace('.BO', '')
    cached_atl = cache_manager.get("atl", sym, ttl=CACHE_TTL_ATH)
    if cached_atl is not None:
        return cached_atl, "Historical"
    return default_52w_low, "52W"


def background_fetch_ath(tickers_to_fetch: list[str]):
    """Background worker to fetch all-time high/low for tickers."""
    for ticker in tickers_to_fetch:
        sym = ticker.replace('.NS', '').replace('.BO', '')
        try:
            df = fetch_ohlcv_with_retry(ticker, period="max")
            actual_ath = _safe_float(df["High"].max())
            actual_atl = _safe_float(df["Low"].min())
            if not np.isnan(actual_ath):
                cache_manager.set("ath", sym, round(actual_ath, 2))
            if not np.isnan(actual_atl):
                cache_manager.set("atl", sym, round(actual_atl, 2))
            cache_manager.save_all()
        except (ValueError, KeyError, requests.RequestException) as e:
            log.debug(f"ATH fetch failed for {ticker}: {e}")
        time.sleep(0.5)


def fetch_fundamentals(ticker: str) -> dict:
    """Fetch fundamental data from yfinance, Screener.in, and BSE India."""
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

            missing_critical = (
                pd.isna(_safe_float(info.get('operatingCashflow'))) or
                pd.isna(_safe_float(info.get('revenueGrowth'))) or
                pd.isna(_safe_float(info.get('returnOnAssets')))
            )
            if missing_critical:
                _fetch_yfinance_statements(t, info)
        except (ValueError, KeyError, requests.RequestException) as e:
            log.debug(f"yfinance info fetch failed for {ticker}: {e}")

        if info.get('quoteType') == 'ETF':
            cache_manager.add_to_etf_list(sym)

    needs_fundamentals = (
        pd.isna(_safe_float(info.get('trailingPE'))) or
        pd.isna(_safe_float(info.get('returnOnEquity'))) or
        pd.isna(_safe_float(info.get('roce')))
    )

    now_ts = time.time()
    with _screener_lock:
        screener_available = now_ts > _screener_state.get("disabled_until", 0)
        if (needs_fundamentals or needs_sector) and screener_available and _screener_state["failures"] < SCREENER_MAX_FAILURES:
            _fetch_from_screener(sym, info, cached_sector, needs_fundamentals, needs_sector)

    if cached_sector:
        info['sector'] = cached_sector.get('sector', info.get('sector'))
        info['industry'] = cached_sector.get('industry', info.get('industry'))

    _fetch_bse_fallback(sym, info, needs_sector)

    if pd.isna(_safe_float(info.get('promoter_holding'))):
        _fetch_promoter_from_screener(sym, info)

    if _safe_float(info.get('totalAssets')) is None or np.isnan(_safe_float(info.get('totalAssets'), default=np.nan)):
        bv = _safe_float(info.get('bookValue'), default=0)
        shares = _safe_float(info.get('sharesOutstanding'), default=0)
        total_debt = _safe_float(info.get('totalDebt'), default=0)
        total_cash = _safe_float(info.get('totalCash'), default=0)
        if bv > 0 and shares > 0:
            info['totalAssets'] = bv * shares + total_debt - total_cash

    if pd.isna(_safe_float(info.get('yoy_asset_growth'), default=np.nan)):
        try:
            t = yf.Ticker(ticker, session=_YF_SESSION)
            _fetch_yoy_financials(t, info)
        except Exception:
            pass

    cache_manager.set("fundamentals", sym, info)

    info['news_sentiment'] = _fetch_news_sentiment(sym)
    return info


def _fetch_from_screener(sym: str, info: dict, cached_sector, needs_fundamentals: bool, needs_sector: bool):
    """Scrape fundamental data from Screener.in with rate limiting."""
    with _screener_request_lock:
        time.sleep(1.5)
    try:
        url = f"https://www.screener.in/company/{urllib.parse.quote(sym, safe='')}/consolidated/"
        resp = _YF_SESSION.get(url, timeout=15)
        if resp.status_code != 200:
            url = f"https://www.screener.in/company/{urllib.parse.quote(sym, safe='')}/"
            resp = _YF_SESSION.get(url, timeout=15)

        if resp.status_code == 200:
            _screener_state["failures"] = max(0, _screener_state["failures"] - 1)
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

            _parse_screener_ratios(soup, info)
            _parse_screener_financials(soup, info)
            _parse_screener_shareholding(soup, info)

            peers_table = soup.find('table', class_='data-table')
            if peers_table:
                _parse_screener_peers(peers_table, sym, info)

            # If ROCE is still missing, the consolidated page may have empty
            # values. Try the non-consolidated page as fallback.
            if pd.isna(_safe_float(info.get('roce'))):
                try:
                    url_fb = f"https://www.screener.in/company/{urllib.parse.quote(sym, safe='')}/"
                    resp_fb = _YF_SESSION.get(url_fb, timeout=15)
                    if resp_fb.status_code == 200:
                        soup_fb = BeautifulSoup(resp_fb.text, 'html.parser')
                        _parse_screener_ratios(soup_fb, info)
                except Exception as e:
                    log.debug(f"Screener.in ROCE fallback failed for {sym}: {e}")
        else:
            _screener_state["failures"] += 1
            log.warning(f"Screener.in HTTP {resp.status_code} for {sym} (failure {_screener_state['failures']}/{SCREENER_MAX_FAILURES})")
            if _screener_state["failures"] >= SCREENER_MAX_FAILURES:
                _screener_state["disabled_until"] = time.time() + SCREENER_COOLDOWN
                log.warning(f"Screener.in disabled for {SCREENER_COOLDOWN}s after {_screener_state['failures']} non-200 responses")
    except Exception as e:
        _screener_state["failures"] += 1
        log.warning(f"Screener.in error for {sym}: {type(e).__name__}: {e} (failure {_screener_state['failures']}/{SCREENER_MAX_FAILURES})")
        if _screener_state["failures"] >= SCREENER_MAX_FAILURES:
            _screener_state["disabled_until"] = time.time() + SCREENER_COOLDOWN
            log.warning(f"Screener.in disabled for {SCREENER_COOLDOWN}s after {_screener_state['failures']} failures")


def _parse_screener_peers(peers_table, sym: str, info: dict):
    """Parse peer comparison table from Screener.in."""
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
                    try:
                        raw_de = float(cells[debt_idx].text.strip().replace(',', ''))
                        info['debtToEquity'] = raw_de if raw_de > 10 else raw_de * 100.0
                    except (ValueError, IndexError):
                        pass
            else:
                peer_data = {}
                if pe_idx != -1:
                    try:
                        peer_data['pe'] = float(cells[pe_idx].text.strip().replace(',', ''))
                    except (ValueError, IndexError):
                        pass
                if roe_idx != -1:
                    try:
                        peer_data['roe'] = float(cells[roe_idx].text.strip().replace(',', ''))
                    except (ValueError, IndexError):
                        pass
                if debt_idx != -1:
                    try:
                        raw_de = float(cells[debt_idx].text.strip().replace(',', ''))
                        peer_data['debt_eq'] = raw_de if raw_de > 10 else raw_de * 100.0
                    except (ValueError, IndexError):
                        pass
                peers.append(peer_data)
        info['screener_peers'] = peers


def _parse_screener_ratios(soup, info: dict):
    """
    Parse the #ratios section from Screener.in for detailed financial ratios.
    This section contains: ROA, Current Ratio, Quick Ratio, Debt/Equity,
    Inventory Turnover, and other key ratios.
    """
    ratios_section = soup.select_one('#ratios')
    if not ratios_section:
        return

    rows = ratios_section.select('table tr, .flex-row, li')
    for row in rows:
        cells = row.find_all(['td', 'span'])
        if len(cells) < 2:
            continue
        name_text = cells[0].text.strip().lower()
        val_text = cells[-1].text.strip().replace(',', '').replace('%', '')
        try:
            val = float(val_text)
        except (ValueError, IndexError):
            continue

        if 'return on assets' in name_text and pd.isna(_safe_float(info.get('returnOnAssets'))):
            info['returnOnAssets'] = val / 100.0
        elif 'current ratio' in name_text and pd.isna(_safe_float(info.get('currentRatio'))):
            info['currentRatio'] = val
        elif 'quick ratio' in name_text and pd.isna(_safe_float(info.get('quickRatio'))):
            info['quickRatio'] = val
        elif 'debt to equity' in name_text and pd.isna(_safe_float(info.get('debtToEquity'))):
            info['debtToEquity'] = val if val > 10 else val * 100.0
        elif 'roce' in name_text:
            info['roce'] = val


def _parse_screener_financials(soup, info: dict):
    """
    Parse quarterly results and annual financials from Screener.in
    to extract: revenueGrowth, earningsGrowth, operatingCashflow, grossProfits,
    forwardPE (from analyst estimates section).
    """
    quarters_section = soup.select_one('#quarters')
    if quarters_section:
        headers = [th.text.strip().lower() for th in quarters_section.select('table th')]
        rows = quarters_section.select('table tbody tr')

        sales_idx = next((i for i, h in enumerate(headers) if 'sales' in h or 'revenue' in h), -1)
        net_profit_idx = next((i for i, h in enumerate(headers) if 'net profit' in h or 'profit' in h), -1)

        if rows and len(rows) >= 2 and sales_idx != -1:
            try:
                curr_row = rows[0].find_all('td')
                prev_row = rows[1].find_all('td')
                if len(curr_row) > sales_idx and len(prev_row) > sales_idx:
                    curr_sales = float(curr_row[sales_idx].text.strip().replace(',', '').replace('%', ''))
                    prev_sales = float(prev_row[sales_idx].text.strip().replace(',', '').replace('%', ''))
                    if prev_sales > 0 and pd.isna(_safe_float(info.get('revenueGrowth'))):
                        info['revenueGrowth'] = (curr_sales - prev_sales) / abs(prev_sales)
            except (ValueError, IndexError):
                pass

        if rows and len(rows) >= 2 and net_profit_idx != -1:
            try:
                curr_row = rows[0].find_all('td')
                prev_row = rows[1].find_all('td')
                if len(curr_row) > net_profit_idx and len(prev_row) > net_profit_idx:
                    curr_profit_text = curr_row[net_profit_idx].text.strip().replace(',', '').replace('%', '')
                    prev_profit_text = prev_row[net_profit_idx].text.strip().replace(',', '').replace('%', '')
                    curr_profit = float(curr_profit_text) if curr_profit_text not in ('-', '') else 0
                    prev_profit = float(prev_profit_text) if prev_profit_text not in ('-', '') else 0
                    if prev_profit != 0 and pd.isna(_safe_float(info.get('earningsGrowth'))):
                        info['earningsGrowth'] = (curr_profit - prev_profit) / abs(prev_profit)
            except (ValueError, IndexError):
                pass

    pl_section = soup.select_one('#profit-loss')
    if pl_section:
        headers = [th.text.strip().lower() for th in pl_section.select('table th')]
        rows = pl_section.select('table tbody tr')
        for row in rows:
            cells = row.find_all('td')
            if not cells:
                continue
            label = cells[0].text.strip().lower()
            if ('gross profit' in label or 'gross block' in label) and pd.isna(_safe_float(info.get('grossProfits'))):
                try:
                    val = float(cells[-1].text.strip().replace(',', ''))
                    info['grossProfits'] = val * 10000000
                except (ValueError, IndexError):
                    pass

    cf_section = soup.select_one('#cash-flow')
    if cf_section:
        rows = cf_section.select('table tbody tr')
        for row in rows:
            cells = row.find_all('td')
            if not cells:
                continue
            label = cells[0].text.strip().lower()
            if 'cash from operating' in label and pd.isna(_safe_float(info.get('operatingCashflow'))):
                try:
                    val = float(cells[-1].text.strip().replace(',', ''))
                    info['operatingCashflow'] = val * 10000000
                except (ValueError, IndexError):
                    pass

    analysis_section = soup.select_one('#analysis')
    if analysis_section:
        text = analysis_section.text.lower()
        if 'forward p/e' in text or 'target price' in text:
            for row in analysis_section.select('tr, li, .flex-row'):
                row_text = row.text.strip().lower()
                if 'forward p/e' in row_text or 'forward pe' in row_text:
                    val_text = row_text.split(':')[-1].strip().replace(',', '')
                    try:
                        val = float(val_text)
                        if pd.isna(_safe_float(info.get('forwardPE'))):
                            info['forwardPE'] = val
                    except ValueError:
                        pass


def _fetch_promoter_from_screener(sym: str, info: dict):
    """Fetch promoter holding and missing ratios from Screener.in."""
    with _screener_request_lock:
        time.sleep(1.5)
    try:
        encoded = urllib.parse.quote(sym, safe='')
        url = f"https://www.screener.in/company/{encoded}/consolidated/"
        resp = _YF_SESSION.get(url, timeout=15)
        if resp.status_code != 200:
            url = f"https://www.screener.in/company/{encoded}/"
            resp = _YF_SESSION.get(url, timeout=15)

        if resp.status_code == 200:
            soup = BeautifulSoup(resp.text, 'html.parser')
            _parse_screener_ratios(soup, info)
            _parse_screener_shareholding(soup, info)

        if pd.isna(_safe_float(info.get('roce'))):
            url2 = f"https://www.screener.in/company/{encoded}/"
            resp2 = _YF_SESSION.get(url2, timeout=15)
            if resp2.status_code == 200:
                soup2 = BeautifulSoup(resp2.text, 'html.parser')
                _parse_screener_ratios(soup2, info)
    except Exception as e:
        log.debug(f"Screener shareholding fetch failed for {sym}: {e}")


def _parse_screener_shareholding(soup, info: dict):
    """Parse promoter holding from the Shareholding Pattern section."""
    if not pd.isna(_safe_float(info.get('promoter_holding'))):
        return

    for section in soup.find_all('section'):
        h = section.find(['h2', 'h3'])
        if not (h and 'shareholding' in h.text.strip().lower()):
            continue

        tables = section.find_all('table')
        for table in tables:
            rows = table.find_all('tr')
            for row in rows:
                cells = row.find_all('td')
                if len(cells) < 2:
                    continue
                label = cells[0].text.strip().lower()
                if 'promoter' in label:
                    val_text = cells[-1].text.strip().replace('%', '').replace(',', '')
                    try:
                        info['promoter_holding'] = float(val_text)
                        log.debug(f"Screener: parsed promoter holding={info['promoter_holding']}%")
                    except (ValueError, IndexError):
                        pass
                    return


def _fetch_bse_fallback(sym: str, info: dict, needs_sector: bool):
    """Fetch promoter holding and sector from BSE India as fallback."""
    needs_promoter = pd.isna(_safe_float(info.get('promoter_holding')))
    if needs_promoter or needs_sector:
        try:
            bse_promoter = bse_get_promoter(sym)
            if needs_promoter and bse_promoter.get("promoter_holding") is not None:
                info['promoter_holding'] = bse_promoter['promoter_holding']
            if bse_promoter.get("promoter_pledging") is not None:
                info['promoter_pledging'] = bse_promoter['promoter_pledging']

            if needs_sector:
                bse_info = bse_get_company(sym)
                if bse_info.get("sector"):
                    sec_data = {
                        'sector': bse_info['sector'],
                        'industry': bse_info.get('industry') or bse_info.get('group') or bse_info['sector']
                    }
                    cache_manager.set("sector", sym, sec_data)
                    info['sector'] = sec_data['sector']
                    info['industry'] = sec_data['industry']
        except Exception as e:
            log.debug(f"BSE fallback failed for {sym}: {e}")


def _fetch_news_sentiment(sym: str) -> float:
    """Fetch news sentiment from Google News RSS."""
    cached_news = cache_manager.get("news", sym, ttl=CACHE_TTL_NEWS)
    if cached_news is not None:
        return cached_news

    news_sentiment = 0.0
    try:
        query = f"{sym}+NSE+stock"
        feed_url = f"https://news.google.com/rss/search?q={query}&hl=en-IN&gl=IN&ceid=IN:en"
        feed = feedparser.parse(feed_url)
        sentiments = []
        for entry in feed.entries[:10]:
            title = entry.get('title', '')
            if title:
                score = vader.polarity_scores(title)
                sentiments.append(score['compound'])
        if sentiments:
            news_sentiment = sum(sentiments) / len(sentiments)
        cache_manager.set("news", sym, news_sentiment)
    except Exception as e:
        log.warning(f"Google News RSS failed for {sym}: {type(e).__name__}: {e}")

    return news_sentiment
