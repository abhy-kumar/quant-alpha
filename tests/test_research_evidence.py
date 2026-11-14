"""Factor evidence, the live track record and the regime numbers shown in Quant Lab."""
import json
import sqlite3

import numpy as np
import pandas as pd
import pytest

from engine import factor_research, track_record


def synthetic_frames(days=700, stocks=60, seed=7):
    """Each stock has a persistent drift, so past winners keep winning: momentum is real here."""
    rng = np.random.default_rng(seed)
    dates = pd.bdate_range('2023-01-02', periods=days)
    drift = rng.normal(0, .0012, stocks)
    frames = {}
    for i in range(stocks):
        close = 100 * np.exp(np.cumsum(drift[i] + rng.normal(0, .012, days)))
        frames[f'S{i:02d}.NS'] = pd.DataFrame({'Open': close, 'High': close, 'Low': close, 'Close': close,
                                              'Volume': 5e6}, index=dates)
    market = 20000 * np.exp(np.cumsum(rng.normal(.0003, .008, days)))
    frames['^NSEI'] = pd.DataFrame({'Open': market, 'High': market, 'Low': market, 'Close': market, 'Volume': 0}, index=dates)
    frames['GOLDBEES.NS'] = frames['S00.NS'].copy()
    return frames


@pytest.fixture(scope='module')
def report():
    return factor_research.study(factor_research.panel_from_frames(synthetic_frames()), source='test')


def test_study_detects_a_planted_factor_and_is_publishable(report):
    json.dumps(report, allow_nan=False)
    by_id = {factor['id']: factor for factor in report['factors']}
    assert set(by_id) == set(factor_research.FACTORS)
    assert by_id['mom12_1']['h21']['ic'] > .05 and by_id['mom12_1']['verdict'] == 'Supported'
    assert by_id['volume_trend']['verdict'] != 'Supported'          # volume is constant: no information
    assert report['universe']['stocks'] == 60                       # ETF and index excluded
    assert by_id['volume_trend']['h21'] is None and by_id['volume_trend']['verdict'] == 'Not enough history'
    assert all('adds_to_model' in factor for factor in report['factors'] if not factor['in_model'] and factor['h21'])
    assert report['model']['short']['top20']['periods'] > 5


def test_signals_never_use_the_entry_day_or_later():
    frames = synthetic_frames(days=420, stocks=45)
    panel = factor_research.panel_from_frames(frames)
    valid = factor_research.eligibility(panel)
    cut = panel['close'].index[330]
    before = factor_research.percentile(factor_research.raw_factors(panel)['mom12_1'], valid).loc[cut]
    for frame in frames.values():                                   # rewrite everything after the cut
        frame.loc[frame.index > cut, ['Open', 'High', 'Low', 'Close']] *= 1.5
    panel = factor_research.panel_from_frames(frames)
    # A +50% step is a repaired discontinuity for stocks, so past values rescale but ranks cannot move.
    after = factor_research.percentile(factor_research.raw_factors(panel)['mom12_1'], factor_research.eligibility(panel)).loc[cut]
    pd.testing.assert_series_equal(before, after)


def test_verdict_rules_are_strict():
    strong = {'ic': .06, 't': 3.4, 'first_half': .05, 'second_half': .07}
    assert factor_research.verdict(strong, {'ic': .05}) == 'Supported'
    assert factor_research.verdict(strong, {'ic': -.02}) == 'Promising'           # horizons disagree
    assert factor_research.verdict({**strong, 'second_half': -.01}, {'ic': .05}) == 'Unstable'
    assert factor_research.verdict({**strong, 't': 1.2}, {'ic': .05}) == 'Not supported'
    assert factor_research.verdict(None, None) == 'Not enough history'


