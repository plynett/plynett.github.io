from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Callable

import numpy as np
from scipy.interpolate import RegularGridInterpolator

from agent.celeris.request import (
    BOUNDARY_TYPES,
    DEFAULT_CELERIS_CONFIG,
    celeris_config_missing,
    earthquake_initial_condition_enabled,
    has_incident_wave_forcing,
    normalize_celeris_config,
)
from agent.celeris.earthquake_ic import generate_earthquake_initial_condition
from agent.celeris.waves import write_periodic_waves
from agent.dem.export import artifact
from agent.dem.loaders import load_mat as load_dem_mat
from agent.imagery.overlay import build_domain_georeferencing, generate_satellite_overlay
from agent.io_utils import write_json


CONFIG_KEYS = [
    "WIDTH",
    "HEIGHT",
    "dx",
    "dy",
    "Courant_num",
    "NLSW_or_Bous",
    "base_depth",
    "g",
    "Theta",
    "friction",
    "isManning",
    "dissipation_threshold",
    "whiteWaterDecayRate",
    "timeScheme",
    "seaLevel",
    "Bcoef",
    "tridiag_solve",
    "west_boundary_type",
    "east_boundary_type",
    "south_boundary_type",
    "north_boundary_type",
    "significant_wave_height",
    "loadetaIC",
]

MAX_CELERIS_MODEL_CELLS = 10_000_000
STARTUP_VISUALIZATION_KEYS = [
    "surfaceToPlot",
    "colorMap_choice",
    "colorVal_min",
    "colorVal_max",
    "showBreaking",
    "GoogleMapOverlay",
    "ShowArrows",
    "arrow_scale",
    "arrow_density",
    "ShowLogos",
    "viewType",
]


ProgressCallback = Callable[[str, str, dict[str, Any] | None], None]


