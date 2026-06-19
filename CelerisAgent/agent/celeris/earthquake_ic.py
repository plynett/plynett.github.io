from __future__ import annotations

import json
import math
from io import StringIO
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image
from scipy.interpolate import RegularGridInterpolator

from agent.celeris.okada import okada_available, okada_finite_fault_surface, okada_rectangular_surface
from agent.dem.export import artifact
from agent.io_utils import write_json


def generate_earthquake_initial_condition(
    job_dir: Path,
    model: dict[str, Any],
    domain_georeferencing: dict[str, Any],
    initial_condition: dict[str, Any],
) -> dict[str, Any]:
    selected_path = ["earthquake_initial_condition", "resolve_fault_parameters"]
    if not initial_condition.get("enabled") or initial_condition.get("type") != "earthquake_okada":
        return {"status": "skipped", "selected_path": selected_path, "artifacts": [], "checks": [], "initial_condition": None}

    params, parameter_checks = normalize_fault_parameters(initial_condition, model, domain_georeferencing)
    selected_path.append("map_fault_center_to_model_grid")
    if initial_condition.get("source_model") == "usgs_finite_fault":
        eta, source_summary, source_checks, source_path = finite_fault_initial_surface(job_dir, model, domain_georeferencing, initial_condition, params)
        checks = [*parameter_checks, *source_checks]
        selected_path.extend(source_path)
        if source_summary.get("source_model") == "usgs_finite_fault_surface_deformation":
            model_name = "usgs_finite_fault_surface_deformation"
            model_note = (
                "USGS finite-fault surface_deformation.disp vertical displacement interpolated to the final CELERIS model grid."
            )
        else:
            model_name = source_summary.get("source_model") or "usgs_finite_fault"
            if model_name == "okada_wrapper_finite_fault":
                model_note = (
                    "Fallback finite-fault source: USGS FFM.geojson subfaults were evaluated with Okada DC3D on a finite-fault-resolution "
                    "source grid and interpolated to the final CELERIS model grid."
                )
            else:
                model_note = "USGS finite-fault initial condition source."
    else:
        checks = [*parameter_checks]
        try:
            eta, okada_summary = okada_single_rectangle_initial_surface(model, params)
            source_summary = {"source_model": "okada_wrapper_single_rectangle", "okada": okada_summary}
            selected_path.append("compute_okada_dc3d_single_rectangle")
            checks.append(
                {
                    "level": "info",
                    "code": "OKADA_SINGLE_RECTANGLE_USED",
                    "message": "Single-rectangle earthquake source was evaluated with Okada DC3D.",
                    "details": okada_summary,
                }
            )
            model_name = "okada_wrapper_single_rectangle"
            model_note = "Single-rectangle earthquake source evaluated with Okada DC3D."
        except Exception as exc:
            selected_path.append("okada_dc3d_single_rectangle_unavailable")
            checks.append(
                {
                    "level": "error",
                    "code": "OKADA_SINGLE_RECTANGLE_UNAVAILABLE",
                    "message": "Okada DC3D single-rectangle source could not be used; no synthetic fallback initial condition is available.",
                    "details": {"error": str(exc), "okada_available": okada_available()},
                }
            )
            return {
                "status": "failed",
                "selected_path": selected_path,
                "artifacts": [],
                "checks": checks,
                "initial_condition": None,
            }
    checks.extend(validate_eta(eta, model))
    if any(check["level"] == "error" for check in checks):
        return {
            "status": "failed",
            "selected_path": selected_path,
            "artifacts": [],
            "checks": checks,
            "initial_condition": None,
        }

    out_dir = job_dir / "outputs"
    out_dir.mkdir(parents=True, exist_ok=True)
    eta_path = out_dir / "etaInitCond.txt"
    np.savetxt(eta_path, eta, fmt="%.8e")
    selected_path.append("write_eta_initial_condition_txt")

    preview_path = out_dir / "earthquake_ic_preview.png"
    write_preview(eta, preview_path)
    selected_path.append("write_earthquake_ic_preview")

    manifest = {
        "schema_version": "0.1.0",
        "filename": "etaInitCond.txt",
        "model": model_name,
        "model_note": model_note,
        "parameters": params,
        "source_summary": source_summary,
        "summary": eta_summary(eta),
        "format": {
            "rows": int(eta.shape[0]),
            "columns": int(eta.shape[1]),
            "row_order": "same as bathy.txt",
            "units": "meters",
        },
        "domain_georeferencing": domain_georeferencing,
        "validation": {"checks": checks},
    }
    manifest_path = out_dir / "earthquake_ic_manifest.json"
    write_json(manifest_path, manifest)
    selected_path.append("write_earthquake_ic_manifest")

    checks.append(
        {
            "level": "info",
            "code": "EARTHQUAKE_INITIAL_CONDITION_WRITTEN",
            "message": (
                f"Earthquake initial free-surface file etaInitCond.txt was generated "
                f"({eta.shape[0]} rows by {eta.shape[1]} columns)."
            ),
            "details": eta_summary(eta),
        }
    )
    return {
        "status": "completed",
        "selected_path": selected_path,
        "artifacts": [
            artifact(job_dir, eta_path, "celeris_eta_initial_condition", "CELERIS initial free-surface file"),
            artifact(job_dir, preview_path, "earthquake_ic_preview_png", "Earthquake initial condition preview"),
            artifact(job_dir, manifest_path, "earthquake_ic_manifest", "Earthquake initial condition manifest"),
        ],
        "checks": checks,
        "initial_condition": manifest,
    }


