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


def _invalidate_nse_session():
    """Clear cached NSE session so next call creates a fresh one."""
    global _cached_nse_session, _nse_session_expiry
    _cached_nse_session = None
    _nse_session_expiry = None


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


def get_liquid_universe(top_n: int = 200) -> list[str]:
    """
    Return Nifty 200 constituents as 'SYMBOL.NS' strings.
    Uses the canonical Nifty 200 list — stable, predictable, and aligned with
    the index constituents tracked by NSE.
    """
    symbols = _NIFTY_200_SYMBOLS[:top_n]
    return [s + ".NS" for s in symbols]


_NIFTY_200_SYMBOLS = [
    # ── Nifty 50 ────────────────────────────────────────────────────────────
    "RELIANCE","TCS","HDFCBANK","INFY","ICICIBANK","ITC","LT","SBIN",
    "BHARTIARTL","BAJFINANCE","ASIANPAINT","HINDUNILVR","KOTAKBANK",
    "MARUTI","SUNPHARMA","ADANIENT","ADANIPORTS","AXISBANK","BAJAJFINSV",
    "BPCL","BRITANNIA","CIPLA","COALINDIA","DIVISLAB","DRREDDY",
    "EICHERMOT","GRASIM","HCLTECH","HDFCLIFE","HEROMOTOCO","HINDALCO",
    "INDUSINDBK","JSWSTEEL","M&M","NESTLEIND","NTPC","ONGC","POWERGRID",
    "SBILIFE","TATACONSUM","TATAMOTORS","TATASTEEL","TECHM","TITAN",
    "ULTRACEMCO","UPL","WIPRO","ETERNAL","BAJAJ-AUTO","SHRIRAMFIN",
    # ── Nifty Next 50 ──────────────────────────────────────────────────────
    "ABB","ABCAPITAL","ABFRL","ACC","ALKEM","AMBUJACEM","ASHOKLEY",
    "ASTRAL","AUROPHARMA","BALKRISIND","BANDHANBNK","BATAINDIA",
    "BERGEPAINT","BHARATFORG","BIOCON","CANBK","CHOLAFIN","COLPAL",
    "CONCOR","COROMANDEL","CROMPTON","DALBHARAT","DEEPAKNTR","DIXON",
    "EMAMILTD","ESCORTS","FEDERALBNK","GAIL","GLENMARK","GODREJCP",
    "GODREJPROP","GRINDWELL","HAL","HONAUT","IDFCFIRSTB",
    "INDIGO","IRCTC","JUBLFOOD","KANSAINER","KPITTECH","LALPATHLAB",
    "LICHSGFIN","LTIM","LTTS","MANAPPURAM","MFSL","MGL","MPHASIS",
    "MUTHOOTFIN","NAM-INDIA","OBEROIRLTY","OFSS","POLYCAB","PVRINOX",
    "RAJESHEXPO","RAMCOCEM","RBLBANK","RECLTD","SAIL","SONACOMS",
    "SRF","SUNTV","TATACOMM","TATAELXSI","TORNTPHARM","TRENT",
    "TVSMOTOR","UBL","UNIONBANK","VOLTAS","ZEEL",
    # ── Nifty 101–200 ──────────────────────────────────────────────────────
    "AARTIIND","APOLLOHOSP","BASF","BAYERCROP","BEL","BHEL","BAJAJHLDNG",
    "CANFINHOME","CHAMBLFERT","CUMMINSIND","DABUR","EQUITASBNK",
    "GNFC","GPPL","GSFC","HEG","HEMIPROP",
    "HINDCOPPER","HINDPETRO","HUDCO","IEX","INDHOTEL",
    "INDIAMART","INGERRAND","IRCON","JBCHEPHARM","JINDALSAW","JSL",
    "KAJARIACER","KESORAMIND","KOLTEPATIL","KRBL","LaurusLabs",
    "LXCHEM","MAHABANK","MAHLOG","MASTEK","MAXHEALTH","METROPOLIS",
    "UNITDSPR","NATIONALUM","NAVNETEDUL","NBCC","NMDC","NTPCGREEN","OLECTRA",
    "PAGEIND","PERSISTENT","PETRONET","PFIZER","PHOENIXLTD","PIDILITIND",
    "PIIND","PNCINFRA","RADICO","RAJRATAN","RATNAMANI",
    "REDINGTON","RITES","RVNL","SJVN","SONATSOFTW","SPARC",
    "STARHEALTH","SUNDARMFIN","SUNDRMFAST","SUPREMEIND","SWSOLAR",
    "SYNGENE","TATACHEM","TATAINVEST","THERMAX","TIMKEN","TRIDENT",
    "TTKPRESTIG","NETWORK18","UCOBANK","VAIBHAVGBL",
    "VSTIND","WHIRLPOOL","YESBANK","ZENSARTECH",
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


# ---------------------------------------------------------------------------
# FII / DII Activity  (Institutional Flow)
# ---------------------------------------------------------------------------

def get_fii_dii_activity() -> dict:
    """
    Fetch FII and DII buy/sell data from NSE.
    Returns net buy/sell figures in Rs. Crores.
    """
    for attempt in range(3):
        session = _create_nse_session()
        url = "https://www.nseindia.com/api/fiidiiTradeReact"
        try:
            time.sleep(1.5 if attempt > 0 else 0)
            resp = session.get(url, timeout=15)
            if resp.status_code == 200:
                data = resp.json()
                result = {"fii_buy": 0, "fii_sell": 0, "fii_net": 0,
                          "dii_buy": 0, "dii_sell": 0, "dii_net": 0}
                for item in data:
                    category = item.get("category", "").upper()
                    buy = float(item.get("buyValue", 0) or 0)
                    sell = float(item.get("sellValue", 0) or 0)
                    if "FII" in category or "FPI" in category:
                        result["fii_buy"] = buy
                        result["fii_sell"] = sell
                        result["fii_net"] = buy - sell
                    elif "DII" in category:
                        result["dii_buy"] = buy
                        result["dii_sell"] = sell
                        result["dii_net"] = buy - sell
                logger.info(f"FII/DII data: FII net={result['fii_net']:.0f} Cr, DII net={result['dii_net']:.0f} Cr")
                return result
            else:
                logger.warning(f"FII/DII HTTP {resp.status_code} (attempt {attempt+1}/3)")
                _invalidate_nse_session()
        except Exception as e:
            logger.warning(f"FII/DII fetch attempt {attempt+1} failed: {type(e).__name__}: {e}")
            _invalidate_nse_session()
    logger.warning("Failed to fetch FII/DII data after all retries")
    return {"fii_buy": 0, "fii_sell": 0, "fii_net": 0,
            "dii_buy": 0, "dii_sell": 0, "dii_net": 0}


# ---------------------------------------------------------------------------
# F&O Put/Call Ratio (PCR)
# ---------------------------------------------------------------------------

def get_put_call_ratio() -> dict:
    """
    Fetch NIFTY option chain data from NSE and compute Put/Call Ratio
    based on total put vs call OUV (Open Underlying Value).
    PCR > 1.2 → bullish (contrarian), PCR < 0.7 → bearish.
    """
    for attempt in range(3):
        session = _create_nse_session()
        url = "https://www.nseindia.com/api/option-chain-indices?symbol=NIFTY"
        try:
            time.sleep(1.5 if attempt > 0 else 0)
            resp = session.get(url, timeout=15)
            if resp.status_code == 200:
                data = resp.json()
                records = data.get("records", {})
                calls_oi = 0
                puts_oi = 0
                for item in records.get("data", []):
                    if "CE" in item:
                        calls_oi += item["CE"].get("openInterest", 0) or 0
                    if "PE" in item:
                        puts_oi += item["PE"].get("openInterest", 0) or 0
                pcr = round(puts_oi / calls_oi, 3) if calls_oi > 0 else 1.0
                logger.info(f"NIFTY PCR: {pcr} (puts_oi={puts_oi}, calls_oi={calls_oi})")
                return {"pcr": pcr, "puts_oi": puts_oi, "calls_oi": calls_oi}
            else:
                logger.warning(f"PCR HTTP {resp.status_code} (attempt {attempt+1}/3)")
                _invalidate_nse_session()
        except Exception as e:
            logger.warning(f"PCR fetch attempt {attempt+1} failed: {type(e).__name__}: {e}")
            _invalidate_nse_session()
    logger.warning("Failed to fetch PCR data after all retries")
    return {"pcr": 1.0, "puts_oi": 0, "calls_oi": 0}
