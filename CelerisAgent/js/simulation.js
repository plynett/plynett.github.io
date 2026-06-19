import { dom } from "./dom.js";
import { escapeHtml } from "./format.js";
import { renderSimulationInfo } from "./state_panels.js";
import { setEmpty } from "./ui.js";

let simulationCloseHandler = null;
const appliedRuntimeControlIds = new Set();
let simulationKeyboardActive = false;
let currentSimulationViewMode = "design";
let latestSimulationState = {};
let simulationStateTimer = null;
let timeSeriesChart = null;

const PLOT_QUANTITY_OPTIONS = [
  ["free_surface_elevation", "Free Surface Elevation (m)", 0],
  ["bathymetry_topography", "Bathymetry/Topography (m)", 6],
  ["bottom_friction_map", "Bottom Friction Map", 15],
  ["fluid_speed", "Fluid Speed (m/s)", 1],
  ["x_velocity", "East-West (x) Velocity (m/s)", 2],
  ["y_velocity", "North-South (y) Velocity (m/s)", 3],
  ["vertical_vorticity", "Vertical Vorticity (1/s)", 4],
  ["mean_abs_vertical_vorticity", "Mean |Vertical Vorticity| (1/s)", 23],
  ["foam_tracer_concentration", "Foam / Tracer Concentration", 5],
  ["mean_foam_tracer_concentration", "Mean Foam / Tracer Concentration", 11],
  ["max_free_surface_elevation", "Max Free Surface Elev (m)", 16],
  ["mean_free_surface_elevation", "Mean Free Surface Elev (m)", 7],
  ["mean_fluid_speed_magnitude", "Mean Fluid Speed [Magn] (m/s)", 8],
  ["mean_fluid_speed_x", "Mean Fluid Speed [E-W] (m/s)", 9],
  ["mean_fluid_speed_y", "Mean Fluid Speed [N-S] (m/s)", 10],
  ["rms_wave_height", "RMS Wave Height (m)", 12],
  ["significant_wave_height", "Significant Wave Height (m)", 13],
  ["baseline_hs_difference", "Difference from Baseline Hs (m)", 14],
  ["sediment_depth_change", "Depth Change due to Sed Transport", 21],
  ["sediment_class_1_concentration", "Sediment Class 1 Concentration", 17],
  ["sediment_class_1_erosion_rate", "Sediment Class 1 Erosion Rate", 18],
  ["sediment_class_1_available_depth", "Sediment Class 1 Available Depth", 19],
  ["design_component_map", "Design Component Map", 22],
];

const COLORMAP_OPTIONS = [
  ["ocean", "Ocean", 0],
  ["parula", "Parula", 1],
  ["turbo", "Turbo", 2],
  ["hsv", "HSV", 3],
  ["gray", "Gray", 4],
  ["pink", "Pink", 5],
  ["bathy_topo", "Bathy/Topo", 6],
];

export function setSimulationCloseHandler(handler) {
  simulationCloseHandler = handler;
}