def normalize_fault_parameters(initial_condition: dict[str, Any], model: dict[str, Any], domain_georeferencing: dict[str, Any]) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    checks: list[dict[str, Any]] = []
    strike = initial_condition.get("strike_deg")
    if strike is None:
        strike = 0.0
        checks.append(
            {
                "level": "warning",
                "code": "EARTHQUAKE_STRIKE_DEFAULTED",
                "message": "Earthquake initial condition used strike=0 degrees because no strike was provided.",
                "details": {},
            }
        )
    center = fault_center_local(initial_condition, model, domain_georeferencing)
    params = {
        "event_name": initial_condition.get("event_name"),
        "center_lon": initial_condition.get("center_lon"),
        "center_lat": initial_condition.get("center_lat"),
        "center_x_m": center["x"],
        "center_y_m": center["y"],
        "center_source": center["source"],
        "coordinate_reference": initial_condition.get("coordinate_reference") or "centroid",
        "depth_km": float(initial_condition.get("depth_km") or 15.0),
        "strike_deg": float(strike) % 360.0,
        "dip_deg": float(initial_condition.get("dip_deg") or 10.0),
        "rake_deg": float(initial_condition.get("rake_deg") or 90.0),
        "length_km": float(initial_condition.get("length_km") or 400.0),
        "width_km": float(initial_condition.get("width_km") or 150.0),
        "slip_m": float(initial_condition.get("slip_m") or 10.0),
        "magnitude_mw": initial_condition.get("magnitude_mw"),
        "rigidity_pa": float(initial_condition.get("rigidity_pa") or 30_000_000_000.0),
        "poisson_ratio": float(initial_condition.get("poisson_ratio") or 0.25),
        "notes": initial_condition.get("notes") or [],
    }
    for key in ("depth_km", "dip_deg", "length_km", "width_km", "slip_m", "rigidity_pa"):
        if params[key] <= 0:
            checks.append({"level": "error", "code": "INVALID_EARTHQUAKE_PARAMETER", "message": f"{key} must be positive.", "details": {key: params[key]}})
    if not (0.0 < params["dip_deg"] < 90.0):
        checks.append({"level": "error", "code": "INVALID_EARTHQUAKE_DIP", "message": "dip_deg must be between 0 and 90 degrees.", "details": {"dip_deg": params["dip_deg"]}})
    if not (0.0 <= params["poisson_ratio"] < 0.5):
        checks.append({"level": "error", "code": "INVALID_POISSON_RATIO", "message": "poisson_ratio must be in [0, 0.5).", "details": {"poisson_ratio": params["poisson_ratio"]}})
    return params, checks


def fault_center_local(initial_condition: dict[str, Any], model: dict[str, Any], domain_georeferencing: dict[str, Any]) -> dict[str, Any]:
    lon = initial_condition.get("center_lon")
    lat = initial_condition.get("center_lat")
    if lon is not None and lat is not None:
        return lon_lat_to_model_xy(float(lon), float(lat), model, domain_georeferencing)
    return {
        "x": 0.5 * (float(model["x_min"]) + float(model["x_max"])),
        "y": 0.5 * (float(model["y_min"]) + float(model["y_max"])),
        "source": "domain_center",
    }


