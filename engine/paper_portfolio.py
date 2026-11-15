"""A paper portfolio that follows the published ratings, and what changed in them.

The portfolio is recomputed from the saved rating snapshots and stored prices on
every scan, so it holds no state of its own and cannot drift from the record.

Rules, fixed in advance:
* Basket: the 20 highest-scoring stocks rated Buy or Strong Buy on the balanced
  horizon, eligible, with no red flags, and at most 4 from any one sector.
* Trades happen at the close of the session after the rating was published.
* Review every 21 sessions. With no rating snapshot from the last five sessions,
  the review waits for the next one rather than trading on stale ratings.
* Equal weights at each review, 0.2% cost on every rupee traded, spare slots in cash.
"""
from __future__ import annotations

import json
import sqlite3
from pathlib import Path

import numpy as np
import pandas as pd

from data_pipeline.price_repair import repair_long
from engine.ranking import MODEL_VERSION

BASKET_SIZE = 20
SECTOR_CAP = 4
REVIEW_SESSIONS = 21
MAX_SNAPSHOT_AGE = 5
COST = 0.002
BUY_LABELS = ('Strong Buy', 'Buy')
LADDER = {'Avoid': 0, 'Caution': 1, 'Hold': 2, 'Buy': 3, 'Strong Buy': 4}


