"""
scoring.py
----------
Scoring and composite calculation for the stock scanner.

Separates scoring logic from data acquisition and orchestration.
Implements horizon-specific composite scores based on academic literature:
  - Short-term: Technical + Research (momentum/mean-reversion driven)
  - Long-term: Value + Quality + Low Volatility (Fama-French factor model)
  - Balanced: Equal blend for general use

Factor weights derived from:
  - Fama & French (1993, 2015): Value and Investment factors
  - Novy-Marx (2013): Gross Profitability
  - Jegadeesh & Titman (1993): Momentum
  - Baker, Bradley & Wurgler (2011): Low Volatility
  - Frazzini & Pedersen (2014): Betting Against Beta
"""

import numpy as np
import pandas as pd

from utils import _safe_float
from recommendation import compute_fund_score, get_conviction_rating
from research_factors import compute_research_composite


def compute_rs_score(tech: dict) -> tuple[float, list]:
    """Compute relative strength composite from 1m, 3m, 6m RS components."""
    rs_score = 0.0
    rs_components = []
    if not np.isnan(tech["rs_6m"]):
        rs_components.append((tech["rs_6m"], 0.5))
    if not np.isnan(tech["rs_3m"]):
        rs_components.append((tech["rs_3m"], 0.3))
    if not np.isnan(tech["rs_1m"]):
        rs_components.append((tech["rs_1m"], 0.2))
    if rs_components:
        total_weight = sum(w for val, w in rs_components)
        rs_score = sum(val * (w / total_weight) for val, w in rs_components)
    return rs_score, rs_components


def compute_sector_medians(raw_data: dict, sector_data: dict) -> dict:
    """Compute median PE, ROE, and Debt/Equity for each sector."""
    sector_medians = {}
    for sec, metrics in sector_data.items():
        sector_medians[sec] = {
            'pe': np.median(metrics['pe']) if metrics['pe'] else np.nan,
            'roe': np.median(metrics['roe']) if metrics['roe'] else np.nan,
            'debt_eq': np.median(metrics['debt_eq']) if metrics['debt_eq'] else np.nan
        }
    return sector_medians


