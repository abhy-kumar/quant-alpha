"""
live_updater.py
---------------
Updates market_data.json with live prices and 1-day change % using yfinance.
Also fetches ^NSEI (Nifty 50) for the overall market indicator.
"""

import json
import logging
import os
from datetime import datetime
import pytz

import pandas as pd
import yfinance as yf

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

IST = pytz.timezone("Asia/Kolkata")
DATA_FILE = "frontend/public/market_data.json"

def update_live_prices():
    if not os.path.exists(DATA_FILE):
        logger.error(f"Data file {DATA_FILE} not found. Run scanner.py first.")
        return

    try:
        with open(DATA_FILE, "r") as f:
            market_data = json.load(f)
    except Exception as e:
        logger.error(f"Failed to load JSON: {e}")
        return
    
    if "data" not in market_data:
        logger.error("Invalid JSON structure: 'data' key missing.")
        return

    tickers = [row["Ticker"] for row in market_data["data"] if "Ticker" in row]
    if not tickers:
        logger.warning("No tickers found in JSON.")
        return

    # Add Nifty 50
    fetch_list = tickers + ["^NSEI"]
    
    logger.info(f"Fetching live data for {len(fetch_list)} symbols...")
    
    # Use period="5d" to ensure we get both today's latest and yesterday's close
    df = yf.download(fetch_list, period="5d", progress=False)
    
    if df.empty:
        logger.error("Failed to download any data from yfinance.")
        return

    nifty_data = None
    updates_count = 0

    # Process updates
    for row in market_data["data"]:
        ticker = row["Ticker"]
        try:
            if isinstance(df.columns, pd.MultiIndex):
                closes = df["Close"][ticker].dropna()
            else:
                closes = df["Close"].dropna() if len(fetch_list) == 1 else pd.Series()
                
            if len(closes) >= 2:
                latest = float(closes.iloc[-1])
                prev = float(closes.iloc[-2])
                chg = (latest / prev - 1) * 100
                
                row["Price"] = round(latest, 2)
                row["1d_Chg_%"] = round(chg, 2)
                updates_count += 1
        except Exception:
            pass
            
    # Process Nifty
    try:
        if isinstance(df.columns, pd.MultiIndex):
            nifty_closes = df["Close"]["^NSEI"].dropna()
        else:
            nifty_closes = pd.Series()
            
        if len(nifty_closes) >= 2:
            n_latest = float(nifty_closes.iloc[-1])
            n_prev = float(nifty_closes.iloc[-2])
            n_chg = (n_latest / n_prev - 1) * 100
            
            nifty_data = {
                "price": round(n_latest, 2),
                "change_pct": round(n_chg, 2),
                "is_up": n_chg >= 0
            }
    except Exception as e:
        logger.warning(f"Could not process Nifty data: {e}")

    now_time = datetime.now(IST)
    market_data["last_updated"] = now_time.strftime("%Y-%m-%d %I:%M %p IST")
    market_data["is_dynamic"] = True
    if nifty_data:
        market_data["nifty_50"] = nifty_data

    # Write back
    with open(DATA_FILE, "w") as f:
        json.dump(market_data, f, indent=2)
        
    logger.info(f"Updated {updates_count} tickers. Nifty 50: {nifty_data}")
    
    # Save live prices to database
    try:
        import sqlite3
        os.makedirs("data", exist_ok=True)
        conn = sqlite3.connect("data/market_scans.db")
        cursor = conn.cursor()
        
        # Create table if not exists
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS live_prices (
                Ticker TEXT,
                Timestamp TEXT,
                Price REAL,
                Change_Pct REAL
            )
        ''')
        
        timestamp_str = now_time.strftime("%Y-%m-%d %H:%M:%S")
        records_to_insert = []
        
        for row in market_data.get("data", []):
            if "Price" in row and "1d_Chg_%" in row and "Ticker" in row:
                records_to_insert.append((row["Ticker"], timestamp_str, row["Price"], row["1d_Chg_%"]))
                
        if nifty_data:
            records_to_insert.append(("^NSEI", timestamp_str, nifty_data["price"], nifty_data["change_pct"]))
            
        cursor.executemany(
            "INSERT INTO live_prices (Ticker, Timestamp, Price, Change_Pct) VALUES (?, ?, ?, ?)",
            records_to_insert
        )
        
        conn.commit()
        conn.close()
        logger.info(f"Inserted {len(records_to_insert)} live prices into database.")
    except Exception as e:
        logger.error(f"Failed to save live prices to database: {e}")

if __name__ == "__main__":
    update_live_prices()
