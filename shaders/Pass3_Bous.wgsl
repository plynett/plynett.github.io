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
    pred_or_corrector: u32,
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
};

@group(0) @binding(0) var<uniform> globals: Globals;

@group(0) @binding(1) var txState: texture_2d<f32>;
@group(0) @binding(2) var txBottom: texture_2d<f32>;
@group(0) @binding(3) var txH: texture_2d<f32>;
@group(0) @binding(4) var txXFlux: texture_2d<f32>;
@group(0) @binding(5) var txYFlux: texture_2d<f32>;
@group(0) @binding(6) var oldGradients: texture_2d<f32>;
@group(0) @binding(7) var oldOldGradients: texture_2d<f32>;
@group(0) @binding(8) var predictedGradients: texture_2d<f32>;
@group(0) @binding(9) var F_G_star_oldGradients: texture_2d<f32>;
@group(0) @binding(10) var F_G_star_oldOldGradients: texture_2d<f32>;
@group(0) @binding(11) var txstateUVstar: texture_2d<f32>;
@group(0) @binding(12) var txShipPressure: texture_2d<f32>;

@group(0) @binding(13) var txNewState: texture_storage_2d<rgba32float, write>;
@group(0) @binding(14) var dU_by_dt: texture_storage_2d<rgba32float, write>;
@group(0) @binding(15) var F_G_star: texture_storage_2d<rgba32float, write>;
@group(0) @binding(16) var current_stateUVstar: texture_storage_2d<rgba32float, write>;  

@group(0) @binding(17) var txContSource: texture_2d<f32>;


