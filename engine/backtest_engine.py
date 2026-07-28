"""
backtest_engine.py
------------------
Walk-forward portfolio backtest using 2-year daily OHLCV history.

Since factor_history only goes back to June 2026 (too short), this module
replays scoring signals from raw price data across the full historical window.

Two scoring models are replicated:

  Short-term model  (mirrors Composite_Score):
    - Technical signals: Supertrend, SMA crossovers, RSI, MACD, ADX,
      Bollinger %B, Ichimoku, VPT.
    - Momentum proxy: 1m, 3m, 6m, 12-1m momentum composites.
    - Composite: tech 50% + momentum 50%

  Long-term model  (mirrors Composite_Score_Long):
    - 12-1 Jegadeesh-Titman momentum (40% weight)
    - 6m momentum                     (30% weight)
    - Low-volatility (63d annualised, inverted)  (20% weight)
    - RSI z-score reversion signal (inverted)    (10% weight)

Backtest protocol:
  - Monthly rebalance: every 20 trading days
  - Top-10 equal-weight long-only portfolio
  - Look-ahead free: signals computed from data up to the rebalance date only
  - Benchmark: ^NSEI (Nifty 50) if available in daily_ohlcv, else flat 0%
  - Horizons: 1Y (last 252 trading days) and 6M (last 126 trading days)
"""

import sqlite3
import json
import os
import numpy as np
import pandas as pd
from datetime import datetime
from config import RISK_FREE_RATE

DB_PATH = "data/market_scans.db"
REBALANCE_EVERY = 20   # trading days between rebalances
TOP_N = 10             # stocks in portfolio at each rebalance
MIN_HISTORY = 60       # minimum trading days of history before we start scoring
RUNS_DIR = os.path.join("frontend", "public", "backtest_runs")


# ---------------------------------------------------------------------------
# Cache helpers
# ---------------------------------------------------------------------------

def _ensure_cache_table():
    """Create backtest_cache table if it doesn't exist."""
    conn = sqlite3.connect(DB_PATH)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS backtest_cache (
            as_of_date   TEXT NOT NULL,
            model        TEXT NOT NULL,
            horizon      TEXT NOT NULL,
            created_at   TEXT NOT NULL,
            data_start   TEXT,
            data_end     TEXT,
            n_chart_pts  INTEGER,
            stats_json   TEXT,
            chart_json   TEXT,
            holdings_json TEXT,
            PRIMARY KEY (as_of_date, model, horizon)
        )
    """)
    conn.commit()
    conn.close()


def _check_cache(as_of_date: str, model: str, horizon: str) -> dict | None:
    """Return cached result dict or None if not cached."""
    _ensure_cache_table()
    conn = sqlite3.connect(DB_PATH)
    row = conn.execute(
        "SELECT chart_json, holdings_json, stats_json FROM backtest_cache "
        "WHERE as_of_date=? AND model=? AND horizon=?",
        (as_of_date, model, horizon)
    ).fetchone()
    conn.close()
    if row:
        return {
            "chart":    json.loads(row[0]),
            "holdings": json.loads(row[1]),
            "stats":    json.loads(row[2]),
        }
    return None


def _store_cache(as_of_date: str, model: str, horizon: str, result: dict,
                 data_start: str = "", data_end: str = ""):
    """Persist a backtest result to the cache table."""
    _ensure_cache_table()
    conn = sqlite3.connect(DB_PATH)
    conn.execute(
        """INSERT OR REPLACE INTO backtest_cache
           (as_of_date, model, horizon, created_at, data_start, data_end,
            n_chart_pts, stats_json, chart_json, holdings_json)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            as_of_date, model, horizon,
            datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            data_start, data_end,
            len(result.get("chart", [])),
            json.dumps(result.get("stats", {})),
            json.dumps(result.get("chart", [])),
            json.dumps(result.get("holdings", [])),
        )
    )
    conn.commit()
    conn.close()


def get_ohlcv_date_range() -> tuple[str, str]:
    """Return (min_date, max_date) available in daily_ohlcv as YYYY-MM-DD strings."""
    conn = sqlite3.connect(DB_PATH)
    row = conn.execute("SELECT MIN(Date), MAX(Date) FROM daily_ohlcv").fetchone()
    conn.close()
    return (row[0] or "", row[1] or "")


# ---------------------------------------------------------------------------
# Data loading
# ---------------------------------------------------------------------------

def load_ohlcv() -> tuple[pd.DataFrame, pd.DataFrame, list]:
    """
    Returns:
      prices   — (Date × Ticker) DataFrame of Close prices, forward-filled
      volumes  — (Date × Ticker) DataFrame of Volume, forward-filled
      all_tickers — list of all tickers excluding benchmark
    """
    conn = sqlite3.connect(DB_PATH)
    df = pd.read_sql_query(
        "SELECT Date, Ticker, Open, High, Low, Close, Volume FROM daily_ohlcv ORDER BY Date",
        conn
    )
    conn.close()

    df["Date"] = pd.to_datetime(df["Date"])
    prices  = df.pivot(index="Date", columns="Ticker", values="Close").ffill()
    volumes = df.pivot(index="Date", columns="Ticker", values="Volume").ffill()
    highs   = df.pivot(index="Date", columns="Ticker", values="High").ffill()
    lows    = df.pivot(index="Date", columns="Ticker", values="Low").ffill()

    bench = "^NSEI"
    all_tickers = [t for t in prices.columns if t != bench]

    return prices, volumes, highs, lows, all_tickers


