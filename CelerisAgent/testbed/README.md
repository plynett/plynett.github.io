# DEM Conversation Testbed

This directory stores conversational smoke tests for the CelerisAgent web interface.

The active test set is `dem_conversation_cases.json`. Each case is a separate chat thread with 2-3 user turns. The cases intentionally include missing details, informal wording, typo-like phrasing, and conversational corrections so the LLM planner has to maintain state rather than parse a single perfect command.

Run results are written to `run_report_*.json` and summarized in `run_report_latest.md`.

## Coverage

- Hawaii: Waikiki / Ala Wai Harbor
- Oregon: Cannon Beach / Haystack Rock
- California: Monterey Harbor / Fisherman's Wharf
- Texas: Galveston beach / Pleasure Pier
- Florida: Miami South Beach / Government Cut
- North Carolina: Duck Pier / Field Research Facility

## Expected Interface Behavior

- Preserve conversation state across turns.
- Ask for missing AOI details when needed.
- Accept fuzzy or typo-prone place descriptions.
- Use direct AOI bounds or center/domain fields once enough detail exists.
- Route through implemented source tiers only.
- Produce a clear state and artifact outcome, even when a source fails or falls back.
