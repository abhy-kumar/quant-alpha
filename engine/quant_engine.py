import sqlite3
import pandas as pd
import numpy as np
import json
import os
from scipy.optimize import minimize
from config import RISK_FREE_RATE
import logging
import engine.backtest_engine as backtest_engine

logger = logging.getLogger("quant_engine")
DB_PATH = "data/market_scans.db"

def _get_conn():
    conn = sqlite3.connect(DB_PATH, timeout=10.0)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    conn.execute("PRAGMA busy_timeout=5000")
    return conn

def fetch_latest_top_picks(limit=15):
    """Fetch the top stocks from the latest scan based on Composite_Score."""
    conn = _get_conn()
    query = """
    SELECT Ticker, Sector, Composite_Score, Piotroski_F, Momentum_6M, Vol_60D, P_E, ROE_Pct
    FROM factor_history
    WHERE Scan_Date = (SELECT MAX(Scan_Date) FROM factor_history)
    ORDER BY Composite_Score DESC
    LIMIT ?
    """
    df = pd.read_sql_query(query, conn, params=(limit,))
    conn.close()
    return df

def fetch_price_history(tickers):
    """Fetch historical daily close prices for given tickers."""
    conn = _get_conn()
    placeholders = ",".join("?" * len(tickers))
    query = f"""
    SELECT Date, Ticker, Close
    FROM daily_ohlcv
    WHERE Ticker IN ({placeholders})
    ORDER BY Date
    """
    df = pd.read_sql_query(query, conn, params=tuple(tickers))
    conn.close()
    
    if df.empty:
        return pd.DataFrame()
        
    # Pivot to get Dates as index and Tickers as columns
    pivot_df = df.pivot(index='Date', columns='Ticker', values='Close')
    pivot_df.index = pd.to_datetime(pivot_df.index)
    return pivot_df.dropna()

def optimize_portfolio(returns_df, objective='sharpe'):
    """Calculate optimal weights using Mean-Variance Optimization."""
    if returns_df.empty or len(returns_df.columns) < 2:
        return {col: 1.0 / len(returns_df.columns) for col in returns_df.columns}

    mean_returns = returns_df.mean() * 252
    cov_matrix = returns_df.cov() * 252
    num_assets = len(mean_returns)
    args = (mean_returns, cov_matrix)

    def portfolio_annualised_performance(weights, mean_returns, cov_matrix):
        returns = np.sum(mean_returns * weights)
        std = np.sqrt(np.dot(weights.T, np.dot(cov_matrix, weights)))
        return std, returns

    def min_volatility(weights, mean_returns, cov_matrix):
        return portfolio_annualised_performance(weights, mean_returns, cov_matrix)[0]

    def neg_sharpe_ratio(weights, mean_returns, cov_matrix, risk_free_rate=RISK_FREE_RATE):
        p_vol, p_ret = portfolio_annualised_performance(weights, mean_returns, cov_matrix)
        if p_vol == 0:
            return 0
        return -(p_ret - risk_free_rate) / p_vol

    def risk_parity_objective(weights, mean_returns, cov_matrix):
        """Equal Risk Contribution (ERC) objective function."""
        sigma_p = np.sqrt(np.dot(weights.T, np.dot(cov_matrix, weights)))
        if sigma_p <= 1e-8:
            return 0.0
        mrc = np.dot(cov_matrix, weights) / sigma_p
        trc = weights * mrc
        target_trc = sigma_p / num_assets
        return float(np.sum((trc - target_trc) ** 2) * 1e4)

    constraints = ({'type': 'eq', 'fun': lambda x: np.sum(x) - 1})
    bounds = tuple((0.0, 1.0) for asset in range(num_assets))
    init_guess = num_assets * [1. / num_assets,]

    if objective == 'sharpe':
        result = minimize(neg_sharpe_ratio, init_guess, args=(mean_returns, cov_matrix, RISK_FREE_RATE),
                          method='SLSQP', bounds=bounds, constraints=constraints)
    elif objective == 'min_vol':
        result = minimize(min_volatility, init_guess, args=(mean_returns, cov_matrix),
                          method='SLSQP', bounds=bounds, constraints=constraints)
    elif objective == 'risk_parity':
        result = minimize(risk_parity_objective, init_guess, args=(mean_returns, cov_matrix),
                          method='SLSQP', bounds=bounds, constraints=constraints)
    else:
        return {col: 1.0 / num_assets for col in returns_df.columns}

    if not result.success or not np.isfinite(result.x).all():
        logger.warning("Portfolio optimizer did not converge; equal weights used")
        return {col: 1.0 / num_assets for col in returns_df.columns}
    weights = np.round(result.x, 4)
    # Ensure exact sum to 1.0
    if weights.sum() > 0:
        weights = weights / weights.sum()
    return {returns_df.columns[i]: float(weights[i]) for i in range(num_assets)}

