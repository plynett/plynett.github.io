struct Globals {
    n_time_steps_means: i32
};

@group(0) @binding(0) var<uniform> globals: Globals;

@group(0) @binding(1) var txMeans: texture_2d<f32>;
@group(0) @binding(2) var txNewState: texture_2d<f32>;
@group(0) @binding(3) var txtemp_Means: texture_storage_2d<rgba32float, write>;


@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
    let idx = vec2<i32>(i32(id.x), i32(id.y));

    let means_here = textureLoad(txMeans, idx, 0);
    let state_here = textureLoad(txNewState, idx, 0);

    let update_frac = 1. / f32(globals.n_time_steps_means);
    let old_frac = 1.0 - update_frac;

    let means_new = means_here*old_frac + state_here*update_frac;

    textureStore(txtemp_Means, idx, means_new);
}

