// Added by Codex: Start nested-grid boundary time-series extraction shader.
struct Globals {
    width: i32,
    height: i32,
    i0: i32,
    j0: i32,
    i1: i32,
    j1: i32,
    nx: i32,
    ny: i32,
    sample_index: i32
};

@group(0) @binding(0) var<uniform> globals: Globals;
@group(0) @binding(1) var txState: texture_2d<f32>;
@group(0) @binding(2) var txNestedSouth: texture_storage_2d<rgba32float, write>;
@group(0) @binding(3) var txNestedNorth: texture_storage_2d<rgba32float, write>;
@group(0) @binding(4) var txNestedWest: texture_storage_2d<rgba32float, write>;
@group(0) @binding(5) var txNestedEast: texture_storage_2d<rgba32float, write>;
// Added by Codex: Bottom elevation is needed so dry cells export zero eta/hu/hv instead of DEM elevation.
@group(0) @binding(6) var txBottom: texture_2d<f32>;

fn LoadState(i: i32, j: i32) -> vec4<f32> {
    let safe_i = clamp(i, 0, globals.width - 1);
    let safe_j = clamp(j, 0, globals.height - 1);
    let state = textureLoad(txState, vec2<i32>(safe_i, safe_j), 0);
    // Added by Codex: Start dry-cell export guard.
    let bottom = textureLoad(txBottom, vec2<i32>(safe_i, safe_j), 0).z;
    if (state.x - bottom <= 0.0) {
        return vec4<f32>(0.0, 0.0, 0.0, 0.0);
    }
    // Added by Codex: End dry-cell export guard.
    return vec4<f32>(state.x, state.y, state.z, 0.0);
}

@compute @workgroup_size(16, 1)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
    let station_index = i32(id.x);
    let output_row = globals.sample_index;

    if (station_index < globals.nx) {
        let i = globals.i0 + station_index;
        textureStore(txNestedSouth, vec2<i32>(station_index, output_row), LoadState(i, globals.j0));
        textureStore(txNestedNorth, vec2<i32>(station_index, output_row), LoadState(i, globals.j1));
    }

    if (station_index < globals.ny) {
        let j = globals.j0 + station_index;
        textureStore(txNestedWest, vec2<i32>(station_index, output_row), LoadState(globals.i0, j));
        textureStore(txNestedEast, vec2<i32>(station_index, output_row), LoadState(globals.i1, j));
    }
}
// Added by Codex: End nested-grid boundary time-series extraction shader.
