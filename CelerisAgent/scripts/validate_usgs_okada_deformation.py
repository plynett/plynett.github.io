from __future__ import annotations

import argparse
import json
from io import StringIO
from pathlib import Path
import sys
from typing import Any

import numpy as np
import requests

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from agent.celeris.okada import okada_available, okada_finite_fault_surface


DEFAULT_EVENT = "us7000srb1"
DEFAULT_FFM_URL = "https://earthquake.usgs.gov/product/finite-fault/us7000srb1_2/us/1780945034025/FFM.geojson"
DEFAULT_SURFACE_URL = "https://earthquake.usgs.gov/product/finite-fault/us7000srb1_2/us/1780945034025/surface_deformation.disp"


def main() -> None:
    parser = argparse.ArgumentParser(description="Validate local Okada finite-fault deformation against USGS surface_deformation.disp.")
    parser.add_argument("--event-id", default=DEFAULT_EVENT)
    parser.add_argument("--ffm-url", default=DEFAULT_FFM_URL)
    parser.add_argument("--surface-url", default=DEFAULT_SURFACE_URL)
    parser.add_argument("--output-json", type=Path)
    args = parser.parse_args()

    if not okada_available():
        raise SystemExit("okada-wrapper is not installed. Install with: python -m pip install okada-wrapper --no-deps")

    ffm = requests.get(args.ffm_url, timeout=60)
    ffm.raise_for_status()
    features = ffm.json().get("features") or []

    surface = requests.get(args.surface_url, timeout=60)
    surface.raise_for_status()
    lon, lat, vertical = load_surface_deformation(surface.text)
    lon_mesh, lat_mesh = np.meshgrid(lon, lat, indexing="xy")
    computed, okada_summary = okada_finite_fault_surface(features, lon_mesh, lat_mesh)
    metrics = deformation_metrics(computed, vertical)
    result: dict[str, Any] = {
        "event_id": args.event_id,
        "ffm_url": args.ffm_url,
        "surface_url": args.surface_url,
        "okada": okada_summary,
        "usgs_surface": {
            "rows": int(vertical.shape[0]),
            "columns": int(vertical.shape[1]),
            "min_m": float(np.nanmin(vertical)),
            "max_m": float(np.nanmax(vertical)),
            "max_abs_m": float(np.nanmax(np.abs(vertical))),
        },
        "computed_surface": {
            "min_m": float(np.nanmin(computed)),
            "max_m": float(np.nanmax(computed)),
            "max_abs_m": float(np.nanmax(np.abs(computed))),
        },
        "metrics": metrics,
    }
    text = json.dumps(result, indent=2)
    print(text)
    if args.output_json:
        args.output_json.parent.mkdir(parents=True, exist_ok=True)
        args.output_json.write_text(text + "\n", encoding="utf-8")


def load_surface_deformation(text: str) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    rows = [line for line in text.splitlines() if line.strip() and not line.lstrip().startswith("#")]
    data = np.loadtxt(StringIO("\n".join(rows)))
    lon = np.unique(data[:, 0])
    lat = np.unique(data[:, 1])
    lon.sort()
    lat.sort()
    vertical = np.full((lat.size, lon.size), np.nan, dtype=np.float64)
    lon_index = {float(value): index for index, value in enumerate(lon)}
    lat_index = {float(value): index for index, value in enumerate(lat)}
    for row in data:
        vertical[lat_index[float(row[1])], lon_index[float(row[0])]] = float(row[5])
    return lon, lat, vertical


def deformation_metrics(computed: np.ndarray, reference: np.ndarray) -> dict[str, float]:
    diff = np.asarray(computed, dtype=np.float64) - np.asarray(reference, dtype=np.float64)
    return {
        "rmse_m": float(np.sqrt(np.nanmean(diff**2))),
        "mae_m": float(np.nanmean(np.abs(diff))),
        "bias_m": float(np.nanmean(diff)),
        "correlation": float(np.corrcoef(np.ravel(computed), np.ravel(reference))[0, 1]),
        "best_fit_scale_reference_over_computed": float(np.nansum(computed * reference) / np.nansum(computed * computed)),
        "max_abs_error_m": float(np.nanmax(np.abs(diff))),
    }


if __name__ == "__main__":
    main()
