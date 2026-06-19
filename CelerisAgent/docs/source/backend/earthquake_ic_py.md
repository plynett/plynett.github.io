# agent/celeris/earthquake_ic.py

Generates optional CELERIS initial free-surface files for earthquake-style tsunami starts.

Responsibilities:

- Read a structured `celeris_config.initial_condition` object.
- Map the earthquake center from WGS84 lon/lat onto the final CELERIS model grid. If the model preserves one-dimensional `lon` and `lat` axes from a geographic DEM, use those axes directly rather than an inferred DEM search center.
- Generate either a simplified single-rectangle source or a USGS finite-fault subfault-sum source according to `initial_condition.source_model`.
- Generate `outputs/etaInitCond.txt` with exactly the same row/column shape as `bathy.txt`.
- Write `outputs/earthquake_ic_manifest.json` with parameters, provenance, validation checks, and summary range.
- Write `outputs/earthquake_ic_preview.png` for quick analyst review.

Current numerical status:

- The single-rectangle implementation requires `okada-wrapper` DC3D. If the validated Okada wrapper cannot be imported or evaluated, generation fails and no synthetic fallback initial condition is written.
- The USGS finite-fault implementation prefers `surface_deformation.disp` when the finite-fault product provides it. That file's vertical displacement column is interpolated directly to the final CELERIS model grid.
- If `surface_deformation.disp` is unavailable, `FFM.geojson` subfaults are evaluated with `okada-wrapper` DC3D on a finite-fault-resolution source grid, then interpolated to the final CELERIS model grid.
- If both `surface_deformation.disp` and `okada-wrapper` are unavailable, generation fails and no synthetic finite-fault fallback initial condition is written.
- `scripts/validate_usgs_okada_deformation.py` compares the local finite-fault Okada output against USGS `surface_deformation.disp`. For the Philippines `us7000srb1` product, the checked DC3D path reproduces the USGS grid with millimeter-scale RMSE and correlation near 0.997.

Defaults:

- `depth_km = 15`
- `dip_deg = 10`
- `rake_deg = 90`
- `length_km = 400`
- `width_km = 150`
- `slip_m = 10`
- `rigidity_pa = 30000000000`
- `poisson_ratio = 0.25`

Validation:

- The generated eta grid must match the final model grid shape.
- The generated eta grid must contain only finite values.
- Missing `strike_deg` is allowed for prototyping, but records a warning and uses `0` degrees.
- For USGS-derived sources, preserve `center_lon` and `center_lat` as the event epicenter unless the user explicitly requests a rupture centroid or alternate source reference.
- Finite-fault generation requires `initial_condition.finite_fault.url` to point to a USGS `FFM.geojson` file. If that URL is missing or no usable slipping subfaults can be parsed, the workflow returns an error instead of silently falling back.
- When using `surface_deformation.disp`, preserve its own source grid and vertical displacement range in the manifest. When using the Okada finite-fault fallback, use `initial_condition.finite_fault.subfault_length_km` and `subfault_width_km` as the source-grid resolution when available. DEM resolution is not the finite-fault source resolution.
