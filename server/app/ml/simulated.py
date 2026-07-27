"""Explicit loader for the synthetic SPY market workbook.

The workbook is **never** loaded automatically. Callers must request simulated
mode and invoke :func:`load_simulated_workbook` (or helpers) themselves. Live
Alpha Vantage paths stay untouched; failed live fetches must not fall through
to this module.
"""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from functools import lru_cache
from pathlib import Path
from typing import Any, Literal

import pandas as pd

from app import config as _config
from app.ml.normalize import OHLCVSchemaError, normalize_ohlcv
from app.ml.replay import WALK_FORWARD_REQUIRED_COLUMNS, prepare_walk_forward_frame

SIMULATED_WORKBOOK_FILENAME = "spy_simulated_market_data.xlsx"

REQUIRED_SHEETS: tuple[str, ...] = (
    "Scenario",
    "Market_Data",
    "Forecast_History",
    "News_Context",
    "Scenario_Labels",
)

# Current outlook fixture. Validated on load when present; soft-fails so other
# simulated endpoints can keep serving Market_Data / Forecast_History / news.
CURRENT_FORECAST_SHEET = "Current_Forecast"

OPTIONAL_SHEETS: tuple[str, ...] = ("Data_Dictionary", CURRENT_FORECAST_SHEET)

CURRENT_FORECAST_REQUIRED_COLUMNS: tuple[str, ...] = (
    "horizon_days",
    "features_as_of",
    "prob_up",
    "direction",
    "confidence",
    "fixture_name",
    "generated_at",
    "explanations_json",
)

CONFIDENCE_LABELS = frozenset({"low", "moderate", "high"})
DIRECTION_LABELS = frozenset({"up", "down"})
EXPLANATION_GROUPS = ("up", "down", "uncertainty")

NEWS_REQUIRED_COLUMNS: tuple[str, ...] = (
    "title",
    "url",
    "source",
    "time_published",
    "overall_sentiment_label",
    "overall_sentiment_score",
    "ticker_relevance",
)

SCENARIO_LABEL_COLUMNS: tuple[str, ...] = ("date", "regime", "note")

SIMULATED_DATA_DISCLAIMER = (
    "Every value in this workbook is synthetic and was generated for local "
    "development, UI demonstration, and automated testing. It is not sourced "
    "from SPY, Alpha Vantage, Yahoo Finance, or any real market feed and must "
    "never be presented as live or historical fact."
)


class SimulatedDataError(Exception):
    """Workbook missing, malformed, or failing validation."""

    def __init__(self, message: str, *, reason: str) -> None:
        super().__init__(message)
        self.message = message
        self.reason = reason


@dataclass(frozen=True)
class SimulatedScenarioMeta:
    scenario_name: str
    symbol: str
    data_classification: str
    random_seed: int | None
    first_market_date: str | None
    latest_market_date: str | None
    market_rows: int | None
    forecast_rows: int | None
    workbook_file: str | None
    runtime_mode: str | None
    warning: str
    fields: dict[str, str] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class SimulatedNewsItem:
    title: str
    url: str
    source: str
    time_published: str
    overall_sentiment_label: str
    overall_sentiment_score: float
    ticker_relevance: float

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class SimulatedCurrentForecast:
    """Workbook-backed current outlook for one horizon (no realized outcomes)."""

    horizon_days: int
    features_as_of: str
    prob_up: float
    prob_down: float
    direction: Literal["up", "down"]
    confidence: Literal["low", "moderate", "high"]
    fixture_name: str
    generated_at: str
    explanations: dict[str, Any]

    def to_horizon_payload(self) -> dict[str, Any]:
        """Shape compatible with ForecastService horizon objects."""
        return {
            "horizon_days": self.horizon_days,
            "prob_up": self.prob_up,
            "prob_down": self.prob_down,
            "direction": self.direction,
            "confidence": self.confidence,
            "model_name": self.fixture_name,
            "trained_at": self.generated_at,
            "features_as_of": self.features_as_of,
            "explanations": self.explanations,
        }