def generate_celeris_inputs(job_dir: Path, request: dict[str, Any], progress_callback: ProgressCallback | None = None) -> dict[str, Any]:
    normalize_celeris_config(request)
    selected_path = ["parse_celeris_config_request", "validate_celeris_config_request"]
    missing = celeris_config_missing(request)
    if missing:
        return {
            "status": "needs_celeris_config",
            "selected_path": selected_path,
            "validation": validation_report("warning", [{"level": "warning", "code": "MISSING_WAVE_DIRECTION", "message": "Wave direction is required before generating CELERIS inputs.", "details": {"missing": missing}}]),
            "artifacts": [],
            "config": request,
            "missing_information": missing,
        }

    mat_path = job_dir / "outputs" / "celeris_bathy.mat"
    if not mat_path.exists():
        return {
            "status": "needs_dem",
            "selected_path": selected_path,
            "validation": validation_report("warning", [{"level": "warning", "code": "MISSING_CELERIS_BATHY", "message": "celeris_bathy.mat is required before config.json, bathy.txt, and waves.txt can be generated.", "details": {"expected": str(mat_path)}}]),
            "artifacts": [],
            "config": request,
            "missing_information": ["completed celeris_bathy.mat"],
        }

    source_choice = finite_fault_source_choice_request(request)
    if source_choice:
        selected_path.append("select_earthquake_source_model")
        return {
            "status": "needs_initial_condition_source_choice",
            "selected_path": selected_path,
            "validation": validation_report("warning", [source_choice]),
            "artifacts": [],
            "config": request,
            "missing_information": ["earthquake source model selection"],
        }

    emit_progress(progress_callback, "celeris_load_bathy", "Loading celeris_bathy.mat.", {"path": str(mat_path.relative_to(job_dir))})
    grid = load_celeris_bathy(mat_path)
    selected_path.append("load_celeris_bathy_mat")
    grid_spacing_adjustment = apply_dem_grid_spacing_default(request, grid)
    if grid_spacing_adjustment.get("applied"):
        selected_path.append("apply_dem_native_grid_spacing_default")
    grid_plan = planned_model_grid(grid, request["dx"], request["dy"])
    tsunami_grid_spacing_adjustment = apply_tsunami_grid_spacing_default(request, grid_plan)
    if tsunami_grid_spacing_adjustment.get("applied"):
        selected_path.append("apply_tsunami_native_grid_spacing_default")
        grid_plan = planned_model_grid(grid, request["dx"], request["dy"])
    selected_path.append("preflight_model_grid_size")
    emit_progress(
        progress_callback,
        "celeris_grid_plan",
        "Planned the CELERIS model grid from the current DEM and requested spacing.",
        grid_plan,
    )
    if grid_plan["cell_count"] > MAX_CELERIS_MODEL_CELLS:
        return {
            "status": "needs_celeris_config",
            "selected_path": selected_path,
            "validation": validation_report(
                "warning",
                [
                    {
                        "level": "warning",
                        "code": "CELERIS_MODEL_GRID_TOO_LARGE",
                        "message": "Requested CELERIS dx/dy would create an oversized model grid before interpolation.",
                        "details": {
                            **grid_plan,
                            "max_model_cells": MAX_CELERIS_MODEL_CELLS,
                        },
                    }
                ],
            ),
            "artifacts": [],
            "config": request,
            "missing_information": ["coarser CELERIS grid spacing"],
        }
    emit_progress(
        progress_callback,
        "celeris_interpolate_bathy",
        "Interpolating bathymetry onto the CELERIS model grid and filling any NaN cells.",
        {"dx": request["dx"], "dy": request["dy"], "planned_width": grid_plan["planned_width"], "planned_height": grid_plan["planned_height"]},
    )
    model = interpolate_to_model_grid(grid, request["dx"], request["dy"], request["seaLevel"])
    model["grid_spacing_adjustment"] = {
        "dem_default": grid_spacing_adjustment,
        "tsunami_safety_default": tsunami_grid_spacing_adjustment,
    }
    selected_path.append("interpolate_bathy_to_model_grid")
    emit_progress(
        progress_callback,
        "celeris_interpolate_bathy_done",
        "Finished bathymetry interpolation and NaN fill.",
        {"WIDTH": model["WIDTH"], "HEIGHT": model["HEIGHT"], "nan_fill": model.get("nan_fill")},
    )
    depth_cap_summary = apply_boussinesq_depth_cap(model["z"], request)
    model["depth_cap"] = depth_cap_summary
    emit_progress(
        progress_callback,
        "celeris_depth_checks",
        "Applied bathymetry depth checks for the selected simulation mode.",
        {"depth_cap": depth_cap_summary},
    )

    base_depth = float(-np.nanmin(model["z"]))
    if not np.isfinite(base_depth) or base_depth <= 0:
        return {
            "status": "needs_review",
            "selected_path": selected_path,
            "validation": validation_report("error", [{"level": "error", "code": "INVALID_BASE_DEPTH", "message": "The interpolated bathymetry does not contain submerged negative elevations, so base_depth could not be computed.", "details": {}}]),
            "artifacts": [],
            "config": request,
        }

    out_dir = job_dir / "outputs"
    bathy_path = out_dir / "bathy.txt"
    emit_progress(progress_callback, "celeris_write_bathy", "Writing bathy.txt.", {"path": str(bathy_path.relative_to(job_dir)), "shape": [model["HEIGHT"], model["WIDTH"]]})
    np.savetxt(bathy_path, model["z"], fmt="%.8f")
    selected_path.append("write_bathy_txt")

    waves_path = out_dir / "waves.txt"
    emit_progress(progress_callback, "celeris_write_waves", "Generating waves.txt.", {"has_incident_wave_forcing": has_incident_wave_forcing(request)})
    if has_incident_wave_forcing(request):
        wave_boundary = request["wave_boundary"]
        ds, boundary_length, boundary_angle = boundary_wave_geometry(wave_boundary, model)
        wave_summary = write_periodic_waves(
            waves_path,
            request["Hmo"],
            request["Tp"],
            request["Thetap"],
            base_depth,
            ds,
            boundary_length,
            boundary_angle,
            fit_to_periodic_boundary=has_transverse_periodic_boundaries(wave_boundary, request),
        )
        selected_path.append("generate_periodic_wave_file")
    else:
        wave_summary = write_no_incident_waves(waves_path)
        selected_path.append("write_zero_amplitude_waves_file")

    domain_georeferencing = build_domain_georeferencing(job_dir, model)
    selected_path.append("resolve_domain_georeferencing")
    emit_progress(
        progress_callback,
        "celeris_domain_georeferencing",
        "Resolved domain georeferencing for overlay and initial-condition files.",
        {"status": domain_georeferencing.get("status"), "bbox_wgs84": domain_georeferencing.get("bbox_wgs84")},
    )

    emit_progress(
        progress_callback,
        "celeris_initial_condition",
        "Checking whether an initial free-surface condition should be generated.",
        {"enabled": bool((request.get("initial_condition") or {}).get("enabled"))},
    )
    initial_condition_result = generate_earthquake_initial_condition(
        job_dir,
        model,
        domain_georeferencing,
        request.get("initial_condition") or {},
    )
    selected_path.extend(initial_condition_result.get("selected_path", []))
    initial_condition_artifacts = initial_condition_result.get("artifacts", [])
    initial_condition_checks = initial_condition_result.get("checks", [])
    has_initial_eta = initial_condition_result.get("status") == "completed"

    config_json = build_config_json(request, model, base_depth, has_initial_eta)
    config_path = out_dir / "config.json"
    emit_progress(progress_callback, "celeris_write_config", "Writing config.json.", {"path": str(config_path.relative_to(job_dir))})
    config_path.write_text(json.dumps(config_json, indent=2) + "\n", encoding="utf-8")
    selected_path.append("write_celeris_config_json")

    checks = validate_generated_config(request, config_json, model, wave_summary)
    checks.extend(initial_condition_checks)
    status = "completed" if not any(check["level"] == "error" for check in checks) else "needs_review"
    overlay_result = None
    overlay_artifacts: list[dict[str, Any]] = []
    if status == "completed":
        emit_progress(
            progress_callback,
            "celeris_satellite_overlay",
            "Generating satellite overlay.jpg for the final model domain.",
            {"bbox_wgs84": domain_georeferencing.get("bbox_wgs84")},
        )
        overlay_result = generate_satellite_overlay(job_dir, domain_georeferencing)
        selected_path.extend(overlay_result.get("selected_path", []))
        overlay_artifacts = overlay_result.get("artifacts", [])
        checks.extend((overlay_result.get("validation") or {}).get("checks", []))
        emit_progress(
            progress_callback,
            "celeris_satellite_overlay_done",
            f"Satellite overlay generation finished with status {overlay_result.get('status')}.",
            {"status": overlay_result.get("status"), "output": (overlay_result.get("overlay") or {}).get("output")},
        )

    validation_status = "error" if status == "needs_review" else ("warning" if any(check["level"] == "warning" for check in checks) else "ok")
    validation = validation_report(validation_status, checks)
    manifest_path = out_dir / "celeris_case_manifest.json"
    emit_progress(progress_callback, "celeris_write_manifest", "Writing CELERIS case manifest.", {"path": str(manifest_path.relative_to(job_dir))})
    write_json(
        manifest_path,
        {
            "schema_version": "0.1.0",
            "source_bathy": str(mat_path.relative_to(job_dir)),
            "request": request,
            "config": config_json,
            "model_grid": model_grid_summary(model),
            "domain_georeferencing": domain_georeferencing,
            "overlay": (overlay_result or {}).get("overlay"),
            "initial_condition": initial_condition_result.get("initial_condition"),
            "nan_fill": model.get("nan_fill"),
            "depth_cap": model.get("depth_cap"),
            "wave_summary": wave_summary,
            "boundary_type_values": BOUNDARY_TYPES,
            "validation": validation,
        },
    )
    selected_path.append("write_celeris_case_manifest")

    artifacts = [
        artifact(job_dir, config_path, "celeris_config_json", "CELERIS config.json"),
        artifact(job_dir, bathy_path, "celeris_bathy_txt", "CELERIS bathy.txt"),
        artifact(job_dir, waves_path, "celeris_waves_txt", "CELERIS waves.txt"),
        artifact(job_dir, manifest_path, "celeris_case_manifest", "CELERIS case manifest"),
        *initial_condition_artifacts,
        *overlay_artifacts,
    ]
    return {
        "status": status,
        "selected_path": selected_path,
        "validation": validation,
        "artifacts": artifacts,
        "config": request,
        "config_json": config_json,
        "overlay": overlay_result,
        "initial_condition": initial_condition_result,
        "wave_summary": wave_summary,
        "summary": {
            "WIDTH": config_json["WIDTH"],
            "HEIGHT": config_json["HEIGHT"],
            "dx": config_json["dx"],
            "dy": config_json["dy"],
            "base_depth": base_depth,
            "wave_count": wave_summary["wave_count"],
        },
    }


