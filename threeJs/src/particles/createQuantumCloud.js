/**
 * createQuantumCloud.js — orchestrator for the mood-driven particle cloud.
 *
 * The generative field system lives in ./fields/ (see combine.js). This file:
 *   • builds the shared ShaderMaterial + uniforms
 *   • builds the render cloud as a THREE.Group of InstancedMesh(es):
 *       - box mode  → 1 mesh (BoxGeometry, white vertex color)
 *       - model mode→ N meshes, one per GLB geometry, each rendering a random
 *         subset of particles (see setCloudGeometries + particleModels.js)
 *     All meshes SHARE one material, so a single uniform write drives them all.
 *   • re-samples the cloud in place on mood changes (resampleAll6)
 *
 * Positions come from the GPGPU sim texture (per instance, via the aParticleId
 * attribute), so the instance matrix is unused — we never call setMatrixAt.
 *
 * Per-instance attributes written by the sampler:
 *   aParticleId = global particle index (→ sim-texture lookup)
 *   aPhase      = normalised travel / field phase [0→1] (brightness gradient)
 *   aSize       = particle size
 */

import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { vertexShader, fragmentShader } from './shaders.js';
import { sampleAll6Cloud } from './fields/combine.js';
import { seededRng } from './fields/shared.js';
import {
  CLOUD_COUNT,
  POINT_SIZE,
  SIM_KILL_RADIUS,
  CLOUD_BEHIND_FRAC,
  MESH_NEAR_FADE,
  MESH_FOG_NEAR,
  MESH_FOG_FAR,
  SIM_BIRTH_TIME,
  SIM_DEATH_TIME,
  MESH_MORPH_BIRTH_TIME,
  MESH_MORPH_DEATH_TIME,
  MESH_EMISSIVE,
  MESH_VERTEX_COLOR_AMT,
  MESH_MARBLE_ENABLED,
  MESH_MARBLE_SCALE,
  MESH_MARBLE_WARP,
  MESH_MARBLE_VEIN,
  MESH_MARBLE_FRESNEL,
  MESH_MARBLE_FRESNEL_POW,
  TONE_MAPPING_EXPOSURE,
  PARTICLE_SPIN_RATE,
  SIM_VOL_HALF,
  SIM_INST_PERIOD,
  SIM_INST_JITTER,
  SIM_INST_SCALE_MIN,
  SIM_INST_SCALE_MAX,
  PARTICLE_SIZE_MIN,
  PARTICLE_SIZE_MAX,
  PARTICLE_SIZE_POW,
  PARTICLE_TIP_SCALE,
  PARTICLE_SIZE_FLOOR,
  MODEL_SCALES,
  MESH_MOOD_COLOR_AMT,
  MESH_MAJOR_HUE_JITTER,
  MESH_ACCENT_HUE_SHIFT,
  MESH_ACCENT_B_HUE_SHIFT,
  MESH_ACCENT_HUE_JITTER,
  MESH_PETAL_WAVE_AMT,
  MESH_TRI_FOLD_AMT,
  FIELD_WARP_AMOUNT,
  FIELD_WARP_FREQ,
  FIELD_WARP_RATE,
  BEAT_DISPLACE_AMT,
  BEAT_DISPLACE_FREQ,
  BEAT_FIELD_DRIFT,
  AUDIO_TREBLE_SIZE,
  TRANSITION_SPAWN_RAMP_TIME,
  TRANSITION_SPAWN_FADE_DUR,
  BLOOM_MAX_ACTIVE,
  TRAIL_PAINT_COLOR_AMT,
} from '../config.js';

// Default warp chain at init (all params = 0.5 → energy & brightness are top-2).
const DEFAULT_WARP_ORDER = ['energy', 'brightness'];

