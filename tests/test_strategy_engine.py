import unittest
import numpy as np
import pandas as pd
from engine.backtest_engine import _compute_backtest_stats

class TestStrategyEngineMath(unittest.TestCase):
    def test_backtest_stats_calculation(self):
        # Create synthetic portfolio and benchmark curves
        dates = pd.date_range(start="2024-01-01", periods=252, freq="B")
        # +25% portfolio growth with steady return
        port = np.linspace(100, 125, 252) + np.random.normal(0, 0.5, 252)
        # +10% benchmark growth
        bench = np.linspace(100, 110, 252) + np.random.normal(0, 0.4, 252)
        
        df = pd.DataFrame({"date": dates, "portfolio": port, "benchmark": bench})
        stats = _compute_backtest_stats(df)

        self.assertIn("cagr", stats)
        self.assertIn("sharpe", stats)
        self.assertIn("max_drawdown", stats)
        self.assertIn("win_rate", stats)
        self.assertGreater(stats["cagr"], 0)
        self.assertGreater(stats["sharpe"], 0)

    def test_strategy_stop_loss_simulation(self):
        # Verify that max drawdown is constrained when stops are applied
        dates = pd.date_range(start="2024-01-01", periods=100, freq="B")
        # Simulating severe drawdown without stop
        raw_port = [100.0]
        for i in range(1, 100):
            ret = -0.05 if 20 <= i <= 30 else 0.01
            raw_port.append(raw_port[-1] * (1 + ret))

        df_raw = pd.DataFrame({"date": dates, "portfolio": raw_port, "benchmark": [100.0]*100})
        raw_stats = _compute_backtest_stats(df_raw)

        # Simulating same curve with stop loss dampening
        stopped_port = [100.0]
        for i in range(1, 100):
            ret = -0.05 if 20 <= i <= 30 else 0.01
            if ret < -0.02:
                ret = -0.015  # Stop loss trigger
            stopped_port.append(stopped_port[-1] * (1 + ret))

        df_stopped = pd.DataFrame({"date": dates, "portfolio": stopped_port, "benchmark": [100.0]*100})
        stopped_stats = _compute_backtest_stats(df_stopped)

        self.assertLess(abs(stopped_stats["max_drawdown"]), abs(raw_stats["max_drawdown"]))

if __name__ == "__main__":
    unittest.main()
