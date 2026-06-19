# Conversation Regression Run - Sediment Transport Expansion

Suite definition: `conversation_regression_suite_20260611.md`  
Runner: `run_conversation_regression_20260611.py`  
Raw results: `conversation_regression_results_20260612_122435_sediment_full.json`

## Summary

- Tests run: 21
- Turns run: 70
- Sediment-covered tests: 13 of 21
- HTTP errors: 0
- Request exceptions: 0
- Unsupported runtime-control responses: 0
- Finished: 2026-06-12T19:47:07.634723+00:00

## Sediment Coverage

Sediment transport conversation was added to these cases:

`T01`, `T03`, `T04`, `T06`, `T07`, `T11`, `T12`, `T13`, `T14`, `T15`, `T16`, `T20`, `T21`

The added sediment turns exercised:

- Transport on/off.
- D50, porosity, specific gravity.
- Critical Shields and erosion psi.
- Sediment state inspection.
- Sediment plot quantities.
- Multi-action prompts mixing sediment with visualization and pause/resume commands.

## Observations

- Sediment runtime planning behaved correctly across all added cases.
- Multi-command sediment prompts produced the expected `sediment.*` runtime commands.
- Mixed prompts such as sediment plus plot quantity, and resume plus sediment plus plot quantity, routed correctly.
- Status-only sediment questions answered from current state without the previous unsupported-control message.

## Non-Sediment Warnings

These warnings were present in the run and do not appear to be caused by the sediment additions:

- Several DEM cases reported `GEOGRAPHIC_CENTER_UNGROUNDED`, meaning the AOI center was resolved by LLM geographic reasoning without a directly accepted map/geocoder feature.
- `T08` correctly stopped at large-extraction approval for Port of LA.
- `T17` generated a very coarse San Juan fallback config grid: 4 by 4 cells at roughly 440 m by 464 m. This should be reviewed separately if Puerto Rico/global fallback fidelity is important.
- `T20.2` returned a missing crest-width prompt as expected, but the validation status recorded `CELERIS_RUNTIME_COMMAND_NOT_APPLIED` because no command is queued while waiting for the missing linear-structure value.

## Slowest Turns

The slowest turns were DEM/config/run setup turns, not sediment controls. The slowest observed turn was `T12.1` at 85.617 s.
