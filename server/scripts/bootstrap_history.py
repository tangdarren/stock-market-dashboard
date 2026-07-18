#!/usr/bin/env python
"""Offline bootstrap for SPY daily OHLCV history.

Uses ``yfinance`` (``auto_adjust=False``) so we keep the same **unadjusted** OHLC
convention that Alpha Vantage returns at runtime. Also supports loading from a
local CSV for reproducibility when network access is unavailable.

Usage:
    python server/scripts/bootstrap_history.py
    python server/scripts/bootstrap_history.py --start 2005-01-01
    python server/scripts/bootstrap_history.py --csv path/to/local_spy.csv
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

# Allow running the script directly from the repo root.
SERVER_ROOT = Path(__file__).resolve().parent.parent
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))

import pandas as pd

from app.config import DATA_RAW_DIR
from app.ml.normalize import normalize_ohlcv

RAW_CSV = DATA_RAW_DIR / "spy_daily.csv"
MANIFEST = DATA_RAW_DIR / "data_manifest.json"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--symbol", default="SPY")
    parser.add_argument("--start", default="2005-01-01")
    parser.add_argument("--end", default=None, help="Optional end date (YYYY-MM-DD)")
    parser.add_argument(
        "--csv",
        default=None,
        help="Load OHLCV from a local CSV instead of hitting the network.",
    )
    return parser.parse_args()


def from_yfinance(symbol: str, start: str, end: str | None) -> pd.DataFrame:
    try:
        import yfinance as yf
    except ImportError as exc:
        raise SystemExit(
            "yfinance is not installed. Install with:\n"
            "  pip install -e 'server/.[bootstrap]'"
        ) from exc

    print(f"[bootstrap] Downloading {symbol} from Yahoo Finance ({start}..{end or 'today'})...")
    ticker = yf.Ticker(symbol)
    df = ticker.history(start=start, end=end, auto_adjust=False, actions=False)
    if df is None or df.empty:
        raise SystemExit(
            f"yfinance returned no rows for {symbol}. Check symbol, dates, or network."
        )
    return df


def from_csv(csv_path: Path) -> pd.DataFrame:
    if not csv_path.exists():
        raise SystemExit(f"CSV not found: {csv_path}")
    print(f"[bootstrap] Loading OHLCV from local CSV: {csv_path}")
    return pd.read_csv(csv_path)


def main() -> None:
    args = parse_args()

    if args.csv is not None:
        raw = from_csv(Path(args.csv))
        source = f"local_csv:{Path(args.csv).name}"
    else:
        raw = from_yfinance(args.symbol, args.start, args.end)
        source = "yfinance"

    normalized = normalize_ohlcv(raw, source=source)

    DATA_RAW_DIR.mkdir(parents=True, exist_ok=True)
    normalized.to_csv(RAW_CSV, index=False)
    csv_sha256 = _sha256(RAW_CSV)

    manifest = {
        "symbol": args.symbol,
        "source": source,
        "adjustment": "unadjusted",
        "rows": int(len(normalized)),
        "date_range": {
            "start": str(normalized["date"].iloc[0].date()),
            "end": str(normalized["date"].iloc[-1].date()),
        },
        "columns": list(normalized.columns),
        "downloaded_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
        "csv_path": str(RAW_CSV.relative_to(SERVER_ROOT.parent)),
        "csv_sha256": csv_sha256,
        "note": (
            "This project uses UNADJUSTED OHLCV to keep training-time and runtime "
            "feature calculations consistent with Alpha Vantage TIME_SERIES_DAILY."
        ),
    }
    MANIFEST.write_text(json.dumps(manifest, indent=2, sort_keys=True))

    print(
        f"[bootstrap] Wrote {len(normalized)} rows to {RAW_CSV} "
        f"({manifest['date_range']['start']} .. {manifest['date_range']['end']})"
    )
    print(f"[bootstrap] Manifest: {MANIFEST}")


def _sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


if __name__ == "__main__":
    main()
