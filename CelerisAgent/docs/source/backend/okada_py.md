# agent/celeris/okada.py

Validated Okada DC3D helpers for earthquake initial-condition generation.

Responsibilities:

- Detect whether `okada-wrapper` is importable.
- Evaluate a simplified single-rectangle source with `okada_wrapper.dc3dwrapper`.
- Evaluate USGS finite-fault `FFM.geojson` subfault rectangles with `okada_wrapper.dc3dwrapper`.
- Convert WGS84 lon/lat subfault vertices and target points into a local meter coordinate system for Okada evaluation.

Finite-fault convention:

- Each USGS subfault polygon is parsed from its four unique `FFM.geojson` vertices.
- The two shallowest vertices define the top edge and local strike direction.
- The top-to-bottom polygon direction defines the physical dip direction.
- Okada local `x` is along the top-edge strike.
- Okada local `y` is opposite the top-to-bottom horizontal polygon direction.
- The Okada rectangle is centered on the subfault centroid and uses centered strike and dip widths.
- Positive dip-slip comes from the USGS rake and slip values.

Validation:

- `scripts/validate_usgs_okada_deformation.py` compares this module against USGS `surface_deformation.disp`.
- For USGS event `us7000srb1`, product `us7000srb1_2`, the local finite-fault Okada output reproduces the USGS vertical displacement grid with RMSE about `0.0031 m`, correlation about `0.9974`, and no factor-of-10 amplification.
- Do not replace this with the old broad tapered source kernel. There is no synthetic Okada-like fallback; initial-condition generation must fail if the validated Okada path is required but unavailable.

Dependency:

- `okada-wrapper` is a required runtime dependency for single-rectangle earthquake sources and for finite-fault sources when USGS `surface_deformation.disp` is unavailable. It is listed in `CelerisAgent/requirements.txt`.
