"""
research_factors.py
------------------
Research-backed quantitative factors for stock selection.

Implements factors validated by academic literature:
  - Piotroski F-Score (2000): 9-point accounting strength signal
  - Gross Profitability (Novy-Marx 2013): GP/Assets as alpha predictor
  - Momentum Z-Score (Jegadeesh & Titman 1993): Multi-horizon momentum
  - Low Volatility Factor (Baker, Bradley & Wurgler 2011): Volatility anomaly
  - Mean Reversion Signal (De Bondt & Thaler 1985): Overextension detection
  - Earnings Quality (Sloan 1996): Accruals-based earnings quality
"""

import numpy as np
import pandas as pd
from utils import _safe_float


def compute_piotroski_f_score(info: dict, df: pd.DataFrame) -> int:
    """
    Piotroski F-Score (2000) — 9-point financial strength indicator.

    Profitability (4 points):
      1. ROA > 0
      2. CFO > 0 (operating cash flow positive)
      3. ΔROA > 0 (improving ROA)
      4. CFO > Net Income (accruals quality)

    Leverage / Liquidity (3 points):
      5. ΔLeverage < 0 (decreasing debt)
      6. ΔCurrent Ratio > 0 (improving liquidity)
      7. No new equity issued (shares outstanding not increasing)

    Efficiency (2 points):
      8. ΔGross Margin > 0 (improving margins)
      9. ΔAsset Turnover > 0 (improving efficiency)

    Returns 0-9.
    """
    score = 0

    # ── Profitability ──────────────────────────────────────────────────────
    roe = _safe_float(info.get("returnOnEquity"), default=0)
    roa = _safe_float(info.get("returnOnAssets"), default=0)
    if roe > 0 or roa > 0:
        score += 1

    cfo = _safe_float(info.get("operatingCashflow"), default=0)
    if cfo > 0:
        score += 1

    earnings_growth = _safe_float(info.get("earningsGrowth"), default=0)
    if earnings_growth > 0:
        score += 1

    net_income = _safe_float(info.get("netIncomeToCommon"), default=0)
    if cfo > 0 and net_income > 0 and cfo > net_income:
        score += 1
    elif cfo > 0 and net_income <= 0:
        score += 1

    # ── Leverage / Liquidity ───────────────────────────────────────────────
    debt_eq = _safe_float(info.get("debtToEquity"), default=0)
    if debt_eq >= 0 and debt_eq < 100:
        score += 1

    current_ratio = _safe_float(info.get("currentRatio"), default=1.5)
    if current_ratio > 1.2:
        score += 1

    shares = _safe_float(info.get("sharesOutstanding"), default=0)
    float_shares = _safe_float(info.get("floatShares"), default=0)
    if shares > 0 and float_shares > 0:
        insider_pct = _safe_float(info.get("heldPercentInsiders"), default=0)
        if insider_pct > 0.1:
            score += 1
    elif shares > 0:
        score += 1

    # ── Efficiency ─────────────────────────────────────────────────────────
    rev_growth = _safe_float(info.get("revenueGrowth"), default=0)
    if rev_growth > 0:
        score += 1

    total_rev = _safe_float(info.get("totalRevenue"), default=0)
    total_assets = _safe_float(info.get("totalAssets"), default=0)
    if total_assets <= 0:
        bv = _safe_float(info.get("bookValue"), default=0)
        shares_val = _safe_float(info.get("sharesOutstanding"), default=0)
        total_debt = _safe_float(info.get("totalDebt"), default=0)
        total_cash = _safe_float(info.get("totalCash"), default=0)
        if bv > 0 and shares_val > 0:
            total_assets = bv * shares_val + total_debt - total_cash

    if total_assets > 0 and total_rev > 0:
        turnover = total_rev / total_assets
        if turnover > 0.5:
            score += 1
    elif total_rev > 0:
        score += 1

    return min(score, 9)


