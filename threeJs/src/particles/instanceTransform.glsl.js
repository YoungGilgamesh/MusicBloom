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
  // ── Living-field domain warp (slow global evolution) ───────────────────────
  // Declared here so BOTH includers (sim advection + mesh render orientation) share one
  // living field. The including material must supply these uniform objects (0 = frozen).
  uniform float uFieldWarpAmt;    // world-unit displacement of the sample coordinate
  uniform float uFieldWarpFreq;   // spatial scale of the warp noise (low = big smooth swells)
  uniform float uFieldWarpRate;   // temporal drift speed (time = extra noise dimension)
  uniform float uFieldWarpTime;   // elapsed seconds (written each frame)

  // Cheap value noise (uniquely named — paintField.glsl.js also defines pkNoise/curlNoise
  // and BOTH are included in the sim shader, so these must NOT collide).
  float iwHash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float iwNoise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(iwHash(i + vec3(0,0,0)), iwHash(i + vec3(1,0,0)), f.x),
                   mix(iwHash(i + vec3(0,1,0)), iwHash(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(iwHash(i + vec3(0,0,1)), iwHash(i + vec3(1,0,1)), f.x),
                   mix(iwHash(i + vec3(0,1,1)), iwHash(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
  // A slowly-drifting, low-frequency vector displacement seeded by WORLD position (so the
  // warp is globally coherent + non-repeating, not per-tile). Time drifts the noise domain →
  // the field morphs continuously. 0 amplitude → returns 0 (exact old behaviour).
  vec3 iwFieldWarp(vec3 world) {
    if (uFieldWarpAmt <= 0.0) return vec3(0.0);
    vec3 q  = world * uFieldWarpFreq;
    float t = uFieldWarpTime * uFieldWarpRate;
    vec3 w = vec3(
      iwNoise(q + vec3(  0.0,  0.0,  0.0) + t),
      iwNoise(q + vec3( 17.3,  5.1,  9.2) + t * 1.13),
      iwNoise(q + vec3( -8.2, 23.7,  4.9) + t * 0.87)
    ) * 2.0 - 1.0;
    return w * uFieldWarpAmt;
  }

  // Per-particle float hash (sin-based). GPU-only (orientation roll/ref in the
  // render shader); NOT used for the cell transforms, so its cross-precision
  // drift doesn't matter and it needs no CPU counterpart.
  vec3 instHash33(vec3 p) {
    p = vec3(dot(p, vec3(127.1, 311.7,  74.7)),
             dot(p, vec3(269.5, 183.3, 246.1)),
             dot(p, vec3(113.5, 271.9, 124.6)));
    return fract(sin(p) * 43758.5453123);
  }

  // ── Per-cell integer hash (lowbias32) — CPU/GPU bit-identical ──────────────
  // The cell transforms (rot/mirror/scale/origin) MUST match between the GPU sim
  // and CPU readers (frameCloud.js), or trails land on differently-placed tiles.
  // sin() isn't reproducible across GPU/CPU, so cell randomness uses this
  // integer hash instead (identical via Math.imul/>>> in JS). One salt per purpose.
  // Requires highp int/uint precision in the including shader.
  uint instU(uint x) {
    x ^= x >> 16u;
    x *= 0x7feb352du;
    x ^= x >> 15u;
    x *= 0x846ca68bu;
    x ^= x >> 16u;
    return x;
  }
  float instU2F(uint h) { return float(h >> 8u) * (1.0 / 16777216.0); }  // [0,1)
  vec3 instCellRand(vec3 c, uint salt) {
    ivec3 ic = ivec3(floor(c + 0.5));
    uint h = salt * 0x9e3779b9u;
    h = instU(h ^ uint(ic.x));
    h = instU(h ^ uint(ic.y));
    h = instU(h ^ uint(ic.z));
    uint h1 = instU(h);
    uint h2 = instU(h1);
    return vec3(instU2F(h), instU2F(h1), instU2F(h2));
  }

  mat3 instRot(vec3 c) {
    vec3  axis = normalize(instCellRand(c, 1u) * 2.0 - 1.0 + vec3(1e-4));
    float ang  = instCellRand(c, 2u).x * 6.2831853;
    float s = sin(ang), co = cos(ang), t = 1.0 - co;
    float x = axis.x, y = axis.y, z = axis.z;
    return mat3(
      t*x*x + co,   t*x*y + s*z,  t*x*z - s*y,
      t*x*y - s*z,  t*y*y + co,   t*y*z + s*x,
      t*x*z + s*y,  t*y*z - s*x,  t*z*z + co
    );
  }

  vec3  instMirror(vec3 c) { return step(0.5, instCellRand(c, 3u)) * 2.0 - 1.0; }  // ±1 per axis
  float instScale (vec3 c) { return mix(uScaleMin, uScaleMax, instCellRand(c, 4u).y); }
  vec3  instOrigin(vec3 c) {
    vec3 j = (instCellRand(c, 5u) * 2.0 - 1.0) * uInstJitter * uInstPeriod;
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
    // Living field: nudge the WORLD point by a slow animated warp BEFORE folding it into the
    // tile's local frame, so the streamlines morph continuously (the whole cloud breathes)
    // instead of being a frozen baked portrait. Amt = 0 → warped == world (old behaviour).
    vec3 wp  = world + iwFieldWarp(world);
    vec3 loc = instToLocal(wp, c);
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
