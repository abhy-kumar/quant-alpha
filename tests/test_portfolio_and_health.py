"""Paper portfolio, rating changes, fundamentals evidence and the data health report."""
import json
import sqlite3

import numpy as np
import pandas as pd
import pytest

from engine import data_health, factor_research, paper_portfolio as paper


def snapshot(rows):
    return pd.DataFrame([{'Ticker': t, 'Sector': s, 'score': score, 'label': label, 'eligible': eligible, 'red_flags': flags}
                         for t, s, score, label, eligible, flags in rows])


def test_basket_takes_the_best_clean_buys_and_caps_each_sector():
    rows = [(f'BANK{i}.NS', 'Financial Services', 9 - i * .1, 'Strong Buy', True, 0) for i in range(8)]
    rows += [('FLAG.NS', 'Energy', 9.9, 'Strong Buy', True, 1), ('THIN.NS', 'Energy', 9.8, 'Buy', False, 0),
             ('HOLD.NS', 'Energy', 9.7, 'Hold', True, 0), ('GOLDBEES.NS', 'ETF', 9.6, 'Buy', True, 0),
             ('OIL.NS', 'Energy', 5.6, 'Buy', True, 0)]
    basket = paper.select_basket(snapshot(rows))
    assert basket == ['BANK0.NS', 'BANK1.NS', 'BANK2.NS', 'BANK3.NS', 'OIL.NS']


def market(tmp_path, days=60):
    database = tmp_path / 'scans.db'
    dates = pd.bdate_range('2026-06-01', periods=days).strftime('%Y-%m-%d')
    with sqlite3.connect(database) as conn:
        conn.execute('CREATE TABLE daily_ohlcv (Ticker, Date, Open, High, Low, Close, Volume)')
        conn.execute('CREATE TABLE ranking_history (Scan_Date, Ticker, Model_Version, Payload)')
        for i, day in enumerate(dates):
            for ticker, price in (('^NSEI', 100.0), ('UP.NS', 100.0 + i), ('FLAT.NS', 50.0), ('NEW.NS', 10.0 + i)):
                conn.execute('INSERT INTO daily_ohlcv VALUES (?,?,?,?,?,?,1)', (ticker, day, price, price, price, price))
    return database, dates


def publish(database, day, ratings):
    with sqlite3.connect(database) as conn:
        for ticker, (label, score) in ratings.items():
            row = {'Sector': 'Industrials', 'Composite_Score': score, 'Conviction': label,
                   'Ranking_Eligible': {'balanced': True}, 'Red_Flags': [], 'Ranking_Inputs': {'roe': score / 10}}
            conn.execute('INSERT INTO ranking_history VALUES (?,?,?,?)', (day, ticker, 'v-test', json.dumps({'row': row})))


def test_portfolio_buys_next_close_pays_costs_and_waits_for_fresh_ratings(tmp_path):
    database, dates = market(tmp_path)
    publish(database, dates[0], {'UP.NS': ('Strong Buy', 8), 'FLAT.NS': ('Buy', 6), 'NEW.NS': ('Hold', 5)})
    # No snapshot near the first review (session 22); the next one arrives on day 30.
    publish(database, dates[30], {'UP.NS': ('Hold', 5), 'FLAT.NS': ('Buy', 6), 'NEW.NS': ('Strong Buy', 9)})
    result = paper.build(database, version='v-test')
    portfolio = result['portfolio']
    json.dumps(result, allow_nan=False)
    assert portfolio['inception'] == dates[1]                      # close after the first rating
    assert [review['date'] for review in portfolio['reviews']] == [dates[1], dates[31]]   # waited for a fresh snapshot
    assert {holding['ticker'] for holding in portfolio['holdings']} == {'FLAT.NS', 'NEW.NS'}
    first, second = portfolio['chart'][0], portfolio['chart'][1]
    assert first['portfolio'] == 100 and first['nifty'] == 100
    # Two of twenty slots are filled; UP rises 1 on 101 for its 5% slot.
    assert second['portfolio'] == pytest.approx(100 * (1 + .05 * 1 / 101), abs=.01)
    assert .8 < portfolio['cash_share'] < .92 and portfolio['nifty_return'] == 0   # 18 of 20 slots empty
    new = next(holding for holding in portfolio['holdings'] if holding['ticker'] == 'NEW.NS')
    assert new['entry_date'] == dates[31] and new['entry_price'] == 41.0 and new['rating_now'] == 'Strong Buy'
    assert portfolio['reviews'][0]['turnover'] == pytest.approx(.05, abs=.005)


def test_rating_changes_compare_the_last_two_snapshots(tmp_path):
    database, dates = market(tmp_path)
    publish(database, dates[0], {'UP.NS': ('Strong Buy', 8), 'FLAT.NS': ('Buy', 6), 'NEW.NS': ('Hold', 5)})
    publish(database, dates[1], {'UP.NS': ('Hold', 5), 'FLAT.NS': ('Buy', 6.1), 'NEW.NS': ('Strong Buy', 9)})
    changes = paper.build(database, version='v-test')['rating_changes']
    assert changes['date'] == dates[1] and changes['compared_with'] == dates[0]
    assert [(c['ticker'], c['from'], c['to'], c['steps']) for c in changes['upgrades']] == [('NEW.NS', 'Hold', 'Strong Buy', 2)]
    assert [(c['ticker'], c['steps'], c['score_change']) for c in changes['downgrades']] == [('UP.NS', -2, -3.0)]
    assert paper.rating_changes({dates[0]: snapshot([])}) is None


