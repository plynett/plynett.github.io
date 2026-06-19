from __future__ import annotations

import copy
import time
from typing import Any

import requests

from agent.geo import lat_degrees_to_meters, lon_degrees_to_meters
from agent.sources.common import USER_AGENT


NOMINATIM_SEARCH = "https://nominatim.openstreetmap.org/search"
GEOCODER_CACHE: dict[str, list[dict[str, Any]]] = {}


def collect_geocoder_candidates(queries: list[str]) -> list[dict[str, Any]]:
    candidates: list[dict[str, Any]] = []
    seen = set()
    for index, query in enumerate(queries[:4]):
        if not query:
            continue
        matches = cached_geocoder_query(query)
        for match in matches:
            key = (match.get("osm_type"), match.get("osm_id"), match.get("display_name"), match.get("lon"), match.get("lat"))
            if key in seen:
                continue
            seen.add(key)
            candidates.append(candidate_summary(match, query))
        if len(candidates) >= 8:
            break
    return candidates[:24]


def cached_geocoder_query(query: str) -> list[dict[str, Any]]:
    cached = GEOCODER_CACHE.get(query)
    if cached is not None:
        return copy.deepcopy(cached)
    if GEOCODER_CACHE:
        time.sleep(1.1)
    try:
        response = requests.get(
            NOMINATIM_SEARCH,
            headers={"User-Agent": USER_AGENT},
            params={"format": "json", "q": query, "limit": 6, "polygon_geojson": 1},
            timeout=20,
        )
        response.raise_for_status()
        matches = response.json()
    except Exception:
        matches = []
    GEOCODER_CACHE[query] = copy.deepcopy(matches)
    return matches


def geocoder_queries(request_context: dict[str, Any], plan: dict[str, Any]) -> list[str]:
    raw_queries = [
        *(str(item).strip() for item in plan.get("queries", []) if str(item).strip()),
        " ".join(str(part).strip() for part in (request_context.get("center_description"), request_context.get("location")) if part),
        str(request_context.get("location") or "").strip(),
    ]
    result = []
    seen = set()
    for query in raw_queries:
        for variant in query_variants(query):
            key = variant.lower()
            if variant and key not in seen:
                seen.add(key)
                result.append(variant)
    return result[:16]


def query_variants(query: str) -> list[str]:
    query = " ".join(str(query or "").split())
    if not query:
        return []
    variants = [query]
    replacements = {
        " NC": " North Carolina",
        " CA": " California",
        " OR": " Oregon",
        " FL": " Florida",
        " TX": " Texas",
        " HI": " Hawaii",
        " SC": " South Carolina",
    }
    padded = f" {query}"
    for short, long_name in replacements.items():
        if short in padded:
            variants.append(padded.replace(short, long_name).strip())
    return variants


def candidate_summary(match: dict[str, Any], query: str) -> dict[str, Any]:
    return {
        "display_name": match.get("display_name"),
        "lon": number_or_none(match.get("lon")),
        "lat": number_or_none(match.get("lat")),
        "class": match.get("class"),
        "type": match.get("type"),
        "boundingbox": match.get("boundingbox"),
        "geometry": geometry_summary(match.get("geojson")),
        "query": query,
        "importance": number_or_none(match.get("importance")),
        "license": match.get("licence"),
    }


def geocode_first_match(query: str) -> dict[str, Any] | None:
    if not query:
        return None
    try:
        response = requests.get(
            NOMINATIM_SEARCH,
            headers={"User-Agent": USER_AGENT},
            params={"format": "json", "q": query, "limit": 1},
            timeout=20,
        )
        response.raise_for_status()
        matches = response.json()
    except Exception:
        return None
    if not matches:
        return None
    match = matches[0]
    return {
        "lon": float(match["lon"]),
        "lat": float(match["lat"]),
        "label": match.get("display_name") or query,
        "source": "nominatim_fallback",
        "license": match.get("licence"),
    }


def geometry_summary(geojson: Any) -> dict[str, Any] | None:
    if not isinstance(geojson, dict):
        return None
    geometry_type = geojson.get("type")
    coordinates = geojson.get("coordinates")
    if geometry_type == "LineString" and isinstance(coordinates, list) and coordinates:
        samples = sampled_coordinates(coordinates)
        return {
            "type": "LineString",
            "first_lon_lat": coordinates[0],
            "last_lon_lat": coordinates[-1],
            "sample_lon_lat": samples,
            "derived_points": derived_line_points(coordinates, samples),
            "point_count": len(coordinates),
        }
    if geometry_type == "MultiLineString" and isinstance(coordinates, list) and coordinates:
        longest = max((line for line in coordinates if isinstance(line, list)), key=len, default=[])
        if longest:
            samples = sampled_coordinates(longest)
            return {
                "type": "MultiLineString",
                "first_lon_lat": longest[0],
                "last_lon_lat": longest[-1],
                "sample_lon_lat": samples,
                "derived_points": derived_line_points(longest, samples),
                "point_count": len(longest),
            }
    if geometry_type == "Point" and isinstance(coordinates, list):
        return {"type": "Point", "lon_lat": coordinates}
    if geometry_type in {"Polygon", "MultiPolygon"}:
        return {"type": geometry_type, "bounds_hint": "use boundingbox for extent"}
    return {"type": geometry_type}


def sampled_coordinates(coordinates: list[Any], max_points: int = 9) -> list[Any]:
    if len(coordinates) <= max_points:
        return coordinates
    indexes = sorted({round(i * (len(coordinates) - 1) / (max_points - 1)) for i in range(max_points)})
    return [coordinates[index] for index in indexes]


def derived_line_points(coordinates: list[Any], samples: list[Any]) -> list[dict[str, Any]]:
    points = [{"role": "first_endpoint", "lon_lat": coordinates[0]}, {"role": "last_endpoint", "lon_lat": coordinates[-1]}]
    for index, point in enumerate(samples):
        role = "sample"
        if point == coordinates[0]:
            role = "first_endpoint"
        elif point == coordinates[-1]:
            role = "last_endpoint"
        points.append({"role": role, "sample_index": index, "lon_lat": point})
    deduped = []
    seen = set()
    for item in points:
        lon_lat = item.get("lon_lat")
        key = tuple(lon_lat) if isinstance(lon_lat, list) else None
        if key and key not in seen:
            seen.add(key)
            deduped.append(item)
    return deduped


def center_distance_m(lon0: float, lat0: float, lon1: float, lat1: float) -> float:
    import math

    dx = lon_degrees_to_meters(lon1 - lon0, (lat0 + lat1) / 2.0)
    dy = lat_degrees_to_meters(lat1 - lat0)
    return math.hypot(dx, dy)


def number_or_none(value: Any) -> float | None:
    try:
        if value is None:
            return None
        return float(value)
    except (TypeError, ValueError):
        return None
