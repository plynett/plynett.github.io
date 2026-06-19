from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any


AGENT_ROOT = Path(__file__).resolve().parents[2]
REPO_ROOT = Path(__file__).resolve().parents[3]
REGISTRY_PATH = AGENT_ROOT / "registry" / "celeris_runtime_controls.json"


@lru_cache(maxsize=1)
def runtime_registry() -> dict[str, Any]:
    return json.loads(REGISTRY_PATH.read_text(encoding="utf-8"))


def registry_commands() -> list[dict[str, Any]]:
    return list(runtime_registry().get("commands") or [])


RUNTIME_PANEL_DESCRIPTIONS = {
    "examples": "Built-in CELERIS example loading from the first HTML panel.",
    "simulation": "Basic simulation state controls such as pause and resume.",
    "visualization": "Visualization, color axis, overlays, vector arrows, view mode, and fullscreen controls.",
    "design": "Design-container controls for surface-cover components and linear structures.",
    "mods": "Mods-container click-edit controls for bathy/topo, friction, passive tracer source, and free-surface edits.",
    "boundary": "Boundary-container controls for boundary types, incident wave type, and incident wave parameters.",
    "sediment": "Sediment-container controls for class-1 sediment parameters and transport on/off state.",
    "timeseries": "Time-series-container controls for active gauge count, duration, and gauge locations.",
}


def runtime_panel_ids() -> list[str]:
    return list(RUNTIME_PANEL_DESCRIPTIONS)


def runtime_panel_for_command(command: dict[str, Any]) -> str:
    namespace = str(command.get("namespace") or "")
    if namespace in {"examples", "simulation", "design", "mods", "boundary", "sediment", "timeseries"}:
        return namespace
    if namespace in {"visualization", "view"}:
        return "visualization"
    return "visualization"


def registry_commands_for_panels(panels: list[str] | None = None) -> list[dict[str, Any]]:
    if not panels:
        return registry_commands()
    allowed = {str(panel) for panel in panels if str(panel) in RUNTIME_PANEL_DESCRIPTIONS}
    return [command for command in registry_commands() if runtime_panel_for_command(command) in allowed]


def runtime_panel_catalog() -> list[dict[str, Any]]:
    counts = {panel: 0 for panel in RUNTIME_PANEL_DESCRIPTIONS}
    examples: dict[str, list[str]] = {panel: [] for panel in RUNTIME_PANEL_DESCRIPTIONS}
    for command in registry_commands():
        panel = runtime_panel_for_command(command)
        counts[panel] = counts.get(panel, 0) + 1
        for example in command.get("examples") or []:
            if example not in examples.setdefault(panel, []):
                examples[panel].append(example)
    return [
        {
            "panel": panel,
            "description": description,
            "command_count": counts.get(panel, 0),
            "examples": examples.get(panel, [])[:16],
        }
        for panel, description in RUNTIME_PANEL_DESCRIPTIONS.items()
    ]


def runtime_panel_catalog_text() -> str:
    return json.dumps(runtime_panel_catalog(), indent=2, ensure_ascii=True)


def runtime_registry_subset_text(panels: list[str]) -> str:
    commands = registry_commands_for_panels(panels)
    return json.dumps(
        {
            "version": runtime_registry().get("version"),
            "commands": commands,
        },
        indent=2,
        ensure_ascii=True,
    )


def command_definition(namespace: str, action: str) -> dict[str, Any] | None:
    for command in registry_commands():
        if command.get("namespace") == namespace and command.get("action") == action:
            return command
    return None


