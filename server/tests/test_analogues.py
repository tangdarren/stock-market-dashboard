"""Tests for :mod:`app.ml.analogues`.

All fixtures are deterministic — either explicit hand-constructed frames or a
seeded numpy generator — so results are reproducible in CI.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from app.ml.analogues import (
    ANALOGUE_DISCLAIMER,
    DEFAULT_FEATURE_NAMES,
    DISTANCE_METHODOLOGY,
    find_historical_analogues,
)

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


def _base_row(**overrides: float) -> dict[str, float]:
    """A neutral candidate row with every default feature set to 0.0.

    Overrides let each test perturb specific features to control ranking and
    verify leakage safeguards without having to spell out every column.
    """
    row: dict[str, float] = {name: 0.0 for name in DEFAULT_FEATURE_NAMES}
    row.update(
        close=100.0,
        volume=1_000_000.0,
        realized_future_return_1d=0.01,
        realized_future_return_5d=0.02,
    )
    row.update(overrides)
    return row


def _make_frame(rows: list[dict[str, float]], start: str = "2020-01-06") -> pd.DataFrame:
    """Build a candidate frame with a business-day ``date`` column."""
    dates = pd.bdate_range(start=start, periods=len(rows))
    frame = pd.DataFrame(rows)
    frame.insert(0, "date", dates)
    return frame


def _neutral_query() -> dict[str, float]:
    return {name: 0.0 for name in DEFAULT_FEATURE_NAMES}


# ---------------------------------------------------------------------------
# Correctness of ranking
# ---------------------------------------------------------------------------


def test_closest_synthetic_observation_ranks_first():
    """The row that matches the query exactly should be the #1 analogue."""
    rows = [
        _base_row(rsi_14=70.0, return_5d=0.05),  # far
        _base_row(rsi_14=30.0, return_5d=-0.05),  # far
        _base_row(rsi_14=50.0, return_5d=0.00),  # perfect match after standardization? no
        _base_row(**{name: 0.0 for name in DEFAULT_FEATURE_NAMES}),  # exact match
    ]
    frame = _make_frame(rows, start="2015-01-05")
    query_date = pd.Timestamp("2024-01-05")

    result = find_historical_analogues(
        frame,
        _neutral_query(),
        query_date,
        top_k=3,
        minimum_separation_days=5,
    )

    assert len(result.analogues) == 3
    top = result.analogues[0]
    # The exact-match row is the last row we appended -> use its date.
    expected_date = frame["date"].iloc[-1].date().isoformat()
    assert top.date == expected_date
    assert top.distance == pytest.approx(0.0, abs=1e-9)
    assert top.similarity_0_100 == pytest.approx(100.0, abs=1e-9)


def test_feature_scaling_prevents_large_magnitude_domination():
    """A feature with a huge raw scale must not swamp all other features."""
    rows = [
        # candidate A: matches on 10 features but is off by 10 units on macd,
        # which after z-scoring is 1 std away (given the sample below).
        _base_row(macd=10.0),
        # candidate B: differs on many small-magnitude features by 5 stds each.
        _base_row(
            return_1d_lag=5.0,
            return_5d=5.0,
            return_10d=5.0,
            distance_from_sma_20=5.0,
            distance_from_sma_50=5.0,
        ),
        # extra rows so that the scaler has variance to fit.
        _base_row(macd=-10.0),
        _base_row(
            return_1d_lag=-5.0,
            return_5d=-5.0,
            return_10d=-5.0,
            distance_from_sma_20=-5.0,
            distance_from_sma_50=-5.0,
        ),
    ]
    frame = _make_frame(rows, start="2015-01-05")
    query_date = pd.Timestamp("2024-01-05")

    result = find_historical_analogues(
        frame,
        _neutral_query(),
        query_date,
        top_k=2,
        minimum_separation_days=5,
    )

    # If the raw macd of 10 dominated, candidate A would be dead last.
    # After per-feature z-scoring both A and B are ~sqrt(std_count) apart from
    # the query — but candidate A is only off in ONE feature (1 std) while
    # candidate B is off in FIVE features (each 1 std), so A must rank first.
    winner = result.analogues[0]
    assert winner.date == frame["date"].iloc[0].date().isoformat()


# ---------------------------------------------------------------------------
# Leakage safeguards
# ---------------------------------------------------------------------------


def test_candidate_dates_are_always_before_query_date():
    rows = [_base_row() for _ in range(30)]
    frame = _make_frame(rows, start="2020-01-01")
    query_date = frame["date"].iloc[15]

    result = find_historical_analogues(
        frame,
        _neutral_query(),
        query_date,
        top_k=10,
        minimum_separation_days=0,
    )

    for analogue in result.analogues:
        assert pd.Timestamp(analogue.date) < query_date


