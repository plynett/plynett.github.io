// Define structures and bindings

struct Globals {
    width: u32,
    height: u32,
    one_over_dx: f32,
    one_over_dy: f32,
    dissipation_threshold: f32,
    TWO_THETA: f32,
    epsilon: f32,
    whiteWaterDecayRate: f32,
    dt: f32,
    base_depth: f32,
    dx_global: f32,
    dy_global: f32,
    delta: f32,
};

@group(0) @binding(0) var<uniform> globals: Globals;

@group(0) @binding(1) var txState: texture_2d<f32>;
@group(0) @binding(2) var txBottom: texture_2d<f32>;
@group(0) @binding(3) var txH: texture_storage_2d<rgba32float, write>;
@group(0) @binding(4) var txU: texture_storage_2d<rgba32float, write>;
@group(0) @binding(5) var txV: texture_storage_2d<rgba32float, write>;
@group(0) @binding(6) var txC: texture_storage_2d<rgba32float, write>;


fn MinMod(a: f32, b: f32, c: f32) -> f32 {
    if (a > 0.0 && b > 0.0 && c > 0.0) {
        return min(min(a, b), c);
    } else if (a < 0.0 && b < 0.0 && c < 0.0) {
        return max(max(a, b), c);
    } else {
        return 0.0;
    }
}

// Two-argument SuperBee limiter
fn SuperBee(a: f32, b: f32) -> f32 {
    // a = backward slope, b = forward slope (or vice-versa)
    if (a * b <= 0.0) {
        return 0.0;
    }
    let r = a / b;
    // φ(r) = max(0, min(2r,1), min(r,2))
    let phi = max(
        0.0,
        max(
            min(2.0 * r, 1.0),
            min(r, 2.0)
        )
    );
    return phi * b;
}


fn Reconstruct(west: f32, here: f32, east: f32, TWO_THETAc: f32) -> vec2<f32> {
    let z1 = TWO_THETAc * (here - west);
    let z2 = (east - west);
    let z3 = TWO_THETAc * (east - here);

    let dx_grad_over_two = 0.25 * MinMod(z1, z2, z3);

    let out_east = here + dx_grad_over_two;
    let out_west = here - dx_grad_over_two;

    return vec2(out_west, out_east);
}


// 5th-order PPM+MinMod Reconstruct
fn Reconstruct5(
    w2: f32,
    w1: f32,
    w0: f32,
    e1: f32,
    e2: f32,
    TWO_THETAc: f32
) -> vec2<f32> {
    // 1) form the same three candidate slopes
    //   z1: 2nd‐order backward-difference at i
    //let z1 = TWO_THETAc * ((3.0 * w0 - 4.0 * w1 + w2) * 0.5);
    let z1 = TWO_THETAc * (w0 - w1);
    //   z2: 4th‐order central-difference at i
    let z2 = (-e2 + 8.0 * e1 - 8.0 * w1 + w2) / 6.0;
    //   z3: 2nd‐order forward-difference at i
    //let z3 = TWO_THETAc * ((-e2 + 4.0 * e1 - 3.0 * w0) * 0.5);
    let z3 = TWO_THETAc * (e1 - w0);

    // 2) limiter + half-cell increment (exactly as you did)
    //let dx_grad_over_two = 0.25 * MinMod(z1, z2, z3);

    let s1 = SuperBee(z1, z2);
    let s2 = SuperBee(z2, z3);

    let dx_grad_over_two = 0.25 * MinMod(s1, s2, z2);

    // 3) second-derivative term (parabola)
    let d2 = w1 - 2.0 * w0 + e1;

    // 4) fourth-derivative term (quartic correction)
    //    approximates p'''' inside the cell so you get 5th-order at the faces
    let d4 = w2 
           - 4.0 * w1 
           + 6.0 * w0 
           - 4.0 * e1 
           + 1.0 * e2;

    // 5) assemble 5th-order face values
    //    note the ±d4/120 term on top of the usual parabola ±d2/6
    let out_west = w0 
                 - dx_grad_over_two 
                 + (d2 / 6.0) 
                 - (d4 / 120.0);

    let out_east = w0 
                 + dx_grad_over_two 
                 - (d2 / 6.0) 
                 + (d4 / 120.0);

    return vec2<f32>(out_west, out_east);
}


