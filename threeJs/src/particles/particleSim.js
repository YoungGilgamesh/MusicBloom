/**
 * particleSim.js — GPGPU particle advection over a world-anchored, per-instance
 * varied tiling of the shape.
 *
 * Two float render targets are ping-ponged via MRT:
 *   textures[0] "state" : xyz = world position, w = age
 *   textures[1] "cell"  : xyz = the integer lattice cell the particle belongs to
 *
 * Each frame a particle advects along its own instance's transformed velocity
 * field (see instanceTransform.glsl.js), ages, and — when it exceeds its
 * (staggered) lifetime or drifts past SIM_KILL_RADIUS — respawns at the nearest
 * tiled copy of its shape-seed to the camera. Because deaths are staggered and
 * faded, this reads as a conveyor: particles that fall behind stream back to the
 * front, keeping the bubble around the camera full at constant density.
 *
 * Public API:
 *   new ParticleSim(renderer, count, seedPositions)
 *   .update(dt, camPos)
 *   .getPositionTexture()   → state texture (xyz pos, w age)
 *   .getCellTexture()       → cell texture (xyz cell index)
 *   .reset(seedPositions)
 *   .setVolume(data3DTexture, half)
 */

import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { INSTANCE_GLSL } from './instanceTransform.glsl.js';
import { PAINT_GLSL } from './paintField.glsl.js';
import {
  SIM_MAX_LIFE,
  SIM_LIFE_JITTER,
  SIM_FLOW_SPEED,
  SIM_KILL_RADIUS,
  SIM_VOL_HALF,
  SIM_INST_PERIOD,
  SIM_INST_JITTER,
  SIM_INST_SCALE_MIN,
  SIM_INST_SCALE_MAX,
  BLOOM_MAX_ACTIVE,
  PAINT_OUTWARD,
  PAINT_CURL,
  PAINT_CURL_FREQ,
  PAINT_DETAIL,
  PAINT_SHELL,
} from '../config.js';

