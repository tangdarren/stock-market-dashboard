.DEFAULT_GOAL := help

PYTHON  ?= python3.11
VENV     = server/.venv
PY       = $(VENV)/bin/python
PIP      = $(VENV)/bin/pip

help:  ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS=":.*?## "}; {printf "\033[36m%-18s\033[0m %s\n", $$1, $$2}'

# ---------- setup ----------

install-frontend:  ## Install frontend dependencies
	npm install

install-backend:  ## Create venv + install backend
	$(PYTHON) -m venv $(VENV)
	$(PIP) install --upgrade pip
	$(PIP) install -e "server/.[dev,bootstrap]"

install: install-frontend install-backend  ## Install everything

# ---------- data / models ----------

bootstrap:  ## Download historical SPY data (offline, unadjusted)
	$(PY) server/scripts/bootstrap_history.py

train:  ## Train 1-day and 5-day models, write server/artifacts/
	$(PY) server/scripts/train_models.py

# ---------- dev ----------

dev-backend:  ## Run backend with reload (canonical uvicorn command)
	$(VENV)/bin/uvicorn app.main:app --app-dir server --reload --port 8000

dev-frontend:  ## Run frontend dev server
	npm run dev

dev:  ## Print the two commands to run dev servers in separate terminals
	@echo "In two terminals:"
	@echo "  make dev-backend"
	@echo "  make dev-frontend"

# ---------- quality ----------

lint:  ## Lint frontend + backend
	npm run lint
	$(VENV)/bin/ruff check server

typecheck:  ## Frontend TypeScript check
	npm run typecheck

test-frontend:  ## Frontend Vitest suite
	npm test -- --run

test-backend:  ## Backend pytest suite
	$(VENV)/bin/pytest server -q

test: test-frontend test-backend  ## Run all tests

build:  ## Build frontend for production
	npm run build

# ---------- housekeeping ----------

clean-artifacts:  ## Remove trained artifacts (models are not committed)
	rm -f server/artifacts/*.joblib server/artifacts/*.json server/artifacts/*.csv server/artifacts/*.txt

clean-data:  ## Remove bootstrapped data (large, git-ignored)
	rm -rf server/data/raw

clean-frontend:  ## Remove frontend build output
	rm -rf dist coverage

clean: clean-artifacts clean-data clean-frontend  ## Clean generated files

.PHONY: help install install-frontend install-backend bootstrap train dev dev-backend dev-frontend lint typecheck test-frontend test-backend test build clean-artifacts clean-data clean-frontend clean