# ---------------------------------------------------------------------------
# Signal computation helpers (all computed from a price slice ending at idx)
# ---------------------------------------------------------------------------

def _safe(x):
    return float(x) if (x is not None and not np.isnan(x)) else np.nan


def _wilder(s: np.ndarray, period: int) -> np.ndarray:
    """Wilder's smoothing (EMA with alpha=1/period, SMA seed)."""
    result = np.full_like(s, np.nan, dtype=float)
    first = np.argmax(~np.isnan(s))
    if first + period > len(s):
        return result
    result[first + period - 1] = np.nanmean(s[first: first + period])
    for i in range(first + period, len(s)):
        if not np.isnan(s[i]):
            result[i] = (result[i - 1] * (period - 1) + s[i]) / period
    return result


def _rsi(close: np.ndarray, period: int = 14) -> float:
    """RSI at the last bar of the close array."""
    if len(close) < period + 1:
        return 50.0
    delta = np.diff(close)
    gain  = np.where(delta > 0, delta, 0.0)
    loss  = np.where(delta < 0, -delta, 0.0)
    ag = _wilder(gain, period)
    al = _wilder(loss, period)
    last_ag = ag[-1]
    last_al = al[-1]
    if np.isnan(last_ag) or np.isnan(last_al):
        return 50.0
    if last_al == 0:
        return 100.0
    rs = last_ag / last_al
    return 100 - 100 / (1 + rs)


def _supertrend_dir(close: np.ndarray, high: np.ndarray, low: np.ndarray,
                    period: int = 10, mult: float = 3.0) -> float:
    """Returns final Supertrend direction: -1=bullish, 1=bearish, 0=unknown."""
    n = len(close)
    if n < period + 5:
        return 0.0

    # ATR via Wilder
    prev_close = np.roll(close, 1)
    prev_close[0] = close[0]
    tr = np.maximum.reduce([
        high - low,
        np.abs(high - prev_close),
        np.abs(low  - prev_close),
    ])
    atr = _wilder(tr, period)

    hl_avg = (high + low) / 2
    bu = hl_avg + mult * atr
    bl = hl_avg - mult * atr
    final_u = bu.copy()
    final_l = bl.copy()
    direction = np.ones(n, dtype=float)  # start bearish

    for i in range(1, n):
        if np.isnan(atr[i]) or np.isnan(atr[i - 1]):
            continue
        if bu[i] < final_u[i - 1] or close[i - 1] > final_u[i - 1]:
            final_u[i] = bu[i]
        else:
            final_u[i] = final_u[i - 1]
        if bl[i] > final_l[i - 1] or close[i - 1] < final_l[i - 1]:
            final_l[i] = bl[i]
        else:
            final_l[i] = final_l[i - 1]

        prev_dir = direction[i - 1]
        if prev_dir == 1:
            direction[i] = -1 if close[i] > final_u[i] else 1
        else:
            direction[i] = 1 if close[i] < final_l[i] else -1

    last_dir = direction[-1]
    if np.isnan(last_dir):
        return 0.0
    return float(last_dir)


def _macd_sig(close: np.ndarray) -> tuple[float, float]:
    """Returns (macd - signal, macd_hist - prev_macd_hist)."""
    if len(close) < 35:
        return 0.0, 0.0
    s = pd.Series(close)
    ema12 = s.ewm(span=12, adjust=False).mean()
    ema26 = s.ewm(span=26, adjust=False).mean()
    macd  = ema12 - ema26
    sig   = macd.ewm(span=9, adjust=False).mean()
    hist  = macd - sig
    diff  = float(macd.iloc[-1] - sig.iloc[-1])
    hdiff = float(hist.iloc[-1] - hist.iloc[-2]) if len(hist) >= 2 else 0.0
    return diff, hdiff


def _adx_dir(close: np.ndarray, high: np.ndarray, low: np.ndarray,
             period: int = 14) -> float:
    """Returns ADX signal: 1 if +DI > -DI and ADX > 25, -1 if -DI > +DI and ADX > 25, else 0."""
    n = len(close)
    if n < period + 5:
        return 0.0
    prev_close = np.roll(close, 1)
    prev_close[0] = close[0]
    tr = np.maximum.reduce([
        high - low,
        np.abs(high - prev_close),
        np.abs(low  - prev_close),
    ])
    atr = _wilder(tr, period)
    if np.isnan(atr[-1]) or atr[-1] == 0:
        return 0.0

    up  = np.diff(high, prepend=high[0])
    dn  = -np.diff(low,  prepend=low[0])
    pdm = np.where((up > dn) & (up > 0), up, 0.0)
    ndm = np.where((dn > up) & (dn > 0), dn, 0.0)
    sp  = _wilder(pdm, period)
    sn  = _wilder(ndm, period)
    if np.isnan(sp[-1]) or np.isnan(sn[-1]):
        return 0.0

    safe_atr = np.where(atr > 0, atr, np.nan)
    pdi = 100 * sp / safe_atr
    ndi = 100 * sn / safe_atr
    dx  = 100 * np.abs(pdi - ndi) / np.where((pdi + ndi) > 0, pdi + ndi, np.nan)
    adx = _wilder(np.nan_to_num(dx, nan=0.0), period)

    adx_val = adx[-1]
    pdi_val = pdi[-1]
    ndi_val = ndi[-1]
    if np.isnan(adx_val):
        return 0.0
    if adx_val > 25 and not np.isnan(pdi_val) and not np.isnan(ndi_val):
        return 1.0 if pdi_val > ndi_val else -1.0
    return 0.0


