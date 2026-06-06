"""
database.py  —  Cloud-ready version
------------------------------------
Uses PostgreSQL (Supabase) when DATABASE_URL env var is set.
Falls back to local SQLite for development (no env var needed).
"""

import os
import pandas as pd
from datetime import datetime
from sqlalchemy import create_engine, text

# ── Connection ────────────────────────────────────────────────────────────────
_DATABASE_URL = os.environ.get("DATABASE_URL", "").strip()

if _DATABASE_URL:
    # Cloud: Supabase PostgreSQL
    # SQLAlchemy 2.x requires the 'postgresql+psycopg2://' scheme
    if _DATABASE_URL.startswith("postgres://"):
        _DATABASE_URL = _DATABASE_URL.replace("postgres://", "postgresql://", 1)

    # Supabase direct connections (port 5432) REQUIRE SSL — without this
    # the connection is silently refused by Supabase's network layer.
    engine = create_engine(
        _DATABASE_URL,
        connect_args={"sslmode": "require"},
        pool_pre_ping=True,
        pool_size=2,
        max_overflow=0,
    )
    _BACKEND = "postgresql"
else:
    # Local dev: SQLite
    os.makedirs("data", exist_ok=True)
    engine = create_engine("sqlite:///data/screener.db", echo=False)
    _BACKEND = "sqlite"

_SCAN_TABLE    = "scans"
_HISTORY_TABLE = "scan_history"
_LOG_TABLE     = "scan_log"


def get_backend() -> str:
    """Return 'postgresql' or 'sqlite' — used by the UI to show connection status."""
    return _BACKEND


def test_connection() -> tuple[bool, str]:
    """Ping the database. Returns (ok: bool, message: str)."""
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return True, f"Connected ({_BACKEND})"
    except Exception as exc:
        return False, str(exc)


# ── Write ─────────────────────────────────────────────────────────────────────

def save_to_db(df: pd.DataFrame, scan_time: datetime | None = None) -> None:
    """Persist scan results. Raises on failure so the UI can report it."""
    if scan_time is None:
        scan_time = datetime.now()
    out = df.copy()
    out["Scan_Time"] = scan_time.isoformat(timespec="seconds")

    with engine.begin() as conn:
        if _BACKEND == "postgresql":
            conn.execute(text(f'DROP TABLE IF EXISTS "{_SCAN_TABLE}"'))
        out.to_sql(_SCAN_TABLE,    con=conn, if_exists="replace", index=False)
        out.to_sql(_HISTORY_TABLE, con=conn, if_exists="append",  index=False)


def save_scan_log(log_entries: list[dict]) -> None:
    """Persist per-ticker scan log. Raises on failure."""
    if not log_entries:
        return
    log_df = pd.DataFrame(log_entries)
    log_df["Log_Time"] = datetime.now().isoformat(timespec="seconds")

    with engine.begin() as conn:
        if _BACKEND == "postgresql":
            conn.execute(text(f'DROP TABLE IF EXISTS "{_LOG_TABLE}"'))
        log_df.to_sql(_LOG_TABLE, con=conn, if_exists="replace", index=False)


# ── Read ──────────────────────────────────────────────────────────────────────

def load_from_db() -> pd.DataFrame:
    try:
        return pd.read_sql_table(_SCAN_TABLE, con=engine)
    except Exception:
        return pd.DataFrame()


def get_last_scan_time() -> str | None:
    df = load_from_db()
    if df.empty or "Scan_Time" not in df.columns:
        return None
    return df["Scan_Time"].iloc[0]


def load_scan_log() -> pd.DataFrame:
    try:
        return pd.read_sql_table(_LOG_TABLE, con=engine)
    except Exception:
        return pd.DataFrame()