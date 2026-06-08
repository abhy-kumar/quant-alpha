# -*- coding: utf-8 -*-
"""
app.py — Quantitative Alpha Dashboard
Alpha Research and Investment Club | FMS Delhi
"""

import base64
import os

import streamlit as st
import pandas as pd
import numpy as np
import plotly.graph_objects as go
import plotly.express as px
from plotly.subplots import make_subplots
import yfinance as yf
from datetime import datetime
import pytz

from database import load_from_db, get_last_scan_time, load_scan_log, test_connection, get_backend
from scanner import run_scanner
from nse_fetcher import market_status_text, get_bulk_live_quotes, is_market_open

IST = pytz.timezone("Asia/Kolkata")


# ── FMS Logo ──────────────────────────────────────────────────────────────────
@st.cache_data(ttl=86400)
def _logo_b64() -> str:
    """Read and base64-encode the FMS logo SVG (cached for the day)."""
    path = os.path.join(os.path.dirname(__file__), "assets", "fmsLogo.svg")
    try:
        with open(path, "rb") as f:
            return base64.b64encode(f.read()).decode()
    except Exception:
        return ""

_FMS_LOGO = _logo_b64()
_LOGO_IMG = (
    f'<img src="data:image/svg+xml;base64,{_FMS_LOGO}" '
    'style="height:28px;vertical-align:middle;margin-right:10px;" alt="FMS Delhi">'
    if _FMS_LOGO else ""
)


# ── Page config ───────────────────────────────────────────────────────────────
st.set_page_config(
    page_title="Quantitative Alpha | FMS Delhi",
    page_icon="▲",
    layout="wide",
    initial_sidebar_state="expanded",
)


# ── Theme Management ────────────────────────────────────────────────────────
if "theme" not in st.session_state:
    st.session_state.theme = "dark"

def toggle_theme():
    st.session_state.theme = "light" if st.session_state.theme == "dark" else "dark"

if st.session_state.theme == "dark":
    st.markdown('''
    <style>
        :root {
        --bg-app: #000000;
        --bg-card: #0A0A0A;
        --border-color: #1A1A1A;
        --text-main: #FFFFFF;
        --text-muted: #737373;
        --text-sub: #52525B;
        --text-hover: #D4D4D8;
        --brand-red: #C8102E;
        --brand-red-hover: #E53030;
        --btn-bg: transparent;
        --btn-border: #27272A;
        --btn-hover: #1A1A1A;
        --fms-red: #C8102E;
    }
    </style>
    ''', unsafe_allow_html=True)
else:
    st.markdown('''
    <style>
    :root {
        --bg-app: #f8fafc;
        --bg-card: #ffffff;
        --border-color: #e2e8f0;
        --text-main: #0f172a;
        --text-muted: #475569;
        --text-sub: #64748b;
        --text-hover: #0f172a;
        --brand-red: #C8102E;
        --brand-red-hover: #E53030;
        --btn-bg: transparent;
        --btn-border: #cbd5e1;
        --btn-hover: #f1f5f9;
        --fms-red: #C8102E;
    }
    </style>
    ''', unsafe_allow_html=True)

# ── Design system ─────────────────────────────────────────────────────────────

