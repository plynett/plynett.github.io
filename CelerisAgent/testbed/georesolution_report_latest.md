# Geographic Resolution Test Report

Run artifact: `georesolution_run_final.json`

Purpose: test whether the AOI center produced before DEM retrieval matches conversational coastal targets such as harbor entrances, inlet mouths, beaches, marinas, and bay entrances. Expected coordinates are approximate review anchors for kilometer-scale DEM domains, not survey control.

## Summary

- Total cases: 17
- PASS: 12
- REVIEW: 4
- FAIL: 1

The main failure mode is not DEM retrieval. It is geographic resolution when map/geocoder evidence is weak or unrelated and the LLM falls back to unverified geographic knowledge.

## Results

| Case | Target Type | Status | Distance | Resolved Center | Source | Notes |
|---|---:|---:|---:|---|---|---|
| Marina del Rey Harbor entrance, CA | harbor | PASS | 73 m | 33.9766, -118.4510 | llm_text_georesolver | Correctly lands at the harbor breakwater opening. Ungrounded, so review warning is appropriate. |
| Santa Cruz Harbor entrance, CA | harbor | REVIEW | 1301 m | 36.9519, -121.9917 | llm_georesolver | Needs visual review; map evidence was unrelated and fallback may be too far offshore/southeast. |
| Oceanside Harbor entrance, CA | harbor | PASS | 378 m | 33.2049, -117.4002 | llm_georesolver | Practical harbor entrance area. |
| Morro Bay Harbor entrance, CA | bay/harbor | PASS | 755 m | 35.3706, -120.8605 | llm_georesolver | Previous direct-LLM failure was corrected by evidence-based resolution. |
| Mission Bay entrance, CA | bay | PASS | 818 m | 32.7662, -117.2577 | llm_georesolver | Practical entrance area. |
| Newport Harbor entrance, CA | harbor | FAIL | 4291 m | 33.5962, -117.9298 | llm_georesolver | Clear miss; geocoder evidence was unrelated and LLM fallback hallucinated a westward location. |
| Brookings Harbor entrance, OR | harbor | PASS | 157 m | 42.0397, -124.2905 | llm_georesolver | Corrected relative to previous town-centered behavior. |
| Yaquina Bay entrance, OR | bay | REVIEW | 1442 m | 44.6220, -124.0540 | llm_georesolver | Likely near the entrance, but should be visually checked against jetties. |
| Coos Bay entrance, OR | bay | PASS | 916 m | 43.3430, -124.3210 | llm_georesolver | Practical entrance area. |
| New River Inlet mouth, NC | inlet | PASS | 0 m | 34.5274, -77.3369 | llm_georesolver | Correctly resolves the inlet mouth. |
| Duck FRF pier shoreline, NC | beach/pier | PASS | 774 m | 36.1780, -75.7450 | llm_georesolver | Close enough for a 1-2 km coastal domain; visual review still useful. |
| Government Cut ocean entrance, FL | inlet/channel | REVIEW | 2651 m | 25.7646, -80.0899 | llm_georesolver | Selects far offshore channel endpoint; likely not ideal for a 2 km entrance DEM. |
| Clearwater Pass, FL | inlet | PASS | 614 m | 27.9618, -82.8229 | llm_georesolver | Practical inlet area. |
| Galveston Harbor entrance, TX | harbor/channel | REVIEW | 1704 m | 29.3099, -94.7078 | llm_georesolver | Might be acceptable depending on whether the intended target is Gulf-side jetties or inner harbor entrance. |
| Port Aransas ship channel entrance, TX | inlet/channel | PASS | 922 m | 27.8395, -97.0415 | llm_georesolver | Practical entrance area. |
| Pearl Harbor entrance, HI | harbor | PASS | 675 m | 21.3040, -157.9620 | llm_georesolver | Practical entrance/channel opening. |
| Ala Wai Boat Harbor entrance, HI | harbor/marina | PASS | 743 m | 21.2798, -157.8459 | llm_text_georesolver | Close; ungrounded, so review warning is appropriate. |

## Changes Made From This Test

- Removed the unsafe direct high-confidence LLM shortcut as a final answer when map/geocoder evidence is available.
- Added sampled coordinates for line and multiline geocoder geometries so the LLM has more than centroid/first/last evidence.
- Added generic instructions to prefer practical shoreline or breakwater openings over far offshore navigation-channel endpoints for coastal DEM entrances.
- Added a geographic-review warning when the chosen center is not grounded to an accepted map/geocoder feature.

## Remaining Gaps

- Newport Harbor demonstrates that LLM-only fallback can still be confidently wrong when geocoder evidence is unrelated.
- Some coastal entrances need a real map validation layer, not only text/geocoder. A useful next graph node would be `validate_aoi_context`, which uses the generated local/regional context map plus available map features to confirm that the domain contains the requested shoreline, harbor mouth, inlet, or bay entrance before retrieval proceeds silently.
