"""
regime_engine.py
----------------
Market Regime Engine for NSE Quantitative Research.
Computes multi-factor macro market regime score (-5 to +5) from NIFTY 50 trend,
India VIX volatility, FII/DII net flows, Put-Call Ratio (PCR), and advance-decline breadth.
"""

from utils import log, _safe_float
from engine.indicators import add_indicators


READINGS = ("trend", "vix", "fii", "pcr", "breadth")


def _number(value):
    value = _safe_float(value)
    return None if value != value else value


def compute_regime(nifty_df, vix_df, fii_dii: dict | None, pcr_data: dict | None, breadth_pct: float | None) -> dict:
    """Score each available reading +1, 0 or -1. Unavailable readings are left out, not scored 0."""
    parts = {}

    if nifty_df is not None and not nifty_df.empty:
        latest = add_indicators(nifty_df).iloc[-1]
        close, average = _number(latest["Close"]), _number(latest["SMA_200"])
        if close is not None and average is not None:
            parts["trend"] = 1 if close > average else -1

    if vix_df is not None and not vix_df.empty:
        vix = _number(vix_df["Close"].iloc[-1])
        if vix is not None and vix > 0:
            parts["vix"] = -1 if vix > 25 else 1 if vix < 15 else 0

    fii_net = _number((fii_dii or {}).get("fii_net"))
    if fii_net is not None:
        parts["fii"] = 1 if fii_net > 500 else -1 if fii_net < -500 else 0

    pcr = _number((pcr_data or {}).get("pcr"))
    if pcr is not None and pcr > 0:
        parts["pcr"] = 1 if pcr > 1.2 else -1 if pcr < 0.7 else 0

    breadth = _number(breadth_pct)
    if breadth is not None:
        parts["breadth"] = 1 if breadth > 0.55 else -1 if breadth < 0.45 else 0

    missing = [name for name in READINGS if name not in parts]
    if missing:
        log.warning(f"Market regime is missing readings: {', '.join(missing)}")
    return {"score": sum(parts.values()), "readings": len(parts), "parts": parts, "missing": missing}


def compute_regime_score(nifty_df, vix_df, fii_dii: dict, pcr_data: dict, breadth_pct: float | None) -> int:
    """Market regime score from the readings that are available (-5 to +5)."""
    return compute_regime(nifty_df, vix_df, fii_dii, pcr_data, breadth_pct)["score"]
