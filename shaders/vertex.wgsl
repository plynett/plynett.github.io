struct VertexOutput {
    @builtin(position) clip_position: vec4<f32>,
    @location(1) uv: vec2<f32>,
};

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
    out.clip_position = vec4<f32>(position, 0.0, 1.0);
    return out;
}
