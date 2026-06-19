import { dom } from "./dom.js";

const MAX_CONSOLE_ROWS = 80;
const LEVELS = ["log", "info", "warn", "error"];
const originalConsole = {};
const rows = [];
let installed = false;

export function installBrowserConsolePanel() {
  if (installed || !dom.browserConsoleList) return;
  installed = true;
  LEVELS.forEach((level) => {
    originalConsole[level] = console[level]?.bind(console) || console.log.bind(console);
    console[level] = (...args) => {
      originalConsole[level](...args);
      appendConsoleRow(level, args.map(formatConsoleArg).join(" "));
    };
  });
  window.addEventListener("error", (event) => {
    appendConsoleRow("error", `${event.message || "Script error"}${event.filename ? ` (${event.filename}:${event.lineno || "?"})` : ""}`);
  });
  window.addEventListener("unhandledrejection", (event) => {
    appendConsoleRow("error", `Unhandled promise rejection: ${formatConsoleArg(event.reason)}`);
  });
  window.addEventListener("message", (event) => {
    const data = event.data || {};
    if (data.type === "celeris-agent-console") {
      appendConsoleRow(data.level || "log", data.message || "");
    }
  });
}

function appendConsoleRow(level, message) {
  const text = String(message || "").trim();
  if (!text) return;
  if (text.startsWith("Agent case status:")) return;
  rows.push({ level, text });
  while (rows.length > MAX_CONSOLE_ROWS) rows.shift();
  renderConsoleRows();
}

function renderConsoleRows() {
  if (!dom.browserConsoleList) return;
  dom.browserConsoleList.classList.toggle("empty", rows.length === 0);
  if (!rows.length) {
    dom.browserConsoleList.textContent = "No console messages yet.";
    return;
  }
  dom.browserConsoleList.innerHTML = "";
  rows.forEach((row) => {
    const item = document.createElement("div");
    item.className = `console-row ${row.level}`;
    const text = document.createElement("span");
    text.className = "console-text";
    text.textContent = row.text;
    item.appendChild(text);
    dom.browserConsoleList.appendChild(item);
  });
  dom.browserConsoleList.scrollTop = dom.browserConsoleList.scrollHeight;
}

function formatConsoleArg(value) {
  if (value instanceof Error) {
    return value.stack || value.message;
  }
  if (typeof value === "string") {
    return value;
  }
  if (value === undefined) {
    return "undefined";
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
