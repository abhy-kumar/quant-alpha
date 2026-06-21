"""
bse_fetcher.py
--------------
BSE India fallback data source for:
  1. Promoter Holding & Pledging  (via shareholding pattern API)
  2. Sector / Industry classification  (via company info)

Used when Screener.in is rate-limited or returns errors.
BSE APIs require proper session cookies from the homepage.
"""

import requests
import time
import logging
from datetime import datetime, timedelta
import pytz

IST = pytz.timezone("Asia/Kolkata")
logger = logging.getLogger("bse_fetcher")

_BSE_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Referer": "https://www.bseindia.com/",
    "Connection": "keep-alive",
}

_cached_bse_session = None
_bse_session_expiry = None

# NSE symbol → BSE code mapping (lazy-loaded)
_nse_to_bse_map = None


def _create_bse_session() -> requests.Session:
    """Open a BSE session by hitting the homepage to seed cookies."""
    global _cached_bse_session, _bse_session_expiry

    now = datetime.now(IST)
    if _cached_bse_session is not None and _bse_session_expiry and now < _bse_session_expiry:
        return _cached_bse_session

    session = requests.Session()
    session.headers.update(_BSE_HEADERS)
    for wait in [1, 2, 4]:
        try:
            resp = session.get("https://www.bseindia.com", timeout=12)
            if resp.status_code == 200:
                time.sleep(1.0)
                _cached_bse_session = session
                _bse_session_expiry = now + timedelta(minutes=30)
                return session
        except Exception:
            time.sleep(wait)

    _cached_bse_session = session
    _bse_session_expiry = now + timedelta(minutes=5)
    return session


def _invalidate_bse_session():
    global _cached_bse_session, _bse_session_expiry
    _cached_bse_session = None
    _bse_session_expiry = None


def _load_nse_to_bse_map() -> dict:
    """Load NSE symbol → BSE code mapping from BSE equity stock list."""
    global _nse_to_bse_map
    if _nse_to_bse_map is not None:
        return _nse_to_bse_map

    session = _create_bse_session()
    url = "https://www.bseindia.com/BSEIndiaAPI/api/GetStkLstDt/w?Indx=EQ&Industry=ALL&Flag=0"
    for attempt, wait in enumerate([2, 4]):
        try:
            resp = session.get(url, timeout=15)
            if resp.status_code != 200:
                logger.warning(f"BSE: stock mapping HTTP {resp.status_code}")
                time.sleep(wait)
                _invalidate_bse_session()
                session = _create_bse_session()
                continue

            content_type = resp.headers.get("Content-Type", "")
            if "json" not in content_type and "text/plain" not in content_type:
                logger.warning(f"BSE: stock mapping non-JSON response ({content_type})")
                time.sleep(wait)
                continue

            text = resp.text.strip()
            if not text or text.startswith("<") or len(text) < 10:
                logger.warning(f"BSE: stock mapping empty/HTML response ({len(text)} bytes)")
                time.sleep(wait)
                continue

            data = resp.json()
            mapping = {}
            for item in data.get("Table", []):
                nse_sym = (item.get("ShortName") or item.get("Company") or "").strip()
                bse_code = str(item.get("Code", "")).strip()
                isin = (item.get("ISIN") or "").strip()
                if nse_sym and bse_code:
                    mapping[nse_sym.upper()] = bse_code
                if isin and bse_code:
                    mapping[isin] = bse_code
            _nse_to_bse_map = mapping
            logger.info(f"BSE: loaded {len(mapping)} NSE→BSE mappings")
            return _nse_to_bse_map
        except Exception as e:
            logger.warning(f"BSE: failed to load stock mapping (attempt {attempt + 1}): {type(e).__name__}: {e}")
            time.sleep(wait)

    _nse_to_bse_map = {}
    return _nse_to_bse_map


def get_bse_code(nse_symbol: str) -> str | None:
    """Resolve NSE symbol (without .NS) to BSE script code."""
    mapping = _load_nse_to_bse_map()
    return mapping.get(nse_symbol.upper())


def get_promoter_holding(nse_symbol: str) -> dict:
    """
    Fetch promoter holding and pledging from BSE shareholding pattern API.
    Returns {"promoter_holding": float|None, "promoter_pledging": float|None}
    """
    bse_code = get_bse_code(nse_symbol)
    if not bse_code:
        return {"promoter_holding": None, "promoter_pledging": None}

    session = _create_bse_session()
    url = f"https://www.bseindia.com/BSEIndiaAPI/api/ShareholdingPattern/w?CompCode={bse_code}"
    try:
        resp = session.get(url, timeout=12)
        if resp.status_code == 200:
            data = resp.json()
            rows = data.get("Table", [])
            if rows:
                latest = rows[-1]  # Most recent quarter
                promoter_pct = latest.get("Promoters")
                pledged_pct = latest.get("PromoterPledge") or latest.get("Pledge")
                result = {
                    "promoter_holding": float(promoter_pct) if promoter_pct else None,
                    "promoter_pledging": float(pledged_pct) if pledged_pct else None,
                }
                if result["promoter_holding"] is not None:
                    logger.info(f"BSE: {nse_symbol} promoter={result['promoter_holding']}%, pledged={result['promoter_pledging']}")
                return result
        else:
            logger.debug(f"BSE: shareholding HTTP {resp.status_code} for {nse_symbol}")
    except Exception as e:
        logger.debug(f"BSE: shareholding failed for {nse_symbol}: {e}")

    return {"promoter_holding": None, "promoter_pledging": None}


def get_company_info(nse_symbol: str) -> dict:
    """
    Fetch sector/industry from BSE stock detail API.
    Returns {"sector": str|None, "industry": str|None, "group": str|None}
    """
    bse_code = get_bse_code(nse_symbol)
    if not bse_code:
        return {"sector": None, "industry": None, "group": None}

    session = _create_bse_session()
    url = f"https://www.bseindia.com/BSEIndiaAPI/api/StockPdtsDetail/w?Name={nse_symbol}&Flag=0"
    try:
        resp = session.get(url, timeout=12)
        if resp.status_code == 200:
            data = resp.json()
            detail = data.get("Table", [{}])
            if detail:
                item = detail[0] if isinstance(detail, list) else detail
                result = {
                    "sector": item.get("Industry") or item.get("Sector"),
                    "industry": item.get("SubIndustry") or item.get("Industry"),
                    "group": item.get("Group") or item.get("IndustryGroup"),
                }
                if result["sector"]:
                    logger.info(f"BSE: {nse_symbol} sector={result['sector']}, group={result['group']}")
                return result
        else:
            logger.debug(f"BSE: company info HTTP {resp.status_code} for {nse_symbol}")
    except Exception as e:
        logger.debug(f"BSE: company info failed for {nse_symbol}: {e}")

    return {"sector": None, "industry": None, "group": None}