def lon_lat_to_model_xy(lon: float, lat: float, model: dict[str, Any], domain_georeferencing: dict[str, Any]) -> dict[str, Any]:
    if lon is not None and lat is not None and model.get("lon") is not None and model.get("lat") is not None:
        lon_axis = np.asarray(model["lon"], dtype=np.float64)
        lat_axis = np.asarray(model["lat"], dtype=np.float64)
        if lon_axis.ndim == 1 and lat_axis.ndim == 1 and lon_axis.size >= 2 and lat_axis.size >= 2:
            x = float(np.interp(float(lon), lon_axis, np.asarray(model["x"], dtype=np.float64)))
            y = float(np.interp(float(lat), lat_axis, np.asarray(model["y"], dtype=np.float64)))
            inside = (
                min(float(lon_axis[0]), float(lon_axis[-1])) <= float(lon) <= max(float(lon_axis[0]), float(lon_axis[-1]))
                and min(float(lat_axis[0]), float(lat_axis[-1])) <= float(lat) <= max(float(lat_axis[0]), float(lat_axis[-1]))
            )
            return {"x": x, "y": y, "source": "usgs_lon_lat_mapped_to_model_lon_lat_axes", "inside_domain": inside}
    bbox = domain_georeferencing.get("bbox_wgs84") if domain_georeferencing.get("status") == "ok" else None
    if lon is not None and lat is not None and isinstance(bbox, list) and len(bbox) == 4:
        min_lon, min_lat, max_lon, max_lat = [float(value) for value in bbox]
        lon_span = max(max_lon - min_lon, 1e-12)
        lat_span = max(max_lat - min_lat, 1e-12)
        x = float(model["x_min"]) + (float(lon) - min_lon) / lon_span * (float(model["x_max"]) - float(model["x_min"]))
        y = float(model["y_min"]) + (float(lat) - min_lat) / lat_span * (float(model["y_max"]) - float(model["y_min"]))
        return {"x": x, "y": y, "source": "lon_lat_mapped_to_domain"}
    return {
        "x": 0.5 * (float(model["x_min"]) + float(model["x_max"])),
        "y": 0.5 * (float(model["y_min"]) + float(model["y_max"])),
        "source": "domain_center",
    }


def okada_single_rectangle_initial_surface(model: dict[str, Any], params: dict[str, Any]) -> tuple[np.ndarray, dict[str, Any]]:
    x = np.asarray(model["x"], dtype=np.float64)
    y = np.asarray(model["y"], dtype=np.float64)
    xx, yy = np.meshgrid(x, y, indexing="xy")
    return okada_rectangular_surface(xx, yy, params)


