import { dom } from "./dom.js";
import {
  bboxCenter,
  bboxChanged,
  bboxFromDrag,
  bboxToScreenPixels,
  clamp,
  getAoiGeometry,
  gridSizeMeters,
  lonLatToWorldPixel,
  mapMetaText,
  wrapTile,
  zoomForContext,
} from "./map_geometry.js";
import { setEmpty } from "./ui.js";

let localAoiUpdateHandler = null;

export function setLocalAoiUpdateHandler(handler) {
  localAoiUpdateHandler = handler;
}

export function renderContextMaps(state) {
  renderRegionalMap(state);
  renderLocalMap(state);
}

export function resetContextMaps() {
  resetContextMap(dom.regionalMap, dom.regionalMapMeta);
  resetContextMap(dom.localMap, dom.localMapMeta);
}

function renderRegionalMap(state) {
  const geometry = getAoiGeometry(state);
  if (!geometry) {
    resetContextMap(dom.regionalMap, dom.regionalMapMeta);
    return;
  }
  const tileMap = renderTileMap(geometry, dom.regionalMap, 100_000);
  dom.regionalMap.className = "regional-map";
  dom.regionalMap.innerHTML = tileMap.html;
  dom.regionalMapMeta.className = "map-meta";
  dom.regionalMapMeta.textContent = mapMetaText(geometry, 100_000);
}

function renderLocalMap(state) {
  const geometry = getAoiGeometry(state);
  if (!geometry) {
    resetContextMap(dom.localMap, dom.localMapMeta);
    return;
  }
  const gridSize = gridSizeMeters(geometry);
  const contextSideM = Math.max(500, 2 * Math.max(gridSize.width, gridSize.height));
  const tileMap = renderTileMap(geometry, dom.localMap, contextSideM);
  dom.localMap.className = "regional-map";
  dom.localMap.innerHTML = tileMap.html;
  dom.localMapMeta.className = "map-meta";
  dom.localMapMeta.textContent = mapMetaText(geometry, contextSideM);
  setupLocalAoiEditor(geometry, tileMap.view, contextSideM);
}

function resetContextMap(mapElement, metaElement) {
  setEmpty(mapElement, "regional-map empty", "No resolved AOI yet.");
  setEmpty(metaElement, "map-meta empty", "No grid location to display.");
}

function renderTileMap(geometry, mapElement, contextSideM) {
  const tileSize = 256;
  const mapWidth = Math.max(260, Math.round(mapElement.clientWidth || 320));
  const mapHeight = 260;
  const zoom = zoomForContext(geometry.center.lat, Math.min(mapWidth, mapHeight), contextSideM);
  const centerPixel = lonLatToWorldPixel(geometry.center.lon, geometry.center.lat, zoom, tileSize);
  const centerTileX = Math.floor(centerPixel.x / tileSize);
  const centerTileY = Math.floor(centerPixel.y / tileSize);
  const tileCount = 2 ** zoom;
  const tiles = [];

  for (let dx = -1; dx <= 1; dx += 1) {
    for (let dy = -1; dy <= 1; dy += 1) {
      const tileX = wrapTile(centerTileX + dx, tileCount);
      const tileY = clamp(centerTileY + dy, 0, tileCount - 1);
      const tileOrigin = { x: (centerTileX + dx) * tileSize, y: (centerTileY + dy) * tileSize };
      const left = Math.round(mapWidth / 2 + tileOrigin.x - centerPixel.x);
      const top = Math.round(mapHeight / 2 + tileOrigin.y - centerPixel.y);
      tiles.push(`<img class="map-tile" alt="" src="https://tile.openstreetmap.org/${zoom}/${tileX}/${tileY}.png" style="left:${left}px;top:${top}px;">`);
    }
  }

  const pixels = bboxToScreenPixels(geometry.bbox, { mapWidth, mapHeight, zoom, tileSize, centerPixel });
  const rawWidth = Math.max(1, pixels.right - pixels.left);
  const rawHeight = Math.max(1, pixels.bottom - pixels.top);
  const markerWidth = Math.max(rawWidth, 14);
  const markerHeight = Math.max(rawHeight, 14);
  const boxLeft = Math.round(pixels.left + rawWidth / 2 - markerWidth / 2);
  const boxTop = Math.round(pixels.top + rawHeight / 2 - markerHeight / 2);

  return {
    html: `
    <div class="tile-map" style="width:${mapWidth}px;height:${mapHeight}px;">
      ${tiles.join("")}
      <div class="grid-box" title="DEM grid footprint" style="left:${boxLeft}px;top:${boxTop}px;width:${Math.round(markerWidth)}px;height:${Math.round(markerHeight)}px;"></div>
      <div class="center-dot" title="DEM grid center" style="left:${Math.round(mapWidth / 2)}px;top:${Math.round(mapHeight / 2)}px;"></div>
      <div class="map-attribution">OpenStreetMap</div>
    </div>
  `,
    view: { mapWidth, mapHeight, zoom, tileSize, centerPixel },
  };
}

