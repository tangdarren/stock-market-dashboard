"""Historical analogue search over the canonical SPY feature space.

Purpose
-------
Given a query session's engineered feature vector, find the historical trading
sessions whose market conditions most closely resemble it. This is a
*descriptive* data-mining utility, not a new forecasting model — the analogues
are shown so a reader can understand what kind of environment the model is
currently operating in, alongside how those environments actually resolved.

Leakage safeguards
------------------
1. Candidates must occur strictly BEFORE the query date.
2. Candidates within ``minimum_separation_days`` of the query date are removed
   so the query cannot be its own approximate neighbor and so 5-day realized
   returns cannot bleed into the query horizon.
3. Candidates without a known 1-day AND 5-day realized future return are
   dropped — we never report an analogue whose future outcome is unobserved.
4. Feature standardization statistics are fit on the eligible candidate rows
   only. The query vector is transformed using those same statistics; it never
   contributes to the mean/std.
5. The runtime feature schema is validated against the requested feature list
   before any distance is computed — a missing or NaN feature raises rather
   than silently disappearing into an imputed value.
6. Input DataFrames are never mutated.

The disclaimer text produced by :func:`find_historical_analogues` explicitly
states that similarity does not imply the same future outcome.
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import asdict, dataclass, field
from typing import Any

import numpy as np
import pandas as pd

from app.ml.features import FEATURE_NAMES

# ---------------------------------------------------------------------------
# Defaults
# ---------------------------------------------------------------------------

#: The suggested feature subset for analogue search. Names correspond to
#: columns already produced by :func:`app.ml.features.build_features` — we
#: never re-derive feature formulas here.
DEFAULT_FEATURE_NAMES: tuple[str, ...] = (
    "return_1d_lag",
    "return_5d",
    "return_10d",
    "distance_from_sma_20",
    "distance_from_sma_50",
    "rsi_14",
    "rolling_vol_20",
    "opening_gap_pct",
    "volume_to_20d_avg",
    "bollinger_band_position_20",
    "macd",
)

#: Distance methodology label surfaced in results for transparency.
DISTANCE_METHODOLOGY = (
    "Euclidean distance in the space of standardized (z-scored) features. "
    "Standardization statistics are fit ONLY on eligible historical candidate "
    "rows so the query vector never contributes to the mean or standard deviation."
)

#: Non-forecasting disclaimer surfaced alongside every result.
ANALOGUE_DISCLAIMER = (
    "Historical similarity does not imply the same future outcome. "
    "Analogues describe past market environments, not a prediction."
)

# Columns required to compute realized future outcomes.
_FUTURE_RETURN_1D = "realized_future_return_1d"
_FUTURE_RETURN_5D = "realized_future_return_5d"


# ---------------------------------------------------------------------------
# Return types
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class AnalogueRecord:
    """A single historical analogue.

    ``similarity_0_100`` is a monotonically decreasing function of ``distance``;
    a perfect match scores 100. See :func:`_distance_to_similarity` for the
    exact formula.
    """

    date: str
    similarity_0_100: float
    distance: float
    close: float
    realized_return_1d: float
    realized_return_5d: float
    direction_1d: str  # "up" | "down"
    direction_5d: str  # "up" | "down"
    rsi_14: float | None
    rolling_vol_20: float | None
    distance_from_sma_20: float | None
    relative_volume: float | None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class AnalogueSummary:
    n_analogues: int
    pct_positive_1d: float | None
    pct_positive_5d: float | None
    median_return_1d: float | None
    median_return_5d: float | None
    avg_return_1d: float | None
    avg_return_5d: float | None
    feature_names: tuple[str, ...]
    distance_methodology: str
    query_date: str
    minimum_separation_days: int
    candidate_pool_size: int
    disclaimer: str = ANALOGUE_DISCLAIMER

    def to_dict(self) -> dict[str, Any]:
        d = asdict(self)
        d["feature_names"] = list(self.feature_names)
        return d


@dataclass(frozen=True)
class AnalogueResult:
    analogues: tuple[AnalogueRecord, ...] = field(default_factory=tuple)
    summary: AnalogueSummary | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "analogues": [a.to_dict() for a in self.analogues],
            "summary": self.summary.to_dict() if self.summary else None,
        }


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def find_historical_analogues(
    historical_features: pd.DataFrame,
    query_features: pd.Series | dict[str, float],
    query_date: pd.Timestamp | str,
    *,
    top_k: int = 5,
    minimum_separation_days: int = 20,
    feature_names: Iterable[str] | None = None,
) -> AnalogueResult:
    """Return the ``top_k`` historical sessions most similar to ``query_features``.

    Parameters
    ----------
    historical_features:
        A dataframe produced by :func:`app.ml.features.build_features` and then
        passed through :func:`app.ml.targets.add_targets`. Must include a
        ``date`` column, the OHLCV columns, ``realized_future_return_1d`` and
        ``realized_future_return_5d``, and the requested feature columns.
    query_features:
        A mapping (Series or dict) of feature name -> value describing the
        session we want to find analogues for. Must not contain NaN.
    query_date:
        The reference date. Only candidates strictly earlier than this date
        (respecting ``minimum_separation_days``) are eligible.
    top_k:
        Maximum number of analogues to return. Defaults to 5.
    minimum_separation_days:
        Exclude candidates within +/- this many calendar days of ``query_date``.
        Defaults to 20 so 5-day realized returns cannot bleed into the query
        horizon.
    feature_names:
        Optional override of the feature subset. Defaults to
        :data:`DEFAULT_FEATURE_NAMES`.

    Notes
    -----
    Never mutates the input dataframes. Missing or unknown data always
    surfaces as an exception or as an empty ``AnalogueResult`` — never as a
    fabricated record.
    """
    if top_k <= 0:
        raise ValueError("top_k must be a positive integer")
    if minimum_separation_days < 0:
        raise ValueError("minimum_separation_days must be non-negative")

    features = tuple(feature_names) if feature_names is not None else DEFAULT_FEATURE_NAMES
    if not features:
        raise ValueError("feature_names must contain at least one feature")

    query_ts = pd.Timestamp(query_date).normalize()

    query_vector = _prepare_query_vector(query_features, features)
    candidates = _prepare_candidate_frame(
        historical_features,
        features=features,
        query_date=query_ts,
        minimum_separation_days=minimum_separation_days,
    )

    if candidates.empty:
        return AnalogueResult(
            analogues=(),
            summary=AnalogueSummary(
                n_analogues=0,
                pct_positive_1d=None,
                pct_positive_5d=None,
                median_return_1d=None,
                median_return_5d=None,
                avg_return_1d=None,
                avg_return_5d=None,
                feature_names=features,
                distance_methodology=DISTANCE_METHODOLOGY,
                query_date=query_ts.date().isoformat(),
                minimum_separation_days=minimum_separation_days,
                candidate_pool_size=0,
            ),
        )

    candidate_matrix = candidates[list(features)].to_numpy(dtype=float, copy=True)
    mean, scale = _fit_scaler(candidate_matrix)
    scaled_candidates = _apply_scaler(candidate_matrix, mean, scale)
    scaled_query = _apply_scaler(query_vector.reshape(1, -1), mean, scale)[0]

    distances = _euclidean_distances(scaled_candidates, scaled_query)
    # Deterministic tie-breaking: primary key is distance, secondary key is
    # candidate index (chronological order preserved by _prepare_candidate_frame).
    order = np.lexsort((np.arange(len(distances)), distances))
    top = order[: min(top_k, len(order))]

    similarity_scale = _similarity_scale(features)

    records: list[AnalogueRecord] = []
    for idx in top:
        row = candidates.iloc[int(idx)]
        distance = float(distances[int(idx)])
        similarity = _distance_to_similarity(distance, similarity_scale)
        ret1 = float(row[_FUTURE_RETURN_1D])
        ret5 = float(row[_FUTURE_RETURN_5D])
        records.append(
            AnalogueRecord(
                date=_format_date(row["date"]),
                similarity_0_100=similarity,
                distance=distance,
                close=float(row["close"]) if pd.notna(row.get("close")) else float("nan"),
                realized_return_1d=ret1,
                realized_return_5d=ret5,
                direction_1d="up" if ret1 > 0 else "down",
                direction_5d="up" if ret5 > 0 else "down",
                rsi_14=_optional_float(row.get("rsi_14")),
                rolling_vol_20=_optional_float(row.get("rolling_vol_20")),
                distance_from_sma_20=_optional_float(row.get("distance_from_sma_20")),
                relative_volume=_relative_volume(row),
            )
        )

    returns_1d = np.array([r.realized_return_1d for r in records], dtype=float)
    returns_5d = np.array([r.realized_return_5d for r in records], dtype=float)

    summary = AnalogueSummary(
        n_analogues=len(records),
        pct_positive_1d=_pct_positive(returns_1d),
        pct_positive_5d=_pct_positive(returns_5d),
        median_return_1d=_safe_median(returns_1d),
        median_return_5d=_safe_median(returns_5d),
        avg_return_1d=_safe_mean(returns_1d),
        avg_return_5d=_safe_mean(returns_5d),
        feature_names=features,
        distance_methodology=DISTANCE_METHODOLOGY,
        query_date=query_ts.date().isoformat(),
        minimum_separation_days=minimum_separation_days,
        candidate_pool_size=int(len(candidates)),
    )

    return AnalogueResult(analogues=tuple(records), summary=summary)


# ---------------------------------------------------------------------------
# Internals
# ---------------------------------------------------------------------------


def _prepare_query_vector(
    query_features: pd.Series | dict[str, float],
    features: tuple[str, ...],
) -> np.ndarray:
    if isinstance(query_features, pd.Series):
        source: dict[str, Any] = query_features.to_dict()
    else:
        source = dict(query_features)

    missing = [name for name in features if name not in source]
    if missing:
        raise ValueError(
            "find_historical_analogues: query is missing required features: "
            f"{sorted(missing)}"
        )

    values = np.array([source[name] for name in features], dtype=float)
    if np.any(~np.isfinite(values)):
        bad = [name for name, v in zip(features, values, strict=True) if not np.isfinite(v)]
        raise ValueError(
            "find_historical_analogues: query has non-finite feature values for: "
            f"{sorted(bad)}"
        )
    return values


def _prepare_candidate_frame(
    historical_features: pd.DataFrame,
    *,
    features: tuple[str, ...],
    query_date: pd.Timestamp,
    minimum_separation_days: int,
) -> pd.DataFrame:
    required_meta = {"date", "close", _FUTURE_RETURN_1D, _FUTURE_RETURN_5D}
    missing_meta = required_meta - set(historical_features.columns)
    if missing_meta:
        raise ValueError(
            "find_historical_analogues: historical frame is missing required "
            f"metadata columns: {sorted(missing_meta)}. Did you forget to call "
            "add_targets()?"
        )
    missing_features = [name for name in features if name not in historical_features.columns]
    if missing_features:
        raise ValueError(
            "find_historical_analogues: historical frame is missing required "
            f"feature columns: {sorted(missing_features)}"
        )

    # Copy so the caller's frame is never mutated.
    df = historical_features.copy(deep=True)
    df["date"] = pd.to_datetime(df["date"]).dt.normalize()

    # Guard 1: strictly-before-query-date filter.
    before_query = df["date"] < query_date

    # Guard 2: temporal-separation window (symmetric so the window semantics
    # are meaningful even if a caller passes a frame that extends past the
    # query date).
    separation = pd.Timedelta(days=minimum_separation_days)
    outside_window = (df["date"] - query_date).abs() >= separation

    # Guard 3: known 1-day AND 5-day future returns.
    has_futures = df[_FUTURE_RETURN_1D].notna() & df[_FUTURE_RETURN_5D].notna()

    # Guard 4: complete feature vector.
    has_features = df[list(features)].notna().all(axis=1)

    eligible = df[before_query & outside_window & has_futures & has_features]
    return eligible.sort_values("date").reset_index(drop=True)


def _fit_scaler(matrix: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Return per-column mean and standard-deviation for the candidate matrix.

    Zero-variance columns get a scale of 1.0 so the corresponding standardized
    values collapse to 0 rather than exploding to +/- infinity.
    """
    mean = matrix.mean(axis=0)
    std = matrix.std(axis=0, ddof=0)
    scale = np.where(std > 0.0, std, 1.0)
    return mean, scale


