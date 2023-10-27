struct Globals {
    width: u32,
    height: u32,
    dx: f32,
    dy: f32,
    xClick: f32,
    yClick: f32,
    changeRadius: f32,
    changeAmplitude: f32
};

@group(0) @binding(0) var<uniform> globals: Globals;

@group(0) @binding(1) var txBottom: texture_2d<f32>;
@group(0) @binding(2) var txtemp_MouseClick: texture_storage_2d<rgba32float, write>;


fn calc_dH(xloc: f32, yloc: f32, xo: f32, yo: f32, k: f32, H: f32) -> f32 {
    let xdiff = xo - xloc;
    let ydiff = yo - yloc;
    let r = sqrt(xdiff*xdiff + ydiff*ydiff);

    let dH = H * exp( - k * k * r * r);

    return dH;
}


@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
    let idx = vec2<i32>(i32(id.x), i32(id.y));

    var B_here = textureLoad(txBottom, idx, 0);

    let k = 4 / globals.changeRadius;  // will give a guassian that has a visual width of changeRadius
    let H = globals.changeAmplitude;

    var xloc = f32(id.x)*globals.dx;
    var yloc = f32(id.y)*globals.dy;

    let xo = globals.xClick*globals.dx;
    let yo = globals.yClick*globals.dy;

    // center
    var dH = calc_dH(xloc,yloc,xo,yo,k,H);
    B_here.z = B_here.z + dH;
    
    // North
    dH = calc_dH(xloc,yloc+0.5*globals.dy,xo,yo,k,H);
    B_here.x = B_here.x + dH;

    // East
    dH = calc_dH(xloc+0.5*globals.dx,yloc,xo,yo,k,H);
    B_here.y = B_here.y + dH;


    textureStore(txtemp_MouseClick, idx, B_here);
}

