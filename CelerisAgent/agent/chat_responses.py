from __future__ import annotations

from typing import Any


def last_source_intent(result: dict[str, Any]) -> str:
    search = result.get("source_search") or {}
    if search.get("source") == "usgs_coned_wcs":
        return "retrieve_dem_from_usgs_coned_wcs"
    if search.get("source") == "public_noaa_gridded":
        return "retrieve_dem_from_public_noaa_gridded"
    if search.get("source") == "noaa_digital_coast_data_access_viewer":
        retrieval = result.get("source_retrieval") or {}
        if retrieval.get("source") == "noaa_slr_viewer_dem":
            return "retrieve_dem_from_noaa_slr_viewer"
        return "retrieve_dem_from_noaa_dav"
    return "retrieve_dem_from_tiered_sources"


def response_for_dem_result(result: dict, source: str = "the uploaded file") -> str:
    validation = result.get("validation", {})
    summary = validation.get("summary", {})
    status = validation.get("status", "unknown")
    checks = validation.get("checks", [])
    blocking = [c for c in checks if c.get("level") == "error"]
    shape = summary.get("shape")
    z_min = summary.get("z_min")
    z_max = summary.get("z_max")
    artifacts = result.get("artifacts", [])
    artifact_names = ", ".join(a["filename"] for a in artifacts) if artifacts else "no exported artifacts"
    if status == "error":
        reasons = " ".join(c.get("message", "") for c in blocking).strip()
        text = [
            f"I could not use {source} as a CELERIS DEM.",
            f"Validation status: {status}.",
        ]
        if reasons:
            text.append(reasons)
        if shape:
            text.append(f"Raster shape: {shape[0]} rows by {shape[1]} columns.")
        text.append(f"Artifacts ready: {artifact_names}.")
        return " ".join(text)
    text = [
        f"I normalized {source} into the CELERIS bathymetry working format.",
        f"Validation status: {status}.",
    ]
    if shape:
        text.append(f"Grid shape: {shape[0]} rows by {shape[1]} columns.")
    if z_min is not None and z_max is not None:
        text.append(f"Elevation range: {z_min:.3f} to {z_max:.3f} meters.")
    text.append(f"Artifacts ready: {artifact_names}.")
    warnings = [c for c in checks if c.get("level") in {"warning", "error"}]
    if warnings:
        text.append("I flagged review items in the validation panel before this DEM should drive a production simulation.")
    return " ".join(text)


