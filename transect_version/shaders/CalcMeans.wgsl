struct Globals {
    n_time_steps_means: i32,
    delta: f32,
    base_depth: f32,
    width: i32,
    height: i32,
    dx: f32,
    dy: f32
};

@group(0) @binding(0) var<uniform> globals: Globals;

@group(0) @binding(1) var txMeans: texture_2d<f32>;
@group(0) @binding(2) var txMeans_Speed: texture_2d<f32>;
@group(0) @binding(3) var txMeans_Momflux: texture_2d<f32>;
@group(0) @binding(4) var txH: texture_2d<f32>;
@group(0) @binding(5) var txU: texture_2d<f32>;
@group(0) @binding(6) var txV: texture_2d<f32>;
@group(0) @binding(7) var txBottom: texture_2d<f32>;
@group(0) @binding(8) var txtemp_Means: texture_storage_2d<rgba32float, write>;
@group(0) @binding(9) var txtemp_Means_Speed: texture_storage_2d<rgba32float, write>;
@group(0) @binding(10) var txtemp_Means_Momflux: texture_storage_2d<rgba32float, write>; 
@group(0) @binding(11) var txModelVelocities: texture_storage_2d<rgba32float, write>; 
@group(0) @binding(12) var txC: texture_2d<f32>;


@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
    let idx = vec2<i32>(i32(id.x), i32(id.y));

    let means_here = textureLoad(txMeans, idx, 0);
    let speed_means_here = textureLoad(txMeans_Speed, idx, 0);
    let momflux_means_here = textureLoad(txMeans_Momflux, idx, 0);

    let h4 = textureLoad(txH, idx, 0);
    let u4 = textureLoad(txU, idx, 0);
   // let v4 = textureLoad(txV, idx, 0);
    let c4 = textureLoad(txC, idx, 0);

    let bottom = textureLoad(txBottom, idx, 0).z;
    
    let h = (h4.y + h4.w) / 2.0;
    let u = (u4.y + u4.w) / 2.0;
   // let v = (v4.x + v4.y + v4.z + v4.w) / 4.0;
    let c = (c4.y + c4.w) / 2.0;
    let eta = h + bottom;
    let P = h*u;
   // let Q = h*v;
   // let state_here = vec4<f32>(eta, u, v, c);
    let state_here = vec4<f32>(eta, u, 0.0, c);
   // let speed = sqrt(u*u + v*v);
    let speed = sqrt(u*u);
    let hu2 = h*u*u;
   // let hv2 = h*v*v;
   // let momflux = sqrt(hu2*hu2 + hv2*hv2);
    let momflux = sqrt(hu2*hu2);

    // for mean vorticity
   // let rightIdx = min(idx + vec2<i32>(1, 0), vec2<i32>(i32(globals.width)-1, i32(globals.height)-1));
   // let upIdx = min(idx + vec2<i32>(0, 1), vec2<i32>(i32(globals.width)-1, i32(globals.height)-1));
   // let leftIdx = max(idx + vec2<i32>(-1, 0), vec2<i32>(0, 0));
   // let downIdx = max(idx + vec2<i32>(0, -1), vec2<i32>(0, 0));
   // let u4_up = textureLoad(txU, upIdx, 0);
   // let u_up = (u4_up.x + u4_up.y + u4_up.z + u4_up.w) / 4.0;
   // let u4_down = textureLoad(txU, downIdx, 0);
   // let u_down = (u4_down.x + u4_down.y + u4_down.z + u4_down.w) / 4.0;
   // let v4_right = textureLoad(txV, rightIdx, 0);
   // let v_right = (v4_right.x + v4_right.y + v4_right.z + v4_right.w) / 4.0;
   // let v4_left = textureLoad(txV, leftIdx, 0);
   // let v_left = (v4_left.x + v4_left.y + v4_left.z + v4_left.w) / 4.0;
   // let vorticity = (u_up - u_down) / (2. * globals.dy) - (v_right - v_left) / (2. * globals.dx);

    let update_frac = 1. / f32(globals.n_time_steps_means);
    let old_frac = 1.0 - update_frac;

    let means_new = means_here*old_frac + state_here*update_frac;
   // let vorticity_means_new = momflux_means_here.w*old_frac + abs(vorticity)*update_frac;

    var eta_max_new = 0.;
    var u_max_new = 0.;
    var v_max_new = 0.;
    var speed_max_new = 0.;
    var hu2_max_new = 0.;
    var hv2_max_new = 0.;
    var momflux_max_new = 0.;
    if (globals.n_time_steps_means > 1) {
        u_max_new = max(speed_means_here.x,u);
       // v_max_new = max(speed_means_here.y,v);
        speed_max_new = max(speed_means_here.z,speed);
        eta_max_new = max(speed_means_here.a,eta);

        hu2_max_new = max(momflux_means_here.x,hu2);
       // hv2_max_new = max(momflux_means_here.y,hv2);
        momflux_max_new = max(momflux_means_here.z,momflux);
    }

    textureStore(txtemp_Means, idx, means_new);
   // textureStore(txtemp_Means_Speed, idx, vec4<f32>(u_max_new, v_max_new, speed_max_new, eta_max_new));
    textureStore(txtemp_Means_Speed, idx, vec4<f32>(u_max_new, 0.0, speed_max_new, eta_max_new));
   // textureStore(txtemp_Means_Momflux, idx, vec4<f32>(hu2_max_new, hv2_max_new, momflux_max_new, vorticity_means_new));
    textureStore(txtemp_Means_Momflux, idx, vec4<f32>(hu2_max_new, 0.0, momflux_max_new, 0.0));
   // textureStore(txModelVelocities, idx, vec4<f32>(u, v, eta, h));
    textureStore(txModelVelocities, idx, vec4<f32>(u, 0.0, eta, h));
}