def compute_all_scores(rows_intermediate: list, rs_composites: list, nifty_df, sector_medians: dict, regime_score: int) -> list:
    """
    Compute tech, fundamental, research, and composite scores for all stocks.

    Composite scores (all 0-10 scale):
      - composite_score: Balanced blend (35% tech, 30% fund, 35% research)
      - composite_score_tech: Short-term oriented (50% tech, 15% fund, 35% research)
      - composite_score_fund: Long-term oriented (10% tech, 40% fund, 50% research)
      - composite_score_mom: Momentum-driven (20% tech, 10% fund, 70% research)
    """
    rs_series = pd.Series(rs_composites) if rs_composites else pd.Series(dtype=float)

    final_rows = []
    for item in rows_intermediate:
        info = item["info"]
        tech = item["tech"]
        met = item["met"]
        latest = item["latest"]
        df = item.get("df")
        is_etf = item["is_etf"]

        score = tech["score"]

        if len(rs_series) > 0:
            rs_pctile = sum(rs_series <= item["rs_composite"]) / len(rs_series) * 100
            if rs_pctile >= 75:
                score = min(score + 0.2, 1.0)
            elif rs_pctile <= 25:
                score = max(score - 0.2, -1.0)
        else:
            rs_pctile = np.nan

        fwd_pe = _safe_float(info.get("forwardPE"), item["pe"])
        div_yield_pct = round(_safe_float(info.get("dividendYield"), 0), 2)
        mkt_cap_b = round((_safe_float(info.get("marketCap"), 0)) / 1e9, 2)
        eps_growth = _safe_float(info.get("earningsGrowth"))
        rev_growth = _safe_float(info.get("revenueGrowth"))

        if is_etf:
            fund_score = 5.0
            research = _default_research()
        else:
            medians = sector_medians.get(item["sector"], {})
            fund_score = compute_fund_score(
                item["roe"], item["pe"], fwd_pe, item["debt_eq"],
                div_yield_pct, mkt_cap_b, met["Sharpe"],
                eps_growth, rev_growth,
                roce_pct=_safe_float(info.get("roce")),
                promoter_holding=_safe_float(info.get("promoter_holding")),
                promoter_pledging=_safe_float(info.get("promoter_pledging")),
                sector_medians=medians
            )
            research = compute_research_composite(info, df, nifty_df, sector_medians.get(item["sector"]))

        norm_tech = (score + 1) * 5
        sentiment = _safe_float(info.get("news_sentiment"))
        z_score = _safe_float(research.get("z_score_60", 0), default=0)
        reversion_sig = research.get("reversion_signal", 0)
        overbought = z_score > 1.5 or reversion_sig == -1
        if sentiment > 0.15:
            boost = 1.0
            if overbought:
                boost = 0.3
            norm_tech = min(10.0, norm_tech + boost)
        elif sentiment < -0.15:
            norm_tech = max(0.0, norm_tech - 1.0)

        research_composite = research["research_composite"]

        # Store raw scores for cross-sectional ranking (composites computed after ranking)
        item["norm_tech"] = norm_tech
        item["fund_score"] = fund_score
        item["final_tech"] = score
        item["rs_pctile"] = rs_pctile
        item["research"] = research

        final_rows.append(item)

    # ── Cross-Sectional Percentile Ranking ──────────────────────────────────
    # Percentile ranking maps raw scores to their relative position in the
    # universe. Combined with absolute quality gates to prevent recommending
    # overvalued/overbought stocks even if they rank well relative to peers.
    #
    # Linear interpolation across anchor points for smooth differentiation:
    #   p=0→1.5, p=25→4.0, p=50→6.0, p=75→8.0, p=100→9.5

    if len(final_rows) > 2:
        raw_funds = pd.Series([x["fund_score"] for x in final_rows])
        raw_research = pd.Series([x["research"]["research_composite"] for x in final_rows])

        _PCTILE_ANCHORS = [
            (0, 1.5), (25, 4.0), (50, 6.0), (75, 8.0), (100, 9.5)
        ]

        def _pctile_to_score(pctile: float) -> float:
            pctile = max(0.0, min(100.0, pctile))
            for i in range(len(_PCTILE_ANCHORS) - 1):
                p0, s0 = _PCTILE_ANCHORS[i]
                p1, s1 = _PCTILE_ANCHORS[i + 1]
                if pctile <= p1:
                    t = (pctile - p0) / (p1 - p0) if p1 != p0 else 0
                    return s0 + t * (s1 - s0)
            return _PCTILE_ANCHORS[-1][1]

        for item in final_rows:
            if item.get("is_etf"):
                continue

            # Percentile rank of fund_score across universe
            fund_pctile = (raw_funds <= item["fund_score"]).sum() / len(raw_funds) * 100
            item["fund_score_pctile"] = fund_pctile
            item["fund_score_ranked"] = _pctile_to_score(fund_pctile)

            # Percentile rank of research_composite across universe
            res_pctile = (raw_research <= item["research"]["research_composite"]).sum() / len(raw_research) * 100
            item["research_pctile"] = res_pctile
            item["research_composite_ranked"] = _pctile_to_score(res_pctile)

    # ── Absolute Quality Gates ──────────────────────────────────────────────
    # Percentile ranking alone will always recommend something, even if every
    # stock is overvalued. Absolute gates ensure that fundamentally flawed or
    # extremely overbought stocks cannot achieve top-tier composite scores.
    # A gate caps the ranked score to a ceiling if the stock fails thresholds.

    _QUALITY_CEILINGS = {
        "pe_too_high":      6.0,   # P/E > 60: highly overvalued
        "zscore_extreme":   5.5,   # Z-Score > 2.5: extremely overbought
        "reversion_sell":   6.5,   # Reversion signal = -1: overbought
        "negative_roe":     4.0,   # ROE <= 0: unprofitable
        "high_debt":        6.0,   # D/E > 200: excessive leverage
    }

    for item in final_rows:
        if item.get("is_etf"):
            continue

        info = item["info"]
        research = item["research"]
        pe = _safe_float(info.get("trailingPE"))
        z_score = _safe_float(research.get("z_score_60", 0), default=0)
        reversion_sig = research.get("reversion_signal", 0)
        roe = _safe_float(info.get("returnOnEquity"), default=0)
        debt_eq = _safe_float(info.get("debtToEquity"), default=0)

        ceiling = 10.0
        reasons = []

        if not np.isnan(pe) and pe > 60:
            ceiling = min(ceiling, _QUALITY_CEILINGS["pe_too_high"])
            reasons.append(f"P/E={pe:.1f}>60")
        if z_score > 2.5:
            ceiling = min(ceiling, _QUALITY_CEILINGS["zscore_extreme"])
            reasons.append(f"Z={z_score:.2f}>2.5")
        if reversion_sig == -1:
            ceiling = min(ceiling, _QUALITY_CEILINGS["reversion_sell"])
            reasons.append("overbought_reversion")
        if roe <= 0:
            ceiling = min(ceiling, _QUALITY_CEILINGS["negative_roe"])
            reasons.append(f"ROE={roe:.1f}%<=0")
        if debt_eq > 200:
            ceiling = min(ceiling, _QUALITY_CEILINGS["high_debt"])
            reasons.append(f"D/E={debt_eq:.1f}>200")

        if reasons:
            item["quality_gated"] = True
            item["quality_ceiling"] = ceiling
            item["quality_reasons"] = reasons
        else:
            item["quality_gated"] = False

    # ── Compute composite scores using ranked values ────────────────────────
    for item in final_rows:
        norm_tech = item["norm_tech"]
        ranked_fund = item.get("fund_score_ranked", item["fund_score"])
        ranked_research = item.get("research_composite_ranked", item["research"]["research_composite"])

        raw_composite       = (norm_tech * 0.35) + (ranked_fund * 0.30) + (ranked_research * 0.35)
        raw_composite_tech  = (norm_tech * 0.50) + (ranked_fund * 0.15) + (ranked_research * 0.35)
        raw_composite_fund  = (norm_tech * 0.10) + (ranked_fund * 0.40) + (ranked_research * 0.50)
        raw_composite_mom   = (ranked_research * 0.70) + (norm_tech * 0.20) + (ranked_fund * 0.10)

        # Apply overbought penalty: -0.3 for overbought, -0.8 for extreme
        research = item["research"]
        z_score = _safe_float(research.get("z_score_60", 0), default=0)
        reversion_sig = research.get("reversion_signal", 0)
        overbought_penalty = 0.0
        if z_score > 2.0 or reversion_sig == -1:
            overbought_penalty = 0.3
        if z_score > 2.5:
            overbought_penalty = 0.8

        penalized_composite = max(0.0, raw_composite - overbought_penalty)

        # Apply quality gate ceiling
        if item.get("quality_gated"):
            ceiling = item["quality_ceiling"]
            penalized_composite = min(penalized_composite, ceiling)
            raw_composite_tech = min(raw_composite_tech, ceiling)
            raw_composite_fund = min(raw_composite_fund, ceiling)
            raw_composite_mom = min(raw_composite_mom, ceiling)

        item["composite_score"]       = penalized_composite
        item["composite_score_tech"]  = raw_composite_tech
        item["composite_score_fund"]  = raw_composite_fund
        item["composite_score_mom"]   = raw_composite_mom

    all_comp_scores = pd.Series([x["composite_score"] for x in final_rows])
    for item in final_rows:
        if len(all_comp_scores) > 0:
            comp_pctile = sum(all_comp_scores <= item["composite_score"]) / len(all_comp_scores) * 100
        else:
            comp_pctile = 50.0

        weekly_st_dir = _safe_float(item["latest"].get("Weekly_ST_Direction", np.nan))
        weekly_bullish = weekly_st_dir == -1

        conviction = get_conviction_rating(comp_pctile, regime_score, weekly_bullish)
        item["conviction"] = conviction

    return final_rows


