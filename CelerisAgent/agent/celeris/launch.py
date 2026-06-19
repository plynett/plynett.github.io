from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any
from urllib.parse import urlencode

from agent.config import AGENT_PREFIX, API_PREFIX


def prepare_celeris_launch(job_dir: Path) -> dict[str, Any]:
    selected_path = ["validate_celeris_case_files", "prepare_local_celeris_runner_url"]
    required = {
        "config": job_dir / "outputs" / "config.json",
        "bathy": job_dir / "outputs" / "bathy.txt",
        "waves": job_dir / "outputs" / "waves.txt",
    }
    missing = [name for name, path in required.items() if not path.exists()]
    if missing:
        return {
            "status": "needs_celeris_inputs",
            "selected_path": selected_path,
            "missing_information": missing,
            "validation": {
                "status": "warning",
                "checks": [
                    {
                        "level": "warning",
                        "code": "MISSING_CELERIS_INPUTS",
                        "message": "config.json, bathy.txt, and waves.txt must exist before launching the CELERIS runner.",
                        "details": {"missing": missing},
                    }
                ],
            },
        }

    agent_base_url = os.environ.get("CELERIS_AGENT_BASE_URL", "http://127.0.0.1:8765").rstrip("/")
    layout = read_case_layout(required["config"])
    runner_base_url = os.environ.get("CELERIS_RUNNER_BASE_URL", "http://127.0.0.1:8765/agent.html").strip() or "http://127.0.0.1:8765/agent.html"
    api_base_url = f"{agent_base_url}/api" if agent_base_url.endswith(AGENT_PREFIX) else f"{agent_base_url}{API_PREFIX}"
    manifest_url = f"{api_base_url}/jobs/{job_dir.name}/celeris-case"
    separator = "&" if "?" in runner_base_url else "?"
    runner_url = f"{runner_base_url}{separator}{urlencode({'agent_case': manifest_url, 'autostart': '1'})}"
    return {
        "status": "ready_to_run",
        "selected_path": selected_path,
        "validation": {
            "status": "ok",
            "checks": [
                {
                    "level": "info",
                    "code": "CELERIS_RUNNER_READY",
                    "message": "Local CELERIS runner URL prepared from the current job inputs.",
                    "details": {"runner_url": runner_url, "manifest_url": manifest_url},
                }
            ],
        },
        "celeris_run": {
            "mode": "local_root_celeris",
            "runner_base_url": runner_base_url,
            "manifest_url": manifest_url,
            "runner_url": runner_url,
            "autostart": True,
            "layout": layout,
        },
    }


def read_case_layout(config_path: Path) -> dict[str, Any]:
    try:
        config = json.loads(config_path.read_text(encoding="utf-8"))
    except Exception:
        return {"orientation": "landscape", "width_m": None, "height_m": None}
    width = float(config.get("WIDTH") or 0.0)
    height = float(config.get("HEIGHT") or 0.0)
    dx = float(config.get("dx") or 1.0)
    dy = float(config.get("dy") or 1.0)
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
    }
