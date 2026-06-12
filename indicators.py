"""
indicators.py
-------------
Technical indicator calculations.

Indicators added in this version:
  • ATR  (Average True Range, Wilder's smoothing)
  • ADX  (Average Directional Index + ±DI lines, Wilder's smoothing)
  • Supertrend  (10-period, 3× multiplier)
"""

import pandas as pd
import numpy as np


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

def add_indicators(df: pd.DataFrame) -> pd.DataFrame:
    close = df["Close"]
    high  = df["High"]
    low   = df["Low"]
    vol   = df["Volume"]

    # ── Moving Averages ──────────────────────────────────────────────────────
    for w in [10, 20, 50, 200]:
        df[f"SMA_{w}"] = close.rolling(w).mean()
    df["EMA_12"] = close.ewm(span=12, adjust=False).mean()
    df["EMA_26"] = close.ewm(span=26, adjust=False).mean()

    # ── MACD ─────────────────────────────────────────────────────────────────
    df["MACD"]        = df["EMA_12"] - df["EMA_26"]
    df["MACD_Signal"] = df["MACD"].ewm(span=9, adjust=False).mean()
    df["MACD_Hist"]   = df["MACD"] - df["MACD_Signal"]

    # ── RSI (14-period, Wilder's smoothing) ──────────────────────────────────
    delta = close.diff()
    gain  = delta.clip(lower=0)
    loss  = -delta.clip(upper=0)
    
    smoothed_gain = _wilder_smoothing(gain, 14)
    smoothed_loss = _wilder_smoothing(loss, 14)
    
    rs = smoothed_gain / smoothed_loss.replace(0, np.nan)
    df["RSI"] = np.where(smoothed_loss == 0, 100, 100 - (100 / (1 + rs)))

    # ── Bollinger Bands ───────────────────────────────────────────────────────
    df["BB_Mid"]   = close.rolling(20).mean()
    bb_std         = close.rolling(20).std()
    df["BB_Upper"] = df["BB_Mid"] + 2 * bb_std
    df["BB_Lower"] = df["BB_Mid"] - 2 * bb_std
    df["BB_%B"]    = (close - df["BB_Lower"]) / (
        df["BB_Upper"] - df["BB_Lower"]).replace(0, np.nan)

    # ── Stochastic Oscillator ─────────────────────────────────────────────────
    lo14 = low.rolling(14).min()
    hi14 = high.rolling(14).max()
    df["Stoch_%K"] = 100 * (close - lo14) / (hi14 - lo14).replace(0, np.nan)
    df["Stoch_%D"] = df["Stoch_%K"].rolling(3).mean()

    # ── Volume MA ─────────────────────────────────────────────────────────────
    df["VOL_MA20"] = vol.rolling(20).mean()

    # ── CCI ──────────────────────────────────────────────────────────────────
    tp         = (high + low + close) / 3
    df["CCI"]  = (tp - tp.rolling(20).mean()) / (
        0.015 * tp.rolling(20).std().replace(0, np.nan))

    # ── NEW: ATR (Wilder's smoothing) ────────────────────────────────────────
    df = _add_atr(df, period=14)

    # ── NEW: ADX + ±DI (Wilder's smoothing) ──────────────────────────────────
    df = _add_adx(df, period=14)

    # ── NEW: Supertrend ───────────────────────────────────────────────────────
    df = _add_supertrend(df, period=10, multiplier=3.0)

    # ── NEW: Weekly Supertrend ───────────────────────────────────────────────
    df = add_weekly_supertrend(df)

    # ── NEW: VPT (Volume Price Trend) ─────────────────────────────────────────
    df = _add_vpt(df)
    
    # ── NEW: Ichimoku Cloud ───────────────────────────────────────────────────
    df = _add_ichimoku(df)

    return df

# ---------------------------------------------------------------------------
# Wilder's Smoothing
# ---------------------------------------------------------------------------

def _wilder_smoothing(s: pd.Series, period: int) -> pd.Series:
    res = np.full_like(s, np.nan, dtype=float)
    s_arr = s.to_numpy()
    
    valid_idx = np.where(~np.isnan(s_arr))[0]
    if len(valid_idx) < period:
        return pd.Series(res, index=s.index)
        
    start = valid_idx[0]
    if start + period > len(s_arr):
        return pd.Series(res, index=s.index)
        
    # Seed with SMA
    sma = np.mean(s_arr[start:start+period])
    res[start+period-1] = sma
    
    for i in range(start+period, len(s_arr)):
        res[i] = (res[i-1] * (period - 1) + s_arr[i]) / period
        
    return pd.Series(res, index=s.index)


