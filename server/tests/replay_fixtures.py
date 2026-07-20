"""Shared helpers for Market Replay Lab tests.

Deterministic synthetic OHLCV + walk-forward frames only — no network.
"""

from __future__ import annotations

import json
from collections.abc import Mapping
from typing import Any

import numpy as np
import pandas as pd

from app.ml.targets import add_targets
from app.services.replay_service import clear_replay_file_caches

# Top-level and nested keys that must never appear in a pre-reveal session payload.
SESSION_FORBIDDEN_KEYS: frozenset[str] = frozenset(
    {
        "prob_up",
        "prob_down",
        "direction_predicted",
        "direction_actual",
        "realized_return",
        "realized_future_return_1d",
        "realized_future_return_5d",
        "one_day",
        "five_day",
        "predicted",
        "actual",
        "correct",
        "target_1d",
        "target_5d",
        "future_close_1d",
        "future_close_5d",
    }
)

CHART_BAR_KEYS: frozenset[str] = frozenset(
    {"date", "open", "high", "low", "close", "volume"}
)


def synthetic_ohlcv(
    n: int = 200,
    *,
    start: str = "2020-01-02",
    seed: int = 7,
) -> pd.DataFrame:
    """Random-walk OHLCV on business days — stable for a given seed."""
    rng = np.random.default_rng(seed)
    close = 300 + np.cumsum(rng.normal(0, 1.2, size=n))
    dates = pd.bdate_range(start=start, periods=n)
    return pd.DataFrame(
        {
            "date": dates,
            "open": close + rng.normal(0, 0.4, size=n),
            "high": close + rng.uniform(0.3, 1.8, size=n),
            "low": close - rng.uniform(0.3, 1.8, size=n),
            "close": close,
            "volume": rng.integers(1_000_000, 8_000_000, size=n),
        }
    )


def synthetic_walk_forward(
    dates: list[pd.Timestamp] | pd.DatetimeIndex,
    *,
    horizons: tuple[int, ...] = (1, 5),
    drop_horizon_on: dict[str, int] | None = None,
    realized_by_date: Mapping[str, Mapping[int, float]] | None = None,
) -> pd.DataFrame:
    """Build walk-forward-shaped rows for the given dates."""
    rows: list[dict[str, object]] = []
    drop_horizon_on = drop_horizon_on or {}
    realized_by_date = realized_by_date or {}
    for i, ts in enumerate(dates):
        iso = pd.Timestamp(ts).date().isoformat()
        for h in horizons:
            if drop_horizon_on.get(iso) == h:
                continue
            realized = realized_by_date.get(iso, {}).get(h)
            if realized is None:
                realized = 0.01 if i % 2 == 0 else -0.01
            prob_up = 0.4 + (i % 10) * 0.02
            predicted = int(prob_up >= 0.5)
            actual = int(realized > 0)
            rows.append(
                {
                    "date": iso,
                    "horizon_days": h,
                    "prob_up": prob_up,
                    "predicted": predicted,
                    "actual": actual,
                    "correct": int(predicted == actual),
                    "realized_return": float(realized),
                }
            )
    return pd.DataFrame(rows)


def walk_forward_matching_ohlcv(
    ohlcv: pd.DataFrame,
    dates: list[pd.Timestamp] | pd.DatetimeIndex,
) -> pd.DataFrame:
    """Walk-forward rows whose realized returns match true forward closes."""
    with_targets = add_targets(ohlcv.copy())
    by_date = {
        pd.Timestamp(row["date"]).normalize(): row for _, row in with_targets.iterrows()
    }
    realized: dict[str, dict[int, float]] = {}
    for ts in dates:
        row = by_date[pd.Timestamp(ts).normalize()]
        iso = pd.Timestamp(ts).date().isoformat()
        realized[iso] = {
            1: float(row["realized_future_return_1d"]),
            5: float(row["realized_future_return_5d"]),
        }
    return synthetic_walk_forward(dates, realized_by_date=realized)


def write_history(tmp_path, ohlcv: pd.DataFrame, monkeypatch) -> None:
    from app import config as config_module

    data_raw = tmp_path / "data"
    data_raw.mkdir(exist_ok=True)
    ohlcv.to_csv(data_raw / "spy_daily.csv", index=False)
    monkeypatch.setattr(config_module, "DATA_RAW_DIR", data_raw)
    clear_replay_file_caches()


def write_walk_forward(tmp_path, walk_forward: pd.DataFrame, monkeypatch) -> None:
    from app import config as config_module

    artifacts = tmp_path / "artifacts"
    artifacts.mkdir(exist_ok=True)
    walk_forward.to_csv(artifacts / "walk_forward_predictions.csv", index=False)
    monkeypatch.setattr(config_module, "ARTIFACTS_DIR", artifacts)
    clear_replay_file_caches()


def seed_replay_artifacts(
    tmp_path,
    monkeypatch,
    *,
    n: int = 140,
    ohlcv: pd.DataFrame | None = None,
    walk: pd.DataFrame | None = None,
    include_metadata: bool = True,
) -> pd.DataFrame:
    """Write history + walk-forward (+ optional training metadata) under tmp_path."""
    from app import config as config_module

    frame = ohlcv if ohlcv is not None else synthetic_ohlcv(n=n)
    walk_frame = (
        walk if walk is not None else synthetic_walk_forward(frame["date"].iloc[55:])
    )

    data_raw = tmp_path / "data"
    data_raw.mkdir(exist_ok=True)
    frame.to_csv(data_raw / "spy_daily.csv", index=False)
    monkeypatch.setattr(config_module, "DATA_RAW_DIR", data_raw)

    artifacts = tmp_path / "artifacts"
    artifacts.mkdir(exist_ok=True)
    walk_frame.to_csv(artifacts / "walk_forward_predictions.csv", index=False)
    if include_metadata:
        (artifacts / "model_version.txt").write_text("v-test-replay\n")
        (artifacts / "training_metadata.json").write_text(
            json.dumps(
                {
                    "1d": {
                        "holdout_start": "2020-03-01",
                        "holdout_end": "2020-07-01",
                        "model_name": "logistic_regression",
                        "n_holdout": 80,
                    },
                    "5d": {
                        "holdout_start": "2020-03-01",
                        "holdout_end": "2020-07-01",
                        "model_name": "logistic_regression",
                        "n_holdout": 80,
                    },
                }
            )
        )
    monkeypatch.setattr(config_module, "ARTIFACTS_DIR", artifacts)
    clear_replay_file_caches()
    return frame


def collect_keys(obj: Any) -> set[str]:
    """Recursively collect mapping keys from a JSON-like structure."""
    keys: set[str] = set()
    if isinstance(obj, dict):
        keys.update(obj.keys())
        for value in obj.values():
            keys.update(collect_keys(value))
    elif isinstance(obj, list):
        for item in obj:
            keys.update(collect_keys(item))
    return keys


def assert_session_has_no_leakage(payload: dict[str, Any]) -> None:
    """Assert a pre-reveal session payload exposes no model/future fields."""
    found = collect_keys(payload) & SESSION_FORBIDDEN_KEYS
    assert not found, f"pre-reveal payload leaked forbidden fields: {sorted(found)}"
    for bar in payload.get("series", []):
        assert set(bar.keys()) <= CHART_BAR_KEYS
    indicators = payload.get("indicators") or {}
    assert not (set(indicators.keys()) & SESSION_FORBIDDEN_KEYS)
