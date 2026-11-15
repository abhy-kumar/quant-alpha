"""Evidence for the ranking model and for candidate factors, from price history.

Measures how well each price factor ranked next-period returns, how stable that
was, and whether a candidate adds anything to the live model's price score. The
same code runs on the 2-year database or on a long history fetched for research
(scripts/run_factor_research.py), so more data means stronger evidence, not a
different method.

Rules fixed before looking at results:
* signals use data up to the close of day t; entry is the close of t+1;
* a factor is "supported" only if |t| >= 3 at 21 sessions, with the same sign in
  both halves of the sample and at 63 sessions;
* a candidate "adds to the model" only if blending it into the model's price
  score raises rank correlation with a paired t >= 2 in the full sample and a
  positive difference in both halves.
The universe is today's tracked stocks, so results carry survivorship bias and
are evidence for ranking, not a forecast of returns. Fundamentals are excluded
because no point-in-time statement history exists yet.
"""
from __future__ import annotations

import json
import sqlite3
from pathlib import Path

import numpy as np
import pandas as pd

from data_pipeline.price_repair import repair_discontinuities, repair_long

HORIZONS = (21, 63)
MIN_ADTV_INR = 1e7
MIN_STOCKS = 40
COST = 0.002
ETF_TOKENS = ('ETF', 'BEES', 'LIQUID', 'NIFTY', 'GOLD', 'SILV', 'MAFANG', 'MON100', 'MONQ50',
              'HDFCSML', 'HDFCBSE', 'PSUBANK', 'ICICIB22', 'CPSE')
# Price part of each published horizon (engine.ranking.WEIGHTS), renormalised.
MODEL_PRICE_WEIGHTS = {'short': (.35, .25, .15), 'balanced': (.25, .15, .15), 'long': (.15, .05, .15)}

FACTORS = {
    # id: (label, group, used by the live model, plain-language meaning)
    'mom12_1': ('12-month momentum', 'Momentum', True, 'Return over the past year, skipping the latest month'),
    'mom6_1': ('6-month momentum', 'Momentum', True, 'Return over the past six months, skipping the latest month'),
    'trend50': ('Above 50-day average', 'Trend', True, 'Distance of price above its 50-day average'),
    'trend200': ('Above 200-day average', 'Trend', True, 'Distance of price above its 200-day average'),
    'low_vol': ('Low volatility', 'Stability', True, 'Calmer daily moves over three months'),
    'low_downside': ('Low downside risk', 'Stability', True, 'Smaller losing days over three months'),
    'mom3_1': ('3-month momentum', 'Momentum', False, 'Return over the past three months, skipping the latest month'),
    'reversal_1m': ('1-month reversal', 'Reversal', False, 'Stocks that fell most in the latest month'),
    'high52': ('Near 52-week high', 'Momentum', False, 'Closeness of price to its one-year high'),
    'golden_cross': ('50-day vs 200-day average', 'Trend', False, 'How far the 50-day average sits above the 200-day'),
    'residual_mom': ('Stock-specific momentum', 'Momentum', False, 'Momentum after removing the market\'s contribution'),
    'risk_adj_mom': ('Risk-adjusted momentum', 'Momentum', False, '12-month momentum per unit of volatility'),
    'steady_mom': ('Steady momentum', 'Momentum', False, 'Gains built from many small up days rather than a few jumps'),
    'sector_rel_mom': ('Sector-relative momentum', 'Momentum', False, '12-month momentum versus the stock\'s own sector'),
    'low_beta': ('Low market sensitivity', 'Stability', False, 'Moves less than the market'),
    'no_lottery': ('No lottery spikes', 'Stability', False, 'No extreme single-day jump in the latest month'),
    'low_vol_1y': ('Low volatility (1 year)', 'Stability', False, 'Calmer daily moves over a year'),
    'volume_trend': ('Rising trading volume', 'Liquidity', False, 'Recent volume versus its six-month average'),
    'liquid': ('High liquidity', 'Liquidity', False, 'Higher average traded value'),
    'illiquid': ('Illiquidity premium', 'Liquidity', False, 'Price moves more per rupee traded'),
}


