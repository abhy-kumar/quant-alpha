"""
utils.py
--------
Shared utilities and caching logic for the stock scanner.
"""

import json
import os
import time
import logging
from datetime import datetime, timezone
import numpy as np

def setup_logging():
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s [%(levelname)s] %(threadName)s: %(message)s',
        datefmt='%H:%M:%S'
    )
    return logging.getLogger("scanner")

log = setup_logging()

def _safe_float(val, default=np.nan) -> float:
    try:
        if val is None:
            return default
        f_val = float(val)
        if np.isnan(f_val):
            return default
        return f_val
    except Exception:
        return default

class CacheManager:
    def __init__(self, data_dir="data"):
        self.data_dir = data_dir
        os.makedirs(self.data_dir, exist_ok=True)
        
        self.caches = {
            "sector": self._load_cache("sector_cache.json"),
            "fundamentals": self._load_cache("fundamentals_cache.json"),
            "news": self._load_cache("news_cache.json"),
            "ath": self._load_cache("ath_cache.json"),
            "etf_list": self._load_cache("etf_list.json", default_type=list)
        }

    def _get_path(self, filename: str) -> str:
        return os.path.join(self.data_dir, filename)

    def _load_cache(self, filename: str, default_type=dict):
        path = self._get_path(filename)
        if os.path.exists(path):
            try:
                with open(path, 'r') as f:
                    return json.load(f)
            except Exception as e:
                log.warning(f"Failed to load {filename}: {e}. Initializing empty.")
        return default_type()

    def save_all(self):
        self._save_cache("sector_cache.json", self.caches["sector"])
        self._save_cache("fundamentals_cache.json", self.caches["fundamentals"])
        self._save_cache("news_cache.json", self.caches["news"])
        self._save_cache("ath_cache.json", self.caches["ath"])
        self._save_cache("etf_list.json", self.caches["etf_list"])

    def _save_cache(self, filename: str, data):
        path = self._get_path(filename)
        try:
            with open(path, 'w') as f:
                json.dump(data, f, indent=2)
        except Exception as e:
            log.error(f"Failed to save {filename}: {e}")

    def get(self, cache_name: str, key: str, ttl: int = None):
        """Get an item from a dict cache if it hasn't expired."""
        cache = self.caches.get(cache_name)
        if cache is None or not isinstance(cache, dict):
            return None
        
        item = cache.get(key)
        if item is None:
            return None
            
        if ttl is not None:
            now = datetime.now(timezone.utc).timestamp()
            if now - item.get('timestamp', 0) > ttl:
                return None
        
        return item.get('data')

    def set(self, cache_name: str, key: str, data):
        """Set an item in a dict cache with current timestamp."""
        cache = self.caches.get(cache_name)
        if cache is not None and isinstance(cache, dict):
            cache[key] = {
                'timestamp': datetime.now(timezone.utc).timestamp(),
                'data': data
            }

    def get_etf_list(self) -> list:
        return self.caches["etf_list"]
        
    def add_to_etf_list(self, symbol: str):
        if symbol not in self.caches["etf_list"]:
            self.caches["etf_list"].append(symbol)

