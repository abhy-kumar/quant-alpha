"""Refresh the factor evidence shown in Quant Lab from a long price history.

Fetches up to --period of adjusted daily prices for every tracked stock, repairs
unadjusted corporate-action jumps, and runs engine.factor_research. If the fetch
cannot cover enough of the universe, the study falls back to the 2-year database
so the published evidence is never built from a thin or lopsided sample.

    python scripts/run_factor_research.py --period 10y
"""
import argparse
import sqlite3
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from engine import factor_research  # noqa: E402

MIN_COVERAGE = 0.6


def fetch_history(symbols, period, workers=4):
    import yfinance as yf

    def fetch(symbol):
        try:
            frame = yf.Ticker(symbol).history(period=period, auto_adjust=True, timeout=20)
            return symbol, frame if len(frame) >= 300 else None
        except Exception:
            return symbol, None

    frames = {}
    with ThreadPoolExecutor(max_workers=workers) as pool:
        for job in as_completed([pool.submit(fetch, symbol) for symbol in symbols]):
            symbol, frame = job.result()
            if frame is not None:
                frames[symbol] = frame
    return frames


def main(argv=None, fetch=fetch_history):
    parser = argparse.ArgumentParser()
    parser.add_argument('--database', default='data/market_scans.db')
    parser.add_argument('--period', default='10y')
    parser.add_argument('--output', default='data/factor_research.json')
    args = parser.parse_args(argv)
    with sqlite3.connect(Path(args.database).resolve().as_uri() + '?mode=ro', uri=True) as conn:
        symbols = [row[0] for row in conn.execute("SELECT DISTINCT Ticker FROM daily_ohlcv WHERE Ticker LIKE '%.NS'")]
        sectors = dict(conn.execute('SELECT Ticker, Sector FROM historical_scans ORDER BY Scan_Date'))
    report = None
    try:
        frames = fetch([*symbols, '^NSEI'], args.period)
        coverage = sum(symbol in frames for symbol in symbols) / max(len(symbols), 1)
        if '^NSEI' in frames and coverage >= MIN_COVERAGE:
            report = factor_research.study(factor_research.panel_from_frames(frames, sectors),
                                           source=f'{args.period} fetched history')
            report['universe']['fetch_coverage'] = round(coverage, 2)
        else:
            print(f'Long-history fetch covered {coverage:.0%}; using the database instead', flush=True)
    except Exception as error:  # network or vendor failure must not erase published evidence
        print(f'Long-history study unavailable ({type(error).__name__}: {error}); using the database', flush=True)
    if report is None:
        report = factor_research.study(factor_research.panel_from_database(args.database), source='2-year database')
    factor_research.write(report, args.output)
    print(f"Factor research written: {report['source']}, {report['span']['years']} years, "
          f"{sum(f['verdict'].startswith('Supported') for f in report['factors'])} supported factors", flush=True)
    return report


if __name__ == '__main__':
    main()
