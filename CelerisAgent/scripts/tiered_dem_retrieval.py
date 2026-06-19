from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from agent.geo import lat_degrees_to_meters, lon_degrees_to_meters
from agent.sources.tiered import retrieve_tiered_dem


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Retrieve a DEM through the tiered CELERIS source graph.")
    parser.add_argument("--job-dir", required=True, help="Job/work directory for outputs.")
    parser.add_argument("--bbox", nargs=4, type=float, metavar=("MIN_LON", "MIN_LAT", "MAX_LON", "MAX_LAT"))
    parser.add_argument("--center-lon", type=float)
    parser.add_argument("--center-lat", type=float)
    parser.add_argument("--width-m", type=float)
    parser.add_argument("--height-m", type=float)
    parser.add_argument("--location", default="tiered DEM request")
    parser.add_argument("--center-description")
    parser.add_argument("--dataset", help="User-specified dataset/source hint for Tier 1 DAV retrieval.")
    parser.add_argument("--resolution-m", type=float)
    args = parser.parse_args(argv)

    dem_request: dict = {
        "location": args.location,
        "center_description": args.center_description,
        "source_dataset_hint": args.dataset,
        "target_resolution_m": args.resolution_m,
        "preferred_sources": [],
    }
    if args.bbox:
        min_lon, min_lat, max_lon, max_lat = args.bbox
        center_lat = (min_lat + max_lat) / 2.0
        dem_request.update(
            {
                "aoi_bbox_wgs84": [min_lon, min_lat, max_lon, max_lat],
                "center_lon": (min_lon + max_lon) / 2.0,
                "center_lat": center_lat,
                "domain_width_m": lon_degrees_to_meters(max_lon - min_lon, center_lat),
                "domain_height_m": lat_degrees_to_meters(max_lat - min_lat),
            }
        )
    else:
        if None in (args.center_lon, args.center_lat, args.width_m, args.height_m):
            parser.error("Provide either --bbox or --center-lon --center-lat --width-m --height-m.")
        dem_request.update(
            {
                "center_lon": args.center_lon,
                "center_lat": args.center_lat,
                "domain_width_m": args.width_m,
                "domain_height_m": args.height_m,
            }
        )
    result = retrieve_tiered_dem(Path(args.job_dir), dem_request, {"sign_mode": "auto", "max_cells": 0})
    json.dump(result, sys.stdout, indent=2)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
