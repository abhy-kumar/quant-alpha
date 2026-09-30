"""Immutable daily model snapshots for genuine forward validation."""
import json
import math
from datetime import datetime, timezone
from engine.ranking import MODEL_VERSION, WEIGHTS


def clean(value):
    if isinstance(value, dict):
        return {str(k): clean(v) for k, v in value.items()}
    if isinstance(value, (tuple, list)):
        return [clean(v) for v in value]
    if isinstance(value, float) and not math.isfinite(value):
        return None
    return value


def store_ranking_history(rows, scan_date):
    from data_pipeline.data_pipeline import _get_conn
    with _get_conn() as conn:
        conn.execute('''CREATE TABLE IF NOT EXISTS ranking_history (
            Model_Version TEXT NOT NULL, Scan_Date TEXT NOT NULL, Ticker TEXT NOT NULL,
            Recorded_At TEXT NOT NULL, Price_Date TEXT, Payload TEXT NOT NULL,
            PRIMARY KEY (Model_Version, Scan_Date, Ticker))''')
        stamp = datetime.now(timezone.utc).isoformat()
        records = [(MODEL_VERSION, scan_date, row['Ticker'], stamp, row.get('Ranking_Price_Date'),
                    json.dumps(clean({'weights': WEIGHTS, 'row': row}), allow_nan=False))
                   for row in rows if row.get('Ranking_Version') == MODEL_VERSION]
        conn.executemany('INSERT OR IGNORE INTO ranking_history VALUES (?,?,?,?,?,?)', records)