const simVertexShader = /* glsl */ `
  in vec3 position;
  in vec2 uv;
  out vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const simFragmentShader = /* glsl */ `
  precision highp float;
  precision highp sampler3D;

  uniform sampler2D uPrevState;   // xyz = pos, w = age
  uniform sampler2D uPrevCell;    // xyz = lattice cell
  uniform sampler2D uSeed;        // xyz = shape-local seed, w = staggered age
  uniform highp sampler3D uVelVolume;
  uniform float uVolHalf;
  uniform float uInstPeriod;
  uniform float uInstJitter;
  uniform float uScaleMin;
  uniform float uScaleMax;
  uniform float uDt;
  uniform float uFlowSpeed;
  uniform float uMaxLife;
  uniform float uLifeJitter;
  uniform float uKillRadius;
  uniform float uReset;
  uniform vec3  uCamPos;

  in  vec2 vUv;
  layout(location = 0) out vec4 outState;
  layout(location = 1) out vec4 outCell;

  float hash1(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

  ${INSTANCE_GLSL}
  ${PAINT_GLSL}

  void main() {
    vec4 seed = texture(uSeed, vUv);

    if (uReset > 0.5) {
      vec3 cell;
      vec3 pos = instRespawn(seed.xyz, uCamPos, cell);
      outState = vec4(pos, seed.w);   // keep staggered initial age
      outCell  = vec4(cell, 0.0);
      return;
    }

    vec4 st = texture(uPrevState, vUv);
    vec3 cell = texture(uPrevCell, vUv).xyz;
    vec3  pos = st.xyz;
    float age = st.w;

    // Advect along this instance's (transformed) velocity field, redirected
    // through any persistent paint blooms (+ their transient burst).
    vec3 v = paintApply(pos, instSampleVel(pos, cell) * uFlowSpeed);
    pos += v * uDt;
    age += uDt;

    float life = uMaxLife * (1.0 + (hash1(vUv) - 0.5) * 2.0 * uLifeJitter);

    if (age > life || distance(pos, uCamPos) > uKillRadius) {
      pos = instRespawn(seed.xyz, uCamPos, cell);
      age = 0.0;
    }

    outState = vec4(pos, age);
    outCell  = vec4(cell, 0.0);
  }
`;

export class ParticleSim {
  /**
   * @param {THREE.WebGLRenderer} renderer
   * @param {number}              count          number of live particles
   * @param {Float32Array}        seedPositions  length count*3 — shape-local seeds
   */
  constructor(renderer, count, seedPositions) {
    this.renderer = renderer;
    this.count = count;
    this.killRadius = SIM_KILL_RADIUS;

    const w = Math.ceil(Math.sqrt(count));
    this.width = w;
    this.height = w;

    const rtOpts = {
      count: 2,                       // MRT: [0] state, [1] cell
      type: THREE.FloatType,
      format: THREE.RGBAFormat,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      wrapS: THREE.ClampToEdgeWrapping,
      wrapT: THREE.ClampToEdgeWrapping,
      depthBuffer: false,
      stencilBuffer: false,
    };
    this.rtA = new THREE.WebGLRenderTarget(w, w, rtOpts);
    this.rtB = new THREE.WebGLRenderTarget(w, w, rtOpts);

    // Seed texture — shape-local spawn positions + per-particle staggered age.
    this.seedTex = new THREE.DataTexture(new Float32Array(w * w * 4), w, w, THREE.RGBAFormat, THREE.FloatType);
    this.seedTex.needsUpdate = true;

    // Placeholder 1³ volume until the first bake arrives.
    const ph = new THREE.Data3DTexture(new Float32Array(4), 1, 1, 1);
    ph.format = THREE.RGBAFormat;
    ph.type = THREE.FloatType;
    ph.needsUpdate = true;

    this.mat = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: simVertexShader,
      fragmentShader: simFragmentShader,
      uniforms: {
        uPrevState:  { value: null },
        uPrevCell:   { value: null },
        uSeed:       { value: this.seedTex },
        uVelVolume:  { value: ph },
        uVolHalf:    { value: SIM_VOL_HALF },
        uInstPeriod: { value: SIM_INST_PERIOD },
        uInstJitter: { value: SIM_INST_JITTER },
        uScaleMin:   { value: SIM_INST_SCALE_MIN },
        uScaleMax:   { value: SIM_INST_SCALE_MAX },
        uDt:         { value: 0 },
        uFlowSpeed:  { value: SIM_FLOW_SPEED },
        uMaxLife:    { value: SIM_MAX_LIFE },
        uLifeJitter: { value: SIM_LIFE_JITTER },
        uKillRadius: { value: SIM_KILL_RADIUS },
        uReset:      { value: 0 },
        uCamPos:     { value: new THREE.Vector3() },
        // Persistent click-paint blooms (camera-windowed; see bloomField.js).
        uBloomCount: { value: 0 },
        uBloomA:     { value: Array.from({ length: BLOOM_MAX_ACTIVE }, () => new THREE.Vector4()) },
        uBloomB:     { value: Array.from({ length: BLOOM_MAX_ACTIVE }, () => new THREE.Vector4()) },
        uBloomC:     { value: Array.from({ length: BLOOM_MAX_ACTIVE }, () => new THREE.Vector4()) },
        // Bloom shape (curl-field) — live-tunable via the tuning panel.
        uPaintOutward:  { value: PAINT_OUTWARD },
        uPaintCurl:     { value: PAINT_CURL },
        uPaintCurlFreq: { value: PAINT_CURL_FREQ },
        uPaintDetail:   { value: PAINT_DETAIL },
        uPaintShell:    { value: PAINT_SHELL },
      },
    });
    this.quad = new FullScreenQuad(this.mat);

    this.reset(seedPositions);
  }

  _fillSeed(data, positions) {
    const n = this.count;
    for (let i = 0; i < data.length / 4; i++) {
      const o = i * 4;
      if (i < n) {
        data[o]   = positions[i*3];
        data[o+1] = positions[i*3+1];
        data[o+2] = positions[i*3+2];
        data[o+3] = Math.random() * SIM_MAX_LIFE;   // staggered initial age
      } else {
        data[o] = data[o+1] = data[o+2] = 1e6; data[o+3] = 1e9;
      }
    }
  }

  _step() {
    this.mat.uniforms.uPrevState.value = this.rtA.textures[0];
    this.mat.uniforms.uPrevCell.value  = this.rtA.textures[1];
    this.renderer.setRenderTarget(this.rtB);
    this.quad.render(this.renderer);
    this.renderer.setRenderTarget(null);
    const t = this.rtA; this.rtA = this.rtB; this.rtB = t;
  }

  update(dt, camPos) {
    const u = this.mat.uniforms;
    u.uDt.value = Math.min(dt, 1 / 30);
    u.uCamPos.value.copy(camPos);
    this._step();
  }

  getPositionTexture() { return this.rtA.textures[0]; }
  getCellTexture()     { return this.rtA.textures[1]; }

  /**
   * Reads back current particle world positions from the state texture for CPU
   * picking. Layout matches gl_InstanceID: instance i lives at offset i*4
   * (xyz = world position, w = age). Meant for one-off use (a readback per
   * click), not every frame.
   * @param {Float32Array} [out] reusable buffer of length width*height*4
   * @returns {Float32Array}
   */
  readPositions(out) {
    const n = this.width * this.height * 4;
    if (!out || out.length !== n) out = new Float32Array(n);
    // textureIndex 0 = state (COLOR_ATTACHMENT0) of the MRT target.
    this.renderer.readRenderTargetPixels(this.rtA, 0, 0, this.width, this.height, out, 0, 0);
    return out;
  }

  setVolume(tex, half) {
    this.mat.uniforms.uVelVolume.value = tex;
    if (half !== undefined) this.mat.uniforms.uVolHalf.value = half;
  }

  reset(seedPositions) {
    this._fillSeed(this.seedTex.image.data, seedPositions);
    this.seedTex.needsUpdate = true;
    this.mat.uniforms.uReset.value = 1.0;
    this._step();
    this.mat.uniforms.uReset.value = 0.0;
  }
}
