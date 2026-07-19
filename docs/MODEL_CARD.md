# Model Card — SPY direction forecasts

## Model details

- **Task:** Binary classification of next-day and 5-day-ahead SPY closing
  price direction (`close[t+h] > close[t]`).
- **Horizons:** `1d`, `5d` — trained as two independent pipelines.
- **Frameworks:** scikit-learn 1.4+, serialized with joblib.
- **Candidates evaluated per horizon:**
  - `StandardScaler + LogisticRegression(class_weight="balanced")`
  - `RandomForestClassifier(class_weight="balanced")`
  - `HistGradientBoostingClassifier`
- **Baselines:** majority-class predictor, previous-day persistence.
- **Selection rule:** highest mean validation ROC-AUC across
  `TimeSeriesSplit(5)`. Brier score breaks ties.
- **Features:** 26 leak-free technical features (see `server/app/ml/features.py`
  or `feature_schema.json`). Includes lagged returns, moving-average distances,
  EMA/MACD, RSI(14), ATR(14), Bollinger band position, volume ratios, opening
  gap, and daily range.
- **Targets:** built in `server/app/ml/targets.py`; retain `NaN` at the tail
  where `close[t+h]` is not yet observable.

## Intended use

- Educational analysis and visualization of what daily SPY direction
  classification looks like when done responsibly (chronological splits,
  baselines, calibration, walk-forward evaluation).
- **Not intended** for trading decisions, portfolio construction, or any
  regulated financial application.

## Training data

- **Symbol:** SPY (SPDR S&P 500 ETF Trust).
- **Source:** Yahoo Finance via `yfinance`, `auto_adjust=False`.
- **Convention:** **unadjusted** OHLCV. Same convention used at inference from
  Alpha Vantage `TIME_SERIES_DAILY`.
- **Date range:** `2005-01-03` to the day the bootstrap script runs. Roughly
  5,400 trading sessions.
- **Chronological holdout:** ~15% of rows (min 60) reserved as an untouched
  test set. Cross-validation is done inside the training segment only.

## Evaluation

Reported per horizon in `server/artifacts/metrics.json`:

- accuracy, balanced accuracy, ROC-AUC, Brier score
- confusion matrix
- per-year breakdown
- per-confidence-bucket accuracy (low / moderate / high)
- calibration curve (10 bins)
- majority-class + persistence baselines for comparison
- 1-day educational backtest (buy-and-hold vs threshold rule + costs)

### What "good" looks like

Daily SPY direction is close to a coin flip; a plausible edge is a couple of
percentage points of balanced accuracy over the majority-class baseline. If
the frontend ever reports a metric like 100% out-of-sample accuracy, that
indicates a data-leak bug — see the guardrails in `add_targets` and the
smoke test in `tests/test_train_smoke.py`.

## Limitations

- Markets are noisy. Modest predictive edges are the realistic ceiling.
- Regime changes (rate cycles, macro shocks) can invalidate historical
  relationships.
- Alpha Vantage `TIME_SERIES_DAILY` is end-of-day. Forecasts use only the
  most recent completed session — no intraday data.
- Technical features are correlational, not causal. Explanations describe
  which levers the model responds to, not why the market moved.
- Backtests do not guarantee future performance.

## Fairness / demographic considerations

Not applicable — this model operates on aggregate market data with no
demographic component.

## Explainability

- **Logistic regression pipeline:** standardized coefficient contribution
  (`x_scaled * coef`).
- **Tree ensembles:** global permutation importance (computed on the holdout
  at training time) combined with whether the current feature value is above
  or below its training median. Labeled as
  "Global importance × current context — not a causal explanation".

## Deployment

Artifacts are **not** committed to git. Because the API MUST NOT train on
startup or download untrusted `joblib` files, deployment is a two-step
manual/CI process:

1. Reproducibly bootstrap and train in a trusted environment
   (`python server/scripts/bootstrap_history.py && python server/scripts/train_models.py`).
2. Ship the produced `server/artifacts/` directory to production:
   - **Build-time:** copy artifacts into the backend Docker image as part of
     the release pipeline.
   - **Runtime volume:** mount them read-only into the container (see
     `compose.yaml`).
   - **Manual transfer:** `rsync -a server/artifacts/ prod:/srv/artifacts/`.

When trusted artifacts are missing, the API returns `mode: "model_unavailable"`
and the frontend renders a "Model unavailable" card. Never silently substitute
a stale or unverified model.

## Historical analogues (descriptive, non-model)

The Market page also includes a **Similar Historical Market Setups** section
powered by a historical analogue engine
(`server/app/ml/analogues.py`,
`server/app/services/analogue_service.py`).

The following clarifications are important because the analogue section sits
next to the model output on the page and could otherwise be mistaken for a
second forecaster:

- **Descriptive analysis only.** The analogue engine performs a leakage-safe
  nearest-neighbor lookup over prior completed SPY sessions in the local
  historical dataset. It surfaces "what environments have looked like this
  before, and what happened afterwards."
- **Not an additional trained classifier.** No model is fit, no coefficients
  are learned, no `joblib` artifact is produced, and the API never loads a
  model file when serving analogues.
- **Does not alter forecast probabilities.** The one-day and five-day
  probabilities returned by `/api/v1/forecasts/spy` are unchanged whether
  or not the analogue endpoint is available. The two features are wired
  independently.
- **Contextual examples only.** Realized one-day and five-day returns
  reported per analogue are the actual historical outcomes for those prior
  sessions, not projections onto the current session.
- **Not causal evidence.** A small distance in standardized feature space
  is a correlational similarity — it is not proof that the market will
  behave the same way, and analogues carry the same disclaimer as the
  rest of the page: *"Historical similarity does not imply the same future
  outcome."*

See [`docs/DATA_CARD.md`](DATA_CARD.md#historical-analogue-engine--data-usage)
for the exact features, eligibility rules, standardization methodology, and
output schema.

## Change log

- `v1-...` — initial release. Model selection: highest CV ROC-AUC (tie-break
  by Brier). Bug fix: prevented target column overwrite of the identically
  named backward-looking `return_{h}d` feature.
- Historical analogue engine added as a descriptive companion to the
  Market page. No change to model targets, model selection, generated
  model metrics, or forecast probabilities.
