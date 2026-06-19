from __future__ import annotations

import hashlib
import json
import zipfile
from pathlib import Path
from typing import Any

from agent.chat_utils import now
from agent.config import API_PREFIX
from agent.io_utils import is_inside, read_json, write_json


ARCHIVE_SCHEMA_VERSION = "0.1.0"
ARCHIVE_TYPE = "celeris_agent_thread_archive"
MAX_RESTORE_FILES = 200
MAX_RESTORE_BYTES = 750 * 1024 * 1024
ALLOWED_RESTORE_PREFIXES = ("outputs/", "work/")
ALLOWED_TOP_LEVEL_FILES = {"state.json", "thread_transcript.jsonl", "thread_transcript.json", "THREAD_SUMMARY.md", "archive_manifest.json"}


def is_thread_archive(path: Path) -> bool:
    if path.suffix.lower() != ".zip" or not path.exists():
        return False
    try:
        with zipfile.ZipFile(path) as zf:
            if "archive_manifest.json" not in zf.namelist():
                return False
            manifest = json.loads(zf.read("archive_manifest.json").decode("utf-8-sig"))
    except (OSError, zipfile.BadZipFile, KeyError, json.JSONDecodeError, UnicodeDecodeError):
        return False
    return manifest.get("type") == ARCHIVE_TYPE


