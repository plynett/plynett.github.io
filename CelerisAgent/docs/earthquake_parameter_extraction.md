# Earthquake Parameter Extraction

USGS is the preferred first source for earthquake source parameters unless the user specifies another authoritative source.

For a USGS event:

- Use the USGS event page or event ID as the primary identifier.
- Query the USGS/ComCat event-detail GeoJSON before relying on generic web-search snippets. The endpoint is `https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&eventid=<event_id>`.
- Inspect `properties.products` and list the available product keys in the answer or notes when relevant.
- Use the event origin/catalog information for:
  - `event_name`
  - origin time
  - `center_lat`
  - `center_lon`
  - `depth_km`
  - `magnitude_mw` when the magnitude type is Mw/Mww or clearly moment magnitude
- Check the USGS moment tensor or focal mechanism product for:
  - `strike_deg`
  - `dip_deg`
  - `rake_deg`
- If the moment tensor provides two nodal planes and no product identifies the actual fault plane, report both alternatives in the answer. Only assign one to `strike_deg`, `dip_deg`, and `rake_deg` when the source or tectonic context supports a preferred plane; otherwise leave those fields missing and explain the ambiguity.
- Check the USGS finite-fault product when available. Prefer finite-fault information over generic scaling laws for:
  - fault plane choice
  - rupture dimensions
  - slip distribution
  - representative or maximum `slip_m`
  - `length_km`
  - `width_km`
- If multiple finite-fault products are available, prefer the newest reviewed product unless the user specifies otherwise.
- For a first-pass single-rectangle Okada source, use finite-fault `model-strike`, `model-dip`, and `model-rake` as the fault orientation.
- Do not treat finite-fault `model-length` and `model-width` as the physical rupture length and width. Those values describe the finite-fault inversion/model plane dimensions, which may include weakly slipped padding around the actual rupture.
- When `FFM.geojson` or an equivalent subfault grid is available, derive an effective rupture rectangle from the slipped subfault distribution. The current deterministic first-pass rule is the bounding subfault-index patch containing cells with slip at least 10 percent of the USGS maximum finite-fault slip. Record the threshold, active subfault count, and moment fraction in notes/metadata.
- Do not use USGS `maximum-slip` as the uniform Okada `slip_m` unless the user explicitly asks for maximum slip. Record maximum slip in notes.
- Prefer a moment-equivalent uniform slip for `slip_m`, computed from `M0 = mu * area * slip`, where `M0 = 10^(1.5 * Mw + 9.1)` N-m, `area = effective_rupture_length_m * effective_rupture_width_m`, and the default rigidity is `mu = 30000000000` Pa unless a source-specific rigidity is available.
- If a finite-fault grid such as `FFM.geojson` is available, report its subfault slip summary and store its download URL/product metadata in `celeris_config.initial_condition.finite_fault`.
- The researched patch should keep `source_model = single_rectangle` and `finite_fault.selection = unconfirmed` until the user chooses. The config workflow should then ask whether to use the downloadable finite-fault subfault solution or the simplified single-rectangle average source.
- If the user chooses the finite-fault solution, set `source_model = usgs_finite_fault` and `finite_fault.selection = finite_fault`. If the user chooses the simple average source, set `source_model = single_rectangle` and `finite_fault.selection = single_rectangle`.
- For the simplified single-rectangle path, keep `slip_m` moment-consistent with the effective rupture rectangle. For the finite-fault path, `FFM.geojson` subfault slips drive the initial-condition generator.
- If finite-fault geometry is unavailable, then and only then derive a complete first-pass rectangle from accepted magnitude-scaling relations. Label those values as inferred/scaling-law estimates and include the relation/source in notes.

Structured patch mapping:

- `center_lat` maps to `celeris_config.initial_condition.center_lat`.
- `center_lon` maps to `celeris_config.initial_condition.center_lon`.
- `depth_km` maps to `celeris_config.initial_condition.depth_km`.
- moment magnitude maps to `celeris_config.initial_condition.magnitude_mw`.
- preferred strike/dip/rake map to `strike_deg`, `dip_deg`, and `rake_deg`.
- rupture length/width/slip map to `length_km`, `width_km`, and `slip_m`.
- finite-fault source metadata maps to `finite_fault.available`, `finite_fault.url`, `finite_fault.event_id`, `finite_fault.product_code`, `finite_fault.review_status`, `finite_fault.subfault_count`, `finite_fault.slip_count`, and subfault dimensions when available.
- event title or USGS event ID should be included in `event_name` and/or notes.

Always include source URLs and confidence for extracted values. Values from direct USGS fields are high confidence. Values from USGS finite-fault product geometry are high confidence for the selected finite-fault model. Moment-equivalent uniform slip derived from USGS Mw and finite-fault area should be marked medium confidence because it is a simplification for the single-rectangle Okada approximation. Values requiring generic magnitude-scaling laws are medium or low confidence unless independently supported.
