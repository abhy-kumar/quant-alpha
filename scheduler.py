"""
scheduler.py
------------
APScheduler background job — runs a full market scan at 4:15 PM IST
every Monday–Friday (after NSE equity market closes at 3:30 PM).

Usage
-----
  Standalone:   python scheduler.py         (runs until Ctrl-C)
  From app.py:  from scheduler import start_scheduler
                scheduler = start_scheduler()
"""

import logging
import time

import pytz
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

IST = pytz.timezone("Asia/Kolkata")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger(__name__)


def _post_market_scan() -> None:
    """Callback executed by the scheduler after market close."""
    logger.info("Scheduled post-market scan triggered.")
    try:
        # Guard against Streamlit hot-reload window where 'scanner' may
        # temporarily be absent from sys.modules.
        import importlib
        scanner = importlib.import_module("scanner")
        df = scanner.run_scanner()
        logger.info(f"Scan complete — {len(df)} stocks processed.")
    except Exception as exc:
        logger.error(f"Scan failed: {exc}")


def _live_price_update() -> None:
    """Callback executed to update live prices."""
    logger.info("Live price update triggered.")
    try:
        import importlib
        live_updater = importlib.import_module("live_updater")
        live_updater.update_live_prices()
    except Exception as exc:
        logger.error(f"Live update failed: {exc}")


def start_scheduler() -> BackgroundScheduler:
    """
    Start and return the APScheduler BackgroundScheduler.
    Call once at application startup (e.g., via @st.cache_resource in app.py).
    """
    scheduler = BackgroundScheduler(timezone=IST)
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
    
    scheduler.start()
    logger.info("📅 Scheduler started — daily scan at 4:15 PM IST (Mon–Fri), live updates every 3m (9am-4pm).")
    return scheduler


if __name__ == "__main__":
    sched = start_scheduler()
    try:
        while True:
            time.sleep(60)
    except (KeyboardInterrupt, SystemExit):
        sched.shutdown()
        logger.info("Scheduler stopped.")
