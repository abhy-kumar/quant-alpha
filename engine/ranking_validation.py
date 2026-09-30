"""Chronological comparison of price ranking candidates, without future inputs.

Run with --prices pointing to locally fetched adjusted OHLCV pickles. This is a
survivor-universe research comparison, not a point-in-time fundamental backtest.
Never select a model using the final test period. Costs default to 20bp per side.
"""
import argparse
import json
from pathlib import Path
import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.linear_model import Ridge

FEATURES = ['momentum', 'trend', 'stability']
FIXED = {'equal': [1/3]*3, 'momentum': [1., 0., 0.], 'defensive': [.25, .15, .60],
         'balanced_price': [.50, .30, .20]}


def block_interval(values, block, repetitions=500):
    values = np.asarray(values, dtype=float)
    values = values[np.isfinite(values)]
    if len(values) < max(2*block, 30):
        return None
    rng = np.random.default_rng(42)
    means = []
    for _ in range(repetitions):
        starts = rng.integers(0, len(values)-block+1, size=int(np.ceil(len(values)/block)))
        sample = np.concatenate([values[start:start+block] for start in starts])[:len(values)]
        means.append(sample.mean())
    return np.quantile(means,[.025,.975]).tolist()


def panel_from_prices(directory):
    closes, volumes = {}, {}
    inventory_path = Path(directory) / 'universe.json'
    inventory = json.loads(inventory_path.read_text(encoding='utf8')) if inventory_path.exists() else {}
    for path in Path(directory).glob('*.pkl'):
        # Stock selection is evaluated against equities, never commodity/cash ETFs.
        if inventory.get(path.stem, {}).get('sector') == 'ETF' or any(token in path.stem.upper() for token in ('ETF', 'BEES')):
            continue
        frame = pd.read_pickle(path)
        if frame.empty:
            continue
        frame.index = pd.to_datetime(frame.index).tz_localize(None).normalize()
        frame = frame.loc[~frame.index.duplicated(keep='last')].sort_index()
        closes[path.stem] = frame['Close']
        volumes[path.stem] = frame['Volume']
    prices = pd.DataFrame(closes).sort_index()
    if 'NSEI' not in prices:
        raise ValueError('NSEI benchmark history is required')
    prices = prices.loc[prices.NSEI.notna()]
    volume = pd.DataFrame(volumes).reindex(prices.index)
    return prices, volume


def build_features(prices, volume):
    stocks = prices.drop(columns='NSEI')
    liquid = (stocks * volume.reindex(columns=stocks.columns)).rolling(30, min_periods=30).mean() >= 1e7
    eligible = liquid & (stocks > 0) & stocks.rolling(253).count().eq(253)
    returns = stocks.pct_change(fill_method=None)
    def rank(frame):
        masked = frame.where(eligible)
        count = masked.notna().sum(axis=1)
        return masked.rank(axis=1, method='average').sub(.5).div(count, axis=0)
    momentum = .5 * rank(stocks.shift(21) / stocks.shift(252) - 1) + .5 * rank(stocks.shift(21) / stocks.shift(126) - 1)
    trend = .5 * rank(stocks / stocks.rolling(50).mean() - 1) + .5 * rank(stocks / stocks.rolling(200).mean() - 1)
    stability = .5 * rank(-returns.rolling(63).std()) + .5 * rank(-np.sqrt(returns.clip(upper=0).pow(2).rolling(63).mean()))
    features = pd.concat({name: frame.stack() for name, frame in zip(FEATURES, [momentum, trend, stability])}, axis=1).dropna()
    features.index.names = ['Date', 'Ticker']
    return features


def target_frame(prices, horizon):
    # Signal after date t; enter at t+1 close, exit horizon sessions later.
    forward = prices.shift(-(horizon+1)) / prices.shift(-1) - 1
    excess = forward.drop(columns='NSEI').sub(forward.NSEI, axis=0)
    result = pd.DataFrame({'target': excess.stack(), 'return': forward.drop(columns='NSEI').stack()})
    result.index.names = ['Date', 'Ticker']
    exits = pd.Series(prices.index, index=prices.index).shift(-(horizon+1))
    result['Label_Exit'] = result.index.get_level_values('Date').map(exits)
    return result


