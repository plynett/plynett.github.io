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

fn Reconstruct(west: f32, here: f32, east: f32, TWO_THETAc: f32) -> vec2<f32> {
    let z1 = TWO_THETAc * (here - west);
    let z2 = (east - west);
    let z3 = TWO_THETAc * (east - here);

    let dx_grad_over_two = 0.25 * MinMod(z1, z2, z3);

    let out_east = here + dx_grad_over_two;
    let out_west = here - dx_grad_over_two;

    return vec2(out_west, out_east);
}

// 4th-order MUSCL-TVD optimized reconstruction
// Helper to compute limited slopes and third differences
fn calcSlopes(dh0: f32, dh1: f32, dh2: f32, dh3: f32, dh4: f32) -> vec3<f32> {
    // Precompute constants
    let b0 = 2.0;
    let b1 = 2.0;

    // Precompute signs and absolutes
    let s0 = sign(dh0); let a0 = abs(dh0);
    let s1 = sign(dh1); let a1 = abs(dh1);
    let s2 = sign(dh2); let a2 = abs(dh2);
    let s3 = sign(dh3); let a3 = abs(dh3);
    let s4 = sign(dh4); let a4 = abs(dh4);
    // First three limited derivatives
    let dbh0 = s0 * max(0.0, min(a0, min(b1*s0*dh1, b1*s0*dh2)));
    let dbh1a = s1 * max(0.0, min(a1, min(b1*s1*dh2, b1*s1*dh0)));
    let dbh2a = s2 * max(0.0, min(a2, min(b1*s2*dh0, b1*s2*dh1)));
    let d3a = dbh2a - 2.0*dbh1a + dbh0;
    let sh1 = dh1 - d3a / 6.0;
    // Next three
    let dbh1b = s1 * max(0.0, min(a1, min(b1*s1*dh2, b1*s1*dh3)));
    let dbh2b = s2 * max(0.0, min(a2, min(b1*s2*dh3, b1*s2*dh1)));
    let dbh3b = s3 * max(0.0, min(a3, min(b1*s3*dh1, b1*s3*dh2)));
    let d3b = dbh3b - 2.0*dbh2b + dbh1b;
    let sh2 = dh2 - d3b / 6.0;
    // Final three
    let dbh2c = s2 * max(0.0, min(a2, min(b1*s2*dh3, b1*s2*dh4)));
    let dbh3c = s3 * max(0.0, min(a3, min(b1*s3*dh4, b1*s3*dh2)));
    let dbh4c = s4 * max(0.0, min(a4, min(b1*s4*dh2, b1*s4*dh3)));
    let d3c = dbh4c - 2.0*dbh3c + dbh2c;
    let sh3 = dh3 - d3c / 6.0;
    return vec3<f32>(sh1, sh2, sh3);
}
// Reconstruct function for 4th-order MUSCL-TVD
fn ReconstructMUSCL4(z_m3: f32, z_m2: f32, z_m1: f32, z0:   f32, z1:   f32, z2:   f32, z3:   f32, dh_max: f32) -> vec2<f32> {
    // Precompute constants
    let b0 = 2.0; 
    let b1 = 2.0;
    var ilim_c = 0; // 1 = TVD limiter, 0 = no limiter
    if (dh_max > 0.60) {
        ilim_c = 1;
    }

    // Compute right-side slopes
    let dhR0 = z_m1 - z_m2;
    let dhR1 = z0   - z_m1;
    let dhR2 = z1   - z0;
    let dhR3 = z2   - z1;
    let dhR4 = z3   - z2;
    let shR = calcSlopes(dhR0, dhR1, dhR2, dhR3, dhR4);

    // Compute left-side slopes (shift indices)
    let dhL0 = z_m2 - z_m3;
    let dhL1 = z_m1 - z_m2;
    let dhL2 = z0   - z_m1;
    let dhL3 = z1   - z0;
    let dhL4 = z2   - z1;
    let shL = calcSlopes(dhL0, dhL1, dhL2, dhL3, dhL4);

    var bR1 = 0.0;
    var bR2 = 0.0;
    var bL3 = 0.0;
    var bL4 = 0.0;

    if (ilim_c == 1) {
        // TVD limiter on shR
        let sR1 = sign(shR.x); let aR1 = abs(shR.x);
        let sR2 = sign(shR.y); let aR2 = abs(shR.y);
        let sR3 = sign(shR.z); let aR3 = abs(shR.z);
        bR1 = sR1 * max(0.0, min(aR1, b0 * shR.y * sR1));
        bR2 = sR2 * max(0.0, min(aR2, b0 * shR.x * sR2));
        let bR3 = sR2 * max(0.0, min(aR2, b0 * shR.z * sR2));
        let bR4 = sR3 * max(0.0, min(aR3, b0 * shR.y * sR3));

        // TVD limiter on shL
        let sL1 = sign(shL.x); let aL1 = abs(shL.x);
        let sL2 = sign(shL.y); let aL2 = abs(shL.y);
        let sL3 = sign(shL.z); let aL3 = abs(shL.z);
        let bL1 = sL1 * max(0.0, min(aL1, b0 * shL.y * sL1));
        let bL2 = sL2 * max(0.0, min(aL2, b0 * shL.x * sL2));
        bL3 = sL2 * max(0.0, min(aL2, b0 * shL.z * sL2));
        bL4 = sL3 * max(0.0, min(aL3, b0 * shL.y * sL3));
    }
    else {
        // No limiter
        bR1 = shR.x;
        bR2 = shR.y;
        bL3 = shL.y;
        bL4 = shL.z;
    }
    
    let H_right = z0 + (bR1 + 2.0*bR2) / 6.0;
    let H_left  = z0 - (2.0*bL3 + bL4) / 6.0;

    return vec2<f32>(H_left, H_right);
}


