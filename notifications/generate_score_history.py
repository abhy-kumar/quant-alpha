"""
generate_score_history.py
-------------------------
Reads historical_scans from market_scans.db and writes
frontend/public/score_history.json for the ChartingTab score chart.

Output format:
{
  "TICKER.NS": [
    {"date": "2026-06-09", "composite": 6.5, "composite_tech": 7.2, "composite_fund": 5.8, "tech": 0.3, "fund": 7.1, "research": 8.2},
    ...
  ],
  ...
}
"""

import sqlite3
import json
import os

DB_PATH = "data/market_scans.db"
OUTPUT_PATH = "frontend/public/score_history.json"


def generate():
    if not os.path.exists(DB_PATH):
        print(f"Database not found: {DB_PATH}")
        return

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    try:
        columns = {row[1] for row in cursor.execute('PRAGMA table_info(historical_scans)')}
        version = 'Ranking_Version' if 'Ranking_Version' in columns else 'NULL'
        cursor.execute(f"""
            SELECT Ticker, Scan_Date, Composite_Score, Composite_Score_Tech, Composite_Score_Fund,
                   Tech_Score, Fund_Score, Research_Score, {version} AS Model_Version
            FROM historical_scans
            WHERE Composite_Score IS NOT NULL
            ORDER BY Ticker, Scan_Date
        """)
        rows = cursor.fetchall()
    except sqlite3.OperationalError as e:
        print(f"Query failed (table may not exist yet): {e}")
        conn.close()
        return
    finally:
        conn.close()

    result = {}
    for row in rows:
        ticker = row["Ticker"]
        if ticker not in result:
            result[ticker] = []
        def safe_float(val):
            try:
                return round(float(val), 2)
            except (TypeError, ValueError):
                return None

        result[ticker].append({
            "date": row["Scan_Date"][:10],
            "model_version": row["Model_Version"],
            "composite": safe_float(row["Composite_Score"]),
            "composite_tech": safe_float(row["Composite_Score_Tech"]),
            "composite_fund": safe_float(row["Composite_Score_Fund"]),
            "tech": safe_float(row["Tech_Score"]),
            "fund": safe_float(row["Fund_Score"]),
            "research": safe_float(row["Research_Score"]),
        })

    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    with open(OUTPUT_PATH, "w") as f:
        json.dump(result, f)

    tickers = len(result)
    total_rows = len(rows)
    print(f"Generated {OUTPUT_PATH}: {tickers} tickers, {total_rows} data points")


if __name__ == "__main__":
    generate()
