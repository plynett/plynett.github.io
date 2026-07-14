# NTHMP Tsunami Benchmarking

This folder is the working area for benchmarking Celeris-WebGPU against the NTHMP tsunami inundation benchmark set.

The required inundation set from the NTHMP summary is BP 1, BP 4, BP 6, BP 7, and BP 9. Optional benchmark problems from the 2011 workshop repository can be added later, but they are not the first approval-focused target.

## Authoritative Sources

- NTHMP summary: https://www.weather.gov/media/nthmp/MMS/Benchmarking/TsunamiInundationBenchmarkProblemsSummary.pdf
- NTHMP MMS benchmarking page: https://www.weather.gov/nthmp/SubMapModel
- PMEL-135 benchmark pages and data: https://nctr.pmel.noaa.gov/benchmark/
- 2011 workshop benchmark repository: https://github.com/rjleveque/nthmp-benchmark-problems
- Report style reference: https://www.weather.gov/media/nthmp/MMS/Benchmarking/Report-SCHISM-Jan2025.pdf

## Local Layout

- `benchmark_inventory.json`: tracked case inventory, source URLs, acceptance targets, and Celeris setup plan.
- `runs/BP01/pilot_solitary_disturbance/run_WebGPU.py`: BP01 browser runner, kept in the run directory.
- `run_bp04.py`: Python browser runner wrapper for Case A and Case C; calls MATLAB generation and MATLAB processing.
- `run_bp06.py`: Python browser runner wrapper for Case B and Case C; calls MATLAB generation and MATLAB processing.
- `run_bp07.py`: Python browser runner wrapper; calls MATLAB generation and MATLAB processing.
- `run_bp09.py`: Python browser runner wrapper for the Okushiri nested grid sequence; calls MATLAB generation and MATLAB processing.
- `matlab/nthmp_generate.m`: bare-bones MATLAB input generator for BP01, BP04, BP06, BP07, and BP09.
- `matlab/nthmp_process.m`: bare-bones MATLAB post-processor based on the Celeris time-series loading examples.
- `matlab/nthmp_summary.m`: MATLAB summary writer for `report/current_results_summary.md` and `.json`.
- `matlab/generate_bp09_inputs_matlab.m`: BP09 nested-grid MATLAB generator following the Pearl Harbor master config pattern.
- `reference_data/`: ignored official input/reference data downloaded from NTHMP/PMEL/GitHub.
- `runs/`: ignored generated Celeris inputs, browser downloads, logs, and intermediate metrics.
- `report/`: tracked status summaries, report source, and final report artifacts.

## Case Matrix

| Case | Benchmark | Required cases | Primary comparison targets | First Celeris setup |
| --- | --- | --- | --- | --- |
| BP01 | Analytical single wave on simple beach | H/d = 0.019 | Maximum runup within 5%, eta/d snapshots, eta/d time series at x/d = 0.25 and 9.95, scalability | NLSW narrow 2D flume using Celeris native solitary-wave Add Disturbance initialization |
| BP04 | Laboratory single wave on simple beach | Case A H/d = 0.0185, Case C H/d = 0.3 | Eta/d profile snapshots, maximum runup, R/d versus H/d | NLSW narrow 2D flume using native solitary-wave Add Disturbance; breaking model sensitivity for Case C |
| BP06 | Laboratory solitary wave on conical island | Case B H/d = 0.096, Case C H/d = 0.181 | Gauge eta/d at 9, 16, 22 and runup R/d around island | NLSW 2D basin with analytic conical island and native solitary-wave Add Disturbance input |
| BP07 | Laboratory Monai Valley | Monai valley tank case | Movie-frame snapshots, gauges 1-3, maximum runup in narrow valley | 2D Cartesian case using official bathymetry and measured incident-wave boundary time series |
| BP09 | Field Okushiri tsunami | 1993 Hokkaido-Nansei-Oki tsunami | Aonae arrival/runup, two-wave behavior, Iwanai/Esashi gauges, Okushiri runup distribution | NLSW spherical nested grids: PMEL Region A parent, Region B1 south Okushiri child, Region C1 Aonae child, and Region C23 Monai child |

## Repeatable Workflow

1. Keep official reference data under `reference_data/`.
2. Generate Celeris inputs for one benchmark variant with MATLAB:
   - `config.json`
   - `bathy.txt`
   - `waves.txt`
   - optional `etaInitCond.txt` for benchmarks that specify gridded initial free-surface fields
   - optional boundary time-series files for boundary type 5
3. Run the WebGPU model through either the normal static server workflow or browser automation:
   - `python -m http.server 8000`
   - open `http://localhost:8000` in a WebGPU-enabled Chromium browser
   - prefer the benchmark runner scripts, which call `automation/run_benchmark_case.py` and capture browser outputs into each case `output/` directory
   - the browser runner uploads `etaInitCond.txt` automatically when it exists in the case directory