# ---------------------------------------------------------------- panels
def is_etf(ticker, sector=None):
    name = ticker.upper()
    return sector == 'ETF' or name.startswith('^') or any(token in name for token in ETF_TOKENS)


def _panel(table, sectors):
    wide = {field: table.pivot_table(index='Date', columns='Ticker', values=field, aggfunc='last').sort_index()
            for field in ('Close', 'Volume')}
    for frame in wide.values():
        frame.index = pd.to_datetime(frame.index)
    benchmark = wide['Close'].get('^NSEI')
    if benchmark is None or benchmark.notna().sum() < 300:
        raise ValueError('NIFTY (^NSEI) history is required')
    keep = benchmark.notna()
    stocks = [t for t in wide['Close'].columns if not is_etf(t, sectors.get(t))]
    close = wide['Close'].loc[keep, stocks]
    return {'close': close, 'volume': wide['Volume'].loc[keep].reindex(columns=stocks),
            'benchmark': benchmark.loc[keep], 'sectors': {t: sectors.get(t) for t in stocks}}


def panel_from_database(database='data/market_scans.db'):
    with sqlite3.connect(Path(database).resolve().as_uri() + '?mode=ro', uri=True) as conn:
        table = repair_long(pd.read_sql_query('SELECT Ticker,Date,Open,Close,Volume FROM daily_ohlcv', conn))
        sectors = dict(conn.execute('SELECT Ticker, Sector FROM historical_scans ORDER BY Scan_Date'))
    return _panel(table, sectors)


def panel_from_frames(frames, sectors=None):
    """frames: {ticker: OHLCV DataFrame indexed by date}. Histories are repaired first."""
    parts = []
    for ticker, frame in frames.items():
        if frame is None or frame.empty or 'Close' not in frame:
            continue
        frame = frame.copy()
        frame.index = pd.to_datetime(frame.index).tz_localize(None).normalize()
        frame = repair_discontinuities(frame.loc[~frame.index.duplicated(keep='last')].sort_index())
        parts.append(frame[['Close', 'Volume']].rename_axis('Date').reset_index().assign(Ticker=ticker))
    return _panel(pd.concat(parts, ignore_index=True), sectors or {})


# ---------------------------------------------------------------- factors
def eligibility(panel):
    close, volume = panel['close'], panel['volume']
    liquid = (close * volume).rolling(30, min_periods=30).mean() >= MIN_ADTV_INR
    return liquid & (close > 0) & close.rolling(253).count().eq(253)


def raw_factors(panel):
    close, volume, market = panel['close'], panel['volume'], panel['benchmark'].pct_change()
    ret = close.pct_change(fill_method=None)
    vol63, vol252 = ret.rolling(63).std(), ret.rolling(252).std()
    beta = ret.rolling(252).cov(market).div(market.rolling(252).var(), axis=0)
    residual = ret.sub(beta.mul(market, axis=0))
    mom12 = close.shift(21) / close.shift(252) - 1
    sector = pd.Series(panel['sectors']).reindex(close.columns).fillna('Unknown')
    sector_median = mom12.T.groupby(sector).transform('median').T
    traded = close * volume
    out = {
        'mom12_1': mom12,
        'mom6_1': close.shift(21) / close.shift(126) - 1,
        'trend50': close / close.rolling(50).mean() - 1,
        'trend200': close / close.rolling(200).mean() - 1,
        'low_vol': -vol63,
        'low_downside': -np.sqrt(ret.clip(upper=0).pow(2).rolling(63).mean()),
        'mom3_1': close.shift(21) / close.shift(63) - 1,
        'reversal_1m': -(close / close.shift(21) - 1),
        'high52': close / close.rolling(252).max() - 1,
        'golden_cross': close.rolling(50).mean() / close.rolling(200).mean() - 1,
        'residual_mom': residual.rolling(231).sum().shift(21) / (residual.rolling(252).std() * np.sqrt(231)),
        'risk_adj_mom': mom12 / (vol252 * np.sqrt(252)),
        'steady_mom': ((ret > 0).rolling(231).mean() - (ret < 0).rolling(231).mean()).shift(21),
        'sector_rel_mom': mom12 - sector_median,
        'low_beta': -beta,
        'no_lottery': -ret.rolling(21).max(),
        'low_vol_1y': -vol252,
        'volume_trend': volume.rolling(21).mean() / volume.rolling(126).mean() - 1,
        'liquid': traded.rolling(63).mean(),
        'illiquid': (ret.abs() / traded.where(traded > 0)).rolling(63).mean(),
    }
    return {name: frame.replace([np.inf, -np.inf], np.nan) for name, frame in out.items()}


