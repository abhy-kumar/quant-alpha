"""
data_fetcher.py
---------------
Data acquisition layer for the stock scanner.
Handles OHLCV fetching, fundamental data, and Screener.in scraping.
"""

import time
import threading
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

vader = SentimentIntensityAnalyzer()


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
        except (ValueError, KeyError, requests.RequestException) as e:
            log.debug(f"yfinance info fetch failed for {ticker}: {e}")

        if info.get('quoteType') == 'ETF':
            cache_manager.add_to_etf_list(sym)

    needs_fundamentals = pd.isna(_safe_float(info.get('trailingPE'))) or pd.isna(_safe_float(info.get('returnOnEquity')))

    now_ts = time.time()
    with _screener_lock:
        screener_available = now_ts > _screener_state.get("disabled_until", 0)
        if (needs_fundamentals or needs_sector) and screener_available and _screener_state["failures"] < SCREENER_MAX_FAILURES:
            _fetch_from_screener(sym, info, cached_sector, needs_fundamentals, needs_sector)

    if cached_sector:
        info['sector'] = cached_sector.get('sector', info.get('sector'))
        info['industry'] = cached_sector.get('industry', info.get('industry'))

    _fetch_bse_fallback(sym, info, needs_sector)

    if _safe_float(info.get('totalAssets')) is None or np.isnan(_safe_float(info.get('totalAssets'), default=np.nan)):
        bv = _safe_float(info.get('bookValue'), default=0)
        shares = _safe_float(info.get('sharesOutstanding'), default=0)
        total_debt = _safe_float(info.get('totalDebt'), default=0)
        total_cash = _safe_float(info.get('totalCash'), default=0)
        if bv > 0 and shares > 0:
            info['totalAssets'] = bv * shares + total_debt - total_cash

    cache_manager.set("fundamentals", sym, info)

    info['news_sentiment'] = _fetch_news_sentiment(sym)
    return info


def _fetch_from_screener(sym: str, info: dict, cached_sector, needs_fundamentals: bool, needs_sector: bool):
    """Scrape fundamental data from Screener.in."""
    time.sleep(1.0)
    try:
        url = f"https://www.screener.in/company/{sym}/consolidated/"
        resp = _YF_SESSION.get(url, timeout=10)
        if resp.status_code != 200:
            url = f"https://www.screener.in/company/{sym}/"
            resp = _YF_SESSION.get(url, timeout=10)

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

            peers_table = soup.find('table', class_='data-table')
            if peers_table:
                _parse_screener_peers(peers_table, sym, info)
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
                        info['debtToEquity'] = float(cells[debt_idx].text.strip().replace(',', '')) * 100.0
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
                        peer_data['debt_eq'] = float(cells[debt_idx].text.strip().replace(',', '')) * 100.0
                    except (ValueError, IndexError):
                        pass
                peers.append(peer_data)
    info['screener_peers'] = peers


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
