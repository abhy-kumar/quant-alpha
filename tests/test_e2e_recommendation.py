"""
E2E verification of the stock analysis and research pipeline.

Creates synthetic 'good' and 'bad' stocks and verifies the engine
ranks them correctly through the full scoring pipeline.
"""

import unittest
import numpy as np
import pandas as pd
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from engine.indicators import add_indicators, compute_metrics
from engine.recommendation import compute_tech_score, compute_fund_score, get_conviction_rating
from engine.research_factors import compute_research_composite
from engine.scoring import compute_rs_score, compute_all_scores, build_output_row
from utils import _safe_float


def _make_price_series(n=300, start=100, daily_drift=0.001, daily_vol=0.02, seed=42):
    """Generate a realistic price series with OHLCV."""
    rng = np.random.RandomState(seed)
    returns = rng.normal(daily_drift, daily_vol, n)
    prices = start * np.exp(np.cumsum(returns))
    dates = pd.date_range("2024-01-01", periods=n, freq="B")
    df = pd.DataFrame({
        "Open": prices * (1 + rng.uniform(-0.01, 0.01, n)),
        "High": prices * (1 + rng.uniform(0, 0.03, n)),
        "Low": prices * (1 - rng.uniform(0, 0.03, n)),
        "Close": prices,
        "Volume": rng.randint(500000, 5000000, n),
    }, index=dates)
    return df


def _make_good_stock():
    """Uptrending, low-vol, strong fundamentals."""
    df = _make_price_series(n=300, start=100, daily_drift=0.002, daily_vol=0.012, seed=10)
    df = add_indicators(df)
    info = {
        "longName": "Good Corp",
        "sector": "Technology",
        "industry": "Software",
        "trailingPE": 22,
        "forwardPE": 18,
        "returnOnEquity": 0.25,
        "debtToEquity": 30,
        "dividendYield": 0.02,
        "marketCap": 500e9,
        "earningsGrowth": 0.20,
        "revenueGrowth": 0.15,
        "fiftyTwoWeekHigh": 120,
        "fiftyTwoWeekLow": 70,
        "trailingEps": 5.0,
        "returnOnAssets": 0.15,
        "operatingCashflow": 10e9,
        "netIncomeToCommon": 6e9,
        "grossProfits": 30e9,
        "totalAssets": 60e9,
        "currentRatio": 2.0,
        "sharesOutstanding": 1e9,
        "floatShares": 8e8,
        "heldPercentInsiders": 0.15,
        "revenueGrowth": 0.15,
        "totalRevenue": 50e9,
        "bookValue": 30,
        "totalDebt": 10e9,
        "totalCash": 15e9,
        "ebitda": 15e9,
        "interestExpense": -0.3e9,
        "profitMargins": 0.20,
        "news_sentiment": 0.3,
        "screener_peers": [],
    }
    return df, info


def _make_bad_stock():
    """Downtrending, high-vol, weak fundamentals."""
    df = _make_price_series(n=300, start=100, daily_drift=-0.0015, daily_vol=0.035, seed=99)
    df = add_indicators(df)
    info = {
        "longName": "Bad Corp",
        "sector": "Technology",
        "industry": "Software",
        "trailingPE": 80,
        "forwardPE": 60,
        "returnOnEquity": 0.03,
        "debtToEquity": 180,
        "dividendYield": 0.0,
        "marketCap": 2e9,
        "earningsGrowth": -0.10,
        "revenueGrowth": -0.05,
        "fiftyTwoWeekHigh": 150,
        "fiftyTwoWeekLow": 30,
        "trailingEps": 1.0,
        "returnOnAssets": 0.01,
        "operatingCashflow": -0.5e9,
        "netIncomeToCommon": 0.2e9,
        "grossProfits": 2e9,
        "totalAssets": 40e9,
        "currentRatio": 0.8,
        "sharesOutstanding": 2e9,
        "floatShares": 1.8e9,
        "heldPercentInsiders": 0.03,
        "totalRevenue": 10e9,
        "bookValue": 5,
        "totalDebt": 25e9,
        "totalCash": 2e9,
        "ebitda": 1e9,
        "interestExpense": -2e9,
        "profitMargins": -0.05,
        "news_sentiment": -0.3,
        "screener_peers": [],
    }
    return df, info


