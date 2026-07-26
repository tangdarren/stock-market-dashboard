"""Market Replay Lab service — load history + walk-forward artifacts and serve replay APIs.

Design notes
------------
* **No live market calls**: replay is fully offline from
  ``server/data/raw/spy_daily.csv`` and ``server/artifacts/walk_forward_predictions.csv``.
* **No retrospective model inference**: probabilities come only from the
  walk-forward evaluation artifact produced at training time.
* **Separated reveal**: session payloads never include model outputs or future
  labels; result payloads are fetched separately after the learner reveals.
* **Cached file loading**: CSV files are parsed once per (path, mtime) and
  reused across requests. Call :func:`clear_replay_file_caches` from tests.
* **Truthful failures**: expected problems (missing/malformed data, ineligible
  date) return ``available: false`` with a machine-readable ``reason`` and,
  when possible, nearest eligible neighbors.
"""

from __future__ import annotations

import logging
import random
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import pandas as pd

from app import config as _config
from app.ml.artifacts import ArtifactMissing, read_json
from app.ml.normalize import OHLCVSchemaError, normalize_ohlcv
from app.ml.replay import (
    LOOKBACK_SESSIONS,
    MIN_FEATURE_HISTORY,
    REPLAY_DISCLAIMER,
    REPLAY_EVALUATION_NOTE,
    REPLAY_METHODOLOGY,
    SUPPORTED_HORIZONS,
    ReplayBundle,
    ReplayResult,
    ReplaySnapshot,
    build_replay_bundle,
    build_replay_result,
    build_replay_snapshot,
    eligible_replay_dates,
    nearest_eligible_dates,
    walk_forward_outcome_dates,
)
from app.ml.simulated_research import (
    SIMULATED_MODEL_VERSION,
    SIMULATED_REPLAY_DISCLAIMER,
    SIMULATED_REPLAY_EVALUATION_NOTE,
    SIMULATED_SOURCE,
)
from app.services.forecast_service import get_model_version
from app.services.session import is_trading_day

logger = logging.getLogger(__name__)

HISTORICAL_CSV_FILENAME = "spy_daily.csv"
WALK_FORWARD_FILENAME = "walk_forward_predictions.csv"

REPLAY_MODE = "historical"
REPLAY_SOURCE = "local_historical_csv"
SIMULATED_REPLAY_MODE = "simulated"
SIMULATED_REPLAY_SOURCE = SIMULATED_SOURCE
SIMULATED_PREDICTION_SOURCE = "simulated_forecast_history"


# ---------------------------------------------------------------------------
# Internal unavailable signal
# ---------------------------------------------------------------------------


class _ReplayUnavailable(RuntimeError):
    """Raised internally to short-circuit into a structured unavailable response."""

    def __init__(self, message: str, *, reason: str):
        super().__init__(message)
        self.reason = reason


# ---------------------------------------------------------------------------
# File-load caches (path + mtime keyed so edits / test isolation invalidate)
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class _CacheEntry:
    path: str
    mtime_ns: int
    frame: pd.DataFrame


_ohlcv_cache: _CacheEntry | None = None
_walk_forward_cache: _CacheEntry | None = None
_sim_ohlcv_cache: _CacheEntry | None = None
_sim_walk_forward_cache: _CacheEntry | None = None


def clear_replay_file_caches() -> None:
    """Drop cached CSV / workbook frames. Intended for tests and rare reloads."""
    global _ohlcv_cache, _walk_forward_cache, _sim_ohlcv_cache, _sim_walk_forward_cache
    _ohlcv_cache = None
    _walk_forward_cache = None
    _sim_ohlcv_cache = None
    _sim_walk_forward_cache = None


# ---------------------------------------------------------------------------
# Service
# ---------------------------------------------------------------------------


