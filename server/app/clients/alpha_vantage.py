"""Async Alpha Vantage client with sanitized errors and no key leakage.

The ``apikey`` query parameter is stripped from every logged URL. Response
throttle / error envelopes (``Note``, ``Information``, ``Error Message``) are
converted into :class:`AlphaVantageError` subclasses so the rest of the app
never has to inspect Alpha Vantage's plaintext strings directly.
"""

from __future__ import annotations

import asyncio
import logging
import random
from typing import Any

import httpx

logger = logging.getLogger(__name__)

BASE_URL = "https://www.alphavantage.co/query"
DEFAULT_TIMEOUT = httpx.Timeout(10.0, connect=5.0)
MAX_ATTEMPTS = 3
BACKOFF_BASE_SECONDS = 0.5


class AlphaVantageError(RuntimeError):
    """Base class for Alpha Vantage failures. `message` is safe to expose."""

    def __init__(self, message: str, *, retryable: bool = False):
        super().__init__(message)
        self.retryable = retryable


class AlphaVantageThrottledError(AlphaVantageError):
    """Alpha Vantage returned a Note/Information throttle envelope."""

    def __init__(self, message: str):
        super().__init__(message, retryable=True)


class AlphaVantageUpstreamError(AlphaVantageError):
    """Alpha Vantage returned an Error Message envelope."""


class AlphaVantageMissingKeyError(AlphaVantageError):
    """No API key was configured."""


def sanitize_url_for_logging(url: str) -> str:
    """Return a copy of `url` with any `apikey=...` query pair stripped.

    This never mutates state and never touches the key value itself.
    """
    if "apikey" not in url:
        return url
    prefix, _, query = url.partition("?")
    if not query:
        return prefix
    parts = [p for p in query.split("&") if not p.lower().startswith("apikey=")]
    parts.append("apikey=REDACTED")
    return f"{prefix}?{'&'.join(parts)}"


def _detect_error_envelope(payload: dict[str, Any]) -> AlphaVantageError | None:
    """Turn Alpha Vantage's polite refusal messages into typed errors."""
    if "Note" in payload:
        return AlphaVantageThrottledError(
            "Alpha Vantage throttled the request (rate limit reached). "
            "Please try again shortly."
        )
    if "Information" in payload:
        info = str(payload["Information"])
        if "premium" in info.lower() or "rate limit" in info.lower():
            return AlphaVantageThrottledError(
                "Alpha Vantage returned a rate-limit or premium-only notice."
            )
    if "Error Message" in payload:
        return AlphaVantageUpstreamError(
            "Alpha Vantage rejected the request. Verify the symbol and parameters."
        )
    return None


class AlphaVantageClient:
    """Minimal async client that only exposes what the app needs."""

    def __init__(
        self,
        api_key: str,
        *,
        client: httpx.AsyncClient | None = None,
        base_url: str = BASE_URL,
        max_attempts: int = MAX_ATTEMPTS,
    ):
        self._api_key = api_key
        self._client_owned = client is None
        self._client = client or httpx.AsyncClient(timeout=DEFAULT_TIMEOUT)
        self._base_url = base_url
        self._max_attempts = max_attempts

    async def close(self) -> None:
        if self._client_owned:
            await self._client.aclose()

    async def __aenter__(self) -> AlphaVantageClient:
        return self

    async def __aexit__(self, *_: object) -> None:
        await self.close()

    async def get(self, params: dict[str, Any]) -> dict[str, Any]:
        if not self._api_key:
            raise AlphaVantageMissingKeyError(
                "Alpha Vantage API key is not configured on the backend."
            )
        request_params = dict(params)
        request_params["apikey"] = self._api_key

        last_error: Exception | None = None
        for attempt in range(1, self._max_attempts + 1):
            try:
                response = await self._client.get(self._base_url, params=request_params)
            except httpx.TimeoutException as exc:
                last_error = exc
                logger.warning(
                    "Alpha Vantage timeout (attempt %d/%d) on %s",
                    attempt,
                    self._max_attempts,
                    sanitize_url_for_logging(str(exc.request.url) if exc.request else self._base_url),
                )
                await self._sleep_backoff(attempt)
                continue
            except httpx.HTTPError as exc:
                last_error = exc
                logger.warning(
                    "Alpha Vantage transport error (attempt %d/%d): %s",
                    attempt,
                    self._max_attempts,
                    exc.__class__.__name__,
                )
                await self._sleep_backoff(attempt)
                continue

            logger.info(
                "Alpha Vantage %s -> HTTP %d",
                sanitize_url_for_logging(str(response.request.url)),
                response.status_code,
            )

            if response.status_code >= 500:
                last_error = AlphaVantageError(
                    f"Alpha Vantage upstream returned HTTP {response.status_code}.",
                    retryable=True,
                )
                await self._sleep_backoff(attempt)
                continue

            if response.status_code >= 400:
                raise AlphaVantageError(
                    f"Alpha Vantage rejected the request (HTTP {response.status_code})."
                )

            try:
                payload = response.json()
            except ValueError as exc:
                raise AlphaVantageError(
                    "Alpha Vantage returned a response that was not valid JSON."
                ) from exc

            envelope_error = _detect_error_envelope(payload)
            if envelope_error is not None:
                if envelope_error.retryable and attempt < self._max_attempts:
                    last_error = envelope_error
                    await self._sleep_backoff(attempt)
                    continue
                raise envelope_error

            return payload

        assert last_error is not None
        if isinstance(last_error, AlphaVantageError):
            raise last_error
        raise AlphaVantageError(
            "Alpha Vantage is unreachable right now. Please try again later."
        )

    async def _sleep_backoff(self, attempt: int) -> None:
        base = BACKOFF_BASE_SECONDS * (2 ** (attempt - 1))
        jitter = random.uniform(0, base * 0.25)
        await asyncio.sleep(base + jitter)

    async def daily_time_series(self, symbol: str, *, outputsize: str = "compact") -> dict[str, Any]:
        return await self.get(
            {"function": "TIME_SERIES_DAILY", "symbol": symbol, "outputsize": outputsize}
        )

    async def news_sentiment(
        self,
        tickers: str,
        *,
        limit: int = 10,
    ) -> dict[str, Any]:
        return await self.get(
            {"function": "NEWS_SENTIMENT", "tickers": tickers, "limit": str(limit)}
        )