def test_future_sessions_cannot_leak_into_results():
    """Rows dated after the query must never appear as analogues."""
    rows = [_base_row() for _ in range(20)]
    frame = _make_frame(rows, start="2020-01-01")
    # Deliberately push the "closest" match into the FUTURE relative to
    # our chosen query date — it must be filtered out.
    query_date = frame["date"].iloc[5]

    result = find_historical_analogues(
        frame,
        _neutral_query(),
        query_date,
        top_k=10,
        minimum_separation_days=0,
    )

    for analogue in result.analogues:
        assert pd.Timestamp(analogue.date) < query_date


def test_unknown_future_outcomes_are_excluded():
    rows = [_base_row() for _ in range(10)]
    # Make one candidate look "closest" but strip its future 5-day return.
    rows[3]["realized_future_return_5d"] = np.nan
    # And another has an unknown 1-day return.
    rows[4]["realized_future_return_1d"] = np.nan

    frame = _make_frame(rows, start="2020-01-01")
    query_date = pd.Timestamp("2024-01-05")

    result = find_historical_analogues(
        frame,
        _neutral_query(),
        query_date,
        top_k=10,
        minimum_separation_days=0,
    )

    dates = {a.date for a in result.analogues}
    assert frame["date"].iloc[3].date().isoformat() not in dates
    assert frame["date"].iloc[4].date().isoformat() not in dates


def test_minimum_separation_is_enforced():
    rows = [_base_row() for _ in range(60)]
    frame = _make_frame(rows, start="2020-01-01")
    # A specific candidate date and a query 10 calendar days later.
    query_date = frame["date"].iloc[30] + pd.Timedelta(days=10)

    result = find_historical_analogues(
        frame,
        _neutral_query(),
        query_date,
        top_k=100,
        minimum_separation_days=20,
    )

    for analogue in result.analogues:
        gap = (query_date - pd.Timestamp(analogue.date)).days
        assert gap >= 20


# ---------------------------------------------------------------------------
# Input safety
# ---------------------------------------------------------------------------


def test_missing_feature_columns_raise_validation_error():
    rows = [_base_row() for _ in range(5)]
    frame = _make_frame(rows).drop(columns=["rsi_14"])
    query_date = pd.Timestamp("2024-01-05")

    with pytest.raises(ValueError, match="rsi_14"):
        find_historical_analogues(frame, _neutral_query(), query_date)


def test_query_with_missing_feature_raises():
    rows = [_base_row() for _ in range(5)]
    frame = _make_frame(rows)
    bad_query = {name: 0.0 for name in DEFAULT_FEATURE_NAMES if name != "macd"}

    with pytest.raises(ValueError, match="macd"):
        find_historical_analogues(frame, bad_query, pd.Timestamp("2024-01-05"))


def test_query_with_nan_feature_raises():
    rows = [_base_row() for _ in range(5)]
    frame = _make_frame(rows)
    bad_query = _neutral_query()
    bad_query["rsi_14"] = float("nan")

    with pytest.raises(ValueError, match="rsi_14"):
        find_historical_analogues(frame, bad_query, pd.Timestamp("2024-01-05"))


def test_missing_metadata_column_raises():
    rows = [_base_row() for _ in range(5)]
    frame = _make_frame(rows).drop(columns=["realized_future_return_5d"])
    query_date = pd.Timestamp("2024-01-05")

    with pytest.raises(ValueError, match="realized_future_return_5d"):
        find_historical_analogues(frame, _neutral_query(), query_date)


def test_invalid_top_k_and_separation_are_rejected():
    frame = _make_frame([_base_row() for _ in range(5)])
    with pytest.raises(ValueError):
        find_historical_analogues(frame, _neutral_query(), "2024-01-05", top_k=0)
    with pytest.raises(ValueError):
        find_historical_analogues(
            frame, _neutral_query(), "2024-01-05", minimum_separation_days=-1
        )


# ---------------------------------------------------------------------------
# Similarity scale and empty results
# ---------------------------------------------------------------------------


def test_similarity_scores_are_between_0_and_100():
    rng = np.random.default_rng(seed=123)
    rows = []
    for _ in range(80):
        row = _base_row()
        for name in DEFAULT_FEATURE_NAMES:
            row[name] = float(rng.normal(0.0, 1.0))
        rows.append(row)
    frame = _make_frame(rows, start="2018-01-01")
    query = {name: float(rng.normal(0.0, 1.0)) for name in DEFAULT_FEATURE_NAMES}

    result = find_historical_analogues(
        frame,
        query,
        pd.Timestamp("2024-01-05"),
        top_k=10,
        minimum_separation_days=5,
    )

    assert len(result.analogues) == 10
    for analogue in result.analogues:
        assert 0.0 <= analogue.similarity_0_100 <= 100.0
        assert analogue.distance >= 0.0
    # And they should be ordered from most to least similar.
    similarities = [a.similarity_0_100 for a in result.analogues]
    assert similarities == sorted(similarities, reverse=True)