class ReplayService:
    """Offline Market Replay Lab orchestration."""

    def __init__(self, *, rng: random.Random | None = None):
        self._rng = rng or random.SystemRandom()

    def list_eligible_sessions(self, *, simulated: bool = False) -> dict[str, Any]:
        """Return ISO dates eligible for replay, or a structured unavailable payload."""
        try:
            ohlcv, walk_forward, dates = self._load_context(simulated=simulated)
        except _ReplayUnavailable as exc:
            return _list_unavailable(
                reason=exc.reason, detail=str(exc), simulated=simulated
            )
        except ValueError as exc:
            logger.warning("Replay eligibility validation failed: %s", exc)
            return _list_unavailable(
                reason="walk_forward_artifact_malformed",
                detail=str(exc),
                simulated=simulated,
            )

        if not dates:
            return _list_unavailable(
                reason="no_eligible_sessions",
                detail=(
                    "No historical sessions satisfy both the lookback-window "
                    "requirement and known 1d/5d walk-forward outcomes."
                ),
                simulated=simulated,
            )

        payload = {
            "available": True,
            "symbol": "SPY",
            "eligible_dates": dates,
            "eligible_count": len(dates),
            "lookback_sessions": LOOKBACK_SESSIONS,
            "min_feature_history": MIN_FEATURE_HISTORY,
            "earliest_eligible": dates[0],
            "latest_eligible": dates[-1],
            "min_eligible_date": dates[0],
            "max_eligible_date": dates[-1],
            "disclaimer": _replay_disclaimer(simulated),
            "generated_at": _now_iso(),
            "reason": None,
            "detail": None,
            "mode": SIMULATED_REPLAY_MODE if simulated else REPLAY_MODE,
            "source": SIMULATED_REPLAY_SOURCE if simulated else REPLAY_SOURCE,
        }
        if simulated:
            payload["data_classification"] = "SIMULATED / FICTIONAL"
        return payload

    def get_session(self, selected_date: str, *, simulated: bool = False) -> dict[str, Any]:
        """Pre-reveal market context for ``selected_date`` (no model/future labels)."""
        try:
            selected = _parse_selected_date(selected_date)
            ohlcv, walk_forward, dates = self._load_context(simulated=simulated)
            failure = _classify_date(ohlcv, walk_forward, selected, dates)
            if failure is not None:
                return _session_unavailable(
                    reason=failure,
                    detail=_reason_detail(failure, selected),
                    selected_date=_format_date(selected),
                    eligible_dates=dates,
                    simulated=simulated,
                )
            snapshot = build_replay_snapshot(
                ohlcv, selected, lookback_sessions=LOOKBACK_SESSIONS
            )
        except _ReplayUnavailable as exc:
            return _session_unavailable(
                reason=exc.reason,
                detail=str(exc),
                selected_date=_safe_date_str(selected_date),
                eligible_dates=[],
                simulated=simulated,
            )
        except ValueError as exc:
            return _session_unavailable(
                reason=_classify_value_error(str(exc)),
                detail=str(exc),
                selected_date=_safe_date_str(selected_date),
                eligible_dates=[],
                simulated=simulated,
            )

        return _serialize_session(
            snapshot, eligible_dates=dates, simulated=simulated
        )

    def get_random_session(self, *, simulated: bool = False) -> dict[str, Any]:
        """Select one eligible date at random and return the session payload."""
        try:
            _ohlcv, _walk_forward, dates = self._load_context(simulated=simulated)
        except _ReplayUnavailable as exc:
            return _session_unavailable(
                reason=exc.reason,
                detail=str(exc),
                selected_date=None,
                eligible_dates=[],
                simulated=simulated,
            )
        except ValueError as exc:
            return _session_unavailable(
                reason="walk_forward_artifact_malformed",
                detail=str(exc),
                selected_date=None,
                eligible_dates=[],
                simulated=simulated,
            )

        if not dates:
            return _session_unavailable(
                reason="no_eligible_sessions",
                detail=(
                    "No historical sessions satisfy both the lookback-window "
                    "requirement and known 1d/5d walk-forward outcomes."
                ),
                selected_date=None,
                eligible_dates=[],
                simulated=simulated,
            )

        return self.get_session(self._rng.choice(dates), simulated=simulated)

    def get_result(self, selected_date: str, *, simulated: bool = False) -> dict[str, Any]:
        """Hidden reveal payload: walk-forward probabilities and realized outcomes."""
        try:
            selected = _parse_selected_date(selected_date)
            ohlcv, walk_forward, dates = self._load_context(simulated=simulated)
            failure = _classify_date(ohlcv, walk_forward, selected, dates)
            if failure is not None:
                return _result_unavailable(
                    reason=failure,
                    detail=_reason_detail(failure, selected),
                    selected_date=_format_date(selected),
                    eligible_dates=dates,
                    simulated=simulated,
                )
            result = build_replay_result(walk_forward, selected)
        except _ReplayUnavailable as exc:
            return _result_unavailable(
                reason=exc.reason,
                detail=str(exc),
                selected_date=_safe_date_str(selected_date),
                eligible_dates=[],
                simulated=simulated,
            )
        except ValueError as exc:
            return _result_unavailable(
                reason=_classify_value_error(str(exc)),
                detail=str(exc),
                selected_date=_safe_date_str(selected_date),
                eligible_dates=[],
                simulated=simulated,
            )

        return _serialize_result(
            result, eligible_dates=dates, simulated=simulated
        )

    def get_replay(self, selected_date: str, *, simulated: bool = False) -> dict[str, Any]:
        """Return both snapshot and result (legacy helper used by unit tests)."""
        try:
            selected = _parse_selected_date(selected_date)
            ohlcv, walk_forward, dates = self._load_context(simulated=simulated)
            failure = _classify_date(ohlcv, walk_forward, selected, dates)
            if failure is not None:
                return _bundle_unavailable(
                    reason=failure,
                    detail=_reason_detail(failure, selected),
                    selected_date=_format_date(selected),
                    eligible_dates=dates,
                    simulated=simulated,
                )
            bundle = build_replay_bundle(
                ohlcv,
                walk_forward,
                selected,
                lookback_sessions=LOOKBACK_SESSIONS,
                min_feature_history=MIN_FEATURE_HISTORY,
            )
        except _ReplayUnavailable as exc:
            return _bundle_unavailable(
                reason=exc.reason,
                detail=str(exc),
                selected_date=_safe_date_str(selected_date),
                eligible_dates=[],
                simulated=simulated,
            )
        except ValueError as exc:
            return _bundle_unavailable(
                reason=_classify_value_error(str(exc)),
                detail=str(exc),
                selected_date=_safe_date_str(selected_date),
                eligible_dates=[],
                simulated=simulated,
            )

        return _serialize_bundle(bundle, simulated=simulated)

    def _load_context(
        self, *, simulated: bool = False
    ) -> tuple[pd.DataFrame, pd.DataFrame, list[str]]:
        ohlcv = _load_historical_ohlcv(simulated=simulated)
        walk_forward = _load_walk_forward(simulated=simulated)
        dates = eligible_replay_dates(
            ohlcv,
            walk_forward,
            lookback_sessions=LOOKBACK_SESSIONS,
            min_feature_history=MIN_FEATURE_HISTORY,
        )
        return ohlcv, walk_forward, dates


