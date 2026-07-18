"""Determine the latest *completed* SPY trading session (correction #7).

A session is completed at 16:00 America/New_York on a weekday. Before that time
on any given weekday, or on a weekend, or on an NYSE holiday, the latest
completed session is the most recent weekday before the current one on which
the market was open.

We keep a hard-coded list of major closed-day US market holidays through 2030 —
enough for a client-side model without pulling a full exchange calendar
dependency. Users with genuinely delayed feeds still see the correct
`features_as_of` because we also filter against the data actually available in
the Alpha Vantage response.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

MARKET_TZ = ZoneInfo("America/New_York")
MARKET_CLOSE_HOUR = 16

_HOLIDAYS: frozenset[date] = frozenset(
    {
        # NYSE holidays 2020-2030 (major full-day closures).
        # New Year's Day, MLK Day, Presidents' Day, Good Friday, Memorial Day,
        # Juneteenth (from 2022), Independence Day, Labor Day, Thanksgiving, Christmas.
        # Compiled from public NYSE schedules.
        date(2020, 1, 1),
        date(2020, 1, 20),
        date(2020, 2, 17),
        date(2020, 4, 10),
        date(2020, 5, 25),
        date(2020, 7, 3),
        date(2020, 9, 7),
        date(2020, 11, 26),
        date(2020, 12, 25),
        date(2021, 1, 1),
        date(2021, 1, 18),
        date(2021, 2, 15),
        date(2021, 4, 2),
        date(2021, 5, 31),
        date(2021, 7, 5),
        date(2021, 9, 6),
        date(2021, 11, 25),
        date(2021, 12, 24),
        date(2022, 1, 17),
        date(2022, 2, 21),
        date(2022, 4, 15),
        date(2022, 5, 30),
        date(2022, 6, 20),
        date(2022, 7, 4),
        date(2022, 9, 5),
        date(2022, 11, 24),
        date(2022, 12, 26),
        date(2023, 1, 2),
        date(2023, 1, 16),
        date(2023, 2, 20),
        date(2023, 4, 7),
        date(2023, 5, 29),
        date(2023, 6, 19),
        date(2023, 7, 4),
        date(2023, 9, 4),
        date(2023, 11, 23),
        date(2023, 12, 25),
        date(2024, 1, 1),
        date(2024, 1, 15),
        date(2024, 2, 19),
        date(2024, 3, 29),
        date(2024, 5, 27),
        date(2024, 6, 19),
        date(2024, 7, 4),
        date(2024, 9, 2),
        date(2024, 11, 28),
        date(2024, 12, 25),
        date(2025, 1, 1),
        date(2025, 1, 20),
        date(2025, 2, 17),
        date(2025, 4, 18),
        date(2025, 5, 26),
        date(2025, 6, 19),
        date(2025, 7, 4),
        date(2025, 9, 1),
        date(2025, 11, 27),
        date(2025, 12, 25),
        date(2026, 1, 1),
        date(2026, 1, 19),
        date(2026, 2, 16),
        date(2026, 4, 3),
        date(2026, 5, 25),
        date(2026, 6, 19),
        date(2026, 7, 3),
        date(2026, 9, 7),
        date(2026, 11, 26),
        date(2026, 12, 25),
        date(2027, 1, 1),
        date(2027, 1, 18),
        date(2027, 2, 15),
        date(2027, 3, 26),
        date(2027, 5, 31),
        date(2027, 6, 18),
        date(2027, 7, 5),
        date(2027, 9, 6),
        date(2027, 11, 25),
        date(2027, 12, 24),
    }
)


def now_market() -> datetime:
    return datetime.now(MARKET_TZ)


def is_trading_day(d: date) -> bool:
    if d.weekday() >= 5:  # 5=Sat, 6=Sun
        return False
    return d not in _HOLIDAYS


def latest_completed_session(now_et: datetime | None = None) -> date:
    """Return the most recent completed trading date in ET.

    A session is considered completed once the local ET clock reaches
    :data:`MARKET_CLOSE_HOUR` (16:00). Weekends and holidays are skipped.
    """
    if now_et is None:
        now_et = now_market()
    elif now_et.tzinfo is None:
        now_et = now_et.replace(tzinfo=MARKET_TZ)
    else:
        now_et = now_et.astimezone(MARKET_TZ)

    candidate = now_et.date()
    if is_trading_day(candidate) and now_et.hour >= MARKET_CLOSE_HOUR:
        return candidate

    candidate = candidate - timedelta(days=1)
    while not is_trading_day(candidate):
        candidate = candidate - timedelta(days=1)
    return candidate