// ── Material ──────────────────────────────────────────────────────────────────
function buildMaterial(pointSize) {
  const uniforms = {
    uTime: { value: 0 },
    uPointSize: { value: pointSize },
    uAudioTreble: { value: 0 },   // treble → size pulse (wired by the audio system)
    uAudioSizeGain: { value: AUDIO_TREBLE_SIZE },  // master gain on the audio size shimmer (live slider)
    // Sparse → full spawn ramp (cover-page → gameplay transition). 0 = no particles
    // visible, 1 = full density (normal). Each particle reveals at a random point
    // along the ramp (hashed from aParticleId in shaders.js) so they pop in
    // scattered rather than all-at-once or in index order. Default 1 = off (normal
    // gameplay reshapes are unaffected; main.js only ramps this during the
    // cover→game transition).
    uSpawnFrac: { value: 1.0 },
    // Real-seconds versions of the same ramp, used to give each particle a
    // fixed-DURATION individual fade-in (TRANSITION_SPAWN_FADE_DUR) that's
    // decoupled from how many particles have started revealing — using the
    // normalized uSpawnFrac range directly for both would mean widening one
    // particle's fade window also speeds up how fast the whole population
    // starts appearing (that coupling was the "whole cloud pops in at once"
    // bug). uSpawnElapsed is written every frame in main.js; the other two
    // are constants set once here. Default value is past the full ramp+fade
    // window so normal gameplay (never touched by main.js) always renders
    // every particle at full spawnFade, not just the ones near revealAt=0.
    uSpawnElapsed: { value: TRANSITION_SPAWN_RAMP_TIME + TRANSITION_SPAWN_FADE_DUR },
    uSpawnRampTime: { value: TRANSITION_SPAWN_RAMP_TIME },
    uSpawnFadeDur: { value: TRANSITION_SPAWN_FADE_DUR },
    // Whole-cloud fade-in multiplier, separate from uSpawnFrac's per-particle
    // reveal ramp above: uSpawnFrac controls how many particles are visible
    // (density), while this controls how bright/opaque EVERY visible particle
    // is, so newly-revealed particles fade up from 0 instead of popping in at
    // full brightness. Driven in lockstep with the BG fade-in during the
    // cover→game transition (main.js); default 1 = off (normal gameplay).
    uGlobalFadeIn: { value: 1.0 },
    // Hides the whole cloud while a shape-change's velocity-volume bake is in
    // flight (main.js's pendingBakeJobId) — the new seed positions land
    // synchronously, well before the async worker bake finishes, so without
    // this the cloud would sit motionless (frozen, not flowing) at the new
    // shape for a few frames. Hiding it instead means it simply isn't visible
    // until the matching flow field is ready, then fades/pops in already
    // flowing correctly. Default 1 = visible (normal gameplay, no bake pending).
    uFlowReady: { value: 1.0 },
    uElongation: { value: 1.0 },
    // Size model — power-law grain × streamline taper × mood breathing (shaders.js).
    // Grain/tip from config; moodScale is written per frame in main.
    uSizeMin: { value: PARTICLE_SIZE_MIN },
    uSizeRange: { value: PARTICLE_SIZE_MAX - PARTICLE_SIZE_MIN },
    uSizePow: { value: PARTICLE_SIZE_POW },
    uTipScale: { value: PARTICLE_TIP_SCALE },
    uSizeFloor: { value: PARTICLE_SIZE_FLOOR },
    uSizeMoodScale: { value: 1.0 },
    // GPGPU sim state — uSimPos/uSimRes/uSimW are set by main.js after the
    // ParticleSim is created (their real sizes come from the sim instance).
    uSimPos: { value: null },
    uSimCell: { value: null },
    uSimRes: { value: new THREE.Vector2(1, 1) },
    uSimW: { value: 1 },
    uCamPos: { value: new THREE.Vector3() },
    uCamFwd: { value: new THREE.Vector3(0, 0, -1) },
    uKillRadius: { value: SIM_KILL_RADIUS },
    uBehindFrac: { value: CLOUD_BEHIND_FRAC },
    uNearFade: { value: MESH_NEAR_FADE },
    uFogNear: { value: MESH_FOG_NEAR },
    uFogFar: { value: MESH_FOG_FAR },
    uBirthTime: { value: SIM_BIRTH_TIME },
    uDeathTime: { value: SIM_DEATH_TIME },
    uMorphBirthTime: { value: MESH_MORPH_BIRTH_TIME },
    uMorphDeathTime: { value: MESH_MORPH_DEATH_TIME },
    uSpinRate: { value: PARTICLE_SPIN_RATE },
    // Baked mood velocity volume (set by main.js) + per-instance transform params.
    uVelVolume: { value: null },
    uVolHalf: { value: SIM_VOL_HALF },
    uInstPeriod: { value: SIM_INST_PERIOD },
    uInstJitter: { value: SIM_INST_JITTER },
    uScaleMin: { value: SIM_INST_SCALE_MIN },
    uScaleMax: { value: SIM_INST_SCALE_MAX },
    // Living base field warp — must match the sim so sprite orientation follows the same
    // morphing streamlines. uFieldWarpTime is written each frame in main.js (with uTime).
    uFieldWarpAmt: { value: FIELD_WARP_AMOUNT },
    uFieldWarpFreq: { value: FIELD_WARP_FREQ },
    uFieldWarpRate: { value: FIELD_WARP_RATE },
    uFieldWarpTime: { value: 0.0 },

    // Phase B: cluster-local beat displacement (shared with trails). uBeatPulse (beat
    // envelope) + uBeatTime (drift clock) are written each frame in main.js.
    uBeatAmt: { value: BEAT_DISPLACE_AMT },
    uBeatFreq: { value: BEAT_DISPLACE_FREQ },
    uBeatPulse: { value: 0.0 },
    uBeatTime: { value: 0.0 },
    uBeatDrift: { value: BEAT_FIELD_DRIFT },

    // Optional albedo map (e.g. flower_texture). uUseMap 0 = vertex color only.
    uMap: { value: null },
    uUseMap: { value: 0 },
    uEmissive: { value: MESH_EMISSIVE },
    uVertColorAmt: { value: MESH_VERTEX_COLOR_AMT },
    uMoodColorAmt: { value: MESH_MOOD_COLOR_AMT },
    uPetalWaveAmt: { value: MESH_PETAL_WAVE_AMT },
    uTriFoldAmt: { value: MESH_TRI_FOLD_AMT },
    uToneExposure: { value: TONE_MAPPING_EXPOSURE },
    // Cheap procedural marble (object-space fbm + fresnel). Global enable when
    // marble is in the mood mix; per-instance aUseMarble gates the FS path.
    uMarble: { value: MESH_MARBLE_ENABLED ? 1 : 0 },
    uMarbleScale: { value: MESH_MARBLE_SCALE },
    uMarbleWarp: { value: MESH_MARBLE_WARP },
    uMarbleVein: { value: MESH_MARBLE_VEIN },
    uMarbleFresnel: { value: MESH_MARBLE_FRESNEL },
    uMarbleFresnelPow: { value: MESH_MARBLE_FRESNEL_POW },
    uColorHSL: { value: new THREE.Vector3(0.55, 0.55, 0.42) },
    // Paint-ink stain (shared with particleSim in main.js syncMeshSimUniforms).
    uBloomCount: { value: 0 },
    uBloomA: { value: Array.from({ length: BLOOM_MAX_ACTIVE }, () => new THREE.Vector4()) },
    uBloomE: { value: Array.from({ length: BLOOM_MAX_ACTIVE }, () => new THREE.Vector4()) },
    uPaintColorAmt: { value: TRAIL_PAINT_COLOR_AMT },
  };

  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    glslVersion: THREE.GLSL3,
    // Manual ACES in FS (toneMap.glsl.js) — don't let Three re-grade.
    toneMapped: false,
    // Meshes are OPAQUE and write depth: they occlude each other (read solid) AND write a
    // depth buffer the trails test against (meshes in front hide trails behind them). Soft
    // fades are kept via a dithered screen-door discard in the fragment shader.
    transparent: false,
    depthWrite: true,
    depthTest: true,
    blending: THREE.NoBlending,
  });
}