@dataclass(frozen=True)
class SimulatedWorkbook:
    """Validated synthetic dataset for an explicit simulated-mode session."""

    scenario: SimulatedScenarioMeta
    market_data: pd.DataFrame
    forecast_history: pd.DataFrame
    news_context: tuple[SimulatedNewsItem, ...]
    scenario_labels: pd.DataFrame
    data_dictionary: pd.DataFrame | None
    source_path: Path
    current_forecasts: tuple[SimulatedCurrentForecast, ...] | None = None
    current_forecast_error: SimulatedDataError | None = None
    mode: Literal["simulated"] = "simulated"

    def to_summary(self) -> dict[str, Any]:
        return {
            "mode": self.mode,
            "source_path": str(self.source_path),
            "scenario": self.scenario.to_dict(),
            "market_rows": int(len(self.market_data)),
            "forecast_rows": int(len(self.forecast_history)),
            "news_items": len(self.news_context),
            "scenario_label_rows": int(len(self.scenario_labels)),
            "current_forecast_horizons": (
                [item.horizon_days for item in self.current_forecasts]
                if self.current_forecasts
                else []
            ),
            "current_forecast_error": (
                self.current_forecast_error.reason if self.current_forecast_error else None
            ),
            "disclaimer": SIMULATED_DATA_DISCLAIMER,
        }

    def current_forecast_by_horizon(self, horizon: int) -> SimulatedCurrentForecast | None:
        if not self.current_forecasts:
            return None
        for item in self.current_forecasts:
            if item.horizon_days == horizon:
                return item
        return None


def default_workbook_path() -> Path:
    """Canonical path: ``server/data/simulated/spy_simulated_market_data.xlsx``."""
    return Path(_config.DATA_SIMULATED_DIR) / SIMULATED_WORKBOOK_FILENAME


def load_simulated_workbook(path: Path | str | None = None) -> SimulatedWorkbook:
    """Load and validate the simulated workbook.

    Parameters
    ----------
    path:
        Optional override. Defaults to :func:`default_workbook_path`.
        Pass an explicit path in tests; production callers should only invoke
        this when the user has opted into simulated mode.
    """
    workbook_path = Path(path) if path is not None else default_workbook_path()
    if not workbook_path.exists():
        raise SimulatedDataError(
            f"Simulated workbook not found: {workbook_path}",
            reason="simulated_workbook_missing",
        )
    if not workbook_path.is_file():
        raise SimulatedDataError(
            f"Simulated workbook path is not a file: {workbook_path}",
            reason="simulated_workbook_missing",
        )

    try:
        excel = pd.ExcelFile(workbook_path, engine="openpyxl")
    except Exception as exc:  # noqa: BLE001 - surface as typed loader error
        raise SimulatedDataError(
            f"Simulated workbook could not be opened: {exc}",
            reason="simulated_workbook_unreadable",
        ) from exc

    missing = [name for name in REQUIRED_SHEETS if name not in excel.sheet_names]
    if missing:
        raise SimulatedDataError(
            f"Simulated workbook missing required sheet(s): {missing}",
            reason="simulated_sheet_missing",
        )

    scenario = _parse_scenario_sheet(pd.read_excel(excel, sheet_name="Scenario", header=None))
    market = _parse_market_sheet(pd.read_excel(excel, sheet_name="Market_Data"))
    forecasts = _parse_forecast_sheet(pd.read_excel(excel, sheet_name="Forecast_History"))
    news = _parse_news_sheet(pd.read_excel(excel, sheet_name="News_Context"))
    labels = _parse_scenario_labels(pd.read_excel(excel, sheet_name="Scenario_Labels"))

    dictionary: pd.DataFrame | None = None
    if "Data_Dictionary" in excel.sheet_names:
        dictionary = pd.read_excel(excel, sheet_name="Data_Dictionary")

    _cross_check_counts(scenario, market, forecasts)

    current_forecasts: tuple[SimulatedCurrentForecast, ...] | None = None
    current_forecast_error: SimulatedDataError | None = None
    if CURRENT_FORECAST_SHEET not in excel.sheet_names:
        current_forecast_error = SimulatedDataError(
            f"Simulated workbook missing required sheet: {CURRENT_FORECAST_SHEET}",
            reason="simulated_current_forecast_missing",
        )
    else:
        try:
            current_forecasts = tuple(
                _parse_current_forecast_sheet(
                    pd.read_excel(excel, sheet_name=CURRENT_FORECAST_SHEET),
                    latest_market_date=market["date"].iloc[-1].date().isoformat(),
                )
            )
        except SimulatedDataError as exc:
            current_forecast_error = exc

    return SimulatedWorkbook(
        scenario=scenario,
        market_data=market,
        forecast_history=forecasts,
        news_context=tuple(news),
        scenario_labels=labels,
        data_dictionary=dictionary,
        source_path=workbook_path.resolve(),
        current_forecasts=current_forecasts,
        current_forecast_error=current_forecast_error,
    )


