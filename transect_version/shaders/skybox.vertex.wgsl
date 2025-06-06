struct VSOut {
  @builtin(position) pos : vec4<f32>,
  @location(0)        dir : vec3<f32>
};

@group(0) @binding(0) var<uniform> u_invVP : mat4x4<f32>;

@vertex
fn vs_main(@builtin(vertex_index) idx : u32) -> VSOut {
    // fullscreen triangle
    let corners = array<vec2<f32>,3>(
        vec2<f32>(-1.0, -1.0),
        vec2<f32>( 3.0, -1.0),
        vec2<f32>(-1.0,  3.0)
    );
    let uv = corners[idx];

    var out : VSOut;
    out.pos = vec4<f32>(uv, 0.0, 1.0);

    // unproject clip → world direction
    let clip = vec4<f32>(uv, 1.0, 1.0);
    let worldPos = (u_invVP * clip).xyz;

    let d = normalize(worldPos);
    // swap Y and Z:
    out.dir = vec3(d.x, d.z, d.y);

  return out;
}
