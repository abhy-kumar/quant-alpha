"""What the published ratings went on to do, measured the way a user would trade them.

Each scan's ratings are bought at the next session's close and held for a fixed
number of sessions. Returns are plain price returns (no costs) beside NIFTY over
the same window, so "did this make money" and "did it beat the index" are both
visible. Windows from neighbouring scans overlap, so the number of scan dates
overstates the amount of independent evidence.
"""
from __future__ import annotations

import json
import sqlite3
from pathlib import Path

import numpy as np
import pandas as pd

from data_pipeline.price_repair import repair_long
from engine.ranking import MODEL_VERSION

HORIZONS = (5, 21, 63)
LABELS = ('Strong Buy', 'Buy', 'Hold', 'Caution', 'Avoid')


def _summarise(calls: pd.DataFrame, prices: pd.DataFrame) -> dict:
    """calls: one row per (day, Ticker, label), day as YYYY-MM-DD."""
    benchmark = prices['^NSEI']
    out = {}
    for horizon in HORIZONS:
        rows = []
        for day, group in calls.groupby('day'):
            entry = prices.index.searchsorted(pd.Timestamp(day), side='right')
            exit_ = entry + horizon
            if exit_ >= len(prices):
                continue
            change = prices.iloc[exit_] / prices.iloc[entry] - 1
            market = benchmark.iloc[exit_] / benchmark.iloc[entry] - 1
            held = group.drop_duplicates('Ticker').set_index('Ticker')
            held = held.assign(ret=change.reindex(held.index)).dropna(subset=['ret'])
            for label, part in list(held.groupby('label')) + [('All rated stocks', held)]:
                rows.append((prices.index[entry], label, len(part), part.ret.mean(), market,
                             (part.ret > 0).mean(), (part.ret > market).mean()))
        frame = pd.DataFrame(rows, columns=['entry', 'label', 'n', 'ret', 'nifty', 'positive', 'beat'])
        # Several scans before the same session would otherwise count one trade many times.
        frame = frame.drop_duplicates(['entry', 'label'])
        if frame.empty:
            out[str(horizon)] = {'scan_dates': 0, 'labels': []}
            continue
        table = []
        for label in (*LABELS, 'All rated stocks'):
            part = frame[frame.label == label]
            if part.empty:
                continue
            table.append({'label': label, 'scan_dates': int(len(part)), 'stocks_per_date': round(float(part.n.mean()), 1),
                          'mean_return': round(float(part.ret.mean()), 4), 'nifty': round(float(part.nifty.mean()), 4),
                          'positive_share': round(float(part.positive.mean()), 2),
                          'beat_nifty_share': round(float(part.beat.mean()), 2)})
        entries = frame.entry.drop_duplicates().sort_values()
        out[str(horizon)] = {'scan_dates': int(len(entries)), 'first': str(entries.iloc[0].date()),
                             'last': str(entries.iloc[-1].date()),
                             'independent_periods': max(1, int(len(entries) // horizon)), 'labels': table}
    return out


def build(database='data/market_scans.db', version=MODEL_VERSION) -> dict:
    with sqlite3.connect(Path(database).resolve().as_uri() + '?mode=ro', uri=True) as conn:
        tables = {row[0] for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        quotes = repair_long(pd.read_sql_query('SELECT Ticker,Date,Open,Close FROM daily_ohlcv', conn))
        current = (pd.read_sql_query('SELECT Scan_Date,Ticker,Payload FROM ranking_history WHERE Model_Version=?',
                                     conn, params=[version]) if 'ranking_history' in tables else pd.DataFrame())
        legacy = (pd.read_sql_query('SELECT Scan_Date,Ticker,Conviction_At_Scan AS label FROM outcome_tracking', conn)
                  if 'outcome_tracking' in tables else pd.DataFrame())
    prices = quotes.pivot_table(index='Date', columns='Ticker', values='Close', aggfunc='last').sort_index()
    prices.index = pd.to_datetime(prices.index)
    if '^NSEI' not in prices:
        return {'status': 'Benchmark unavailable'}
    prices = prices.loc[prices['^NSEI'].notna()]
    result = {'method': ('Bought at the next session\'s close after each scan and held for the stated number of '
                         'sessions. Price returns before costs. Neighbouring scans overlap, so treat the number of '
                         'independent periods, not scan dates, as the sample size.'),
              'prices_through': str(prices.index[-1].date())}
    first_current = None
    if not current.empty:
        current['day'] = current.Scan_Date.str[:10]
        current['label'] = current.Payload.map(lambda text: (json.loads(text).get('row') or {}).get('Conviction'))
        first_current = current.day.min()
        result['current'] = {'version': version, 'since': first_current,
                             'horizons': _summarise(current[['day', 'Ticker', 'label']].dropna(), prices)}
    if not legacy.empty:
        legacy['day'] = legacy.Scan_Date.str[:10]
        if first_current:
            legacy = legacy[legacy.day < first_current]
        if not legacy.empty:
            result['previous'] = {'version': 'Earlier scoring model', 'since': legacy.day.min(), 'until': legacy.day.max(),
                                  'horizons': _summarise(legacy[['day', 'Ticker', 'label']].dropna(), prices)}
    return result
