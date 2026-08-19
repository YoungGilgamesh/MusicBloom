/**
 * shaders.js — mood-driven particle cloud (instanced cubes or GLB models).
 *
 * Position comes entirely from the GPGPU sim texture (uSimPos), fetched per
 * instance via aParticleId. Each instance is oriented so its local +Z axis aligns
 * with the local flow (instSampleVel), so elongated models point along the stream.
 *
 * aParticleId = global particle index → sim-texture lookup. Needed because the
 *               instances may be split across several meshes (one per GLB model),
 *               so gl_InstanceID is only local to each mesh.
 * aPhase      = normalised travel / field phase [0→1] (0 = bright core, 1 = dim tip)
 * aSize       = per-particle random base size
 * color       = vertex color (from the GLB; the box fallback is white)
 * aMorphOpen  = shape-key "Open" relative deltas (bloom with birth/death fade)
 * uElongation = stretch factor along the instance's local +Z axis
 */

import {
  CLOUD_COUNT,
  CUBE_SCALE,
} from '../config.js';
import { INSTANCE_GLSL } from './instanceTransform.glsl.js';
import { BEAT_GLSL } from './beatField.glsl.js';
import { TONE_MAP_GLSL } from '../render/toneMap.glsl.js';
import { PAINT_COLOR_GLSL } from './paintField.glsl.js';