@compute @workgroup_size(16, 16) //
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
    // Convert the 3D thread ID to a 2D grid coordinate
    let idx = vec2<i32>(i32(id.x), i32(id.y));

    // Compute the coordinates of the neighbors for each pixel, and enforce boundary conditions
    let rightIdx = min(idx + vec2<i32>(1, 0), vec2<i32>(i32(globals.width)-1, i32(globals.height)-1));
   // let upIdx = min(idx + vec2<i32>(0, 1), vec2<i32>(i32(globals.width)-1, i32(globals.height)-1));
    let leftIdx = max(idx + vec2<i32>(-1, 0), vec2<i32>(0, 0));
   // let downIdx = max(idx + vec2<i32>(0, -1), vec2<i32>(0, 0));
   
    let right2Idx = min(idx + vec2<i32>(2, 0), vec2<i32>(i32(globals.width)-1, i32(globals.height)-1));
   // let up2Idx = min(idx + vec2<i32>(0, 2), vec2<i32>(i32(globals.width)-1, i32(globals.height)-1));
    let left2Idx = max(idx + vec2<i32>(-2, 0), vec2<i32>(0, 0));
   // let down2Idx = max(idx + vec2<i32>(0, -2), vec2<i32>(0, 0));
   
    let right3Idx = min(idx + vec2<i32>(3, 0), vec2<i32>(i32(globals.width)-1, i32(globals.height)-1));
   // let up3Idx = min(idx + vec2<i32>(0, 3), vec2<i32>(i32(globals.width)-1, i32(globals.height)-1));
    let left3Idx = max(idx + vec2<i32>(-3, 0), vec2<i32>(0, 0));
   // let down3Idx = max(idx + vec2<i32>(0, -3), vec2<i32>(0, 0));

    // Read in the state of the water at this pixel and its neighbors
    let in_here = textureLoad(txState, idx, 0);
   // let in_south = textureLoad(txState, downIdx, 0);
   // let in_north = textureLoad(txState, upIdx, 0);
    let in_west = textureLoad(txState, leftIdx, 0);
    let in_east = textureLoad(txState, rightIdx, 0);

   // let in_south2 = textureLoad(txState, down2Idx, 0);
   // let in_north2 = textureLoad(txState, up2Idx, 0);
    let in_west2 = textureLoad(txState, left2Idx, 0);
    let in_east2 = textureLoad(txState, right2Idx, 0);

   // let in_south3 = textureLoad(txState, down3Idx, 0);
   // let in_north3 = textureLoad(txState, up3Idx, 0);
    let in_west3 = textureLoad(txState, left3Idx, 0);
    let in_east3 = textureLoad(txState, right3Idx, 0);

    let B_here = textureLoad(txBottom, idx, 0).z;
   // let B_south = textureLoad(txBottom, downIdx, 0).z;
   // let B_north = textureLoad(txBottom, upIdx, 0).z;
    let B_west = textureLoad(txBottom, leftIdx, 0).z;
    let B_east = textureLoad(txBottom, rightIdx, 0).z;

   // let B_south2 = textureLoad(txBottom, down2Idx, 0).z;
   // let B_north2 = textureLoad(txBottom, up2Idx, 0).z;
    let B_west2 = textureLoad(txBottom, left2Idx, 0).z;
    let B_east2 = textureLoad(txBottom, right2Idx, 0).z;

   // let B_south3 = textureLoad(txBottom, down3Idx, 0).z;
   // let B_north3 = textureLoad(txBottom, up3Idx, 0).z;
    let B_west3 = textureLoad(txBottom, left3Idx, 0).z;
    let B_east3 = textureLoad(txBottom, right3Idx, 0).z;

    let h_here = in_here.x - B_here;
   // let h_south = in_south.x - B_south;
   // let h_north = in_north.x - B_north;
    let h_west = in_west.x - B_west;
    let h_east = in_east.x - B_east;

    let h_cut = globals.delta;
    if (h_here <= h_cut) {    //if dry and surrounded by dry, then stay dry - no need to calc
      //  if(h_north <= h_cut && h_east <= h_cut && h_south <= h_cut && h_west <= h_cut) {
        if(h_east <= h_cut && h_west <= h_cut) {
            let zero = vec4<f32>(0.0, 0.0, 0.0, 0.0);
            textureStore(txH, idx, zero);
            textureStore(txU, idx, zero);
          //  textureStore(txV, idx, zero);
            textureStore(txC, idx, zero);
            return; 
        }
    }

    // Load bed elevation data for this pixel's edges
    let Bxy = textureLoad(txBottom, idx, 0).xy;
   // let Bz = textureLoad(txBottom, downIdx, 0).x;
    let Bw = textureLoad(txBottom, leftIdx, 0).y;
   // let B = vec4<f32>(Bxy, Bz, Bw);
    let B = vec4<f32>(Bxy, 0.0, Bw);

    let dB_west = abs(B_here - B_west);
    let dB_east = abs(B_here - B_east);
   // let dB_south = abs(B_here - B_south);
   // let dB_north = abs(B_here - B_north);
    var dB_max = vec4<f32>(0.0, 0.0, 0.0, 0.0);

    // Initialize variables for water height, momentum components, and standard deviation
    var h = vec4<f32>(0.0, 0.0, 0.0, 0.0);
    var w = vec4<f32>(0.0, 0.0, 0.0, 0.0);
    var hu = vec4<f32>(0.0, 0.0, 0.0, 0.0);
   // var hv = vec4<f32>(0.0, 0.0, 0.0, 0.0);
    var hc = vec4<f32>(0.0, 0.0, 0.0, 0.0);

    var wwy = vec2<f32>(0.0, 0.0);
    var wzx = vec2<f32>(0.0, 0.0);
    var huwy = vec2<f32>(0.0, 0.0);
    var huzx = vec2<f32>(0.0, 0.0);
   // var hvwy = vec2<f32>(0.0, 0.0);
   // var hvzx = vec2<f32>(0.0, 0.0);
    var hcwy = vec2<f32>(0.0, 0.0);
    var hczx = vec2<f32>(0.0, 0.0);

    // modify limiters based on whether near the inundation limit
    //let wetdry = min(h_here, min(h_south, min(h_north, min(h_west, h_east))));
    let wetdry = min(h_here, min(h_west, h_east));
    let rampcoef = min(max(0.0, wetdry / (0.02 * globals.base_depth)), 1.0);
    let TWO_THETAc = globals.TWO_THETA * rampcoef + 2.0 * (1.0 - rampcoef);  // transition to full upwinding near the shoreline / inundation limit, start transition with a total water depth of base_depth/50.

    if(wetdry <= globals.epsilon) {
       // dB_max = 0.5*vec4<f32>(dB_north, dB_east, dB_south, dB_west);
        dB_max = 0.5*vec4<f32>(0.0, dB_east, 0.0, dB_west);
    }

   // let maxB =  max(B_here, max(B_south,  max(B_north,  max(B_west,  B_east))));
   // let maxB2 = max(maxB,   max(B_south2, max(B_north2, max(B_west2, B_east2))));
   // let maxB3 = max(maxB2,  max(B_south3, max(B_north3, max(B_west3, B_east3))));
    let maxB =  max(B_here, max(B_west,  B_east));
    let maxB2 = max(maxB,   max(B_west2, B_east2));
    let maxB3 = max(maxB2,  max(B_west3, B_east3));

    if(wetdry <= globals.epsilon || maxB3 >= -globals.epsilon) {

        // left / right: Use the original Reconstruct function for boundary conditions
        wwy =  Reconstruct(in_west.x, in_here.x, in_east.x, TWO_THETAc);
        huwy = Reconstruct(in_west.y, in_here.y, in_east.y, TWO_THETAc);
      //  hvwy = Reconstruct(in_west.z, in_here.z, in_east.z, TWO_THETAc);
        hcwy = Reconstruct(in_west.w, in_here.w, in_east.w, TWO_THETAc);

        // south / north: Use the original Reconstruct function for boundary conditions
       // wzx =  Reconstruct(in_south.x, in_here.x, in_north.x, TWO_THETAc);
       // huzx = Reconstruct(in_south.y, in_here.y, in_north.y, TWO_THETAc);
       // hvzx = Reconstruct(in_south.z, in_here.z, in_north.z, TWO_THETAc);
       // hczx = Reconstruct(in_south.w, in_here.w, in_north.w, TWO_THETAc);
    } else {
		var dh0 = in_west2.x-in_west3.x;
		var dh1 = in_west.x-in_west2.x;
		var dh2 = in_here.x-in_west.x;
		var dh3 = in_east.x-in_here.x;
		var dh4 = in_east2.x-in_east.x;
		var dh5 = in_east3.x-in_east2.x;
		var dh_max = max(max(abs(dh0), abs(dh1)), max(abs(dh2), max(abs(dh3), max(abs(dh4), abs(dh5))))) / globals.dx_global;

        // left / right: Use the high-order Reconstruct function for interior points
        wwy =  ReconstructMUSCL4(in_west3.x, in_west2.x, in_west.x, in_here.x, in_east.x, in_east2.x, in_east3.x, dh_max);
        huwy = ReconstructMUSCL4(in_west3.y, in_west2.y, in_west.y, in_here.y, in_east.y, in_east2.y, in_east3.y, dh_max);
       // hvwy = ReconstructMUSCL4(in_west3.z, in_west2.z, in_west.z, in_here.z, in_east.z, in_east2.z, in_east3.z, dh_max);
        hcwy = ReconstructMUSCL4(in_west3.w, in_west2.w, in_west.w, in_here.w, in_east.w, in_east2.w, in_east3.w, dh_max);

       // dh0 = in_south2.x-in_south3.x;
       // dh1 = in_south.x-in_south2.x;
       // dh2 = in_here.x-in_south.x;
       // dh3 = in_north.x-in_here.x;
       // dh4 = in_north2.x-in_north.x;
       // dh5 = in_north3.x-in_north2.x;
       // dh_max = max(max(abs(dh0), abs(dh1)), max(abs(dh2), max(abs(dh3), max(abs(dh4), abs(dh5))))) / globals.dy_global;

        // south / north: Use the high-order Reconstruct function for interior points
       // wzx =  ReconstructMUSCL4(in_south3.x, in_south2.x, in_south.x, in_here.x, in_north.x, in_north2.x, in_north3.x, dh_max);
       // huzx = ReconstructMUSCL4(in_south3.y, in_south2.y, in_south.y, in_here.y, in_north.y, in_north2.y, in_north3.y, dh_max);
       // hvzx = ReconstructMUSCL4(in_south3.z, in_south2.z, in_south.z, in_here.z, in_north.z, in_north2.z, in_north3.z, dh_max);
       // hczx = ReconstructMUSCL4(in_south3.w, in_south2.w, in_south.w, in_here.w, in_north.w, in_north2.w, in_north3.w, dh_max);
    }

   // w = vec4<f32>(wzx.y, wwy.y, wzx.x, wwy.x);
    w = vec4<f32>(0.0, wwy.y, 0.0, wwy.x);
    h = vec4<f32>(0.0, wwy.y - B.y, 0.0, wwy.x - B.w);
   // hu = vec4<f32>(huzx.y, huwy.y, huzx.x, huwy.x);
    hu = vec4<f32>(0.0, huwy.y, 0.0, huwy.x);
   // hv = vec4<f32>(hvzx.y, hvwy.y, hvzx.x, hvwy.x);
   // hc = vec4<f32>(hczx.y, hcwy.y, hczx.x, hcwy.x);
    hc = vec4<f32>(0.0, hcwy.y, 0.0, hcwy.x);

   // if (h.x < globals.delta) {
   //     h.x = 0.0;;
   //     hu.x = 0.0;
   //     hv.x = 0.0;
   //     hc.x = 0.0;
   // }
    if (h.y < globals.delta) {
        h.y =0.0;;
        hu.y = 0.0;
      //  hv.y = 0.0;
        hc.y = 0.0;
    }   
   // if (h.z < globals.delta) {
   //     h.z =0.0;;
   //     hu.z = 0.0;
   //     hv.z = 0.0;
   //     hc.z = 0.0;
   // }
    if (h.w < globals.delta) {
        h.w =0.0;;
        hu.w = 0.0;
      //  hv.w = 0.0;
        hc.w = 0.0;
    }

    // CalcUVC 
    var u: vec4<f32>;
   // var v: vec4<f32>;
    var c: vec4<f32>;
    let h2 = h * h;
    let epsilon_c = max(vec4<f32>(globals.epsilon), dB_max);
    let divide_by_h = 2.0 * h / (h2 + max(h2, epsilon_c));  // this is important - the local depth used for the edges should not be less than the difference in water depth across the edge
    u = divide_by_h * hu;
   // v = divide_by_h * hv;
    c = divide_by_h * hc;

    // Froude number limiter 
   // let speed = sqrt(u * u + v * v);
    let speed = sqrt(u * u);
    let Fr = speed / sqrt(9.81 / divide_by_h);
   // let Frumax = max(Fr.x, max(Fr.y, max(Fr.z, Fr.w)));
    let Frumax = max(Fr.y, Fr.w);
    let dBdx = abs(B_east - B_west) / (2.0 * globals.dx_global);
   // let dBdy = abs(B_north - B_south) / (2.0 * globals.dy_global);
   // let dBds_max = max(dBdx, dBdy);
    let Fr_maxallowed = 3.0 / max(1.0, dBdx);  // max Fr allowed on slopes less than 45 degrees is 3; for very steep slopes, artificially slow velocity - physics are just completely wrong here anyhow
    if (Frumax > Fr_maxallowed) {
        let Fr_red = Fr_maxallowed / Frumax;
        u = u * Fr_red;
       // v = v * Fr_red;
    }

    textureStore(txH, idx, h);
    textureStore(txU, idx, u);
   // textureStore(txV, idx, v);
    textureStore(txC, idx, c);  //move this output texture to BC call, and keep the C calcs here

}

