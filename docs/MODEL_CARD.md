# Model Card — SPY direction forecasts

Tempest trains two small classifiers that estimate whether SPY’s next close will finish higher than today’s close. One model looks one trading day ahead; the other looks five sessions ahead. Both are educational tools for studying chronological evaluation, calibration, and explainability — not trading systems.

## What the models predict

Each model answers a binary question: will `close[t+h]` be greater than `close[t]` for horizon `h` in `{1, 5}`?

The two horizons are trained as independent pipelines. At inference time the API returns a probability of finishing higher (`prob_up`), a direction label, and a confidence band. Targets stay `NaN` at the end of the series until the future close is actually known, so incomplete rows never become fake labels.

## How predictions are generated

Training data is daily SPY OHLCV from Yahoo Finance (`yfinance`, `auto_adjust=False`), covering roughly `2005-01-03` through the day the bootstrap script runs — on the order of 5,400 sessions. Runtime forecasts use the same **unadjusted** convention via Alpha Vantage `TIME_SERIES_DAILY`. See [`DATA_CARD.md`](DATA_CARD.md) for provenance and the Excel simulation path.

Features are 26 leak-free technical columns from `server/app/ml/features.py` (also recorded in `feature_schema.json`): lagged returns, moving-average distances, EMA/MACD, RSI(14), ATR(14), Bollinger band position, volume ratios, opening gap, and daily range. Targets are built in `server/app/ml/targets.py`. Realized future returns are stored as `realized_future_return_{h}d` so they never collide with the backward-looking `return_{h}d` feature.

About 15% of rows (minimum 60) are held out chronologically as an untouched test set. Cross-validation stays inside the training segment only (`TimeSeriesSplit(5)`).

Candidates evaluated per horizon:

- `StandardScaler + LogisticRegression(class_weight="balanced")`
- `RandomForestClassifier(class_weight="balanced")`
- `HistGradientBoostingClassifier`

Majority-class and previous-day persistence baselines are tracked alongside. The winner is the candidate with the highest mean validation ROC-AUC; Brier score breaks ties. Models are scikit-learn 1.4+, serialized with joblib.

For live mode, forecasts use only the latest completed America/New_York session — no partial intraday bars. Simulated mode can serve fixture outlooks from the Excel workbook when the UI switch is on; that path never activates just because live data failed.

## What the reported metrics mean

Holdout metrics land in `server/artifacts/metrics.json` per horizon:

- **Accuracy / balanced accuracy** — overall correctness, with balanced accuracy adjusting for class imbalance.
- **ROC-AUC** — ranking quality of the probability scores.
- **Brier score** — how well probabilities are calibrated (lower is better).
- **Confusion matrix**, **per-year breakdown**, and **per-confidence-bucket accuracy** (low / moderate / high).
- **Calibration curve** (10 bins).
- **Baselines** — majority-class and persistence, so any claimed edge has context.
- **1-day educational backtest** — a simple threshold rule versus buy-and-hold, with transaction costs.

Daily SPY direction is close to a coin flip. A couple of percentage points of balanced accuracy over the majority-class baseline is a realistic “maybe something is there” signal. If anything ever showed ~100% out-of-sample accuracy, that would almost certainly be leakage — see the guards in `add_targets` and `tests/test_train_smoke.py`.

## Explainability

Logistic regression explanations use standardized coefficient contributions (`x_scaled * coef`). Tree ensembles combine global permutation importance (computed on the holdout at training time) with whether the current feature sits above or below its training median. Those explanations are labeled as “Global importance × current context — not a causal explanation.”

## Historical analogues (not a second model)

The Market page also shows similar historical setups via a nearest-neighbor search (`server/app/ml/analogues.py`). That engine is descriptive only: it finds prior completed sessions that look similar in feature space and reports what happened next. It does not train a classifier, load a joblib artifact, or change the one-day / five-day forecast probabilities. Similarity is correlational, not causal — historical resemblance does not imply the same future outcome. Feature lists and eligibility rules are in [`DATA_CARD.md`](DATA_CARD.md#historical-analogues).

## Limitations

Markets are noisy; modest edges are the realistic ceiling, and regime shifts can wipe them out. Alpha Vantage daily data is end-of-day, so there is no intraday signal. Technical features are correlational — explanations say which inputs the model responded to, not why price moved. Backtests do not guarantee future results.

Demographic fairness considerations do not apply; the models use aggregate market data only.

## Why this is not financial advice

These forecasts are probabilistic educational outputs from a small research project. They can be wrong on any given day, they ignore transaction costs and portfolio constraints in the live outlook, and they are not designed for trading decisions, portfolio construction, or regulated financial use. Treat the dashboard as a way to inspect methodology and failure modes, not as a recommendation to buy or sell.

## Deployment notes

Artifacts are not committed to git. The API does not train on startup and will not download untrusted joblib files. Typical flow:

1. Bootstrap and train in a trusted environment (`python server/scripts/bootstrap_history.py && python server/scripts/train_models.py`, or `make bootstrap && make train`).
2. Ship `server/artifacts/` into production (Docker build copy, read-only volume via `compose.yaml`, or manual `rsync`).

If trusted artifacts are missing, the API returns `mode: "model_unavailable"` and the UI shows a clear unavailable state instead of inventing a forecast.

## Change log

- `v1-...` — initial release. Selection by highest CV ROC-AUC (Brier tie-break). Fixed a target-column overwrite that could collide with the backward-looking `return_{h}d` feature.
- Historical analogue engine added as a descriptive companion on the Market page. No change to model targets, selection, metrics, or forecast probabilities.
