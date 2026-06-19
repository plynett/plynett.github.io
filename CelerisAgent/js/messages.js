import { dom } from "./dom.js";

let messageActionHandler = null;

export function setMessageActionHandler(handler) {
  messageActionHandler = handler;
}

export function addMessage(role, text) {
  const article = document.createElement("article");
  article.className = `message ${role}`;
  const bubble = document.createElement("div");
  bubble.className = "bubble";
  if (role === "assistant") {
    const content = renderAssistantMessage(text);
    addAssistantActionButtons(content, text);
    bubble.appendChild(content);
  } else {
    const p = document.createElement("p");
    p.textContent = text;
    bubble.appendChild(p);
  }
  article.appendChild(bubble);
  dom.messages.appendChild(article);
  dom.messages.scrollTop = dom.messages.scrollHeight;
}

function renderAssistantMessage(text) {
  const root = document.createElement("div");
  root.className = "message-content";
  const lines = String(text || "").split(/\r?\n/);
  let paragraph = [];
  let list = null;

  const flushParagraph = () => {
    if (!paragraph.length) return;
    const text = paragraph.join(" ");
    sentenceBlocks(text).forEach((block) => {
      const p = document.createElement("p");
      p.innerHTML = inlineMarkdown(block);
      root.appendChild(p);
    });
    paragraph = [];
  };
  const flushList = () => {
    if (!list) return;
    root.appendChild(list.element);
    list = null;
  };
  const appendListItem = (tag, content) => {
    flushParagraph();
    if (!list || list.tag !== tag) {
      flushList();
      list = { tag, element: document.createElement(tag) };
    }
    const li = document.createElement("li");
    li.innerHTML = inlineMarkdown(content);
    list.element.appendChild(li);
  };

  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      flushParagraph();
      flushList();
      return;
    }
    const heading = trimmed.match(/^#{1,4}\s+(.+)$/);
    if (heading) {
      flushParagraph();
      flushList();
      const h = document.createElement("h4");
      h.innerHTML = inlineMarkdown(heading[1]);
      root.appendChild(h);
      return;
    }
    const bullet = trimmed.match(/^[-*]\s+(.+)$/);
    if (bullet) {
      appendListItem("ul", bullet[1]);
      return;
    }
    const numbered = trimmed.match(/^\d+[.)]\s+(.+)$/);
    if (numbered) {
      appendListItem("ol", numbered[1]);
      return;
    }
    flushList();
    paragraph.push(trimmed);
  });
  flushParagraph();
  flushList();

  if (!root.childElementCount) {
    const p = document.createElement("p");
    p.textContent = "";
    root.appendChild(p);
  }
  return root;
}

function addAssistantActionButtons(root, text) {
  const actions = assistantActionsForText(text);
  if (!actions.length) return;
  const actionsRow = document.createElement("div");
  actionsRow.className = "message-actions";
  actions.forEach((action) => {
    const button = document.createElement("button");
    button.className = "message-action-button";
    button.type = "button";
    button.textContent = action.label;
    button.addEventListener("click", async () => {
      if (!messageActionHandler) return;
      button.disabled = true;
      await messageActionHandler(action);
    });
    actionsRow.appendChild(button);
  });
  root.appendChild(actionsRow);
}

function assistantActionsForText(text) {
  const lower = String(text || "").toLowerCase();
  const actions = [];
  if (lower.includes("tell me the start point is set")) {
    actions.push({
      label: "Click When Start Point Is Set",
      message: "The start point is set",
      kind: "linear_structure_start_set",
    });
  }
  if (lower.includes("tell me the end point is set")) {
    actions.push({
      label: "Click When End Point Is Set",
      message: "The end point is set",
      kind: "linear_structure_end_set",
    });
  }
  if (lower.includes("use these values")) {
    actions.push({ label: "Use These Values", message: "Use these values", kind: "chat" });
  }
  return actions;
}

function inlineMarkdown(text) {
  let html = escapeHtml(String(text || ""));
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+|\/[^)\s]+)\)/g, (_match, label, url) => {
    return `<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`;
  });
  return html;
}