@lru_cache(maxsize=4)
def _cached_simulated_workbook(resolved_path: str) -> SimulatedWorkbook:
    return load_simulated_workbook(Path(resolved_path))


def get_simulated_workbook(path: Path | str | None = None) -> SimulatedWorkbook:
    """Return a process-cached workbook for explicit simulated-mode callers."""
    workbook_path = Path(path) if path is not None else default_workbook_path()
    return _cached_simulated_workbook(str(workbook_path.resolve()))


def clear_simulated_workbook_cache() -> None:
    """Drop cached workbook instances (used by tests)."""
    _cached_simulated_workbook.cache_clear()
    try:
        from app.ml.simulated_research import clear_simulated_research_caches

        clear_simulated_research_caches()
    except ImportError:
        pass



def _format_date(value: Any) -> str | None:
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return None
    ts = pd.to_datetime(value, errors="coerce")
    if pd.isna(ts):
        text = str(value).strip()
        return text or None
    return ts.normalize().date().isoformat()


def _parse_scenario_sheet(raw: pd.DataFrame) -> SimulatedScenarioMeta:
    if raw is None or raw.empty:
        raise SimulatedDataError(
            "Scenario sheet is empty.",
            reason="simulated_scenario_malformed",
        )

    fields: dict[str, str] = {}
    warning = SIMULATED_DATA_DISCLAIMER
    header_seen = False
    for row in raw.itertuples(index=False):
        left = row[0] if len(row) > 0 else None
        right = row[1] if len(row) > 1 else None

        left_missing = left is None or (isinstance(left, float) and pd.isna(left))
        if left_missing:
            continue

        left_text = str(left).strip()
        if not left_text:
            continue

        if left_text.upper().startswith("IMPORTANT") or (
            "synthetic" in left_text.lower() and "workbook" in left_text.lower()
        ):
            warning = left_text
            continue

        if left_text.lower() == "field" and str(right).strip().lower() == "value":
            header_seen = True
            continue

        if not header_seen and left_text.startswith("SPY Forecast Lab"):
            continue

        right_missing = right is None or (isinstance(right, float) and pd.isna(right))
        if right_missing:
            continue

        fields[left_text] = str(right).strip()

    if not fields:
        raise SimulatedDataError(
            "Scenario sheet has no Field/Value metadata rows.",
            reason="simulated_scenario_malformed",
        )

    seed_raw = fields.get("Random seed")
    random_seed: int | None = None
    if seed_raw not in (None, ""):
        try:
            random_seed = int(float(seed_raw))
        except (TypeError, ValueError) as exc:
            raise SimulatedDataError(
                f"Scenario random seed is invalid: {seed_raw!r}",
                reason="simulated_scenario_malformed",
            ) from exc

    def _optional_int(key: str) -> int | None:
        raw_value = fields.get(key)
        if raw_value in (None, ""):
            return None
        try:
            return int(float(raw_value))
        except (TypeError, ValueError) as exc:
            raise SimulatedDataError(
                f"Scenario field {key!r} is not an integer: {raw_value!r}",
                reason="simulated_scenario_malformed",
            ) from exc

    scenario_name = fields.get("Scenario name") or "Simulated scenario"
    symbol = (fields.get("Symbol") or "SPY").upper()
    classification = fields.get("Data classification") or "SIMULATED / FICTIONAL"

    return SimulatedScenarioMeta(
        scenario_name=scenario_name,
        symbol=symbol,
        data_classification=classification,
        random_seed=random_seed,
        first_market_date=_format_date(fields.get("First market date")),
        latest_market_date=_format_date(fields.get("Latest market date")),
        market_rows=_optional_int("Market rows"),
        forecast_rows=_optional_int("Forecast rows"),
        workbook_file=fields.get("Workbook file"),
        runtime_mode=fields.get("Runtime mode"),
        warning=warning or SIMULATED_DATA_DISCLAIMER,
        fields=fields,
    )