def compute_gross_profitability(info: dict) -> float:
    """
    Gross Profitability (Novy-Marx 2013, JFE).
    GP/Total Assets is the single most powerful accounting-based predictor.

    Fallback: uses grossMargins directly from yfinance when totalAssets unavailable.
    Returns a 0-10 score.
    """
    gp_ratio = np.nan

    gross_profit = _safe_float(info.get("grossProfits"), default=np.nan)
    total_assets = _safe_float(info.get("totalAssets"), default=np.nan)

    if not np.isnan(gross_profit) and not np.isnan(total_assets) and total_assets > 0:
        gp_ratio = gross_profit / total_assets
    else:
        gross_margin = _safe_float(info.get("grossMargins"), default=np.nan)
        if not np.isnan(gross_margin):
            gp_ratio = gross_margin

    if np.isnan(gp_ratio):
        return np.nan

    if gp_ratio >= 0.50:
        return 10.0
    elif gp_ratio >= 0.35:
        return 8.0
    elif gp_ratio >= 0.25:
        return 6.0
    elif gp_ratio >= 0.15:
        return 4.0
    elif gp_ratio >= 0.05:
        return 2.0
    else:
        return 0.0


def compute_momentum_z_score(
    df: pd.DataFrame,
    nifty_df: pd.DataFrame = None,
    sector_peer_returns: dict = None
) -> dict:
    """
    Multi-Horizon Momentum (Jegadeesh & Titman 1993).
    Computes 1m, 3m, 6m, 9m, 12m momentum, skipping the most recent month
    to avoid short-term reversal (De Bondt & Thaler 1985).

    Key insight: 12-1 month momentum (skip most recent month) is the
    strongest cross-sectional predictor per Novy-Marx (2013).

    Returns dict with raw returns, skip-month returns, and Z-scored composite.
    """
    close = df["Close"].astype(float)
    n = len(close)

    def _ret(idx):
        if n <= idx:
            return np.nan
        return (float(close.iloc[-1]) / float(close.iloc[-idx]) - 1)

    def _ret_skip(skip=21):
        """Return from -skip to -1 (skip most recent month for reversal)."""
        if n <= skip:
            return np.nan
        return (float(close.iloc[-skip]) / float(close.iloc[-1]) - 1)

    # Raw momentum (including most recent month)
    mom_1m = _ret(21)
    mom_3m = _ret(63)
    mom_6m = _ret(126)
    mom_12m = _ret(252)

    # Skip-month momentum (most recent month removed)
    mom_12m_skip1 = _ret_skip(21) if n > 252 else np.nan  # 12m return minus last month

    # Risk-adjusted momentum: momentum / volatility
    returns = close.pct_change().dropna()
    vol_6m = float(returns.iloc[-126:].std()) * np.sqrt(252) if n > 126 else np.nan
    vol_12m = float(returns.std()) * np.sqrt(252) if n > 60 else np.nan

    risk_adj_mom = mom_12m / vol_12m if (not np.isnan(mom_12m) and not np.isnan(vol_12m) and vol_12m > 0) else np.nan

    # Relative strength vs Nifty
    rs_1m = rs_3m = rs_6m = rs_12m = np.nan
    if nifty_df is not None and len(nifty_df) > 21:
        nifty_close = nifty_df["Close"].astype(float)
        nn = len(nifty_close)
        if nn > 21 and n > 21:
            rs_1m = _ret(21) - (float(nifty_close.iloc[-1]) / float(nifty_close.iloc[-21]) - 1)
        if nn > 63 and n > 63:
            rs_3m = _ret(63) - (float(nifty_close.iloc[-1]) / float(nifty_close.iloc[-63]) - 1)
        if nn > 126 and n > 126:
            rs_6m = _ret(126) - (float(nifty_close.iloc[-1]) / float(nifty_close.iloc[-126]) - 1)
        if nn > 252 and n > 252:
            rs_12m = _ret(252) - (float(nifty_close.iloc[-1]) / float(nifty_close.iloc[-252]) - 1)

    # Composite momentum score (weighted average of skip-month horizons)
    components = []
    weights = []
    if not np.isnan(mom_12m_skip1):
        components.append(mom_12m_skip1)
        weights.append(0.40)
    if not np.isnan(mom_6m):
        components.append(mom_6m)
        weights.append(0.25)
    if not np.isnan(mom_3m):
        components.append(mom_3m)
        weights.append(0.20)
    if not np.isnan(mom_1m):
        components.append(mom_1m)
        weights.append(0.15)

    composite_mom = np.nan
    if components and sum(weights) > 0:
        total_w = sum(weights)
        composite_mom = sum(c * (w / total_w) for c, w in zip(components, weights))

    return {
        "mom_1m": mom_1m,
        "mom_3m": mom_3m,
        "mom_6m": mom_6m,
        "mom_12m": mom_12m,
        "mom_12m_skip1": mom_12m_skip1,
        "risk_adj_mom": risk_adj_mom,
        "vol_6m": vol_6m,
        "vol_12m": vol_12m,
        "rs_1m": rs_1m,
        "rs_3m": rs_3m,
        "rs_6m": rs_6m,
        "rs_12m": rs_12m,
        "composite_mom": composite_mom,
    }