def emit_progress(callback: ProgressCallback | None, stage: str, detail: str, data: dict[str, Any] | None = None) -> None:
    if callback is None:
        return
    callback(stage, detail, data or {})


def load_celeris_bathy(path: Path) -> dict[str, np.ndarray | str | None]:
    grid = load_dem_mat(path)
    return {
        "z": np.asarray(grid.z, dtype=np.float64),
        "x": np.asarray(grid.x, dtype=np.float64) if grid.x is not None else None,
        "y": np.asarray(grid.y, dtype=np.float64) if grid.y is not None else None,
        "lon": np.asarray(grid.lon, dtype=np.float64) if grid.lon is not None else None,
        "lat": np.asarray(grid.lat, dtype=np.float64) if grid.lat is not None else None,
        "crs": grid.crs,
        "metadata": grid.metadata,
    }


def interpolate_to_model_grid(grid: dict[str, Any], dx: float, dy: float, sea_level: float) -> dict[str, Any]:
    z = np.asarray(grid["z"], dtype=np.float64)
    rows, cols = z.shape
    x = grid.get("x")
    y = grid.get("y")
    if x is None or x.size != cols:
        x = np.arange(cols, dtype=np.float64)
    if y is None or y.size != rows:
        y = np.arange(rows, dtype=np.float64)

    x_source = np.asarray(x, dtype=np.float64)
    y_source = np.asarray(y, dtype=np.float64)
    lon_source = vector_matching_axis(grid.get("lon"), cols)
    lat_source = vector_matching_axis(grid.get("lat"), rows)
    is_geographic = lon_source is not None and lat_source is not None
    if not is_geographic and looks_like_lon_lat(x_source, y_source):
        lon_source = x_source.copy()
        lat_source = y_source.copy()
        is_geographic = True
    x_local, y_local = local_xy(x_source, y_source)
    if x_local[0] > x_local[-1]:
        x_local = x_local[::-1]
        x_source = x_source[::-1]
        if lon_source is not None:
            lon_source = lon_source[::-1]
        z = z[:, ::-1]
    if y_local[0] > y_local[-1]:
        y_local = y_local[::-1]
        y_source = y_source[::-1]
        if lat_source is not None:
            lat_source = lat_source[::-1]
        z = z[::-1, :]

    x_interp = np.arange(x_local[0], x_local[-1] + dx * 0.25, dx)
    y_interp = np.arange(y_local[0], y_local[-1] + dy * 0.25, dy)
    if x_interp.size < 2 or y_interp.size < 2:
        raise ValueError("Requested CELERIS dx/dy are too large for the available bathymetry extent.")

    interpolator = RegularGridInterpolator((y_local, x_local), z, bounds_error=False, fill_value=np.nan)
    yy, xx = np.meshgrid(y_interp, x_interp, indexing="ij")
    h_interp = interpolator(np.column_stack([yy.ravel(), xx.ravel()])).reshape(y_interp.size, x_interp.size)
    h_interp = h_interp + float(sea_level)
    if not np.isfinite(h_interp).any():
        raise ValueError("Interpolated CELERIS bathy grid contains no finite cells.")
    h_interp, fill_summary = fill_bathy_nans(h_interp)
    model = {
        "z": h_interp,
        "x": x_interp,
        "y": y_interp,
        "WIDTH": int(x_interp.size),
        "HEIGHT": int(y_interp.size),
        "dx": float(np.nanmean(np.diff(x_interp))),
        "dy": float(np.nanmean(np.diff(y_interp))),
        "x_min": float(x_interp[0]),
        "x_max": float(x_interp[-1]),
        "y_min": float(y_interp[0]),
        "y_max": float(y_interp[-1]),
        "nan_fill": fill_summary,
    }
    if is_geographic:
        lon = np.interp(x_interp, x_local, lon_source)
        lat = np.interp(y_interp, y_local, lat_source)
        model.update(
            {
                "lon": lon,
                "lat": lat,
                "bbox_wgs84": [float(np.nanmin(lon)), float(np.nanmin(lat)), float(np.nanmax(lon)), float(np.nanmax(lat))],
                "coordinate_mapping": {
                    "type": "axis_aligned_geographic_to_local_meters",
                    "source_x_units": "degrees_east",
                    "source_y_units": "degrees_north",
                    "note": "Final CELERIS x/y are local meters; lon/lat arrays preserve the original DEM geographic axes.",
                },
            }
        )
    return model


