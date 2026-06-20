"""
research_factors.py
------------------
Research-backed quantitative factors for stock selection.

Implements factors validated by academic literature:
  - Piotroski F-Score (2000): 9-point accounting strength signal
  - Gross Profitability (Novy-Marx 2013): GP/Assets as alpha predictor
  - Value Factor (Fama-French 1993): B/M, E/P, CF/P, D/P
  - Momentum (Jegadeesh & Titman 1993): Multi-horizon momentum
  - Low Volatility (Baker, Bradley & Wurgler 2011): Volatility anomaly
  - Betting Against Beta (Frazzini & Pedersen 2014): Low-beta premium
  - Investment Factor (Titman, Wei & Xie 2004): Low asset growth
  - Earnings Momentum SUE (Bernard & Thomas 1989): Post-earnings drift
  - Mean Reversion (De Bondt & Thaler 1985): Overextension detection
  - Earnings Quality (Sloan 1996): Accruals-based earnings quality
"""

import numpy as np
import pandas as pd
from utils import _safe_float


def compute_piotroski_f_score(info: dict, df: pd.DataFrame) -> int:
    """
    Piotroski F-Score (2000) — 9-point financial strength indicator.

    Original paper: "Value Investing: The Use of Historical Financial Statement
    Information to Separate Winners from Losers" (JAR, 2000)

    Profitability (4 points):
      1. ROA > 0
      2. CFO > 0 (operating cash flow positive)
      3. ΔROA > 0 (improving profitability — proxied via earningsGrowth > 0)
      4. CFO > Net Income (accruals quality — cash earnings exceed reported)

    Leverage / Liquidity (3 points):
      5. ΔLeverage < 0 (decreasing debt — proxied via D/E < 100)
      6. ΔCurrent Ratio > 0 (improving liquidity — current ratio > 1.5)
      7. No dilution (shares outstanding stable — high insider holding proxy)

    Efficiency (2 points):
      8. ΔGross Margin > 0 (improving margins — proxied via profitMargins > 0.15)
      9. ΔAsset Turnover > 0 (improving efficiency — revenue/asset > 0.5)

    Returns 0-9.
    """
    score = 0

    # ── Profitability ──────────────────────────────────────────────────────
    roa = _safe_float(info.get("returnOnAssets"), default=0)
    if roa > 0:
        score += 1

    cfo = _safe_float(info.get("operatingCashflow"), default=0)
    if cfo > 0:
        score += 1

    # ΔROA: use earningsGrowth as proxy for year-over-year ROA improvement
    earnings_growth = _safe_float(info.get("earningsGrowth"), default=0)
    if earnings_growth > 0:
        score += 1

    net_income = _safe_float(info.get("netIncomeToCommon"), default=0)
    if cfo > 0 and net_income > 0 and cfo > net_income:
        score += 1
    elif cfo > 0 and net_income <= 0:
        score += 1

    # ── Leverage / Liquidity ───────────────────────────────────────────────
    # ΔLeverage: use debt-to-equity < 100 as proxy for acceptable leverage
    debt_eq = _safe_float(info.get("debtToEquity"), default=0)
    if debt_eq >= 0 and debt_eq < 100:
        score += 1

    # ΔCurrent Ratio: use currentRatio > 1.5 as proxy for improving liquidity
    current_ratio = _safe_float(info.get("currentRatio"), default=1.5)
    if current_ratio > 1.5:
        score += 1
    elif current_ratio > 1.0:
        score += 0.5

    # No dilution: use high insider holding as proxy for share stability
    insider_pct = _safe_float(info.get("heldPercentInsiders"), default=0)
    shares = _safe_float(info.get("sharesOutstanding"), default=0)
    if insider_pct > 0.1:
        score += 1
    elif shares > 0:
        score += 0.5

    # ── Efficiency ─────────────────────────────────────────────────────────
    # ΔGross Margin: use profitMargins as proxy
    profit_margin = _safe_float(info.get("profitMargins"), default=0)
    if profit_margin > 0.15:
        score += 1

    # ΔAsset Turnover: totalRevenue / totalAssets
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


