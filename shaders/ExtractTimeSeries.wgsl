struct Globals {
    width: i32,
    height: i32,
    dx: f32,
    dy: f32,
    mouse_current_canvas_indX: i32,
    mouse_current_canvas_indY: i32,
    time: f32,
    river_sim: i32,
};

@group(0) @binding(0) var<uniform> globals: Globals;

@group(0) @binding(1) var txBottom: texture_2d<f32>; 
@group(0) @binding(2) var txBottomFriction: texture_2d<f32>; 
@group(0) @binding(3) var txContSource: texture_2d<f32>; 
@group(0) @binding(4) var txState: texture_2d<f32>; 
@group(0) @binding(5) var txWaveHeight: texture_2d<f32>; 
@group(0) @binding(6) var txTimeSeries_Locations: texture_2d<f32>; 
@group(0) @binding(7) var txTimeSeries_Data: texture_storage_2d<rgba32float, write>;


@compute @workgroup_size(1, 1)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
    let idx = vec2<i32>(i32(id.x), i32(id.y));

    var current_location = vec2<i32>(0, 0);
    var output = vec4<f32>(0.0, 0.0, 0.0, 0.0);
    if (idx.x == 0) { // for the first index in the texture, store the tooltip
        current_location = vec2<i32>(globals.mouse_current_canvas_indX, globals.mouse_current_canvas_indY);
        let bottom = textureLoad(txBottom, current_location, 0).z; 
        let friction = textureLoad(txBottomFriction, current_location, 0).x;   // friction factor, always between [0 and 1], no normalization needed 

        if (globals.river_sim == 1) {
            let state = textureLoad(txState, current_location, 0).xyz;  // Free surface elevation, P, Q  LARIVER mod
            let waves = state.x;
            let H = max(waves - bottom, 0.01);
            let u = state.y / H;
            let v = state.z / H;
            let speed = sqrt(u * u + v * v);
            output = vec4<f32>(bottom, waves, speed, friction);
        }
        else {
            let waves = textureLoad(txState, current_location, 0).x;  // Free surface elevation
            let hsig = textureLoad(txWaveHeight, current_location, 0).z;  // Significant wave height
            output = vec4<f32>(bottom, waves, hsig, friction);
        }
    } else {  // for all other indices, store the time series data
        current_location = vec2<i32>(textureLoad(txTimeSeries_Locations, idx, 0).xy);
        let waves = textureLoad(txState, current_location, 0).x;  // Free surface elevation
        let P = textureLoad(txState, current_location, 0).y;  // x-flux
        let Q = textureLoad(txState, current_location, 0).z;   // y-flux
        output = vec4<f32>(globals.time, waves, P, Q);
    }

    textureStore(txTimeSeries_Data, idx, output);
}