def planned_model_grid(grid: dict[str, Any], dx: float, dy: float) -> dict[str, Any]:
    z = np.asarray(grid["z"], dtype=np.float64)
    rows, cols = z.shape
    x = grid.get("x")
    y = grid.get("y")
    if x is None or np.asarray(x).size != cols:
        x = np.arange(cols, dtype=np.float64)
    if y is None or np.asarray(y).size != rows:
        y = np.arange(rows, dtype=np.float64)
    x_source = np.asarray(x, dtype=np.float64)
    y_source = np.asarray(y, dtype=np.float64)
    x_local, y_local = local_xy(x_source, y_source)
    x_span = float(np.nanmax(x_local) - np.nanmin(x_local))
    y_span = float(np.nanmax(y_local) - np.nanmin(y_local))
    planned_width = max(2, int(np.floor((x_span + float(dx) * 0.25) / float(dx))) + 1)
    planned_height = max(2, int(np.floor((y_span + float(dy) * 0.25) / float(dy))) + 1)
    native_dx = median_spacing(x_local)
    native_dy = median_spacing(y_local)
    min_square_spacing = float(np.sqrt(max(x_span * y_span, 1.0) / MAX_CELERIS_MODEL_CELLS))
    return {
        "requested_dx_m": float(dx),
        "requested_dy_m": float(dy),
        "source_rows": int(rows),
        "source_columns": int(cols),
        "planned_width": planned_width,
        "planned_height": planned_height,
        "cell_count": int(planned_width * planned_height),
        "domain_width_m_approx": x_span,
        "domain_height_m_approx": y_span,
        "source_native_dx_m_approx": native_dx,
        "source_native_dy_m_approx": native_dy,
        "suggested_min_square_spacing_m": min_square_spacing,
    }


def vector_matching_axis(value: Any, size: int) -> np.ndarray | None:
    if value is None:
        return None
    arr = np.asarray(value, dtype=np.float64).squeeze()
    if arr.ndim == 1 and arr.size == size:
        return arr
    return None


