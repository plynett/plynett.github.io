from __future__ import annotations

import copy
import re
from typing import Any


BOUNDARY_TYPES = {
    0: "solid wall",
    1: "sponge layer",
    2: "waves loaded from waves.txt",
    3: "periodic boundary condition",
}

DEFAULT_CELERIS_CONFIG: dict[str, Any] = {
    "wave_direction_text": None,
    "wave_direction_degrees": None,
    "wave_boundary": None,
    "incident_wave_forcing": True,
    "Hmo": 2.0,
    "Tp": 15.0,
    "Thetap": None,
    "NLSW_or_Bous": 1,
    "dx": 2.0,
    "dy": 2.0,
    "Courant_num": 0.2,
    "isManning": 0,
    "friction": 0.0025,
    "g": 9.81,
    "Theta": 2.0,
    "dissipation_threshold": 0.3,
    "whiteWaterDecayRate": 0.02,
    "timeScheme": 2,
    "seaLevel": 0.0,
    "Bcoef": 0.06666667,
    "tridiag_solve": 2,
    "west_boundary_type": 0,
    "east_boundary_type": 0,
    "south_boundary_type": 0,
    "north_boundary_type": 0,
    "surfaceToPlot": 0,
    "colorMap_choice": 0,
    "colorVal_min": -1.0,
    "colorVal_max": 1.0,
    "showBreaking": 1,
    "GoogleMapOverlay": 0,
    "ShowArrows": 0,
    "arrow_scale": 1.0,
    "arrow_density": 1.0,
    "ShowLogos": 0,
    "viewType": 1,
}

BOUNDARY_BY_DIRECTION = {
    "west": ("west", 0.0),
    "southwest": ("west", 45.0),
    "south": ("south", 90.0),
    "southeast": ("south", 135.0),
    "east": ("east", 180.0),
    "northeast": ("east", 225.0),
    "north": ("north", 270.0),
    "northwest": ("north", 315.0),
}

DEFAULT_INITIAL_CONDITION: dict[str, Any] = {
    "type": "none",
    "enabled": False,
    "source_model": "single_rectangle",
    "event_name": None,
    "center_lon": None,
    "center_lat": None,
    "coordinate_reference": "centroid",
    "depth_km": 15.0,
    "strike_deg": None,
    "dip_deg": 10.0,
    "rake_deg": 90.0,
    "length_km": 400.0,
    "width_km": 150.0,
    "slip_m": 10.0,
    "magnitude_mw": None,
    "rigidity_pa": 30_000_000_000.0,
    "poisson_ratio": 0.25,
    "finite_fault": {
        "available": False,
        "selection": "not_available",
        "source": None,
        "url": None,
        "surface_deformation_url": None,
        "event_id": None,
        "product_code": None,
        "review_status": None,
        "subfault_count": None,
        "slip_count": None,
        "subfault_length_km": None,
        "subfault_width_km": None,
        "maximum_slip_m": None,
    },
    "notes": [],
}


def default_celeris_config() -> dict[str, Any]:
    config = dict(DEFAULT_CELERIS_CONFIG)
    config["initial_condition"] = copy.deepcopy(DEFAULT_INITIAL_CONDITION)
    return config