def run_backtest(score_column: str = 'Composite_Score'):
    """Simulate a simple backtest of buying top 10 stocks on every scan date.
    
    Args:
        score_column: Column in factor_history to rank stocks by. Use
                      'Composite_Score' for short-term or 'Composite_Score_Long'
                      for the 1m-6m horizon-optimised model.
    """
    if score_column not in ('Composite_Score', 'Composite_Score_Long'):
        raise ValueError('Unsupported score column')
    with _get_conn() as conn:
        factors = pd.read_sql_query(f"SELECT Scan_Date, Ticker, {score_column} AS Score FROM factor_history ORDER BY Scan_Date", conn)
    prices, volumes, highs, lows, tickers = backtest_engine.load_ohlcv()
    if factors.empty or prices.empty:
        return {"chart": [], "stats": {}, "error": "Insufficient historical factors"}
    def score_fn(p, v, h, l, universe, idx):
        as_of = str(p.index[idx].date())
        eligible = factors[factors.Scan_Date <= as_of]
        if eligible.empty:
            return pd.Series(dtype=float)
        latest = eligible.Scan_Date.max()
        snapshot = eligible[eligible.Scan_Date == latest].set_index('Ticker')['Score']
        return snapshot.reindex(universe).dropna()
    horizon = int((prices.index >= pd.Timestamp(factors.Scan_Date.min())).sum())
    return backtest_engine.run_walkforward_backtest(score_fn, prices, volumes, highs, lows, tickers, horizon, label='Archived factor model')


def compute_factor_exposures(top_picks_df, universe=None):
    """Aggregate factor exposures for the top picks."""
    if top_picks_df.empty:
        return {}
        
    def normalize(series, invert=False):
        s = pd.to_numeric(series, errors='coerce').dropna()
        if s.empty: return 50
        reference = pd.to_numeric(universe[series.name], errors='coerce').dropna() if universe is not None and series.name in universe else s
        pct = float(np.mean([(reference <= value).mean() for value in s])) * 100
        return float(100 - pct if invert else pct)
        
    value = normalize(top_picks_df['P_E'], invert=True)
    momentum = normalize(top_picks_df['Momentum_6M'])
    quality = normalize(top_picks_df['ROE_Pct'])
    low_vol = normalize(top_picks_df['Vol_60D'], invert=True)
    
    # Piotroski F is usually 0-9
    piotroski = float(pd.to_numeric(top_picks_df['Piotroski_F'], errors='coerce').mean() / 9.0 * 100) if 'Piotroski_F' in top_picks_df.columns else 50
    
    return {
        "Value": round(value, 1),
        "Momentum": round(momentum, 1),
        "Quality": round((quality + piotroski) / 2, 1),
        "Low_Volatility": round(low_vol, 1)
    }