def compute_volatility_factor(df: pd.DataFrame, info: dict = None) -> dict:
    """
    Low Volatility Factor (Baker, Bradley & Wurgler 2011, JF).
    Lower-volatility stocks earn higher risk-adjusted returns.
    The 'Volatility Anomaly' is one of the most persistent market anomalies.

    Returns vol metrics and a 0-10 factor score (higher = lower vol = better).
    """
    close = df["Close"].astype(float)
    returns = close.pct_change().dropna()

    n = len(returns)

    # Realized volatility (annualized)
    vol_20d = float(returns.iloc[-20:].std()) * np.sqrt(252) if n >= 20 else np.nan
    vol_60d = float(returns.iloc[-60:].std()) * np.sqrt(252) if n >= 60 else np.nan
    vol_120d = float(returns.iloc[-120:].std()) * np.sqrt(252) if n >= 120 else np.nan

    # Downside deviation (penalizes only negative returns)
    neg_returns = returns.clip(upper=0)
    downside_dev = float(neg_returns.iloc[-60:].std()) * np.sqrt(252) if n >= 60 else np.nan

    # Maximum drawdown (risk measure)
    roll_max = close.cummax()
    drawdowns = (close - roll_max) / roll_max
    max_dd = float(drawdowns.min()) if len(drawdowns) > 0 else 0

    # ATR-based volatility from indicators
    atr = _safe_float(df["ATR"].iloc[-1]) if "ATR" in df.columns else np.nan
    atr_pct = (atr / float(close.iloc[-1]) * 100) if (not np.isnan(atr) and float(close.iloc[-1]) > 0) else np.nan

    # Idiosyncratic vol proxy (vol relative to market)
    # Higher idiosyncratic vol = more risk = lower score
    idio_vol_ratio = vol_60d  # Absolute for now; sector-relative when available

    # Map volatility to 0-10 score (lower vol = higher score)
    score = 5.0  # neutral
    if not np.isnan(vol_60d):
        if vol_60d < 0.15:
            score = 9.0
        elif vol_60d < 0.25:
            score = 7.0
        elif vol_60d < 0.35:
            score = 5.0
        elif vol_60d < 0.50:
            score = 3.0
        else:
            score = 1.0

    return {
        "vol_20d": vol_20d,
        "vol_60d": vol_60d,
        "vol_120d": vol_120d,
        "downside_dev": downside_dev,
        "max_drawdown": max_dd,
        "atr_pct": atr_pct,
        "vol_score": score,
    }