def load_snapshots(database='data/market_scans.db', version=MODEL_VERSION) -> dict:
    """{date: DataFrame(Ticker, Sector, score, label, eligible, red_flags)} for one model version."""
    with sqlite3.connect(Path(database).resolve().as_uri() + '?mode=ro', uri=True) as conn:
        tables = {row[0] for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        if 'ranking_history' not in tables:
            return {}
        rows = conn.execute('SELECT Scan_Date, Ticker, Payload FROM ranking_history WHERE Model_Version=?', (version,)).fetchall()
    records = []
    for scan_date, ticker, payload in rows:
        row = (json.loads(payload) or {}).get('row') or {}
        records.append({'day': scan_date[:10], 'Ticker': ticker, 'Sector': row.get('Sector') or 'Unknown',
                        'score': row.get('Composite_Score'), 'label': row.get('Conviction'),
                        'eligible': bool((row.get('Ranking_Eligible') or {}).get('balanced')),
                        'red_flags': len(row.get('Red_Flags') or []), 'name': row.get('Name') or ticker.replace('.NS', '')})
    frame = pd.DataFrame(records)
    if frame.empty:
        return {}
    frame = frame.drop_duplicates(['day', 'Ticker'], keep='last')
    return {day: group.reset_index(drop=True) for day, group in frame.groupby('day')}


def select_basket(snapshot: pd.DataFrame, size=BASKET_SIZE, sector_cap=SECTOR_CAP) -> list[str]:
    pool = snapshot[snapshot.eligible & snapshot.label.isin(BUY_LABELS) & (snapshot.red_flags == 0) & snapshot.score.notna()]
    pool = pool[pool.Sector != 'ETF'].sort_values(['score', 'Ticker'], ascending=[False, True])
    chosen, per_sector = [], {}
    for row in pool.itertuples():
        if per_sector.get(row.Sector, 0) >= sector_cap:
            continue
        chosen.append(row.Ticker)
        per_sector[row.Sector] = per_sector.get(row.Sector, 0) + 1
        if len(chosen) == size:
            break
    return chosen


def _prices(database):
    with sqlite3.connect(Path(database).resolve().as_uri() + '?mode=ro', uri=True) as conn:
        quotes = repair_long(pd.read_sql_query('SELECT Ticker,Date,Open,Close FROM daily_ohlcv', conn))
    prices = quotes.pivot_table(index='Date', columns='Ticker', values='Close', aggfunc='last').sort_index()
    prices.index = pd.to_datetime(prices.index)
    if '^NSEI' not in prices:
        return pd.DataFrame()
    return prices.loc[prices['^NSEI'].notna()]


def simulate(snapshots: dict, prices: pd.DataFrame) -> dict | None:
    days = sorted(snapshots)
    if not days or prices.empty:
        return None
    snapshot_dates = pd.to_datetime(days)
    start = prices.index.searchsorted(snapshot_dates[0], side='right')      # first close after the first rating
    if start >= len(prices):
        return None
    # A held stock with no quote for a session is carried at its last close.
    filled = prices.ffill()
    cash, shares, entries = 100.0, {}, {}
    last_review, reviews, chart = None, [], []
    for i in range(start, len(prices)):
        date, row = prices.index[i], filled.iloc[i]
        value = cash + sum(count * row[ticker] for ticker, count in shares.items())
        due = last_review is None or i - last_review >= REVIEW_SESSIONS
        if due:
            # Ratings published before this session; they must be recent enough to act on.
            known = snapshot_dates[snapshot_dates < date]
            fresh = len(known) and (prices.index[:i] > known[-1]).sum() <= MAX_SNAPSHOT_AGE
            if fresh:
                snapshot = snapshots[days[len(known) - 1]]
                target = [t for t in select_basket(snapshot) if t in row.index and np.isfinite(row[t]) and row[t] > 0]
                slot = value / BASKET_SIZE
                wanted = {ticker: slot / row[ticker] for ticker in target}
                traded = sum(abs(wanted.get(t, 0) - shares.get(t, 0)) * row[t] for t in set(wanted) | set(shares))
                fee = traded * COST
                scale = (value - fee) / value if value > 0 else 1
                shares = {ticker: count * scale for ticker, count in wanted.items()}
                cash = (value - fee) - sum(count * row[ticker] for ticker, count in shares.items())
                entries = {ticker: entries.get(ticker) if ticker in entries else {'date': str(date.date()), 'price': float(row[ticker])}
                           for ticker in shares}
                value -= fee
                last_review = i
                reviews.append({'date': str(date.date()), 'ratings_from': days[len(known) - 1], 'holdings': len(shares),
                                'turnover': round(traded / max(value, 1e-9) / 2, 3)})
        chart.append({'date': str(date.date()), 'portfolio': value, 'nifty': float(prices['^NSEI'].iloc[i])})
    if not chart or last_review is None:
        return None
    base_value, base_index = chart[0]['portfolio'], chart[0]['nifty']
    for point in chart:
        point['portfolio'] = round(point['portfolio'] / base_value * 100, 2)
        point['nifty'] = round(point['nifty'] / base_index * 100, 2)
    series = pd.Series([p['portfolio'] for p in chart])
    latest_snapshot = snapshots[days[-1]].set_index('Ticker')
    last_row = filled.iloc[-1]
    holdings = []
    for ticker in sorted(shares, key=lambda t: -shares[t] * last_row[t]):
        info = latest_snapshot.loc[ticker] if ticker in latest_snapshot.index else None
        entry = entries[ticker]
        holdings.append({'ticker': ticker, 'sector': None if info is None else info.Sector,
                         'rating_now': None if info is None else info.label,
                         'score_now': None if info is None or pd.isna(info.score) else round(float(info.score), 2),
                         'entry_date': entry['date'], 'entry_price': round(entry['price'], 2),
                         'price': round(float(last_row[ticker]), 2),
                         'return': round(float(last_row[ticker] / entry['price'] - 1), 4)})
    proposed = select_basket(snapshots[days[-1]])
    held = set(shares)
    sessions_since = len(prices) - 1 - last_review
    return {
        'rules': (f'Top {BASKET_SIZE} stocks rated Buy or Strong Buy with no red flags, at most {SECTOR_CAP} per sector, '
                  f'equal weight, reviewed every {REVIEW_SESSIONS} sessions, bought at the close after the rating was published, '
                  f'{COST * 100:.1f}% cost on each trade.'),
        'inception': chart[0]['date'], 'through': chart[-1]['date'], 'sessions': len(chart),
        'return': round(chart[-1]['portfolio'] / 100 - 1, 4), 'nifty_return': round(chart[-1]['nifty'] / 100 - 1, 4),
        'max_drawdown': round(float((series / series.cummax() - 1).min()), 4),
        'reviews': reviews, 'last_review': reviews[-1]['date'],
        'sessions_to_next_review': max(0, REVIEW_SESSIONS - sessions_since),
        'cash_share': round(cash / max(cash + sum(shares[t] * last_row[t] for t in shares), 1e-9), 3),
        'holdings': holdings,
        'next_basket': {'ratings_from': days[-1], 'would_add': sorted(set(proposed) - held),
                        'would_drop': sorted(held - set(proposed)), 'tickers': proposed},
        'chart': chart,
    }


def rating_changes(snapshots: dict) -> dict | None:
    """Upgrades and downgrades between the two most recent rating snapshots."""
    days = sorted(snapshots)
    if len(days) < 2:
        return None
    new, old = (snapshots[day].set_index('Ticker') for day in (days[-1], days[-2]))
    changes = []
    for ticker in new.index.intersection(old.index):
        before, after = old.at[ticker, 'label'], new.at[ticker, 'label']
        if before == after or before not in LADDER or after not in LADDER:
            continue
        score_before, score_after = old.at[ticker, 'score'], new.at[ticker, 'score']
        changes.append({'ticker': ticker, 'sector': new.at[ticker, 'Sector'], 'from': before, 'to': after,
                        'steps': LADDER[after] - LADDER[before],
                        'score': None if pd.isna(score_after) else round(float(score_after), 2),
                        'score_change': None if pd.isna(score_after) or pd.isna(score_before) else round(float(score_after - score_before), 2)})
    order = lambda item: (-abs(item['steps']), -(item['score'] or 0), item['ticker'])
    return {'date': days[-1], 'compared_with': days[-2],
            'upgrades': sorted((c for c in changes if c['steps'] > 0), key=order)[:40],
            'downgrades': sorted((c for c in changes if c['steps'] < 0), key=order)[:40],
            'upgrade_count': sum(c['steps'] > 0 for c in changes), 'downgrade_count': sum(c['steps'] < 0 for c in changes)}


def build(database='data/market_scans.db', version=MODEL_VERSION) -> dict:
    snapshots = load_snapshots(database, version)
    if not snapshots:
        return {'portfolio': None, 'rating_changes': None}
    result = {'portfolio': simulate(snapshots, _prices(database)), 'rating_changes': rating_changes(snapshots)}
    return json.loads(json.dumps(result, default=float))   # plain Python numbers for publication
