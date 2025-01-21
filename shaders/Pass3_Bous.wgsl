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

    // Calculate local h,w
    let h_here = in_state_here.x - B_here;

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
        let d_left = -B_west;
        let d_right = -B_east;
        let d_down = -B_south;
        let d_up = -B_north;

        let d_left_left = max(0.0, -textureLoad(txBottom, leftleftIdx, 0).z);
        let d_right_right = max(0.0, -textureLoad(txBottom, rightrightIdx, 0).z);
        let d_down_down = max(0.0, -textureLoad(txBottom, downdownIdx, 0).z);
        let d_up_up = max(0.0, -textureLoad(txBottom, upupIdx, 0).z);

    // Calculate eta stencil
        let eta_here = in_state_here.x;
        let eta_left = in_state_left.x;
        let eta_right = in_state_right.x;
        let eta_down = in_state_down.x;
        let eta_up = in_state_up.x;
        let eta_left_left = textureLoad(txState, leftleftIdx, 0).x;
        let eta_right_right = textureLoad(txState, rightrightIdx, 0).x;
        let eta_down_down = textureLoad(txState, downdownIdx, 0).x;
        let eta_up_up = textureLoad(txState, upupIdx, 0).x;
        let eta_up_left = in_state_up_left.x;
        let eta_up_right = in_state_up_right.x;
        let eta_down_left = in_state_down_left.x;
        let eta_down_right = in_state_down_right.x;

    // replace with 4th order when dispersion is included
        detadx = 1.0 / 12.0 * (eta_left_left - 8.0 * eta_left + 8.0 * eta_right - eta_right_right) * globals.one_over_dx;
        detady = 1.0 / 12.0 * (eta_down_down - 8.0 * eta_down + 8.0 * eta_up - eta_up_up) * globals.one_over_dy;

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

    let source_term = vec4<f32>(overflow_dry, -globals.g * h_here * detadx - in_state_here.y * friction_ + breaking_x + (Psi1x + Psi2x) + press_x, -globals.g * h_here * detady - in_state_here.z * friction_ + breaking_y + (Psi1y + Psi2y) + press_y, hc_by_dx_dx + hc_by_dy_dy + 2.0 * hc_by_dx_dy + c_dissipation);

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
