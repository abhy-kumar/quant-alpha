import numpy as np
import pandas as pd
from utils import _safe_float

def compute_fund_score(
    roe_pct: float,
    pe: float,
    fwd_pe: float,
    debt_eq: float,
    div_yield_pct: float,
    mkt_cap_b: float,
    sharpe: float,
    eps_growth: float,
    rev_growth: float,
    roce_pct: float = np.nan,
    promoter_holding: float = np.nan,
    promoter_pledging: float = np.nan,
    sector_medians: dict = None
) -> float:
    """
    Score fundamental quality on a 0–10 continuous scale.
    If sector_medians is provided, evaluates metrics relative to the sector.
    """
    score = 0.0
    
    sec_pe = _safe_float(sector_medians.get("pe")) if sector_medians else np.nan
    sec_roe = _safe_float(sector_medians.get("roe")) if sector_medians else np.nan
    sec_debt = _safe_float(sector_medians.get("debt_eq")) if sector_medians else np.nan

    # ── ROE ──────────────────────────────────────────────────────────────────
    if not np.isnan(roe_pct):
        if not np.isnan(sec_roe) and sec_roe > 0:
            if roe_pct >= sec_roe * 1.5: score += 1.5
            elif roe_pct >= sec_roe: score += 0.5
        else:
            if roe_pct >= 15: score += 1.5
            elif roe_pct >= 8: score += 0.5

    # ── ROCE ──────────────────────────────────────────────────────────────────
    if not np.isnan(roce_pct):
        if roce_pct >= 20: score += 1.5
        elif roce_pct >= 12: score += 0.5

    # ── Valuation / Growth (PEG & P/E) ───────────────────────────────────────
    if not np.isnan(pe) and not np.isnan(eps_growth) and eps_growth > 0:
        peg = pe / (eps_growth * 100)
        if peg < 1.0: score += 2.0
        elif peg < 1.5: score += 1.0
    elif not np.isnan(pe) and pe > 0:
        if not np.isnan(sec_pe) and sec_pe > 0:
            if pe < sec_pe * 0.8: score += 2.0
            elif pe < sec_pe: score += 1.0
        else:
            if pe < 20: score += 2.0
            elif pe < 35: score += 1.0

    # ── Debt / Equity ─────────────────────────────────────────────────────────
    if not np.isnan(debt_eq):
        if not np.isnan(sec_debt) and sec_debt > 0:
            if debt_eq < sec_debt * 0.8: score += 1.5
            elif debt_eq < sec_debt: score += 0.5
        else:
            if debt_eq < 50: score += 1.5
            elif debt_eq < 100: score += 0.5
    else:
        score += 0.5

    # ── Growth ───────────────────────────────────────────────────────────────
    if not np.isnan(eps_growth) and eps_growth > 0.15:
        score += 1.5
    if not np.isnan(rev_growth) and rev_growth > 0.10:
        score += 1.0

    # ── Dividend Yield ────────────────────────────────────────────────────────
    if not np.isnan(div_yield_pct) and div_yield_pct > 1.0:
        score += 0.5

    # ── Market Cap ────────────────────────────────────────────────────────────
    if not np.isnan(mkt_cap_b) and mkt_cap_b >= 10:
        score += 1.0

    # ── Sharpe ───────────────────────────────────────────────────────────────
    if not np.isnan(sharpe) and sharpe > 1.0:
        score += 1.0

    # ── Promoter ─────────────────────────────────────────────────────────────
    if not np.isnan(promoter_holding):
        if promoter_holding > 50:
            if not np.isnan(promoter_pledging) and promoter_pledging < 10:
                score += 1.0
            elif np.isnan(promoter_pledging):
                score += 0.5
                
    if not np.isnan(promoter_pledging):
        if promoter_pledging > 30:
            score -= 1.5

    return min(float(score), 10.0)