// 4th-order CWENO reconstruction
// same signature as Reconstruct5
fn ReconstructCWENO4(
    w2:        f32,  // q_{i-2}
    w1:        f32,  // q_{i-1}
    w0:        f32,  // q_i
    e1:        f32,  // q_{i+1}
    e2:        f32,  // q_{i+2}
    TWO_THETAc:f32   // unused in CWENO4, present for compatibility
) -> vec2<f32> {
    // small and linear weights for 4th-order
    let d0 = 1.0/6.0;
    let d1 = 4.0/6.0;
    let d2 = 1.0/6.0;
    let eps = 1e-6;

    // 1) smoothness indicators βₖ
    let b0 = (13.0/12.0)*((w2 - 2.0*w1 + w0)*(w2 - 2.0*w1 + w0))
           +  0.25   *((w2 - 4.0*w1 + 3.0*w0)*(w2 - 4.0*w1 + 3.0*w0));
    let b1 = (13.0/12.0)*((w1 - 2.0*w0 + e1)*(w1 - 2.0*w0 + e1))
           +  0.25   *((w1 - e1)*(w1 - e1));
    let b2 = (13.0/12.0)*((w0 - 2.0*e1 + e2)*(w0 - 2.0*e1 + e2))
           +  0.25   *((3.0*w0 - 4.0*e1 + e2)*(3.0*w0 - 4.0*e1 + e2));

    // 2) nonlinear weights αₖ ∝ dₖ/(ε+βₖ)²
    let a0 = d0 / ((eps + b0)*(eps + b0));
    let a1 = d1 / ((eps + b1)*(eps + b1));
    let a2 = d2 / ((eps + b2)*(eps + b2));
    let asum = a0 + a1 + a2;
    let w0n = a0 / asum;
    let w1n = a1 / asum;
    let w2n = a2 / asum;

    // 3) candidate interp at x_{i-1/2} (z=-0.5)
    let p0_w = -0.125 * w2  + 0.75  * w1   + 0.375 * w0;
    let p1_w =  0.375 * w1  + 0.75  * w0   - 0.125 * e1;
    let p2_w =  1.875 * w0  - 1.25  * e1   + 0.375 * e2;

    // 4) candidate interp at x_{i+1/2} (z=+0.5)
    let p0_e =  0.375 * w2  - 1.25  * w1   + 1.875 * w0;
    let p1_e = -0.125 * w1  + 0.75  * w0   + 0.375 * e1;
    let p2_e =  0.375 * w0  + 0.75  * e1   - 0.125 * e2;

    // 5) final CWENO4 values
    let out_west = w0n * p0_w + w1n * p1_w + w2n * p2_w;
    let out_east = w0n * p0_e + w1n * p1_e + w2n * p2_e;

    return vec2<f32>(out_west, out_east);
}