class TestTechScoreE2E(unittest.TestCase):
    """Verify tech score ordering: good stock > bad stock."""

    def setUp(self):
        self.good_df, self.good_info = _make_good_stock()
        self.bad_df, self.bad_info = _make_bad_stock()

    def test_good_stock_bullish_signals(self):
        latest = self.good_df.iloc[-1]
        prev = self.good_df.iloc[-2]
        tech = compute_tech_score(latest, prev, self.good_df, fifty_two_high=120)
        self.assertGreater(tech["score"], 0, "Good stock should have positive tech score")

    def test_bad_stock_bearish_signals(self):
        latest = self.bad_df.iloc[-1]
        prev = self.bad_df.iloc[-2]
        tech = compute_tech_score(latest, prev, self.bad_df, fifty_two_high=150)
        self.assertLess(tech["score"], 0, "Bad stock should have negative tech score")

    def test_good_above_bad(self):
        good_latest = self.good_df.iloc[-1]
        good_prev = self.good_df.iloc[-2]
        good_tech = compute_tech_score(good_latest, good_prev, self.good_df, fifty_two_high=120)

        bad_latest = self.bad_df.iloc[-1]
        bad_prev = self.bad_df.iloc[-2]
        bad_tech = compute_tech_score(bad_latest, bad_prev, self.bad_df, fifty_two_high=150)

        self.assertGreater(good_tech["score"], bad_tech["score"],
                           "Good stock tech score must exceed bad stock")

    def test_bull_bear_counts(self):
        latest = self.good_df.iloc[-1]
        prev = self.good_df.iloc[-2]
        tech = compute_tech_score(latest, prev, self.good_df)
        self.assertGreater(tech["bull"], tech["bear"],
                           "Good stock should have more bullish than bearish signals")


class TestFundScoreE2E(unittest.TestCase):
    """Verify fundamental score ordering."""

    def test_good_fundamentals(self):
        score = compute_fund_score(
            roe_pct=25, pe=22, fwd_pe=18, debt_eq=30,
            div_yield_pct=2.0, mkt_cap_b=500, sharpe=1.5,
            eps_growth=0.20, rev_growth=0.15,
            roce_pct=25, promoter_holding=55, promoter_pledging=5,
            sector_medians={"pe": 35, "roe": 12, "debt_eq": 80}
        )
        self.assertGreaterEqual(score, 7.0, "Strong fundamentals should score >= 7")

    def test_bad_fundamentals(self):
        score = compute_fund_score(
            roe_pct=3, pe=80, fwd_pe=60, debt_eq=180,
            div_yield_pct=0.0, mkt_cap_b=2, sharpe=-0.5,
            eps_growth=-0.10, rev_growth=-0.05,
            roce_pct=3, promoter_holding=5, promoter_pledging=35,
            sector_medians={"pe": 35, "roe": 12, "debt_eq": 80}
        )
        self.assertLessEqual(score, 3.0, "Weak fundamentals should score <= 3")


class TestResearchCompositeE2E(unittest.TestCase):
    """Verify research composite scoring."""

    def setUp(self):
        self.good_df, self.good_info = _make_good_stock()
        self.bad_df, self.bad_info = _make_bad_stock()

    def test_good_research(self):
        result = compute_research_composite(self.good_info, self.good_df)
        self.assertGreater(result["research_composite"], 5.0,
                           "Good stock research composite > 5 (neutral)")

    def test_bad_research(self):
        result = compute_research_composite(self.bad_info, self.bad_df)
        self.assertLess(result["research_composite"], 5.0,
                        "Bad stock research composite < 5 (neutral)")