export function renderSimulation(run, summary = {}) {
  if (!run?.runner_url) {
    resetSimulation();
    return;
  }
  const url = run.runner_url;
  const layout = chooseSimulationLayout(run, summary);
  dom.chatMain.classList.add("with-simulation");
  dom.chatMain.classList.toggle("split-vertical", layout === "portrait");
  dom.chatMain.classList.toggle("split-horizontal", layout !== "portrait");

  const existingFrame = dom.simulationPanel.querySelector(".simulation-frame");
  if (existingFrame?.dataset.runnerUrl === url) {
    dom.simulationPanel.classList.toggle("simulation-layout-portrait", layout === "portrait");
    dom.simulationPanel.classList.toggle("simulation-layout-landscape", layout !== "portrait");
    populateVisualizationToolbar(summary);
    requestSimulationState();
    startSimulationStatePolling();
    updateViewModeButtonState();
    return;
  }

  dom.simulationPanel.className = `simulation-stage ${layout === "portrait" ? "simulation-layout-portrait" : "simulation-layout-landscape"}`;
  dom.simulationPanel.innerHTML = `
    <div class="simulation-runner">
      <div class="simulation-view-controls" role="group" aria-label="Simulation view controls">
        <button class="simulation-view-button" type="button" data-view-command="design">Design</button>
        <button class="simulation-view-button" type="button" data-view-command="explorer">Explorer</button>
        <button class="simulation-view-button" type="button" data-view-command="fullscreen">Full Screen</button>
        <button class="simulation-view-button simulation-pause-toggle" type="button">Pause Sim</button>
        <button class="simulation-view-button simulation-close" type="button">Close</button>
      </div>
      <div class="simulation-canvas-stack">
        <div class="simulation-viz-controls" role="group" aria-label="Simulation visualization controls">
          <label>
            <span>Property to Plot:</span>
            <select data-viz-control="surface">${optionMarkup(PLOT_QUANTITY_OPTIONS)}</select>
          </label>
          <label>
            <span>Colorbar Choices:</span>
            <select data-viz-control="colormap">${optionMarkup(COLORMAP_OPTIONS)}</select>
          </label>
          <label>
            <span>Minimum Color Axis Value (in units of plotted property):</span>
            <input data-viz-control="color-min" type="number" step="0.1" inputmode="decimal" placeholder="min">
          </label>
          <label>
            <span>Maximum Color Axis Value (in units of plotted property):</span>
            <input data-viz-control="color-max" type="number" step="0.1" inputmode="decimal" placeholder="max">
          </label>
        </div>
        <div class="simulation-display-region">
          <iframe class="simulation-frame" src="${escapeHtml(url)}" title="Local CELERIS simulation runner" tabindex="0" allow="fullscreen" allowfullscreen></iframe>
          <section class="simulation-timeseries-panel" aria-label="Time series plot">
            <div class="simulation-timeseries-title">Time Series Plots</div>
            <div class="simulation-timeseries-content">
              <canvas id="timeseriesChart" class="simulation-timeseries-canvas" width="640" height="300"></canvas>
            </div>
            <div class="simulation-timeseries-meta">No active time series.</div>
          </section>
        </div>
      </div>
    </div>
  `;
  const frame = dom.simulationPanel.querySelector(".simulation-frame");
  if (frame) {
    frame.dataset.runnerUrl = url;
    currentSimulationViewMode = "design";
    frame.addEventListener("load", () => {
      frame.dataset.loaded = "1";
      scheduleSimulationStateRequests();
      startSimulationStatePolling();
    });
    frame.addEventListener("focus", () => setSimulationKeyboardActive(true));
  }
  dom.simulationPanel.querySelector(".simulation-close")?.addEventListener("click", () => {
    resetSimulation();
    if (simulationCloseHandler) simulationCloseHandler();
  });
  dom.simulationPanel.querySelector(".simulation-pause-toggle")?.addEventListener("click", () => handlePauseToggle());
  dom.simulationPanel.querySelectorAll("[data-view-command]").forEach((button) => {
    button.addEventListener("click", () => handleSimulationViewButton(button.dataset.viewCommand));
  });
  setupSimulationVizControls();
  populateVisualizationToolbar(summary);
  updateViewModeButtonState();
  updatePauseButtonState();
}

export function renderRuntimeControl(control) {
  if (!control?.id || appliedRuntimeControlIds.has(control.id) || !Array.isArray(control.commands) || !control.commands.length) {
    return;
  }
  const frame = dom.simulationPanel.querySelector(".simulation-frame");
  if (!frame?.contentWindow) {
    return;
  }
  let sent = false;
  const send = () => {
    if (sent || appliedRuntimeControlIds.has(control.id) || !frame.contentWindow) return;
    sent = true;
    appliedRuntimeControlIds.add(control.id);
    frame.contentWindow.postMessage(
      {
        type: "celeris-agent-command",
        id: control.id,
        commands: control.commands,
      },
      "*",
    );
  };
  if (frame.dataset.loaded === "1") {
    send();
  } else {
    frame.addEventListener("load", send, { once: true });
    window.setTimeout(send, 750);
  }
}

export function resetSimulation() {
  releaseSimulationKeyboard(false);
  currentSimulationViewMode = "design";
  latestSimulationState = {};
  destroyTimeSeriesChart();
  stopSimulationStatePolling();
  renderSimulationInfo(null);
  dom.chatMain.classList.remove("with-simulation", "split-vertical", "split-horizontal");
  dom.simulationPanel.classList.remove("has-timeseries");
  setEmpty(dom.simulationPanel, "simulation-stage empty", "No simulation runner prepared yet.");
}

function handleSimulationViewButton(command) {
  if (command === "design") {
    postRuntimeCommands([
      {
        namespace: "visualization",
        action: "set_view_mode",
        args: { view_mode: "design_2d" },
      },
    ]);
    releaseSimulationKeyboard(true);
    setActiveViewButton("design");
    return;
  }
  if (command === "explorer") {
    postRuntimeCommands([
      {
        namespace: "visualization",
        action: "set_view_mode",
        args: { view_mode: "explorer_3d" },
      },
    ]);
    focusSimulationFrame();
    setActiveViewButton("explorer");
    return;
  }
  if (command === "fullscreen") {
    enterSimulationFullscreen();
    setActiveViewButton("explorer");
  }
}