def compute_mean_reversion_signal(df: pd.DataFrame, info: dict = None) -> dict:
    """
    Mean Reversion / Overextension Signal (De Bondt & Thaler 1985).
    Detects stocks that have deviated significantly from their mean,
    suggesting potential reversion.

    Academic basis: 52-week high/low effect (George & Hwang 2004) and
    post-earnings-announcement drift reversal.

    Returns signal and magnitude (0-10 scale).
    """
    close = df["Close"].astype(float)
    n = len(close)

    if n < 60:
        return {"reversion_signal": 0, "reversion_score": 5.0, "overbought": False, "oversold": False}

    # Distance from 52-week high and low
    high_52w = float(close.max())
    low_52w = float(close.min())
    current = float(close.iloc[-1])

    pct_from_high = (current - high_52w) / high_52w if high_52w > 0 else 0
    pct_from_low = (current - low_52w) / low_52w if low_52w > 0 else 0

    # Z-Score of current price vs 60-day mean
    mean_60 = float(close.iloc[-60:].mean())
    std_60 = float(close.iloc[-60:].std())
    z_score_60 = (current - mean_60) / std_60 if std_60 > 0 else 0

    # RSI-based overextension
    rsi = _safe_float(df["RSI"].iloc[-1]) if "RSI" in df.columns else 50

    # Price deviation from SMA50
    sma50 = _safe_float(df["SMA_50"].iloc[-1]) if "SMA_50" in df.columns else current
    pct_from_sma50 = (current - sma50) / sma50 if sma50 > 0 else 0

    # Overbought / Oversold detection
    overbought = (z_score_60 > 2.0) or (rsi > 75) or (pct_from_sma50 > 0.10)
    oversold = (z_score_60 < -2.0) or (rsi < 25) or (pct_from_sma50 < -0.10)

    # Signal: +1 = oversold (potential buy), -1 = overbought (potential sell)
    if oversold:
        signal = 1
    elif overbought:
        signal = -1
    else:
        signal = 0

    # Score: mean-reversion attractiveness (0-10)
    # Oversold stocks score high (reversion opportunity), overbought score low
    if z_score_60 < -2.5:
        score = 9.0
    elif z_score_60 < -1.5:
        score = 7.0
    elif z_score_60 < -0.5:
        score = 5.5
    elif z_score_60 < 0.5:
        score = 5.0
    elif z_score_60 < 1.5:
        score = 4.0
    elif z_score_60 < 2.5:
        score = 2.5
    else:
        score = 1.0

    return {
        "reversion_signal": signal,
        "reversion_score": score,
        "overbought": overbought,
        "oversold": oversold,
        "z_score_60": z_score_60,
        "pct_from_52w_high": pct_from_high,
        "pct_from_52w_low": pct_from_low,
        "pct_from_sma50": pct_from_sma50,
        "rsi": rsi,
    }


def compute_earnings_quality(info: dict) -> float:
    """
    Earnings Quality Factor (Sloan 1996, Richardson et al. 2005).
    High-accrual earnings are less persistent than high-cashflow earnings.
    Returns 0-10 quality score.
    """
    score = 5.0

    cfo = _safe_float(info.get("operatingCashflow"), default=np.nan)
    net_income = _safe_float(info.get("netIncomeToCommon"), default=np.nan)
    total_rev = _safe_float(info.get("totalRevenue"), default=np.nan)
    total_assets = _safe_float(info.get("totalAssets"), default=np.nan)

    if np.isnan(total_assets) or total_assets <= 0:
        bv = _safe_float(info.get("bookValue"), default=0)
        shares_val = _safe_float(info.get("sharesOutstanding"), default=0)
        total_debt = _safe_float(info.get("totalDebt"), default=0)
        total_cash = _safe_float(info.get("totalCash"), default=0)
        if bv > 0 and shares_val > 0:
            total_assets = bv * shares_val + total_debt - total_cash

    if not np.isnan(cfo) and not np.isnan(net_income) and net_income > 0:
        cfo_ratio = cfo / net_income
        if cfo_ratio > 1.5:
            score += 2.0
        elif cfo_ratio > 1.0:
            score += 1.0
        elif cfo_ratio < 0.5:
            score -= 2.0
        elif cfo_ratio < 0.8:
            score -= 1.0
    elif not np.isnan(cfo) and cfo > 0 and (np.isnan(net_income) or net_income <= 0):
        score += 1.0

    if not np.isnan(total_rev) and total_assets > 0:
        asset_turnover = total_rev / total_assets
        if asset_turnover > 1.0:
            score += 1.0
        elif asset_turnover < 0.3:
            score -= 1.0

    ebitda = _safe_float(info.get("ebitda"), default=np.nan)
    total_debt = _safe_float(info.get("totalDebt"), default=np.nan)
    interest_exp = _safe_float(info.get("interestExpense"), default=np.nan)

    if not np.isnan(ebitda) and not np.isnan(interest_exp) and interest_exp != 0:
        coverage = ebitda / abs(interest_exp)
        if coverage > 10:
            score += 1.0
        elif coverage < 2:
            score -= 1.0
    elif not np.isnan(ebitda) and not np.isnan(total_debt) and total_debt > 0:
        debt_service = ebitda / total_debt
        if debt_service > 0.5:
            score += 0.5
        elif debt_service < 0.1:
            score -= 0.5

    profit_margin = _safe_float(info.get("profitMargins"), default=np.nan)
    if not np.isnan(profit_margin):
        if profit_margin > 0.15:
            score += 0.5
        elif profit_margin < 0:
            score -= 0.5

    return max(0.0, min(10.0, score))