def response_for_source_result(result: dict[str, Any]) -> str:
    search = result.get("source_search") or {}
    shoreline_note = shoreline_anchor_note(search)
    if result.get("status") in {"source_attempt_failed", "online_sources_exhausted"} or str(search.get("source") or "").startswith("tier_"):
        return join_notes(response_for_tier_failure_result(result), shoreline_note)
    if search.get("source") == "usgs_coned_wcs":
        return join_notes(response_for_coned_wcs_result(result), shoreline_note)
    if search.get("source") == "public_noaa_gridded":
        return join_notes(response_for_public_noaa_gridded_result(result), shoreline_note)
    retrieval = result.get("source_retrieval")
    candidates = search.get("candidates") or []
    candidate_count = search.get("candidate_count", len(candidates))
    if retrieval:
        if result.get("status") == "source_data_staged":
            return response_for_staged_source_result(result)
        if retrieval.get("method") == "not_downloaded":
            if retrieval.get("reason") == "estimated_native_grid_too_large_requires_confirmation":
                cells = retrieval.get("estimated_cell_count")
                limit = retrieval.get("max_native_source_cells")
                size = f" The native-resolution request is about {cells:,} cells" if isinstance(cells, int) else ""
                cap = f", above the current safety limit of {limit:,}" if isinstance(limit, int) else ""
                return join_notes(
                    f"I found {candidate_count} NOAA Data Access Viewer candidates for the AOI and selected "
                    f"{retrieval.get('candidate_name') or 'the requested source'}, but I did not start the download."
                    f"{size}{cap}. Reply `I approve the large extraction` to run it anyway, or confirm a smaller AOI.",
                    shoreline_note,
                )
            reason = retrieval.get("reason")
            return join_notes(
                f"I found {candidate_count} NOAA Data Access Viewer candidates for the AOI. "
                f"I selected {retrieval.get('candidate_name') or retrieval.get('requested_dataset') or 'the requested source'} according to the tiered source policy, "
                f"but it was not downloaded because {reason}. "
                "The tiered workflow saved the attempt metadata for review.",
                shoreline_note,
            )
        validation = result.get("validation") or {}
        summary = validation.get("summary") or {}
        artifacts = result.get("artifacts", [])
        artifact_names = ", ".join(item["filename"] for item in artifacts if item.get("type") != "source_geotiff")
        shape = summary.get("shape")
        resolution = retrieval.get("native_resolution_m")
        datum = retrieval.get("native_vertical_datum")
        source_label = "NOAA Sea Level Rise Viewer DEM" if retrieval.get("source") == "noaa_slr_viewer_dem" else "NOAA Data Access Viewer"
        text = [
            f"I found {candidate_count} {source_label} candidates for the AOI.",
            f"I selected {retrieval.get('candidate_name')} according to the tiered source policy.",
        ]
        if shape:
            text.append(f"The exported grid is {shape[0]} rows by {shape[1]} columns.")
        if resolution:
            text.append(f"Native resolution: {float(resolution):g} m.")
        if datum:
            text.append(f"Native vertical datum: {datum}.")
        if retrieval.get("download_notice"):
            text.append(retrieval["download_notice"])
        text.append(f"Artifacts ready: {artifact_names or 'no exported artifacts'}.")
        text.append("The candidate list and export request were saved in the job work folder for review.")
        return join_notes(" ".join(text), shoreline_note)

    top = candidates[:3]
    names = "; ".join(f"{item.get('name')} ({item.get('data_type')}, {item.get('cell_size_m') or item.get('resolution_m')} m)" for item in top)
    return join_notes(
        f"I found {candidate_count} NOAA Data Access Viewer candidates for the AOI, but none exposed a direct raster export path. "
        f"Top candidates: {names or 'none'}. "
        "The current graph will continue through implemented CoNED, NOAA SLR, and public NOAA gridded tiers when available.",
        shoreline_note,
    )


def shoreline_anchor_note(search: dict[str, Any]) -> str:
    center = ((search.get("aoi") or {}).get("center") or {})
    anchor = center.get("shoreline_anchor") or {}
    if anchor.get("status") == "applied":
        return (
            f"Local shoreline anchor used {anchor.get('dataset_label') or anchor.get('source')}: "
            f"center moved {float(anchor.get('distance_m') or 0):.0f} m to the nearest shoreline before building the DEM bbox."
        )
    if anchor.get("status") in {"failed", "not_found", "rejected_too_far"}:
        return f"Local shoreline anchor did not adjust the center: {anchor.get('status')}."
    return ""


def join_notes(text: str, *notes: str) -> str:
    extra = " ".join(note for note in notes if note)
    return f"{text} {extra}" if extra else text


