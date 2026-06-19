from __future__ import annotations

from typing import Any

import numpy as np

from agent.dem.types import DemGrid


def validate(grid: DemGrid) -> dict[str, Any]:
    checks: list[dict[str, Any]] = []

    def add(level: str, code: str, message: str, details: dict[str, Any] | None = None) -> None:
        checks.append({"level": level, "code": code, "message": message, "details": details or {}})

    rows, cols = grid.z.shape
    if rows < 2 or cols < 2:
        add("error", "DEM_TOO_SMALL", "DEM must have at least two rows and two columns.", {"shape": [rows, cols]})

    geotiff = (grid.metadata or {}).get("geotiff") or {}
    if geotiff.get("likely_image"):
        add(
            "error",
            "RASTER_IS_IMAGE_NOT_DEM",
            "The uploaded GeoTIFF appears to be an image raster, not an elevation DEM.",
            {
                "band_count": geotiff.get("band_count"),
                "dtypes": geotiff.get("dtypes"),
                "color_interpretation": geotiff.get("color_interpretation"),
                "units": geotiff.get("units"),
            },
        )
    elif int(geotiff.get("band_count") or 1) > 1:
        add(
            "warning",
            "MULTIBAND_GEOTIFF",
            "The GeoTIFF has multiple bands; only band 1 was interpreted as elevation.",
            {
                "band_count": geotiff.get("band_count"),
                "dtypes": geotiff.get("dtypes"),
                "color_interpretation": geotiff.get("color_interpretation"),
            },
        )

    finite = np.isfinite(grid.z)
    finite_fraction = float(finite.mean()) if finite.size else 0.0
    if finite_fraction < 0.5:
        add("error", "TOO_MUCH_NODATA", "Less than half of the DEM has finite elevations.", {"finite_fraction": finite_fraction})
    elif finite_fraction < 0.98:
        add("warning", "HAS_NODATA", "The DEM contains nodata cells.", {"finite_fraction": finite_fraction})

    if finite.any():
        vals = grid.z[finite]
        z_min = float(np.nanmin(vals))
        z_max = float(np.nanmax(vals))
        if z_min < -12000 or z_max > 9000:
            add("warning", "EXTREME_ELEVATION_RANGE", "Elevation range is outside normal Earth topography bounds.", {"z_min": z_min, "z_max": z_max})
        if z_min >= 0:
            add("warning", "NO_NEGATIVE_BATHYMETRY", "All values are non-negative; this may be depth-positive data that needs sign inversion.", {"z_min": z_min, "z_max": z_max})
        if z_max <= 0:
            add("info", "ALL_SUBMERGED", "All values are non-positive; this may be valid for offshore-only domains.", {"z_min": z_min, "z_max": z_max})

    if not grid.dx or not grid.dy:
        add("warning", "GRID_SPACING_UNKNOWN", "Grid spacing could not be inferred.")
    elif grid.dx <= 0 or grid.dy <= 0:
        add("error", "GRID_SPACING_INVALID", "Grid spacing must be positive.", {"dx": grid.dx, "dy": grid.dy})

    if not grid.crs:
        add("warning", "CRS_UNKNOWN", "Coordinate reference system is unknown.")
    if not grid.vertical_datum:
        add("warning", "VERTICAL_DATUM_UNKNOWN", "Vertical datum is unknown and must be reviewed before production use.")

    status = "ok"
    if any(c["level"] == "error" for c in checks):
        status = "error"
    elif any(c["level"] == "warning" for c in checks):
        status = "warning"

    return {"status": status, "checks": checks, "summary": grid.summary()}
