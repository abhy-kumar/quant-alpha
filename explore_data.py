import pandas as pd, numpy as np, sqlite3

df = pd.read_csv('data/recommendation_performance.csv')
df['Scan_Date'] = pd.to_datetime(df['Scan_Date'])

print('=== Columns available ===')
print(df.columns.tolist())
print(f'Total rows: {len(df)}')
print(f'Date range: {df.Scan_Date.min().date()} -> {df.Scan_Date.max().date()}')
print()

# Return coverage
print('=== Return column coverage ===')
for col in ['Return_3d', 'Return_5d', 'Return_10d']:
    if col in df.columns:
        print(f'{col}: {df[col].notna().sum()} non-null rows ({df[col].notna().mean()*100:.1f}%)')

print()

# DB tables and schema
conn = sqlite3.connect('data/market_scans.db')
tables = pd.read_sql_query("SELECT name FROM sqlite_master WHERE type='table'", conn)
print('=== DB Tables ===')
print(tables['name'].tolist())
print()

fh_schema = pd.read_sql_query("PRAGMA table_info(factor_history)", conn)
print('=== factor_history columns ===')
print(fh_schema[['name','type']].to_string())
print()

dates = pd.read_sql_query('SELECT DISTINCT Scan_Date FROM factor_history ORDER BY Scan_Date', conn)
print(f'Scan dates in factor_history: {len(dates)}')
print(dates.tail(5).to_string())
print()

# Sample factor_history row
sample = pd.read_sql_query("SELECT * FROM factor_history LIMIT 1", conn)
print('=== Sample factor_history row ===')
print(sample.T.to_string())
print()

# daily_ohlcv coverage
ohlcv_info = pd.read_sql_query("""
    SELECT MIN(Date) as min_date, MAX(Date) as max_date, COUNT(DISTINCT Ticker) as tickers, COUNT(*) as rows
    FROM daily_ohlcv
""", conn)
print('=== daily_ohlcv coverage ===')
print(ohlcv_info.to_string())

conn.close()
