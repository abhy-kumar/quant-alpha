import time
import nse_fetcher
import scanner

universe = nse_fetcher.get_liquid_universe()
print(f"Pre-populating cache for {len(universe)} tickers...")

for ticker in universe:
    sym = ticker.replace('.NS', '').replace('.BO', '')
    if sym in scanner.SECTOR_CACHE:
        print(f"[{sym}] Already cached: {scanner.SECTOR_CACHE[sym]}")
        continue
        
    print(f"[{sym}] Fetching...")
    # This will hit Screener and update SECTOR_CACHE internally
    scanner._fetch_info(ticker)
    
    # Save incrementally so we don't lose data if it fails
    scanner.save_sector_cache()
    
    # Very generous sleep to avoid rate limit
    time.sleep(1.5)
    
print("Finished pre-populating sector cache.")