def finite_fault_initial_surface(
    job_dir: Path,
    model: dict[str, Any],
    domain_georeferencing: dict[str, Any],
    initial_condition: dict[str, Any],
    base_params: dict[str, Any],
) -> tuple[np.ndarray, dict[str, Any], list[dict[str, Any]], list[str]]:
    selected_path = ["download_usgs_ffm_geojson", "compute_usgs_finite_fault_source_grid"]
    finite_fault = initial_condition.get("finite_fault") or {}
    url = finite_fault.get("url")
    if not url:
        return np.zeros_like(np.asarray(model["z"], dtype=np.float64)), {}, [finite_fault_error("MISSING_FFM_URL", "USGS finite-fault generation was requested, but no FFM.geojson URL is available.")], selected_path

    cache_dir = job_dir / "work" / "usgs_finite_fault"
    cache_dir.mkdir(parents=True, exist_ok=True)
    cache_path = cache_dir / "FFM.geojson"
    if not cache_path.exists():
        import requests

        response = requests.get(url, timeout=60)
        response.raise_for_status()
        cache_path.write_bytes(response.content)
    data = json.loads(cache_path.read_text(encoding="utf-8"))
    features = data.get("features") or []
    surface_url = finite_fault.get("surface_deformation_url") or infer_surface_deformation_url(url)
    if surface_url:
        try:
            eta, source_summary, source_checks, source_path = finite_fault_surface_deformation_initial_surface(
                job_dir,
                model,
                domain_georeferencing,
                surface_url,
                url,
                finite_fault,
            )
            return eta, source_summary, source_checks, [*selected_path, *source_path]
        except Exception as exc:
            selected_path.append("surface_deformation_unavailable")
            surface_deformation_error = {
                "level": "warning",
                "code": "USGS_SURFACE_DEFORMATION_UNAVAILABLE",
                "message": f"USGS surface_deformation.disp could not be used, so Okada DC3D finite-fault evaluation is required: {exc}",
                "details": {"surface_deformation_url": surface_url},
            }
    else:
        surface_deformation_error = None

    source_model = finite_fault_source_grid(model, domain_georeferencing, finite_fault)
    if not okada_available():
        selected_path.append("okada_dc3d_finite_fault_unavailable")
        checks = [surface_deformation_error] if surface_deformation_error else []
        checks.append(
            finite_fault_error(
                "OKADA_FINITE_FAULT_UNAVAILABLE",
                "USGS surface_deformation.disp could not be used and okada-wrapper is not installed; no synthetic finite-fault fallback initial condition is available.",
            )
        )
        return np.zeros_like(np.asarray(model["z"], dtype=np.float64)), {}, checks, selected_path

    try:
        source_lon, source_lat = model_lon_lat_mesh(source_model, domain_georeferencing)
        eta_source, okada_summary = okada_finite_fault_surface(
            features,
            source_lon,
            source_lat,
            poisson_ratio=float(base_params.get("poisson_ratio") or 0.25),
        )
        eta = interpolate_eta_to_model_grid(eta_source, source_model, model)
        checks = [surface_deformation_error] if surface_deformation_error else []
        checks.append(
            {
                "level": "info",
                "code": "OKADA_FINITE_FAULT_USED",
                "message": "USGS FFM.geojson subfaults were evaluated with Okada DC3D and interpolated to etaInitCond.txt.",
                "details": {
                    "source_url": url,
                    "cache_path": str(cache_path),
                    "source_grid": finite_fault_source_grid_summary(source_model),
                    "target_grid": {"rows": int(np.asarray(model["z"]).shape[0]), "columns": int(np.asarray(model["z"]).shape[1]), "dx_m": float(model["dx"]), "dy_m": float(model["dy"])},
                    "okada": okada_summary,
                    "source_eta_summary": eta_summary(eta_source),
                },
            }
        )
        summary = {
            "source_model": "okada_wrapper_finite_fault",
            "source_url": url,
            "cache_path": str(cache_path.relative_to(job_dir)),
            "event_id": finite_fault.get("event_id"),
            "product_code": finite_fault.get("product_code"),
            "review_status": finite_fault.get("review_status"),
            "source_grid": finite_fault_source_grid_summary(source_model),
            "target_grid": {"rows": int(np.asarray(model["z"]).shape[0]), "columns": int(np.asarray(model["z"]).shape[1]), "dx_m": float(model["dx"]), "dy_m": float(model["dy"])},
            "okada": okada_summary,
            "source_eta_summary": eta_summary(eta_source),
            "interpolation": "Okada DC3D finite-fault source grid to final CELERIS model grid with nearest-neighbor fill for any non-finite edge cells",
        }
        selected_path.extend(["compute_okada_dc3d_finite_fault_source_grid", "interpolate_finite_fault_surface_to_model_grid"])
        return eta, summary, checks, selected_path
    except Exception as exc:
        selected_path.append("okada_dc3d_finite_fault_failed")
        checks = [surface_deformation_error] if surface_deformation_error else []
        checks.append(
            finite_fault_error(
                "OKADA_FINITE_FAULT_FAILED",
                f"USGS surface_deformation.disp could not be used and Okada DC3D finite-fault evaluation failed; no synthetic finite-fault fallback initial condition is available: {exc}",
            )
        )
        return np.zeros_like(np.asarray(model["z"], dtype=np.float64)), {}, checks, selected_path


