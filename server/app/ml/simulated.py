"""Explicit loader for the synthetic SPY market workbook.

The workbook is **never** loaded automatically. Callers must request simulated
mode and invoke :func:`load_simulated_workbook` (or helpers) themselves. Live
Alpha Vantage paths stay untouched; failed live fetches must not fall through
to this module.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
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

OPTIONAL_SHEETS: tuple[str, ...] = ("Data_Dictionary",)

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
class SimulatedWorkbook:
    """Validated synthetic dataset for an explicit simulated-mode session."""

    scenario: SimulatedScenarioMeta
    market_data: pd.DataFrame
    forecast_history: pd.DataFrame
    news_context: tuple[SimulatedNewsItem, ...]
    scenario_labels: pd.DataFrame
    data_dictionary: pd.DataFrame | None
    source_path: Path
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
            "disclaimer": SIMULATED_DATA_DISCLAIMER,
        }


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

    return SimulatedWorkbook(
        scenario=scenario,
        market_data=market,
        forecast_history=forecasts,
        news_context=tuple(news),
        scenario_labels=labels,
        data_dictionary=dictionary,
        source_path=workbook_path.resolve(),
    )


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
    "NEWS_REQUIRED_COLUMNS",
    "OPTIONAL_SHEETS",
    "REQUIRED_SHEETS",
    "SCENARIO_LABEL_COLUMNS",
    "SIMULATED_DATA_DISCLAIMER",
    "SIMULATED_WORKBOOK_FILENAME",
    "SimulatedDataError",
    "SimulatedNewsItem",
    "SimulatedScenarioMeta",
    "SimulatedWorkbook",
    "default_workbook_path",
    "load_simulated_workbook",
]
