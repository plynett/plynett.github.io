struct Globals {
    width: i32,
    height: i32,
    dt: f32,
    dx: f32,
    dy: f32,
    base_depth: f32,
    timeScheme: i32,
    pred_or_corrector: i32,
    sedC1_n: f32,
    west_boundary_type: i32,
    east_boundary_type: i32,
    south_boundary_type: i32,
    north_boundary_type: i32,
};

@group(0) @binding(0) var<uniform> globals: Globals;

@group(0) @binding(1) var txBottom: texture_2d<f32>;  
@group(0) @binding(2) var txBotChange_Sed: texture_2d<f32>; 
@group(0) @binding(3) var erosion_Sed: texture_2d<f32>; 
@group(0) @binding(4) var depostion_Sed: texture_2d<f32>; 
@group(0) @binding(5) var txtemp_SedTrans_Botttom: texture_storage_2d<rgba32float, write>;
@group(0) @binding(6) var txtemp_SedTrans_Change: texture_storage_2d<rgba32float, write>;


@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
    let idx = vec2<i32>(i32(id.x), i32(id.y));

    let rightIdx = idx + vec2<i32>(1, 0);
    let upIdx = idx + vec2<i32>(0, 1);

    var dB_cumulative = textureLoad(txBotChange_Sed, idx, 0);
    var B_here = textureLoad(txBottom, idx, 0);
    let min_val = -globals.base_depth;

    let e_here =  textureLoad(erosion_Sed, idx, 0).x;
    let d_here =  textureLoad(depostion_Sed, idx, 0).x;
    let e_right =  textureLoad(erosion_Sed, rightIdx, 0).x;
    let d_right =  textureLoad(depostion_Sed, rightIdx, 0).x;
    let e_up =  textureLoad(erosion_Sed, upIdx, 0).x;
    let d_up =  textureLoad(depostion_Sed, upIdx, 0).x;

    let dB_here = globals.dt * (e_here - d_here) / (1.0 - globals.sedC1_n); // this is positive when eroding - when increasing depth, or decreasing elevation
    let dB_right = 0.5 * ( dB_here +  globals.dt * (e_right - d_right) / (1.0 - globals.sedC1_n));
    let dB_up =    0.5 * ( dB_here +  globals.dt * (e_up - d_up) / (1.0 - globals.sedC1_n));

    var dB = vec4<f32>(dB_up, dB_right, dB_here, 0.0);

    if (globals.west_boundary_type == 2 && idx.x < 10) {
        let ramp = max(0.0, (f32(idx.x)-5.0) / 5.0);  // Linear ramp from 0 to 1 over the first 10 columns
        dB = ramp * dB;  // No sediment transport in the first 20 columns
    }
    if (globals.east_boundary_type == 2 && idx.x > globals.width - 11) {
        let ramp = max(0.0, (f32(globals.width - idx.x) - 5.0) / 5.0);  // Linear ramp from 0 to 1 over the last 10 columns
        dB = ramp * dB;  // No sediment transport in the last 20 columns    
    }
    if (globals.south_boundary_type == 2 && idx.y < 10) {
        let ramp = max(0.0, (f32(idx.y)-5.0) / 5.0);  // Linear ramp from 0 to 1 over the first 10 rows
        dB = ramp * dB;  // No sediment transport in the first 20 rows
    }
    if (globals.north_boundary_type == 2 && idx.y > globals.height - 11) {
        let ramp = max(0.0, (f32(globals.height - idx.y) - 5.0) / 5.0);  // Linear ramp from 0 to 1 over the last 10 rows
        dB = ramp * dB;  // No sediment transport in the last 20 rows    
    }

    B_here = B_here - dB;  // B is elevation, so a positive dB (eroding) should decrease the elevation
    dB_cumulative = dB_cumulative - dB;

    textureStore(txtemp_SedTrans_Botttom, idx, B_here);
    textureStore(txtemp_SedTrans_Change, idx, dB_cumulative);
}