def celeris_config_schema() -> dict[str, Any]:
    number = {"type": ["number", "null"]}
    nullable_string = {"type": ["string", "null"]}
    integer = {"type": "integer"}
    finite_fault_schema = {
        "type": "object",
        "properties": {
            "available": {"type": "boolean"},
            "selection": {"type": "string", "enum": ["not_available", "unconfirmed", "finite_fault", "single_rectangle"]},
            "source": nullable_string,
            "url": nullable_string,
            "surface_deformation_url": nullable_string,
            "event_id": nullable_string,
            "product_code": nullable_string,
            "review_status": nullable_string,
            "subfault_count": {"type": ["integer", "null"]},
            "slip_count": {"type": ["integer", "null"]},
            "subfault_length_km": number,
            "subfault_width_km": number,
            "maximum_slip_m": number,
        },
        "required": list(DEFAULT_INITIAL_CONDITION["finite_fault"]),
        "additionalProperties": False,
    }
    initial_condition_schema = {
        "type": "object",
        "properties": {
            "type": {"type": "string", "enum": ["none", "earthquake_okada"]},
            "enabled": {"type": "boolean"},
            "source_model": {"type": "string", "enum": ["single_rectangle", "usgs_finite_fault"]},
            "event_name": {"type": ["string", "null"]},
            "center_lon": number,
            "center_lat": number,
            "coordinate_reference": {"type": "string", "enum": ["centroid", "epicenter", "hypocenter", "top_center", "domain_center"]},
            "depth_km": {"type": "number"},
            "strike_deg": number,
            "dip_deg": {"type": "number"},
            "rake_deg": {"type": "number"},
            "length_km": {"type": "number"},
            "width_km": {"type": "number"},
            "slip_m": {"type": "number"},
            "magnitude_mw": number,
            "rigidity_pa": {"type": "number"},
            "poisson_ratio": {"type": "number"},
            "finite_fault": finite_fault_schema,
            "notes": {"type": "array", "items": {"type": "string"}},
        },
        "required": list(DEFAULT_INITIAL_CONDITION),
        "additionalProperties": False,
    }
    return {
        "type": "object",
        "properties": {
            "wave_direction_text": {"type": ["string", "null"]},
            "wave_direction_degrees": number,
            "wave_boundary": {"type": ["string", "null"], "enum": ["west", "east", "south", "north", None]},
            "incident_wave_forcing": {"type": "boolean"},
            "Hmo": {"type": "number"},
            "Tp": {"type": "number"},
            "Thetap": number,
            "NLSW_or_Bous": integer,
            "dx": {"type": "number"},
            "dy": {"type": "number"},
            "Courant_num": {"type": "number"},
            "isManning": integer,
            "friction": {"type": "number"},
            "g": {"type": "number"},
            "Theta": {"type": "number"},
            "dissipation_threshold": {"type": "number"},
            "whiteWaterDecayRate": {"type": "number"},
            "timeScheme": integer,
            "seaLevel": {"type": "number"},
            "Bcoef": {"type": "number"},
            "tridiag_solve": integer,
            "west_boundary_type": integer,
            "east_boundary_type": integer,
            "south_boundary_type": integer,
            "north_boundary_type": integer,
            "surfaceToPlot": integer,
            "colorMap_choice": integer,
            "colorVal_min": {"type": "number"},
            "colorVal_max": {"type": "number"},
            "showBreaking": integer,
            "GoogleMapOverlay": integer,
            "ShowArrows": integer,
            "arrow_scale": {"type": "number"},
            "arrow_density": {"type": "number"},
            "ShowLogos": integer,
            "viewType": integer,
            "initial_condition": initial_condition_schema,
        },
        "required": [*list(DEFAULT_CELERIS_CONFIG), "initial_condition"],
        "additionalProperties": False,
    }


def merge_celeris_config(existing: dict[str, Any] | None, incoming: dict[str, Any] | None) -> dict[str, Any]:
    merged = default_celeris_config()
    merged.update(existing or {})
    merged["initial_condition"] = merge_initial_condition((existing or {}).get("initial_condition"), None)
    incoming = incoming or {}
    for key in DEFAULT_CELERIS_CONFIG:
        value = incoming.get(key)
        if value is not None:
            merged[key] = value
    if incoming.get("initial_condition"):
        merged["initial_condition"] = merge_initial_condition(merged.get("initial_condition"), incoming.get("initial_condition"))
    normalize_celeris_config(merged)
    return merged