def fetch_latest_regime():
    """Fetch the latest market regime metrics."""
    conn = _get_conn()
    query = """
    SELECT Regime_Score, Nifty_Close, Nifty_SMA_200, VIX, Breadth_Pct
    FROM regime_history
    ORDER BY Scan_Date DESC
    LIMIT 1
    """
    df = pd.read_sql_query(query, conn)
    conn.close()
    if df.empty:
        return {}
    row = df.iloc[0]
    return {
        "score": int(row['Regime_Score']) if pd.notnull(row['Regime_Score']) else 0,
        "nifty_trend": "bullish" if pd.notnull(row['Nifty_Close']) and pd.notnull(row['Nifty_SMA_200']) and row['Nifty_Close'] > row['Nifty_SMA_200'] else "bearish",
        "vix": float(row['VIX']) if pd.notnull(row['VIX']) else 0.0,
        "breadth": float(row['Breadth_Pct']) if pd.notnull(row['Breadth_Pct']) else 0.0
    }

def compute_sector_allocation(top_picks_df):
    """Aggregate sector weights for equal-weight top picks."""
    if 'Sector' not in top_picks_df.columns or top_picks_df.empty:
        return {}
    df = top_picks_df.dropna(subset=['Sector'])
    if df.empty: return {}
    counts = df['Sector'].value_counts(normalize=True) * 100
    return {k: round(float(v), 1) for k, v in counts.items()}

def compute_correlation_matrix(price_history):
    """Compute Pearson correlation matrix of daily returns (last 63 days) for Top 10."""
    if price_history.empty or len(price_history.columns) < 2:
        return {"labels": [], "matrix": []}
    
    # Use top 10 tickers to avoid massive heatmaps
    cols = price_history.columns.tolist()[:10]
    recent_prices = price_history[cols].tail(63)
    returns = recent_prices.pct_change().dropna()
    corr_matrix = returns.corr().round(2)
    
    # Replace NaN with 0 for safety
    corr_matrix = corr_matrix.fillna(0)
    
    return {
        "labels": [c.replace('.NS', '') for c in corr_matrix.columns],
        "matrix": corr_matrix.values.tolist()
    }

def compute_factor_ic_monitor():
    """Cross-sectional daily Spearman IC, averaged across a calendar quarter.

    Non-overlapping 21-session cohorts are used for the descriptive t statistic;
    adjacent forward-return windows cannot be treated as independent samples.
    """
    with _get_conn() as conn:
        df = pd.read_sql_query("""SELECT f.Scan_Date, f.Piotroski_F, f.Momentum_6M,
          f.Vol_60D, f.P_E, f.ROE_Pct, f.Composite_Score, o.Return_21d
          FROM factor_history f JOIN outcome_tracking o USING(Ticker, Scan_Date)
          WHERE o.Return_21d IS NOT NULL ORDER BY f.Scan_Date""", conn)
    meta = [('Piotroski F-Score','Piotroski_F',1),('6M Momentum','Momentum_6M',1),
            ('Low Volatility','Vol_60D',-1),('Quality (ROE)','ROE_Pct',1),
            ('Value (Earnings Yield)','P_E',-1),('Composite Multi-Factor','Composite_Score',1)]
    if not df.empty:
        cutoff = pd.Timestamp(df.Scan_Date.max()) - pd.DateOffset(months=3)
        df = df[pd.to_datetime(df.Scan_Date) >= cutoff]
    output = []
    for name, col, direction in meta:
        daily = []
        for date, cohort in df.groupby('Scan_Date'):
            cohort = cohort.dropna(subset=[col,'Return_21d'])
            if col == 'P_E':
                cohort = cohort[cohort[col] > 0]
            if len(cohort) >= 20 and cohort[col].nunique() > 1 and cohort.Return_21d.nunique() > 1:
                daily.append(float(cohort[col].corr(cohort.Return_21d, method='spearman')) * direction)
        sufficient = len(daily) >= 5
        ic = float(np.mean(daily)) if sufficient else None
        independent = np.array(daily[::21])
        t = float(independent.mean() / (independent.std(ddof=1) / np.sqrt(len(independent)))) if len(independent) >= 3 and independent.std(ddof=1) > 0 else None
        output.append({'factor':name,'ic_current':round(daily[-1],3) if sufficient else None,
                       'ic_3m_rolling':round(ic,3) if ic is not None else None,
                       't_stat':round(t,2) if t is not None else None,'sample_dates':len(daily),
                       'status':'Insufficient history' if not sufficient else 'Observed positive IC' if ic > 0 else 'Observed nonpositive IC'})
    return output


