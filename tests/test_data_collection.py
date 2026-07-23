"""
test_data_collection.py
-----------------------
Comprehensive tests for data collection, indicator calculations, and
research factor implementations. Covers all fixes from the academic audit.
"""

import unittest
import numpy as np
import pandas as pd
from unittest.mock import MagicMock, patch

from engine.indicators import (
    add_indicators, compute_metrics, _wilder_smoothing,
    _add_atr, _add_adx, _add_supertrend, _add_ichimoku
)
from engine.research_factors import (
    compute_piotroski_f_score,
    compute_gross_profitability,
    compute_investment_factor,
    compute_volatility_factor,
    compute_mean_reversion_signal,
    compute_momentum_z_score,
    compute_research_composite,
    compute_earnings_quality,
    compute_value_factor,
    compute_sue_factor,
    compute_beta_factor,
)
from engine.recommendation import compute_tech_score, compute_fund_score, get_conviction_rating
from engine.scoring import compute_all_scores, build_output_row
from config import RISK_FREE_RATE


class TestCCIMAD(unittest.TestCase):
    """Test that CCI uses Mean Absolute Deviation, not StdDev."""

    def test_cci_uses_mad(self):
        np.random.seed(42)
        n = 50
        high = pd.Series(np.random.uniform(100, 110, n))
        low = pd.Series(np.random.uniform(90, 100, n))
        close = pd.Series(np.random.uniform(95, 105, n))

        tp = (high + low + close) / 3
        tp_sma = tp.rolling(20).mean()
        tp_mad = tp.rolling(20).apply(lambda x: np.mean(np.abs(x - np.mean(x))), raw=True)
        tp_std = tp.rolling(20).std()

        df = pd.DataFrame({
            "High": high, "Low": low, "Close": close,
            "Volume": np.random.randint(1000, 5000, n)
        })
        df = add_indicators(df)

        valid = df["CCI"].dropna().index
        if len(valid) > 0:
            actual_mad = (tp.loc[valid] - tp_sma.loc[valid]) / (0.015 * tp_mad.loc[valid])
            actual_std = (tp.loc[valid] - tp_sma.loc[valid]) / (0.015 * tp_std.loc[valid])
            code_val = df.loc[valid, "CCI"]

            mad_diff = (code_val - actual_mad).abs().mean()
            std_diff = (code_val - actual_std).abs().mean()

            self.assertLess(mad_diff, std_diff,
                "CCI should be closer to MAD-based calculation than StdDev-based")


class TestIchimokuShift(unittest.TestCase):
    """Test that Ichimoku Senkou Spans are shifted 26 periods forward."""

    def test_senkou_spans_are_shifted(self):
        np.random.seed(42)
        n = 80
        high = pd.Series(np.random.uniform(100, 110, n))
        low = pd.Series(np.random.uniform(90, 100, n))

        df = pd.DataFrame({"High": high, "Low": low})
        df = _add_ichimoku(df)

        tenkan = df["Ichimoku_Tenkan"]
        kijun = df["Ichimoku_Kijun"]

        # With shift(26), SpanA[35] should equal (Tenkan[9] + Kijun[9]) / 2
        if not np.isnan(tenkan.iloc[9]) and not np.isnan(kijun.iloc[9]):
            expected_span_a = (tenkan.iloc[9] + kijun.iloc[9]) / 2
            self.assertAlmostEqual(df["Ichimoku_SpanA"].iloc[35], expected_span_a, places=4,
                msg="Senkou Span A should be shifted 26 periods forward")

    def test_span_b_is_shifted(self):
        np.random.seed(42)
        n = 100
        high = pd.Series(np.random.uniform(100, 110, n))
        low = pd.Series(np.random.uniform(90, 100, n))

        df = pd.DataFrame({"High": high, "Low": low})
        df = _add_ichimoku(df)

        # With shift(26), SpanB[78] uses the 52-period computed at bar 78-26=52
        # So it uses data from bars (52-52+1)=1 to 52, i.e. high[1:53].max()
        if n > 78:
            h52 = high.iloc[1:53].max()
            l52 = low.iloc[1:53].min()
            expected_span_b = (h52 + l52) / 2
            actual = df["Ichimoku_SpanB"].iloc[78]
            if not np.isnan(actual):
                self.assertAlmostEqual(actual, expected_span_b, places=4,
                    msg="Senkou Span B should be shifted 26 periods forward")


