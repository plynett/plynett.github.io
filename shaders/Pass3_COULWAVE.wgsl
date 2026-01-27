struct Globals {
    width: i32,
    height: i32,
    dt: f32,
    dx: f32,
    dy: f32,
    one_over_dx: f32,
    one_over_dy: f32,
    g_over_dx: f32,
    g_over_dy: f32,
    timeScheme: i32,
    epsilon: f32,
    isManning: i32,
    g: f32,
    friction: f32,
    pred_or_corrector: i32,
    Bcoef: f32,
    Bcoef_g: f32,
    one_over_d2x: f32,
    one_over_d3x: f32,
    one_over_d2y: f32,
    one_over_d3y: f32,
    one_over_dxdy: f32,
    seaLevel: f32,
    dissipation_threshold: f32,
    whiteWaterDecayRate: f32,
    clearConc: i32,
    delta: f32,
    base_depth: f32,
    whiteWaterDispersion: f32,
    infiltrationRate: f32,
    useBreakingModel: i32,
    showBreaking: i32,
    west_boundary_type: i32,
    east_boundary_type: i32,
    south_boundary_type: i32,
    north_boundary_type: i32,
    vort_friction_factor: f32,
};

@group(0) @binding(0) var<uniform> globals: Globals;

@group(0) @binding(1) var txState: texture_2d<f32>;
@group(0) @binding(2) var txBottom: texture_2d<f32>;
@group(0) @binding(3) var txCW_groupings: texture_3d<f32>;
@group(0) @binding(4) var txXFlux: texture_2d<f32>;
@group(0) @binding(5) var txYFlux: texture_2d<f32>;
@group(0) @binding(6) var oldGradients: texture_2d<f32>;
@group(0) @binding(7) var oldOldGradients: texture_2d<f32>;
@group(0) @binding(8) var predictedGradients: texture_2d<f32>;
@group(0) @binding(9) var F_G_star_oldGradients: texture_2d<f32>;
@group(0) @binding(10) var F_G_star_oldOldGradients: texture_2d<f32>;
@group(0) @binding(11) var txstateUVstar: texture_2d<f32>;
@group(0) @binding(12) var txBoundaryForcing: texture_2d<f32>;

@group(0) @binding(13) var txNewState: texture_storage_2d<rgba32float, write>;
@group(0) @binding(14) var dU_by_dt: texture_storage_2d<rgba32float, write>;
@group(0) @binding(15) var F_G_star: texture_storage_2d<rgba32float, write>;
@group(0) @binding(16) var current_stateUVstar: texture_storage_2d<rgba32float, write>;  

@group(0) @binding(17) var txBottomFriction: texture_2d<f32>; 
@group(0) @binding(18) var txBreaking: texture_2d<f32>;
@group(0) @binding(19) var txDissipationFlux: texture_2d<f32>;
@group(0) @binding(20) var txContSource: texture_2d<f32>;


