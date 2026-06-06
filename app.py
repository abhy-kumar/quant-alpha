# -*- coding: utf-8 -*-
"""
app.py — Quantitative Alpha Dashboard
"""

import streamlit as st
import pandas as pd
import numpy as np
import plotly.graph_objects as go
from plotly.subplots import make_subplots
import yfinance as yf
from datetime import datetime
import pytz

from database import load_from_db, get_last_scan_time, load_scan_log, test_connection, get_backend
from scanner import run_scanner
from nse_fetcher import market_status_text, get_bulk_live_quotes, is_market_open

IST = pytz.timezone("Asia/Kolkata")

# ── Page config ───────────────────────────────────────────────────────────────
st.set_page_config(
    page_title="Quantitative Alpha",
    page_icon="▲",
    layout="wide",
    initial_sidebar_state="expanded",
)

# ── Design system ─────────────────────────────────────────────────────────────
st.markdown("""
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">

<style>
/* ── GLOBAL RESET ─────────────────────────────────────────────────────────── */
html, body, [class*="css"], * {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif !important;
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
    background-color: #060B14;
}

.block-container {
    padding: 0 2.25rem 2.5rem 2.25rem !important;
    max-width: 100% !important;
}

/* ── SIDEBAR ──────────────────────────────────────────────────────────────── */
section[data-testid="stSidebar"] {
    background-color: #080E1A !important;
    border-right: 1px solid #111B2E;
}
section[data-testid="stSidebar"] .block-container {
    padding: 1.75rem 1.25rem 2rem 1.25rem !important;
}
[data-testid="stSidebarCollapseButton"] { display: none; }

/* ── TYPOGRAPHY ───────────────────────────────────────────────────────────── */
h1 {
    color: #F1F5F9 !important;
    font-size: 1.5rem !important;
    font-weight: 700 !important;
    letter-spacing: -0.03em !important;
    line-height: 1.2 !important;
}
h2, h3 {
    color: #E2E8F0 !important;
    font-weight: 600 !important;
    letter-spacing: -0.02em !important;
}
p, div, span, label { color: #94A3B8; }

/* ── HEADER AREA ──────────────────────────────────────────────────────────── */
.app-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1.75rem 0 1.25rem 0;
    border-bottom: 1px solid #111B2E;
    margin-bottom: 0.75rem;
}
.app-wordmark {
    font-size: 1.4rem;
    font-weight: 700;
    color: #F1F5F9;
    letter-spacing: -0.03em;
    line-height: 1;
}
.app-descriptor {
    font-size: 0.7rem;
    color: #64748B;
    margin-top: 5px;
    font-weight: 500;
    letter-spacing: 0.07em;
    text-transform: uppercase;
}
.mkt-cluster { text-align: right; }
.mkt-badge {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.09em;
    text-transform: uppercase;
    padding: 0.3rem 0.75rem;
    border-radius: 4px;
}
.mkt-badge.open {
    color: #4ADE80;
    background: rgba(74, 222, 128, 0.08);
    border: 1px solid rgba(74, 222, 128, 0.18);
}
.mkt-badge.closed {
    color: #F87171;
    background: rgba(248, 113, 113, 0.08);
    border: 1px solid rgba(248, 113, 113, 0.15);
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
    font-size: 0.68rem;
    color: #56789A;
    margin-top: 5px;
    font-variant-numeric: tabular-nums;
    letter-spacing: 0.01em;
}

/* ── FRESHNESS STRIP ──────────────────────────────────────────────────────── */
.freshness-bar {
    font-size: 0.72rem;
    color: #64748B;
    padding: 0.3rem 0 0.9rem 0;
    letter-spacing: 0.01em;
}
.freshness-bar b { color: #7EB3E8; font-weight: 500; }

/* ── SIDEBAR SECTION LABEL ────────────────────────────────────────────────── */
.sidebar-label {
    font-size: 0.65rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #56789A;
    margin-bottom: 0.75rem;
    padding-bottom: 0.4rem;
    border-bottom: 1px solid #111B2E;
}
.sidebar-meta {
    font-size: 0.7rem;
    color: #56789A;
    line-height: 1.6;
    margin-top: 0.5rem;
}
.sidebar-meta b { color: #7EB3E8; font-weight: 500; }

/* ── BUTTONS ──────────────────────────────────────────────────────────────── */
.stButton > button {
    background: transparent !important;
    color: #60A5FA !important;
    border: 1px solid #1A3055 !important;
    border-radius: 5px !important;
    font-size: 0.8rem !important;
    font-weight: 500 !important;
    letter-spacing: 0.01em !important;
    padding: 0.45rem 1rem !important;
    transition: all 0.15s ease;
    width: 100%;
}
.stButton > button:hover {
    background: #0F2444 !important;
    border-color: #2563EB !important;
    color: #93C5FD !important;
}
.stButton > button[kind="primary"] {
    background: linear-gradient(145deg, #162C52, #1D4ED8) !important;
    color: #EFF6FF !important;
    border-color: #2563EB !important;
}
.stButton > button[kind="primary"]:hover {
    background: linear-gradient(145deg, #1D4ED8, #2563EB) !important;
    box-shadow: 0 0 18px rgba(37,99,235,0.3) !important;
}

/* ── TABS ─────────────────────────────────────────────────────────────────── */
.stTabs [data-baseweb="tab-list"] {
    background: transparent !important;
    border-bottom: 1px solid #111B2E !important;
    gap: 0 !important;
    padding: 0 !important;
}
.stTabs [data-baseweb="tab"] {
    background: transparent !important;
    color: #64748B !important;
    font-weight: 500 !important;
    font-size: 0.8rem !important;
    letter-spacing: 0.02em !important;
    padding: 0.7rem 1.4rem !important;
    border-radius: 0 !important;
    border-bottom: 2px solid transparent !important;
    transition: color 0.15s, border-color 0.15s;
}
.stTabs [data-baseweb="tab"]:hover {
    color: #64748B !important;
    background: rgba(255,255,255,0.015) !important;
}
.stTabs [aria-selected="true"] {
    color: #CBD5E1 !important;
    border-bottom: 2px solid #2563EB !important;
    font-weight: 600 !important;
}

/* ── METRIC CARDS ─────────────────────────────────────────────────────────── */
[data-testid="metric-container"] {
    background: #0A1120 !important;
    border: 1px solid #111B2E !important;
    border-radius: 8px !important;
    padding: 0.9rem 1.1rem !important;
    transition: border-color 0.2s;
}
[data-testid="metric-container"]:hover {
    border-color: #1E3A5F !important;
}
[data-testid="stMetricLabel"] > div {
    font-size: 0.65rem !important;
    font-weight: 700 !important;
    text-transform: uppercase !important;
    letter-spacing: 0.09em !important;
    color: #56789A !important;
}
[data-testid="stMetricValue"] > div {
    font-size: 1.15rem !important;
    font-weight: 600 !important;
    color: #E2E8F0 !important;
    letter-spacing: -0.01em !important;
}

/* ── PROGRESS BAR ─────────────────────────────────────────────────────────── */
[data-testid="stProgress"] > div {
    background: #111B2E !important;
    border-radius: 3px !important;
    height: 3px !important;
}
[data-testid="stProgress"] > div > div {
    background: linear-gradient(90deg, #1D4ED8, #7C3AED) !important;
    border-radius: 3px !important;
    transition: width 0.3s ease !important;
}

/* ── SCAN PROGRESS UI ─────────────────────────────────────────────────────── */
.scan-header {
    padding: 2rem 0 1.25rem 0;
    border-bottom: 1px solid #111B2E;
    margin-bottom: 1.5rem;
}
.scan-title {
    font-size: 1rem;
    font-weight: 600;
    color: #CBD5E1;
    letter-spacing: -0.01em;
}
.scan-sub {
    font-size: 0.75rem;
    color: #56789A;
    margin-top: 5px;
    letter-spacing: 0.01em;
}
.scan-status-row {
    font-size: 0.82rem;
    color: #64748B;
    margin-top: 0.6rem;
    font-variant-numeric: tabular-nums;
}
.scan-count  { color: #3B82F6; font-weight: 600; }
.scan-ticker { color: #94A3B8; font-weight: 500; }

/* ── DIVIDERS ─────────────────────────────────────────────────────────────── */
hr {
    border: none !important;
    border-top: 1px solid #111B2E !important;
    margin: 0.75rem 0 !important;
}

/* ── SUBHEADERS ───────────────────────────────────────────────────────────── */
.section-head {
    font-size: 0.95rem;
    font-weight: 600;
    color: #CBD5E1;
    letter-spacing: -0.01em;
    margin-bottom: 0.25rem;
}
.section-sub {
    font-size: 0.72rem;
    color: #56789A;
    margin-bottom: 1rem;
    line-height: 1.5;
}

/* ── ALERTS ───────────────────────────────────────────────────────────────── */
[data-testid="stAlert"] {
    background: #0A1120 !important;
    border-radius: 7px !important;
    border-left: 2px solid #1D4ED8 !important;
    color: #64748B !important;
    font-size: 0.82rem !important;
}

/* ── EXPANDER ─────────────────────────────────────────────────────────────── */
[data-testid="stExpander"] {
    background: #0A1120 !important;
    border: 1px solid #111B2E !important;
    border-radius: 7px !important;
}

/* ── SELECT / RADIO / CHECKBOX ────────────────────────────────────────────── */
[data-testid="stSelectbox"] label,
[data-testid="stSlider"]    label,
[data-testid="stRadio"]     label,
[data-testid="stCheckbox"]  label {
    font-size: 0.75rem !important;
    font-weight: 500 !important;
    color: #64748B !important;
    letter-spacing: 0.02em !important;
    text-transform: uppercase !important;
}

/* ── CAPTION ──────────────────────────────────────────────────────────────── */
[data-testid="stCaptionContainer"] {
    color: #56789A !important;
    font-size: 0.72rem !important;
}

/* ── DATAFRAME ────────────────────────────────────────────────────────────── */
[data-testid="stDataFrame"] iframe {
    border-radius: 7px;
}
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
def _age(iso_ts: str) -> str:
    try:
        dt = datetime.fromisoformat(iso_ts)
        if dt.tzinfo is None:
            dt = IST.localize(dt)
        secs = int((datetime.now(IST) - dt).total_seconds())
        if secs < 60:   return f"{secs}s ago"
        if secs < 3600: return f"{secs // 60}m ago"
        h, m = divmod(secs // 60, 60)
        return f"{h}h {m}m ago"
    except Exception:
        return "unknown"


def _style_cell(val):
    """CSS for numeric signal values and Bullish/Bearish strings."""
    if isinstance(val, str):
        v = val.strip().lower()
        if v == "bullish": return "color:#4ADE80; font-weight:500"
        if v == "bearish": return "color:#F87171; font-weight:500"
    try:
        n = float(val)
        if np.isnan(n):  return "color:#1E3A5F"
        if n > 0:        return "color:#4ADE80"
        if n < 0:        return "color:#F87171"
    except Exception:
        pass
    return "color:#3B5278"


# ── Market status ─────────────────────────────────────────────────────────────
mkt       = market_status_text()
dot_class = "open" if mkt["is_open"] else "closed"

# ── App header ────────────────────────────────────────────────────────────────
st.markdown(f"""
<div class="app-header">
    <div>
        <div class="app-wordmark">Quantitative Alpha</div>
        <div class="app-descriptor">Alpha Research and Investment Club &nbsp;&middot;&nbsp; FMS Delhi</div>
    </div>
    <div class="mkt-cluster">
        <div class="mkt-badge {dot_class}">
            <span class="pulse-dot"></span> NSE {mkt['status']}
        </div>
        <div class="mkt-time">{mkt['time_ist']}</div>
    </div>
</div>
""", unsafe_allow_html=True)

# ── Freshness strip ───────────────────────────────────────────────────────────
last_ts = get_last_scan_time()
if last_ts:
    try:
        dt_disp = datetime.fromisoformat(last_ts).strftime("%d %b %Y · %I:%M %p")
    except Exception:
        dt_disp = last_ts
    st.markdown(
        f'<div class="freshness-bar">Last full scan &nbsp;·&nbsp; '
        f'<b>{dt_disp} IST</b> &nbsp;·&nbsp; {_age(last_ts)}</div>',
        unsafe_allow_html=True,
    )
else:
    st.markdown(
        '<div class="freshness-bar">No scan data found — run a market scan to begin.</div>',
        unsafe_allow_html=True,
    )


# ── Sidebar ───────────────────────────────────────────────────────────────────
with st.sidebar:
    st.markdown('<div class="sidebar-label">Controls</div>', unsafe_allow_html=True)

    scan_btn = st.button("Run Market Scan", type="primary", use_container_width=True)

    st.markdown("<div style='height:0.5rem'></div>", unsafe_allow_html=True)

    # Live refresh (market hours only)
    live_refresh_btn = False
    if is_market_open():
        st.markdown(
            '<div class="sidebar-meta">Market session active</div>',
            unsafe_allow_html=True,
        )
        live_refresh_btn = st.button("Refresh Live Prices", use_container_width=True)
    else:
        st.markdown(
            '<div class="sidebar-meta">Market closed &nbsp;·&nbsp; '
            'Live refresh available 9:15 AM – 3:30 PM IST</div>',
            unsafe_allow_html=True,
        )

    st.markdown("<div style='height:0.75rem'></div>", unsafe_allow_html=True)
    st.markdown('<div class="sidebar-label">Diagnostics</div>', unsafe_allow_html=True)

    # Database connection status — shows instantly whether Supabase is reachable
    _db_ok, _db_msg = test_connection()
    _db_label = "Supabase" if get_backend() == "postgresql" else "SQLite (local)"
    _db_color = "#4ADE80" if _db_ok else "#F87171"
    st.markdown(
        f'<div class="sidebar-meta">Database &nbsp;&middot;&nbsp; '
        f'<span style="color:{_db_color}; font-weight:600;">{_db_label}</span></div>',
        unsafe_allow_html=True,
    )
    if not _db_ok:
        st.markdown(
            f'<div class="sidebar-meta" style="color:#F87171; font-size:0.62rem; '
            f'margin-top:2px; word-break:break-all;">{_db_msg[:160]}</div>',
            unsafe_allow_html=True,
        )

    scan_log = load_scan_log()
    if not scan_log.empty:
        ok_n   = int((scan_log["Status"] == "OK").sum())
        fail_n = int((scan_log["Status"] == "FAILED").sum())
        st.markdown(
            f'<div class="sidebar-meta">'
            f'Last scan &nbsp;&middot;&nbsp; <b>{ok_n} OK</b> &nbsp;/ {fail_n} failed</div>',
            unsafe_allow_html=True,
        )

    st.markdown(
        '<div class="sidebar-meta" style="margin-top:0.5rem;">'
        'Auto-scan scheduled &nbsp;&middot;&nbsp; <b>4:15 PM IST</b> Mon–Fri</div>',
        unsafe_allow_html=True,
    )

    # Attribution
    st.markdown(
        '<div style="margin-top:2.5rem; padding-top:1rem; border-top:1px solid #111B2E;">'
        '<div style="font-size:0.65rem; color:#56789A; line-height:1.8;">'
        'Alpha Research and Investment Club<br>FMS Delhi'
        '</div>'
        '<div style="font-size:0.62rem; color:#3D6A9A; margin-top:0.35rem; letter-spacing:0.01em;">'
        'Made with &hearts; by Abhishek Kumar'
        '</div>'
        '</div>',
        unsafe_allow_html=True,
    )


# ── Scan execution (blocks here; progress updates are streamed to browser) ────
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

if df.empty:
    st.markdown("""
    <div style="padding:3rem 0; text-align:center; color:#1E3A5F;">
        <div style="font-size:0.9rem; font-weight:600; color:#3B5278; margin-bottom:0.5rem;">
            No data available
        </div>
        <div style="font-size:0.78rem; color:#1E3A5F;">
            Use the sidebar to run a market scan and populate the database.
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
tab1, tab2, tab3, tab4 = st.tabs([
    "Top Signals",
    "Screener",
    "Charting",
    "Scan Health",
])


# ════════════════════════════════════════════════════════════════════════════
# TAB 1 — Top Signals
# ════════════════════════════════════════════════════════════════════════════
with tab1:
    st.markdown("""
    <div style="padding:1rem 0 0.25rem 0;">
        <div class="section-head">High-Conviction Technical Setups</div>
        <div class="section-sub">
            Ranked by composite Tech Score across 12 signals.
            Range: −1.0 (all bearish) to +1.0 (all bullish).
        </div>
    </div>
    """, unsafe_allow_html=True)

    top_bulls = (
        df[df["Tech_Score"] > 0]
        .sort_values("Tech_Score", ascending=False)
        .head(15)
    )

    display_cols = [c for c in [
        "Ticker", "Price", "1d_Chg_%", "ST_Signal",
        "Tech_Score", "Bull_Count", "Bear_Count",
        "RSI_Value", "ADX_Value", "ATR_Value",
        "Total_Return_%", "Sharpe", "Max_Drawdown_%",
        "P/E", "ROE_%", "Market_Cap_B",
    ] if c in top_bulls.columns]

    colour_cols = [c for c in ["1d_Chg_%", "Tech_Score", "Total_Return_%", "Sharpe", "ST_Signal"]
                   if c in display_cols]

    st.dataframe(
        top_bulls[display_cols].style.map(_style_cell, subset=colour_cols),
        use_container_width=True,
        hide_index=True,
        height=510,
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

    fc1, fc2, fc3, fc4 = st.columns(4)
    with fc1:
        min_score = st.slider("Min Tech Score", -1.0, 1.0, -1.0, 0.05)
    with fc2:
        max_rsi = st.slider("Max RSI", 0, 100, 100)
    with fc3:
        min_adx = st.slider("Min ADX", 0, 60, 0)
    with fc4:
        st_filter = st.selectbox("Supertrend", ["All", "Bullish", "Bearish"])

    filtered = df[df["Tech_Score"] >= min_score].copy()
    if "RSI_Value" in filtered.columns:
        filtered = filtered[filtered["RSI_Value"] <= max_rsi]
    if "ADX_Value" in filtered.columns:
        filtered = filtered[filtered["ADX_Value"] >= min_adx]
    if st_filter != "All" and "ST_Signal" in filtered.columns:
        filtered = filtered[filtered["ST_Signal"] == st_filter]

    sig_cols   = [c for c in filtered.columns if c.startswith("Sig_")]
    colour_all = [c for c in sig_cols + ["Tech_Score", "ST_Signal"] if c in filtered.columns]

    st.dataframe(
        filtered.style.map(_style_cell, subset=colour_all),
        use_container_width=True,
        height=600,
    )
    st.caption(f"{len(filtered)} of {len(df)} securities match the current filter")


# ════════════════════════════════════════════════════════════════════════════
# TAB 3 — Charting
# ════════════════════════════════════════════════════════════════════════════
with tab3:
    ctrl_col, chart_col = st.columns([1, 4])

    with ctrl_col:
        st.markdown("<div style='height:1rem'></div>", unsafe_allow_html=True)
        selected = st.selectbox("Security", df["Ticker"].tolist(), key="chart_sel")
        st.markdown("<hr>", unsafe_allow_html=True)
        asset = df[df["Ticker"] == selected].iloc[0]

        def _m(label: str, key: str, decimals: int = 2):
            val = asset.get(key)
            try:
                display = round(float(val), decimals) if pd.notna(val) else "—"
            except (TypeError, ValueError):
                display = str(val) if val is not None else "—"
            st.metric(label, display)

        _m("Tech Score",  "Tech_Score",  3)
        st.metric("Supertrend", asset.get("ST_Signal", "—"))
        _m("RSI (14)",    "RSI_Value",   1)
        _m("ADX (14)",    "ADX_Value",   1)
        _m("ATR",         "ATR_Value",   2)
        _m("MACD",        "MACD_Value",  4)
        st.markdown("<hr>", unsafe_allow_html=True)
        _m("Forward P/E", "Forward_P/E", 2)
        _m("ROE %",       "ROE_%",       2)
        _m("52W High",    "52W_High",    2)
        _m("52W Low",     "52W_Low",     2)

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

        period_map = {"3M": "3mo", "6M": "6mo", "1Y": "1y", "2Y": "2y"}
        price_df = yf.download(
            selected, period=period_map[period_opt],
            interval="1d", auto_adjust=True, progress=False,
        )
        if isinstance(price_df.columns, pd.MultiIndex):
            price_df.columns = price_df.columns.get_level_values(0)

        if price_df.empty:
            st.caption(f"Price data unavailable for {selected}.")
        else:
            # Inline RSI computation
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

            # Candlestick
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
                    (50,  "#38BDF8", "solid"),
                    (200, "#C084FC", "dot"),
                ]:
                    sma = cl.rolling(w).mean()
                    fig.add_trace(go.Scatter(
                        x=price_df.index, y=sma,
                        name=f"SMA {w}",
                        line=dict(color=col, width=1.2, dash=dash),
                        opacity=0.8,
                    ), row=1, col=1)

            # Volume
            fig.add_trace(go.Bar(
                x=price_df.index, y=price_df["Volume"],
                marker_color=bar_colours, name="Volume", showlegend=False,
            ), row=2, col=1)

            # RSI
            fig.add_trace(go.Scatter(
                x=price_df.index, y=rsi_s,
                name="RSI", line=dict(color="#A78BFA", width=1.5),
            ), row=3, col=1)
            fig.add_hline(y=70, line_dash="dot", line_color="#EF4444",
                          row=3, col=1, opacity=0.5)
            fig.add_hline(y=30, line_dash="dot", line_color="#22C55E",
                          row=3, col=1, opacity=0.5)
            fig.add_hrect(y0=30, y1=70, fillcolor="#94A3B8",
                          opacity=0.03, row=3, col=1, line_width=0)

            bg  = "#060B14"
            grid = "#0D1728"
            fig.update_layout(
                height=740,
                margin=dict(l=0, r=0, t=20, b=0),
                xaxis_rangeslider_visible=False,
                paper_bgcolor=bg,
                plot_bgcolor=bg,
                font=dict(color="#4A6FA5", size=11, family="Inter"),
                legend=dict(
                    orientation="h", yanchor="bottom",
                    y=1.01, xanchor="right", x=1,
                    bgcolor="rgba(0,0,0,0)", font=dict(size=10),
                ),
                hoverlabel=dict(
                    bgcolor="#0D1728", font_color="#CBD5E1",
                    bordercolor="#1E3A5F",
                ),
            )
            for row_n in [1, 2, 3]:
                fig.update_xaxes(
                    gridcolor=grid, zeroline=False, showgrid=True,
                    tickfont=dict(color="#2D4163", size=10),
                    row=row_n, col=1,
                )
                fig.update_yaxes(
                    gridcolor=grid, zeroline=False, showgrid=True,
                    tickfont=dict(color="#2D4163", size=10),
                    row=row_n, col=1,
                )
            # Subplot title colour
            for ann in fig.layout.annotations:
                ann.font.color = "#2D4163"
                ann.font.size  = 10

            st.plotly_chart(fig, use_container_width=True)


# ════════════════════════════════════════════════════════════════════════════
# TAB 4 — Scan Health
# ════════════════════════════════════════════════════════════════════════════
with tab4:
    st.markdown("""
    <div style="padding:1rem 0 0.5rem 0;">
        <div class="section-head">Scan Health</div>
        <div class="section-sub">Per-ticker processing results from the most recent scan.</div>
    </div>
    """, unsafe_allow_html=True)

    scan_log = load_scan_log()

    if scan_log.empty:
        st.markdown(
            '<div style="color:#1E3A5F; font-size:0.82rem; padding:1rem 0;">'
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
                hide_index=True, use_container_width=True,
            )

        with st.expander("Full scan log"):
            st.dataframe(scan_log, hide_index=True, use_container_width=True)