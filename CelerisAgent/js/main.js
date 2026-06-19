import { ApiError, approveAccessRequest, closeSimulation, getAccessRequests, getAdminFeedback, getAuthStatus, getJobProgress, getJobResult, getPendingAccessCount, getUnreadFeedbackCount, login, logout, postChat, requestAccess, submitFeedback } from "./api.js";
import { installBrowserConsolePanel } from "./browser_console.js";
import { dom } from "./dom.js";
import { addMessage, addProgressMessage, postRuntimeCommands, renderAttachmentBar, renderNewThread, renderState, setLargeExtractionApprovalHandler, setLocalAoiUpdateHandler, setMessageActionHandler, setSimulationCloseHandler } from "./render.js?v=agent-thread-archive-20260614";


let currentJobId = "";
let pendingFiles = [];
let chatRequestInFlight = false;
let authState = { required: false, authenticated: true, user: null };
let adminPoller = null;

installBrowserConsolePanel();
initAuth();

dom.attachBtn.addEventListener("click", () => dom.attachments.click());

dom.attachments.addEventListener("change", () => {
  pendingFiles = Array.from(dom.attachments.files || []);
  renderAttachmentBar(pendingFiles);
});

document.querySelectorAll(".prompt-chip").forEach((button) => {
  button.addEventListener("click", () => {
    if (button.id) return;
    dom.messageInput.value = button.textContent.trim();
    dom.messageInput.focus();
  });
});

dom.newThreadBtn.addEventListener("click", () => {
  if (chatRequestInFlight) return;
  currentJobId = "";
  renderNewThread();
});

dom.composer.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!authState.authenticated && authState.required) {
    showAuthGate("Please sign in before sending a request.");
    return;
  }
  if (chatRequestInFlight) return;
  const text = dom.messageInput.value.trim();
  if (!text && pendingFiles.length === 0) return;
  await submitChat(text, pendingFiles);
});

dom.messageInput.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" || event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) return;
  event.preventDefault();
  dom.composer.requestSubmit();
});

async function submitChat(text, filesToSend = []) {
  if (chatRequestInFlight) return;
  const requestJobId = currentJobId || createJobId();
  currentJobId = requestJobId;
  dom.jobId.textContent = requestJobId;
  setComposerBusy(true);
  addMessage("user", text || `Attached ${filesToSend.map((f) => f.name).join(", ")}`);
  dom.messageInput.value = "";
  const progressMessage = addProgressMessage();
  const progressPoller = startProgressPolling(requestJobId, progressMessage);

  const files = filesToSend;
  pendingFiles = [];
  dom.attachments.value = "";
  renderAttachmentBar(pendingFiles);

  try {
    let payload = await postChat({ jobId: requestJobId, message: text, files });
    if (payload.status === "queued") {
      payload = await waitForQueuedChat(payload.job_id || requestJobId);
    }
    progressPoller.stop();
    progressMessage.remove();
    currentJobId = payload.job_id;
    payload.messages.filter((m) => m.role === "assistant").forEach((m) => addMessage("assistant", m.text));
    renderState(payload.state, currentJobId);
  } catch (error) {
    progressPoller.stop();
    progressMessage.remove();
    if (isAuthError(error)) {
      showAuthGate("Please sign in again.");
      return;
    }
    addMessage("assistant", `Request failed: ${error.message || error}`);
  } finally {
    setComposerBusy(false);
  }
}

async function waitForQueuedChat(jobId) {
  const started = Date.now();
  const timeoutMs = 2 * 60 * 60 * 1000;
  while (Date.now() - started < timeoutMs) {
    await sleep(1500);
    const payload = await getJobResult(jobId);
    if (!payload.pending) {
      return payload;
    }
  }
  throw new Error("Timed out waiting for the queued Agent job to finish.");
}

