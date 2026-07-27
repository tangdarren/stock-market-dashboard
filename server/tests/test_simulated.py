"""Tests for the explicit simulated workbook loader."""

from __future__ import annotations

from pathlib import Path

import pandas as pd
import pytest

from app.ml.simulated import (
    REQUIRED_SHEETS,
    SIMULATED_WORKBOOK_FILENAME,
    SimulatedDataError,
    default_workbook_path,
    load_simulated_workbook,
)

REPO_WORKBOOK = (
    Path(__file__).resolve().parent.parent
    / "data"
    / "simulated"
    / SIMULATED_WORKBOOK_FILENAME
)


def _write_workbook(path: Path, sheets: dict[str, pd.DataFrame]) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    with pd.ExcelWriter(path, engine="openpyxl") as writer:
        for name, frame in sheets.items():
            if name == "Scenario":
                frame.to_excel(writer, sheet_name=name, index=False, header=False)
            else:
                frame.to_excel(writer, sheet_name=name, index=False)
    return path


def _current_forecast_rows(latest_date) -> pd.DataFrame:
    import json

    def explanations(method_suffix: str) -> str:
        return json.dumps(
            {
                "method": "synthetic_scenario_fixture",
                "up": [
                    {
                        "label": "return_5d",
                        "feature": "return_5d",
                        "value": 0.01,
                        "direction": "up",
                        "contribution": 0.02,
                        "plain_english": f"Synthetic {method_suffix} upward factor.",
                    }
                ],
                "down": [],
                "uncertainty": [],
            }
        )

    iso = pd.Timestamp(latest_date).normalize().date().isoformat()
    return pd.DataFrame(
        [
            {
                "horizon_days": 1,
                "features_as_of": iso,
                "prob_up": 0.57,
                "prob_down": 0.43,
                "direction": "up",
                "confidence": "moderate",
                "fixture_name": "synthetic_scenario_fixture_1d",
                "generated_at": f"{iso}T20:15:00+00:00",
                "explanations_json": explanations("1d"),
            },
            {
                "horizon_days": 5,
                "features_as_of": iso,
                "prob_up": 0.48,
                "prob_down": 0.52,
                "direction": "down",
                "confidence": "low",
                "fixture_name": "synthetic_scenario_fixture_5d",
                "generated_at": f"{iso}T20:15:00+00:00",
                "explanations_json": explanations("5d"),
            },
        ]
    )


def _valid_sheets() -> dict[str, pd.DataFrame]:
    market = pd.DataFrame(
        {
            "date": pd.bdate_range("2024-11-27", periods=5),
            "open": [100.0, 101.0, 102.0, 103.0, 104.0],
            "high": [101.0, 102.0, 103.0, 104.0, 105.0],
            "low": [99.0, 100.0, 101.0, 102.0, 103.0],
            "close": [100.5, 101.5, 102.5, 103.5, 104.5],
            "volume": [1_000_000, 1_100_000, 1_200_000, 1_300_000, 1_400_000],
        }
    )
    forecasts_rows: list[dict[str, object]] = []
    for ts in market["date"]:
        iso = ts
        for horizon in (1, 5):
            forecasts_rows.append(
                {
                    "date": iso,
                    "horizon_days": horizon,
                    "prob_up": 0.55,
                    "predicted": 1,
                    "actual": 1,
                    "correct": 1,
                    "realized_return": 0.01,
                }
            )
    forecasts = pd.DataFrame(forecasts_rows)
    news = pd.DataFrame(
        {
            "title": ["Synthetic headline"],
            "url": ["https://example.com/simulated/1"],
            "source": ["Simulation Wire"],
            "time_published": ["2026-08-04T16:15:00"],
            "overall_sentiment_label": ["Neutral"],
            "overall_sentiment_score": [0.01],
            "ticker_relevance": [0.9],
        }
    )
    labels = pd.DataFrame(
        {
            "date": market["date"],
            "regime": ["calm_uptrend"] * len(market),
            "note": ["Synthetic scenario row"] * len(market),
        }
    )
    scenario = pd.DataFrame(
        [
            ["SPY Forecast Lab — Synthetic Market Scenario", None],
            [None, None],
            ["Field", "Value"],
            ["Scenario name", "Unit Test Scenario"],
            ["Symbol", "SPY"],
            ["Data classification", "SIMULATED / FICTIONAL"],
            ["Random seed", 20260805],
            ["First market date", market["date"].iloc[0]],
            ["Latest market date", market["date"].iloc[-1]],
            ["Market rows", len(market)],
            ["Forecast rows", len(forecasts)],
            ["Recommended default", "Simulation mode OFF"],
            [None, None],
            [
                "IMPORTANT: Every value in this workbook is synthetic.",
                None,
            ],
            ["Workbook file", "server/data/simulated/spy_simulated_market_data.xlsx"],
            ["Runtime mode", "live | simulated"],
        ]
    )
    return {
        "Scenario": scenario,
        "Market_Data": market,
        "Forecast_History": forecasts,
        "News_Context": news,
        "Scenario_Labels": labels,
        "Current_Forecast": _current_forecast_rows(market["date"].iloc[-1]),
        "Data_Dictionary": pd.DataFrame(
            {
                "Sheet": ["Market_Data", "Current_Forecast"],
                "Column": ["date", "fixture_name"],
                "Type": ["date", "string"],
                "Meaning": ["x", "synthetic fixture label"],
            }
        ),
    }