def _parse_market_sheet(raw: pd.DataFrame) -> pd.DataFrame:
    try:
        return normalize_ohlcv(raw, source="simulated_workbook.Market_Data")
    except OHLCVSchemaError as exc:
        raise SimulatedDataError(
            str(exc),
            reason="simulated_market_malformed",
        ) from exc


def _parse_forecast_sheet(raw: pd.DataFrame) -> pd.DataFrame:
    if raw is None or raw.empty:
        raise SimulatedDataError(
            "Forecast_History sheet is empty.",
            reason="simulated_forecast_malformed",
        )
    working = raw.copy()
    working.columns = [str(c).strip().lower().replace(" ", "_") for c in working.columns]
    missing = set(WALK_FORWARD_REQUIRED_COLUMNS) - set(working.columns)
    if missing:
        raise SimulatedDataError(
            f"Forecast_History missing required columns: {sorted(missing)}",
            reason="simulated_forecast_malformed",
        )
    try:
        frame = prepare_walk_forward_frame(working)
    except ValueError as exc:
        raise SimulatedDataError(
            f"Forecast_History has invalid values: {exc}",
            reason="simulated_forecast_malformed",
        ) from exc

    if frame["horizon_days"].isna().any():
        raise SimulatedDataError(
            "Forecast_History contains null horizon_days.",
            reason="simulated_forecast_malformed",
        )
    invalid_horizons = sorted(
        {int(h) for h in frame["horizon_days"].unique() if int(h) not in (1, 5)}
    )
    if invalid_horizons:
        raise SimulatedDataError(
            f"Forecast_History has unsupported horizon_days: {invalid_horizons}",
            reason="simulated_forecast_malformed",
        )
    if frame["prob_up"].isna().any() or ((frame["prob_up"] < 0) | (frame["prob_up"] > 1)).any():
        raise SimulatedDataError(
            "Forecast_History prob_up must be finite values in [0, 1].",
            reason="simulated_forecast_malformed",
        )
    return frame.reset_index(drop=True)


def _parse_news_sheet(raw: pd.DataFrame) -> list[SimulatedNewsItem]:
    if raw is None or raw.empty:
        raise SimulatedDataError(
            "News_Context sheet is empty.",
            reason="simulated_news_malformed",
        )
    working = raw.copy()
    working.columns = [str(c).strip().lower().replace(" ", "_") for c in working.columns]
    missing = set(NEWS_REQUIRED_COLUMNS) - set(working.columns)
    if missing:
        raise SimulatedDataError(
            f"News_Context missing required columns: {sorted(missing)}",
            reason="simulated_news_malformed",
        )

    items: list[SimulatedNewsItem] = []
    for idx, row in working.iterrows():
        title = str(row["title"]).strip() if pd.notna(row["title"]) else ""
        if not title:
            raise SimulatedDataError(
                f"News_Context row {idx} has an empty title.",
                reason="simulated_news_malformed",
            )
        try:
            score = float(row["overall_sentiment_score"])
            relevance = float(row["ticker_relevance"])
        except (TypeError, ValueError) as exc:
            raise SimulatedDataError(
                f"News_Context row {idx} has invalid numeric fields: {exc}",
                reason="simulated_news_malformed",
            ) from exc
        if not pd.notna(score) or not pd.notna(relevance):
            raise SimulatedDataError(
                f"News_Context row {idx} has null sentiment or relevance.",
                reason="simulated_news_malformed",
            )
        published = pd.to_datetime(row["time_published"], errors="coerce")
        if pd.isna(published):
            raise SimulatedDataError(
                f"News_Context row {idx} has an invalid time_published.",
                reason="simulated_news_malformed",
            )
        items.append(
            SimulatedNewsItem(
                title=title,
                url=str(row["url"]).strip() if pd.notna(row["url"]) else "",
                source=str(row["source"]).strip() if pd.notna(row["source"]) else "",
                time_published=published.isoformat(),
                overall_sentiment_label=(
                    str(row["overall_sentiment_label"]).strip()
                    if pd.notna(row["overall_sentiment_label"])
                    else "Neutral"
                ),
                overall_sentiment_score=score,
                ticker_relevance=relevance,
            )
        )
    return items


