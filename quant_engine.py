import sqlite3
import pandas as pd
import numpy as np
import json
import os
from scipy.optimize import minimize
from config import RISK_FREE_RATE
import logging

logger = logging.getLogger("quant_engine")
DB_PATH = "data/market_scans.db"

def _get_conn():
    return sqlite3.connect(DB_PATH)

def fetch_latest_top_picks(limit=15):
    """Fetch the top stocks from the latest scan based on Composite_Score."""
    conn = _get_conn()
    query = """
    SELECT Ticker, Composite_Score, Piotroski_F, Momentum_6M, Vol_60D, P_E, ROE_Pct
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
    return pivot_df.ffill().dropna()

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

    constraints = ({'type': 'eq', 'fun': lambda x: np.sum(x) - 1})
    bounds = tuple((0.0, 1.0) for asset in range(num_assets))
    init_guess = num_assets * [1. / num_assets,]

    if objective == 'sharpe':
        result = minimize(neg_sharpe_ratio, init_guess, args=(mean_returns, cov_matrix, RISK_FREE_RATE),
                          method='SLSQP', bounds=bounds, constraints=constraints)
    elif objective == 'min_vol':
        result = minimize(min_volatility, init_guess, args=(mean_returns, cov_matrix),
                          method='SLSQP', bounds=bounds, constraints=constraints)
    else:
        return {col: 1.0 / num_assets for col in returns_df.columns}

    weights = np.round(result.x, 4)
    return {returns_df.columns[i]: float(weights[i]) for i in range(num_assets)}

def run_backtest():
    """Simulate a simple backtest of buying top 10 stocks on every scan date."""
    conn = _get_conn()
    
    # Get all distinct scan dates
    dates_df = pd.read_sql_query("SELECT DISTINCT Scan_Date FROM factor_history ORDER BY Scan_Date", conn)
    scan_dates = dates_df['Scan_Date'].tolist()
    
    if len(scan_dates) < 2:
        conn.close()
        return []

    # Get daily returns for all stocks to compute daily portfolio returns
    ohlcv_df = pd.read_sql_query("SELECT Date, Ticker, Close FROM daily_ohlcv ORDER BY Date", conn)
    ohlcv_df['Date'] = pd.to_datetime(ohlcv_df['Date'])
    pivot_df = ohlcv_df.pivot(index='Date', columns='Ticker', values='Close')
    returns_df = pivot_df.pct_change().shift(-1) # return for holding from day T to T+1
    
    # Nifty data for benchmark (if available in daily_ohlcv)
    benchmark_returns = pd.Series(0.0, index=returns_df.index)
    if '^NSEI' in returns_df.columns:
        benchmark_returns = returns_df['^NSEI'].fillna(0)
    
    portfolio_value = 100.0
    benchmark_value = 100.0
    
    backtest_data = []
    
    for i in range(len(scan_dates)):
        current_date = scan_dates[i]
        
        # Get top 10 stocks for this scan date
        query = """
        SELECT Ticker FROM factor_history
        WHERE Scan_Date = ?
        ORDER BY Composite_Score DESC
        LIMIT 10
        """
        top_picks = pd.read_sql_query(query, conn, params=(current_date,))['Ticker'].tolist()
        
        if not top_picks:
            continue
            
        # Determine the period until the next scan date
        start_date = pd.to_datetime(current_date)
        if i < len(scan_dates) - 1:
            end_date = pd.to_datetime(scan_dates[i+1])
        else:
            end_date = returns_df.index[-1]
            
        period_returns = returns_df.loc[(returns_df.index >= start_date) & (returns_df.index < end_date)]
        
        for date, row in period_returns.iterrows():
            # Equal weight the available top picks
            valid_picks = [t for t in top_picks if t in row.index and not np.isnan(row[t])]
            if valid_picks:
                daily_ret = np.mean([row[t] for t in valid_picks])
            else:
                daily_ret = 0.0
                
            portfolio_value *= (1 + daily_ret)
            
            bench_ret = benchmark_returns.loc[date] if date in benchmark_returns.index else 0.0
            benchmark_value *= (1 + bench_ret)
            
            backtest_data.append({
                "date": date.strftime("%Y-%m-%d"),
                "portfolio": round(portfolio_value, 2),
                "benchmark": round(benchmark_value, 2)
            })

    conn.close()
    
    if not backtest_data:
        return []
        
    # Ensure unique dates (take last value if duplicates)
    df = pd.DataFrame(backtest_data).drop_duplicates(subset=['date'], keep='last')
    return df.to_dict('records')

def compute_factor_exposures(top_picks_df):
    """Aggregate factor exposures for the top picks."""
    if top_picks_df.empty:
        return {}
        
    def normalize(series, invert=False):
        s = pd.to_numeric(series, errors='coerce').dropna()
        if s.empty: return 50
        pct = s.rank(pct=True).mean() * 100
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

def generate_quant_data():
    """Main function to generate quant_data.json."""
    logger.info("Generating Quant Lab data...")
    try:
        top_picks_df = fetch_latest_top_picks(15)
        
        # Portfolio Optimization
        tickers = top_picks_df['Ticker'].tolist()
        price_history = fetch_price_history(tickers)
        
        if not price_history.empty:
            returns_df = price_history.pct_change().dropna()
            max_sharpe = optimize_portfolio(returns_df, 'sharpe')
            min_vol = optimize_portfolio(returns_df, 'min_vol')
        else:
            max_sharpe = {t: 1.0/len(tickers) for t in tickers} if tickers else {}
            min_vol = {t: 1.0/len(tickers) for t in tickers} if tickers else {}
            
        # Clean up near-zero weights
        max_sharpe = {k: v for k, v in max_sharpe.items() if v > 0.01}
        min_vol = {k: v for k, v in min_vol.items() if v > 0.01}
        
        # Sort weights in descending order
        max_sharpe = dict(sorted(max_sharpe.items(), key=lambda item: item[1], reverse=True))
        min_vol = dict(sorted(min_vol.items(), key=lambda item: item[1], reverse=True))
        
        # Factor Exposures
        exposures = compute_factor_exposures(top_picks_df)
        
        # Backtest
        backtest_results = run_backtest()
        
        output = {
            "last_updated": pd.Timestamp.now().strftime("%Y-%m-%d %H:%M:%S"),
            "model_portfolios": {
                "max_sharpe": max_sharpe,
                "min_volatility": min_vol
            },
            "factor_exposures": exposures,
            "backtest": backtest_results
        }
        
        os.makedirs("frontend/public", exist_ok=True)
        with open("frontend/public/quant_data.json", "w") as f:
            json.dump(output, f, indent=2)
            
        logger.info("Successfully generated quant_data.json")
    except Exception as e:
        logger.error(f"Error generating Quant data: {e}")

if __name__ == "__main__":
    generate_quant_data()