# ---------------------------------------------------------------------------
# Loaders
# ---------------------------------------------------------------------------


def _load_historical_ohlcv(*, simulated: bool = False) -> pd.DataFrame:
    """Read + normalize local SPY CSV or simulated Market_Data."""
    if simulated:
        return _load_simulated_ohlcv()

    global _ohlcv_cache
    csv_path = _config.DATA_RAW_DIR / HISTORICAL_CSV_FILENAME
    if not csv_path.exists():
        raise _ReplayUnavailable(
            "Local SPY history is not present. Run "
            "`python server/scripts/bootstrap_history.py` first.",
            reason="historical_dataset_missing",
        )

    mtime_ns = _mtime_ns(csv_path)
    path_str = str(csv_path.resolve())
    if (
        _ohlcv_cache is not None
        and _ohlcv_cache.path == path_str
        and _ohlcv_cache.mtime_ns == mtime_ns
    ):
        return _ohlcv_cache.frame

    try:
        raw = pd.read_csv(csv_path)
    except (pd.errors.ParserError, ValueError, UnicodeDecodeError) as exc:
        raise _ReplayUnavailable(
            f"Local SPY history is malformed: {exc}",
            reason="historical_dataset_malformed",
        ) from exc

    try:
        canonical = normalize_ohlcv(raw, source=f"local_csv:{HISTORICAL_CSV_FILENAME}")
    except OHLCVSchemaError as exc:
        raise _ReplayUnavailable(
            f"Local SPY history failed schema validation: {exc}",
            reason="historical_dataset_malformed",
        ) from exc

    _ohlcv_cache = _CacheEntry(path=path_str, mtime_ns=mtime_ns, frame=canonical)
    return canonical


