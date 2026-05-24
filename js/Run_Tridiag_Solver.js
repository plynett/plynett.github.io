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
    // CODEX: Additional PCR ping-pong bind groups for copy-free coefficient handoff.
    TridiagX_BindGroup_BaseToA,
    TridiagX_BindGroup_BToA,
    TridiagX_view,
    TridiagY_uniformBuffer,
    TridiagY_uniforms,
    TridiagY_Pipeline,
    TridiagY_BindGroup,
    // CODEX: Additional PCR ping-pong bind groups for copy-free coefficient handoff.
    TridiagY_BindGroup_BaseToA,
    TridiagY_BindGroup_BToA,
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
        // CODEX: PCR now reads the base coefficient matrix directly on the first iteration.
        // runCopyTextures(device, calc_constants, coefMatx, newcoef_x)
        for (let p = 0; p < calc_constants.Px; p++) {

            let s = 1 << p;

            TridiagX_view.setInt32(8, p, true);             // i32, holds "p"
            TridiagX_view.setInt32(12, s, true);            // i32, hols "s"

            // Dispatch the shader computation.
            // CODEX: Select the bind group that alternates PCR coefficients between newcoef_x and txtemp_PCRx.
            const TridiagX_BindGroup_Current = (p == 0) ? TridiagX_BindGroup_BaseToA : ((p % 2 == 1) ? TridiagX_BindGroup : TridiagX_BindGroup_BToA);
            // runComputeShader(device, TridiagX_uniformBuffer, TridiagX_uniforms, TridiagX_Pipeline, TridiagX_BindGroup, calc_constants.DispatchX, calc_constants.DispatchY);
            runComputeShader(device, TridiagX_uniformBuffer, TridiagX_uniforms, TridiagX_Pipeline, TridiagX_BindGroup_Current, calc_constants.DispatchX, calc_constants.DispatchY);
            // Copy reduced tridaig coef into newcoef for next loop
            // CODEX: The next iteration reads the texture written by the selected ping-pong bind group.
            // runCopyTextures(device, calc_constants, txtemp_PCRx, newcoef_x)
        }

        // After all the iterations, copy the new state into current state.
        runCopyTextures(device, calc_constants, txtemp2_PCRx, txNewState)

        // Y-Solve

        // Copy tridaig coef into newcoef for first loop
        // CODEX: PCR now reads the base coefficient matrix directly on the first iteration.
        // runCopyTextures(device, calc_constants, coefMaty, newcoef_y)
        for (let p = 0; p < calc_constants.Py; p++) {

            let s = 1 << p;

            TridiagY_view.setInt32(8, p, true);             // i32, holds "p"
            TridiagY_view.setInt32(12, s, true);            // i32, hols "s"

            // Dispatch the shader computation.
            // CODEX: Select the bind group that alternates PCR coefficients between newcoef_y and txtemp_PCRy.
            const TridiagY_BindGroup_Current = (p == 0) ? TridiagY_BindGroup_BaseToA : ((p % 2 == 1) ? TridiagY_BindGroup : TridiagY_BindGroup_BToA);
            // runComputeShader(device, TridiagY_uniformBuffer, TridiagY_uniforms, TridiagY_Pipeline, TridiagY_BindGroup, calc_constants.DispatchX, calc_constants.DispatchY);
            runComputeShader(device, TridiagY_uniformBuffer, TridiagY_uniforms, TridiagY_Pipeline, TridiagY_BindGroup_Current, calc_constants.DispatchX, calc_constants.DispatchY);
            // Copy reduced tridaig coef into newcoef for next loop
            // CODEX: The next iteration reads the texture written by the selected ping-pong bind group.
            // runCopyTextures(device, calc_constants, txtemp_PCRy, newcoef_y)
        }

        // After all the iterations, copy the new state into current state.
        runCopyTextures(device, calc_constants, txtemp2_PCRy, txNewState)
    }
}