def finite_fault_surface_deformation_initial_surface(
    job_dir: Path,
    model: dict[str, Any],
    domain_georeferencing: dict[str, Any],
    surface_url: str,
    ffm_url: str,
    finite_fault: dict[str, Any],
) -> tuple[np.ndarray, dict[str, Any], list[dict[str, Any]], list[str]]:
    selected_path = ["download_usgs_surface_deformation", "interpolate_usgs_surface_deformation_to_model_grid"]
    cache_dir = job_dir / "work" / "usgs_finite_fault"
    cache_dir.mkdir(parents=True, exist_ok=True)
    cache_path = cache_dir / "surface_deformation.disp"
    if not cache_path.exists():
        import requests

        response = requests.get(surface_url, timeout=60)
        response.raise_for_status()
        cache_path.write_bytes(response.content)
    source = load_surface_deformation_grid(cache_path)
    eta = interpolate_surface_deformation_to_model(source, model, domain_georeferencing)
    source_summary = {
        "source_model": "usgs_finite_fault_surface_deformation",
        "source_url": ffm_url,
        "surface_deformation_url": surface_url,
        "surface_deformation_cache_path": str(cache_path.relative_to(job_dir)),
        "event_id": finite_fault.get("event_id"),
        "product_code": finite_fault.get("product_code"),
        "review_status": finite_fault.get("review_status"),
        "source_grid": source["summary"],
        "target_grid": {"rows": int(np.asarray(model["z"]).shape[0]), "columns": int(np.asarray(model["z"]).shape[1]), "dx_m": float(model["dx"]), "dy_m": float(model["dy"])},
        "interpolation": "USGS surface_deformation.disp vertical displacement interpolated to final CELERIS model grid with nearest-neighbor fill for any non-finite edge cells",
    }
    checks = [
        {
            "level": "info",
            "code": "USGS_SURFACE_DEFORMATION_USED",
            "message": "USGS finite-fault surface_deformation.disp vertical displacement was used to generate etaInitCond.txt.",
            "details": {
                "surface_deformation_url": surface_url,
                "cache_path": str(cache_path),
                "source_grid": source["summary"],
                "target_grid": source_summary["target_grid"],
                "source_vertical_displacement_range_m": {
                    "min_m": source["summary"]["vertical_min_m"],
                    "max_m": source["summary"]["vertical_max_m"],
                    "max_abs_m": source["summary"]["vertical_max_abs_m"],
                },
            },
        }
    ]
    return eta, source_summary, checks, selected_path


def infer_surface_deformation_url(ffm_url: str | None) -> str | None:
    if not ffm_url or not ffm_url.endswith("/FFM.geojson"):
        return None
    return ffm_url[: -len("FFM.geojson")] + "surface_deformation.disp"


def load_surface_deformation_grid(path: Path) -> dict[str, Any]:
    lines = [line for line in path.read_text(encoding="utf-8").splitlines() if line.strip() and not line.lstrip().startswith("#")]
    data = np.loadtxt(StringIO("\n".join(lines)))
    if data.ndim != 2 or data.shape[1] < 6:
        raise ValueError("surface_deformation.disp did not contain at least six numeric columns.")
    lon = np.unique(data[:, 0])
    lat = np.unique(data[:, 1])
    lon.sort()
    lat.sort()
    vertical = np.full((lat.size, lon.size), np.nan, dtype=np.float64)
    lon_index = {float(value): index for index, value in enumerate(lon)}
    lat_index = {float(value): index for index, value in enumerate(lat)}
    for row in data:
        vertical[lat_index[float(row[1])], lon_index[float(row[0])]] = float(row[5])
    if not np.isfinite(vertical).any():
        raise ValueError("surface_deformation.disp vertical displacement column contained no finite values.")
    if not np.isfinite(vertical).all():
        vertical = fill_nan_nearest(vertical)
    return {
        "lon": lon,
        "lat": lat,
        "vertical": vertical,
        "summary": {
            "rows": int(lat.size),
            "columns": int(lon.size),
            "lon_min": float(lon[0]),
            "lon_max": float(lon[-1]),
            "lat_min": float(lat[0]),
            "lat_max": float(lat[-1]),
            "lon_spacing_deg": float(np.nanmedian(np.diff(lon))) if lon.size > 1 else None,
            "lat_spacing_deg": float(np.nanmedian(np.diff(lat))) if lat.size > 1 else None,
            "vertical_min_m": float(np.nanmin(vertical)),
            "vertical_max_m": float(np.nanmax(vertical)),
            "vertical_max_abs_m": float(np.nanmax(np.abs(vertical))),
            "source_grid_type": "usgs_surface_deformation_disp",
        },
    }


