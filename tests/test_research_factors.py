import unittest
import numpy as np
import pandas as pd
from research_factors import (
    compute_piotroski_f_score,
    compute_gross_profitability,
    compute_momentum_z_score,
    compute_volatility_factor,
    compute_mean_reversion_signal,
    compute_earnings_quality,
    compute_research_composite,
)


class TestPiotroskiFScore(unittest.TestCase):
    def test_strong_company(self):
        info = {
            "returnOnEquity": 0.18,
            "operatingCashflow": 5000000000,
            "earningsGrowth": 0.12,
            "netIncomeToCommon": 3000000000,
            "debtToEquity": 40,
            "currentRatio": 2.0,
            "sharesOutstanding": 1e9,
            "heldPercentInsiders": 0.15,
            "revenueGrowth": 0.10,
            "totalRevenue": 100e9,
            "totalAssets": 80e9,
        }
        df = pd.DataFrame({"Close": np.random.rand(100) * 100 + 50})
        score = compute_piotroski_f_score(info, df)
        self.assertGreaterEqual(score, 7)

    def test_weak_company(self):
        info = {
            "returnOnEquity": -0.05,
            "operatingCashflow": -1000000000,
            "earningsGrowth": -0.20,
            "netIncomeToCommon": 500000000,
            "debtToEquity": 200,
            "currentRatio": 0.8,
            "sharesOutstanding": 1e9,
            "heldPercentInsiders": 0.02,
            "revenueGrowth": -0.15,
            "totalRevenue": 50e9,
            "totalAssets": 100e9,
        }
        df = pd.DataFrame({"Close": np.random.rand(100) * 100 + 50})
        score = compute_piotroski_f_score(info, df)
        self.assertLessEqual(score, 4)

    def test_range(self):
        info = {}
        df = pd.DataFrame({"Close": [100]})
        score = compute_piotroski_f_score(info, df)
        self.assertGreaterEqual(score, 0)
        self.assertLessEqual(score, 9)


class TestGrossProfitability(unittest.TestCase):
    def test_high_gp(self):
        info = {"grossProfits": 50e9, "totalAssets": 80e9}
        score = compute_gross_profitability(info)
        self.assertEqual(score, 10.0)  # 50/80 = 0.625 >= 0.50

    def test_low_gp(self):
        info = {"grossProfits": 2e9, "totalAssets": 80e9}
        score = compute_gross_profitability(info)
        self.assertEqual(score, 0.0)

    def test_missing_data(self):
        info = {}
        score = compute_gross_profitability(info)
        self.assertTrue(np.isnan(score))


class TestMomentumZScore(unittest.TestCase):
    def setUp(self):
        np.random.seed(42)
        dates = pd.date_range("2023-01-01", periods=300, freq="B")
        prices = 100 + np.cumsum(np.random.randn(300) * 2)
        self.df = pd.DataFrame({
            "Close": prices,
            "High": prices + 1,
            "Low": prices - 1,
            "Volume": np.random.randint(1000000, 5000000, 300),
        }, index=dates)

    def test_returns_dict_keys(self):
        result = compute_momentum_z_score(self.df)
        self.assertIn("mom_1m", result)
        self.assertIn("mom_12m", result)
        self.assertIn("composite_mom", result)

    def test_momentum_range(self):
        result = compute_momentum_z_score(self.df)
        if not np.isnan(result["mom_1m"]):
            self.assertGreater(result["mom_1m"], -1.0)
            self.assertLess(result["mom_1m"], 5.0)


class TestVolatilityFactor(unittest.TestCase):
    def setUp(self):
        np.random.seed(42)
        dates = pd.date_range("2023-01-01", periods=200, freq="B")
        prices = 100 + np.cumsum(np.random.randn(200) * 1)
        self.df = pd.DataFrame({
            "Close": prices,
            "ATR": np.full(200, 2.0),
        }, index=dates)

    def test_low_vol_score(self):
        result = compute_volatility_factor(self.df)
        self.assertIn("vol_score", result)
        self.assertGreaterEqual(result["vol_score"], 0)
        self.assertLessEqual(result["vol_score"], 10)

    def test_vol_metrics(self):
        result = compute_volatility_factor(self.df)
        self.assertIn("vol_20d", result)
        self.assertIn("vol_60d", result)
        self.assertIn("max_drawdown", result)


class TestMeanReversion(unittest.TestCase):
    def setUp(self):
        np.random.seed(42)
        dates = pd.date_range("2023-01-01", periods=100, freq="B")
        prices = 100 + np.cumsum(np.random.randn(100) * 1)
        self.df = pd.DataFrame({
            "Close": prices,
            "RSI": np.full(100, 50.0),
            "SMA_50": pd.Series(prices).rolling(50).mean(),
        }, index=dates)

    def test_returns_dict(self):
        result = compute_mean_reversion_signal(self.df)
        self.assertIn("reversion_signal", result)
        self.assertIn("reversion_score", result)
        self.assertIn("z_score_60", result)

    def test_signal_values(self):
        result = compute_mean_reversion_signal(self.df)
        self.assertIn(result["reversion_signal"], [-1, 0, 1])


class TestEarningsQuality(unittest.TestCase):
    def test_high_quality(self):
        info = {
            "operatingCashflow": 10e9,
            "netIncomeToCommon": 6e9,
            "totalRevenue": 50e9,
            "totalAssets": 40e9,
            "ebitda": 12e9,
            "interestExpense": -0.5e9,
        }
        score = compute_earnings_quality(info)
        self.assertGreaterEqual(score, 7.0)

    def test_low_quality(self):
        info = {
            "operatingCashflow": 1e9,
            "netIncomeToCommon": 5e9,
            "totalRevenue": 50e9,
            "totalAssets": 100e9,
            "ebitda": 2e9,
            "interestExpense": -3e9,
        }
        score = compute_earnings_quality(info)
        self.assertLessEqual(score, 3.0)


class TestResearchComposite(unittest.TestCase):
    def test_etf_fallback(self):
        info = {}
        df = pd.DataFrame({"Close": [100, 101, 102], "RSI": [50, 50, 50]})
        result = compute_research_composite(info, df)
        self.assertIn("research_composite", result)
        self.assertGreaterEqual(result["research_composite"], 0)
        self.assertLessEqual(result["research_composite"], 10)

    def test_full_computation(self):
        np.random.seed(42)
        dates = pd.date_range("2023-01-01", periods=300, freq="B")
        prices = 100 + np.cumsum(np.random.randn(300) * 2)
        df = pd.DataFrame({
            "Close": prices,
            "RSI": np.full(300, 55.0),
            "SMA_50": pd.Series(prices).rolling(50).mean(),
            "ATR": np.full(300, 2.0),
        }, index=dates)
        info = {
            "returnOnEquity": 0.15,
            "operatingCashflow": 5e9,
            "netIncomeToCommon": 3e9,
            "grossProfits": 30e9,
            "totalAssets": 60e9,
        }
        result = compute_research_composite(info, df)
        self.assertGreaterEqual(result["research_composite"], 0)
        self.assertLessEqual(result["research_composite"], 10)


if __name__ == '__main__':
    unittest.main()
