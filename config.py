"""
config.py
---------
Configuration constants and magic numbers for the stock scanner.
"""

# Scanner settings
PERIOD = "2y"
INTERVAL = "1d"
MIN_ROWS = 50

# Concurrency limits
MAX_WORKERS_OHLCV = 8
MAX_WORKERS_FUNDAMENTALS = 2

# Cache Expirations (in seconds)
CACHE_TTL_FUNDAMENTALS = 30 * 24 * 3600  # 30 days
CACHE_TTL_NEWS = 24 * 3600               # 24 hours
CACHE_TTL_ATH = 90 * 24 * 3600           # 90 days
CACHE_TTL_SECTOR = 90 * 24 * 3600        # 90 days

# Indicator parameters
RSI_PERIOD = 14
ATR_PERIOD = 14
ADX_PERIOD = 14
ST_PERIOD = 10
ST_MULTIPLIER = 3.0
CCI_PERIOD = 20
BB_PERIOD = 20

# Scoring & Ranking
RS_PERIODS = [21, 63, 126]  # Approx 1m, 3m, 6m trading days
