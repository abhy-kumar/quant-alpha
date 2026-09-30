"""Export recorded, point-in-time factor snapshots and closes for the sandbox."""
import sqlite3
import pandas as pd
from utils import atomic_json

def export_strategy_history(db_path='data/market_scans.db'):
    with sqlite3.connect(db_path) as conn:
        factors = pd.read_sql_query('SELECT * FROM factor_history ORDER BY Scan_Date, Ticker', conn)
        if factors.empty:
            atomic_json('frontend/public/strategy_history.json', {'dates': [], 'benchmark': [], 'prices': {}, 'factors': {}})
            return
        bars = pd.read_sql_query('SELECT Date, Ticker, Close FROM daily_ohlcv WHERE Date >= ? ORDER BY Date', conn,
                                 params=(factors.Scan_Date.min(),))
    pivot = bars.pivot(index='Date', columns='Ticker', values='Close')
    if '^NSEI' not in pivot:
        raise ValueError('Cannot export strategy history without NIFTY prices')
    pivot = pivot[pivot['^NSEI'].notna()]
    # Ship only fields the strategy rules actually use; do not duplicate the full research warehouse.
    columns = ['Ticker','Price','Piotroski_F','ROE_Pct','Debt_to_Equity','P_E','RS_Percentile','RSI_Value',
               'Sig_Price_vs_SMA50','Sig_VPT','Tech_Score','Fund_Score','Composite_Score',
               'Momentum_6M','Conviction','ATR_Value','Vol_60D']
    factors = factors[columns + ['Scan_Date']]
    names = {'P_E':'P/E', 'ROE_Pct':'ROE_%'}
    snapshots = {}
    for date, rows in factors.groupby('Scan_Date'):
        clean = rows.rename(columns=names).astype(object).where(pd.notna(rows.rename(columns=names)), None)
        snapshots[date] = clean.to_dict('records')
    prices = {date: {ticker: float(price) for ticker, price in row.items() if pd.notna(price) and price > 0 and ticker != '^NSEI'}
              for date, row in pivot.iterrows()}
    atomic_json('frontend/public/strategy_history.json', {'dates': pivot.index.tolist(), 'benchmark': pivot['^NSEI'].tolist(),
                'prices': prices, 'factors': snapshots, 'methodology': 'Archived factors known before entry; actual daily closes; 20bps per leg; close-triggered exits'}, indent=None)
