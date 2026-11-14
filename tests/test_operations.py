"""Operational safety: database parts, notifications and scheduler wiring."""
import json
import os
import time

import pytest

import db_split_join
from notifications import telegram_bot


@pytest.fixture
def workspace(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    os.mkdir('data')
    monkeypatch.setattr(db_split_join, 'CHUNK_SIZE', 4)
    return tmp_path


def write(path, content, age=0):
    with open(path, 'wb') as handle:
        handle.write(content)
    stamp = time.time() - age
    os.utime(path, (stamp, stamp))


def parts():
    return {name: open(os.path.join('data', name), 'rb').read() for name in sorted(os.listdir('data')) if 'part_' in name}


def test_stale_local_database_never_overwrites_newer_pulled_parts(workspace, capsys):
    write('data/market_scans.db', b'old', age=3600)                # joined long ago
    for i, chunk in enumerate([b'NEWE', b'RDAT', b'A!']):          # then `git pull` refreshed the parts
        write(f'data/market_scans.db.part_{i:03d}', chunk)
    before = parts()
    assert db_split_join.split_db() is False
    assert parts() == before
    assert 'join' in capsys.readouterr().err
    db_split_join.join_db()                                        # the documented recovery
    assert open('data/market_scans.db', 'rb').read() == b'NEWERDATA!'
    assert db_split_join.split_db() is True and parts() == before


def test_split_removes_leftover_parts_of_a_larger_database(workspace):
    for i in range(4):
        write(f'data/market_scans.db.part_{i:03d}', b'xxxx', age=3600)
    write('data/market_scans.db', b'abcdefgh')
    assert db_split_join.split_db() is True
    assert parts() == {'market_scans.db.part_000': b'abcd', 'market_scans.db.part_001': b'efgh'}


def test_force_overrides_and_join_leaves_no_temporary_file(workspace):
    write('data/market_scans.db', b'local', age=3600)
    write('data/market_scans.db.part_000', b'pulled')
    assert db_split_join.split_db(force=True) is True
    db_split_join.join_db()
    assert open('data/market_scans.db', 'rb').read() == b'local'
    assert not os.path.exists('data/market_scans.db.joining')


def stock(ticker, score, conviction='Strong Buy', **extra):
    return {'Ticker': ticker, 'Composite_Score': score, 'Conviction': conviction, 'Price': 1234.5,
            '1d_Chg_%': -1.25, 'ML_Alpha_Prob': None, 'ML_Method': 'Not calibrated for ranking-v3',
            'Ranking_Eligible': {'balanced': True}, 'Red_Flags': [], **extra}


def test_telegram_message_handles_uncalibrated_fields_and_lists_only_real_buys():
    data = {'market_regime_score': 1, 'data': [
        stock('GOOD.NS', 8.2), stock('M_M.NS', 7.9, 'Buy'), stock('HOLD.NS', 9.9, 'Hold'),
        stock('FLAG.NS', 9.8, Red_Flags=['Negative trailing earnings']),
        stock('THIN.NS', 9.7, Ranking_Eligible={'balanced': False}), stock('NULL.NS', None, 'Buy', Price=None, **{'1d_Chg_%': None})]}
    message = telegram_bot.build_message(data)
    assert '1. *GOOD*' in message and '₹1,234.50 (-1.25%)' in message
    assert 'M\\_M' in message                      # Markdown-safe
    assert all(name not in message for name in ('HOLD', 'FLAG', 'THIN'))
    assert 'None' not in message and 'ML' not in message
    assert 'No stock currently meets' in telegram_bot.build_message({'data': [stock('HOLD.NS', 9, 'Hold')]})


def test_telegram_failure_never_logs_the_bot_token(tmp_path, monkeypatch, caplog):
    path = tmp_path / 'market.json'
    path.write_text(json.dumps({'data': [stock('GOOD.NS', 8)]}), encoding='utf8')
    monkeypatch.setattr(telegram_bot, 'MARKET_DATA_PATH', str(path))
    monkeypatch.setattr(telegram_bot, 'TELEGRAM_BOT_TOKEN', '123:SECRET-TOKEN')
    monkeypatch.setattr(telegram_bot, 'TELEGRAM_CHAT_ID', '1')
    sent = []
    class Reply: status_code = 200; text = ''
    monkeypatch.setattr(telegram_bot.requests, 'post', lambda url, json=None, timeout=None: sent.append(json) or Reply())
    assert telegram_bot.send_telegram_broadcast() is True and 'GOOD' in sent[0]['text']
    def fail(url, **kwargs):
        raise telegram_bot.requests.ConnectionError(f'Max retries exceeded with url: {url}')
    monkeypatch.setattr(telegram_bot.requests, 'post', fail)
    with caplog.at_level('ERROR'):
        assert telegram_bot.send_telegram_broadcast() is False
    assert 'SECRET-TOKEN' not in caplog.text


def test_scheduler_jobs_import_modules_that_exist(monkeypatch):
    import scheduler
    from engine import scanner
    from data_pipeline import live_updater
    called = []
    monkeypatch.setattr(scanner, 'run_scanner', lambda: called.append('scan') or [])
    monkeypatch.setattr(live_updater, 'update_live_prices', lambda: called.append('live'))
    scheduler._post_market_scan()
    scheduler._live_price_update()
    assert called == ['scan', 'live']


def test_site_serves_every_supported_backtest_version():
    """Raising BACKTEST_VERSION must never blank Quant Lab behind a hardcoded number."""
    import re
    from pathlib import Path
    from engine import backtest_engine
    source = (Path(__file__).resolve().parents[1] / 'frontend' / 'api' / 'data.ts').read_text(encoding='utf8')
    minimum = int(re.search(r'const MIN_DATA_VERSION = (\d+)', source).group(1))
    assert minimum == backtest_engine.MIN_SUPPORTED_BACKTEST_VERSION <= backtest_engine.BACKTEST_VERSION
    assert not re.search(r'version\s*[!=]==\s*\d', source)


def test_stored_history_is_repaired_whoever_fetched_it(tmp_path, monkeypatch):
    import sqlite3
    import numpy as np
    import pandas as pd
    from data_pipeline import data_pipeline as pipeline
    monkeypatch.setattr(pipeline, 'DB_PATH', str(tmp_path / 'scans.db'))
    dates = pd.bdate_range('2026-01-01', periods=40)
    close = pd.Series(100.0, index=dates); close.iloc[:20] *= 3      # unadjusted demerger
    frame = pd.DataFrame({'Open': close, 'High': close, 'Low': close, 'Close': close, 'Volume': 1000})
    pipeline.store_daily_ohlcv({'X.NS': frame}, '2026-03-01')
    with sqlite3.connect(pipeline.DB_PATH) as conn:
        stored = pd.read_sql_query("SELECT Close FROM daily_ohlcv WHERE Ticker='X.NS' ORDER BY Date", conn).Close
    assert len(stored) >= 35 and np.allclose(stored, 100.0)