def response_for_celeris_config_result(result: dict[str, Any]) -> str:
    status = result.get("status")
    missing = result.get("missing_information") or []
    if status == "needs_dem":
        return "I can generate config.json, bathy.txt, and waves.txt after the DEM stage produces celeris_bathy.mat for this job."
    if status == "needs_initial_condition_source_choice":
        checks = (result.get("validation") or {}).get("checks") or []
        details = (checks[0].get("details") if checks else {}) or {}
        product = details.get("product_code") or "the USGS finite-fault product"
        count = details.get("subfault_count")
        count_text = f" with {count} subfaults" if count else ""
        return (
            f"I found that a downloadable finite-fault solution exists for this earthquake: {product}{count_text}. "
            "Would you like to use the finite-fault subfault solution to develop the tsunami initial condition, "
            "or use the simple single-rectangle average source?"
        )
    if status == "needs_celeris_config":
        checks = (result.get("validation") or {}).get("checks") or []
        oversized = next((check for check in checks if check.get("code") == "CELERIS_MODEL_GRID_TOO_LARGE"), None)
        if oversized:
            details = oversized.get("details") or {}
            finite_dx = details.get("finite_fault_dx_m")
            finite_dy = details.get("finite_fault_dy_m")
            finite_text = f" The finite-fault source spacing is about {float(finite_dx):.0f} m by {float(finite_dy):.0f} m." if finite_dx and finite_dy else ""
            suggested = details.get("suggested_min_square_spacing_m")
            suggested_text = f" Use roughly {float(suggested):.0f} m or coarser to stay under the current {int(details.get('max_model_cells') or 0):,}-cell safety limit." if suggested else ""
            return (
                "I did not generate the CELERIS input files because the requested grid spacing is too fine for this domain. "
                f"At dx={float(details.get('requested_dx_m') or 0):g} m and dy={float(details.get('requested_dy_m') or 0):g} m, "
                f"the model would be about {int(details.get('planned_width') or 0):,} by {int(details.get('planned_height') or 0):,} cells "
                f"({int(details.get('cell_count') or 0):,} cells total), which is too large to allocate safely."
                f"{finite_text}{suggested_text} Tell me the CELERIS dx/dy to use, for example `use a 500 m grid in both directions`."
            )
    if status == "needs_celeris_config" and "wave direction" in missing:
        return "I have the default CELERIS control values ready. What direction should the waves come from?"
    if status == "needs_review":
        validation = result.get("validation") or {}
        errors = [check for check in validation.get("checks", []) if check.get("level") == "error"]
        reason = errors[0].get("message") if errors else "the generated CELERIS inputs need review"
        return f"I could not complete CELERIS input generation because {reason}"

    summary = result.get("summary") or {}
    config = result.get("config") or {}
    artifacts = result.get("artifacts") or []
    artifact_names = ", ".join(item["filename"] for item in artifacts)
    fill_note = ""
    for check in (result.get("validation") or {}).get("checks", []):
        if check.get("code") == "BATHY_NANS_FILLED":
            details = check.get("details") or {}
            fill_note = (
                f" NaN bathy cells were filled before writing bathy.txt "
                f"({details.get('linear_cells', 0)} linear, {details.get('nearest_cells', 0)} nearest-neighbor)."
            )
            break
    cap_note = ""
    for check in (result.get("validation") or {}).get("checks", []):
        if check.get("code") == "BOUSSINESQ_DEPTH_CAP":
            details = check.get("details") or {}
            max_depth = float(details.get("max_depth_m", 0))
            if details.get("capped_cells", 0):
                cap_note = (
                    f" Boussinesq depth is clipped at {max_depth:.3g} m "
                    f"({details.get('capped_cells')} cells were deeper and set to elevation "
                    f"{float(details.get('min_elevation_m', 0)):.3g} m)."
                )
            elif details.get("applied"):
                cap_note = f" Boussinesq depth cap checked: maximum allowable depth is {max_depth:.3g} m; no cells exceeded it."
            break
    overlay_note = ""
    overlay_result = result.get("overlay") or {}
    if overlay_result.get("status") == "completed":
        overlay = overlay_result.get("overlay") or {}
        output = overlay.get("output") or {}
        overlay_note = (
            f" Satellite overlay.jpg was generated at {output.get('width_px')} by {output.get('height_px')} pixels "
            "for the final model domain."
        )
    elif overlay_result:
        checks = (overlay_result.get("validation") or {}).get("checks") or []
        reason = checks[0].get("message") if checks else "satellite overlay generation was unavailable"
        overlay_note = f" Satellite overlay.jpg was not generated: {reason}"
    initial_note = ""
    initial_result = result.get("initial_condition") or {}
    if initial_result.get("status") == "completed":
        manifest = initial_result.get("initial_condition") or {}
        summary_ic = manifest.get("summary") or {}
        initial_note = (
            f" Earthquake initial free-surface file etaInitCond.txt was generated and config.json sets loadetaIC=1 "
            f"(range {float(summary_ic.get('min_m', 0)):.3g} to {float(summary_ic.get('max_m', 0)):.3g} m)."
        )
    elif initial_result.get("status") == "failed":
        checks = initial_result.get("checks") or []
        reason = checks[0].get("message") if checks else "earthquake initial condition generation failed"
        initial_note = f" Earthquake initial free-surface file was not generated: {reason}"
    wave_summary = result.get("wave_summary") or {}
    if wave_summary.get("mode") == "no_incident_waves":
        wave_setup = "No incident wave forcing; all wave-boundary forcing is disabled and waves.txt contains a zero-amplitude placeholder."
    else:
        wave_setup = (
            f"Wave setup: Hmo {float(config.get('Hmo', 0)):.3g} m, Tp {float(config.get('Tp', 0)):.3g} s, "
            f"Thetap {float(config.get('Thetap', 0)):.3g} degrees, incoming at the {config.get('wave_boundary')} boundary."
        )
    return (
        "I generated the CELERIS input files from the current bathymetry. "
        f"Model grid: {summary.get('WIDTH')} by {summary.get('HEIGHT')} cells at "
        f"{float(summary.get('dx', 0)):.3g} m by {float(summary.get('dy', 0)):.3g} m. "
        f"{wave_setup} "
        f"Artifacts ready: {artifact_names}.{fill_note}{cap_note}{initial_note}{overlay_note}"
    )