def summarize(frame, scores, prices, horizon, start, end, cost=.002):
    data = frame.copy()
    data['score'] = scores
    data = data.loc[(data.index.get_level_values('Date') >= pd.Timestamp(start)) &
                    (data.index.get_level_values('Date') <= pd.Timestamp(end))]
    matured = data.loc[data.Label_Exit <= pd.Timestamp(end)]
    ic = matured.groupby(level='Date').apply(lambda g: g.score.corr(g.target, method='spearman'))
    ic = ic.replace([np.inf, -np.inf], np.nan).dropna()
    decisions = prices.index[(prices.index >= pd.Timestamp(start)) & (prices.index <= pd.Timestamp(end))][::horizon]
    net, benchmark, daily_net, holdings = [], [], [], []
    missing_periods = 0
    for date in decisions:
        if date not in data.index.get_level_values('Date'):
            continue
        group = data.xs(date, level='Date').dropna(subset=['score'])
        if len(group) < 40:
            continue
        selected = group.sort_values('score', ascending=False, kind='stable').head(20)
        loc = prices.index.get_loc(date)
        if loc+horizon+1 >= len(prices) or prices.index[loc+horizon+1] > pd.Timestamp(end):
            continue
        # Hold fixed shares; no hidden daily equal-weight rebalancing.
        segment = prices.iloc[loc+1:loc+horizon+2][selected.index]
        if len(segment) != horizon+1 or segment.isna().any().any():
            missing_periods += 1
            continue
        equity = segment.div(segment.iloc[0]).mean(axis=1)
        equity = equity / (1+cost)
        equity.iloc[-1] *= (1-cost)
        path_returns = equity.pct_change().iloc[1:]
        path_returns.iloc[0] = equity.iloc[1]-1
        daily_net.extend(path_returns.tolist())
        net.append(float(equity.iloc[-1]-1))
        benchmark.append(float(prices.NSEI.iloc[loc+horizon+1]/prices.NSEI.iloc[loc+1]-1))
        holdings.append({'date':str(date.date()), 'tickers':selected.index.tolist()})
    daily = np.array(daily_net)
    wealth = np.r_[1., np.cumprod(1+daily)]
    return {'ic':float(ic.mean()) if len(ic) else None,'ic_dates':int(ic.notna().sum()),
            'ic_block_95_interval':block_interval(ic,horizon),
            'holding_periods':len(net), 'mean_net_excess':float(np.mean(np.array(net)-benchmark)) if net else None,
            'net_total_return':float(wealth[-1]-1) if len(daily) else None,
            'net_sharpe':float(np.mean(daily)/np.std(daily,ddof=1)*np.sqrt(252)) if len(daily)>1 and np.std(daily)>0 else None,
            'max_drawdown':float(np.min(wealth/np.maximum.accumulate(wealth)-1)) if len(daily) else None,
            'holdings':holdings, 'missing_quote_periods':missing_periods}


def compare(directory):
    prices, volume = panel_from_prices(directory)
    features = build_features(prices, volume)
    report = {'scope':'Price factors only. Current tracked universe; survivorship bias remains. Latest adjusted prices may reflect subsequent corporate actions.',
              'fundamentals':'No present-day financial statements are backfilled into historical signals.',
              'selection':'Choose using 2025 validation only. 2026 is an untouched test; training labels must mature before validation starts.',
              'universe':len(prices.columns)-1,'price_start':str(prices.index.min().date()),'price_end':str(prices.index.max().date()),'horizons':{}}
    for horizon in [21, 63]:
        frame = features.join(target_frame(prices,horizon))
        dates = frame.index.get_level_values('Date')
        train = (dates < pd.Timestamp('2025-01-01')) & (frame.Label_Exit < pd.Timestamp('2025-01-01')) & frame.target.notna()
        if dates[train].nunique() < 126:
            report['horizons'][str(horizon)]={'status':'Insufficient training history'}
            continue
        x, y = frame.loc[train, FEATURES], frame.loc[train,'target'].clip(-.5,.5)
        candidates = {name:frame[FEATURES].to_numpy() @ weights for name,weights in FIXED.items()}
        models = {'ridge':Ridge(alpha=100.,positive=True),
                  'boosting':HistGradientBoostingRegressor(max_iter=120,max_leaf_nodes=7,max_depth=3,min_samples_leaf=100,l2_regularization=10,learning_rate=.05,random_state=42)}
        for name, model in models.items():
            model.fit(x,y)
            candidates[name]=model.predict(frame[FEATURES])
        validation = {name:summarize(frame,pred,prices,horizon,'2025-01-01','2025-12-31') for name,pred in candidates.items()}
        # Freeze the choice before inspecting any 2026 candidate performance.
        eligible = [name for name,v in validation.items() if v['holding_periods'] >= 3 and v['net_sharpe'] is not None and v['missing_quote_periods'] == 0]
        selected = max(eligible,key=lambda name:validation[name]['net_sharpe']) if eligible else 'equal'
        test = summarize(frame,candidates[selected],prices,horizon,'2026-01-01','2026-12-31')
        baseline_test = summarize(frame,candidates['equal'],prices,horizon,'2026-01-01','2026-12-31')
        chosen_validation = validation[selected]
        passed = all(v['mean_net_excess'] is not None and v['mean_net_excess'] > 0
                     and v['ic_block_95_interval'] is not None and v['ic_block_95_interval'][0] > 0
                     and v['holding_periods'] >= 6 and v['missing_quote_periods'] == 0
                     for v in [chosen_validation,test])
        report['horizons'][str(horizon)]={'training_rows':int(train.sum()),'training_dates':int(dates[train].nunique()),
            'validation':validation,'selected':selected,'test':test,'equal_weight_test':baseline_test,
            'price_component_passed':passed,
            'promotion':'Research evidence only; this comparison cannot validate the complete fundamental ranking.'}
        print(f'Completed {horizon}-session comparison; validation selected {selected}',flush=True)
    return report


if __name__ == '__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--prices',required=True)
    parser.add_argument('--output',required=True)
    args=parser.parse_args()
    result=compare(args.prices)
    Path(args.output).write_text(json.dumps(result,indent=2,allow_nan=False),encoding='utf8')
