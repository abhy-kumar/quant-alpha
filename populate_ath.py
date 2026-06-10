"""
populate_ath.py
---------------
Standalone script to fetch full history and cache All-Time Highs (ATH)
for the liquid universe to avoid blocking daily scans.
"""

import time
from nse_fetcher import get_liquid_universe
from scanner import _background_fetch_ath, cache_manager

def main():
    print("Fetching liquid universe...")
    universe = get_liquid_universe()
    print(f"Found {len(universe)} tickers.")
    
    missing_aths = []
    for ticker in universe:
        sym = ticker.replace('.NS', '').replace('.BO', '')
        if cache_manager.get("ath", sym) is None:
            missing_aths.append(ticker)
            
    if not missing_aths:
        print("All ATHs are already cached.")
        return
        
    print(f"Fetching ATH for {len(missing_aths)} tickers sequentially...")
    _background_fetch_ath(missing_aths)
    print("ATH population complete.")

if __name__ == "__main__":
    main()