def _bb_pctb(close: np.ndarray, period: int = 20) -> float:
    if len(close) < period:
        return 0.5
    s = pd.Series(close[-period:])
    mid = s.mean()
    std = s.std()
    if std == 0:
        return 0.5
    return float((close[-1] - (mid - 2 * std)) / (4 * std))


def _ichimoku_sig(close: np.ndarray, high: np.ndarray, low: np.ndarray) -> float:
    """Returns 1 (bullish cloud), -1 (bearish cloud), 0 (inside cloud)."""
    n = len(close)
    if n < 78:    # need 52 + 26 shift
        return 0.0
    # SpanA and SpanB are projected 26 bars forward in real Ichimoku,
    # but for backtesting we use the current cloud (no future projection).
    hi9  = np.max(high[-9:])
    lo9  = np.min(low[-9:])
    hi26 = np.max(high[-26:])
    lo26 = np.min(low[-26:])
    tenkan = (hi9 + lo9) / 2
    kijun  = (hi26 + lo26) / 2
    hi52   = np.max(high[-52:])
    lo52   = np.min(low[-52:])
    span_a = (tenkan + kijun) / 2
    span_b = (hi52 + lo52) / 2
    c = close[-1]
    if c > span_a and c > span_b:
        return 1.0
    if c < span_a and c < span_b:
        return -1.0
    return 0.0


def _vpt_sig(close: np.ndarray, volume: np.ndarray, period: int = 20) -> float:
    if len(close) < period + 2:
        return 0.0
    pct = np.diff(close) / np.where(close[:-1] != 0, close[:-1], np.nan)
    pct = np.nan_to_num(pct, nan=0.0)
    vpt = np.cumsum(volume[1:] * pct)
    s   = pd.Series(vpt)
    ema = s.ewm(span=period, adjust=False).mean().to_numpy()
    return 1.0 if vpt[-1] > ema[-1] else -1.0


# ---------------------------------------------------------------------------
# Composite scoring at a historical date index
# ---------------------------------------------------------------------------

