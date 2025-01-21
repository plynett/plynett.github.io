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

    let leftIdx = idx + vec2<i32>(-1, 0);
    let rightIdx = idx + vec2<i32>(1, 0);
    let downIdx = idx + vec2<i32>(0, -1);
    let upIdx = idx + vec2<i32>(0, 1);
    let upleftIdx = idx + vec2<i32>(-1, 1);
    let uprightIdx = idx + vec2<i32>(1, 1);
    let downleftIdx = idx + vec2<i32>(-1, -1);
    let downrightIdx = idx + vec2<i32>(1, -1);

    let B_here = textureLoad(txBottom, idx, 0).z;

    let in_state_here = textureLoad(txState, idx, 0);
    let in_state_here_UV = textureLoad(txstateUVstar, idx, 0);

    let B_south = textureLoad(txBottom, downIdx, 0).z;
    let B_north = textureLoad(txBottom, upIdx, 0).z;
    let B_west = textureLoad(txBottom, leftIdx, 0).z;
    let B_east = textureLoad(txBottom, rightIdx, 0).z;

    let eta_here = in_state_here.x;
    let eta_west = textureLoad(txState, leftIdx, 0).x;
    let eta_east = textureLoad(txState, rightIdx, 0).x;
    let eta_south = textureLoad(txState, downIdx, 0).x;
    let eta_north = textureLoad(txState, upIdx, 0).x;

    let h_here = in_state_here.x - B_here;
    let h_west = eta_west - B_west;
    let h_east = eta_east - B_east;
    let h_north = eta_north - B_north;
    let h_south = eta_south - B_south;

    let h_cut = globals.delta;
    if (h_here <= h_cut) {   //if dry and surrounded by dry, then stay dry - no need to calc
        if(h_north <= h_cut && h_east <= h_cut && h_south <= h_cut && h_west <= h_cut) {
            let zero = vec4<f32>(0.0, 0.0, 0.0, 0.0);
            textureStore(txNewState, idx, zero);
            textureStore(dU_by_dt, idx, zero);
            textureStore(F_G_star, idx, zero);
            textureStore(current_stateUVstar, idx, zero);
            return; 
        }
    }

    var h_min = vec4<f32>(0.0, 0.0, 0.0, 0.0);
    h_min.x= min(h_here, h_north);
    h_min.y= min(h_here, h_east);
    h_min.z= min(h_here, h_south);
    h_min.w= min(h_here, h_west);

    var detadx = 0.5*(eta_east - eta_west) * globals.one_over_dx;
    var detady = 0.5*(eta_north - eta_south) * globals.one_over_dy;

    // Load values from txXFlux and txYFlux using idx
    var xflux_here = textureLoad(txXFlux, idx, 0);
    var xflux_west = textureLoad(txXFlux, leftIdx, 0);
    var yflux_here = textureLoad(txYFlux, idx, 0);
    var yflux_south = textureLoad(txYFlux, downIdx, 0);
   
    let friction_here = max(globals.friction, textureLoad(txBottomFriction, idx, 0).x);
    var friction_ = FrictionCalc(in_state_here.y, in_state_here.z, h_here, friction_here);

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

    let Dxx = globals.whiteWaterDispersion;
    let Dxy = globals.whiteWaterDispersion;
    let Dyy = globals.whiteWaterDispersion;

    let hc_by_dx_dx = Dxx * globals.one_over_d2x * (C_state_right - 2.0 * in_state_here.a + C_state_left);
    let hc_by_dy_dy = Dyy * globals.one_over_d2y * (C_state_up - 2.0 * in_state_here.a + C_state_down);
    let hc_by_dx_dy = 0.25 * Dxy * globals.one_over_dxdy * (C_state_up_right - C_state_up_left - C_state_down_right + C_state_down_left);

    let c_dissipation = -globals.whiteWaterDecayRate * C_state_here;

    // calculate breaking dissipation - breaking dissipation not added for NLSW model
    var breaking_B = 0.0;
    if(globals.useBreakingModel == 1) {
        breaking_B = textureLoad(txBreaking, idx, 0).z;  // breaking front parameter, non-breaking [0 - 1] breaking
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

    let source_term = vec4<f32>(overflow_dry, -globals.g * h_here * detadx - in_state_here.y * friction_ + press_x, -globals.g * h_here * detady - in_state_here.z * friction_ + press_y, hc_by_dx_dx + hc_by_dy_dy + 2.0 * hc_by_dx_dy + c_dissipation);

    let d_by_dt = (xflux_west - xflux_here) * globals.one_over_dx + (yflux_south - yflux_here) * globals.one_over_dy + source_term;

    // previous derivatives
    let oldies = textureLoad(oldGradients, idx, 0);
    let oldOldies = textureLoad(oldOldGradients, idx, 0);

    var newState = vec4<f32>(0.0, 0.0, 0.0, 0.0);
    if (globals.timeScheme == 0) {
        newState = in_state_here_UV + globals.dt * d_by_dt;

    } else if (globals.pred_or_corrector == 1) {
        newState = in_state_here_UV + globals.dt / 12.0 * (23.0 * d_by_dt - 16.0 * oldies + 5.0 * oldOldies);

    } else if (globals.pred_or_corrector == 2) {
        let predicted = textureLoad(predictedGradients, idx, 0);
        newState = in_state_here_UV + globals.dt / 24.0 * (9.0 * d_by_dt + 19.0 * predicted - 5.0 * oldies + oldOldies);
    }
    
    // add breaking source
    newState.a = max(newState.a, breaking_B);  // use the B alue from Kennedy et al as a foam intensity

    if(globals.showBreaking ==1) {
        // add breaking source
        newState.a = max(newState.a, breaking_B);  // use the B value from Kennedy et al as a foam intensity
    }
    else if(globals.showBreaking == 2) {
        let contaminent_source = textureLoad(txContSource, idx, 0).r; 
        newState.a = min(1.0, newState.a + contaminent_source); 
    }

    let F_G_vec = vec4<f32>(0.0, 0.0, 0.0, 1.0);

    textureStore(txNewState, idx, newState);
    textureStore(dU_by_dt, idx, d_by_dt);
    textureStore(F_G_star, idx, F_G_vec);
    textureStore(current_stateUVstar, idx, newState);
}