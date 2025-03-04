struct Globals {
    width: i32,
    height: i32,
    dt: f32,
    dx: f32,
    dy: f32,
    one_over_dx: f32,
    one_over_dy: f32,
    epsilon: f32,
    g: f32,
    total_time: f32,
    delta_breaking: f32,
    T_star_coef: f32,
    dzdt_I_coef: f32,
    dzdt_F_coef: f32,
};

@group(0) @binding(0) var<uniform> globals: Globals;

@group(0) @binding(1) var txState: texture_2d<f32>;
@group(0) @binding(2) var txBottom: texture_2d<f32>;
@group(0) @binding(3) var dU_by_dt: texture_2d<f32>;
@group(0) @binding(4) var txXFlux: texture_2d<f32>;
@group(0) @binding(5) var txYFlux: texture_2d<f32>;
@group(0) @binding(6) var txBreaking: texture_2d<f32>;

@group(0) @binding(7) var txDissipationFlux: texture_storage_2d<rgba32float, write>;
@group(0) @binding(8) var txtemp_Breaking: texture_storage_2d<rgba32float, write>;

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
    let idx = vec2<i32>(i32(id.x), i32(id.y));

    let leftIdx = idx + vec2<i32>(-1, 0);
    let rightIdx = idx + vec2<i32>(1, 0);
    let downIdx = idx + vec2<i32>(0, -1);
    let upIdx = idx + vec2<i32>(0, 1);
    let upleftIdx = idx + vec2<i32>(-1, 1);
    let uprightIdx = idx + vec2<i32>(1, 1);
    let downleftIdx = idx + vec2<i32>(-1, -1);
    let downrightIdx = idx + vec2<i32>(1, -1);

    let xflux_here = textureLoad(txXFlux, idx, 0).x;
    let xflux_west = textureLoad(txXFlux, leftIdx, 0).x;
    let yflux_here = textureLoad(txYFlux, idx, 0).x;
    let yflux_south = textureLoad(txYFlux, downIdx, 0).x;

    let P_south = textureLoad(txState, downIdx, 0).y;
    let P_here = textureLoad(txState, idx, 0).y;
    let P_north = textureLoad(txState, upIdx, 0).y;
    let Q_west = textureLoad(txState, leftIdx, 0).z;
    let Q_here = textureLoad(txState, idx, 0).z;
    let Q_east = textureLoad(txState, rightIdx, 0).z;

    let detadt = textureLoad(dU_by_dt, idx, 0).x;

    // figuring out how to transport "t" is tricky.  Here we look to the dominant direction of flow, and look at the three cells on that 3*3 cube
    var t_here = textureLoad(txBreaking, idx, 0).x;
    var t1 = 0.0;
    var t2 = 0.0;
    var t3 = 0.0;
    if (abs(P_here) > abs(Q_here) ) {
        if (P_here > 0.0) {
            t1 = textureLoad(txBreaking, leftIdx, 0).x;
            t2 = textureLoad(txBreaking, upleftIdx, 0).x;
            t3 = textureLoad(txBreaking, downleftIdx, 0).x;
        } else {
            t1 = textureLoad(txBreaking, rightIdx, 0).x;
            t2 = textureLoad(txBreaking, uprightIdx, 0).x;
            t3 = textureLoad(txBreaking, downrightIdx, 0).x;
        }
    } else {
        if (Q_here > 0.0) {
            t1 = textureLoad(txBreaking, downIdx, 0).x;
            t2 = textureLoad(txBreaking, downrightIdx, 0).x;
            t3 = textureLoad(txBreaking, downleftIdx, 0).x;
        } else {
            t1 = textureLoad(txBreaking, upIdx, 0).x;
            t2 = textureLoad(txBreaking, uprightIdx, 0).x;
            t3 = textureLoad(txBreaking, upleftIdx, 0).x;
        }
    } 
    t_here = max(t_here, max(t1, max(t2, t3)));

    let dPdx = (xflux_here - xflux_west) * globals.one_over_dx;
    let dPdy = 0.5 * (P_north - P_south) * globals.one_over_dy;

    let dQdx = 0.5 * (Q_east - Q_west) * globals.one_over_dx;
    let dQdy = (yflux_here - yflux_south) * globals.one_over_dy;

    let B_here = textureLoad(txBottom, idx, 0).z;
    let eta_here = textureLoad(txState, idx, 0).x;
    let h_here = eta_here - B_here;
    let c_here = sqrt(globals.g * h_here);
    let h2 = h_here * h_here;
    let divide_by_h = 2.0 * h_here / (h2 + max(h2, globals.epsilon)); 

    // Kennedy et al breaking model, default parameters

	let T_star=globals.T_star_coef*sqrt(h_here/globals.g);   
	let dzdt_I=globals.dzdt_I_coef*c_here;
	let dzdt_F=globals.dzdt_F_coef*c_here;

    var dzdt_star = 0.0;

    if(t_here <= globals.dt){
        dzdt_star = dzdt_I;
    } else if (globals.total_time - t_here <= T_star) {
        dzdt_star = dzdt_I + (globals.total_time - t_here) / T_star * (dzdt_F - dzdt_I);
    } else {
        dzdt_star = dzdt_F;
    }

    var B_Breaking = 0.;
    if(detadt < dzdt_star) {
        t_here = 0.0;
    } else if (detadt > 2.0 * dzdt_star) {
        B_Breaking = 1.0;
         if(t_here <= globals.dt) {t_here = globals.total_time;}
    } else {
        B_Breaking = detadt / dzdt_star - 1.0;
         if(t_here <= globals.dt) {t_here = globals.total_time;}
    }

    let nu_breaking = min(1.0 * globals.dx * globals.dy / globals.dt, B_Breaking * globals.delta_breaking * h_here * detadt);

    // Smagorinsky subgrid eddy viscosity
    let Smag_cm = 0.04;
    let nu_Smag = Smag_cm * globals.dx * globals.dy * sqrt(2. * dPdx * dPdx + 2. * dQdy * dQdy + (dPdy + dQdx) * (dPdy + dQdx)) * divide_by_h;  // temporary, needs to be corrected to strain rate, right now has extra dHdx terms

    // sum eddy viscosities and calc fluxes
    let nu_total = nu_breaking + nu_Smag;

    let nu_dPdx = nu_total * dPdx;
    let nu_dPdy = nu_total * dPdy;

    let nu_dQdx = nu_total * dQdx;
    let nu_dQdy = nu_total * dQdy;

    let nu_flux = vec4<f32>(nu_dPdx, nu_dPdy, nu_dQdx, nu_dQdy);
    let Bvalues = vec4<f32>(t_here, nu_breaking, B_Breaking, nu_Smag);

    textureStore(txDissipationFlux, idx, nu_flux);
    textureStore(txtemp_Breaking, idx, Bvalues);
}