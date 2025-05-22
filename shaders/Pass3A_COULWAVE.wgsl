struct Globals {
    width: i32,
    height: i32,
    one_over_dx: f32,
    one_over_dy: f32,
    Bous_alpha: f32,
    delta: f32,
};

@group(0) @binding(0) var<uniform> globals: Globals;

@group(0) @binding(1) var txState: texture_2d<f32>;
@group(0) @binding(2) var txBottom: texture_2d<f32>;
@group(0) @binding(3) var txU: texture_2d<f32>;
@group(0) @binding(4) var txV: texture_2d<f32>;

@group(0) @binding(5) var txModelVelocities: texture_storage_2d<rgba32float, write>;
@group(0) @binding(6) var txCW_zalpha: texture_storage_2d<rgba32float, write>;
@group(0) @binding(7) var txCW_uvhuhv: texture_storage_2d<rgba32float, write>;


@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
    let idx = vec2<i32>(i32(id.x), i32(id.y));

    let rightIdx = min(idx + vec2<i32>(1, 0), vec2<i32>(i32(globals.width)-1, i32(globals.height)-1));
    let upIdx = min(idx + vec2<i32>(0, 1), vec2<i32>(i32(globals.width)-1, i32(globals.height)-1));
    let leftIdx = max(idx + vec2<i32>(-1, 0), vec2<i32>(0, 0));
    let downIdx = max(idx + vec2<i32>(0, -1), vec2<i32>(0, 0));

    // u, v here
    var u4 = textureLoad(txU, idx, 0);
    var v4 = textureLoad(txV, idx, 0);
    let u_here = (u4.x + u4.y + u4.z + u4.w) / 4.0;
    let v_here = (v4.x + v4.y + v4.z + v4.w) / 4.0;

    // eta, depth here
    let eta_here = textureLoad(txState, idx, 0).x;
    let d_here = -textureLoad(txBottom, idx, 0).z;
    let H_here = max(globals.delta, eta_here + d_here);
   // let u_here = textureLoad(txState, idx, 0).y / H_here;  //testing whether velocities directly from flux are better.  They are not
   // let v_here = textureLoad(txState, idx, 0).z / H_here;

    let za_here = -d_here + ( 1.0 + globals.Bous_alpha ) * H_here;	
    //let za_here = d_here * globals.Bous_alpha;

    // depth right
    let eta_ip1 = textureLoad(txState, rightIdx, 0).x;
    let d_ip1 = -textureLoad(txBottom, rightIdx, 0).z;
    let H_ip1 = max(globals.delta, eta_ip1 + d_ip1);
    let za_ip1 = -d_ip1 + ( 1.0 + globals.Bous_alpha ) * H_ip1;
    //let za_ip1 = d_ip1 * globals.Bous_alpha;

    // depth left
    let eta_im1 = textureLoad(txState, leftIdx, 0).x;
    let d_im1 = -textureLoad(txBottom, leftIdx, 0).z;
    let H_im1 = max(globals.delta, eta_im1 + d_im1);
    let za_im1 = -d_im1 + ( 1.0 + globals.Bous_alpha ) * H_im1;
    //let za_im1 = d_im1 * globals.Bous_alpha;

    // depth up
    let eta_jp1 = textureLoad(txState, upIdx, 0).x;
    let d_jp1 = -textureLoad(txBottom, upIdx, 0).z;
    let H_jp1 = max(globals.delta, eta_jp1 + d_jp1);
    let za_jp1 = -d_jp1 + ( 1.0 + globals.Bous_alpha ) * H_jp1;
    //let za_jp1 = d_jp1 * globals.Bous_alpha;

    // depth down
    let eta_jm1 = textureLoad(txState, downIdx, 0).x;
    let d_jm1 = -textureLoad(txBottom, downIdx, 0).z;
    let H_jm1 = max(globals.delta, eta_jm1 + d_jm1);
    let za_jm1 = -d_jm1 + ( 1.0 + globals.Bous_alpha ) * H_jm1;
    //let za_jm1 = d_jm1 * globals.Bous_alpha;

    let dzadx = 0.5 * (za_ip1 - za_im1) * globals.one_over_dx;
    let dzady = 0.5 * (za_jp1 - za_jm1) * globals.one_over_dy;

    let vel_out = vec4<f32>(u_here, v_here, eta_here, H_here);
    let za_out = vec4<f32>(za_here, dzadx, dzady, 0.0);
    let uvhuhv = vec4<f32>(u_here, v_here, u_here * d_here, v_here * d_here);

    textureStore(txModelVelocities, idx, vel_out);
    textureStore(txCW_zalpha, idx, za_out);
    textureStore(txCW_uvhuhv, idx, uvhuhv);
}
