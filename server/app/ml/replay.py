"""Historical Market Replay Lab — pure domain helpers.

Given the bootstrapped SPY OHLCV history and the out-of-sample
``walk_forward_predictions.csv`` artifact, these helpers determine which
sessions are eligible for replay, build a *pre-reveal* market snapshot ending
on a selected date, and assemble a *separate* result object from the
walk-forward evaluation rows.

Leakage safeguards
------------------
1. The pre-reveal snapshot only includes sessions with ``date <= selected_date``.
2. Snapshot bars never carry model probabilities, realized future returns, or
   direction labels.
3. Historical model forecasts are read from the walk-forward artifact — the
   final trained model is never run retrospectively on past dates.
4. A date is eligible only when both the 1-session and 5-session walk-forward
   outcomes are known and enough prior OHLCV exists for a meaningful lookback.
5. Input DataFrames are never mutated.
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import asdict, dataclass
from typing import Any

import numpy as np
import pandas as pd

from app.ml.features import FEATURE_NAMES, build_features

# ---------------------------------------------------------------------------
# Public constants
# ---------------------------------------------------------------------------

LOOKBACK_SESSIONS = 60

#: Longest rolling window among FEATURE_NAMES (SMA-50). A selected session must
#: sit at least this many rows into the history so its feature vector is complete.
MIN_FEATURE_HISTORY = 50

WALK_FORWARD_REQUIRED_COLUMNS: tuple[str, ...] = (
    "date",
    "horizon_days",
    "prob_up",
    "predicted",
    "actual",
    "correct",
    "realized_return",
)

REPLAY_DISCLAIMER = (
    "Market Replay is an educational reconstruction of a historical session. "
    "Walk-forward probabilities are out-of-sample evaluation outputs from "
    "training time, not live trading signals. Past outcomes do not imply "
    "future results."
)

REPLAY_EVALUATION_NOTE = (
    "This forecast came from out-of-sample walk-forward evaluation during "
    "model training, not from a retrospective run of the final trained model."
)

REPLAY_METHODOLOGY = (
    "Replay reconstructs the market context available on a completed historical "
    "session: roughly 60 prior daily bars plus leakage-safe technical indicators "
    "engineered only from prices and volume on or before that date. Model "
    "probabilities and realized outcomes are withheld until reveal and are "
    "sourced exclusively from the training-time walk-forward evaluation artifact."
)

SUPPORTED_HORIZONS: tuple[int, ...] = (1, 5)

# Snapshot indicator columns derived from existing feature-engineering output.
_MOMENTUM_FEATURE = "return_5d"
_RSI_FEATURE = "rsi_14"
_VOL_FEATURE = "rolling_vol_20"
_MA_DISTANCE_FEATURE = "distance_from_sma_20"
_GAP_FEATURE = "opening_gap_pct"
_VOLUME_RATIO_FEATURE = "volume_to_20d_avg"


# ---------------------------------------------------------------------------
# Return types
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class ReplaySessionBar:
    """One completed session in the pre-reveal lookback window."""

    date: str
    open: float
    high: float
    low: float
    close: float
    volume: int
    momentum_5d: float | None
    rsi_14: float | None
    rolling_vol_20: float | None
    distance_from_sma_20: float | None
    opening_gap_pct: float | None
    relative_volume: float | None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class ReplaySnapshot:
    """Pre-reveal market state ending on ``selected_date``.

    Contains only prices and backward-looking indicators for sessions at or
    before the selected date. Never includes model outputs or future labels.
    """

    selected_date: str
    lookback_sessions: int
    sessions: tuple[ReplaySessionBar, ...]

    def to_dict(self) -> dict[str, Any]:
        return {
            "selected_date": self.selected_date,
            "lookback_sessions": self.lookback_sessions,
            "session_count": len(self.sessions),
            "sessions": [bar.to_dict() for bar in self.sessions],
            "selected_session": self.sessions[-1].to_dict() if self.sessions else None,
        }


@dataclass(frozen=True)
class HorizonOutcome:
    """Walk-forward evaluation outcome for a single forecast horizon."""

    horizon_days: int
    prob_up: float
    predicted: int
    actual: int
    correct: bool
    realized_return: float
    direction_predicted: str
    direction_actual: str

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class ReplayResult:
    """Post-reveal outcomes sourced exclusively from walk-forward artifacts."""

    selected_date: str
    one_day: HorizonOutcome
    five_day: HorizonOutcome
    source: str = "walk_forward_predictions"

    def to_dict(self) -> dict[str, Any]:
        return {
            "selected_date": self.selected_date,
            "one_day": self.one_day.to_dict(),
            "five_day": self.five_day.to_dict(),
            "source": self.source,
        }


@dataclass(frozen=True)
class ReplayBundle:
    """Snapshot and result kept as separate objects for reveal gating."""

    snapshot: ReplaySnapshot
    result: ReplayResult

    def to_dict(self) -> dict[str, Any]:
        return {
            "snapshot": self.snapshot.to_dict(),
            "result": self.result.to_dict(),
        }


# ---------------------------------------------------------------------------
# Eligibility
# ---------------------------------------------------------------------------


def walk_forward_outcome_dates(walk_forward: pd.DataFrame) -> pd.DatetimeIndex:
    """Return dates that have known 1d *and* 5d walk-forward outcomes.

    Requires finite ``realized_return`` and non-null ``actual`` for both
    horizons. Does not consult OHLCV lookback requirements.
    """
    frame = _validate_walk_forward(walk_forward)
    eligible: list[pd.Timestamp] = []
    for date, group in frame.groupby("date", sort=True):
        by_horizon = {int(row.horizon_days): row for row in group.itertuples(index=False)}
        if 1 not in by_horizon or 5 not in by_horizon:
            continue
        if not all(_outcome_row_complete(by_horizon[h]) for h in (1, 5)):
            continue
        eligible.append(pd.Timestamp(date).normalize())
    return pd.DatetimeIndex(eligible)


def eligible_replay_dates(
    ohlcv: pd.DataFrame,
    walk_forward: pd.DataFrame,
    *,
    lookback_sessions: int = LOOKBACK_SESSIONS,
    min_feature_history: int = MIN_FEATURE_HISTORY,
) -> list[str]:
    """Dates that satisfy lookback depth and known dual-horizon outcomes."""
    history = _prepare_ohlcv(ohlcv)
    if history.empty:
        return []

    dates = history["date"]
    outcome_dates = set(walk_forward_outcome_dates(walk_forward))
    eligible: list[str] = []

    for idx, ts in enumerate(dates):
        if ts not in outcome_dates:
            continue
        # Need enough rows at-or-before this session for the lookback window
        # and enough prior history for complete feature engineering.
        sessions_through = idx + 1
        if sessions_through < lookback_sessions:
            continue
        if sessions_through < min_feature_history:
            continue
        eligible.append(_format_date(ts))
    return eligible


def is_eligible_replay_date(
    ohlcv: pd.DataFrame,
    walk_forward: pd.DataFrame,
    selected_date: pd.Timestamp | str,
    *,
    lookback_sessions: int = LOOKBACK_SESSIONS,
    min_feature_history: int = MIN_FEATURE_HISTORY,
) -> bool:
    target = _format_date(selected_date)
    return target in set(
        eligible_replay_dates(
            ohlcv,
            walk_forward,
            lookback_sessions=lookback_sessions,
            min_feature_history=min_feature_history,
        )
    )


def nearest_eligible_dates(
    eligible_dates: list[str],
    selected_date: pd.Timestamp | str,
) -> tuple[str | None, str | None]:
    """Return ``(before, after)`` closest eligible ISO dates around ``selected_date``."""
    if not eligible_dates:
        return None, None
    target = _format_date(selected_date)
    before = None
    after = None
    for iso in eligible_dates:
        if iso < target:
            before = iso
        elif iso > target:
            after = iso
            break
    return before, after


# ---------------------------------------------------------------------------
# Snapshot / result builders
# ---------------------------------------------------------------------------


def build_replay_snapshot(
    ohlcv: pd.DataFrame,
    selected_date: pd.Timestamp | str,
    *,
    lookback_sessions: int = LOOKBACK_SESSIONS,
) -> ReplaySnapshot:
    """Build a pre-reveal lookback window ending on ``selected_date``.

    Features are engineered on the history truncated at the selected date so
    that no post-selected-date prices can influence indicators. Raises
    ``ValueError`` when the date is missing or the lookback cannot be filled.
    """
    history = _prepare_ohlcv(ohlcv)
    selected = pd.Timestamp(selected_date).normalize()
    as_of = history[history["date"] <= selected]
    if as_of.empty or as_of["date"].iloc[-1] != selected:
        raise ValueError(f"Selected date {selected.date().isoformat()} is not in the OHLCV history.")
    if len(as_of) < lookback_sessions:
        raise ValueError(
            f"Need at least {lookback_sessions} completed sessions through "
            f"{selected.date().isoformat()}; found {len(as_of)}."
        )

    # Truncate before feature engineering so rolling windows never see the future.
    features = build_features(as_of)
    window = features.iloc[-lookback_sessions:].copy()
    selected_row = window.iloc[-1]
    if selected_row[list(FEATURE_NAMES)].isna().any():
        raise ValueError(
            f"Selected date {selected.date().isoformat()} lacks a complete feature vector; "
            "insufficient prior history for indicators."
        )

    bars = tuple(_session_bar(row) for _, row in window.iterrows())
    return ReplaySnapshot(
        selected_date=_format_date(selected),
        lookback_sessions=lookback_sessions,
        sessions=bars,
    )


def build_replay_result(
    walk_forward: pd.DataFrame,
    selected_date: pd.Timestamp | str,
) -> ReplayResult:
    """Assemble the reveal payload from walk-forward rows for ``selected_date``."""
    frame = _validate_walk_forward(walk_forward)
    selected = pd.Timestamp(selected_date).normalize()
    day = frame[frame["date"] == selected]
    if day.empty:
        raise ValueError(
            f"No walk-forward rows for selected date {selected.date().isoformat()}."
        )

    by_horizon: dict[int, Any] = {}
    for row in day.itertuples(index=False):
        by_horizon[int(row.horizon_days)] = row

    missing = [h for h in (1, 5) if h not in by_horizon or not _outcome_row_complete(by_horizon[h])]
    if missing:
        raise ValueError(
            f"Walk-forward outcomes incomplete for {selected.date().isoformat()} "
            f"(missing/invalid horizons: {missing})."
        )

    return ReplayResult(
        selected_date=_format_date(selected),
        one_day=_horizon_outcome(by_horizon[1]),
        five_day=_horizon_outcome(by_horizon[5]),
    )


def build_replay_bundle(
    ohlcv: pd.DataFrame,
    walk_forward: pd.DataFrame,
    selected_date: pd.Timestamp | str,
    *,
    lookback_sessions: int = LOOKBACK_SESSIONS,
    min_feature_history: int = MIN_FEATURE_HISTORY,
) -> ReplayBundle:
    """Validate eligibility, then build snapshot and result as separate objects."""
    if not is_eligible_replay_date(
        ohlcv,
        walk_forward,
        selected_date,
        lookback_sessions=lookback_sessions,
        min_feature_history=min_feature_history,
    ):
        raise ValueError(
            f"Date {_format_date(selected_date)} is not eligible for market replay."
        )
    snapshot = build_replay_snapshot(
        ohlcv, selected_date, lookback_sessions=lookback_sessions
    )
    result = build_replay_result(walk_forward, selected_date)
    return ReplayBundle(snapshot=snapshot, result=result)


# ---------------------------------------------------------------------------
# Internals
# ---------------------------------------------------------------------------


def _prepare_ohlcv(ohlcv: pd.DataFrame) -> pd.DataFrame:
    required = {"date", "open", "high", "low", "close", "volume"}
    missing = required - set(ohlcv.columns)
    if missing:
        raise ValueError(f"OHLCV frame missing required columns: {sorted(missing)}")
    out = ohlcv.loc[:, list(required)].copy()
    out["date"] = pd.to_datetime(out["date"]).dt.normalize()
    out = out.sort_values("date").drop_duplicates(subset=["date"], keep="last")
    out = out.reset_index(drop=True)
    return out


def _validate_walk_forward(walk_forward: pd.DataFrame) -> pd.DataFrame:
    missing = set(WALK_FORWARD_REQUIRED_COLUMNS) - set(walk_forward.columns)
    if missing:
        raise ValueError(
            f"Walk-forward artifact missing required columns: {sorted(missing)}"
        )
    out = walk_forward.loc[:, list(WALK_FORWARD_REQUIRED_COLUMNS)].copy()
    out["date"] = pd.to_datetime(out["date"]).dt.normalize()
    out["horizon_days"] = out["horizon_days"].astype(int)
    return out


def _outcome_row_complete(row: Any) -> bool:
    try:
        prob = float(row.prob_up)
        realized = float(row.realized_return)
        actual = row.actual
        predicted = row.predicted
    except (TypeError, ValueError, AttributeError):
        return False
    if not np.isfinite(prob) or not np.isfinite(realized):
        return False
    return not (
        actual is None or predicted is None or pd.isna(actual) or pd.isna(predicted)
    )


def _horizon_outcome(row: Any) -> HorizonOutcome:
    predicted = int(row.predicted)
    actual = int(row.actual)
    correct_raw = row.correct
    if correct_raw is None or (isinstance(correct_raw, float) and np.isnan(correct_raw)):
        correct = predicted == actual
    else:
        correct = bool(int(correct_raw))
    return HorizonOutcome(
        horizon_days=int(row.horizon_days),
        prob_up=float(np.clip(float(row.prob_up), 0.0, 1.0)),
        predicted=predicted,
        actual=actual,
        correct=correct,
        realized_return=float(row.realized_return),
        direction_predicted="up" if predicted == 1 else "down",
        direction_actual="up" if actual == 1 else "down",
    )


def _session_bar(row: pd.Series) -> ReplaySessionBar:
    return ReplaySessionBar(
        date=_format_date(row["date"]),
        open=float(row["open"]),
        high=float(row["high"]),
        low=float(row["low"]),
        close=float(row["close"]),
        volume=int(row["volume"]),
        momentum_5d=_optional_float(row.get(_MOMENTUM_FEATURE)),
        rsi_14=_optional_float(row.get(_RSI_FEATURE)),
        rolling_vol_20=_optional_float(row.get(_VOL_FEATURE)),
        distance_from_sma_20=_optional_float(row.get(_MA_DISTANCE_FEATURE)),
        opening_gap_pct=_optional_float(row.get(_GAP_FEATURE)),
        relative_volume=_relative_volume(row),
    )


def _relative_volume(row: pd.Series) -> float | None:
    """Relative volume = volume / 20-day average, derived from ``volume_to_20d_avg``."""
    ratio = row.get(_VOLUME_RATIO_FEATURE)
    if ratio is None or (isinstance(ratio, float) and not np.isfinite(ratio)):
        return None
    try:
        return float(ratio) + 1.0
    except (TypeError, ValueError):
        return None


def _optional_float(value: Any) -> float | None:
    if value is None or (isinstance(value, float) and not np.isfinite(value)):
        return None
    try:
        f = float(value)
    except (TypeError, ValueError):
        return None
    if not np.isfinite(f):
        return None
    return f


def _format_date(value: Any) -> str:
    return pd.Timestamp(value).normalize().date().isoformat()


def assert_snapshot_has_no_leakage_fields(snapshot: ReplaySnapshot) -> None:
    """Dev/test helper: snapshot dicts must not expose future/model fields."""
    forbidden = {
        "prob_up",
        "predicted",
        "actual",
        "correct",
        "realized_return",
        "realized_future_return_1d",
        "realized_future_return_5d",
        "target_1d",
        "target_5d",
        "future_close_1d",
        "future_close_5d",
        "one_day",
        "five_day",
    }
    payload = snapshot.to_dict()
    found = _collect_keys(payload) & forbidden
    if found:
        raise AssertionError(f"Replay snapshot leaked forbidden fields: {sorted(found)}")


def _collect_keys(obj: Any) -> set[str]:
    keys: set[str] = set()
    if isinstance(obj, dict):
        keys.update(obj.keys())
        for value in obj.values():
            keys.update(_collect_keys(value))
    elif isinstance(obj, Iterable) and not isinstance(obj, (str, bytes)):
        for item in obj:
            keys.update(_collect_keys(item))
    return keys


__all__ = [
    "LOOKBACK_SESSIONS",
    "MIN_FEATURE_HISTORY",
    "REPLAY_DISCLAIMER",
    "REPLAY_EVALUATION_NOTE",
    "REPLAY_METHODOLOGY",
    "SUPPORTED_HORIZONS",
    "WALK_FORWARD_REQUIRED_COLUMNS",
    "HorizonOutcome",
    "ReplayBundle",
    "ReplayResult",
    "ReplaySessionBar",
    "ReplaySnapshot",
    "assert_snapshot_has_no_leakage_fields",
    "build_replay_bundle",
    "build_replay_result",
    "build_replay_snapshot",
    "eligible_replay_dates",
    "is_eligible_replay_date",
    "nearest_eligible_dates",
    "walk_forward_outcome_dates",
]