def compute_short_score_at(
    prices: pd.DataFrame, volumes: pd.DataFrame,
    highs: pd.DataFrame, lows: pd.DataFrame,
    tickers: list, idx: int
) -> pd.Series:
    """
    Compute short-term composite score for all tickers at bar `idx`.
    Returns a Series keyed by ticker, values 0–10 (higher = more bullish).
    """
    scores = {}
    c_slice = prices.iloc[: idx + 1]
    v_slice = volumes.iloc[: idx + 1]
    h_slice = highs.iloc[: idx + 1]
    l_slice = lows.iloc[: idx + 1]

    p0 = prices.iloc[idx]

    for ticker in tickers:
        if ticker not in prices.columns:
            continue
        c = c_slice[ticker].dropna().to_numpy(dtype=float)
        if len(c) < MIN_HISTORY:
            continue

        h = h_slice[ticker].reindex(c_slice.index).ffill().dropna().to_numpy(dtype=float)
        l = l_slice[ticker].reindex(l_slice.index).ffill().dropna().to_numpy(dtype=float)
        v = v_slice[ticker].reindex(v_slice.index).ffill().dropna().to_numpy(dtype=float)
        # Align lengths
        n = min(len(c), len(h), len(l), len(v))
        c, h, l, v = c[-n:], h[-n:], l[-n:], v[-n:]

        # ── Technical signals ─────────────────────────────────────
        st_dir = _supertrend_dir(c, h, l)          # -1=bull, 1=bear
        sig_st = int(-st_dir)                       # flip: 1 if bullish

        sma50  = np.mean(c[-50:])  if len(c) >= 50  else np.nan
        sma200 = np.mean(c[-200:]) if len(c) >= 200 else np.nan
        sig_sma50  = 1 if c[-1] > sma50  else -1 if not np.isnan(sma50)  else 0
        sig_sma200 = 1 if c[-1] > sma200 else -1 if not np.isnan(sma200) else 0
        sig_golden = 1 if (not np.isnan(sma50) and not np.isnan(sma200) and sma50 > sma200) else -1

        rsi_val = _rsi(c)
        bullish_regime = (sig_sma200 == 1 and sig_st == 1)
        if bullish_regime:
            sig_rsi = 1 if 35 <= rsi_val <= 80 else (-1 if rsi_val < 35 or rsi_val > 80 else 0)
        else:
            sig_rsi = 1 if rsi_val < 30 else (-1 if rsi_val > 70 else 0)

        macd_diff, macd_hdiff = _macd_sig(c)
        sig_macd      = 1 if macd_diff > 0 else -1
        sig_macd_hist = 1 if macd_hdiff > 0 else -1

        sig_adx = _adx_dir(c, h, l)
        bb_val  = _bb_pctb(c)
        sig_bb  = 1 if bb_val < 0.05 else (-1 if bb_val > 0.95 else 0)
        sig_ich = _ichimoku_sig(c, h, l)
        sig_vpt = _vpt_sig(c, v)

        weighted = [
            (sig_st,       2.0),
            (sig_sma200,   2.0),
            (sig_golden,   2.0),
            (sig_adx,      2.0),
            (sig_ich,      1.5),
            (sig_macd,     1.0),
            (sig_rsi,      1.0),
            (sig_vpt,      1.0),
            (sig_sma50,    1.0),
            (sig_bb,       0.25),
            (sig_macd_hist, 0.5),
        ]
        total_w   = sum(w for _, w in weighted)
        bull_w    = sum(w for s, w in weighted if s == 1)
        bear_w    = sum(w for s, w in weighted if s == -1)
        tech_norm = ((bull_w - bear_w) / total_w + 1) * 5  # 0–10

        # ── Momentum signals ──────────────────────────────────────
        def mom(lookback, skip=0):
            past = max(0, len(c) - lookback - skip - 1)
            skip_to = max(0, len(c) - skip - 1) if skip > 0 else len(c) - 1
            if past >= skip_to or c[past] == 0:
                return np.nan
            return (c[skip_to] / c[past]) - 1

        m1m = mom(21)
        m3m = mom(63, skip=21)
        m6m = mom(126, skip=21)
        m12 = mom(252, skip=21)

        moms = [x for x in [m1m * 0.1, m3m * 0.2, m6m * 0.35, m12 * 0.35] if not np.isnan(x)]
        if not moms:
            mom_composite = 0.0
        else:
            mom_composite = sum(moms) / max(sum(
                [0.1, 0.2, 0.35, 0.35][:len([x for x in [m1m, m3m, m6m, m12] if not np.isnan(x)])]
            ), 1e-6)

        # Cross-sectional z-score for momentum applied later; here raw
        scores[ticker] = {
            "tech": tech_norm,
            "mom":  mom_composite,
            "raw":  mom_composite,   # for cross-sectional normalisation
        }

    if not scores:
        return pd.Series(dtype=float)

    # Cross-sectional z-score normalisation of momentum
    mom_vals = pd.Series({t: v["mom"] for t, v in scores.items()}).dropna()
    if len(mom_vals) >= 5:
        m_mean = float(mom_vals.mean())
        m_std  = float(max(mom_vals.std(), 0.02))
        for t in scores:
            raw = scores[t]["mom"]
            if not np.isnan(raw):
                z = (raw - m_mean) / m_std
                scores[t]["mom_norm"] = float(5.0 + 4.5 * np.tanh(z / 1.5))
            else:
                scores[t]["mom_norm"] = 5.0
    else:
        for t in scores:
            scores[t]["mom_norm"] = 5.0

    result = {}
    for t, v in scores.items():
        result[t] = v["tech"] * 0.50 + v["mom_norm"] * 0.50

    return pd.Series(result).dropna()