function handlePauseToggle() {
  const isPaused = Number(latestSimulationState?.simPause) === 1;
  const pauseState = isPaused ? "resume" : "pause";
  const sent = postRuntimeCommands([
    {
      namespace: "simulation",
      action: "set_pause",
      args: { pause_state: pauseState },
    },
  ]);
  if (sent) {
    latestSimulationState = { ...latestSimulationState, simPause: pauseState === "pause" ? 1 : -1 };
    updatePauseButtonState();
  }
}

function setupSimulationVizControls() {
  dom.simulationPanel.querySelectorAll("[data-viz-control]").forEach((control) => {
    control.addEventListener("focus", () => releaseSimulationKeyboard(false));
  });
  dom.simulationPanel.querySelector('[data-viz-control="surface"]')?.addEventListener("change", (event) => {
    postRuntimeCommands([
      {
        namespace: "visualization",
        action: "set_plot_quantity",
        args: { plot_quantity: event.target.value },
      },
    ]);
  });
  dom.simulationPanel.querySelector('[data-viz-control="colormap"]')?.addEventListener("change", (event) => {
    postRuntimeCommands([
      {
        namespace: "visualization",
        action: "set_colormap",
        args: { colormap: event.target.value },
      },
    ]);
  });
  setupColorAxisInput("color-min", "set_color_axis_min", "color_axis_min");
  setupColorAxisInput("color-max", "set_color_axis_max", "color_axis_max");
}

function setupColorAxisInput(controlName, action, argName) {
  const input = dom.simulationPanel.querySelector(`[data-viz-control="${controlName}"]`);
  if (!input) return;
  const submitValue = () => postColorAxisCommand(action, argName, input.value, input);
  input.addEventListener("input", submitValue);
  input.addEventListener("change", submitValue);
  input.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    submitValue();
    input.blur();
  });
}

function postColorAxisCommand(action, argName, rawValue, input = null) {
  const value = Number(rawValue);
  if (!Number.isFinite(value)) return;
  if (input && input.dataset.lastSentValue === String(value)) return;
  if (input) {
    input.dataset.lastSentValue = String(value);
  }
  postRuntimeCommands([
    {
      namespace: "visualization",
      action,
      args: { [argName]: value },
    },
  ]);
}

async function enterSimulationFullscreen() {
  const frame = dom.simulationPanel.querySelector(".simulation-frame");
  postRuntimeCommands([
    {
      namespace: "visualization",
      action: "set_view_mode",
      args: { view_mode: "explorer_3d" },
    },
  ]);
  focusSimulationFrame();
  try {
    if (frame?.requestFullscreen && !document.fullscreenElement) {
      await frame.requestFullscreen();
    }
  } catch {
    // The embedded runner still has its own pseudo-fullscreen fallback.
  }
  postRuntimeCommands([
    {
      namespace: "view",
      action: "enter_fullscreen",
      args: { fullscreen_state: "enter" },
    },
  ]);
}

export function postRuntimeCommands(commands) {
  const frame = dom.simulationPanel.querySelector(".simulation-frame");
  if (!frame?.contentWindow) {
    return false;
  }
  frame.contentWindow.postMessage(
    {
      type: "celeris-agent-command",
      id: `ui_runtime_${Date.now()}`,
      commands,
    },
    "*",
  );
  window.setTimeout(requestSimulationState, 150);
  return true;
}

function optionMarkup(options) {
  return options.map(([value, label]) => `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`).join("");
}

function populateVisualizationToolbar(values = {}) {
  setControlValue("surface", keyForValue(PLOT_QUANTITY_OPTIONS, values.surfaceToPlot) || "free_surface_elevation");
  setControlValue("colormap", keyForValue(COLORMAP_OPTIONS, values.colorMap_choice) || "ocean");
  setControlValue("color-min", finiteOrDefault(values.colorVal_min, -1.0));
  setControlValue("color-max", finiteOrDefault(values.colorVal_max, 1.0));
}