// Ensure a geometry has a white `color` attribute if the source has none, so the
// (color-reading) shader works for the box fallback and any GLB lacking colors.
function ensureVertexColor(geometry) {
  if (geometry.getAttribute('color')) return;
  const n = geometry.getAttribute('position').count;
  const col = new Float32Array(n * 3).fill(1);
  geometry.setAttribute('color', new THREE.BufferAttribute(col, 3));
}

// Build one InstancedMesh rendering the given global particle `ids` with a copy of
// `baseGeometry`. Instanced attributes (aParticleId/aPhase/aSize) are sliced to ids.
// `scale` bakes a per-model size multiplier into the geometry (uniform, so normals
// stay valid); it stacks on top of the shader's grain/taper/mood size.
function ensureMorphAndUv(geometry) {
  const n = geometry.getAttribute('position').count;
  if (!geometry.getAttribute('aMorphOpen')) {
    geometry.setAttribute('aMorphOpen', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  }
  if (!geometry.getAttribute('aMorphOpenNormal')) {
    geometry.setAttribute('aMorphOpenNormal', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  }
  if (!geometry.getAttribute('uv')) {
    geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  }
}

function buildInstancedMesh(baseGeometry, material, ids, phases, sizes, scale = 1, flags = {}) {
  const useMap = flags.useMap ? 1 : 0;
  const useMarble = flags.useMarble ? 1 : 0;
  // 0 = none, 1 = triangle fold, 2 = petal wave (VS-only; see shaders.js).
  const deform = flags.deform ?? 0;
  // Per-instance hue offs (Float32Array length n), or a constant base + optional rng scatter.
  const hueOffs = flags.hueOffs;
  const hueBase = flags.hueBase ?? 0;
  const hueJitter = flags.hueJitter ?? 0;
  const hueRng = flags.hueRng;
  const geom = baseGeometry.clone();
  ensureMorphAndUv(geom);
  // Scale base + morph deltas together so Open bloom stays proportional.
  if (scale !== 1) {
    geom.scale(scale, scale, scale);
    const mo = geom.getAttribute('aMorphOpen');
    if (mo) {
      for (let i = 0; i < mo.array.length; i++) mo.array[i] *= scale;
      mo.needsUpdate = true;
    }
    // Morph normal deltas are directions — leave unscaled (normal matrix already baked).
  }
  ensureVertexColor(geom);
  if (!geom.getAttribute('normal')) geom.computeVertexNormals();

  const n = ids.length;
  const idArr = new Float32Array(n);
  const phaseArr = new Float32Array(n);
  const sizeArr = new Float32Array(n);
  // Packed: useMap, useMarble, deform, hueOff — one vec4 attr (WebGL attribute budget).
  const meshData = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const gid = ids[i];
    idArr[i] = gid;
    phaseArr[i] = phases[gid];
    sizeArr[i] = sizes[gid];
    let hue = 0;
    if (hueOffs) {
      hue = hueOffs[i];
    } else {
      const j = hueJitter > 0 && hueRng ? (hueRng() - 0.5) * 2 * hueJitter : 0;
      hue = hueBase + j;
    }
    const o = i * 4;
    meshData[o] = useMap;
    meshData[o + 1] = useMarble;
    meshData[o + 2] = deform;
    meshData[o + 3] = hue;
  }
  geom.setAttribute('aParticleId', new THREE.InstancedBufferAttribute(idArr, 1));
  geom.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phaseArr, 1));
  geom.setAttribute('aSize', new THREE.InstancedBufferAttribute(sizeArr, 1));
  geom.setAttribute('aMeshData', new THREE.InstancedBufferAttribute(meshData, 4));

  const mesh = new THREE.InstancedMesh(geom, material, n);
  mesh.frustumCulled = false;   // positions come from the sim; bounds are meaningless
  mesh.userData.ids = ids;     // global indices this mesh renders (for resample)
  return mesh;
}