def _load_simulated_ohlcv() -> pd.DataFrame:
    """Cached Market_Data frame from the simulated workbook."""
    global _sim_ohlcv_cache
    from app.ml.simulated import SimulatedDataError, get_simulated_workbook

    try:
        workbook = get_simulated_workbook()
    except SimulatedDataError as exc:
        raise _ReplayUnavailable(exc.message, reason=exc.reason) from exc

    path_str = str(workbook.source_path)
    mtime_ns = _mtime_ns(workbook.source_path)
    if (
        _sim_ohlcv_cache is not None
        and _sim_ohlcv_cache.path == path_str
        and _sim_ohlcv_cache.mtime_ns == mtime_ns
    ):
        return _sim_ohlcv_cache.frame

    frame = workbook.market_data.copy()
    _sim_ohlcv_cache = _CacheEntry(path=path_str, mtime_ns=mtime_ns, frame=frame)
    return frame


def _load_walk_forward(*, simulated: bool = False) -> pd.DataFrame:
    """Read walk-forward artifact or simulated Forecast_History."""
    if simulated:
        return _load_simulated_walk_forward()

    global _walk_forward_cache
    path = _config.ARTIFACTS_DIR / WALK_FORWARD_FILENAME
    if not path.exists():
        raise _ReplayUnavailable(
            "Walk-forward predictions artifact is not present. Run "
            "`python server/scripts/train_models.py` first.",
            reason="walk_forward_artifact_missing",
        )

    mtime_ns = _mtime_ns(path)
    path_str = str(path.resolve())
    if (
        _walk_forward_cache is not None
        and _walk_forward_cache.path == path_str
        and _walk_forward_cache.mtime_ns == mtime_ns
    ):
        return _walk_forward_cache.frame

    try:
        raw = pd.read_csv(path)
    except (pd.errors.ParserError, ValueError, UnicodeDecodeError) as exc:
        raise _ReplayUnavailable(
            f"Walk-forward predictions artifact is malformed: {exc}",
            reason="walk_forward_artifact_malformed",
        ) from exc

    try:
        from app.ml.replay import prepare_walk_forward_frame

        frame = prepare_walk_forward_frame(raw)
    except ValueError as exc:
        raise _ReplayUnavailable(
            f"Walk-forward predictions artifact is malformed: {exc}",
            reason="walk_forward_artifact_malformed",
        ) from exc

    _walk_forward_cache = _CacheEntry(path=path_str, mtime_ns=mtime_ns, frame=frame)
    return frame


def _load_simulated_walk_forward() -> pd.DataFrame:
    """Cached Forecast_History frame from the simulated workbook."""
    global _sim_walk_forward_cache
    from app.ml.simulated import SimulatedDataError, get_simulated_workbook

    try:
        workbook = get_simulated_workbook()
    except SimulatedDataError as exc:
        raise _ReplayUnavailable(exc.message, reason=exc.reason) from exc

    path_str = str(workbook.source_path)
    mtime_ns = _mtime_ns(workbook.source_path)
    if (
        _sim_walk_forward_cache is not None
        and _sim_walk_forward_cache.path == path_str
        and _sim_walk_forward_cache.mtime_ns == mtime_ns
    ):
        return _sim_walk_forward_cache.frame

    frame = workbook.forecast_history.copy()
    _sim_walk_forward_cache = _CacheEntry(path=path_str, mtime_ns=mtime_ns, frame=frame)
    return frame


# ---------------------------------------------------------------------------
# Date classification
# ---------------------------------------------------------------------------


