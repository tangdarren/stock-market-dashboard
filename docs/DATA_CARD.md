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

## Known limitations

- Small numeric differences between yfinance and Alpha Vantage can appear on
  the same trading day due to different exchange aggregation.
- Alpha Vantage occasionally delays end-of-day data by several hours; the UI
  labels this transparently as "Stale cache".