// Rewrite a mesh's aPhase/aSize from the global arrays (used on resample).
function writeMeshAttributes(mesh, phases, sizes) {
  const ids = mesh.userData.ids;
  const phase = mesh.geometry.getAttribute('aPhase');
  const size = mesh.geometry.getAttribute('aSize');
  for (let i = 0; i < ids.length; i++) {
    phase.array[i] = phases[ids[i]];
    size.array[i] = sizes[ids[i]];
  }
  phase.needsUpdate = true;
  size.needsUpdate = true;
}

// ── Main export ───────────────────────────────────────────────────────────────
// Returns a THREE.Group ("cloud") with attached .material / .count / userData.
// In box mode it holds a single cube mesh; call setCloudGeometries() to swap to
// the GLB models once they've loaded.
export function createQuantumCloud({ count = CLOUD_COUNT, pointSize = POINT_SIZE, energy = 0.5, brightness = 0.5, texture = 0.5, heaviness = 0.5, dynamism = 0.5, bpm = 120 } = {}) {
  const { positions, phases, sizes } = sampleAll6Cloud(count, energy, brightness, texture, heaviness, dynamism, bpm, DEFAULT_WARP_ORDER);

  const material = buildMaterial(pointSize);

  const cloud = new THREE.Group();
  cloud.material = material;               // shared by every child mesh
  cloud.count = count;
  cloud.userData.seedPositions = positions;
  cloud.userData.phases = phases;
  cloud.userData.sizes = sizes;

  // Box fallback: a single mesh rendering all particles (ids 0..count-1).
  const boxGeom = mergeVertices(new THREE.BoxGeometry(1, 1, 1));
  const allIds = new Uint32Array(count);
  for (let i = 0; i < count; i++) allIds[i] = i;
  cloud.add(buildInstancedMesh(boxGeom, material, allIds, phases, sizes));

  return cloud;
}

