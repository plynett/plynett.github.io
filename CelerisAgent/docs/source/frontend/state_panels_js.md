# `js/state_panels.js`

Owns sidebar and right-pane state rendering other than maps and simulation.

Responsibilities:

- DEM Request summary.
- CELERIS Config summary.
- Simulation Info summary populated from embedded CELERIS runtime state.
- Workflow Path.
- Source Candidates.
- Artifacts.
- Validation.
- DEM Preview.

Keep rendering deterministic from backend state or explicit iframe runtime state. Do not infer missing workflow details in this file.

Source candidate cards should render provider/source metadata from explicit candidate fields. Public NOAA gridded candidates may not have DAV `data_type` fields, so use their `source_family`, `source`, and `resolution_degrees` metadata rather than falling back to local-source wording.