def command_value_map(command: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {str(item.get("key")): item for item in command.get("values") or [] if item.get("key")}


def command_arguments(command: dict[str, Any]) -> list[dict[str, Any]]:
    arguments = command.get("arguments")
    if isinstance(arguments, list):
        return [argument for argument in arguments if argument.get("name")]
    arg_name = command.get("arg_name")
    if not arg_name:
        return []
    arg_type = "number" if command.get("arg_type") == "number" else "enum"
    argument: dict[str, Any] = {
        "name": str(arg_name),
        "type": arg_type,
        "required": True,
    }
    if arg_type == "enum":
        argument["values"] = command.get("values") or []
    return [argument]


def argument_value_map(argument: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {str(item.get("key")): item for item in argument.get("values") or [] if item.get("key")}


def command_arg_names(commands: list[dict[str, Any]] | None = None) -> list[str]:
    names: list[str] = []
    for command in commands or registry_commands():
        for argument in command_arguments(command):
            arg_name = str(argument.get("name"))
            if arg_name and arg_name not in names:
                names.append(arg_name)
    return names


def runtime_command_schema(panels: list[str] | None = None) -> dict[str, Any]:
    commands = registry_commands_for_panels(panels)
    namespaces = sorted({str(command["namespace"]) for command in commands})
    actions = sorted({str(command["action"]) for command in commands})
    arg_properties = {}
    for command in commands:
        for argument in command_arguments(command):
            arg_name = str(argument.get("name"))
            arg_type = argument.get("type")
            if arg_type == "number":
                arg_properties[arg_name] = {"type": ["number", "null"]}
            elif arg_type == "string":
                arg_properties[arg_name] = {"type": ["string", "null"]}
            else:
                keys = [str(item["key"]) for item in argument.get("values") or [] if item.get("key")]
                arg_properties[arg_name] = {"type": ["string", "null"], "enum": [*keys, None]}
    return {
        "type": "array",
        "items": {
            "type": "object",
            "properties": {
                "namespace": {"type": "string", "enum": namespaces},
                "action": {"type": "string", "enum": actions},
                "args": {
                    "type": "object",
                    "properties": arg_properties,
                    "required": list(arg_properties),
                    "additionalProperties": False,
                },
            },
            "required": ["namespace", "action", "args"],
            "additionalProperties": False,
        },
    }


def normalize_runtime_commands(commands: list[dict[str, Any]] | None) -> list[dict[str, Any]]:
    normalized = []
    arg_names = command_arg_names()
    for command in commands or []:
        namespace = str(command.get("namespace") or "")
        action = str(command.get("action") or "")
        definition = command_definition(namespace, action)
        if not definition:
            continue
        args = command.get("args") or {}
        normalized_args = {name: None for name in arg_names}
        valid = True
        for argument in command_arguments(definition):
            arg_name = str(argument.get("name"))
            raw_value = args.get(arg_name)
            required = bool(argument.get("required"))
            if raw_value is None or raw_value == "":
                if required:
                    valid = False
                    break
                continue
            if argument.get("type") == "number":
                try:
                    normalized_args[arg_name] = float(raw_value)
                except (TypeError, ValueError):
                    valid = False
                    break
            elif argument.get("type") == "string":
                normalized_args[arg_name] = str(raw_value)
            else:
                selected_key = str(raw_value).lower()
                if selected_key not in argument_value_map(argument):
                    valid = False
                    break
                normalized_args[arg_name] = selected_key
        if not valid:
            continue
        normalized.append({"namespace": namespace, "action": action, "args": normalized_args})
    return normalize_timeseries_command_sequence(normalized)


def normalize_timeseries_command_sequence(commands: list[dict[str, Any]]) -> list[dict[str, Any]]:
    current_count: int | None = None
    for command in commands:
        if command.get("namespace") != "timeseries":
            continue
        args = command.get("args") or {}
        if command.get("action") == "set_count" and args.get("time_series_count") is not None:
            try:
                current_count = int(float(args.get("time_series_count")))
            except (TypeError, ValueError):
                current_count = None
            continue
        if command.get("action") in {"prepare_click_location", "set_location_xy", "select_location_index"}:
            if args.get("location_index") is None and current_count:
                args["location_index"] = current_count
    return commands


def dedupe_runtime_commands(commands: list[dict[str, Any]] | None) -> list[dict[str, Any]]:
    deduped: list[dict[str, Any]] = []
    seen: set[str] = set()
    for command in commands or []:
        key = json.dumps(command, sort_keys=True, separators=(",", ":"))
        if key in seen:
            continue
        seen.add(key)
        deduped.append(command)
    return deduped


def runtime_commands_text(commands: list[dict[str, Any]]) -> str:
    if not commands:
        return "I did not find a supported running-simulation control to apply."
    phrases = []
    for command in commands:
        definition = command_definition(command.get("namespace"), command.get("action"))
        if not definition:
            continue
        if command.get("namespace") == "boundary" and command.get("action") == "set_incident_wave_parameters":
            phrases.append(boundary_wave_parameters_text(command))
            continue
        arg_name = definition.get("arg_name")
        args = command.get("args") or {}
        value = command_selected_value(definition, command)
        label = value.get("label") if value else args.get(arg_name)
        template = definition.get("response_template")
        if template:
            context = {"label": label, "value": args.get(arg_name)}
            selected_values: dict[str, dict[str, Any]] = {}
            for argument in command_arguments(definition):
                name = str(argument.get("name"))
                context[name] = args.get(name)
                if argument.get("type") == "enum":
                    selected = argument_value_map(argument).get(args.get(name))
                    if selected:
                        selected_values[name] = selected
                    context[f"{name}_label"] = selected.get("label") if selected else args.get(name)
            if context.get("radius_m") is None:
                default_radius = definition.get("default_radius_m")
                context["radius_m"] = f"default {default_radius} m" if default_radius is not None else "default"
            else:
                context["radius_m"] = f"{context['radius_m']} m"
            if context.get("friction") is None:
                default_friction = selected_values.get("component", {}).get("default_friction")
                context["friction"] = f"default {default_friction}" if default_friction is not None else "default"
            if context.get("structure_label") is None:
                context["structure_label"] = "linear structure"
            if context.get("amount") is None:
                context["amount"] = "default"
            if command.get("namespace") == "timeseries" and context.get("location_index") is None:
                context["location_index"] = 1
            if command.get("namespace") == "timeseries":
                if context.get("location_index") is not None:
                    context["location_index"] = format_index(context.get("location_index"))
                if context.get("time_series_count") is not None:
                    context["time_series_count"] = format_index(context.get("time_series_count"))
                    context["value"] = context["time_series_count"]
            phrases.append(str(template).format(**context))
    if not phrases:
        return "I queued a supported runtime command for the running CELERIS simulation."
    return f"I queued a runtime command to {', and '.join(phrases)}."


def update_runtime_state_from_commands(state: dict[str, Any], commands: list[dict[str, Any]]) -> None:
    runtime_state = dict(state.get("runtime_state") or {})
    boundary_state = dict(runtime_state.get("boundary") or {})
    boundary_types = dict(boundary_state.get("boundary_types") or {})
    example_state = dict(runtime_state.get("example") or {})
    sediment_state = dict(runtime_state.get("sediment") or {})
    timeseries_state = dict(runtime_state.get("timeseries") or {})
    timeseries_locations = dict(timeseries_state.get("locations") or {})
    for command in commands or []:
        namespace = command.get("namespace")
        action = command.get("action")
        args = command.get("args") or {}
        if namespace == "examples" and action == "run_example":
            definition = command_definition("examples", "run_example")
            selected = command_selected_value(definition or {}, command) or {}
            example_key = args.get("example") or selected.get("key")
            if example_key:
                example_state = {
                    "key": str(example_key),
                    "label": selected.get("label") or str(example_key),
                    "example_folder": selected.get("example_folder"),
                }
            continue
        if namespace == "sediment":
            if action == "set_transport_model":
                definition = command_definition("sediment", "set_transport_model")
                selected = command_selected_value(definition or {}, command) or {}
                value = args.get("sediment_transport")
                if value:
                    sediment_state["transport_model"] = value
                    sediment_state["transport_model_label"] = selected.get("label") or value
            elif action == "set_d50_mm" and args.get("d50_mm") is not None:
                sediment_state["d50_mm"] = args.get("d50_mm")
            elif action == "set_porosity" and args.get("porosity") is not None:
                sediment_state["porosity"] = args.get("porosity")
            elif action == "set_specific_gravity" and args.get("specific_gravity") is not None:
                sediment_state["specific_gravity"] = args.get("specific_gravity")
            elif action == "set_erosion_psi" and args.get("erosion_psi") is not None:
                sediment_state["erosion_psi"] = args.get("erosion_psi")
            elif action == "set_critical_shields" and args.get("critical_shields") is not None:
                sediment_state["critical_shields"] = args.get("critical_shields")
            continue
        if namespace == "timeseries":
            if action == "set_count" and args.get("time_series_count") is not None:
                timeseries_state["count"] = int(args.get("time_series_count"))
            elif action == "set_duration" and args.get("duration_s") is not None:
                timeseries_state["duration_s"] = args.get("duration_s")
            elif action == "select_location_index" and args.get("location_index") is not None:
                timeseries_state["selected_location_index"] = int(args.get("location_index"))
            elif action == "set_location_xy":
                index = int(args.get("location_index") or timeseries_state.get("selected_location_index") or 1)
                if args.get("x_m") is not None and args.get("y_m") is not None:
                    timeseries_locations[str(index)] = {"x_m": args.get("x_m"), "y_m": args.get("y_m")}
                    timeseries_state["selected_location_index"] = index
                    current_count = timeseries_state.get("count")
                    try:
                        timeseries_state["count"] = max(int(current_count or 0), int(index))
                    except (TypeError, ValueError):
                        timeseries_state["count"] = index
            elif action == "prepare_click_location":
                index = int(args.get("location_index") or timeseries_state.get("selected_location_index") or 1)
                timeseries_state["selected_location_index"] = index
                timeseries_state["placement_mode"] = "right_click"
                current_count = timeseries_state.get("count")
                try:
                    timeseries_state["count"] = max(int(current_count or 0), int(index))
                except (TypeError, ValueError):
                    timeseries_state["count"] = index
            continue
        if namespace != "boundary":
            continue
        if action == "set_boundary_type":
            side = args.get("side")
            boundary_type = args.get("boundary_type")
            if side and boundary_type:
                definition = command_definition("boundary", "set_boundary_type")
                selected = command_argument_selected_value(definition or {}, command, "boundary_type") or {}
                boundary_types[str(side)] = {
                    "key": boundary_type,
                    "label": selected.get("label") or boundary_type,
                }
        elif action == "set_incident_wave_type":
            definition = command_definition("boundary", "set_incident_wave_type")
            selected = command_selected_value(definition or {}, command) or {}
            wave_type = args.get("incident_wave_type")
            if wave_type:
                boundary_state["incident_wave_type"] = wave_type
                boundary_state["incident_wave_type_label"] = selected.get("label") or wave_type
        elif action == "set_incident_wave_parameters":
            for src, dst in (
                ("height_m", "incident_wave_height_m"),
                ("period_s", "incident_wave_period_s"),
                ("direction_deg", "incident_wave_direction_deg"),
            ):
                value = args.get(src)
                if value is not None:
                    boundary_state[dst] = value
    if boundary_types:
        boundary_state["boundary_types"] = boundary_types
    if boundary_state:
        runtime_state["boundary"] = boundary_state
    if example_state:
        runtime_state["example"] = example_state
    if sediment_state:
        runtime_state["sediment"] = sediment_state
    if timeseries_locations:
        timeseries_state["locations"] = timeseries_locations
    if timeseries_state:
        runtime_state["timeseries"] = timeseries_state
    if runtime_state:
        state["runtime_state"] = runtime_state


def boundary_wave_parameters_text(command: dict[str, Any]) -> str:
    args = command.get("args") or {}
    parts = []
    if args.get("height_m") is not None:
        parts.append(f"wave height {args.get('height_m')} m")
    if args.get("period_s") is not None:
        parts.append(f"period {args.get('period_s')} s")
    if args.get("direction_deg") is not None:
        parts.append(f"incident direction {args.get('direction_deg')} deg")
    if not parts:
        return "update incident wave parameters"
    return f"set {'; '.join(parts)}"


def format_index(value: Any) -> str:
    try:
        return str(int(float(value)))
    except (TypeError, ValueError):
        return str(value)


def command_selected_value(definition: dict[str, Any], command: dict[str, Any]) -> dict[str, Any] | None:
    arg_name = definition.get("arg_name")
    key = (command.get("args") or {}).get(arg_name)
    return command_value_map(definition).get(key)


def command_argument_selected_value(definition: dict[str, Any], command: dict[str, Any], arg_name: str) -> dict[str, Any] | None:
    args = command.get("args") or {}
    key = args.get(arg_name)
    if key is None:
        return None
    for argument in command_arguments(definition):
        if argument.get("name") == arg_name:
            return argument_value_map(argument).get(key)
    return None


def mods_pending_edit_from_command(command: dict[str, Any]) -> dict[str, Any]:
    definition = command_definition(command.get("namespace"), command.get("action")) or {}
    args = command.get("args") or {}
    surface = command_argument_selected_value(definition, command, "surface") or {}
    change_mode = command_argument_selected_value(definition, command, "change_mode") or {}
    return {
        "surface": args.get("surface") or "bathy_topography",
        "surface_label": surface.get("label") or "Bathymetry/Topography (m)",
        "change_mode": args.get("change_mode") or "increase_decrease",
        "change_mode_label": change_mode.get("label") or "Increase/Decrease on Click",
        "amount": args.get("amount"),
        "radius_m": args.get("radius_m"),
    }


def mods_confirmation_text(pending: dict[str, Any]) -> str:
    radius_text = f"{pending.get('radius_m')} m" if pending.get("radius_m") is not None else "default"
    return (
        "I prepared a click-edit operation for the running CELERIS simulation.\n\n"
        f"- Surface to edit: {pending.get('surface_label')}\n"
        f"- Edit mode: {pending.get('change_mode_label')}\n"
        f"- Amount/value: {pending.get('amount') if pending.get('amount') is not None else 'default'}\n"
        f"- Lengthscale: {radius_text}\n\n"
        "Confirm these values, or tell me what to change. Use These Values."
    )


def fill_mods_activation_from_pending(command: dict[str, Any], pending: dict[str, Any] | None) -> dict[str, Any] | None:
    if not pending:
        return None
    args = dict(command.get("args") or {})
    for key in ("surface", "change_mode", "amount", "radius_m"):
        if args.get(key) is None:
            args[key] = pending.get(key)
    return {**command, "args": args}


def example_key_from_commands(commands: list[dict[str, Any]]) -> str | None:
    for command in commands:
        if command.get("namespace") == "examples" and command.get("action") == "run_example":
            definition = command_definition("examples", "run_example")
            value = command_selected_value(definition, command) if definition else None
            if value:
                return str(value["key"])
    return None


@lru_cache(maxsize=64)
def example_layout(example_key: str) -> dict[str, Any]:
    definition = command_definition("examples", "run_example")
    values = command_value_map(definition) if definition else {}
    selected = values.get(example_key)
    folder = selected.get("example_folder") if selected else None
    if not folder:
        return {"orientation": "landscape", "width_m": None, "height_m": None}
    config_path = REPO_ROOT / "examples" / str(folder) / "config.json"
    try:
        config = json.loads(config_path.read_text(encoding="utf-8-sig"))
        width = float(config.get("WIDTH") or 0.0)
        height = float(config.get("HEIGHT") or 0.0)
        dx = float(config.get("dx") or 1.0)
        dy = float(config.get("dy") or 1.0)
    except Exception:
        return {"orientation": "landscape", "width_m": None, "height_m": None, "example": example_key}
    width_m = width * dx if width > 0 else None
    height_m = height * dy if height > 0 else None
    orientation = "portrait" if width_m is not None and height_m is not None and height_m > width_m else "landscape"
    return {
        "orientation": orientation,
        "WIDTH": int(width) if width else None,
        "HEIGHT": int(height) if height else None,
        "dx": dx,
        "dy": dy,
        "width_m": width_m,
        "height_m": height_m,
        "example": example_key,
        "example_label": selected.get("label") if selected else None,
    }
