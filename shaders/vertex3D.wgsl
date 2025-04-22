struct VertexIn {
    @location(0) pos : vec2<f32>,   // the vec2 from the buffer
};

struct VertexOut {
    @builtin(position) clip_position: vec4<f32>,
    @location(1) uv: vec2<f32>,
};

struct Globals {
    colorVal_max: f32,
    colorVal_min: f32,
    colorMap_choice: i32,
    surfaceToPlot: i32,
    showBreaking: i32,
    GoogleMapOverlay: i32,
    scaleX: f32,
    scaleY: f32,
    offsetX: f32,
    offsetY: f32,
    dx: f32,
    dy: f32,
    WIDTH: i32,
    HEIGHT: i32,
    rotationAngle_xy: f32,
    shift_x: f32,
    shift_y: f32,
    forward: f32,
    canvas_width_ratio: f32,
    canvas_height_ratio: f32,
    delta: f32,
    CB_show: i32,
    CB_xbuffer_uv: f32,
    CB_xstart_uv: f32,
    CB_width_uv: f32,
    CB_ystart: i32,
    CB_label_height: i32,
    base_depth: f32,
    NumberOfTimeSeries: i32,
    time: f32,
    west_boundary_type: i32,
    east_boundary_type: i32,
    south_boundary_type: i32,
    north_boundary_type: i32, 
    designcomponent_Fric_Coral: f32,
    designcomponent_Fric_Oyser: f32,
    designcomponent_Fric_Mangrove: f32,
    designcomponent_Fric_Kelp: f32,
    designcomponent_Fric_Grass: f32,
    designcomponent_Fric_Scrub: f32,
    designcomponent_Fric_RubbleMound: f32,
    designcomponent_Fric_Dune: f32,
    designcomponent_Fric_Berm: f32,
    designcomponent_Fric_Seawall: f32,
    bathy_cmap_zero: f32,
    renderZScale: f32,
    temp1: f32,
    temp2: f32,
    viewProj: mat4x4<f32>, // bytes 192–255: your camera matrix
};

@group(0) @binding(0) var<uniform> globals: Globals;

@group(0) @binding(1) var etaTexture: texture_2d<f32>;
@group(0) @binding(2) var bottomTexture: texture_2d<f32>;
@group(0) @binding(13) var textureSampler: sampler;

@vertex
fn vs_main(v : VertexIn) -> VertexOut {
    var out: VertexOut;

    // uv directly from position
    out.uv = v.pos * 0.5 + 0.5;

    let elev = textureSampleLevel(etaTexture, textureSampler, out.uv, 0.0).r;

    let worldX = out.uv.x * f32(globals.WIDTH)  * globals.dx;
    let worldY = out.uv.y * f32(globals.HEIGHT) * globals.dy;
    let worldZ = elev * globals.renderZScale;

    out.clip_position = globals.viewProj * vec4<f32>(worldX, worldY, worldZ, 1.0);
    return out;
}