def compute_efficient_frontier(returns):
    if returns.empty or len(returns) < 30 or len(returns.columns) < 2:
        return []
    mu = returns.mean().to_numpy() * 252
    cov = returns.cov().to_numpy() * 252
    n = len(mu)
    points = []
    min_result = minimize(lambda w: w @ cov @ w, np.ones(n)/n, bounds=[(0,1)]*n,
                          constraints=[{'type':'eq','fun':lambda w: w.sum()-1}], method='SLSQP')
    if not min_result.success:
        return []
    for target in np.linspace(mu @ min_result.x, mu.max(), 30):
        fit = minimize(lambda w: w @ cov @ w, min_result.x, bounds=[(0,1)]*n,
                       constraints=[{'type':'eq','fun':lambda w: w.sum()-1},
                                    {'type':'eq','fun':lambda w,t=target: mu @ w-t}], method='SLSQP')
        if fit.success:
            vol = float(np.sqrt(fit.x @ cov @ fit.x))
            points.append({'volatility':round(vol*100,2),'return':round(float(mu @ fit.x)*100,2),
                           'sharpe':round((float(mu @ fit.x)-RISK_FREE_RATE)/vol,2) if vol else 0})
    return points


def compute_scenario_stress_tests(top_picks_df, returns_df):
    """Illustrative assumed shocks; this heuristic is not a historical replay."""
    portfolio_beta = 1.0
    if not returns_df.empty:
        avg_vol = returns_df.std().mean() * np.sqrt(252)
        portfolio_beta = float(np.clip(avg_vol / 0.18, 0.65, 1.45))
    
    quality_dampener = 0.90
    if not top_picks_df.empty and 'Piotroski_F' in top_picks_df.columns:
        avg_f = pd.to_numeric(top_picks_df['Piotroski_F'], errors='coerce').mean()
        if avg_f >= 7:
            quality_dampener = 0.78
        elif avg_f >= 5:
            quality_dampener = 0.86

    scenarios = [
        {
            "event_name": "2020 Covid Liquidity Shock",
            "period": "Feb - Mar 2020",
            "benchmark_shock_pct": -38.4,
            "simulated_portfolio_pct": round(-38.4 * portfolio_beta * quality_dampener, 1),
            "factor_resilience": "Illustrative volatility/quality sensitivity"
        },
        {
            "event_name": "2022 Global Rate Hike & Inflation",
            "period": "Jan - Jun 2022",
            "benchmark_shock_pct": -15.2,
            "simulated_portfolio_pct": round(-15.2 * portfolio_beta * quality_dampener, 1),
            "factor_resilience": "Illustrative volatility/quality sensitivity"
        },
        {
            "event_name": "2024 Election / Budget Flash Volatility",
            "period": "Jun 2024",
            "benchmark_shock_pct": -5.9,
            "simulated_portfolio_pct": round(-5.9 * portfolio_beta * quality_dampener, 1),
            "factor_resilience": "Illustrative volatility/quality sensitivity"
        },
        {
            "event_name": "High Multiple Valuation Reset",
            "period": "Simulated Stress Test",
            "benchmark_shock_pct": -12.0,
            "simulated_portfolio_pct": round(-12.0 * portfolio_beta * quality_dampener, 1),
            "factor_resilience": "Illustrative volatility/quality sensitivity"
        }
    ]
    return scenarios