export const vertexShader = /* glsl */ `
  #define CLOUD_COUNT       ${CLOUD_COUNT}
  #define CUBE_SCALE        ${CUBE_SCALE.toFixed(5)}

  attribute float aParticleId;  // global particle index (→ sim-texture lookup)
  attribute float aPhase;       // streamline T [0,1]
  attribute float aSize;        // raw per-particle random [0,1] (→ power-law grain)
  attribute vec3  color;        // per-vertex color (GLB); box fallback = white
  // Shape-key "Open" deltas (relative); zero for box / models without morphs.
  attribute vec3  aMorphOpen;
  attribute vec3  aMorphOpenNormal;
  // Packed instance data (1 attr slot — WebGL max is tight with InstancedMesh mat4):
  //   x = useMap, y = useMarble, z = deform (0/1/2), w = hueOff (type colour role)
  attribute vec4 aMeshData;

  uniform float uTime;
  uniform float uPointSize;
  uniform float uAudioTreble;   // treble → per-cube size pulse (set by audio system)
  uniform float uAudioSizeGain; // master gain on the audio size shimmer/pop (was AUDIO_TREBLE_SIZE)
  // Sparse → full spawn ramp (cover→game transition). 1 = normal (all visible).
  // Each particle reveals at its own hashed threshold (see revealHash below) so
  // particles pop in scattered across the ramp instead of all at once.
  uniform float uSpawnFrac;
  // Real-seconds versions of the same ramp — see createQuantumCloud.js's
  // uSpawnElapsed comment for why: each particle's reveal INSTANT is spread
  // over uSpawnRampTime seconds (population growth rate), but its own
  // individual fade-in always takes exactly uSpawnFadeDur seconds regardless
  // of when it starts, so widening/narrowing one doesn't affect the other.
  uniform float uSpawnElapsed;
  uniform float uSpawnRampTime;
  uniform float uSpawnFadeDur;
  // Whole-cloud fade-in multiplier (separate from uSpawnFrac's per-particle
  // density reveal above) — every visible particle's alpha is additionally
  // scaled by this, so during the transition the cloud fades up from black in
  // lockstep with the BG instead of each revealed particle popping in at full
  // brightness. 1 = off (normal gameplay).
  uniform float uGlobalFadeIn;
  // Hides the whole cloud while a shape-change's velocity bake is pending —
  // see createQuantumCloud.js's uFlowReady comment. 1 = off (normal).
  uniform float uFlowReady;
  uniform float uElongation;
  uniform float uPetalWaveAmt;
  uniform float uTriFoldAmt;

  // ── Size model (random power-law grain × streamline taper × mood breathing) ──
  uniform float uSizeMin;       // grain band floor
  uniform float uSizeRange;     // grain band width (max - min)
  uniform float uSizePow;       // power-law exponent (>1 = many small, few large)
  uniform float uTipScale;      // structural taper: tip size as a fraction of root
  uniform float uSizeFloor;     // anti-vanish clamp on grain × taper
  uniform float uSizeMoodScale; // expressive: overall size from the live mood

  // ── GPGPU sim state ────────────────────────────────────────────────────────
  uniform sampler2D uSimPos;     // xyz = position, w = age
  uniform sampler2D uSimCell;    // xyz = lattice cell the particle belongs to
  uniform vec2      uSimRes;     // sim texture resolution (w, h)
  uniform float     uSimW;       // sim texture width (for instanceID → uv)
  uniform vec3      uCamPos;     // camera world position (kill / fade)
  uniform vec3      uCamFwd;     // camera look direction (for forward-biased fade)
  uniform float     uKillRadius; // respawn distance from camera
  uniform float     uBehindFrac; // behind reach as a fraction of the front reach (<1 = forward-biased)
  uniform float     uNearFade;   // fade meshes out closer than this (0 = off)
  uniform float     uBirthTime;  // seconds of alpha fade-in
  uniform float     uDeathTime;  // seconds of alpha fade-out before respawn
  uniform float     uMorphBirthTime; // shape-key Open fade-in (longer than alpha)
  uniform float     uMorphDeathTime; // shape-key Open fade-out
  uniform float     uSpinRate;   // per-particle spin about the flow axis (rad/sec)

  // Baked mood velocity volume + per-instance transform params (see INSTANCE_GLSL).
  uniform highp sampler3D uVelVolume;
  uniform float           uVolHalf;
  uniform float uInstPeriod;
  uniform float uInstJitter;
  uniform float uScaleMin;
  uniform float uScaleMax;

  out vec3  vViewPos;
  out vec3  vNormalView; // view-space normal (fresnel)
  out vec3  vLocalPos;   // model-space pos (marble noise domain)
  out vec3  vWorldPos;   // particle center — paint-ink stain lookup
  out vec3  vColor;   // per-vertex color passed to the fragment shader
  out vec2  vUv;
  out float vPhase;   // 0 = at soma (bright), 1 = at tip (dim)
  out float vFade;    // birth / far-distance alpha envelope [0,1]
  out float vSeed;    // per-particle seed for marble variation
  flat out float vUseMap;
  flat out float vUseMarble;
  flat out float vHueOff;

  ${INSTANCE_GLSL}
  ${BEAT_GLSL}

  // Integer (Wang) hash -- exact regardless of magnitude, unlike a sin()-based
  // hash whose float32 argument-reduction precision collapses once i gets
  // into the thousands (this clouds particle-id range), which was clumping
  // many particles onto nearly the same reveal threshold -- they popped in as
  // visible batches instead of one-by-one, smoothly, across the spawn ramp.
  float revealHash(float i) {
    uint n = uint(i);
    n = (n ^ 61u) ^ (n >> 16u);
    n *= 9u;
    n = n ^ (n >> 4u);
    n *= 0x27d4eb2du;
    n = n ^ (n >> 15u);
    return float(n) * (1.0 / 4294967296.0);
  }

  void main() {
    // ── Fetch simulated position + age from the GPGPU state texture ──────────
    float fi    = aParticleId;
    vec2  simUV = (vec2(mod(fi, uSimW), floor(fi / uSimW)) + 0.5) / uSimRes;
    vec4  sp    = texture(uSimPos, simUV);
    vec3  p     = sp.xyz;
    float age   = sp.w;
    vec4  cellData = texture(uSimCell, simUV);
    vec3  cell  = cellData.xyz;
    float life  = cellData.w;   // per-particle lifetime (from the sim; 0 until seeded)

    // ── Birth fade-in + death fade-out + fade near the kill radius ───────────
    // Computed early so shape-key "Open" shares the same envelope (bloom open on
    // appear, close before fade-out / recycle).
    float birth   = smoothstep(0.0, uBirthTime, age);
    float dCam    = distance(p, uCamPos);
    // Forward-biased far fade: squash the visible bubble along the look axis. Ahead
    // (s→1) keeps the full kill-radius reach so the next cloud appears early; behind
    // (s→0) the reach shrinks to uBehindFrac·kill so the passed cloud clears fast.
    float s       = 0.5 * (dot(normalize(p - uCamPos + vec3(1e-6)), uCamFwd) + 1.0);
    float reach   = uKillRadius * mix(uBehindFrac, 1.0, s);
    float farFade = 1.0 - smoothstep(reach * 0.78, reach, dCam);
    // Near fade: a mesh right in front of the camera balloons across the view — fade it
    // out below uNearFade (fully gone at uNearFade, back by ~2×). 0 disables it.
    float nearFade = uNearFade > 0.0 ? smoothstep(uNearFade, uNearFade * 2.0, dCam) : 1.0;
    // Ease the last uDeathTime of life so lifetime-expiry respawns don't pop.
    float death   = life > 0.001 ? 1.0 - smoothstep(life - uDeathTime, life, age) : 1.0;
    // Sparse→full spawn ramp: each particle gets a random "reveal instant"
    // spread evenly across uSpawnRampTime seconds (population growth rate is
    // exactly linear over that time), then fades in over a FIXED uSpawnFadeDur
    // seconds from that instant — decoupled from the population spread, so
    // this reads as a steady, gradual sparse→full fill rather than either a
    // hard pop (duration too short) or the whole cloud appearing together
    // (duration coupled to spread, so widening one sped up the other).
    // Hard-gated at exactly uSpawnFrac<=0 so nothing leaks during the
    // cover→game transition's black-screen hold (before the ramp starts).
    float revealAt   = revealHash(fi) * uSpawnRampTime;      // this particle's reveal instant (seconds)
    float timeSince  = uSpawnElapsed - revealAt;              // seconds since that instant (can be negative)
    float spawnFade  = smoothstep(0.0, uSpawnFadeDur, timeSince) * step(0.0001, uSpawnFrac);
    vFade = birth * farFade * death * nearFade * spawnFade * uGlobalFadeIn * uFlowReady;
    // Shape-key slider: 0 = Close (basis), 1 = Open — longer ease than alpha dissolve.
    float morphBirth = smoothstep(0.0, uMorphBirthTime, age);
    float morphDeath = life > 0.001
      ? 1.0 - smoothstep(life - uMorphDeathTime, life, age)
      : 1.0;
    float openAmt = morphBirth * morphDeath * farFade * nearFade;

    // Phase B: cluster-local beat punch. Offset only the RENDERED center (fades/orientation
    // below stay on the true rest position p, so they don't jitter with the beat).
    vec3 displaced = p + beatDisplace(p);

    // ── Orient the mesh's local +Z along the flow, with a per-particle frame ──
    vec3 rseed = vec3(simUV, 0.31);
    vec3  vel   = instSampleVel(p, cell);
    float speed = length(vel);
    vec3  pdir  = normalize(instHash33(rseed + 2.9) * 2.0 - 1.0 + vec3(1e-4));
    vec3  flow  = normalize(mix(pdir, vel, smoothstep(0.0, 0.15, speed)) + vec3(1e-5));

    vec3 ref   = normalize(instHash33(rseed + 1.3) * 2.0 - 1.0 + vec3(1e-4));
    vec3 rgt   = cross(ref, flow);
    float rl   = length(rgt);
    rgt        = rl > 1e-3 ? rgt / rl : normalize(cross(vec3(0.37, 1.0, 0.21), flow));
    vec3 up    = cross(flow, rgt);

    float spinPhase = mod(uTime * uSpinRate * (0.4 + 0.8 * instHash33(rseed + 9.1).y), 6.2831853);
    float roll = instHash33(rseed + 5.7).x * 6.2831853 + spinPhase;
    float cs = cos(roll), sn = sin(roll);
    vec3  r2 =  cs * rgt + sn * up;
    vec3  u2 = -sn * rgt + cs * up;
    mat3 orient = mat3(r2, u2, flow);

    // ── Particle size: random grain × structural taper × expressive mood ──────
    float grain    = uSizeMin + uSizeRange * pow(aSize, uSizePow);
    float taper    = mix(1.0, uTipScale, aPhase);
    float base     = max(grain * taper, uSizeFloor);
    float baseSize = base * uSizeMoodScale
                   * (1.0 + uAudioTreble * uAudioSizeGain)
                   * CUBE_SCALE * uPointSize;
    // Morph in model space (Close→Open), then light type-specific deform, then scale.
    vec3  shaped   = position + aMorphOpen * openAmt;
    float dSeed    = fract(fi * 0.61803398875 + aPhase * 0.37);

    float aDeform = aMeshData.z;
    // 1 = triangle shard fold (broken-glass tip). 2 = petal flutter (no shape key).
    if (aDeform > 1.5) {
      // Petal wave: two sines, tip-weighted along +Z (streamwise length).
      float tip = smoothstep(-0.15, 0.85, shaped.z);
      float w1 = sin(uTime * 2.15 + dSeed * 6.2831853 + shaped.z * 3.2);
      float w2 = sin(uTime * 3.05 + dSeed * 4.7 + shaped.x * 2.4) * 0.45;
      float wave = (w1 + w2) * uPetalWaveAmt * tip;
      shaped.y += wave;
      shaped.x += wave * 0.32;
    } else if (aDeform > 0.5) {
      // Triangle fold: rotate the +side of a seeded plane a little (glass shard).
      vec3 axis = normalize(vec3(dSeed * 2.0 - 1.0, 0.35, fract(dSeed * 5.3) * 2.0 - 1.0) + vec3(1e-4));
      float side = dot(shaped, axis);
      float ang = uTriFoldAmt * (0.55 + 0.45 * sin(uTime * 1.35 + dSeed * 6.2831853));
      // Only fold one half so it reads as a crack/fold, not a wobble.
      float doFold = step(0.0, side);
      ang *= doFold;
      float ca = cos(ang), sa = sin(ang);
      shaped = shaped * ca + cross(axis, shaped) * sa + axis * dot(axis, shaped) * (1.0 - ca);
    }

    vec3  localPos = shaped * vec3(baseSize, baseSize, baseSize * uElongation);
    vec3  worldVertex = displaced + orient * localPos;

    // Normal: morph delta + orient into view space (for cheap fresnel).
    vec3 shapedN = normalize(normal + aMorphOpenNormal * openAmt);
    vec3 worldN  = normalize(orient * shapedN);

    vViewPos    = (modelViewMatrix * vec4(worldVertex, 1.0)).xyz;
    vNormalView = normalize((modelViewMatrix * vec4(worldN, 0.0)).xyz);
    vLocalPos   = shaped; // stick marble veins to the mesh
    vWorldPos   = displaced; // ink from the instance center (whole mesh tints together)
    vColor      = color;
    vUv         = uv;
    vPhase      = aPhase;
    vSeed       = fract(fi * 0.61803398875);
    vUseMap     = aMeshData.x;
    vUseMarble  = aMeshData.y;
    vHueOff     = aMeshData.w;
    gl_Position = projectionMatrix * vec4(vViewPos, 1.0);
  }
`;

