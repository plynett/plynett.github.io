import { dom } from "./dom.js";
import { escapeHtml, formatBytes, formatCoord, formatNumber } from "./format.js";
import { setEmpty } from "./ui.js";

export function renderWorkflowPath(path) {
  if (!path.length) {
    setEmpty(dom.workflowPath, "path-list empty", "No workflow has run yet.");
    return;
  }
  dom.workflowPath.className = "path-list";
  dom.workflowPath.innerHTML = path.map((step) => `<span class="path-chip">${escapeHtml(step)}</span>`).join("");
}

export function renderArtifacts(artifacts) {
  if (!artifacts.length) {
    setEmpty(dom.artifactList, "artifact-list empty", "No artifacts yet.");
    return;
  }
  dom.artifactList.className = "artifact-list";
  dom.artifactList.innerHTML = artifacts.map((artifact) => `
    <div class="artifact">
      <a href="${artifact.url}">${escapeHtml(artifact.filename)}</a>
      <div class="artifact-meta">${escapeHtml(artifact.type)} - ${formatBytes(artifact.size_bytes)}</div>
    </div>
  `).join("");
}

export function renderValidation(validation) {
  const checks = validation?.checks || [];
  if (checks.length) {
    dom.validationList.className = "validation-list";
    dom.validationList.innerHTML = checks.map((check) => `
      <div class="check ${escapeHtml(check.level)}">
        <div class="check-code">${escapeHtml(check.level)} - ${escapeHtml(check.code)}</div>
        <div class="check-message">${escapeHtml(check.message)}</div>
      </div>
    `).join("");
  } else if (validation?.status) {
    dom.validationList.className = "validation-list";
    dom.validationList.innerHTML = `
      <div class="check info">
        <div class="check-code">status - ${escapeHtml(validation.status)}</div>
        <div class="check-message">No validation warnings or errors were reported.</div>
      </div>
    `;
  } else {
    setEmpty(dom.validationList, "validation-list empty", "No validation report yet.");
  }
}

export function renderPreview(artifacts, updatedAt) {
  const preview = artifacts.find((a) => a.type === "preview_png");
  if (!preview) {
    setEmpty(dom.previewBox, "preview-box empty", "No DEM preview yet.");
    return;
  }
  const version = encodeURIComponent(`${updatedAt}-${preview.size_bytes || ""}`);
  const separator = preview.url.includes("?") ? "&" : "?";
  dom.previewBox.className = "preview-box";
  dom.previewBox.innerHTML = `<img src="${preview.url}${separator}v=${version}" alt="DEM preview">`;
}

export function renderDemRequest(request) {
  const domain = request.domain_width_m && request.domain_height_m
    ? `${formatNumber(request.domain_width_m)} m x ${formatNumber(request.domain_height_m)} m`
    : "none";
  const center = request.center_lat !== null && request.center_lat !== undefined && request.center_lon !== null && request.center_lon !== undefined
    ? `${formatCoord(request.center_lat)}, ${formatCoord(request.center_lon)}`
    : request.center_description || "none";
  const bbox = Array.isArray(request.aoi_bbox_wgs84)
    ? request.aoi_bbox_wgs84.map((value) => formatCoord(value)).join(", ")
    : domain;
  dom.demRequestList.innerHTML = `
    <div><dt>Location</dt><dd>${escapeHtml(request.location || "none")}</dd></div>
    <div><dt>Center</dt><dd>${escapeHtml(center)}</dd></div>
    <div><dt>AOI</dt><dd>${escapeHtml(bbox)}</dd></div>
    <div><dt>Source</dt><dd>${escapeHtml(request.source_dataset_hint || "native DAV policy")}</dd></div>
    <div><dt>Resolution</dt><dd>${escapeHtml(request.target_resolution_m ? `${formatNumber(request.target_resolution_m)} m` : "none")}</dd></div>
    <div><dt>Datum</dt><dd>${escapeHtml(request.vertical_datum || "none")}</dd></div>
  `;
}

