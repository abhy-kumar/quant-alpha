"""Download public adjusted prices for a reproducible local model comparison."""
import argparse
import json
import sqlite3
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
import yfinance as yf


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--database', default='data/market_scans.db')
    parser.add_argument('--output', default='data/research_prices')
    args = parser.parse_args()
    output = Path(args.output)
    output.mkdir(parents=True, exist_ok=True)
    yf.set_tz_cache_location(str(output/'yf_cache'))
    with sqlite3.connect(Path(args.database).resolve().as_uri()+'?mode=ro', uri=True) as conn:
        symbols = [r[0] for r in conn.execute("SELECT DISTINCT Ticker FROM daily_ohlcv WHERE Ticker LIKE '%.NS'")]+['^NSEI']
        inventory = {ticker: {'sector': sector} for ticker, sector in conn.execute(
            'SELECT Ticker, Sector FROM historical_scans ORDER BY Scan_Date')}
    (output/'universe.json').write_text(json.dumps(inventory, indent=2), encoding='utf8')
    def fetch(symbol):
        try:
            prices = yf.Ticker(symbol).history(period='5y', auto_adjust=True, timeout=15)
            if prices.empty:
                return symbol, {'status':'empty'}
            prices.to_pickle(output/(symbol.replace('^','')+'.pkl'))
            return symbol, {'rows':len(prices),'first':str(prices.index.min()),'last':str(prices.index.max())}
        except Exception as exc:
            return symbol, {'error':str(exc)}
    results = {}
    with ThreadPoolExecutor(max_workers=4) as pool:
        for job in as_completed([pool.submit(fetch, symbol) for symbol in symbols]):
            symbol, result = job.result()
            results[symbol] = result
    (output/'manifest.json').write_text(json.dumps(results,indent=2),encoding='utf8')
    print(f'Fetched {sum("rows" in r for r in results.values())}/{len(symbols)} symbols; see manifest.json')


if __name__ == '__main__':
    main()
