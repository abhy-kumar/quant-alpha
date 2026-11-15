"""A plain report on the data behind each scan, and whether anything degraded.

Published with the scan so a missing source or a collapsing input is visible the
day it happens instead of weeks later.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

RANKING_INPUTS = {
    'roe': 'Return on equity', 'roa': 'Return on assets', 'roce': 'Return on capital', 'margin': 'Profit margin',
    'cash_quality': 'Cash quality', 'leverage': 'Leverage', 'earnings_yield': 'Earnings yield',
    'book_yield': 'Book yield', 'fcf_yield': 'Free-cash-flow yield', 'mom12': '12-month momentum',
    'mom6': '6-month momentum', 'trend50': '50-day trend', 'trend200': '200-day trend',
    'volatility': 'Volatility', 'downside': 'Downside risk',
}
# Inputs that do not apply to banks and other financial companies are measured on the rest.
NON_FINANCIAL_ONLY = {'roce', 'leverage', 'fcf_yield', 'cash_quality', 'margin'}
MIN_COVERAGE = 75          # percent of applicable stocks that must have an input
MAX_COVERAGE_DROP = 10     # percentage points lost since the previous scan
MAX_PRICE_MISMATCH = 0.02  # share of cross-checked closes that may disagree
PRICE_TOLERANCE = 0.01
READING_NAMES = {'trend': 'NIFTY trend', 'vix': 'India VIX', 'fii': 'FII/DII flows', 'pcr': 'Put-call ratio', 'breadth': 'Market breadth'}


def cross_check_closes(histories: dict, bhav: pd.DataFrame, bhav_date) -> dict | None:
    """Compare the price vendor's latest close with the exchange's own daily file."""
    if bhav is None or bhav.empty or bhav_date is None or 'CLOSE_PRICE' not in bhav:
        return None
    day = pd.Timestamp(bhav_date).date()
    official = pd.Series(pd.to_numeric(bhav['CLOSE_PRICE'], errors='coerce').to_numpy(),
                         index=bhav['SYMBOL'].astype(str).str.strip() + '.NS')
    official = official[~official.index.duplicated(keep=False)]
    compared, worst = 0, []
    for ticker, frame in histories.items():
        if frame is None or frame.empty or ticker not in official.index:
            continue
        if pd.Timestamp(frame.index[-1]).date() != day:
            continue
        vendor, exchange = float(frame['Close'].iloc[-1]), float(official[ticker])
        if not (np.isfinite(vendor) and np.isfinite(exchange) and exchange > 0):
            continue
        compared += 1
        gap = vendor / exchange - 1
        if abs(gap) > PRICE_TOLERANCE:
            worst.append({'ticker': ticker, 'vendor': round(vendor, 2), 'exchange': round(exchange, 2), 'gap': round(gap, 4)})
    worst.sort(key=lambda item: -abs(item['gap']))
    return {'date': str(day), 'compared': compared, 'mismatched': len(worst), 'worst': worst[:8]}


def build(rows: list[dict], regime: dict | None = None, requested: int | None = None,
          price_check: dict | None = None, previous: dict | None = None, scan_time: str | None = None) -> dict:
    frame = pd.DataFrame(rows)
    stocks = frame[frame.get('Sector') != 'ETF'] if len(frame) else frame
    total = len(stocks)
    issues = []
    financial = stocks.get('Sector', pd.Series(dtype=object)) == 'Financial Services' if total else pd.Series(dtype=bool)
    inputs = pd.DataFrame(list(stocks['Ranking_Inputs'].map(lambda value: value or {})), index=stocks.index) if total and 'Ranking_Inputs' in stocks else pd.DataFrame()
    earlier = {item['id']: item['coverage'] for item in (previous or {}).get('inputs', [])}
    coverage = []
    for name, label in RANKING_INPUTS.items():
        applicable = ~financial if name in NON_FINANCIAL_ONLY else pd.Series(True, index=stocks.index)
        count = int(applicable.sum()) if total else 0
        have = int(pd.to_numeric(inputs[name], errors='coerce').notna()[applicable].sum()) if count and name in inputs else 0
        percent = round(100 * have / count, 1) if count else 0.0
        change = round(percent - earlier[name], 1) if name in earlier else None
        coverage.append({'id': name, 'label': label, 'coverage': percent, 'stocks': have, 'of': count, 'change': change})
        if count and percent < MIN_COVERAGE:
            issues.append(f'{label} is available for only {percent:.0f}% of stocks.')
        elif change is not None and change <= -MAX_COVERAGE_DROP:
            issues.append(f'{label} coverage fell {abs(change):.0f} points since the previous scan.')

    def share(column, test):
        if not total or column not in stocks:
            return None
        return round(100 * float(test(stocks[column]).mean()), 1)

    eligible = share('Ranking_Eligible', lambda col: col.map(lambda value: bool((value or {}).get('balanced'))))
    if eligible is not None and eligible < 60:
        issues.append(f'Only {eligible:.0f}% of stocks have enough data to be rated.')
    fields = {
        'Market value': share('Market_Cap_B', lambda col: pd.to_numeric(col, errors='coerce') > 0),
        'Promoter holding': share('Promoter_Holding_%', lambda col: pd.to_numeric(col, errors='coerce').notna()),
        'Promoter pledging checked': share('Promoter_Pledge_Checked', lambda col: col.fillna(False).astype(bool)),
        'Price dated to the latest session': None,
    }
    if total and 'Ranking_Price_Date' in stocks:
        dates = stocks['Ranking_Price_Date'].dropna()
        if len(dates):
            fields['Price dated to the latest session'] = round(100 * float((stocks['Ranking_Price_Date'] == dates.max()).mean()), 1)
    for label, percent in fields.items():
        if percent is not None and percent < 70 and label != 'Promoter pledging checked':
            issues.append(f'{label} is available for only {percent:.0f}% of stocks.')

    missing = list((regime or {}).get('missing', []))
    if missing:
        issues.append('Market readings unavailable: ' + ', '.join(READING_NAMES.get(name, name) for name in missing) + '.')
    if price_check and price_check['compared']:
        rate = price_check['mismatched'] / price_check['compared']
        if rate > MAX_PRICE_MISMATCH:
            issues.append(f"{price_check['mismatched']} of {price_check['compared']} closing prices differ from the NSE daily file by more than 1%.")
    if requested and total < 0.8 * requested:
        issues.append(f'Only {total} of {requested} requested stocks were scanned.')
    earlier_total = (previous or {}).get('stocks')
    if earlier_total and total < 0.8 * earlier_total:
        issues.append(f'Stocks scanned fell from {earlier_total} to {total}.')

    labels = stocks['Conviction'].value_counts().to_dict() if total and 'Conviction' in stocks else {}
    return {
        'status': 'degraded' if issues else 'ok', 'issues': issues, 'scan_time': scan_time,
        'stocks': total, 'requested': requested, 'eligible_pct': eligible,
        'inputs': coverage, 'fields': [{'label': label, 'coverage': percent} for label, percent in fields.items()],
        'market_readings': {'available': (regime or {}).get('readings'), 'of': len(READING_NAMES),
                            'missing': [READING_NAMES.get(name, name) for name in missing]},
        'price_check': price_check, 'ratings': {str(label): int(count) for label, count in labels.items()},
    }