def test_no_candidates_returns_truthful_empty_result():
    rows = [_base_row() for _ in range(5)]
    frame = _make_frame(rows, start="2024-06-01")
    # All candidates are strictly AFTER the query date -> empty pool.
    query_date = pd.Timestamp("2020-01-01")

    result = find_historical_analogues(
        frame,
        _neutral_query(),
        query_date,
        top_k=5,
    )

    assert result.analogues == ()
    assert result.summary is not None
    assert result.summary.n_analogues == 0
    assert result.summary.candidate_pool_size == 0
    assert result.summary.pct_positive_1d is None
    assert result.summary.pct_positive_5d is None
    assert result.summary.median_return_1d is None
    assert result.summary.median_return_5d is None
    assert result.summary.disclaimer == ANALOGUE_DISCLAIMER


def test_summary_reports_the_configured_metadata():
    rows = [_base_row() for _ in range(30)]
    frame = _make_frame(rows, start="2020-01-01")
    query_date = pd.Timestamp("2024-01-05")

    result = find_historical_analogues(
        frame,
        _neutral_query(),
        query_date,
        top_k=5,
        minimum_separation_days=15,
    )
    summary = result.summary
    assert summary is not None
    assert summary.feature_names == DEFAULT_FEATURE_NAMES
    assert summary.distance_methodology == DISTANCE_METHODOLOGY
    assert summary.query_date == "2024-01-05"
    assert summary.minimum_separation_days == 15
    assert summary.n_analogues == 5
    assert summary.candidate_pool_size == 30
    # Direction is always "up"/"down" (never fabricated as null).
    for analogue in result.analogues:
        assert analogue.direction_1d in {"up", "down"}
        assert analogue.direction_5d in {"up", "down"}


def test_positive_percentages_and_averages_are_correct():
    """Aggregate stats must reflect the actual returns of the returned analogues."""
    rows = [
        _base_row(
            realized_future_return_1d=0.02,
            realized_future_return_5d=0.05,
            rsi_14=1.0,
        ),
        _base_row(
            realized_future_return_1d=0.01,
            realized_future_return_5d=-0.02,
            rsi_14=1.1,
        ),
        _base_row(
            realized_future_return_1d=-0.03,
            realized_future_return_5d=0.04,
            rsi_14=1.2,
        ),
        _base_row(
            realized_future_return_1d=0.005,
            realized_future_return_5d=-0.01,
            rsi_14=1.3,
        ),
    ]
    frame = _make_frame(rows, start="2015-01-05")
    query = _neutral_query()
    query["rsi_14"] = 1.0  # so the top-4 analogues are exactly these rows

    result = find_historical_analogues(
        frame,
        query,
        pd.Timestamp("2024-01-05"),
        top_k=4,
        minimum_separation_days=5,
    )

    assert result.summary is not None
    assert result.summary.n_analogues == 4
    # 3/4 positive 1-day, 2/4 positive 5-day.
    assert result.summary.pct_positive_1d == pytest.approx(75.0)
    assert result.summary.pct_positive_5d == pytest.approx(50.0)
    assert result.summary.avg_return_1d == pytest.approx(
        (0.02 + 0.01 - 0.03 + 0.005) / 4
    )
    assert result.summary.median_return_5d == pytest.approx(
        float(np.median([0.05, -0.02, 0.04, -0.01]))
    )


# ---------------------------------------------------------------------------
# Immutability + non-fabrication
# ---------------------------------------------------------------------------


def test_input_dataframes_are_not_mutated():
    rows = [_base_row() for _ in range(10)]
    frame = _make_frame(rows, start="2020-01-01")
    query = _neutral_query()

    frame_before = frame.copy(deep=True)
    query_before = dict(query)

    find_historical_analogues(
        frame,
        query,
        pd.Timestamp("2024-01-05"),
        top_k=3,
        minimum_separation_days=5,
    )

    pd.testing.assert_frame_equal(frame, frame_before)
    assert query == query_before


def test_analogue_records_never_have_null_dates_or_returns():
    """No silently-fabricated records: every returned analogue has real values."""
    rows = [_base_row() for _ in range(20)]
    frame = _make_frame(rows, start="2020-01-01")

    result = find_historical_analogues(
        frame,
        _neutral_query(),
        pd.Timestamp("2024-01-05"),
        top_k=5,
        minimum_separation_days=5,
    )

    for analogue in result.analogues:
        assert analogue.date  # non-empty string
        assert np.isfinite(analogue.realized_return_1d)
        assert np.isfinite(analogue.realized_return_5d)
        assert np.isfinite(analogue.distance)
        assert np.isfinite(analogue.similarity_0_100)


def test_result_serializes_to_plain_dict():
    """to_dict() should produce a fully JSON-compatible payload."""
    rows = [_base_row() for _ in range(10)]
    frame = _make_frame(rows, start="2020-01-01")

    result = find_historical_analogues(
        frame,
        _neutral_query(),
        pd.Timestamp("2024-01-05"),
        top_k=2,
        minimum_separation_days=5,
    )
    payload = result.to_dict()

    assert set(payload) == {"analogues", "summary"}
    assert isinstance(payload["analogues"], list)
    assert isinstance(payload["summary"], dict)
    assert payload["summary"]["feature_names"] == list(DEFAULT_FEATURE_NAMES)
    assert payload["summary"]["disclaimer"] == ANALOGUE_DISCLAIMER