def merge_initial_condition(existing: dict[str, Any] | None, incoming: dict[str, Any] | None) -> dict[str, Any]:
    merged = copy.deepcopy(DEFAULT_INITIAL_CONDITION)
    if isinstance(existing, dict):
        for key in DEFAULT_INITIAL_CONDITION:
            if existing.get(key) is not None:
                merged[key] = copy.deepcopy(existing[key])
    if isinstance(incoming, dict):
        for key in DEFAULT_INITIAL_CONDITION:
            if incoming.get(key) is not None:
                merged[key] = copy.deepcopy(incoming[key])
    if merged.get("enabled") and merged.get("type") == "none":
        merged["type"] = "earthquake_okada"
    if merged.get("type") == "earthquake_okada":
        merged["enabled"] = True
    merged["source_model"] = merged.get("source_model") if merged.get("source_model") in {"single_rectangle", "usgs_finite_fault"} else "single_rectangle"
    merged["finite_fault"] = merge_finite_fault_metadata(
        (existing or {}).get("finite_fault") if isinstance(existing, dict) else None,
        (incoming or {}).get("finite_fault") if isinstance(incoming, dict) else None,
    )
    if merged["source_model"] == "usgs_finite_fault" and merged["finite_fault"].get("available"):
        merged["finite_fault"]["selection"] = "finite_fault"
    elif merged["source_model"] == "single_rectangle" and merged["finite_fault"].get("selection") == "finite_fault":
        merged["finite_fault"]["selection"] = "single_rectangle"
    merged["notes"] = [str(item) for item in (merged.get("notes") or []) if item]
    return merged


def merge_finite_fault_metadata(existing: dict[str, Any] | None, incoming: dict[str, Any] | None) -> dict[str, Any]:
    merged = copy.deepcopy(DEFAULT_INITIAL_CONDITION["finite_fault"])
    for source in (existing, incoming):
        if not isinstance(source, dict):
            continue
        for key in merged:
            if source.get(key) is not None:
                merged[key] = copy.deepcopy(source[key])
    if not merged.get("available"):
        merged["available"] = False
        merged["selection"] = "not_available"
    elif merged.get("selection") not in {"unconfirmed", "finite_fault", "single_rectangle"}:
        merged["selection"] = "unconfirmed"
    for key in ("subfault_count", "slip_count"):
        if merged.get(key) is not None:
            merged[key] = int(merged[key])
    return merged


def infer_celeris_config(message: str, existing: dict[str, Any] | None = None) -> dict[str, Any]:
    cfg = default_celeris_config()
    cfg.update(existing or {})
    cfg["initial_condition"] = merge_initial_condition((existing or {}).get("initial_condition") if existing else None, None)
    lower = (message or "").lower()

    direction = infer_direction(lower)
    if direction:
        boundary, theta = BOUNDARY_BY_DIRECTION[direction]
        cfg["wave_direction_text"] = f"from the {direction}"
        cfg["wave_direction_degrees"] = theta
        cfg["Thetap"] = theta
        cfg["wave_boundary"] = boundary

    theta_from_text = infer_wave_direction_degrees(lower)
    if theta_from_text is not None:
        theta = theta_from_text % 360.0
        cfg["wave_direction_degrees"] = theta
        cfg["Thetap"] = theta
        cfg["wave_direction_text"] = f"{theta:g} degrees"
        cfg["wave_boundary"] = nearest_boundary(theta)

    for key, patterns in {
        "Hmo": [r"\bhmo\s*(?:=|is|of)?\s*(\d+(?:\.\d+)?)", r"wave height\s*(?:=|is|of)?\s*(\d+(?:\.\d+)?)"],
        "Tp": [r"\btp\s*(?:=|is|of)?\s*(\d+(?:\.\d+)?)", r"period\s*(?:=|is|of)?\s*(\d+(?:\.\d+)?)"],
        "dx": [r"\bdx\s*(?:=|is|of)?\s*(\d+(?:\.\d+)?)", r"(\d+(?:\.\d+)?)\s*m\s*grid"],
        "dy": [r"\bdy\s*(?:=|is|of)?\s*(\d+(?:\.\d+)?)"],
    }.items():
        for pattern in patterns:
            match = re.search(pattern, lower)
            if match:
                cfg[key] = float(match.group(1))
                break
    if "dy" not in incoming_keys(message) and re.search(r"(\d+(?:\.\d+)?)\s*m\s*grid", lower):
        cfg["dy"] = cfg["dx"]

    if "nlsw" in lower or "shallow water" in lower:
        cfg["NLSW_or_Bous"] = 0
    elif "fully nonlinear" in lower or "extended boussinesq" in lower:
        cfg["NLSW_or_Bous"] = 2
    elif "boussinesq" in lower:
        cfg["NLSW_or_Bous"] = 1

    if message_mentions_initial_condition(message):
        cfg["initial_condition"] = infer_initial_condition(message, cfg.get("initial_condition"))

    normalize_celeris_config(cfg)
    return cfg


