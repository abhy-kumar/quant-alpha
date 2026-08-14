<div align="center">
  <img src="assets/Alpha_v2_Final-Light.svg" alt="Alpha Research Platform" width="320" />
  <br /><br />
  <p><strong>Institutional-grade multi-factor quantitative research, machine learning alpha engine, and analytics platform for the National Stock Exchange of India (NSE).</strong></p>
  <p><em>Engineered for the Alpha Research & Investment Club, Faculty of Management Studies (FMS), University of Delhi.</em></p>

  <br />

  [![GitHub Actions Status](https://img.shields.io/github/actions/workflow/status/abhy-kumar/quant-alpha/daily_scan.yml?branch=main&label=daily%20scan&logo=github&style=flat-square)](https://github.com/abhy-kumar/quant-alpha/actions/workflows/daily_scan.yml)
  [![Last Commit](https://img.shields.io/github/last-commit/abhy-kumar/quant-alpha?label=last%20update&color=00C805&style=flat-square)](https://github.com/abhy-kumar/quant-alpha/commits/main)
  [![Python Version](https://img.shields.io/badge/python-3.12-3776AB?logo=python&logoColor=white&style=flat-square)](https://www.python.org/)
  [![React Version](https://img.shields.io/badge/react-19.0-61DAFB?logo=react&logoColor=black&style=flat-square)](https://react.dev/)
  [![TypeScript](https://img.shields.io/badge/typescript-5.6-3178C6?logo=typescript&logoColor=white&style=flat-square)](https://www.typescriptlang.org/)
  [![License](https://img.shields.io/badge/license-Apache%202.0%20%2B%20Commons%20Clause-orange?style=flat-square)](./LICENSE)

  <br /><br />

  <a href="https://quant-alpha-sage.vercel.app"><strong>Live Platform Dashboard »</strong></a> &nbsp;&bull;&nbsp;
  <a href="https://quant-alpha-sage.vercel.app/api/live_data"><strong>Live Data API Endpoint »</strong></a>

</div>

<br />

<div align="center">
  <img src="assets/dashboard-preview.png" alt="Quant Alpha Dashboard Interface" width="900" style="border-radius: 12px; box-shadow: 0 12px 32px rgba(0,0,0,0.15);" />
</div>

<br />

---

## Executive Summary

**Quant Alpha** is a production-grade quantitative research suite engineered to identify equity mispricings across the NSE universe. The platform integrates academic factor research (Piotroski F-Score, Novy-Marx Gross Profitability, Fama-French Value/Quality, Titman Investment, PEAD SUE, and Low Volatility) with a walk-forward Gradient Boosted Machine Learning model to calculate sector-neutral alpha scores, probability outperformance metrics, and walk-forward portfolio backtests.

---

## Key System Capabilities

### 1. Machine Learning Walk-Forward Engine (`engine/ml_engine.py`)
- **Ensemble Classifier**: Fits a `HistGradientBoostingClassifier` on historical scan outcome records in SQLite (`market_scans.db`).
- **Probability Outperformance**: Computes real-time outperformance probability ($P(\text{Return}_{21d} > \text{Nifty}_{21d})$) and maps stocks into conviction tiers (*Strong Alpha*, *Moderate Alpha*, *Neutral*, *Low Alpha*).

### 2. Sector-Neutral Multi-Factor Scoring (`engine/scoring.py` & `engine/research_factors.py`)
- **Sector Z-Score Normalization**: Evaluates technical, fundamental, and quantitative factor metrics relative to industry sector medians.
- **Outlier Mitigation**: Applies continuous non-linear mapping $5.0 + 4.5 \times \tanh(Z / 1.5)$ to bound z-scores between $0.5$ and $9.5$ without losing ordinal rank resolution.

### 3. Walk-Forward Portfolio Backtesting Studio (`engine/backtest_engine.py`)
- **Look-Ahead-Free Rebalancing**: Replays signals strictly using point-in-time data across 2-year OHLCV price histories (monthly rebalance, Top-10 equal-weight).
- **Multi-Model & Multi-Horizon Evaluation**: Supports Short-Term (Technical + Momentum) and Long-Term (Jegadeesh-Titman + Low Volatility) scoring across 1Y ($252$ trading days) and 6M ($126$ trading days) horizons.

### 4. Macro Market Regime Detection (`engine/regime_engine.py`)
- Calculates aggregate market breath percentage (% of NSE stocks above 200 SMA), India VIX volatility, and Nifty trend indices to output a dynamic 0–100 **Regime Score** (*Risk-On*, *Neutral*, *Risk-Off*).

### 5. Defensive Recommendation Engine & Concurrency Layer (`engine/recommendation.py` & `data_pipeline/`)
- **Unprofitable Firm Valuation Penalties**: Firms with negative or zero earnings ($P/E \le 0$) receive an explicit valuation floor penalty (`val_sub = 1.0`), preventing loss-making companies from bypassing fundamental scoring.
- **Growth Ratio Sanitization**: Defensive normalizers automatically scale percentage inputs ($> 3.0$) into decimal ratios for PEG and SUE calculations, avoiding metric distortions.
- **Trend-Aware Bollinger Breakouts**: High Bollinger Band %B ($> 0.95$) is dynamically recognized as a bullish momentum breakout when in a confirmed uptrend ($ADX > 25$, Supertrend bullish).
- **High-Concurrency SQLite Architecture**: Database connections in `data_pipeline.py` and `quant_engine.py` are fortified with Write-Ahead Logging (`PRAGMA journal_mode=WAL;`), `PRAGMA synchronous=NORMAL;`, and `busy_timeout=5000;` to eliminate database write lock contention.

### 6. Current-Gen SEO & Digital Marketing Architecture (`frontend/src/components/common/`)
- **Dynamic Route & Ticker Metadata Engine (`SeoHead.tsx`)**: Dynamically updates `<title>`, `<meta name="description">`, `<link rel="canonical">`, Open Graph (`og:*`), and Twitter Cards (`twitter:*`) per route (`/`, `/signals`, `/screen`, `/heatmap`, `/quant`) and active stock ticker (`?ticker=RELIANCE.NS`).
- **Rich JSON-LD Structured Data**: Injects dynamic `SoftwareApplication`, `FinancialProduct`, `Organization`, `BreadcrumbList`, and `FAQPage` schemas for Google Rich Snippets & "People Also Ask" ranking.
- **Generative Engine Optimization (GEO) for AI Search**: Implements `public/llms.txt` and `public/llms-full.txt` adhering to the `llmstxt.org` standard for AI search engines (Perplexity, ChatGPT, Claude, Google SGE/Search Overviews).
- **1-Click Viral Social Share Engine (`SocialShareModal.tsx`)**: Deep-link social sharing templates for WhatsApp, X (Twitter), LinkedIn, Telegram, and native mobile Web Share API.
- **Growth Funnel & Research Dispatch Capture (`NewsletterModal.tsx`)**: Institutional research dispatch subscription modal for community growth and investor retention.
- **Core Web Vitals & Technical SEO**: DNS prefetching (`dns-prefetch`), resource preconnecting (`fonts.googleapis.com`, `va.vercel-scripts.com`), PWA touch tags, multi-route XML sitemap (`sitemap.xml`) with image tags, and bot-friendly crawler routing (`robots.txt`).

### 7. Modern Apple HIG Interface & UX Architecture (`frontend/src/`)
- **Centered Floating Segmented Control**: Mathematically centered 5-tab pill navigation bar (`rounded-full`, `blur(24px) saturate(180%)`) matching macOS & visionOS floating toolbar standards.
- **Apple Human Interface System**: Custom Apple HIG range sliders with 4px frosted tracks and elevated circular thumbs, unified pill buttons (`rounded-full`), and pure SF Pro typography optical tracking.
- **Interactive Multi-Metric Screener**: Live slider drawer filtering by Min ROE %, Max P/E, Min/Max RSI(14), Market Cap, Piotroski, D/E, and Sector with rich multi-factor CSV export.
- **Global Keyboard Navigation**: Instant tab switching via keys `1` through `5`, and quick search focus via key `/`.
- **Institutional Analysis Modals**: 1-Click Institutional Investment Thesis Modal and Dynamic Position Sizer & Risk Management Calculator.
- **TradingView Canvas Charting**: Built on `@tradingview/lightweight-charts` with real-time indicators (SMA 50/200, Supertrend, Bollinger Bands, RSI, MACD) and log/linear scaling.

---

## Repository File Structure

Below is the complete, exhaustive directory tree representing **every single file** in the repository:

```text
stock-dashboard/
├── .agents/
│   └── AGENTS.md                                 # Workspace rules & database split/join instructions
├── .github/
│   ├── ISSUE_TEMPLATE/
│   │   ├── bug_report.md                         # Issue template for bug reporting
│   │   └── feature_request.md                    # Issue template for feature proposals
│   ├── workflows/
│   │   └── daily_scan.yml                        # GitHub Actions automated scan & weekend backfill workflow
│   ├── CONTRIBUTING.md                           # Code contribution guidelines
│   ├── PULL_REQUEST_TEMPLATE.md                  # Pull request template
│   └── SECURITY.md                               # Security vulnerability reporting policy
├── assets/
│   ├── Alpha_v2_Final-Dark.svg                   # Brand vector logo (dark theme)
│   ├── Alpha_v2_Final-Light.svg                  # Brand vector logo (light theme)
│   ├── dashboard-preview.png                     # High-resolution dashboard screenshot
│   └── fmsLogo.svg                               # FMS Delhi institutional logo
├── data/
│   ├── horizon_analysis.csv                      # Statistical horizon evaluation outputs
│   ├── horizon_ic_study.csv                      # Information Coefficient (IC) decay analysis
│   ├── ic_by_horizon.csv                         # Information Coefficient summary table
│   ├── market_scans.db.part_000                  # SQLite database chunk part 1 (Git tracked)
│   ├── market_scans.db.part_001                  # SQLite database chunk part 2 (Git tracked)
│   ├── ml_alpha_model.joblib                     # Serialized scikit-learn ML Alpha model
│   └── recommendation_performance.csv            # Historical signal performance log
├── data_pipeline/
│   ├── __init__.py                               # Python package marker
│   ├── data_fetcher.py                           # Financial statements & yfinance historical ingestion
│   ├── data_pipeline.py                          # SQLite database schema, WAL mode, migrations & outcome tracking
│   ├── live_updater.py                           # Real-time intra-day price updater
│   └── nse_fetcher.py                            # NSE Bhavcopy downloader & liquid universe filter
├── engine/
│   ├── __init__.py                               # Python package marker
│   ├── backtest_engine.py                        # Walk-forward portfolio backtest engine & cache exporter
│   ├── indicators.py                             # Technical indicators (RSI, MACD, Supertrend, ADX, Ichimoku)
│   ├── ml_engine.py                              # Walk-Forward ML Alpha classifier & probability engine
│   ├── quant_engine.py                           # Mean-variance portfolio optimizer (Sharpe / Min Vol)
│   ├── recommendation.py                         # Conviction badge generator, growth normalizer & signal math
│   ├── regime_engine.py                          # Market regime scoring engine (VIX, Breadth, Nifty Trend)
│   ├── research_factors.py                       # Academic research factors (Piotroski, Novy-Marx, Fama-French, SUE)
│   ├── scanner.py                                # Main orchestration engine for market scans
│   └── scoring.py                                # Composite & sector-neutral z-score calculator
├── frontend/
│   ├── api/
│   │   ├── chart.ts                              # Vercel serverless proxy endpoint for historical OHLCV data
│   │   ├── live_data.ts                          # Vercel serverless proxy endpoint for live quotes
│   │   └── login.ts                              # Vercel serverless endpoint for authentication
│   ├── public/
│   │   ├── backtest_runs/                        # Static JSON backtest runs served to frontend
│   │   │   ├── index.json                        # Index manifest of exported backtest snapshots
│   │   │   ├── long-1y-2026-07-25.json           # 1Y Long-term backtest run snapshot
│   │   │   ├── long-6m-2026-07-25.json           # 6M Long-term backtest run snapshot
│   │   │   ├── short-1y-2025-07-01.json          # Benchmark 1Y Short-term backtest run
│   │   │   ├── short-1y-2026-07-25.json          # 1Y Short-term backtest run snapshot
│   │   │   └── short-6m-2026-07-25.json          # 6M Short-term backtest run snapshot
│   │   ├── dashboard-preview.png                 # Public web asset preview image
│   │   ├── favicon.svg                           # Website favicon SVG
│   │   ├── icons.svg                             # PWA icon set manifest
│   │   ├── llms.txt                              # Summary descriptor for LLM crawlers
│   │   ├── llms-full.txt                         # Full technical manual for AI Search engines
│   │   ├── logo-dark.svg                         # Dark theme logo vector
│   │   ├── logo-light.svg                        # Light theme logo vector
│   │   ├── manifest.json                         # Web App Manifest specification
│   │   ├── market_data.json                      # Aggregated static market scan JSON output
│   │   ├── quant_data.json                       # Aggregated static quant engine JSON output
│   │   ├── robots.txt                            # Search engine crawler policies
│   │   ├── score_history.json                    # Historical ticker score trends JSON
│   │   └── sitemap.xml                           # XML site map for indexing
│   ├── src/
│   │   ├── components/
│   │   │   ├── charting/
│   │   │   │   ├── ChartingTab.tsx               # Full-screen interactive charting view
│   │   │   │   └── TradingViewChart.tsx          # Lightweight Charts canvas integration
│   │   │   ├── common/
│   │   │   │   ├── GlassCard.tsx                 # Glassmorphic card container component
│   │   │   │   ├── InvestmentThesisModal.tsx     # Institutional investment thesis modal
│   │   │   │   ├── NewsletterModal.tsx           # Institutional research dispatch subscription modal
│   │   │   │   ├── PositionSizerModal.tsx        # Risk management & position sizing calculator modal
│   │   │   │   ├── SeoHead.tsx                   # Dynamic route title, meta, canonical & JSON-LD component
│   │   │   │   ├── SocialShareModal.tsx          # 1-click social growth share modal
│   │   │   │   └── shared.tsx                    # Shared UI primitives, tooltips & segmented controls
│   │   │   ├── heatmap/
│   │   │   │   └── HeatmapTab.tsx                # Dynamic sector treemap & heatmap component
│   │   │   ├── quantlab/
│   │   │   │   ├── MonteCarloChart.tsx           # Monte Carlo simulation area chart component
│   │   │   │   └── QuantLabTab.tsx               # Portfolio optimizer, backtest studio & factor exposure
│   │   │   ├── screener/
│   │   │   │   ├── ComparisonModal.tsx           # Multi-asset side-by-side comparison modal
│   │   │   │   └── ScreenerTab.tsx               # Primary quantitative screening matrix table & filter drawer
│   │   │   ├── signals/
│   │   │   │   └── SignalsTab.tsx                # Conviction signals & top pick trade cards
│   │   │   └── LiquidGlassRoot.tsx               # Glassmorphism container wrapper
│   │   ├── data/
│   │   │   └── tooltipContent.ts                 # Explanatory financial tooltips dictionary
│   │   ├── hooks/
│   │   │   ├── useAuth.ts                        # Authentication state controller hook
│   │   │   ├── useChartData.ts                   # Historical OHLCV fetching & caching hook
│   │   │   ├── useMarketData.ts                  # Market data live updater & WebSocket polling hook
│   │   │   └── useWatchlist.ts                   # User watchlist state persistence hook
│   │   ├── utils/
│   │   │   ├── exportUtils.ts                    # CSV data exporter utility
│   │   │   └── formatters.ts                     # Currency, percentage & numeric formatting utilities
│   │   ├── App.tsx                               # Application root component, navigation & state controller
│   │   ├── index.css                             # Global CSS variables, Apple HIG tokens & typography rules
│   │   ├── main.tsx                              # React DOM application entrypoint
│   │   └── types.ts                              # TypeScript interface definitions & data contracts
│   ├── .gitignore                                # Frontend build artifacts & local environment exclusions
│   ├── eslint.config.js                          # ESLint code quality configuration
│   ├── index.html                                # HTML5 root document shell
│   ├── package-lock.json                         # Locked frontend npm dependencies tree
│   ├── package.json                              # Frontend package manifest & scripts
│   ├── postcss.config.js                         # PostCSS CSS processor configuration
│   ├── tailwind.config.js                        # TailwindCSS build configuration
│   ├── tsconfig.app.json                         # App-specific TypeScript compiler options
│   ├── tsconfig.json                             # Root TypeScript project configuration
│   ├── tsconfig.node.json                        # Node-specific TypeScript options
│   ├── vercel.json                               # Vercel deployment & route routing configuration
│   └── vite.config.ts                            # Vite bundler & dev server configuration
├── notifications/
│   ├── __init__.py                               # Python package marker
│   ├── generate_score_history.py                 # Exports historical composite score trends to static JSON
│   ├── telegram_bot.py                           # Broadcasts daily alpha signals to Telegram channel
│   └── weekend_update.py                         # Weekend job: outcome backfill & backtest snapshot generation
├── tests/
│   ├── test_data_collection.py                   # Tests for NSE/yfinance ingestion functions
│   ├── test_e2e_recommendation.py                # End-to-end integration test for scanner pipeline
│   ├── test_indicators.py                        # Unit tests for technical indicator math
│   ├── test_recommendation_edge_cases.py         # Unit tests for growth sanitization, loss penalties & DB pragmas
│   ├── test_research_factors.py                  # Unit tests for academic research factor scoring
│   └── test_scoring.py                           # Unit tests for sector normalization & composite z-scores
├── .gitignore                                    # Git exclusion rules (DB binary, virtual environments)
├── CODE_OF_CONDUCT.md                            # Contributor code of conduct specification
├── LICENSE                                       # Project license specification (Apache 2.0 + Commons Clause)
├── README.md                                     # Project README documentation
├── bse_fetcher.py                                # Utility script to fetch BSE ticker mapping
├── check_db.py                                   # Database integrity & record count inspection tool
├── config.py                                     # Global system configuration parameters & weights
├── db_split_join.py                              # Database chunking utility (40MB split/join for Git)
├── documentation.md                              # Comprehensive architectural reference document
├── explore_data.py                               # Exploratory data analysis CLI helper
├── horizon_analysis.py                           # Predictive horizon & Information Coefficient study script
├── package-lock.json                             # Root Node package lock file
├── populate_ath.py                               # Utility to populate All-Time High price records
├── populate_cache.py                             # Pre-populates local OHLCV price cache
├── replace_tooltips.py                           # Tooltip content updating utility script
├── requirements.txt                              # Python environment dependency requirements
├── run_custom_backtest.py                        # CLI tool to trigger on-demand walk-forward backtests
├── scheduler.py                                  # APScheduler daemon for automated market close scans
├── utils.py                                      # Central logging & utility functions
└── verify_backtest.py                            # Verification script for backtest engine sanity checks
```

---

## Important: Database Chunking Protocol (`db_split_join.py`)

Due to GitHub's 50MB file size limit for repositories, the primary SQLite database (`data/market_scans.db`) is not committed directly. Instead, it is chunked into 40MB binary parts (`data/market_scans.db.part_*`).

### Required Commands:
- **Before running scripts locally**: Join the database parts into `data/market_scans.db`:
  ```bash
  python db_split_join.py join
  ```
- **After generating new scan data or modifying DB schemas**: Split `data/market_scans.db` back into part files before committing:
  ```bash
  python db_split_join.py split
  ```

---

## Local Setup & Development

### 1. Prerequisites
- Python 3.12+ (or Python 3.14)
- Node.js 20+ & npm

### 2. Environment Initialization
```bash
# Clone the repository
git clone https://github.com/abhy-kumar/quant-alpha.git
cd stock-dashboard

# Setup Python virtual environment
python -m venv .venv

# Activate environment (Windows)
.venv\Scripts\activate
# Activate environment (macOS/Linux)
# source .venv/bin/activate

# Install Python dependencies
pip install -r requirements.txt

# Rejoin SQLite database parts
python db_split_join.py join
```

### 3. Backend Execution & Testing
```bash
# Execute unit test suite (78 tests)
python -m pytest tests/

# Run full market scan engine
python -m engine.scanner

# Run on-demand custom walk-forward backtest
python run_custom_backtest.py --as_of 2026-07-25 --model short --horizon 1y
```

### 4. Frontend Web Interface
```bash
cd frontend
npm install
npm run dev
```

---

## Continuous Integration & Automated Operations

The platform uses GitHub Actions ([`.github/workflows/daily_scan.yml`](.github/workflows/daily_scan.yml)) to run automated market scans and data refreshes:

- **Weekday Post-Market Scan**: Runs automatically post market close (4:11 PM IST) to update prices, run ML models, regenerate static JSON payloads (`market_data.json`, `quant_data.json`), and push changes.
- **Weekend Outcome Backfill & Backtest Generation**: Runs every Saturday (9:07 AM IST) to update forward outcome returns (`Return_21d`, `Return_63d`), execute walk-forward backtests, and export cached backtest snapshots (`backtest_runs/`).

---

## License & Attribution

Developed for the **Alpha Research and Investment Club, Faculty of Management Studies (FMS), University of Delhi**.  
Released under the [Apache License 2.0 with Commons Clause](./LICENSE).
