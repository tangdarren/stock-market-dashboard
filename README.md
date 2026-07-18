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
- **Educational backtest.** A simple `p(up) >= threshold` rule vs buy-and-hold,
  with transaction costs and a "past performance…" disclaimer.
- **Live Alpha Vantage snapshot.** Cached, rate-limited, key-hidden.
- **Backend-only secrets.** The Alpha Vantage API key lives on the server, and
  the frontend never sees it.

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
