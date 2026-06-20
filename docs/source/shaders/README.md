# WGSL Shader Guide

These files are the GPU implementation of the simulation and visualization pipeline. JavaScript handlers create the bind groups; the WGSL files define what each pass reads, writes, and computes.

The transect shader set is intentionally excluded from this guide.

## Hydrodynamic Compute Passes

- `Pass0.wgsl`: neighbor-depth helper.
- `Pass1.wgsl`: standard face reconstruction.
- `Pass1_HighOrder.wgsl`: wider-stencil MUSCL/TVD-style reconstruction.
- `Pass2.wgsl`: standard HLL-style flux computation.
- `Pass2_HighOrder_HLLC.wgsl`: high-order HLLC flux variant currently selected by `main.js`.
- `Pass2_HighOrder_HLLEM.wgsl`: alternative high-order HLLEM flux variant.
- `Pass3_NLSW.wgsl`: nonlinear shallow-water source/time integration.
- `Pass3_NLSW_Spherical.wgsl`: spherical-coordinate NLSW source/time integration for `grid_type == 2`.
- `Pass3_Bous.wgsl`: Boussinesq source/time integration and dispersive terms.
- `Pass3A_COULWAVE.wgsl`, `Pass3B_COULWAVE.wgsl`, `Pass3_COULWAVE.wgsl`: COULWAVE auxiliary and main integration passes.

## Solver, Boundary, And Diagnostics

- `BoundaryPass.wgsl`: boundary conditions and wet/dry cleanup.
- `Pass_Breaking.wgsl`: breaking and eddy-viscosity terms.
- `Update_TriDiag_coef*.wgsl`: implicit-solver coefficient construction.
- `TriDiag_PCR*.wgsl`: Parallel Cyclic Reduction solve passes.
- `CalcMeans.wgsl`, `CalcWaveHeight.wgsl`, `ExtractTimeSeries.wgsl`, `Copytxf32_txf16.wgsl`: diagnostics, readback, and render packing.

## Sediment

- `SedTrans_Pass1.wgsl`: sediment concentration reconstruction.
- `SedTrans_Pass3.wgsl`: suspended sediment update plus erosion/deposition.
- `SedTrans_UpdateBottom.wgsl`: bathymetry update from sediment change.
- `SedTrans_Pass3_old.wgsl`, `SedTrans_Pass3_wBedUpdate.wgsl`, `SedTrans_UpdateBottom_testing.wgsl`: older/prototype variants.

## Rendering

- `vertex.wgsl`, `fragment.wgsl`: 2D render path.
- `vertex3D.wgsl`: 3D water-surface mesh vertex shader.
- `skybox.*.wgsl`: 3D skybox.
- `model.*.wgsl`: simple model/box rendering.
- `duck.*.wgsl`: prototype glTF-style textured model shaders.
- `fragment_testing.wgsl`: alternate experimental render fragment shader.

## Reading Rule

Always read the matching handler doc beside a shader doc. The handler tells you what JavaScript resource arrives at each binding; the shader tells you how the resource is interpreted.
