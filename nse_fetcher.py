"""
nse_fetcher.py
--------------
Handles all free NSE data sources:
  1. NSE Bhav Copy  — Official EOD OHLCV for every listed equity (post 4 PM)
  2. NSE Live API   — Delayed (~1–5 min) quotes via NSE's own public endpoints
  3. Market Status  — IST clock + open/closed detection

No API keys, no paid subscriptions.
"""

import requests
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from io import StringIO
import time
import pytz
import logging

IST = pytz.timezone("Asia/Kolkata")
logger = logging.getLogger("nse_fetcher")

# ---------------------------------------------------------------------------
# Market Status
# ---------------------------------------------------------------------------

def is_market_open() -> bool:
    """True if NSE equity segment is open (9:15 AM – 3:30 PM IST, Mon–Fri)."""
    now = datetime.now(IST)
    if now.weekday() >= 5:          # Saturday / Sunday
        return False
    open_t  = now.replace(hour=9,  minute=15, second=0, microsecond=0)
    close_t = now.replace(hour=15, minute=30, second=0, microsecond=0)
    return open_t <= now <= close_t


def market_status_text() -> dict:
    """Return a dict with human-readable market status info."""
    now     = datetime.now(IST)
    is_open = is_market_open()
    return {
        "is_open":  is_open,
        "status":   "OPEN" if is_open else "CLOSED",
        "time_ist": now.strftime("%d %b %Y  %I:%M:%S %p IST"),
        "weekday":  now.strftime("%A"),
    }


# ---------------------------------------------------------------------------
# NSE Session Management  (cookie handshake required by NSE's Cloudflare layer)
# ---------------------------------------------------------------------------

_NSE_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept":          "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Referer":         "https://www.nseindia.com/",
    "Connection":      "keep-alive",
}

_cached_nse_session = None
_nse_session_expiry = None


def _create_nse_session() -> requests.Session:
    """Open an NSE session by hitting the homepage to seed cookies."""
    global _cached_nse_session, _nse_session_expiry

    now = datetime.now(IST)
    if _cached_nse_session is not None and _nse_session_expiry and now < _nse_session_expiry:
        return _cached_nse_session

    session = requests.Session()
    session.headers.update(_NSE_HEADERS)
    retries = [1, 2, 4]
    for wait in retries:
        try:
            resp = session.get("https://www.nseindia.com", timeout=12)
            if resp.status_code == 200:
                time.sleep(1.2)
                _cached_nse_session = session
                _nse_session_expiry = now + timedelta(minutes=30)
                return session
        except Exception:
            time.sleep(wait)
    
    _cached_nse_session = session
    _nse_session_expiry = now + timedelta(minutes=5)
    return session


# ---------------------------------------------------------------------------
# NSE Bhav Copy  (Official end-of-day data)
# ---------------------------------------------------------------------------

def _bhav_url(date: datetime) -> str:
    return (
        "https://nsearchives.nseindia.com/products/content/"
        f"sec_bhavdata_full_{date.strftime('%d%m%Y')}.csv"
    )


def download_bhav_copy(max_lookback: int = 5) -> tuple[pd.DataFrame, datetime | None]:
    """
    Download the most recent NSE Equity Bhav Copy CSV.
    Tries today first, then walks back up to `max_lookback` trading days.

    Returns
    -------
    (DataFrame, date)  — filtered to EQ series only
    (empty DataFrame, None)  — if all attempts fail
    """
    headers = {"User-Agent": _NSE_HEADERS["User-Agent"]}
    today   = datetime.now(IST).replace(tzinfo=None)

    for days_back in range(max_lookback + 1):
        candidate = today - timedelta(days=days_back)
        if candidate.weekday() >= 5:          # Skip weekends
            continue
        url = _bhav_url(candidate)
        retries = [0, 1, 3]
        for wait in retries:
            try:
                if wait > 0:
                    time.sleep(wait)
                resp = requests.get(url, headers=headers, timeout=20)
                if resp.status_code == 200 and len(resp.content) > 2_000:
                    df = pd.read_csv(StringIO(resp.text))
                    df.columns = df.columns.str.strip()
                    if "SERIES" in df.columns:
                        df = df[df["SERIES"].str.strip() == "EQ"].copy()
                    
                    required_cols = ["SYMBOL", "CLOSE_PRICE"]
                    if not all(col in df.columns for col in required_cols):
                        logger.warning(f"Bhav copy missing required columns: {url}")
                        continue
                    
                    for col in ["OPEN_PRICE", "HIGH_PRICE", "LOW_PRICE",
                                 "CLOSE_PRICE", "PREVCLOSE", "PREV_CLOSE", "TURNOVER_LACS", "TTL_TRD_QNTY"]:
                        if col in df.columns:
                            df[col] = pd.to_numeric(df[col], errors="coerce")
                    
                    df = df.dropna(subset=["SYMBOL", "CLOSE_PRICE"])
                    df = df[df["CLOSE_PRICE"] > 0]
                    
                    logger.info(f"Downloaded bhav copy for {candidate.strftime('%Y-%m-%d')}: {len(df)} EQ stocks")
                    return df, candidate
            except Exception as e:
                logger.debug(f"Bhav fetch attempt failed for {candidate.strftime('%Y-%m-%d')}: {e}")
                continue

    logger.warning("Failed to download bhav copy after all retries")
    return pd.DataFrame(), None


