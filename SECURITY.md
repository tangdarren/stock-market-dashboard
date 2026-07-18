# Security policy

## Supported versions

The project is in active early-stage development. Only the `main` branch
receives fixes.

## Reporting a vulnerability

Please **do not open a public GitHub issue** for security reports. Instead:

1. Email the maintainer privately with details of the issue and a proof of
   concept if you have one.
2. Allow a reasonable time for a fix before public disclosure.

Once patched, we'll credit you in the release notes if you'd like.

## What is in scope

- The FastAPI backend under `server/`.
- The React frontend under `src/`.
- Docker / compose configuration.

## Handling of secrets

- Alpha Vantage API keys live **only** in `server/.env`, which is git-ignored.
- The frontend never has access to the API key; every request to the upstream
  goes through the backend proxy.
- Log statements sanitize `apikey=...` query params before writing anywhere
  (see `sanitize_url_for_logging` in `server/app/clients/alpha_vantage.py`).
- CI workflows never pass real keys — tests mock all upstream traffic.
- `.gitignore` excludes `.env*` (except `*.example`), `server/artifacts/*.joblib`,
  cache DBs, and other generated artifacts.

## Handling of model artifacts

- Model files (`.joblib`) are never committed to source control.
- The backend refuses to load artifacts outside of `server/artifacts/`.
- The backend does not train on startup and does not download untrusted
  `joblib`/`pickle` files.
- Missing artifacts surface as `mode: "model_unavailable"`; the UI never
  fabricates a forecast.

## Reporting checklist

Please include:

- Steps to reproduce.
- Affected version / commit SHA.
- Whether you attempted the attack against a fresh clone or a hosted
  deployment.
- Suggested remediation, if any.