def apply_dem_grid_spacing_default(request: dict[str, Any], grid: dict[str, Any]) -> dict[str, Any]:
    explicit_fields = set(request.get("_explicit_fields") or [])
    dx_explicit = "dx" in explicit_fields
    dy_explicit = "dy" in explicit_fields
    fallback_unspecified = "_explicit_fields" not in request and (
        float(request.get("dx") or 0.0) == float(DEFAULT_CELERIS_CONFIG["dx"])
        or float(request.get("dy") or 0.0) == float(DEFAULT_CELERIS_CONFIG["dy"])
    )
    if dx_explicit and dy_explicit:
        return {"applied": False, "reason": "user explicitly specified CELERIS dx and dy"}
    native_dx, native_dy = native_grid_spacing(grid)
    changes: dict[str, Any] = {}
    original_dx = float(request.get("dx") or DEFAULT_CELERIS_CONFIG["dx"])
    original_dy = float(request.get("dy") or DEFAULT_CELERIS_CONFIG["dy"])
    if (not dx_explicit or fallback_unspecified) and native_dx:
        request["dx"] = max(float(native_dx), 2.0)
        changes["dx"] = {"original_m": original_dx, "native_dem_m": float(native_dx), "new_m": float(request["dx"])}
    if (not dy_explicit or fallback_unspecified) and native_dy:
        request["dy"] = max(float(native_dy), 2.0)
        changes["dy"] = {"original_m": original_dy, "native_dem_m": float(native_dy), "new_m": float(request["dy"])}
    if not changes:
        return {"applied": False, "reason": "no usable DEM-native spacing was available or all spacing fields were explicit"}
    return {
        "applied": True,
        "reason": "CELERIS grid spacing was not explicitly specified, so it defaulted to DEM-native spacing with a 2 m minimum.",
        "changes": changes,
        "minimum_default_spacing_m": 2.0,
        "explicit_fields": sorted(explicit_fields),
    }


def apply_tsunami_grid_spacing_default(request: dict[str, Any], grid_plan: dict[str, Any]) -> dict[str, Any]:
    if not earthquake_initial_condition_enabled(request) or has_incident_wave_forcing(request):
        return {"applied": False, "reason": "not an earthquake/tsunami initial-condition-only case"}
    if float(request.get("dx") or 0.0) != float(DEFAULT_CELERIS_CONFIG["dx"]) or float(request.get("dy") or 0.0) != float(DEFAULT_CELERIS_CONFIG["dy"]):
        return {"applied": False, "reason": "user or planner supplied explicit CELERIS grid spacing"}
    if int(grid_plan.get("cell_count") or 0) <= MAX_CELERIS_MODEL_CELLS:
        return {"applied": False, "reason": "default grid spacing is within the safety limit"}

    finite_fault_spacing = finite_fault_spacing_m(request)
    suggested = float(grid_plan.get("suggested_min_square_spacing_m") or 0.0)
    if finite_fault_spacing:
        new_dx, new_dy = finite_fault_spacing
        reason = "confirmed USGS finite-fault source used finite-fault subfault spacing instead of the near-field 2 m default"
        if new_dx < suggested or new_dy < suggested:
            new_dx = max(new_dx, suggested)
            new_dy = max(new_dy, suggested)
            reason = "confirmed USGS finite-fault source used finite-fault subfault spacing, coarsened only enough to stay within the model-size safety limit"
    else:
        return {"applied": False, "reason": "no finite-fault source spacing was available for automatic tsunami grid spacing"}
    if new_dx <= float(DEFAULT_CELERIS_CONFIG["dx"]) or new_dy <= float(DEFAULT_CELERIS_CONFIG["dy"]):
        return {"applied": False, "reason": "no coarser finite-fault spacing could be determined"}
    request["dx"] = new_dx
    request["dy"] = new_dy
    return {
        "applied": True,
        "reason": reason,
        "original_dx_m": float(DEFAULT_CELERIS_CONFIG["dx"]),
        "original_dy_m": float(DEFAULT_CELERIS_CONFIG["dy"]),
        "new_dx_m": new_dx,
        "new_dy_m": new_dy,
        "finite_fault_dx_m": finite_fault_spacing[0] if finite_fault_spacing else None,
        "finite_fault_dy_m": finite_fault_spacing[1] if finite_fault_spacing else None,
        "suggested_min_square_spacing_m": suggested,
        "original_planned_cell_count": int(grid_plan.get("cell_count") or 0),
    }


def finite_fault_spacing_m(request: dict[str, Any]) -> tuple[float, float] | None:
    initial_condition = request.get("initial_condition") or {}
    finite_fault = initial_condition.get("finite_fault") or {}
    if initial_condition.get("source_model") != "usgs_finite_fault" or finite_fault.get("selection") != "finite_fault":
        return None
    dx_km = finite_fault.get("subfault_length_km")
    dy_km = finite_fault.get("subfault_width_km")
    if not dx_km or not dy_km:
        return None
    try:
        dx = float(dx_km) * 1000.0
        dy = float(dy_km) * 1000.0
    except (TypeError, ValueError):
        return None
    if dx <= 0.0 or dy <= 0.0:
        return None
    return dx, dy


def median_spacing(values: np.ndarray) -> float | None:
    diffs = np.diff(np.asarray(values, dtype=np.float64))
    diffs = np.abs(diffs[np.isfinite(diffs)])
    diffs = diffs[diffs > 0]
    return float(np.median(diffs)) if diffs.size else None


def native_grid_spacing(grid: dict[str, Any]) -> tuple[float | None, float | None]:
    z = np.asarray(grid["z"], dtype=np.float64)
    rows, cols = z.shape
    x = grid.get("x")
    y = grid.get("y")
    if x is None or np.asarray(x).size != cols:
        x = np.arange(cols, dtype=np.float64)
    if y is None or np.asarray(y).size != rows:
        y = np.arange(rows, dtype=np.float64)
    x_local, y_local = local_xy(np.asarray(x, dtype=np.float64), np.asarray(y, dtype=np.float64))
    return median_spacing(x_local), median_spacing(y_local)


