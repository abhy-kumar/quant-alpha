"""Backfill missing quote history for previously liquid recorded instruments."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from concurrent.futures import ThreadPoolExecutor, as_completed
import pandas as pd
import yfinance as yf
from engine.backtest_engine import load_ohlcv, MIN_ADTV_INR
from data_pipeline.data_pipeline import store_daily_ohlcv

def run():
    prices, volumes, _, _, tickers = load_ohlcv()
    dates = prices.index
    needs = []
    for ticker in tickers:
        observed = prices[ticker].dropna()
        if len(observed) < 60:
            continue
        expected = prices[ticker].loc[observed.index[0]:]
        liquid = (prices[ticker] * volumes[ticker]).rolling(30, min_periods=20).mean().max() >= MIN_ADTV_INR
        if liquid and expected.isna().any():
            needs.append(ticker)
    print(f'Repairing quote gaps for {len(needs)} recorded liquid instruments', flush=True)
    def fetch(ticker):
        try:
            df = yf.Ticker(ticker).history(start=str(dates[0].date()), end=str((dates[-1]+pd.Timedelta(days=1)).date()), auto_adjust=True, timeout=20)
            if df.empty:
                return ticker, None
            return ticker, df
        except Exception:
            return ticker, None
    with ThreadPoolExecutor(max_workers=6) as pool:
        for future in as_completed([pool.submit(fetch,t) for t in needs]):
            ticker, frame = future.result()
            if frame is not None:
                store_daily_ohlcv({ticker:frame},str(dates[-1].date()))
            else:
                print(f'Quote repair unavailable: {ticker}',flush=True)
    print('Quote repair complete',flush=True)

if __name__ == '__main__':
    run()
