// duck.vert.wgsl

struct Uniforms {
  viewProj   : mat4x4<f32>,  // bytes 0..63
  model      : mat4x4<f32>,  // bytes 64..127
  cameraPos  : vec3<f32>,    // bytes 128..139 (unused in VS)
  _pad       : f32          // bytes 140..143
};
@group(0) @binding(0) var<uniform> u : Uniforms;

struct VSOut {
  @builtin(position) Position    : vec4<f32>,
  @location(0)       worldPos    : vec3<f32>,
  @location(1)       worldNormal : vec3<f32>,
  @location(2)       uv          : vec2<f32>
};

@vertex
fn vs_main(
  @location(0) position : vec3<f32>,
  @location(1) normal   : vec3<f32>,
  @location(2) uv_in    : vec2<f32>
) -> VSOut {
  var o : VSOut;

  // 1) swap Y/Z so the model stands upright
  let localPos    = vec3<f32>(position.x, position.z, position.y);
  let localNormal = vec3<f32>(normal.x,   normal.z,   normal.y);

  // 2) world‐space position
  let worldPos4   = u.model * vec4<f32>(localPos, 1.0);
  o.worldPos      = worldPos4.xyz;

  // 3) world‐space normal (ignore translation)
  o.worldNormal   = normalize((u.model * vec4<f32>(localNormal, 0.0)).xyz);

  // 4) pass UV through
  o.uv            = uv_in;

  // 5) project to clip space
  o.Position      = u.viewProj * worldPos4;

  return o;
}