def generate_quant_data():
    """Main function to generate quant_data.json."""
    logger.info("Generating Quant Lab data...")
    try:
        top_picks_df = fetch_latest_top_picks(10)
        
        # Portfolio Optimization
        tickers = top_picks_df['Ticker'].tolist()
        price_history = fetch_price_history(tickers)
        returns_df = pd.DataFrame()
        
        if not price_history.empty:
            returns_df = price_history.pct_change().dropna()
            max_sharpe = optimize_portfolio(returns_df, 'sharpe')
            min_vol = optimize_portfolio(returns_df, 'min_vol')
            risk_parity = optimize_portfolio(returns_df, 'risk_parity')
        else:
            max_sharpe = {t: 1.0/len(tickers) for t in tickers} if tickers else {}
            min_vol = {t: 1.0/len(tickers) for t in tickers} if tickers else {}
            risk_parity = {t: 1.0/len(tickers) for t in tickers} if tickers else {}
            
        # Clean up near-zero weights
        max_sharpe = {k: v for k, v in max_sharpe.items() if v > 0.01}
        min_vol = {k: v for k, v in min_vol.items() if v > 0.01}
        risk_parity = {k: v for k, v in risk_parity.items() if v > 0.01}
        
        # Sort weights in descending order
        max_sharpe = dict(sorted(max_sharpe.items(), key=lambda item: item[1], reverse=True))
        min_vol = dict(sorted(min_vol.items(), key=lambda item: item[1], reverse=True))
        risk_parity = dict(sorted(risk_parity.items(), key=lambda item: item[1], reverse=True))
        
        # Factor Exposures
        exposures = compute_factor_exposures(top_picks_df, fetch_latest_top_picks(1000))
        
        # Backtest â€” legacy (factor_history-based, short live window)
        backtest_results      = run_backtest('Composite_Score')
        backtest_long_results = run_backtest('Composite_Score_Long')

        # Walk-forward backtests from 2-year OHLCV history (1Y & 6M Ã— Short & Long)
        logger.info("Running walk-forward OHLCV backtests...")
        wf_results = backtest_engine.run_all_backtests()
        
        # Quant Lab Factor IC, Stress Tests & Models
        regime = fetch_latest_regime()
        sectors = compute_sector_allocation(top_picks_df)
        correlation = compute_correlation_matrix(price_history)
        factor_ic = compute_factor_ic_monitor()
        stress_tests = compute_scenario_stress_tests(top_picks_df, returns_df)
        
        output = {
            "last_updated": pd.Timestamp.now().strftime("%Y-%m-%d %H:%M:%S"),
            "model_portfolios": {
                "max_sharpe": max_sharpe,
                "min_volatility": min_vol,
                "risk_parity": risk_parity
            },
            "factor_exposures": exposures,
            "efficient_frontier": compute_efficient_frontier(returns_df),
            "data_version": backtest_engine.BACKTEST_VERSION,
            "factor_ic_monitor": factor_ic,
            "scenario_stress_tests": stress_tests,
            "backtest": backtest_results,
            "backtest_long": backtest_long_results,
            # Walk-forward OHLCV-based backtests (1Y & 6M Ã— Short & Long)
            "backtest_short_1y": wf_results.get("backtest_short_1y"),
            "backtest_short_6m": wf_results.get("backtest_short_6m"),
            "backtest_long_1y":  wf_results.get("backtest_long_1y"),
            "backtest_long_6m":  wf_results.get("backtest_long_6m"),
            "market_regime": regime,
            "sector_allocation": sectors,
            "correlation_matrix": correlation
        }
        
        os.makedirs("frontend/public", exist_ok=True)
        from utils import atomic_json
        atomic_json("frontend/public/quant_data.json", output)
            
        from engine.strategy_history import export_strategy_history
        export_strategy_history()
        logger.info("Successfully generated quant_data.json")

        # Export cached custom backtest runs to static JSON for Vercel
        try:
            n_runs = backtest_engine.export_backtest_index()
            if n_runs:
                logger.info(f"Exported {n_runs} cached backtest run(s) to frontend/public/backtest_runs/")
        except Exception as ex:
            logger.error(f"Could not export backtest index: {ex}")
            raise

    except Exception as e:
        logger.error(f"Error generating Quant data: {e}")
        raise

if __name__ == "__main__":
    generate_quant_data()
