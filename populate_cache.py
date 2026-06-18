"""
populate_cache.py
-----------------
Pre-populate sector and fundamental caches for the liquid universe.
Run once before the first scan to warm up caches.
"""

import time
from nse_fetcher import get_liquid_universe
from data_fetcher import fetch_fundamentals, cache_manager


def main():
    universe = get_liquid_universe()
    print(f"Pre-populating cache for {len(universe)} tickers...")

    for ticker in universe:
        sym = ticker.replace('.NS', '').replace('.BO', '')
        cached_sector = cache_manager.get("sector", sym)
        if cached_sector:
            print(f"[{sym}] Already cached: {cached_sector}")
            continue

        print(f"[{sym}] Fetching...")
        fetch_fundamentals(ticker)
        cache_manager.save_all()
        time.sleep(1.5)

    print("Finished pre-populating sector cache.")


if __name__ == "__main__":
    main()
