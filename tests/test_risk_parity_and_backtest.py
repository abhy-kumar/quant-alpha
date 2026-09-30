"""
test_risk_parity_and_backtest.py
--------------------------------
Comprehensive unit tests for:
1. Equal Risk Contribution (Risk Parity) Portfolio Optimizer
2. Factor Information Coefficient (IC) Efficacy Monitor
3. Macro Scenario Stress-Testing Engine
4. Correlation Matrix Properties
"""

import unittest
import numpy as np
import pandas as pd
from engine.quant_engine import (
    optimize_portfolio,
    compute_factor_ic_monitor,
    compute_scenario_stress_tests,
    compute_correlation_matrix,
)


class TestRiskParityOptimization(unittest.TestCase):
    def setUp(self):
        # Create synthetic returns with 3 assets of varying volatility
        np.random.seed(42)
        n_days = 252
        ret_low_vol = np.random.normal(0.0005, 0.01, n_days)   # ~16% ann vol
        ret_med_vol = np.random.normal(0.0008, 0.02, n_days)   # ~32% ann vol
        ret_high_vol = np.random.normal(0.0012, 0.035, n_days) # ~55% ann vol

        self.returns_df = pd.DataFrame({
            "DEFENSIVE.NS": ret_low_vol,
            "BALANCED.NS": ret_med_vol,
            "VOLATILE.NS": ret_high_vol,
        })

    def test_risk_parity_weight_constraints(self):
        """Verify Risk Parity weights sum to 1.0 and are all non-negative."""
        weights = optimize_portfolio(self.returns_df, objective="risk_parity")
        
        total_weight = sum(weights.values())
        self.assertAlmostEqual(total_weight, 1.0, places=3)
        for ticker, w in weights.items():
            self.assertGreaterEqual(w, 0.0)
            self.assertLessEqual(w, 1.0)

    def test_risk_parity_inverse_volatility_behavior(self):
        """Verify lower volatility assets receive higher weight in Risk Parity."""
        weights = optimize_portfolio(self.returns_df, objective="risk_parity")
        
        # Lower volatility asset must receive higher allocation than volatile asset
        self.assertGreater(weights["DEFENSIVE.NS"], weights["VOLATILE.NS"])
        self.assertGreater(weights["BALANCED.NS"], weights["VOLATILE.NS"])

    def test_max_sharpe_and_min_vol_objectives(self):
        """Verify standard MVO objectives continue working cleanly."""
        sharpe_weights = optimize_portfolio(self.returns_df, objective="sharpe")
        min_vol_weights = optimize_portfolio(self.returns_df, objective="min_vol")
        
        self.assertAlmostEqual(sum(sharpe_weights.values()), 1.0, places=3)
        self.assertAlmostEqual(sum(min_vol_weights.values()), 1.0, places=3)


class TestFactorICMonitor(unittest.TestCase):
    def test_factor_ic_output_structure(self):
        """Verify Factor IC monitor returns structured metrics for all academic factors."""
        ic_list = compute_factor_ic_monitor()
        self.assertIsInstance(ic_list, list)
        self.assertGreaterEqual(len(ic_list), 5)

        for item in ic_list:
            self.assertIn("factor", item)
            self.assertIn("ic_current", item)
            self.assertIn("ic_3m_rolling", item)
            self.assertIn("t_stat", item)
            self.assertIn("status", item)
            self.assertTrue(item["ic_current"] is None or isinstance(item["ic_current"], float))
            self.assertTrue(item["t_stat"] is None or isinstance(item["t_stat"], float))


class TestScenarioStressTesting(unittest.TestCase):
    def test_scenario_stress_testing_output(self):
        """Verify scenario stress tests compute drawdowns for historical crises."""
        top_picks_df = pd.DataFrame({
            "Ticker": ["TCS.NS", "INFY.NS", "HDFCBANK.NS"],
            "Piotroski_F": [8, 7, 8],
            "ROE_Pct": [28.0, 22.0, 16.5],
        })
        returns_df = pd.DataFrame({
            "TCS.NS": np.random.normal(0.0005, 0.012, 100),
            "INFY.NS": np.random.normal(0.0006, 0.014, 100),
            "HDFCBANK.NS": np.random.normal(0.0004, 0.011, 100),
        })

        scenarios = compute_scenario_stress_tests(top_picks_df, returns_df)
        self.assertEqual(len(scenarios), 4)

        for s in scenarios:
            self.assertIn("event_name", s)
            self.assertIn("benchmark_shock_pct", s)
            self.assertIn("simulated_portfolio_pct", s)
            self.assertIn("factor_resilience", s)
            self.assertLess(s["benchmark_shock_pct"], 0)
            self.assertLess(s["simulated_portfolio_pct"], 0)


class TestCorrelationMatrix(unittest.TestCase):
    def test_correlation_matrix_properties(self):
        """Verify correlation matrix is square, symmetric, with 1.0 on diagonals."""
        dates = pd.date_range("2026-01-01", periods=100)
        prices = pd.DataFrame({
            "STOCKA.NS": np.cumprod(1 + np.random.normal(0.001, 0.02, 100)) * 100,
            "STOCKB.NS": np.cumprod(1 + np.random.normal(0.001, 0.02, 100)) * 100,
            "STOCKC.NS": np.cumprod(1 + np.random.normal(0.001, 0.02, 100)) * 100,
        }, index=dates)

        res = compute_correlation_matrix(prices)
        self.assertEqual(len(res["labels"]), 3)
        self.assertEqual(len(res["matrix"]), 3)

        # Check diagonal
        for i in range(3):
            self.assertAlmostEqual(res["matrix"][i][i], 1.0, places=2)

        # Check symmetry
        for i in range(3):
            for j in range(3):
                self.assertAlmostEqual(res["matrix"][i][j], res["matrix"][j][i], places=2)


if __name__ == "__main__":
    unittest.main()
