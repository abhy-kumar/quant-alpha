import unittest
import numpy as np
from recommendation import compute_fund_score, get_conviction_rating

class TestScoring(unittest.TestCase):
    def test_compute_fund_score_with_sector(self):
        # Good PE compared to sector
        score = compute_fund_score(
            roe_pct=10, pe=15, fwd_pe=12, debt_eq=40,
            div_yield_pct=2.0, mkt_cap_b=20, sharpe=1.5,
            eps_growth=0.2, rev_growth=0.15,
            sector_medians={'pe': 30, 'roe': 8, 'debt_eq': 80}
        )
        self.assertTrue(score > 7.0)

    def test_compute_fund_score_without_sector(self):
        score = compute_fund_score(
            roe_pct=16, pe=18, fwd_pe=12, debt_eq=40,
            div_yield_pct=2.0, mkt_cap_b=20, sharpe=1.5,
            eps_growth=0.2, rev_growth=0.15,
            sector_medians=None
        )
        self.assertTrue(score > 7.0)

    def test_get_conviction_rating(self):
        # 95th percentile, neutral regime
        self.assertEqual(get_conviction_rating(95, 0, True), "Strong Buy")
        # 95th percentile, bearish regime (-2)
        self.assertEqual(get_conviction_rating(95, -2, True), "Buy")
        # 95th percentile, strong bullish regime (+2), threshold drops to 85
        self.assertEqual(get_conviction_rating(95, 2, True), "Strong Buy")
        # 95th percentile, weekly bearish
        self.assertEqual(get_conviction_rating(95, 0, False), "Buy")
        # Mildly bearish regime (-1): Strong Buy downgrades to Buy
        self.assertEqual(get_conviction_rating(95, -1, True), "Buy")

if __name__ == '__main__':
    unittest.main()