def infer_initial_condition(message: str, existing: dict[str, Any] | None = None) -> dict[str, Any]:
    ic = merge_initial_condition(existing, {"enabled": True, "type": "earthquake_okada"})
    lower = (message or "").lower()
    for key, patterns in {
        "depth_km": [r"depth\s*(?:=|is|of)?\s*(\d+(?:\.\d+)?)\s*km"],
        "strike_deg": [r"strike\s*(?:=|is|of)?\s*(-?\d+(?:\.\d+)?)\s*(?:deg|degree|degrees)?"],
        "dip_deg": [r"dip\s*(?:=|is|of)?\s*(\d+(?:\.\d+)?)\s*(?:deg|degree|degrees)?"],
        "rake_deg": [r"rake\s*(?:=|is|of)?\s*(-?\d+(?:\.\d+)?)\s*(?:deg|degree|degrees)?"],
        "length_km": [r"length\s*(?:=|is|of)?\s*(\d+(?:\.\d+)?)\s*km"],
        "width_km": [r"width\s*(?:=|is|of)?\s*(\d+(?:\.\d+)?)\s*km"],
        "slip_m": [r"slip\s*(?:=|is|of)?\s*(\d+(?:\.\d+)?)\s*m"],
        "magnitude_mw": [r"\bmw\s*(?:=|is|of)?\s*(\d+(?:\.\d+)?)", r"magnitude\s*(?:=|is|of)?\s*(\d+(?:\.\d+)?)"],
    }.items():
        for pattern in patterns:
            match = re.search(pattern, lower)
            if match:
                ic[key] = float(match.group(1))
                break
    lon_lat = re.search(r"(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)", message)
    if lon_lat:
        first = float(lon_lat.group(1))
        second = float(lon_lat.group(2))
        if abs(first) <= 90 and abs(second) <= 180:
            ic["center_lat"] = first
            ic["center_lon"] = second
        else:
            ic["center_lon"] = first
            ic["center_lat"] = second
    return ic


def normalize_celeris_config(config: dict[str, Any]) -> None:
    config["initial_condition"] = merge_initial_condition(config.get("initial_condition"), None)
    config["incident_wave_forcing"] = bool(config.get("incident_wave_forcing", True))
    if config.get("Thetap") is None and config.get("wave_direction_degrees") is not None:
        config["Thetap"] = float(config["wave_direction_degrees"]) % 360.0
    if config.get("wave_direction_degrees") is None and config.get("Thetap") is not None:
        config["wave_direction_degrees"] = float(config["Thetap"]) % 360.0
    if not config.get("wave_boundary") and config.get("Thetap") is not None:
        config["wave_boundary"] = nearest_boundary(float(config["Thetap"]))

    for key in ("west_boundary_type", "east_boundary_type", "south_boundary_type", "north_boundary_type"):
        config[key] = int(config.get(key) or 0)
    boundary = config.get("wave_boundary")
    if config.get("incident_wave_forcing") and boundary in {"west", "east", "south", "north"}:
        for key in ("west_boundary_type", "east_boundary_type", "south_boundary_type", "north_boundary_type"):
            config[key] = 0
        config[f"{boundary}_boundary_type"] = 2
    if not config.get("incident_wave_forcing"):
        config["wave_boundary"] = None
        config["Thetap"] = None
        config["wave_direction_degrees"] = None
        config["wave_direction_text"] = "no incident wave forcing"
        for key in ("west_boundary_type", "east_boundary_type", "south_boundary_type", "north_boundary_type"):
            config[key] = 1

    if earthquake_initial_condition_enabled(config) and config.get("NLSW_or_Bous") == DEFAULT_CELERIS_CONFIG["NLSW_or_Bous"]:
        config["NLSW_or_Bous"] = 0
    if earthquake_initial_condition_enabled(config) and not has_incident_wave_forcing(config):
        for key in ("west_boundary_type", "east_boundary_type", "south_boundary_type", "north_boundary_type"):
            config[key] = 1

    for key in (
        "NLSW_or_Bous",
        "isManning",
        "timeScheme",
        "tridiag_solve",
        "surfaceToPlot",
        "colorMap_choice",
        "showBreaking",
        "GoogleMapOverlay",
        "ShowArrows",
        "ShowLogos",
        "viewType",
    ):
        config[key] = int(config[key])
    for key in (
        "Hmo",
        "Tp",
        "dx",
        "dy",
        "Courant_num",
        "friction",
        "g",
        "Theta",
        "dissipation_threshold",
        "whiteWaterDecayRate",
        "seaLevel",
        "Bcoef",
        "colorVal_min",
        "colorVal_max",
        "arrow_scale",
        "arrow_density",
    ):
        config[key] = float(config[key])
    if config.get("Thetap") is not None:
        config["Thetap"] = float(config["Thetap"]) % 360.0
    if config.get("wave_direction_degrees") is not None:
        config["wave_direction_degrees"] = float(config["wave_direction_degrees"]) % 360.0


