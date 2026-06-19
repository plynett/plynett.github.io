# CelerisAgent Chat Prototype

This is a chat-first prototype for the CELERIS voice/text-to-simulation workflow. The current scope covers DEM preparation and first-pass CELERIS input generation:

```text
chat instruction + optional DEM files/source URL
-> workflow graph routing
-> tiered DEM source retrieval
-> DEM loading and standardization
-> celeris_bathy.mat, preview.png, dem_manifest.json
-> conversational wave/config setup
-> config.json, bathy.txt, waves.txt, celeris_case_manifest.json
```

`bathy.txt` is intentionally not created by the DEM retrieval/standardization stage. It is a downstream CELERIS case artifact generated together with `config.json` and `waves.txt` after the config-generation workflow reads `celeris_bathy.mat` and receives simulation setup details.

The Agent entry point is `CelerisAgent/index.html`, served under `/CelerisAgent/`. The repository root `index.html` remains the CELERIS core entry point.

## Run

```bash
cd C:\Users\plynett\Documents\GitHub\plynett.github.io\CelerisAgent
python app.py --host 127.0.0.1 --port 8765
```

Open:

```text
http://127.0.0.1:8765/CelerisAgent/
```

The same development server also serves the unchanged root CELERIS core at:

```text
http://127.0.0.1:8765/
http://127.0.0.1:8765/agent.html
```

## Directory Layout

```text
CelerisAgent/
|-- index.html                 # Chat-first landing page
|-- ui.css
|-- app.py                     # Server entry point
|-- js/
|   |-- main.js                # Frontend event wiring
|   |-- api.js                 # Browser API calls
|   |-- dom.js                 # DOM bindings
|   |-- render.js              # Thin render coordinator
|   |-- messages.js            # Chat messages and progress state
|   |-- state_panels.js        # DEM/config/artifact/source/validation panels
|   |-- simulation.js          # Embedded CELERIS runner and runtime controls
|   |-- maps.js                # Regional/local map DOM rendering and AOI editor
|   |-- map_geometry.js        # Pure bbox/tile/screen geometry math
|   |-- confirm.js             # Large extraction confirmation prompt
|   |-- format.js              # Formatting and escaping helpers
|   `-- ui.js                  # Shared DOM helpers
|-- agent/
|   |-- server.py              # Static serving, chat API, artifact downloads
|   |-- chat.py                # Chat turn orchestration
|   |-- thread_archive.py      # Portable configuration archive export/restore
|   |-- chat_planner.py        # LLM/heuristic action planning
|   |-- chat_state.py          # DEM request schema, parsing, source ranking
|   |-- chat_hooks.py          # Deterministic workflow hook execution
|   |-- chat_responses.py      # Assistant response text
|   |-- geo.py                 # Shared WGS84/metric geometry helpers
|   |-- openai_client.py       # OpenAI Responses API wrapper
|   |-- sources/               # NOAA DAV, CoNED WCS, public NOAA gridded sources
|   |-- celeris/               # CELERIS config, bathy.txt, and waves.txt generation
|   `-- dem/
|       |-- loaders.py         # GeoTIFF, NetCDF, ASCII grid, text/XYZ, MAT, NumPy
|       |-- processing.py      # Sign, units, nodata, downsampling
|       |-- validation.py      # Deterministic review checks
|       |-- export.py          # CELERIS bathymetry outputs
|       `-- workflow.py
|-- registry/
|   |-- nodes.json             # Implemented script graph node registry
|   `-- data_sources.json      # DEM source registry
|-- docs/
|   `-- source/                # Per-source frontend notes and backend source map
`-- workspace/
    |-- jobs/                  # One folder per chat thread/job
    |-- cache/
    `-- logs/
```

Each chat thread stores its own files under:

```text
workspace/jobs/<job_id>/
|-- attachments/
|-- downloads/
|-- work/
|-- outputs/
|-- logs/
|-- state.json
`-- transcript.jsonl
```

The Current Thread sidebar includes a **Download Simulation Configuration** link after a job exists. The download is a portable zip archive containing generated outputs, JSON provenance metadata, portable state, transcript exports, `THREAD_SUMMARY.md`, and `archive_manifest.json`. Uploading that zip back into a new chat restores the configuration into the new job, regenerates artifact URLs, and clears stale embedded-runner state so the user can continue from the saved setup.

## Current Chat Behaviors

