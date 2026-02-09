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
        // NLSW: simple copy, uses a local encoder
        let encoder = device.createCommandEncoder();
        runCopyTextures(device, encoder, calc_constants, current_stateUVstar, txNewState);
        device.queue.submit([encoder.finish()]);
    }
    else
    {
        //Tridiag
        // X-Solve

        // Copy tridiag coef into newcoef for first loop
        let encoder = device.createCommandEncoder();
        runCopyTextures(device, encoder, calc_constants, coefMatx, newcoef_x);
        device.queue.submit([encoder.finish()]);

        for (let p = 0; p < calc_constants.Px; p++) {

            let s = 1 << p;

            TridiagX_view.setInt32(8, p, true);             // i32, holds "p"
            TridiagX_view.setInt32(12, s, true);            // i32, holds "s"

            // Batch compute + copy into a single encoder per iteration
            encoder = device.createCommandEncoder();
            runComputeShader(device, encoder, TridiagX_uniformBuffer, TridiagX_uniforms, TridiagX_Pipeline, TridiagX_BindGroup, calc_constants.DispatchX, calc_constants.DispatchY);
            runCopyTextures(device, encoder, calc_constants, txtemp_PCRx, newcoef_x);
            device.queue.submit([encoder.finish()]);
        }

        // Finalize X-solve and start Y-solve setup
        encoder = device.createCommandEncoder();
        runCopyTextures(device, encoder, calc_constants, txtemp2_PCRx, txNewState);

        // Y-Solve

        // Copy tridiag coef into newcoef for first loop
        runCopyTextures(device, encoder, calc_constants, coefMaty, newcoef_y);
        device.queue.submit([encoder.finish()]);

        for (let p = 0; p < calc_constants.Py; p++) {

            let s = 1 << p;

            TridiagY_view.setInt32(8, p, true);             // i32, holds "p"
            TridiagY_view.setInt32(12, s, true);            // i32, holds "s"

            // Batch compute + copy into a single encoder per iteration
            encoder = device.createCommandEncoder();
            runComputeShader(device, encoder, TridiagY_uniformBuffer, TridiagY_uniforms, TridiagY_Pipeline, TridiagY_BindGroup, calc_constants.DispatchX, calc_constants.DispatchY);
            runCopyTextures(device, encoder, calc_constants, txtemp_PCRy, newcoef_y);
            device.queue.submit([encoder.finish()]);
        }

        // Finalize Y-solve
        encoder = device.createCommandEncoder();
        runCopyTextures(device, encoder, calc_constants, txtemp2_PCRy, txNewState);
        device.queue.submit([encoder.finish()]);
    }
}
