from __future__ import annotations

import pandas as pd
import pytest

from app.ml.normalize import (
    CANONICAL_COLUMNS,
    OHLCVSchemaError,
    normalize_alpha_vantage_daily,
    normalize_ohlcv,
)


def test_normalize_ohlcv_from_yfinance_shape():
    df = pd.DataFrame(
        {
            "Date": pd.date_range("2024-01-01", periods=3, freq="D"),
            "Open": [100, 101, 102],
            "High": [101, 102, 103],
            "Low": [99, 100, 101],
            "Close": [100.5, 101.5, 102.5],
            "Volume": [1_000_000, 900_000, 950_000],
        }
    )
    n = normalize_ohlcv(df, source="test")
    assert list(n.columns) == list(CANONICAL_COLUMNS)
    assert n["volume"].dtype == "int64"
    assert (n["date"] == n["date"].dt.normalize()).all()


def test_normalize_removes_duplicates_and_sorts():
    df = pd.DataFrame(
        {
            "date": ["2024-01-02", "2024-01-01", "2024-01-02"],
            "open": [1, 2, 3],
            "high": [1, 2, 3],
            "low": [1, 2, 3],
            "close": [1, 2, 3],
            "volume": [1, 2, 3],
        }
    )
    n = normalize_ohlcv(df, source="test")
    assert len(n) == 2
    assert n["date"].iloc[0] < n["date"].iloc[1]
    assert n.iloc[1]["close"] == 3  # last duplicate wins


def test_normalize_raises_on_missing_column():
    df = pd.DataFrame({"date": ["2024-01-01"], "open": [1], "high": [1], "low": [1], "close": [1]})
    with pytest.raises(OHLCVSchemaError):
        normalize_ohlcv(df, source="test")


def test_alpha_vantage_daily_normalization():
    payload = {
        "Time Series (Daily)": {
            "2024-01-03": {
                "1. open": "500.10",
                "2. high": "502.00",
                "3. low": "499.50",
                "4. close": "501.00",
                "5. volume": "80000000",
            },
            "2024-01-02": {
                "1. open": "499.00",
                "2. high": "501.00",
                "3. low": "498.00",
                "4. close": "500.00",
                "5. volume": "70000000",
            },
        }
    }
    n = normalize_alpha_vantage_daily(payload)
    assert list(n.columns) == list(CANONICAL_COLUMNS)
    assert n.iloc[0]["date"] < n.iloc[1]["date"]
    assert n.iloc[-1]["close"] == pytest.approx(501.0)