def celeris_config_missing(config: dict[str, Any]) -> list[str]:
    if config.get("incident_wave_forcing") is False:
        return []
    if earthquake_initial_condition_enabled(config) and not has_incident_wave_forcing(config):
        return []
    if config.get("wave_boundary") not in {"west", "east", "south", "north"} or config.get("Thetap") is None:
        return ["wave direction"]
    return []


def earthquake_initial_condition_enabled(config: dict[str, Any]) -> bool:
    initial_condition = config.get("initial_condition") or {}
    return bool(initial_condition.get("enabled") and initial_condition.get("type") == "earthquake_okada")


def has_incident_wave_forcing(config: dict[str, Any]) -> bool:
    if config.get("incident_wave_forcing") is False:
        return False
    return config.get("wave_boundary") in {"west", "east", "south", "north"} and config.get("Thetap") is not None


def message_mentions_celeris_config(message: str) -> bool:
    lower = (message or "").lower()
    return any(
        phrase in lower
        for phrase in (
            "celeris input",
            "celeris config",
            "config.json",
            "bathy.txt",
            "waves.txt",
            "wave direction",
            "waves from",
            "generate config",
            "create inputs",
            "simulation inputs",
        )
    ) or message_mentions_initial_condition(message)


def message_mentions_initial_condition(message: str) -> bool:
    lower = (message or "").lower()
    return any(
        phrase in lower
        for phrase in (
            "earthquake initial condition",
            "initial free surface",
            "okada",
            "seafloor displacement",
            "tsunami initial",
            "eta initial",
            "etainitcond",
        )
    )


def infer_direction(lower: str) -> str | None:
    for direction in ("northwest", "northeast", "southwest", "southeast", "west", "east", "south", "north"):
        if re.search(rf"\bfrom\s+(?:the\s+)?{direction}\b", lower) or re.search(rf"\b{direction}\s+waves\b", lower):
            return direction
    return None


def infer_wave_direction_degrees(lower: str) -> float | None:
    for match in re.finditer(r"(?:wave[s]?|direction|thetap)(.{0,60}?)(-?\d+(?:\.\d+)?)\s*(?:deg|degree|degrees)", lower):
        context = match.group(1)
        if any(term in context for term in ("strike", "dip", "rake", "fault", "okada", "earthquake")):
            continue
        return float(match.group(2))
    return None


def nearest_boundary(theta: float) -> str:
    theta = theta % 360.0
    candidates = {"west": 0.0, "south": 90.0, "east": 180.0, "north": 270.0}
    return min(candidates, key=lambda name: angular_distance(theta, candidates[name]))


def angular_distance(a: float, b: float) -> float:
    return abs((a - b + 180.0) % 360.0 - 180.0)


def incoming_keys(message: str) -> set[str]:
    lower = (message or "").lower()
    keys = set()
    for key in ("dx", "dy"):
        if re.search(rf"\b{key}\b", lower):
            keys.add(key)
    return keys