fn FrictionCalc(hu: f32, hv: f32, h: f32, friction_here: f32) -> f32 {
   
     // need this special scaling step due to the need to take h^4, and precision issues with a single precision solver
     // this lets us explicitly control the allowed precision in the scaled h^4, which we set to 1e-6.
     // this implies that bottom friction may become inaccurate for flow depths less than ~ 5% of the base depth
     // this approach will make bottom friction much SMALLER in these small flow depths
     // I can not see a solution to this issue within the constraints of single precision for this term
    let h_scaled = h / globals.base_depth;
    let h2 = h_scaled * h_scaled;
    let h4 = h2 * h2;
    let divide_by_h2 = 2.0 * h2 / (h4 + max(h4, 1.e-6)) / globals.base_depth / globals.base_depth;
 
    let divide_by_h = 1. / max(h, globals.delta); 

    var f: f32;
    if (globals.isManning == 1) {
        f = globals.g * pow(friction_here, 2.0) * pow(abs(divide_by_h), 1.0 / 3.0);
    } else {
        f = friction_here;
    }

    f = min(f, 0.5);  // non-physical above 0.5

    f = f * sqrt(hu * hu + hv * hv) * divide_by_h2;

    return f;
}

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
    let idx = vec2<i32>(i32(id.x), i32(id.y));

    if (idx.x >= globals.width - 2 || idx.y >= globals.height - 2 || idx.x <= 1 || idx.y <= 1) {
        let zero = vec4<f32>(0.0, 0.0, 0.0, 0.0);
        textureStore(txNewState, idx, zero);
        textureStore(dU_by_dt, idx, zero);
        textureStore(F_G_star, idx, zero);
        textureStore(current_stateUVstar, idx, zero);
        return;
    }
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
   
    let B_here = textureLoad(txBottom, idx, 0).z;

    let in_state_here = textureLoad(txState, idx, 0);
    let in_state_here_UV = textureLoad(txstateUVstar, idx, 0);

    // Calculate local h,w
    let h_here = max(0.0, in_state_here.x - B_here);

    let B_south = textureLoad(txBottom, downIdx, 0).z;
    let B_north = textureLoad(txBottom, upIdx, 0).z;
    let B_west = textureLoad(txBottom, leftIdx, 0).z;
    let B_east = textureLoad(txBottom, rightIdx, 0).z;

    let eta_here = in_state_here.x;
    let eta_west = textureLoad(txState, leftIdx, 0).x;
    let eta_east = textureLoad(txState, rightIdx, 0).x;
    let eta_south = textureLoad(txState, downIdx, 0).x;
    let eta_north = textureLoad(txState, upIdx, 0).x;

    let h_west = eta_west - B_west;
    let h_east = eta_east - B_east;
    let h_north = eta_north - B_north;
    let h_south = eta_south - B_south;

    let h_cut = globals.delta;
    if (h_here <= h_cut) {  //if dry and surrounded by dry, then stay dry - no need to calc
        if(h_north <= h_cut && h_east <= h_cut && h_south <= h_cut && h_west <= h_cut) {
            let zero = vec4<f32>(0.0, 0.0, 0.0, 0.0);
            textureStore(txNewState, idx, vec4<f32>(B_here, 0.0, 0.0, 0.0));
            textureStore(dU_by_dt, idx, zero);
            textureStore(F_G_star, idx, zero);
            textureStore(current_stateUVstar, idx, vec4<f32>(B_here, 0.0, 0.0, 0.0));
            return; 
        }
    }

    var h_min = vec4<f32>(0.0, 0.0, 0.0, 0.0);
    h_min.x= min(h_here, h_north);
    h_min.y= min(h_here, h_east);
    h_min.z= min(h_here, h_south);
    h_min.w= min(h_here, h_west);

    var near_dry = textureLoad(txBottom, idx, 0).w;

    // Load values from txXFlux and txYFlux using idx
    let xflux_here = textureLoad(txXFlux, idx, 0);
    let xflux_west = textureLoad(txXFlux, leftIdx, 0);
    let yflux_here = textureLoad(txYFlux, idx, 0);
    let yflux_south = textureLoad(txYFlux, downIdx, 0);

    var detadx = 0.5*(eta_east - eta_west) * globals.one_over_dx;
    var detady = 0.5*(eta_north - eta_south) * globals.one_over_dy;

    // previous derivatives
    let oldies = textureLoad(oldGradients, idx, 0);
    let oldOldies = textureLoad(oldOldGradients, idx, 0);

    var F_star = 0.0;
    var G_star = 0.0;
    var Psi1x = 0.0;
    var Psi2x = 0.0;
    var Psi1y = 0.0;
    var Psi2y = 0.0;
    var E_src = 0.0;
    
    let d_here = -B_here;
    // periodic boundary condition fix for Boussinesq model
    var periodic_bc_fix = -1;
    if (globals.west_boundary_type == 3 && (idx.x >= globals.width - 3 || idx.x <= 2) ) {
        periodic_bc_fix = 1;
    } 

    if (globals.south_boundary_type == 3 && (idx.y >= globals.height - 3 || idx.y <= 2) ){
        periodic_bc_fix = 1;
    } 

    if (near_dry > 0. && periodic_bc_fix < 0) 
    { // only proceed if not near an initially dry cell
       
        let in_state_right = textureLoad(txState, rightIdx, 0).xyz;
        let in_state_left = textureLoad(txState, leftIdx, 0).xyz;
        let in_state_up = textureLoad(txState, upIdx, 0).xyz;
        let in_state_down = textureLoad(txState, downIdx, 0).xyz;
        let in_state_up_left = textureLoad(txState, upleftIdx, 0).xyz;
        let in_state_up_right = textureLoad(txState, uprightIdx, 0).xyz;
        let in_state_down_left = textureLoad(txState, downleftIdx, 0).xyz;
        let in_state_down_right = textureLoad(txState, downrightIdx, 0).xyz;

        let F_G_star_oldies = textureLoad(F_G_star_oldGradients, idx, 0).xyz;
        let F_G_star_oldOldies = textureLoad(F_G_star_oldOldGradients, idx, 0).xyz;
        
        let eta_left = in_state_left.x;
        let eta_right = in_state_right.x;
        let eta_down = in_state_down.x;
        let eta_up = in_state_up.x;

        let eta_left_left = textureLoad(txState, leftleftIdx, 0).x;
        let eta_right_right = textureLoad(txState, rightrightIdx, 0).x;
        let eta_down_down = textureLoad(txState, downdownIdx, 0).x;
        let eta_up_up = textureLoad(txState, upupIdx, 0).x;

        detadx = 1.0 / 12.0 * (eta_left_left - 8.0 * eta_left + 8.0 * eta_right - eta_right_right) * globals.one_over_dx;
        detady = 1.0 / 12.0 * (eta_down_down - 8.0 * eta_down + 8.0 * eta_up - eta_up_up) * globals.one_over_dy;

        // 2nd order derivatives for inside HO terms
        let detadx_loworder = 0.5 * (eta_right - eta_left) * globals.one_over_dx;
        let detady_loworder = 0.5 * (eta_up - eta_down) * globals.one_over_dy;

        // level 0: txModelVelocities, [u, v, eta, h]
        // level 1: txCW_zalpha, [za, dzadx, dzady, 0.0)]
        // level 2: txCW_STval, [S, T, d2udxdy, d2vdxdy]
        // level 3: txCW_STgrad, [dSdx, dSdy, dTdx, dTdy]
        // level 4: txCW_Eterms, [E1, E2, E,  dvdx - dudy]
        // level 5: txCW_FGterms, [EzST, TzS2, uSxvSy, uTxvTy]

        // Coulwave terms fetch
        var level = 0;
        let u_here = textureLoad(txCW_groupings, vec3<i32>(idx.x, idx.y, level), 0).x;
        let v_here = textureLoad(txCW_groupings, vec3<i32>(idx.x, idx.y, level), 0).y;
        let u_ip1 = textureLoad(txCW_groupings, vec3<i32>(rightIdx.x, rightIdx.y, level), 0).x;
        let u_im1 = textureLoad(txCW_groupings, vec3<i32>(leftIdx.x, leftIdx.y, level), 0).x;
        let v_jp1 = textureLoad(txCW_groupings, vec3<i32>(upIdx.x, upIdx.y, level), 0).y;
        let v_jm1 = textureLoad(txCW_groupings, vec3<i32>(downIdx.x, downIdx.y, level), 0).y;

        let u_ip1_jp1 = textureLoad(txCW_groupings, vec3<i32>(uprightIdx.x, uprightIdx.y, level), 0).x;
        let u_ip1_jm1 = textureLoad(txCW_groupings, vec3<i32>(downrightIdx.x, downrightIdx.y, level), 0).x;
        let u_im1_jp1 = textureLoad(txCW_groupings, vec3<i32>(upleftIdx.x, upleftIdx.y, level), 0).x;
        let u_im1_jm1 = textureLoad(txCW_groupings, vec3<i32>(downleftIdx.x, downleftIdx.y, level), 0).x;

        let v_ip1_jp1 = textureLoad(txCW_groupings, vec3<i32>(uprightIdx.x, uprightIdx.y, level), 0).y;
        let v_ip1_jm1 = textureLoad(txCW_groupings, vec3<i32>(downrightIdx.x, downrightIdx.y, level), 0).y;
        let v_im1_jp1 = textureLoad(txCW_groupings, vec3<i32>(upleftIdx.x, upleftIdx.y, level), 0).y;
        let v_im1_jm1 = textureLoad(txCW_groupings, vec3<i32>(downleftIdx.x, downleftIdx.y, level), 0).y;
        
        let du_here = textureLoad(txCW_groupings, vec3<i32>(idx.x, idx.y, level), 0).z;
        let dv_here = textureLoad(txCW_groupings, vec3<i32>(idx.x, idx.y, level), 0).w;
        let du_ip1 = textureLoad(txCW_groupings, vec3<i32>(rightIdx.x, rightIdx.y, level), 0).z;
        let du_im1 = textureLoad(txCW_groupings, vec3<i32>(leftIdx.x, leftIdx.y, level), 0).z;
        let dv_jp1 = textureLoad(txCW_groupings, vec3<i32>(upIdx.x, upIdx.y, level), 0).w;
        let dv_jm1 = textureLoad(txCW_groupings, vec3<i32>(downIdx.x, downIdx.y, level), 0).w;

        let du_ip1_jp1 = textureLoad(txCW_groupings, vec3<i32>(uprightIdx.x, uprightIdx.y, level), 0).z;
        let du_ip1_jm1 = textureLoad(txCW_groupings, vec3<i32>(downrightIdx.x, downrightIdx.y, level), 0).z;
        let du_im1_jp1 = textureLoad(txCW_groupings, vec3<i32>(upleftIdx.x, upleftIdx.y, level), 0).z;
        let du_im1_jm1 = textureLoad(txCW_groupings, vec3<i32>(downleftIdx.x, downleftIdx.y, level), 0).z;

        let dv_ip1_jp1 = textureLoad(txCW_groupings, vec3<i32>(uprightIdx.x, uprightIdx.y, level), 0).w;
        let dv_ip1_jm1 = textureLoad(txCW_groupings, vec3<i32>(downrightIdx.x, downrightIdx.y, level), 0).w;
        let dv_im1_jp1 = textureLoad(txCW_groupings, vec3<i32>(upleftIdx.x, upleftIdx.y, level), 0).w;
        let dv_im1_jm1 = textureLoad(txCW_groupings, vec3<i32>(downleftIdx.x, downleftIdx.y, level), 0).w;

        level = 1;
        let za_here = textureLoad(txCW_groupings, vec3<i32>(idx.x, idx.y, level), 0).x;
        let dzadx = textureLoad(txCW_groupings, vec3<i32>(idx.x, idx.y, level), 0).y;
        let dzady = textureLoad(txCW_groupings, vec3<i32>(idx.x, idx.y, level), 0).z;

        level = 2;
        let S_here = textureLoad(txCW_groupings, vec3<i32>(idx.x, idx.y, level), 0).x;
        let T_here = textureLoad(txCW_groupings, vec3<i32>(idx.x, idx.y, level), 0).y;

        level = 3;
        let dSdx = textureLoad(txCW_groupings, vec3<i32>(idx.x, idx.y, level), 0).x;
        let dSdy = textureLoad(txCW_groupings, vec3<i32>(idx.x, idx.y, level), 0).y;
        let dTdx = textureLoad(txCW_groupings, vec3<i32>(idx.x, idx.y, level), 0).z;
        let dTdy = textureLoad(txCW_groupings, vec3<i32>(idx.x, idx.y, level), 0).w;

        level = 4;
        let E1_ip1 = textureLoad(txCW_groupings, vec3<i32>(rightIdx.x, rightIdx.y, level), 0).x;
        let E1_im1 = textureLoad(txCW_groupings, vec3<i32>(leftIdx.x, leftIdx.y, level), 0).x;

        let E2_jp1 = textureLoad(txCW_groupings, vec3<i32>(upIdx.x, upIdx.y, level), 0).y;
        let E2_jm1 = textureLoad(txCW_groupings, vec3<i32>(downIdx.x, downIdx.y, level), 0).y;

        let E_here = textureLoad(txCW_groupings, vec3<i32>(idx.x, idx.y, level), 0).z;
        let vort_here = textureLoad(txCW_groupings, vec3<i32>(idx.x, idx.y, level), 0).w;  

        level = 5;
        let EzST_ip1 = textureLoad(txCW_groupings, vec3<i32>(rightIdx.x, rightIdx.y, level), 0).x;
        let EzST_im1 = textureLoad(txCW_groupings, vec3<i32>(leftIdx.x, leftIdx.y, level), 0).x;
        let EzST_jp1 = textureLoad(txCW_groupings, vec3<i32>(upIdx.x, upIdx.y, level), 0).x;
        let EzST_jm1 = textureLoad(txCW_groupings, vec3<i32>(downIdx.x, downIdx.y, level), 0).x;

        let TzS2_ip1 = textureLoad(txCW_groupings, vec3<i32>(rightIdx.x, rightIdx.y, level), 0).y;
        let TzS2_im1 = textureLoad(txCW_groupings, vec3<i32>(leftIdx.x, leftIdx.y, level), 0).y;
        let TzS2_jp1 = textureLoad(txCW_groupings, vec3<i32>(upIdx.x, upIdx.y, level), 0).y;
        let TzS2_jm1 = textureLoad(txCW_groupings, vec3<i32>(downIdx.x, downIdx.y, level), 0).y;
        
        let uSxvSy_ip1 = textureLoad(txCW_groupings, vec3<i32>(rightIdx.x, rightIdx.y, level), 0).z;
        let uSxvSy_im1 = textureLoad(txCW_groupings, vec3<i32>(leftIdx.x, leftIdx.y, level), 0).z;
        let uSxvSy_jp1 = textureLoad(txCW_groupings, vec3<i32>(upIdx.x, upIdx.y, level), 0).z;
        let uSxvSy_jm1 = textureLoad(txCW_groupings, vec3<i32>(downIdx.x, downIdx.y, level), 0).z;
        
        let uTxvTy_ip1 = textureLoad(txCW_groupings, vec3<i32>(rightIdx.x, rightIdx.y, level), 0).w;
        let uTxvTy_im1 = textureLoad(txCW_groupings, vec3<i32>(leftIdx.x, leftIdx.y, level), 0).w;
        let uTxvTy_jp1 = textureLoad(txCW_groupings, vec3<i32>(upIdx.x, upIdx.y, level), 0).w;
        let uTxvTy_jm1 = textureLoad(txCW_groupings, vec3<i32>(downIdx.x, downIdx.y, level), 0).w;

        let dudx = 0.5 * (u_ip1 - u_im1) * globals.one_over_dx;
        let dvdy = 0.5 * (v_jp1 - v_jm1) * globals.one_over_dy;
        
        let ddudx = 0.5 * (du_ip1 - du_im1) * globals.one_over_dx;
        let ddvdy = 0.5 * (dv_jp1 - dv_jm1) * globals.one_over_dy;
        
        let dudxy = 0.25 *  ( u_ip1_jp1 -  u_ip1_jm1 -  u_im1_jp1 +  u_im1_jm1) * globals.one_over_dxdy;
        let dvdxy = 0.25 *  ( v_ip1_jp1 -  v_ip1_jm1 -  v_im1_jp1 +  v_im1_jm1) * globals.one_over_dxdy;
        let ddudxy = 0.25 * (du_ip1_jp1 - du_ip1_jm1 - du_im1_jp1 + du_im1_jm1) * globals.one_over_dxdy;
        let ddvdxy = 0.25 * (dv_ip1_jp1 - dv_ip1_jm1 - dv_im1_jp1 + dv_im1_jm1) * globals.one_over_dxdy;
 
        // E source terms, take to 2nd order
        let dE1dx = 1.0 / 2.0 * (E1_ip1 - E1_im1) * globals.one_over_dx;
        let dE2dy = 1.0 / 2.0 * (E2_jp1 - E2_jm1) * globals.one_over_dy;

        // F source terms
        var temp1 = u_here * (dE1dx + dE2dy);
        var temp2 = E_here * ( 0.5 * ( za_here * za_here - eta_here * eta_here) * dSdx
                               + (za_here - eta_here) * dTdx 
                               - detadx_loworder * (eta_here * S_here + T_here) );
        var temp3 = -0.5 * (EzST_ip1 - EzST_im1) * globals.one_over_dx;
        var temp4 = -0.5 * (uSxvSy_ip1 - uSxvSy_im1) * globals.one_over_dx;
        var temp5 = -0.5 * (uTxvTy_ip1 - uTxvTy_im1) * globals.one_over_dx;
        var temp6 = -0.5 * 0.5 * (TzS2_ip1 - TzS2_im1) * globals.one_over_dx;
        var temp7A= -v_here * dzadx * (dTdy + za_here * dSdy);
        var temp7B=  v_here * dzady * (dTdx + za_here * dSdx);
        var temp7C= -vort_here * ( (za_here - 0.5 * (eta_here - d_here)) * dTdy
            + (0.5 * za_here * za_here - 1.0 / 6.0 * (eta_here * eta_here  - eta_here * d_here + d_here * d_here)) * dSdy );

        let Fsrc = temp1 + temp2 + h_here * (temp3 + temp4 + temp5 + temp6 + temp7A + temp7B + temp7C);

        // G source terms
        temp1 = v_here * (dE1dx + dE2dy);
        temp2 = E_here * ( 0.5 * ( za_here * za_here - eta_here * eta_here) * dSdy
                               + (za_here - eta_here) * dTdy 
                               - detady_loworder * (eta_here * S_here + T_here) );
        temp3 = -0.5 * (EzST_jp1 - EzST_jm1) * globals.one_over_dy;   
        temp4 = -0.5 * (uSxvSy_jp1 - uSxvSy_jm1) * globals.one_over_dy;
        temp5 = -0.5 * (uTxvTy_jp1 - uTxvTy_jm1) * globals.one_over_dy;
        temp6 = -0.5 * 0.5 * (TzS2_jp1 - TzS2_jm1) * globals.one_over_dy;
        temp7A=  u_here * dzadx * (dTdy + za_here * dSdy);
        temp7B= -u_here * dzady * (dTdx + za_here * dSdx);
        temp7C=  vort_here * ( (za_here - 0.5 * (eta_here - d_here)) * dTdx
            + (0.5 * za_here * za_here - 1.0 / 6.0 * (eta_here * eta_here  - eta_here * d_here + d_here * d_here)) * dSdx );

        let Gsrc = temp1 + temp2 + h_here * (temp3 + temp4 + temp5 + temp6 + temp7A + temp7B + temp7C);

        let coef1 = 0.5*(eta_here * eta_here - za_here * za_here);
        let coef2 = - (za_here - eta_here);

        F_star = coef1 * dvdxy + coef2 * ddvdxy + detadx * (eta_here * dvdy + ddvdy);
        F_star = h_here * F_star;

        G_star = coef1 * dudxy + coef2 * ddudxy + detady * (eta_here * dudx + ddudx);
        G_star = h_here * G_star;

        Psi1x = Fsrc;
        Psi2x = (3.0 * F_star - 4.0 * F_G_star_oldies.y  + F_G_star_oldOldies.y) / globals.dt * 0.5;

        Psi1y = Gsrc;
        Psi2y = (3.0 * G_star - 4.0 * F_G_star_oldies.z  + F_G_star_oldOldies.z) / globals.dt * 0.5;

        E_src = (dE1dx + dE2dy);
    }
   
    // vorticity-based momentum mixing / dissipation
    var vorticity_dissipation = vec4<f32>(0.0, 0.0, 0.0, 0.0);
    if (globals.vort_friction_factor > 0.0) {
        let dPdxy = 0.25 * (textureLoad(txState, uprightIdx, 0).y - textureLoad(txState, upleftIdx, 0).y - textureLoad(txState, downrightIdx, 0).y + textureLoad(txState, downleftIdx, 0).y) * globals.one_over_dxdy;
        let dPdyy = (textureLoad(txState, upIdx, 0).y - 2.0 * in_state_here.y + textureLoad(txState, downIdx, 0).y) * globals.one_over_d2y;
        let dQdxx = (textureLoad(txState, rightIdx, 0).z - 2.0 * in_state_here.z + textureLoad(txState, leftIdx, 0).z) * globals.one_over_d2x;
        let dQdxy = 0.25 * (textureLoad(txState, uprightIdx, 0).z - textureLoad(txState, upleftIdx, 0).z - textureLoad(txState, downrightIdx, 0).z + textureLoad(txState, downleftIdx, 0).z) * globals.one_over_dxdy;
        let domegady = dPdyy - dQdxy;
        let domegadx = dPdxy - dQdxx;
        vorticity_dissipation.y = globals.vort_friction_factor  * domegady;
        vorticity_dissipation.z = -globals.vort_friction_factor  * domegadx;
    }

    let friction_here = max(globals.friction, textureLoad(txBottomFriction, idx, 0).x);
    var friction_ = FrictionCalc(in_state_here.y, in_state_here.z, h_here, friction_here);

    // dhdt for depth change option
    let dhdt = textureLoad(txBoundaryForcing, idx, 0).y;

    // Pressure stencil calculations
    let P_left = textureLoad(txBoundaryForcing, leftIdx, 0).x;
    let P_right = textureLoad(txBoundaryForcing, rightIdx, 0).x;
    let P_down = textureLoad(txBoundaryForcing, downIdx, 0).x;
    let P_up = textureLoad(txBoundaryForcing, upIdx, 0).x;

    let press_x = -0.5 * h_here * globals.g_over_dx * (P_right - P_left);
    let press_y = -0.5 * h_here * globals.g_over_dy * (P_up - P_down);

    // Calculate scalar transport additions
    let C_state_here = textureLoad(txState, idx, 0).w;
    let C_state_right = textureLoad(txState, rightIdx, 0).w;
    let C_state_left = textureLoad(txState, leftIdx, 0).w;
    let C_state_up = textureLoad(txState, upIdx, 0).w;
    let C_state_down = textureLoad(txState, downIdx, 0).w;
    let C_state_up_left = textureLoad(txState, upleftIdx, 0).w;
    let C_state_up_right = textureLoad(txState, uprightIdx, 0).w;
    let C_state_down_left = textureLoad(txState, downleftIdx, 0).w;
    let C_state_down_right = textureLoad(txState, downrightIdx, 0).w;

    let Dxx = globals.whiteWaterDispersion;
    let Dxy = globals.whiteWaterDispersion;
    let Dyy = globals.whiteWaterDispersion;

    let hc_by_dx_dx = Dxx * globals.one_over_d2x * (C_state_right - 2.0 * in_state_here.a + C_state_left);
    let hc_by_dy_dy = Dyy * globals.one_over_d2y * (C_state_up - 2.0 * in_state_here.a + C_state_down);
    let hc_by_dx_dy = 0.25 * Dxy * globals.one_over_dxdy * (C_state_up_right - C_state_up_left - C_state_down_right + C_state_down_left);

    let c_dissipation = -globals.whiteWaterDecayRate * C_state_here;

    // calculate breaking dissipation
    var breaking_x = 0.0;
    var breaking_y = 0.0;
    var breaking_B = 0.0;
    
    if(globals.useBreakingModel == 1) {
        breaking_B = textureLoad(txBreaking, idx, 0).z;  // breaking front parameter, non-breaking [0 - 1] breaking

        let nu_flux_here = textureLoad(txDissipationFlux, idx, 0);
        let nu_flux_right = textureLoad(txDissipationFlux, rightIdx, 0);
        let nu_flux_left = textureLoad(txDissipationFlux, leftIdx, 0);
        let nu_flux_up = textureLoad(txDissipationFlux, upIdx, 0);
        let nu_flux_down = textureLoad(txDissipationFlux, downIdx, 0);

        let dPdxx = 0.5 * (nu_flux_right.x - nu_flux_left.x) * globals.one_over_dx;
        let dPdyx = 0.5 * (nu_flux_right.y - nu_flux_left.y) * globals.one_over_dx;
        let dPdyy = 0.5 * (nu_flux_up.y - nu_flux_down.y) * globals.one_over_dy;

        let dQdxx = 0.5 * (nu_flux_right.z - nu_flux_left.z) * globals.one_over_dx;
        let dQdxy = 0.5 * (nu_flux_up.z - nu_flux_down.z) * globals.one_over_dy;
        let dQdyy = 0.5 * (nu_flux_up.w - nu_flux_down.w) * globals.one_over_dy;
        
        if (near_dry > 0.){
            breaking_x = dPdxx + 0.5 * dPdyy + 0.5 * dQdxy;
            breaking_y = dQdyy + 0.5 * dPdyx + 0.5 * dQdxx;
        }
    }
    
    // fix slope near shoreline
    if (h_min.x <= h_cut && h_min.z <= h_cut) {
        detady = 0.0;
    }
    else if (h_min.x <= h_cut) {  //north
        detady = 1.*(eta_here - eta_south) * globals.one_over_dy;
    }
    else if (h_min.z <= h_cut) {  //south
        detady = 1.*(eta_north - eta_here) * globals.one_over_dy;
    }

    if (h_min.y <= h_cut && h_min.w <= h_cut) {
        detadx = 0.0;
    }
    else if (h_min.y <= h_cut) {   //east
        detadx = 1.*(eta_here - eta_west) * globals.one_over_dx;
    }
    else if (h_min.w <= h_cut) {  //west
        detadx = 1.*(eta_east - eta_here) * globals.one_over_dx;
    }  

    var overflow_dry = 0.0;
    if(B_here > 0.0) {
        overflow_dry = -globals.infiltrationRate;  // hydraulic conductivity of coarse, unsaturated sand
    }

    let source_term = vec4<f32>(dhdt + overflow_dry + E_src, -globals.g * h_here * detadx - in_state_here.y * friction_ + breaking_x + (Psi1x + Psi2x) + press_x, -globals.g * h_here * detady - in_state_here.z * friction_ + breaking_y + (Psi1y + Psi2y) + press_y, hc_by_dx_dx + hc_by_dy_dy + 2.0 * hc_by_dx_dy + c_dissipation);

    let d_by_dt = (xflux_west - xflux_here) * globals.one_over_dx + (yflux_south - yflux_here) * globals.one_over_dy + source_term + vorticity_dissipation;

    var newState = vec4<f32>(0.0, 0.0, 0.0, 0.0);
    let F_G_here = vec4<f32>(0.0, F_star, G_star, 0.0);

    if (globals.timeScheme == 0) {
        newState = in_state_here_UV + globals.dt * d_by_dt;

    } else if (globals.pred_or_corrector == 1) {

        newState = in_state_here_UV + globals.dt / 12.0 * (23.0 * d_by_dt - 16.0 * oldies + 5.0 * oldOldies);

    } else if (globals.pred_or_corrector == 2) {

        let predicted = textureLoad(predictedGradients, idx, 0);
        newState = in_state_here_UV + globals.dt / 24.0 * (9.0 * d_by_dt + 19.0 * predicted - 5.0 * oldies + oldOldies);
    }

    if(globals.showBreaking ==1) {
        // add breaking source
        newState.a = max(newState.a, breaking_B);  // use the B value from Kennedy et al as a foam intensity
    }
    else if(globals.showBreaking == 2) {
        let contaminent_source = textureLoad(txContSource, idx, 0).r; 
        newState.a = min(1.0, newState.a + contaminent_source); 
    }

    // clear concentration if set
    if (globals.clearConc == 1){
        newState.a = 0.0; 
    }

    textureStore(txNewState, idx, newState);
    textureStore(dU_by_dt, idx, d_by_dt);
    textureStore(F_G_star, idx, F_G_here);
    textureStore(current_stateUVstar, idx, newState);
}
