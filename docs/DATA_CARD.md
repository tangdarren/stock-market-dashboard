# Data Card — SPY daily OHLCV

Tempest is built around one time series: daily OHLCV for SPY (SPDR S&P 500 ETF). Live mode and simulated mode share the same normalized schema, but they pull from different sources and must never be mixed silently.

## Live market data

Two real-world sources are used, both configured for the **unadjusted** OHLCV convention:

- **Training bootstrap** — Yahoo Finance via `yfinance` with `auto_adjust=False`. Written once to a local CSV under `server/data/raw/` (git-ignored).
- **Runtime inference** — Alpha Vantage `TIME_SERIES_DAILY`, cached in SQLite for about 6 hours.
- **Optional news context** — Alpha Vantage `NEWS_SENTIMENT`, cached for about 4 hours. News is shown for context only and is not an input to the forecasting models.

Unadjusted prices keep training and inference speaking the same dialect. Splits and dividends do not rewrite historical bars. Features are mostly percent changes and distances from moving averages, so absolute price level differences after corporate actions do not dominate learning. If you ever switch to adjusted prices, retrain everything under that same convention on both sides.

Yahoo data is for offline bootstrap only; this repo does not redistribute it. Alpha Vantage usage follows [their terms](https://www.alphavantage.co/terms_of_service/). API keys stay in `server/.env`, never in git or the frontend bundle.

Free-tier Alpha Vantage traffic is rate-limited in the backend (default daily budget `20`, minimum interval `15s`). On throttle envelopes or transport failures, the API may return the last successful cache with `mode: "stale"` so the UI can label it clearly instead of pretending the feed is fresh.

## Simulated Excel workbook

Simulated mode reads a fictional workbook at `server/data/simulated/spy_simulated_market_data.xlsx`. It exists for local development, UI demos, and automated tests.

The workbook is loaded only when the caller explicitly requests simulated mode (the visible **Simulated data** switch). Live Alpha Vantage failures do **not** fall through to this file. Every value is synthetic — not SPY, not Alpha Vantage, not Yahoo Finance — and the UI labels simulated responses accordingly.

Sheets used at runtime include `Scenario`, `Market_Data`, `Forecast_History`, `News_Context`, and `Scenario_Labels`, with optional `Data_Dictionary` and `Current_Forecast` fixtures. Market rows are normalized through the same OHLCV pipeline as live data so charting and feature code stay consistent.

## Schema and conventions

After `normalize_ohlcv`, every OHLCV frame has:

| Column   | Type           | Notes |
|----------|----------------|-------|
| `date`   | `datetime[ns]` | Trading date at midnight, tz-naive, representing America/New_York calendar dates |
| `open`   | `float64`      | Unadjusted session open |
| `high`   | `float64`      | Unadjusted session high |
| `low`    | `float64`      | Unadjusted session low |
| `close`  | `float64`      | Unadjusted session close |
| `volume` | `int64`        | Session share volume |

Duplicates collapse (last write wins). Rows sort ascending by date. Forecasts and analogues use the latest **completed** session only — weekends, holidays, and partial intraday bars are out of scope.

## How data flows into models

```
[ Yahoo Finance ]                       [ Alpha Vantage ]
       │  auto_adjust=False                    │  TIME_SERIES_DAILY
       ▼                                       ▼
[ normalize_ohlcv ]  ─────────►  canonical OHLCV  ◄─────────  [ normalize_ohlcv ]
                                       │
                       ┌───────────────┼───────────────┐
                       ▼                               ▼
              [ build_features ]              runtime: latest completed
                       │                       session only
                       ▼
              [ add_targets ]
                       │
                       ▼
              [ train_models.py ] → server/artifacts/
```

In simulated mode, `Market_Data` / `Forecast_History` (and related sheets) substitute for the Yahoo/Alpha Vantage path after the same normalization step.

## Look-ahead protection and date handling

Feature engineering only uses information available through session `t`. Targets look forward (`close[t+h]`), but those future columns stay `NaN` until the horizon is observable and are filtered out before training. Realized forward returns are named `realized_future_return_{h}d` so they cannot overwrite the backward-looking `return_{h}d` feature — that naming bug was an easy way to leak labels, and there is an explicit guard against it.

The historical analogue engine is stricter still: candidates must fall strictly before the query date, sit outside a 20-calendar-day separation window, and already have observed one-day and five-day outcomes. Standardization statistics are fit on eligible candidates only; the query row never contributes to them.

## Historical analogues

Analogues are a descriptive nearest-neighbor lookup over prior completed sessions (`server/app/ml/analogues.py`). The candidate pool comes from the local bootstrap CSV (`server/data/raw/spy_daily.csv`). The query row is the latest completed session from the cached Alpha Vantage snapshot (same 6-hour market cache — no extra API call). Features are engineered with the shared `features.py` pipeline and validated before distance is computed; missing values raise instead of being quietly imputed.

Similarity uses these columns (all from the shared feature builder):

`return_1d_lag`, `return_5d`, `return_10d`, `distance_from_sma_20`, `distance_from_sma_50`, `rsi_14`, `rolling_vol_20`, `opening_gap_pct`, `volume_to_20d_avg`, `bollinger_band_position_20`, `macd`.

Distance is Euclidean in standardized space, mapped to a 0–100 similarity score for display. Each analogue reports its date, similarity/distance, close, realized one- and five-session returns and directions, plus a few context fields (RSI, volatility, SMA distance, relative volume). Aggregate summaries include how often analogues finished up over each horizon and typical realized returns.

Analogues are not forecasts and do not change model probabilities. Past similarity does not imply the same future outcome. If the local history is missing or too short, the endpoint returns `available: false` with a machine-readable reason rather than inventing neighbors.

## Known limitations

Yfinance and Alpha Vantage can disagree slightly on the same trading day because of exchange aggregation differences. Alpha Vantage end-of-day prints can lag by several hours; the UI surfaces that as stale cache when applicable. Simulated workbook data is fictional by design — useful for demos and tests, never a substitute for live market history. Analogue search needs a sufficiently long local CSV after the separation window and feature warm-up, or it correctly reports unavailable.
