"""Scanner diagnostics and versioned, coverage-aware stock rankings.

The ranking specification lives in engine/ranking.py. Research diagnostics are
displayed separately and do not add another overlapping vote to the final score.
"""

import numpy as np
import pandas as pd

from utils import _safe_float, log
from engine.recommendation import (
    compute_fund_score,
    get_conviction_rating,
    check_forensic_red_flags,
    generate_atr_trade_plan,
)
from engine.research_factors import compute_research_composite


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
    """Compute distribution statistics (median, mean, std) for PE, ROE, ROCE, and Debt/Equity for each sector."""
    sector_medians = {}
    for sec, metrics in sector_data.items():
        pe_vals   = [v for v in metrics.get('pe', []) if not np.isnan(v) and 0 < v < 200]
        roe_vals  = [v for v in metrics.get('roe', []) if not np.isnan(v) and abs(v) < 150]
        debt_vals = [v for v in metrics.get('debt_eq', []) if not np.isnan(v) and 0 <= v < 1000]
        roce_vals = [v for v in metrics.get('roce', []) if not np.isnan(v) and abs(v) < 150]

        sector_medians[sec] = {
            'pe': np.median(pe_vals) if pe_vals else np.nan,
            'pe_mean': np.mean(pe_vals) if pe_vals else np.nan,
            'pe_std': np.std(pe_vals) if len(pe_vals) > 1 else np.nan,
            'roe': np.median(roe_vals) if roe_vals else np.nan,
            'roe_mean': np.mean(roe_vals) if roe_vals else np.nan,
            'roe_std': np.std(roe_vals) if len(roe_vals) > 1 else np.nan,
            'debt_eq': np.median(debt_vals) if debt_vals else np.nan,
            'debt_mean': np.mean(debt_vals) if debt_vals else np.nan,
            'debt_std': np.std(debt_vals) if len(debt_vals) > 1 else np.nan,
            'roce_mean': np.mean(roce_vals) if roce_vals else np.nan,
            'roce_std': np.std(roce_vals) if len(roce_vals) > 1 else np.nan,
        }
    return sector_medians


def compute_all_scores(rows_intermediate: list, rs_composites: list, nifty_df, sector_medians: dict, regime_score: int) -> list:
    """Compute diagnostics, then rank each equity with the versioned five-pillar model."""
    from engine.ranking import apply_ranking, midpoint_percentile
    peers = [x['rs_composite'] for x in rows_intermediate if not x.get('is_etf')]
    for item in rows_intermediate:
        item['research'] = (_default_research() if item['is_etf'] else
            compute_research_composite(item['info'], item.get('df'), nifty_df, sector_medians.get(item['sector'])))
        item['final_tech'] = item['tech']['score']
        item['rs_pctile'] = midpoint_percentile(item['rs_composite'], peers)
        latest, frame = item['latest'], item.get('df')
        price = _safe_float(latest.get('Close'))
        high = frame['High'].tail(22).max() if frame is not None and 'High' in frame else price
        item['trade_plan'] = generate_atr_trade_plan(price, _safe_float(latest.get('ATR')), high)
        # Legacy predictions cannot be calibrated for a newly defined feature set.
        item['ml_alpha_prob'] = np.nan
        item['ml_conviction'] = 'Not calibrated'
        item['ml_method'] = 'Not calibrated for ranking-v3'
    reference_date = (str(pd.Timestamp(nifty_df.index[-1]).date())
                      if nifty_df is not None and len(nifty_df) else None)
    return apply_ranking(rows_intermediate, reference_date=reference_date,
                         trading_dates=nifty_df.index if nifty_df is not None and len(nifty_df) else None)


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
        "Ranking_Version": item.get('ranking_version'),
        "Ranking_Inputs": item.get('ranking_inputs', {}),
        "Ranking_Price_Date": item.get('ranking_price_date'),
        "Ranking_Factors": item.get('ranking_factors', {}),
        "Ranking_Coverage": item.get('ranking_horizon_coverage', {}),
        "Ranking_Eligible": item.get('ranking_eligible', {}),
        "Ranking_Percentiles": item.get('ranking_percentiles', {}),
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
        "Composite_Score_Long": round(item.get("composite_score_long", 5.0), 2),
        "ML_Method": item.get("ml_method", "Uncalibrated factor heuristic"),
        "ML_Alpha_Prob":    round(item.get("ml_alpha_prob", min(95.0, max(5.0, 50.0 + (research.get("research_composite", 5.0) - 5.0) * 4.5 + item["final_tech"] * 12.0))), 1),
        "ML_Conviction":    item.get("ml_conviction", "Neutral"),
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
        "Conviction_Long":  item.get("conviction_long", item["conviction"]),
        "Tactical_Score":   round(_safe_float(item.get("composite_score_tech", 5.0)), 2),
        "Tactical_Conviction": item.get("tactical_conviction", item["conviction"]),
        "Red_Flags":        item.get("red_flags", []),
        "ATR_Stop":         item.get("trade_plan", {}).get("atr_stop", np.nan),
        "ATR_Target1":      item.get("trade_plan", {}).get("atr_target1", np.nan),
        "ATR_Target2":      item.get("trade_plan", {}).get("atr_target2", np.nan),
        "ATR_Chandelier":   item.get("trade_plan", {}).get("atr_chandelier", np.nan),
        "ATR_Risk_Pct":     item.get("trade_plan", {}).get("atr_risk_pct", np.nan),
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
        "Tech_Score":       round(item["norm_tech"], 2),
        "Tech_Score_Raw":   round(item["final_tech"], 3),
        "Bull_Count":       tech["bull"],
        "Bear_Count":       tech["bear"],
        "Total_Return_%":   met["Total_Return_%"],
        "Ann_Vol_%":        met["Ann_Vol_%"],
        "Sharpe":           met["Sharpe"],
        "Max_Drawdown_%":   met["Max_Drawdown_%"],
    }