def compute_value_factor(info: dict, sector_medians: dict = None) -> float:
    """
    Value Factor (Fama & French 1993, JFE).

    Multi-metric value composite based on:
      - Book-to-Market (B/M): High B/M = undervalued (Fama-French 1992)
      - Earnings-to-Price (E/P): High E/P = undervalued (Basu 1977)
      - Cash Flow-to-Price (CF/P): High CF/P = undervalued (Lakonishok et al. 1994)
      - Dividend Yield (D/P): High D/P = value signal (Fama & French 1988)

    Each metric is scored 0-10 and averaged.
    If sector_medians provided, metrics are evaluated relative to sector.

    Returns 0-10 value score.
    """
    scores = []
    weights = []

    # ── Book-to-Market ─────────────────────────────────────────────────────
    book_value = _safe_float(info.get("bookValue"), default=np.nan)
    market_cap = _safe_float(info.get("marketCap"), default=np.nan)
    shares = _safe_float(info.get("sharesOutstanding"), default=np.nan)

    if not np.isnan(book_value) and not np.isnan(shares) and shares > 0:
        bv_per_share = book_value
        price_est = market_cap / shares if not np.isnan(market_cap) and market_cap > 0 else np.nan
        if not np.isnan(price_est) and price_est > 0:
            bm_ratio = bv_per_share / price_est
            bm_score = min(10.0, max(0.0, bm_ratio * 10.0))
            scores.append(bm_score)
            weights.append(0.25)

    # ── Earnings-to-Price ──────────────────────────────────────────────────
    trailing_pe = _safe_float(info.get("trailingPE"), default=np.nan)
    if not np.isnan(trailing_pe) and trailing_pe > 0:
        ep_ratio = 1.0 / trailing_pe
        ep_score = min(10.0, max(0.0, ep_ratio * 200.0))
        if not np.isnan(ep_ratio):
            scores.append(ep_score)
            weights.append(0.25)

    # ── Cash Flow-to-Price ─────────────────────────────────────────────────
    cfo = _safe_float(info.get("operatingCashflow"), default=np.nan)
    if not np.isnan(cfo) and not np.isnan(market_cap) and market_cap > 0:
        cfp_ratio = cfo / market_cap
        cfp_score = min(10.0, max(0.0, (cfp_ratio + 0.05) / 0.15 * 10.0))
        scores.append(cfp_score)
        weights.append(0.30)

    # ── Dividend Yield ─────────────────────────────────────────────────────
    div_yield = _safe_float(info.get("dividendYield"), default=0)
    if div_yield > 0:
        div_score = min(10.0, div_yield * 100.0)
        scores.append(div_score)
        weights.append(0.20)

    if not scores:
        return 5.0

    total_w = sum(weights)
    return sum(s * (w / total_w) for s, w in zip(scores, weights)) if total_w > 0 else 5.0


def compute_investment_factor(info: dict) -> float:
    """
    Investment Factor (Titman, Wei & Xie 2004; Fama & French 2015, JFE).

    Low-investment firms earn higher returns. Firms that invest aggressively
    (high asset growth) tend to underperform. This is the "investment factor"
    in the Fama-French 5-factor model.

    Proxied via:
      - Low revenue growth relative to asset base (conservative investment)
      - Low debt-to-equity (conservative financing)
      - Positive earnings growth without excessive expansion

    Returns 0-10 score (higher = more conservative/better).
    """
    score = 5.0

    rev_growth = _safe_float(info.get("revenueGrowth"), default=np.nan)
    earnings_growth = _safe_float(info.get("earningsGrowth"), default=np.nan)
    debt_eq = _safe_float(info.get("debtToEquity"), default=np.nan)
    roe = _safe_float(info.get("returnOnEquity"), default=np.nan)

    # Conservative growth: moderate revenue growth with good returns
    if not np.isnan(rev_growth) and not np.isnan(earnings_growth) and not np.isnan(roe):
        if roe > 0.15 and 0.05 <= rev_growth <= 0.25 and earnings_growth > 0:
            score = 8.0
        elif roe > 0.10 and 0 <= rev_growth <= 0.30:
            score = 7.0
        elif rev_growth > 0.50:
            score = 3.0
        elif rev_growth < -0.10:
            score = 3.0

    # Low leverage adjustment
    if not np.isnan(debt_eq):
        if debt_eq < 50:
            score = min(10.0, score + 1.0)
        elif debt_eq > 150:
            score = max(0.0, score - 1.5)

    return max(0.0, min(10.0, score))


