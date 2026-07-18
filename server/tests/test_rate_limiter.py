from __future__ import annotations

from datetime import datetime, timedelta, timezone

from app.services.rate_limiter import RateLimiter
from app.storage.database import Database


def test_daily_budget_enforced(tmp_path):
    db = Database(tmp_path / "rl.db")
    rl = RateLimiter(db, provider_key="test", daily_budget=2, min_interval_seconds=0)

    now = datetime(2024, 6, 1, 12, 0, tzinfo=timezone.utc)
    assert rl.preflight(now).allowed
    rl.record_call(now)
    assert rl.preflight(now).allowed
    rl.record_call(now)

    decision = rl.preflight(now)
    assert not decision.allowed
    assert decision.reason == "daily_budget_exceeded"


def test_min_interval_enforced(tmp_path):
    db = Database(tmp_path / "rl.db")
    rl = RateLimiter(db, provider_key="test", daily_budget=100, min_interval_seconds=10)

    now = datetime(2024, 6, 1, 12, 0, tzinfo=timezone.utc)
    rl.record_call(now)
    decision = rl.preflight(now + timedelta(seconds=3))
    assert not decision.allowed
    assert decision.reason == "min_interval_not_elapsed"
    assert 6 <= decision.seconds_until_next_call <= 8


def test_new_day_resets_budget(tmp_path):
    db = Database(tmp_path / "rl.db")
    rl = RateLimiter(db, provider_key="test", daily_budget=1, min_interval_seconds=0)

    day1 = datetime(2024, 6, 1, 23, 30, tzinfo=timezone.utc)
    rl.record_call(day1)
    assert not rl.preflight(day1).allowed

    day2 = datetime(2024, 6, 2, 0, 30, tzinfo=timezone.utc)
    assert rl.preflight(day2).allowed
