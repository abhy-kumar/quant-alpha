"""
test_recommendation_enhancements.py
-----------------------------------
Unit tests for the 6 quantitative recommendation enhancements:
1. Forensic red flags and circuit-breaker disqualifiers
2. Cross-sectional sector Z-score normalization
3. ATR volatility trade plans (Stop-Loss, Target 1, Target 2, Chandelier)
4. Dynamic regime-adaptive factor weights
5. Dual-horizon tactical vs strategic conviction rating
"""

import numpy as np
import pandas as pd
import pytest

from engine.recommendation import (
    compute_fund_score,
    check_forensic_red_flags,
    generate_atr_trade_plan,
    get_conviction_rating,
)


def test_forensic_red_flags_detection():
    """Verify all forensic red flags are correctly identified."""
    # 1. High promoter pledging (> 20%)
    info_pledging = {"promoter_pledging": 28.5}
    flags_pledging = check_forensic_red_flags(info_pledging)
    assert any("Promoter Pledging" in f for f in flags_pledging)
    assert "28.5%" in flags_pledging[0]

    # 2. Extreme debt leverage (D/E > 2.5)
    info_debt = {"debtToEquity": 320.0}
    flags_debt = check_forensic_red_flags(info_debt)
    assert any("Extreme Leverage" in f for f in flags_debt)

    # 3. High debt with negative ROE
    info_debt_roe = {"debtToEquity": 180.0, "returnOnEquity": -5.0}
    flags_debt_roe = check_forensic_red_flags(info_debt_roe)
    assert any("High Debt with Negative ROE" in f for f in flags_debt_roe)

    # 4. Severe loss-making (ROE < -15%)
    info_loss = {"returnOnEquity": -22.0}
    flags_loss = check_forensic_red_flags(info_loss)
    assert any("Negative Return on Equity" in f for f in flags_loss)

    # 5. Blow-off top overextension (Z > 2.5 and RSI > 80)
    latest_metrics = {"z_score_60": 2.8, "RSI": 84.0}
    flags_overbought = check_forensic_red_flags({}, latest_metrics=latest_metrics)
    assert any("Blow-Off Overextension" in f for f in flags_overbought)

    # Clean stock should have zero flags
    info_clean = {"promoter_pledging": 0.0, "debtToEquity": 25.0, "returnOnEquity": 22.0}
    flags_clean = check_forensic_red_flags(info_clean, latest_metrics={"z_score_60": 0.5, "RSI": 55.0})
    assert len(flags_clean) == 0


def test_conviction_circuit_breaker():
    """Verify that forensic red flags cap conviction at 'Caution' or 'Avoid'."""
    # Standard high composite stock without red flags -> Strong Buy
    conv_clean = get_conviction_rating(
        percentile=95.0,
        regime_score=2,
        weekly_bullish=True,
        norm_tech=8.5,
        fund_score=8.0,
        research_composite=8.5,
        red_flags=[],
    )
    assert conv_clean == "Strong Buy"

    # Single red flag (e.g. pledging) caps rating at 'Caution'
    conv_single_flag = get_conviction_rating(
        percentile=95.0,
        regime_score=2,
        weekly_bullish=True,
        norm_tech=8.5,
        fund_score=8.0,
        research_composite=8.5,
        red_flags=["High Promoter Pledging (30.0%)"],
    )
    assert conv_single_flag == "Caution"

    # Multiple red flags cap rating at 'Avoid'
    conv_multi_flag = get_conviction_rating(
        percentile=95.0,
        regime_score=2,
        weekly_bullish=True,
        norm_tech=8.5,
        fund_score=8.0,
        research_composite=8.5,
        red_flags=["High Promoter Pledging (30.0%)", "Extreme Leverage (D/E: 3.2x)"],
    )
    assert conv_multi_flag == "Avoid"


def test_sector_z_score_fund_normalization():
    """Verify sector Z-scoring rewards valuation relative to industry baseline."""
    # Sector A (High multiple industry e.g. IT): PE mean = 45, std = 10
    sec_it = {
        "pe": 45.0, "pe_mean": 45.0, "pe_std": 10.0,
        "roe": 25.0, "roe_mean": 25.0, "roe_std": 6.0,
        "roce_mean": 28.0, "roce_std": 7.0,
        "debt_eq": 10.0, "debt_mean": 10.0, "debt_std": 8.0,
    }

    # Sector B (Low multiple industry e.g. Metals): PE mean = 14, std = 3
    sec_metals = {
        "pe": 14.0, "pe_mean": 14.0, "pe_std": 3.0,
        "roe": 12.0, "roe_mean": 12.0, "roe_std": 4.0,
        "roce_mean": 14.0, "roce_std": 5.0,
        "debt_eq": 60.0, "debt_mean": 60.0, "debt_std": 20.0,
    }

    # Stock with PE = 35 in IT sector (cheaper than sector mean 45)
    score_it = compute_fund_score(
        roe_pct=28.0,
        pe=35.0,
        fwd_pe=32.0,
        debt_eq=5.0,
        div_yield_pct=1.5,
        mkt_cap_b=200.0,
        sharpe=1.2,
        eps_growth=0.18,
        rev_growth=0.15,
        roce_pct=30.0,
        sector_medians=sec_it,
    )

    # Stock with PE = 35 in Metals sector (severely expensive vs sector mean 14)
    score_metals = compute_fund_score(
        roe_pct=14.0,
        pe=35.0,
        fwd_pe=32.0,
        debt_eq=50.0,
        div_yield_pct=1.5,
        mkt_cap_b=200.0,
        sharpe=1.2,
        eps_growth=0.18,
        rev_growth=0.15,
        roce_pct=15.0,
        sector_medians=sec_metals,
    )

    assert score_it > score_metals
    assert score_it > 5.5
    assert score_metals < 5.5


def test_atr_trade_plan_generation():
    """Verify ATR execution plan calculates accurate stops and profit targets."""
    price = 1000.0
    atr = 25.0
    h22 = 1050.0

    plan = generate_atr_trade_plan(price, atr, h22)

    # Stop-Loss: Entry - 2.0 * ATR = 1000 - 50 = 950.0
    assert plan["atr_stop"] == 950.0
    assert plan["atr_risk_pct"] == 5.0

    # Target 1: Entry + 2.5 * ATR = 1000 + 62.5 = 1062.5
    assert plan["atr_target1"] == 1062.5

    # Target 2: Entry + 4.5 * ATR = 1000 + 112.5 = 1112.5
    assert plan["atr_target2"] == 1112.5

    # Chandelier Exit: High(22) - 3.0 * ATR = 1050 - 75 = 975.0
    assert plan["atr_chandelier"] == 975.0

    # Edge cases
    invalid_plan = generate_atr_trade_plan(np.nan, atr, h22)
    assert np.isnan(invalid_plan["atr_stop"])

    zero_atr_plan = generate_atr_trade_plan(price, 0.0, h22)
    assert np.isnan(zero_atr_plan["atr_stop"])
