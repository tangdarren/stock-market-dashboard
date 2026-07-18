from __future__ import annotations

import httpx
import pytest

from app.clients.alpha_vantage import (
    AlphaVantageClient,
    AlphaVantageError,
    AlphaVantageMissingKeyError,
    AlphaVantageThrottledError,
    sanitize_url_for_logging,
)


def test_sanitize_url_for_logging_removes_key():
    url = "https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=SPY&apikey=SECRETKEY"
    sanitized = sanitize_url_for_logging(url)
    assert "SECRETKEY" not in sanitized
    assert "apikey=REDACTED" in sanitized


def test_sanitize_url_no_params():
    assert sanitize_url_for_logging("https://example.com/path") == "https://example.com/path"


@pytest.mark.asyncio
async def test_client_raises_without_key():
    async with AlphaVantageClient(api_key="") as client:
        with pytest.raises(AlphaVantageMissingKeyError):
            await client.get({"function": "TIME_SERIES_DAILY", "symbol": "SPY"})


@pytest.mark.asyncio
async def test_client_raises_on_throttle_note(httpx_mock):
    httpx_mock.add_response(
        method="GET",
        url=httpx.URL(
            "https://www.alphavantage.co/query",
            params={
                "function": "TIME_SERIES_DAILY",
                "symbol": "SPY",
                "outputsize": "compact",
                "apikey": "TESTKEY",
            },
        ),
        json={"Note": "Rate limit reached"},
    )

    async with AlphaVantageClient(api_key="TESTKEY", max_attempts=1) as client:
        with pytest.raises(AlphaVantageThrottledError):
            await client.daily_time_series("SPY")


@pytest.mark.asyncio
async def test_client_raises_on_error_message(httpx_mock):
    httpx_mock.add_response(
        method="GET",
        json={"Error Message": "Invalid API call"},
    )

    async with AlphaVantageClient(api_key="TESTKEY", max_attempts=1) as client:
        with pytest.raises(AlphaVantageError):
            await client.daily_time_series("SPY")


@pytest.mark.asyncio
async def test_client_success_returns_payload(httpx_mock):
    payload = {
        "Time Series (Daily)": {
            "2024-01-02": {
                "1. open": "500.00",
                "2. high": "501.00",
                "3. low": "498.00",
                "4. close": "500.50",
                "5. volume": "1234",
            }
        }
    }
    httpx_mock.add_response(method="GET", json=payload)

    async with AlphaVantageClient(api_key="TESTKEY") as client:
        response = await client.daily_time_series("SPY")

    assert "Time Series (Daily)" in response
