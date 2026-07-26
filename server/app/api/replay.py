"""Market Replay Lab endpoints.

All routes are offline reconstructions from local SPY history and the
training-time walk-forward evaluation artifact (or the simulated workbook when
``simulated=true``). They never call Alpha Vantage and never run the final
trained model retrospectively.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Query

from app.api.deps import simulated_query
from app.services.replay_service import ReplayService, get_replay_service

router = APIRouter(prefix="/replay/spy", tags=["replay"])


@router.get("/session")
async def get_replay_session(
    date: str = Query(..., description="Trading date as YYYY-MM-DD"),
    simulated: bool = Depends(simulated_query),
    replay_service: ReplayService = Depends(get_replay_service),
) -> dict[str, Any]:
    """Pre-reveal historical market context through the selected date.

    Returns chart bars and indicators available on or before ``date``. Does not
    include model probabilities, predicted/actual directions, or future returns.
    Soft failures return ``available: false`` with nearest eligible neighbors
    when possible.
    """
    return replay_service.get_session(date, simulated=simulated)


@router.get("/random")
async def get_random_replay_session(
    simulated: bool = Depends(simulated_query),
    replay_service: ReplayService = Depends(get_replay_service),
) -> dict[str, Any]:
    """Select one eligible historical session at random (same shape as ``/session``)."""
    return replay_service.get_random_session(simulated=simulated)


@router.get("/result")
async def get_replay_result(
    date: str = Query(..., description="Trading date as YYYY-MM-DD"),
    simulated: bool = Depends(simulated_query),
    replay_service: ReplayService = Depends(get_replay_service),
) -> dict[str, Any]:
    """Reveal walk-forward probabilities and realized outcomes for ``date``.

    Probabilities come exclusively from the out-of-sample walk-forward
    evaluation artifact (or simulated Forecast_History) — never from a
    retrospective model inference pass.
    """
    return replay_service.get_result(date, simulated=simulated)