4. Enable output triggers in the config:
   - 2D surfaces: `elev_*.bin`, optional `xflux_*.bin`, `yflux_*.bin`, `bathytopo.bin`
   - gauge data: `time_series_data.txt` and `time_series_locations.txt`
   - summary fields: max free surface, wave height, mean fields as needed
5. Post-process each run with MATLAB:
   - load Celeris time series using the same simple pattern as the Celeris examples
   - write a compact metrics JSON
   - generate basic bathy/eta/time-series figures
6. Add each completed case to the benchmarking report.

Detailed benchmark-specific validation metrics should be added in MATLAB only after the run setup for each case is accepted.

After running one or more cases, refresh the current summary:

```bash
matlab -batch "addpath('benchmarks/nthmp/matlab'); nthmp_summary"
```

## Immediate Pilot

Start with BP01 because it is analytical, small, and exercises the runup/post-processing path before introducing laboratory bathymetry, sidewall reflection, or field-scale geospatial grids.

Recommended commands from the repository root:

```bash
python benchmarks/nthmp/runs/BP01/pilot_solitary_disturbance/run_WebGPU.py
```

To prepare BP01 inputs and reference-only analysis without launching the browser:

```bash
matlab -batch "cd('benchmarks/nthmp/runs/BP01/pilot_solitary_disturbance'); run('create_Celeris_inputs.m')"
```

The BP01 runner uses:

- `benchmarks/nthmp/runs/BP01/pilot_solitary_disturbance/config.json`
- `benchmarks/nthmp/runs/BP01/pilot_solitary_disturbance/bathy.txt`
- `benchmarks/nthmp/runs/BP01/pilot_solitary_disturbance/waves.txt`

The config sets `add_Disturbance = 1`, `disturbanceType = 1`, and the BP01 solitary-wave amplitude/location/direction. Celeris applies the same Add Disturbance path on the first running frame, so no browser-panel click or `etaInitCond.txt` is required for the initial wave.

The browser runner first tries the bundled `automation/chromedriver-win64/chromedriver.exe` when its major version matches the installed Chrome version. If Chrome has auto-updated past the bundled driver, `automation/run_benchmark_case.py` falls back to Selenium Manager so the per-BP scripts can still launch a compatible ChromeDriver.

If running manually, place browser downloads in `benchmarks/nthmp/runs/BP01/pilot_solitary_disturbance/output/`, then process through the runner:

```bash
cd benchmarks/nthmp/runs/BP01/pilot_solitary_disturbance/output
matlab -batch "run('load_Celeris_timeseries.m')"
```

The first Celeris decision to lock down is how to represent BP01:

- Preferred initial implementation: a narrow 2D Cartesian flume with reflective sidewalls and the canonical beach in `bathy.txt`.
- Use NLSW mode first for direct comparison to the benchmark standard.
- Use Celeris' native Add Disturbance solitary-wave initialization for BP01, BP04, and BP06 rather than `etaInitCond.txt`; this initializes both eta and momentum through the existing runtime disturbance shader.
- Store the exact wet/dry threshold and shoreline/runup extraction rule in the metrics output so later cases use the same convention unless a benchmark-specific reason is documented.

## Solitary-Wave Laboratory Inputs

BP04 and BP06 also use solitary waves. Their generated Celeris cases follow the same rule as BP01: `config.json` sets `loadetaIC = 0`, `add_Disturbance = 1`, and `disturbanceType = 1`, so the model injects the solitary wave on the first running frame without browser-panel clicks.

Generate the BP04 and BP06 input cases:

```bash
python benchmarks/nthmp/run_bp04.py
python benchmarks/nthmp/run_bp06.py
```

Generated run directories:

- `benchmarks/nthmp/runs/BP04/case_a_solitary_disturbance/`
- `benchmarks/nthmp/runs/BP04/case_c_solitary_disturbance/`
- `benchmarks/nthmp/runs/BP06/case_b_solitary_disturbance/`
- `benchmarks/nthmp/runs/BP06/case_c_solitary_disturbance/`

Current BP04 setup assumptions:

- Case A uses `H/d = 0.0185`, `d = 0.30 m`, and the requested profile times `t/T = 30, 40, 50, 60, 70`.
- Case C uses `H/d = 0.3`, `d = 0.15 m`, and the requested profile times `t/T = 15, 20, 25, 30`.
- Both use the official 1:19.85 beach and a 0.3997 m flume width.

Current BP06 setup assumptions:

- Cases B and C use measured `H/d = 0.096` and `0.181`, respectively, with `d = 0.32 m`.
- The generated basin is 29.3 m by 30.0 m with the conical island centered at `(12.96, 13.80) m`.
- The conical island uses toe radius `3.55 m` and 1:4 slope, inferred from the official gauge-depth table.
- The solitary wave is initialized near the wavemaker side and travels toward increasing `x`; measured gauge comparisons will need a documented time alignment against the lab files that begin at `t = 20 s`.

After running a BP04 case and placing browser downloads in the case `output/` directory, process it through the runner:

```bash
python benchmarks/nthmp/run_bp04.py --skip-generate --skip-run --allow-missing
```

For reference-only smoke tests without launching the browser:

```bash
python benchmarks/nthmp/run_bp04.py --skip-run --allow-missing
python benchmarks/nthmp/run_bp06.py --skip-run --allow-missing
```

## BP07 Monai Valley Inputs

BP07 uses measured incident-wave forcing instead of a solitary Add Disturbance setup. The generator converts `Benchmark_2_Bathymetry.txt` from XYZ still-water depth to Celeris bottom elevation, writes the measured west-boundary incident wave to `ts_west.txt`, and sets `west_boundary_type = 5`.

Run the full BP07 workflow with:

```bash
python benchmarks/nthmp/run_bp07.py
```

For a reference-only smoke test without launching the browser:

```bash
python benchmarks/nthmp/run_bp07.py --skip-run --allow-missing
```

Generated run directory:

- `benchmarks/nthmp/runs/BP07/monai_valley/`

Current BP07 setup assumptions:

- The official 393 by 244 grid is preserved at `dx = dy = 0.014 m`.
- The west boundary uses two type-5 stations at `y = 0` and `y = 3.402 m` with uniform measured eta.
- The generated momentum uses the long-wave estimate `hu = eta * sqrt(g * base_depth)`, `hv = 0`.
- The type-5 file ends at `t = 22.5 s`; Celeris then applies zero boundary state. The benchmark recommends a non-reflective west boundary after `22.5 s`, so this is a first-pass approximation to revisit after pilot results.
- Time series are sampled at gauges 5, 7, and 9: `(4.521, 1.196)`, `(4.521, 1.696)`, and `(4.521, 2.196) m`.

## BP09 Okushiri Nested Inputs

BP09 follows the same nested-grid setup pattern as `E:\Dropbox\consulting\ReidMiddleton_HI_Modeling\PearlHarbor_2475tsunami_nested\master_nested_config.m`. The MATLAB generator defines the master grid table, each grid's geographic bounds, parent, child refinement, and bathymetry/source hierarchy. The active ladder is A -> B -> final C_Aonae/C_Monai. The default A-grid refinement is `4` from the original PMEL Region A spacing, and each parent-child refinement is `4`, producing approximate spacings of 112 m -> 28 m -> 7 m. Refinement factors are constrained to `3..5`.

Each grid loads its own `etaInitCond.txt`, interpolated from the matching PMEL region-specific initial-wave file. Child grids also consume type-5 boundary files written by their parent grids. All BP09 grids use spherical NLSW (`grid_type = 2`).

Run the full nested workflow with:

```bash
python benchmarks/nthmp/run_bp09.py
```

For a reference-only smoke test without launching the browser:

```bash
python benchmarks/nthmp/run_bp09.py --skip-run --allow-missing
```

Generated run directories:

- `benchmarks/nthmp/runs/BP09/gridA_okushiri/`
- `benchmarks/nthmp/runs/BP09/gridB_south_okushiri/`
- `benchmarks/nthmp/runs/BP09/gridC_aonae/`
- `benchmarks/nthmp/runs/BP09/gridC_monai/`

Current BP09 setup assumptions:

- Grid A uses the PMEL Region A bathymetry and initial-wave grids.
- Grid B boxes the PMEL B1-B3 extent, uses B1/B2/B3 bathymetry and initial-wave grids, and fills missing coverage from Region A.
- The Aonae final grid uses the PMEL Region C1 extent, bathymetry, and initial-wave grid.
- The Monai final grid uses the PMEL Region C23 extent, bathymetry, and initial-wave grid.
- Parent grids export Celeris nested boundary time-series files using `nestedGridOutput_rectangles`; child grids consume those files with boundary type `5`.
- Nested boundary output uses the Pearl Harbor-style `nestedEtaWriteThreshold = 0.01 m` default and a 10 s boundary output cadence.
- PMEL bathymetry files are stored north-to-south and are flipped to south-to-north before interpolation; xyz source files are already stored as lon/lat/bottom-elevation points.
- PMEL link indices and geographic limits are recorded in `case_manifest.json` because the BP09 description notes ghost cells and horizontal/vertical grid-alignment uncertainty in the original grids.
- Aonae coordinates are taken from `FieldData.xlsx`. Iwanai and Esashi first-pass gauge coordinates use public station listings and should be replaced if a stricter NTHMP coordinate source is identified.
