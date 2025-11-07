struct Globals {
    width: u32,
    height: u32,
    g: f32,
    half_g: f32,
    dx: f32,
    dy: f32,
    delta: f32,
    useSedTransModel: i32,
    sedTurbDispersion: f32,
    sedBreakingDispersionCoef: f32,
};

@group(0) @binding(0) var<uniform> globals: Globals;

@group(0) @binding(1) var txH: texture_2d<f32>;
@group(0) @binding(2) var txU: texture_2d<f32>;
@group(0) @binding(3) var txV: texture_2d<f32>;
@group(0) @binding(4) var txBottom: texture_2d<f32>;
@group(0) @binding(5) var txC: texture_2d<f32>;
@group(0) @binding(6) var txHnear: texture_2d<f32>;

@group(0) @binding(7) var txXFlux: texture_storage_2d<rgba32float, write>;
@group(0) @binding(8) var txYFlux: texture_storage_2d<rgba32float, write>;

@group(0) @binding(9) var txSed_C1: texture_2d<f32>;
@group(0) @binding(10) var txSed_C2: texture_2d<f32>;
@group(0) @binding(11) var txSed_C3: texture_2d<f32>;
@group(0) @binding(12) var txSed_C4: texture_2d<f32>;

@group(0) @binding(13) var txXFlux_Sed: texture_storage_2d<rgba32float, write>;
@group(0) @binding(14) var txYFlux_Sed: texture_storage_2d<rgba32float, write>;

@group(0) @binding(15) var txBreaking: texture_2d<f32>;


fn NumericalFlux(aplus: f32, aminus: f32, Fplus: f32, Fminus: f32, Udifference: f32) -> f32 {
    if (aplus - aminus != 0.0) {
        return (aplus * Fminus - aminus * Fplus + aplus * aminus * Udifference) / (aplus - aminus);
    } else {
        return 0.0;
    }
}

fn HLL_Flux(
    aplus:    f32,
    aminus:   f32,
    Fplus:    vec4<f32>,
    Fminus:   vec4<f32>,
    Uplus:    vec4<f32>,
    Uminus:   vec4<f32>,
    DU_flag:  i32
) -> vec4<f32> {
    let denom = aplus - aminus;
    if (denom == 0.0) {
        return vec4<f32>(0.0);
    }
    var DU = Uplus - Uminus;
    if (DU_flag == 1) {
        DU.x = 0.0;
    }
    return (aplus * Fminus
          - aminus * Fplus
          + aplus * aminus * DU)
         / denom;
}

