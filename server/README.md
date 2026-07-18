# SPY Forecast Lab — Backend

FastAPI service that fronts Alpha Vantage with a persistent SQLite cache and rate
limiter, and serves probability forecasts from scikit-learn models trained by
`scripts/train_models.py`.

## Layout

```
server/
├── app/                    Application code (config, api, services, ml, storage)
├── scripts/                CLI: bootstrap_history.py, train_models.py
├── tests/                  pytest suite (no live network required)
├── artifacts/              Generated model + cache DB (gitignored)
├── data/                   Downloaded raw OHLCV (gitignored)
├── pyproject.toml
├── .env.example            Placeholder configuration
└── README.md
```

## Local setup

```
python -m venv server/.venv
source server/.venv/bin/activate
pip install -e "server/.[dev,bootstrap]"
cp server/.env.example server/.env    # then edit ALPHA_VANTAGE_API_KEY
```

## Bootstrap historical data (offline, once)

```
python server/scripts/bootstrap_history.py
```

This downloads SPY daily OHLCV from Yahoo Finance (unadjusted) and writes
`server/data/raw/spy_daily.csv` + `server/data/raw/data_manifest.json`.

Offline reproducibility: `python server/scripts/bootstrap_history.py --csv path/to/local.csv`.

## Train models

```
python server/scripts/train_models.py
```

Writes `server/artifacts/model_{1d,5d}.joblib`, `metrics.json`,
`walk_forward_predictions.csv`, `feature_schema.json`, `training_metadata.json`,
`permutation_importance.json`, `model_version.txt`.

## Run the API

```
uvicorn app.main:app --app-dir server --reload --port 8000
```

Endpoints (all under `/api/v1`): `health`, `market/spy`, `forecasts/spy`,
`forecasts/history`, `model/metrics`, `news/spy`.

## Tests

```
pytest server
ruff check server
```

All backend tests mock HTTP with `pytest-httpx`; no live Alpha Vantage calls.