# ---------------------------------------------------------------------------
# ATR
# ---------------------------------------------------------------------------

def _add_atr(df: pd.DataFrame, period: int = 14) -> pd.DataFrame:
    """
    Average True Range using Wilder's smoothing (alpha = 1/period).
    True Range = max(H-L, |H-Cprev|, |L-Cprev|)
    """
    high       = df["High"]
    low        = df["Low"]
    prev_close = df["Close"].shift(1)

    tr = pd.concat([
        high - low,
        (high - prev_close).abs(),
        (low  - prev_close).abs(),
    ], axis=1).max(axis=1)

    df["ATR"] = tr.ewm(alpha=1 / period, adjust=False).mean()
    return df


# ---------------------------------------------------------------------------
# ADX
# ---------------------------------------------------------------------------

def _add_adx(df: pd.DataFrame, period: int = 14) -> pd.DataFrame:
    """
    Average Directional Index with Wilder's smoothing.
    Stores: ADX, Plus_DI (+DI), Minus_DI (-DI).
    """
    high     = df["High"]
    low      = df["Low"]
    atr      = df["ATR"]
    alpha    = 1.0 / period

    up_move   = high.diff()
    down_move = -low.diff()

    plus_dm  = pd.Series(
        np.where((up_move > down_move) & (up_move > 0), up_move, 0.0),
        index=df.index,
    )
    minus_dm = pd.Series(
        np.where((down_move > up_move) & (down_move > 0), down_move, 0.0),
        index=df.index,
    )

    smoothed_plus  = plus_dm.ewm(alpha=alpha, adjust=False).mean()
    smoothed_minus = minus_dm.ewm(alpha=alpha, adjust=False).mean()
    safe_atr       = atr.replace(0, np.nan)

    plus_di  = 100 * smoothed_plus  / safe_atr
    minus_di = 100 * smoothed_minus / safe_atr

    dx  = 100 * (plus_di - minus_di).abs() / (plus_di + minus_di).replace(0, np.nan)
    adx = dx.ewm(alpha=alpha, adjust=False).mean()

    df["ADX"]      = adx
    df["Plus_DI"]  = plus_di
    df["Minus_DI"] = minus_di
    return df


# ---------------------------------------------------------------------------
# Supertrend
# ---------------------------------------------------------------------------

def _add_supertrend(
    df: pd.DataFrame, period: int = 10, multiplier: float = 3.0
) -> pd.DataFrame:
    """
    Supertrend indicator.

    ST_Direction convention (stored in df["ST_Direction"]):
        -1  →  Bullish  (price is above the Supertrend line = lower band)
         1  →  Bearish  (price is below the Supertrend line = upper band)
    """
    atr    = df["ATR"].to_numpy(dtype=float)
    hl_avg = ((df["High"] + df["Low"]) / 2).to_numpy(dtype=float)
    close  = df["Close"].to_numpy(dtype=float)
    n      = len(df)

    basic_upper  = hl_avg + multiplier * atr
    basic_lower  = hl_avg - multiplier * atr
    final_upper  = basic_upper.copy()
    final_lower  = basic_lower.copy()
    supertrend   = np.full(n, np.nan)
    direction    = np.ones(n, dtype=float)   # start bearish by default

    for i in range(1, n):
        if np.isnan(atr[i]) or np.isnan(atr[i - 1]):
            continue

        # ── Final Upper Band ─────────────────────────────────────────────────
        # Tighten only if new basic_upper is lower, or price broke above last upper
        if basic_upper[i] < final_upper[i - 1] or close[i - 1] > final_upper[i - 1]:
            final_upper[i] = basic_upper[i]
        else:
            final_upper[i] = final_upper[i - 1]

        # ── Final Lower Band ─────────────────────────────────────────────────
        # Widen only if new basic_lower is higher, or price broke below last lower
        if basic_lower[i] > final_lower[i - 1] or close[i - 1] < final_lower[i - 1]:
            final_lower[i] = basic_lower[i]
        else:
            final_lower[i] = final_lower[i - 1]

        # ── Direction ────────────────────────────────────────────────────────
        prev_dir = direction[i - 1]

        if prev_dir == 1:   # Previously bearish — did price break above upper band?
            direction[i] = -1 if close[i] > final_upper[i] else 1
        else:               # Previously bullish — did price break below lower band?
            direction[i] = 1 if close[i] < final_lower[i] else -1

        # Supertrend value: lower band when bullish, upper band when bearish
        supertrend[i] = final_lower[i] if direction[i] == -1 else final_upper[i]

    df["Supertrend"]   = supertrend
    df["ST_Direction"] = direction
    return df


