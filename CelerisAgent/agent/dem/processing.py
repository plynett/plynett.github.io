from __future__ import annotations

import math

import numpy as np

from agent.dem.types import DemGrid


def apply_options(grid: DemGrid, options: dict) -> DemGrid:
    sign_mode = (options.get("sign_mode") or "auto").lower()
    if sign_mode == "invert":
        grid.z = -grid.z
        grid.add_history("apply_options", sign_mode="invert")

    z_scale = _float(options.get("z_scale"), 1.0)
    if z_scale != 1.0:
        grid.z = grid.z * z_scale
        grid.add_history("apply_options", z_scale=z_scale)

    if options.get("vertical_datum"):
        grid.vertical_datum = str(options["vertical_datum"]).strip()
    if options.get("crs_override"):
        grid.crs = str(options["crs_override"]).strip()
    if options.get("z_units"):
        grid.z_units = str(options["z_units"]).strip()

    if _truthy(options.get("fill_nodata")):
        fill_nodata(grid)

    if options.get("output_grid") == "local_meters":
        localize_grid_to_meters(grid, options)

    max_cells = int(_float(options.get("max_cells"), 1_500_000))
    if max_cells > 0 and grid.cell_count > max_cells:
        downsample(grid, max_cells)

    return grid


def localize_grid_to_meters(grid: DemGrid, options: dict) -> None:
    dx = _float(options.get("output_dx_m"), 0.0)
    dy = _float(options.get("output_dy_m"), dx)
    if dx <= 0 or dy <= 0:
        raise ValueError("Local meter output grid requires positive output_dx_m and output_dy_m.")
    rows, _cols = grid.shape
    source_georeferencing = options.get("source_georeferencing") or {}
    grid.metadata["source_georeferencing"] = source_georeferencing
    grid.x = None
    grid.y = None
    grid.dx = dx
    grid.dy = dy
    grid.x0 = 0.0
    grid.y0 = (rows - 1) * dy
    grid.crs = str(options.get("output_crs") or "LOCAL_METERS")
    grid.add_history("localize_grid_to_meters", dx=dx, dy=dy, source_georeferencing=source_georeferencing)


def fill_nodata(grid: DemGrid) -> None:
    mask = ~np.isfinite(grid.z)
    if not mask.any():
        return
    if mask.all():
        raise ValueError("Cannot fill nodata because all cells are nodata.")
    from scipy import ndimage

    idx = ndimage.distance_transform_edt(mask, return_distances=False, return_indices=True)
    grid.z = grid.z[tuple(idx)]
    grid.add_history("fill_nodata", method="nearest_finite")


def downsample(grid: DemGrid, max_cells: int) -> None:
    stride = int(math.ceil(math.sqrt(grid.cell_count / max_cells)))
    if stride <= 1:
        return
    grid.z = grid.z[::stride, ::stride]
    if grid.x is not None:
        grid.x = grid.x[::stride]
    if grid.y is not None:
        grid.y = grid.y[::stride]
    if grid.dx:
        grid.dx *= stride
    if grid.dy:
        grid.dy *= stride
    grid.add_history("downsample", stride=stride, max_cells=max_cells, shape=list(grid.z.shape))


def _float(value, default: float) -> float:
    if value in (None, ""):
        return default
    return float(value)


def _truthy(value) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.lower() in {"1", "true", "yes", "on"}
    return bool(value)
