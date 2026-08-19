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
  PAINT_SWIRL_RATE,
  PAINT_EVOLVE_RATE,
  FIELD_WARP_AMOUNT,
  FIELD_WARP_FREQ,
  FIELD_WARP_RATE,
  CLOUD_BEHIND_FRAC,
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
  precision highp int;
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
  uniform vec3  uCamFwd;      // camera look direction — see the respawn-reach comment below
  uniform float uBehindFrac;  // behind reach as a fraction of the front reach (<1 = forward-biased)
  uniform float uPaintLifeBoost;   // stretch lifetime of heads sitting in the persistent mark (0 = off, meshes)
  uniform float uReset;
  uniform vec3  uCamPos;
  // Animated spawn (trails only; 0 = fixed-seed old behaviour, meshes).
  uniform float uSpawnTime;        // elapsed seconds (drives churn + drift)
  uniform float uSpawnChurn;       // seeds/sec the adopted seed index drifts
  uniform float uSpawnDrift;       // downstream spawn offset along the flow (world units)
  uniform float uSpawnDriftRate;   // how fast the downstream offset phase cycles

  in  vec2 vUv;
  layout(location = 0) out vec4 outState;
  layout(location = 1) out vec4 outCell;

  float hash1(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

  ${INSTANCE_GLSL}
  ${PAINT_GLSL}

  // Respawn with ANIMATED spawn placement (trails). Two layered effects, both no-ops when
  // their knob is 0 (→ identical to the plain fixed-seed instRespawn used by the meshes):
  //   CHURN — adopt a DIFFERENT shape-seed by drifting this trail's seed INDEX over time
  //           (per-trail rate jitter so they desync). Permutes the seed set → the shape
  //           density is preserved, but which streamline each trail rides reshuffles slowly.
  //   DRIFT — slide the resulting spawn a little DOWNSTREAM along the (warped) flow line, by
  //           an offset that cycles over time, so births travel along the path.
  vec3 animatedRespawn(vec2 uv, vec3 camPos, out vec3 cell) {
    ivec2 res = textureSize(uSeed, 0);
    int   N   = res.x * res.y;
    ivec2 px  = ivec2(floor(uv * vec2(res)));
    float hh  = hash1(uv);                       // per-trail phase [0,1)

    ivec2 spx = px;
    if (uSpawnChurn > 0.0 && N > 1) {
      int i     = px.y * res.x + px.x;
      int shift = int(floor(uSpawnTime * uSpawnChurn * (0.5 + hh)));
      int ni    = i + shift;
      ni        = ni - (ni / N) * N;             // ni mod N (ni ≥ 0 → safe)
      spx       = ivec2(ni % res.x, ni / res.x);
    }
    vec3 sd  = texelFetch(uSeed, spx, 0).xyz;
    vec3 pos = instRespawn(sd, camPos, cell);

    if (uSpawnDrift > 0.0) {
      float ph   = fract(uSpawnTime * uSpawnDriftRate + hh);   // 0..1 animated per trail
      float dist = ph * uSpawnDrift;
      for (int s = 0; s < 4; s++) {              // short Euler walk → follows the curved path
        vec3  fv = instSampleVel(pos, cell);
        float fl = length(fv);
        if (fl < 1e-6) break;
        pos += (fv / fl) * (dist * 0.25);
      }
    }
    return pos;
  }

  void main() {
    vec4 seed = texture(uSeed, vUv);

    // Per-particle lifetime (deterministic from this texel) — stored in cell.w so
    // the render shader can fade the particle out over its last SIM_DEATH_TIME.
    float life = uMaxLife * (1.0 + (hash1(vUv) - 0.5) * 2.0 * uLifeJitter);

    if (uReset > 0.5) {
      vec3 cell;
      vec3 pos = animatedRespawn(vUv, uCamPos, cell);
      outState = vec4(pos, seed.w);   // keep staggered initial age
      outCell  = vec4(cell, life);
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

    // Painted heads live longer: stretch this particle's lifetime by how deep it sits in
    // the persistent mark (trail sim only — uPaintLifeBoost is 0 for meshes, so this is a
    // free no-op there). Store the stretched life in cell.w so the render fade matches.
    if (uPaintLifeBoost > 0.0) {
      life *= 1.0 + uPaintLifeBoost * paintInfluence(pos);
    }

    // Forward-biased respawn reach — matches the render shader's forward-biased
    // FADE (see shaders.js/gpuTrailsShaders.js's uBehindFrac comment) so a particle
    // stops being "alive" at the same distance it visually disappears. Without this,
    // the fade (behind you) shrinks faster than this plain-radius trigger, so a
    // particle can sit invisible-but-not-yet-recycled behind you for a while,
    // wasting a life-slot that could otherwise refill the sparse space ahead of you.
    float rs      = 0.5 * (dot(normalize(pos - uCamPos + vec3(1e-6)), uCamFwd) + 1.0);
    float reach   = uKillRadius * mix(uBehindFrac, 1.0, rs);
    if (age > life || distance(pos, uCamPos) > reach) {
      pos = animatedRespawn(vUv, uCamPos, cell);
      age = 0.0;
    }

    outState = vec4(pos, age);
    outCell  = vec4(cell, life);
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
        uPrevState: { value: null },
        uPrevCell: { value: null },
        uSeed: { value: this.seedTex },
        uVelVolume: { value: ph },
        uVolHalf: { value: SIM_VOL_HALF },
        uInstPeriod: { value: SIM_INST_PERIOD },
        uInstJitter: { value: SIM_INST_JITTER },
        // Living base field (slow global domain warp — see instanceTransform.glsl.js).
        uFieldWarpAmt: { value: FIELD_WARP_AMOUNT },
        uFieldWarpFreq: { value: FIELD_WARP_FREQ },
        uFieldWarpRate: { value: FIELD_WARP_RATE },
        uFieldWarpTime: { value: 0.0 },   // elapsed seconds — written each frame in update()
        uScaleMin: { value: SIM_INST_SCALE_MIN },
        uScaleMax: { value: SIM_INST_SCALE_MAX },
        uDt: { value: 0 },
        uFlowSpeed: { value: SIM_FLOW_SPEED },
        uMaxLife: { value: SIM_MAX_LIFE },
        uLifeJitter: { value: SIM_LIFE_JITTER },
        uKillRadius: { value: SIM_KILL_RADIUS },
        // Forward-biased respawn reach — see the respawn check's comment above.
        // Defaults match the render shaders' own CLOUD_BEHIND_FRAC/-Z default so
        // behavior is unchanged until main.js starts writing the real camera
        // forward each frame (see update()'s camFwd param).
        uCamFwd: { value: new THREE.Vector3(0, 0, -1) },
        uBehindFrac: { value: CLOUD_BEHIND_FRAC },
        uPaintLifeBoost: { value: 0.0 },  // 0 = off (meshes); the trail sim raises this
        // Animated spawn (0 = fixed-seed, meshes); the trail sim raises churn/drift.
        uSpawnTime: { value: 0.0 },
        uSpawnChurn: { value: 0.0 },
        uSpawnDrift: { value: 0.0 },
        uSpawnDriftRate: { value: 0.0 },
        uReset: { value: 0 },
        uCamPos: { value: new THREE.Vector3() },
        // Persistent click-paint blooms (camera-windowed; see bloomField.js).
        uBloomCount: { value: 0 },
        uPaintStrength: { value: 1.0 },   // 1 = full paint (meshes); trails override this
        // Living-field animation (swirl + evolve). uPaintTime is written each frame by
        // bloomField.syncUniforms; the rates are constant look knobs.
        uPaintTime: { value: 0.0 },
        uPaintSwirl: { value: PAINT_SWIRL_RATE },
        uPaintEvolve: { value: PAINT_EVOLVE_RATE },
        uPaintDrift: { value: 0.0 },     // 0 = no post-surge creep (meshes); the trail sim raises this

        uBloomA: { value: Array.from({ length: BLOOM_MAX_ACTIVE }, () => new THREE.Vector4()) },
        uBloomB: { value: Array.from({ length: BLOOM_MAX_ACTIVE }, () => new THREE.Vector4()) },
        uBloomC: { value: Array.from({ length: BLOOM_MAX_ACTIVE }, () => new THREE.Vector4()) },
        // Per-bloom shape modulators (outward, shapeAmt, fieldFreq, detail);
        // snapshotted per-click from mood in bloomField.js (shell rides uBloomB.w).
        uBloomD: { value: Array.from({ length: BLOOM_MAX_ACTIVE }, () => new THREE.Vector4()) },
        // Per-bloom ink colour: xyz = HSL, w = colour stain radius (grows; outlives shape).
        uBloomE: { value: Array.from({ length: BLOOM_MAX_ACTIVE }, () => new THREE.Vector4()) },
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
        data[o] = positions[i * 3];
        data[o + 1] = positions[i * 3 + 1];
        data[o + 2] = positions[i * 3 + 2];
        data[o + 3] = Math.random() * SIM_MAX_LIFE;   // staggered initial age
      } else {
        data[o] = data[o + 1] = data[o + 2] = 1e6; data[o + 3] = 1e9;
      }
    }
  }

  _step() {
    this.mat.uniforms.uPrevState.value = this.rtA.textures[0];
    this.mat.uniforms.uPrevCell.value = this.rtA.textures[1];
    this.renderer.setRenderTarget(this.rtB);
    this.quad.render(this.renderer);
    this.renderer.setRenderTarget(null);
    const t = this.rtA; this.rtA = this.rtB; this.rtB = t;
  }

  /**
   * @param {number} dt
   * @param {THREE.Vector3} camPos
   * @param {THREE.Vector3} [camFwd] camera look direction — drives the forward-
   *   biased respawn reach (see the respawn check's comment); omitted (e.g. by
   *   the cover-page orbit camera, which has no "forward" travel) leaves the
   *   uniform at its last-written value (defaults to -Z).
   */
  update(dt, camPos, camFwd) {
    const u = this.mat.uniforms;
    u.uDt.value = Math.min(dt, 1 / 30);
    u.uCamPos.value.copy(camPos);
    if (camFwd) u.uCamFwd.value.copy(camFwd);
    // Advance the living-field warp clock (real dt, not the sim-clamped one) so the field
    // evolves at a wall-clock rate. Mesh sim + trail sim tick the same sequence → in sync.
    this._fieldTime = (this._fieldTime || 0) + dt;
    u.uFieldWarpTime.value = this._fieldTime;
    u.uSpawnTime.value = this._fieldTime;   // shares the same wall-clock as the field warp
    this._step();
  }

  getPositionTexture() { return this.rtA.textures[0]; }
  getCellTexture() { return this.rtA.textures[1]; }

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

  /**
   * Grow/shrink GPU targets when mesh mix totalCount changes. Keeps this instance
   * (and its uniforms) so bloom wiring stays valid.
   * @returns {boolean} true if targets were rebuilt
   */
  resize(count, seedPositions) {
    const n = Math.max(1, count | 0);
    if (n === this.count) {
      this.reset(seedPositions);
      return false;
    }
    this.rtA.dispose();
    this.rtB.dispose();
    this.seedTex.dispose();

    this.count = n;
    const w = Math.ceil(Math.sqrt(n));
    this.width = w;
    this.height = w;

    const rtOpts = {
      count: 2,
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
    this.seedTex = new THREE.DataTexture(new Float32Array(w * w * 4), w, w, THREE.RGBAFormat, THREE.FloatType);
    this.seedTex.needsUpdate = true;
    this.mat.uniforms.uSeed.value = this.seedTex;

    this.reset(seedPositions);
    return true;
  }

  dispose() {
    this.rtA?.dispose();
    this.rtB?.dispose();
    this.seedTex?.dispose();
    this.mat?.dispose();
    this.quad?.dispose();
  }

  reset(seedPositions) {
    this._fillSeed(this.seedTex.image.data, seedPositions);
    this.seedTex.needsUpdate = true;
    this.mat.uniforms.uReset.value = 1.0;
    this._step();
    this.mat.uniforms.uReset.value = 0.0;
  }
}
