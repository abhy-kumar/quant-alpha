"""
scheduler.py
------------
APScheduler background job - runs a full market scan at 4:15 PM IST
every Monday-Friday (after NSE equity market closes at 3:30 PM).

Also runs an automated backtest every Saturday at 8:00 AM IST, covering
all 4 combinations (short/long x 1y/6m) for the current date. Results are
cached in SQLite, exported to static JSON, and pushed to GitHub so Vercel
serves the updated data automatically.

Usage
-----
  Standalone:   python scheduler.py         (runs until Ctrl-C)
  From app.py:  from scheduler import start_scheduler
                scheduler = start_scheduler()
"""

import logging
import subprocess
import time
import os

import pytz
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

IST = pytz.timezone("Asia/Kolkata")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger(__name__)

# Directory that contains the static JSON files served by Vercel.
# Must be committed and pushed after each backtest run.
STATIC_FILES_DIR = os.path.join("frontend", "public", "backtest_runs")


def _git_push_static_files() -> None:
    """
    Stage the backtest_runs/ directory, commit (if there are changes),
    and push to origin/main so Vercel picks up the new data.

    Silently skips if there are no staged changes (nothing new to push).
    """
    repo_root = os.path.abspath(".")
    try:
        # Stage only the auto-generated static files
        subprocess.run(
            ["git", "add", STATIC_FILES_DIR],
            cwd=repo_root,
            check=True,
            capture_output=True,
        )

        # Check if there is anything actually staged
        result = subprocess.run(
            ["git", "diff", "--cached", "--quiet"],
            cwd=repo_root,
            capture_output=True,
        )
        if result.returncode == 0:
            # Nothing staged — no new data, skip the commit+push
            logger.info("Git push skipped: no changes in backtest_runs/.")
            return

        subprocess.run(
            ["git", "commit", "-m", "auto: weekly backtest results update"],
            cwd=repo_root,
            check=True,
            capture_output=True,
        )
        subprocess.run(
            ["git", "push", "origin", "main"],
            cwd=repo_root,
            check=True,
            capture_output=True,
        )
        logger.info("Git push successful: backtest_runs/ pushed to origin/main.")
    except subprocess.CalledProcessError as exc:
        logger.error(
            f"Git push failed: {exc.stderr.decode(errors='replace').strip()}"
        )


def _post_market_scan() -> None:
    """Callback executed by the scheduler after market close."""
    logger.info("Scheduled post-market scan triggered.")
    try:
        from scanner import run_scanner
        df = run_scanner()
        logger.info(f"Scan complete - {len(df)} stocks processed.")
    except Exception as exc:
        logger.error(f"Scan failed: {exc}")


def _live_price_update() -> None:
    """Callback executed to update live prices."""
    logger.info("Live price update triggered.")
    try:
        from live_updater import update_live_prices
        update_live_prices()
    except Exception as exc:
        logger.error(f"Live update failed: {exc}")


def _auto_backtest() -> None:
    """
    Weekend backtest job — runs all 4 combos (short/long x 1y/6m) for today,
    exports static JSON, then auto-pushes to GitHub.

    Results are cached in SQLite so repeated runs on the same date are instant.
    """
    logger.info("Weekend auto-backtest started.")
    try:
        from backtest_engine import run_all_current_backtests

        results = run_all_current_backtests()

        n_ok  = sum(1 for v in results.values() if "error" not in v)
        n_err = len(results) - n_ok
        logger.info(f"Auto-backtest complete: {n_ok} succeeded, {n_err} failed.")

        # Push updated static files to GitHub -> Vercel auto-deploys
        _git_push_static_files()

    except Exception as exc:
        logger.error(f"Auto-backtest job failed: {exc}", exc_info=True)


def start_scheduler() -> BackgroundScheduler:
    """
    Start and return the APScheduler BackgroundScheduler.
    Call once at application startup (e.g., via @st.cache_resource in app.py).
    """
    scheduler = BackgroundScheduler(timezone=IST)

    # --- Weekday jobs ---
    scheduler.add_job(
        _post_market_scan,
        trigger=CronTrigger(
            day_of_week="mon-fri",
            hour=16,
            minute=15,
            timezone=IST,
        ),
        id="post_market_scan",
        name="Post-Market NSE Scan (4:15 PM IST)",
        replace_existing=True,
        misfire_grace_time=1800,   # Run even if up to 30 min late
    )

    # Run every 3 minutes between 9 AM and 4 PM on weekdays
    scheduler.add_job(
        _live_price_update,
        trigger=CronTrigger(
            day_of_week="mon-fri",
            hour="9-15",
            minute="*/3",
            timezone=IST,
        ),
        id="live_price_update",
        name="Live Price Updater",
        replace_existing=True,
    )

    # --- Weekend backtest job ---
    # Runs Saturday at 8:00 AM IST — no market activity, no DB contention.
    # Sunday is intentionally left free (the Saturday run is already cached,
    # so a Sunday run would be a no-op anyway).
    scheduler.add_job(
        _auto_backtest,
        trigger=CronTrigger(
            day_of_week="sat",
            hour=8,
            minute=0,
            timezone=IST,
        ),
        id="weekend_auto_backtest",
        name="Weekend Auto-Backtest (8:00 AM IST, Saturday)",
        replace_existing=True,
        misfire_grace_time=3600,   # Run even if up to 1 hour late
    )

    scheduler.start()
    logger.info(
        "Scheduler started — "
        "weekday scan at 4:15 PM IST (Mon-Fri), "
        "live updates every 3m (9am-4pm), "
        "weekend backtest at 8:00 AM IST (Saturday)."
    )
    return scheduler


if __name__ == "__main__":
    sched = start_scheduler()
    try:
        while True:
            time.sleep(60)
    except (KeyboardInterrupt, SystemExit):
        sched.shutdown()
        logger.info("Scheduler stopped.")
