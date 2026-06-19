import { dom } from "./dom.js";
import { renderLargeExtractionPrompt, resetLargeExtractionPrompt } from "./confirm.js";
import { renderContextMaps, resetContextMaps } from "./maps.js";
import { addMessage, addProgressMessage, renderAttachmentBar, setMessageActionHandler } from "./messages.js?v=linear-structure-actions-20260611";
import {
  renderArtifacts,
  renderCelerisConfig,
  renderDemRequest,
  renderPreview,
  renderSimulationInfo,
  renderSourceCandidates,
  renderValidation,
  renderWorkflowPath,
} from "./state_panels.js";
import { postRuntimeCommands, renderRuntimeControl, renderSimulation, resetSimulation, setSimulationCloseHandler } from "./simulation.js?v=agent-timeseries-chartjs-20260614";
import { setEmpty } from "./ui.js";

export { setLargeExtractionApprovalHandler } from "./confirm.js";
export { setLocalAoiUpdateHandler } from "./maps.js";
export { addMessage, addProgressMessage, postRuntimeCommands, renderAttachmentBar, setMessageActionHandler, setSimulationCloseHandler };

export function renderNewThread() {
  resetLargeExtractionPrompt();
  dom.jobId.textContent = "new";
  dom.workflowState.textContent = "waiting";
  dom.lastIntent.textContent = "none";
  dom.plannerMode.textContent = "not run";
  renderDownloadLink("");
  renderDemRequest({});
  renderCelerisConfig({});
  renderSimulationInfo(null);
  setEmpty(dom.workflowPath, "path-list empty", "No workflow has run yet.");
  setEmpty(dom.sourceCandidates, "source-list empty", "No source search has run yet.");
  setEmpty(dom.artifactList, "artifact-list empty", "No artifacts yet.");
  setEmpty(dom.validationList, "validation-list empty", "No validation report yet.");
  resetSimulation();
  resetContextMaps();
  setEmpty(dom.previewBox, "preview-box empty", "No DEM preview yet.");
  dom.messages.innerHTML = "";
  addMessage("assistant", "New thread started. Describe the DEM, wave setup, CELERIS inputs, attach files, or paste a source URL.");
}

export function renderState(state, currentJobId) {
  dom.jobId.textContent = state.job_id || currentJobId || "new";
  dom.workflowState.textContent = state.workflow_state || "waiting";
  dom.lastIntent.textContent = state.last_intent || "none";
  const planner = state.planner || {};
  dom.plannerMode.textContent = planner.mode ? `${planner.mode}${planner.model ? ` - ${planner.model}` : ""}` : "not run";
  renderDownloadLink(state.job_id || currentJobId || "");
  renderDemRequest(state.dem_request || {});
  renderCelerisConfig(state.celeris_config || {});
  renderSimulationInfo((state.celeris_run || null) ? { running: true } : null);
  renderSourceCandidates(state.source_search || null);
  renderWorkflowPath(state.selected_path || []);
  renderArtifacts(state.artifacts || []);
  renderValidation(state.validation || null);
  renderSimulation(state.celeris_run || null, state.celeris_summary || {});
  renderRuntimeControl(state.runtime_control || null);
  renderContextMaps(state);
  renderPreview(state.artifacts || [], state.updated_at || "");
  renderLargeExtractionPrompt(state);
}

function renderDownloadLink(jobId) {
  if (!dom.downloadConfigLink) return;
  const hasJob = Boolean(jobId && jobId !== "new");
  dom.downloadConfigLink.classList.toggle("disabled", !hasJob);
  dom.downloadConfigLink.setAttribute("aria-disabled", hasJob ? "false" : "true");
  dom.downloadConfigLink.href = hasJob
    ? `/CelerisAgent/api/jobs/${encodeURIComponent(jobId)}/configuration-archive`
    : "#";
}