def _apply_scaler(matrix: np.ndarray, mean: np.ndarray, scale: np.ndarray) -> np.ndarray:
    return (matrix - mean) / scale


def _euclidean_distances(candidates: np.ndarray, query: np.ndarray) -> np.ndarray:
    diff = candidates - query
    return np.sqrt(np.sum(diff * diff, axis=1))


def _similarity_scale(features: tuple[str, ...]) -> float:
    """Reference distance used to map raw distance -> 0..100 similarity.

    Using ``sqrt(n_features)`` means "roughly one z-score of deviation per
    feature on average" resolves to a similarity of ``100 * exp(-1) ~= 36.8``.
    Independent of the sample so results are reproducible across datasets.
    """
    return float(np.sqrt(max(len(features), 1)))


def _distance_to_similarity(distance: float, scale: float) -> float:
    if not np.isfinite(distance) or distance < 0.0:
        return 0.0
    value = 100.0 * float(np.exp(-distance / scale))
    # Clamp defensively for downstream consumers.
    return float(max(0.0, min(100.0, value)))


def _pct_positive(values: np.ndarray) -> float | None:
    if values.size == 0:
        return None
    return float((values > 0).sum()) / float(values.size) * 100.0


def _safe_median(values: np.ndarray) -> float | None:
    if values.size == 0:
        return None
    return float(np.median(values))