def test_fundamental_evidence_withholds_verdicts_until_there_is_enough_history(tmp_path):
    database, dates = market(tmp_path)
    publish(database, dates[0], {'UP.NS': ('Strong Buy', 8), 'FLAT.NS': ('Buy', 6), 'NEW.NS': ('Hold', 5)})
    study = factor_research.fundamental_study(database, version='v-test')
    json.dumps(study, allow_nan=False)
    assert study['matured_dates'] == 1 and study['enough_history'] is False
    assert study['dates_required'] == 252
    assert {item['verdict'] for item in study['inputs']} == {'Not enough history'}
    assert all(item['t'] is None for item in study['inputs'])


def stock(i, **extra):
    inputs = {name: .1 for name in data_health.RANKING_INPUTS}
    return {'Ticker': f'S{i}.NS', 'Sector': 'Industrials', 'Conviction': 'Hold', 'Ranking_Inputs': inputs,
            'Ranking_Eligible': {'balanced': True}, 'Market_Cap_B': 10.0, 'Promoter_Holding_%': 50.0,
            'Promoter_Pledge_Checked': True, 'Ranking_Price_Date': '2026-11-13', **extra}


def test_health_is_ok_for_a_complete_scan_and_names_each_problem():
    rows = [stock(i) for i in range(100)]
    good = data_health.build(rows, {'readings': 5, 'missing': []}, requested=100,
                             price_check={'date': '2026-11-13', 'compared': 100, 'mismatched': 1, 'worst': []})
    json.dumps(good, allow_nan=False)
    assert good['status'] == 'ok' and good['issues'] == [] and good['eligible_pct'] == 100
    assert all(item['coverage'] == 100 for item in good['inputs'])

    broken = [stock(i, Ranking_Inputs={**stock(i)['Ranking_Inputs'], 'mom12': None if i < 40 else .1,
                                       'roe': None if i < 12 else .1}, Market_Cap_B=0 if i < 50 else 10.0)
              for i in range(70)]
    bad = data_health.build(broken, {'readings': 3, 'missing': ['fii', 'pcr']}, requested=100, previous=good,
                            price_check={'date': '2026-11-13', 'compared': 70, 'mismatched': 9, 'worst': []})
    text = ' '.join(bad['issues'])
    assert bad['status'] == 'degraded'
    assert '12-month momentum is available for only 43%' in text           # below the floor
    assert 'Return on equity coverage fell 17 points' in text               # still above the floor, but dropped
    assert 'Market value is available for only 29%' in text
    assert 'FII/DII flows, Put-call ratio' in text
    assert '9 of 70 closing prices differ' in text
    assert 'Only 70 of 100 requested stocks' in text and 'fell from 100 to 70' in text


def test_inputs_that_do_not_apply_to_banks_are_measured_on_other_stocks():
    rows = [stock(i) for i in range(50)]
    rows += [stock(100 + i, Sector='Financial Services', Ranking_Inputs={**stock(i)['Ranking_Inputs'], 'fcf_yield': None, 'roce': None})
             for i in range(50)]
    report = data_health.build(rows, {'readings': 5, 'missing': []})
    by_id = {item['id']: item for item in report['inputs']}
    assert by_id['fcf_yield']['coverage'] == 100 and by_id['fcf_yield']['of'] == 50
    assert report['status'] == 'ok'


def test_price_cross_check_flags_closes_that_disagree_with_the_exchange():
    day = pd.Timestamp('2026-11-13')
    frame = lambda close, date=day: pd.DataFrame({'Close': [close - 1, close]}, index=[date - pd.Timedelta(days=1), date])
    histories = {'A.NS': frame(100.0), 'B.NS': frame(250.0), 'OLD.NS': frame(10.0, day - pd.Timedelta(days=3)), 'GONE.NS': frame(5.0)}
    bhav = pd.DataFrame({'SYMBOL': ['A', 'B ', 'OLD'], 'CLOSE_PRICE': [100.3, 125.0, 99.0]})
    check = data_health.cross_check_closes(histories, bhav, day)
    assert check['compared'] == 2 and check['mismatched'] == 1          # OLD is not the same session; GONE is not listed
    assert check['worst'] == [{'ticker': 'B.NS', 'vendor': 250.0, 'exchange': 125.0, 'gap': 1.0}]
    assert data_health.cross_check_closes(histories, pd.DataFrame(), day) is None


def test_telegram_message_leads_with_a_data_warning_when_degraded():
    from notifications import telegram_bot
    message = telegram_bot.build_message({'data': [], 'data_health': {'status': 'degraded', 'issues': ['Put-call ratio unavailable.']}})
    assert 'Data warning' in message and 'Put-call ratio unavailable.' in message
    assert 'Data warning' not in telegram_bot.build_message({'data': [], 'data_health': {'status': 'ok', 'issues': []}})
