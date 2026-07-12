/**
 * createQuantumCloud.js — thin orchestrator for the mood-driven particle cloud.
 *
 * The generative field system lives in ./fields/:
 *   shared.js      — RNG, value noise, WARP_MAX
 *   energy.js      — fire tongues
 *   brightness.js  — radiant spoke web
 *   texture.js     — FBM noise isosurface
 *   heaviness.js   — gravity fall streams
 *   dynamism.js    — helix skein
 *   bpm.js         — wave interference bubbles
 *   combine.js     — domain-warp + superposition + sampleAll6Cloud (master sampler)
 *
 * This file only:
 *   • builds the InstancedMesh + ShaderMaterial + uniforms  (createQuantumCloud)
 *   • re-samples an existing mesh in place on slider changes (resampleAll6)
 *
 * Per-instance attributes written by the sampler:
 *   aNormal  = flow direction at final position   (cube orientation)
 *   aPhase   = normalised travel / field phase     [0→1]  (brightness gradient)
 *   aSize    = particle size
 */

import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { vertexShader, fragmentShader } from './shaders.js';
import { sampleAll6Cloud } from './fields/combine.js';
import {
  CLOUD_COUNT,
  POINT_SIZE,
  SHAPE_SCALE,
  ZONE_STRENGTH,
  ZONE_MAX,
  LIGHT_COLOR,
  LIGHT_INTENSITY,
  LIGHT_POSITION,
  LIGHT_AMBIENT,
  SIM_KILL_RADIUS,
  SIM_BIRTH_TIME,
  SIM_VOL_HALF,
  SIM_INST_PERIOD,
  SIM_INST_JITTER,
  SIM_INST_SCALE_MIN,
  SIM_INST_SCALE_MAX,
} from '../config.js';

// Default warp chain at init (all params = 0.5 → energy & brightness are top-2).
const DEFAULT_WARP_ORDER = ['energy', 'brightness'];