export function renderCelerisConfig(config) {
  const boundary = config.wave_boundary || "direction needed";
  const waveText = config.Thetap !== null && config.Thetap !== undefined
    ? `${boundary}, Thetap ${formatNumber(config.Thetap)} deg`
    : boundary;
  const hmo = config.Hmo !== null && config.Hmo !== undefined ? `${formatNumber(config.Hmo)} m` : "default";
  const tp = config.Tp !== null && config.Tp !== undefined ? `${formatNumber(config.Tp)} s` : "default";
  const dx = config.dx !== null && config.dx !== undefined ? formatNumber(config.dx) : "2";
  const dy = config.dy !== null && config.dy !== undefined ? formatNumber(config.dy) : "2";
  const solverMap = { 0: "NLSW", 1: "Boussinesq", 2: "Extended Boussinesq" };
  const solver = solverMap[config.NLSW_or_Bous] || config.NLSW_or_Bous || "Boussinesq";
  dom.celerisConfigList.innerHTML = `
    <div><dt>Waves</dt><dd>${escapeHtml(`${waveText}; Hmo ${hmo}; Tp ${tp}`)}</dd></div>
    <div><dt>Grid</dt><dd>${escapeHtml(`${dx} m x ${dy} m`)}</dd></div>
    <div><dt>Solver</dt><dd>${escapeHtml(String(solver))}</dd></div>
  `;
}

export function renderSimulationInfo(info = null) {
  if (!info || !info.running) {
    dom.simulationInfoList.innerHTML = `
      <div><dt>Time</dt><dd>not running</dd></div>
      <div><dt>Speed</dt><dd>not running</dd></div>
    `;
    return;
  }
  const seconds = Number(info.simulation_time_seconds);
  const minutes = Number(info.simulation_time_minutes);
  const ratio = Number(info.faster_than_realtime_ratio);
  const timeText = Number.isFinite(seconds)
    ? `${formatNumber(minutes, 2)} min (${formatNumber(seconds, 1)} s)`
    : "waiting for state";
  const speedText = Number.isFinite(ratio)
    ? `${formatNumber(ratio, 1)}x realtime`
    : "waiting for state";
  dom.simulationInfoList.innerHTML = `
    <div><dt>Time</dt><dd>${escapeHtml(timeText)}</dd></div>
    <div><dt>Speed</dt><dd>${escapeHtml(speedText)}</dd></div>
  `;
}

export function renderSourceCandidates(search) {
  const candidates = search?.candidates || [];
  if (!candidates.length) {
    setEmpty(dom.sourceCandidates, "source-list empty", "No source search has run yet.");
    return;
  }
  dom.sourceCandidates.className = "source-list";
  dom.sourceCandidates.innerHTML = candidates.slice(0, 5).map((candidate, index) => {
    const cell = formatCandidateResolution(candidate);
    const sourceName = candidate.name || candidate.location_name || "Unnamed source";
    const sourceType = formatCandidateSourceType(candidate);
    const datum = candidate.native_vertical_datum || candidate.vertical_datum || "unknown datum";
    const flags = [
      candidate.image_service_url ? "direct export" : "",
      candidate.bulk_links?.length ? "bulk" : "",
      candidate.coverage?.contains_aoi ? "covers AOI" : "",
    ].filter(Boolean).join(" / ") || "metadata only";
    const metadata = candidate.metadata_links?.[0]?.url;
    return `
      <div class="source-card">
        <div class="source-rank">#${index + 1}${candidate.score !== undefined ? ` - score ${escapeHtml(candidate.score)}` : ""}</div>
        <div class="source-title">${escapeHtml(sourceName)}</div>
        <div class="source-meta">${escapeHtml(sourceType)} - ${escapeHtml(cell || "native metadata")} - ${escapeHtml(datum)}</div>
        <div class="source-meta">${escapeHtml(flags)}</div>
        ${metadata ? `<a href="${escapeHtml(metadata)}" target="_blank" rel="noreferrer">Metadata</a>` : ""}
      </div>
    `;
  }).join("");
}

function formatCandidateSourceType(candidate) {
  if (candidate.data_type) {
    return candidate.data_type;
  }
  if (candidate.source_family) {
    return candidate.source_family;
  }
  const source = candidate.source || candidate.database;
  const labels = {
    noaa_coastal_relief_model: "NOAA Coastal Relief Model",
    noaa_etopo_2022: "NOAA ETOPO 2022",
    public_noaa_gridded: "NOAA public gridded DEM",
  };
  return labels[source] || "DEM source";
}

function formatCandidateResolution(candidate) {
  const meters = candidate.native_resolution_m || candidate.cell_size_m || candidate.resolution_m;
  if (meters) {
    return `${formatNumber(meters)} m`;
  }
  if (candidate.resolution_degrees) {
    const arcseconds = Number(candidate.resolution_degrees) * 3600;
    return Number.isFinite(arcseconds) ? `${formatNumber(arcseconds)} arcsec` : "";
  }
  return "";
}
