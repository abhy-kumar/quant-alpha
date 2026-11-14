import numpy as np
import pandas as pd
import pytest
from data_pipeline.price_repair import repair_discontinuities, repair_long
from engine.ranking import raw_factors


def history(n=300, price=100.0):
    dates = pd.bdate_range('2025-01-01', periods=n)
    close = pd.Series(price, index=dates) * (1.001 ** np.arange(n))
    return pd.DataFrame({'Open': close, 'High': close * 1.01, 'Low': close * .99, 'Close': close, 'Volume': 1000.0})


def test_unadjusted_demerger_is_back_adjusted_and_traded_value_kept():
    frame = history()
    before = frame.copy()
    frame.iloc[:200, :4] *= 2.85          # earlier bars still on the pre-demerger basis
    fixed = repair_discontinuities(frame)
    pd.testing.assert_frame_equal(fixed[['Open', 'High', 'Low', 'Close']], before[['Open', 'High', 'Low', 'Close']], rtol=3e-3)
    assert (fixed.Close * fixed.Volume).iloc[:200].values == pytest.approx((frame.Close * frame.Volume).iloc[:200].values)
    assert fixed.Close.pct_change().abs().max() < .01
    pd.testing.assert_frame_equal(repair_discontinuities(fixed), fixed)   # idempotent


def test_real_crash_that_opens_inside_the_exchange_band_is_preserved():
    frame = history()
    frame.iloc[200:, :4] *= .70           # falls 30% ...
    frame.iloc[200, frame.columns.get_loc('Open')] = frame.Close.iloc[199] * .90   # ... after opening -10%
    frame.iloc[200, frame.columns.get_loc('High')] = frame.Open.iloc[200]
    pd.testing.assert_frame_equal(repair_discontinuities(frame), frame)


def test_bad_holiday_bar_pair_cancels_out():
    frame = history()
    frame.iloc[150, :4] *= 2.0            # doubled bar, back to normal next session
    fixed = repair_discontinuities(frame)
    assert fixed.Close.iloc[149] == pytest.approx(frame.Close.iloc[149], rel=5e-3)
    assert fixed.Close.iloc[151:].equals(frame.Close.iloc[151:])
    assert fixed.Close.pct_change().abs().max() < .01


def test_relisting_after_long_suspension_is_not_adjusted():
    frame = history()
    frame = pd.concat([frame.iloc[:150], frame.iloc[200:] * [.5, .5, .5, .5, 1]])
    pd.testing.assert_frame_equal(repair_discontinuities(frame), frame)


def test_missing_open_uses_wider_close_to_close_limits():
    frame = history()
    frame.iloc[:200, :4] *= 2.0
    frame['Open'] = np.nan
    assert repair_discontinuities(frame).Close.pct_change().abs().max() < .01
    mild = history(); mild.iloc[:200, :4] *= 1.3; mild['Open'] = np.nan   # -23% close-to-close could be real
    pd.testing.assert_frame_equal(repair_discontinuities(mild), mild)


def test_long_table_matches_single_frame_repair():
    a, b = history(), history(price=50.0)
    a.iloc[:200, :4] *= 3.0
    table = pd.concat([f.rename_axis('Date').reset_index().assign(Ticker=t) for t, f in (('A.NS', a), ('B.NS', b))])
    table['Date'] = table.Date.dt.strftime('%Y-%m-%d')
    fixed = repair_long(table.sample(frac=1, random_state=1))
    got = fixed[fixed.Ticker == 'A.NS'].set_index('Date').Close
    assert got.values == pytest.approx(repair_discontinuities(a).Close.values)
    assert fixed[fixed.Ticker == 'B.NS'].set_index('Date').Close.values == pytest.approx(b.Close.values)


def test_ranking_momentum_no_longer_reads_a_demerger_as_a_crash():
    frame = history()
    frame.iloc[:200, :4] *= 2.85
    item = {'info': {}, 'sector': 'Industrials', 'latest': {'Close': frame.Close.iloc[-1]}}
    broken, _, _ = raw_factors({**item, 'df': frame})
    fixed, _, _ = raw_factors({**item, 'df': repair_discontinuities(frame)})
    assert broken['mom12'] < -.5 and broken['trend200'] < -.2
    assert 0 < fixed['mom12'] < .35 and 0 < fixed['trend200'] < .15
