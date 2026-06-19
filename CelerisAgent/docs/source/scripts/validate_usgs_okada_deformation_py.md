# scripts/validate_usgs_okada_deformation.py

Diagnostic script for validating the local finite-fault Okada implementation against a USGS finite-fault deformation product.

Responsibilities:

- Download a USGS `FFM.geojson` finite-fault product.
- Download the paired USGS `surface_deformation.disp` file.
- Recompute vertical displacement from the finite-fault subfaults with `agent.celeris.okada.okada_finite_fault_surface`.
- Report computed range, USGS range, RMSE, MAE, bias, correlation, best-fit scale, and max absolute error.
- Optionally write the report to JSON for provenance.

Default test case:

- Event: `us7000srb1`
- Product: `us7000srb1_2`
- Earthquake: M 7.8, Philippines, June 7, 2026

Use:

```powershell
cd C:\Users\plynett\Documents\GitHub\plynett.github.io\CelerisAgent
python scripts\validate_usgs_okada_deformation.py --output-json workspace\okada_validation_us7000srb1.json
```

Interpretation:

- The script is a numerical regression check for the Okada geometry convention.
- A close match to `surface_deformation.disp` confirms that the finite-fault deformation path is using the correct subfault geometry, rake/slip sign, and local coordinate convention.
- It is not used by the live chat workflow; it is a developer validation tool.
