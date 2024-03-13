struct Globals {
    width: i32,
    height: i32,
    dx: f32,
    dy: f32,
    xClick: f32,
    yClick: f32,
    changeRadius: f32,
    changeAmplitude: f32,
    surfaceToChange: i32,
    changeType: i32,
    base_depth: f32,
};

@group(0) @binding(0) var<uniform> globals: Globals;

@group(0) @binding(1) var txBottom: texture_2d<f32>; 
@group(0) @binding(2) var txBottomFriction: texture_2d<f32>; 
@group(0) @binding(3) var txContSource: texture_2d<f32>; 
@group(0) @binding(4) var txState: texture_2d<f32>; 
@group(0) @binding(5) var txtemp_MouseClick: texture_storage_2d<rgba32float, write>;


fn calc_radial_function(xloc: f32, yloc: f32, xo: f32, yo: f32, k: f32) -> f32 {
    let xdiff = xo - xloc;
    let ydiff = yo - yloc;
    let r = sqrt(xdiff*xdiff + ydiff*ydiff);

    let f = exp( - k * k * r * r);

    return f;
}

fn calc_dH(f: f32, H: f32, B_val: f32) -> f32 {
    var dH = 0.0;
    if (globals.changeType ==1){
        dH = f * H;
    } else if (globals.changeType ==2){
        dH = (H - B_val)*f;
    }

    return dH;
}


@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
    let idx = vec2<i32>(i32(id.x), i32(id.y));

    var B_here =  vec4<f32>(0.0, 0.0, 0.0, 0.0);
    var min_val = 0.0;
    if (globals.surfaceToChange == 1) {      // bathy topo
        B_here = textureLoad(txBottom, idx, 0);
        min_val = -globals.base_depth;
    } else if (globals.surfaceToChange == 2) {   // friction 
        B_here = textureLoad(txBottomFriction, idx, 0);
        min_val = 0.0;
    } else if (globals.surfaceToChange == 3) {   // passive tracer 
        B_here = textureLoad(txContSource, idx, 0);
        min_val = 0.0;
    } else if (globals.surfaceToChange == 4) {   // free surface elevation
        B_here = textureLoad(txState, idx, 0);
        min_val = 0.0;
    }

    let k = 4.0 / globals.changeRadius;  // will give a guassian that has a visual width of changeRadius
    let H = globals.changeAmplitude;

    var xloc = f32(id.x)*globals.dx;
    var yloc = f32(id.y)*globals.dy;

    let xo = globals.xClick*globals.dx;
    let yo = globals.yClick*globals.dy;


    if (globals.surfaceToChange == 1) {      // bathy topo
        // center
        var f = calc_radial_function(xloc,yloc,xo,yo,k);
        var dH = calc_dH(f,H,B_here.z);
        B_here.z = max(min_val,B_here.z + dH);
        
        // North
        f = calc_radial_function(xloc,yloc+0.5*globals.dy,xo,yo,k);
        dH = calc_dH(f,H,B_here.x);
        B_here.x = max(min_val,B_here.x + dH);

        // East
        f = calc_radial_function(xloc+0.5*globals.dx,yloc,xo,yo,k);
        dH = calc_dH(f,H,B_here.y);
        B_here.y = max(min_val,B_here.y + dH);

        // update neardry
        let lengthCheck = 3;    // check within three points
        for (var yy = idx.y - lengthCheck; yy <= idx.y + lengthCheck; yy += 1) 
        {
            for (var xx = idx.x - lengthCheck; xx <= idx.x + lengthCheck; xx += 1) 
            {
                let xC = min(globals.width - 1, max(0, xx));
                let yC = min(globals.height - 1, max(0, yy));

                let idx_C = vec2<i32>(xC, yC);
                let bathy_C = textureLoad(txBottom, idx_C, 0).z;
                if (bathy_C >= 0.) 
                {
                     B_here.w = -99.;
                }
                
            }
        }

    } else if (globals.surfaceToChange == 2) {   // friction 
        var f = calc_radial_function(xloc,yloc,xo,yo,k);
        var dH = calc_dH(f,H,B_here.x);
        B_here.x = max(min_val,B_here.x + dH);
    } else if (globals.surfaceToChange == 3) {   // passive tracer, right now same as friction, but keep seperate to accomodate future multiple tracers 
        var f = calc_radial_function(xloc,yloc,xo,yo,k);
        var dH = calc_dH(f,H,B_here.x);
        B_here.x = max(min_val,B_here.x + dH);
    } else if (globals.surfaceToChange == 4) {   // water surface elevation, right now same as friction, but keep seperate to accomodate future multiple tracers 
        var f = calc_radial_function(xloc,yloc,xo,yo,k);
        var dH = calc_dH(f,H,B_here.x);
        B_here.x = max(min_val,B_here.x + dH);
    }

    textureStore(txtemp_MouseClick, idx, B_here);
}

