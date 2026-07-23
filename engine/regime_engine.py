"""
regime_engine.py
----------------
Market Regime Engine for NSE Quantitative Research.
Computes multi-factor macro market regime score (-5 to +5) from NIFTY 50 trend,
India VIX volatility, FII/DII net flows, Put-Call Ratio (PCR), and advance-decline breadth.
"""

from utils import log, _safe_float
from indicators import add_indicators


def compute_regime_score(nifty_df, vix_df, fii_dii: dict, pcr_data: dict, breadth_pct: float | None) -> int:
    """Compute market regime score from multiple macro indicators."""
    regime_score = 0

    if nifty_df is not None and not nifty_df.empty:
        nifty_df = add_indicators(nifty_df)
        nifty_latest = nifty_df.iloc[-1]
        if _safe_float(nifty_latest["Close"]) > _safe_float(nifty_latest["SMA_200"]):
            regime_score += 1
        else:
            regime_score -= 1

    if vix_df is not None and not vix_df.empty:
        vix_latest = _safe_float(vix_df["Close"].iloc[-1])
        if vix_latest > 25:
            regime_score -= 1
        elif vix_latest < 15:
            regime_score += 1

    fii_net = fii_dii.get("fii_net", 0) if fii_dii else 0
    if fii_net > 500:
        regime_score += 1
    elif fii_net < -500:
        regime_score -= 1

    pcr = pcr_data.get("pcr", 1.0) if pcr_data else 1.0
    if pcr > 1.2:
        regime_score += 1
    elif pcr < 0.7:
        regime_score -= 1

    if breadth_pct is not None:
        if breadth_pct > 0.55:
            regime_score += 1
        elif breadth_pct < 0.45:
            regime_score -= 1

    return regime_score