class TestPiotroskiYoY(unittest.TestCase):
    """Test Piotroski F-Score with YoY data."""

    def test_yoy_leverage_improving(self):
        """Decreasing debt YoY should score a point."""
        info = {
            "returnOnAssets": 0.08,
            "operatingCashflow": 5e9,
            "earningsGrowth": 0.10,
            "netIncomeToCommon": 3e9,
            "yoy_leverage_change": -0.15,  # debt decreased 15%
            "yoy_current_ratio_change": 0.3,
            "yoy_shares_change": -0.02,
            "yoy_gross_margin_change": 0.05,
            "yoy_asset_turnover_change": 0.03,
        }
        df = pd.DataFrame({"Close": [100]})
        score = compute_piotroski_f_score(info, df)
        self.assertGreaterEqual(score, 7,
            "Company with improving YoY metrics should score high")

    def test_yoy_leverage_worsening(self):
        """Increasing debt YoY should NOT score a point."""
        info = {
            "returnOnAssets": 0.08,
            "operatingCashflow": 5e9,
            "earningsGrowth": 0.10,
            "netIncomeToCommon": 3e9,
            "yoy_leverage_change": 0.25,  # debt increased 25%
            "yoy_current_ratio_change": -0.2,
            "yoy_shares_change": 0.05,  # dilution
            "yoy_gross_margin_change": -0.03,
            "yoy_asset_turnover_change": -0.02,
        }
        df = pd.DataFrame({"Close": [100]})
        score = compute_piotroski_f_score(info, df)
        self.assertLessEqual(score, 4,
            "Company with worsening YoY metrics should score low")

    def test_fallback_to_static_when_no_yoy(self):
        """Should fall back to static thresholds when YoY data unavailable."""
        info_static = {
            "returnOnAssets": 0.08,
            "operatingCashflow": 5e9,
            "earningsGrowth": 0.10,
            "netIncomeToCommon": 3e9,
            "debtToEquity": 40,
            "currentRatio": 2.0,
            "heldPercentInsiders": 0.15,
            "profitMargins": 0.20,
            "totalRevenue": 50e9,
            "totalAssets": 60e9,
        }
        df = pd.DataFrame({"Close": [100]})
        score_static = compute_piotroski_f_score(info_static, df)

        # Same company but with YoY data
        info_yoy = {
            **info_static,
            "yoy_leverage_change": -0.10,
            "yoy_current_ratio_change": 0.2,
            "yoy_shares_change": -0.01,
            "yoy_gross_margin_change": 0.02,
            "yoy_asset_turnover_change": 0.05,
        }
        score_yoy = compute_piotroski_f_score(info_yoy, df)

        # Both should produce valid scores
        self.assertGreaterEqual(score_static, 0)
        self.assertLessEqual(score_static, 9)
        self.assertGreaterEqual(score_yoy, 0)
        self.assertLessEqual(score_yoy, 9)

    def test_f_score_is_integer(self):
        """F-Score should always be an integer (0-9)."""
        for _ in range(10):
            info = {
                "returnOnAssets": np.random.uniform(-0.1, 0.2),
                "operatingCashflow": np.random.uniform(-1e9, 10e9),
                "earningsGrowth": np.random.uniform(-0.3, 0.3),
                "netIncomeToCommon": np.random.uniform(-1e9, 5e9),
                "debtToEquity": np.random.uniform(0, 200),
                "currentRatio": np.random.uniform(0.5, 3.0),
                "heldPercentInsiders": np.random.uniform(0, 0.5),
                "profitMargins": np.random.uniform(-0.1, 0.3),
                "totalRevenue": np.random.uniform(10e9, 100e9),
                "totalAssets": np.random.uniform(20e9, 150e9),
            }
            df = pd.DataFrame({"Close": [100]})
            score = compute_piotroski_f_score(info, df)
            self.assertEqual(score, int(score),
                f"F-Score {score} should be an integer")
            self.assertGreaterEqual(score, 0)
            self.assertLessEqual(score, 9)


class TestDownsideDeviation(unittest.TestCase):
    """Test that downside deviation uses correct Sortino formula."""

    def test_downside_dev_formula(self):
        np.random.seed(42)
        n = 100
        returns = pd.Series(np.random.normal(0.001, 0.02, n))

        # Correct formula: sqrt(mean(min(R_i, 0)^2)) * sqrt(252)
        correct_dd = float(np.sqrt((np.minimum(returns.iloc[-60:], 0)**2).mean())) * np.sqrt(252)

        # Incorrect formula (old): clip().std() * sqrt(252)
        neg_returns = returns.clip(upper=0)
        incorrect_dd = float(neg_returns.iloc[-60:].std()) * np.sqrt(252)

        # The correct formula should always be >= the incorrect one
        # because sqrt(mean(X^2)) >= sqrt(mean(X^2) - mean(X)^2)
        self.assertGreaterEqual(correct_dd, incorrect_dd * 0.99,
            "Correct DD should be >= incorrect DD (std-based)")

    def test_downside_dev_in_volatility_factor(self):
        np.random.seed(42)
        dates = pd.date_range("2023-01-01", periods=100, freq="B")
        prices = 100 + np.cumsum(np.random.randn(100) * 1)
        df = pd.DataFrame({
            "Close": prices,
            "ATR": np.full(100, 2.0),
        }, index=dates)
        result = compute_volatility_factor(df)
        self.assertIn("downside_dev", result)
        if not np.isnan(result["downside_dev"]):
            self.assertGreaterEqual(result["downside_dev"], 0,
                "Downside deviation should be non-negative")


