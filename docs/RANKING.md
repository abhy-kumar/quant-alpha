# Ranking model

Version: `ranking-v3.0`. Introduced October 2026.

The objective is reliable relative stock selection at distinct holding horizons.
The model is an explicit starting specification, not a claim of optimal weights
or a calibrated forecast of returns. More complex candidates must earn their
place through chronological validation after costs.

## Five contribution budgets

| Pillar | Short term | Long term | Balanced |
|---|---:|---:|---:|
| Quality | 15% | 35% | 25% |
| Value | 10% | 30% | 20% |
| Momentum | 35% | 15% | 25% |
| Trend | 25% | 5% | 15% |
| Stability | 15% | 15% | 15% |

Each final score adds these five contributions once. Fundamental and Research
summary scores are diagnostics; the model does not add them back into the final
score. News sentiment, the legacy earnings surprise proxy, Piotroski proxies,
universal P/E cutoffs and repeated multiplicative debt penalties are excluded.
Market regime is context, not an unvalidated switch of the scoring weights.

Quality uses ROE, ROCE, ROA, cash accrual quality and leverage. Financial firms use
ROE, ROA and profit margin instead: industrial leverage and operating cash-flow
rules are inappropriate substitutes for bank balance-sheet analysis. Value uses
earnings yield, book yield and free-cash-flow yield; financial firms use the first
two. Earnings yield comes from earnings per share and the latest price, not a
month-old P/E. Negative earnings retain their sign.

Accounting metrics are ranked within sectors when at least eight valid peers
are available. Smaller sectors use the financial or nonfinancial comparison
group. Missing values never become zero debt or zero earnings. Cash accruals
require actual statement assets; equity plus debt minus cash is not total assets.

