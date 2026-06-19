# `agent/celeris/waves.py`

Writes CELERIS `waves.txt` rows for generated incident-wave cases.

The exported row contract is the CELERIS wave texture/file contract:

- amplitude
- period
- direction in radians
- random phase in radians

`write_periodic_waves(...)` builds a directional JONSWAP/TMA-style spectrum. It fits retained directional-frequency components to the periodic side-boundary convention used by `shaders/BoundaryPass.wgsl` only when the workflow passes `fit_to_periodic_boundary=true`.

Periodic fitting uses the shader's active along-boundary span, `boundary_length - 2 * ds`, because incident-wave forcing is evaluated with `iBC/jBC = 1` on one end and `N-2` on the other. For each component, the fitted along-boundary wavenumber is selected directly as:

```text
k_parallel = sign(k_parallel_raw) * 2*pi*N / active_boundary_length
```

where `N` is the nearest valid integer number of waves along the active boundary. This makes the component phase at both active boundary ends differ by an integer multiple of `2*pi`; the random phase can remain arbitrary because it is common to both ends.

The workflow sets `fit_to_periodic_boundary=true` only when the two boundaries transverse to the incident-wave boundary are both periodic. When the transverse boundaries are not periodic, the requested/generated component directions are preserved.

The returned summary records `periodic_phase_fit_applied`, `periodic_boundary_length_m`, `periodic_fitted_component_count`, and `max_periodic_phase_error_rad` so generated cases can be inspected for periodic-fit regressions.