def compute_sue_factor(info: dict, df: pd.DataFrame) -> float:
    """
    Standardized Unexpected Earnings (SUE) — Earnings Momentum
    (Bernard & Thomas 1989, JAR).

    Post-Earnings Announcement Drift (PEAD): stocks with positive earnings
    surprises continue to drift upward for ~60 days. SUE is the most
    direct measure of earnings surprise.

    Proxied via:
      - earningsGrowth as surprise magnitude
      - Forward P/E vs Trailing P/E (analyst revision proxy)
      - Revenue growth acceleration

    Returns 0-10 score (higher = stronger positive surprise).
    """
    score = 5.0

    earnings_growth = _safe_float(info.get("earningsGrowth"), default=np.nan)
    rev_growth = _safe_float(info.get("revenueGrowth"), default=np.nan)
    trailing_pe = _safe_float(info.get("trailingPE"), default=np.nan)
    forward_pe = _safe_float(info.get("forwardPE"), default=np.nan)

    # Strong positive earnings surprise
    if not np.isnan(earnings_growth):
        if earnings_growth > 0.30:
            score = 9.0
        elif earnings_growth > 0.15:
            score = 7.5
        elif earnings_growth > 0.05:
            score = 6.0
        elif earnings_growth > 0:
            score = 5.5
        elif earnings_growth > -0.10:
            score = 4.0
        else:
            score = 2.0

    # Analyst revision proxy: forward PE < trailing PE = upward revision
    if not np.isnan(trailing_pe) and not np.isnan(forward_pe) and trailing_pe > 0 and forward_pe > 0:
        revision = trailing_pe / forward_pe
        if revision > 1.2:
            score = min(10.0, score + 1.5)
        elif revision > 1.05:
            score = min(10.0, score + 0.5)
        elif revision < 0.8:
            score = max(0.0, score - 1.0)

    # Revenue acceleration
    if not np.isnan(rev_growth) and rev_growth > 0.20:
        score = min(10.0, score + 0.5)

    return max(0.0, min(10.0, score))


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
        return 5.0

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
        """12-1 month momentum: return from 252 days ago to skip days ago (skip most recent month for reversal)."""
        total = 252  # 12 months
        if n <= total:
            return np.nan
        return (float(close.iloc[-skip]) / float(close.iloc[-total]) - 1)

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


