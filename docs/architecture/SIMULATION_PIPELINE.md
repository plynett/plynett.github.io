# Simulation Pipeline

The model advances on the GPU through a fixed sequence of compute passes. JavaScript owns scheduling and texture copies; WGSL owns the numerical kernels.

## Frame Loop

`js/main.js` creates a `frame()` function that is called by `requestAnimationFrame`. Each frame may contain multiple simulation timesteps. The variable `render_step` is adjusted at runtime so the application can do more compute between renders when the GPU is fast, but back off when the browser needs more responsiveness.

Important per-frame responsibilities:

- Handle pending UI/config changes (`html_update`).
- Handle mouse edits (`click_update`).
- Handle requested disturbances (`add_Disturbance`).
- Run `render_step` simulation timesteps.
- Pack render data into half-float textures.
- Draw either the 2D view or 3D view.
- Extract tooltip/time-series data.
- Save images, GIF slices, or output surfaces if requested.

The loop also periodically flushes the WebGPU queue to reduce the risk of long-running GPU command accumulation.

## Timestep Sequence

The core timestep is a finite-volume update plus optional dispersive correction:

1. `Pass0.wgsl` computes neighbor water depths around each cell. This is a helper texture for dry/wet logic in the flux pass.
2. `Pass1.wgsl` or `Pass1_HighOrder.wgsl` reconstructs face states from cell-centered state and bathymetry. It writes face depth, face velocity, and scalar values.
3. `SedTrans_Pass1.wgsl`, if sediment is enabled, reconstructs sediment concentration at faces.
4. `Pass2.wgsl`, `Pass2_HighOrder_HLLC.wgsl`, or `Pass2_HighOrder_HLLEM.wgsl` computes numerical fluxes through cell faces. The current high-order path selects HLLC.
5. `Pass_Breaking.wgsl`, if enabled, computes breaking age/intensity and eddy-viscosity flux helpers.
6. In COULWAVE mode, `Pass3A_COULWAVE.wgsl` and `Pass3B_COULWAVE.wgsl` build auxiliary terms and pack them into `txCW_groupings`.
7. `Pass3_NLSW.wgsl`, `Pass3_NLSW_Spherical.wgsl`, `Pass3_Bous.wgsl`, or `Pass3_COULWAVE.wgsl` computes flux divergence, friction, pressure forcing, breaking/diffusion terms, scalar decay/dispersion, and the predictor/corrector update.
8. `BoundaryPass.wgsl` applies boundary conditions and wet/dry cleanup to the explicit/intermediate state.
9. For Boussinesq/COULWAVE, `Update_TriDiag_coef*.wgsl` refreshes implicit-solver coefficients when required.
10. `Run_Tridiag_Solver.js` dispatches `TriDiag_PCRx*.wgsl` then `TriDiag_PCRy*.wgsl`. NLSW mode skips the solve by copying the intermediate state to `txNewState`.
11. `BoundaryPass.wgsl` is run again after the implicit solve.
12. Sediment bottom update may run, which changes `txBottom`, cumulative bed-change textures, near-dry flags, and tridiagonal coefficients.
13. History textures are shifted and `txNewState` becomes `txState`.
14. Diagnostics run: face velocities are refreshed, means and wave heights are updated, and render variables are packed.

## Time Integration

The time scheme is selected by config:

- `timeScheme == 0`: single-step explicit update.
- `timeScheme != 0` with `pred_or_corrector == 1`: Adams-Bashforth style predictor using current, old, and older derivatives.
- `pred_or_corrector == 2`: corrector that combines the new derivative with the predictor and history derivatives.

The water and sediment paths both maintain gradient-history textures. For Boussinesq/COULWAVE modes, additional `F_G_star` history textures preserve dispersive helper terms used by `Pass3`.

## Boundary Reapplication

Boundary conditions are applied twice for a reason. The first boundary pass sanitizes the explicit state before the implicit solve. The tridiagonal solver can then alter momentum fields, so the second boundary pass restores consistency before the state becomes the next step's canonical state.

## Active Shader Selection

`main.js` fetches and compiles different WGSL files depending on config:

- Standard hydrodynamics: `Pass1.wgsl`, `Pass2.wgsl`.
- High-order hydrodynamics: `Pass1_HighOrder.wgsl`, `Pass2_HighOrder_HLLC.wgsl`.
- NLSW: `Pass3_NLSW.wgsl`, no PCR solve.
- Spherical NLSW: `Pass3_NLSW_Spherical.wgsl` when `grid_type == 2`, no PCR solve.
- Boussinesq: `Pass3_Bous.wgsl`, `Update_TriDiag_coef.wgsl`, `TriDiag_PCRx.wgsl`, `TriDiag_PCRy.wgsl`.
- COULWAVE: `Pass3A_COULWAVE.wgsl`, `Pass3B_COULWAVE.wgsl`, `Pass3_COULWAVE.wgsl`, `Update_TriDiag_coef_COULWAVE.wgsl`, `TriDiag_PCRx_COULWAVE.wgsl`, `TriDiag_PCRy_COULWAVE.wgsl`.

Several shader files are present as experiments or older variants. They are documented in `docs/source/shaders/`, but active use should be verified against the current `main.js` path before modifying them.