function sentenceBlocks(text) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (!clean) return [];
  if (clean.length < 220) return [clean];

  const blocks = [];
  let start = 0;
  for (let i = 0; i < clean.length; i += 1) {
    const char = clean[i];
    if (!".!?".includes(char)) continue;
    if (isDecimalPoint(clean, i)) continue;

    let end = i + 1;
    while (end < clean.length && /[)"'\]]/.test(clean[end])) end += 1;
    if (end >= clean.length || clean[end] !== " ") continue;

    const next = clean.slice(end).trimStart()[0] || "";
    if (!/[A-Z0-9`]/.test(next)) continue;

    blocks.push(clean.slice(start, end).trim());
    start = end + 1;
  }
  const tail = clean.slice(start).trim();
  if (tail) blocks.push(tail);
  return blocks.length ? blocks : [clean];
}

function isDecimalPoint(text, index) {
  return /\d/.test(text[index - 1] || "") && /\d/.test(text[index + 1] || "");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function addProgressMessage() {
  const article = document.createElement("article");
  article.className = "message assistant working";
  const bubble = document.createElement("div");
  bubble.className = "bubble";
  const title = document.createElement("p");
  title.className = "working-title";
  const detail = document.createElement("p");
  detail.className = "working-detail";
  const checklist = document.createElement("div");
  checklist.className = "working-checklist";
  const dataBlock = document.createElement("pre");
  dataBlock.className = "working-data";
  bubble.appendChild(title);
  bubble.appendChild(detail);
  bubble.appendChild(checklist);
  bubble.appendChild(dataBlock);
  article.appendChild(bubble);
  dom.messages.appendChild(article);

  let elapsed = 0;
  let latestProgress = null;
  const render = () => {
    const events = latestProgress?.events || [];
    const latest = events[events.length - 1];
    if (latest) {
      title.textContent = latest.stage ? `Working: ${latest.stage}` : "Working through the workflow graph...";
      detail.textContent = `${latest.detail} Elapsed ${elapsed}s.`;
      renderProgressChecklist(checklist, events);
      dataBlock.textContent = progressDetailsText(latest, events);
    } else {
      title.textContent = "Working: request sent";
      detail.textContent = `Waiting for backend progress events. Elapsed ${elapsed}s.`;
      checklist.innerHTML = "";
      dataBlock.textContent = "";
    }
    dom.messages.scrollTop = dom.messages.scrollHeight;
  };
  render();
  const timer = window.setInterval(() => {
    elapsed += 3;
    render();
  }, 3000);

  return {
    update(progress) {
      latestProgress = progress || latestProgress;
      render();
    },
    remove() {
      window.clearInterval(timer);
      article.remove();
    },
  };
}

export function renderAttachmentBar(files) {
  dom.attachmentBar.textContent = files.length ? `Attached: ${files.map((f) => f.name).join(", ")}` : "";
}

function progressDetailsText(latest, events) {
  const lines = [];
  const latestData = formatProgressData(latest.data || {});
  if (latestData.length) {
    lines.push("Current details:");
    lines.push(...latestData.map((line) => `  ${line}`));
  }
  const recent = events.slice(-5);
  if (recent.length) {
    if (lines.length) lines.push("");
    lines.push("Recent event details:");
    recent.forEach((event) => {
      lines.push(`  ${event.stage}: ${event.detail}`);
      formatProgressData(event.data || {}).forEach((line) => {
        lines.push(`    ${line}`);
      });
    });
  }
  return lines.join("\n");
}

function renderProgressChecklist(container, events) {
  const items = progressChecklistItems(events);
  if (!items.length) {
    container.innerHTML = "";
    return;
  }
  container.innerHTML = "";
  items.forEach((item) => {
    const row = document.createElement("div");
    row.className = `working-check ${item.status}`;
    const marker = document.createElement("span");
    marker.className = "working-check-marker";
    marker.textContent = markerForStatus(item.status);
    const text = document.createElement("span");
    text.className = "working-check-text";
    text.textContent = item.detail ? `${item.label}: ${item.detail}` : item.label;
    row.appendChild(marker);
    row.appendChild(text);
    container.appendChild(row);
  });
}

function progressChecklistItems(events) {
  const latest = events[events.length - 1] || {};
  const plannedSteps = plannedWorkflowSteps(events);
  const items = [{ key: "orchestrator", label: "Interpret request", stages: ["orchestrator", "orchestrator_result"] }];
  plannedSteps.forEach((step, index) => {
    items.push({ key: `step_${index + 1}_${step.route}`, label: stepLabel(step.route, index + 1), route: step.route, step: index + 1 });
  });
  if (!plannedSteps.length) {
    if (events.some((event) => event.stage === "direct_research" || event.stage === "direct_research_result")) {
      items.push({ key: "research", label: "Research answer", stages: ["direct_research", "direct_research_result"] });
    }
    if (events.some((event) => isDemStage(event.stage))) {
      items.push({ key: "dem", label: "Retrieve DEM", stages: [] });
    }
    if (events.some((event) => isCelerisConfigStage(event.stage))) {
      items.push({ key: "config", label: "Generate CELERIS inputs", stages: [] });
    }
    if (events.some((event) => isRuntimeStage(event.stage))) {
      items.push({ key: "runtime", label: "Control running simulation", stages: [] });
    }
  }
  return items.map((item) => {
    const related = relatedEventsForItem(events, item);
    const latestRelated = related[related.length - 1] || {};
    return {
      label: item.label,
      detail: compactProgressDetail(latestRelated),
      status: checklistStatus(item, related, latest),
    };
  }).filter((item) => item.status !== "hidden");
}

function plannedWorkflowSteps(events) {
  const planEvent = events.find((event) => event.stage === "orchestrator_result" && Array.isArray(event.data?.steps));
  if (!planEvent) return [];
  return planEvent.data.steps.map((step) => ({
    route: step.route || "unknown",
    instruction: step.instruction || "",
  }));
}

function relatedEventsForItem(events, item) {
  if (item.key === "orchestrator") {
    return events.filter((event) => event.stage === "orchestrator" || event.stage === "orchestrator_result");
  }
  if (item.stages?.length) {
    return events.filter((event) => item.stages.includes(event.stage));
  }
  if (item.route) {
    return events.filter((event) => {
      const data = event.data || {};
      if (Number(data.step) === item.step) return true;
      if (data.route === item.route) return true;
      if (item.route === "plan_dem_workflow" && isDemStage(event.stage)) return true;
      if (item.route === "plan_celeris_config" && isCelerisConfigStage(event.stage)) return true;
      if (item.route === "plan_runtime_control" && isRuntimeStage(event.stage)) return true;
      if (item.route === "plan_simulation_launch" && event.stage === "celeris_launch") return true;
      if (item.route === "plan_simulation_stop" && event.stage === "celeris_stop") return true;
      if (item.route === "answer_question" && (event.stage === "direct_research" || event.stage === "direct_research_result")) return true;
      return false;
    });
  }
  if (item.key === "dem") return events.filter((event) => isDemStage(event.stage));
  if (item.key === "config") return events.filter((event) => isCelerisConfigStage(event.stage));
  if (item.key === "runtime") return events.filter((event) => isRuntimeStage(event.stage));
  if (item.key === "research") return events.filter((event) => event.stage === "direct_research" || event.stage === "direct_research_result");
  return [];
}

function checklistStatus(item, related, latest) {
  if (!related.length) return item.key === "orchestrator" ? "active" : "pending";
  const latestRelated = related[related.length - 1];
  if (latestRelated === latest && !isCompletionStage(latestRelated.stage)) return "active";
  if (related.some((event) => isFailureStage(event.stage))) return "blocked";
  if (related.some((event) => isCompletionStage(event.stage))) return "done";
  if (latestRelated === latest) return "active";
  return "done";
}

function stepLabel(route, index) {
  const labels = {
    plan_dem_workflow: "Retrieve DEM",
    plan_celeris_config: "Generate CELERIS inputs",
    plan_runtime_control: "Control running simulation",
    plan_simulation_launch: "Launch simulation",
    plan_simulation_stop: "Stop simulation",
    answer_question: "Research answer",
    ask_clarification: "Ask for missing information",
  };
  return labels[route] || `Run workflow step ${index}`;
}

function compactProgressDetail(event) {
  if (!event?.stage) return "";
  const data = event.data || {};
  if (event.stage === "specialist_planner") return `LLM planner ${data.model || ""}`.trim();
  if (event.stage === "dem_retrieval_result") return `${data.status || "finished"}${data.seconds ? ` in ${data.seconds}s` : ""}`;
  if (event.stage === "celeris_config_result") return `${data.status || "finished"}${data.seconds ? ` in ${data.seconds}s` : ""}`;
  if (event.stage === "celeris_interpolate_bathy_done") {
    const fill = data.nan_fill || {};
    return `${data.WIDTH || "?"} x ${data.HEIGHT || "?"} grid, ${fill.filled_cells || 0} NaNs filled`;
  }
  if (event.stage === "celeris_satellite_overlay_done") {
    const output = data.output || {};
    return `${data.status || "finished"}${output.tile_count ? `, ${output.tile_count} tiles` : ""}`;
  }
  if (event.stage === "orchestrator_result") return `route ${data.route || "selected"}`;
  return event.detail || event.stage;
}

function markerForStatus(status) {
  if (status === "done") return "✓";
  if (status === "active") return "…";
  if (status === "blocked") return "!";
  return "○";
}

function isCompletionStage(stage) {
  return [
    "orchestrator_result",
    "dem_retrieval_result",
    "celeris_config_result",
    "direct_research_result",
    "turn_complete",
    "workflow_blocked",
    "workflow_error",
    "celeris_satellite_overlay_done",
    "celeris_interpolate_bathy_done",
  ].includes(stage);
}

function isFailureStage(stage) {
  return stage === "workflow_error" || stage === "workflow_blocked";
}

function isDemStage(stage) {
  return ["source_plan", "dem_retrieval", "dem_retrieval_result", "source_plan_missing_info"].includes(stage);
}

function isCelerisConfigStage(stage) {
  return String(stage || "").startsWith("celeris_") || stage === "apply_research_patch";
}

function isRuntimeStage(stage) {
  return stage === "runtime_control";
}

function formatProgressData(data) {
  const lines = [];
  addKey(lines, "model", data.model || data.planner?.model);
  addKey(lines, "model_role", data.model_role);
  addKey(lines, "planner_mode", data.planner?.mode);
  addKey(lines, "response_id", data.planner?.response_id);
  addKey(lines, "route", data.route);
  addKey(lines, "step", data.step);
  addKey(lines, "action_type", data.action_type);
  addKey(lines, "workflow_state", data.workflow_state);
  addKey(lines, "status", data.status);
  addKey(lines, "seconds", data.seconds);
  addKey(lines, "message", data.message);
  addKey(lines, "instruction", data.instruction);
  addKey(lines, "has_attachments", data.has_attachments);
  addKey(lines, "attachments", data.attachments);
  addKey(lines, "missing", data.missing);
  addKey(lines, "source_plan", data.source_plan);
  addKey(lines, "source_path", data.source_path);
  addKey(lines, "source_retrieval", data.source_retrieval);
  addKey(lines, "selected_path", data.selected_path);
  addKey(lines, "workflow_sequence", data.workflow_sequence);
  addKey(lines, "workflow_hooks", data.workflow_hooks);
  addKey(lines, "applied_hooks", data.applied_hooks);
  addKey(lines, "dem_request", data.dem_request);
  addKey(lines, "dem_request_patch", data.dem_request_patch);
  addKey(lines, "options", data.options);
  addKey(lines, "celeris_config", data.celeris_config);
  addKey(lines, "runtime_commands", data.runtime_commands);
  addKey(lines, "summary", data.summary);
  addKey(lines, "artifact_count", data.artifact_count);
  addKey(lines, "steps", data.steps);
  addKey(lines, "turn_plan_response", data.turn_plan_response);
  addKey(lines, "specialist_response", data.specialist_response);
  addKey(lines, "error", data.error || data.planner?.error);
  return lines;
}

function addKey(lines, key, value) {
  if (value === undefined || value === null || value === "") return;
  if (Array.isArray(value) && !value.length) return;
  if (typeof value === "object" && !Object.keys(value).length) return;
  const formatted = typeof value === "string" || typeof value === "number" || typeof value === "boolean"
    ? String(value)
    : JSON.stringify(value);
  lines.push(`${key}: ${formatted}`);
}
