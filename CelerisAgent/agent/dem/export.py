from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image

from agent.config import API_PREFIX
from agent.dem.types import DemGrid
from agent.io_utils import write_json


def export_all(grid: DemGrid, job_dir: Path, validation: dict[str, Any]) -> list[dict[str, Any]]:
    out_dir = job_dir / "outputs"
    out_dir.mkdir(parents=True, exist_ok=True)
    artifacts: list[dict[str, Any]] = []

    mat_path = out_dir / "celeris_bathy.mat"
    write_mat(grid, mat_path)
    artifacts.append(artifact(job_dir, mat_path, "celeris_bathy_mat", "Canonical MATLAB bathymetry file"))

    png_path = out_dir / "preview.png"
    write_preview(grid, png_path)
    artifacts.append(artifact(job_dir, png_path, "preview_png", "DEM preview"))

    manifest_path = out_dir / "dem_manifest.json"
    write_json(
        manifest_path,
        {
            "schema_version": "0.1.0",
            "convention": "bed elevation in meters, positive up; submerged bathymetry is negative",
            "dem": grid.summary(),
            "validation": validation,
            "history": grid.history,
            "artifacts": artifacts,
            "deferred_outputs": [
                {
                    "filename": "bathy.txt",
                    "reason": "Generated later with config.json by the generalized CELERIS config workflow.",
                }
            ],
        },
    )
    artifacts.append(artifact(job_dir, manifest_path, "dem_manifest", "DEM provenance manifest"))
    return artifacts


def write_mat(grid: DemGrid, path: Path) -> None:
    from scipy.io import savemat

    rows, cols = grid.z.shape
    x = grid.x if grid.x is not None and grid.x.size == cols else (grid.x0 or 0.0) + np.arange(cols) * (grid.dx or 1.0)
    y = grid.y if grid.y is not None and grid.y.size == rows else (grid.y0 or 0.0) - np.arange(rows) * (grid.dy or 1.0)
    lon = grid.lon if grid.lon is not None and grid.lon.size == cols else None
    lat = grid.lat if grid.lat is not None and grid.lat.size == rows else None
    if (lon is None or lat is None) and looks_like_lon_lat_axes(np.asarray(x, dtype=np.float64), np.asarray(y, dtype=np.float64), grid.crs):
        lon = np.asarray(x, dtype=np.float64)
        lat = np.asarray(y, dtype=np.float64)
    celeris_bathy = {
        "z": grid.z.astype(np.float32),
        "h": grid.z.astype(np.float32),
        "x": np.asarray(x, dtype=np.float64),
        "y": np.asarray(y, dtype=np.float64),
        "dx": np.array([[grid.dx if grid.dx is not None else np.nan]], dtype=np.float64),
        "dy": np.array([[grid.dy if grid.dy is not None else np.nan]], dtype=np.float64),
        "x0": np.array([[grid.x0 if grid.x0 is not None else np.nan]], dtype=np.float64),
        "y0": np.array([[grid.y0 if grid.y0 is not None else np.nan]], dtype=np.float64),
        "crs": grid.crs or "",
        "vertical_datum": grid.vertical_datum or "",
        "z_units": grid.z_units,
        "history_json": json.dumps(grid.history),
    }
    payload: dict[str, Any] = {"celeris_bathy": celeris_bathy, "z": grid.z.astype(np.float32), "h": grid.z.astype(np.float32), "x": x, "y": y}
    if lon is not None and lat is not None:
        celeris_bathy["lon"] = np.asarray(lon, dtype=np.float64)
        celeris_bathy["lat"] = np.asarray(lat, dtype=np.float64)
        payload["lon"] = np.asarray(lon, dtype=np.float64)
        payload["lat"] = np.asarray(lat, dtype=np.float64)
    savemat(path, payload, do_compression=True)


def looks_like_lon_lat_axes(x: np.ndarray, y: np.ndarray, crs: str | None) -> bool:
    if crs and "4326" in str(crs):
        return True
    if x.ndim != 1 or y.ndim != 1 or not x.size or not y.size:
        return False
    return (
        np.nanmin(x) >= -180.0
        and np.nanmax(x) <= 180.0
        and np.nanmin(y) >= -90.0
        and np.nanmax(y) <= 90.0
        and abs(float(np.nanmax(x) - np.nanmin(x))) > 1e-9
        and abs(float(np.nanmax(y) - np.nanmin(y))) > 1e-9
    )


def write_preview(grid: DemGrid, path: Path) -> None:
    z = grid.z
    finite = np.isfinite(z)
    if not finite.any():
        rgb = np.zeros((*z.shape, 3), dtype=np.uint8)
    else:
        lo, hi = np.nanpercentile(z[finite], [2, 98])
        if hi <= lo:
            hi = lo + 1.0
        norm = np.clip((z - lo) / (hi - lo), 0, 1)
        norm = np.where(finite, norm, 0)
        water = z < 0
        rgb = np.zeros((*z.shape, 3), dtype=np.uint8)
        rgb[..., 0] = np.where(water, 20 + norm * 35, 75 + norm * 150)
        rgb[..., 1] = np.where(water, 85 + norm * 70, 115 + norm * 90)
        rgb[..., 2] = np.where(water, 135 + norm * 105, 65 + norm * 65)
        rgb[~finite] = [25, 25, 25]
    if preview_needs_vertical_flip(grid):
        rgb = rgb[::-1, :, :]
    image = Image.fromarray(rgb.astype(np.uint8), mode="RGB")
    image.thumbnail((1100, 800), Image.Resampling.LANCZOS)
    image.save(path)


def preview_needs_vertical_flip(grid: DemGrid) -> bool:
    y = grid.lat if grid.lat is not None and grid.lat.size == grid.z.shape[0] else grid.y
    if y is None or y.size < 2:
        return False
    finite = y[np.isfinite(y)]
    if finite.size < 2:
        return False
    return float(finite[-1]) > float(finite[0])


def artifact(job_dir: Path, path: Path, kind: str, label: str) -> dict[str, Any]:
    rel = path.resolve().relative_to(job_dir.resolve()).as_posix()
    return {
        "type": kind,
        "label": label,
        "filename": path.name,
        "relative_path": rel,
        "size_bytes": path.stat().st_size,
        "url": f"{API_PREFIX}/jobs/{job_dir.name}/files/{rel}",
    }
