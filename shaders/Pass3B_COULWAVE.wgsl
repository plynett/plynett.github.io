struct Globals {
    width: i32,
    height: i32,
    one_over_dx: f32,
    one_over_dy: f32,
    one_over_d2x: f32,
    one_over_d2y: f32,
    one_over_dxdy: f32,
};

@group(0) @binding(0) var<uniform> globals: Globals;

@group(0) @binding(1) var txState: texture_2d<f32>;
@group(0) @binding(2) var txBottom: texture_2d<f32>;
@group(0) @binding(3) var txCW_uvhuhv: texture_2d<f32>;
@group(0) @binding(4) var txCW_zalpha: texture_2d<f32>;

@group(0) @binding(5) var txCW_STval: texture_storage_2d<rgba32float, write>;
@group(0) @binding(6) var txCW_STgrad: texture_storage_2d<rgba32float, write>;
@group(0) @binding(7) var txCW_Eterms: texture_storage_2d<rgba32float, write>;
@group(0) @binding(8) var txCW_FGterms: texture_storage_2d<rgba32float, write>; 
@group(0) @binding(9) var dU_by_dt: texture_2d<f32>; 

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
    let idx = vec2<i32>(i32(id.x), i32(id.y));

 // Compute the coordinates of the neighbors for each pixel, and enforce boundary conditions
    let rightIdx = min(idx + vec2<i32>(1, 0), vec2<i32>(i32(globals.width)-1, i32(globals.height)-1));
    let upIdx = min(idx + vec2<i32>(0, 1), vec2<i32>(i32(globals.width)-1, i32(globals.height)-1));
    let leftIdx = max(idx + vec2<i32>(-1, 0), vec2<i32>(0, 0));
    let downIdx = max(idx + vec2<i32>(0, -1), vec2<i32>(0, 0));
    let rightrightIdx = min(idx + vec2<i32>(2, 0), vec2<i32>(i32(globals.width)-1, i32(globals.height)-1));
    let upupIdx = min(idx + vec2<i32>(0, 2), vec2<i32>(i32(globals.width)-1, i32(globals.height)-1));
    let leftleftIdx = max(idx + vec2<i32>(-2, 0), vec2<i32>(0, 0));
    let downdownIdx = max(idx + vec2<i32>(0, -2), vec2<i32>(0, 0));

    let upleftIdx =vec2<i32>(min(idx.x + 1, i32(globals.width)-1), max(idx.y - 1, 0));
    let downrightIdx = vec2<i32>(max(idx.x - 1, 0), min(idx.y + 1, i32(globals.height)-1));
    let downleftIdx = vec2<i32>(max(idx.x - 1, 0), max(idx.y - 1, 0));
    let uprightIdx = vec2<i32>(min(idx.x + 1, i32(globals.width)-1), min(idx.y + 1, i32(globals.height)-1));
   
    // eta, hu, hv, depth here
    let eta_here = textureLoad(txState, idx, 0).x;
    let u_here = textureLoad(txCW_uvhuhv, idx, 0).x;
    let v_here = textureLoad(txCW_uvhuhv, idx, 0).y;
    let du_here = textureLoad(txCW_uvhuhv, idx, 0).z;
    let dv_here = textureLoad(txCW_uvhuhv, idx, 0).w;
    let d_here = -textureLoad(txBottom, idx, 0).z;
    let za_here = textureLoad(txCW_zalpha, idx, 0).x;
    let H_here = max(0.0, eta_here + d_here);

    // eta, hu, hv, depth right
    var all_vars = textureLoad(txCW_uvhuhv, rightIdx, 0);
    let u_ip1 = all_vars.x;
    let v_ip1 = all_vars.y;
    let du_ip1 = all_vars.z;
    let dv_ip1 = all_vars.w;

    // eta, hu, hv, depth left
    all_vars = textureLoad(txCW_uvhuhv, leftIdx, 0);
    let u_im1 = all_vars.x;
    let v_im1 = all_vars.y;
    let du_im1 = all_vars.z;
    let dv_im1 = all_vars.w;

    // eta, hu, hv, depth up
    all_vars = textureLoad(txCW_uvhuhv, upIdx, 0);
    let u_jp1 = all_vars.x;
    let v_jp1 = all_vars.y;
    let du_jp1 = all_vars.z;
    let dv_jp1 = all_vars.w;

    // eta, hu, hv, depth down
    all_vars = textureLoad(txCW_uvhuhv, downIdx, 0);
    let u_jm1 = all_vars.x;
    let v_jm1 = all_vars.y;
    let du_jm1 = all_vars.z;
    let dv_jm1 = all_vars.w;

    // hu, hv, up left
    all_vars = textureLoad(txCW_uvhuhv, upleftIdx, 0);
    let u_jp1_im1 = all_vars.x;
    let v_jp1_im1 = all_vars.y;
    let du_jp1_im1 = all_vars.z;
    let dv_jp1_im1 = all_vars.w;

    // hu, hv, up right
    all_vars = textureLoad(txCW_uvhuhv, uprightIdx, 0);
    let u_jp1_ip1 = all_vars.x;
    let v_jp1_ip1 = all_vars.y;
    let du_jp1_ip1 = all_vars.z;
    let dv_jp1_ip1 = all_vars.w;

    // hu, hv, down left
    all_vars = textureLoad(txCW_uvhuhv, downleftIdx, 0);
    let u_jm1_im1 = all_vars.x;
    let v_jm1_im1 = all_vars.y;
    let du_jm1_im1 = all_vars.z;
    let dv_jm1_im1 = all_vars.w;

    // hu, hv, down right
    all_vars = textureLoad(txCW_uvhuhv, downrightIdx, 0);
    let u_jm1_ip1 = all_vars.x;
    let v_jm1_ip1 = all_vars.y;
    let du_jm1_ip1 = all_vars.z;
    let dv_jm1_ip1 = all_vars.w;

    // // hu, hv right right  // comment this block if testing with 4th order derivatives
    // all_vars = textureLoad(txCW_uvhuhv, rightrightIdx, 0);
    // let u_ip2 = all_vars.x;
    // let v_ip2 = all_vars.y;
    // let du_ip2 = all_vars.z;
    // let dv_ip2 = all_vars.w;

    // // hu, hv left left
    // all_vars = textureLoad(txCW_uvhuhv, leftleftIdx, 0);
    // let u_im2 = all_vars.x;
    // let v_im2 = all_vars.y;
    // let du_im2 = all_vars.z;
    // let dv_im2 = all_vars.w;

    // // hu, hv up up
    // all_vars = textureLoad(txCW_uvhuhv, upupIdx, 0);
    // let u_jp2 = all_vars.x;
    // let v_jp2 = all_vars.y;
    // let du_jp2 = all_vars.z;
    // let dv_jp2 = all_vars.w;

    // // hu, hv down down
    // all_vars = textureLoad(txCW_uvhuhv, downdownIdx, 0);
    // let u_jm2 = all_vars.x;
    // let v_jm2 = all_vars.y;
    // let du_jm2 = all_vars.z;
    // let dv_jm2 = all_vars.w;

    // 2nd order derivatives
    let dudx =  0.5 * ( u_ip1 -  u_im1) * globals.one_over_dx;
    let dhudx = 0.5 * (du_ip1 - du_im1) * globals.one_over_dx;
    let dudy =  0.5 * ( u_jp1 -  u_jm1) * globals.one_over_dy;
    let dhudy = 0.5 * (du_jp1 - du_jm1) * globals.one_over_dy;
    let dvdx =  0.5 * ( v_ip1 -  v_im1) * globals.one_over_dx;
    let dhvdx = 0.5 * (dv_ip1 - dv_im1) * globals.one_over_dx;
    let dvdy =  0.5 * ( v_jp1 -  v_jm1) * globals.one_over_dy;
    let dhvdy = 0.5 * (dv_jp1 - dv_jm1) * globals.one_over_dy;
    let d2udx2 =  ( u_ip1 - 2.0 *  u_here +  u_im1) * globals.one_over_d2x;
    let d2hudx2 = (du_ip1 - 2.0 * du_here + du_im1) * globals.one_over_d2x;
    let d2vdy2 =  ( v_jp1 - 2.0 *  v_here +  v_jm1) * globals.one_over_d2y;
    let d2hvdy2 = (dv_jp1 - 2.0 * dv_here + dv_jm1) * globals.one_over_d2y;

    let d2udxdy = 0.25 *   ( u_jp1_ip1 -  u_jm1_ip1 -  u_jp1_im1 +  u_jm1_im1) * globals.one_over_dxdy;
    let d2vdxdy = 0.25 *   ( v_jp1_ip1 -  v_jm1_ip1 -  v_jp1_im1 +  v_jm1_im1) * globals.one_over_dxdy;
    let d2hudxdy = 0.25 *  (du_jp1_ip1 - du_jm1_ip1 - du_jp1_im1 + du_jm1_im1) * globals.one_over_dxdy;
    let d2hvdxdy = 0.25 *  (dv_jp1_ip1 - dv_jm1_ip1 - dv_jp1_im1 + dv_jm1_im1) * globals.one_over_dxdy;
    
    // 4th order derivatives
    // let dudx = 1.0 / 12.0 *  ( u_ip2 - 8.0 *  u_ip1 + 8.0 *  u_im1 -  u_im2) * globals.one_over_dx;  
    // let dhudx = 1.0 / 12.0 * (du_ip2 - 8.0 * du_ip1 + 8.0 * du_im1 - du_im2) * globals.one_over_dx;
    // let dudy = 1.0 / 12.0 *  ( u_jp2 - 8.0 *  u_jp1 + 8.0 *  u_jm1 -  u_jm2) * globals.one_over_dy;
    // let dhudy = 1.0 / 12.0 * (du_jp2 - 8.0 * du_jp1 + 8.0 * du_jm1 - du_jm2) * globals.one_over_dy;
    // let dvdx = 1.0 / 12.0 *  ( v_ip2 - 8.0 *  v_ip1 + 8.0 *  v_im1 -  v_im2) * globals.one_over_dx;
    // let dhvdx = 1.0 / 12.0 * (dv_ip2 - 8.0 * dv_ip1 + 8.0 * dv_im1 - dv_im2) * globals.one_over_dx;
    // let dvdy = 1.0 / 12.0 *  ( v_jp2 - 8.0 *  v_jp1 + 8.0 *  v_jm1 -  v_jm2) * globals.one_over_dy;  
    // let dhvdy = 1.0 / 12.0 * (dv_jp2 - 8.0 * dv_jp1 + 8.0 * dv_jm1 - dv_jm2) * globals.one_over_dy;
    // let d2udx2 = 1.0 / 12.0 *   ( u_ip2 - 16.0 *  u_ip1 + 30.0 *  u_here - 16.0 *  u_im1 +  u_im2) * globals.one_over_d2x;
    // let d2hudx2 = 1.0 / 12.0 *  (du_ip2 - 16.0 * du_ip1 + 30.0 * du_here - 16.0 * du_im1 + du_im2) * globals.one_over_d2x;
    // let d2vdy2 = 1.0 / 12.0 *   ( v_jp2 - 16.0 *  v_jp1 + 30.0 *  v_here - 16.0 *  v_jm1 +  v_jm2) * globals.one_over_d2y;
    // let d2hvdy2 = 1.0 / 12.0 *  (dv_jp2 - 16.0 * dv_jp1 + 30.0 * dv_here - 16.0 * dv_jm1 + dv_jm2) * globals.one_over_d2y;

    let S = dudx + dvdy;
    let T = dhudx + dhvdy;
    let dSdx = d2udx2 + d2vdxdy;
    let dSdy = d2udxdy + d2vdy2;
    let dTdx = d2hudx2 + d2hvdxdy;
    let dTdy = d2hudxdy + d2hvdy2;

    // E (eta) storage variaables
    let eta_2 = eta_here * eta_here;
    let eta_3 = eta_2 * eta_here;
    let d_2 = d_here * d_here;
    let d_3 = d_2 * d_here;
    let za_2 = za_here * za_here;

    let temp2 = 1.0 / 6.0 * (eta_2 - eta_here * d_here + d_2) - 1.0 / 2.0 * za_2;
    let temp3 = 1.0 / 2.0 * (eta_here - d_here) - za_here;

    let E1 = H_here * (temp2 * dSdx + temp3 * dTdx);
    let E2 = H_here * (temp2 * dSdy + temp3 * dTdy);

    // F, G (hu, hv) storage variables
    let E = textureLoad(dU_by_dt, idx, 0).x;
    let EzST = E * (eta_here * S + T);
    let TzS2 = eta_2 * S * S + 2.0 * eta_here * S * T + T * T;
    let uSxvSy = 0.5 * (za_2 - eta_2) * (u_here * dSdx + v_here * dSdy);
    let uTxvTy = (za_here - eta_here) * (u_here * dTdx + v_here * dTdy);

    let ST_cross = vec4<f32>(S, T, d2udxdy, d2vdxdy);
    let ST_grads = vec4<f32>(dSdx, dSdy, dTdx, dTdy);
    let E_terms = vec4<f32>(E1, E2, E, dvdx - dudy);  
    let FG_terms = vec4<f32>(EzST, TzS2, uSxvSy, uTxvTy);

    textureStore(txCW_STval, idx, ST_cross);
    textureStore(txCW_STgrad, idx, ST_grads);
    textureStore(txCW_Eterms, idx, E_terms);
    textureStore(txCW_FGterms, idx, FG_terms);
}