export const fragmentShader = /* glsl */ `
  uniform float uFogNear;   // opaque within this camera distance
  uniform float uFogFar;    // fully transparent by here
  uniform sampler2D uMap;
  uniform float uUseMap;       // 1 = a map is bound (global); gated by vUseMap
  uniform float uEmissive;     // self-lit strength
  uniform float uVertColorAmt; // 0 = ignore vColor, 1 = full vColor × map
  uniform float uMoodColorAmt; // 0 = VC only, 1 = full VC × moodRgb overlay
  uniform float uMarble;       // 1 = marble path available in this mix
  uniform float uMarbleScale;
  uniform float uMarbleWarp;
  uniform float uMarbleVein;
  uniform float uMarbleFresnel;
  uniform float uMarbleFresnelPow;
  uniform vec3  uColorHSL;     // mood tint (trails + mesh overlay / marble)

  ${PAINT_COLOR_GLSL}

  in vec3  vViewPos;
  in vec3  vNormalView;
  in vec3  vLocalPos;
  in vec3  vWorldPos;
  in vec3  vColor;
  in vec2  vUv;
  in float vPhase;
  in float vFade;
  in float vSeed;
  flat in float vUseMap;
  flat in float vUseMarble;
  flat in float vHueOff;
  out vec4 fragColor;

  ${TONE_MAP_GLSL}

  float mHash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float mNoise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(mHash(i + vec3(0,0,0)), mHash(i + vec3(1,0,0)), f.x),
          mix(mHash(i + vec3(0,1,0)), mHash(i + vec3(1,1,0)), f.x), f.y),
      mix(mix(mHash(i + vec3(0,0,1)), mHash(i + vec3(1,0,1)), f.x),
          mix(mHash(i + vec3(0,1,1)), mHash(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
  // 3 octaves — cheap enough at high instance counts.
  float mFbm(vec3 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 3; i++) {
      v += a * mNoise(p);
      p = p * 2.02 + 17.3;
      a *= 0.5;
    }
    return v;
  }

  vec3 hsl2rgb(vec3 c) {
    vec3 rgb = clamp(abs(mod(c.x * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
    return c.z + c.y * (rgb - 0.5) * (1.0 - abs(2.0 * c.z - 1.0));
  }

  void main() {
    vec3 vertMul = mix(vec3(1.0), vColor, clamp(uVertColorAmt, 0.0, 1.0));
    vec3 emit = vertMul;
    if (uUseMap > 0.5 && vUseMap > 0.5) emit *= texture(uMap, vUv).rgb;

    bool marble = (uMarble > 0.5 && vUseMarble > 0.5);
    if (marble) {
      // Object-space warped fbm → marble veins; per-particle seed so instances differ.
      vec3 p = vLocalPos * uMarbleScale + vec3(vSeed * 19.7, vSeed * 7.3, vSeed * 3.1);
      vec3 q = p + uMarbleWarp * (vec3(mFbm(p), mFbm(p + 31.2), mFbm(p - 17.8)) * 2.0 - 1.0);
      float n = mFbm(q);
      // Sharp dark veins through a lighter body.
      float veins = 1.0 - smoothstep(0.0, mix(0.55, 0.12, uMarbleVein), abs(n * 2.0 - 1.0));
      veins = pow(clamp(veins, 0.0, 1.0), mix(1.8, 0.65, uMarbleVein));

      // Mood-driven body / veins (marble GLB has no vertex colour — was reading as white).
      vec3 moodHsl = applyPaintInk(
        vec3(fract(uColorHSL.x + vHueOff + (vSeed - 0.5) * 0.04 + 1.0), uColorHSL.y, uColorHSL.z),
        vWorldPos);
      float hue = moodHsl.x;
      float sat = clamp(moodHsl.y * 0.85, 0.15, 1.0);
      vec3 body   = hsl2rgb(vec3(hue, sat * 0.55, clamp(moodHsl.z * 0.72 + 0.12, 0.18, 0.55)));
      vec3 veinCol = hsl2rgb(vec3(fract(hue + 0.03), clamp(sat * 1.05, 0.0, 1.0), clamp(moodHsl.z * 0.28, 0.06, 0.28)));
      // Soft stone base under the mood tint so it doesn't go neon-flat.
      vec3 stone = vec3(0.55, 0.56, 0.58);
      body = mix(stone * body, body, 0.72);
      emit = mix(body, veinCol, veins);

      // Soft glass rim — tinted, not chalk white.
      vec3 N = normalize(vNormalView);
      vec3 V = normalize(-vViewPos);
      float fres = pow(1.0 - clamp(abs(dot(N, V)), 0.0, 1.0), uMarbleFresnelPow);
      emit += body * fres * uMarbleFresnel * 0.85;
    } else {
      // Mood colour overlay × vertex colour (type role via vHueOff; drifts with trails).
      vec3 moodHsl = applyPaintInk(
        vec3(fract(uColorHSL.x + vHueOff + 1.0), uColorHSL.y, uColorHSL.z),
        vWorldPos);
      vec3 moodRgb = hsl2rgb(moodHsl);
      emit = mix(emit, emit * moodRgb, clamp(uMoodColorAmt, 0.0, 1.0));
    }

    float tip = 1.0 - vPhase * 0.18;
    // Marble already carries its own lit range — don't multiply by the high mesh emissive.
    float em = marble ? mix(1.0, uEmissive, 0.15) : uEmissive;
    vec3 color = emit * em * tip;

    float dist  = length(vViewPos);
    float fog   = 1.0 - smoothstep(uFogNear, uFogFar, dist);
    float a     = fog * vFade;

    float dither = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
    if (a < dither) discard;

    fragColor = vec4(applyOutputToneMap(color), 1.0);
  }
`;
