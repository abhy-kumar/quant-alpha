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
MAX_WORKERS_OHLCV = 4
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

# Research Factor Weights (Piotroski 2000, Novy-Marx 2013, Jegadeesh & Titman 1993)
RESEARCH_FACTOR_WEIGHTS = {
    "piotroski": 0.15,    # Piotroski (2000): Accounting-based financial strength
    "profitability": 0.15, # Novy-Marx (2013): GP/Assets as alpha predictor
    "momentum": 0.25,     # Jegadeesh & Titman (1993): 12-1 month momentum
    "volatility": 0.15,   # Baker, Bradley & Wurgler (2011): Low vol anomaly
    "reversion": 0.10,    # De Bondt & Thaler (1985): Mean reversion
    "earnings": 0.10,     # Sloan (1996): Earnings quality / accruals
    "tech_existing": 0.10 # Baseline technical analysis
}

# Composite Score Weights
COMPOSITE_WEIGHTS = {
    "default":  {"tech": 0.35, "fund": 0.30, "research": 0.35},
    "tech":     {"tech": 0.50, "fund": 0.15, "research": 0.35},
    "fund":     {"tech": 0.15, "fund": 0.55, "research": 0.30},
    "momentum": {"tech": 0.30, "fund": 0.20, "research": 0.50},
}

# Risk-free rate for Sharpe ratio (India 10Y G-Sec yield)
RISK_FREE_RATE = 0.065