def build_thread_archive(job_dir: Path) -> Path:
    state = read_json(job_dir / "state.json")
    archive_dir = job_dir / "temp"
    archive_dir.mkdir(parents=True, exist_ok=True)
    archive_path = archive_dir / f"celeris_agent_{job_dir.name}_configuration.zip"
    candidates = archive_candidates(job_dir)
    manifest_files: list[dict[str, Any]] = []

    with zipfile.ZipFile(archive_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for path in candidates:
            rel = path.resolve().relative_to(job_dir.resolve()).as_posix()
            zf.write(path, rel)
            manifest_files.append(file_manifest(job_dir, path, rel))

        state_payload = portable_state(state)
        zf.writestr("state.json", json.dumps(state_payload, indent=2, sort_keys=True))
        manifest_files.append(bytes_manifest("state.json", json.dumps(state_payload, indent=2, sort_keys=True).encode("utf-8")))

        transcript_jsonl = job_dir / "transcript.jsonl"
        if transcript_jsonl.exists():
            zf.write(transcript_jsonl, "thread_transcript.jsonl")
            manifest_files.append(file_manifest(job_dir, transcript_jsonl, "thread_transcript.jsonl"))
            transcript = read_transcript_jsonl(transcript_jsonl)
        else:
            transcript = []
        transcript_bytes = json.dumps(transcript, indent=2, sort_keys=True).encode("utf-8")
        zf.writestr("thread_transcript.json", transcript_bytes)
        manifest_files.append(bytes_manifest("thread_transcript.json", transcript_bytes))

        summary = build_thread_summary(job_dir, state, transcript)
        summary_bytes = summary.encode("utf-8")
        zf.writestr("THREAD_SUMMARY.md", summary_bytes)
        manifest_files.append(bytes_manifest("THREAD_SUMMARY.md", summary_bytes))

        manifest = {
            "schema_version": ARCHIVE_SCHEMA_VERSION,
            "type": ARCHIVE_TYPE,
            "created_at": now(),
            "source_job_id": job_dir.name,
            "restore_behavior": {
                "restore_into_new_job": True,
                "regenerate_artifact_urls": True,
                "clear_embedded_runner_state": True,
            },
            "files": manifest_files,
            "excluded": excluded_large_files(job_dir, {item["path"] for item in manifest_files}),
        }
        manifest_bytes = json.dumps(manifest, indent=2, sort_keys=True).encode("utf-8")
        zf.writestr("archive_manifest.json", manifest_bytes)

    return archive_path


def restore_thread_archive(job_dir: Path, archive_path: Path) -> dict[str, Any]:
    with zipfile.ZipFile(archive_path) as zf:
        manifest = read_archive_manifest(zf)
        validate_archive_members(zf, manifest)
        existing_state = read_json(job_dir / "state.json")
        owner = existing_state.get("owner")
        clear_job_restore_targets(job_dir)
        for member in zf.infolist():
            if member.is_dir() or member.filename in {"archive_manifest.json", "THREAD_SUMMARY.md", "thread_transcript.json"}:
                continue
            if member.filename == "state.json":
                continue
            if member.filename == "thread_transcript.jsonl":
                target = job_dir / "transcript.jsonl"
            elif member.filename.startswith(ALLOWED_RESTORE_PREFIXES):
                target = job_dir / member.filename
            else:
                continue
            target.parent.mkdir(parents=True, exist_ok=True)
            with zf.open(member) as src, target.open("wb") as out:
                out.write(src.read())

        restored_state = json.loads(zf.read("state.json").decode("utf-8-sig")) if "state.json" in zf.namelist() else {}

    state = normalize_restored_state(job_dir, restored_state, manifest, owner)
    write_json(job_dir / "state.json", state)
    return {
        "state": state,
        "manifest": manifest,
        "message": restore_message(state, manifest),
    }


def archive_candidates(job_dir: Path) -> list[Path]:
    candidates: list[Path] = []
    outputs = job_dir / "outputs"
    if outputs.exists():
        candidates.extend(path for path in outputs.rglob("*") if path.is_file())
    work = job_dir / "work"
    if work.exists():
        candidates.extend(path for path in work.rglob("*.json") if path.is_file())
    return sorted(dedupe_paths(path for path in candidates if is_inside(path, job_dir)))


def portable_state(state: dict[str, Any]) -> dict[str, Any]:
    payload = json.loads(json.dumps(state))
    payload.pop("owner", None)
    payload["celeris_run"] = None
    payload["runtime_control"] = None
    payload["artifacts"] = [portable_artifact(item) for item in payload.get("artifacts", []) if isinstance(item, dict)]
    return payload


def portable_artifact(item: dict[str, Any]) -> dict[str, Any]:
    artifact = dict(item)
    artifact.pop("url", None)
    return artifact


def normalize_restored_state(job_dir: Path, state: dict[str, Any], manifest: dict[str, Any], owner: dict[str, Any] | None) -> dict[str, Any]:
    restored = dict(state or {})
    restored["job_id"] = job_dir.name
    restored["updated_at"] = now()
    restored["archive_restore"] = {
        "restored_at": now(),
        "source_job_id": manifest.get("source_job_id"),
        "schema_version": manifest.get("schema_version"),
    }
    if owner:
        restored["owner"] = owner
    restored["celeris_run"] = None
    restored["runtime_control"] = None
    restored["selected_path"] = ["restore_thread_archive", *(restored.get("selected_path") or [])]
    restored["last_intent"] = "restore_thread_archive"
    restored["artifacts"] = regenerate_artifacts(job_dir, restored.get("artifacts") or [])
    restored["validation"] = {
        "status": "ok",
        "checks": [
            {
                "level": "info",
                "code": "THREAD_ARCHIVE_RESTORED",
                "message": "Restored a CelerisAgent configuration archive into this thread.",
                "details": {"source_job_id": manifest.get("source_job_id"), "file_count": len(manifest.get("files") or [])},
            }
        ],
    }
    return restored


def regenerate_artifacts(job_dir: Path, artifacts: list[dict[str, Any]]) -> list[dict[str, Any]]:
    restored: list[dict[str, Any]] = []
    seen: set[str] = set()
    for item in artifacts:
        if not isinstance(item, dict):
            continue
        rel = item.get("relative_path")
        if not rel:
            continue
        path = job_dir / rel
        if not is_inside(path, job_dir) or not path.exists() or not path.is_file():
            continue
        key = path.as_posix()
        if key in seen:
            continue
        seen.add(key)
        next_item = dict(item)
        next_item["filename"] = path.name
        next_item["relative_path"] = rel
        next_item["size_bytes"] = path.stat().st_size
        next_item["url"] = f"{API_PREFIX}/jobs/{job_dir.name}/files/{rel}"
        restored.append(next_item)
    return restored


def validate_archive_members(zf: zipfile.ZipFile, manifest: dict[str, Any]) -> None:
    members = [item for item in zf.infolist() if not item.is_dir()]
    if len(members) > MAX_RESTORE_FILES:
        raise ValueError(f"Archive has too many files ({len(members)} > {MAX_RESTORE_FILES}).")
    total_size = sum(item.file_size for item in members)
    if total_size > MAX_RESTORE_BYTES:
        raise ValueError(f"Archive is too large to restore ({total_size} bytes).")
    names = {item.filename for item in members}
    if "state.json" not in names:
        raise ValueError("Archive is missing state.json.")
    for item in members:
        validate_member_name(item.filename)
    expected_hashes = {entry.get("path"): entry.get("sha256") for entry in manifest.get("files", []) if entry.get("path") and entry.get("sha256")}
    for path, expected in expected_hashes.items():
        if path not in names:
            if path == "archive_manifest.json":
                continue
            raise ValueError(f"Archive manifest lists missing file: {path}")
        if path == "archive_manifest.json":
            continue
        actual = hashlib.sha256(zf.read(path)).hexdigest()
        if actual != expected:
            raise ValueError(f"Archive hash mismatch for {path}.")


def validate_member_name(name: str) -> None:
    normalized = name.replace("\\", "/")
    if normalized != name or normalized.startswith("/") or ":" in normalized:
        raise ValueError(f"Unsafe archive path: {name}")
    parts = normalized.split("/")
    if any(part in {"", ".", ".."} for part in parts):
        raise ValueError(f"Unsafe archive path: {name}")
    if normalized in ALLOWED_TOP_LEVEL_FILES:
        return
    if normalized.startswith(ALLOWED_RESTORE_PREFIXES):
        if normalized.startswith("work/") and not normalized.endswith(".json"):
            raise ValueError(f"Only JSON work metadata can be restored: {name}")
        return
    raise ValueError(f"Unsupported archive path: {name}")


def read_archive_manifest(zf: zipfile.ZipFile) -> dict[str, Any]:
    try:
        manifest = json.loads(zf.read("archive_manifest.json").decode("utf-8-sig"))
    except (KeyError, json.JSONDecodeError, UnicodeDecodeError) as exc:
        raise ValueError("Archive is missing a valid archive_manifest.json.") from exc
    if manifest.get("type") != ARCHIVE_TYPE:
        raise ValueError("Zip file is not a CelerisAgent configuration archive.")
    if manifest.get("schema_version") != ARCHIVE_SCHEMA_VERSION:
        raise ValueError(f"Unsupported archive schema version: {manifest.get('schema_version')}")
    return manifest


def clear_job_restore_targets(job_dir: Path) -> None:
    for rel in ("outputs", "work"):
        target = job_dir / rel
        if not target.exists():
            target.mkdir(parents=True, exist_ok=True)
            continue
        for path in sorted(target.rglob("*"), reverse=True):
            if path.is_file():
                path.unlink()
            elif path.is_dir():
                try:
                    path.rmdir()
                except OSError:
                    pass


def build_thread_summary(job_dir: Path, state: dict[str, Any], transcript: list[dict[str, Any]]) -> str:
    artifacts = state.get("artifacts") or []
    lines = [
        "# CelerisAgent Thread Summary",
        "",
        f"- Source job: `{job_dir.name}`",
        f"- Created: {state.get('created_at') or 'unknown'}",
        f"- Last updated: {state.get('updated_at') or 'unknown'}",
        f"- Workflow state: `{state.get('workflow_state') or 'unknown'}`",
        f"- Last intent: `{state.get('last_intent') or 'none'}`",
        "",
        "## Configuration State",
        "",
        f"- DEM location: {((state.get('dem_request') or {}).get('location')) or 'not set'}",
        f"- DEM AOI bbox WGS84: {((state.get('dem_request') or {}).get('aoi_bbox_wgs84')) or 'not set'}",
        f"- CELERIS grid: dx={((state.get('celeris_config') or {}).get('dx'))}, dy={((state.get('celeris_config') or {}).get('dy'))}",
        f"- Solver mode: {((state.get('celeris_config') or {}).get('NLSW_or_Bous'))}",
        "",
        "## Artifacts",
        "",
    ]
    if artifacts:
        for item in artifacts:
            lines.append(f"- `{item.get('relative_path') or item.get('filename')}`: {item.get('type')} ({item.get('label') or 'artifact'})")
    else:
        lines.append("- No artifacts were recorded when this archive was created.")
    lines.extend(["", "## Conversation", ""])
    if transcript:
        for item in transcript:
            role = item.get("role") or "message"
            text = str(item.get("text") or "").strip()
            if not text:
                continue
            lines.append(f"### {role.title()}")
            lines.append("")
            lines.append(text)
            lines.append("")
    else:
        lines.append("No transcript was available.")
    return "\n".join(lines).strip() + "\n"


def restore_message(state: dict[str, Any], manifest: dict[str, Any]) -> str:
    artifacts = state.get("artifacts") or []
    names = [item.get("filename") for item in artifacts if item.get("filename")]
    if names:
        artifact_text = ", ".join(names[:12])
        if len(names) > 12:
            artifact_text = f"{artifact_text}, and {len(names) - 12} more"
    else:
        artifact_text = "none"
    return (
        f"Restored a CelerisAgent configuration archive from source job `{manifest.get('source_job_id') or 'unknown'}`.\n\n"
        f"Available restored artifacts: {artifact_text}."
    )


def read_transcript_jsonl(path: Path) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    for line in path.read_text(encoding="utf-8-sig").splitlines():
        if not line.strip():
            continue
        try:
            value = json.loads(line)
        except json.JSONDecodeError:
            continue
        if isinstance(value, dict):
            records.append(value)
    return records


def file_manifest(job_dir: Path, path: Path, rel: str) -> dict[str, Any]:
    return {
        "path": rel,
        "size_bytes": path.stat().st_size,
        "sha256": sha256_file(path),
    }


def bytes_manifest(rel: str, data: bytes) -> dict[str, Any]:
    return {
        "path": rel,
        "size_bytes": len(data),
        "sha256": hashlib.sha256(data).hexdigest(),
    }


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def excluded_large_files(job_dir: Path, included_paths: set[str]) -> list[dict[str, Any]]:
    excluded: list[dict[str, Any]] = []
    for rel in ("downloads", "attachments", "logs"):
        root = job_dir / rel
        if not root.exists():
            continue
        for path in root.rglob("*"):
            if not path.is_file():
                continue
            archive_rel = path.resolve().relative_to(job_dir.resolve()).as_posix()
            if archive_rel in included_paths:
                continue
            excluded.append({"path": archive_rel, "size_bytes": path.stat().st_size, "reason": "not required for portable configuration restore"})
    return excluded


def dedupe_paths(paths: Any) -> list[Path]:
    seen: set[str] = set()
    result: list[Path] = []
    for path in paths:
        key = path.resolve().as_posix()
        if key in seen:
            continue
        seen.add(key)
        result.append(path)
    return result
