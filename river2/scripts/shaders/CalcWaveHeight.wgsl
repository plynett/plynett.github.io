struct Globals {
    n_time_steps_waveheight: i32
};

@group(0) @binding(0) var<uniform> globals: Globals;

@group(0) @binding(1) var txState: texture_2d<f32>;
@group(0) @binding(2) var txNewState: texture_2d<f32>;
@group(0) @binding(3) var txMeans: texture_2d<f32>;
@group(0) @binding(4) var txWaveHeight: texture_2d<f32>;
@group(0) @binding(5) var txtemp_WaveHeight: texture_storage_2d<rgba32float, write>;


@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
    let idx = vec2<i32>(i32(id.x), i32(id.y));
    
    let eta_Old = textureLoad(txState, idx, 0).r;
    let eta_New = textureLoad(txNewState, idx, 0).r;

    let eta_mean = textureLoad(txMeans, idx, 0).r;

    let old_vals = textureLoad(txWaveHeight, idx, 0);

    // rayleigh
    var sum_eta2 = old_vals.r;
    if(globals.n_time_steps_waveheight <= 1) {
        sum_eta2 = 0.0;
    }

    let eta = eta_New-eta_mean;
    
    sum_eta2 = sum_eta2 + eta * eta;

    var variance = sum_eta2 / f32(globals.n_time_steps_waveheight);

    let sigma = sqrt(variance);

    let H_mean = sigma * 2.829;  // RMS wave height
    let H_sig = sigma * 4.000;   // sig wave height

    let new_vals = vec4<f32>(sum_eta2, (H_sig-old_vals.b)/old_vals.b, H_sig, H_mean);


    // zero-crossing
//    var max_eta = old_vals.r;
//    var min_eta = old_vals.g;
//    var N_waves = old_vals.b;
//    var H_mean  = old_vals.a;
  //  if(globals.n_time_steps_waveheight <= 1) {
  //      N_waves = 0.0;
  //      H_mean = 0.0;
 //       max_eta = -999999.;
 //       min_eta =  999999.;
 //
//    } else if(eta_New>=0. && eta_Old<0.) {  // zero-up crossing
 //       N_waves = N_waves + 1.0;
 //       
 //       let H = max_eta - min_eta;
//
//        let update_frac = 1. / N_waves;
//        let old_frac = 1.0 - update_frac;
//
//        H_mean = old_frac * H_mean + update_frac * H;
//        
//        max_eta = -999999.;
//        min_eta =  999999.;
//
//    } else {
//        max_eta = max(max_eta,eta_New);
//        min_eta = min(min_eta,eta_New);
//    }
//    let new_vals = vec4<f32>(max_eta, min_eta, N_waves, H_mean);

    textureStore(txtemp_WaveHeight, idx, new_vals);
}

