"""Load / save trained model artifacts safely.

Only files inside :data:`app.config.ARTIFACTS_DIR` may be loaded. Feature
schemas are validated on load so that a mismatched schema surfaces as
:class:`ArtifactSchemaMismatch` rather than a silent misprediction.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import joblib

from app import config as _config
from app.ml.features import FEATURE_NAMES


def _artifacts_dir() -> Path:
    """Look up ARTIFACTS_DIR dynamically so tests can monkeypatch it."""
    return Path(_config.ARTIFACTS_DIR)


class ArtifactError(RuntimeError):
    """Base class for artifact-related failures."""


class ArtifactMissing(ArtifactError):
    pass


class ArtifactSchemaMismatch(ArtifactError):
    pass


@dataclass(frozen=True)
class LoadedModel:
    horizon: int
    model_name: str
    pipeline: Any
    feature_names: list[str]
    trained_at: datetime
    training_metadata: dict[str, Any]


def artifact_path(name: str) -> Path:
    """Return an absolute path under the artifacts dir, refusing traversal."""
    root = _artifacts_dir().resolve()
    p = (root / name).resolve()
    if root not in p.parents and p != root:
        raise ArtifactError(
            f"Refusing to load artifact outside of {root} (attempted: {p})"
        )
    return p


def save_model(
    *,
    horizon: int,
    model_name: str,
    pipeline: Any,
    feature_names: list[str],
    training_metadata: dict[str, Any],
) -> Path:
    _artifacts_dir().mkdir(parents=True, exist_ok=True)
    path = artifact_path(f"model_{horizon}d.joblib")
    joblib.dump(
        {
            "horizon": horizon,
            "model_name": model_name,
            "pipeline": pipeline,
            "feature_names": list(feature_names),
            "trained_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
            "training_metadata": training_metadata,
        },
        path,
    )
    return path


def load_model(horizon: int) -> LoadedModel:
    path = artifact_path(f"model_{horizon}d.joblib")
    if not path.exists():
        raise ArtifactMissing(f"No trained model artifact for horizon={horizon}d.")

    payload = joblib.load(path)
    trained_at_raw = payload.get("trained_at")
    trained_at = datetime.fromisoformat(trained_at_raw) if trained_at_raw else datetime.now(timezone.utc)

    feature_names = list(payload.get("feature_names") or [])
    assert_features_match(feature_names)

    return LoadedModel(
        horizon=payload["horizon"],
        model_name=payload["model_name"],
        pipeline=payload["pipeline"],
        feature_names=feature_names,
        trained_at=trained_at,
        training_metadata=dict(payload.get("training_metadata") or {}),
    )


def assert_features_match(persisted: list[str]) -> None:
    """Validate that the loaded artifact's feature list matches the current build."""
    if list(persisted) != list(FEATURE_NAMES):
        raise ArtifactSchemaMismatch(
            "Persisted feature schema does not match the current feature builder. "
            f"Retrain via `python server/scripts/train_models.py`. "
            f"Persisted={persisted!r} Current={list(FEATURE_NAMES)!r}"
        )


def write_json(name: str, payload: dict[str, Any]) -> Path:
    _artifacts_dir().mkdir(parents=True, exist_ok=True)
    path = artifact_path(name)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True, default=str))
    return path


def read_json(name: str) -> dict[str, Any]:
    path = artifact_path(name)
    if not path.exists():
        raise ArtifactMissing(f"Missing artifact: {name}")
    return json.loads(path.read_text())
