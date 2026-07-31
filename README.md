<div align="center">
  <img src="assets/Alpha_v2_Final-Light.svg" alt="Alpha Research Platform" width="320" />
  <br /><br />
  <p><strong>Institutional-grade multi-factor quantitative research, machine learning alpha engine, and analytics platform for the National Stock Exchange of India (NSE).</strong></p>
  <p><em>Engineered for the Alpha Research &amp; Investment Club, Faculty of Management Studies (FMS), University of Delhi.</em></p>

  <br />

  [![GitHub Actions Status](https://img.shields.io/github/actions/workflow/status/abhy-kumar/quant-alpha/daily_scan.yml?branch=main&label=daily%20scan&logo=github&style=flat-square)](https://github.com/abhy-kumar/quant-alpha/actions/workflows/daily_scan.yml)
  [![Last Commit](https://img.shields.io/github/last-commit/abhy-kumar/quant-alpha?label=last%20update&color=00C805&style=flat-square)](https://github.com/abhy-kumar/quant-alpha/commits/main)
  [![Python Version](https://img.shields.io/badge/python-3.12-3776AB?logo=python&logoColor=white&style=flat-square)](https://www.python.org/)
  [![React Version](https://img.shields.io/badge/react-19.0-61DAFB?logo=react&logoColor=black&style=flat-square)](https://react.dev/)
  [![TypeScript](https://img.shields.io/badge/typescript-5.6-3178C6?logo=typescript&logoColor=white&style=flat-square)](https://www.typescriptlang.org/)
  [![Tests](https://img.shields.io/badge/tests-73%20passing-brightgreen?style=flat-square)](#local-setup--development)
  [![License](https://img.shields.io/badge/license-Apache%202.0%20%2B%20Commons%20Clause-orange?style=flat-square)](./LICENSE)

  <br /><br />

  <a href="https://quant-alpha-sage.vercel.app"><strong>Live Platform Dashboard »</strong></a> &nbsp;&bull;&nbsp;
  <a href="https://quant-alpha-sage.vercel.app/api/live_data"><strong>Live Data API Endpoint »</strong></a>

</div>

<br />

<div align="center">
  <img src="assets/dashboard-preview.png" alt="Quant Alpha Dashboard Interface" width="900" />
</div>

<br />

---

## Executive Summary

**Quant Alpha** is a production-grade quantitative research suite engineered to identify equity mispricings across the NSE universe. The platform combines academic factor research (Piotroski F-Score, Novy-Marx Gross Profitability, Fama-French Value/Quality, Titman Investment, PEAD SUE, Low Volatility) with a machine learning alpha engine trained on **2,068 historical outcome samples** using purged and embargoed time-series cross-validation. The system calculates sector-neutral alpha scores, ML outperformance probabilities, and produces walk-forward portfolio backtests with full transaction cost modeling.

---

## Key System Capabilities

### 1. Machine Learning Alpha Engine (`engine/ml_engine.py`)

- **Ensemble Classifier**: `HistGradientBoostingClassifier` trained on historical scan outcome records stored in SQLite (`market_scans.db`).
- **Relative Alpha Target**: The ML target is cross-sectional excess return — predicting whether a stock outperforms the scan-date market median by more than 100 bps over a 21-day window (`y = 1` if `Return_21d − MedianReturn_21d ≥ 0.01`), avoiding look-ahead bias from absolute return thresholds.
- **Purged & Embargoed Time-Series Cross-Validation**: Uses a custom `PurgedGroupTimeSeriesSplit` (5 splits, 21-day purge window, 10-day embargo window) that eliminates information leakage across temporal folds. Achieved **76.92% accuracy** and **0.8457 ROC-AUC** on out-of-sample data.
- **ML Output**: Generates `ml_alpha_prob` (0–100%) and `ml_conviction` ("Strong Alpha", "Moderate Alpha", "Neutral", "Low Alpha") surfaced in the **Signals tab** and the **Investment Thesis modal**.

### 2. Sector-Neutral Multi-Factor Scoring (`engine/scoring.py` & `engine/research_factors.py`)

- **Sector Z-Score Normalization**: Evaluates technical, fundamental, and quantitative factor metrics relative to industry sector medians.
- **Outlier Mitigation**: Applies continuous non-linear mapping `5.0 + 4.5 × tanh(Z / 1.5)` to bound z-scores between `0.5` and `9.5` without losing ordinal rank resolution.
- **Regime-Aware Dynamic Factor Weights**: Factor weights are convexly blended based on the current market regime score `S`. In bull regimes, technical momentum receives higher weight; in bear regimes, fundamental quality factors receive higher weight. Formally: `w(S) = λ × w_Bull + (1 − λ) × w_Bear` where `λ = clamp((S + 5) / 10, 0, 1)`.
- **VIF Signal Pruning**: The technical signal core is constrained to 4 orthogonal pillars (Trend, Momentum, Volume Flow, Volatility Compression) with Variance Inflation Factor below 5.0 to eliminate multicollinearity.

### 3. Walk-Forward Portfolio Backtest Engine (`engine/backtest_engine.py`)

- **Look-Ahead-Free Rebalancing**: Replays signals strictly using point-in-time data across 2-year OHLCV price histories (monthly rebalance, Top-10 equal-weight).
- **Full Transaction Cost Modeling**: Deducts 20 bps per leg (40 bps round-trip) at each rebalance using `TRANSACTION_COST_PER_LEG_BPS = 20`.
- **Hysteresis Continuation Buffer**: Reduces unnecessary turnover via asymmetric entry/exit thresholds — new entries only if composite rank ≤ 10; existing holdings retained until rank > 20.
- **Liquidity Pre-Filter**: Requires 30-day ADTV ≥ ₹1 Crore and market cap ≥ ₹500 Crore before any stock enters the scan universe.
- **Multi-Model & Multi-Horizon**: Supports Short-Term (Technical + Momentum) and Long-Term (Jegadeesh-Titman + Low Volatility) scoring across 1Y (252 trading days) and 6M (126 trading days) horizons.

### 4. Macro Market Regime Detection (`engine/regime_engine.py`)

Calculates aggregate market breadth (% of NSE stocks above 200 SMA), India VIX volatility, and Nifty trend indices to output a dynamic **Regime Score** (−5 to +5), mapped to *Risk-On*, *Neutral*, or *Risk-Off* states.

### 5. Point-in-Time Fundamentals Schema (`data_pipeline/data_pipeline.py`)

A dedicated `pit_fundamentals` SQLite table stores fundamental metrics indexed by `(ticker, metric_name, period_end_date, filing_date)`, ensuring that scoring at any historical date can only reference data that would have been publicly available at that time — eliminating look-ahead bias in fundamental factor research.

### 6. Institutional-Grade UI (`frontend/src/`)

- **5-Tab Navigation**: Charts, Signals, Screener, Heatmap, Quant Lab — with uniform tab sizing on all viewports.
- **TradingView Canvas Charting**: Built on `@tradingview/lightweight-charts` with real-time indicators (SMA 50/200, Supertrend, Bollinger Bands, RSI, MACD) and log/linear scaling.
- **Investment Thesis Modal**: Per-stock breakdown of Composite Score, Technical, Fundamental, F-Score, and **ML Alpha Probability** with ML Conviction badge.
- **Quantitative Screener**: Responsive table with 14 sortable columns (Sector, Price, 1D Change, Score, Trend, Tech, Fund, Research, F-Score, 12M Momentum, Value, Beta, P/E, Conviction). Headers and data columns are pixel-perfectly aligned across all viewport breakpoints via `hidden {breakpoint}:table-cell` on `<th>` elements.
- **Stock Comparison Matrix**: Side-by-side comparative evaluation drawer for up to 4 assets across 20+ dimensions.
- **Sector Heatmap Treemap**: Dynamic sector performance visualization with drill-down.
- **Quant Lab**: Portfolio optimizer (Sharpe / Min-Vol), backtest studio with monthly return calendar, and factor exposure analysis.

---

## Repository Structure

```text
stock-dashboard/
├── .agents/
│   └── AGENTS.md                                 # Workspace rules & database split/join instructions
├── .github/
│   ├── ISSUE_TEMPLATE/
│   │   ├── bug_report.md
│   │   └── feature_request.md
│   ├── workflows/
│   │   └── daily_scan.yml                        # GitHub Actions: weekday scans & Saturday backfill
│   ├── CONTRIBUTING.md
│   ├── PULL_REQUEST_TEMPLATE.md
│   └── SECURITY.md
├── assets/
│   ├── Alpha_v2_Final-Dark.svg                   # Brand logo (dark theme)
│   ├── Alpha_v2_Final-Light.svg                  # Brand logo (light theme)
│   ├── dashboard-preview.png                     # Dashboard screenshot
│   └── fmsLogo.svg                               # FMS Delhi institutional logo
├── data/
│   ├── horizon_analysis.csv
│   ├── horizon_ic_study.csv
│   ├── ic_by_horizon.csv
│   ├── market_scans.db.part_000                  # SQLite DB chunk part 1 (Git-tracked)
│   ├── market_scans.db.part_001                  # SQLite DB chunk part 2 (Git-tracked)
│   ├── ml_alpha_model.joblib                     # Serialized ML Alpha model
│   └── recommendation_performance.csv
├── data_pipeline/
│   ├── __init__.py
│   ├── data_fetcher.py                           # Financial statements & yfinance ingestion
│   ├── data_pipeline.py                          # SQLite schema, PIT fundamentals table & outcome tracking
│   ├── live_updater.py                           # Real-time intra-day price updater
│   └── nse_fetcher.py                            # NSE Bhavcopy downloader & liquid universe filter
├── engine/
│   ├── __init__.py
│   ├── backtest_engine.py                        # Walk-forward backtest engine with transaction cost modeling
│   ├── indicators.py                             # Technical indicators (RSI, MACD, Supertrend, ADX, Ichimoku)
│   ├── ml_engine.py                              # Purged CV ML Alpha classifier & probability engine
│   ├── quant_engine.py                           # Mean-variance portfolio optimizer (Sharpe / Min Vol)
│   ├── recommendation.py                         # Conviction badge generator & VIF-pruned signal core
│   ├── regime_engine.py                          # Market regime scoring (VIX, Breadth, Nifty Trend)
│   ├── research_factors.py                       # Academic factors (Piotroski, Novy-Marx, Fama-French)
│   ├── scanner.py                                # Main scan orchestration with liquidity pre-filter
│   └── scoring.py                                # Regime-aware dynamic factor weights & sector z-scores
├── frontend/
│   ├── api/
│   │   ├── chart.ts                              # Vercel serverless proxy for OHLCV data
│   │   └── live_data.ts                          # Vercel serverless proxy for live quotes
│   ├── public/
│   │   ├── backtest_runs/                        # Static JSON backtest snapshots served to frontend
│   │   │   ├── index.json                        # Manifest of all exported backtest runs
│   │   │   └── *.json                            # Individual backtest snapshots (auto-updated weekly)
│   │   ├── favicon.svg
│   │   ├── icons.svg
│   │   ├── llms.txt
│   │   ├── manifest.json                         # Web App Manifest (PWA)
│   │   ├── market_data.json                      # Static market scan output (auto-updated daily)
│   │   ├── quant_data.json                       # Static quant engine output (auto-updated daily)
│   │   ├── robots.txt
│   │   ├── score_history.json                    # Historical ticker score trends
│   │   └── sitemap.xml
│   ├── src/
│   │   ├── components/
│   │   │   ├── charting/
│   │   │   │   ├── ChartingTab.tsx               # Full-screen interactive charting view
│   │   │   │   └── TradingViewChart.tsx          # Lightweight Charts canvas integration
│   │   │   ├── common/
│   │   │   │   ├── GlassCard.tsx                 # Glassmorphism card container
│   │   │   │   ├── InvestmentThesisModal.tsx     # Per-stock investment thesis with ML Alpha card
│   │   │   │   ├── PositionSizerModal.tsx        # Kelly-based position sizing calculator
│   │   │   │   └── shared.tsx                    # Shared UI primitives, SortHeader & InfoTooltip
│   │   │   ├── heatmap/
│   │   │   │   └── HeatmapTab.tsx                # Sector treemap heatmap
│   │   │   ├── quantlab/
│   │   │   │   └── QuantLabTab.tsx               # Backtest studio, optimizer & factor exposure
│   │   │   ├── screener/
│   │   │   │   ├── ComparisonModal.tsx           # Multi-asset comparison modal
│   │   │   │   └── ScreenerTab.tsx               # Quantitative screening table (14 columns)
│   │   │   ├── signals/
│   │   │   │   └── SignalsTab.tsx                # Top pick signals & conviction trade cards
│   │   │   └── LiquidGlassRoot.tsx               # Glassmorphism layout wrapper
│   │   ├── data/
│   │   │   └── tooltipContent.ts                 # Financial metric tooltip dictionary
│   │   ├── utils/
│   │   │   └── formatters.ts                     # Numeric & currency formatting utilities
│   │   ├── App.tsx                               # Root component, tab navigation & state
│   │   ├── index.css                             # Global CSS design tokens & typography
│   │   ├── main.tsx                              # React DOM entrypoint
│   │   └── types.ts                              # TypeScript interface definitions
│   ├── eslint.config.js
│   ├── index.html
│   ├── package.json
│   ├── postcss.config.js
│   ├── tailwind.config.js
│   ├── tsconfig.app.json
│   ├── tsconfig.json
│   ├── tsconfig.node.json
│   ├── vercel.json                               # Vercel routing & serverless config
│   └── vite.config.ts
├── notifications/
│   ├── __init__.py
│   ├── generate_score_history.py                 # Exports historical composite scores to JSON
│   ├── telegram_bot.py                           # Daily alpha signals broadcast to Telegram
│   └── weekend_update.py                         # Weekend outcome backfill & backtest generation
├── tests/
│   ├── test_data_collection.py                   # NSE/yfinance ingestion tests
│   ├── test_e2e_recommendation.py                # End-to-end scanner pipeline integration test
│   ├── test_indicators.py                        # Technical indicator unit tests
│   ├── test_research_factors.py                  # Academic factor scoring unit tests
│   └── test_scoring.py                           # Sector normalization & composite z-score tests
├── .gitignore
├── CODE_OF_CONDUCT.md
├── LICENSE                                       # Apache 2.0 + Commons Clause
├── README.md
├── bse_fetcher.py                                # BSE ticker mapping utility
├── check_db.py                                   # Database integrity inspection
├── config.py                                     # Global system configuration & factor weights
├── db_split_join.py                              # Database chunking utility (40MB split/join for Git)
├── documentation.md                              # Comprehensive architectural reference
├── explore_data.py                               # Exploratory data analysis CLI helper
├── horizon_analysis.py                           # Information Coefficient horizon study
├── populate_ath.py                               # All-Time High price records utility
├── populate_cache.py                             # OHLCV price cache pre-populator
├── replace_tooltips.py                           # Tooltip content updater
├── requirements.txt                              # Python dependencies
├── run_custom_backtest.py                        # CLI for on-demand walk-forward backtests
├── scheduler.py                                  # APScheduler daemon for automated scans
├── utils.py                                      # Central logging & utility functions
└── verify_backtest.py                            # Backtest sanity check verification
```

---

## Important: Database Chunking Protocol

Due to GitHub's 50 MB file size limit, the primary SQLite database (`data/market_scans.db`) is not committed directly. It is chunked into 40 MB binary parts (`data/market_scans.db.part_*`) via a pre-commit hook.

**Before running any backend script locally**, join the parts:

```bash
python db_split_join.py join
```

**After generating new scan data or modifying the DB schema**, split before committing:

```bash
python db_split_join.py split
```

> The pre-commit hook in `.git/hooks/pre-commit` runs the split automatically on every `git commit`.

---

## Local Setup & Development

### Prerequisites

- Python 3.12+
- Node.js 20+ & npm

### Backend Setup

```bash
# Clone the repository
git clone https://github.com/abhy-kumar/quant-alpha.git
cd stock-dashboard

# Create and activate Python virtual environment
python -m venv .venv
.venv\Scripts\activate          # Windows
# source .venv/bin/activate     # macOS / Linux

# Install Python dependencies
pip install -r requirements.txt

# Join SQLite database chunks into data/market_scans.db
python db_split_join.py join
```

### Running Tests & the Scanner

```bash
# Run the full test suite (73 tests)
python -m pytest tests/

# Run a full market scan (updates market_data.json & quant_data.json)
python -m engine.scanner

# Run an on-demand walk-forward backtest
python run_custom_backtest.py --as_of 2026-07-31 --model short --horizon 1y
```

### Frontend Development Server

```bash
cd frontend
npm install
npm run dev        # Starts Vite dev server at http://localhost:5173
```

---

## Continuous Integration & Automated Operations

The platform uses GitHub Actions ([`.github/workflows/daily_scan.yml`](.github/workflows/daily_scan.yml)) for fully automated data operations:

| Schedule | Job | Description |
|---|---|---|
| 9:37 AM, 12:37 PM, 4:11 PM, 10:07 PM IST (Mon–Fri) | `scan` | Runs the market scanner, updates ML model predictions, regenerates `market_data.json` & `quant_data.json`, and pushes changes. |
| 4:07 AM IST (Mon–Fri) | `scan` | Pre-market early scan for overnight data. |
| 9:07 AM IST (Saturday) | `weekend_update` | Backfills 21-day forward return outcomes, re-trains the ML model on new data, runs walk-forward backtests, and exports snapshots to `backtest_runs/`. |

---

## License & Attribution

Developed for the **Alpha Research and Investment Club, Faculty of Management Studies (FMS), University of Delhi.**
Released under the [Apache License 2.0 with Commons Clause](./LICENSE).