function sleep(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function setComposerBusy(isBusy) {
  chatRequestInFlight = isBusy;
  dom.sendBtn.disabled = isBusy;
  dom.sendBtn.textContent = isBusy ? "Working" : "Send";
  dom.newThreadBtn.disabled = isBusy;
}

function startProgressPolling(jobId, progressMessage) {
  let stopped = false;
  const poll = async () => {
    if (stopped) return;
    try {
      const progress = await getJobProgress(jobId);
      progressMessage.update(progress);
    } catch {
      // The first poll may happen before the server creates the job folder.
    }
  };
  window.setTimeout(poll, 250);
  const timer = window.setInterval(poll, 1500);
  return {
    stop() {
      stopped = true;
      window.clearInterval(timer);
    },
  };
}

function createJobId() {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return `job_${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

setLocalAoiUpdateHandler(async (bbox) => {
  const formatted = bbox.map((value) => Number(value).toFixed(8)).join(", ");
  const message = `Update the DEM using this exact edited AOI bounding box. Use set_aoi_bbox_wgs84 with [${formatted}], lock these grid bounds, and rerun source retrieval.`;
  await submitChat(message, []);
});

setLargeExtractionApprovalHandler(async () => {
  await submitChat("I approve the large extraction", []);
});

setSimulationCloseHandler(async () => {
  if (!currentJobId || chatRequestInFlight) return;
  try {
    const state = await closeSimulation(currentJobId);
    if (state) {
      renderState(state, currentJobId);
    }
  } catch (error) {
    if (isAuthError(error)) {
      showAuthGate("Please sign in again.");
      return;
    }
    addMessage("assistant", `Close simulation failed: ${error.message || error}`);
  }
});

setMessageActionHandler(async (action) => {
  if (typeof action === "string") {
    await submitChat(action, []);
    return;
  }
  if (action?.kind === "linear_structure_start_set") {
    handleLinearStructureStartSet(action.message);
    return;
  }
  if (action?.kind === "linear_structure_end_set") {
    handleLinearStructureEndSet(action.message);
    return;
  }
  await submitChat(action?.message || "", []);
});

function handleLinearStructureStartSet(userMessage) {
  if (chatRequestInFlight) return;
  addMessage("user", userMessage || "The start point is set");
  const sent = postRuntimeCommands([
    {
      namespace: "design",
      action: "confirm_linear_start",
      args: {},
    },
  ]);
  addMessage(
    "assistant",
    sent
      ? "Right-click the structure end location in Design Mode.\n\nWhen the end point looks correct, tell me the end point is set, and then I will add the structure.\n\nNext to run a simulation: nothing else is needed; the CELERIS runner is already loaded for this job."
      : "I do not see an active embedded CELERIS runner, so I could not switch to end-point selection.",
  );
}

function handleLinearStructureEndSet(userMessage) {
  if (chatRequestInFlight) return;
  addMessage("user", userMessage || "The end point is set");
  const sent = postRuntimeCommands([
    {
      namespace: "design",
      action: "confirm_linear_end_and_add",
      args: {},
    },
  ]);
  addMessage(
    "assistant",
    sent
      ? "I added the linear structure.\n\nNext to run a simulation: nothing else is needed; the CELERIS runner is already loaded for this job."
      : "I do not see an active embedded CELERIS runner, so I could not add the linear structure.",
  );
}

dom.voiceBtn.addEventListener("click", () => {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    addMessage("assistant", "This browser does not expose speech recognition. Type the instruction here for now.");
    return;
  }
  const recognition = new SpeechRecognition();
  recognition.lang = "en-US";
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;
  dom.voiceBtn.textContent = "Listening";
  recognition.onresult = (event) => {
    dom.messageInput.value = event.results[0][0].transcript;
    dom.voiceBtn.textContent = "Voice";
  };
  recognition.onerror = () => {
    dom.voiceBtn.textContent = "Voice";
    addMessage("assistant", "Voice capture failed. Type the instruction and send it.");
  };
  recognition.onend = () => {
    dom.voiceBtn.textContent = "Voice";
  };
  recognition.start();
});

dom.loginForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  dom.loginMessage.textContent = "";
  try {
    const payload = await login(dom.loginEmail.value.trim(), dom.loginPassword.value);
    applyAuthState(payload.auth);
    dom.loginPassword.value = "";
    hideAuthGate();
  } catch {
    dom.loginMessage.textContent = "Sign-in failed.";
  }
});

dom.requestAccessForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  dom.requestMessage.textContent = "";
  try {
    const payload = await requestAccess({
      name: dom.requestName.value.trim(),
      email: dom.requestEmail.value.trim(),
      comment: dom.requestComment.value.trim(),
      website: dom.requestWebsite.value.trim(),
    });
    const note = payload.notification?.status === "sent" ? " The admin was notified by email." : " The request is now visible to the admin.";
    dom.requestMessage.textContent = `Access request received.${note}`;
    dom.requestAccessForm.reset();
  } catch (error) {
    dom.requestMessage.textContent = error.message || "Access request failed.";
  }
});

dom.logoutBtn?.addEventListener("click", async () => {
  try {
    const payload = await logout();
    applyAuthState(payload.auth);
    showAuthGate("Signed out.");
  } catch (error) {
    addMessage("assistant", `Sign out failed: ${error.message || error}`);
  }
});

dom.feedbackForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const text = dom.feedbackText.value.trim();
  if (!text) return;
  if (!authState.authenticated && authState.required) {
    showAuthGate("Please sign in before sending feedback.");
    return;
  }
  dom.feedbackSubmitBtn.disabled = true;
  try {
    await submitFeedback(text);
    dom.feedbackText.value = "";
    window.alert("Feedback Sent");
  } catch (error) {
    if (isAuthError(error)) {
      showAuthGate("Please sign in again.");
      return;
    }
    window.alert(error.message || "Feedback failed.");
  } finally {
    dom.feedbackSubmitBtn.disabled = false;
  }
});

dom.adminRequestBtn?.addEventListener("click", async () => {
  await renderAdminRequests();
});

dom.adminFeedbackBtn?.addEventListener("click", async () => {
  await renderAdminFeedback();
});

dom.adminRequestsList?.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-approve-request-id]");
  if (!button) return;
  await approveRequestFromButton(button);
});

async function initAuth() {
  try {
    const payload = await getAuthStatus();
    applyAuthState(payload.auth);
    if (authState.required && !authState.authenticated) {
      showAuthGate();
    }
  } catch {
    showAuthGate("Could not verify access status.");
  }
}

function applyAuthState(nextAuth) {
  authState = nextAuth || { required: false, authenticated: true, user: null };
  const user = authState.user;
  if (dom.authUser) {
    dom.authUser.textContent = user ? `${user.name || user.email} (${user.email})` : (authState.required ? "Not signed in" : "Access gate off");
  }
  if (dom.logoutBtn) {
    dom.logoutBtn.disabled = !user;
  }
  const isAdmin = Boolean(user?.is_admin);
  dom.adminAccessSection?.classList.toggle("hidden", !isAdmin);
  if (isAdmin) {
    updatePendingAccessCount(authState.pending_access_count || 0);
    updateUnreadFeedbackCount(authState.unread_feedback_count || 0);
    startAdminPolling();
  } else {
    stopAdminPolling();
  }
}

function showAuthGate(message = "") {
  dom.authGate?.classList.remove("hidden");
  if (dom.loginMessage) dom.loginMessage.textContent = message;
  window.setTimeout(() => dom.loginEmail?.focus(), 0);
}

function hideAuthGate() {
  dom.authGate?.classList.add("hidden");
}

function startAdminPolling() {
  if (adminPoller) return;
  const poll = async () => {
    try {
      const [accessPayload, feedbackPayload] = await Promise.all([getPendingAccessCount(), getUnreadFeedbackCount()]);
      updatePendingAccessCount(accessPayload.pending || 0);
      updateUnreadFeedbackCount(feedbackPayload.unread || 0);
    } catch {
      // The admin panel is advisory; chat should keep working if this poll fails.
    }
  };
  poll();
  adminPoller = window.setInterval(poll, 30000);
}

function stopAdminPolling() {
  if (!adminPoller) return;
  window.clearInterval(adminPoller);
  adminPoller = null;
}

function updatePendingAccessCount(count) {
  if (dom.adminRequestBadge) {
    dom.adminRequestBadge.textContent = String(count);
    dom.adminRequestBadge.classList.toggle("empty", count === 0);
  }
}

function updateUnreadFeedbackCount(count) {
  if (dom.adminFeedbackBadge) {
    dom.adminFeedbackBadge.textContent = String(count);
    dom.adminFeedbackBadge.classList.toggle("empty", count === 0);
  }
}

async function renderAdminRequests() {
  if (!dom.adminRequestsList) return;
  dom.adminRequestsList.className = "admin-request-list";
  dom.adminRequestsList.textContent = "Loading requests...";
  try {
    const payload = await getAccessRequests();
    const requests = payload.requests || [];
    updatePendingAccessCount(requests.length);
    if (!requests.length) {
      dom.adminRequestsList.className = "admin-request-list empty";
      dom.adminRequestsList.textContent = "No pending requests.";
      return;
    }
    dom.adminRequestsList.innerHTML = "";
    requests.forEach((request) => {
      const item = document.createElement("div");
      item.className = "admin-request-item";
    item.innerHTML = `
        <div class="admin-request-name"></div>
        <div class="admin-request-email"></div>
        <div class="admin-request-comment"></div>
        <div class="admin-request-date"></div>
        <button class="secondary admin-approve-button" type="button">Approve</button>
        <div class="admin-request-result"></div>
      `;
      item.querySelector(".admin-request-name").textContent = request.name || "Unnamed";
      item.querySelector(".admin-request-email").textContent = request.email || "";
      item.querySelector(".admin-request-comment").textContent = request.comment || "No comment.";
      item.querySelector(".admin-request-date").textContent = request.created_at || "";
      item.querySelector(".admin-approve-button").dataset.approveRequestId = request.id || "";
      dom.adminRequestsList.appendChild(item);
    });
  } catch (error) {
    dom.adminRequestsList.className = "admin-request-list empty";
    dom.adminRequestsList.textContent = error.message || "Could not load requests.";
  }
}

async function renderAdminFeedback() {
  if (!dom.adminFeedbackList) return;
  dom.adminFeedbackList.className = "admin-request-list";
  dom.adminFeedbackList.textContent = "Loading feedback...";
  try {
    const payload = await getAdminFeedback();
    const feedback = payload.feedback || [];
    updateUnreadFeedbackCount(0);
    if (!feedback.length) {
      dom.adminFeedbackList.className = "admin-request-list empty";
      dom.adminFeedbackList.textContent = "No feedback received.";
      return;
    }
    dom.adminFeedbackList.innerHTML = "";
    feedback.forEach((entry) => {
      const item = document.createElement("div");
      item.className = "admin-request-item";
      item.innerHTML = `
        <div class="admin-request-name"></div>
        <div class="admin-request-email"></div>
        <div class="admin-request-comment"></div>
        <div class="admin-request-date"></div>
      `;
      const user = entry.user || {};
      item.querySelector(".admin-request-name").textContent = user.name || "Unknown user";
      item.querySelector(".admin-request-email").textContent = user.email || "";
      item.querySelector(".admin-request-comment").textContent = entry.text || "";
      item.querySelector(".admin-request-date").textContent = entry.created_at || "";
      dom.adminFeedbackList.appendChild(item);
    });
  } catch (error) {
    dom.adminFeedbackList.className = "admin-request-list empty";
    dom.adminFeedbackList.textContent = error.message || "Could not load feedback.";
  }
}

function isAuthError(error) {
  return error instanceof ApiError && error.status === 401;
}

async function approveRequestFromButton(button) {
  const requestId = button.dataset.approveRequestId;
  if (!requestId) return;
  const item = button.closest(".admin-request-item");
  const result = item?.querySelector(".admin-request-result");
  button.disabled = true;
  button.textContent = "Approving";
  if (result) result.textContent = "";
  try {
    const payload = await approveAccessRequest(requestId);
    button.textContent = "Approved";
    const email = payload.user?.email || "";
    const password = payload.temporary_password || "celeristester2026!";
    const mailto = buildAccessMailto(email, password);
    if (result) {
      result.textContent = "";
      result.append(
        document.createTextNode(
          payload.notification?.status === "sent"
            ? `Approved ${email}. Approval email sent.`
            : `Approved ${email}. `,
        ),
      );
      const link = document.createElement("a");
      link.href = mailto;
      link.textContent = "Open email draft";
      link.className = "admin-mailto-link";
      result.appendChild(link);
    }
    window.location.href = mailto;
    const countPayload = await getPendingAccessCount();
    updatePendingAccessCount(countPayload.pending || 0);
  } catch (error) {
    button.disabled = false;
    button.textContent = "Approve";
    if (result) result.textContent = error.message || "Approval failed.";
  }
}

function buildAccessMailto(email, password) {
  const subject = "Access to CelerisAgent";
  const body = [
    "Thank you for beta testing CelerisAgent.  Your login info is below:",
    `username: ${email}`,
    `password: ${password}`,
    "",
    "Feedback is welcome, either in the comment box on the agent page or directly to me through email.",
    "",
    "Thanks and good luck-",
  ].join("\n");
  return `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