function updateTimeSeriesPanel(state = {}) {
  const plot = state.timeSeriesPlot || {};
  const count = Number(plot.count || state.NumberOfTimeSeries || 0);
  const hasSeries = count > 0 && Array.isArray(plot.series) && plot.series.length > 0;
  dom.simulationPanel.classList.toggle("has-timeseries", hasSeries);
  const canvas = dom.simulationPanel.querySelector(".simulation-timeseries-canvas");
  const meta = dom.simulationPanel.querySelector(".simulation-timeseries-meta");
  if (!canvas || !meta) return;
  const locations = Array.isArray(state.timeSeriesLocations) ? state.timeSeriesLocations : [];
  if (!hasSeries) {
    meta.textContent = "No active time series.";
    clearTimeSeriesChart();
    return;
  }
  const activeLocations = locations
    .filter((location) => Number(location.index) <= count)
    .map((location) => {
      const x = Number(location.x_m);
      const y = Number(location.y_m);
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        return `L${location.index}: unset`;
      }
      return `L${location.index}: x ${x.toFixed(1)} m, y ${y.toFixed(1)} m`;
    });
  meta.textContent = activeLocations.length ? activeLocations.join(" | ") : `${count} active time series`;
  updateTimeSeriesChart(canvas, plot);
}

function updateTimeSeriesChart(canvas, plot) {
  if (!window.Chart) {
    const meta = dom.simulationPanel.querySelector(".simulation-timeseries-meta");
    if (meta) meta.textContent = "Time series data active; Chart.js is still loading.";
    return;
  }
  const time = Array.isArray(plot.time) ? plot.time.map(Number) : [];
  const series = Array.isArray(plot.series) ? plot.series : [];
  const labels = time.filter(Number.isFinite);
  const colors = timeSeriesChartColors();
  const datasets = series.map((item, index) => {
    const eta = Array.isArray(item.eta) ? item.eta.map((value) => Number(value)).filter(Number.isFinite) : [];
    return {
      label: `Location ${item.index || index + 1}`,
      data: eta,
      borderColor: colors[index % colors.length],
      borderWidth: 1,
      fill: false,
      tension: 0.4,
      pointRadius: 0,
    };
  });
  const maxduration = Number(plot.maxduration_s);
  if (!timeSeriesChart || timeSeriesChart.canvas !== canvas) {
    destroyTimeSeriesChart();
    timeSeriesChart = new window.Chart(canvas.getContext("2d"), {
      type: "line",
      data: { labels, datasets },
      options: timeSeriesChartOptions(maxduration),
    });
    return;
  }
  timeSeriesChart.data.labels = labels;
  timeSeriesChart.data.datasets = datasets;
  timeSeriesChart.options.scales.x.max = Number.isFinite(maxduration) ? maxduration : 1;
  timeSeriesChart.options.scales.x.ticks.stepSize = (Number.isFinite(maxduration) ? maxduration : 1) / 20.0;
  timeSeriesChart.update();
}

function timeSeriesChartOptions(maxduration) {
  const duration = Number.isFinite(maxduration) ? maxduration : 1;
  return {
    responsive: false,
    maintainAspectRatio: false,
    scales: {
      x: {
        type: "linear",
        position: "bottom",
        min: 0,
        max: duration,
        ticks: {
          stepSize: duration / 20.0,
        },
        title: {
          display: true,
          text: "Time (s)",
        },
      },
      y: {
        title: {
          display: true,
          text: "Elevation (m)",
        },
        beginAtZero: true,
      },
    },
    animation: {
      duration: 0,
    },
    hover: {
      animationDuration: 0,
    },
    responsiveAnimationDuration: 0,
  };
}

function timeSeriesChartColors() {
  return [
    "rgb(75, 192, 192)",
    "rgb(255, 99, 132)",
    "rgb(54, 162, 235)",
    "rgb(255, 206, 86)",
    "rgb(75, 192, 75)",
    "rgb(153, 102, 255)",
    "rgb(255, 159, 64)",
    "rgb(199, 199, 199)",
    "rgb(83, 102, 255)",
    "rgb(40, 159, 64)",
    "rgb(210, 45, 0)",
    "rgb(0, 128, 128)",
    "rgb(128, 0, 128)",
    "rgb(128, 128, 0)",
    "rgb(0, 0, 128)",
  ];
}

function clearTimeSeriesChart() {
  if (!timeSeriesChart) return;
  timeSeriesChart.data.labels = [];
  timeSeriesChart.data.datasets = [];
  timeSeriesChart.update();
}

function destroyTimeSeriesChart() {
  if (!timeSeriesChart) return;
  timeSeriesChart.destroy();
  timeSeriesChart = null;
}

