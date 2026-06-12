import unittest
import pandas as pd
import numpy as np
from indicators import _wilder_smoothing, _add_vpt, _add_ichimoku

class TestIndicators(unittest.TestCase):
    def test_wilder_smoothing(self):
        # Seed with SMA, then exponential
        data = pd.Series([10, 10, 10, 10, 10, 20])
        # period = 5
        smoothed = _wilder_smoothing(data, 5)
        self.assertTrue(np.isnan(smoothed.iloc[0]))
        self.assertEqual(smoothed.iloc[4], 10.0) # SMA of first 5
        self.assertEqual(smoothed.iloc[5], (10.0 * 4 + 20) / 5) # Wilder's

    def test_add_vpt(self):
        df = pd.DataFrame({
            "Close": [100, 110, 105], # +10%, -4.54%
            "Volume": [1000, 2000, 1500]
        })
        df = _add_vpt(df)
        self.assertTrue("VPT" in df.columns)
        self.assertTrue("VPT_EMA20" in df.columns)
        self.assertAlmostEqual(df["VPT"].iloc[0], 0.0)
        self.assertAlmostEqual(df["VPT"].iloc[1], 2000 * 0.1)

    def test_add_ichimoku(self):
        df = pd.DataFrame({
            "High": np.random.rand(100) * 100 + 50,
            "Low": np.random.rand(100) * 50
        })
        df = _add_ichimoku(df)
        self.assertTrue("Ichimoku_Tenkan" in df.columns)
        self.assertTrue("Ichimoku_Kijun" in df.columns)
        self.assertTrue("Ichimoku_SpanA" in df.columns)
        self.assertTrue("Ichimoku_SpanB" in df.columns)

if __name__ == '__main__':
    unittest.main()
