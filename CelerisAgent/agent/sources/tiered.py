from __future__ import annotations

import time
from pathlib import Path
from typing import Any

from agent.io_utils import write_json
from agent.sources.coned_wcs import retrieve_coned_wcs_dem
from agent.sources.noaa_dav import retrieve_noaa_slr_dem, retrieve_user_specified_dav_dataset
from agent.sources.public_gridded import retrieve_public_gridded_dem


SUCCESS_STATUSES = {"completed", "needs_review", "source_data_staged", "needs_user_confirmation"}


def retrieve_tiered_dem(job_dir: Path, dem_request: dict[str, Any], options: dict[str, Any] | None = None) -> dict[str, Any]:
    attempts: list[dict[str, Any]] = []
    if explicitly_public_gridded(dem_request):
        result = retrieve_public_gridded_dem(job_dir, dem_request, options)
        result["source_tier"] = 3
        result["tier_attempts"] = attempts
        return result

    if dem_request.get("source_dataset_hint"):
        result = attempt("tier_1_user_specified_us_dataset", retrieve_user_specified_dav_dataset, job_dir, dem_request, options)
        attempts.append(summarize_attempt(result))
        if result.get("status") in SUCCESS_STATUSES:
            result["source_tier"] = 1
            result["tier_attempts"] = attempts
            write_json(job_dir / "work" / "tiered_source_attempts.json", {"attempts": attempts})
            return result

    result = attempt("tier_2_usgs_coned_wcs", retrieve_coned_wcs_dem, job_dir, dem_request, options)
    attempts.append(summarize_attempt(result))
    if result.get("status") in SUCCESS_STATUSES:
        result["source_tier"] = 2
        result["tier_attempts"] = attempts
        write_json(job_dir / "work" / "tiered_source_attempts.json", {"attempts": attempts})
        return result

    result = attempt("tier_2_noaa_slr_viewer_dem", retrieve_noaa_slr_dem, job_dir, dem_request, options)
    attempts.append(summarize_attempt(result))
    if result.get("status") in SUCCESS_STATUSES:
        result["source_tier"] = 2
        result["tier_attempts"] = attempts
        write_json(job_dir / "work" / "tiered_source_attempts.json", {"attempts": attempts})
        return result

    result = attempt("tier_3_public_noaa_gridded", retrieve_public_gridded_dem, job_dir, dem_request, options)
    attempts.append(summarize_attempt(result))
    if result.get("status") in SUCCESS_STATUSES:
        result["source_tier"] = 3
        result["tier_attempts"] = attempts
        write_json(job_dir / "work" / "tiered_source_attempts.json", {"attempts": attempts})
        return result

    result = online_sources_exhausted(attempts)
    result["source_tier"] = 3
    result["tier_attempts"] = attempts
    write_json(job_dir / "work" / "tiered_source_attempts.json", {"attempts": attempts})
    write_json(job_dir / "work" / "online_source_retrieval_failed.json", result)
    return result


def attempt(label: str, func, job_dir: Path, dem_request: dict[str, Any], options: dict[str, Any] | None) -> dict[str, Any]:
    started = time.perf_counter()
    try:
        result = func(job_dir, dem_request, options)
        result["tier_label"] = label
        result["elapsed_seconds"] = round(time.perf_counter() - started, 3)
        return result
    except Exception as exc:
        result = {
            "status": "source_attempt_failed",
            "tier_label": label,
            "elapsed_seconds": round(time.perf_counter() - started, 3),
            "selected_path": ["route_online_dem_source_tiers", label, "source_attempt_failed"],
            "artifacts": [],
            "validation": None,
            "source_search": {"source": label, "candidate_count": 0},
            "source_retrieval": {
                "method": "not_downloaded",
                "reason": "source_attempt_exception",
                "error": str(exc),
            },
        }
        write_json(job_dir / "work" / f"{label}_failure.json", result)
        return result


def summarize_attempt(result: dict[str, Any]) -> dict[str, Any]:
    search = result.get("source_search") or {}
    retrieval = result.get("source_retrieval") or {}
    return {
        "tier_label": result.get("tier_label"),
        "status": result.get("status"),
        "elapsed_seconds": result.get("elapsed_seconds"),
        "source": search.get("source") or retrieval.get("source"),
        "candidate_count": search.get("candidate_count"),
        "selection": search.get("selection"),
        "retrieval_method": retrieval.get("method"),
        "retrieval_reason": retrieval.get("reason"),
        "candidate_name": retrieval.get("candidate_name"),
        "error": retrieval.get("error"),
    }


def online_sources_exhausted(attempts: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "status": "online_sources_exhausted",
        "selected_path": ["route_online_dem_source_tiers", "online_sources_exhausted"],
        "artifacts": [],
        "validation": None,
        "source_search": {
            "source": "online_dem_sources",
            "candidate_count": 0,
        },
        "source_retrieval": {
            "method": "not_downloaded",
            "reason": "online_sources_failed",
            "attempts": attempts,
        },
    }


def explicitly_public_gridded(dem_request: dict[str, Any]) -> bool:
    preferred = dem_request.get("preferred_sources") or []
    accepted = {
        "public_noaa_gridded",
        "noaa_grid_extract",
        "noaa_crm_mosaic",
        "noaa_etopo_2022",
        "noaa_dem_global_mosaic",
        "etopo",
        "crm",
    }
    return bool(preferred) and all(str(value).lower() in accepted for value in preferred)
