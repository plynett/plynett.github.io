const API_BASE = "/CelerisAgent/api";

export class ApiError extends Error {
  constructor(message, status, payload = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
  }
}

export async function postChat({ jobId, message, files }) {
  const form = new FormData();
  form.append("job_id", jobId);
  form.append("message", message);
  files.forEach((file) => form.append("attachments", file));

  const response = await fetch(`${API_BASE}/chat`, { method: "POST", body: form, credentials: "same-origin" });
  await assertOk(response, "Chat request failed");
  return response.json();
}

export async function getJobProgress(jobId) {
  const response = await fetch(`${API_BASE}/jobs/${encodeURIComponent(jobId)}/progress`, { cache: "no-store", credentials: "same-origin" });
  await assertOk(response, "Progress request failed");
  return response.json();
}

export async function getJobResult(jobId) {
  const response = await fetch(`${API_BASE}/jobs/${encodeURIComponent(jobId)}/result`, { cache: "no-store", credentials: "same-origin" });
  if (response.status === 202) {
    return { pending: true, ...(await response.json()) };
  }
  await assertOk(response, "Result request failed");
  return response.json();
}

export async function closeSimulation(jobId) {
  if (!jobId) return null;
  const response = await fetch(`${API_BASE}/jobs/${encodeURIComponent(jobId)}/close-simulation`, {
    method: "POST",
    cache: "no-store",
    credentials: "same-origin",
  });
  await assertOk(response, "Close simulation request failed");
  return response.json();
}

export async function getAuthStatus() {
  const response = await fetch(`${API_BASE}/me`, { cache: "no-store", credentials: "same-origin" });
  await assertOk(response, "Auth status request failed");
  return response.json();
}

export async function login(email, password) {
  const response = await fetch(`${API_BASE}/login`, {
    method: "POST",
    cache: "no-store",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  await assertOk(response, "Login failed");
  return response.json();
}

export async function logout() {
  const response = await fetch(`${API_BASE}/logout`, {
    method: "POST",
    cache: "no-store",
    credentials: "same-origin",
  });
  await assertOk(response, "Logout failed");
  return response.json();
}

export async function requestAccess({ name, email, comment, website = "" }) {
  const response = await fetch(`${API_BASE}/access-request`, {
    method: "POST",
    cache: "no-store",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, email, comment, website }),
  });
  await assertOk(response, "Access request failed");
  return response.json();
}

export async function getAccessRequests() {
  const response = await fetch(`${API_BASE}/admin/access-requests`, { cache: "no-store", credentials: "same-origin" });
  await assertOk(response, "Access requests failed");
  return response.json();
}

export async function getPendingAccessCount() {
  const response = await fetch(`${API_BASE}/admin/pending-count`, { cache: "no-store", credentials: "same-origin" });
  await assertOk(response, "Pending count failed");
  return response.json();
}

export async function approveAccessRequest(requestId) {
  const response = await fetch(`${API_BASE}/admin/access-requests/${encodeURIComponent(requestId)}/approve`, {
    method: "POST",
    cache: "no-store",
    credentials: "same-origin",
  });
  await assertOk(response, "Approve access request failed");
  return response.json();
}

export async function submitFeedback(text) {
  const response = await fetch(`${API_BASE}/feedback`, {
    method: "POST",
    cache: "no-store",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  await assertOk(response, "Feedback submission failed");
  return response.json();
}

export async function getAdminFeedback() {
  const response = await fetch(`${API_BASE}/admin/feedback`, { cache: "no-store", credentials: "same-origin" });
  await assertOk(response, "Feedback request failed");
  return response.json();
}

export async function getUnreadFeedbackCount() {
  const response = await fetch(`${API_BASE}/admin/feedback-count`, { cache: "no-store", credentials: "same-origin" });
  await assertOk(response, "Feedback count failed");
  return response.json();
}

async function assertOk(response, prefix) {
  if (response.ok) return;
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  const detail = payload?.error ? `: ${payload.error}` : "";
  throw new ApiError(`${prefix} with HTTP ${response.status}${detail}`, response.status, payload);
}
