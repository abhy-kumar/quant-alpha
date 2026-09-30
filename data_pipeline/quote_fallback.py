"""Complete lagging daily histories using published NSE quotes, without filling gaps.

Require the exchange's previous close to match the adjusted history. A mismatch
can indicate a corporate action; leave that series stale rather than splice two
incompatible price bases.
"""
import sqlite3
from pathlib import Path
import numpy as np
import pandas as pd


def stored_prices(tickers=None, before=None, latest_only=False):
    path = Path('data/market_scans.db')
    if not path.exists():
        return {}
    where = 'Close > 0'
    params = []
    if tickers is not None:
        if not tickers:
            return {}
        where += ' AND Ticker IN (' + ','.join('?' for _ in tickers) + ')'
        params.extend(tickers)
    if before:
        where += ' AND Date < ?'
        params.append(before)
    with sqlite3.connect(path.resolve().as_uri() + '?mode=ro', uri=True) as conn:
        if latest_only:
            query = f'SELECT * FROM (SELECT *, ROW_NUMBER() OVER (PARTITION BY Ticker ORDER BY Date DESC) AS rn FROM daily_ohlcv WHERE {where}) WHERE rn=1'
        else:
            query = f'SELECT * FROM daily_ohlcv WHERE {where} AND Date >= date((SELECT MAX(Date) FROM daily_ohlcv), \'-2 years\') ORDER BY Date'
        data = pd.read_sql_query(query, conn, params=params)
    return {ticker: group.assign(Date=pd.to_datetime(group.Date)).set_index('Date')[['Open','High','Low','Close','Volume']]
            for ticker, group in data.groupby('Ticker')}


def complete_from_bhav(histories, bhav, date):
    if bhav.empty or date is None:
        return histories, {}
    result, additions = dict(histories), {}
    quotes = bhav.copy()
    quotes.index = quotes.SYMBOL.str.strip() + '.NS'
    for ticker, frame in histories.items():
        if frame.empty or ticker not in quotes.index:
            continue
        latest = pd.Timestamp(frame.index[-1]).date()
        if latest >= pd.Timestamp(date).date() or (pd.Timestamp(date).date() - latest).days > 7:
            continue
        quote = quotes.loc[ticker]
        if isinstance(quote, pd.DataFrame):
            continue
        previous = quote.get('PREV_CLOSE', quote.get('PREVCLOSE', np.nan))
        if not np.isfinite(previous) or not np.isclose(float(frame.Close.iloc[-1]), previous, rtol=1e-4, atol=.02):
            continue
        values = {key: float(quote.get(source, np.nan)) for key, source in
                  [('Open','OPEN_PRICE'),('High','HIGH_PRICE'),('Low','LOW_PRICE'),('Close','CLOSE_PRICE'),('Volume','TTL_TRD_QNTY')]}
        if not all(np.isfinite(value) for value in values.values()) or min(values[k] for k in ('Open','High','Low','Close')) <= 0:
            continue
        if values['Volume'] < 0 or values['Low'] > min(values['Open'],values['Close']) or values['High'] < max(values['Open'],values['Close']):
            continue
        stamp = pd.Timestamp(date).normalize().tz_localize(frame.index.tz)
        extra = pd.DataFrame([values],index=pd.DatetimeIndex([stamp],name=frame.index.name))
        additions[ticker] = extra
        result[ticker] = pd.concat([frame,extra])
    return result, additions


def retain_newer_benchmark(ticker, frame):
    saved = stored_prices([ticker]).get(ticker)
    if saved is None or saved.empty:
        return frame
    if frame is None or frame.empty:
        return saved
    saved = saved.loc[saved.index > pd.Timestamp(frame.index[-1]).tz_localize(None)]
    if saved.empty:
        return frame
    saved.index = saved.index.tz_localize(frame.index.tz)
    return pd.concat([frame,saved])
