# SPY Forecast Lab

An explainable machine-learning dashboard that forecasts SPY (S&P 500 ETF)
direction for **the next trading day** and **five trading sessions ahead**. It
was built as an educational project to demonstrate how to combine a modern
React/TypeScript frontend with a small FastAPI machine-learning service — and
to be honest about the limits of forecasting equity direction.

> **Educational analysis, not financial advice.** Model output is probabilistic
> and may be wrong. Past performance does not guarantee future results.

## What's inside

- **Explainable forecasts.** Each prediction ships with plain-English factors
  (moving-average distance, momentum, volatility, volume) so you can see why
  the model leaned up or down.
- **Honest metrics.** Chronological hold-out evaluation, walk-forward
  predictions, calibration curves, per-year breakdowns, per-confidence-bucket
  accuracy, and comparisons against majority-class and persistence baselines.
- **Similar historical market setups.** A leakage-safe historical analogue
  engine surfaces the prior completed SPY sessions whose engineered features
  most closely resemble the latest completed session, along with what actually
  happened over the following one and five sessions. Descriptive only — see
  [Historical analogues](#historical-analogues) below.
- **Educational backtest.** A simple `p(up) >= threshold` rule vs buy-and-hold,
  with transaction costs and a "past performance…" disclaimer.
- **Live Alpha Vantage snapshot.** Cached, rate-limited, key-hidden.
- **Backend-only secrets.** The Alpha Vantage API key lives on the server, and
  the frontend never sees it.

## Market page — section order

The `/market` route (Forecast Lab) is organized as a top-to-bottom narrative:

1. **Current forecast** — one-day and five-day direction outlook with
   confidence language, data mode, and a plain-English interpretation.
2. **Current market conditions** — the latest completed SPY session, price,
   momentum, volatility, and volume.
3. **Why the model leans this way** — the strongest current factors driving
   the probability, grouped by upward / downward / uncertainty.
4. **Similar historical market setups** — historical analogues to the latest
   completed session with realized one-day and five-day outcomes
   ([details](#historical-analogues)).
5. **How reliable has the model been?** — holdout metrics compared with
   simple forecasting baselines.
6. **Historical forecast review** — recent walk-forward forecasts vs actual
   outcomes.
7. **Educational strategy simulation** — the illustrative threshold-rule
   backtest.
8. **Current news context** — headlines and sentiment, presented separately
   and explicitly not used by the forecasting model.
9. **Methodology and limitations** — what the model does, what it does not
   do, and how it was validated.

## Screenshot

![Screenshot placeholder](public/darren.png)

## Architecture

```
                              ┌──────────────────┐
                              │  Alpha Vantage   │
                              │  (upstream API)  │
                              └────────▲─────────┘
                                       │
                                       │ cached + rate-limited
                                       │
┌──────────────┐    HTTPS      ┌───────┴────────┐    joblib    ┌─────────────┐
│  React SPA   │◀──────────────│  FastAPI API   │◀─────────────│  Trained    │
│  (Vite,      │──────────────▶│  (server/)     │              │  Models     │
│  Tailwind)   │  JSON only    └────────────────┘              │  (artifacts)│
└──────────────┘                                                └─────────────┘
```

- Frontend: `src/pages/daily/DailyDashboardPage.tsx` (route `/market`).
- Feature-based frontend layout under `src/features/forecast/`.
- Backend: `server/app/` (FastAPI, Pydantic, HTTPX, scikit-learn, SQLite).
- Model artifacts: `server/artifacts/` (git-ignored, produced by the training
  script).

## Quick start

Prerequisites: **Node 20+**, **Python 3.11+**, an
[Alpha Vantage API key](https://www.alphavantage.co/support/#api-key)
(free tier is enough).

```bash
# Frontend deps
npm install

# Backend virtualenv + deps
python3.11 -m venv server/.venv
source server/.venv/bin/activate
pip install -e "server/.[dev,bootstrap]"

# Configure secrets
cp server/.env.example server/.env       # then set ALPHA_VANTAGE_API_KEY

# Download historical training data (one-time, offline)
python server/scripts/bootstrap_history.py

# Train models (writes to server/artifacts/)
python server/scripts/train_models.py

# Run both dev servers
uvicorn app.main:app --app-dir server --reload --port 8000     # in one terminal
npm run dev                                                    # in another
```

Open <http://localhost:5173/market>.

Or use `make dev` (see the `Makefile`).

### Docker

```bash
ALPHA_VANTAGE_API_KEY=your_key docker compose up --build
```

## Cross-source data consistency

Training and inference must speak the same OHLCV dialect, or the model will
silently drift:

- **yfinance (training bootstrap):** downloaded with `auto_adjust=False`
  so we get **unadjusted** OHLC and raw session volume. Dividends and splits
  do not retroactively rewrite prior bars.
- **Alpha Vantage `TIME_SERIES_DAILY` (runtime):** also **unadjusted** OHLC
  and raw volume.
- Both pass through the same normalizer (`server/app/ml/normalize.py`) so
  column names, dtypes, trading dates (America/New_York), and duplicate
  handling are identical.
- The runtime feature schema is validated against the trained schema before
  inference. Mismatched schemas surface as `ArtifactSchemaMismatch` and the
  API returns `model_unavailable` — never a silent misprediction.

## Historical analogues

The analogue engine standardizes selected market features and identifies prior
completed SPY sessions with the smallest Euclidean distance from the latest
completed session. It is a **descriptive** data-mining utility — not an
additional trained classifier, and it does not change the one-day or five-day
forecast probability.

### Methodology

1. **Feature space.** A subset of the same engineered features used by the
   forecasters (see below). No new formulas — every column is reused from
   `server/app/ml/features.py`.
2. **Candidate pool.** All prior completed sessions in the local historical
   dataset that:
   - occurred **strictly before** the query session's date;
   - lie **outside a 20-trading-day temporal separation window** around the
     query date, so the query cannot approximately match itself and so
     five-day realized outcomes cannot leak into the query's own horizon;
   - have **both** one-day and five-day realized future returns known.
3. **Standardization.** Mean and standard deviation are computed on the
   eligible candidate rows **only**; the query vector is then transformed
   with those same statistics. The query never contributes to the scaling
   parameters.
4. **Distance.** Euclidean distance in the standardized feature space; the
   top-`k` smallest distances become the analogues. A distance-to-similarity
   mapping projects the score onto a 0–100 scale for display.
5. **Realized outcomes.** For each analogue we report the actual one-day and
   five-day forward returns computed from prior data. These are **historical
   outcomes**, not projections onto the current session.

### Features used

`return_1d_lag`, `return_5d`, `return_10d`, `distance_from_sma_20`,
`distance_from_sma_50`, `rsi_14`, `rolling_vol_20`, `opening_gap_pct`,
`volume_to_20d_avg`, `bollinger_band_position_20`, `macd`.

Details for every input live in [`docs/DATA_CARD.md`](docs/DATA_CARD.md).

### Caching

Analogue results are keyed by `symbol + latest completed-session date + feature
schema fingerprint + requested limit` and cached for up to 24 hours. Because
the key includes the session date, results invalidate naturally when the day
advances. Requesting analogues for a session that is already cached does
**not** consume an additional Alpha Vantage API request.

### Limitations and disclaimer

- Similar historical conditions do **not** predict identical outcomes.
- Analogues are correlational — a small feature-space distance is not causal
  evidence.
- The engine reports historical outcomes only; it never generates a forecast,
  a recommendation, or a probability.
- When the local dataset is missing, insufficient, or the feature schema does
  not match, the endpoint returns a truthful `available: false` payload; the
  UI degrades gracefully and does not fabricate analogue records.

> **Historical similarity does not imply the same future outcome. Analogues
> describe past market environments, not a prediction.**

See [`server/app/ml/analogues.py`](server/app/ml/analogues.py) for the engine,
[`server/app/services/analogue_service.py`](server/app/services/analogue_service.py)
for the request wiring and cache policy, and
[`server/README.md`](server/README.md#historical-analogues-api) for the API
contract.

## Design decisions worth calling out

- **No look-ahead in features.** A dedicated test perturbs the last rows and
  asserts that earlier feature values are unchanged.
- **No target leakage.** The realized future return is stored as
  `realized_future_return_{h}d`, deliberately distinct from the backward-
  looking `return_{h}d` feature. A guard in `add_targets` prevents the old
  bug from being reintroduced.
- **Latest completed session.** The backend forecasts only from the most
  recent completed daily bar in America/New_York (holidays and weekends
  respected). No partial intraday features.
- **Transparent failure.** When the backend is unreachable, the UI shows a
  clear "backend unavailable" card. Demo data is opt-in only and always
  labeled.

## Tests

```bash
# Frontend
npm run typecheck && npm run lint && npm test && npm run build

# Backend
ruff check server && pytest server
```

CI runs the same commands via `.github/workflows/`.

## Repository layout

```
.
├── src/                     # Frontend (React 19, TS, Vite, Tailwind)
│   ├── features/forecast/   # API layer, hooks, components
│   ├── pages/daily/         # Route `/market` — SPY Forecast Lab
│   └── test/                # Vitest setup + MSW handlers
├── server/                  # Backend (FastAPI + scikit-learn)
│   ├── app/                 # config, api, clients, services, ml, storage
│   ├── scripts/             # bootstrap_history.py, train_models.py
│   ├── artifacts/           # trained model artifacts (git-ignored)
│   ├── data/raw/            # bootstrapped OHLCV (git-ignored)
│   └── tests/               # pytest suite
├── docs/                    # MODEL_CARD, DATA_CARD
├── .github/                 # CI workflows and templates
├── Makefile                 # convenience commands
└── compose.yaml             # docker compose for backend + frontend
```

## Documentation

- [`docs/MODEL_CARD.md`](docs/MODEL_CARD.md) — models, metrics, limitations,
  deployment workflow for artifacts.
- [`docs/DATA_CARD.md`](docs/DATA_CARD.md) — data provenance, licensing, and
  adjustment convention.
- [`SECURITY.md`](SECURITY.md) — reporting vulnerabilities.
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — how to develop and test.

## License

MIT — see [`LICENSE`](LICENSE).