def _parse_scenario_labels(raw: pd.DataFrame) -> pd.DataFrame:
    if raw is None or raw.empty:
        raise SimulatedDataError(
            "Scenario_Labels sheet is empty.",
            reason="simulated_labels_malformed",
        )
    working = raw.copy()
    working.columns = [str(c).strip().lower().replace(" ", "_") for c in working.columns]
    missing = set(SCENARIO_LABEL_COLUMNS) - set(working.columns)
    if missing:
        raise SimulatedDataError(
            f"Scenario_Labels missing required columns: {sorted(missing)}",
            reason="simulated_labels_malformed",
        )
    working["date"] = pd.to_datetime(working["date"], errors="coerce").dt.normalize()
    if working["date"].isna().any():
        raise SimulatedDataError(
            "Scenario_Labels contains unparseable dates.",
            reason="simulated_labels_malformed",
        )
    working["regime"] = working["regime"].astype(str).str.strip()
    working["note"] = working["note"].fillna("").astype(str)
    if (working["regime"] == "").any() or (working["regime"].str.lower() == "nan").any():
        raise SimulatedDataError(
            "Scenario_Labels contains empty regime values.",
            reason="simulated_labels_malformed",
        )
    working = working.loc[:, list(SCENARIO_LABEL_COLUMNS)]
    working = working.drop_duplicates(subset=("date",), keep="last")
    working = working.sort_values("date").reset_index(drop=True)
    return working


