"""
check_db.py
-----------
Database inspection utility for debugging and monitoring.
Run: python check_db.py
"""

import sqlite3
import sys
from pathlib import Path

DB_PATH = "data/market_scans.db"


def main():
    if not Path(DB_PATH).exists():
        print(f"Database not found: {DB_PATH}")
        print("Run scanner.py first to create the database.")
        sys.exit(1)

    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()

    tables = c.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
    print("Tables:", [t[0] for t in tables])
    for t in tables:
        name = t[0]
        count = c.execute(f"SELECT COUNT(*) FROM [{name}]").fetchone()[0]
        print(f"  {name}: {count} rows")

    print("\n--- outcome_tracking ---")
    r = c.execute("SELECT MIN(Scan_Date), MAX(Scan_Date), COUNT(DISTINCT Scan_Date), COUNT(DISTINCT Ticker) FROM outcome_tracking").fetchone()
    print(f"  Date range: {r[0]} to {r[1]}, {r[2]} scan dates, {r[3]} tickers")

    print("\n--- outcome_tracking return coverage ---")
    r = c.execute("SELECT COUNT(*) FROM outcome_tracking WHERE Return_5d IS NOT NULL").fetchone()
    print(f"  Rows with Return_5d: {r[0]}")
    r = c.execute("SELECT COUNT(*) FROM outcome_tracking WHERE Return_252d IS NOT NULL").fetchone()
    print(f"  Rows with Return_252d: {r[0]}")

    print("\n--- Conviction distribution ---")
    rows = c.execute(
        "SELECT Conviction_At_Scan, COUNT(*), AVG(Return_5d), AVG(Return_21d), AVG(Return_63d) "
        "FROM outcome_tracking WHERE Return_63d IS NOT NULL GROUP BY Conviction_At_Scan"
    ).fetchall()
    for row in rows:
        print(f"  {row[0]}: n={row[1]}, avg_5d={row[2]:.2f}%, avg_21d={row[3]:.2f}%, avg_63d={row[4]:.2f}%")

    print("\n--- regime_history ---")
    r = c.execute("SELECT MIN(Scan_Date), MAX(Scan_Date), COUNT(*) FROM regime_history").fetchone()
    print(f"  Date range: {r[0]} to {r[1]}, {r[2]} entries")

    print("\n--- regime_history distribution ---")
    rows = c.execute("SELECT Regime_Score, COUNT(*) FROM regime_history GROUP BY Regime_Score ORDER BY Regime_Score").fetchall()
    for row in rows:
        print(f"  Regime {row[0]}: {row[1]} days")

    print("\n--- factor_history ---")
    r = c.execute("SELECT MIN(Scan_Date), MAX(Scan_Date), COUNT(DISTINCT Scan_Date), COUNT(*) FROM factor_history").fetchone()
    print(f"  Date range: {r[0]} to {r[1]}, {r[2]} scan dates, {r[3]} total rows")

    print("\n--- factor_history columns ---")
    cols = c.execute("PRAGMA table_info(factor_history)").fetchall()
    print(f"  {len(cols)} columns: {[col[1] for col in cols]}")

    print("\n--- Regime-adjusted conviction returns ---")
    rows = c.execute("""
        SELECT ot.Conviction_At_Scan, rh.Regime_Score, COUNT(*), AVG(ot.Return_21d), AVG(ot.Return_63d)
        FROM outcome_tracking ot
        JOIN regime_history rh ON ot.Scan_Date = rh.Scan_Date
        WHERE ot.Return_63d IS NOT NULL
        GROUP BY ot.Conviction_At_Scan, rh.Regime_Score
        ORDER BY ot.Conviction_At_Scan, rh.Regime_Score
    """).fetchall()
    if rows:
        for row in rows:
            print(f"  {row[0]} (regime {row[1]}): n={row[2]}, avg_21d={row[3]:.2f}%, avg_63d={row[4]:.2f}%")
    else:
        print("  No data with completed forward returns yet")

    print("\n--- Sample factor_history row ---")
    row = c.execute("SELECT * FROM factor_history LIMIT 1").fetchone()
    col_names = [col[1] for col in cols]
    if row:
        for cn, val in zip(col_names, row):
            print(f"  {cn}: {val}")

    conn.close()


if __name__ == "__main__":
    main()