def compute_long_score_at(
    prices: pd.DataFrame, highs: pd.DataFrame, lows: pd.DataFrame,
    tickers: list, idx: int
) -> pd.Series:
    """
    Compute long-term composite score for all tickers at bar `idx`.
    Weights: 12-1m momentum (40%), 6m momentum (30%), low-vol (20%), RSI-z (10%).
    Returns a Series keyed by ticker, 0–10 scale.
    """
    scores = {}
    c_slice = prices.iloc[: idx + 1]

    for ticker in tickers:
        if ticker not in prices.columns:
            continue
        c = c_slice[ticker].dropna().to_numpy(dtype=float)
        if len(c) < MIN_HISTORY:
            continue

        def mom(lookback, skip=0):
            past = max(0, len(c) - lookback - skip - 1)
            skip_to = max(0, len(c) - skip - 1) if skip > 0 else len(c) - 1
            if past >= skip_to or c[past] == 0:
                return np.nan
            return (c[skip_to] / c[past]) - 1

        m12_1 = mom(252, skip=21)   # Jegadeesh-Titman
        m6m   = mom(126, skip=21)

        # Low-vol: 63-day annualised vol (lower = better → invert later)
        if len(c) >= 63:
            ret63 = np.diff(c[-64:]) / c[-64:-1]
            vol63 = float(np.std(ret63) * np.sqrt(252))
        else:
            vol63 = np.nan

        rsi_val = _rsi(c)

        scores[ticker] = {
            "m12_1": m12_1,
            "m6m":   m6m,
            "vol63": vol63,
            "rsi":   rsi_val,
        }

    if not scores:
        return pd.Series(dtype=float)

    tickers_with_data = list(scores.keys())
    mom12_vals = pd.Series({t: scores[t]["m12_1"] for t in tickers_with_data}).dropna()
    mom6_vals  = pd.Series({t: scores[t]["m6m"]   for t in tickers_with_data}).dropna()
    vol_vals   = pd.Series({t: scores[t]["vol63"]  for t in tickers_with_data}).dropna()
    rsi_vals   = pd.Series({t: scores[t]["rsi"]    for t in tickers_with_data}).dropna()

    def pctile_score(series: pd.Series, all_vals: pd.Series, invert=False) -> pd.Series:
        """Map each value to its cross-sectional percentile (0–10 scale)."""
        if all_vals.empty:
            return pd.Series(5.0, index=series.index)
        pctile = series.apply(lambda v: (all_vals <= v).mean() * 100)
        if invert:
            pctile = 100 - pctile
        return pctile / 10.0   # 0–10

    result = {}
    for t in tickers_with_data:
        parts = []
        wt    = []

        if t in mom12_vals.index:
            score_12 = pctile_score(pd.Series([mom12_vals[t]], index=[t]), mom12_vals)
            parts.append(float(score_12.iloc[0]) * 0.40)
            wt.append(0.40)

        if t in mom6_vals.index:
            score_6 = pctile_score(pd.Series([mom6_vals[t]], index=[t]), mom6_vals)
            parts.append(float(score_6.iloc[0]) * 0.30)
            wt.append(0.30)

        if t in vol_vals.index:
            score_v = pctile_score(pd.Series([vol_vals[t]], index=[t]), vol_vals, invert=True)
            parts.append(float(score_v.iloc[0]) * 0.20)
            wt.append(0.20)

        if t in rsi_vals.index:
            # RSI 30–60 = healthy, not overbought → penalise extremes
            rsi_raw = rsi_vals[t]
            rsi_score = float(10.0 * (1 - abs(rsi_raw - 50) / 50)) * 0.10
            parts.append(rsi_score)
            wt.append(0.10)

        if not parts:
            continue
        total_w = sum(wt)
        result[t] = sum(parts) / total_w * 10.0 / 10.0   # already 0–10 weighted avg

    return pd.Series(result).dropna()


# ---------------------------------------------------------------------------
# Walk-forward portfolio simulation
# ---------------------------------------------------------------------------

def _compute_backtest_stats(df: pd.DataFrame) -> dict:
    """Compute risk/return stats from a date-indexed portfolio+benchmark df."""
    if len(df) < 2:
        return {}
    days  = max((df["date"].iloc[-1] - df["date"].iloc[0]).days, 1)
    years = max(days / 365.25, 0.01)

    port_ret  = (df["portfolio"].iloc[-1] / df["portfolio"].iloc[0]) - 1
    bench_ret = (df["benchmark"].iloc[-1] / df["benchmark"].iloc[0]) - 1
    cagr      = (1 + port_ret) ** (1 / years) - 1
    bench_cagr = (1 + bench_ret) ** (1 / years) - 1

    daily_pr = df["portfolio"].pct_change().dropna()
    daily_br = df["benchmark"].pct_change().dropna()
    ann_vol  = float(daily_pr.std() * np.sqrt(252)) if len(daily_pr) > 1 else 0
    sharpe   = (cagr - RISK_FREE_RATE) / ann_vol if ann_vol > 0 else 0

    cum_max = df["portfolio"].cummax()
    max_dd  = float(((df["portfolio"] / cum_max) - 1).min())

    te      = float((daily_pr - daily_br).std() * np.sqrt(252)) if len(daily_pr) > 1 else 0
    ir      = (cagr - bench_cagr) / te if te > 0 else 0
    win_rt  = float((daily_pr > 0).mean() * 100)

    return {
        "total_return": round(port_ret * 100, 2),
        "cagr":         round(cagr * 100, 2),
        "volatility":   round(ann_vol * 100, 2),
        "sharpe":       round(sharpe, 2),
        "max_drawdown": round(max_dd * 100, 2),
        "info_ratio":   round(ir, 2),
        "win_rate":     round(win_rt, 1),
    }


