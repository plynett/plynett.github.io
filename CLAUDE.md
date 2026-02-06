# CLAUDE.md - Celeris-WebGPU

## Project Overview

Celeris-WebGPU is a real-time, GPU-accelerated coastal wave simulation that runs entirely in the browser using the WebGPU API. It solves Nonlinear Shallow Water (NLSW), Boussinesq, and COULWAVE equations on the GPU via WGSL compute shaders. There is no server-side component — all computation happens client-side.

**Live deployment:** https://plynett.github.io/
**License:** MIT
**Maintainer:** Patrick Lynett, University of Southern California

## Quick Reference

### Running Locally

```bash
python -m http.server 8000
# Open http://localhost:8000 in a WebGPU-enabled browser (Chrome 113+, Edge)
```

No build step, no package manager, no transpilation. Just serve static files and refresh.

### Testing Changes

There is no automated test suite. Testing is manual:
1. Serve locally with `python -m http.server 8000`
2. Load multiple example scenarios from the dropdown menu
3. Verify the simulation runs without browser console errors
4. Test in at least one WebGPU-compatible browser

### Deployment

Pushes to `main` trigger automatic deployment to GitHub Pages via `.github/workflows/static.yml`. The entire repository is uploaded as-is — no build step.

## Architecture

### Technology Stack

- **Frontend:** Vanilla HTML5 + JavaScript (ES6 modules), no framework
- **GPU Compute:** WGSL shaders via the WebGPU API
- **3D Math:** gl-matrix (loaded from jsdelivr CDN)
- **Deployment:** GitHub Pages (static files)

### Directory Structure

```
/
├── index.html              # Main entry point (2D simulator UI)
├── river.html              # Alternative river scenario entry
├── site.js                 # Module loader entry point
├── js/                     # JavaScript source (34 files)
│   ├── main.js             # Core: init, event loop, simulation loop (~6800 lines)
│   ├── constants_load_calc.js  # Default config, parameter loading, derived calculations
│   ├── Config_Pipelines.js     # WebGPU compute/render pipeline creation
│   ├── File_Loader.js          # Input file parsing (JSON, bathymetry, waves, images)
│   ├── File_Writer.js          # Export: JPEG, GIF, binary, JSON
│   ├── Create_Textures.js      # GPU texture allocation
│   ├── Copy_Data_to_Textures.js # CPU-to-GPU data transfer
│   ├── Run_Compute_Shader.js   # Compute shader dispatch
│   ├── Run_Tridiag_Solver.js   # Parallel tridiagonal solver
│   ├── Handler_*.js            # 20+ handlers, one per compute/render pass
│   ├── display_parameters.js   # UI panel logic
│   ├── Time_Series.js          # Point measurement extraction
│   └── Model_Loaders.js        # 3D model loading (glTF/custom)
├── shaders/                # WGSL compute & render shaders (42 files)
│   ├── Pass0.wgsl          # Initialization
│   ├── Pass1*.wgsl         # Flux computation (Riemann solvers)
│   ├── Pass2*.wgsl         # Explicit update step
│   ├── Pass3*.wgsl         # Physics integration (NLSW/Bous/COULWAVE variants)
│   ├── BoundaryPass.wgsl   # Boundary conditions
│   ├── Pass_Breaking.wgsl  # Wave breaking detection
│   ├── TriDiag_PCR*.wgsl   # Parallel Cyclic Reduction (implicit Boussinesq)
│   ├── SedTrans_*.wgsl     # Sediment transport (optional)
│   ├── vertex.wgsl / fragment.wgsl       # 2D rendering
│   ├── vertex3D.wgsl / fragment_testing.wgsl # 3D rendering
│   └── skybox.*.wgsl / model.*.wgsl      # Environment & object rendering
├── examples/               # 46 pre-configured simulation scenarios
│   └── <Location>/         # Each contains: config.json, bathy.txt, waves.txt, overlay images
├── transect_version/       # Alternative 1D transect simulation (separate js/, shaders/, examples/)
├── assets/                 # 3D model files
├── textures/               # Visualization textures
├── skybox/                 # Cube map environment textures
├── automation/             # Automation config and drivers
└── .github/                # Workflows, issue templates
```

### Simulation Pipeline

Each simulation timestep executes these GPU compute passes in order:

1. **Pass0** — Initialization / reset
2. **Pass1** — Flux computation (Riemann solver: HLLC or HLLEM)
3. **Pass2** — Explicit update (hyperbolic/NLSW part)
4. **Pass3** — Physics-specific integration (NLSW, Boussinesq, or COULWAVE)
5. **Tridiagonal Solve** — Implicit solver for Boussinesq/COULWAVE dispersive terms (PCR algorithm)
6. **Breaking** — Wave breaking detection and eddy viscosity
7. **BoundaryPass** — Enforce boundary conditions (Dirichlet/Neumann/radiation)
8. **CalcMeans / CalcWaveHeight** — Running statistics
9. **ExtractTimeSeries** — Point measurement sampling
10. **SedTrans** — Optional sediment transport passes
11. **Render** — 2D/3D visualization

