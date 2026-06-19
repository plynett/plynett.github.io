# Geographic Resolution

The purpose of the location-resolution stage is to convert a user's natural-language DEM location request into a reviewed WGS84 center point or bounding box before any DEM retrieval starts.

Core rules:

- Treat the user's full text and conversation history as the authority for geographic intent.
- Do not implement natural-language geography with script-side keyword lists or phrase-specific rules.
- The LLM interprets the requested place, target feature, event location, spatial relationship, and requested domain size.
- The LLM may directly propose a WGS84 center, but local code should treat that as provisional when map/geocoder evidence can be gathered.
- If map/geocoder candidates are available, use the LLM to select or derive the final center from that evidence rather than accepting an unverified coordinate.
- Use direct text-only coordinates only when evidence is unavailable or insufficient and the LLM can state medium or high confidence.
- Deterministic scripts gather evidence from map, geocoder, and available online sources, including candidate names, types, coordinates, bounding boxes, and available geometry.
- For coastal feature targets such as entrances, inlets, passes, outlets, harbor mouths, and "where X meets the ocean", first try the OpenAI web-search-backed coastal resolver. Treat it as a tool-using resolver that must return structured evidence, rejected candidates, confidence, and provenance.
- For non-coastal global requests, recent events, or explicit global sources such as ETOPO, the same geographic resolver should resolve the practical event/place center without forcing a US or shoreline assumption.
- The LLM then selects or derives the final center point from that evidence.
- When map/geocoder evidence includes line or multiline geometry, expose explicit derived points such as first endpoint, last endpoint, and representative samples. The LLM may select those derived geometry points directly when they better represent the requested entrance, outlet, or seaward connection.
- If the web-search resolver and map/geocoder resolver disagree by more than the domain-scale agreement threshold, adjudicate the alternatives with the LLM. Prefer accepted map line geometry over conflicting web-derived representative coordinates when the line geometry directly represents the requested target.
- If map evidence is weak or unavailable, the LLM may resolve from general geographic knowledge only when it can state medium or high confidence.
- For line or multiline map features, do not assume the geocoder's representative lon/lat is the requested point. If the user asks for a specific part of the feature, derive that point from the geometry evidence instead of defaulting to the feature centroid.
- For coastal DEMs, a requested entrance, inlet mouth, harbor mouth, or place where a waterway meets the ocean should normally be the practical shoreline/breakwater opening, not a far offshore navigation-channel endpoint or an inland endpoint.
- For harbor, bay, inlet, river-mouth, pass, or waterway targets that meet an ocean, gulf, sea, or open coast, prefer the seaward opening or midpoint of the seaward jetty/breakwater/barrier-island gap. The resulting DEM box should normally straddle the inner waterbody/channel and the receiving open water.
- Treat official named-feature, GNIS-style, TopoZone, and geocoder coordinates as evidence, not final truth. They may be representative centroids, channel midpoints, or interior points; the LLM should reason from geometry, source descriptions, and user intent before selecting the final grid center.
- Deterministic scripts may compute metric offsets, bounding boxes, geometry endpoints, distances, and DEM extraction windows after the LLM identifies the geographic target.
- If the user specifies a domain size in degrees, preserve it as a longitude/latitude span (`domain_width_deg`, `domain_height_deg`) through the planner. Deterministic AOI construction should create the exact WGS84 bbox around the resolved center and only then calculate approximate meter dimensions for retrieval metadata and grid-size estimates.
- Deterministic scripts must preserve explicit workflow edits such as translated or resized AOIs unless the user asks to reinterpret the location.
- Record provenance for the resolved center, including whether it came from map evidence, LLM text resolution, or deterministic geometry.
- If the final center is not grounded to an accepted map/geocoder candidate, mark it for geographic review so the chat and validation panel tell the analyst to inspect the context maps before using the DEM.

For DEM creation, the resolved point should represent the practical simulation target implied by the conversation, not a generic city, administrative label, office, shopping center, or broad waterbody unless that is what the user requested.

Unless the user explicitly asks for an offshore-only, inland-only, structure-centered, or otherwise offset domain, choose a grid center on or very near the shoreline for coastal DEM requests. The default coastal domain should usually straddle land and water rather than centering entirely offshore, inland, or on a town/harbor administrative centroid.

Local shoreline anchoring:

- After the LLM/geocoder resolves an approximate coastal center, run `resolve_shoreline_anchor` for meter-scale center-plus-domain AOIs unless the user supplied an exact bbox, locked center, or explicit degree-span domain.
- Use `shoreline_database/lines.shp` (OSM coastline, EPSG:4326) first and `shoreline_database/ne_10m_coastline.shp` (Natural Earth 10m coastline, EPSG:4326) only as fallback.
- The shoreline node should search expanding local radii, project candidate linework to a local UTM CRS, find the nearest point on the shoreline, and use that point as the DEM center when it is within the anchoring threshold.
- Keep the LLM responsible for interpreting requests such as inlet mouth, harbor entrance, beach, pier, or offshore offset. The shoreline node provides geometric grounding and should not contain location-specific phrase branches.
- Do not run shoreline snapping for exact analyst/UI-edited bboxes or explicit longitude/latitude degree-span domains; those bounds are authoritative geographic extraction windows.

Implementation notes:

- `agent/sources/aoi.py` is the public AOI resolver and orchestration layer used by DEM source retrievers.
- `agent/sources/aoi_llm.py` contains the OpenAI-backed geographic reasoning, web-search resolver, evidence selection, and adjudication prompts.
- `agent/sources/aoi_geocoder.py` contains deterministic geocoder calls, geometry summaries, derived line points, and distance helpers.
- Keep new geographic intelligence in the LLM resolver layer. Deterministic helper modules should gather evidence or apply exact numeric operations, not encode phrase-specific location rules.
