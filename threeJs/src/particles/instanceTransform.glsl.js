/**
 * instanceTransform.glsl.js — shared GLSL3 snippet for the world-anchored,
 * per-instance varied tiling. Injected into BOTH the sim advection shader
 * (particleSim.js) and the render/orientation shader (shaders.js) so the two
 * agree exactly on where each tiled copy of the shape sits and how it flows.
 *
 * The shape is stamped on an infinite integer lattice. Each cell `c` gets a
 * deterministic transform from a hash of `c`:
 *     world = origin(c) + scale(c) * Rot(c) * Mirror(c) * localShapePoint
 * Because the transform is a pure function of the (world-fixed) cell index, a
 * place looks identical every time you return to it — which is what keeps a
 * future paint layer consistent.
 *
 * Requires these uniforms to be declared by the including shader:
 *     uniform float uInstPeriod;   // lattice spacing
 *     uniform float uInstJitter;   // cell-origin jitter (fraction of period)
 *     uniform float uScaleMin;
 *     uniform float uScaleMax;
 *     uniform highp sampler3D uVelVolume;
 *     uniform float uVolHalf;
 */
export const INSTANCE_GLSL = /* glsl */ `
  vec3 instHash33(vec3 p) {
    p = vec3(dot(p, vec3(127.1, 311.7,  74.7)),
             dot(p, vec3(269.5, 183.3, 246.1)),
             dot(p, vec3(113.5, 271.9, 124.6)));
    return fract(sin(p) * 43758.5453123);
  }

  mat3 instRot(vec3 c) {
    vec3  axis = normalize(instHash33(c + 3.17) * 2.0 - 1.0 + vec3(1e-4));
    float ang  = instHash33(c + 7.51).x * 6.2831853;
    float s = sin(ang), co = cos(ang), t = 1.0 - co;
    float x = axis.x, y = axis.y, z = axis.z;
    return mat3(
      t*x*x + co,   t*x*y + s*z,  t*x*z - s*y,
      t*x*y - s*z,  t*y*y + co,   t*y*z + s*x,
      t*x*z + s*y,  t*y*z - s*x,  t*z*z + co
    );
  }

  vec3  instMirror(vec3 c) { return step(0.5, instHash33(c + 13.7)) * 2.0 - 1.0; }  // ±1 per axis
  float instScale (vec3 c) { return mix(uScaleMin, uScaleMax, instHash33(c + 21.3).y); }
  vec3  instOrigin(vec3 c) {
    vec3 j = (instHash33(c + 31.9) * 2.0 - 1.0) * uInstJitter * uInstPeriod;
    return c * uInstPeriod + j;
  }

  // shape-local point → world
  vec3 instToWorld(vec3 local, vec3 c) {
    return instOrigin(c) + instScale(c) * (instRot(c) * (instMirror(c) * local));
  }
  // world point → shape-local (exact inverse; mirror is its own inverse)
  vec3 instToLocal(vec3 world, vec3 c) {
    vec3 p = (world - instOrigin(c)) / instScale(c);
    p = transpose(instRot(c)) * p;
    return p * instMirror(c);
  }

  // Local field velocity sampled from the baked volume, rotated into world space.
  // (Scale is dropped: we only care about flow direction/relative magnitude.)
  vec3 instSampleVel(vec3 world, vec3 c) {
    vec3 loc = instToLocal(world, c);
    vec3 uvw = (loc + uVolHalf) / (2.0 * uVolHalf);
    vec3 vloc = texture(uVelVolume, uvw).xyz;
    return instRot(c) * (instMirror(c) * vloc);
  }

  // Nearest tiled copy of the seed to the camera, scanning the 3x3x3 cells
  // around it. Returns the world position and (via outCell) its cell.
  vec3 instRespawn(vec3 seed, vec3 camPos, out vec3 outCell) {
    vec3  base    = floor(camPos / uInstPeriod + 0.5);
    float best    = 1e18;
    vec3  bestPos = camPos;
    vec3  bestCell = base;
    for (int dx = -1; dx <= 1; dx++)
    for (int dy = -1; dy <= 1; dy++)
    for (int dz = -1; dz <= 1; dz++) {
      vec3 c  = base + vec3(float(dx), float(dy), float(dz));
      vec3 wp = instToWorld(seed, c);
      float d = distance(wp, camPos);
      if (d < best) { best = d; bestPos = wp; bestCell = c; }
    }
    outCell = bestCell;
    return bestPos;
  }
`;