def run_walkforward_backtest(
    score_fn,
    prices: pd.DataFrame,
    volumes: pd.DataFrame,
    highs: pd.DataFrame,
    lows: pd.DataFrame,
    all_tickers: list,
    horizon_days: int,
    top_n: int = TOP_N,
    rebalance_every: int = REBALANCE_EVERY,
    label: str = "Portfolio",
    as_of_date: str | None = None,   # cap simulation at this date (YYYY-MM-DD)
    weighting_scheme: str = "equal",  # "equal", "volatility_parity", or "score_weighted"
    stop_loss_pct: float = 0.0,      # e.g. 0.08 for 8% stop loss, 0.0 for none
) -> dict:
    """
    Walk-forward backtest.

    Args:
      score_fn          — callable(prices, volumes, highs, lows, tickers, idx) → pd.Series
      horizon_days      — number of trailing *trading* days to simulate over (252=1Y, 126=6M)
      as_of_date        — if provided, treat this date as 'today' (no data beyond it used)
      weighting_scheme  — position allocation ("equal", "volatility_parity", or "score_weighted")
      stop_loss_pct     — trailing stop loss threshold (0.0 to disable)
      Returns dict: {chart, holdings, stats}
    """
    dates = prices.index
    total_bars = len(dates)

    # ── Determine end bar (cap at as_of_date if provided) ───────────────────
    if as_of_date is not None:
        as_of_ts = pd.Timestamp(as_of_date)
        mask = dates <= as_of_ts
        if not mask.any():
            return {"chart": [], "holdings": [], "stats": {},
                    "error": f"as_of_date {as_of_date} is before data start"}
        end_bar = int(mask.sum()) - 1
    else:
        end_bar = total_bars - 1

    # ── Determine simulation window ──────────────────────────────────────────
    window_start = max(MIN_HISTORY, end_bar - horizon_days + 1)
    sim_dates_idx = list(range(window_start, end_bar + 1, rebalance_every))

    bench = "^NSEI"
    has_bench = bench in prices.columns

    # Compute daily returns for all tickers (we'll use them to track portfolio)
    returns_all = prices.pct_change()

    portfolio_value = 100.0
    benchmark_value = 100.0

    chart_data  = []
    holdings_log = []

    # Initialise values on the day before the first rebalance
    first_bar = window_start
    if first_bar > 0:
        chart_data.append({
            "date":      dates[first_bar - 1],
            "portfolio": portfolio_value,
            "benchmark": benchmark_value,
        })

    current_holdings: list[str] = []

    for i, idx in enumerate(sim_dates_idx):
        # Score all tickers using data up to (and including) idx — look-ahead free
        scores = score_fn(prices, volumes, highs, lows, all_tickers, idx)

        # Filter: must have price data on this day
        valid = [t for t in scores.index if t in prices.columns and not np.isnan(prices.iloc[idx].get(t, np.nan))]
        scores = scores.loc[[t for t in scores.index if t in valid]]

        top_picks = scores.nlargest(top_n).index.tolist()
        if not top_picks:
            top_picks = current_holdings  # hold previous if scoring fails

        current_holdings = top_picks

        # Calculate position weights
        weights = {}
        if weighting_scheme == "score_weighted" and not scores.empty:
            pick_scores = scores.loc[[t for t in top_picks if t in scores.index]]
            score_sum = pick_scores.sum()
            if score_sum > 0:
                weights = (pick_scores / score_sum).to_dict()
        elif weighting_scheme == "volatility_parity":
            vols = {}
            for t in top_picks:
                sub_prices = prices[t].iloc[max(0, idx - 60):idx + 1].dropna()
                if len(sub_prices) >= 10:
                    v = float(sub_prices.pct_change().std())
                    vols[t] = 1.0 / v if v > 0 else 1.0
                else:
                    vols[t] = 1.0
            total_inv_vol = sum(vols.values())
            if total_inv_vol > 0:
                weights = {t: vols[t] / total_inv_vol for t in top_picks}

        # Fallback to equal weighting if unassigned or equal requested
        if not weights:
            n_picks = max(len(top_picks), 1)
            weights = {t: 1.0 / n_picks for t in top_picks}

        # Entry prices for stop-loss monitoring
        entry_prices = {t: float(prices[t].iloc[idx]) for t in top_picks if t in prices.columns}
        stopped_out = set()

        # Determine hold period
        next_idx = sim_dates_idx[i + 1] if i + 1 < len(sim_dates_idx) else end_bar
        period_range = range(idx + 1, min(next_idx + 1, end_bar + 1))

        holdings_log.append({
            "from":    str(dates[idx].date()),
            "to":      str(dates[min(next_idx, end_bar)].date()),
            "tickers": top_picks,
            "weights": {t: round(w, 4) for t, w in weights.items()},
        })

        for bar_idx in period_range:
            if bar_idx > end_bar:
                break
            row = returns_all.iloc[bar_idx]

            valid_picks = [t for t in top_picks if t in row.index and not np.isnan(row[t])]
            
            # Check stop loss if enabled
            if stop_loss_pct > 0:
                for t in valid_picks:
                    if t not in stopped_out and t in entry_prices:
                        curr_p = float(prices[t].iloc[bar_idx])
                        ent_p = entry_prices[t]
                        if ent_p > 0 and (curr_p / ent_p - 1.0) <= -stop_loss_pct:
                            stopped_out.add(t)

            active_picks = [t for t in valid_picks if t not in stopped_out]
            
            if active_picks:
                active_weight_sum = sum(weights.get(t, 0.0) for t in active_picks)
                if active_weight_sum > 0:
                    daily_ret = float(sum(row[t] * (weights.get(t, 0.0) / active_weight_sum) for t in active_picks))
                else:
                    daily_ret = 0.0
            else:
                daily_ret = 0.0

            portfolio_value *= (1 + daily_ret)

            if has_bench:
                br = row.get(bench, 0.0)
                bench_ret = float(br) if not np.isnan(br) else 0.0
            else:
                bench_ret = 0.0
            benchmark_value *= (1 + bench_ret)

            chart_data.append({
                "date":      dates[bar_idx],
                "portfolio": portfolio_value,
                "benchmark": benchmark_value,
            })

    if not chart_data:
        return {"chart": [], "holdings": [], "stats": {}}

    df = pd.DataFrame(chart_data)
    df = df.drop_duplicates(subset=["date"], keep="last")
    df = df.sort_values("date")

    chart_records = [
        {
            "date":      str(r["date"].date()),
            "portfolio": round(r["portfolio"], 2),
            "benchmark": round(r["benchmark"], 2),
        }
        for _, r in df.iterrows()
    ]

    stats = _compute_backtest_stats(df)
    return {"chart": chart_records, "holdings": holdings_log, "stats": stats}


