"""
Retrospective Factor Analysis using 2-year daily price data.

We can't compute ICs for fundamentals (no historical fundamental snapshots),
but we CAN:
1. Compute momentum/technical signals from price history and correlate with
   forward returns across 21d, 63d, 126d horizons for ALL 527 tickers
2. Understand which factor *types* have empirically worked in this universe
3. Inform weight changes for longer-horizon composites

This is a rolling cross-sectional study:
- Every ~20 trading days (monthly), rank all tickers by each price-based signal
- Measure forward return at 21/63/126d
- Report IC (Spearman) for each signal
"""
import pandas as pd, numpy as np, sqlite3
from scipy.stats import spearmanr

conn = sqlite3.connect('data/market_scans.db')
ohlcv = pd.read_sql_query("SELECT Date, Ticker, Close, Volume FROM daily_ohlcv ORDER BY Date", conn)
conn.close()

ohlcv['Date'] = pd.to_datetime(ohlcv['Date'])
prices = ohlcv.pivot(index='Date', columns='Ticker', values='Close').ffill()
volumes = ohlcv.pivot(index='Date', columns='Ticker', values='Volume').ffill()

dates = prices.index
print(f"Universe: {prices.shape[1]} tickers, {len(dates)} days")
print(f"Range: {dates[0].date()} -> {dates[-1].date()}")
print()

# --- Rolling cross-sectional study ---
# Sample dates every 20 trading days; keep only dates with 126d forward data
sample_step = 20
min_stocks = 50
horizons = {'21d': 21, '63d': 63, '126d': 126}

# Use dates from index 126 onward (need 126d lookback) 
# and up to len-126 (need 126d forward)
start_idx = 126
end_idx = len(dates) - 127  # need at least 127 days forward

print(f"Usable range: {dates[start_idx].date()} -> {dates[end_idx].date()}")
print()

all_rows = []
sample_dates = range(start_idx, end_idx, sample_step)

for i, idx in enumerate(sample_dates):
    ref_date = dates[idx]
    
    # Signals computed at ref_date
    p0 = prices.iloc[idx]
    
    # Momentum signals (skip last month for Jegadeesh-Titman)
    def mom(lookback, skip=0):
        past_idx = max(0, idx - lookback - skip)
        skip_idx = max(0, idx - skip) if skip > 0 else idx
        p_past = prices.iloc[past_idx]
        p_skip = prices.iloc[skip_idx]
        return (p_skip / p_past - 1).replace([np.inf, -np.inf], np.nan)
    
    # Short-term reversal (1m)
    m_1m = mom(21)
    # Medium momentum (3m, skip 1m)
    m_3m = mom(63, skip=21)
    # Classic 12-1 momentum (Jegadeesh-Titman)
    m_12m_1 = mom(252, skip=21)
    # 6m momentum (skip 1m)
    m_6m = mom(126, skip=21)
    # 52w proximity
    high_252 = prices.iloc[max(0, idx-252):idx+1].max()
    prox_52w = (p0 / high_252).replace([np.inf, -np.inf], np.nan)
    
    # Volatility (lower = better for low-vol factor)
    ret_window = prices.iloc[max(0, idx-63):idx+1].pct_change().dropna()
    vol_63 = ret_window.std() * np.sqrt(252) if len(ret_window) >= 10 else pd.Series(np.nan, index=prices.columns)
    
    # Downside deviation
    neg_rets = ret_window.copy()
    neg_rets[neg_rets > 0] = 0
    downside = neg_rets.std() * np.sqrt(252) if len(neg_rets) >= 10 else pd.Series(np.nan, index=prices.columns)
    
    # RSI (14-day)
    r14 = prices.iloc[max(0, idx-15):idx+1].pct_change().dropna()
    if len(r14) >= 14:
        gains = r14.clip(lower=0).tail(14).mean()
        losses = (-r14.clip(upper=0)).tail(14).mean()
        rsi = 100 - 100 / (1 + gains / losses.replace(0, 1e-9))
    else:
        rsi = pd.Series(50.0, index=prices.columns)
    
    # Volume ratio (30d avg vs 90d avg — volume trend)
    vol_ratio = (volumes.iloc[max(0, idx-30):idx+1].mean() / 
                 volumes.iloc[max(0, idx-90):idx+1].mean().replace(0, np.nan))
    
    # Forward returns
    fwd = {}
    for h_name, h_days in horizons.items():
        fwd_idx = idx + h_days
        if fwd_idx < len(dates):
            p_fwd = prices.iloc[fwd_idx]
            fwd[h_name] = (p_fwd / p0 - 1).replace([np.inf, -np.inf], np.nan)
        else:
            fwd[h_name] = pd.Series(np.nan, index=prices.columns)
    
    # Build cross-section
    cross = pd.DataFrame({
        'mom_1m': m_1m, 'mom_3m': m_3m, 'mom_6m': m_6m, 'mom_12m_1': m_12m_1,
        'prox_52w': prox_52w, 'vol_63': vol_63, 'downside': downside,
        'rsi': rsi, 'vol_ratio': vol_ratio,
        'ret_21d': fwd['21d'], 'ret_63d': fwd['63d'], 'ret_126d': fwd['126d']
    }).dropna(subset=['ret_21d'])
    
    if len(cross) < min_stocks:
        continue
    
    row = {'date': ref_date, 'n': len(cross)}
    for sig in ['mom_1m', 'mom_3m', 'mom_6m', 'mom_12m_1', 'prox_52w', 'vol_63', 'downside', 'rsi', 'vol_ratio']:
        for h in ['21d', '63d', '126d']:
            ret_col = f'ret_{h}'
            valid = cross[[sig, ret_col]].dropna()
            if len(valid) >= 20:
                ic, pval = spearmanr(valid[sig], valid[ret_col])
                row[f'{sig}_ic_{h}'] = ic
            else:
                row[f'{sig}_ic_{h}'] = np.nan
    all_rows.append(row)

