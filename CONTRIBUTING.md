# Contributing

Thanks for considering a contribution. This document explains how to get set
up and what checks to run before opening a pull request.

## Local development

```bash
# Frontend
npm install
npm run dev        # http://localhost:5173

# Backend
python3.11 -m venv server/.venv
source server/.venv/bin/activate
pip install -e "server/.[dev,bootstrap]"
cp server/.env.example server/.env    # add ALPHA_VANTAGE_API_KEY

python server/scripts/bootstrap_history.py
python server/scripts/train_models.py
uvicorn app.main:app --app-dir server --reload --port 8000
```

There's a `Makefile` at the root with shortcuts (`make dev`, `make test`,
`make lint`, `make bootstrap`, `make train`).

## Coding standards

- **Frontend:** ESLint (flat config, TypeScript-aware) + Prettier defaults.
  Run `npm run lint`.
- **Backend:** Ruff (E, F, I, UP, B, SIM). Run `ruff check server`.
- Prefer feature-based folders in the frontend (`src/features/forecast/...`).
- Types are required (`strict` is on).
- No secrets or API keys in commits — CI runs Gitleaks.

## Tests

Every PR must pass:

```bash
npm run typecheck
npm run lint
npm test -- --run
npm run build

ruff check server
pytest server
```

If you touch the ML pipeline, add or update tests in `server/tests/`. The
existing suite covers:

- Target NaN safety (correction #2)
- Feature no-leakage
- Post-fix "no perfect accuracy on random walks" smoke check
- Alpha Vantage envelope handling
- Rate limiter and cache with stale fallback
- Endpoint DTOs and `model_unavailable`

## Commits and PRs

- Use small, logical commits with descriptive messages.
- Reference issues in the PR description.
- Fill out the PR template checklist.
- If your change affects the model or data, update `docs/MODEL_CARD.md` and
  `docs/DATA_CARD.md`.

## Adding a new feature to the ML pipeline

1. Add the column in `server/app/ml/features.py` and append to `FEATURE_NAMES`.
2. Update `PLAIN_ENGLISH` in `server/app/ml/explain.py` if you want a friendly
   plain-English blurb.
3. Add a leak-freeness test (perturb the tail of the input frame; assert
   earlier feature values are unchanged).
4. Retrain: `python server/scripts/train_models.py`.
5. Verify the frontend renders the new factor without changes (feature names
   are auto-formatted).

## License

By contributing, you agree that your contributions will be licensed under the
MIT License (see `LICENSE`).