def _classify_date(
    ohlcv: pd.DataFrame,
    walk_forward: pd.DataFrame,
    selected: pd.Timestamp,
    eligible_dates: list[str],
) -> str | None:
    """Return ineligibility reason or ``None`` when the date is eligible.

    Eligible artifact dates win over the static holiday calendar: the local
    OHLCV history is treated as the source of truth for sessions that actually
    traded. Weekends/holidays are reported only for unsupported requests.
    """
    selected_d = selected.date()
    target = _format_date(selected)

    if target in eligible_dates:
        return None

    if selected_d.weekday() >= 5:
        return "weekend"
    if not is_trading_day(selected_d):
        return "market_holiday"

    sorted_ohlcv = ohlcv.sort_values("date").reset_index(drop=True)
    dates = pd.to_datetime(sorted_ohlcv["date"]).dt.normalize()
    matches = sorted_ohlcv.index[dates == selected]
    in_history = len(matches) > 0

    if in_history:
        sessions_through = int(matches[0]) + 1
        if sessions_through < LOOKBACK_SESSIONS or sessions_through < MIN_FEATURE_HISTORY:
            return "insufficient_history"

    outcome_dates = set(walk_forward_outcome_dates(walk_forward))
    day = walk_forward[pd.to_datetime(walk_forward["date"]).dt.normalize() == selected]
    if day.empty:
        if eligible_dates and (target < eligible_dates[0] or target > eligible_dates[-1]):
            return "date_out_of_range"
        if not in_history:
            return "not_a_trading_session"
        return "walk_forward_prediction_unavailable"

    if selected not in outcome_dates:
        return "outcome_unavailable"

    if eligible_dates and (target < eligible_dates[0] or target > eligible_dates[-1]):
        return "date_out_of_range"
    if not in_history:
        return "not_a_trading_session"
    return "date_not_eligible"


def _reason_detail(reason: str, selected: pd.Timestamp) -> str:
    iso = _format_date(selected)
    messages = {
        "weekend": f"{iso} falls on a weekend; SPY does not trade.",
        "market_holiday": f"{iso} is a US market holiday; SPY does not trade.",
        "insufficient_history": (
            f"{iso} does not have enough prior completed sessions to build "
            f"indicators and a {LOOKBACK_SESSIONS}-session chart."
        ),
        "walk_forward_prediction_unavailable": (
            f"{iso} has no out-of-sample walk-forward prediction rows."
        ),
        "outcome_unavailable": (
            f"{iso} is missing known one-session and/or five-session realized outcomes."
        ),
        "date_out_of_range": (
            f"{iso} is outside the eligible Market Replay date range."
        ),
        "not_a_trading_session": (
            f"{iso} is not present in the local SPY trading-session history."
        ),
        "date_not_eligible": f"{iso} is not eligible for Market Replay.",
        "invalid_date": f"Invalid selected_date: {iso!r}",
    }
    return messages.get(reason, f"{iso} is not eligible for Market Replay.")


# ---------------------------------------------------------------------------
# Payload builders
# ---------------------------------------------------------------------------


def _replay_disclaimer(simulated: bool) -> str:
    return SIMULATED_REPLAY_DISCLAIMER if simulated else REPLAY_DISCLAIMER


def _replay_evaluation_note(simulated: bool) -> str:
    return SIMULATED_REPLAY_EVALUATION_NOTE if simulated else REPLAY_EVALUATION_NOTE


def _prediction_source(simulated: bool) -> str:
    return SIMULATED_PREDICTION_SOURCE if simulated else "walk_forward_predictions"


def _mode_label(simulated: bool, *, available: bool) -> str:
    if not available:
        return "unavailable"
    return SIMULATED_REPLAY_MODE if simulated else REPLAY_MODE


def _source_label(simulated: bool) -> str:
    return SIMULATED_REPLAY_SOURCE if simulated else REPLAY_SOURCE