def get_market_breadth(bhav_df: pd.DataFrame) -> dict:
    """
    Compute broad market breadth (Advances, Declines, Unchanged) 
    from the full NSE Bhav Copy (approx 2000+ stocks).
    """
    if bhav_df.empty or "CLOSE_PRICE" not in bhav_df.columns:
        return {"advances": 0, "declines": 0, "unchanged": 0, "breadth_pct": 0.5}
        
    prev_col = "PREVCLOSE" if "PREVCLOSE" in bhav_df.columns else "PREV_CLOSE" if "PREV_CLOSE" in bhav_df.columns else None
    if not prev_col:
        return {"advances": 0, "declines": 0, "unchanged": 0, "breadth_pct": 0.5}

    advances = len(bhav_df[bhav_df["CLOSE_PRICE"] > bhav_df[prev_col]])
    declines = len(bhav_df[bhav_df["CLOSE_PRICE"] < bhav_df[prev_col]])
    unchanged = len(bhav_df[bhav_df["CLOSE_PRICE"] == bhav_df[prev_col]])
    
    total = advances + declines
    breadth_pct = advances / total if total > 0 else 0.5
    
    return {
        "advances": advances,
        "declines": declines,
        "unchanged": unchanged,
        "breadth_pct": breadth_pct
    }


def get_liquid_universe(top_n: int = 150) -> list[str]:
    """
    Return top `top_n` NSE equity symbols (by turnover) as 'SYMBOL.NS' strings.
    Falls back to a hardcoded Nifty 50 list if the bhav copy cannot be fetched.
    """
    bhav_df, _ = download_bhav_copy()

    if not bhav_df.empty and "TURNOVER_LACS" in bhav_df.columns:
        bhav_df = bhav_df.dropna(subset=["SYMBOL", "TURNOVER_LACS"])
        top     = bhav_df.nlargest(top_n, "TURNOVER_LACS")
        return (top["SYMBOL"].str.strip() + ".NS").tolist()

    # ── Hardcoded fallback: Nifty 50 + a selection of liquid midcaps ─────────
    return [s + ".NS" for s in _FALLBACK_SYMBOLS]


_FALLBACK_SYMBOLS = [
    "RELIANCE","TCS","HDFCBANK","INFY","ICICIBANK","ITC","LT","SBIN",
    "BHARTIARTL","BAJFINANCE","ASIANPAINT","HINDUNILVR","KOTAKBANK",
    "MARUTI","SUNPHARMA","ADANIENT","ADANIPORTS","AXISBANK","BAJAJFINSV",
    "BPCL","BRITANNIA","CIPLA","COALINDIA","DIVISLAB","DRREDDY",
    "EICHERMOT","GRASIM","HCLTECH","HDFCLIFE","HEROMOTOCO","HINDALCO",
    "INDUSINDBK","JSWSTEEL","M&M","NESTLEIND","NTPC","ONGC","POWERGRID",
    "SBILIFE","TATACONSUM","TATAMOTORS","TATASTEEL","TECHM","TITAN",
    "ULTRACEMCO","UPL","WIPRO","ZOMATO","BAJAJ-AUTO","SHRIRAMFIN",
]


# ---------------------------------------------------------------------------
# Live Delayed Quotes  (via NSE's own public JSON endpoints)
# ---------------------------------------------------------------------------

def get_live_quote(session: requests.Session, symbol: str) -> dict:
    """
    Fetch a live (exchange-delayed) quote for a single symbol.
    `symbol` must be the raw NSE symbol WITHOUT the '.NS' suffix.
    """
    url = f"https://www.nseindia.com/api/quote-equity?symbol={symbol.upper()}"
    retries = [0, 1, 3]
    for wait in retries:
        try:
            if wait > 0:
                time.sleep(wait)
            resp = session.get(url, timeout=10)
            if resp.status_code == 200:
                data = resp.json()
                if not data or "priceInfo" not in data:
                    logger.debug(f"No priceInfo for {symbol}")
                    return {"symbol": symbol, "last_price": None}
                pi   = data.get("priceInfo", {})
                idhl = pi.get("intraDayHighLow", {})
                whl  = pi.get("weekHighLow",     {})
                last_price = pi.get("lastPrice")
                if last_price is None or last_price == 0:
                    return {"symbol": symbol, "last_price": None}
                return {
                    "symbol":     symbol,
                    "last_price": last_price,
                    "change":     pi.get("change"),
                    "pct_change": pi.get("pChange"),
                    "open":       pi.get("open"),
                    "high":       idhl.get("max"),
                    "low":        idhl.get("min"),
                    "prev_close": pi.get("previousClose"),
                    "52w_high":   whl.get("max"),
                    "52w_low":    whl.get("min"),
                }
            elif resp.status_code == 429:
                logger.warning(f"Rate limited on {symbol}, backing off")
                time.sleep(5)
                continue
        except requests.exceptions.Timeout:
            logger.debug(f"Timeout fetching quote for {symbol}")
        except Exception as e:
            logger.debug(f"Error fetching quote for {symbol}: {e}")
    return {"symbol": symbol, "last_price": None}


def get_bulk_live_quotes(symbols_ns: list[str], max_symbols: int = 40) -> pd.DataFrame:
    """
    Fetch live delayed quotes for up to `max_symbols` stocks.
    `symbols_ns` — list of tickers in 'SYMBOL.NS' format.
    Returns a DataFrame with one row per symbol.
    """
    session = _create_nse_session()
    results = []
    success_count = 0
    fail_count = 0
    for sym_ns in symbols_ns[:max_symbols]:
        sym = sym_ns.replace(".NS", "")
        quote = get_live_quote(session, sym)
        results.append(quote)
        if quote.get("last_price") is not None:
            success_count += 1
        else:
            fail_count += 1
        time.sleep(0.35)           # Be a polite client
    
    logger.info(f"Bulk quote fetch: {success_count} succeeded, {fail_count} failed out of {min(len(symbols_ns), max_symbols)}")
    return pd.DataFrame(results)
