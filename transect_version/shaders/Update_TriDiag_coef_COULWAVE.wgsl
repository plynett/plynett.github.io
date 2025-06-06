struct Globals {
    width: u32,
    height: u32,
    dx: f32,
    dy: f32,
    Bcoef: f32,
    NLSW_or_Bous: i32,
    Bous_alpha: f32,
    one_over_d2x: f32,
    one_over_d2y: f32,
    delta: f32,
};

@group(0) @binding(0) var<uniform> globals: Globals;

@group(0) @binding(1) var txBottom: texture_2d<f32>;
@group(0) @binding(2) var current_stateUVstar: texture_2d<f32>;

@group(0) @binding(3) var coefMatx: texture_storage_2d<rgba32float, write>;
@group(0) @binding(4) var coefMaty: texture_storage_2d<rgba32float, write>;

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
    let idx = vec2<i32>(i32(id.x), i32(id.y));

    let width = i32(globals.width);
   // let height = i32(globals.height);

    let leftIdx = idx + vec2<i32>(-1, 0);
    let rightIdx = idx + vec2<i32>(1, 0);
   // let downIdx = idx + vec2<i32>(0, -1);
   // let upIdx = idx + vec2<i32>(0, 1);

    let d_here = -textureLoad(txBottom, idx, 0).z;
    let z_loc = textureLoad(current_stateUVstar, idx, 0).x;
    let H_loc = max(globals.delta, z_loc + d_here);
    let za = -d_here + ( 1.0 + globals.Bous_alpha ) * H_loc;	
    //let za = d_here * globals.Bous_alpha;
    let za2 = za * za;
    let zloc2 = z_loc * z_loc;

    let near_dry = textureLoad(txBottom, idx, 0).w; //min(textureLoad(txBottom, idx, 0).w, H_loc);

    var a = 0.0;
    var b = 1.0;
    var c = 0.0;
    var d = 0.0;

    // X-coefs
    var coefx = vec4<f32>(0.0, 0.0, 0.0, 0.0);
    let UU_loc = textureLoad(current_stateUVstar, idx, 0).y;
    d = UU_loc / H_loc;
    if (idx.x <= 2 || idx.x >= width - 3 || near_dry < globals.delta) {
        a = 0.0;
        b = 1.0;
        c = 0.0;
    }
    else {

        let d_west = -textureLoad(txBottom, leftIdx, 0).z;
        let d_east = -textureLoad(txBottom, rightIdx, 0).z;

        if (globals.NLSW_or_Bous == 2) {
            // COULWAVE equations
            let zx_loc = (textureLoad(current_stateUVstar, rightIdx, 0).x - textureLoad(current_stateUVstar, leftIdx, 0).x) / globals.dx / 2.;

            a =     (za2-zloc2)/2.*globals.one_over_d2x +   (za-z_loc)*d_west*globals.one_over_d2x + zx_loc*(z_loc+d_west)/globals.dx/2.;
            b = 1.0-(za2-zloc2)*globals.one_over_d2x  - 2.0*(za-z_loc)*d_here*globals.one_over_d2x;
            c =     (za2-zloc2)/2.*globals.one_over_d2x +   (za-z_loc)*d_east*globals.one_over_d2x - zx_loc*(z_loc+d_east)/globals.dx/2.;
        } else{
            // Calculate the first derivative of the depth
            let d_dx = (d_east - d_west) / (2.0 * globals.dx);

            // Calculate coefficients based on the depth and its derivative
            a =  d_here * d_dx / (6.0 * globals.dx) - (globals.Bcoef + 1.0 / 3.0) * d_here * d_here / (globals.dx * globals.dx);
            b = 1.0 + 2.0 * (globals.Bcoef + 1.0 / 3.0) * d_here * d_here / (globals.dx * globals.dx);
            c = -d_here * d_dx / (6.0 * globals.dx) - (globals.Bcoef + 1.0 / 3.0) * d_here * d_here / (globals.dx * globals.dx);
        }
    }
    coefx = vec4<f32>(a, b, c, d);

    // Y-coefs
   // var coefy = vec4<f32>(0.0, 0.0, 0.0, 0.0);
   // let VV_loc = textureLoad(current_stateUVstar, idx, 0).z;
   // d = VV_loc / H_loc;
   // if (idx.y <= 2 || idx.y >= height - 3 || near_dry < globals.delta) {
   //     a = 0.0;
   //     b = 1.0;
   //     c = 0.0;
   // }
   // else {

    //    let d_south = -textureLoad(txBottom, downIdx, 0).z;
    //    let d_north = -textureLoad(txBottom, upIdx, 0).z;

    //    if (globals.NLSW_or_Bous == 2) {
            // COULWAVE equations
    //        let zy_loc = (textureLoad(current_stateUVstar, upIdx, 0).x - textureLoad(current_stateUVstar, downIdx, 0).x) / globals.dy / 2.;
    //        a =     (za2-zloc2)/2.*globals.one_over_d2y +   (za-z_loc)*d_south*globals.one_over_d2y + zy_loc*(z_loc+d_south)/globals.dy/2.;
    //        b = 1.0-(za2-zloc2)*globals.one_over_d2y  - 2.0*(za-z_loc)*d_here*globals.one_over_d2y;
    //        c =     (za2-zloc2)/2.*globals.one_over_d2y +   (za-z_loc)*d_north*globals.one_over_d2y - zy_loc*(z_loc+d_north)/globals.dy/2.;
    //    } else{
            // Calculate the first derivative of the depth
    //        let d_dy = (d_north - d_south) / (2.0 * globals.dy);

            // Calculate coefficients based on the depth and its derivative
    //        a =  d_here * d_dy / (6.0 * globals.dy) - (globals.Bcoef + 1.0 / 3.0) * d_here * d_here / (globals.dy * globals.dy);
    //        b = 1.0 + 2.0 * (globals.Bcoef + 1.0 / 3.0) * d_here * d_here / (globals.dy * globals.dy);
    //        c = -d_here * d_dy / (6.0 * globals.dy) - (globals.Bcoef + 1.0 / 3.0) * d_here * d_here / (globals.dy * globals.dy);
    //    }
   // }
   // coefy = vec4<f32>(a, b, c, d);

    textureStore(coefMatx, idx, coefx);
   // textureStore(coefMaty, idx, coefy);
}

