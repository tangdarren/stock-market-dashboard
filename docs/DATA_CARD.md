# Data Card — SPY daily OHLCV

## Overview

This project consumes a single time series: **daily OHLCV for the SPDR S&P 500
ETF (SPY)**. Two independent sources are used, both configured to return the
**unadjusted** convention:

| Purpose            | Source                            | Convention  | Cache TTL       |
|--------------------|-----------------------------------|-------------|-----------------|
| Training bootstrap | Yahoo Finance (via `yfinance`)    | Unadjusted  | Local CSV       |
| Runtime inference  | Alpha Vantage `TIME_SERIES_DAILY` | Unadjusted  | 6 h (SQLite)    |
| Optional context   | Alpha Vantage `NEWS_SENTIMENT`    | N/A         | 4 h (SQLite)    |

## Schema

After normalization every OHLCV frame has these columns:

| Column   | Type            | Description                                     |
|----------|-----------------|-------------------------------------------------|
| `date`   | `datetime[ns]`  | Trading date, midnight, tz-naive (America/NY). |
| `open`   | `float64`       | Session opening price (unadjusted).             |
| `high`   | `float64`       | Session high (unadjusted).                      |
| `low`    | `float64`       | Session low (unadjusted).                       |
| `close`  | `float64`       | Session close (unadjusted).                     |
| `volume` | `int64`         | Session share volume.                           |

Duplicates are collapsed (last write wins). Rows sort ascending by date.

## Adjustment convention

Both sources are configured to return **unadjusted** OHLC. Corporate actions
(splits, dividends) therefore do NOT rewrite historical bars. This matters:

- Consistency between training and inference is preserved.
- A split makes the historical `close` look "large" relative to the current
  `close` — that's expected under the unadjusted convention. Features are
  normalized (percent changes, distances from moving averages) so they are
  scale-free and this does not distort learning.
- If you want adjusted prices, retrain **all** models with the same
  adjustment convention on both sides.

## Provenance and licensing

- **Yahoo Finance:** used for the one-time offline training bootstrap only.
  Redistribution of raw Yahoo data is discouraged; the bootstrap script
  stores the result under `server/data/raw/` which is git-ignored.