def _serialize_session(
    snapshot: ReplaySnapshot,
    *,
    eligible_dates: list[str],
    simulated: bool = False,
) -> dict[str, Any]:
    selected_bar = snapshot.sessions[-1] if snapshot.sessions else None
    series = [
        {
            "date": bar.date,
            "open": bar.open,
            "high": bar.high,
            "low": bar.low,
            "close": bar.close,
            "volume": bar.volume,
        }
        for bar in snapshot.sessions
    ]
    indicators = None
    if selected_bar is not None:
        indicators = {
            "close": selected_bar.close,
            "momentum_5d": selected_bar.momentum_5d,
            "rsi_14": selected_bar.rsi_14,
            "rolling_vol_20": selected_bar.rolling_vol_20,
            "distance_from_sma_20": selected_bar.distance_from_sma_20,
            "opening_gap_pct": selected_bar.opening_gap_pct,
            "relative_volume": selected_bar.relative_volume,
        }

    before, after = nearest_eligible_dates(eligible_dates, snapshot.selected_date)
    payload = {
        "available": True,
        "symbol": "SPY",
        "selected_date": snapshot.selected_date,
        "min_eligible_date": eligible_dates[0] if eligible_dates else None,
        "max_eligible_date": eligible_dates[-1] if eligible_dates else None,
        "nearest_eligible_before": before,
        "nearest_eligible_after": after,
        "lookback_sessions": snapshot.lookback_sessions,
        "session_count": len(series),
        "series": series,
        "indicators": indicators,
        "horizons": list(SUPPORTED_HORIZONS),
        "mode": _mode_label(simulated, available=True),
        "source": _source_label(simulated),
        "methodology": {
            "summary": REPLAY_METHODOLOGY,
            "lookback_sessions": LOOKBACK_SESSIONS,
            "min_feature_history": MIN_FEATURE_HISTORY,
            "horizons": list(SUPPORTED_HORIZONS),
            "prediction_source": _prediction_source(simulated),
            "feature_engineering": "build_features",
        },
        "disclaimer": _replay_disclaimer(simulated),
        "generated_at": _now_iso(),
        "reason": None,
        "detail": None,
    }
    if simulated:
        payload["data_classification"] = "SIMULATED / FICTIONAL"
    return payload


def _serialize_result(
    result: ReplayResult,
    *,
    eligible_dates: list[str] | None = None,
    simulated: bool = False,
) -> dict[str, Any]:
    eligible_dates = eligible_dates or []
    payload = {
        "available": True,
        "symbol": "SPY",
        "selected_date": result.selected_date,
        "one_day": _serialize_horizon(result.one_day.to_dict()),
        "five_day": _serialize_horizon(result.five_day.to_dict()),
        "source": SIMULATED_SOURCE if simulated else result.source,
        "evaluation_note": _replay_evaluation_note(simulated),
        "disclaimer": _replay_disclaimer(simulated),
        "mode": _mode_label(simulated, available=True),
        "model_version": (
            SIMULATED_MODEL_VERSION if simulated else get_model_version()
        ),
        "model_metadata": _walk_forward_model_metadata(simulated=simulated),
        "generated_at": _now_iso(),
        "reason": None,
        "detail": None,
    }
    payload.update(_neighbor_fields(eligible_dates, result.selected_date))
    if simulated:
        payload["data_classification"] = "SIMULATED / FICTIONAL"
    return payload


def _serialize_horizon(horizon: dict[str, Any]) -> dict[str, Any]:
    return {
        "horizon_days": horizon["horizon_days"],
        "prob_up": horizon["prob_up"],
        "direction_predicted": horizon["direction_predicted"],
        "realized_return": horizon["realized_return"],
        "direction_actual": horizon["direction_actual"],
        "predicted": horizon["predicted"],
        "actual": horizon["actual"],
        "correct": horizon["correct"],
    }


def _serialize_bundle(
    bundle: ReplayBundle, *, simulated: bool = False
) -> dict[str, Any]:
    payload = {
        "available": True,
        "symbol": "SPY",
        "selected_date": bundle.snapshot.selected_date,
        "lookback_sessions": bundle.snapshot.lookback_sessions,
        "snapshot": bundle.snapshot.to_dict(),
        "result": bundle.result.to_dict(),
        "disclaimer": _replay_disclaimer(simulated),
        "generated_at": _now_iso(),
        "reason": None,
        "detail": None,
        "mode": _mode_label(simulated, available=True),
        "source": _source_label(simulated),
    }
    if simulated:
        payload["data_classification"] = "SIMULATED / FICTIONAL"
        payload["result"] = {
            **payload["result"],
            "source": SIMULATED_SOURCE,
        }
    return payload