st.markdown("""
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Archivo+Black&family=Plus+Jakarta+Sans:wght@300;400;500;600&family=Space+Mono:ital,wght@0,400;0,700;1,400&display=swap" rel="stylesheet">

<style>
/* ── GLOBAL RESET ─────────────────────────────────────────────────────────── */
html, body, [class*="css"], * {
    font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif !important;
}

/* ── CHROME SUPPRESSION ────────────────────────────────────────────────────── */
#MainMenu { visibility: hidden; }
footer    { visibility: hidden; }
header[data-testid="stHeader"] { display: none !important; }
[data-testid="stDecoration"]   { display: none !important; }
[data-testid="stStatusWidget"] { display: none !important; }
[data-testid="stToolbar"]      { display: none !important; }

/* ── APP SHELL ────────────────────────────────────────────────────────────── */
.stApp {
    background-color: var(--bg-app);
}

.block-container {
    padding: 0 2.25rem 2.5rem 2.25rem !important;
    max-width: 100% !important;
}

/* ── SIDEBAR ──────────────────────────────────────────────────────────────── */
section[data-testid="stSidebar"] {
    background-color: var(--bg-card) !important;
    border-right: 1px solid var(--border-color);
    border-top: 3px solid var(--brand-red);
}
section[data-testid="stSidebar"] .block-container {
    padding: 1.75rem 1.25rem 2rem 1.25rem !important;
}
[data-testid="stSidebarCollapseButton"] { display: none; }

/* ── TYPOGRAPHY ───────────────────────────────────────────────────────────── */
h1 {
    color: var(--text-main) !important;
    font-size: 1.4rem !important;
    font-weight: 600 !important;
    letter-spacing: -0.02em !important;
    line-height: 1.2 !important;
}
h2, h3 {
    color: var(--text-main) !important;
    font-weight: 500 !important;
    letter-spacing: -0.01em !important;
}
/* Clean neutral for all body text */
body, .stApp {
    color: var(--text-muted);
}
.section-head, .scan-title, .sidebar-label, .app-wordmark {
    color: var(--text-main) !important;
}
.section-sub, .scan-sub, .sidebar-meta, .freshness-bar {
    color: var(--text-muted) !important;
}

/* ── HEADER AREA ──────────────────────────────────────────────────────────── */
.app-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1.75rem 0 1.25rem 0;
    border-bottom: 1px solid var(--border-color);
    margin-bottom: 0.75rem;
}
.app-brand {
    display: flex;
    align-items: center;
}
.app-wordmark {
    font-size: 1.6rem;
    font-family: 'Archivo Black', sans-serif;
    font-weight: 400;
    text-transform: uppercase;
    color: var(--text-main) !important;
    letter-spacing: -0.02em;
    line-height: 1;
}
.app-wordmark span {
    color: var(--brand-red) !important;
}
.app-descriptor {
    font-size: 0.75rem;
    color: var(--text-sub) !important;
    margin-top: 5px;
    font-weight: 400;
    letter-spacing: 0.02em;
}
.mkt-cluster { text-align: right; }
.mkt-badge {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.02em;
    padding: 0.3rem 0.75rem;
    border-radius: 0px; 
}
.mkt-badge.open {
    color: #10B981 !important;
    background: rgba(16, 185, 129, 0.1);
    border: 1px solid rgba(16, 185, 129, 0.2);
}
.mkt-badge.closed {
    color: #EF4444 !important;
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid rgba(239, 68, 68, 0.2);
}
.pulse-dot {
    display: inline-block;
    width: 6px; height: 6px;
    border-radius: 50%;
    background: currentColor;
}
.mkt-badge.open .pulse-dot {
    animation: blink 1.8s ease-in-out infinite;
}
@keyframes blink {
    0%, 100% { opacity: 1; }
    50%       { opacity: 0.25; }
}
.mkt-time {
    font-size: 0.7rem;
    color: var(--text-sub) !important;
    margin-top: 5px;
    font-variant-numeric: tabular-nums;
}

/* ── FRESHNESS STRIP ──────────────────────────────────────────────────────── */
.freshness-bar {
    font-size: 0.75rem;
    color: var(--text-muted) !important;
    padding: 0.3rem 0 0.9rem 0;
}
.freshness-bar b { color: var(--text-hover) !important; font-weight: 500 !important; }

/* ── SIDEBAR SECTION LABEL ────────────────────────────────────────────────── */
.sidebar-label {
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--text-hover) !important;
    margin-bottom: 0.75rem;
    padding-bottom: 0.4rem;
    border-bottom: 1px solid var(--border-color);
}
.sidebar-meta {
    font-size: 0.75rem;
    color: var(--text-muted) !important;
    line-height: 1.6;
    margin-top: 0.5rem;
}
.sidebar-meta b { color: var(--text-hover) !important; font-weight: 500 !important; }

/* ── BUTTONS ──────────────────────────────────────────────────────────────── */
.stButton > button {
    background: transparent !important;
    color: var(--text-hover) !important;
    border: 1px solid var(--btn-border) !important;
    border-radius: 0px !important;
    font-size: 0.85rem !important;
    font-weight: 500 !important;
    padding: 0.45rem 1rem !important;
    transition: all 0.15s ease;
    width: 100%;
}
.stButton > button:hover {
    background: var(--border-color) !important;
    border-color: #52525b !important;
    color: var(--text-main) !important;
}
/* Primary button → FMS crimson */
.stButton > button[kind="primary"] {
    background: var(--brand-red) !important;
    color: #FFFFFF !important;
    border-color: var(--brand-red) !important;
    font-weight: 600 !important;
}
.stButton > button[kind="primary"]:hover {
    background: var(--brand-red-hover) !important;
    box-shadow: 0 4px 6px -1px rgba(200, 16, 46, 0.2) !important;
}

/* ── TABS ─────────────────────────────────────────────────────────────────── */
.stTabs [data-baseweb="tab-list"] {
    background: transparent !important;
    border-bottom: 1px solid var(--border-color) !important;
    gap: 0 !important;
    padding: 0 !important;
}
.stTabs [data-baseweb="tab"] {
    background: transparent !important;
    color: var(--text-sub) !important;
    font-family: 'Space Mono', monospace !important;
    font-weight: 700 !important;
    font-size: 0.75rem !important;
    text-transform: uppercase !important;
    padding: 0.7rem 1.4rem !important;
    border-radius: 0 !important;
    border-bottom: 2px solid transparent !important;
    transition: color 0.15s, border-color 0.15s;
}
.stTabs [data-baseweb="tab"]:hover {
    color: var(--text-muted) !important;
    background: rgba(255,255,255,0.02) !important;
}
/* Active tab → FMS crimson indicator */
.stTabs [aria-selected="true"] {
    color: var(--text-main) !important;
    border-bottom: 2px solid var(--brand-red) !important;
    font-weight: 500 !important;
}

/* ── METRIC CARDS ─────────────────────────────────────────────────────────── */
[data-testid="metric-container"] {
    background: var(--bg-card) !important;
    border: 1px solid var(--border-color) !important;
    border-radius: 0px !important;
    padding: 0.9rem 1.1rem !important;
    transition: border-color 0.2s;
}
[data-testid="metric-container"]:hover {
    border-color: var(--btn-border) !important;
}
[data-testid="stMetricLabel"] > div {
    font-size: 0.75rem !important;
    font-weight: 500 !important;
    color: var(--text-muted) !important;
}
[data-testid="stMetricValue"] > div {
    font-size: 1.15rem !important;
    font-weight: 600 !important;
    color: var(--text-main) !important;
}

/* ── PROGRESS BAR ─────────────────────────────────────────────────────────── */
[data-testid="stProgress"] > div {
    background: var(--border-color) !important;
    border-radius: 3px !important;
    height: 4px !important;
}
[data-testid="stProgress"] > div > div {
    background: var(--brand-red) !important;
    border-radius: 3px !important;
    transition: width 0.3s ease !important;
}

/* ── SCAN PROGRESS UI ─────────────────────────────────────────────────────── */
.scan-header {
    padding: 1.5rem 0 1rem 0;
    border-bottom: 1px solid var(--border-color);
    margin-bottom: 1.5rem;
}
.scan-title {
    font-size: 1rem;
    font-weight: 500;
    color: var(--text-main) !important;
}
.scan-sub {
    font-size: 0.8rem;
    color: var(--text-muted) !important;
    margin-top: 5px;
}
.scan-status-row {
    font-size: 0.85rem;
    color: var(--text-muted) !important;
    margin-top: 0.6rem;
    font-variant-numeric: tabular-nums;
}
.scan-count  { color: var(--text-hover) !important; font-weight: 500; }
.scan-ticker { color: var(--text-hover) !important; font-weight: 500; }

/* ── DIVIDERS ─────────────────────────────────────────────────────────────── */
hr {
    border: none !important;
    border-top: 1px solid var(--border-color) !important;
    margin: 0.75rem 0 !important;
}

/* ── SUBHEADERS ───────────────────────────────────────────────────────────── */
.section-head {
    font-size: 1rem;
    font-weight: 500;
    color: var(--text-main) !important;
    margin-bottom: 0.25rem;
}
.section-sub {
    font-size: 0.8rem;
    color: var(--text-muted) !important;
    margin-bottom: 1rem;
    line-height: 1.5;
}

/* ── ALERTS ───────────────────────────────────────────────────────────────── */
[data-testid="stAlert"] {
    background: var(--bg-card) !important;
    border-radius: 0px !important;
    border-left: 3px solid var(--brand-red) !important;
    color: var(--text-hover) !important;
    font-size: 0.85rem !important;
}

/* ── EXPANDER ─────────────────────────────────────────────────────────────── */
[data-testid="stExpander"] {
    background: var(--bg-card) !important;
    border: 1px solid var(--border-color) !important;
    border-radius: 0px !important;
}

/* ── SELECT / RADIO / CHECKBOX ────────────────────────────────────────────── */
[data-testid="stSelectbox"] label,
[data-testid="stSlider"]    label,
[data-testid="stRadio"]     label,
[data-testid="stCheckbox"]  label {
    font-size: 0.8rem !important;
    font-weight: 500 !important;
    color: var(--text-muted) !important;
}

/* ── CAPTION ──────────────────────────────────────────────────────────────── */
[data-testid="stCaptionContainer"] {
    color: var(--text-sub) !important;
    font-size: 0.75rem !important;
}

/* ── DATAFRAME ────────────────────────────────────────────────────────────── */
[data-testid="stDataFrame"] iframe {
    border-radius: 0px;
}

/* ── PLOTLY CHART ─────────────────────────────────────────────────────────── */
[data-testid="stPlotlyChart"] {
    border: 1px solid var(--border-color);
    border-radius: 0px;
    overflow: hidden;
}

/* ── CONVICTION BADGE ─────────────────────────────────────────────────────── */
.conv-strong-buy { color: #10B981 !important; font-weight: 600 !important; }
.conv-buy        { color: #34D399 !important; font-weight: 500 !important; }
.conv-hold       { color: #FBBF24 !important; font-weight: 500 !important; }
.conv-caution    { color: #F97316 !important; font-weight: 500 !important; }
.conv-avoid      { color: #EF4444 !important; font-weight: 600 !important; }
</style>
""", unsafe_allow_html=True)