# ---------------------------------------------------------------------------
# Main entry point — run all 4 combinations
# ---------------------------------------------------------------------------

def run_all_backtests() -> dict:
    """
    Run all 4 backtest combinations (using full OHLCV history, no as_of_date cap).

    Returns a dict with keys:
      backtest_short_1y, backtest_short_6m,
      backtest_long_1y,  backtest_long_6m
    """
    import logging
    logger = logging.getLogger("backtest_engine")
    logger.info("Loading OHLCV data for walk-forward backtest...")

    prices, volumes, highs, lows, all_tickers = load_ohlcv()
    logger.info(f"Loaded {len(prices.columns)} tickers, {len(prices)} trading days "
                f"({prices.index[0].date()} → {prices.index[-1].date()})")

    # Short-term scoring wrapper (needs volumes)
    def short_fn(prices, volumes, highs, lows, tickers, idx):
        return compute_short_score_at(prices, volumes, highs, lows, tickers, idx)

    # Long-term scoring wrapper (volumes unused)
    def long_fn(prices, volumes, highs, lows, tickers, idx):
        return compute_long_score_at(prices, highs, lows, tickers, idx)

    results = {}
    configs = [
        ("backtest_short_1y", short_fn, 252, "Short-term 1Y"),
        ("backtest_short_6m", short_fn, 126, "Short-term 6M"),
        ("backtest_long_1y",  long_fn,  252, "Long-term 1Y"),
        ("backtest_long_6m",  long_fn,  126, "Long-term 6M"),
    ]

    for key, fn, horizon, label in configs:
        logger.info(f"Running {label} backtest ({horizon} trading days)...")
        try:
            result = run_walkforward_backtest(
                score_fn=fn,
                prices=prices, volumes=volumes,
                highs=highs, lows=lows,
                all_tickers=all_tickers,
                horizon_days=horizon,
                label=label,
            )
            n_pts = len(result.get("chart", []))
            logger.info(f"  {label}: {n_pts} data points, stats={result.get('stats', {})}")
            results[key] = result
        except Exception as e:
            logger.error(f"  {label} failed: {e}", exc_info=True)
            results[key] = {"chart": [], "holdings": [], "stats": {}}

    return results


# ---------------------------------------------------------------------------
# On-demand custom backtest (with caching)
# ---------------------------------------------------------------------------

def run_custom_backtest(
    as_of_date: str,
    model: str,     # 'short' or 'long'
    horizon: str,   # '1y' or '6m'
    force: bool = False,
) -> dict:
    """
    Run a backtest as-of a specific date, using the cache.

    Args:
      as_of_date  — 'YYYY-MM-DD'; backtest uses only data up to this date
      model       — 'short' (Tech+Momentum) or 'long' (Momentum+LowVol)
      horizon     — '1y' (252 trading days) or '6m' (126 trading days)
      force       — if True, re-run even if cached

    Returns dict: {chart, holdings, stats, cached, as_of_date, model, horizon}
    """
    import logging
    logger = logging.getLogger("backtest_engine")

    # Normalise
    as_of_date = str(as_of_date).strip()
    model      = model.strip().lower()
    horizon    = horizon.strip().lower()
    assert model   in ('short', 'long'), f"model must be 'short' or 'long', got {model!r}"
    assert horizon in ('1y', '6m'),      f"horizon must be '1y' or '6m', got {horizon!r}"

    # Check cache first
    if not force:
        cached = _check_cache(as_of_date, model, horizon)
        if cached:
            logger.info(f"Cache hit: {model}/{horizon} as_of {as_of_date}")
            cached["cached"] = True
            cached["as_of_date"] = as_of_date
            cached["model"]      = model
            cached["horizon"]    = horizon
            return cached

    logger.info(f"Running {model}/{horizon} backtest as_of {as_of_date} ...")
    prices, volumes, highs, lows, all_tickers = load_ohlcv()

    horizon_days = 252 if horizon == '1y' else 126

    if model == 'short':
        def score_fn(prices, volumes, highs, lows, tickers, idx):
            return compute_short_score_at(prices, volumes, highs, lows, tickers, idx)
    else:
        def score_fn(prices, volumes, highs, lows, tickers, idx):
            return compute_long_score_at(prices, highs, lows, tickers, idx)

    result = run_walkforward_backtest(
        score_fn=score_fn,
        prices=prices, volumes=volumes,
        highs=highs, lows=lows,
        all_tickers=all_tickers,
        horizon_days=horizon_days,
        as_of_date=as_of_date,
        label=f"{model}/{horizon} as_of {as_of_date}",
    )

    # Determine data range actually used
    chart = result.get("chart", [])
    data_start = chart[0]["date"]  if chart else ""
    data_end   = chart[-1]["date"] if chart else ""

    # Store in SQLite
    _store_cache(as_of_date, model, horizon, result, data_start, data_end)

    # Write static JSON files so Vercel can serve them
    export_backtest_index()

    result["cached"]     = False
    result["as_of_date"] = as_of_date
    result["model"]      = model
    result["horizon"]    = horizon
    logger.info(f"  Done: {len(chart)} pts | stats={result.get('stats',{})}")
    return result