- Attach a DEM file and describe it in the composer.
- Paste a direct HTTP/HTTPS DEM URL.
- Ask for a DEM from online sources; the agent creates a source plan, asks for AOI details, and follows the tiered source graph.
- Tier 1: if the user specifies a particular US dataset, query NOAA DAV first and download it if accessible, including full-dataset downloads when AOI extraction is unavailable.
- Tier 2: if no dataset is specified or Tier 1 is unavailable, try USGS CoNED WCS first, then NOAA Sea Level Rise Viewer DEM.
- Tier 3: if DAV/CoNED/SLR cannot produce an extractable DEM, try public NOAA gridded ImageServer exports for CRM Mosaic and ETOPO 2022 Bedrock 15 arcseconds.
- If online retrieval cannot produce an extractable DEM, the workflow reports the online source failure.
- For NOAA DAV candidates with ArcGIS ImageServer metadata, export a native-resolution GeoTIFF in the source's native vertical datum and normalize it into CELERIS bathymetry artifacts.
- Include simple processing instructions in natural language, such as `invert z`, `fill nodata`, `NAVD88`, or `EPSG:26910`.
- Show a regional context map in the right pane once an AOI is resolved. The map uses roughly a 100 km context view with the selected grid footprint marked in red.
- Show a local context map below the regional map. Its context width is twice the maximum resolved grid dimension, so a 2 km by 1 km grid is shown inside an approximately 4 km by 4 km local map.
- Generate first-pass CELERIS inputs from the current `celeris_bathy.mat` when the user provides wave direction. The config generator writes `config.json`, `bathy.txt`, `waves.txt`, and `celeris_case_manifest.json`.
- In OpenAI-enabled operation, the LLM is the normal interpreter for user language. Local deterministic code executes the returned structured action and workflow hooks; regex parsing is reserved for the no-key/failure fallback path.

## Implemented Source Nodes

- `resolve_aoi_center`: request coordinates, curated aliases, feature-aware LLM spatial inference, or geocoder fallback.
- `build_aoi_bbox`: WGS84 bbox from explicit bbox or center plus domain size.
- `route_online_dem_source_tiers`: Tier 1 user-specified DAV dataset, Tier 2 CoNED WCS/SLR, Tier 3 public NOAA gridded sources.
- `noaa_dav_search_missions`: NOAA DAV `/search/missions` query for intersecting lidar and DEM candidates.
- `noaa_dav_search_user_dataset`: DAV search for a user-specified US dataset, including DEM and lidar candidates.
- `rank_noaa_dav_candidates`: NOAA DAV DEM candidate ranking for direct raster export.
- `noaa_arcgis_export_image`: direct GeoTIFF export from DAV candidates that expose ArcGIS ImageServer.
- `noaa_dav_full_dataset_download`: direct full-product/provider-link download for user-specified DAV datasets.
- `usgs_coned_wcs_extract`: targeted CoNED WCS GeoTIFF extraction for US coastal AOIs.
- `noaa_slr_viewer_dem_extract`: NOAA Sea Level Rise Viewer DEM extraction when CoNED is unavailable.
- `public_noaa_gridded_search`, `rank_public_noaa_gridded`, `public_noaa_gridded_extract`: public NOAA Grid Extract ImageServer exports using CRM Mosaic first and ETOPO 2022 Bedrock 15 arcseconds as global fallback.
- `parse_celeris_config_request`: merge conversational simulation setup details with Korea JLOTS defaults.
- `validate_celeris_config_request`: require wave direction and validate exactly one incoming wave boundary.
- `load_celeris_bathy_mat`: load canonical bathymetry from the DEM stage.
- `interpolate_bathy_to_model_grid`: create the CELERIS model grid at requested `dx`/`dy`.
- `write_bathy_txt`, `generate_periodic_wave_file`, `write_celeris_config_json`, `write_celeris_case_manifest`: write first-pass CELERIS input artifacts.

## Implemented DEM Loaders

- GeoTIFF: `.tif`, `.tiff`
- NetCDF: `.nc`, `.cdf`
- ESRI ASCII grid: `.asc`, `.grd`
- Text matrix or XYZ: `.txt`, `.csv`, `.xyz`
- MATLAB: `.mat`
- NumPy: `.npy`, `.npz`
- ZIP bundles containing supported files

## Optional OpenAI Routing

Set `OPENAI_API_KEY` before starting the server to use OpenAI for source-request planning. Without a key, the app uses a deterministic heuristic planner.
