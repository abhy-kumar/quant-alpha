from fastapi import FastAPI, BackgroundTasks, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import yfinance as yf
import pandas as pd
from datetime import datetime, timedelta

from database import load_from_db, load_scan_log, test_connection, get_backend, get_last_scan_time
from scanner import run_scanner
from indicators import add_indicators

app = FastAPI(title="Quant Alpha API", version="1.0")

# Allow CORS for React frontend (Vite defaults to 5173)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/api/dashboard")
def get_dashboard():
    df = load_from_db()
    if df.empty:
        return {"status": "empty", "data": []}
    
    # Fill NA values so JSON encoding doesn't break
    df = df.fillna("")
    return {"status": "ok", "data": df.to_dict(orient="records")}

@app.get("/api/diagnostics")
def get_diagnostics():
    db_ok, db_msg = test_connection()
    scan_log = load_scan_log()
    ok_n = 0
    fail_n = 0
    if not scan_log.empty:
        ok_n = int((scan_log["Status"] == "OK").sum())
        fail_n = int((scan_log["Status"] == "FAILED").sum())
    
    return {
        "database": {
            "status": "ok" if db_ok else "error",
            "message": db_msg,
            "type": "Supabase" if get_backend() == "postgresql" else "SQLite",
            "last_scan": get_last_scan_time()
        },
        "scans": {
            "ok": ok_n,
            "failed": fail_n
        }
    }

@app.post("/api/scan")
def trigger_scan(background_tasks: BackgroundTasks):
    def background_scan():
        try:
            run_scanner()
        except Exception as e:
            print(f"Background scan failed: {e}")
            
    background_tasks.add_task(background_scan)
    return {"message": "Scan triggered in background"}

@app.get("/api/chart/{ticker}")
def get_chart_data(ticker: str, period: str = "1y", interval: str = "1d"):
    try:
        t = yf.Ticker(ticker)
        # Fetch 5 years of data so 200-day SMA can always calculate, regardless of selected period
        df_price = t.history(period="5y", interval=interval, auto_adjust=True)
        if df_price.empty:
            raise HTTPException(status_code=404, detail="No data found for ticker")
        
        # Add technical indicators using the project's logic
        df_price = add_indicators(df_price)
        
        # Slice back down to the requested period
        period_days = {
            "1w": 5, "1mo": 22, "3mo": 66, "6mo": 130, "1y": 252, "2y": 504, "5y": 1260
        }
        
        # For weekly intervals, divide days by 5
        if interval == "1wk":
            for k in period_days:
                period_days[k] = period_days[k] // 5
                
        if period in period_days:
            df_price = df_price.tail(period_days[period])
        
        # Format for lightweight-charts or recharts
        df_price = df_price.reset_index()
        data = []
        for _, row in df_price.iterrows():
            date_str = row['Date'].strftime('%Y-%m-%d') if hasattr(row['Date'], 'strftime') else str(row['Date']).split()[0]
            # Replace NaNs with None for JSON serialization
            data.append({
                "time": date_str,
                "open": row["Open"],
                "high": row["High"],
                "low": row["Low"],
                "close": row["Close"],
                "volume": row["Volume"],
                "sma50": None if pd.isna(row.get("SMA_50")) else row["SMA_50"],
                "sma200": None if pd.isna(row.get("SMA_200")) else row["SMA_200"],
                "rsi": None if pd.isna(row.get("RSI")) else row["RSI"]
            })
        return {"ticker": ticker, "data": data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    uvicorn.run("api:app", host="0.0.0.0", port=8000, reload=True)
