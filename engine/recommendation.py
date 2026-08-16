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

    Uses a weighted average of continuous sub-scores derived from sector Z-scores
    and sigmoid/tanh functions, eliminating discrete cliff edges and normalizing
    across varying sector valuation baselines.

    Weights calibrated to academic factor return evidence:
      - ROE (sector-relative Z-score): 20%  (Fama-French 2015 RMW profitability factor)
      - ROCE (sector-relative Z-score):15%  (capital efficiency, quality signal)
      - Valuation (PEG / P/E Z-score): 20%  (Fama-French 1993 value factor)
      - Debt/Equity (sector-relative):  15%  (financial distress, Fama-French 1996)
      - Growth quality:                15%  (earnings momentum anchor)
      - Sharpe ratio:                  10%  (risk-adjusted performance quality)
      - Dividend yield:                 5%  (D/P value signal, Fama-French 1988)
    """
    sec_pe       = _safe_float(sector_medians.get("pe"))       if sector_medians else np.nan
    sec_pe_mean  = _safe_float(sector_medians.get("pe_mean"))  if sector_medians else np.nan
    sec_pe_std   = _safe_float(sector_medians.get("pe_std"))   if sector_medians else np.nan

    sec_roe      = _safe_float(sector_medians.get("roe"))      if sector_medians else np.nan
    sec_roe_mean = _safe_float(sector_medians.get("roe_mean")) if sector_medians else np.nan
    sec_roe_std  = _safe_float(sector_medians.get("roe_std"))  if sector_medians else np.nan

    sec_roce_mean = _safe_float(sector_medians.get("roce_mean")) if sector_medians else np.nan
    sec_roce_std  = _safe_float(sector_medians.get("roce_std"))  if sector_medians else np.nan

    sec_debt     = _safe_float(sector_medians.get("debt_eq"))  if sector_medians else np.nan
    sec_debt_mean = _safe_float(sector_medians.get("debt_mean")) if sector_medians else np.nan
    sec_debt_std  = _safe_float(sector_medians.get("debt_std"))  if sector_medians else np.nan

    sub_scores  = {}
    sub_weights = {}

    # ── Growth input sanitization (convert percentage to decimal if needed) ──
    if not np.isnan(eps_growth) and abs(eps_growth) > 3.0:
        eps_growth = eps_growth / 100.0
    if not np.isnan(rev_growth) and abs(rev_growth) > 3.0:
        rev_growth = rev_growth / 100.0

    # ── ROE (Sector Z-Score Normalization) ──────────────────────────────────
    # Profitability factor (Fama & French 2015, RMW factor)
    if not np.isnan(roe_pct):
        if not np.isnan(sec_roe_mean) and not np.isnan(sec_roe_std) and sec_roe_std > 0.5:
            z_roe = (roe_pct - sec_roe_mean) / max(sec_roe_std, 2.0)
            roe_sub = 5.0 + 4.5 * np.tanh(z_roe / 1.8)
        elif not np.isnan(sec_roe) and sec_roe > 0:
            excess = roe_pct - sec_roe
            roe_sub = 10.0 / (1 + np.exp(-0.25 * excess))
        else:
            roe_sub = 10.0 / (1 + np.exp(-0.20 * (roe_pct - 15)))
        sub_scores["roe"]  = max(0.5, min(9.8, roe_sub))
        sub_weights["roe"] = 0.20

    # ── ROCE (Sector Z-Score Normalization) ─────────────────────────────────
    # Capital efficiency; Z-score centered at sector mean
    if not np.isnan(roce_pct):
        if not np.isnan(sec_roce_mean) and not np.isnan(sec_roce_std) and sec_roce_std > 0.5:
            z_roce = (roce_pct - sec_roce_mean) / max(sec_roce_std, 2.0)
            roce_sub = 5.0 + 4.5 * np.tanh(z_roce / 1.8)
        else:
            roce_sub = 10.0 / (1 + np.exp(-0.20 * (roce_pct - 15)))
        sub_scores["roce"]  = max(0.5, min(9.8, roce_sub))
        sub_weights["roce"] = 0.15

    # ── Valuation (Sector Z-Score & PEG Normalization) ───────────────────────
    # Loss-making firms (P/E <= 0) receive a penalized valuation score of 1.0
    val_sub = np.nan
    if not np.isnan(pe) and pe <= 0:
        val_sub = 1.0  # Explicit penalty for loss-making / negative earnings
    elif not np.isnan(pe) and pe > 0:
        if not np.isnan(sec_pe_mean) and not np.isnan(sec_pe_std) and sec_pe_std > 1.0:
            z_pe = (pe - sec_pe_mean) / max(sec_pe_std, 3.0)
            val_sec = 5.0 - 4.5 * np.tanh(z_pe / 1.8)
            if not np.isnan(eps_growth) and eps_growth > 0:
                peg = pe / (eps_growth * 100)
                val_peg = 10.0 / (1 + np.exp(3.5 * (peg - 1.0)))
                val_sub = 0.6 * val_sec + 0.4 * val_peg
            else:
                val_sub = val_sec
        elif not np.isnan(eps_growth) and eps_growth > 0:
            peg = pe / (eps_growth * 100)
            val_sub = 10.0 / (1 + np.exp(3.5 * (peg - 1.0)))
        elif not np.isnan(sec_pe) and sec_pe > 0:
            pe_ratio = pe / sec_pe
            val_sub = 10.0 / (1 + np.exp(4.0 * (pe_ratio - 1.0)))
        else:
            # Absolute fallback: centered at P/E=25
            val_sub = 10.0 / (1 + np.exp(0.10 * (pe - 25)))

    if not np.isnan(val_sub):
        sub_scores["val"]  = max(0.5, min(9.8, val_sub))
        sub_weights["val"] = 0.20

    # ── Debt / Equity (Sector Z-Score Normalization) ─────────────────────────
    # Financial distress factor (Fama & French 1996)
    if not np.isnan(debt_eq):
        if not np.isnan(sec_debt_mean) and not np.isnan(sec_debt_std) and sec_debt_std > 0.1:
            z_debt = (debt_eq - sec_debt_mean) / max(sec_debt_std, 0.2)
            de_sub = 5.0 - 4.5 * np.tanh(z_debt / 1.8)
        elif not np.isnan(sec_debt) and sec_debt > 0:
            de_ratio = debt_eq / sec_debt
            de_sub = 10.0 / (1 + np.exp(2.5 * (de_ratio - 1.0)))
        else:
            de_sub = 10.0 / (1 + np.exp(0.04 * (debt_eq - 50)))
        sub_scores["de"]  = max(0.5, min(9.8, de_sub))
        sub_weights["de"] = 0.15

    # ── Growth quality ────────────────────────────────────────────────────────
    # Rewards consistent EPS + revenue growth; sigmoid centered at 10% growth
    if not np.isnan(eps_growth) and not np.isnan(rev_growth):
        growth_composite = 0.6 * eps_growth + 0.4 * rev_growth
        growth_sub = 10.0 / (1 + np.exp(-12.0 * (growth_composite - 0.10)))
        sub_scores["growth"]  = growth_sub
        sub_weights["growth"] = 0.15
    elif not np.isnan(eps_growth):
        growth_sub = 10.0 / (1 + np.exp(-12.0 * (eps_growth - 0.10)))
        sub_scores["growth"]  = growth_sub
        sub_weights["growth"] = 0.10  # reduced confidence: single signal
    elif not np.isnan(rev_growth):
        growth_sub = 10.0 / (1 + np.exp(-12.0 * (rev_growth - 0.10)))
        sub_scores["growth"]  = growth_sub
        sub_weights["growth"] = 0.08

    # ── Sharpe ratio ──────────────────────────────────────────────────────────
    # Risk-adjusted performance; sigmoid centered at Sharpe=1.0
    if not np.isnan(sharpe):
        sharpe_sub = 10.0 / (1 + np.exp(-2.5 * (sharpe - 1.0)))
        sub_scores["sharpe"]  = sharpe_sub
        sub_weights["sharpe"] = 0.10

    # ── Dividend yield ────────────────────────────────────────────────────────
    # D/P value signal (Fama & French 1988) — small weight
    if not np.isnan(div_yield_pct) and div_yield_pct > 0:
        div_sub = 10.0 / (1 + np.exp(-1.5 * (div_yield_pct - 1.5)))
        sub_scores["div"]  = div_sub
        sub_weights["div"] = 0.05

    if not sub_scores:
        return 5.0

    # ── Weighted average (naturally 0–10, no hard cap required) ───────────────
    total_w = sum(sub_weights[k] for k in sub_scores)
    raw = sum(sub_scores[k] * sub_weights[k] for k in sub_scores) / total_w

    # ── Promoter pledging: smooth multiplicative penalty ──────────────────────
    # High pledging = financial stress; penalty starts at 5%, severe above 30%
    # pledging=5% → ×1.00, pledging=20% → ×0.63, pledging=40% → ×0.13
    if not np.isnan(promoter_pledging) and promoter_pledging > 5:
        pledge_penalty = max(0.10, np.exp(-0.08 * (promoter_pledging - 5)))
        raw *= pledge_penalty

    # ── Promoter holding: small continuous alignment bonus ────────────────────
    # High un-pledged insider holding = management alignment signal
    if not np.isnan(promoter_holding) and promoter_holding > 25:
        holding_bonus = min(0.5, 0.01 * (promoter_holding - 25))
        raw = min(10.0, raw + holding_bonus)

    return max(0.0, min(10.0, float(raw)))


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
        sig_rsi = 1 if 35 <= rsi <= 80 else (-1 if rsi < 35 or rsi > 80 else 0)
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

    adx      = _safe_float(latest["ADX"])
    plus_di  = _safe_float(latest["Plus_DI"])
    minus_di = _safe_float(latest["Minus_DI"])
    sig_adx  = (
        1  if adx > 25 and plus_di  > minus_di else
        -1 if adx > 25 and minus_di > plus_di  else 0
    )

    bb_b     = _safe_float(latest["BB_%B"])
    if bullish_regime and adx > 25 and plus_di > minus_di:
        # Strong upward trend breakout (band walking) - do not penalize high %B
        sig_bb = 1 if bb_b > 0.95 else (1 if bb_b < 0.05 else 0)
    else:
        # Range-bound / mean-reverting regime
        sig_bb = 1 if bb_b < 0.05 else (-1 if bb_b > 0.95 else 0)

    cci      = _safe_float(latest["CCI"])
    sig_cci  = 1 if cci < -100 else (-1 if cci > 100 else 0)

    price_up  = close > _safe_float(prev["Close"])
    vol_above = _safe_float(latest["Volume"]) > _safe_float(latest["VOL_MA20"])
    sig_vol   = 1 if (price_up and vol_above) else (-1 if (not price_up and vol_above) else 0)

    vpt = _safe_float(latest.get("VPT", np.nan))
    vpt_ema = _safe_float(latest.get("VPT_EMA20", np.nan))
    sig_vpt = 1 if vpt > vpt_ema else (-1 if vpt < vpt_ema else 0)

    span_a = _safe_float(latest.get("Ichimoku_SpanA", np.nan))
    span_b = _safe_float(latest.get("Ichimoku_SpanB", np.nan))
    sig_ichimoku = 1 if (close > span_a and close > span_b) else (-1 if (close < span_a and close < span_b) else 0)

    sig_52w_high = 0
    if not np.isnan(fifty_two_high) and fifty_two_high > 0:
        sig_52w_high = 1 if (close / fifty_two_high) >= 0.95 else 0

    # De-correlated Technical Core (VIF < 5.0): Trend, Momentum, Volume, Volatility
    weighted_signals = [
        # Trend Core
        (sig_supertrend, 2.5),
        (sig_price_sma200, 1.5),
        (sig_adx, 1.5),
        # Momentum & Relative Breakout Core
        (sig_rsi, 2.0),
        (sig_52w_high, 1.5),
        # Volume Flow Core
        (sig_vpt, 1.5),
        (sig_vol, 1.0),
        # Volatility Compression & Dynamic Reversion Core
        (sig_macd_hist, 1.0),
        (sig_bb, 0.5),
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
        except (ZeroDivisionError, IndexError, TypeError):
            pass

    if nifty_df is not None and len(df) >= 63 and len(nifty_df) >= 63:
        try:
            stock_3m = (_safe_float(df["Close"].iloc[-1]) / _safe_float(df["Close"].iloc[-63])) - 1
            nifty_3m = (_safe_float(nifty_df["Close"].iloc[-1]) / _safe_float(nifty_df["Close"].iloc[-63])) - 1
            rs_3m = stock_3m - nifty_3m
        except (ZeroDivisionError, IndexError, TypeError):
            pass

    if nifty_df is not None and len(df) >= 126 and len(nifty_df) >= 126:
        try:
            stock_6m = (_safe_float(df["Close"].iloc[-1]) / _safe_float(df["Close"].iloc[-126])) - 1
            nifty_6m = (_safe_float(nifty_df["Close"].iloc[-1]) / _safe_float(nifty_df["Close"].iloc[-126])) - 1
            rs_6m = stock_6m - nifty_6m
        except (ZeroDivisionError, IndexError, TypeError):
            pass

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

def check_forensic_red_flags(info: dict, df: pd.DataFrame = None, latest_metrics: dict = None) -> list:
    """
    Forensic Accounting & Circuit Breaker Disqualifier Checks.
    
    Detects severe capital distress, governance red flags, or extreme blow-off
    overextensions that invalidate normal quantitative factor ranking.
    """
    flags = []
    
    # 1. High Promoter Pledging
    pledging = _safe_float(info.get("promoter_pledging"), default=np.nan)
    if not np.isnan(pledging) and pledging > 20.0:
        flags.append(f"High Promoter Pledging ({pledging:.1f}%)")

    # 2. Extreme Debt Leverage (D/E > 2.5 or D/E > 1.5 with negative ROE)
    debt_eq = _safe_float(info.get("debtToEquity"), default=np.nan)
    roe = _safe_float(info.get("returnOnEquity"), default=np.nan)
    if not np.isnan(debt_eq) and debt_eq > 250.0:
        flags.append(f"Extreme Leverage (D/E: {debt_eq/100.0:.1f}x)")
    elif not np.isnan(debt_eq) and debt_eq > 150.0 and not np.isnan(roe) and roe < 0:
        flags.append(f"High Debt with Negative ROE (D/E: {debt_eq/100.0:.1f}x)")

    # 3. Severe Loss-Making / Deep Operating Insolvency
    if not np.isnan(roe) and roe < -15.0:
        flags.append(f"Severe Negative Return on Equity ({roe:.1f}%)")

    # 4. Blow-off Top Overextension (Z-Score > 2.5 & RSI > 80)
    if latest_metrics:
        z_score = _safe_float(latest_metrics.get("z_score_60"), default=0)
        rsi = _safe_float(latest_metrics.get("RSI"), default=50)
        if z_score > 2.5 and rsi > 80:
            flags.append(f"Blow-Off Overextension (Z={z_score:.1f}, RSI={rsi:.0f})")

    # 5. Severe Drawdown Breakdown from 52W High (> 55% drawdown with bearish supertrend)
    if df is not None and len(df) >= 50:
        try:
            close = _safe_float(df["Close"].iloc[-1])
            high52 = _safe_float(df["High"].iloc[-252:].max()) if len(df) >= 252 else _safe_float(df["High"].max())
            st_sig = latest_metrics.get("sig_supertrend", 0) if latest_metrics else 0
            if high52 > 0 and (close / high52) < 0.45 and st_sig == -1:
                dd_pct = ((high52 - close) / high52) * 100
                flags.append(f"Severe Downtrend Breakdown (-{dd_pct:.0f}% from 52W High)")
        except Exception:
            pass

    return flags


def generate_atr_trade_plan(price: float, atr: float, highest_22d: float = np.nan) -> dict:
    """
    Computes stock-specific ATR volatility execution plan (Stop-Loss, Targets, Chandelier Exit).
    
    Academic literature (Wilder 1978, LeBeau 1999):
      - Stop-Loss: Entry - 2.0 * ATR(14)
      - Target 1 (1:1.25 Risk/Reward Partial Exit): Entry + 2.5 * ATR(14)
      - Target 2 (1:2.25 Risk/Reward Runner): Entry + 4.5 * ATR(14)
      - Chandelier Trailing Exit: Highest(22) - 3.0 * ATR(14)
    """
    if np.isnan(price) or price <= 0 or np.isnan(atr) or atr <= 0:
        return {
            "atr_stop": np.nan,
            "atr_target1": np.nan,
            "atr_target2": np.nan,
            "atr_chandelier": np.nan,
            "atr_risk_pct": np.nan,
        }
    
    stop_loss = max(0.01, round(price - (2.0 * atr), 2))
    target1   = round(price + (2.5 * atr), 2)
    target2   = round(price + (4.5 * atr), 2)
    h22 = highest_22d if (not np.isnan(highest_22d) and highest_22d > price) else price
    chandelier = max(0.01, round(h22 - (3.0 * atr), 2))
    risk_pct = round(((price - stop_loss) / price) * 100, 2)
    
    return {
        "atr_stop": stop_loss,
        "atr_target1": target1,
        "atr_target2": target2,
        "atr_chandelier": chandelier,
        "atr_risk_pct": risk_pct,
    }


def get_conviction_rating(
    percentile: float,
    regime_score: int,
    weekly_bullish: bool,
    norm_tech: float = None,
    fund_score: float = None,
    research_composite: float = None,
    red_flags: list = None,
) -> str:
    """
    Map composite percentile across universe -> qualitative conviction label.

    Pillar agreement gate (data-driven):
      Prevents Strong Buy / Buy when one pillar is severely lagging.
      If any pillar (norm_tech, fund_score, research_composite) < PILLAR_FLOOR:
        Strong Buy → Buy
        Buy        → Hold

    Forensic Circuit Breaker:
      If red flags exist (high pledging, severe leverage distress),
      hard cap rating at 'Caution' or 'Avoid'.
    """
    PILLAR_FLOOR = 3.5  # 0-10 scale; below this = one pillar severely weak

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

    # Market regime adjustment
    if regime_score <= -2:
        if rating == "Strong Buy":  rating = "Buy"
        elif rating == "Buy":       rating = "Hold"
        elif rating == "Hold":      rating = "Caution"
        elif rating == "Caution":   rating = "Avoid"
    elif regime_score == -1:
        if rating == "Strong Buy":  rating = "Buy"

    # ── Pillar Agreement Gate ─────────────────────────────────────────────────
    if rating in ("Strong Buy", "Buy"):
        pillar_scores = [
            x for x in [norm_tech, fund_score, research_composite]
            if x is not None and not np.isnan(x)
        ]
        if pillar_scores and min(pillar_scores) < PILLAR_FLOOR:
            rating = "Buy" if rating == "Strong Buy" else "Hold"

    # ── Forensic Red-Flag Circuit Breaker ─────────────────────────────────────
    if red_flags and len(red_flags) > 0:
        if len(red_flags) >= 2:
            rating = "Avoid"
        elif rating in ("Strong Buy", "Buy", "Hold"):
            rating = "Caution"

    return rating
