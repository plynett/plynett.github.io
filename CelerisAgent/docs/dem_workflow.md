# DEM Workflow Guidance

The current implemented workflow covers DEM intake and CELERIS bathymetry standardization.

Canonical DEM request fields:

- `location`: named place or study area.
- `center_description`: center point description, such as "Santa Cruz Wharf".
- `center_lon` and `center_lat`: resolved center point in WGS84 decimal degrees, if known.
- `aoi_bbox_wgs84`: resolved `[min_lon, min_lat, max_lon, max_lat]`, if known.
- `source_dataset_hint`: optional user-specified online source, DAV dataset name, CoNED layer, or other dataset name.
- `domain_width_m` and `domain_height_m`: requested Cartesian domain size in meters.
- `domain_width_deg` and `domain_height_deg`: requested geographic domain span in decimal degrees. Width is longitude span and height is latitude span. Do not convert degree requests in the LLM planner; deterministic AOI code builds the exact WGS84 bbox from the resolved center, then derives approximate meter dimensions for source extraction and downstream previews.
- `target_resolution_m`: requested output grid resolution in meters, if the user specifies it. For DAV source download, native source resolution overrides this field.
- `vertical_datum`: NAVD88, MLLW, MSL, MHW, EGM96, EGM2008, unknown, or user-specified. For DAV source download, native source datum overrides this field.
- `horizontal_crs`: EPSG code or other CRS if specified.
- `preferred_sources`: NOAA Digital Coast, USGS CoNED WCS, NOAA Sea Level Rise Viewer DEM, public NOAA gridded sources, direct URL, and user attachments.

Routing:

- If files are attached, choose `normalize_attachments`.
- If the message contains a direct HTTP/HTTPS DEM file URL, choose `normalize_url`.
- If the user asks to create or retrieve a DEM from sources and no direct file exists, choose `source_plan`.
- If the user provides missing details for an existing DEM request, choose `source_plan` and merge the new details into the prior DEM request.
- If the user asks for a relative edit to an existing request, the LLM should emit `workflow_hooks` and the deterministic local code should apply those hooks before retrieval. Implemented hooks include:
  - `translate_aoi_m`: shift the resolved AOI center by `dx_m` east/west and `dy_m` north/south in meters.
  - `set_aoi_bbox_wgs84`: set the final grid lower-left and upper-right WGS84 corners directly as `[min_lon, min_lat, max_lon, max_lat]`. Use this when the user says the current grid footprint is spatially wrong or asks the domain to include a named feature such as an inlet mouth, harbor entrance, offshore area, ocean-side boundary, or shoreline segment. The LLM handles the spatial interpretation; local code validates the bbox, derives center/domain dimensions, stores provenance, and retrieves exactly that AOI.
  - `set_domain_extents_m`: set the final grid edge extents from the current AOI anchor using `north_m`, `south_m`, `east_m`, and/or `west_m`. Use this for meter-defined final extents such as "set the north edge 500 m from the inlet and the south edge 300 m from it." Local code sets width to `east_m + west_m`, height to `north_m + south_m`, shifts the center by half the imbalance, and clears the bbox for recomputation.
  - `extend_domain_m`: add distance to existing domain edges by `north_m`, `south_m`, `east_m`, and/or `west_m`. Use this only when the user clearly means to grow the current boundary by an additional amount, such as "add another 500 m north." Local code updates width, height, center, and AOI bbox deterministically.
  - `set_preferred_sources`: replace the source path with canonical source IDs such as `usgs_coned_wcs`, `noaa_slr_viewer_dem`, `public_noaa_gridded`, or `noaa_dem_global_mosaic`.
  - `clear_source_dataset_hint`: remove a prior DAV dataset hint when the user switches to a source node such as CoNED WCS.
  - `rerun_source_retrieval`: explicitly rerun retrieval using the current request state.
- If source retrieval is needed, apply the source hierarchy below.
- Implemented tiered retrieval module: `agent.sources.tiered.retrieve_tiered_dem`.
- CLI wrapper for debugging: `scripts/tiered_dem_retrieval.py`.

Source hierarchy for requests without a directly supplied DEM file:

- Tier 1: If the user specifies a particular dataset in the US, search NOAA DAV for that dataset first. This includes named DEM and lidar datasets. If DAV exposes a direct raster export, use it. If DAV exposes only full-product, bulk, S3, USGS, or provider links, download the dataset if it is accessible. Before large downloads, tell the user the estimated size and that it may take time.
- Tier 1 outputs that are already raster DEMs can proceed to DEM standardization. Tier 1 outputs that are lidar/point-cloud products must be staged with metadata and marked as not yet converted to a CELERIS bathymetry artifact.
- Tier 2: If the user does not specify a dataset, or the specified dataset is not found/downloadable, try USGS CoNED WCS extraction first. If CoNED has no usable coverage or extraction fails, try NOAA Sea Level Rise Viewer DEM.
- Tier 3: If Tier 2 cannot produce an extractable DEM, try public NOAA gridded sources through NOAA ImageServer endpoints. The implemented order is NOAA DEM Global Mosaic best available first, then CRM Mosaic, then ETOPO 2022 Bedrock 15 arcseconds as the global fallback.
- If online sources cannot produce an extractable DEM, report `online_sources_exhausted`.
- This hierarchy is US-focused for the current prototype. Non-US requests currently fall through the available source rankings and may require user-provided data.