def test_default_workbook_path_points_at_simulated_dir():
    path = default_workbook_path()
    assert path.name == SIMULATED_WORKBOOK_FILENAME
    assert path.parent.name == "simulated"


@pytest.mark.skipif(not REPO_WORKBOOK.exists(), reason="repo simulated workbook missing")
def test_load_repo_simulated_workbook():
    workbook = load_simulated_workbook(REPO_WORKBOOK)
    assert workbook.mode == "simulated"
    assert workbook.scenario.symbol == "SPY"
    assert "SIMULATED" in workbook.scenario.data_classification.upper()
    assert len(workbook.market_data) == workbook.scenario.market_rows == 420
    assert len(workbook.forecast_history) == workbook.scenario.forecast_rows == 710
    assert len(workbook.news_context) >= 1
    assert len(workbook.scenario_labels) == len(workbook.market_data)
    assert list(workbook.market_data.columns) == [
        "date",
        "open",
        "high",
        "low",
        "close",
        "volume",
    ]
    assert set(workbook.forecast_history["horizon_days"].unique()) == {1, 5}
    assert workbook.current_forecast_error is None
    assert workbook.current_forecasts is not None
    assert {item.horizon_days for item in workbook.current_forecasts} == {1, 5}
    latest = workbook.market_data["date"].iloc[-1].date().isoformat()
    for item in workbook.current_forecasts:
        assert item.features_as_of == latest
        assert "synthetic" in item.fixture_name
        assert "actual" not in item.to_horizon_payload()
    summary = workbook.to_summary()
    assert summary["mode"] == "simulated"
    assert "synthetic" in summary["disclaimer"].lower()
    assert summary["current_forecast_horizons"] == [1, 5]


def test_load_minimal_valid_workbook(tmp_path):
    path = _write_workbook(tmp_path / "ok.xlsx", _valid_sheets())
    workbook = load_simulated_workbook(path)
    assert workbook.scenario.scenario_name == "Unit Test Scenario"
    assert workbook.scenario.random_seed == 20260805
    assert len(workbook.market_data) == 5
    assert len(workbook.forecast_history) == 10
    assert workbook.news_context[0].title == "Synthetic headline"
    assert workbook.current_forecast_error is None
    assert workbook.current_forecasts is not None
    assert len(workbook.current_forecasts) == 2


def test_missing_current_forecast_soft_fails(tmp_path):
    sheets = _valid_sheets()
    del sheets["Current_Forecast"]
    path = _write_workbook(tmp_path / "no_current.xlsx", sheets)
    workbook = load_simulated_workbook(path)
    assert workbook.current_forecasts is None
    assert workbook.current_forecast_error is not None
    assert workbook.current_forecast_error.reason == "simulated_current_forecast_missing"
    # Other sheets still load so market/history can keep serving.
    assert len(workbook.market_data) == 5
    assert len(workbook.forecast_history) == 10


