import { formatCoord, formatNumber } from "./format.js";

export function getAoiGeometry(state) {
  const sourceAoi = state?.source_search?.aoi || {};
  const request = state?.dem_request || {};
  const bbox = normalizedBbox(sourceAoi.bbox_wgs84) || normalizedBbox(request.aoi_bbox_wgs84);
  if (bbox) {
    const center = bboxCenter(bbox);
    return {
      bbox,
      center,
      source: sourceAoi.bbox_wgs84 ? "source AOI bbox" : "request AOI bbox",
    };
  }

  const lon = numberOrNull(sourceAoi.center?.lon ?? request.center_lon);
  const lat = numberOrNull(sourceAoi.center?.lat ?? request.center_lat);
  const width = numberOrNull(sourceAoi.domain_width_m ?? request.domain_width_m);
  const height = numberOrNull(sourceAoi.domain_height_m ?? request.domain_height_m);
  if (lon === null || lat === null || width === null || height === null) return null;
  return {
    bbox: bboxFromCenter(lon, lat, width, height),
    center: { lon, lat },
    source: "center plus domain",
  };
}

export function mapMetaText(geometry, contextSideM) {
  const gridSize = gridSizeMeters(geometry);
  const contextKm = contextSideM / 1000;
  const contextText = contextKm >= 1 ? `${formatNumber(contextKm)} km` : `${formatNumber(contextSideM)} m`;
  return `Center ${formatCoord(geometry.center.lat)}, ${formatCoord(geometry.center.lon)}; context approx. ${contextText} wide; grid ${formatNumber(gridSize.width)} m x ${formatNumber(gridSize.height)} m; ${geometry.source}; red box enlarged for visibility.`;
}

export function gridSizeMeters(geometry) {
  const width = lonDegreesToMeters(geometry.bbox[2] - geometry.bbox[0], geometry.center.lat);
  const height = latDegreesToMeters(geometry.bbox[3] - geometry.bbox[1]);
  return { width, height };
}

export function bboxChanged(a, b) {
  return a.some((value, index) => Math.abs(value - b[index]) > 1e-8);
}

export function bboxCenter(bbox) {
  return { lon: (bbox[0] + bbox[2]) / 2, lat: (bbox[1] + bbox[3]) / 2 };
}

export function bboxFromDrag(startBbox, handle, dx, dy, view) {
  const minSizePx = 10;
  const pixels = bboxToScreenPixels(startBbox, view);
  let left = pixels.left;
  let right = pixels.right;
  let top = pixels.top;
  let bottom = pixels.bottom;

  if (handle === "move") {
    left += dx; right += dx; top += dy; bottom += dy;
  } else {
    if (handle.includes("west")) left = Math.min(right - minSizePx, left + dx);
    if (handle.includes("east")) right = Math.max(left + minSizePx, right + dx);
    if (handle.includes("north")) top = Math.min(bottom - minSizePx, top + dy);
    if (handle.includes("south")) bottom = Math.max(top + minSizePx, bottom + dy);
  }

  const nw = screenPixelToLonLat(left, top, view);
  const se = screenPixelToLonLat(right, bottom, view);
  return normalizedBbox([nw.lon, se.lat, se.lon, nw.lat]);
}

export function bboxToScreenPixels(bbox, view) {
  const minPixel = lonLatToWorldPixel(bbox[0], bbox[3], view.zoom, view.tileSize);
  const maxPixel = lonLatToWorldPixel(bbox[2], bbox[1], view.zoom, view.tileSize);
  return {
    left: view.mapWidth / 2 + minPixel.x - view.centerPixel.x,
    top: view.mapHeight / 2 + minPixel.y - view.centerPixel.y,
    right: view.mapWidth / 2 + maxPixel.x - view.centerPixel.x,
    bottom: view.mapHeight / 2 + maxPixel.y - view.centerPixel.y,
  };
}

export function screenPixelToLonLat(x, y, view) {
  const worldX = view.centerPixel.x + x - view.mapWidth / 2;
  const worldY = view.centerPixel.y + y - view.mapHeight / 2;
  return worldPixelToLonLat(worldX, worldY, view.zoom, view.tileSize);
}

export function normalizedBbox(value) {
  if (!Array.isArray(value) || value.length !== 4) return null;
  const numbers = value.map(numberOrNull);
  if (numbers.some((item) => item === null)) return null;
  const [lon0, lat0, lon1, lat1] = numbers;
  return [Math.min(lon0, lon1), Math.min(lat0, lat1), Math.max(lon0, lon1), Math.max(lat0, lat1)];
}

export function bboxFromCenter(lon, lat, widthM, heightM) {
  const halfLon = (widthM / 2) / metersPerDegreeLon(lat);
  const halfLat = (heightM / 2) / 111_320;
  return [lon - halfLon, lat - halfLat, lon + halfLon, lat + halfLat];
}

export function lonLatToWorldPixel(lon, lat, zoom, tileSize) {
  const sinLat = Math.sin((clamp(lat, -85.05112878, 85.05112878) * Math.PI) / 180);
  const scale = tileSize * 2 ** zoom;
  return {
    x: ((lon + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * scale,
  };
}

export function worldPixelToLonLat(x, y, zoom, tileSize) {
  const scale = tileSize * 2 ** zoom;
  const lon = (x / scale) * 360 - 180;
  const n = Math.PI - (2 * Math.PI * y) / scale;
  const lat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  return { lon, lat };
}

export function zoomForContext(lat, pixelSpan, targetMeters) {
  const metersPerPixel = targetMeters / pixelSpan;
  const rawZoom = Math.log2((156_543.03392 * Math.max(Math.cos((lat * Math.PI) / 180), 0.01)) / metersPerPixel);
  return clamp(Math.round(rawZoom), 3, 14);
}

export function wrapTile(value, count) {
  return ((value % count) + count) % count;
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function latDegreesToMeters(deltaLat) {
  return Math.abs(deltaLat) * 111_320;
}

function lonDegreesToMeters(deltaLon, lat) {
  return Math.abs(deltaLon) * metersPerDegreeLon(lat);
}

function metersPerDegreeLon(lat) {
  return 111_320 * Math.max(Math.cos((lat * Math.PI) / 180), 0.01);
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