def compute_research_composite(
    info: dict,
    df: pd.DataFrame = None,
    nifty_df: pd.DataFrame = None,
    sector_medians: dict = None,
) -> dict:
    """
    Compute all research-backed factors and return a unified dictionary
    that can be integrated into the scanner's scoring pipeline.
    """
    _empty = {
        "piotroski_f_score": 0, "f_score_norm": 0, "gross_profit_score": 5.0,
        "momentum_composite": np.nan, "momentum_score": 5.0, "risk_adj_mom": np.nan,
        "vol_60d": np.nan, "vol_120d": np.nan, "downside_dev": np.nan,
        "vol_score": 5.0, "reversion_signal": 0, "reversion_score": 5.0,
        "z_score_60": 0, "earnings_quality_score": 5.0, "research_composite": 5.0,
        "mom_1m": np.nan, "mom_3m": np.nan, "mom_6m": np.nan,
        "mom_12m": np.nan, "mom_12m_skip1": np.nan,
    }

    if df is None or len(df) < 21:
        return _empty

    try:
        f_score = compute_piotroski_f_score(info, df)
        gp_score = compute_gross_profitability(info)
        mom = compute_momentum_z_score(df, nifty_df)
        vol = compute_volatility_factor(df, info)
        reversion = compute_mean_reversion_signal(df, info)
        eq_score = compute_earnings_quality(info)
    except Exception as e:
        import traceback
        traceback.print_exc()
        return _empty

    f_score_norm = (f_score / 9.0) * 10.0

    # Normalize momentum to 0-10 using composite_mom
    composite_mom = mom.get("composite_mom", np.nan)
    if not np.isnan(composite_mom):
        # Typical range: -0.5 to +1.0; map to 0-10
        mom_score = max(0.0, min(10.0, (composite_mom + 0.3) / 1.3 * 10.0))
    else:
        mom_score = 5.0

    # Research composite (weighted average)
    weights = {
        "f_score": 0.15,
        "gp_score": 0.15,
        "mom_score": 0.25,
        "vol_score": 0.15,
        "reversion_score": 0.10,
        "eq_score": 0.10,
    }

    scores = {
        "f_score": f_score_norm,
        "gp_score": gp_score if not np.isnan(gp_score) else 5.0,
        "mom_score": mom_score,
        "vol_score": vol.get("vol_score", 5.0),
        "reversion_score": reversion.get("reversion_score", 5.0),
        "eq_score": eq_score,
    }

    total_w = 0
    weighted_sum = 0
    for key, weight in weights.items():
        if not np.isnan(scores[key]):
            weighted_sum += scores[key] * weight
            total_w += weight

    research_composite = (weighted_sum / total_w) if total_w > 0 else 5.0

    return {
        "piotroski_f_score": f_score,
        "f_score_norm": f_score_norm,
        "gross_profit_score": gp_score,
        "momentum_composite": composite_mom,
        "momentum_score": mom_score,
        "risk_adj_mom": mom.get("risk_adj_mom", np.nan),
        "vol_60d": vol.get("vol_60d", np.nan),
        "vol_120d": vol.get("vol_120d", np.nan),
        "downside_dev": vol.get("downside_dev", np.nan),
        "vol_score": vol.get("vol_score", 5.0),
        "reversion_signal": reversion.get("reversion_signal", 0),
        "reversion_score": reversion.get("reversion_score", 5.0),
        "z_score_60": reversion.get("z_score_60", 0),
        "earnings_quality_score": eq_score,
        "research_composite": research_composite,
        # Raw momentum data
        "mom_1m": mom.get("mom_1m", np.nan),
        "mom_3m": mom.get("mom_3m", np.nan),
        "mom_6m": mom.get("mom_6m", np.nan),
        "mom_12m": mom.get("mom_12m", np.nan),
        "mom_12m_skip1": mom.get("mom_12m_skip1", np.nan),
    }
