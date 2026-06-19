from __future__ import annotations

import math
from typing import Any


METERS_PER_DEGREE_LAT = 111_320.0


def bbox_from_center(lon: float, lat: float, width_m: float, height_m: float) -> list[float]:
    half_lon = (width_m / 2.0) / meters_per_degree_lon(lat)
    half_lat = (height_m / 2.0) / METERS_PER_DEGREE_LAT
    return [lon - half_lon, lat - half_lat, lon + half_lon, lat + half_lat]


def bbox_from_center_degrees(lon: float, lat: float, width_deg: float, height_deg: float) -> list[float]:
    half_lon = abs(width_deg) / 2.0
    half_lat = abs(height_deg) / 2.0
    return [lon - half_lon, max(-90.0, lat - half_lat), lon + half_lon, min(90.0, lat + half_lat)]


def lat_degrees_to_meters(delta_lat: float) -> float:
    return abs(delta_lat) * METERS_PER_DEGREE_LAT


def lon_degrees_to_meters(delta_lon: float, lat: float) -> float:
    return abs(delta_lon) * meters_per_degree_lon(lat)


def meters_per_degree_lon(lat: float) -> float:
    return METERS_PER_DEGREE_LAT * max(math.cos(math.radians(lat)), 0.01)


def normalize_bbox_wgs84(bbox: list[Any]) -> tuple[float, float, float, float]:
    lon0, lat0, lon1, lat1 = (float(value) for value in bbox)
    return min(lon0, lon1), min(lat0, lat1), max(lon0, lon1), max(lat0, lat1)


def translate_lon_lat(lon: float, lat: float, dx_m: float, dy_m: float) -> tuple[float, float]:
    return lon + dx_m / meters_per_degree_lon(lat), lat + dy_m / METERS_PER_DEGREE_LAT
