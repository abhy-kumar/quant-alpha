"""
test_recommendation_edge_cases.py
---------------------------------
Unit tests for refined stock recommendation logic, growth sanitization,
loss-making firm valuation penalties, and database connection pragmas.
"""

import numpy as np
import pandas as pd
import pytest

from engine.recommendation import compute_fund_score, compute_tech_score
from engine.research_factors import compute_investment_factor, compute_sue_factor
from data_pipeline.data_pipeline import _get_conn as pipeline_get_conn
from engine.quant_engine import _get_conn as quant_get_conn


def test_loss_making_firm_valuation_penalty():
    """Loss-making companies (negative PE) must receive an explicit valuation penalty."""
    # Profitable company with fair PE=20
    score_profitable = compute_fund_score(
        roe_pct=15.0,
        pe=20.0,
        fwd_pe=18.0,
        debt_eq=30.0,
        div_yield_pct=1.0,
        mkt_cap_b=50.0,
        sharpe=1.0,
        eps_growth=0.15,
        rev_growth=0.12,
    )

    # Identical metrics but with negative PE (loss-making)
    score_unprofitable = compute_fund_score(
        roe_pct=15.0,
        pe=-15.0,
        fwd_pe=-12.0,
        debt_eq=30.0,
        div_yield_pct=1.0,
        mkt_cap_b=50.0,
        sharpe=1.0,
        eps_growth=0.15,
        rev_growth=0.12,
    )

    assert score_unprofitable < score_profitable
    assert score_unprofitable > 0.0


def test_growth_inputs_remain_decimal_above_three_hundred_percent():
    """Growth is always fractional. Increasing growth across 300% must not collapse the score."""
    # Growth just below 300%.
    score_decimal = compute_fund_score(
        roe_pct=18.0,
        pe=25.0,
        fwd_pe=22.0,
        debt_eq=20.0,
        div_yield_pct=1.2,
        mkt_cap_b=100.0,
        sharpe=1.2,
        eps_growth=2.99,
        rev_growth=2.99,
    )

    # Growth just above 300%.
    score_percentage = compute_fund_score(
        roe_pct=18.0,
        pe=25.0,
        fwd_pe=22.0,
        debt_eq=20.0,
        div_yield_pct=1.2,
        mkt_cap_b=100.0,
        sharpe=1.2,
        eps_growth=3.01,
        rev_growth=3.01,
    )

    # Scores should be virtually identical
    assert np.isclose(score_decimal, score_percentage, atol=0.05)


def test_research_growth_inputs_keep_declared_units():
    """Extreme growth keeps its magnitude rather than becoming moderate growth."""
    info_dec = {
        "earningsGrowth": 0.20,
        "revenueGrowth": 0.15,
        "trailingPE": 22.0,
        "forwardPE": 18.0,
        "yoy_asset_growth": 0.08,
        "returnOnEquity": 0.18,
        "debtToEquity": 30.0,
    }

    info_pct = {
        "earningsGrowth": 20.0,
        "revenueGrowth": 15.0,
        "trailingPE": 22.0,
        "forwardPE": 18.0,
        "yoy_asset_growth": 8.0,
        "returnOnEquity": 0.18,
        "debtToEquity": 30.0,
    }

    sue_dec = compute_sue_factor(info_dec, None)
    sue_pct = compute_sue_factor(info_pct, None)
    assert sue_pct >= sue_dec

    inv_dec = compute_investment_factor(info_dec)
    inv_pct = compute_investment_factor(info_pct)
    assert inv_pct < inv_dec


def test_trend_aware_bollinger_band_signal():
    """In a strong bullish regime (ADX > 25, Supertrend bullish), high %B is not penalized."""
    # Construct mock latest and prev series
    latest_bullish_breakout = pd.Series({
        "Close": 150.0,
        "SMA_50": 130.0,
        "SMA_200": 110.0,
        "ST_Direction": -1.0,  # Supertrend bullish
        "RSI": 65.0,
        "MACD": 3.0,
        "MACD_Signal": 2.0,
        "MACD_Hist": 1.0,
        "Stoch_%K": 75.0,
        "Stoch_%D": 70.0,
        "BB_%B": 0.98,  # Near upper band
        "CCI": 80.0,
        "Volume": 500000,
        "VOL_MA20": 300000,
        "ADX": 35.0,
        "Plus_DI": 30.0,
        "Minus_DI": 12.0,
        "VPT": 1000.0,
        "VPT_EMA20": 900.0,
        "Ichimoku_SpanA": 120.0,
        "Ichimoku_SpanB": 115.0,
    })

    prev = pd.Series({
        "Close": 145.0,
        "MACD_Hist": 0.5,
    })

    df = pd.DataFrame([prev, latest_bullish_breakout])

    res = compute_tech_score(latest_bullish_breakout, prev, df)
    # sig_bb should be +1 (breakout continuation) rather than -1 (overbought penalty)
    assert res["sig_bb"] == 1
    assert res["score"] > 0.5


def test_sqlite_connection_pragmas():
    """Verify that SQLite connections use WAL mode and busy timeout."""
    conn_pipe = pipeline_get_conn()
    wal_mode = conn_pipe.execute("PRAGMA journal_mode").fetchone()[0]
    conn_pipe.close()
    assert wal_mode.lower() == "wal"

    conn_quant = quant_get_conn()
    quant_wal = conn_quant.execute("PRAGMA journal_mode").fetchone()[0]
    conn_quant.close()
    assert quant_wal.lower() == "wal"
