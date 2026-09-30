"""Repair benchmark/outcomes and regenerate research artifacts from the joined DB.

Run in the project virtual environment, then split the database before committing.
Only benchmark history is downloaded; stock prices/factors remain the recorded observations.
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import sqlite3
import pandas as pd
import yfinance as yf
from data_pipeline.data_pipeline import store_daily_ohlcv, update_outcome_tracking
from engine.quant_engine import generate_quant_data
from engine.backtest_engine import run_all_current_backtests, RUNS_DIR
from engine.ml_engine import get_ml_model, predict_stock_alpha
from utils import atomic_json
import json

def run():
    with sqlite3.connect('data/market_scans.db') as conn:
        prices = pd.read_sql_query("SELECT * FROM daily_ohlcv WHERE Ticker != '^NSEI' ORDER BY Date", conn)
    end = prices.Date.max()
    benchmark = yf.download('^NSEI', start=prices.Date.min(), end=str((pd.Timestamp(end)+pd.Timedelta(days=1)).date()),
                            auto_adjust=True, progress=False, timeout=30)
    if isinstance(benchmark.columns, pd.MultiIndex):
        benchmark.columns = benchmark.columns.get_level_values(0)
    if benchmark.empty:
        raise RuntimeError('NIFTY backfill failed; existing results were not republished')
    store_daily_ohlcv({'^NSEI':benchmark}, end)
    history = {}
    for ticker, rows in prices.groupby('Ticker'):
        frame = rows.drop(columns=['Ticker']).copy()
        frame.index = pd.to_datetime(frame.pop('Date'))
        history[ticker] = frame
    update_outcome_tracking(str((pd.Timestamp(end)+pd.Timedelta(days=1)).date()), history)
    # Faulty legacy cached runs are intentionally invalidated, not relabeled.
    for path in Path(RUNS_DIR).glob('*.json'):
        data = json.loads(path.read_text(encoding='utf-8'))
        if data.get('version') != 3 and path.name != 'index.json':
            path.unlink()
    run_all_current_backtests(as_of_date=end, force=True)
    generate_quant_data()
    market_path='frontend/public/market_data.json'
    market=json.loads(Path(market_path).read_text(encoding='utf-8'))
    model=get_ml_model()
    for stock in market['data']:
        result=predict_stock_alpha(stock, model)
        stock['ML_Alpha_Prob']=result['ml_alpha_prob']
        stock['ML_Conviction']=result['ml_conviction']
        stock['ML_Method']=result['method']
    atomic_json(market_path,market)

if __name__ == '__main__':
    run()