// ── Main export ───────────────────────────────────────────────────────────────
export function createQuantumCloud({ count = CLOUD_COUNT, pointSize = POINT_SIZE, energy = 0.5, brightness = 0.5, texture = 0.5, heaviness = 0.5, dynamism = 0.5, bpm = 120 } = {}) {
  const t0 = performance.now();
  const { positions, normals, phases, sizes } = sampleAll6Cloud(count, energy, brightness, texture, heaviness, dynamism, bpm, DEFAULT_WARP_ORDER);
  console.log(`[All6 init order: ${DEFAULT_WARP_ORDER.join('→')}] ${count} particles in ${(performance.now()-t0).toFixed(0)} ms`);

  const geometry = mergeVertices(new THREE.BoxGeometry(1, 1, 1));
  geometry.setAttribute('aPhase',  new THREE.InstancedBufferAttribute(phases,  1));
  geometry.setAttribute('aSize',   new THREE.InstancedBufferAttribute(sizes,   1));
  geometry.setAttribute('aNormal', new THREE.InstancedBufferAttribute(normals, 3));

  const uniforms = {
    uTime:          { value: 0 },
    uPointSize:     { value: pointSize },
    uFlowSpeed:     { value: 0 },
    uDisplacement:  { value: 0 },
    uStoneStrength: { value: ZONE_STRENGTH },
    uStoneCount:    { value: 0 },
    uStones:        { value: Array.from({ length: ZONE_MAX }, () => new THREE.Vector4()) },
    uStoneSeeds:    { value: Array.from({ length: ZONE_MAX }, () => new THREE.Vector4()) },
    uAudioMids:     { value: 0 },
    uAudioTreble:   { value: 0 },
    uBeatPhase:     { value: 0 },
    uLightPos:      { value: new THREE.Vector3(LIGHT_POSITION.x, LIGHT_POSITION.y, LIGHT_POSITION.z) },
    uLightColor:    { value: new THREE.Color(LIGHT_COLOR).multiplyScalar(LIGHT_INTENSITY) },
    uAmbient:       { value: LIGHT_AMBIENT },
    uShapeWeights:  { value: new THREE.Vector4() },
    uShapeScale:    { value: SHAPE_SCALE },
    uNoiseScale:    { value: 0 },
    uDomainWarp:    { value: 0 },
    uFlowBias:      { value: new THREE.Vector3() },
    uOrbitStrength: { value: 0 },
    uJitter:        { value: 0 },
    uReveal:        { value: 0 },
    uElongation:    { value: 1.0 },
    // GPGPU sim state — uSimPos/uSimRes/uSimW are set by main.js after the
    // ParticleSim is created (their real sizes come from the sim instance).
    uSimPos:        { value: null },
    uSimCell:       { value: null },
    uSimRes:        { value: new THREE.Vector2(1, 1) },
    uSimW:          { value: 1 },
    uCamPos:        { value: new THREE.Vector3() },
    uKillRadius:    { value: SIM_KILL_RADIUS },
    uBirthTime:     { value: SIM_BIRTH_TIME },
    // Baked mood velocity volume (set by main.js) + per-instance transform params.
    uVelVolume:     { value: null },
    uVolHalf:       { value: SIM_VOL_HALF },
    uInstPeriod:    { value: SIM_INST_PERIOD },
    uInstJitter:    { value: SIM_INST_JITTER },
    uScaleMin:      { value: SIM_INST_SCALE_MIN },
    uScaleMax:      { value: SIM_INST_SCALE_MAX },
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    glslVersion: THREE.GLSL3,
    transparent: true,
    depthWrite:  false,
    blending:    THREE.NormalBlending,
  });

  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.frustumCulled = false;

  const dummy = new THREE.Object3D();
  for (let i = 0; i < count; i++) {
    dummy.position.set(positions[i*3], positions[i*3+1], positions[i*3+2]);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;

  // Expose the sampled positions so the GPGPU sim can use them as spawn seeds.
  mesh.userData.seedPositions = positions;

  return mesh;
}

// ── Live resample — ALL 6 parameters with a caller-supplied warp order ────────
// warpOrder: array of field names forming the domain-warp chain, e.g.
//   ['dynamism', 'bpm'].  Typically the top 1–2 strongest fields (see main.js).
export function resampleAll6(mesh, energy, brightness, texture, heaviness, dynamism, bpm, warpOrder, uniforms) {
  const count = mesh.count;
  const t0    = performance.now();
  const { positions, normals, phases, sizes } = sampleAll6Cloud(count, energy, brightness, texture, heaviness, dynamism, bpm, warpOrder);
  console.log(`[All6 order: ${warpOrder.join('→')}] e=${energy.toFixed(2)} b=${brightness.toFixed(2)} t=${texture.toFixed(2)} h=${heaviness.toFixed(2)} d=${dynamism.toFixed(2)} bpm=${bpm.toFixed(0)} — ${count} particles in ${(performance.now()-t0).toFixed(0)} ms`);

  const dummy = new THREE.Object3D();
  for (let i = 0; i < count; i++) {
    dummy.position.set(positions[i*3], positions[i*3+1], positions[i*3+2]);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;

  mesh.geometry.attributes.aPhase.array.set(phases);   mesh.geometry.attributes.aPhase.needsUpdate  = true;
  mesh.geometry.attributes.aNormal.array.set(normals); mesh.geometry.attributes.aNormal.needsUpdate = true;
  mesh.geometry.attributes.aSize.array.set(sizes);     mesh.geometry.attributes.aSize.needsUpdate   = true;

  // Refresh spawn seeds so the GPGPU sim respawns onto the new shape.
  mesh.userData.seedPositions = positions;

  if (uniforms) {
    uniforms.uReveal.value     = 0;
    uniforms.uElongation.value = 1.0;
  }
}