// ------------------------------------------------------------
// HLLC FLUX – 1:1 with HLLEM structure, GPU-safe
// ------------------------------------------------------------
fn HLLC_Flux(
    aplus:    f32,
    aminus:   f32,
    Fplus:    vec4<f32>,
    Fminus:   vec4<f32>,
    Uplus:    vec4<f32>,
    Uminus:   vec4<f32>,
    DU_flag:  i32
) -> vec4<f32> {
    // 1) Base HLL flux
    let Fhll = HLL_Flux(aplus, aminus, Fplus, Fminus, Uplus, Uminus, DU_flag);

    // 2) Roe-average velocity (exact same as HLLEM)
    var uL: f32 = 0.0;
    if (Uminus.x > 0.0) { uL = Fminus.x / Uminus.x; }
    var uR: f32 = 0.0;
    if (Uplus.x > 0.0) { uR = Fplus.x / Uplus.x; }
    let sqrt_hL = sqrt(max(Uminus.x, 0.0));
    let sqrt_hR = sqrt(max(Uplus.x,  0.0));
    let denomR = sqrt_hL + sqrt_hR;
    var uRoe: f32 = 0.0;
    if (denomR > 0.0) {
        uRoe = (sqrt_hL * uL + sqrt_hR * uR) / denomR;
    }
    let S_star = uRoe;

    // 3) HLLC star state (branch-free, Toro formula)
    let eps = 1e-8;
    let hL = max(Uminus.x, eps);
    let hR = max(Uplus.x,  eps);

    let denom_L = S_star - aminus;
    let denom_R = S_star - aplus;

    // Safe division: clamp denominator away from zero
    let safe_L = max(abs(denom_L), eps) * sign(denom_L);
    let safe_R = max(abs(denom_R), eps) * sign(denom_R);

    let h_star_L = hL * (aminus - uL) / safe_L;
    let h_star_R = hR * (aplus - uR) / safe_R;

    // Smooth blend: use sign of (S_star) to pick dominant side
    let blend = 0.5 + 0.5 * sign(S_star);  // 1.0 if S_star >= 0, 0.0 else
    let h_star = blend * max(h_star_L, 0.0) + (1.0 - blend) * max(h_star_R, 0.0);

    var v_star: f32 = 0.0;
    if (hL > eps) { v_star = Fminus.z / hL; }
    if (hR > eps && blend < 0.5) { v_star = Fplus.z / hR; }

    var c_star: f32 = 0.0;
    if (hL > eps) { c_star = Uminus.w / hL; }
    if (hR > eps && blend < 0.5) { c_star = Uplus.w / hR; }

    let U_star = vec4<f32>(
        h_star,
        h_star * S_star,
        h_star * v_star,
        h_star * c_star
    );

    // 4) Star flux: F* = F + S*(U* - U)
    let S = blend * aminus + (1.0 - blend) * aplus;
    let U_base = blend * Uminus + (1.0 - blend) * Uplus;
    let F_base = blend * Fminus + (1.0 - blend) * Fplus;
    let F_star = F_base + S * (U_star - U_base);

    // 5) Mass fix + HLLEM-style anti-diffusion
    var F_final = F_star;
    if (DU_flag == 1) { F_final.x = Fhll.x; }

    let wavespeed_max = max(abs(aminus), abs(aplus));
    let psi = max(0.0, 1.0 - wavespeed_max / (abs(uRoe) + 1e-6));
    return Fhll + psi * (F_final - Fhll);
}

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
    let idx = vec2<i32>(i32(id.x), i32(id.y));
    
    // Handle boundary conditions
    let rightIdx = min(idx + vec2<i32>(1, 0), vec2<i32>(i32(globals.width)-1, i32(globals.height)-1));
    let upIdx = min(idx + vec2<i32>(0, 1), vec2<i32>(i32(globals.width)-1, i32(globals.height)-1));
    let leftIdx = max(idx + vec2<i32>(-1, 0), vec2<i32>(0, 0));
    let downIdx = max(idx + vec2<i32>(0, -1), vec2<i32>(0, 0));
    
    // Fetch the necessary data from the input textures
    let h_vec = textureLoad(txHnear, idx, 0);
    var h_here = textureLoad(txH, idx, 0).xy;   // flow depth at top (x) and right (y) side of current cell
    
    var hW_east = textureLoad(txH, rightIdx, 0).w;  // flow depth at left side of east cell
    var hS_north = textureLoad(txH, upIdx, 0).z;  // flow depth at bottom side of north cell

    var u_here = textureLoad(txU, idx, 0).xy;  // x-direction flow velocity at top (x) and right (y) side of current cell
    var uW_east = textureLoad(txU, rightIdx, 0).w;  // x-direction flow velocity at left side of east cell
    var uS_north = textureLoad(txU, upIdx, 0).z;  // x-direction flow velocity at bottom side of north cell

    var v_here = textureLoad(txV, idx, 0).xy;  // y-direction flow velocity at top (x) and right (y) side of current cell
    var vW_east = textureLoad(txV, rightIdx, 0).w; // y-direction flow velocity at left side of east cell
    var vS_north = textureLoad(txV, upIdx, 0).z; // y-direction flow velocity at bottom side of north cell

    let cNE = sqrt((globals.g * h_here));  // long wave speed at top (x) and right (y) side of current cell
    let cW = sqrt((globals.g * hW_east));  // long wave speed at left side of east cell
    let cS = sqrt((globals.g * hS_north));  // long wave speed at bottom side of north cell

    let aplus = max(max(u_here.y + cNE.y, uW_east + cW), 0.0);   // max speed in x-direction
    let aminus = min(min(u_here.y - cNE.y, uW_east - cW), 0.0);     // min speed in x-direction
    let bplus = max(max(v_here.x + cNE.x, vS_north + cS), 0.0);  // max speed in y-direction 
    let bminus = min(min(v_here.x - cNE.x, vS_north - cS), 0.0);    // min speed in y-direction

    let c_here = textureLoad(txC, idx, 0).xy;  // concentration at top (x) and right (y) side of current cell
    let cW_east = textureLoad(txC, rightIdx, 0).w;  // concentration at left side of east cell
    let cS_north = textureLoad(txC, upIdx, 0).z;  // concentration at bottom side of north cell

    let minH = min(h_vec.w, min(h_vec.z, min(h_vec.y, h_vec.x)));  // minimum water height in the cell and its neighbors

    var DU_flag = 0;
    if (minH <= globals.delta) {  // special treament for near dry cells
        DU_flag = 1;
    }

    let state_plus_x = vec4<f32>(hW_east, hW_east * uW_east, hW_east * vW_east, hW_east * cW_east); // state at the cell face
    let state_minus_x = vec4<f32>(h_here.y, h_here.y * u_here.y, h_here.y * v_here.y, h_here.y * c_here.y); // state at the cell face

    let Fp_x = state_plus_x * uW_east; // F⁺ = [h⁺u⁺, h⁺u⁺², h⁺u⁺v⁺, h⁺u⁺c⁺]
    let Fm_x = state_minus_x * u_here.y; // F⁻ = [h⁻u⁻, h⁻u⁻², h⁻u⁻v⁻, h⁻u⁻c⁻]
    let DU_x = state_plus_x - state_minus_x; // ΔU = [h⁺–h⁻, (h⁺u⁺–h⁻u⁻), (h⁺v⁺–h⁻v⁻), (h⁺c⁺–h⁻c⁻)]

    let state_plus_y = vec4<f32>(hS_north, hS_north * uS_north, hS_north * vS_north, hS_north * cS_north); // state at the cell face
    let state_minus_y = vec4<f32>(h_here.x, h_here.x * u_here.x, h_here.x * v_here.x, h_here.x * c_here.x); // state at the cell face

    let Fp_y = state_plus_y * vS_north; // F⁺ = [h⁺u⁺, h⁺u⁺², h⁺u⁺v⁺, h⁺u⁺c⁺]
    let Fm_y = state_minus_y * v_here.x; // F⁻ = [h⁻u⁻, h⁻u⁻², h⁻u⁻v⁻, h⁻u⁻c⁻]
    let DU_y = state_plus_y - state_minus_y; // ΔU = [h⁺–h⁻, (h⁺u⁺–h⁻u⁻), (h⁺v⁺–h⁻v⁻), (h⁺c⁺–h⁻c⁻)]

    // call the vectorized HLL flux
    var xflux = vec4<f32>(0.0);
    var yflux = vec4<f32>(0.0);
