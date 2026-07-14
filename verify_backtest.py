import json
with open('frontend/public/quant_data.json') as f:
    d = json.load(f)
print('Top-level keys:', list(d.keys()))
print()
for k in ['backtest_short_1y','backtest_short_6m','backtest_long_1y','backtest_long_6m']:
    v = d.get(k)
    if v:
        n = len(v.get('chart', []))
        s = v.get('stats', {})
        cagr = s.get('cagr')
        sharpe = s.get('sharpe')
        mdd = s.get('max_drawdown')
        wr = s.get('win_rate')
        print(k + ': ' + str(n) + ' chart pts | CAGR=' + str(cagr) + '% | Sharpe=' + str(sharpe) + ' | MaxDD=' + str(mdd) + '% | WinRate=' + str(wr) + '%')
    else:
        print(k + ': MISSING')
print()
# Spot-check first and last chart entry for short_1y
v1y = d.get('backtest_short_1y', {})
chart = v1y.get('chart', [])
if chart:
    print('short_1y first entry:', chart[0])
    print('short_1y last entry: ', chart[-1])