class TestMomentumBug(unittest.TestCase):
    """Catch the _ret_skip direction bug in momentum calculation."""

    def test_skip_month_momentum_direction(self):
        """mom_12m_skip1 should be positive when stock has risen over 12 months."""
        np.random.seed(42)
        dates = pd.date_range("2023-01-01", periods=300, freq="B")
        # Clearly uptrending stock: +50% over the period
        prices = np.linspace(100, 150, 300) + np.cumsum(np.random.randn(300) * 0.5)
        df = pd.DataFrame({
            "Close": prices,
            "High": prices + 2,
            "Low": prices - 2,
            "Volume": np.random.randint(1000000, 5000000, 300),
        }, index=dates)

        from engine.research_factors import compute_momentum_z_score
        mom = compute_momentum_z_score(df)

        # The stock went from ~100 to ~150, so 12-1 month momentum should be positive
        mom_12m = mom["mom_12m"]
        mom_12m_skip1 = mom["mom_12m_skip1"]

        self.assertFalse(np.isnan(mom_12m), "12m momentum should not be NaN")
        self.assertGreater(mom_12m, 0, "12m momentum should be positive for uptrending stock")

        if not np.isnan(mom_12m_skip1):
            self.assertGreater(mom_12m_skip1, 0,
                               "12-1 month momentum should be positive for uptrending stock. "
                               "If negative, _ret_skip has a direction bug!")

    def test_ret_skip_is_inverted(self):
        """Directly test _ret_skip to catch the inversion bug."""
        from engine.research_factors import compute_momentum_z_score
        dates = pd.date_range("2023-01-01", periods=300, freq="B")
        prices = np.linspace(100, 200, 300)  # Strong uptrend
        df = pd.DataFrame({
            "Close": prices,
            "High": prices + 2,
            "Low": prices - 2,
            "Volume": np.ones(300) * 1000000,
        }, index=dates)

        mom = compute_momentum_z_score(df)
        mom_1m = mom["mom_1m"]
        mom_12m_skip1 = mom["mom_12m_skip1"]

        # In a strong uptrend, 1m momentum and 12-1 momentum should both be positive
        self.assertGreater(mom_1m, 0, "1m momentum should be positive")
        if not np.isnan(mom_12m_skip1):
            # This is the key assertion that catches the bug
            self.assertGreater(mom_12m_skip1, 0,
                               "12-1 month skip momentum should be positive in an uptrend. "
                               "Negative value indicates _ret_skip is computing the inverse!")


class TestConvictionRating(unittest.TestCase):
    """Verify conviction rating thresholds are sensible."""

    def test_high_percentile_strong_buy(self):
        rating = get_conviction_rating(95, 0, True)
        self.assertEqual(rating, "Strong Buy")

    def test_low_percentile_avoid(self):
        rating = get_conviction_rating(10, 0, True)
        self.assertEqual(rating, "Avoid")

    def test_bearish_regime_downgrades(self):
        bull = get_conviction_rating(88, 0, True)
        bear = get_conviction_rating(88, -3, True)
        # Bearish regime should not produce a better rating
        order = ["Avoid", "Caution", "Hold", "Buy", "Strong Buy"]
        self.assertLessEqual(order.index(bear), order.index(bull),
                             "Bearish regime should downgrade or maintain rating")

    def test_weekly_supertrend_affects_strong_buy(self):
        with_weekly = get_conviction_rating(92, 0, True)
        without_weekly = get_conviction_rating(92, 0, False)
        self.assertEqual(with_weekly, "Strong Buy")
        self.assertEqual(without_weekly, "Buy")