- **Alpha Vantage:** subject to
  [Alpha Vantage's terms](https://www.alphavantage.co/terms_of_service/).
  API keys are personal and rate-limited. Keys live only in `server/.env`,
  never in git or in the frontend bundle.
- **This project** does not redistribute either dataset.

## Rate limiting and freshness

- Alpha Vantage free tier: 25 requests/day, ~5 requests/minute. The backend
  enforces a configurable **daily budget** (default `20`) and **minimum
  interval** (default `15s`) via persistent SQLite counters.
- The market snapshot cache TTL is 6 hours; the news cache TTL is 4 hours.
- When Alpha Vantage returns a throttle envelope (`Note`, `Information`) or
  transport failure, the backend returns the last successful cached response
  with `mode: "stale"` and the UI marks it clearly.

## Data lineage

```
[ Yahoo Finance ]                       [ Alpha Vantage ]
       │  auto_adjust=False                    │  TIME_SERIES_DAILY (compact)
       ▼                                       ▼
[ normalize_ohlcv ]  ─────────►  canonical OHLCV frame  ◄─────────  [ normalize_ohlcv ]
                                       │
                       ┌───────────────┼───────────────┐
                       ▼                               ▼
              [ build_features ]              (runtime inference:
                       │                       latest completed
                       ▼                       session only, no
              [ add_targets ]                  partial intraday bars)
                       │
                       ▼
              [ train_models.py ]
                       │
                       ▼
              server/artifacts/*.joblib + metrics.json + walk_forward_predictions.csv
```

## Historical analogue engine — data usage

The analogue engine at `server/app/ml/analogues.py` performs a **descriptive**
nearest-neighbor search over prior completed SPY sessions. It does not train
or update any model.

### Runtime vs training data

| Purpose                              | Source                             | Location                          |
|--------------------------------------|------------------------------------|-----------------------------------|
| Historical candidate pool            | Local CSV from bootstrap           | `server/data/raw/spy_daily.csv`   |
| Latest completed-session query row   | Cached Alpha Vantage snapshot      | Same 6 h SQLite cache as `/market/spy` — no extra API request. |

The runtime query row is engineered with the same
`server/app/ml/features.py` pipeline that produced the historical feature
frame, then validated against the analogue feature schema before any distance
is computed. A missing or non-numeric feature raises rather than silently
becoming an imputed value.

### Fields used for similarity

| Feature                       | Description                                                      |
|-------------------------------|------------------------------------------------------------------|
| `return_1d_lag`               | Prior session's simple return.                                   |
| `return_5d`                   | Trailing 5-session simple return.                                |
| `return_10d`                  | Trailing 10-session simple return.                               |
| `distance_from_sma_20`        | Close relative to the 20-session simple moving average.          |
| `distance_from_sma_50`        | Close relative to the 50-session simple moving average.          |
| `rsi_14`                      | 14-period Relative Strength Index.                               |
| `rolling_vol_20`              | 20-session rolling standard deviation of daily returns.          |
| `opening_gap_pct`             | Overnight opening gap as a fraction of prior close.              |
| `volume_to_20d_avg`           | Session volume divided by trailing 20-session mean volume.       |
| `bollinger_band_position_20`  | Close position inside the 20-session Bollinger band envelope.    |
| `macd`                        | MACD line (short EMA − long EMA).                                |

Every column is produced by the shared feature builder; the analogue engine
never re-derives formulas.

### Candidate-session eligibility

For a query session with date `q`, a historical row `t` is eligible only if
**all** of the following hold:

1. **Temporal ordering.** `t < q`. The engine strictly refuses to look
   forward.
2. **Temporal separation.** `abs(q − t)` in trading days is at least
   **`MINIMUM_SEPARATION_DAYS = 20`**. This prevents the query from
   approximately matching itself and prevents a candidate's five-day realized
   return from overlapping the query horizon.
3. **Realized outcomes known.** Both `realized_future_return_1d` and
   `realized_future_return_5d` must be non-`NaN`. Rows without observed
   future outcomes are dropped — the engine never reports an analogue whose
   forward return is unobserved.
4. **Complete feature vector.** Every analogue feature listed above must be
   present and finite for row `t`. Rows with any missing analogue feature
   are excluded from the pool.

### Standardization methodology

- Mean and standard deviation are computed on **eligible candidate rows only**.
- Features with zero standard deviation over the eligible pool are left
  unscaled (division by zero is guarded).
- The query vector is transformed with **those same statistics** and never
  contributes to them.
- Distance is Euclidean in the standardized feature space; a distance-to-
  similarity mapping projects the score onto a 0–100 scale for display.

### Output fields per analogue

| Field                   | Description                                              |
|-------------------------|----------------------------------------------------------|
| `date`                  | Analogue session's trading date (ISO).                   |
| `similarity`            | 0–100 score, monotonically decreasing in raw distance.   |
| `distance`              | Raw Euclidean distance in the standardized space.        |
| `close`                 | Session close price.                                     |
| `return_1d`             | Realized one-session-ahead simple return.                |
| `return_5d`             | Realized five-session-ahead simple return.               |
| `direction_1d`          | `"up"` if `return_1d > 0`, else `"down"`.                |
| `direction_5d`          | `"up"` if `return_5d > 0`, else `"down"`.                |
| `rsi_14`                | Analogue-session RSI value.                              |
| `rolling_vol_20`        | Analogue-session 20-day volatility.                      |
| `distance_from_sma_20`  | Analogue-session distance from its 20-day SMA.           |
| `relative_volume`       | Analogue-session volume divided by its 20-day average.   |

Aggregate summary fields (per response): analogue count, percentage positive
after one day, percentage positive after five days, median and average
realized returns for both horizons, the feature list actually used, the
distance methodology description, the query date, and the candidate pool size.

### Non-goals

- Analogues are **not** forecasts and do **not** change any model probability.
- Realized analogue outcomes are historical outcomes, not projections.
- Similar historical conditions do **not** predict identical outcomes.

## Known limitations

- Small numeric differences between yfinance and Alpha Vantage can appear on
  the same trading day due to different exchange aggregation.
- Alpha Vantage occasionally delays end-of-day data by several hours; the UI
  labels this transparently as "Stale cache".
- The analogue engine requires the local historical CSV to exist and cover
  enough prior sessions to satisfy the temporal-separation window and produce
  complete feature rows; otherwise the endpoint returns a truthful
  `available: false` payload with a machine-readable `reason`.