Missing information logic:

- A usable named-source DEM request needs an AOI.
- AOI may be a bounding box, polygon, center point plus meter domain width and height, or center point plus longitude/latitude degree span.
- Requests such as "3 degrees on a side" should set `domain_width_deg=3` and `domain_height_deg=3`, not a small meter fallback. The deterministic AOI node converts this to `[center_lon - 1.5, center_lat - 1.5, center_lon + 1.5, center_lat + 1.5]` with latitude clamped to WGS84 limits.
- Prefer `aoi_bbox_wgs84` for conversational corrections to the actual footprint. If the user says "the mouth of the inlet should be included", "the east side should show ocean", or "move the grid so it captures the harbor entrance", the LLM should output final lower-left and upper-right corners through `set_aoi_bbox_wgs84` instead of relying on a center-only shift.
- For default coastal center-plus-domain requests, run `resolve_shoreline_anchor` after the LLM/geocoder resolves an approximate center and before `build_aoi_bbox`. The node uses local OSM coastline first and Natural Earth fallback to snap the center to the nearest shoreline. Exact `aoi_bbox_wgs84` requests remain locked and are not shoreline-snapped.
- If a prior turn gave target resolution and a later turn gives center/domain, treat the AOI as sufficient for planning.
- Fuzzy center descriptions are acceptable when the LLM can infer a practical center point. The resolver may use `llm_spatial_inference` to convert the phrase into approximate WGS84 coordinates, and the provenance must be preserved in source metadata.
- If vertical datum or target resolution is missing for a DAV retrieval, proceed with the selected dataset's native vertical datum and native resolution.

NOAA Digital Coast Tier 1 retrieval:

- When the request is complete, the source branch may resolve the AOI center, query NOAA DAV candidates, rank them, and save candidate metadata.
- Use DAV as Tier 1 only when the user specifies a dataset/source name or requests a specific high-resolution US source.
- For Tier 1, include DEM and lidar candidates in search. Prefer exact or strong name matches to the user's requested source.
- If a ranked DEM candidate exposes an ArcGIS ImageServer, export a GeoTIFF directly for the AOI and route that file through CELERIS bathy standardization.
- If a ranked candidate only exposes full-product/provider links, download through `noaa_dav_full_dataset_download` after notifying the user of estimated size and time. Bulk tile subsetting is not part of the active graph.
- Download in native vertical datum and native/source resolution when available. Preserve native or service-native resolution in the job state and DEM manifest.
- Do not use lidar candidates as default substitutes when the user did not ask for that dataset. Default no-source requests should go to CoNED WCS first, then NOAA SLR.

USGS CoNED and NOAA SLR Tier 2 retrieval:

- Try `usgs_coned_wcs_catalog_match`, `usgs_coned_wcs_describe`, and `usgs_coned_wcs_extract` before NOAA SLR for US coastal AOIs.
- Avoid full WCS `GetCapabilities` during normal requests; use a cached CoNED layer catalog plus targeted `DescribeCoverage`.
- If CoNED WCS returns a GeoTIFF subset, route that GeoTIFF through normal DEM standardization.
- If CoNED has no coverage or extraction fails, try `noaa_slr_viewer_dem_search` and `noaa_slr_viewer_dem_extract`.
- Store source resolution type as `archive_native`, `service_native`, or `unknown` in metadata.

Public NOAA gridded fallback:

- Use `public_noaa_gridded_search`, `rank_public_noaa_gridded`, and `public_noaa_gridded_extract` after CoNED and SLR fail, or when `preferred_sources` explicitly requests `public_noaa_gridded`, `noaa_grid_extract`, `noaa_dem_global_mosaic`, `crm`, or `etopo`.
- Use NOAA Grid Extract ArcGIS ImageServer exports to retrieve clipped GeoTIFFs for the AOI.
- Query NOAA DEM Global Mosaic for the best available catalog raster over the AOI and export that first when no explicit CRM/ETOPO source is specified. If the global mosaic export fails or validates as unusable, try CRM Mosaic, then ETOPO 2022 Bedrock 15 arcseconds.
- Preserve service-native resolution, vertical datum, requested bbox, snapped source bbox, and source URL metadata in `dem_manifest.json`.

DEM export boundary:

- DEM retrieval and standardization scripts must create `celeris_bathy.mat`, `preview.png`, and `dem_manifest.json`.
- MATLAB bathymetry input/output follows MATLAB plotting convention: matrix rows map to `y`/`lat`, columns map to `x`/`lon`, so `pcolor(x, y, h)` or `pcolor(lon, lat, h)` should show the same orientation as the source bathymetry.
- For uploaded `celeris_bathy.mat` files, prefer `h`/`z` for bed elevation and use the file's `x`/`y` vectors as the primary model axes when present. Preserve `lon`/`lat` as separate geographic mapping axes when present; do not replace `x`/`y` with `lon`/`lat`.
- Do not create `bathy.txt` in this stage. `bathy.txt` must be generated later with `config.json` by the generalized CELERIS config script after it loads `celeris_bathy.mat` and receives the remaining simulation setup information.