def test_malformed_current_forecast_soft_fails(tmp_path):
    sheets = _valid_sheets()
    sheets["Current_Forecast"].loc[0, "prob_up"] = 1.5
    path = _write_workbook(tmp_path / "bad_current.xlsx", sheets)
    workbook = load_simulated_workbook(path)
    assert workbook.current_forecasts is None
    assert workbook.current_forecast_error is not None
    assert workbook.current_forecast_error.reason == "simulated_current_forecast_malformed"


def test_current_forecast_rejects_realized_outcome_columns(tmp_path):
    sheets = _valid_sheets()
    sheets["Current_Forecast"]["actual"] = [1, 0]
    path = _write_workbook(tmp_path / "leaky_current.xlsx", sheets)
    workbook = load_simulated_workbook(path)
    assert workbook.current_forecast_error is not None
    assert workbook.current_forecast_error.reason == "simulated_current_forecast_malformed"
    assert "actual" in workbook.current_forecast_error.message


def test_current_forecast_features_as_of_must_match_latest_market(tmp_path):
    sheets = _valid_sheets()
    sheets["Current_Forecast"].loc[:, "features_as_of"] = "2020-01-01"
    path = _write_workbook(tmp_path / "misaligned_current.xlsx", sheets)
    workbook = load_simulated_workbook(path)
    assert workbook.current_forecast_error is not None
    assert workbook.current_forecast_error.reason == "simulated_current_forecast_inconsistent"


def test_missing_workbook_raises(tmp_path):
    with pytest.raises(SimulatedDataError) as excinfo:
        load_simulated_workbook(tmp_path / "missing.xlsx")
    assert excinfo.value.reason == "simulated_workbook_missing"


def test_missing_sheet_raises(tmp_path):
    sheets = _valid_sheets()
    del sheets["News_Context"]
    path = _write_workbook(tmp_path / "missing_sheet.xlsx", sheets)
    with pytest.raises(SimulatedDataError) as excinfo:
        load_simulated_workbook(path)
    assert excinfo.value.reason == "simulated_sheet_missing"
    assert "News_Context" in excinfo.value.message


def test_malformed_market_rows_raise(tmp_path):
    sheets = _valid_sheets()
    sheets["Market_Data"] = sheets["Market_Data"].drop(columns=["close"])
    path = _write_workbook(tmp_path / "bad_market.xlsx", sheets)
    with pytest.raises(SimulatedDataError) as excinfo:
        load_simulated_workbook(path)
    assert excinfo.value.reason == "simulated_market_malformed"


def test_invalid_forecast_probability_raises(tmp_path):
    sheets = _valid_sheets()
    sheets["Forecast_History"].loc[0, "prob_up"] = 1.5
    path = _write_workbook(tmp_path / "bad_forecast.xlsx", sheets)
    with pytest.raises(SimulatedDataError) as excinfo:
        load_simulated_workbook(path)
    assert excinfo.value.reason == "simulated_forecast_malformed"


def test_malformed_news_raises(tmp_path):
    sheets = _valid_sheets()
    sheets["News_Context"].loc[0, "title"] = None
    path = _write_workbook(tmp_path / "bad_news.xlsx", sheets)
    with pytest.raises(SimulatedDataError) as excinfo:
        load_simulated_workbook(path)
    assert excinfo.value.reason == "simulated_news_malformed"


def test_inconsistent_market_row_count_raises(tmp_path):
    sheets = _valid_sheets()
    # Scenario claims 5 market rows but we drop one after writing metadata.
    sheets["Market_Data"] = sheets["Market_Data"].iloc[:-1].copy()
    path = _write_workbook(tmp_path / "inconsistent.xlsx", sheets)
    with pytest.raises(SimulatedDataError) as excinfo:
        load_simulated_workbook(path)
    assert excinfo.value.reason == "simulated_workbook_inconsistent"


def test_required_sheets_constant_covers_application_needs():
    assert set(REQUIRED_SHEETS) >= {
        "Scenario",
        "Market_Data",
        "Forecast_History",
        "News_Context",
        "Scenario_Labels",
    }