df = pd.DataFrame(all_rows)
print(f"Cross-sections computed: {len(df)}, avg stocks per cut: {df.n.mean():.0f}")
print()

signals = ['mom_1m', 'mom_3m', 'mom_6m', 'mom_12m_1', 'prox_52w', 'vol_63', 'downside', 'rsi', 'vol_ratio']
signal_labels = {
    'mom_1m': 'Momentum 1M (reversal)',
    'mom_3m': 'Momentum 3M (skip 1m)',
    'mom_6m': 'Momentum 6M (skip 1m)',
    'mom_12m_1': 'Momentum 12-1M (JT)',
    'prox_52w': '52W High Proximity',
    'vol_63':   'Volatility 63D (-)= low-vol',
    'downside': 'Downside Dev 63D (-)',
    'rsi':      'RSI 14D',
    'vol_ratio':'Volume Trend'
}

print("=" * 80)
print(f"{'Signal':<30} {'Mean IC 21d':>12} {'Mean IC 63d':>12} {'Mean IC 126d':>13}  {'IR(21d)':>8}")
print("=" * 80)
for sig in signals:
    ics = {}
    irs = {}
    for h in ['21d', '63d', '126d']:
        col = f'{sig}_ic_{h}'
        vals = df[col].dropna()
        if len(vals) > 0:
            ics[h] = vals.mean()
            irs[h] = vals.mean() / vals.std() if vals.std() > 0 else 0
        else:
            ics[h] = np.nan
            irs[h] = np.nan
    
    def fmt(v): return f'{v:+.4f}' if not np.isnan(v) else '    n/a'
    label = signal_labels.get(sig, sig)
    ir21 = irs.get('21d', np.nan)
    print(f"{label:<30} {fmt(ics.get('21d', np.nan)):>12} {fmt(ics.get('63d', np.nan)):>12} {fmt(ics.get('126d', np.nan)):>13}  {ir21:+.2f}" if not np.isnan(ir21) else f"{label:<30} {fmt(ics.get('21d', np.nan)):>12} {fmt(ics.get('63d', np.nan)):>12} {fmt(ics.get('126d', np.nan)):>13}     n/a")

print()

# Best/worst IC at each horizon
print("=" * 50)
print("Signal ranking by absolute IC at each horizon:")
for h in ['21d', '63d', '126d']:
    print(f"\n  {h}:")
    ranked = []
    for sig in signals:
        col = f'{sig}_ic_{h}'
        vals = df[col].dropna()
        if len(vals) > 0:
            ranked.append((sig, vals.mean()))
    ranked.sort(key=lambda x: abs(x[1]), reverse=True)
    for sig, ic in ranked:
        direction = '+' if ic > 0 else '-'
        print(f"    {signal_labels.get(sig, sig):<30} {ic:+.4f}")

df.to_csv('data/horizon_ic_study.csv', index=False)
print("\nSaved to data/horizon_ic_study.csv")