def _default_research() -> dict:
    """Default research scores for ETFs."""
    return {
        "research_composite": 5.0, "piotroski_f_score": 0, "gross_profit_score": np.nan,
        "momentum_composite": np.nan, "momentum_score": 5.0, "risk_adj_mom": np.nan,
        "vol_60d": np.nan, "vol_120d": np.nan, "downside_dev": np.nan, "vol_score": 5.0,
        "reversion_signal": 0, "reversion_score": 5.0, "z_score_60": 0,
        "earnings_quality_score": 5.0, "f_score_norm": 0,
        "value_score": 5.0, "investment_score": 5.0, "sue_score": 5.0,
        "beta": np.nan, "beta_score": 5.0, "alpha_60d": np.nan,
        "mom_1m": np.nan, "mom_3m": np.nan, "mom_6m": np.nan,
        "mom_12m": np.nan, "mom_12m_skip1": np.nan
    }


def build_output_row(item: dict) -> dict:
    """Build a single output row from scored intermediate data."""
    info = item["info"]
    latest = item["latest"]
    tech = item["tech"]
    met = item["met"]
    is_etf = item["is_etf"]
    research = item.get("research", {})

    sym = item["ticker"].replace('.NS', '').replace('.BO', '')
    long_name = info.get("longName") or info.get("shortName") or sym

    ceo_name = "Unknown"
    officers = info.get("companyOfficers") or []
    for officer in officers:
        if 'title' in officer and 'CEO' in officer['title'].upper():
            ceo_name = officer.get('name', 'Unknown')
            break

    close = _safe_float(latest["Close"])
    chg = (close / _safe_float(item["prev"]["Close"]) - 1) * 100

    return {
        "Ticker":           item["ticker"].upper(),
        "Sector":           item["sector"],
        "Industry":         item["industry"],
        "Long_Name":        long_name,
        "CEO":              ceo_name,
        "Total_Revenue":    np.nan if is_etf else round(_safe_float(info.get("totalRevenue"), 0) / 1e9, 2),
        "Net_Income":       np.nan if is_etf else round(_safe_float(info.get("netIncomeToCommon"), 0) / 1e9, 2),
        "EBITDA":           np.nan if is_etf else round(_safe_float(info.get("ebitda"), 0) / 1e9, 2),
        "News_Sentiment":   round(info.get("news_sentiment", 0.0), 3),
        "Price":            round(close, 2),
        "1d_Chg_%":         round(chg, 2),
        "P/E":              np.nan if is_etf else round(item["pe"], 2),
        "Forward_P/E":      np.nan if is_etf else round(_safe_float(info.get("forwardPE"), item["pe"]), 2),
        "ROE_%":            np.nan if is_etf else item["roe"],
        "Debt_to_Equity":   np.nan if is_etf else round(item["debt_eq"], 2),
        "Div_Yield_%":      np.nan if is_etf else round(_safe_float(info.get("dividendYield"), 0), 2),
        "Market_Cap_B":     np.nan if is_etf else round((_safe_float(info.get("marketCap"), 0)) / 1e9, 2),
        "52W_High":         _safe_float(info.get("fiftyTwoWeekHigh")),
        "52W_Low":          _safe_float(info.get("fiftyTwoWeekLow")),
        "All_Time_High":    item["ath"],
        "ATH_Source":       item["ath_source"],
        "All_Time_Low":     item["atl"],
        "ATL_Source":       item["atl_source"],
        "Fund_Score":       round(item["fund_score"], 2),
        "Research_Score":   round(research.get("research_composite", 5.0), 2),
        "Composite_Score":  round(item["composite_score"], 2),
        "Composite_Score_Tech": round(item["composite_score_tech"], 2),
        "Composite_Score_Fund": round(item["composite_score_fund"], 2),
        "Composite_Score_Mom":  round(item.get("composite_score_mom", 5.0), 2),
        "Piotroski_F":      research.get("piotroski_f_score", 0),
        "Gross_Profit_Score": round(research.get("gross_profit_score", 5.0), 2) if not np.isnan(research.get("gross_profit_score", np.nan)) else None,
        "Value_Score":      round(research.get("value_score", 5.0), 2),
        "Investment_Score": round(research.get("investment_score", 5.0), 2),
        "SUE_Score":        round(research.get("sue_score", 5.0), 2),
        "Beta":             round(research.get("beta", np.nan), 3) if not np.isnan(research.get("beta", np.nan)) else None,
        "Beta_Score":       round(research.get("beta_score", 5.0), 2),
        "Alpha_60D":        round(research.get("alpha_60d", np.nan) * 100, 2) if not np.isnan(research.get("alpha_60d", np.nan)) else None,
        "Momentum_1M":      round(research.get("mom_1m", np.nan), 4) if not np.isnan(research.get("mom_1m", np.nan)) else None,
        "Momentum_3M":      round(research.get("mom_3m", np.nan), 4) if not np.isnan(research.get("mom_3m", np.nan)) else None,
        "Momentum_6M":      round(research.get("mom_6m", np.nan), 4) if not np.isnan(research.get("mom_6m", np.nan)) else None,
        "Momentum_12M":     round(research.get("mom_12m", np.nan), 4) if not np.isnan(research.get("mom_12m", np.nan)) else None,
        "Risk_Adj_Mom":     round(research.get("risk_adj_mom", np.nan), 3) if not np.isnan(research.get("risk_adj_mom", np.nan)) else None,
        "Vol_60D":          round(research.get("vol_60d", np.nan) * 100, 2) if not np.isnan(research.get("vol_60d", np.nan)) else None,
        "Downside_Dev":     round(research.get("downside_dev", np.nan) * 100, 2) if not np.isnan(research.get("downside_dev", np.nan)) else None,
        "Reversion_Signal": research.get("reversion_signal", 0),
        "Z_Score_60":       round(research.get("z_score_60", 0), 2),
        "Earnings_Quality": round(research.get("earnings_quality_score", 5.0), 2),
        "ROCE_%":           np.nan if is_etf else _safe_float(info.get("roce")),
        "Promoter_Holding_%": np.nan if is_etf else _safe_float(info.get("promoter_holding")),
        "Promoter_Pledging_%": np.nan if is_etf else _safe_float(info.get("promoter_pledging")),
        "Conviction":       item["conviction"],
        "RS_Percentile":    round(item["rs_pctile"], 1) if not np.isnan(item.get("rs_pctile", np.nan)) else None,
        "RSI_Value":        round(_safe_float(latest.get("RSI", np.nan)), 2),
        "MACD_Value":       round(_safe_float(latest.get("MACD", np.nan)), 4),
        "CCI_Value":        round(_safe_float(latest.get("CCI", np.nan)), 2),
        "ATR_Value":        round(_safe_float(latest.get("ATR", np.nan)), 2),
        "ADX_Value":        round(_safe_float(latest.get("ADX", np.nan)), 2),
        "Plus_DI":          round(_safe_float(latest.get("Plus_DI", np.nan)), 2),
        "Minus_DI":         round(_safe_float(latest.get("Minus_DI", np.nan)), 2),
        "BB_%B_Value":      round(_safe_float(latest.get("BB_%B", np.nan)), 3),
        "ST_Signal":        "Bullish" if tech["sig_supertrend"] == 1 else "Bearish",
        "Volume":           int(_safe_float(latest.get("Volume", 0), 0)),
        "Vol_vs_Avg_%":     round((_safe_float(latest.get("Volume", 0)) / max(_safe_float(latest.get("VOL_MA20", 1)), 1) - 1) * 100, 1),
        "Sig_Price_vs_SMA50":   tech["sig_price_sma50"],
        "Sig_Price_vs_SMA200":  tech["sig_price_sma200"],
        "Sig_SMA50_vs_SMA200":  tech["sig_sma50_sma200"],
        "Sig_RSI":              tech["sig_rsi"],
        "Sig_MACD_Cross":       tech["sig_macd"],
        "Sig_MACD_Hist":        tech["sig_macd_hist"],
        "Sig_Stoch":            tech["sig_stoch"],
        "Sig_BB":               tech["sig_bb"],
        "Sig_CCI":              tech["sig_cci"],
        "Sig_Volume":           tech["sig_vol"],
        "Sig_ADX":              tech["sig_adx"],
        "Sig_Supertrend":       tech["sig_supertrend"],
        "Sig_VPT":              tech["sig_vpt"],
        "Sig_Ichimoku":         tech["sig_ichimoku"],
        "Tech_Score":       round(item["final_tech"], 3),
        "Bull_Count":       tech["bull"],
        "Bear_Count":       tech["bear"],
        "Total_Return_%":   met["Total_Return_%"],
        "Ann_Vol_%":        met["Ann_Vol_%"],
        "Sharpe":           met["Sharpe"],
        "Max_Drawdown_%":   met["Max_Drawdown_%"],
    }
