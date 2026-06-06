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

IST = pytz.timezone("Asia/Kolkata")

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


def _create_nse_session() -> requests.Session:
    """Open an NSE session by hitting the homepage to seed cookies."""
    session = requests.Session()
    session.headers.update(_NSE_HEADERS)
    try:
        session.get("https://www.nseindia.com", timeout=12)
        time.sleep(1.2)   # Let cookies settle
    except Exception:
        pass
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
        try:
            resp = requests.get(url, headers=headers, timeout=20)
            if resp.status_code == 200 and len(resp.content) > 2_000:
                df = pd.read_csv(StringIO(resp.text))
                df.columns = df.columns.str.strip()
                if "SERIES" in df.columns:
                    df = df[df["SERIES"].str.strip() == "EQ"].copy()
                # Normalise numeric columns
                for col in ["OPEN_PRICE", "HIGH_PRICE", "LOW_PRICE",
                             "CLOSE_PRICE", "TURNOVER_LACS", "TTL_TRD_QNTY"]:
                    if col in df.columns:
                        df[col] = pd.to_numeric(df[col], errors="coerce")
                return df, candidate
        except Exception:
            continue

    return pd.DataFrame(), None


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
    try:
        resp = session.get(url, timeout=10)
        if resp.status_code == 200:
            data     = resp.json()
            pi       = data.get("priceInfo", {})
            idhl     = pi.get("intraDayHighLow", {})
            whl      = pi.get("weekHighLow",     {})
            return {
                "symbol":     symbol,
                "last_price": pi.get("lastPrice"),
                "change":     pi.get("change"),
                "pct_change": pi.get("pChange"),
                "open":       pi.get("open"),
                "high":       idhl.get("max"),
                "low":        idhl.get("min"),
                "prev_close": pi.get("previousClose"),
                "52w_high":   whl.get("max"),
                "52w_low":    whl.get("min"),
            }
    except Exception:
        pass
    return {"symbol": symbol, "last_price": None}


def get_bulk_live_quotes(symbols_ns: list[str], max_symbols: int = 40) -> pd.DataFrame:
    """
    Fetch live delayed quotes for up to `max_symbols` stocks.
    `symbols_ns` — list of tickers in 'SYMBOL.NS' format.
    Returns a DataFrame with one row per symbol.
    """
    session = _create_nse_session()
    results = []
    for sym_ns in symbols_ns[:max_symbols]:
        sym = sym_ns.replace(".NS", "")
        results.append(get_live_quote(session, sym))
        time.sleep(0.35)           # Be a polite client
    return pd.DataFrame(results)