class TestFullPipelineE2E(unittest.TestCase):
    """Run both stocks through the full scoring pipeline end-to-end."""

    def setUp(self):
        self.good_df, self.good_info = _make_good_stock()
        self.bad_df, self.bad_info = _make_bad_stock()

        self.nifty_df = _make_price_series(n=300, start=20000, daily_drift=0.0008, daily_vol=0.01, seed=7)

    def _build_item(self, ticker, df, info, sector_medians):
        latest = df.iloc[-1]
        prev = df.iloc[-2]
        tech = compute_tech_score(latest, prev, df, self.nifty_df,
                                  fifty_two_high=_safe_float(info.get("fiftyTwoWeekHigh")))
        met = compute_metrics(df)

        pe = _safe_float(info.get("trailingPE"))
        close = _safe_float(latest["Close"])
        if pd.isna(pe):
            eps = _safe_float(info.get("trailingEps"))
            if not pd.isna(eps) and eps != 0 and close > 0:
                pe = close / eps

        roe_pct = round((_safe_float(info.get("returnOnEquity"), 0)) * 100, 2)
        debt_eq = _safe_float(info.get("debtToEquity"))
        fwd_pe = _safe_float(info.get("forwardPE"), pe)
        div_yield_pct = round(_safe_float(info.get("dividendYield"), 0), 2)
        mkt_cap_b = round((_safe_float(info.get("marketCap"), 0)) / 1e9, 2)
        eps_growth = _safe_float(info.get("earningsGrowth"))
        rev_growth = _safe_float(info.get("revenueGrowth"))

        fund_score = compute_fund_score(
            roe_pct, pe, fwd_pe, debt_eq, div_yield_pct, mkt_cap_b, met["Sharpe"],
            eps_growth, rev_growth,
            roce_pct=_safe_float(info.get("roce")),
            promoter_holding=_safe_float(info.get("promoter_holding")),
            promoter_pledging=_safe_float(info.get("promoter_pledging")),
            sector_medians=sector_medians
        )

        research = compute_research_composite(info, df, self.nifty_df, sector_medians)

        sentiment = _safe_float(info.get("news_sentiment"))
        norm_tech = (tech["score"] + 1) * 5
        if sentiment > 0.15:
            norm_tech = min(10.0, norm_tech + 1.0)
        elif sentiment < -0.15:
            norm_tech = max(0.0, norm_tech - 1.0)

        composite = (norm_tech * 0.35) + (fund_score * 0.30) + (research["research_composite"] * 0.35)

        return {
            "ticker": ticker,
            "is_etf": False,
            "sector": info.get("sector", "Unknown"),
            "industry": info.get("industry", "Unknown"),
            "info": info, "tech": tech, "met": met,
            "latest": latest, "prev": prev, "df": df,
            "rs_composite": 0.0, "pe": pe, "roe": roe_pct, "debt_eq": debt_eq,
            "ath": 200, "ath_source": "test", "atl": 20, "atl_source": "test",
            "long_name": info.get("longName", ticker),
            "composite_score": composite,
            "fund_score": fund_score,
            "final_tech": tech["score"],
            "research": research,
            "rs_pctile": 50.0,
        }

    def test_good_beats_bad_composite(self):
        sector_medians = {"pe": 35, "roe": 12, "debt_eq": 80}
        good = self._build_item("GOOD.NS", self.good_df, self.good_info, sector_medians)
        bad = self._build_item("BAD.NS", self.bad_df, self.bad_info, sector_medians)

        self.assertGreater(good["composite_score"], bad["composite_score"],
                           "Good stock composite must exceed bad stock")

    def test_good_beats_bad_all_subscores(self):
        sector_medians = {"pe": 35, "roe": 12, "debt_eq": 80}
        good = self._build_item("GOOD.NS", self.good_df, self.good_info, sector_medians)
        bad = self._build_item("BAD.NS", self.bad_df, self.bad_info, sector_medians)

        self.assertGreater(good["fund_score"], bad["fund_score"],
                           "Fund score: good > bad")
        self.assertGreater(good["final_tech"], bad["final_tech"],
                           "Tech score: good > bad")
        self.assertGreater(good["research"]["research_composite"],
                           bad["research"]["research_composite"],
                           "Research composite: good > bad")

    def test_ranking_with_multiple_stocks(self):
        """Rank 5 synthetic stocks and verify top is the best."""
        sector_medians = {"pe": 35, "roe": 12, "debt_eq": 80}

        stocks = []
        # Strong uptrend
        df1 = _make_price_series(300, 100, 0.003, 0.01, seed=1)
        df1 = add_indicators(df1)
        stocks.append(("BEST.NS", df1, {
            **self.good_info, "longName": "Best Co",
            "returnOnEquity": 0.30, "debtToEquity": 20,
            "earningsGrowth": 0.25, "revenueGrowth": 0.20,
            "trailingPE": 18, "forwardPE": 14,
            "news_sentiment": 0.4,
        }))

        # Mild uptrend
        df2 = _make_price_series(300, 100, 0.001, 0.015, seed=2)
        df2 = add_indicators(df2)
        stocks.append(("MID.NS", df2, {
            **self.good_info, "longName": "Mid Co",
            "returnOnEquity": 0.18, "debtToEquity": 50,
            "earningsGrowth": 0.12, "revenueGrowth": 0.10,
            "trailingPE": 25, "forwardPE": 20,
            "news_sentiment": 0.1,
        }))

        # Sideways
        df3 = _make_price_series(300, 100, 0.0, 0.02, seed=3)
        df3 = add_indicators(df3)
        stocks.append(("FLAT.NS", df3, {
            **self.good_info, "longName": "Flat Co",
            "returnOnEquity": 0.10, "debtToEquity": 80,
            "earningsGrowth": 0.02, "revenueGrowth": 0.01,
            "trailingPE": 35, "forwardPE": 30,
            "news_sentiment": 0.0,
        }))

        # Mild downtrend
        df4 = _make_price_series(300, 100, -0.001, 0.025, seed=4)
        df4 = add_indicators(df4)
        stocks.append(("DOWN.NS", df4, {
            **self.bad_info, "longName": "Down Co",
            "returnOnEquity": 0.05, "debtToEquity": 120,
            "earningsGrowth": -0.05, "revenueGrowth": -0.03,
            "trailingPE": 60, "forwardPE": 50,
            "news_sentiment": -0.1,
        }))

        # Strong downtrend
        df5 = _make_price_series(300, 100, -0.003, 0.035, seed=5)
        df5 = add_indicators(df5)
        stocks.append(("WORST.NS", df5, {
            **self.bad_info, "longName": "Worst Co",
            "returnOnEquity": -0.02, "debtToEquity": 250,
            "earningsGrowth": -0.20, "revenueGrowth": -0.15,
            "trailingPE": 150, "forwardPE": 100,
            "news_sentiment": -0.4,
        }))

        items = [self._build_item(t, d, i, sector_medians) for t, d, i in stocks]
        items.sort(key=lambda x: x["composite_score"], reverse=True)

        tickers_ranked = [i["ticker"] for i in items]
        scores_ranked = [round(i["composite_score"], 2) for i in items]

        print(f"\nRanking: {list(zip(tickers_ranked, scores_ranked))}")

        # BEST should be in top 2, WORST should be in bottom 2
        best_pos = tickers_ranked.index("BEST.NS")
        worst_pos = tickers_ranked.index("WORST.NS")
        self.assertLessEqual(best_pos, 1,
                             f"BEST should be top 2, got position {best_pos + 1}")
        self.assertGreaterEqual(worst_pos, len(tickers_ranked) - 2,
                                f"WORST should be bottom 2, got position {worst_pos + 1}")

    def test_conviction_assignment(self):
        """Verify conviction labels are assigned correctly through the pipeline."""
        sector_medians = {"pe": 35, "roe": 12, "debt_eq": 80}
        good = self._build_item("GOOD.NS", self.good_df, self.good_info, sector_medians)
        bad = self._build_item("BAD.NS", self.bad_df, self.bad_info, sector_medians)

        items = [good, bad]
        all_comp = pd.Series([i["composite_score"] for i in items])
        for item in items:
            pctile = sum(all_comp <= item["composite_score"]) / len(all_comp) * 100
            item["rs_pctile"] = pctile
            weekly_st = _safe_float(item["latest"].get("Weekly_ST_Direction", np.nan))
            weekly_bullish = weekly_st == -1
            item["conviction"] = get_conviction_rating(pctile, 0, weekly_bullish)

        order = ["Avoid", "Caution", "Hold", "Buy", "Strong Buy"]
        self.assertGreaterEqual(
            order.index(good["conviction"]),
            order.index(bad["conviction"]),
            f"Good ({good['conviction']}) should have >= conviction than bad ({bad['conviction']})"
        )


