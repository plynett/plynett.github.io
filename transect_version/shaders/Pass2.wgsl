struct Globals {
    width: u32,
    height: u32,
    g: f32,
    half_g: f32,
    dx: f32,
    dy: f32,
    delta: f32,
    useSedTransModel: i32,
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

fn NumericalFlux(aplus: f32, aminus: f32, Fplus: f32, Fminus: f32, Udifference: f32) -> f32 {
    if (aplus - aminus != 0.0) {
        return (aplus * Fminus - aminus * Fplus + aplus * aminus * Udifference) / (aplus - aminus);
    } else {
        return 0.0;
    }
}

fn ScalarAntiDissipation(uplus: f32, uminus: f32, aplus: f32, aminus: f32, epsilon: f32) -> f32 {
    if (aplus != 0.0 && aminus != 0.0) {
        var Fr: f32;
        if (abs(uplus) >= abs(uminus)) {
            Fr = abs(uplus) / aplus;
        } else {
            Fr = abs(uminus) / aminus;
        }
        return (Fr + epsilon) / (Fr + 1.0);
    } else if (aplus == 0.0 || aminus == 0.0) {
        return epsilon;
    }
    return 0.0;  // Default return if none of the conditions are met.
}

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
    let idx = vec2<i32>(i32(id.x), i32(id.y));
    
    // Handle boundary conditions
    let rightIdx = min(idx + vec2<i32>(1, 0), vec2<i32>(i32(globals.width)-1, i32(globals.height)-1));
   // let upIdx = min(idx + vec2<i32>(0, 1), vec2<i32>(i32(globals.width)-1, i32(globals.height)-1));
    let leftIdx = max(idx + vec2<i32>(-1, 0), vec2<i32>(0, 0));
   // let downIdx = max(idx + vec2<i32>(0, -1), vec2<i32>(0, 0));
    
    // Fetch the necessary data from the input textures
    let h_vec = textureLoad(txHnear, idx, 0);
    let h_here = textureLoad(txH, idx, 0).xy;
    
    let hW_east = textureLoad(txH, rightIdx, 0).w;
   // let hS_north = textureLoad(txH, upIdx, 0).z;

    let u_here = textureLoad(txU, idx, 0).xy;
    let uW_east = textureLoad(txU, rightIdx, 0).w;
   // let uS_north = textureLoad(txU, upIdx, 0).z;

    let v_here = textureLoad(txV, idx, 0).xy;
    let vW_east = textureLoad(txV, rightIdx, 0).w;
   // let vS_north = textureLoad(txV, upIdx, 0).z;

    let cNE = sqrt((globals.g * h_here));
    let cW = sqrt((globals.g * hW_east));
   // let cS = sqrt((globals.g * hS_north));

    let aplus = max(max(u_here.y + cNE.y, uW_east + cW), 0.0);
    let aminus = min(min(u_here.y - cNE.y, uW_east - cW), 0.0);
   // let bplus = max(max(v_here.x + cNE.x, vS_north + cS), 0.0);
   // let bminus = min(min(v_here.x - cNE.x, vS_north - cS), 0.0);

    let B_here = textureLoad(txBottom, idx, 0).z;
   // let dB = max(textureLoad(txBottom, downIdx, 0).z - B_here, max(textureLoad(txBottom, upIdx, 0).z - B_here, max(textureLoad(txBottom, leftIdx, 0).z - B_here, textureLoad(txBottom, rightIdx, 0).z - B_here)));
    let dB = max(textureLoad(txBottom, rightIdx, 0).z - B_here, textureLoad(txBottom, leftIdx, 0).z - B_here);

    let near_dry = textureLoad(txBottom, idx, 0).w;

    let c_here = textureLoad(txC, idx, 0).xy;
    let cW_east = textureLoad(txC, rightIdx, 0).w;
   // let cS_north = textureLoad(txC, upIdx, 0).z;

    var phix = 0.5;
   // var phiy = 0.5;

   // let minH = min(h_vec.w, min(h_vec.z, min(h_vec.y, h_vec.x)));
    let minH = min(h_vec.w, h_vec.y);  // minimum water height in the cell and its neighbors

    var mass_diff_x = (hW_east - h_here.y);
   // var mass_diff_y = (hS_north - h_here.x);
    
    var P_diff_x = (hW_east * uW_east - h_here.y * u_here.y);
   // var P_diff_y = (hS_north * uS_north - h_here.x * u_here.x);
    
   // var Q_diff_x = (hW_east * vW_east - h_here.y * v_here.y);
   // var Q_diff_y = (hS_north * vS_north - h_here.x * v_here.x);

    if (minH <= globals.delta) {
        mass_diff_x = 0.0;
      //  mass_diff_y = 0.0;
        phix = 1.0;
      //  phiy = 1.0;
    }

   // let xflux = vec4<f32>(
   //     NumericalFlux(aplus, aminus, hW_east * uW_east, h_here.y * u_here.y, mass_diff_x),
   //     NumericalFlux(aplus, aminus, hW_east * uW_east * uW_east, h_here.y * u_here.y * u_here.y, P_diff_x),
   //     NumericalFlux(aplus, aminus, hW_east * uW_east * vW_east, h_here.y * u_here.y * v_here.y, Q_diff_x),
   //     NumericalFlux(aplus, aminus, hW_east * uW_east * cW_east, h_here.y * u_here.y * c_here.y, phix * (hW_east * cW_east - h_here.y * c_here.y))
   // );

    let xflux = vec4<f32>(
        NumericalFlux(aplus, aminus, hW_east * uW_east, h_here.y * u_here.y, mass_diff_x),
        NumericalFlux(aplus, aminus, hW_east * uW_east * uW_east, h_here.y * u_here.y * u_here.y, P_diff_x),
        NumericalFlux(aplus, aminus, 0.0, 0.0, 0.0),
        NumericalFlux(aplus, aminus, hW_east * uW_east * cW_east, h_here.y * u_here.y * c_here.y, phix * (hW_east * cW_east - h_here.y * c_here.y))
    );

        
   // let yflux = vec4<f32>(
   //     NumericalFlux(bplus, bminus, hS_north * vS_north, h_here.x * v_here.x, mass_diff_y),
   //     NumericalFlux(bplus, bminus, hS_north * uS_north * vS_north, h_here.x * u_here.x * v_here.x, P_diff_y),
   //     NumericalFlux(bplus, bminus, hS_north * vS_north * vS_north, h_here.x * v_here.x * v_here.x, Q_diff_y),
   //     NumericalFlux(bplus, bminus, hS_north * cS_north * vS_north, h_here.x * c_here.x * v_here.x, phiy * (hS_north * cS_north - h_here.x * c_here.x))
   // );

    textureStore(txXFlux, idx, xflux);
   // textureStore(txYFlux, idx, yflux);

    if(globals.useSedTransModel == 1){
        // Sediment transport code
        let c1_here = textureLoad(txSed_C1, idx, 0).xy;
        let c1W_east = textureLoad(txSed_C1, rightIdx, 0).w;
       // let c1S_north = textureLoad(txSed_C1, upIdx, 0).z;

        let c2_here = textureLoad(txSed_C2, idx, 0).xy;
        let c2W_east = textureLoad(txSed_C2, rightIdx, 0).w;
       // let c2S_north = textureLoad(txSed_C2, upIdx, 0).z;

        let c3_here = textureLoad(txSed_C3, idx, 0).xy;
        let c3W_east = textureLoad(txSed_C3, rightIdx, 0).w;
       // let c3S_north = textureLoad(txSed_C3, upIdx, 0).z;

        let c4_here = textureLoad(txSed_C4, idx, 0).xy;
        let c4W_east = textureLoad(txSed_C4, rightIdx, 0).w;
       // let c4S_north = textureLoad(txSed_C4, upIdx, 0).z;

        let xflux_Sed = vec4<f32>(
            NumericalFlux(aplus, aminus, hW_east * uW_east * c1W_east, h_here.y * u_here.y * c1_here.y, phix * (hW_east * c1W_east - h_here.y * c1_here.y)),
            NumericalFlux(aplus, aminus, hW_east * uW_east * c2W_east, h_here.y * u_here.y * c2_here.y, phix * (hW_east * c2W_east - h_here.y * c2_here.y)),
            NumericalFlux(aplus, aminus, hW_east * uW_east * c3W_east, h_here.y * u_here.y * c3_here.y, phix * (hW_east * c3W_east - h_here.y * c3_here.y)),
            NumericalFlux(aplus, aminus, hW_east * uW_east * c4W_east, h_here.y * u_here.y * c4_here.y, phix * (hW_east * c4W_east - h_here.y * c4_here.y))
        );
            
       // let yflux_Sed = vec4<f32>(
       //     NumericalFlux(bplus, bminus, hS_north * c1S_north * vS_north, h_here.x * c1_here.x * v_here.x, phiy * (hS_north * c1S_north - h_here.x * c1_here.x)),
       //     NumericalFlux(bplus, bminus, hS_north * c2S_north * vS_north, h_here.x * c2_here.x * v_here.x, phiy * (hS_north * c2S_north - h_here.x * c2_here.x)),
       //     NumericalFlux(bplus, bminus, hS_north * c3S_north * vS_north, h_here.x * c3_here.x * v_here.x, phiy * (hS_north * c3S_north - h_here.x * c3_here.x)),
       //     NumericalFlux(bplus, bminus, hS_north * c4S_north * vS_north, h_here.x * c4_here.x * v_here.x, phiy * (hS_north * c4S_north - h_here.x * c4_here.x))
       // );

        textureStore(txXFlux_Sed, idx, xflux_Sed);
       // textureStore(txYFlux_Sed, idx, yflux_Sed);
    }
}