def _parse_current_forecast_sheet(
    raw: pd.DataFrame,
    *,
    latest_market_date: str,
) -> list[SimulatedCurrentForecast]:
    """Parse Current_Forecast rows. Must not include realized future outcomes."""
    if raw is None or raw.empty:
        raise SimulatedDataError(
            "Current_Forecast sheet is empty.",
            reason="simulated_current_forecast_malformed",
        )

    working = raw.copy()
    working.columns = [str(c).strip().lower().replace(" ", "_") for c in working.columns]

    # Reject outcome leakage from Forecast_History-style columns.
    forbidden = {"actual", "correct", "realized_return", "predicted"}
    leaked = sorted(forbidden & set(working.columns))
    if leaked:
        raise SimulatedDataError(
            (
                "Current_Forecast must not include realized-outcome columns "
                f"{leaked}; those belong on Forecast_History only."
            ),
            reason="simulated_current_forecast_malformed",
        )

    missing = set(CURRENT_FORECAST_REQUIRED_COLUMNS) - set(working.columns)
    if missing:
        raise SimulatedDataError(
            f"Current_Forecast missing required columns: {sorted(missing)}",
            reason="simulated_current_forecast_malformed",
        )

    parsed: list[SimulatedCurrentForecast] = []
    seen_horizons: set[int] = set()

    for idx, row in working.iterrows():
        try:
            horizon = int(row["horizon_days"])
        except (TypeError, ValueError) as exc:
            raise SimulatedDataError(
                f"Current_Forecast row {idx} has invalid horizon_days.",
                reason="simulated_current_forecast_malformed",
            ) from exc
        if horizon not in (1, 5):
            raise SimulatedDataError(
                f"Current_Forecast row {idx} has unsupported horizon_days={horizon}.",
                reason="simulated_current_forecast_malformed",
            )
        if horizon in seen_horizons:
            raise SimulatedDataError(
                f"Current_Forecast has duplicate horizon_days={horizon}.",
                reason="simulated_current_forecast_malformed",
            )
        seen_horizons.add(horizon)

        features_as_of = _format_date(row["features_as_of"])
        if not features_as_of:
            raise SimulatedDataError(
                f"Current_Forecast row {idx} has an invalid features_as_of date.",
                reason="simulated_current_forecast_malformed",
            )
        if features_as_of != latest_market_date:
            raise SimulatedDataError(
                (
                    f"Current_Forecast features_as_of={features_as_of} must match the "
                    f"latest Market_Data session ({latest_market_date})."
                ),
                reason="simulated_current_forecast_inconsistent",
            )

        try:
            prob_up = float(row["prob_up"])
        except (TypeError, ValueError) as exc:
            raise SimulatedDataError(
                f"Current_Forecast row {idx} has invalid prob_up.",
                reason="simulated_current_forecast_malformed",
            ) from exc
        if not (0.0 <= prob_up <= 1.0) or pd.isna(prob_up):
            raise SimulatedDataError(
                f"Current_Forecast row {idx} prob_up must be in [0, 1].",
                reason="simulated_current_forecast_malformed",
            )

        if "prob_down" in working.columns and pd.notna(row.get("prob_down")):
            try:
                prob_down = float(row["prob_down"])
            except (TypeError, ValueError) as exc:
                raise SimulatedDataError(
                    f"Current_Forecast row {idx} has invalid prob_down.",
                    reason="simulated_current_forecast_malformed",
                ) from exc
            if abs((prob_up + prob_down) - 1.0) > 1e-6:
                raise SimulatedDataError(
                    f"Current_Forecast row {idx} prob_up + prob_down must equal 1.",
                    reason="simulated_current_forecast_malformed",
                )
        else:
            prob_down = 1.0 - prob_up
        prob_down = float(round(prob_down, 10))

        direction = str(row["direction"]).strip().lower()
        if direction not in DIRECTION_LABELS:
            raise SimulatedDataError(
                f"Current_Forecast row {idx} has invalid direction={direction!r}.",
                reason="simulated_current_forecast_malformed",
            )
        expected_direction = "up" if prob_up >= 0.5 else "down"
        if direction != expected_direction:
            raise SimulatedDataError(
                (
                    f"Current_Forecast row {idx} direction={direction!r} conflicts with "
                    f"prob_up={prob_up} (expected {expected_direction!r})."
                ),
                reason="simulated_current_forecast_malformed",
            )

        confidence = str(row["confidence"]).strip().lower()
        if confidence not in CONFIDENCE_LABELS:
            raise SimulatedDataError(
                f"Current_Forecast row {idx} has invalid confidence={confidence!r}.",
                reason="simulated_current_forecast_malformed",
            )

        fixture_name = str(row["fixture_name"]).strip() if pd.notna(row["fixture_name"]) else ""
        if not fixture_name:
            raise SimulatedDataError(
                f"Current_Forecast row {idx} is missing fixture_name.",
                reason="simulated_current_forecast_malformed",
            )

        generated_raw = row["generated_at"]
        generated_ts = pd.to_datetime(generated_raw, errors="coerce", utc=True)
        if pd.isna(generated_ts):
            raise SimulatedDataError(
                f"Current_Forecast row {idx} has an invalid generated_at timestamp.",
                reason="simulated_current_forecast_malformed",
            )
        generated_at = generated_ts.isoformat()

        explanations = _parse_explanations_json(row["explanations_json"], row_index=idx)

        parsed.append(
            SimulatedCurrentForecast(
                horizon_days=horizon,
                features_as_of=features_as_of,
                prob_up=float(prob_up),
                prob_down=float(prob_down),
                direction=direction,  # type: ignore[arg-type]
                confidence=confidence,  # type: ignore[arg-type]
                fixture_name=fixture_name,
                generated_at=generated_at,
                explanations=explanations,
            )
        )

    if seen_horizons != {1, 5}:
        raise SimulatedDataError(
            (
                "Current_Forecast must include exactly one 1-day and one 5-day row "
                f"(found horizons={sorted(seen_horizons)})."
            ),
            reason="simulated_current_forecast_malformed",
        )
    return sorted(parsed, key=lambda item: item.horizon_days)


