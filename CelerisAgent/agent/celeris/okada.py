from __future__ import annotations

import math
from typing import Any

import numpy as np


def okada_available() -> bool:
    try:
        import okada_wrapper  # noqa: F401

        return True
    except Exception:
        return False


def okada_finite_fault_surface(
    features: list[dict[str, Any]],
    target_lon: np.ndarray,
    target_lat: np.ndarray,
    poisson_ratio: float = 0.25,
) -> tuple[np.ndarray, dict[str, Any]]:
    from okada_wrapper import dc3dwrapper

    target_lon = np.asarray(target_lon, dtype=np.float64)
    target_lat = np.asarray(target_lat, dtype=np.float64)
    if target_lon.shape != target_lat.shape:
        raise ValueError("target_lon and target_lat must have the same shape.")
    lon0 = float(np.nanmean(target_lon))
    lat0 = float(np.nanmean(target_lat))
    x_obs, y_obs = lon_lat_to_local_meters(target_lon, target_lat, lon0, lat0)
    obs = np.column_stack([x_obs.ravel(), y_obs.ravel()])
    eta = np.zeros(obs.shape[0], dtype=np.float64)
    alpha = okada_alpha(poisson_ratio)
    used = 0
    skipped = 0
    slips: list[float] = []
    for feature in features:
        parsed = parse_okada_subfault(feature, lon0, lat0)
        if parsed is None:
            skipped += 1
            continue
        slip = parsed["slip_m"]
        rake = math.radians(parsed["rake_deg"])
        dislocation = np.asarray([slip * math.cos(rake), slip * math.sin(rake), 0.0], dtype=np.float64)
        strike_width = np.asarray([-0.5 * parsed["length_m"], 0.5 * parsed["length_m"]], dtype=np.float64)
        dip_width = np.asarray([-0.5 * parsed["width_m"], 0.5 * parsed["width_m"]], dtype=np.float64)
        rel = obs - parsed["origin_xy_m"]
        x_local = rel @ parsed["strike_unit"]
        y_local = rel @ parsed["okada_y_unit"]
        for index, (x_value, y_value) in enumerate(zip(x_local, y_local)):
            success, displacement, _grad = dc3dwrapper(
                alpha,
                np.asarray([x_value, y_value, 0.0], dtype=np.float64),
                parsed["origin_depth_m"],
                parsed["dip_deg"],
                strike_width,
                dip_width,
                dislocation,
            )
            if success == 0:
                eta[index] += displacement[2]
        used += 1
        slips.append(slip)
    eta = eta.reshape(target_lon.shape)
    return eta, {
        "model": "okada_wrapper_dc3d",
        "used_subfault_count": used,
        "skipped_subfault_count": skipped,
        "poisson_ratio": float(poisson_ratio),
        "alpha": alpha,
        "slip_min_m": min(slips) if slips else None,
        "slip_max_m": max(slips) if slips else None,
        "slip_mean_m": float(np.mean(slips)) if slips else None,
        "geometry_convention": (
            "subfault-centered Okada DC3D rectangles; x along top-edge strike, y opposite top-to-bottom "
            "horizontal polygon direction, positive dip-slip from FFM rake"
        ),
    }


def okada_rectangular_surface(
    target_x: np.ndarray,
    target_y: np.ndarray,
    params: dict[str, Any],
) -> tuple[np.ndarray, dict[str, Any]]:
    from okada_wrapper import dc3dwrapper

    target_x = np.asarray(target_x, dtype=np.float64)
    target_y = np.asarray(target_y, dtype=np.float64)
    if target_x.shape != target_y.shape:
        raise ValueError("target_x and target_y must have the same shape.")

    strike = math.radians(float(params["strike_deg"]))
    rake = math.radians(float(params["rake_deg"]))
    slip = float(params["slip_m"])
    strike_unit = np.asarray([math.sin(strike), math.cos(strike)], dtype=np.float64)
    dip_unit = np.asarray([math.cos(strike), -math.sin(strike)], dtype=np.float64)
    okada_y_unit = -dip_unit
    origin_xy = np.asarray([float(params["center_x_m"]), float(params["center_y_m"])], dtype=np.float64)
    strike_width = np.asarray([-0.5 * float(params["length_km"]) * 1000.0, 0.5 * float(params["length_km"]) * 1000.0], dtype=np.float64)
    dip_width = np.asarray([-0.5 * float(params["width_km"]) * 1000.0, 0.5 * float(params["width_km"]) * 1000.0], dtype=np.float64)
    dislocation = np.asarray([slip * math.cos(rake), slip * math.sin(rake), 0.0], dtype=np.float64)
    obs = np.column_stack([target_x.ravel(), target_y.ravel()])
    rel = obs - origin_xy
    x_local = rel @ strike_unit
    y_local = rel @ okada_y_unit
    eta = np.zeros(obs.shape[0], dtype=np.float64)
    alpha = okada_alpha(float(params.get("poisson_ratio") or 0.25))
    success_count = 0
    for index, (x_value, y_value) in enumerate(zip(x_local, y_local)):
        success, displacement, _grad = dc3dwrapper(
            alpha,
            np.asarray([x_value, y_value, 0.0], dtype=np.float64),
            float(params["depth_km"]) * 1000.0,
            float(params["dip_deg"]),
            strike_width,
            dip_width,
            dislocation,
        )
        if success == 0:
            eta[index] = displacement[2]
            success_count += 1
    eta = eta.reshape(target_x.shape)
    return eta, {
        "model": "okada_wrapper_dc3d_single_rectangle",
        "success_count": success_count,
        "point_count": int(eta.size),
        "poisson_ratio": float(params.get("poisson_ratio") or 0.25),
        "alpha": alpha,
        "geometry_convention": (
            "single rectangle centered on center_x_m/center_y_m/depth_km; x along strike, "
            "y opposite the right-hand dip direction; dip-slip from rake"
        ),
    }