# ---------------------------------------------------------------------------
# VPT (Volume Price Trend)
# ---------------------------------------------------------------------------

def _add_vpt(df: pd.DataFrame) -> pd.DataFrame:
    close = df["Close"]
    vol = df["Volume"]
    pct_change = close.pct_change().fillna(0)
    
    df["VPT"] = (vol * pct_change).cumsum()
    df["VPT_EMA20"] = df["VPT"].ewm(span=20, adjust=False).mean()
    return df


# ---------------------------------------------------------------------------
# Ichimoku Cloud
# ---------------------------------------------------------------------------

def _add_ichimoku(df: pd.DataFrame) -> pd.DataFrame:
    high = df["High"]
    low = df["Low"]
    
    # Tenkan-sen (9 period)
    period9_high = high.rolling(window=9).max()
    period9_low = low.rolling(window=9).min()
    df["Ichimoku_Tenkan"] = (period9_high + period9_low) / 2
    
    # Kijun-sen (26 period)
    period26_high = high.rolling(window=26).max()
    period26_low = low.rolling(window=26).min()
    df["Ichimoku_Kijun"] = (period26_high + period26_low) / 2
    
    # Senkou Span A (Current cloud level, no forward shift)
    df["Ichimoku_SpanA"] = (df["Ichimoku_Tenkan"] + df["Ichimoku_Kijun"]) / 2
    
    # Senkou Span B (52 period, current cloud level, no forward shift)
    period52_high = high.rolling(window=52).max()
    period52_low = low.rolling(window=52).min()
    df["Ichimoku_SpanB"] = (period52_high + period52_low) / 2
    
    return df


# ---------------------------------------------------------------------------
# Weekly Supertrend
# ---------------------------------------------------------------------------

def add_weekly_supertrend(df: pd.DataFrame) -> pd.DataFrame:
    """Resample to weekly to calculate weekly Supertrend."""
    if not isinstance(df.index, pd.DatetimeIndex):
        df["Weekly_ST_Direction"] = np.nan
        return df
        
    weekly_df = df.resample('W-FRI').agg({
        'Open': 'first',
        'High': 'max',
        'Low': 'min',
        'Close': 'last',
        'Volume': 'sum'
    }).dropna()
    
    if len(weekly_df) < 5:
        df["Weekly_ST_Direction"] = np.nan
        return df
        
    weekly_df = _add_atr(weekly_df, period=10)
    weekly_df = _add_supertrend(weekly_df, period=10, multiplier=3.0)
    
    weekly_dir = weekly_df["ST_Direction"].copy()
    weekly_dir.index = weekly_dir.index.tz_localize(None) if weekly_dir.index.tz else weekly_dir.index
    
    daily_idx = df.index.tz_localize(None) if df.index.tz else df.index
    
    df["Weekly_ST_Direction"] = np.nan
    
    for week_end in weekly_dir.index:
        mask = (daily_idx > week_end - pd.Timedelta(days=7)) & (daily_idx <= week_end)
        df.loc[mask, "Weekly_ST_Direction"] = weekly_dir[week_end]
    
    df["Weekly_ST_Direction"] = df["Weekly_ST_Direction"].ffill()
    
    return df


# ---------------------------------------------------------------------------
# Risk / return metrics
# ---------------------------------------------------------------------------

def compute_metrics(df: pd.DataFrame) -> dict:
    close   = df["Close"]
    returns = close.pct_change().dropna()

    n_days = len(returns)
    ann_ret = (
        (float(close.iloc[-1]) / float(close.iloc[0])) ** (252 / n_days) - 1
        if n_days > 0 else 0
    )
    ann_vol  = float(returns.std()) * np.sqrt(252) if n_days > 1 else 0
    sharpe   = (ann_ret - 0.065) / ann_vol if ann_vol else 0

    roll_max  = close.cummax()
    drawdowns = (close - roll_max) / roll_max
    max_dd    = float(drawdowns.min()) if len(drawdowns) > 0 else 0
    total_ret = (float(close.iloc[-1]) / float(close.iloc[0]) - 1) * 100 if len(df) > 1 else 0

    return {
        "Total_Return_%": round(total_ret, 2),
        "Ann_Vol_%":      round(ann_vol * 100, 2),
        "Sharpe":         round(sharpe, 3),
        "Max_Drawdown_%": round(max_dd * 100, 2),
    }