def _safe_mean(values: np.ndarray) -> float | None:
    if values.size == 0:
        return None
    return float(np.mean(values))


def _optional_float(value: Any) -> float | None:
    if value is None:
        return None
    try:
        f = float(value)
    except (TypeError, ValueError):
        return None
    if not np.isfinite(f):
        return None
    return f


def _relative_volume(row: pd.Series) -> float | None:
    """Relative volume = latest volume / 20-day average volume.

    Derived from the existing ``volume_to_20d_avg`` feature when available
    (which is defined as ``volume / rolling_mean_20 - 1``), otherwise
    returns ``None``. Never re-derives from raw OHLCV.
    """
    ratio = row.get("volume_to_20d_avg")
    if ratio is None or (isinstance(ratio, float) and not np.isfinite(ratio)):
        return None
    try:
        return float(ratio) + 1.0
    except (TypeError, ValueError):
        return None


def _format_date(value: Any) -> str:
    ts = pd.Timestamp(value)
    return ts.date().isoformat()


__all__ = [
    "ANALOGUE_DISCLAIMER",
    "DEFAULT_FEATURE_NAMES",
    "DISTANCE_METHODOLOGY",
    "AnalogueRecord",
    "AnalogueResult",
    "AnalogueSummary",
    "find_historical_analogues",
]


# Sanity-check at import time: the default feature set must be a subset of the
# canonical feature schema (guards against a name drift when features.py evolves).
_missing_from_schema = set(DEFAULT_FEATURE_NAMES) - set(FEATURE_NAMES)
if _missing_from_schema:  # pragma: no cover - static invariant
    raise RuntimeError(
        "analogues.DEFAULT_FEATURE_NAMES drifted from features.FEATURE_NAMES: "
        f"missing {sorted(_missing_from_schema)}"
    )