Momentum combines 12-month and 6-month returns with the latest 21 sessions
excluded. Trend compares price with the 50- and 200-session moving averages.
Stability uses 63-session volatility and downside deviation. Correlated features
share one pillar's budget rather than obtaining separate full votes. Momentum
windows require uninterrupted valid observations on the benchmark's trading
calendar, so missing quotes cannot silently shorten a lookback. The conventional momentum
factor also excludes the most recent month; see [French's construction](https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/Data_Library/det_mom_factor.html).

All observed features use midpoint percentile ranks. This bounds the influence
of extreme observations and treats ties equally. An all-tied population scores
5/10, not 10/10. Missing features contribute neutral 5/10 without redistributing
their weight to the remaining features. The model separately records the
fraction of the intended feature weight that was actually observed.

## Eligibility and interpretation

Short/balanced recommendations require 70% weighted coverage; long-term requires
75%. Quality, value, momentum and trend each need at least half their intended
inputs, and stability must be observed. Quotes must match the benchmark's latest
session (or the modal equity date if the benchmark is unavailable). ETFs and stale quotes do not enter the
equity recommendation population. Each horizon ranks its own eligible scores.

Strong Buy requires a top-decile rank, a score of at least 6.5 and at least 85%
coverage. Buy requires a top-30% rank and a score of at least 5.5. These are
transparent eligibility rules, not empirically calibrated return probabilities.
Nonpositive book equity triggers Avoid; high promoter pledging or negative
trailing earnings trigger Caution. Financial firms are not zeroed merely
for high debt/equity. Insufficient data is shown explicitly. Signals may display
fewer than three stocks, or none, rather than force recommendations.

Signals, desktop/mobile Screener and exports use the same horizon fields.
`Composite_Score_Tech` is short-term; `Composite_Score_Long` is long-term;
`Composite_Score` is balanced. `Composite_Score_Fund` remains a compatibility
alias for the long-term score. Score ties use ticker order in the interface.

## Universe and data quality

The scanner selects up to 500 symbols by recent traded value, primarily the
30-observation average stored in the database. NSE's latest bhav copy supplies
liquidity for new symbols. Database alphabetical order has no selection role.
Existing liquidity and microcap exclusions still apply before scoring. If
turnover data is unavailable, the fallback universe is retained without an
arbitrary alphabetical truncation.

When Yahoo lags, the latest official NSE daily file can complete a quote only
if its previous close matches the adjusted history's last close. Mismatches,
including possible corporate actions, remain missing rather than mixing price
bases. Newer saved benchmark quotes are retained. The same daily file repairs
gaps for previously tracked stocks used by historical portfolios. A local
rescore can reuse stored histories while still checking the latest exchange file:

```powershell
& .venv/Scripts/python.exe -m engine.scanner --stored-prices
```

Fundamental caches expire after 24 hours and require the current data schema.
This is retrieval freshness; financial statements still reflect their reporting periods.
Growth inputs are always fractions; ROCE and debt/equity use percentage points.
Values above 300% growth are not divided by 100. Dividend diagnostic units are
consistent. Gross margin means gross profit divided by revenue, and current
ratio means current assets divided by current liabilities. These definitions
follow the [original Piotroski specification](https://www.ivey.uwo.ca/media/3775523/value_investing_the_use_of_historical_financial_statement_information.pdf).

Legacy SUE is explicitly described as an earnings-growth proxy, excluded from
ranking. Actual standardized earnings surprises require an expectation and
forecast-error scale; see the [Federal Reserve working paper](https://www.federalreserve.gov/pubs/ifdp/2008/951/ifdp951.htm).

## Validation and reproducibility

The audit recovered 376 Git revisions, representing 87 publication dates and
23,588 stock snapshots from June 8 through September 30, 2026. It also fetched up
to five years of adjusted daily prices for 666 tracked symbols and NIFTY. These
are useful but different datasets: modern financial statements cannot be
silently attached to historical prices.

`engine.ranking_validation` compares equal weighting, momentum, a defensive
blend, a balanced price blend, nonnegative ridge regression and gradient
boosting. Training labels must mature before January 2025. Model selection uses
2025 only, with all validation trades exiting in 2025. ETFs are excluded using
the saved security classification and symbol checks. The selected candidate
then receives an untouched 2026 test. Signals trade at the next close, use fixed
shares between rebalances, and pay 20bp on each trade leg. Selection never
filters stocks using future return availability. Missing held-stock quotes are
reported and disqualify validation candidates rather than silently improving
their standings. Daily rank correlations include a block-bootstrap interval.

```powershell
& .venv/Scripts/python.exe db_split_join.py join
& .venv/Scripts/python.exe scripts/fetch_ranking_prices.py --output data/research_prices
& .venv/Scripts/python.exe -m engine.ranking_validation --prices PATH_TO_ADJUSTED_PRICE_PICKLES --output comparison.json
```

The fetched universe consists of currently tracked stocks, so survivor bias
remains. Short validation/test windows, overlapping labels and limited holding
periods restrict the strength of conclusions. This comparison tests the price
component, not the complete fundamental model. The initial comparison did not
support promoting either machine-learning candidate. No candidate passed the
full price-component promotion gate. The equity-only comparison retained 653
symbols after ETF exclusions. At 21 sessions, validation selected the defensive
blend, but its 2025 mean net excess return was -1.40% per holding period and its
rank-correlation confidence interval included zero. At 63 sessions, equal
weighting was selected; only three validation and two test holding periods had
matured. These results do not establish an advantage for the full new ranking.
Numerical results and
scope are recorded in `ranking-price-comparison.json`.

`ranking-snapshot-comparison.json` reports exploratory checks of the recovered
Git commits. Commit timestamps approximate publication; actual push/deployment
times are not retained. It reconstructs only the available accounting inputs and uses
prices known before the commit. It enters on the following session, and keeps
one observation per entry date. These checks cannot validate the complete new
model: several raw accounting inputs were never stored in the old exports.

Reproduce the archived-snapshot check with the same publication cutoff:

```powershell
& .venv/Scripts/python.exe scripts/recover_ranking_history.py --output data/research_prices/archive --before 2026-10-01T00:00:00+05:30
& .venv/Scripts/python.exe scripts/evaluate_ranking_snapshots.py --snapshots data/research_prices/archive/git_snapshots.pkl --prices data/research_prices --output snapshot-comparison.json
```

Every new scan records immutable model-version, inputs, pillars, coverage,
weights, price date and recording timestamp in `ranking_history`. Repeated
scans cannot overwrite that day's first saved recommendation. Displayed score
histories filter by model version and holding horizon. Old factor rows
also retain their original version of the daily signal. Previous model histories
are not retroactively relabeled as v3. ML probabilities are unavailable until a
model is calibrated for this version. Existing Quant Lab proxy backtests remain
historical research tools, not proof of this ranking's performance.

Evaluate matured outcomes without mixing model versions:

```powershell
& .venv/Scripts/python.exe -m engine.ranking_forward_validation --version ranking-v3.0 --output data/ranking-forward-validation.json
```

This uses the saved recording date and enters at the following session's close,
preserves missing outcomes as pending, and reports benchmark excess returns after
costs. Recording time is not proof of public availability: unusually delayed
pushes/deployments need a separate availability check before interpreting outcomes.
It does not manufacture historical v3 recommendations. Changes to factors,
weights, eligibility or labels require a new model version.

Future promotion should require superiority to the fixed baseline after costs,
reasonable drawdown, stability across market regimes and coverage groups, and
an untouched test period. The model must remain frozen during each such test.