function setControlValue(controlName, value) {
  const control = dom.simulationPanel.querySelector(`[data-viz-control="${controlName}"]`);
  if (!control || value === undefined || value === null) return;
  if (control === document.activeElement && control.tagName === "INPUT") return;
  control.value = String(value);
  if (control.tagName === "INPUT") {
    control.dataset.lastSentValue = String(value);
  }
}

function keyForValue(options, rawValue) {
  const value = Number(rawValue);
  if (!Number.isFinite(value)) return null;
  const match = options.find((option) => Number(option[2]) === value);
  return match?.[0] || null;
}

function finiteOrDefault(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function requestSimulationState() {
  const frame = dom.simulationPanel.querySelector(".simulation-frame");
  if (!frame?.contentWindow || frame.dataset.loaded !== "1") return;
  frame.contentWindow.postMessage(
    {
      type: "celeris-agent-state-request",
      id: `ui_state_${Date.now()}`,
    },
    "*",
  );
}

function scheduleSimulationStateRequests() {
  requestSimulationState();
  window.setTimeout(requestSimulationState, 250);
  window.setTimeout(requestSimulationState, 1000);
}

function startSimulationStatePolling() {
  if (simulationStateTimer) return;
  simulationStateTimer = window.setInterval(requestSimulationState, 1000);
}

function stopSimulationStatePolling() {
  if (!simulationStateTimer) return;
  window.clearInterval(simulationStateTimer);
  simulationStateTimer = null;
}

function focusSimulationFrame() {
  const frame = dom.simulationPanel.querySelector(".simulation-frame");
  if (!frame) {
    return;
  }
  setSimulationKeyboardActive(true);
  frame.focus();
  frame.contentWindow?.focus();
}

function setSimulationKeyboardActive(active) {
  simulationKeyboardActive = active;
  dom.simulationPanel.classList.toggle("simulation-keyboard-active", active);
  updateViewModeButtonState();
}

function releaseSimulationKeyboard(focusChat = false) {
  if (!simulationKeyboardActive && !focusChat) {
    return;
  }
  setSimulationKeyboardActive(false);
  if (focusChat) {
    dom.messageInput.focus();
  }
}

function setActiveViewButton(command) {
  if (command === "design" || command === "explorer") {
    currentSimulationViewMode = command;
  }
  dom.simulationPanel.querySelectorAll("[data-view-command]").forEach((button) => {
    button.classList.toggle("active", button.dataset.viewCommand === currentSimulationViewMode);
  });
}

function updateViewModeButtonState() {
  dom.simulationPanel.querySelectorAll("[data-view-command]").forEach((button) => {
    button.classList.toggle("active", button.dataset.viewCommand === currentSimulationViewMode);
    button.classList.toggle("keyboard-active", simulationKeyboardActive && button.dataset.viewCommand === "explorer");
  });
}

function updatePauseButtonState() {
  const button = dom.simulationPanel.querySelector(".simulation-pause-toggle");
  if (!button) return;
  const isPaused = Number(latestSimulationState?.simPause) === 1;
  button.textContent = isPaused ? "Resume Sim" : "Pause Sim";
  button.classList.toggle("active", isPaused);
}

function chooseSimulationLayout(run, summary) {
  const orientation = run.layout?.orientation;
  if (orientation === "portrait" || orientation === "landscape") {
    return orientation;
  }
  const width = Number(summary.WIDTH || 0) * Number(summary.dx || 1);
  const height = Number(summary.HEIGHT || 0) * Number(summary.dy || 1);
  return height > width ? "portrait" : "landscape";
}

dom.composer.addEventListener("focusin", () => releaseSimulationKeyboard(false));
dom.messages.addEventListener("focusin", () => releaseSimulationKeyboard(false));
dom.messages.addEventListener("click", () => releaseSimulationKeyboard(false));
window.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type === "celeris-agent-keyboard-release") {
    releaseSimulationKeyboard(true);
    return;
  }
  if (data.type === "celeris-agent-state-result" && data.ok && data.state) {
    latestSimulationState = data.state;
    populateVisualizationToolbar(data.state);
    updateTimeSeriesPanel(data.state);
    updatePauseButtonState();
    renderSimulationInfo({ ...data.state, running: true });
  }
});
document.addEventListener("fullscreenchange", () => {
  if (!document.fullscreenElement && dom.simulationPanel.querySelector(".simulation-frame")) {
    postRuntimeCommands([
      { namespace: "view", action: "exit_fullscreen_cleanup", args: {} },
    ]);
    setActiveViewButton("design");
    releaseSimulationKeyboard(true);
  }
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && simulationKeyboardActive) {
    releaseSimulationKeyboard(true);
  }
});