# ── Scheduler (once per process) ─────────────────────────────────────────────
@st.cache_resource
def _boot_scheduler():
    try:
        from scheduler import start_scheduler
        return start_scheduler()
    except Exception:
        return None

_boot_scheduler()


# ── Helpers ───────────────────────────────────────────────────────────────────
@st.cache_data(ttl=300, show_spinner=False)
def fetch_chart_data(ticker: str, period: str):
    """Cached yfinance data fetching for the Charting tab to prevent slow reloads."""
    period_map = {"3M": "3mo", "6M": "6mo", "1Y": "1y", "2Y": "2y"}
    df_price = yf.download(
        ticker, period=period_map[period],
        interval="1d", auto_adjust=True, progress=False,
    )
    if isinstance(df_price.columns, pd.MultiIndex):
        df_price.columns = df_price.columns.get_level_values(0)
    return df_price

def _age(iso_ts: str) -> str:
    try:
        dt = datetime.fromisoformat(iso_ts)
        if dt.tzinfo is None:
            dt = pytz.utc.localize(dt)
        dt = dt.astimezone(IST)
        secs = int((datetime.now(IST) - dt).total_seconds())
        if secs < 0:    secs = 0
        if secs < 60:   return f"{secs}s ago"
        if secs < 3600: return f"{secs // 60}m ago"
        h, m = divmod(secs // 60, 60)
        return f"{h}h {m}m ago"
    except Exception:
        return "unknown"


def _style_cell(val):
    """CSS for signal values, conviction ratings, and Bullish/Bearish strings."""
    theme = st.session_state.get("theme", "dark")
    is_dark = (theme == "dark")
    
    c_bullish    = "#4ADE80" if is_dark else "#047857"
    c_bearish    = "#F87171" if is_dark else "#B91C1C"
    c_strong_buy = "#4ADE80" if is_dark else "#047857"
    c_buy        = "#86EFAC" if is_dark else "#10B981"
    c_hold       = "#FCD34D" if is_dark else "#B45309"
    c_caution    = "#FB923C" if is_dark else "#C2410C"
    c_avoid      = "#F87171" if is_dark else "#B91C1C"
    c_neutral    = "#3B5278" if is_dark else "#475569"
    c_nan        = "#1E3A5F" if is_dark else "#94A3B8"
    
    if isinstance(val, str):
        v = val.strip()
        vl = v.lower()
        if vl == "bullish":     return f"color:{c_bullish}; font-weight:500"
        if vl == "bearish":     return f"color:{c_bearish}; font-weight:500"
        if v == "Strong Buy":   return f"color:{c_strong_buy}; font-weight:700"
        if v == "Buy":          return f"color:{c_buy}; font-weight:600"
        if v == "Hold":         return f"color:{c_hold}; font-weight:500"
        if v == "Caution":      return f"color:{c_caution}; font-weight:500"
        if v == "Avoid":        return f"color:{c_avoid}; font-weight:600"
    try:
        n = float(val)
        if np.isnan(n):  return f"color:{c_nan}"
        if n > 0:        return f"color:{c_bullish}"
        if n < 0:        return f"color:{c_bearish}"
    except Exception:
        pass
    return f"color:{c_neutral}"


# ── Header & Layout Setup ──────────────────────────────────────────────────
mkt = market_status_text()
dot_class = "open" if mkt["is_open"] else "closed"

hcol1, hcol2, hcol3 = st.columns([1.5, 1, 1], vertical_alignment="center")

with hcol1:
    st.markdown(f'''
    <div style="display:flex; align-items:center; height:100%;">
        <div>
            <div class="app-wordmark">Quantitative <span>Alpha</span></div>
            <div class="app-descriptor">Alpha Research and Investment Club &nbsp;|&nbsp; FMS Delhi</div>
        </div>
    </div>
    ''', unsafe_allow_html=True)

with hcol2:
    st.markdown(f'''
    <div class="mkt-cluster" style="height:100%; display:flex; flex-direction:column; justify-content:center; align-items:center;">
        <div class="mkt-badge {dot_class}">
            <span class="pulse-dot"></span> NSE {mkt['status']}
        </div>
        <div class="mkt-time">{mkt['time_ist']}</div>
    </div>
    ''', unsafe_allow_html=True)

with hcol3:
    live_refresh_btn = False
    if is_market_open():
        bcol1, bcol2, bcol3 = st.columns(3, vertical_alignment="center")
        with bcol1:
            if st.button(f"Theme: {st.session_state.theme.title()}", use_container_width=True):
                toggle_theme()
                st.rerun()
        with bcol2:
            scan_btn = st.button("Run Scan", type="primary", use_container_width=True)
        with bcol3:
            live_refresh_btn = st.button("Refresh Live Prices", use_container_width=True)
    else:
        bcol1, bcol2 = st.columns(2, vertical_alignment="center")
        with bcol1:
            if st.button(f"Theme: {st.session_state.theme.title()}", use_container_width=True):
                toggle_theme()
                st.rerun()
        with bcol2:
            scan_btn = st.button("Run Scan", type="primary", use_container_width=True)

st.markdown("<div style='border-bottom: 1px solid var(--border-color); margin-top:0.5rem; margin-bottom:1.5rem;'></div>", unsafe_allow_html=True)

# ── Scan execution ────────────────────────────────────────────────────────────
if scan_btn:
    st.markdown("""
    <div class="scan-header">
        <div class="scan-title">Market Scan in Progress</div>
        <div class="scan-sub">
            Fetching price data and computing technical indicators for each security.
            This typically takes 3–6 minutes.
        </div>
    </div>
    """, unsafe_allow_html=True)

    prog_bar  = st.progress(0.0)
    prog_text = st.empty()

    def _on_progress(idx: int, total: int, ticker: str) -> None:
        pct = (idx + 1) / total
        prog_bar.progress(min(pct, 1.0))
        sym = ticker.replace(".NS", "").replace(".BO", "")
        prog_text.markdown(
            f'<div class="scan-status-row">'
            f'<span class="scan-count">{idx + 1} / {total}</span>'
            f' &nbsp;&middot;&nbsp; '
            f'<span class="scan-ticker">{sym}</span>'
            f'</div>',
            unsafe_allow_html=True,
        )

    try:
        run_scanner(progress_callback=_on_progress)
    except Exception as _scan_err:
        st.error(f"Scan error: {_scan_err}")
        st.stop()
    st.rerun()


# ── Live price refresh ────────────────────────────────────────────────────────
if live_refresh_btn:
    df_cur = load_from_db()
    if not df_cur.empty:
        with st.spinner("Fetching delayed quotes from NSE…"):
            live_df = get_bulk_live_quotes(df_cur["Ticker"].tolist(), max_symbols=40)
        if not live_df.empty and "last_price" in live_df.columns:
            st.session_state["live_quotes"] = live_df


# ── Load data ─────────────────────────────────────────────────────────────────
df = load_from_db()

required_cols = ["Ticker", "Price", "Conviction", "Tech_Score"]
if df.empty or not all(col in df.columns for col in required_cols):
    st.markdown("""
    <div style="padding:3rem 0; text-align:center; color:#1E3A5F;">
        <div style="font-size:0.9rem; font-weight:600; color:#3B5278; margin-bottom:0.5rem;">
            No valid data available
        </div>
        <div style="font-size:0.78rem; color:#1E3A5F;">
            The database is empty or outdated. Please run a market scan to populate the database with technical and fundamental scores.
        </div>
    </div>
    """, unsafe_allow_html=True)
    st.stop()

# Overlay live prices if refreshed this session
if "live_quotes" in st.session_state:
    lp_map = (
        st.session_state["live_quotes"]
        .dropna(subset=["last_price"])
        .set_index("symbol")["last_price"]
        .to_dict()
    )
    df["Price"] = df.apply(
        lambda r: lp_map.get(r["Ticker"].replace(".NS", ""), r["Price"]), axis=1
    )


# ── Tabs ──────────────────────────────────────────────────────────────────────
tab1, tab2, tab3, tab4, tab5 = st.tabs([
    "Top Signals",
    "Screener",
    "Charting",
    "Sector Heatmap",
    "System Logs",
])


# ════════════════════════════════════════════════════════════════════════════
# TAB 1 — Top Signals
# ════════════════════════════════════════════════════════════════════════════
with tab1:
    st.markdown("""
    <div style="padding:1rem 0 0.25rem 0;">
        <div class="section-head">Top Signals</div>
        <div class="section-sub">
            Top securities ranked by our Conviction rating, combining technical momentum and fundamental quality.
        </div>
    </div>
    """, unsafe_allow_html=True)

    conv_map = {"Strong Buy": 5, "Buy": 4, "Hold": 3, "Caution": 2, "Avoid": 1}
    df["_Rank"] = df["Conviction"].map(conv_map).fillna(0)
    top_bulls = (
        df[(df["Tech_Score"] > 0) & (df["Fund_Score"] >= 5)]
        .sort_values(["_Rank", "Tech_Score"], ascending=[False, False])
        .head(15)
    )
    if top_bulls.empty:
        top_bulls = (
            df[df["Tech_Score"] > 0]
            .sort_values(["_Rank", "Tech_Score"], ascending=[False, False])
            .head(15)
        )

    if not top_bulls.empty:
        hero = top_bulls.iloc[0]
        sym = hero["Ticker"].replace(".NS", "")
        price = hero.get("Price", "—")
        chg = hero.get("1d_Chg_%", 0.0)
        chg_color = "#10B981" if chg > 0 else "#EF4444"
        chg_sign = "+" if chg > 0 else ""
        
        price_val = f"₹{price:.2f}" if isinstance(price, (int, float)) else f"₹{price}"
        st.markdown(f"""
        <div style="background:var(--bg-card); border:1px solid var(--border-color); border-radius:12px; padding:1.5rem; margin-bottom:1.5rem;">
            <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                <div>
                    <div style="font-size:0.75rem; color:var(--text-muted); font-weight:600; text-transform:uppercase; letter-spacing:0.02em;">Top Pick</div>
                    <div style="font-size:1.8rem; font-weight:700; color:var(--text-main); margin-top:0.25rem;">{sym}</div>
                    <div style="font-size:1.2rem; font-weight:600; color:var(--text-hover); margin-top:0.1rem;">{price_val} <span style="font-size:1rem; color:{chg_color}; font-weight:500; margin-left:0.5rem;">{chg_sign}{chg}%</span></div>
                </div>
                <div style="text-align:right;">
                    <div style="font-size:0.75rem; color:var(--text-sub);">Conviction</div>
                    <div style="font-size:1.1rem; font-weight:600; color:var(--text-hover); margin-top:0.1rem;">{hero.get("Conviction", "—")}</div>
                    <div style="font-size:0.8rem; color:var(--text-muted); margin-top:0.5rem;">Tech: <span style="color:var(--text-main)">{hero.get("Tech_Score", "—")}</span> &nbsp;&nbsp; Fund: <span style="color:var(--text-main)">{hero.get("Fund_Score", "—")}</span></div>
                </div>
            </div>
        </div>
        """, unsafe_allow_html=True)
        
        view_opt = st.radio("Data View", ["Technical View", "Fundamental View"], horizontal=True, label_visibility="collapsed")
        
        if view_opt == "Technical View":
            display_cols = [c for c in ["Ticker", "Sector", "Price", "1d_Chg_%", "Conviction", "Tech_Score", "ST_Signal", "RSI_Value", "ADX_Value", "MACD_Value"] if c in top_bulls.columns]
        else:
            display_cols = [c for c in ["Ticker", "Sector", "Price", "Conviction", "Fund_Score", "P/E", "Forward_P/E", "ROE_%", "Debt_to_Equity", "Market_Cap_B"] if c in top_bulls.columns]

        colour_cols = [c for c in ["1d_Chg_%", "Tech_Score", "ST_Signal", "Conviction"] if c in display_cols]

        format_dict = {
            "Price": "₹{:.2f}",
            "1d_Chg_%": "{:+.2f}%",
            "Tech_Score": "{:+.3f}",
            "RSI_Value": "{:.1f}",
            "ADX_Value": "{:.1f}",
            "MACD_Value": "{:.4f}",
            "P/E": "{:.2f}",
            "Forward_P/E": "{:.2f}",
            "ROE_%": "{:.2f}%",
            "Debt_to_Equity": "{:.2f}",
            "Market_Cap_B": "₹{:.2f}B",
            "Sharpe": "{:.2f}",
        }
        fmt_cols = {c: format_dict[c] for c in display_cols if c in format_dict}
        st.dataframe(
            top_bulls[display_cols].style.format(fmt_cols, na_rep="—").map(_style_cell, subset=colour_cols),
            width="stretch",
            hide_index=True,
            height=400,
        )


# ════════════════════════════════════════════════════════════════════════════
# TAB 2 — Screener
# ════════════════════════════════════════════════════════════════════════════
with tab2:
    st.markdown("""
    <div style="padding:1rem 0 0.5rem 0;">
        <div class="section-head">Full Universe Screener</div>
    </div>
    """, unsafe_allow_html=True)

    fc1, fc2, fc3, fc4, fc5 = st.columns(5)
    with fc1:
        min_score = st.slider("Min Tech Score", -1.0, 1.0, -1.0, 0.05)
    with fc2:
        max_rsi = st.slider("Max RSI", 0, 100, 100)
    with fc3:
        min_adx = st.slider("Min ADX", 0, 60, 0)
    with fc4:
        st_filter = st.selectbox("Supertrend", ["All", "Bullish", "Bearish"])
    with fc5:
        conviction_opts = ["All", "Strong Buy", "Buy", "Hold", "Caution", "Avoid"]
        conv_filter = st.selectbox("Conviction", conviction_opts)

    filtered = df[df["Tech_Score"] >= min_score].copy()
    if "RSI_Value" in filtered.columns:
        filtered = filtered[filtered["RSI_Value"] <= max_rsi]
    if "ADX_Value" in filtered.columns:
        filtered = filtered[filtered["ADX_Value"] >= min_adx]
    if st_filter != "All" and "ST_Signal" in filtered.columns:
        filtered = filtered[filtered["ST_Signal"] == st_filter]
    if conv_filter != "All" and "Conviction" in filtered.columns:
        filtered = filtered[filtered["Conviction"] == conv_filter]

    sig_cols   = [c for c in filtered.columns if c.startswith("Sig_")]
    colour_all = [c for c in sig_cols + ["Tech_Score", "ST_Signal", "Conviction", "1d_Chg_%"]
                  if c in filtered.columns]

    format_dict = {
        "Price": "₹{:.2f}",
        "1d_Chg_%": "{:+.2f}%",
        "Tech_Score": "{:+.3f}",
        "RSI_Value": "{:.1f}",
        "ADX_Value": "{:.1f}",
        "MACD_Value": "{:.4f}",
        "P/E": "{:.2f}",
        "Forward_P/E": "{:.2f}",
        "ROE_%": "{:.2f}%",
        "Debt_to_Equity": "{:.2f}",
        "Market_Cap_B": "₹{:.2f}B",
        "Sharpe": "{:.2f}",
    }
    fmt_cols = {c: format_dict[c] for c in filtered.columns if c in format_dict}
    st.dataframe(
        filtered.style.format(fmt_cols, na_rep="—").map(_style_cell, subset=colour_all),
        width="stretch",
        height=580,
    )
    st.caption(f"{len(filtered)} of {len(df)} securities match the current filter")


# ════════════════════════════════════════════════════════════════════════════
# TAB 3 — Charting + Peer Comparison
# ════════════════════════════════════════════════════════════════════════════
with tab3:
    ctrl_col, chart_col = st.columns([1, 4])

    with ctrl_col:
        st.markdown("<div style='height:1rem'></div>", unsafe_allow_html=True)
        selected = st.selectbox("Security", df["Ticker"].tolist(), key="chart_sel")
        st.markdown("<hr>", unsafe_allow_html=True)
        asset = df[df["Ticker"] == selected].iloc[0]

        def _get(key: str, decimals: int = 2):
            val = asset.get(key)
            try:
                return round(float(val), decimals) if pd.notna(val) else "—"
            except (TypeError, ValueError):
                return str(val) if val is not None else "—"

        st.markdown(f"""
        <div style="background:var(--bg-card); border:1px solid var(--border-color); border-radius:12px; padding:1.2rem; margin-bottom:1rem;">
            <div style="font-size:0.8rem; font-weight:600; color:var(--text-hover); margin-bottom:0.8rem;">Technical Snapshot</div>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.8rem;">
                <div><div style="font-size:0.7rem; color:var(--text-sub);">Tech Score</div><div style="font-size:1rem; font-weight:600; color:var(--text-main);">{_get("Tech_Score", 3)}</div></div>
                <div><div style="font-size:0.7rem; color:var(--text-sub);">Conviction</div><div style="font-size:1rem; font-weight:600; color:var(--text-main);">{asset.get("Conviction", "—")}</div></div>
                <div><div style="font-size:0.7rem; color:var(--text-sub);">RSI (14)</div><div style="font-size:0.95rem; font-weight:500; color:var(--text-hover);">{_get("RSI_Value", 1)}</div></div>
                <div><div style="font-size:0.7rem; color:var(--text-sub);">ADX (14)</div><div style="font-size:0.95rem; font-weight:500; color:var(--text-hover);">{_get("ADX_Value", 1)}</div></div>
                <div><div style="font-size:0.7rem; color:var(--text-sub);">Supertrend</div><div style="font-size:0.95rem; font-weight:500; color:var(--text-hover);">{asset.get("ST_Signal", "—")}</div></div>
                <div><div style="font-size:0.7rem; color:var(--text-sub);">MACD</div><div style="font-size:0.95rem; font-weight:500; color:var(--text-hover);">{_get("MACD_Value", 4)}</div></div>
            </div>
        </div>
        <div style="background:var(--bg-card); border:1px solid var(--border-color); border-radius:12px; padding:1.2rem;">
            <div style="font-size:0.8rem; font-weight:600; color:var(--text-hover); margin-bottom:0.8rem;">Fundamentals</div>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.8rem;">
                <div><div style="font-size:0.7rem; color:var(--text-sub);">Fund Score</div><div style="font-size:1rem; font-weight:600; color:var(--text-main);">{_get("Fund_Score", 0)}</div></div>
                <div><div style="font-size:0.7rem; color:var(--text-sub);">Forward P/E</div><div style="font-size:0.95rem; font-weight:500; color:var(--text-hover);">{_get("Forward_P/E", 2)}</div></div>
                <div><div style="font-size:0.7rem; color:var(--text-sub);">ROE %</div><div style="font-size:0.95rem; font-weight:500; color:var(--text-hover);">{_get("ROE_%", 2)}</div></div>
                <div><div style="font-size:0.7rem; color:var(--text-sub);">52W High</div><div style="font-size:0.95rem; font-weight:500; color:var(--text-hover);">{_get("52W_High", 2)}</div></div>
            </div>
        </div>
        """, unsafe_allow_html=True)

    with chart_col:
        st.markdown("<div style='height:0.5rem'></div>", unsafe_allow_html=True)
        p1, p2 = st.columns([3, 1])
        with p1:
            period_opt = st.radio(
                "Period", ["3M", "6M", "1Y", "2Y"],
                horizontal=True, index=2, key="chart_period"
            )
        with p2:
            show_smas = st.checkbox("SMAs", value=True, key="show_smas")

        price_df = fetch_chart_data(selected, period_opt)
        if isinstance(price_df.columns, pd.MultiIndex):
            price_df.columns = price_df.columns.get_level_values(0)

        if price_df.empty:
            st.caption(f"Price data unavailable for {selected}.")
        else:
            cl    = price_df["Close"]
            delta = cl.diff()
            gain  = delta.clip(lower=0).rolling(14).mean()
            loss  = (-delta.clip(upper=0)).rolling(14).mean()
            rsi_s = 100 - (100 / (1 + gain / loss.replace(0, np.nan)))

            up_colour   = "#22C55E"
            down_colour = "#EF4444"
            bar_colours = [
                up_colour if r["Close"] >= r["Open"] else down_colour
                for _, r in price_df.iterrows()
            ]

            fig = make_subplots(
                rows=3, cols=1,
                shared_xaxes=True,
                vertical_spacing=0.02,
                row_heights=[0.60, 0.18, 0.22],
                subplot_titles=["", "", "RSI (14)"],
            )

            fig.add_trace(go.Candlestick(
                x=price_df.index,
                open=price_df["Open"], high=price_df["High"],
                low=price_df["Low"],   close=price_df["Close"],
                name=selected.replace(".NS", ""),
                increasing_line_color=up_colour,
                decreasing_line_color=down_colour,
                increasing_fillcolor=up_colour,
                decreasing_fillcolor=down_colour,
            ), row=1, col=1)

            if show_smas:
                for w, col, dash in [
                    (20,  "#F59E0B", "solid"),
                    (50,  "#C9A84C", "solid"),
                    (200, "#C084FC", "dot"),
                ]:
                    sma = cl.rolling(w).mean()
                    fig.add_trace(go.Scatter(
                        x=price_df.index, y=sma,
                        name=f"SMA {w}",
                        line=dict(color=col, width=1.2, dash=dash),
                        opacity=0.8,
                    ), row=1, col=1)

            fig.add_trace(go.Bar(
                x=price_df.index, y=price_df["Volume"],
                marker_color=bar_colours, name="Volume", showlegend=False,
            ), row=2, col=1)

            fig.add_trace(go.Scatter(
                x=price_df.index, y=rsi_s,
                name="RSI", line=dict(color="#A78BFA", width=1.5),
            ), row=3, col=1)
            fig.add_hline(y=70, line_dash="dot", line_color="#EF4444",
                          row=3, col=1, opacity=0.5)
            fig.add_hline(y=30, line_dash="dot", line_color="#22C55E",
                          row=3, col=1, opacity=0.5)
            fig.add_hrect(y0=30, y1=70, fillcolor="#a1a1aa",
                          opacity=0.03, row=3, col=1, line_width=0)

            is_dark = (st.session_state.get("theme", "dark") == "dark")
            bg = "#09090b" if is_dark else "#ffffff"
            grid = "#27272a" if is_dark else "#e2e8f0"
            text_color = "#a1a1aa" if is_dark else "#475569"
            sub_text_color = "#71717a" if is_dark else "#64748b"
            hover_bg = "#18181b" if is_dark else "#ffffff"
            hover_text = "#fafafa" if is_dark else "#0f172a"
            hover_border = "#27272a" if is_dark else "#e2e8f0"

            fig.update_layout(
                height=720,
                margin=dict(l=0, r=0, t=20, b=0),
                xaxis_rangeslider_visible=False,
                paper_bgcolor=bg,
                plot_bgcolor=bg,
                font=dict(color=text_color, size=11, family="Plus Jakarta Sans"),
                legend=dict(
                    orientation="h", yanchor="bottom",
                    y=1.01, xanchor="right", x=1,
                    bgcolor="rgba(0,0,0,0)", font=dict(size=10),
                ),
                hoverlabel=dict(
                    bgcolor=hover_bg, font_color=hover_text,
                    bordercolor=hover_border,
                ),
            )
            for row_n in [1, 2, 3]:
                fig.update_xaxes(
                    gridcolor=grid, zeroline=False, showgrid=True,
                    tickfont=dict(color=sub_text_color, size=10),
                    row=row_n, col=1,
                )
                fig.update_yaxes(
                    gridcolor=grid, zeroline=False, showgrid=True,
                    tickfont=dict(color=sub_text_color, size=10),
                    row=row_n, col=1,
                )
            for ann in fig.layout.annotations:
                ann.font.color = sub_text_color
                ann.font.size  = 10

            st.plotly_chart(fig, width="stretch")

    # ── Peer Comparison ───────────────────────────────────────────────────────
    st.markdown("<div style='height:1.5rem'></div>", unsafe_allow_html=True)
    st.markdown(
        '<div style="border-top:1px solid var(--border-color); padding-top:1.25rem;">'
        '<div class="section-head">Sector Peer Comparison</div>'
        '<div class="section-sub">Top peers by market cap in the same NSE sector.</div>'
        '</div>',
        unsafe_allow_html=True,
    )

    peer_sector = "Unknown"
    if "Sector" in df.columns:
        val = asset.get("Sector")
        if pd.notna(val) and str(val).strip() != "":
            peer_sector = str(val).strip()

    if peer_sector != "Unknown" and "Sector" in df.columns:
        peers = (
            df[df["Sector"] == peer_sector]
            .sort_values("Market_Cap_B", ascending=False)
            .head(8)
        )

        if len(peers) > 1:
            peer_cols = [c for c in [
                "Ticker", "Price", "1d_Chg_%", "Conviction",
                "Tech_Score", "Fund_Score", "P/E", "ROE_%",
                "Market_Cap_B", "Sharpe", "ST_Signal",
            ] if c in peers.columns]

            peer_colour = [c for c in ["1d_Chg_%", "Tech_Score", "ST_Signal", "Conviction"]
                           if c in peer_cols]

            format_dict = {
                "Price": "₹{:.2f}",
                "1d_Chg_%": "{:+.2f}%",
                "Tech_Score": "{:+.3f}",
                "RSI_Value": "{:.1f}",
                "ADX_Value": "{:.1f}",
                "MACD_Value": "{:.4f}",
                "P/E": "{:.2f}",
                "Forward_P/E": "{:.2f}",
                "ROE_%": "{:.2f}%",
                "Debt_to_Equity": "{:.2f}",
                "Market_Cap_B": "₹{:.2f}B",
                "Sharpe": "{:.2f}",
            }
            fmt_cols = {c: format_dict[c] for c in peer_cols if c in format_dict}
            st.dataframe(
                peers[peer_cols].style.format(fmt_cols, na_rep="—").map(_style_cell, subset=peer_colour),
                width="stretch",
                hide_index=True,
                height=min(80 + len(peers) * 35, 320),
            )

            # ── Radar-style bar comparison: Tech Score vs Fund Score ──────────
            if len(peers) >= 2:
                bar_tickers = [t.replace(".NS", "") for t in peers["Ticker"].tolist()]
                tech_vals   = peers["Tech_Score"].tolist()   if "Tech_Score" in peers.columns else []
                fund_vals   = peers["Fund_Score"].tolist()   if "Fund_Score"  in peers.columns else []

                if tech_vals and fund_vals:
                    # Highlight selected stock
                    sel_sym = selected.replace(".NS", "")
                    marker_colors_tech = [
                        "#C8102E" if t == sel_sym else "#3B82F6" for t in bar_tickers
                    ]
                    marker_colors_fund = [
                        "#C8102E" if t == sel_sym else "#7C3AED" for t in bar_tickers
                    ]

                    bar_fig = go.Figure()
                    bar_fig.add_trace(go.Bar(
                        name="Tech Score",
                        x=bar_tickers,
                        y=tech_vals,
                        marker_color=marker_colors_tech,
                        opacity=0.9,
                    ))
                    bar_fig.add_trace(go.Bar(
                        name="Fund Score (÷10)",
                        x=bar_tickers,
                        y=[v / 10 for v in fund_vals],
                        marker_color=marker_colors_fund,
                        opacity=0.75,
                    ))

                    is_dark = (st.session_state.get("theme", "dark") == "dark")
                    bg = "#09090b" if is_dark else "#ffffff"
                    grid = "#27272a" if is_dark else "#e2e8f0"
                    text_color = "#a1a1aa" if is_dark else "#475569"
                    sub_text_color = "#71717a" if is_dark else "#64748b"
                    hover_bg = "#18181b" if is_dark else "#ffffff"
                    hover_text = "#fafafa" if is_dark else "#0f172a"
                    hover_border = "#27272a" if is_dark else "#e2e8f0"

                    bar_fig.update_layout(
                        barmode="group",
                        height=280,
                        margin=dict(l=0, r=0, t=10, b=0),
                        paper_bgcolor=bg,
                        plot_bgcolor=bg,
                        font=dict(color=text_color, size=11, family="Plus Jakarta Sans"),
                        legend=dict(
                            orientation="h", yanchor="bottom",
                            y=1.02, xanchor="right", x=1,
                            bgcolor="rgba(0,0,0,0)", font=dict(size=10),
                        ),
                        hoverlabel=dict(
                            bgcolor=hover_bg, font_color=hover_text,
                            bordercolor=hover_border,
                        ),
                        xaxis=dict(gridcolor=grid, zeroline=False,
                                   tickfont=dict(color=sub_text_color, size=10)),
                        yaxis=dict(gridcolor=grid, zeroline=False,
                                   tickfont=dict(color=sub_text_color, size=10)),
                    )
                    st.plotly_chart(bar_fig, width="stretch")
                    st.caption(
                        f"Red bars = {sel_sym} (selected) | "
                        f"Fund Score shown as fraction of 10 for scale alignment | "
                        f"Sector: {peer_sector}"
                    )
        else:
            st.markdown(
                '<div style="color:#a1a1aa; font-size:0.8rem; padding:0.5rem 0;">'
                f'No other stocks in sector "{peer_sector}" in the current universe.</div>',
                unsafe_allow_html=True,
            )
    else:
        st.markdown(
            '<div style="color:#a1a1aa; font-size:0.8rem; padding:0.5rem 0;">'
            'Sector data is not available for this stock, or a fresh scan is required.</div>',
            unsafe_allow_html=True,
        )


# ════════════════════════════════════════════════════════════════════════════
# TAB 4 — Sector Heatmap
# ════════════════════════════════════════════════════════════════════════════
with tab4:
    st.markdown("""
    <div style="padding:1rem 0 0.5rem 0;">
        <div class="section-head">Sector Heatmap</div>
        <div class="section-sub">
            Each cell represents a security sized and coloured by your selected metrics. 
            Click any cell to drill into that sector's peers via the Charting tab.
        </div>
    </div>
    """, unsafe_allow_html=True)

    hm_col1, hm_col2 = st.columns([3, 1])
    with hm_col2:
        hm_colour_by = st.selectbox(
            "Colour by",
            ["Tech_Score", "Fund_Score", "1d_Chg_%", "Sharpe"],
            key="hm_colour",
        )
        hm_size_by = st.selectbox(
            "Size by",
            ["Market_Cap_B", "Volume", "ATR_Value"],
            key="hm_size",
        )

    hm_df = df.copy()

    # Fill missing sectors
    if "Sector" not in hm_df.columns:
        hm_df["Sector"] = "Unknown"
    hm_df["Sector"] = hm_df["Sector"].fillna("Unknown").replace("", "Unknown")

    # Ensure size column is positive and non-null
    if hm_size_by in hm_df.columns:
        hm_df[hm_size_by] = pd.to_numeric(hm_df[hm_size_by], errors="coerce").fillna(1).clip(lower=0.01)
    else:
        hm_df["_size"] = 1
        hm_size_by = "_size"

    if hm_colour_by in hm_df.columns:
        hm_df[hm_colour_by] = pd.to_numeric(hm_df[hm_colour_by], errors="coerce")

    hm_df["Ticker_Short"] = hm_df["Ticker"].str.replace(".NS", "", regex=False)

    # Build hover_data only for columns that exist (avoids Plotly KeyError on old data)
    _hm_hover: dict = {}
    if "Price"      in hm_df.columns: _hm_hover["Price"]      = ":.2f"
    if "1d_Chg_%"   in hm_df.columns: _hm_hover["1d_Chg_%"]   = ":.2f"
    if "Conviction" in hm_df.columns: _hm_hover["Conviction"] = True
    _hm_custom = ["Conviction"] if "Conviction" in hm_df.columns else []

    try:
        hm_fig = px.treemap(
            hm_df,
            path=["Sector", "Ticker_Short"],
            values=hm_size_by,
            color=hm_colour_by,
            color_continuous_scale=[
                [0.0, "#7F1D1D" if st.session_state.get("theme", "dark") == "dark" else "#FCA5A5"],
                [0.5, "#18181b" if st.session_state.get("theme", "dark") == "dark" else "#F1F5F9"],
                [1.0, "#14532D" if st.session_state.get("theme", "dark") == "dark" else "#86EFAC"],
            ],
            color_continuous_midpoint=0 if hm_colour_by in ["Tech_Score", "1d_Chg_%"] else None,
            hover_data=_hm_hover if _hm_hover else None,
            custom_data=_hm_custom,
        )

        is_dark = (st.session_state.get("theme", "dark") == "dark")
        hm_bg = "#09090b" if is_dark else "#ffffff"
        hm_text = "#a1a1aa" if is_dark else "#475569"
        hm_sub = "#71717a" if is_dark else "#64748b"
        hm_cb_bg = "#18181b" if is_dark else "#ffffff"
        hm_cb_border = "#27272a" if is_dark else "#e2e8f0"
        hm_item_text = "#EDE8E0" if is_dark else "#0f172a"

        hm_fig.update_traces(
            textfont=dict(family="Plus Jakarta Sans", size=11, color=hm_item_text),
            hovertemplate=(
                "<b>%{label}</b><br>"
                + f"{hm_colour_by}: %{{color:.3f}}<br>"
                + ("%{customdata[0]}<extra></extra>" if _hm_custom
                   else "<extra></extra>")
            ),
        )

        hm_fig.update_layout(
            height=620,
            margin=dict(l=0, r=0, t=10, b=0),
            paper_bgcolor=hm_bg,
            font=dict(color=hm_text, size=11, family="Plus Jakarta Sans"),
            coloraxis_colorbar=dict(
                title=dict(text=hm_colour_by, font=dict(color=hm_sub, size=10)),
                tickfont=dict(color=hm_sub, size=9),
                bgcolor=hm_cb_bg,
                bordercolor=hm_cb_border,
                borderwidth=1,
                len=0.6,
            ),
        )

        with hm_col1:
            st.plotly_chart(hm_fig, width="stretch")

    except Exception as _hm_err:
        with hm_col1:
            st.error(f"Heatmap rendering error: {_hm_err}")

    # ── Sector Summary Table ───────────────────────────────────────────────
    if "Sector" in df.columns and "Tech_Score" in df.columns:
        sector_summary = (
            df.groupby("Sector")
            .agg(
                Stocks=("Ticker", "count"),
                Avg_Tech=(  "Tech_Score",  "mean"),
                Avg_Fund=(  "Fund_Score",  "mean") if "Fund_Score" in df.columns else ("Tech_Score", "count"),
                Bullish=(   "ST_Signal",   lambda x: (x == "Bullish").sum()) if "ST_Signal" in df.columns else ("Ticker", "count"),
                Avg_PE=(    "P/E",         "mean") if "P/E" in df.columns else ("Ticker", "count"),
                Total_MCap=("Market_Cap_B","sum")  if "Market_Cap_B" in df.columns else ("Ticker", "count"),
            )
            .round(2)
            .sort_values("Avg_Tech", ascending=False)
            .reset_index()
        )

        st.markdown(
            '<div style="margin-top:1.5rem; padding-top:1rem; border-top:1px solid var(--border-color);">'
            '<div style="font-size:0.85rem; font-weight:600; color:#e4e4e7; margin-bottom:0.6rem;">'
            'Sector Summary</div></div>',
            unsafe_allow_html=True,
        )
        format_dict = {
            "Avg_Tech": "{:+.3f}",
            "Avg_Fund": "{:.2f}",
            "Avg_PE": "{:.2f}",
            "Total_MCap": "₹{:.2f}B",
        }
        fmt_cols = {c: format_dict[c] for c in sector_summary.columns if c in format_dict}
        colour_sector = [c for c in ["Avg_Tech"] if c in sector_summary.columns]
        st.dataframe(
            sector_summary.style.format(fmt_cols, na_rep="—").map(_style_cell, subset=colour_sector),
            width="stretch",
            hide_index=True,
            height=min(80 + len(sector_summary) * 35, 400),
        )


# ════════════════════════════════════════════════════════════════════════════
# TAB 5 — System Logs
# ════════════════════════════════════════════════════════════════════════════
with tab5:
    st.markdown("""
    <div style="padding:1rem 0 0.5rem 0;">
        <div class="section-head">System Logs</div>
        <div class="section-sub">Per-ticker processing results from the most recent scan.</div>
    </div>
    """, unsafe_allow_html=True)

    scan_log = load_scan_log()

    if scan_log.empty:
        st.markdown(
            '<div style="color:#a1a1aa; font-size:0.82rem; padding:1rem 0;">'
            'No scan log found. Run a market scan to populate diagnostics.</div>',
            unsafe_allow_html=True,
        )
    else:
        ok_n   = int((scan_log["Status"] == "OK").sum())
        fail_n = int((scan_log["Status"] == "FAILED").sum())
        total  = len(scan_log)

        m1, m2, m3, m4 = st.columns(4)
        m1.metric("Successful",   ok_n)
        m2.metric("Failed",       fail_n)
        m3.metric("Total",        total)
        m4.metric("Success Rate", f"{ok_n / total * 100:.1f}%" if total else "—")

        st.markdown("<div style='height:0.75rem'></div>", unsafe_allow_html=True)

        failed_df = scan_log[scan_log["Status"] == "FAILED"]
        if failed_df.empty:
            st.markdown(
                '<div style="color:#22C55E; font-size:0.8rem; padding:0.25rem 0;">'
                'All securities processed without error.</div>',
                unsafe_allow_html=True,
            )
        else:
            st.markdown(
                f'<div style="color:#F87171; font-size:0.78rem; margin-bottom:0.5rem;">'
                f'{fail_n} securities could not be processed</div>',
                unsafe_allow_html=True,
            )
            st.dataframe(
                failed_df[["Ticker", "Error"]],
                hide_index=True, width="stretch",
            )

        st.markdown(
            '<div style="margin-top:1.25rem; padding-top:0.75rem; border-top:1px solid var(--border-color);">'
            '<div style="font-size:0.85rem; font-weight:600; color:#e4e4e7; margin-bottom:0.6rem;">'
            'Full Scan Log</div></div>',
            unsafe_allow_html=True,
        )
        full_log = scan_log.copy()
        st.dataframe(full_log, hide_index=True, width="stretch")


# ── Footer ──────────────────────────────────────────────────────────────────
st.markdown("<div style='height:3rem'></div>", unsafe_allow_html=True)

# Prepare diagnostics
_db_ok, _db_msg = test_connection()
_db_label = "Supabase" if get_backend() == "postgresql" else "SQLite (local)"
_db_color = "#4ADE80" if _db_ok else "#F87171"

scan_log_sb = load_scan_log()
ok_n_sb, fail_n_sb = 0, 0
if not scan_log_sb.empty:
    ok_n_sb = int((scan_log_sb["Status"] == "OK").sum())
    fail_n_sb = int((scan_log_sb["Status"] == "FAILED").sum())

st.markdown(f'''
<div style="margin-top:2.5rem; padding:2rem 0; border-top:1px solid var(--border-color);">
<div style="display:grid; grid-template-columns:1fr 2fr 1fr; gap:2rem;">

<!-- Diagnostics -->
<div>
<div style="font-size:0.85rem; font-weight:600; color:var(--text-main); margin-bottom:0.75rem;">System Diagnostics</div>
<div style="font-size:0.75rem; color:var(--text-muted); display:flex; justify-content:space-between; margin-bottom:0.25rem;">
<span>Database</span><span style="color:{_db_color}; font-weight:600;">{_db_label}</span>
</div>
<div style="font-size:0.75rem; color:var(--text-muted); display:flex; justify-content:space-between; margin-bottom:0.25rem;">
<span>Scan Results</span><span><span style="color:#10B981; font-weight:500;">{ok_n_sb} OK</span> / {fail_n_sb} failed</span>
</div>
<div style="font-size:0.75rem; color:var(--text-muted); display:flex; justify-content:space-between;">
<span>Auto-scan</span><span><b>4:15 PM IST</b> Mon–Fri</span>
</div>
</div>

<!-- Disclaimer -->
<div>
<div style="font-size:0.85rem; font-weight:600; color:var(--text-main); margin-bottom:0.75rem;">Disclaimer</div>
<div style="font-size:0.75rem; color:var(--text-sub); line-height:1.6;">
This platform is for educational purposes only and does not constitute financial advice. 
The models and signals provided are experimental. Always consult a certified financial advisor before making investment decisions. 
Alpha Research and Investment Club, FMS Delhi is not responsible for any trading losses incurred.
</div>
</div>

<!-- Attribution -->
<div style="text-align:right;">
<div style="font-size:0.85rem; font-weight:600; color:var(--text-main); margin-bottom:0.75rem;">Project Eura</div>
<div style="font-size:0.75rem; color:var(--text-muted); line-height:1.6;">
Alpha Research and Investment Club<br>FMS Delhi
</div>
<div style="font-size:0.7rem; color:var(--text-sub); margin-top:0.75rem; letter-spacing:0.01em;">
Made with &hearts; by Abhishek Kumar
</div>
</div>

</div>
</div>
''', unsafe_allow_html=True)
