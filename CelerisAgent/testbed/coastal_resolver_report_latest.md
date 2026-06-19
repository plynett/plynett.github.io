# Coastal Resolver Test Report

Created: 2026-06-04T04:57:30+00:00

Summary: PASS 1, REVIEW 15, FAIL 1 across 17 resolver-only cases.

| Case | Status | Distance | Resolved Center | Source | Review Flag |
|---|---:|---:|---|---|---:|
| ca_marina_del_rey_entrance | REVIEW | 2433 m | 33.9798, -118.448 | openai_web_coastal_resolver | True |
| ca_santa_cruz_harbor_entrance | REVIEW | 647 m | 36.9669, -122.003 | llm_resolution_adjudicator_web | True |
| ca_oceanside_harbor_entrance | REVIEW | 486 m | 33.2066, -117.4022 | openai_web_coastal_resolver | True |
| ca_morro_bay_harbor_entrance | REVIEW | 669 m | 35.3603, -120.8697 | openai_web_coastal_resolver | True |
| ca_mission_bay_entrance | REVIEW | 1572 m | 32.7684, -117.2395 | llm_resolution_adjudicator_web | True |
| ca_newport_harbor_entrance | REVIEW | 1671 m | 33.5969, -117.8993 | llm_resolution_adjudicator_web | True |
| or_brookings_harbor_entrance | REVIEW | 624 m | 42.043, -124.285 | openai_web_coastal_resolver | True |
| or_yaquina_bay_entrance | REVIEW | 1105 m | 44.6208, -124.0588 | openai_web_coastal_resolver | True |
| or_coos_bay_entrance | REVIEW | 1417 m | 43.3365, -124.3225 | openai_web_coastal_resolver | True |
| nc_new_river_inlet_mouth | PASS | 148 m | 34.5262, -77.3362 | openai_web_coastal_resolver | False |
| nc_duck_frf_pier_shoreline | REVIEW | 377 m | 36.1837, -75.7469 | openai_web_coastal_resolver | True |
| fl_government_cut_ocean_entrance | REVIEW | 1533 m | 25.7611, -80.1288 | openai_web_coastal_resolver | True |
| fl_clearwater_pass | REVIEW | 91 m | 27.9622, -82.8292 | llm_resolution_adjudicator_web | True |
| tx_galveston_harbor_entrance | FAIL | 7235 m | 29.3019, -94.6503 | llm_resolution_adjudicator_web | True |
| tx_port_aransas_channel | REVIEW | 642 m | 27.8342, -97.0438 | llm_resolution_adjudicator_web | True |
| hi_pearl_harbor_entrance | REVIEW | 1091 m | 21.3088, -157.9616 | llm_resolution_adjudicator_revised | True |
| hi_ala_wai_harbor_entrance | REVIEW | 315 m | 21.2829, -157.8432 | openai_web_coastal_resolver | True |

Notes:
- This is a resolver-only test; it does not download DEMs or validate final bathymetry previews.
- PASS/REVIEW/FAIL are based on approximate kilometer-scale anchor coordinates, not survey control.
- REVIEW includes cases where the coordinate is near the anchor but the resolver path was ungrounded or adjudicated after disagreement.
- Remaining FAIL cases should not proceed silently; they either require better map-context tooling or manual analyst review using the context maps.