//    if (minH <= globals.delta) { 
//        xflux = HLL_Flux(aplus, aminus, Fp_x, Fm_x, state_plus_x, state_minus_x, DU_flag);
//        yflux = HLL_Flux(bplus, bminus, Fp_y, Fm_y, state_plus_y, state_minus_y, DU_flag);
//    }
//    else {
    xflux = HLLC_Flux(aplus, aminus, Fp_x, Fm_x, state_plus_x, state_minus_x, DU_flag);
    yflux = HLLC_Flux(bplus, bminus, Fp_y, Fm_y, state_plus_y, state_minus_y, DU_flag);
//    }

    textureStore(txXFlux, idx, xflux);
    textureStore(txYFlux, idx, yflux);

    let phix = 1.0;
    let phiy = 1.0;
    if(globals.useSedTransModel == 1){
        // Sediment transport code
        let k_here =  globals.sedTurbDispersion + globals.sedBreakingDispersionCoef * textureLoad(txBreaking, idx, 0).y;
        let k_right =  globals.sedTurbDispersion + globals.sedBreakingDispersionCoef * textureLoad(txBreaking, rightIdx, 0).y;
        let k_up = globals.sedTurbDispersion + globals.sedBreakingDispersionCoef * textureLoad(txBreaking, upIdx, 0).y;
        let k_left =  globals.sedTurbDispersion + globals.sedBreakingDispersionCoef * textureLoad(txBreaking, leftIdx, 0).y;
        let k_down = globals.sedTurbDispersion + globals.sedBreakingDispersionCoef * textureLoad(txBreaking, downIdx, 0).y;

        let k_east = 0.5 * (k_here + k_right);
        let k_north = 0.5 * (k_here + k_up);
        let k_west = 0.5 * (k_here + k_left);
        let k_south = 0.5 * (k_here + k_down);

        let c1_here = textureLoad(txSed_C1, idx, 0).xy;
        let c1W_east = textureLoad(txSed_C1, rightIdx, 0).w;
        let c1S_north = textureLoad(txSed_C1, upIdx, 0).z;

        let c2_here = textureLoad(txSed_C2, idx, 0).xy;
        let c2W_east = textureLoad(txSed_C2, rightIdx, 0).w;
        let c2S_north = textureLoad(txSed_C2, upIdx, 0).z;

        let c3_here = textureLoad(txSed_C3, idx, 0).xy;
        let c3W_east = textureLoad(txSed_C3, rightIdx, 0).w;
        let c3S_north = textureLoad(txSed_C3, upIdx, 0).z;

        let c4_here = textureLoad(txSed_C4, idx, 0).xy;
        let c4W_east = textureLoad(txSed_C4, rightIdx, 0).w;
        let c4S_north = textureLoad(txSed_C4, upIdx, 0).z;

        // this only works for one class right now
        var c4 = textureLoad(txSed_C1, idx, 0);
        let C_here = (c4.x + c4.y + c4.z + c4.w) / 4.0;
        c4 = textureLoad(txSed_C1, rightIdx, 0);
        let C_right = (c4.x + c4.y + c4.z + c4.w) / 4.0;
        c4 = textureLoad(txSed_C1, leftIdx, 0);
        let C_left = (c4.x + c4.y + c4.z + c4.w) / 4.0;
        c4 = textureLoad(txSed_C1, upIdx, 0);
        let C_up = (c4.x + c4.y + c4.z + c4.w) / 4.0;
        c4 = textureLoad(txSed_C1, downIdx, 0);
        let C_down = (c4.x + c4.y + c4.z + c4.w) / 4.0;

        let C1x_east = (C_right - C_here) / globals.dx;
        let C1x_west = (C_here - C_left) / globals.dx;
        let C1y_north =(C_up - C_here) / globals.dy;
        let C1y_south =(C_here - C_down) / globals.dy;

        // diffusion terms have NOT been incorporating into the HLLEM fluxes
        // as currently configured, that would require a divide by zero

        let Cstate_plus_x = vec4<f32>(hW_east * c1W_east, hW_east * c2W_east, hW_east * c3W_east, hW_east * c4W_east); // state at the cell face
        let Cstate_minus_x = vec4<f32>(h_here.y * c1_here.y, h_here.y * c2_here.y, h_here.y * c3_here.y, h_here.y * c4_here.y); // state at the cell face
        let FpC_x = Cstate_plus_x * uW_east; // F⁺ = [h⁺u⁺, h⁺u⁺², h⁺u⁺v⁺, h⁺u⁺c⁺]
        let FmC_x = Cstate_minus_x * u_here.y; // F⁻ = [h⁻u⁻, h⁻u⁻², h⁻u⁻v⁻, h⁻u⁻c⁻]
        let DUC_x = Cstate_plus_x - Cstate_minus_x; // ΔU = [h⁺–h⁻, (h⁺u⁺–h⁻u⁻), (h⁺v⁺–h⁻v⁻), (h⁺c⁺–h⁻c⁻)]


        let Cstate_plus_y = vec4<f32>(hS_north * c1S_north, hS_north * c2S_north, hS_north * c3S_north, hS_north * c4S_north); // state at the cell face
        let Cstate_minus_y = vec4<f32>(h_here.x * c1_here.x, h_here.x * c2_here.x, h_here.x * c3_here.x, h_here.x * c4_here.x); // state at the cell face

        let FpC_y = Cstate_plus_y * vS_north; // F⁺ = [h⁺u⁺, h⁺u⁺², h⁺u⁺v⁺, h⁺u⁺c⁺]
        let FmC_y = Cstate_minus_y * v_here.x; // F⁻ = [h⁻u⁻, h⁻u⁻², h⁻u⁻v⁻, h⁻u⁻c⁻]
        let DUC_y = Cstate_plus_y - Cstate_minus_y; // ΔU = [h⁺–h⁻, (h⁺u⁺–h⁻u⁻), (h⁺v⁺–h⁻v⁻), (h⁺c⁺–h⁻c⁻)]

        let xflux_Sed = HLLC_Flux(aplus, aminus, FpC_x, FmC_x, Cstate_plus_x, Cstate_minus_x, DU_flag);
        let yflux_Sed = HLLC_Flux(bplus, bminus, FpC_y, FmC_y, Cstate_plus_y, Cstate_minus_y, DU_flag);

        textureStore(txXFlux_Sed, idx, xflux_Sed);
        textureStore(txYFlux_Sed, idx, yflux_Sed);
    }
}
