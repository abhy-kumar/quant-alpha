"""Transparent, coverage-aware cross-sectional ranking. No fitted return claims.

Units at this boundary: ROE/ROA and growth are fractions; ROCE and D/E are
percentage points; price, EPS and book value use the same currency per share.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

MODEL_VERSION = "ranking-v3.0"
WEIGHTS = {
    "short": dict(quality=.15, value=.10, momentum=.35, trend=.25, stability=.15),
    "long": dict(quality=.35, value=.30, momentum=.15, trend=.05, stability=.15),
    "balanced": dict(quality=.25, value=.20, momentum=.25, trend=.15, stability=.15),
}
MIN_PEERS = 8


def number(value):
    try:
        value = float(value)
        return value if np.isfinite(value) else np.nan
    except (TypeError, ValueError):
        return np.nan


def ratio(a, b):
    a, b = number(a), number(b)
    return a / b if np.isfinite(a) and np.isfinite(b) and b > 0 else np.nan


def midpoint_percentile(value, peers):
    """Equal observations have equal midranks; an all-tied cohort scores 50."""
    peers = np.asarray(peers, dtype=float)
    peers = peers[np.isfinite(peers)]
    if not np.isfinite(value) or len(peers) == 0:
        return 50.0
    return float(100 * ((peers < value).sum() + .5 * (peers == value).sum()) / len(peers))


def raw_factors(item):
    info = item['info']
    financial = item.get('sector') == 'Financial Services'
    frame = item.get('df')
    close = (pd.to_numeric(frame['Close'], errors='coerce')
             if frame is not None and 'Close' in frame else pd.Series(dtype=float))
    price = number(item.get('latest', {}).get('Close'))
    shares = number(info.get('sharesOutstanding'))
    cap = price * shares if price > 0 and shares > 0 else np.nan
    eps = number(info.get('trailingEps'))
    if not np.isfinite(eps):
        eps = ratio(info.get('netIncomeToCommon'), shares)
    # Never fabricate assets from equity plus debt minus cash.
    assets = info.get('totalAssets') if info.get('_statement_assets') else np.nan
    cash_quality = ratio(number(info.get('operatingCashflow')) - number(info.get('netIncomeToCommon')), assets)
    quality = ({'roe': .50, 'roa': .25, 'margin': .25} if financial else
               {'roe': .30, 'roce': .20, 'roa': .20, 'cash_quality': .15, 'leverage': .15})
    value = {'earnings_yield': .60, 'book_yield': .40} if financial else {'earnings_yield': .50, 'book_yield': .30, 'fcf_yield': .20}
    raw = {
        'roe': number(info.get('returnOnEquity')),
        'roa': number(info.get('returnOnAssets')),
        'roce': number(info.get('roce')),
        'margin': number(info.get('profitMargins')),
        'cash_quality': cash_quality,
        'leverage': -number(info.get('debtToEquity')),
        'earnings_yield': ratio(eps, price),
        'book_yield': ratio(info.get('bookValue'), price),
        'fcf_yield': ratio(info.get('freeCashflow'), cap),
    }
    if info.get('_ranking_fundamentals_valid') is False:
        raw = {key: np.nan for key in raw}
    def momentum(days):
        # Exclude the most recent 21 sessions. Use exactly `days` price intervals.
        window = close.iloc[-(days + 1):]
        if len(window) < days + 1 or not np.isfinite(window).all() or (window <= 0).any():
            return np.nan
        return float(window.iloc[-22] / window.iloc[0] - 1)
    raw['mom12'] = momentum(252)
    raw['mom6'] = momentum(126)
    for days in [50, 200]:
        window = close.tail(days)
        raw[f'trend{days}'] = (ratio(price, window.mean()) - 1
                                 if len(window) == days and np.isfinite(window).all() and (window > 0).all() else np.nan)
    window = close.tail(64)
    valid = len(window) == 64 and np.isfinite(window).all() and (window > 0).all()
    returns = window.pct_change(fill_method=None).iloc[1:] if valid else pd.Series(dtype=float)
    raw['volatility'] = -float(returns.std(ddof=1) * np.sqrt(252)) if valid else np.nan
    raw['downside'] = -float(np.sqrt(np.mean(np.minimum(returns, 0) ** 2) * 252)) if valid else np.nan
    groups = {'quality': quality, 'value': value, 'momentum': {'mom12': .5, 'mom6': .5},
              'trend': {'trend50': .5, 'trend200': .5}, 'stability': {'volatility': .5, 'downside': .5}}
    return raw, groups, financial


def apply_ranking(items, reference_date=None, trading_dates=None):
    """Mutate scanner rows with one versioned model and horizon-specific labels."""
    inputs = items
    if trading_dates is not None:
        calendar = pd.DatetimeIndex(trading_dates).tz_localize(None).normalize()
        inputs = []
        for item in items:
            frame = item.get('df')
            if frame is not None and len(frame):
                frame = frame.copy()
                frame.index = pd.DatetimeIndex(frame.index).tz_localize(None).normalize()
                frame = frame.reindex(calendar)
            inputs.append({**item, 'df': frame})
    extracted = [raw_factors(item) for item in inputs]
    equities = [i for i, item in enumerate(items) if not item.get('is_etf')]
    dates = [str(pd.Timestamp(item['df'].index[-1]).date()) for item in items
             if item.get('df') is not None and len(item['df']) and not item.get('is_etf')]
    reference_date = reference_date or (pd.Series(dates).mode().iloc[-1] if dates else None)
    for i, item in enumerate(items):
        raw, groups, financial = extracted[i]
        scores, coverage = {}, {}
        for pillar, features in groups.items():
            scores[pillar], coverage[pillar] = 0., 0.
            for key, weight in features.items():
                value = raw[key]
                # Accounting comparisons never mix financial and nonfinancial firms.
                pool = [j for j in equities if (extracted[j][2] == financial or pillar not in ('quality', 'value'))
                        and np.isfinite(extracted[j][0].get(key, np.nan))]
                if pillar in ('quality', 'value'):
                    sector_pool = [j for j in pool if items[j].get('sector') == item.get('sector')]
                    if len(sector_pool) >= MIN_PEERS:
                        pool = sector_pool
                observed = np.isfinite(value) and len(pool) >= MIN_PEERS and not item.get('is_etf')
                rank = midpoint_percentile(value, [extracted[j][0][key] for j in pool]) / 10 if observed else 5.
                scores[pillar] += weight * rank
                coverage[pillar] += weight * float(observed)
        item['ranking_factors'] = scores
        item['ranking_inputs'] = {k: float(v) if np.isfinite(v) else None for k, v in raw.items()}
        frame = item.get('df')
        price_date = str(pd.Timestamp(frame.index[-1]).date()) if frame is not None and len(frame) else None
        item['ranking_price_date'] = price_date
        item['ranking_coverage'] = coverage
        item['ranking_version'] = MODEL_VERSION
        item['ranking_eligible'] = {}
        item['ranking_scores'] = {}
        item['ranking_horizon_coverage'] = {}
        info = item['info']
        flags = []
        if number(info.get('bookValue')) <= 0:
            flags.append('Nonpositive book equity')
        if number(info.get('promoter_pledging')) > 20:
            flags.append('Promoter pledging exceeds 20%')
        if number(info.get('trailingEps')) < 0 or number(info.get('netIncomeToCommon')) < 0:
            flags.append('Negative trailing earnings')
        item['red_flags'] = flags
        item['quality_gated'] = bool(flags)
        item['quality_penalty'] = 1.0
        item['quality_penalty_reasons'] = flags
        for horizon, weights in WEIGHTS.items():
            item['ranking_scores'][horizon] = sum(weights[k] * scores[k] for k in weights)
            cov = round(sum(weights[k] * coverage[k] for k in weights), 12)
            item['ranking_horizon_coverage'][horizon] = cov
            required = .75 if horizon == 'long' else .70
            item['ranking_eligible'][horizon] = (not item.get('is_etf') and cov >= required
                and price_date is not None and price_date == reference_date
                and coverage['quality'] >= .5 and coverage['value'] >= .5
                and coverage['momentum'] >= .5 and coverage['trend'] >= .5 and coverage['stability'] == 1.)

    for item in items:
        labels, percentiles = {}, {}
        for horizon in WEIGHTS:
            eligible = item['ranking_eligible'][horizon]
            peers = [x['ranking_scores'][horizon] for x in items if x['ranking_eligible'][horizon]]
            pct = midpoint_percentile(item['ranking_scores'][horizon], peers)
            percentiles[horizon] = pct if eligible else None
            score = item['ranking_scores'][horizon]
            if not eligible:
                label = 'Insufficient data'
            elif 'Nonpositive book equity' in item['red_flags']:
                label = 'Avoid'
            elif item['red_flags']:
                label = 'Caution'
            elif pct >= 90 and score >= 6.5 and item['ranking_horizon_coverage'][horizon] >= .85:
                label = 'Strong Buy'
            elif pct >= 70 and score >= 5.5:
                label = 'Buy'
            elif pct < 20 and score < 4.5:
                label = 'Avoid'
            elif pct < 40 and score < 5:
                label = 'Caution'
            else:
                label = 'Hold'
            labels[horizon] = label
        item['ranking_percentiles'] = percentiles
        item['conviction'], item['tactical_conviction'], item['conviction_long'] = labels['balanced'], labels['short'], labels['long']
        item['composite_score'] = item['ranking_scores']['balanced']
        item['composite_score_tech'] = item['ranking_scores']['short']
        item['composite_score_long'] = item['ranking_scores']['long']
        item['composite_score_fund'] = item['composite_score_long']  # compatibility alias
        item['composite_score_mom'] = item['ranking_factors']['momentum']
        item['fund_score'] = (item['ranking_factors']['quality'] + item['ranking_factors']['value']) / 2
        item['norm_tech'] = item['ranking_factors']['trend']
        item['research']['research_composite'] = sum(item['ranking_factors'][k] for k in ('quality', 'value', 'momentum', 'stability')) / 4
        item['research_composite_long_raw'] = item['composite_score_long']
    return items
