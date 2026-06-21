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

# Research Factor Weights (calibrated to academic factor return literature)
RESEARCH_FACTOR_WEIGHTS = {
    "piotroski": 0.10,      # Piotroski (2000): Accounting-based financial strength
    "profitability": 0.10,  # Novy-Marx (2013): GP/Assets as alpha predictor
    "earnings": 0.10,       # Sloan (1996): Earnings quality / accruals
    "momentum": 0.20,       # Jegadeesh & Titman (1993): 12-1 month momentum
    "value": 0.15,          # Fama & French (1993): B/M, E/P, CF/P, D/P
    "volatility": 0.10,     # Baker, Bradley & Wurgler (2011): Low vol anomaly
    "beta": 0.10,           # Frazzini & Pedersen (2014): Betting Against Beta
    "investment": 0.10,     # Titman, Wei & Xie (2004): Conservative investment
    "sue": 0.10,            # Bernard & Thomas (1989): Post-earnings drift
    "reversion": 0.05,      # De Bondt & Thaler (1985): Mean reversion
}

# Composite Score Weights
COMPOSITE_WEIGHTS = {
    "default":  {"tech": 0.35, "fund": 0.30, "research": 0.35},
    "tech":     {"tech": 0.50, "fund": 0.15, "research": 0.35},
    "fund":     {"tech": 0.10, "fund": 0.40, "research": 0.50},
    "momentum": {"tech": 0.20, "fund": 0.10, "research": 0.70},
}

# Risk-free rate for Sharpe ratio (India 10Y G-Sec yield)
RISK_FREE_RATE = 0.065
