#!/usr/bin/env python
"""
run_custom_backtest.py
-----------------------
CLI tool to trigger a walk-forward backtest for a specific date.

Results are cached in SQLite (data/market_scans.db) and exported as
static JSON files to frontend/public/backtest_runs/ so they can be
served by Vercel without a Python runtime.

Usage examples:
  python run_custom_backtest.py --as_of 2025-01-01 --model short --horizon 1y
  python run_custom_backtest.py --as_of 2024-12-31 --model long  --horizon 6m
  python run_custom_backtest.py --list
  python run_custom_backtest.py --export-only
  python run_custom_backtest.py --as_of 2025-06-01 --model short --horizon 1y --force

Options:
  --as_of YYYY-MM-DD   "As of" date — backtest uses only data up to this date
  --model short|long   Scoring model: short-term tech+momentum, or long-term momentum+low-vol
  --horizon 1y|6m      Simulation window: 252 trading days (1Y) or 126 trading days (6M)
  --force              Re-run even if a cached result exists for this combination
  --list               List all cached backtest runs and exit
  --export-only        Re-export static JSON files from cache and exit
"""

import argparse
import logging
import sys
import os
import io

# Force UTF-8 stdout on Windows to avoid CP1252 UnicodeEncodeError
if sys.stdout.encoding and sys.stdout.encoding.lower() not in ('utf-8', 'utf_8'):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

# ── Path setup: allow running from project root ──────────────────────────────
project_root = os.path.dirname(os.path.abspath(__file__))
if project_root not in sys.path:
    sys.path.insert(0, project_root)

import backtest_engine

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("run_custom_backtest")


def cmd_list():
    """Print a table of all cached runs."""
    import sqlite3, json
    backtest_engine._ensure_cache_table()
    conn = sqlite3.connect(backtest_engine.DB_PATH)
    rows = conn.execute(
        """SELECT as_of_date, model, horizon, created_at,
                  data_start, data_end, n_chart_pts, stats_json
           FROM backtest_cache ORDER BY created_at DESC"""
    ).fetchall()
    conn.close()

    if not rows:
        print("No cached backtest runs found.")
        return

    print(f"\n{'As-of Date':<14} {'Model':<8} {'Horizon':<9} {'CAGR':>8} {'Sharpe':>8} {'MaxDD':>8} {'Pts':>5}  {'Created'}")
    print("-" * 80)
    for row in rows:
        (as_of, model, horizon, created_at, data_start, data_end, n_pts, stats_json) = row
        s = json.loads(stats_json) if stats_json else {}
        cagr   = s.get("cagr",         "?")
        sharpe = s.get("sharpe",        "?")
        mdd    = s.get("max_drawdown",  "?")
        cagr_s   = f"{cagr:+.1f}%"   if isinstance(cagr,   float) else str(cagr)
        sharpe_s = f"{sharpe:.2f}"    if isinstance(sharpe, float) else str(sharpe)
        mdd_s    = f"{mdd:.1f}%"      if isinstance(mdd,    float) else str(mdd)
        print(f"{as_of:<14} {model:<8} {horizon:<9} {cagr_s:>8} {sharpe_s:>8} {mdd_s:>8} {n_pts or 0:>5}  {created_at}")
    print()


def main():
    parser = argparse.ArgumentParser(
        description="Run or list cached walk-forward backtests.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument("--as_of",       help="As-of date (YYYY-MM-DD)")
    parser.add_argument("--model",       choices=["short", "long"], default="short")
    parser.add_argument("--horizon",     choices=["1y", "6m"],      default="1y")
    parser.add_argument("--force",       action="store_true",        help="Re-run even if cached")
    parser.add_argument("--list",        action="store_true",        help="List all cached runs")
    parser.add_argument("--export-only", action="store_true",        help="Export static JSON and exit")

    args = parser.parse_args()

    # ── --list ────────────────────────────────────────────────────────────────
    if args.list:
        cmd_list()
        return

    # ── --export-only ─────────────────────────────────────────────────────────
    if args.export_only:
        n = backtest_engine.export_backtest_index()
        logger.info(f"Exported {n} runs to {backtest_engine.RUNS_DIR}")
        return

    # ── Require --as_of for a new run ─────────────────────────────────────────
    if not args.as_of:
        # Show date range hint
        try:
            lo, hi = backtest_engine.get_ohlcv_date_range()
            logger.info(f"OHLCV data available: {lo} → {hi}")
        except Exception:
            pass
        parser.error("--as_of is required. Example: --as_of 2025-01-01")

    # Validate date format
    import re
    if not re.match(r"^\d{4}-\d{2}-\d{2}$", args.as_of):
        parser.error(f"--as_of must be YYYY-MM-DD, got: {args.as_of!r}")

    # ── Run the backtest ──────────────────────────────────────────────────────
    try:
        lo, hi = backtest_engine.get_ohlcv_date_range()
        if args.as_of < lo:
            logger.error(f"--as_of {args.as_of} is before earliest data ({lo}). Aborting.")
            sys.exit(1)
        if args.as_of > hi:
            logger.warning(f"--as_of {args.as_of} is beyond latest data ({hi}). Using {hi}.")
            args.as_of = hi
    except Exception as e:
        logger.warning(f"Could not validate date range: {e}")

    logger.info(f"Running {args.model}/{args.horizon} backtest as_of {args.as_of} ...")
    result = backtest_engine.run_custom_backtest(
        as_of_date=args.as_of,
        model=args.model,
        horizon=args.horizon,
        force=args.force,
    )

    stats = result.get("stats", {})
    chart = result.get("chart", [])
    cached = result.get("cached", False)

    print()
    print("=" * 56)
    print(f"  {'[CACHED]' if cached else '[NEW RUN]'} {args.model.upper()} / {args.horizon.upper()} as_of {args.as_of}")
    print("=" * 56)
    if chart:
        print(f"  Period:      {chart[0]['date']}  ->  {chart[-1]['date']}")
        print(f"  Data points: {len(chart)}")
    cagr_v   = stats.get('cagr')
    sharpe_v  = stats.get('sharpe')
    mdd_v     = stats.get('max_drawdown')
    winrate_v = stats.get('win_rate')
    def _f(v): return float(v) if v is not None else None
    cagr_v, sharpe_v, mdd_v, winrate_v = _f(cagr_v), _f(sharpe_v), _f(mdd_v), _f(winrate_v)
    if cagr_v   is not None: print(f"  CAGR:        {cagr_v:+.2f}%")
    if sharpe_v  is not None: print(f"  Sharpe:      {sharpe_v:.2f}")
    if mdd_v     is not None: print(f"  MaxDD:       {mdd_v:.2f}%")
    if winrate_v is not None: print(f"  Win Rate:    {winrate_v:.1f}%")
    print("=" * 56)
    print(f"\n  Results saved to: {backtest_engine.RUNS_DIR}/")
    print(f"  To list all runs: python run_custom_backtest.py --list\n")


if __name__ == "__main__":
    main()