function setupLocalAoiEditor(geometry, view, contextSideM) {
  const tileMap = dom.localMap.querySelector(".tile-map");
  const gridBox = dom.localMap.querySelector(".grid-box");
  if (!tileMap || !gridBox) return;

  const state = {
    originalBbox: geometry.bbox.slice(),
    bbox: geometry.bbox.slice(),
    dragging: null,
    dirty: false,
  };
  gridBox.classList.add("editable-grid-box");
  gridBox.innerHTML = `
    <span class="aoi-handle edge north" data-handle="north"></span>
    <span class="aoi-handle edge south" data-handle="south"></span>
    <span class="aoi-handle edge east" data-handle="east"></span>
    <span class="aoi-handle edge west" data-handle="west"></span>
    <span class="aoi-handle corner northwest" data-handle="northwest"></span>
    <span class="aoi-handle corner northeast" data-handle="northeast"></span>
    <span class="aoi-handle corner southwest" data-handle="southwest"></span>
    <span class="aoi-handle corner southeast" data-handle="southeast"></span>
    <span class="aoi-move-target" data-handle="move" title="Drag to move AOI"></span>
  `;

  const controls = document.createElement("div");
  controls.className = "aoi-edit-controls";
  controls.innerHTML = `
    <button class="secondary aoi-update-btn" type="button" disabled>Update Grid</button>
    <button class="secondary aoi-reset-btn" type="button" disabled>Reset AOI</button>
  `;
  dom.localMap.appendChild(controls);
  const updateBtn = controls.querySelector(".aoi-update-btn");
  const resetBtn = controls.querySelector(".aoi-reset-btn");

  const refresh = () => {
    positionGridBox(gridBox, state.bbox, view);
    const changed = bboxChanged(state.bbox, state.originalBbox);
    state.dirty = changed;
    updateBtn.disabled = !changed;
    resetBtn.disabled = !changed;
    dom.localMapMeta.textContent = `${mapMetaText({ ...geometry, bbox: state.bbox, center: bboxCenter(state.bbox) }, contextSideM)}${changed ? " Edited AOI pending update." : ""}`;
  };

  tileMap.addEventListener("pointerdown", (event) => {
    const handle = event.target?.dataset?.handle || hitTestAoiHandle(event, gridBox);
    if (!handle) return;
    event.preventDefault();
    tileMap.setPointerCapture(event.pointerId);
    state.dragging = {
      handle,
      startX: event.clientX,
      startY: event.clientY,
      startBbox: state.bbox.slice(),
    };
  });

  tileMap.addEventListener("pointermove", (event) => {
    if (!state.dragging) {
      const handle = hitTestAoiHandle(event, gridBox);
      tileMap.dataset.cursor = handle || "";
      return;
    }
    const dx = event.clientX - state.dragging.startX;
    const dy = event.clientY - state.dragging.startY;
    state.bbox = bboxFromDrag(state.dragging.startBbox, state.dragging.handle, dx, dy, view);
    refresh();
  });

  const endDrag = () => {
    state.dragging = null;
  };
  tileMap.addEventListener("pointerup", endDrag);
  tileMap.addEventListener("pointercancel", endDrag);

  resetBtn.addEventListener("click", () => {
    state.bbox = state.originalBbox.slice();
    refresh();
  });

  updateBtn.addEventListener("click", () => {
    if (!state.dirty || !localAoiUpdateHandler) return;
    localAoiUpdateHandler(state.bbox.slice());
  });

  refresh();
}

function positionGridBox(gridBox, bbox, view) {
  const pixels = bboxToScreenPixels(bbox, view);
  const rawWidth = Math.max(1, pixels.right - pixels.left);
  const rawHeight = Math.max(1, pixels.bottom - pixels.top);
  const markerWidth = Math.max(rawWidth, 14);
  const markerHeight = Math.max(rawHeight, 14);
  gridBox.style.left = `${Math.round(pixels.left + rawWidth / 2 - markerWidth / 2)}px`;
  gridBox.style.top = `${Math.round(pixels.top + rawHeight / 2 - markerHeight / 2)}px`;
  gridBox.style.width = `${Math.round(markerWidth)}px`;
  gridBox.style.height = `${Math.round(markerHeight)}px`;
}

function hitTestAoiHandle(event, gridBox) {
  const rect = gridBox.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  const tolerance = 10;
  const nearLeft = Math.abs(x) <= tolerance;
  const nearRight = Math.abs(x - rect.width) <= tolerance;
  const nearTop = Math.abs(y) <= tolerance;
  const nearBottom = Math.abs(y - rect.height) <= tolerance;
  const inside = x >= 0 && x <= rect.width && y >= 0 && y <= rect.height;
  if (!inside) return null;
  if (nearTop && nearLeft) return "northwest";
  if (nearTop && nearRight) return "northeast";
  if (nearBottom && nearLeft) return "southwest";
  if (nearBottom && nearRight) return "southeast";
  if (nearTop) return "north";
  if (nearBottom) return "south";
  if (nearLeft) return "west";
  if (nearRight) return "east";
  return "move";
}
