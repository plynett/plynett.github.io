from __future__ import annotations

import re
from pathlib import Path
from urllib.parse import urlparse

import requests

from agent.dem.export import export_all
from agent.dem.loaders import expand_inputs, load_first
from agent.dem.processing import apply_options
from agent.dem.validation import validate


def normalize_attachments(job_dir: Path, attachments: list[Path], options: dict) -> dict:
    selected_path: list[str] = []
    expanded = expand_inputs(attachments, job_dir / "work")
    grid, load_path = load_first(expanded, options)
    selected_path.extend(load_path)
    apply_options(grid, options)
    selected_path.append("normalize_to_canonical_dem")
    report = validate(grid)
    selected_path.append("validate_celeris_bathy")
    artifacts = []
    if report["status"] != "error":
        artifacts = export_all(grid, job_dir, report)
        selected_path.append("export_celeris_bathy")
    return {
        "status": "completed" if report["status"] != "error" else "needs_review",
        "selected_path": selected_path,
        "validation": report,
        "artifacts": artifacts,
        "summary": grid.summary(),
    }


def normalize_direct_url(job_dir: Path, url: str, options: dict) -> dict:
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"}:
        raise ValueError("Only http/https URLs are supported.")
    name = re.sub(r"[^A-Za-z0-9._-]", "_", Path(parsed.path).name or "downloaded_dem")
    dst = job_dir / "downloads" / name
    dst.parent.mkdir(parents=True, exist_ok=True)
    with requests.get(url, stream=True, timeout=120) as response:
        response.raise_for_status()
        with dst.open("wb") as out:
            for chunk in response.iter_content(1024 * 1024):
                if chunk:
                    out.write(chunk)
    result = normalize_attachments(job_dir, [dst], options)
    result["selected_path"] = ["download_direct_dem_url", *result["selected_path"]]
    return result