fn FrictionCalc(hu: f32, hv: f32, h: f32) -> f32 {
    let h2 = h * h;
    let divide_by_h = 2.0 * h / sqrt(h2 + max(h2, globals.epsilon));

    var f: f32;
    if (globals.isManning == 1) {
        f = globals.g * pow(globals.friction, 2.0) * pow(abs(divide_by_h), 1.0 / 3.0);
    } else {
        f = globals.friction / 2.0;
    }

    f = f * sqrt(hu * hu + hv * hv) * divide_by_h * divide_by_h;

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

    let leftIdx = idx + vec2<i32>(-1, 0);
    let rightIdx = idx + vec2<i32>(1, 0);
    let downIdx = idx + vec2<i32>(0, -1);
    let upIdx = idx + vec2<i32>(0, 1);
    let upleftIdx = idx + vec2<i32>(-1, 1);
    let uprightIdx = idx + vec2<i32>(1, 1);
    let downleftIdx = idx + vec2<i32>(-1, -1);
    let downrightIdx = idx + vec2<i32>(1, -1);

    let B_here = textureLoad(txBottom, idx, 0).z;
    let near_dry = textureLoad(txBottom, idx, 0).w;

    let in_state_here = textureLoad(txState, idx, 0);
    let in_state_here_UV = textureLoad(txstateUVstar, idx, 0);

    // Calculate local h,w
    let h_vec = textureLoad(txH, idx, 0);
    let h_here = in_state_here.x - B_here;
    
    // Load values from txXFlux and txYFlux using idx
    let xflux_here = textureLoad(txXFlux, idx, 0);
    let xflux_west = textureLoad(txXFlux, leftIdx, 0);
    let yflux_here = textureLoad(txYFlux, idx, 0);
    let yflux_south = textureLoad(txYFlux, downIdx, 0);

    let B_south = textureLoad(txBottom, downIdx, 0).z;
    let B_north = textureLoad(txBottom, upIdx, 0).z;
    let B_west = textureLoad(txBottom, leftIdx, 0).z;
    let B_east = textureLoad(txBottom, rightIdx, 0).z;

    let eta_west = textureLoad(txState, leftIdx, 0).x;
    let eta_east = textureLoad(txState, rightIdx, 0).x;
    let eta_south = textureLoad(txState, downIdx, 0).x;
    let eta_north = textureLoad(txState, upIdx, 0).x;

    var detadx = 0.5*(eta_east - eta_west) * globals.one_over_dx;
    var detady = 0.5*(eta_north - eta_south) * globals.one_over_dy;
    
    // correction for "small" depth cells, fixes near-shoreline spurious waves
    let minH = min(h_vec.w, min(h_vec.z, min(h_vec.y, h_vec.x)));
    let dB = max(abs(B_south - B_here), max(abs(B_north - B_here), max(abs(B_west - B_here), abs(B_east - B_here))));
    let u_here = in_state_here.y;
    let v_here = in_state_here.z;
    let speed2_here = u_here * u_here + v_here * v_here;
    if (minH * minH < 2.0 * globals.dx * dB && speed2_here < 0.00001 * dB * globals.g) {
        detady = 0.0;
        detadx = 0.0;
    }
    
    // previous derivatives
    let oldies = textureLoad(oldGradients, idx, 0);
    let oldOldies = textureLoad(oldOldGradients, idx, 0);

    var F_star = 0.0;
    var G_star = 0.0;
    var Psi1x = 0.0;
    var Psi2x = 0.0;
    var Psi1y = 0.0;
    var Psi2y = 0.0;
    
    let d_here = globals.seaLevel - B_here;
    if (near_dry > 0)
    { // only proceed if not near an initially dry cell
        let d2_here = d_here * d_here;
        let d3_here = d2_here * d_here;
    
        let leftleftIdx = idx + vec2<i32>(-2, 0);
        let rightrightIdx = idx + vec2<i32>(2, 0);
        let downdownIdx = idx + vec2<i32>(0, -2);
        let upupIdx = idx + vec2<i32>(0, 2);

        let in_state_right = textureLoad(txState, rightIdx, 0).xyz;
        let in_state_left = textureLoad(txState, leftIdx, 0).xyz;
        let in_state_up = textureLoad(txState, upIdx, 0).xyz;
        let in_state_down = textureLoad(txState, downIdx, 0).xyz;
        let in_state_up_left = textureLoad(txState, upleftIdx, 0).xyz;
        let in_state_up_right = textureLoad(txState, uprightIdx, 0).xyz;
        let in_state_down_left = textureLoad(txState, downleftIdx, 0).xyz;
        let in_state_down_right = textureLoad(txState, downrightIdx, 0).xyz;

        let F_G_star_oldOldies = textureLoad(F_G_star_oldOldGradients, idx, 0).xyz;

    // Calculate d stencil
        let d_left = globals.seaLevel - B_west;
        let d_right = globals.seaLevel - B_east;
        let d_down = globals.seaLevel - B_south;
        let d_up = globals.seaLevel - B_north;

        let d_left_left = max(0.0, globals.seaLevel - textureLoad(txBottom, leftleftIdx, 0).z);
        let d_right_right = max(0.0, globals.seaLevel - textureLoad(txBottom, rightrightIdx, 0).z);
        let d_down_down = max(0.0, globals.seaLevel - textureLoad(txBottom, downdownIdx, 0).z);
        let d_up_up = max(0.0, globals.seaLevel - textureLoad(txBottom, upupIdx, 0).z);

    // Calculate eta stencil
        let eta_here = in_state_here.x - globals.seaLevel;
        let eta_left = in_state_left.x - globals.seaLevel;
        let eta_right = in_state_right.x - globals.seaLevel;
        let eta_down = in_state_down.x - globals.seaLevel;
        let eta_up = in_state_up.x - globals.seaLevel;
        let eta_left_left = textureLoad(txState, leftleftIdx, 0).x - globals.seaLevel;
        let eta_right_right = textureLoad(txState, rightrightIdx, 0).x - globals.seaLevel;
        let eta_down_down = textureLoad(txState, downdownIdx, 0).x - globals.seaLevel;
        let eta_up_up = textureLoad(txState, upupIdx, 0).x - globals.seaLevel;
        let eta_up_left = in_state_up_left.x - globals.seaLevel;
        let eta_up_right = in_state_up_right.x - globals.seaLevel;
        let eta_down_left = in_state_down_left.x - globals.seaLevel;
        let eta_down_right = in_state_down_right.x - globals.seaLevel;

    // replace with 4th order when dispersion is included
        let detadx = 1.0 / 12.0 * (eta_left_left - 8.0 * eta_left + 8.0 * eta_right + eta_right_right) * globals.one_over_dx;
        let detady = 1.0 / 12.0 * (eta_down_down - 8.0 * eta_down + 8.0 * eta_up + eta_up_up) * globals.one_over_dy;

        let v_up = in_state_up.z;
        let v_down = in_state_down.z;
        let v_right = in_state_right.z;
        let v_left = in_state_left.z;
        let v_up_right = in_state_up_right.z;
        let v_down_right = in_state_down_right.z;
        let v_up_left = in_state_up_left.z;
        let v_down_left = in_state_down_left.z;

        let u_up = in_state_up.y;
        let u_down = in_state_down.y;
        let u_right = in_state_right.y;
        let u_left = in_state_left.y;
        let u_up_right = in_state_up_right.y;
        let u_down_right = in_state_down_right.y;
        let u_up_left = in_state_up_left.y;
        let u_down_left = in_state_down_left.y;

        let dd_by_dx = (-d_right_right + 8.0 * d_right - 8.0 * d_left + d_left_left) * globals.one_over_dx / 12.0;
        let dd_by_dy = (-d_up_up + 8.0 * d_up - 8.0 * d_down + d_down_down) * globals.one_over_dy / 12.0;
        let eta_by_dx_dy = 0.25 * globals.one_over_dx * globals.one_over_dy * (eta_up_right - eta_down_right - eta_up_left + eta_down_left);
        let eta_by_dx_dx = globals.one_over_d2x * (eta_right - 2.0 * eta_here + eta_left);
        let eta_by_dy_dy = globals.one_over_d2y * (eta_up - 2.0 * eta_here + eta_down);
        

        F_star = (1.0 / 6.0) * d_here * 
            (dd_by_dx * (0.5 * globals.one_over_dy) * (v_up - v_down) + 
            dd_by_dy * (0.5 * globals.one_over_dx) * (v_right - v_left)) + 
            (globals.Bcoef + 1.0 / 3.0) * d2_here * (globals.one_over_dxdy * 0.25) * 
            (v_up_right- v_down_right - v_up_left + v_down_left);

        G_star = (1.0 / 6.0) * d_here * 
            (dd_by_dx * (0.5 * globals.one_over_dy) * (u_up - u_down) + 
            dd_by_dy * (0.5 * globals.one_over_dx) * (u_right - u_left)) + 
            (globals.Bcoef + 1.0 / 3.0) * d2_here * (globals.one_over_dxdy * 0.25) * 
            (u_up_right - u_down_right - u_up_left + u_down_left);

        
        Psi1x = globals.Bcoef_g * d3_here * ((eta_right_right - 2.0 * eta_right + 2.0 * eta_left - eta_left_left) * (0.5 * globals.one_over_d3x) + (eta_up_right - eta_up_left - 2.0 * eta_right + 2.0 * eta_left + eta_down_right - eta_down_left) * (0.5 * globals.one_over_dx * globals.one_over_d2y));
        Psi2x = globals.Bcoef_g * d2_here * (dd_by_dx * (2.0 * eta_by_dx_dx + eta_by_dy_dy) + dd_by_dy * eta_by_dx_dy) + (F_star - F_G_star_oldOldies.y) / globals.dt * 0.5;

        Psi1y = globals.Bcoef_g * d3_here * ((eta_up_up - 2.0 * eta_up + 2.0 * eta_down - eta_down_down) * (0.5 * globals.one_over_d3y) + (eta_up_right + eta_up_left - 2.0 * eta_up + 2.0 * eta_down - eta_down_right - eta_down_left) * (0.5 * globals.one_over_dx * globals.one_over_d2x));
        Psi2y = globals.Bcoef_g * d2_here * (dd_by_dy * (2.0 * eta_by_dy_dy + eta_by_dx_dx) + dd_by_dx * eta_by_dx_dy) + (G_star - F_G_star_oldOldies.z) / globals.dt * 0.5;
    }
   
    let friction_ = FrictionCalc(in_state_here.x, in_state_here.y, h_here);

    // Pressure stencil calculations
    let P_left = textureLoad(txShipPressure, leftIdx, 0).x;
    let P_right = textureLoad(txShipPressure, rightIdx, 0).x;
    let P_down = textureLoad(txShipPressure, downIdx, 0).x;
    let P_up = textureLoad(txShipPressure, upIdx, 0).x;

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

    let Dxx = 1.0;
    let Dxy = 1.0;
    let Dyy = 1.0;

    let hc_by_dx_dx = Dxx * globals.one_over_d2x * (C_state_right - 2.0 * in_state_here.a + C_state_left);
    let hc_by_dy_dy = Dyy * globals.one_over_d2y * (C_state_up - 2.0 * in_state_here.a + C_state_down);
    let hc_by_dx_dy = 0.25 * Dxy * globals.one_over_dxdy * (C_state_up_right - C_state_up_left - C_state_down_right + C_state_down_left);

    let c_dissipation = -globals.whiteWaterDecayRate * C_state_here;

    let source_term = vec4<f32>(0.0, -globals.g * h_here * detadx - in_state_here.y * friction_ + (Psi1x + Psi2x) + press_x, -globals.g * h_here * detady - in_state_here.z * friction_ + (Psi1y + Psi2y) + press_y, hc_by_dx_dx + hc_by_dy_dy + 2.0 * hc_by_dx_dy + c_dissipation);

    let d_by_dt = (xflux_west - xflux_here) * globals.one_over_dx + (yflux_south - yflux_here) * globals.one_over_dy + source_term;

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

    // add passive tracer sources
    if (max(abs(detadx),abs(detady)) * sign(detadx * newState.y + detady * newState.z) > globals.dissipation_threshold) {
        newState.a = 1.0;
    }

    let contaminent_source = textureLoad(txContSource, idx, 0).r; 
    newState.a = min(1.0, newState.a + contaminent_source); 

    // clear concentration if set
    if (globals.clearConc == 1){
        newState.a = 0.0; 
    }

    textureStore(txNewState, idx, newState);
    textureStore(dU_by_dt, idx, d_by_dt);
    textureStore(F_G_star, idx, F_G_here);
    textureStore(current_stateUVstar, idx, newState);
}