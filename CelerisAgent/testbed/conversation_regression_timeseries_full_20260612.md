# Conversation Regression Run - Time Series Expansion

Suite definition: `conversation_regression_suite_20260611.md`  
Runner: `run_conversation_regression_20260611.py`  
Raw results: `conversation_regression_results_20260612_timeseries_full_rerun.json`  
Servers restarted before run: Agent `http://127.0.0.1:8765`, CELERIS `http://127.0.0.1:8000`

## Summary

- Tests run: 21
- Turns run: 86
- Time-series prompts added to: 14 of 21 tests
- Successful time-series runtime coverage: 13 of 21 tests
- HTTP/API errors: 0
- Unsupported runtime-control responses: 0
- Finished run duration: 1326.2 measured turn-seconds
- Mean turn time: 15.42 s
- Median turn time: 7.60 s
- Slowest turn: `T12.1` at 70.943 s

## Time-Series Coverage

Time-series conversation was added to:

`T01`, `T02`, `T03`, `T04`, `T06`, `T07`, `T11`, `T12`, `T13`, `T14`, `T15`, `T16`, `T20`, `T21`

Successful runtime time-series commands were produced in:

`T01`, `T02`, `T03`, `T04`, `T06`, `T07`, `T11`, `T12`, `T13`, `T14`, `T16`, `T20`, `T21`

The added prompts exercised:

- 1, 2, 3, 4, and 5 active gauges.
- Time-series durations of 180 s, 240 s, 300 s, and 600 s.
- Explicit x/y gauge placement.
- Right-click placement preparation for named/visual locations.
- Combined runtime control plus state-reporting prompts.

## Behavior Notes

- Time-series routing worked for running examples and generated cases.
- Integer gauge formatting is now active after server restart: responses use `location 1`, `location 2`, etc., and runtime state stores location keys as `"1"`, `"2"`, etc.
- Named/visual gauge placement correctly uses `timeseries.prepare_click_location`, because the LLM cannot know exact model-domain coordinates for locations such as "near the pier" or "inside/outside the harbor".
- Prompts that ask for several named/visual gauges queue multiple right-click placements. The final selected gauge is the last requested gauge, so the user must right-click placements sequentially.

## Issues Found

### P1 - T15 Missing `celeris_bathy.mat` After DEM Retrieval

Prompt:

`Create a coastal DEM for Marina del Rey Harbor. target 2 km by 2 km domain, centered at the entrance of the harbor. Then make inputs with waves from the west and run.`

Observed:

- The agent reported a successful USGS CoNED DEM retrieval.
- Config generation then failed with `MISSING_CELERIS_BATHY`.
- Follow-up visualization, sediment, and time-series runtime prompts stayed in `needs_dem`.

Priority:

High. This is a workflow consistency issue: if DEM retrieval reports success, `celeris_bathy.mat` must exist or the retrieval response should be a failure. Check the DEM artifact write path and validation after CoNED retrieval.

### P2 - T20 Linear-Structure Missing-Value Recovery Regressed

Prompts:

`add a breakwater with crest elevation of 1m, crest width of , and side slope of 1/2`

`crest width is 2 m`

Observed:

- First response correctly asked only for crest width.
- Follow-up `crest width is 2 m` repeated the missing crest-width prompt instead of completing the pending linear-structure setup.

Priority:

Medium-high. This was previously working and is unrelated to time-series behavior. Check `pending_linear_structure` persistence and the runtime planner route for follow-up correction prompts.

### P3 - Several Geographic Warnings Remain

Observed `GEOGRAPHIC_CENTER_UNGROUNDED` warnings in:

`T05`, `T09`, `T10`, `T17`, `T18`, `T19`

Priority:

Medium. These are not failures, but they indicate the AOI was accepted from LLM reasoning without a directly accepted geocoder/map feature. Continue improving shoreline/map evidence grounding.

### P4 - T17 Puerto Rico Fallback Remains Too Coarse

Observed:

- San Juan Harbor fallback generated a 4 by 4 model grid at roughly 440 m by 464 m.

Priority:

Medium. This known issue is not caused by time-series changes, but the workflow should block or warn harder before running harbor-scale cases on a grid this coarse.

## Slowest Turns

- `T12.1` Galveston DEM/config/run: 70.943 s
- `T16.1` Oregon Inlet DEM/config/run: 59.633 s
- `T03.1` La Jolla DEM/config/run: 56.356 s
- `T04.1` Oceanside DEM/config/run: 55.142 s
- `T06.1` Duck NC DEM/config/run: 54.380 s
- `T02.1` Santa Cruz DEM/config/run: 52.974 s
- `T13.1` Miami Government Cut DEM/config/run: 50.404 s
- `T11.1` Yaquina Bay DEM/config/run: 46.845 s
- `T19.1` Crescent City DEM retrieval: 45.119 s
- `T05.1` New River Inlet DEM retrieval: 42.261 s

The slow turns are still DEM/config/run workflows, not time-series runtime controls.