def response_for_celeris_launch_result(result: dict[str, Any]) -> str:
    if result.get("status") == "needs_celeris_inputs":
        missing = ", ".join(result.get("missing_information") or ["config, bathy, and waves files"])
        return f"I need the CELERIS input files before launching the simulation. Missing: {missing}."
    run = result.get("celeris_run") or {}
    return (
        "I prepared the local CELERIS runner for this job. "
        "The Simulation panel is loading the local WebGPU page with the current config.json, bathy.txt, and waves.txt. "
        f"Open directly: {run.get('runner_url')}"
    )


def response_for_celeris_stop_result(result: dict[str, Any]) -> str:
    if result.get("had_active_runner"):
        return "I closed the embedded CELERIS runner and restored the conversation layout."
    return "There was no embedded CELERIS runner active in this job, so the conversation layout is already restored."


def response_for_tier_failure_result(result: dict[str, Any]) -> str:
    attempts = result.get("tier_attempts") or []
    errors = [item.get("error") for item in attempts if item.get("error")]
    retrieval = result.get("source_retrieval") or {}
    reason = retrieval.get("reason") or "source_attempt_failed"
    if errors:
        return (
            "The tiered source retrieval did not run to a usable DEM because the request could not be resolved before querying data sources. "
            f"Last error: {errors[-1]}"
        )
    return f"The tiered source retrieval did not produce a usable DEM. Reason: {reason}."


def response_for_coned_wcs_result(result: dict[str, Any]) -> str:
    retrieval = result.get("source_retrieval") or {}
    validation = result.get("validation") or {}
    summary = validation.get("summary") or {}
    artifacts = result.get("artifacts", [])
    artifact_names = ", ".join(item["filename"] for item in artifacts if item.get("type") != "source_geotiff")
    if retrieval.get("method") == "not_downloaded":
        if retrieval.get("reason") == "estimated_native_grid_too_large_requires_confirmation":
            cells = retrieval.get("estimated_cell_count")
            limit = retrieval.get("max_native_source_cells")
            size = f" The native-resolution request is about {cells:,} cells" if isinstance(cells, int) else ""
            cap = f", above the current safety limit of {limit:,}" if isinstance(limit, int) else ""
            return (
                f"I found USGS CoNED WCS coverage in layer {retrieval.get('layer_name')}, but I did not start the download."
                f"{size}{cap}. Reply `I approve the large extraction` to run it anyway, or confirm a smaller AOI."
            )
        return f"I checked USGS CoNED WCS, but it did not produce an extractable GeoTIFF because {retrieval.get('reason')}. The tiered workflow saved the attempt metadata for review."
    shape = summary.get("shape")
    native = retrieval.get("native_resolution_xy_m") or {}
    text = [
        f"I retrieved the DEM from USGS CoNED WCS using layer {retrieval.get('layer_name')}.",
    ]
    if shape:
        text.append(f"The exported grid is {shape[0]} rows by {shape[1]} columns.")
    if native.get("dx") and native.get("dy"):
        text.append(f"Service-native resolution: {float(native['dx']):.2f} m by {float(native['dy']):.2f} m.")
    if retrieval.get("native_vertical_datum"):
        text.append(f"Vertical datum: {retrieval['native_vertical_datum']}.")
    text.append(f"Artifacts ready: {artifact_names or 'no exported artifacts'}.")
    return " ".join(text)