@compute @workgroup_size(16, 16) //
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
    // Convert the 3D thread ID to a 2D grid coordinate
    let idx = vec2<i32>(i32(id.x), i32(id.y));

    // Compute the coordinates of the neighbors for each pixel, and enforce boundary conditions
    let rightIdx = min(idx + vec2<i32>(1, 0), vec2<i32>(i32(globals.width)-1, i32(globals.height)-1));
    let upIdx = min(idx + vec2<i32>(0, 1), vec2<i32>(i32(globals.width)-1, i32(globals.height)-1));
    let leftIdx = max(idx + vec2<i32>(-1, 0), vec2<i32>(0, 0));
    let downIdx = max(idx + vec2<i32>(0, -1), vec2<i32>(0, 0));
    let right2Idx = min(idx + vec2<i32>(2, 0), vec2<i32>(i32(globals.width)-1, i32(globals.height)-1));
    let up2Idx = min(idx + vec2<i32>(0, 2), vec2<i32>(i32(globals.width)-1, i32(globals.height)-1));
    let left2Idx = max(idx + vec2<i32>(-2, 0), vec2<i32>(0, 0));
    let down2Idx = max(idx + vec2<i32>(0, -2), vec2<i32>(0, 0));

    // Read in the state of the water at this pixel and its neighbors
    let in_here = textureLoad(txState, idx, 0);
    let in_south = textureLoad(txState, downIdx, 0);
    let in_north = textureLoad(txState, upIdx, 0);
    let in_west = textureLoad(txState, leftIdx, 0);
    let in_east = textureLoad(txState, rightIdx, 0);
    let in_south2 = textureLoad(txState, down2Idx, 0);
    let in_north2 = textureLoad(txState, up2Idx, 0);
    let in_west2 = textureLoad(txState, left2Idx, 0);
    let in_east2 = textureLoad(txState, right2Idx, 0);

    let B_here = textureLoad(txBottom, idx, 0).z;
    let B_south = textureLoad(txBottom, downIdx, 0).z;
    let B_north = textureLoad(txBottom, upIdx, 0).z;
    let B_west = textureLoad(txBottom, leftIdx, 0).z;
    let B_east = textureLoad(txBottom, rightIdx, 0).z;

    let h_here = in_here.x - B_here;
    let h_south = in_south.x - B_south;
    let h_north = in_north.x - B_north;
    let h_west = in_west.x - B_west;
    let h_east = in_east.x - B_east;

    let h_cut = globals.delta;
    if (h_here <= h_cut) {    //if dry and surrounded by dry, then stay dry - no need to calc
        if(h_north <= h_cut && h_east <= h_cut && h_south <= h_cut && h_west <= h_cut) {
            let zero = vec4<f32>(0.0, 0.0, 0.0, 0.0);
            textureStore(txH, idx, zero);
            textureStore(txU, idx, zero);
            textureStore(txV, idx, zero);
            textureStore(txC, idx, zero);
            return; 
        }
    }

    // Load bed elevation data for this pixel's edges
    let Bxy = textureLoad(txBottom, idx, 0).xy;
    let Bz = textureLoad(txBottom, downIdx, 0).x;
    let Bw = textureLoad(txBottom, leftIdx, 0).y;
    let B = vec4<f32>(Bxy, Bz, Bw);

    let dB_west = abs(B_here - B_west);
    let dB_east = abs(B_here - B_east);
    let dB_south = abs(B_here - B_south);
    let dB_north = abs(B_here - B_north);
    var dB_max = vec4<f32>(0.0, 0.0, 0.0, 0.0);

    // Initialize variables for water height, momentum components, and standard deviation
    var h = vec4<f32>(0.0, 0.0, 0.0, 0.0);
    var w = vec4<f32>(0.0, 0.0, 0.0, 0.0);
    var hu = vec4<f32>(0.0, 0.0, 0.0, 0.0);
    var hv = vec4<f32>(0.0, 0.0, 0.0, 0.0);
    var hc = vec4<f32>(0.0, 0.0, 0.0, 0.0);

    var wwy = vec2<f32>(0.0, 0.0);
    var wzx = vec2<f32>(0.0, 0.0);
    var huwy = vec2<f32>(0.0, 0.0);
    var huzx = vec2<f32>(0.0, 0.0);
    var hvwy = vec2<f32>(0.0, 0.0);
    var hvzx = vec2<f32>(0.0, 0.0);
    var hcwy = vec2<f32>(0.0, 0.0);
    var hczx = vec2<f32>(0.0, 0.0);

    // modify limiters based on whether near the inundation limit
    let wetdry = min(h_here, min(h_south, min(h_north, min(h_west, h_east))));
    let rampcoef = min(max(0.0, wetdry / (0.02 * globals.base_depth)), 1.0);
    let TWO_THETAc = globals.TWO_THETA * rampcoef + 2.0 * (1.0 - rampcoef);  // transition to full upwinding near the shoreline / inundation limit, start transition with a total water depth of base_depth/50.

    if(wetdry <= globals.epsilon) {
        dB_max = 0.5*vec4<f32>(dB_north, dB_east, dB_south, dB_west);
    }

    if(wetdry <= globals.epsilon || B_here >= 0.0) {

        // Use the original Reconstruct function for boundary conditions
        wwy =  Reconstruct(in_west.x, in_here.x, in_east.x, TWO_THETAc);
        huwy = Reconstruct(in_west.y, in_here.y, in_east.y, TWO_THETAc);
        hvwy = Reconstruct(in_west.z, in_here.z, in_east.z, TWO_THETAc);
        hcwy = Reconstruct(in_west.w, in_here.w, in_east.w, TWO_THETAc);

        // Use the original Reconstruct function for boundary conditions
        wzx =  Reconstruct(in_south.x, in_here.x, in_north.x, TWO_THETAc);
        huzx = Reconstruct(in_south.y, in_here.y, in_north.y, TWO_THETAc);
        hvzx = Reconstruct(in_south.z, in_here.z, in_north.z, TWO_THETAc);
        hczx = Reconstruct(in_south.w, in_here.w, in_north.w, TWO_THETAc);
    } else {
        // Use the high-order Reconstruct function for interior points
        wwy =  ReconstructCWENO4(in_west2.x, in_west.x, in_here.x, in_east.x, in_east2.x, TWO_THETAc);
        huwy = ReconstructCWENO4(in_west2.y, in_west.y, in_here.y, in_east.y, in_east2.y, TWO_THETAc);
        hvwy = ReconstructCWENO4(in_west2.z, in_west.z, in_here.z, in_east.z, in_east2.z, TWO_THETAc);
        hcwy = ReconstructCWENO4(in_west2.w, in_west.w, in_here.w, in_east.w, in_east2.w, TWO_THETAc);
        
        // Use the high-order Reconstruct function for interior points
        wzx =  ReconstructCWENO4(in_south2.x, in_south.x, in_here.x, in_north.x, in_north2.x, TWO_THETAc);
        huzx = ReconstructCWENO4(in_south2.y, in_south.y, in_here.y, in_north.y, in_north2.y, TWO_THETAc);
        hvzx = ReconstructCWENO4(in_south2.z, in_south.z, in_here.z, in_north.z, in_north2.z, TWO_THETAc);
        hczx = ReconstructCWENO4(in_south2.w, in_south.w, in_here.w, in_north.w, in_north2.w, TWO_THETAc);
    }

    w = vec4<f32>(wzx.y, wwy.y, wzx.x, wwy.x);
    h = w - B;
    h = max(h, vec4<f32>(0.0, 0.0, 0.0, 0.0));
    hu = vec4<f32>(huzx.y, huwy.y, huzx.x, huwy.x);
    hv = vec4<f32>(hvzx.y, hvwy.y, hvzx.x, hvwy.x);
    hc = vec4<f32>(hczx.y, hcwy.y, hczx.x, hcwy.x);

    // CalcUVC 
    var u: vec4<f32>;
    var v: vec4<f32>;
    var c: vec4<f32>;
    let h2 = h * h;
    let epsilon_c = max(vec4<f32>(globals.epsilon), dB_max);
    let divide_by_h = 2.0 * h / (h2 + max(h2, epsilon_c));  // this is important - the local depth used for the edges should not be less than the difference in water depth across the edge
    u = divide_by_h * hu;
    v = divide_by_h * hv;
    c = divide_by_h * hc;

    // Froude number limiter 
    let speed = sqrt(u * u + v * v);
    let Fr = speed / sqrt(9.81 / divide_by_h);
    let Frumax = max(Fr.x, max(Fr.y, max(Fr.z, Fr.w)));
    let dBdx = abs(B_east - B_west) / (2.0 * globals.dx_global);
    let dBdy = abs(B_north - B_south) / (2.0 * globals.dy_global);
    let dBds_max = max(dBdx, dBdy);
    let Fr_maxallowed = 3.0 / max(1.0, dBds_max);  // max Fr allowed on slopes less than 45 degrees is 3; for very steep slopes, artificially slow velocity - physics are just completely wrong here anyhow
    if (Frumax > Fr_maxallowed) {
        let Fr_red = Fr_maxallowed / Frumax;
        u = u * Fr_red;
        v = v * Fr_red;
    }

    textureStore(txH, idx, h);
    textureStore(txU, idx, u);
    textureStore(txV, idx, v);
    textureStore(txC, idx, c);  //move this output texture to BC call, and keep the C calcs here

}