def percentile(frame, eligible):
    masked = frame.where(eligible)
    return masked.rank(axis=1).sub(.5).div(masked.notna().sum(axis=1), axis=0)


def model_scores(ranks):
    momentum = (ranks['mom12_1'] + ranks['mom6_1']) / 2
    trend = (ranks['trend50'] + ranks['trend200']) / 2
    stability = (ranks['low_vol'] + ranks['low_downside']) / 2
    return {name: (a * momentum + b * trend + c * stability) / (a + b + c)
            for name, (a, b, c) in MODEL_PRICE_WEIGHTS.items()}


# ---------------------------------------------------------------- statistics
def forward_returns(panel, horizon):
    close, benchmark = panel['close'], panel['benchmark']
    stock = close.shift(-(horizon + 1)) / close.shift(-1) - 1
    market = benchmark.shift(-(horizon + 1)) / benchmark.shift(-1) - 1
    return stock, market


def daily_ic(score, target, valid):
    return score.where(valid).corrwith(target, axis=1, method='spearman').dropna()


def newey_west_t(series, lags):
    """t-statistic of the mean allowing for overlap between forward windows."""
    values = np.asarray(series.dropna(), dtype=float)
    n = len(values)
    if n < 2 * lags or n < 30:
        return None
    centred = values - values.mean()
    variance = (centred ** 2).mean()
    for lag in range(1, lags + 1):
        variance += 2 * (1 - lag / (lags + 1)) * (centred[lag:] * centred[:-lag]).mean()
    return float(values.mean() / np.sqrt(max(variance, 1e-12) / n))


def _round(value, digits=3):
    return None if value is None or not np.isfinite(value) else round(float(value), digits)


