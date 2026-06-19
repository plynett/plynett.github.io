from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import numpy as np


@dataclass
class DemGrid:
    z: np.ndarray
    x: np.ndarray | None = None
    y: np.ndarray | None = None
    lon: np.ndarray | None = None
    lat: np.ndarray | None = None
    dx: float | None = None
    dy: float | None = None
    x0: float | None = None
    y0: float | None = None
    crs: str | None = None
    vertical_datum: str | None = None
    z_units: str = "meters"
    source_files: list[str] = field(default_factory=list)
    history: list[dict[str, Any]] = field(default_factory=list)
    metadata: dict[str, Any] = field(default_factory=dict)

    def __post_init__(self) -> None:
        self.z = np.asarray(self.z, dtype=np.float32)
        if self.z.ndim != 2:
            raise ValueError(f"DEM must be a 2D grid, got {self.z.shape}")
        if self.x is not None:
            self.x = np.asarray(self.x, dtype=np.float64)
        if self.y is not None:
            self.y = np.asarray(self.y, dtype=np.float64)
        if self.lon is not None:
            self.lon = np.asarray(self.lon, dtype=np.float64)
        if self.lat is not None:
            self.lat = np.asarray(self.lat, dtype=np.float64)

    @property
    def shape(self) -> tuple[int, int]:
        return self.z.shape

    @property
    def cell_count(self) -> int:
        return int(self.z.shape[0] * self.z.shape[1])

    def add_history(self, node_id: str, **details: Any) -> None:
        self.history.append({"node_id": node_id, **details})

    def infer_spacing(self) -> None:
        if self.x is not None and self.x.size > 1 and self.dx is None:
            self.dx = float(np.nanmedian(np.abs(np.diff(self.x))))
        if self.y is not None and self.y.size > 1 and self.dy is None:
            self.dy = float(np.nanmedian(np.abs(np.diff(self.y))))

    def summary(self) -> dict[str, Any]:
        finite = np.isfinite(self.z)
        out: dict[str, Any] = {
            "shape": list(self.z.shape),
            "cell_count": self.cell_count,
            "dx": self.dx,
            "dy": self.dy,
            "x0": self.x0,
            "y0": self.y0,
            "crs": self.crs,
            "vertical_datum": self.vertical_datum,
            "z_units": self.z_units,
            "finite_fraction": float(finite.mean()) if finite.size else 0.0,
            "source_files": self.source_files,
            "metadata": self.metadata,
        }
        if self.lon is not None and self.lon.size:
            out["lon_min"] = float(np.nanmin(self.lon))
            out["lon_max"] = float(np.nanmax(self.lon))
        if self.lat is not None and self.lat.size:
            out["lat_min"] = float(np.nanmin(self.lat))
            out["lat_max"] = float(np.nanmax(self.lat))
        if finite.any():
            vals = self.z[finite]
            out["z_min"] = float(np.nanmin(vals))
            out["z_max"] = float(np.nanmax(vals))
            out["z_mean"] = float(np.nanmean(vals))
        return out