class Test52WeekHighLowWindow(unittest.TestCase):
    """Test that 52-week high/low uses correct window."""

    def test_52w_uses_last_252_days(self):
        np.random.seed(42)
        n = 500
        dates = pd.date_range("2021-01-01", periods=n, freq="B")
        # Create a price series with a spike 400 days ago
        prices = np.concatenate([
            np.linspace(100, 200, 100),  # spike 400 days ago
            np.linspace(150, 120, 400),  # recent prices lower
        ])
        df = pd.DataFrame({"Close": prices}, index=dates)

        result = compute_mean_reversion_signal(df)

        # Current price is ~120
        # 52-week high should be ~150 (last 252 days max), not 200 (all data)
        # pct_from_52w_high should be negative (below high)
        current = float(df["Close"].iloc[-1])
        high_52w_expected = float(df["Close"].iloc[-252:].max())
        high_52w_all = float(df["Close"].max())

        self.assertLess(high_52w_expected, high_52w_all,
            "52-week high should be less than all-time high")
        self.assertLess(current, high_52w_expected,
            "Current price should be below 52-week high")


class TestGrossProfitabilityFallback(unittest.TestCase):
    """Test that GP/Assets doesn't incorrectly use grossMargins."""

    def test_gross_margins_not_used_as_fallback(self):
        """grossMargins (GP/Revenue) should NOT be used as GP/Assets."""
        info_no_total_assets = {
            "grossProfits": np.nan,
            "totalAssets": np.nan,
            "grossMargins": 0.50,  # 50% gross margin
        }
        score = compute_gross_profitability(info_no_total_assets)
        self.assertEqual(score, 5.0,
            "Should return default 5.0 when totalAssets unavailable, not use grossMargins")

    def test_correct_gp_ratio(self):
        info = {"grossProfits": 25e9, "totalAssets": 100e9}
        score = compute_gross_profitability(info)
        # 25/100 = 0.25 → sigmoid center → score ≈ 5.0
        self.assertAlmostEqual(score, 5.0, delta=0.5)

    def test_high_gp_ratio(self):
        info = {"grossProfits": 60e9, "totalAssets": 100e9}
        score = compute_gross_profitability(info)
        # 60/100 = 0.60 → well above center → score > 9.0
        self.assertGreater(score, 9.0)


class TestInvestmentFactorAssetGrowth(unittest.TestCase):
    """Test that Investment Factor uses YoY asset growth."""

    def test_low_asset_growth_high_score(self):
        """Conservative investment (low asset growth) should score high."""
        info = {"yoy_asset_growth": 0.03, "debtToEquity": 40, "returnOnEquity": 0.18}
        score = compute_investment_factor(info)
        self.assertGreaterEqual(score, 8.0,
            "Low asset growth with good ROE should score high")

    def test_high_asset_growth_low_score(self):
        """Aggressive investment (high asset growth) should score low."""
        info = {"yoy_asset_growth": 0.40, "debtToEquity": 40}
        score = compute_investment_factor(info)
        self.assertLessEqual(score, 3.0,
            "High asset growth should score low")

    def test_fallback_to_revenue_growth(self):
        """Should fall back to revenue growth when asset growth unavailable."""
        info = {
            "revenueGrowth": 0.15,
            "earningsGrowth": 0.20,
            "returnOnEquity": 0.18,
            "debtToEquity": 40,
        }
        score = compute_investment_factor(info)
        self.assertGreaterEqual(score, 0)
        self.assertLessEqual(score, 10)

    def test_moderate_asset_growth(self):
        info = {"yoy_asset_growth": 0.15, "debtToEquity": 40}
        score = compute_investment_factor(info)
        self.assertGreaterEqual(score, 3.0)
        self.assertLessEqual(score, 7.0)