def _walk_forward_model_metadata(*, simulated: bool = False) -> dict[str, Any] | None:
    """Best-effort walk-forward / holdout metadata from training artifacts."""
    if simulated:
        return {
            "holdout_start": None,
            "holdout_end": None,
            "model_name_1d": "simulated_scenario",
            "model_name_5d": "simulated_scenario",
            "n_holdout_1d": None,
            "n_holdout_5d": None,
            "evaluation": "simulated_forecast_history",
        }

    try:
        meta = read_json("training_metadata.json")
    except ArtifactMissing:
        return None
    except Exception as exc:  # noqa: BLE001 — soft metadata only
        logger.warning("Unable to read training_metadata.json for replay: %s", exc)
        return None

    if not isinstance(meta, dict):
        return None

    one = meta.get("1d") if isinstance(meta.get("1d"), dict) else {}
    five = meta.get("5d") if isinstance(meta.get("5d"), dict) else {}
    payload = {
        "holdout_start": one.get("holdout_start") or five.get("holdout_start"),
        "holdout_end": one.get("holdout_end") or five.get("holdout_end"),
        "model_name_1d": one.get("model_name"),
        "model_name_5d": five.get("model_name"),
        "n_holdout_1d": one.get("n_holdout"),
        "n_holdout_5d": five.get("n_holdout"),
        "evaluation": "chronological_holdout_walk_forward",
    }
    if all(v is None for k, v in payload.items() if k != "evaluation"):
        return None
    return payload


def _neighbor_fields(eligible_dates: list[str], selected_date: str | None) -> dict[str, Any]:
    before = after = None
    if selected_date is not None and eligible_dates:
        before, after = nearest_eligible_dates(eligible_dates, selected_date)
    return {
        "min_eligible_date": eligible_dates[0] if eligible_dates else None,
        "max_eligible_date": eligible_dates[-1] if eligible_dates else None,
        "nearest_eligible_before": before,
        "nearest_eligible_after": after,
    }


def _session_unavailable(
    *,
    reason: str,
    detail: str,
    selected_date: str | None,
    eligible_dates: list[str],
    simulated: bool = False,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "available": False,
        "symbol": "SPY",
        "selected_date": selected_date,
        "lookback_sessions": LOOKBACK_SESSIONS,
        "session_count": 0,
        "series": [],
        "indicators": None,
        "horizons": list(SUPPORTED_HORIZONS),
        "mode": "unavailable",
        "source": _source_label(simulated),
        "methodology": {
            "summary": REPLAY_METHODOLOGY,
            "lookback_sessions": LOOKBACK_SESSIONS,
            "min_feature_history": MIN_FEATURE_HISTORY,
            "horizons": list(SUPPORTED_HORIZONS),
            "prediction_source": _prediction_source(simulated),
            "feature_engineering": "build_features",
        },
        "disclaimer": _replay_disclaimer(simulated),
        "generated_at": _now_iso(),
        "reason": reason,
        "detail": detail,
    }
    if simulated:
        payload["data_classification"] = "SIMULATED / FICTIONAL"
    payload.update(_neighbor_fields(eligible_dates, selected_date))
    return payload


def _result_unavailable(
    *,
    reason: str,
    detail: str,
    selected_date: str | None,
    eligible_dates: list[str],
    simulated: bool = False,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "available": False,
        "symbol": "SPY",
        "selected_date": selected_date,
        "one_day": None,
        "five_day": None,
        "source": SIMULATED_SOURCE if simulated else "walk_forward_predictions",
        "evaluation_note": _replay_evaluation_note(simulated),
        "disclaimer": _replay_disclaimer(simulated),
        "mode": "unavailable",
        "model_version": (
            SIMULATED_MODEL_VERSION if simulated else get_model_version()
        ),
        "model_metadata": None,
        "generated_at": _now_iso(),
        "reason": reason,
        "detail": detail,
    }
    if simulated:
        payload["data_classification"] = "SIMULATED / FICTIONAL"
    payload.update(_neighbor_fields(eligible_dates, selected_date))
    return payload