def compute_tech_score(latest: pd.Series, prev: pd.Series, df: pd.DataFrame, nifty_df: pd.DataFrame = None, fifty_two_high: float = np.nan) -> dict:
    """
    Evaluates technical indicators and returns a Tech Score between -1 and +1.
    """
    close  = _safe_float(latest["Close"])
    
    sma50  = _safe_float(latest["SMA_50"])
    sma200 = _safe_float(latest["SMA_200"])

    sig_price_sma50    = 1 if close > sma50  else -1
    sig_price_sma200   = 1 if close > sma200 else -1
    sig_sma50_sma200   = 1 if sma50  > sma200 else -1

    st_dir        = _safe_float(latest.get("ST_Direction", np.nan), default=np.nan)
    sig_supertrend = 0 if np.isnan(st_dir) else int(-st_dir)

    bullish_regime = (sig_price_sma200 == 1 and sig_supertrend == 1)

    rsi = _safe_float(latest["RSI"])
    if bullish_regime:
        sig_rsi = 1 if 40 <= rsi <= 80 else (-1 if rsi < 40 or rsi > 80 else 0)
    else:
        sig_rsi = 1 if rsi < 30 else (-1 if rsi > 70 else 0)

    macd      = _safe_float(latest["MACD"])
    macd_sig  = _safe_float(latest["MACD_Signal"])
    macd_hist = _safe_float(latest["MACD_Hist"])
    prev_hist = _safe_float(prev["MACD_Hist"])
    sig_macd      = 1 if macd > macd_sig  else -1
    sig_macd_hist = 1 if macd_hist > prev_hist else -1

    k, d  = _safe_float(latest["Stoch_%K"]), _safe_float(latest["Stoch_%D"])
    sig_stoch = 1 if (k < 20 and k > d) else (-1 if (k > 80 and k < d) else 0)

    bb_b     = _safe_float(latest["BB_%B"])
    sig_bb   = 1 if bb_b < 0.05 else (-1 if bb_b > 0.95 else 0)

    cci      = _safe_float(latest["CCI"])
    sig_cci  = 1 if cci < -100 else (-1 if cci > 100 else 0)

    price_up  = close > _safe_float(prev["Close"])
    vol_above = _safe_float(latest["Volume"]) > _safe_float(latest["VOL_MA20"])
    sig_vol   = 1 if (price_up and vol_above) else (-1 if (not price_up and vol_above) else 0)

    adx      = _safe_float(latest["ADX"])
    plus_di  = _safe_float(latest["Plus_DI"])
    minus_di = _safe_float(latest["Minus_DI"])
    sig_adx  = (
        1  if adx > 25 and plus_di  > minus_di else
        -1 if adx > 25 and minus_di > plus_di  else 0
    )

    vpt = _safe_float(latest.get("VPT", np.nan))
    vpt_ema = _safe_float(latest.get("VPT_EMA20", np.nan))
    sig_vpt = 1 if vpt > vpt_ema else (-1 if vpt < vpt_ema else 0)

    span_a = _safe_float(latest.get("Ichimoku_SpanA", np.nan))
    span_b = _safe_float(latest.get("Ichimoku_SpanB", np.nan))
    sig_ichimoku = 1 if (close > span_a and close > span_b) else (-1 if (close < span_a and close < span_b) else 0)

    sig_52w_high = 0
    if not np.isnan(fifty_two_high) and fifty_two_high > 0:
        sig_52w_high = 1 if (close / fifty_two_high) >= 0.95 else 0

    weighted_signals = [
        (sig_supertrend, 2.0),
        (sig_price_sma200, 2.0),
        (sig_sma50_sma200, 2.0),
        (sig_adx, 2.0),
        (sig_ichimoku, 1.5),
        (sig_macd, 1.0),
        (sig_rsi, 1.0),
        (sig_52w_high, 1.0),
        (sig_vpt, 1.0),
        (sig_price_sma50, 1.0),
        (sig_vol, 0.5),
        (sig_stoch, 0.25),
        (sig_cci, 0.25),
        (sig_bb, 0.25),
        (sig_macd_hist, 0.5)
    ]

    bull_score = sum(w for v, w in weighted_signals if v == 1)
    bear_score = sum(w for v, w in weighted_signals if v == -1)
    total_weight = sum(w for _, w in weighted_signals)
    
    score = (bull_score - bear_score) / total_weight if total_weight else 0
    
    bull = sum(1 for v, w in weighted_signals if v == 1)
    bear = sum(1 for v, w in weighted_signals if v == -1)

    rs_1m, rs_3m, rs_6m = np.nan, np.nan, np.nan
    if nifty_df is not None and len(df) >= 21 and len(nifty_df) >= 21:
        try:
            stock_1m = (_safe_float(df["Close"].iloc[-1]) / _safe_float(df["Close"].iloc[-21])) - 1
            nifty_1m = (_safe_float(nifty_df["Close"].iloc[-1]) / _safe_float(nifty_df["Close"].iloc[-21])) - 1
            rs_1m = stock_1m - nifty_1m
        except Exception: pass
        
    if nifty_df is not None and len(df) >= 60 and len(nifty_df) >= 60:
        try:
            stock_3m = (_safe_float(df["Close"].iloc[-1]) / _safe_float(df["Close"].iloc[-60])) - 1
            nifty_3m = (_safe_float(nifty_df["Close"].iloc[-1]) / _safe_float(nifty_df["Close"].iloc[-60])) - 1
            rs_3m = stock_3m - nifty_3m
        except Exception: pass
        
    if nifty_df is not None and len(df) >= 120 and len(nifty_df) >= 120:
        try:
            stock_6m = (_safe_float(df["Close"].iloc[-1]) / _safe_float(df["Close"].iloc[-120])) - 1
            nifty_6m = (_safe_float(nifty_df["Close"].iloc[-1]) / _safe_float(nifty_df["Close"].iloc[-120])) - 1
            rs_6m = stock_6m - nifty_6m
        except Exception: pass

    return {
        "score": score,
        "rs_1m": rs_1m,
        "rs_3m": rs_3m,
        "rs_6m": rs_6m,
        "bull": bull,
        "bear": bear,
        "sig_price_sma50": sig_price_sma50,
        "sig_price_sma200": sig_price_sma200,
        "sig_sma50_sma200": sig_sma50_sma200,
        "sig_rsi": sig_rsi,
        "sig_macd": sig_macd,
        "sig_macd_hist": sig_macd_hist,
        "sig_stoch": sig_stoch,
        "sig_bb": sig_bb,
        "sig_cci": sig_cci,
        "sig_vol": sig_vol,
        "sig_adx": sig_adx,
        "sig_supertrend": sig_supertrend,
        "sig_vpt": sig_vpt,
        "sig_ichimoku": sig_ichimoku,
        "sig_52w_high": sig_52w_high
    }

def get_conviction_rating(percentile: float, regime_score: int, weekly_bullish: bool) -> str:
    """Map composite percentile across universe -> qualitative conviction label."""
    sb_threshold = 85 if regime_score >= 2 else 90
    
    if np.isnan(percentile):
        return "Unknown"
        
    if percentile >= sb_threshold:
        rating = "Strong Buy"
    elif percentile >= 70:
        rating = "Buy"
    elif percentile >= 40:
        rating = "Hold"
    elif percentile >= 20:
        rating = "Caution"
    else:
        rating = "Avoid"

    if rating == "Strong Buy" and not weekly_bullish:
        rating = "Buy"

    # Market regime adjustment (-3 to +3)
    if regime_score <= -2:
        if rating == "Strong Buy": rating = "Buy"
        elif rating == "Buy": rating = "Hold"
        elif rating == "Hold": rating = "Caution"
        elif rating == "Caution": rating = "Avoid"

    return rating
