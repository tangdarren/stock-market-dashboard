"""Shared query helpers for live vs simulated data-mode selection."""

from __future__ import annotations

from fastapi import Query

SIMULATED_QUERY_DESCRIPTION = (
    "When true, serve synthetic workbook data instead of Alpha Vantage. "
    "Default is live. Simulated mode never silently activates on live failures."
)


def simulated_query(
    simulated: bool = Query(default=False, description=SIMULATED_QUERY_DESCRIPTION),
) -> bool:
    """FastAPI dependency — live remains the default."""
    return bool(simulated)