def interpolate_surface_deformation_to_model(source: dict[str, Any], model: dict[str, Any], domain_georeferencing: dict[str, Any]) -> np.ndarray:
    target_lon, target_lat = model_lon_lat_mesh(model, domain_georeferencing)
    interpolator = RegularGridInterpolator(
        (np.asarray(source["lat"], dtype=np.float64), np.asarray(source["lon"], dtype=np.float64)),
        np.asarray(source["vertical"], dtype=np.float64),
        bounds_error=False,
        fill_value=np.nan,
    )
    eta = interpolator(np.column_stack([target_lat.ravel(), target_lon.ravel()])).reshape(target_lon.shape)
    if np.isfinite(eta).all():
        return eta
    return fill_nan_nearest(eta)


def model_lon_lat_mesh(model: dict[str, Any], domain_georeferencing: dict[str, Any]) -> tuple[np.ndarray, np.ndarray]:
    if model.get("lon") is not None and model.get("lat") is not None:
        lon_axis = np.asarray(model["lon"], dtype=np.float64)
        lat_axis = np.asarray(model["lat"], dtype=np.float64)
    else:
        bbox = domain_georeferencing.get("bbox_wgs84") if domain_georeferencing.get("status") == "ok" else None
        if not isinstance(bbox, list) or len(bbox) != 4:
            raise ValueError("Cannot interpolate surface_deformation.disp without model lon/lat axes or a WGS84 domain bbox.")
        lon_axis = np.interp(np.asarray(model["x"], dtype=np.float64), [float(model["x_min"]), float(model["x_max"])], [float(bbox[0]), float(bbox[2])])
        lat_axis = np.interp(np.asarray(model["y"], dtype=np.float64), [float(model["y_min"]), float(model["y_max"])], [float(bbox[1]), float(bbox[3])])
    return np.meshgrid(lon_axis, lat_axis, indexing="xy")


def fill_nan_nearest(values: np.ndarray) -> np.ndarray:
    filled = np.asarray(values, dtype=np.float64).copy()
    missing = ~np.isfinite(filled)
    if not missing.any():
        return filled
    if not np.isfinite(filled).any():
        return np.zeros_like(filled, dtype=np.float64)
    from scipy import ndimage

    nearest_index = ndimage.distance_transform_edt(missing, return_distances=False, return_indices=True)
    filled[missing] = filled[tuple(nearest_index)][missing]
    return filled


def finite_fault_source_grid(model: dict[str, Any], domain_georeferencing: dict[str, Any], finite_fault: dict[str, Any]) -> dict[str, Any]:
    dx = finite_fault_grid_spacing_m(finite_fault.get("subfault_length_km"), model.get("dx"))
    dy = finite_fault_grid_spacing_m(finite_fault.get("subfault_width_km"), model.get("dy"))
    x = np.arange(float(model["x_min"]), float(model["x_max"]) + dx * 0.25, dx, dtype=np.float64)
    y = np.arange(float(model["y_min"]), float(model["y_max"]) + dy * 0.25, dy, dtype=np.float64)
    if x.size < 2:
        x = np.asarray([float(model["x_min"]), float(model["x_max"])], dtype=np.float64)
    if y.size < 2:
        y = np.asarray([float(model["y_min"]), float(model["y_max"])], dtype=np.float64)
    source_model = {
        "z": np.zeros((y.size, x.size), dtype=np.float64),
        "x": x,
        "y": y,
        "WIDTH": int(x.size),
        "HEIGHT": int(y.size),
        "dx": float(np.nanmean(np.diff(x))),
        "dy": float(np.nanmean(np.diff(y))),
        "x_min": float(x[0]),
        "x_max": float(x[-1]),
        "y_min": float(y[0]),
        "y_max": float(y[-1]),
        "source_grid_type": "usgs_finite_fault_subfault_spacing",
    }
    if model.get("lon") is not None and model.get("lat") is not None:
        source_model["lon"] = np.interp(x, np.asarray(model["x"], dtype=np.float64), np.asarray(model["lon"], dtype=np.float64))
        source_model["lat"] = np.interp(y, np.asarray(model["y"], dtype=np.float64), np.asarray(model["lat"], dtype=np.float64))
    elif domain_georeferencing.get("status") == "ok" and isinstance(domain_georeferencing.get("bbox_wgs84"), list):
        source_model["bbox_wgs84"] = domain_georeferencing.get("bbox_wgs84")
    return source_model


