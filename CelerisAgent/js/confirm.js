import { escapeHtml } from "./format.js";

let largeExtractionApprovalHandler = null;
let dismissedLargeExtractionKey = null;

export function setLargeExtractionApprovalHandler(handler) {
  largeExtractionApprovalHandler = handler;
}

export function resetLargeExtractionPrompt() {
  dismissedLargeExtractionKey = null;
  removeLargeExtractionPrompt();
}

export function renderLargeExtractionPrompt(state) {
  const retrieval = state?.source_retrieval || {};
  const isLargeGuard = state?.workflow_state === "needs_user_confirmation"
    && retrieval.reason === "estimated_native_grid_too_large_requires_confirmation";
  if (!isLargeGuard) {
    removeLargeExtractionPrompt();
    return;
  }
  const key = [
    state?.job_id || "",
    retrieval.layer_name || retrieval.candidate_name || "",
    retrieval.estimated_cell_count || "",
    retrieval.max_native_source_cells || "",
  ].join("|");
  if (dismissedLargeExtractionKey === key || document.querySelector(".confirm-overlay")) return;

  const cells = Number(retrieval.estimated_cell_count);
  const limit = Number(retrieval.max_native_source_cells);
  const sourceName = retrieval.layer_name || retrieval.candidate_name || "the selected DEM source";
  const overlay = document.createElement("div");
  overlay.className = "confirm-overlay";
  overlay.innerHTML = `
    <div class="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="largeExtractTitle">
      <h2 id="largeExtractTitle">Approve Large DEM Extraction?</h2>
      <p>The selected source is ${escapeHtml(sourceName)}. The native-resolution request is about ${escapeHtml(Number.isFinite(cells) ? cells.toLocaleString() : "many")} cells${Number.isFinite(limit) ? `, above the current ${escapeHtml(limit.toLocaleString())}-cell safety limit` : ""}.</p>
      <p>This may take longer and create a large working file.</p>
      <div class="confirm-actions">
        <button class="secondary confirm-no" type="button">No</button>
        <button class="send confirm-yes" type="button">Yes, Download</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.querySelector(".confirm-no").addEventListener("click", () => {
    dismissedLargeExtractionKey = key;
    overlay.remove();
  });
  overlay.querySelector(".confirm-yes").addEventListener("click", () => {
    dismissedLargeExtractionKey = key;
    overlay.remove();
    if (largeExtractionApprovalHandler) largeExtractionApprovalHandler();
  });
}


function removeLargeExtractionPrompt() {
  document.querySelectorAll(".confirm-overlay").forEach((item) => item.remove());
}