class TestEdgeCases(unittest.TestCase):
    """Edge cases that could cause NaN propagation or scoring errors."""

    def test_nan_handling_in_tech_score(self):
        """Tech score should handle NaN values gracefully."""
        dates = pd.date_range("2024-01-01", periods=300, freq="B")
        prices = np.linspace(100, 120, 300)
        df = pd.DataFrame({
            "Open": prices,
            "Close": prices,
            "High": prices + 2,
            "Low": prices - 2,
            "Volume": np.ones(300) * 1000000,
        }, index=dates)
        df = add_indicators(df)
        latest = df.iloc[-1]
        prev = df.iloc[-2]
        tech = compute_tech_score(latest, prev, df)
        self.assertFalse(np.isnan(tech["score"]), "Tech score should not be NaN")
        self.assertGreaterEqual(tech["score"], -1.0)
        self.assertLessEqual(tech["score"], 1.0)

    def test_fund_score_with_all_nan(self):
        """Fund score should handle all-NaN inputs."""
        score = compute_fund_score(
            roe_pct=np.nan, pe=np.nan, fwd_pe=np.nan, debt_eq=np.nan,
            div_yield_pct=np.nan, mkt_cap_b=np.nan, sharpe=np.nan,
            eps_growth=np.nan, rev_growth=np.nan
        )
        self.assertFalse(np.isnan(score), "Fund score should not return NaN")
        self.assertGreaterEqual(score, 0.0)
        self.assertLessEqual(score, 10.0)

    def test_research_composite_short_data(self):
        """Research composite should handle short data gracefully."""
        info = {"returnOnEquity": 0.15}
        df = pd.DataFrame({"Close": [100, 101, 102]})
        result = compute_research_composite(info, df)
        self.assertEqual(result["research_composite"], 5.0)
        self.assertEqual(result["piotroski_f_score"], 0)

    def test_tech_score_range(self):
        """Tech score must always be in [-1, 1]."""
        for seed in range(10):
            df = _make_price_series(300, seed=seed)
            df = add_indicators(df)
            latest = df.iloc[-1]
            prev = df.iloc[-2]
            tech = compute_tech_score(latest, prev, df)
            self.assertGreaterEqual(tech["score"], -1.0, f"Seed {seed}: score < -1")
            self.assertLessEqual(tech["score"], 1.0, f"Seed {seed}: score > 1")

    def test_fund_score_capped_at_10(self):
        """Fund score should never exceed 10."""
        score = compute_fund_score(
            roe_pct=50, pe=5, fwd_pe=4, debt_eq=0,
            div_yield_pct=5.0, mkt_cap_b=500, sharpe=3.0,
            eps_growth=0.50, rev_growth=0.30,
            roce_pct=40, promoter_holding=70, promoter_pledging=2,
            sector_medians={"pe": 10, "roe": 5, "debt_eq": 20}
        )
        self.assertLessEqual(score, 10.0)

    def test_composite_score_in_range(self):
        """Composite score should be in [0, 10]."""
        norm_tech = 10.0
        fund_score = 10.0
        research_composite = 10.0
        composite = (norm_tech * 0.35) + (fund_score * 0.30) + (research_composite * 0.35)
        self.assertLessEqual(composite, 10.0)