def response_for_staged_source_result(result: dict[str, Any]) -> str:
    retrieval = result.get("source_retrieval") or {}
    artifacts = result.get("artifacts", [])
    artifact_names = ", ".join(item["filename"] for item in artifacts)
    size = retrieval.get("download_size_bytes")
    size_text = f" Downloaded size: {size / 1024**2:.1f} MB." if size else ""
    return (
        f"I found and downloaded the requested DAV source dataset, {retrieval.get('candidate_name')}. "
        f"It is staged as source data rather than a completed CELERIS DEM because {retrieval.get('reason')}. "
        f"Artifacts ready: {artifact_names or 'source metadata only'}.{size_text}"
    )


def response_for_public_noaa_gridded_result(result: dict[str, Any]) -> str:
    retrieval = result.get("source_retrieval") or {}
    validation = result.get("validation") or {}
    summary = validation.get("summary") or {}
    artifacts = result.get("artifacts", [])
    artifact_names = ", ".join(item["filename"] for item in artifacts if item.get("type") != "source_geotiff")
    shape = summary.get("shape")
    native = retrieval.get("native_resolution_m_approx") or {}
    text = [
        "I retrieved the DEM from public NOAA gridded sources.",
        f"Selected source: {retrieval.get('candidate_name')}.",
    ]
    if shape:
        text.append(f"The exported grid is {shape[0]} rows by {shape[1]} columns.")
    if native.get("dx") and native.get("dy"):
        text.append(f"Approximate service-native resolution: {float(native['dx']):.2f} m by {float(native['dy']):.2f} m.")
    if retrieval.get("native_vertical_datum"):
        text.append(f"Vertical datum: {retrieval['native_vertical_datum']}.")
    text.append(f"Artifacts ready: {artifact_names or 'no exported artifacts'}.")
    return " ".join(text)


def source_plan_text(source_plan: dict[str, Any]) -> str:
    plan = source_plan.get("plan", {})
    sources = plan.get("recommended_sources", [])
    source_text = ", ".join(sources) if sources else "no ranked sources yet"
    facts = []
    if plan.get("location"):
        facts.append(f"location: {plan['location']}")
    if plan.get("center_description"):
        facts.append(f"center: {plan['center_description']}")
    if plan.get("domain_width_deg") and plan.get("domain_height_deg"):
        facts.append(f"domain: {plan['domain_width_deg']:.3g} degrees lon by {plan['domain_height_deg']:.3g} degrees lat")
    elif plan.get("domain_width_m") and plan.get("domain_height_m"):
        facts.append(f"domain: {plan['domain_width_m']:.0f} m by {plan['domain_height_m']:.0f} m")
    if plan.get("target_resolution_m"):
        facts.append(f"resolution: {plan['target_resolution_m']:.3g} m")
    if plan.get("vertical_datum"):
        facts.append(f"vertical datum: {plan['vertical_datum']}")
    known_text = "; ".join(facts) if facts else "no concrete DEM fields yet"
    missing = plan.get("missing_information") or []
    if missing == ["vertical datum"] or missing == ["vertical_datum"]:
        question = "What vertical datum should I use? NAVD88 is common for many NOAA coastal elevation products, but I will not assume it without confirmation."
    elif missing:
        question = "I still need: " + ", ".join(missing) + "."
    else:
        question = "I have enough request detail to move to source retrieval through the tiered graph, preserving each selected source's native or service-native datum and resolution."
    return (
        "I updated the DEM request from this conversation. "
        f"Current request: {known_text}. "
        f"Ranked source path: {source_text}. "
        f"{question}"
    )


def help_text() -> str:
    return (
        "Tell me what DEM, bathymetry, wave setup, or CELERIS inputs you want, or attach source files directly. "
        "For example: 'Create a 5 m DEM for Santa Cruz Harbor from NOAA sources', "
        "'Use this GeoTIFF, NAVD88, EPSG:26910', 'Generate CELERIS inputs with waves from the west', "
        "'Run the simulation', or paste a direct DEM URL."
    )
