struct Globals {
    n_time_steps_means: i32,
    delta: f32
};

@group(0) @binding(0) var<uniform> globals: Globals;

@group(0) @binding(1) var txMeans: texture_2d<f32>;
@group(0) @binding(2) var txMeans_Speed: texture_2d<f32>;
@group(0) @binding(3) var txMeans_Momflux: texture_2d<f32>;
@group(0) @binding(4) var txNewState: texture_2d<f32>;
@group(0) @binding(5) var txBottom: texture_2d<f32>;
@group(0) @binding(6) var txtemp_Means: texture_storage_2d<rgba32float, write>;
@group(0) @binding(7) var txtemp_Means_Speed: texture_storage_2d<rgba32float, write>;
@group(0) @binding(8) var txtemp_Means_Momflux: texture_storage_2d<rgba32float, write>;


@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
    let idx = vec2<i32>(i32(id.x), i32(id.y));

    let means_here = textureLoad(txMeans, idx, 0);
    let speed_means_here = textureLoad(txMeans_Speed, idx, 0);
    let momflux_means_here = textureLoad(txMeans_Momflux, idx, 0);

    let state_here = textureLoad(txNewState, idx, 0);
    let bottom = textureLoad(txBottom, idx, 0).z;
    let eta = state_here.x; 
    let H = max(globals.delta, eta - bottom);

    let update_frac = 1. / f32(globals.n_time_steps_means);
    let old_frac = 1.0 - update_frac;

    let means_new = means_here.xyz*old_frac + state_here.xyz*update_frac;

    let P = state_here.y; 
    let Q = state_here.z; 
    let u = abs(P/H);
    let v = abs(Q/H);
    let speed = sqrt(u*u + v*v);
    let hu2 = abs(P*P/H);
    let hv2 = abs(Q*Q/H);
    let momflux = sqrt(hu2*hu2 + hv2*hv2);

    var eta_max_new = 0.;
    var u_max_new = 0.;
    var v_max_new = 0.;
    var speed_max_new = 0.;
    var hu2_max_new = 0.;
    var hv2_max_new = 0.;
    var momflux_max_new = 0.;
    if (globals.n_time_steps_means > 1) {
        eta_max_new = max(means_here.a,eta);

        u_max_new = max(speed_means_here.x,u);
        v_max_new = max(speed_means_here.y,v);
        speed_max_new = max(speed_means_here.z,speed);

        hu2_max_new = max(momflux_means_here.x,hu2);
        hv2_max_new = max(momflux_means_here.y,hv2);
        momflux_max_new = max(momflux_means_here.z,momflux);
    }

    textureStore(txtemp_Means, idx, vec4<f32>(means_new, eta_max_new));
    textureStore(txtemp_Means_Speed, idx, vec4<f32>(u_max_new, v_max_new, speed_max_new, 0.0));
    textureStore(txtemp_Means_Momflux, idx, vec4<f32>(hu2_max_new, hv2_max_new, momflux_max_new, 0.0));
}

