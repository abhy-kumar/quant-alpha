import time
import nse_fetcher
import scanner

universe = nse_fetcher.get_liquid_universe()
print(f"Pre-populating cache for {len(universe)} tickers...")

for ticker in universe:
    sym = ticker.replace('.NS', '').replace('.BO', '')
    cached_sector = scanner.cache_manager.get("sector", sym)
    if cached_sector:
        print(f"[{sym}] Already cached: {cached_sector}")
        continue
        
    print(f"[{sym}] Fetching...")
    scanner._fetch_info(ticker)
    
    scanner.cache_manager.save_all()
    
    time.sleep(1.5)
    
print("Finished pre-populating sector cache.")