def ic_summary(ic, horizon):
    if len(ic) < 2 * horizon:
        return None
    middle = ic.index[len(ic) // 2]
    yearly = ic.groupby(ic.index.year).mean()
    return {'ic': _round(ic.mean()), 't': _round(newey_west_t(ic, horizon), 2), 'days': int(len(ic)),
            'independent_periods': int(len(ic) // horizon),
            'first_half': _round(ic[:middle].mean()), 'second_half': _round(ic[middle:].mean()),
            'positive_days': _round((ic > 0).mean(), 2),
            'years_positive': int((yearly > 0).sum()), 'years': int(len(yearly)),
            'by_year': {str(year): _round(value) for year, value in yearly.items()}}


def top_basket(score, panel, valid, horizon, size=20):
    """Non-overlapping top-N baskets: net return, NIFTY, and the average eligible stock."""
    close, benchmark = panel['close'], panel['benchmark']
    dates = score.index[valid.sum(axis=1) >= MIN_STOCKS][::horizon]
    rows = []
    for date in dates:
        i = close.index.get_loc(date)
        if i + horizon + 1 >= len(close):
            break
        ranked = score.loc[date].where(valid.loc[date]).dropna().sort_values(ascending=False)
        window = close.iloc[[i + 1, i + horizon + 1]]
        gross = (window.iloc[1] / window.iloc[0] - 1).reindex(ranked.index).dropna()
        if len(gross) < MIN_STOCKS:
            continue
        net = lambda value: (1 + value) * (1 - COST) / (1 + COST) - 1
        rows.append({'date': date, 'basket': net(gross.head(size).mean()), 'universe': net(gross.mean()),
                     'nifty': benchmark.iloc[i + horizon + 1] / benchmark.iloc[i + 1] - 1})
    return pd.DataFrame(rows)


def verdict(short, long):
    if not short or short['t'] is None:
        return 'Not enough history'
    same_sign = np.sign(short['first_half']) == np.sign(short['second_half']) == np.sign(short['ic'])
    long_agrees = bool(long) and np.sign(long['ic']) == np.sign(short['ic'])
    if abs(short['t']) >= 3 and same_sign and long_agrees:
        return 'Supported' if short['ic'] > 0 else 'Supported (reversed)'
    if abs(short['t']) >= 2 and same_sign:
        return 'Promising'
    if not same_sign:
        return 'Unstable'
    return 'Not supported'


def regime_states(panel, valid):
    """Market conditions known at each close, for testing a risk guard."""
    close, benchmark = panel['close'], panel['benchmark']
    above50 = (close > close.rolling(50).mean()).where(valid)
    return {
        'nifty_above_200d': benchmark > benchmark.rolling(200).mean(),
        'nifty_above_50d': benchmark > benchmark.rolling(50).mean(),
        'breadth_above_half': above50.mean(axis=1) > .5,
        'nifty_up_3_months': benchmark / benchmark.shift(63) - 1 > 0,
    }


REGIME_LABELS = {
    'nifty_above_200d': 'NIFTY above its 200-day average',
    'nifty_above_50d': 'NIFTY above its 50-day average',
    'breadth_above_half': 'More than half of stocks above their 50-day average',
    'nifty_up_3_months': 'NIFTY up over the past 3 months',
}


def regime_study(panel, valid, score, horizon=21):
    """Does the market's state at purchase change what the top picks then earn?"""
    stock, _ = forward_returns(panel, horizon)
    ranks = score.where(valid).rank(axis=1, ascending=False)
    picks = stock.where(ranks <= 20).mean(axis=1)
    everyone = stock.where(valid).mean(axis=1)
    frame = pd.DataFrame({'picks': picks, 'all': everyone}).dropna()
    result = {}
    for name, state in regime_states(panel, valid).items():
        joined = frame.join(state.rename('on')).dropna()
        joined['on'] = joined['on'].astype(bool)
        if joined['on'].nunique() < 2:
            continue
        entry = {'label': REGIME_LABELS[name]}
        for key, part in (('favourable', joined[joined['on']]), ('unfavourable', joined[~joined['on']])):
            entry[key] = {'days': int(len(part)), 'independent_periods': int(len(part) // horizon),
                          'picks_mean_return': _round(part['picks'].mean(), 4),
                          'picks_positive_share': _round((part['picks'] > 0).mean(), 2),
                          'all_stocks_mean_return': _round(part['all'].mean(), 4)}
        difference = joined.loc[joined['on'], 'picks'].mean() - joined.loc[~joined['on'], 'picks'].mean()
        # Standard error from block means, since neighbouring days share most of their window.
        blocks = joined.groupby(np.arange(len(joined)) // horizon).agg(on=('on', 'mean'), picks=('picks', 'mean'))
        good, bad = blocks.loc[blocks.on >= .5, 'picks'], blocks.loc[blocks.on < .5, 'picks']
        se = np.sqrt(good.var() / len(good) + bad.var() / len(bad)) if len(good) > 2 and len(bad) > 2 else np.nan
        entry['difference'] = _round(difference, 4)
        entry['t'] = _round(difference / se, 2) if np.isfinite(se) and se > 0 else None
        entry['reliable'] = bool(entry['t'] is not None and abs(entry['t']) >= 2
                                 and min(len(good), len(bad)) >= 6)
        result[name] = entry
    return result


# ---------------------------------------------------------------- study
def study(panel, source='database'):
    valid = eligibility(panel)
    valid_days = valid.sum(axis=1) >= MIN_STOCKS
    if valid_days.sum() < 3 * HORIZONS[0]:
        raise ValueError('Not enough eligible history for a factor study')
    ranks = {name: percentile(frame, valid) for name, frame in raw_factors(panel).items()}
    models = model_scores(ranks)
    targets = {h: forward_returns(panel, h) for h in HORIZONS}
    excess = {h: stock.sub(market, axis=0) for h, (stock, market) in targets.items()}
    base_ic = {h: daily_ic(models['short' if h == 21 else 'long'], excess[h], valid) for h in HORIZONS}

    factors = []
    for name, (label, group, in_model, meaning) in FACTORS.items():
        stats = {h: ic_summary(daily_ic(ranks[name], excess[h], valid), h) for h in HORIZONS}
        entry = {'id': name, 'label': label, 'group': group, 'in_model': in_model, 'meaning': meaning,
                 'h21': stats[21], 'h63': stats[63], 'verdict': verdict(stats[21], stats[63])}
        if not in_model and stats[21]:
            # Would the live short-horizon price score rank better with 20% of this factor blended in?
            blended = daily_ic(.8 * models['short'] + .2 * ranks[name], excess[21], valid)
            gain = (blended - base_ic[21]).dropna()
            middle = gain.index[len(gain) // 2] if len(gain) else None
            t_gain = newey_west_t(gain, 21)
            both = bool(len(gain) and gain[:middle].mean() > 0 and gain[middle:].mean() > 0)
            entry['adds_to_model'] = {'ic_gain': _round(gain.mean(), 4) if len(gain) else None, 't': _round(t_gain, 2),
                                      'both_halves': both,
                                      'passes': bool(t_gain is not None and t_gain >= 2 and both)}
        factors.append(entry)

    model = {}
    for name, score in models.items():
        horizon = 63 if name == 'long' else 21
        baskets = top_basket(score, panel, valid, horizon)
        model[name] = {'horizon': horizon, **(ic_summary(daily_ic(score, excess[horizon], valid), horizon) or {}),
                       'top20': None if baskets.empty else {
                           'periods': int(len(baskets)),
                           'mean_net_return': _round(baskets.basket.mean(), 4),
                           'mean_nifty': _round(baskets.nifty.mean(), 4),
                           'mean_all_stocks': _round(baskets.universe.mean(), 4),
                           'beat_nifty_share': _round((baskets.basket > baskets.nifty).mean(), 2),
                           'positive_share': _round((baskets.basket > 0).mean(), 2),
                           'worst_period': _round(baskets.basket.min(), 4)}}

    days = valid.index[valid_days]
    return {
        'generated': pd.Timestamp.now(tz='Asia/Kolkata').strftime('%Y-%m-%d %H:%M IST'),
        'source': source,
        'span': {'start': str(days[0].date()), 'end': str(days[-1].date()), 'sessions': int(len(days)),
                 'years': round(len(days) / 252, 1)},
        'universe': {'stocks': int(panel['close'].shape[1]),
                     'median_eligible': int(valid.sum(axis=1)[valid_days].median())},
        'method': ('Rank correlation between each factor and the next 21- or 63-session return in excess of '
                   'NIFTY, entering at the next close. t-statistics allow for overlapping windows. '
                   'Supported means |t| of 3 or more, with the same sign in both halves and at both horizons.'),
        'caveats': ['Only stocks tracked today are included, which flatters past results (survivorship bias).',
                    'Fundamental factors are not tested: no point-in-time statement history exists yet.',
                    'This is evidence about ranking, not a forecast of returns.'],
        'factors': factors, 'model': model,
        'regime': regime_study(panel, valid, models['short']),
    }


def write(report, path='data/factor_research.json'):
    from utils import atomic_json
    atomic_json(path, json.loads(json.dumps(report, allow_nan=False)))
    return path


# ---------------------------------------------------------------- fundamentals
FUNDAMENTAL_INPUTS = {
    'roe': ('Return on equity', 'Quality'), 'roa': ('Return on assets', 'Quality'),
    'roce': ('Return on capital employed', 'Quality'), 'margin': ('Profit margin', 'Quality'),
    'cash_quality': ('Cash quality', 'Quality'), 'leverage': ('Low leverage', 'Quality'),
    'earnings_yield': ('Earnings yield', 'Value'), 'book_yield': ('Book yield', 'Value'),
    'fcf_yield': ('Free-cash-flow yield', 'Value'), 'sales_yield': ('Sales yield', 'Value'),
}
FUNDAMENTAL_HORIZON = 21
# A verdict on a fundamental input needs a year of daily snapshots (about 12 separate months).
FUNDAMENTAL_DATES_REQUIRED = 252


def fundamental_study(database='data/market_scans.db', version=None):
    """Test quality and value inputs on the fundamentals the app itself recorded.

    Each saved rating snapshot holds the fundamentals exactly as they were known
    that day, so this is free of look-ahead. It only becomes meaningful as
    snapshots accumulate; until then it reports how much history is still needed.
    """
    from engine.ranking import MODEL_VERSION
    version = version or MODEL_VERSION
    with sqlite3.connect(Path(database).resolve().as_uri() + '?mode=ro', uri=True) as conn:
        tables = {row[0] for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        if 'ranking_history' not in tables:
            return None
        rows = conn.execute('SELECT Scan_Date, Ticker, Payload FROM ranking_history WHERE Model_Version=?', (version,)).fetchall()
        quotes = repair_long(pd.read_sql_query('SELECT Ticker,Date,Open,Close FROM daily_ohlcv', conn))
    prices = quotes.pivot_table(index='Date', columns='Ticker', values='Close', aggfunc='last').sort_index()
    prices.index = pd.to_datetime(prices.index)
    if '^NSEI' not in prices or not rows:
        return None
    prices = prices.loc[prices['^NSEI'].notna()]
    records = []
    for scan_date, ticker, payload in rows:
        row = (json.loads(payload) or {}).get('row') or {}
        inputs = row.get('Ranking_Inputs') or {}
        records.append({'day': scan_date[:10], 'Ticker': ticker, 'Sector': row.get('Sector'),
                        **{name: inputs.get(name) for name in FUNDAMENTAL_INPUTS}})
    frame = pd.DataFrame(records).drop_duplicates(['day', 'Ticker'], keep='last')
    frame = frame[frame.Sector != 'ETF']
    series = {name: [] for name in FUNDAMENTAL_INPUTS}
    matured = 0
    for day, group in frame.groupby('day'):
        entry = prices.index.searchsorted(pd.Timestamp(day), side='right')
        exit_ = entry + FUNDAMENTAL_HORIZON
        if exit_ >= len(prices):
            continue
        change = prices.iloc[exit_] / prices.iloc[entry] - 1
        target = (change - change['^NSEI']).reindex(group.Ticker).to_numpy()
        matured += 1
        for name in FUNDAMENTAL_INPUTS:
            values = pd.to_numeric(group[name], errors='coerce').to_numpy()
            keep = np.isfinite(values) & np.isfinite(target)
            if keep.sum() >= MIN_STOCKS and len(np.unique(values[keep])) > 3:
                series[name].append(pd.Series(values[keep]).corr(pd.Series(target[keep]), method='spearman'))
    enough = matured >= FUNDAMENTAL_DATES_REQUIRED
    inputs = []
    for name, (label, group) in FUNDAMENTAL_INPUTS.items():
        values = pd.Series(series[name], dtype=float).dropna()
        stats = None
        if len(values):
            stats = {'ic': _round(values.mean()), 'dates': int(len(values)),
                     't': _round(newey_west_t(values, FUNDAMENTAL_HORIZON), 2) if enough else None}
        inputs.append({'id': name, 'label': label, 'group': group, **(stats or {'ic': None, 'dates': 0, 't': None}),
                       'verdict': 'Not enough history' if not enough or not stats or stats['t'] is None
                       else 'Supported' if stats['t'] >= 3 else 'Promising' if stats['t'] >= 2 else 'Not supported'})
    return {'version': version, 'snapshot_dates': int(frame.day.nunique()), 'matured_dates': matured,
            'dates_required': FUNDAMENTAL_DATES_REQUIRED, 'enough_history': enough, 'inputs': inputs,
            'note': ('Fundamentals as recorded on each scan date, tested against the following 21 sessions. '
                     'Readings from a handful of dates are noise; verdicts appear after a year of snapshots.')}