def fill_bathy_nans(z: np.ndarray) -> tuple[np.ndarray, dict[str, Any]]:
    z = np.asarray(z, dtype=np.float64).copy()
    missing = ~np.isfinite(z)
    missing_count = int(np.count_nonzero(missing))
    if missing_count == 0:
        return z, {"filled_cells": 0, "linear_cells": 0, "nearest_cells": 0}

    finite = np.isfinite(z)
    if not finite.any():
        raise ValueError("Cannot fill CELERIS bathy grid because all cells are NaN.")

    linear_cells = 0
    nearest_cells = 0
    row_indices = np.where(missing.any(axis=1))[0]
    for row_index in row_indices:
        row = z[row_index, :]
        row_missing = ~np.isfinite(row)
        if not row_missing.any():
            continue
        finite_cols = np.flatnonzero(np.isfinite(row))
        if finite_cols.size < 2:
            continue
        missing_cols = np.flatnonzero(row_missing)
        interpolated = np.interp(missing_cols, finite_cols, row[finite_cols])
        inside = (missing_cols >= finite_cols[0]) & (missing_cols <= finite_cols[-1])
        z[row_index, missing_cols] = interpolated
        linear_cells += int(np.count_nonzero(inside))
        nearest_cells += int(np.count_nonzero(~inside))

    col_indices = np.where((~np.isfinite(z)).any(axis=0))[0]
    for col_index in col_indices:
        col = z[:, col_index]
        col_missing = ~np.isfinite(col)
        if not col_missing.any():
            continue
        finite_rows = np.flatnonzero(np.isfinite(col))
        if finite_rows.size < 2:
            continue
        missing_rows = np.flatnonzero(col_missing)
        interpolated = np.interp(missing_rows, finite_rows, col[finite_rows])
        inside = (missing_rows >= finite_rows[0]) & (missing_rows <= finite_rows[-1])
        z[missing_rows, col_index] = interpolated
        linear_cells += int(np.count_nonzero(inside))
        nearest_cells += int(np.count_nonzero(~inside))

    remaining = ~np.isfinite(z)
    remaining_nearest_cells = int(np.count_nonzero(remaining))
    if remaining_nearest_cells:
        from scipy import ndimage

        nearest_index = ndimage.distance_transform_edt(remaining, return_distances=False, return_indices=True)
        z[remaining] = z[tuple(nearest_index)][remaining]
        nearest_cells += remaining_nearest_cells

    if not np.isfinite(z).all():
        raise ValueError("CELERIS bathy NaN fill failed; bathy.txt would contain NaN values.")
    return z, {"filled_cells": missing_count, "linear_cells": linear_cells, "nearest_cells": nearest_cells}


def apply_boussinesq_depth_cap(z: np.ndarray, request: dict[str, Any]) -> dict[str, Any]:
    mode = int(request.get("NLSW_or_Bous", 0))
    if mode not in {1, 2}:
        return {"applied": False, "reason": "NLSW_or_Bous is not a Boussinesq mode.", "capped_cells": 0}
    dx = float(request["dx"])
    max_depth = 30.0 * dx
    min_elevation = -max_depth
    too_deep = z < min_elevation
    capped_cells = int(np.count_nonzero(too_deep))
    raw_min = float(np.nanmin(z)) if z.size else None
    if capped_cells:
        z[too_deep] = min_elevation
    return {
        "applied": True,
        "max_depth_m": max_depth,
        "min_elevation_m": min_elevation,
        "capped_cells": capped_cells,
        "raw_min_elevation_m": raw_min,
    }


