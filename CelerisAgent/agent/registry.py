from __future__ import annotations

import json
from pathlib import Path

from agent.config import REGISTRY


def load_registry() -> dict:
    nodes = _read(REGISTRY / "nodes.json", {"nodes": []})
    sources = _read(REGISTRY / "data_sources.json", {"data_sources": []})
    runtime_controls = _read(REGISTRY / "celeris_runtime_controls.json", {"commands": []})
    return {
        "source_tiers": nodes.get("source_tiers", []),
        "nodes": nodes.get("nodes", []),
        "data_sources": sources.get("data_sources", []),
        "celeris_runtime_controls": runtime_controls.get("commands", []),
    }


def _read(path: Path, default: dict) -> dict:
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8"))