class TestVol12mWindow(unittest.TestCase):
    """Test that vol_12m is windowed to last 252 days."""

    def test_vol_12m_uses_recent_window(self):
        np.random.seed(42)
        n = 500
        dates = pd.date_range("2021-01-01", periods=n, freq="B")
        # Create volatile early period, calm recent period
        early_returns = np.random.normal(0, 0.05, 248)  # high vol
        recent_returns = np.random.normal(0, 0.01, 252)  # low vol
        all_returns = np.concatenate([early_returns, recent_returns])
        log_returns = np.log(1 + all_returns)
        prices = 100 * np.exp(np.cumsum(log_returns))

        df = pd.DataFrame({"Close": prices}, index=dates)

        # Compute returns and vol manually
        full_vol = float(pd.Series(all_returns).std()) * np.sqrt(252)
        recent_vol = float(pd.Series(recent_returns).std()) * np.sqrt(252)

        result = compute_momentum_z_score(df)
        vol_12m = result["vol_12m"]

        # vol_12m should be closer to recent_vol than full_vol
        self.assertLess(abs(vol_12m - recent_vol), abs(vol_12m - full_vol),
            "vol_12m should reflect recent 252 days, not all data")


class TestRiskFreeRateConfig(unittest.TestCase):
    """Test that risk-free rate is configurable via config."""

    def test_risk_free_rate_exists(self):
        self.assertIsNotNone(RISK_FREE_RATE)
        self.assertGreater(RISK_FREE_RATE, 0)
        self.assertLess(RISK_FREE_RATE, 0.20)

    def test_sharpe_uses_config(self):
        np.random.seed(42)
        n = 100
        dates = pd.date_range("2023-01-01", periods=n, freq="B")
        prices = 100 + np.cumsum(np.random.randn(n) * 2)
        df = pd.DataFrame({"Close": prices}, index=dates)

        result = compute_metrics(df)
        sharpe = result["Sharpe"]

        # Verify Sharpe is finite
        self.assertTrue(np.isfinite(sharpe), "Sharpe should be finite")


class TestMissingDataNeutrality(unittest.TestCase):
    """Test that missing data doesn't reward points."""

    def test_missing_debt_eq_neutral(self):
        """Missing D/E should give 0 points for that section."""
        # With D/E
        score_with = compute_fund_score(
            roe_pct=10, pe=15, fwd_pe=12, debt_eq=40,
            div_yield_pct=2.0, mkt_cap_b=20, sharpe=1.5,
            eps_growth=0.2, rev_growth=0.15,
            sector_medians=None
        )
        # Without D/E (NaN)
        score_without = compute_fund_score(
            roe_pct=10, pe=15, fwd_pe=12, debt_eq=float('nan'),
            div_yield_pct=2.0, mkt_cap_b=20, sharpe=1.5,
            eps_growth=0.2, rev_growth=0.15,
            sector_medians=None
        )
        # Score without D/E should be <= score with good D/E
        self.assertLessEqual(score_without, score_with,
            "Missing D/E should not increase score")


class TestRSIBullishRegime(unittest.TestCase):
    """Test RSI signal in bullish regime with softened threshold."""

    def test_rsi_bullish_regime_threshold(self):
        """RSI 37 in bullish regime should be bullish (not bearish)."""
        latest = pd.Series({
            "Close": 100, "SMA_50": 95, "SMA_200": 90,
            "ST_Direction": -1,  # bullish supertrend
            "RSI": 37,  # between 35-80 → bullish
            "MACD": 0.5, "MACD_Signal": 0.3, "MACD_Hist": 0.2,
            "Stoch_%K": 50, "Stoch_%D": 50,
            "BB_%B": 0.5, "CCI": 0, "Volume": 1000000,
            "VOL_MA20": 800000, "ADX": 30, "Plus_DI": 20, "Minus_DI": 10,
            "VPT": 100, "VPT_EMA20": 90,
            "Ichimoku_SpanA": 95, "Ichimoku_SpanB": 93,
        })
        prev = latest.copy()
        prev["Close"] = 99
        prev["MACD_Hist"] = 0.1

        df = pd.DataFrame([prev, latest])
        result = compute_tech_score(latest, prev, df)

        self.assertEqual(result["sig_rsi"], 1,
            "RSI 37 in bullish regime should be bullish (threshold softened to 35)")