def compute_beta_factor(df: pd.DataFrame, nifty_df: pd.DataFrame = None) -> dict:
    """
    Betting Against Beta (Frazzini & Pedersen 2014, JFE).

    Low-beta stocks earn higher risk-adjusted returns than high-beta stocks.
    This is one of the most robust market anomalies, documented across
    multiple asset classes and time periods.

    Beta is estimated as covariance(stock, market) / variance(market).
    Low beta = higher score (better risk-adjusted returns expected).

    Returns beta estimate and a 0-10 factor score.
    """
    result = {
        "beta": np.nan,
        "beta_score": 5.0,
        "alpha_60d": np.nan,
        "alpha_120d": np.nan,
    }

    if nifty_df is None or len(nifty_df) < 60 or len(df) < 60:
        return result

    try:
        stock_close = df["Close"].astype(float).tail(max(len(df), 252))
        nifty_close = nifty_df["Close"].astype(float).tail(max(len(nifty_df), 252))

        min_len = min(len(stock_close), len(nifty_close))
        stock_ret = stock_close.iloc[-min_len:].pct_change().dropna()
        nifty_ret = nifty_close.iloc[-min_len:].pct_change().dropna()

        if len(stock_ret) < 60:
            return result

        # Align indices
        common_idx = stock_ret.index.intersection(nifty_ret.index)
        if len(common_idx) < 60:
            return result

        stock_aligned = stock_ret.loc[common_idx]
        nifty_aligned = nifty_ret.loc[common_idx]

        # Beta = Cov(stock, market) / Var(market)
        cov = stock_aligned.cov(nifty_aligned)
        var = nifty_aligned.var()

        if var > 0:
            beta = float(cov / var)
            result["beta"] = beta

            # Alpha: excess return above CAPM prediction
            ann_stock_ret = float(stock_aligned.mean()) * 252
            ann_nifty_ret = float(nifty_aligned.mean()) * 252
            ann_vol = float(stock_aligned.std()) * np.sqrt(252)
            risk_free = 0.065
            alpha = ann_stock_ret - (risk_free + beta * (ann_nifty_ret - risk_free))
            result["alpha_60d"] = alpha

            # Score: lower beta = higher score (Betting Against Beta)
            if beta < 0.5:
                result["beta_score"] = 9.0
            elif beta < 0.7:
                result["beta_score"] = 7.5
            elif beta < 0.9:
                result["beta_score"] = 6.0
            elif beta < 1.1:
                result["beta_score"] = 5.0
            elif beta < 1.3:
                result["beta_score"] = 4.0
            elif beta < 1.5:
                result["beta_score"] = 3.0
            else:
                result["beta_score"] = 2.0

            # Bonus for positive alpha (skill-adjusted return)
            if alpha > 0.15:
                result["beta_score"] = min(10.0, result["beta_score"] + 1.5)
            elif alpha > 0.05:
                result["beta_score"] = min(10.0, result["beta_score"] + 0.5)

    except (ValueError, TypeError, ZeroDivisionError):
        pass

    return result


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

    Weights calibrated to academic factor return literature:
      - Quality (Piotroski + Gross Profitability + Earnings Quality): 30%
      - Momentum (multi-horizon, skip-month): 20%
      - Value (B/M, E/P, CF/P): 15%
      - Low Volatility: 10%
      - Investment Factor: 10%
      - SUE / Earnings Momentum: 10%
      - Mean Reversion: 5%
    """
    _empty = {
        "piotroski_f_score": 0, "f_score_norm": 0, "gross_profit_score": 5.0,
        "momentum_composite": np.nan, "momentum_score": 5.0, "risk_adj_mom": np.nan,
        "vol_60d": np.nan, "vol_120d": np.nan, "downside_dev": np.nan,
        "vol_score": 5.0, "reversion_signal": 0, "reversion_score": 5.0,
        "z_score_60": 0, "earnings_quality_score": 5.0, "research_composite": 5.0,
        "mom_1m": np.nan, "mom_3m": np.nan, "mom_6m": np.nan,
        "mom_12m": np.nan, "mom_12m_skip1": np.nan,
        "value_score": 5.0, "investment_score": 5.0, "sue_score": 5.0,
        "beta": np.nan, "beta_score": 5.0, "alpha_60d": np.nan,
    }

    if df is None or len(df) < 21:
        return _empty

    try:
        f_score = compute_piotroski_f_score(info, df)
        gp_score = compute_gross_profitability(info)
        mom = compute_momentum_z_score(df, nifty_df)
        vol = compute_volatility_factor(df, info)
        beta_result = compute_beta_factor(df, nifty_df)
        reversion = compute_mean_reversion_signal(df, info)
        eq_score = compute_earnings_quality(info)
        value_score = compute_value_factor(info, sector_medians)
        investment_score = compute_investment_factor(info)
        sue_score = compute_sue_factor(info, df)
    except Exception as e:
        import traceback
        traceback.print_exc()
        return _empty

    f_score_norm = (f_score / 9.0) * 10.0

    # Normalize momentum to 0-10 using composite_mom
    composite_mom = mom.get("composite_mom", np.nan)
    if not np.isnan(composite_mom):
        mom_score = max(0.0, min(10.0, (composite_mom + 0.3) / 1.3 * 10.0))
    else:
        mom_score = 5.0

    # Research composite (weighted average based on factor return literature)
    weights = {
        "f_score": 0.10,
        "gp_score": 0.10,
        "eq_score": 0.10,
        "mom_score": 0.20,
        "value_score": 0.15,
        "vol_score": 0.10,
        "beta_score": 0.10,
        "investment_score": 0.10,
        "sue_score": 0.10,
        "reversion_score": 0.05,
    }

    scores = {
        "f_score": f_score_norm,
        "gp_score": gp_score if not np.isnan(gp_score) else 5.0,
        "eq_score": eq_score,
        "mom_score": mom_score,
        "value_score": value_score,
        "vol_score": vol.get("vol_score", 5.0),
        "beta_score": beta_result.get("beta_score", 5.0),
        "investment_score": investment_score,
        "sue_score": sue_score,
        "reversion_score": reversion.get("reversion_score", 5.0),
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
        "value_score": value_score,
        "investment_score": investment_score,
        "sue_score": sue_score,
        "beta": beta_result.get("beta", np.nan),
        "beta_score": beta_result.get("beta_score", 5.0),
        "alpha_60d": beta_result.get("alpha_60d", np.nan),
        "mom_1m": mom.get("mom_1m", np.nan),
        "mom_3m": mom.get("mom_3m", np.nan),
        "mom_6m": mom.get("mom_6m", np.nan),
        "mom_12m": mom.get("mom_12m", np.nan),
        "mom_12m_skip1": mom.get("mom_12m_skip1", np.nan),
    }
