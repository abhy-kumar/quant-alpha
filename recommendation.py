import numpy as np
import pandas as pd

def compute_fund_score(
    roe_pct: float,
    pe: float,
    fwd_pe: float,
    debt_eq: float,
    div_yield_pct: float,
    mkt_cap_b: float,
    sharpe: float,
    eps_growth: float,
    rev_growth: float
) -> int:
    """
    Score fundamental quality on a 0–10 integer scale.
    """
    score = 0.0

    # ── ROE ──────────────────────────────────────────────────────────────────
    if not np.isnan(roe_pct):
        if roe_pct >= 15:
            score += 1.5
        elif roe_pct >= 8:
            score += 0.5

    # ── Valuation / Growth (PEG) ─────────────────────────────────────────────
    if not np.isnan(pe) and not np.isnan(eps_growth) and eps_growth > 0:
        peg = pe / (eps_growth * 100)
        if peg < 1.0: score += 2
        elif peg < 1.5: score += 1
    elif not np.isnan(pe) and pe > 0:
        if pe < 20: score += 2
        elif pe < 35: score += 1

    # ── Debt / Equity ─────────────────────────────────────────────────────────
    if not np.isnan(debt_eq):
        if debt_eq < 50:
            score += 1.5
        elif debt_eq < 100:
            score += 0.5
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

    return min(int(score), 10)


def compute_tech_score(latest: pd.Series, prev: pd.Series, df: pd.DataFrame, nifty_df: pd.DataFrame = None) -> float:
    """
    Evaluates technical indicators and returns a Tech Score between -1 and +1.
    """
    def _safe_float(val, default=np.nan) -> float:
        try:
            return float(val) if val is not None and not (isinstance(val, float) and np.isnan(val)) else default
        except Exception:
            return default

    close  = _safe_float(latest["Close"])
    
    sma50  = _safe_float(latest["SMA_50"])
    sma200 = _safe_float(latest["SMA_200"])

    sig_price_sma50    = 1 if close > sma50  else -1
    sig_price_sma200   = 1 if close > sma200 else -1
    sig_sma50_sma200   = 1 if sma50  > sma200 else -1

    rsi = _safe_float(latest["RSI"])
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

    st_dir        = _safe_float(latest.get("ST_Direction", np.nan), default=np.nan)
    sig_supertrend = 0 if np.isnan(st_dir) else int(-st_dir)   # -1→1 (bull), 1→-1 (bear)

    obv_latest = _safe_float(latest.get("OBV", np.nan))
    obv_ema    = _safe_float(latest.get("OBV_EMA20", np.nan))
    sig_obv    = 1 if obv_latest > obv_ema else -1

    weighted_signals = [
        (sig_supertrend, 2.0),
        (sig_price_sma200, 2.0),
        (sig_sma50_sma200, 2.0),
        (sig_adx, 2.0),
        (sig_macd, 1.0),
        (sig_rsi, 1.0),
        (sig_obv, 1.0),
        (sig_price_sma50, 1.0),
        (sig_stoch, 0.5),
        (sig_cci, 0.5),
        (sig_bb, 0.5),
        (sig_macd_hist, 0.5)
    ]

    bull_score = sum(w for v, w in weighted_signals if v == 1)
    bear_score = sum(w for v, w in weighted_signals if v == -1)
    total_weight = sum(w for _, w in weighted_signals)
    
    score = (bull_score - bear_score) / total_weight if total_weight else 0
    
    bull = sum(1 for v, w in weighted_signals if v == 1)
    bear = sum(1 for v, w in weighted_signals if v == -1)

    rs_score = 0
    if nifty_df is not None and len(df) >= 60 and len(nifty_df) >= 60:
        try:
            stock_3m = (_safe_float(df["Close"].iloc[-1]) / _safe_float(df["Close"].iloc[-60])) - 1
            nifty_3m = (_safe_float(nifty_df["Close"].iloc[-1]) / _safe_float(nifty_df["Close"].iloc[-60])) - 1
            rs_score = stock_3m - nifty_3m
            if rs_score < -0.10:
                score -= 0.2
        except Exception:
            pass

    return {
        "score": score,
        "rs_score": rs_score,
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
        "sig_obv": sig_obv
    }

def get_conviction_rating(tech_score: float, fund_score: int, market_regime: str, weekly_bullish: bool) -> str:
    """Map (Tech_Score, Fund_Score) → qualitative conviction label."""
    if tech_score > 0.4 and fund_score >= 7:
        rating = "Strong Buy"
    elif tech_score > 0.2 and fund_score >= 5:
        rating = "Buy"
    elif tech_score > -0.2 and fund_score >= 3:
        rating = "Hold"
    elif tech_score <= -0.4 or fund_score <= 1:
        rating = "Avoid"
    else:
        rating = "Caution"

    if rating == "Strong Buy" and not weekly_bullish:
        rating = "Buy"

    if market_regime == "Bearish":
        if rating == "Strong Buy":
            rating = "Buy"
        elif rating == "Buy":
            rating = "Hold"

    return rating