def okada_alpha(poisson_ratio: float) -> float:
    nu = float(poisson_ratio)
    return 1.0 / (2.0 * (1.0 - nu))


def parse_okada_subfault(feature: dict[str, Any], lon0: float, lat0: float) -> dict[str, Any] | None:
    props = feature.get("properties") or {}
    slip = number_or_none(props.get("slip"))
    if slip is None or slip <= 0.0:
        return None
    rake = number_or_none(props.get("rake"))
    ring = (((feature.get("geometry") or {}).get("coordinates") or [[]])[0]) or []
    vertices = unique_polygon_vertices(ring)
    if len(vertices) < 4:
        return None
    local = [lon_lat_depth_to_local(vertex, lon0, lat0) for vertex in vertices]
    order = sorted(range(len(local)), key=lambda index: local[index][2])
    top = [local[order[0]], local[order[1]]]
    bottom = [local[order[2]], local[order[3]]]
    top_edge = top[1][:2] - top[0][:2]
    top_edge_length = float(np.linalg.norm(top_edge))
    if top_edge_length <= 0.0:
        return None
    strike_unit = top_edge / top_edge_length
    top_mid = 0.5 * (top[0] + top[1])
    bottom_mid = 0.5 * (bottom[0] + bottom[1])
    dip_horizontal = bottom_mid[:2] - top_mid[:2]
    dip_horizontal_length = float(np.linalg.norm(dip_horizontal))
    if dip_horizontal_length <= 0.0:
        return None
    dip_unit = dip_horizontal / dip_horizontal_length
    width_m = float(np.linalg.norm(bottom_mid - top_mid))
    if width_m <= 0.0:
        return None
    dip_deg = math.degrees(math.atan2(abs(float(bottom_mid[2] - top_mid[2])), dip_horizontal_length))
    origin_xy = top_mid[:2] + dip_unit * (0.5 * width_m * math.cos(math.radians(dip_deg)))
    origin_depth = float(top_mid[2] + 0.5 * width_m * math.sin(math.radians(dip_deg)))
    return {
        "origin_xy_m": origin_xy,
        "origin_depth_m": origin_depth,
        "strike_unit": strike_unit,
        "okada_y_unit": -dip_unit,
        "length_m": top_edge_length,
        "width_m": width_m,
        "dip_deg": dip_deg,
        "rake_deg": float(rake if rake is not None else 90.0),
        "slip_m": float(slip),
    }


def unique_polygon_vertices(ring: list[Any]) -> list[list[float]]:
    vertices: list[list[float]] = []
    for point in ring:
        if not isinstance(point, list) or len(point) < 2:
            continue
        candidate = [float(point[0]), float(point[1]), float(point[2]) if len(point) > 2 else 0.0]
        if not vertices or any(abs(candidate[index] - vertices[-1][index]) > 1e-10 for index in (0, 1, 2)):
            vertices.append(candidate)
    if len(vertices) > 1 and all(abs(vertices[0][index] - vertices[-1][index]) <= 1e-10 for index in (0, 1, 2)):
        vertices.pop()
    return vertices[:4]


def lon_lat_to_local_meters(lon: np.ndarray, lat: np.ndarray, lon0: float, lat0: float) -> tuple[np.ndarray, np.ndarray]:
    meters_per_lon = 111_320.0 * max(math.cos(math.radians(lat0)), 0.01)
    return (np.asarray(lon, dtype=np.float64) - lon0) * meters_per_lon, (np.asarray(lat, dtype=np.float64) - lat0) * 111_320.0


def lon_lat_depth_to_local(vertex: list[float], lon0: float, lat0: float) -> np.ndarray:
    x, y = lon_lat_to_local_meters(np.asarray(vertex[0]), np.asarray(vertex[1]), lon0, lat0)
    return np.asarray([float(x), float(y), float(vertex[2]) if len(vertex) > 2 else 0.0], dtype=np.float64)


def number_or_none(value: Any) -> float | None:
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None
