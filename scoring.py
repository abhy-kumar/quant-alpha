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
        mkt_cap_b = round((_safe_float(info.get("marketCap"), 0)) / 1e7, 2)
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
        if sentiment > 0.15:
            norm_tech = min(10.0, norm_tech + 1.0)
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
    # Instead of absolute thresholds, map raw scores to their percentile rank
    # within the universe. This is academically correct because:
    #   - "Good" ROE depends on the sector and market conditions
    #   - Percentile ranking adapts to the distribution of the current universe
    #   - Eliminates arbitrary threshold selection bias
    #
    # Mapping: percentile 0-100 → score 0-10 via piecewise linear function
    #   p >= 90 → 9.5, p >= 75 → 8.0, p >= 50 → 6.0, p >= 25 → 4.0, p < 25 → 2.0

    if len(final_rows) > 2:
        raw_funds = pd.Series([x["fund_score"] for x in final_rows])
        raw_research = pd.Series([x["research"]["research_composite"] for x in final_rows])

        def _pctile_to_score(pctile: float) -> float:
            if pctile >= 90:
                return 9.5
            elif pctile >= 75:
                return 8.0
            elif pctile >= 60:
                return 7.0
            elif pctile >= 50:
                return 6.0
            elif pctile >= 40:
                return 5.0
            elif pctile >= 25:
                return 4.0
            elif pctile >= 10:
                return 2.5
            else:
                return 1.5

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

    # ── Compute composite scores using ranked values ────────────────────────
    for item in final_rows:
        norm_tech = item["norm_tech"]
        ranked_fund = item.get("fund_score_ranked", item["fund_score"])
        ranked_research = item.get("research_composite_ranked", item["research"]["research_composite"])

        item["composite_score"]       = (norm_tech * 0.35) + (ranked_fund * 0.30) + (ranked_research * 0.35)
        item["composite_score_tech"]  = (norm_tech * 0.50) + (ranked_fund * 0.15) + (ranked_research * 0.35)
        item["composite_score_fund"]  = (norm_tech * 0.10) + (ranked_fund * 0.40) + (ranked_research * 0.50)
        item["composite_score_mom"]   = (ranked_research * 0.70) + (norm_tech * 0.20) + (ranked_fund * 0.10)

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
        "Total_Revenue":    np.nan if is_etf else round(_safe_float(info.get("totalRevenue"), 0) / 1e7, 2),
        "Net_Income":       np.nan if is_etf else round(_safe_float(info.get("netIncomeToCommon"), 0) / 1e7, 2),
        "EBITDA":           np.nan if is_etf else round(_safe_float(info.get("ebitda"), 0) / 1e7, 2),
        "News_Sentiment":   round(info.get("news_sentiment", 0.0), 3),
        "Price":            round(close, 2),
        "1d_Chg_%":         round(chg, 2),
        "P/E":              np.nan if is_etf else round(item["pe"], 2),
        "Forward_P/E":      np.nan if is_etf else round(_safe_float(info.get("forwardPE"), item["pe"]), 2),
        "ROE_%":            np.nan if is_etf else item["roe"],
        "Debt_to_Equity":   np.nan if is_etf else round(item["debt_eq"], 2),
        "Div_Yield_%":      np.nan if is_etf else round(_safe_float(info.get("dividendYield"), 0), 2),
        "Market_Cap_B":     np.nan if is_etf else round((_safe_float(info.get("marketCap"), 0)) / 1e7, 2),
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
