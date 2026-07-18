"""Persistent daily call budget + minimum interval spacing.

Both limits survive process restart because they are stored in SQLite.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timezone

from app.storage.database import Database, parse_iso


class RateLimitError(RuntimeError):
    """Raised when the daily budget or min-interval is exhausted."""


@dataclass
class RateLimitDecision:
    allowed: bool
    reason: str
    calls_today: int
    daily_budget: int
    seconds_until_next_call: float


class RateLimiter:
    """Enforce a daily call budget and a minimum spacing between calls.

    Time is measured in UTC. Persistence is scoped to a single upstream key
    (e.g. `"alpha_vantage"`) so multiple upstreams stay independent.
    """

    def __init__(
        self,
        db: Database,
        *,
        provider_key: str,
        daily_budget: int,
        min_interval_seconds: int,
    ):
        self._db = db
        self._provider = provider_key
        self._daily_budget = daily_budget
        self._min_interval = min_interval_seconds

    @property
    def daily_budget(self) -> int:
        return self._daily_budget

    def _today(self, now: datetime) -> str:
        return f"{self._provider}:{now.date().isoformat()}"

    def _rate_key(self) -> str:
        return self._provider

    def calls_today(self, now: datetime | None = None) -> int:
        now = now or datetime.now(timezone.utc)
        with self._db.transaction() as conn:
            row = conn.execute(
                "SELECT count FROM daily_calls WHERE day = ?",
                (self._today(now),),
            ).fetchone()
        return int(row[0]) if row else 0

    def preflight(self, now: datetime | None = None) -> RateLimitDecision:
        """Return whether a call is allowed *right now* without consuming budget."""
        now = now or datetime.now(timezone.utc)
        calls = self.calls_today(now)

        if calls >= self._daily_budget:
            return RateLimitDecision(
                allowed=False,
                reason="daily_budget_exceeded",
                calls_today=calls,
                daily_budget=self._daily_budget,
                seconds_until_next_call=_seconds_until_next_midnight_utc(now),
            )

        with self._db.transaction() as conn:
            row = conn.execute(
                "SELECT last_called_at FROM rate_limit WHERE key = ?",
                (self._rate_key(),),
            ).fetchone()

        if row is not None:
            last = parse_iso(row[0])
            elapsed = (now - last).total_seconds()
            if elapsed < self._min_interval:
                return RateLimitDecision(
                    allowed=False,
                    reason="min_interval_not_elapsed",
                    calls_today=calls,
                    daily_budget=self._daily_budget,
                    seconds_until_next_call=max(0.0, self._min_interval - elapsed),
                )

        return RateLimitDecision(
            allowed=True,
            reason="ok",
            calls_today=calls,
            daily_budget=self._daily_budget,
            seconds_until_next_call=0.0,
        )

    def record_call(self, now: datetime | None = None) -> None:
        """Record that a call happened. Call this only when an upstream call succeeds."""
        now = now or datetime.now(timezone.utc)
        iso = now.replace(microsecond=0).isoformat()
        day_key = self._today(now)
        with self._db.transaction() as conn:
            conn.execute(
                """
                INSERT INTO daily_calls(day, count) VALUES(?, 1)
                ON CONFLICT(day) DO UPDATE SET count = count + 1
                """,
                (day_key,),
            )
            conn.execute(
                """
                INSERT INTO rate_limit(key, last_called_at) VALUES(?, ?)
                ON CONFLICT(key) DO UPDATE SET last_called_at = excluded.last_called_at
                """,
                (self._rate_key(), iso),
            )

    def ensure_can_call(self, now: datetime | None = None) -> RateLimitDecision:
        decision = self.preflight(now)
        if not decision.allowed:
            raise RateLimitError(decision.reason)
        return decision


def _seconds_until_next_midnight_utc(now: datetime) -> float:
    tomorrow = date(now.year, now.month, now.day).toordinal() + 1
    next_midnight = datetime.fromordinal(tomorrow).replace(tzinfo=timezone.utc)
    return max(0.0, (next_midnight - now).total_seconds())