// ── Swap the box for the loaded GLB model geometries ──────────────────────────
// Legacy flat list (pre mood-mix). Prefer applyMeshMix with a type cache.
export function setCloudGeometries(cloud, geometries) {
  const count = cloud.count;
  const phases = cloud.userData.phases;
  const sizes = cloud.userData.sizes;
  const nModels = geometries.length;
  const rng = seededRng(0xC10D);

  // Random model index per particle → bucket the global ids per model.
  const buckets = Array.from({ length: nModels }, () => []);
  for (let i = 0; i < count; i++) buckets[(rng() * nModels) | 0].push(i);

  // Drop the current meshes (box or previous models).
  for (const child of [...cloud.children]) {
    cloud.remove(child);
    child.geometry.dispose();
  }

  buckets.forEach((arr, m) => {
    if (arr.length === 0) return;
    const ids = Uint32Array.from(arr);
    const scale = MODEL_SCALES[m] ?? 1;   // per-model size class (config)
    cloud.add(buildInstancedMesh(geometries[m], cloud.material, ids, phases, sizes, scale));
  });
}

/**
 * Resize cloud seed/phase/size buffers to `count` (mood-mix totalCount).
 * Does not rebuild InstancedMeshes — call applyMeshMix / setCloudGeometries after.
 * @returns {boolean} true if count changed
 */
export function resizeCloudCount(cloud, count, energy, brightness, texture, heaviness, dynamism, bpm, warpOrder = DEFAULT_WARP_ORDER, dominance) {
  const n = Math.max(1, count | 0);
  if (n === cloud.count
    && cloud.userData.seedPositions
    && cloud.userData.seedPositions.length === n * 3) {
    return false;
  }
  const { positions, phases, sizes } = sampleAll6Cloud(
    n, energy, brightness, texture, heaviness, dynamism, bpm, warpOrder, dominance);
  cloud.count = n;
  cloud.userData.seedPositions = positions;
  cloud.userData.phases = phases;
  cloud.userData.sizes = sizes;
  return true;
}

/**
 * Bake a mood mesh mix onto the cloud: 1 major + 2 accents → up to 3 type
 * families of InstancedMeshes. Shared material binds one uMap (highest-count
 * textured type); aUseMap / aUseMarble are per-instance.
 *
 * @param {THREE.Group} cloud
 * @param {ReturnType<import('../audio/moodToMeshMix.js').moodToMeshMix>} mix
 * @param {Awaited<ReturnType<import('./particleModels.js').loadMeshTypeCache>>} typeCache
 */
