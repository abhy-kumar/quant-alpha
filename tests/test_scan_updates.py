"""Publication must tolerate missing research quotes without inventing returns."""
import json

import numpy as np
import pandas as pd
import pytest

from engine import scanner, backtest_engine as backtest, quant_engine as quant


def bar(date):
    return pd.DataFrame({'Close': [100.]}, index=pd.DatetimeIndex([date]))


def test_refresh_covers_recent_stocks_outside_screen(monkeypatch):
    saved = {'GPPL.NS': bar('2026-09-30'), 'CURRENT.NS': bar('2026-09-30'),
             'READY.NS': bar('2026-10-01'), 'OLD.NS': bar('2026-01-01'),
             '^NSEI': bar('2026-09-30')}
    monkeypatch.setattr(scanner, 'stored_prices', lambda **kwargs: saved)
    requested, stored = [], []
    fresh = {'GPPL.NS': bar('2026-10-01')}
    def fetch(tickers):
        requested.extend(tickers)
        return fresh
    monkeypatch.setattr(scanner, '_fetch_ohlcv_batch', fetch)
    monkeypatch.setattr(scanner, 'store_daily_ohlcv', lambda data, date: stored.append((data, date)))
    current = {'CURRENT.NS': bar('2026-10-01')}
    scanner._refresh_research_prices(current, bar('2026-10-01'), '2026-10-01')
    assert requested == ['GPPL.NS']
    assert stored == [(fresh, '2026-10-01')]
    assert list(current) == ['CURRENT.NS']  # historical quotes never enter today's ranking


@pytest.mark.parametrize('benchmark', [None, pd.DataFrame(), bar('2026-09-30')])
def test_refresh_does_not_refetch_when_benchmark_has_not_advanced(monkeypatch, benchmark):
    monkeypatch.setattr(scanner, 'stored_prices', lambda **kwargs: {'GPPL.NS': bar('2026-09-30')})
    monkeypatch.setattr(scanner, '_fetch_ohlcv_batch', lambda _: pytest.fail('Unexpected download'))
    scanner._refresh_research_prices({}, benchmark, '2026-10-01')


def test_unavailable_backtest_is_not_cached_and_other_models_complete(monkeypatch):
    dates = pd.bdate_range('2025-01-01', periods=65)
    prices = pd.DataFrame({'GPPL.NS': 100., '^NSEI': 100.}, index=dates)
    prices.loc[dates[62], 'GPPL.NS'] = np.nan
    volumes = pd.DataFrame(2_000_000., index=dates, columns=prices.columns)
    monkeypatch.setattr(backtest, 'get_ohlcv_date_range', lambda: (str(dates[0].date()), str(dates[-1].date())))
    monkeypatch.setattr(backtest, 'load_ohlcv', lambda: (prices, volumes, prices, prices, ['GPPL.NS']))
    monkeypatch.setattr(backtest, '_check_cache', lambda *args: None)
    monkeypatch.setattr(backtest, 'compute_short_score_at', lambda *args: pd.Series({'GPPL.NS': 10.}))
    monkeypatch.setattr(backtest, 'compute_long_score_at', lambda *args: pd.Series(dtype=float))
    cached = []
    monkeypatch.setattr(backtest, '_store_cache', lambda date, model, *args: cached.append(model))
    monkeypatch.setattr(backtest, 'export_backtest_index', lambda: None)
    results = backtest.run_all_backtests()
    for horizon in ('1y', '6m'):
        assert results[f'backtest_short_{horizon}']['status'] == 'unavailable'
        assert results[f'backtest_long_{horizon}']['chart']
    assert cached == ['long', 'long']


def test_quant_publication_contains_quote_error_and_preserves_other_research(monkeypatch, tmp_path):
    monkeypatch.chdir(tmp_path)
    missing = {'chart': [], 'holdings': [], 'stats': {}, 'status': 'unavailable',
               'error': 'Missing executable close for held stock GPPL.NS on 2026-10-01'}
    good = {'chart': [{'date': '2026-10-01', 'portfolio': 102., 'benchmark': 101.}], 'stats': {}}
    monkeypatch.setattr(quant, 'fetch_latest_top_picks', lambda *args: pd.DataFrame({'Ticker': []}))
    monkeypatch.setattr(quant, 'fetch_price_history', lambda *args: pd.DataFrame())
    monkeypatch.setattr(quant, 'run_backtest', lambda *args: missing)
    monkeypatch.setattr(backtest, 'run_all_backtests', lambda: {'backtest_short_1y': missing, 'backtest_long_1y': good})
    for name in ('compute_factor_exposures', 'fetch_latest_regime', 'compute_sector_allocation',
                 'compute_correlation_matrix', 'compute_factor_ic_monitor', 'compute_scenario_stress_tests'):
        monkeypatch.setattr(quant, name, lambda *args: {})
    from engine import strategy_history
    monkeypatch.setattr(strategy_history, 'export_strategy_history', lambda: None)
    monkeypatch.setattr(backtest, 'export_backtest_index', lambda: 0)
    quant.generate_quant_data()
    output = json.loads((tmp_path / 'frontend/public/quant_data.json').read_text())
    assert output['backtest']['error'] == missing['error']
    assert output['backtest_short_1y']['chart'] == []
    assert output['backtest_long_1y']['chart'] == good['chart']