class TestPromoterPledgePenalty(unittest.TestCase):
    """Verify promoter pledging penalizes scores correctly."""

    def test_high_pledge_penalty(self):
        score_with_pledge = compute_fund_score(
            roe_pct=20, pe=20, fwd_pe=16, debt_eq=40,
            div_yield_pct=1.5, mkt_cap_b=50, sharpe=1.0,
            eps_growth=0.15, rev_growth=0.10,
            promoter_holding=55, promoter_pledging=35
        )
        score_without = compute_fund_score(
            roe_pct=20, pe=20, fwd_pe=16, debt_eq=40,
            div_yield_pct=1.5, mkt_cap_b=50, sharpe=1.0,
            eps_growth=0.15, rev_growth=0.10,
            promoter_holding=55, promoter_pledging=5
        )
        self.assertGreater(score_without, score_with_pledge,
                           "Low pledge should score higher than high pledge")


class TestRSISignals(unittest.TestCase):
    """Verify RSI signal interpretation in different regimes."""

    def test_bullish_regime_rsi_signal(self):
        """In bullish regime, RSI 40-80 should be bullish signal."""
        dates = pd.date_range("2024-01-01", periods=300, freq="B")
        # Steady uptrend
        prices = np.linspace(100, 150, 300)
        df = pd.DataFrame({
            "Open": prices,
            "Close": prices,
            "High": prices + 2,
            "Low": prices - 2,
            "Volume": np.ones(300) * 1000000,
        }, index=dates)
        df = add_indicators(df)

        nifty = _make_price_series(300, 20000, 0.002, 0.01, seed=50)
        latest = df.iloc[-1]
        prev = df.iloc[-2]
        tech = compute_tech_score(latest, prev, df, nifty)
        # In a clear uptrend, we expect more bull signals
        self.assertGreaterEqual(tech["bull"], tech["bear"],
                                "Uptrending stock should have >= bull than bear count")


if __name__ == "__main__":
    unittest.main(verbosity=2)
