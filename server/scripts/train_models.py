#!/usr/bin/env python
"""Train the SPY direction models and persist all artifacts.

Reads the bootstrapped CSV (``server/data/raw/spy_daily.csv``), runs the
training pipeline for the 1-day and 5-day horizons, and writes the following
under ``server/artifacts/``:

    model_1d.joblib
    model_5d.joblib
    feature_schema.json
    training_metadata.json
    metrics.json
    walk_forward_predictions.csv
    permutation_importance.json
    model_version.txt

Usage:
    python server/scripts/train_models.py
    python server/scripts/train_models.py --raw path/to/spy.csv --cv-splits 5
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

SERVER_ROOT = Path(__file__).resolve().parent.parent
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))

import pandas as pd

from app.config import ARTIFACTS_DIR, DATA_RAW_DIR
from app.ml.artifacts import save_model, write_json
from app.ml.features import FEATURE_NAMES
from app.ml.normalize import normalize_ohlcv
from app.ml.train import HorizonTrainingResult, train_all_horizons

DEFAULT_RAW_CSV = DATA_RAW_DIR / "spy_daily.csv"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--raw", type=Path, default=DEFAULT_RAW_CSV)
    parser.add_argument("--cv-splits", type=int, default=5)
    return parser.parse_args()


def load_raw(path: Path) -> pd.DataFrame:
    if not path.exists():
        raise SystemExit(
            f"Raw CSV not found: {path}\n"
            f"Run `python server/scripts/bootstrap_history.py` first."
        )
    return pd.read_csv(path, parse_dates=["date"])


def main() -> None:
    args = parse_args()
    raw = load_raw(args.raw)
    normalized = normalize_ohlcv(raw, source="cached_local_csv")

    print(
        f"[train] Loaded {len(normalized)} rows "
        f"({normalized['date'].iloc[0].date()} .. {normalized['date'].iloc[-1].date()})"
    )
    print(f"[train] Training with {args.cv_splits}-fold TimeSeriesSplit CV")

    results = train_all_horizons(normalized, n_cv_splits=args.cv_splits)

    ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)

    metrics_out: dict = {"horizons": {}}
    walk_forward_frames: list[pd.DataFrame] = []
    perm_importance_out: dict[str, dict[str, float]] = {}

    for horizon, result in results.items():
        path = save_model(
            horizon=horizon,
            model_name=result.selected_model_name,
            pipeline=result.pipeline,
            feature_names=result.feature_names,
            training_metadata=result.training_metadata,
        )
        print(f"[train] Saved {path.name} (model={result.selected_model_name})")

        metrics_out["horizons"][f"{horizon}d"] = {
            "selected_model": result.selected_model_name,
            "model_comparison": result.model_comparison,
            "baselines": result.baselines,
            "holdout": result.holdout_metrics,
            "yearly": result.yearly_metrics,
            "confidence_buckets": result.confidence_buckets,
            "calibration": result.calibration,
            "backtest": result.backtest,
        }
        walk_forward_frames.append(result.walk_forward)
        perm_importance_out[f"{horizon}d"] = result.permutation_importance

    metrics_out["generated_at"] = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    write_json("metrics.json", metrics_out)

    feature_schema = {
        "features": list(FEATURE_NAMES),
        "adjustment": "unadjusted",
        "generated_at": metrics_out["generated_at"],
    }
    write_json("feature_schema.json", feature_schema)

    training_metadata_out = {f"{h}d": r.training_metadata for h, r in results.items()}
    write_json("training_metadata.json", training_metadata_out)
    write_json("permutation_importance.json", perm_importance_out)

    walk_forward = pd.concat(walk_forward_frames, ignore_index=True)
    walk_forward_path = ARTIFACTS_DIR / "walk_forward_predictions.csv"
    walk_forward.to_csv(walk_forward_path, index=False)
    print(f"[train] Saved {walk_forward_path.name} ({len(walk_forward)} rows)")

    version = _build_version(results)
    (ARTIFACTS_DIR / "model_version.txt").write_text(version + "\n")
    print(f"[train] model_version={version}")

    _log_summary(results)


def _log_summary(results: dict[int, HorizonTrainingResult]) -> None:
    print("\n===== Training summary =====")
    for h, r in results.items():
        m = r.holdout_metrics
        roc = m["roc_auc"]
        roc_str = f"{roc:.3f}" if roc is not None else "N/A"
        print(
            f"  {h}d  model={r.selected_model_name:<24}  "
            f"acc={m['accuracy']:.3f}  bal_acc={m['balanced_accuracy']:.3f}  "
            f"roc_auc={roc_str}  brier={m['brier']:.3f}  N={m['n_observations']}"
        )
    print("============================\n")


def _build_version(results: dict[int, HorizonTrainingResult]) -> str:
    payload = {
        "features": list(FEATURE_NAMES),
        "models": {h: r.selected_model_name for h, r in results.items()},
        "trained_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
    }
    h = hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()[:12]
    return f"v1-{h}"


if __name__ == "__main__":
    main()
