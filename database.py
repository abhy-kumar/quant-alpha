"""
database.py  —  Cloud-ready version
------------------------------------
Priority order for credentials:
  1. st.secrets["database"]  (structured — handles any password safely)
  2. os.environ DATABASE_URL (GitHub Actions / local with URL-encoded password)
  3. Local SQLite (dev only)
"""

import os
import pytz
import pandas as pd
from datetime import datetime
from sqlalchemy import create_engine, text
from sqlalchemy.engine import URL as SA_URL

IST = pytz.timezone("Asia/Kolkata")

_SCAN_TABLE    = "scans"
_HISTORY_TABLE = "scan_history"
_LOG_TABLE     = "scan_log"


def _build_engine():
    """
    Build the SQLAlchemy engine.

    Approach 1 (Streamlit Cloud): Read structured [database] block from
    st.secrets so passwords with # ! , etc. are never forced into a URL string.

    Approach 2 (GitHub Actions / local): Read DATABASE_URL env var.
    Password must be URL-encoded (# → %23) in this case.

    Approach 3 (local dev): SQLite fallback.
    """

    # ── Approach 1 : st.secrets structured block ──────────────────────────────
    try:
        import streamlit as st
        if "database" in st.secrets:
            db = st.secrets["database"]
            url = SA_URL.create(
                drivername="postgresql+psycopg2",
                username=str(db["user"]),
                password=str(db["password"]),   # raw string — SQLAlchemy encodes it
                host=str(db["host"]),
                port=int(db.get("port", 5432)),
                database=str(db.get("dbname", "postgres")),
            )
            engine = create_engine(
                url,
                connect_args={"sslmode": "require"},
                pool_pre_ping=True,
                pool_size=2,
                max_overflow=0,
            )
            return engine, "postgresql"
    except Exception:
        pass

    # ── Approach 2 : DATABASE_URL environment variable ────────────────────────
    raw_url = os.environ.get("DATABASE_URL", "").strip()
    if raw_url:
        if raw_url.startswith("postgres://"):
            raw_url = raw_url.replace("postgres://", "postgresql://", 1)
        engine = create_engine(
            raw_url,
            connect_args={"sslmode": "require"},
            pool_pre_ping=True,
            pool_size=2,
            max_overflow=0,
        )
        return engine, "postgresql"

    # ── Approach 3 : local SQLite ──────────────────────────────────────────────
    os.makedirs("data", exist_ok=True)
    engine = create_engine("sqlite:///data/screener.db", echo=False)
    return engine, "sqlite"


engine, _BACKEND = _build_engine()


# ── Public helpers ────────────────────────────────────────────────────────────

def get_backend() -> str:
    return _BACKEND


def test_connection() -> tuple[bool, str]:
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return True, f"Connected ({_BACKEND})"
    except Exception as exc:
        return False, str(exc)


# ── Write ─────────────────────────────────────────────────────────────────────

def save_to_db(df: pd.DataFrame, scan_time: datetime | None = None) -> None:
    if scan_time is None:
        scan_time = datetime.now(IST)
    out = df.copy()
    out["Scan_Time"] = scan_time.isoformat(timespec="seconds")

    with engine.begin() as conn:
        if _BACKEND == "postgresql":
            conn.execute(text(f'DROP TABLE IF EXISTS "{_SCAN_TABLE}"'))
        out.to_sql(_SCAN_TABLE,    con=conn, if_exists="replace", index=False)
        out.to_sql(_HISTORY_TABLE, con=conn, if_exists="append",  index=False)


def save_scan_log(log_entries: list[dict]) -> None:
    if not log_entries:
        return
    log_df = pd.DataFrame(log_entries)
    log_df["Log_Time"] = datetime.now(IST).isoformat(timespec="seconds")

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