def local_xy(x: np.ndarray, y: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    if looks_like_lon_lat(x, y):
        lat0 = float(np.nanmean(y))
        x_local = (x - np.nanmin(x)) * 111_320.0 * max(np.cos(np.deg2rad(lat0)), 0.01)
        y_local = (y - np.nanmin(y)) * 111_320.0
        return x_local, y_local
    return x - np.nanmin(x), y - np.nanmin(y)


def looks_like_lon_lat(x: np.ndarray, y: np.ndarray) -> bool:
    x_span = float(np.nanmax(x) - np.nanmin(x))
    y_span = float(np.nanmax(y) - np.nanmin(y))
    return (
        np.nanmin(x) >= -180
        and np.nanmax(x) <= 360
        and np.nanmin(y) >= -90
        and np.nanmax(y) <= 90
        and 0 < x_span <= 5
        and 0 < y_span <= 5
    )


def boundary_wave_geometry(boundary: str, model: dict[str, Any]) -> tuple[float, float, float]:
    if boundary == "west":
        return model["dy"], model["y"][-1] - model["y"][0], 0.0
    if boundary == "east":
        return model["dy"], model["y"][-1] - model["y"][0], 180.0
    if boundary == "south":
        return model["dx"], model["x"][-1] - model["x"][0], 90.0
    if boundary == "north":
        return model["dx"], model["x"][-1] - model["x"][0], 270.0
    raise ValueError(f"Unsupported wave boundary: {boundary}")


def has_transverse_periodic_boundaries(wave_boundary: str, request: dict[str, Any]) -> bool:
    if wave_boundary in {"west", "east"}:
        return request.get("south_boundary_type") == 3 and request.get("north_boundary_type") == 3
    if wave_boundary in {"south", "north"}:
        return request.get("west_boundary_type") == 3 and request.get("east_boundary_type") == 3
    return False


def write_no_incident_waves(path: Path) -> dict[str, Any]:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n[NumberOfWaves] 1\n=================================\n0.0 10.0 0.0 0.0\n", encoding="utf-8")
    return {
        "mode": "no_incident_waves",
        "wave_count": 0,
        "file_component_count": 1,
        "note": "A single zero-amplitude placeholder row is written so CELERIS can load a valid waves.txt while boundary forcing remains disabled.",
    }


def build_config_json(request: dict[str, Any], model: dict[str, Any], base_depth: float, has_initial_eta: bool = False) -> dict[str, float | int]:
    significant_wave_height = request["Hmo"] if has_incident_wave_forcing(request) else 0.0
    config = {
        "WIDTH": model["WIDTH"],
        "HEIGHT": model["HEIGHT"],
        "dx": model["dx"],
        "dy": model["dy"],
        "Courant_num": request["Courant_num"],
        "NLSW_or_Bous": request["NLSW_or_Bous"],
        "base_depth": base_depth,
        "g": request["g"],
        "Theta": request["Theta"],
        "friction": request["friction"],
        "isManning": request["isManning"],
        "dissipation_threshold": request["dissipation_threshold"],
        "whiteWaterDecayRate": request["whiteWaterDecayRate"],
        "timeScheme": request["timeScheme"],
        "seaLevel": 0.0,
        "Bcoef": request["Bcoef"],
        "tridiag_solve": request["tridiag_solve"],
        "west_boundary_type": request["west_boundary_type"],
        "east_boundary_type": request["east_boundary_type"],
        "south_boundary_type": request["south_boundary_type"],
        "north_boundary_type": request["north_boundary_type"],
        "significant_wave_height": significant_wave_height,
        "loadetaIC": 1 if has_initial_eta else 0,
    }
    if has_initial_eta and (request.get("initial_condition") or {}).get("type") == "earthquake_okada":
        slip = float((request.get("initial_condition") or {}).get("slip_m") or 0.0)
        color_limit = max(slip / 3.0, 1e-6)
        config.update(
            {
                "surfaceToPlot": 0,
                "colorMap_choice": 2,
                "colorVal_min": -color_limit,
                "colorVal_max": color_limit,
            }
        )
    explicit_fields = set(request.get("_explicit_fields") or [])
    for key in STARTUP_VISUALIZATION_KEYS:
        if key in explicit_fields and request.get(key) is not None:
            config[key] = request[key]
    return config


def model_grid_summary(model: dict[str, Any]) -> dict[str, Any]:
    summary = {key: model[key] for key in ("WIDTH", "HEIGHT", "dx", "dy", "x_min", "x_max", "y_min", "y_max")}
    if model.get("grid_spacing_adjustment"):
        summary["grid_spacing_adjustment"] = model["grid_spacing_adjustment"]
    bbox_wgs84 = model.get("bbox_wgs84")
    if isinstance(bbox_wgs84, list) and len(bbox_wgs84) == 4:
        summary["bbox_wgs84"] = [float(value) for value in bbox_wgs84]
        lon = model.get("lon")
        lat = model.get("lat")
        if lon is not None and lat is not None:
            lon_arr = np.asarray(lon, dtype=np.float64)
            lat_arr = np.asarray(lat, dtype=np.float64)
            summary["lon_min"] = float(np.nanmin(lon_arr))
            summary["lon_max"] = float(np.nanmax(lon_arr))
            summary["lat_min"] = float(np.nanmin(lat_arr))
            summary["lat_max"] = float(np.nanmax(lat_arr))
        summary["coordinate_mapping"] = model.get("coordinate_mapping")
    return summary


def validate_generated_config(request: dict[str, Any], config: dict[str, Any], model: dict[str, Any], wave_summary: dict[str, Any]) -> list[dict[str, Any]]:
    checks = []
    missing_keys = [key for key in CONFIG_KEYS if key not in config]
    if missing_keys:
        checks.append({"level": "error", "code": "CONFIG_KEYS_MISSING", "message": "Generated config.json is missing required CELERIS keys.", "details": {"missing": missing_keys}})
    wave_boundaries = [name for name in ("west", "east", "south", "north") if request.get(f"{name}_boundary_type") == 2]
    if has_incident_wave_forcing(request):
        if len(wave_boundaries) != 1:
            checks.append({"level": "error", "code": "INVALID_WAVE_BOUNDARY_COUNT", "message": "Incident-wave config generation expects exactly one wave boundary.", "details": {"wave_boundaries": wave_boundaries}})
    elif wave_boundaries:
        checks.append({"level": "error", "code": "UNEXPECTED_WAVE_BOUNDARY", "message": "A wave boundary was configured even though no incident wave forcing was requested.", "details": {"wave_boundaries": wave_boundaries}})
    if config["WIDTH"] <= 1 or config["HEIGHT"] <= 1 or config["dx"] <= 0 or config["dy"] <= 0:
        checks.append({"level": "error", "code": "INVALID_MODEL_GRID", "message": "Generated model grid dimensions or spacing are invalid.", "details": {"WIDTH": config["WIDTH"], "HEIGHT": config["HEIGHT"], "dx": config["dx"], "dy": config["dy"]}})
    dem_default = ((model.get("grid_spacing_adjustment") or {}).get("dem_default") or {})
    if dem_default.get("applied"):
        checks.append(
            {
                "level": "info",
                "code": "CELERIS_GRID_SPACING_DEFAULTED_TO_DEM",
                "message": "CELERIS dx/dy were not explicitly specified, so the model grid defaulted to DEM-native spacing with a 2 m minimum.",
                "details": dem_default,
            }
        )
    if config["base_depth"] <= 0:
        checks.append({"level": "error", "code": "INVALID_BASE_DEPTH", "message": "Base depth must be positive.", "details": {"base_depth": config["base_depth"]}})
    explicit_startup_visualization = {
        key: config.get(key)
        for key in STARTUP_VISUALIZATION_KEYS
        if key in set(request.get("_explicit_fields") or []) and key in config
    }
    if explicit_startup_visualization:
        checks.append(
            {
                "level": "info",
                "code": "STARTUP_VISUALIZATION_CONFIG_APPLIED",
                "message": "Requested startup visualization settings were written to config.json.",
                "details": explicit_startup_visualization,
            }
        )
    if has_incident_wave_forcing(request) and wave_summary.get("wave_count", 0) <= 0:
        checks.append({"level": "error", "code": "NO_WAVES_WRITTEN", "message": "waves.txt did not contain any waves.", "details": wave_summary})
    if wave_summary.get("mode") == "no_incident_waves":
        checks.append({"level": "info", "code": "NO_INCIDENT_WAVES", "message": "No incident wave forcing was requested; waves.txt contains a zero-amplitude placeholder and all wave boundaries are disabled.", "details": wave_summary})
    if np.isnan(model["z"]).any():
        checks.append({"level": "error", "code": "BATHY_TXT_HAS_NAN", "message": "Interpolated bathy.txt contains NaN values.", "details": {}})
    fill_summary = model.get("nan_fill") or {}
    if fill_summary.get("filled_cells"):
        checks.append(
            {
                "level": "info",
                "code": "BATHY_NANS_FILLED",
                "message": "NaN cells were filled before writing bathy.txt.",
                "details": fill_summary,
            }
        )
    depth_cap = model.get("depth_cap") or {}
    if depth_cap.get("applied"):
        message = (
            f"Boussinesq depth is clipped at {depth_cap.get('max_depth_m'):g} m before writing bathy.txt."
            if depth_cap.get("capped_cells", 0)
            else f"Boussinesq depth cap checked at {depth_cap.get('max_depth_m'):g} m; no cells exceeded the maximum allowable depth."
        )
        checks.append(
            {
                "level": "info",
                "code": "BOUSSINESQ_DEPTH_CAP",
                "message": message,
                "details": depth_cap,
            }
        )
    spacing_adjustment = model.get("grid_spacing_adjustment") or {}
    if spacing_adjustment.get("applied"):
        checks.append(
            {
                "level": "info",
                "code": "TSUNAMI_GRID_SPACING_DEFAULTED_TO_FINITE_FAULT",
                "message": (
                    "Earthquake/tsunami config generation used finite-fault source spacing "
                    "instead of the near-field 2 m default."
                ),
                "details": spacing_adjustment,
            }
        )
    return checks


def validation_report(status: str, checks: list[dict[str, Any]]) -> dict[str, Any]:
    return {"status": status, "checks": checks}


def finite_fault_source_choice_request(request: dict[str, Any]) -> dict[str, Any] | None:
    initial_condition = request.get("initial_condition") or {}
    finite_fault = initial_condition.get("finite_fault") or {}
    if (
        initial_condition.get("enabled")
        and initial_condition.get("type") == "earthquake_okada"
        and finite_fault.get("available")
        and finite_fault.get("url")
        and finite_fault.get("selection") == "unconfirmed"
    ):
        return {
            "level": "warning",
            "code": "FINITE_FAULT_SOURCE_CHOICE_REQUIRED",
            "message": (
                "A downloadable USGS finite-fault solution is available for this earthquake. "
                "Choose whether to use the finite-fault subfault solution for etaInitCond.txt or the simplified single-rectangle average source."
            ),
            "details": {
                "event_id": finite_fault.get("event_id"),
                "product_code": finite_fault.get("product_code"),
                "url": finite_fault.get("url"),
                "subfault_count": finite_fault.get("subfault_count"),
                "maximum_slip_m": finite_fault.get("maximum_slip_m"),
            },
        }
    return None
