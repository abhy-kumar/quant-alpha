import unittest
import numpy as np
from engine.recommendation import compute_fund_score, get_conviction_rating

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
        # In the continuous sigmoid system, a good-but-not-extreme stock
        # (ROE just above 15% center, PEG=0.9, D/E well below 50) correctly
        # scores above average (>5.5) but not at the top of the range.
        self.assertTrue(score > 5.5)

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

    def test_build_output_row_tech_score_scale(self):
        from engine.scoring import build_output_row
        item = {
            "ticker": "TEST.NS",
            "sector": "Technology",
            "industry": "Software",
            "info": {"longName": "Test Tech Ltd", "news_sentiment": 0.0},
            "latest": {"Close": 100.0, "Volume": 10000},
            "prev": {"Close": 98.0},
            "tech": {"score": 0.6, "bull": 5, "bear": 1, "sig_supertrend": 1,
                     "sig_price_sma50": 1, "sig_price_sma200": 1, "sig_sma50_sma200": 1,
                     "sig_rsi": 1, "sig_macd": 0, "sig_macd_hist": 0, "sig_stoch": 0,
                     "sig_bb": 0, "sig_cci": 0, "sig_vol": 0, "sig_adx": 1, "sig_vpt": 1,
                     "sig_ichimoku": 1},
            "met": {"Total_Return_%": 15.0, "Ann_Vol_%": 20.0, "Sharpe": 1.2, "Max_Drawdown_%": -10.0},
            "is_etf": False,
            "pe": 25.0,
            "roe": 18.0,
            "debt_eq": 30.0,
            "ath": 120.0, "ath_source": "52W",
            "atl": 80.0, "atl_source": "52W",
            "fund_score": 7.0,
            "norm_tech": 8.0,
            "final_tech": 0.6,
            "composite_score": 7.5,
            "composite_score_tech": 7.8,
            "composite_score_fund": 7.2,
            "composite_score_mom": 7.6,
            "composite_score_long": 7.4,
            "conviction": "Buy",
            "research": {"research_composite": 7.2, "piotroski_f_score": 7, "value_score": 6.5,
                         "investment_score": 5.0, "sue_score": 6.0, "beta_score": 5.0},
        }
        row = build_output_row(item)
        # Tech_Score should be on 0-10 scale (8.0), not -1 to 1 (0.6)
        self.assertAlmostEqual(row["Tech_Score"], 8.0, places=1)
        self.assertAlmostEqual(row["Tech_Score_Raw"], 0.6, places=2)
        self.assertAlmostEqual(row["Fund_Score"], 7.0, places=1)
        self.assertAlmostEqual(row["Research_Score"], 7.2, places=1)
        self.assertAlmostEqual(row["Composite_Score"], 7.5, places=1)

if __name__ == '__main__':
    unittest.main()
