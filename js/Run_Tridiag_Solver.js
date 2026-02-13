// Run_Tridiag_Solver.js

export function runTridiagSolver(
    device,
    commandEncoder,
    calc_constants,
    current_stateUVstar,
    txNewState,
    coefMatx,
    coefMaty,
    newcoef_x,
    newcoef_y,
    txtemp_PCRx,
    txtemp_PCRy,
    txtemp2_PCRx,
    txtemp2_PCRy,
    TridiagX_uniformBuffer,
    TridiagX_uniforms,
    TridiagX_Pipeline,
    TridiagX_BindGroup,
    TridiagX_view,
    TridiagY_uniformBuffer,
    TridiagY_uniforms,
    TridiagY_Pipeline,
    TridiagY_BindGroup,
    TridiagY_view,
    runComputeShader,
    runCopyTextures
) {
    
    if (calc_constants.NLSW_or_Bous == 0) {
        runCopyTextures(device, calc_constants, current_stateUVstar, txNewState)
    }
    else
    {
        //Tridiag
        // X-Solve

        // Copy tridaig coef into newcoef for first loop
        runCopyTextures(device, calc_constants, coefMatx, newcoef_x)
        for (let p = 0; p < calc_constants.Px; p++) {

            let s = 1 << p;

            TridiagX_view.setInt32(8, p, true);             // i32, holds "p"
            TridiagX_view.setInt32(12, s, true);            // i32, hols "s"

            // Dispatch the shader computation.
            runComputeShader(device, TridiagX_uniformBuffer, TridiagX_uniforms, TridiagX_Pipeline, TridiagX_BindGroup, calc_constants.DispatchX, calc_constants.DispatchY);
            // Copy reduced tridaig coef into newcoef for next loop
            runCopyTextures(device, calc_constants, txtemp_PCRx, newcoef_x)
        }

        // After all the iterations, copy the new state into current state.
        runCopyTextures(device, calc_constants, txtemp2_PCRx, txNewState)

        // Y-Solve

        // Copy tridaig coef into newcoef for first loop
        runCopyTextures(device, calc_constants, coefMaty, newcoef_y)
        for (let p = 0; p < calc_constants.Py; p++) {

            let s = 1 << p;

            TridiagY_view.setInt32(8, p, true);             // i32, holds "p"
            TridiagY_view.setInt32(12, s, true);            // i32, hols "s"

            // Dispatch the shader computation.
            runComputeShader(device, TridiagY_uniformBuffer, TridiagY_uniforms, TridiagY_Pipeline, TridiagY_BindGroup, calc_constants.DispatchX, calc_constants.DispatchY);
            // Copy reduced tridaig coef into newcoef for next loop
            runCopyTextures(device, calc_constants, txtemp_PCRy, newcoef_y)
        }

        // After all the iterations, copy the new state into current state.
        runCopyTextures(device, calc_constants, txtemp2_PCRy, txNewState)
    }
}