### Handler Pattern

Each simulation pass follows a consistent pattern with a dedicated `Handler_<Name>.js` file that:
- Creates the WebGPU compute pipeline with the corresponding WGSL shader
- Sets up bind groups (texture/buffer bindings)
- Provides a dispatch function called from the main loop in `main.js`

### Configuration System

Simulation parameters are stored in flat JSON objects with ~270 keys covering:
- **Grid:** `WIDTH`, `HEIGHT`, `dx`, `dy`
- **Numerics:** `Courant`, `timeScheme`, `NLSW_or_Bous`
- **Physics:** `gravity`, `friction`, `Bcoef`, `useBreakingModel`, `isManning`
- **GPU:** `ThreadX`, `ThreadY`, `DispatchX`, `DispatchY` (typically 16x16 threads)
- **Boundaries:** Type and width for all four boundaries
- **Wave forcing:** Amplitude, period, direction
- **Visualization:** Color maps, display variables, colorbars
- **Export:** Animation and data write settings

Example scenarios in `examples/<Location>/config.json` override defaults from `constants_load_calc.js`.

## Key Conventions

### JavaScript

- **ES6 modules** with named `import`/`export` — loaded directly by the browser
- **CamelCase** for variables and functions
- **Texture prefix convention:** `txBottom`, `txScreen`, `txAnimation` for GPU textures
- **Set-based resource tracking:** `allTextures`, `allComputePipelines` for cleanup
- **No transpilation or bundling** — code must run natively in modern browsers
- `main.js` is the central orchestrator (~6800 lines); it manages initialization, the simulation loop, and UI event handling

### WGSL Shaders

- Workgroup size is typically `16 x 16` threads
- Override constants are used for compile-time specialization
- Storage textures and buffers for GPU-to-GPU data passing
- Consistent binding group numbering across related shaders
- Variant suffixes: `_HighOrder`, `_COULWAVE`, `_HLLEM`, `_HLLC`

### File Naming

- Handler modules: `Handler_<PassName>.js`
- Compute shaders: `<PassName>.wgsl`
- Render shader pairs: `<name>.vertex.wgsl` / `<name>.fragment.wgsl`
- Config keys use camelCase with descriptive names

### Example Scenarios

Each `examples/<Location>/` directory contains:
- `config.json` — Domain-specific simulation parameters
- `bathy.txt` — Bathymetry grid (text format, can be large ~5MB+)
- `waves.txt` — Wave forcing conditions
- Optional: overlay images (PNG), Google Map imagery

## Important Considerations for AI Assistants

### No Build System

There is no `package.json`, no bundler, no transpiler. All JS files are served as-is. Do not introduce build dependencies or tooling unless explicitly requested.

### No Automated Tests

There is no test framework. Validation is manual (load examples, check console). Do not add test infrastructure unless explicitly requested.

### Large Files

The repository is ~1.9 GB due to bathymetry data files and imagery. Avoid committing large binary or data files.

### main.js is Monolithic

`main.js` is approximately 6800 lines and contains the simulation loop, all event handlers, and initialization logic. Changes here require careful attention to avoid breaking the tightly coupled simulation pipeline.

### WebGPU Specifics

- All GPU resources (textures, pipelines, bind groups) must be properly managed
- Shader changes require matching bind group layout updates in the corresponding Handler
- Compute dispatch dimensions must match grid size and thread counts from config
- WebGPU is still a relatively new API — browser compatibility is limited to Chrome 113+, Edge, and other Chromium-based browsers

### Config Coupling

Shader override constants, JS pipeline creation, and JSON config files are all tightly coupled. Changing a parameter name or adding a new parameter typically requires updates across all three layers:
1. `constants_load_calc.js` — default value and loading logic
2. The relevant `Handler_*.js` — pipeline constant mapping
3. The relevant `.wgsl` shader — override declaration and usage

### .gitignore

`config.json` is in `.gitignore` at the root level. Example configs inside `examples/` directories are tracked, but a root-level `config.json` is not.

## External Dependencies

- **gl-matrix** — 3D math library, loaded from CDN (`jsdelivr`)
- **WebGPU API** — browser-native, no polyfill included

## Community & Support

- **Issues:** GitHub Issues with Bug Report and Feature Request templates
- **Forum:** [Lynett Wave Research Forum](https://www.sqrtgh.com/forum)
- **Security:** Report to `plynett@usc.edu` (see `SECURITY.md`)
- **Contributing:** See `CONTRIBUTING.md` for full guidelines