def test_runner_falls_back_to_database_when_the_fetch_is_thin(tmp_path, monkeypatch):
    from scripts import run_factor_research as runner
    database = tmp_path / 'scans.db'
    with sqlite3.connect(database) as conn:
        conn.execute('CREATE TABLE daily_ohlcv (Ticker, Date, Open, High, Low, Close, Volume)')
        conn.execute('CREATE TABLE historical_scans (Ticker, Sector, Scan_Date)')
        conn.executemany('INSERT INTO daily_ohlcv VALUES (?,?,1,1,1,1,1)', [(f'S{i}.NS', '2026-01-01') for i in range(10)])
    monkeypatch.setattr(runner.factor_research, 'panel_from_database', lambda path: 'database-panel')
    monkeypatch.setattr(runner.factor_research, 'study', lambda panel, source: {
        'source': source, 'span': {'years': 2}, 'factors': [], 'universe': {}, 'panel': panel})
    monkeypatch.setattr(runner.factor_research, 'write', lambda report, path: None)
    thin = runner.main(['--database', str(database)], fetch=lambda symbols, period: {'^NSEI': 1, 'S0.NS': 1})
    assert thin['source'] == '2-year database' and thin['panel'] == 'database-panel'
    broken = runner.main(['--database', str(database)], fetch=lambda symbols, period: 1 / 0)
    assert broken['source'] == '2-year database'


def test_track_record_buys_next_close_and_separates_model_versions(tmp_path):
    database = tmp_path / 'scans.db'
    dates = pd.bdate_range('2026-06-01', periods=60).strftime('%Y-%m-%d')
    with sqlite3.connect(database) as conn:
        conn.execute('CREATE TABLE daily_ohlcv (Ticker, Date, Open, High, Low, Close, Volume)')
        conn.execute('CREATE TABLE ranking_history (Scan_Date, Ticker, Model_Version, Payload)')
        conn.execute('CREATE TABLE outcome_tracking (Ticker, Scan_Date, Conviction_At_Scan)')
        for i, day in enumerate(dates):
            conn.execute('INSERT INTO daily_ohlcv VALUES (?,?,?,?,?,?,1)', ('^NSEI', day, 100, 100, 100, 100))
            conn.execute('INSERT INTO daily_ohlcv VALUES (?,?,?,?,?,?,1)', ('UP.NS', day, *[100 + i] * 4))
            conn.execute('INSERT INTO daily_ohlcv VALUES (?,?,?,?,?,?,1)', ('DOWN.NS', day, *[200 - i] * 4))
        for ticker, label in (('UP.NS', 'Strong Buy'), ('DOWN.NS', 'Avoid')):
            for stamp in (dates[30], dates[30] + ' 16:00:00'):          # two scans the same day: one trade
                conn.execute('INSERT INTO ranking_history VALUES (?,?,?,?)',
                             (stamp, ticker, 'v-test', json.dumps({'row': {'Conviction': label}})))
            conn.execute('INSERT INTO outcome_tracking VALUES (?,?,?)', (ticker, dates[5], label))
            conn.execute('INSERT INTO outcome_tracking VALUES (?,?,?)', (ticker, dates[40], label))  # after v-test began
    result = track_record.build(database, version='v-test')
    json.dumps(result, allow_nan=False)
    five = {row['label']: row for row in result['current']['horizons']['5']['labels']}
    # scan on day 30 -> enter at day 31 close (131), exit day 36 (136)
    assert five['Strong Buy']['mean_return'] == pytest.approx(136 / 131 - 1, abs=1e-4)
    assert five['Strong Buy']['scan_dates'] == 1 and five['Strong Buy']['positive_share'] == 1
    assert five['Avoid']['mean_return'] < 0 and five['Avoid']['beat_nifty_share'] == 0
    assert result['current']['horizons']['63']['scan_dates'] == 0     # not matured: reported as empty, not guessed
    assert result['previous']['until'] == dates[5]                    # later legacy rows belong to the new model's era


def test_regime_numbers_are_published_in_display_units(tmp_path, monkeypatch):
    from engine import quant_engine
    database = tmp_path / 'scans.db'
    with sqlite3.connect(database) as conn:
        conn.execute('CREATE TABLE regime_history (Scan_Date, Regime_Score, Nifty_Close, Nifty_SMA_200, VIX, Breadth_Pct)')
        conn.execute("INSERT INTO regime_history VALUES ('2026-11-14', 1, 25144, 23991, NULL, 0.3457)")
    monkeypatch.setattr(quant_engine, '_get_conn', lambda: sqlite3.connect(database))
    regime = quant_engine.fetch_latest_regime()
    assert regime['score'] == 1 and regime['scale'] == [-5, 5] and regime['nifty_trend'] == 'bullish'
    assert regime['breadth'] == 34.6          # not 0.3
    assert regime['vix'] is None              # not 0.0