def _parse_explanations_json(raw_value: Any, *, row_index: Any) -> dict[str, Any]:
    if raw_value is None or (isinstance(raw_value, float) and pd.isna(raw_value)):
        raise SimulatedDataError(
            f"Current_Forecast row {row_index} is missing explanations_json.",
            reason="simulated_current_forecast_malformed",
        )
    if isinstance(raw_value, dict):
        payload = raw_value
    else:
        text = str(raw_value).strip()
        if not text:
            raise SimulatedDataError(
                f"Current_Forecast row {row_index} has empty explanations_json.",
                reason="simulated_current_forecast_malformed",
            )
        try:
            payload = json.loads(text)
        except json.JSONDecodeError as exc:
            raise SimulatedDataError(
                f"Current_Forecast row {row_index} has invalid explanations_json: {exc}",
                reason="simulated_current_forecast_malformed",
            ) from exc
    if not isinstance(payload, dict):
        raise SimulatedDataError(
            f"Current_Forecast row {row_index} explanations_json must be an object.",
            reason="simulated_current_forecast_malformed",
        )

    method = str(payload.get("method") or "synthetic_scenario_fixture").strip()
    result: dict[str, Any] = {"method": method}
    for group in EXPLANATION_GROUPS:
        factors = payload.get(group, [])
        if factors is None:
            factors = []
        if not isinstance(factors, list):
            raise SimulatedDataError(
                (
                    f"Current_Forecast row {row_index} explanations_json.{group} "
                    "must be a list."
                ),
                reason="simulated_current_forecast_malformed",
            )
        normalized: list[dict[str, Any]] = []
        for factor in factors:
            if not isinstance(factor, dict):
                raise SimulatedDataError(
                    (
                        f"Current_Forecast row {row_index} explanations_json.{group} "
                        "contains a non-object factor."
                    ),
                    reason="simulated_current_forecast_malformed",
                )
            try:
                normalized.append(
                    {
                        "label": str(factor.get("label") or factor.get("feature") or ""),
                        "feature": str(factor.get("feature") or ""),
                        "value": float(factor.get("value", 0.0)),
                        "direction": str(factor.get("direction") or group),
                        "contribution": float(factor.get("contribution", 0.0)),
                        "plain_english": str(factor.get("plain_english") or ""),
                    }
                )
            except (TypeError, ValueError) as exc:
                raise SimulatedDataError(
                    (
                        f"Current_Forecast row {row_index} has invalid numeric fields "
                        f"in explanations_json.{group}: {exc}"
                    ),
                    reason="simulated_current_forecast_malformed",
                ) from exc
        result[group] = normalized
    return result


def _cross_check_counts(
    scenario: SimulatedScenarioMeta,
    market: pd.DataFrame,
    forecasts: pd.DataFrame,
) -> None:
    if scenario.market_rows is not None and scenario.market_rows != len(market):
        raise SimulatedDataError(
            (
                f"Scenario market_rows={scenario.market_rows} does not match "
                f"Market_Data length={len(market)}."
            ),
            reason="simulated_workbook_inconsistent",
        )
    if scenario.forecast_rows is not None and scenario.forecast_rows != len(forecasts):
        raise SimulatedDataError(
            (
                f"Scenario forecast_rows={scenario.forecast_rows} does not match "
                f"Forecast_History length={len(forecasts)}."
            ),
            reason="simulated_workbook_inconsistent",
        )
    if scenario.first_market_date and not market.empty:
        actual_first = market["date"].iloc[0].date().isoformat()
        if actual_first != scenario.first_market_date:
            raise SimulatedDataError(
                (
                    f"Scenario first_market_date={scenario.first_market_date} does not "
                    f"match Market_Data first date={actual_first}."
                ),
                reason="simulated_workbook_inconsistent",
            )
    if scenario.latest_market_date and not market.empty:
        actual_last = market["date"].iloc[-1].date().isoformat()
        if actual_last != scenario.latest_market_date:
            raise SimulatedDataError(
                (
                    f"Scenario latest_market_date={scenario.latest_market_date} does not "
                    f"match Market_Data last date={actual_last}."
                ),
                reason="simulated_workbook_inconsistent",
            )


__all__ = [
    "CURRENT_FORECAST_REQUIRED_COLUMNS",
    "CURRENT_FORECAST_SHEET",
    "NEWS_REQUIRED_COLUMNS",
    "OPTIONAL_SHEETS",
    "REQUIRED_SHEETS",
    "SCENARIO_LABEL_COLUMNS",
    "SIMULATED_DATA_DISCLAIMER",
    "SIMULATED_WORKBOOK_FILENAME",
    "SimulatedCurrentForecast",
    "SimulatedDataError",
    "SimulatedNewsItem",
    "SimulatedScenarioMeta",
    "SimulatedWorkbook",
    "clear_simulated_workbook_cache",
    "default_workbook_path",
    "get_simulated_workbook",
    "load_simulated_workbook",
]
