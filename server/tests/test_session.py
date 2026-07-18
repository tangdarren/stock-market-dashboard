from __future__ import annotations

from datetime import datetime

from app.services.session import MARKET_TZ, is_trading_day, latest_completed_session


def test_weekend_returns_previous_friday():
    saturday = datetime(2024, 6, 8, 12, 0, tzinfo=MARKET_TZ)  # Saturday
    assert latest_completed_session(saturday).isoformat() == "2024-06-07"

    sunday = datetime(2024, 6, 9, 12, 0, tzinfo=MARKET_TZ)
    assert latest_completed_session(sunday).isoformat() == "2024-06-07"


def test_before_close_returns_previous_day():
    monday_930_am = datetime(2024, 6, 10, 9, 30, tzinfo=MARKET_TZ)
    assert latest_completed_session(monday_930_am).isoformat() == "2024-06-07"


def test_after_close_returns_today():
    monday_5pm = datetime(2024, 6, 10, 17, 0, tzinfo=MARKET_TZ)
    assert latest_completed_session(monday_5pm).isoformat() == "2024-06-10"


def test_holiday_is_skipped():
    # 2024-07-04 Independence Day (Thursday)
    friday_after_holiday = datetime(2024, 7, 5, 9, 0, tzinfo=MARKET_TZ)
    # 9:00am on Friday July 5, market not yet closed for today.
    # Yesterday (Thursday) was holiday. Previous trading day = Wednesday 2024-07-03.
    assert latest_completed_session(friday_after_holiday).isoformat() == "2024-07-03"


def test_is_trading_day_weekend():
    from datetime import date

    assert not is_trading_day(date(2024, 6, 8))
    assert not is_trading_day(date(2024, 6, 9))
    assert is_trading_day(date(2024, 6, 10))
