"""Back-adjust price discontinuities the vendor left unadjusted.

Yahoo's "adjusted" NSE histories still contain demergers, some splits/bonuses
and occasional bad bars as raw overnight jumps (e.g. VEDL 758 -> 266 on its
2026 demerger date). A shareholder did not lose that value, but momentum, trend
and volatility read it as a crash for up to a year.

NSE's pre-open session limits a normal overnight move to 20%, so an opening
gap beyond OVERNIGHT_LIMIT is a corporate action or a data fault, never an
ordinary market move. Real crashes (IEX -30%, IndusInd -27%) open inside the
band and fall intraday; they are left untouched. Earlier bars are rescaled by
the gap ratio, and volume inversely so traded value is preserved.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

OVERNIGHT_LIMIT = 0.22        # |open / previous close - 1| beyond the exchange band
CLOSE_ONLY_LIMITS = (-0.35, 0.50)  # fallback when no usable open exists
MAX_BAR_SPACING_DAYS = 10     # a relisting after a long suspension is a real repricing
PRICE_COLUMNS = ('Open', 'High', 'Low', 'Close')


def discontinuity_factors(opens, closes, dates) -> np.ndarray:
    """Multiplier for each bar that makes the series continuous with its latest bars."""
    closes = np.asarray(closes, dtype=float)
    opens = np.asarray(opens, dtype=float) if opens is not None else np.full(len(closes), np.nan)
    factors = np.ones(len(closes))
    if len(closes) < 2:
        return factors
    days = pd.DatetimeIndex(dates)
    previous = closes[:-1]
    spacing = np.asarray((days[1:] - days[:-1]).days)
    with np.errstate(divide='ignore', invalid='ignore'):
        overnight = opens[1:] / previous
        session = closes[1:] / previous
    usable_open = np.isfinite(overnight) & (opens[1:] > 0)
    jump = np.where(usable_open, np.abs(overnight - 1) > OVERNIGHT_LIMIT,
                    (session - 1 < CLOSE_ONLY_LIMITS[0]) | (session - 1 > CLOSE_ONLY_LIMITS[1]))
    ratio = np.where(usable_open, overnight, session)
    jump &= np.isfinite(ratio) & (ratio > 0) & (previous > 0) & (spacing <= MAX_BAR_SPACING_DAYS)
    step = np.where(jump, ratio, 1.0)
    # Bar i is scaled by every jump that happens after it.
    factors[:-1] = np.cumprod(step[::-1])[::-1]
    return factors


def repair_discontinuities(frame: pd.DataFrame) -> pd.DataFrame:
    """Return one ticker's OHLCV history with unadjusted jumps removed. Idempotent."""
    if frame is None or len(frame) < 2 or 'Close' not in frame:
        return frame
    valid = pd.to_numeric(frame['Close'], errors='coerce') > 0
    if valid.sum() < 2:
        return frame
    part = frame.loc[valid]
    factors = discontinuity_factors(part['Open'] if 'Open' in part else None, part['Close'], part.index)
    if np.allclose(factors, 1.0):
        return frame
    scale = pd.Series(1.0, index=frame.index)
    scale.loc[valid] = factors
    # Bars without a close inherit the adjustment of the next valid bar.
    scale = scale.where(valid).bfill().fillna(1.0)
    repaired = frame.copy()
    for column in PRICE_COLUMNS:
        if column in repaired:
            repaired[column] = pd.to_numeric(repaired[column], errors='coerce') * scale
    if 'Volume' in repaired:
        repaired['Volume'] = pd.to_numeric(repaired['Volume'], errors='coerce') / scale
    return repaired


def repair_long(data: pd.DataFrame) -> pd.DataFrame:
    """Repair a long (Ticker, Date, Open?, High?, Low?, Close, Volume?) table."""
    if data.empty:
        return data
    data = data.sort_values(['Ticker', 'Date'], kind='stable').copy()
    dates = pd.to_datetime(data['Date'])
    scale = np.ones(len(data))
    position = 0
    for _, group in data.groupby('Ticker', sort=False):
        size = len(group)
        ok = (pd.to_numeric(group['Close'], errors='coerce') > 0).to_numpy()
        if ok.sum() >= 2:
            factors = discontinuity_factors(group['Open'].to_numpy()[ok] if 'Open' in group else None,
                                            group['Close'].to_numpy()[ok], dates.iloc[position:position + size][ok])
            block = pd.Series(np.nan, index=range(size))
            block[np.flatnonzero(ok)] = factors
            scale[position:position + size] = block.bfill().fillna(1.0).to_numpy()
        position += size
    for column in PRICE_COLUMNS:
        if column in data:
            data[column] = data[column] * scale
    if 'Volume' in data:
        data['Volume'] = data['Volume'] / scale
    return data