export function applyMeshMix(cloud, mix, typeCache) {
  const phases = cloud.userData.phases;
  const sizes = cloud.userData.sizes;
  const count = mix.totalCount;
  if (cloud.count !== count) {
    console.warn(`[mesh-mix] cloud.count (${cloud.count}) ≠ mix.totalCount (${count}); call resizeCloudCount first`);
  }

  const rng = seededRng(0x4d315835 ^ (count * 2654435761));
  const order = new Uint32Array(count);
  for (let i = 0; i < count; i++) order[i] = i;
  for (let i = count - 1; i > 0; i--) {
    const j = (rng() * (i + 1)) | 0;
    const t = order[i]; order[i] = order[j]; order[j] = t;
  }

  let offset = 0;
  /** @type {Record<string, number[]>} */
  const typeIds = {};
  for (const typeId of mix.types) {
    const n = mix.counts[typeId] || 0;
    const arr = [];
    for (let k = 0; k < n && offset < count; k++, offset++) arr.push(order[offset]);
    typeIds[typeId] = arr;
  }

  // Shared material: one map — highest-count textured type in the mix.
  let mapType = null;
  let mapCount = -1;
  for (const typeId of mix.types) {
    const entry = typeCache[typeId];
    if (!entry?.map) continue;
    const n = mix.counts[typeId] || 0;
    if (n > mapCount) { mapCount = n; mapType = typeId; }
  }
  const u = cloud.material.uniforms;
  if (mapType && typeCache[mapType].map) {
    u.uMap.value = typeCache[mapType].map;
    u.uUseMap.value = 1;
  } else {
    u.uMap.value = null;
    u.uUseMap.value = 0;
  }
  const hasMarble = mix.types.some((id) => typeCache[id]?.marble);
  u.uMarble.value = hasMarble ? 1 : 0;

  for (const child of [...cloud.children]) {
    cloud.remove(child);
    child.geometry.dispose();
  }

  for (const typeId of mix.types) {
    const entry = typeCache[typeId];
    const ids = typeIds[typeId] || [];
    if (!entry || ids.length === 0) continue;

    const nVar = entry.geoms.length;
    const buckets = Array.from({ length: nVar }, () => []);
    for (const gid of ids) buckets[(rng() * nVar) | 0].push(gid);

    const useMap = mapType === typeId && !!entry.map;
    const useMarble = !!entry.marble;
    const sizeMul = entry.sizeMul ?? 1;
    const deform = typeId === 'triangle' ? 1 : typeId === 'pedal' ? 2 : 0;

    // Colour role: major = main hue ± small jitter; accents = same family, larger shifts.
    const isMajor = typeId === mix.major;
    const accentIdx = mix.accents.indexOf(typeId);
    let hueBase = 0;
    let hueJitter = MESH_MAJOR_HUE_JITTER;
    if (!isMajor) {
      hueBase = accentIdx === 1 ? MESH_ACCENT_B_HUE_SHIFT : MESH_ACCENT_HUE_SHIFT;
      hueJitter = MESH_ACCENT_HUE_JITTER;
    }

    buckets.forEach((arr, m) => {
      if (arr.length === 0) return;
      const scale = (entry.scales[m] ?? 1) * sizeMul;
      cloud.add(buildInstancedMesh(
        entry.geoms[m], cloud.material, Uint32Array.from(arr),
        phases, sizes, scale, {
        useMap, useMarble, deform,
        hueBase, hueJitter, hueRng: rng,
      },
      ));
    });
  }

  cloud.userData.meshMix = mix;
}

// ── Live resample — ALL 6 parameters with a caller-supplied warp order ────────
// warpOrder: array of field names forming the domain-warp chain (top 1–2 fields).
export function resampleAll6(cloud, energy, brightness, texture, heaviness, dynamism, bpm, warpOrder, uniforms, dominance) {
  const count = cloud.count;
  const { positions, phases, sizes } = sampleAll6Cloud(count, energy, brightness, texture, heaviness, dynamism, bpm, warpOrder, dominance);

  cloud.userData.phases = phases;
  cloud.userData.sizes = sizes;
  for (const mesh of cloud.children) writeMeshAttributes(mesh, phases, sizes);

  // Refresh spawn seeds so the GPGPU sim respawns onto the new shape.
  cloud.userData.seedPositions = positions;

  if (uniforms) {
    uniforms.uElongation.value = 1.0;
    // NOTE: uSpawnFrac is intentionally left untouched here — a mid-flight
    // reshape (dominance slider, mood rebake) should not re-trigger the sparse
    // → full reveal ramp. Only the cover→game transition (main.js) drives it.
  }
}
