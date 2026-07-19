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

Endpoints (all under `/api/v1`): `health`, `market/spy`, `market/spy/analogues`,
`forecasts/spy`, `forecasts/history`, `model/metrics`, `news/spy`.

## Historical analogues API

`GET /api/v1/market/spy/analogues`

Returns the historical SPY sessions whose engineered features most closely
resemble the latest completed session, together with the realized one-day and
five-day returns that followed those historical sessions. This is a
**descriptive analysis** — it does not alter forecast probabilities and no
model artifact is loaded to serve this endpoint. See
[`docs/DATA_CARD.md`](../docs/DATA_CARD.md#historical-analogue-engine--data-usage)
for the exact feature list and eligibility rules.

### Query parameters

| Name    | Type    | Default | Range | Description                                     |
|---------|---------|---------|-------|-------------------------------------------------|
| `limit` | integer | `5`     | `3..10` | Maximum number of analogue sessions to return. |

Requests outside the range return `HTTP 422` (FastAPI validation).

### Successful response (illustrative values only)

```json
{
  "available": true,
  "symbol": "SPY",
  "query_date": "YYYY-MM-DD",
  "features_as_of": "YYYY-MM-DD",
  "data_as_of": "YYYY-MM-DDTHH:MM:SSZ",
  "limit": 5,
  "methodology": {
    "method": "standardized_euclidean_nearest_neighbors",
    "distance": "Euclidean distance in the space of standardized (z-scored) features. Standardization statistics are fit ONLY on eligible historical candidate rows so the query vector never contributes to the mean or standard deviation.",
    "features": [
      "return_1d_lag", "return_5d", "return_10d",
      "distance_from_sma_20", "distance_from_sma_50",
      "rsi_14", "rolling_vol_20", "opening_gap_pct",
      "volume_to_20d_avg", "bollinger_band_position_20", "macd"
    ],
    "feature_schema_version": "abcd1234",
    "minimum_separation_days": 20,
    "candidate_pool_size": 4321
  },
  "summary": {
    "analogue_count": 5,
    "positive_after_1d_pct": 60.0,
    "positive_after_5d_pct": 40.0,
    "median_return_1d": 0.0015,
    "median_return_5d": -0.0031,
    "avg_return_1d": 0.0022,
    "avg_return_5d": -0.0018
  },
  "analogues": [
    {
      "date": "YYYY-MM-DD",
      "similarity": 82.4,
      "distance": 0.58,
      "close": 279.15,
      "return_1d": 0.006,
      "return_5d": 0.021,
      "direction_1d": "up",
      "direction_5d": "up",
      "rsi_14": 63.2,
      "rolling_vol_20": 0.0091,
      "distance_from_sma_20": 0.014,
      "relative_volume": 0.87
    }
  ],
  "disclaimer": "Historical similarity does not imply the same future outcome. Analogues describe past market environments, not a prediction.",
  "mode": "live",
  "cache_status": "miss",
  "generated_at": "YYYY-MM-DDTHH:MM:SSZ"
}
```

All values above are **illustrative placeholders**, not real observations.
The `disclaimer` field is emitted on every response, successful or not.

### Unavailable response

When the underlying prerequisites are not met, the endpoint returns
`HTTP 200` with `"available": false` (rather than a 5xx) so that the
Historical Analogues panel can degrade gracefully alongside the rest of the
dashboard:

```json
{
  "available": false,
  "symbol": "SPY",
  "query_date": null,
  "features_as_of": null,
  "data_as_of": null,
  "limit": null,
  "methodology": {
    "method": "standardized_euclidean_nearest_neighbors",
    "features": [
      "return_1d_lag", "return_5d", "return_10d",
      "distance_from_sma_20", "distance_from_sma_50",
      "rsi_14", "rolling_vol_20", "opening_gap_pct",
      "volume_to_20d_avg", "bollinger_band_position_20", "macd"
    ],
    "feature_schema_version": "abcd1234",
    "minimum_separation_days": 20
  },
  "summary": null,
  "analogues": [],
  "disclaimer": "Historical similarity does not imply the same future outcome. Analogues describe past market environments, not a prediction.",
  "mode": "unavailable",
  "cache_status": "bypass",
  "reason": "historical_dataset_missing",
  "detail": "Local SPY history is not present. Run `python server/scripts/bootstrap_history.py` first."
}
```

Possible `reason` values:

| Reason                          | Meaning                                                           |
|---------------------------------|-------------------------------------------------------------------|
| `historical_dataset_missing`    | The local historical CSV has not been bootstrapped.               |
| `historical_dataset_malformed`  | The local CSV could not be parsed or failed schema validation.    |
| `market_data_unavailable`       | The latest completed-session snapshot is not obtainable.          |
| `insufficient_history`          | The recent market series is too short to build a query row.      |
| `insufficient_observations`     | Not enough eligible candidates to run the search.                 |
| `feature_schema_mismatch`       | Runtime features do not match the analogue feature schema.        |

### Cache behavior

- Results are cached in the same persistent SQLite cache used by
  `/market/spy`, under a key formed from:
  `symbol + latest completed-session date + feature schema fingerprint + limit`.
- The TTL is up to **24 hours**; the day-scoped cache key means results
  invalidate naturally when the latest completed session changes.
- A cache hit returns the exact previously computed payload with an updated
  `mode`, `data_as_of`, and `cache_status: "hit"`.
- No additional Alpha Vantage HTTP request is issued when the underlying
  market snapshot is already cached.

### Non-goals for this endpoint

- Does not train, load, or expose any model artifact.
- Does not fabricate analogue records when data is missing.
- Does not return API keys, environment values, file paths outside the
  documented `reason`/`detail` copy, or any other secret material.

## Tests

```
pytest server
ruff check server
```

All backend tests mock HTTP with `pytest-httpx`; no live Alpha Vantage calls.
