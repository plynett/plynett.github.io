# AGENTS.md - CelerisAgent

## Scope

These instructions apply to the `CelerisAgent` prototype workspace.

## Core Principle

CelerisAgent is a conversational text/voice-to-simulation setup assistant. Do not push natural-language geographic intelligence into script-side phrase rules. The LLM should interpret the user's full conversation, requested coastal feature, spatial relationships, and domain intent. Local scripts should provide deterministic hooks, evidence gathering, file conversion, DEM retrieval, grid manipulation, and provenance.

Unless the user explicitly specifies otherwise, all user-input interpretation and language intelligence must be handled by the LLM. Deterministic code may validate, store, execute, and report on structured decisions returned by the LLM, but it should not replace LLM interpretation with growing keyword lists, phrase-specific branches, or ad hoc natural-language parsing rules.

## Geographic Resolution

- Treat the user's full text and conversation history as the source of intent.
- Use tool-backed LLM reasoning for ambiguous coastal targets such as harbor entrances, inlet mouths, passes, outlets, beaches, and "where a waterbody meets the ocean."
- Scripts may gather web, map/geocoder, DEM, geometry, and source-candidate evidence, then ask the LLM to choose or revise the target center.
- Do not add location-specific or phrase-specific resolver branches for individual harbors, inlets, or beaches.
- When line or multiline map geometry is available, expose explicit derived points such as first endpoint, last endpoint, and sampled points; the LLM may select these directly.
- If resolver candidates disagree or the chosen center is not grounded in accepted map/geocoder evidence, flag the AOI for geographic review in the chat and UI.

## Workflow

- Keep generated files under `workspace/jobs`, `workspace/cache`, or `testbed` as appropriate.
- Do not create `bathy.txt` during DEM retrieval; `bathy.txt` belongs to the later CELERIS config-generation stage.
- During CELERIS config generation, the LLM should return a complete config object using documented defaults and user-provided overrides. Local scripts write `config.json`, `bathy.txt`, and `waves.txt` only after `celeris_bathy.mat` exists.
- For first-pass incident-wave setup, require a user wave direction. Set exactly one incoming wave boundary to type `2`; all other boundaries default to solid wall type `0`.
- If the user requests a no-incident-wave or tsunami initial-value run, the LLM should set `incident_wave_forcing = false`; do not ask for wave direction in that case.
- Update relevant markdown files when changing graph behavior, source priority, hooks, or agent instructions.
