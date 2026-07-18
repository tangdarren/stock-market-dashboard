"""Normalize OHLCV frames from any source into a single canonical schema.

Both yfinance (training) and Alpha Vantage (runtime) are funnelled through
:func:`normalize_ohlcv`. The output frame uses *unadjusted* prices and lower-case
column names so downstream feature builders and stored artifacts can rely on a
single convention.
"""

from __future__ import annotations

from collections.abc import Iterable

import pandas as pd

CANONICAL_COLUMNS: tuple[str, ...] = ("date", "open", "high", "low", "close", "volume")


class OHLCVSchemaError(ValueError):
    """The input frame did not contain the expected OHLCV columns."""


def normalize_ohlcv(df: pd.DataFrame, *, source: str) -> pd.DataFrame:
    """Return a canonical unadjusted OHLCV frame sorted by ascending date.

    - Column names are lower-cased.
    - The ``date`` column is a naive ``pandas.Timestamp`` normalized to midnight
      (represents the calendar trading date in America/New_York).
    - OHLC are floats; ``volume`` is int64.
    - Duplicate dates are removed (last occurrence wins).
    """
    if df is None or df.empty:
        raise OHLCVSchemaError(f"{source}: empty OHLCV frame")

    working = df.copy()

    if not isinstance(working.index, pd.RangeIndex):
        working = working.reset_index()

    working.columns = [str(c).strip().lower().replace(" ", "_") for c in working.columns]

    date_col = _first_present(working, ("date", "datetime", "timestamp", "index"))
    if date_col is None:
        raise OHLCVSchemaError(f"{source}: could not locate a date column")

    if date_col != "date":
        working = working.rename(columns={date_col: "date"})

    for col in ("open", "high", "low", "close", "volume"):
        if col not in working.columns:
            raise OHLCVSchemaError(f"{source}: missing required column '{col}'")

    working["date"] = pd.to_datetime(working["date"], errors="coerce").dt.tz_localize(None).dt.normalize()
    if working["date"].isna().any():
        raise OHLCVSchemaError(f"{source}: unparseable dates present")

    for col in ("open", "high", "low", "close"):
        working[col] = pd.to_numeric(working[col], errors="coerce").astype("float64")
    working["volume"] = pd.to_numeric(working["volume"], errors="coerce").fillna(0).astype("int64")

    working = working[list(CANONICAL_COLUMNS)]
    working = working.dropna(subset=("open", "high", "low", "close"))
    working = working.drop_duplicates(subset=("date",), keep="last")
    working = working.sort_values("date").reset_index(drop=True)

    if working.empty:
        raise OHLCVSchemaError(f"{source}: no valid rows after cleaning")

    return working


def normalize_alpha_vantage_daily(payload: dict) -> pd.DataFrame:
    """Convert an Alpha Vantage TIME_SERIES_DAILY payload to a canonical frame."""
    series = payload.get("Time Series (Daily)")
    if not series:
        raise OHLCVSchemaError("alpha_vantage: 'Time Series (Daily)' missing from response")

    rows = []
    for iso_date, row in series.items():
        rows.append(
            {
                "date": iso_date,
                "open": row.get("1. open"),
                "high": row.get("2. high"),
                "low": row.get("3. low"),
                "close": row.get("4. close"),
                "volume": row.get("5. volume"),
            }
        )
    frame = pd.DataFrame(rows)
    return normalize_ohlcv(frame, source="alpha_vantage")


def _first_present(df: pd.DataFrame, candidates: Iterable[str]) -> str | None:
    for c in candidates:
        if c in df.columns:
            return c
    return None