def export_backtest_index():
    """
    Export all cached backtest runs to static JSON files in frontend/public/backtest_runs/.
    Writes:
      index.json            — lightweight list of all runs (no chart data)
      {model}-{horizon}-{date}.json  — full run data (chart + holdings + stats)
    """
    _ensure_cache_table()
    os.makedirs(RUNS_DIR, exist_ok=True)

    conn = sqlite3.connect(DB_PATH)
    rows = conn.execute(
        """SELECT as_of_date, model, horizon, created_at,
                  data_start, data_end, n_chart_pts, stats_json,
                  chart_json, holdings_json
           FROM backtest_cache ORDER BY created_at DESC"""
    ).fetchall()
    conn.close()

    index = []
    for row in rows:
        (as_of_date, model, horizon, created_at,
         data_start, data_end, n_chart_pts,
         stats_json, chart_json, holdings_json) = row

        stats = json.loads(stats_json) if stats_json else {}
        slug  = f"{model}-{horizon}-{as_of_date}"

        # Write individual run file
        run_path = os.path.join(RUNS_DIR, f"{slug}.json")
        run_data = {
            "as_of_date":  as_of_date,
            "model":       model,
            "horizon":     horizon,
            "created_at":  created_at,
            "data_start":  data_start,
            "data_end":    data_end,
            "stats":       stats,
            "chart":       json.loads(chart_json)    if chart_json    else [],
            "holdings":    json.loads(holdings_json) if holdings_json else [],
        }
        with open(run_path, "w") as f:
            json.dump(run_data, f, separators=(',', ':'))

        # Index entry (no chart/holdings data to keep it small)
        index.append({
            "slug":        slug,
            "as_of_date":  as_of_date,
            "model":       model,
            "horizon":     horizon,
            "created_at":  created_at,
            "data_start":  data_start or "",
            "data_end":    data_end   or "",
            "n_chart_pts": n_chart_pts or 0,
            "stats":       stats,
        })

    # Write index
    index_path = os.path.join(RUNS_DIR, "index.json")
    with open(index_path, "w") as f:
        json.dump({"runs": index, "exported_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S")}, f, indent=2)

    return len(index)


# ---------------------------------------------------------------------------
# Scheduled auto-backtest: run all 4 combinations for a given date
# ---------------------------------------------------------------------------

def run_all_current_backtests(as_of_date: str | None = None, force: bool = False) -> dict:
    """
    Run (or recall from cache) all 4 backtest combinations for ``as_of_date``.

    Designed to be called by the weekend scheduler job.

    Args:
        as_of_date: 'YYYY-MM-DD' string.  Defaults to today.
        force:      Re-run even when a cached result already exists.

    Returns:
        dict mapping each slug to its result dict, e.g.:
        {
            'short-1y-2025-07-19': {...},
            'short-6m-2025-07-19': {...},
            'long-1y-2025-07-19':  {...},
            'long-6m-2025-07-19':  {...},
        }
    """
    import logging
    logger = logging.getLogger("backtest_engine")

    if as_of_date is None:
        as_of_date = datetime.now().strftime("%Y-%m-%d")

    combos = [
        ("short", "1y"),
        ("short", "6m"),
        ("long",  "1y"),
        ("long",  "6m"),
    ]

    results = {}
    for model, horizon in combos:
        slug = f"{model}-{horizon}-{as_of_date}"
        logger.info(f"Auto-backtest: {slug} ...")
        try:
            result = run_custom_backtest(as_of_date, model, horizon, force=force)
            results[slug] = result
            cached_flag = "cache hit" if result.get("cached") else "computed"
            logger.info(f"  {slug}: {cached_flag}, stats={result.get('stats', {})}")
        except Exception as exc:
            logger.error(f"  {slug} failed: {exc}", exc_info=True)
            results[slug] = {"error": str(exc)}

    # Re-export the full index (includes all historical runs, not just today's)
    try:
        n = export_backtest_index()
        logger.info(f"Exported backtest index ({n} total runs).")
    except Exception as exc:
        logger.warning(f"export_backtest_index failed: {exc}")

    return results


if __name__ == "__main__":
    import logging
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    results = run_all_backtests()
    for key, val in results.items():
        n = len(val.get("chart", []))
        s = val.get("stats", {})
        print(f"\n{key}: {n} chart pts")
        print(f"  CAGR={s.get('cagr','?')}%  Sharpe={s.get('sharpe','?')}  MaxDD={s.get('max_drawdown','?')}%")
