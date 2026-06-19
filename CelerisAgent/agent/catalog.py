from __future__ import annotations

from typing import Any

from agent.celeris.runtime_controls import registry_commands


def available_examples_text() -> str:
    examples = []
    for command in registry_commands():
        if command.get("namespace") == "examples" and command.get("action") == "run_example":
            examples = command.get("values") or []
            break
    if not examples:
        return "I do not have a built-in example catalog loaded."

    groups = {
        "Wind-wave coastal examples": [],
        "Tsunami and hot-start examples": [],
        "Tide examples": [],
        "Lab and toy examples": [],
    }
    for item in examples:
        label = str(item.get("label") or item.get("key") or "")
        lower = label.lower()
        if "tsunami" in lower or "hot start" in lower:
            groups["Tsunami and hot-start examples"].append(label)
        elif "tide" in lower:
            groups["Tide examples"].append(label)
        elif "osu" in lower or "toy" in lower or "basin" in lower or "experiment" in lower:
            groups["Lab and toy examples"].append(label)
        else:
            groups["Wind-wave coastal examples"].append(label)

    parts = ["Built-in CELERIS examples available:"]
    for title, labels in groups.items():
        if labels:
            parts.append(f"{title}: {', '.join(labels)}.")
    return " ".join(parts)


def available_runtime_controls_text() -> str:
    groups: dict[str, list[str]] = {}
    for command in registry_commands():
        panel = str(command.get("panel") or "Runtime controls")
        purpose = str(command.get("purpose") or f"{command.get('namespace')}.{command.get('action')}").strip()
        purpose = purpose.rstrip(".")
        groups.setdefault(panel, []).append(purpose)
    if not groups:
        return "I do not have a runtime control catalog loaded."
    parts = ["While a simulation is running, I can control these CELERIS features:"]
    for panel, purposes in groups.items():
        parts.append(f"{panel}: {'; '.join(purposes)}.")
    return " ".join(parts)


def current_state_text(state: dict[str, Any]) -> str:
    artifacts = state.get("artifacts") or []
    artifact_names = ", ".join(item.get("filename", "") for item in artifacts if item.get("filename")) or "none"
    dem = state.get("dem_request") or {}
    config = state.get("celeris_config") or {}
    run = state.get("celeris_run") or {}
    location = dem.get("location") or dem.get("center_description") or "none"
    waves = active_wave_state_text(state)
    example = active_example_state_text(state)
    sediment = active_sediment_state_text(state)
    timeseries = active_timeseries_state_text(state)
    runner = "active" if run.get("runner_url") else "not active"
    return (
        f"Current job state: workflow state is {state.get('workflow_state') or 'unknown'}. "
        f"{example}. "
        f"DEM target is {location}. {waves}. {sediment}. {timeseries}. "
        f"Embedded simulation runner is {runner}. Artifacts: {artifact_names}."
    )


def active_example_state_text(state: dict[str, Any]) -> str:
    runtime_example = ((state.get("runtime_state") or {}).get("example") or {})
    label = runtime_example.get("label")
    key = runtime_example.get("key")
    if label or key:
        return f"Active built-in example: {label or key}"
    layout = (state.get("celeris_run") or {}).get("layout") or {}
    label = layout.get("example_label")
    key = layout.get("example")
    if label or key:
        return f"Active built-in example: {label or key}"
    return "Active built-in example: none"


def active_wave_state_text(state: dict[str, Any]) -> str:
    runtime_boundary = ((state.get("runtime_state") or {}).get("boundary") or {})
    runtime_parts = []
    if runtime_boundary.get("incident_wave_type_label"):
        runtime_parts.append(f"type {runtime_boundary.get('incident_wave_type_label')}")
    if runtime_boundary.get("incident_wave_height_m") is not None:
        runtime_parts.append(f"H {format_number(runtime_boundary.get('incident_wave_height_m'))} m")
    if runtime_boundary.get("incident_wave_period_s") is not None:
        runtime_parts.append(f"T {format_number(runtime_boundary.get('incident_wave_period_s'))} s")
    if runtime_boundary.get("incident_wave_direction_deg") is not None:
        runtime_parts.append(f"direction {format_number(runtime_boundary.get('incident_wave_direction_deg'))} deg")
    if runtime_parts:
        return f"Active runtime incident waves: {', '.join(runtime_parts)}"

    config = state.get("celeris_config") or {}
    if config.get("wave_boundary") and config.get("Thetap") is not None:
        return (
            "Config-generation waves: "
            f"Hmo {format_number(config.get('Hmo'))} m, "
            f"Tp {format_number(config.get('Tp'))} s, "
            f"Thetap {format_number(config.get('Thetap'))} deg, "
            f"incoming at the {config.get('wave_boundary')} boundary"
        )
    return "CELERIS waves: wave direction not set"


def active_sediment_state_text(state: dict[str, Any]) -> str:
    sediment = ((state.get("runtime_state") or {}).get("sediment") or {})
    if not sediment:
        return "Sediment runtime settings: not set"
    parts = []
    if sediment.get("transport_model_label"):
        parts.append(f"transport {sediment.get('transport_model_label')}")
    if sediment.get("d50_mm") is not None:
        parts.append(f"D50 {format_number(sediment.get('d50_mm'))} mm")
    if sediment.get("porosity") is not None:
        parts.append(f"porosity {format_number(sediment.get('porosity'))}")
    if sediment.get("specific_gravity") is not None:
        parts.append(f"specific gravity {format_number(sediment.get('specific_gravity'))}")
    if sediment.get("erosion_psi") is not None:
        parts.append(f"psi {format_number(sediment.get('erosion_psi'))}")
    if sediment.get("critical_shields") is not None:
        parts.append(f"critical Shields {format_number(sediment.get('critical_shields'))}")
    if not parts:
        return "Sediment runtime settings: not set"
    return f"Active sediment settings: {', '.join(parts)}"


def active_timeseries_state_text(state: dict[str, Any]) -> str:
    timeseries = ((state.get("runtime_state") or {}).get("timeseries") or {})
    if not timeseries:
        return "Time series settings: not set"
    parts = []
    if timeseries.get("count") is not None:
        parts.append(f"count {format_number(timeseries.get('count'))}")
    if timeseries.get("duration_s") is not None:
        parts.append(f"duration {format_number(timeseries.get('duration_s'))} s")
    if timeseries.get("selected_location_index") is not None:
        parts.append(f"selected location {format_number(timeseries.get('selected_location_index'))}")
    if timeseries.get("placement_mode"):
        parts.append("placement mode right-click")
    locations = timeseries.get("locations") or {}
    for index, location in sorted(locations.items(), key=lambda item: str(item[0])):
        parts.append(
            f"location {index} x={format_number(location.get('x_m'))} m, y={format_number(location.get('y_m'))} m"
        )
    if not parts:
        return "Time series settings: not set"
    return f"Active time series settings: {', '.join(parts)}"


def format_number(value: Any) -> str:
    try:
        return f"{float(value):g}"
    except (TypeError, ValueError):
        return str(value)
