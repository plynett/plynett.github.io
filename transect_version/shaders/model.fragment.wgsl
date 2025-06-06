// box_facecolor.frag.wgsl

@fragment
fn fs_main(
  @location(0) localPos : vec3<f32>
) -> @location(0) vec4<f32> {
  let lp = localPos;
  let ax = abs(lp.x);
  let ay = abs(lp.y);
  let az = abs(lp.z);

  var gray: f32;

  // X‐faces
  if (ax >= ay && ax >= az) {
    // +X
    gray = select(0.6, 0.8, lp.x > 0.0);
  }
  // Y‐faces
  else if (ay >= ax && ay >= az) {
    // +Y
    gray = select(0.2, 0.4, lp.y > 0.0);
  }
  // Z‐faces
  else {
    // +Z
    gray = select(0.0, 1.0, lp.z > 0.0);
  }

  return vec4<f32>(vec3<f32>(gray), 1.0);
}