def finite_fault_grid_spacing_m(value_km: Any, fallback_m: Any) -> float:
    try:
        value = float(value_km) * 1000.0
    except (TypeError, ValueError):
        value = 0.0
    if value > 0.0:
        return value
    try:
        fallback = float(fallback_m)
    except (TypeError, ValueError):
        fallback = 1000.0
    return max(fallback, 1000.0)


def interpolate_eta_to_model_grid(eta_source: np.ndarray, source_model: dict[str, Any], model: dict[str, Any]) -> np.ndarray:
    interpolator = RegularGridInterpolator(
        (np.asarray(source_model["y"], dtype=np.float64), np.asarray(source_model["x"], dtype=np.float64)),
        np.asarray(eta_source, dtype=np.float64),
        bounds_error=False,
        fill_value=np.nan,
    )
    yy, xx = np.meshgrid(np.asarray(model["y"], dtype=np.float64), np.asarray(model["x"], dtype=np.float64), indexing="ij")
    eta = interpolator(np.column_stack([yy.ravel(), xx.ravel()])).reshape(yy.shape)
    if np.isfinite(eta).all():
        return eta
    if not np.isfinite(eta).any():
        return np.zeros_like(eta, dtype=np.float64)
    from scipy import ndimage

    missing = ~np.isfinite(eta)
    nearest_index = ndimage.distance_transform_edt(missing, return_distances=False, return_indices=True)
    eta[missing] = eta[tuple(nearest_index)][missing]
    return eta


def finite_fault_source_grid_summary(source_model: dict[str, Any]) -> dict[str, Any]:
    return {
        "rows": int(source_model["HEIGHT"]),
        "columns": int(source_model["WIDTH"]),
        "dx_m": float(source_model["dx"]),
        "dy_m": float(source_model["dy"]),
        "x_min_m": float(source_model["x_min"]),
        "x_max_m": float(source_model["x_max"]),
        "y_min_m": float(source_model["y_min"]),
        "y_max_m": float(source_model["y_max"]),
        "source_grid_type": source_model.get("source_grid_type"),
    }


def finite_fault_error(code: str, message: str) -> dict[str, Any]:
    return {"level": "error", "code": code, "message": message, "details": {}}


def validate_eta(eta: np.ndarray, model: dict[str, Any]) -> list[dict[str, Any]]:
    checks: list[dict[str, Any]] = []
    if eta.shape != np.asarray(model["z"]).shape:
        checks.append(
            {
                "level": "error",
                "code": "EARTHQUAKE_IC_SHAPE_MISMATCH",
                "message": "etaInitCond.txt shape does not match the CELERIS model grid.",
                "details": {"eta_shape": list(eta.shape), "model_shape": list(np.asarray(model["z"]).shape)},
            }
        )
    if not np.isfinite(eta).all():
        checks.append({"level": "error", "code": "EARTHQUAKE_IC_HAS_NAN", "message": "Earthquake initial condition contains non-finite values.", "details": {}})
    return checks


def eta_summary(eta: np.ndarray) -> dict[str, Any]:
    return {
        "shape": [int(eta.shape[0]), int(eta.shape[1])],
        "min_m": float(np.nanmin(eta)),
        "max_m": float(np.nanmax(eta)),
        "mean_m": float(np.nanmean(eta)),
        "max_abs_m": float(np.nanmax(np.abs(eta))),
    }


def write_preview(eta: np.ndarray, path: Path) -> None:
    max_abs = float(np.nanmax(np.abs(eta))) if eta.size else 0.0
    if not np.isfinite(max_abs) or max_abs <= 0.0:
        data = np.zeros((*eta.shape, 3), dtype=np.uint8)
    else:
        scaled = np.clip(eta / max_abs, -1.0, 1.0)
        red = np.clip(scaled, 0.0, 1.0)
        blue = np.clip(-scaled, 0.0, 1.0)
        neutral = 1.0 - np.abs(scaled)
        data = np.stack(
            [
                255.0 * (0.92 * red + 0.95 * neutral),
                255.0 * (0.22 * red + 0.95 * neutral + 0.28 * blue),
                255.0 * (0.95 * blue + 0.95 * neutral),
            ],
            axis=2,
        ).astype(np.uint8)
    Image.fromarray(data).save(path)
