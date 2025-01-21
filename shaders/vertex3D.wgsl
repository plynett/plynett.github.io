struct VertexOutput {
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
};

@group(0) @binding(0) var<uniform> globals: Globals;

@group(0) @binding(1) var etaTexture: texture_2d<f32>;
@group(0) @binding(2) var bottomTexture: texture_2d<f32>;

@vertex
fn vs_main(@builtin(vertex_index) in_vertex_index: u32) -> VertexOutput {
    var out: VertexOutput;

    let positions: array<vec2<f32>, 4> = array<vec2<f32>, 4>(
        vec2<f32>(-1.0, -1.0),  // bottom-left
        vec2<f32>(-1.0, 1.0),   // top-left
        vec2<f32>(1.0, -1.0),   // bottom-right
        vec2<f32>(1.0, 1.0)     // top-right
    );
    let position = positions[in_vertex_index];
    out.uv = position * 0.5 + 0.5;

    // grid size ratio, for irregular grids
    let grid_ratio = globals.dx / globals.dy;
    var grid_ratio_x = 1.0;
    var grid_ratio_y = 1.0;
    if (grid_ratio > 1.0) {
        grid_ratio_x = grid_ratio;
    } else {
        grid_ratio_y = 1.0 / grid_ratio;
    }

    // Load the elevation value from the texture
    let texelX = i32((position.x * 0.5 + 0.5) * f32(globals.WIDTH)*grid_ratio_x);
    let texelY = i32((position.y * 0.5 + 0.5) * f32(globals.HEIGHT)*grid_ratio_y);
    let texelCoords = vec2<i32>(texelX, texelY);
    let elevation = textureLoad(etaTexture, texelCoords, 0).r;  // 0 is the mipmap level

    // Convert NDC to pixel coordinates centered at the image
    let pixelX = (position.x + 1.0) * 0.5 * f32(globals.WIDTH)*grid_ratio_x;
    let pixelY = (position.y + 1.0) * 0.5 * f32(globals.HEIGHT)*grid_ratio_y;
    let centerX = f32(globals.WIDTH) / 2.0 * grid_ratio_x;
    let centerY = f32(globals.HEIGHT) / 2.0 * grid_ratio_y;
    let centeredX = pixelX - centerX;
    let centeredY = pixelY - centerY;

    // Define the arbitrary rotation angle
    let rotationAngle = globals.rotationAngle_xy * 3.14159 / 180.0; // Convert angle to radians
    let cosAngle = cos(rotationAngle);
    let sinAngle = sin(rotationAngle);

    // Apply 2D rotation to the centered position
    let rotatedX = cosAngle * centeredX - sinAngle * centeredY;
    let rotatedY = sinAngle * centeredX + cosAngle * centeredY;

    // Normalize rotated coordinates based on the canvas size
    let normalizedX = globals.forward*((rotatedX + centerX) / f32(globals.WIDTH) / grid_ratio_x * 2.0 - 1.0 + globals.shift_x)*globals.canvas_width_ratio;
    let normalizedY = globals.forward*((rotatedY + centerY) / f32(globals.HEIGHT) / grid_ratio_y * 2.0 - 1.0 + globals.shift_y)*globals.canvas_height_ratio;

    out.clip_position = vec4<f32>(normalizedX, normalizedY, 0.0, 1.0);
    return out;
}