def _bundle_unavailable(
    *,
    reason: str,
    detail: str,
    selected_date: str | None,
    eligible_dates: list[str],
    simulated: bool = False,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "available": False,
        "symbol": "SPY",
        "selected_date": selected_date,
        "lookback_sessions": LOOKBACK_SESSIONS,
        "snapshot": None,
        "result": None,
        "disclaimer": _replay_disclaimer(simulated),
        "generated_at": _now_iso(),
        "reason": reason,
        "detail": detail,
        "mode": "unavailable",
        "source": _source_label(simulated),
    }
    if simulated:
        payload["data_classification"] = "SIMULATED / FICTIONAL"
    payload.update(_neighbor_fields(eligible_dates, selected_date))
    return payload


def _list_unavailable(
    *,
    reason: str,
    detail: str,
    simulated: bool = False,
) -> dict[str, Any]:
    payload = {
        "available": False,
        "symbol": "SPY",
        "eligible_dates": [],
        "eligible_count": 0,
        "lookback_sessions": LOOKBACK_SESSIONS,
        "min_feature_history": MIN_FEATURE_HISTORY,
        "earliest_eligible": None,
        "latest_eligible": None,
        "min_eligible_date": None,
        "max_eligible_date": None,
        "disclaimer": _replay_disclaimer(simulated),
        "generated_at": _now_iso(),
        "reason": reason,
        "detail": detail,
        "mode": "unavailable",
        "source": _source_label(simulated),
    }
    if simulated:
        payload["data_classification"] = "SIMULATED / FICTIONAL"
    return payload


def _format_date(value: Any) -> str:
    return pd.Timestamp(value).normalize().date().isoformat()


def _classify_value_error(message: str) -> str:
    lowered = message.lower()
    if "invalid selected_date" in lowered or "selected_date is required" in lowered:
        return "invalid_date"
    if "not eligible" in lowered:
        return "date_not_eligible"
    if "not in the ohlcv" in lowered or "no walk-forward rows" in lowered:
        return "walk_forward_prediction_unavailable"
    if "lookback" in lowered or "complete feature vector" in lowered:
        return "insufficient_history"
    if "outcomes incomplete" in lowered:
        return "outcome_unavailable"
    if "walk-forward" in lowered:
        return "walk_forward_artifact_malformed"
    return "date_not_eligible"


def _parse_selected_date(value: str) -> pd.Timestamp:
    if value is None or str(value).strip() == "":
        raise ValueError("selected_date is required.")
    text = str(value).strip()
    # Prefer strict YYYY-MM-DD to avoid silent locale surprises.
    try:
        if len(text) == 10 and text[4] == "-" and text[7] == "-":
            ts = pd.Timestamp(datetime.strptime(text, "%Y-%m-%d"))
        else:
            ts = pd.Timestamp(text).normalize()
    except (TypeError, ValueError, pd.errors.OutOfBoundsDatetime) as exc:
        raise ValueError(f"Invalid selected_date: {value!r}") from exc
    if pd.isna(ts):
        raise ValueError(f"Invalid selected_date: {value!r}")
    return ts.normalize()


def _safe_date_str(value: str | None) -> str | None:
    if value is None:
        return None
    try:
        return _format_date(_parse_selected_date(value))
    except ValueError:
        return str(value)


def _mtime_ns(path: Path) -> int:
    return path.stat().st_mtime_ns


def _now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def get_replay_service() -> ReplayService:
    """FastAPI dependency factory."""
    return ReplayService()


__all__ = [
    "HISTORICAL_CSV_FILENAME",
    "REPLAY_MODE",
    "REPLAY_SOURCE",
    "SIMULATED_REPLAY_MODE",
    "SIMULATED_REPLAY_SOURCE",
    "WALK_FORWARD_FILENAME",
    "ReplayService",
    "clear_replay_file_caches",
    "get_replay_service",
]