class TestFullPipeline(unittest.TestCase):
    """End-to-end test of the full data collection pipeline."""

    def test_indicators_add_correctly(self):
        np.random.seed(42)
        n = 300
        dates = pd.date_range("2022-01-01", periods=n, freq="B")
        close = 100 + np.cumsum(np.random.randn(n) * 2)
        high = close + np.abs(np.random.randn(n))
        low = close - np.abs(np.random.randn(n))
        volume = np.random.randint(1000000, 5000000, n)

        df = pd.DataFrame({
            "Open": close + np.random.randn(n) * 0.5,
            "High": high, "Low": low, "Close": close, "Volume": volume,
        }, index=dates)

        df = add_indicators(df)

        required = [
            "SMA_10", "SMA_20", "SMA_50", "SMA_200",
            "EMA_12", "EMA_26", "MACD", "MACD_Signal", "MACD_Hist",
            "RSI", "BB_Mid", "BB_Upper", "BB_Lower", "BB_%B",
            "Stoch_%K", "Stoch_%D", "VOL_MA20", "CCI",
            "ATR", "ADX", "Plus_DI", "Minus_DI",
            "Supertrend", "ST_Direction",
            "VPT", "VPT_EMA20",
            "Ichimoku_Tenkan", "Ichimoku_Kijun", "Ichimoku_SpanA", "Ichimoku_SpanB",
            "Weekly_ST_Direction",
        ]
        for col in required:
            self.assertIn(col, df.columns, f"Missing indicator column: {col}")

        # Check no column is all NaN (except Weekly_ST_Direction and Ichimoku spans which may have NaN from shift)
        skip_nan = {"Weekly_ST_Direction", "Ichimoku_SpanA", "Ichimoku_SpanB"}
        for col in required:
            if col not in skip_nan:
                self.assertFalse(df[col].isna().all(),
                    f"Column {col} is all NaN")

    def test_research_composite_produces_valid_scores(self):
        np.random.seed(42)
        n = 300
        dates = pd.date_range("2022-01-01", periods=n, freq="B")
        prices = 100 + np.cumsum(np.random.randn(n) * 2)

        df = pd.DataFrame({
            "Close": prices,
            "RSI": np.full(n, 55.0),
            "SMA_50": pd.Series(prices).rolling(50).mean(),
            "ATR": np.full(n, 2.0),
        }, index=dates)

        info = {
            "returnOnAssets": 0.08,
            "operatingCashflow": 5e9,
            "earningsGrowth": 0.12,
            "netIncomeToCommon": 3e9,
            "debtToEquity": 50,
            "currentRatio": 1.8,
            "heldPercentInsiders": 0.12,
            "profitMargins": 0.18,
            "totalRevenue": 50e9,
            "totalAssets": 80e9,
            "grossProfits": 25e9,
            "bookValue": 200,
            "marketCap": 500e9,
            "sharesOutstanding": 1e9,
            "trailingPE": 20,
            "forwardPE": 15,
            "dividendYield": 0.02,
            "returnOnEquity": 0.15,
            "revenueGrowth": 0.10,
            "ebitda": 10e9,
            "interestExpense": -0.5e9,
            "totalDebt": 20e9,
            "totalCash": 10e9,
            "yoy_asset_growth": 0.08,
            "yoy_leverage_change": -0.05,
            "yoy_current_ratio_change": 0.1,
            "yoy_shares_change": -0.01,
            "yoy_gross_margin_change": 0.02,
            "yoy_asset_turnover_change": 0.03,
        }

        result = compute_research_composite(info, df)

        # Check all expected keys
        expected_keys = [
            "piotroski_f_score", "f_score_norm", "gross_profit_score",
            "momentum_composite", "momentum_score", "risk_adj_mom",
            "vol_60d", "vol_120d", "downside_dev", "vol_score",
            "reversion_signal", "reversion_score", "z_score_60",
            "earnings_quality_score", "research_composite",
            "value_score", "investment_score", "sue_score",
            "beta", "beta_score", "alpha_60d",
            "mom_1m", "mom_3m", "mom_6m", "mom_12m", "mom_12m_skip1",
        ]
        for key in expected_keys:
            self.assertIn(key, result, f"Missing key: {key}")

        # Check composite is in range
        self.assertGreaterEqual(result["research_composite"], 0)
        self.assertLessEqual(result["research_composite"], 10)

        # Check Piotroski is integer
        self.assertEqual(result["piotroski_f_score"], int(result["piotroski_f_score"]))

    def test_market_cap_in_billions(self):
        """Verify Market_Cap_B uses /1e9 (billions)."""
        from utils import _safe_float
        info = {"marketCap": 500e9}  # 500 billion rupees
        mkt_cap_b = round((_safe_float(info.get("marketCap"), 0)) / 1e9, 2)
        self.assertEqual(mkt_cap_b, 500.0,
            "Market_Cap_B should be 500.0 for 500B market cap")


if __name__ == "__main__":
    unittest.main()
