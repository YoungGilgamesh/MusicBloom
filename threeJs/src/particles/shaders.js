/**
 * shaders.js — Energy Field (Neural Network) particle cloud
 *
 * Each cube is oriented so its long axis (Z) aligns with the local curl velocity
 * stored in aNormal. Combined with uElongation this makes each particle look
 * like a thin rod lying along the dendrite / axon.
 *
 * aNormal    = normalised curl velocity at particle's final position
 * aPhase     = distance from soma node / max-travel [0 → 1]
 *              0 = at soma (bright core),  1 = at tip (dimmer)
 * aSize      = per-particle random base size
 * uElongation= how many times longer the cube is along its axis (Z)
 */

import {
  ZONE_MAX,
  CLOUD_COUNT,
  AUDIO_TREBLE_SIZE,
  CUBE_SCALE,
  SHAPE_SCALE,
} from '../config.js';
import { INSTANCE_GLSL } from './instanceTransform.glsl.js';

export const vertexShader = /* glsl */ `
  #define MAX_STONES        ${ZONE_MAX}
  #define CLOUD_COUNT       ${CLOUD_COUNT}
  #define AUDIO_TREBLE_SIZE ${AUDIO_TREBLE_SIZE.toFixed(4)}
  #define CUBE_SCALE        ${CUBE_SCALE.toFixed(5)}

  attribute float aPhase;   // streamline T [0,1]
  attribute float aSize;
  attribute vec3  aNormal;  // curl velocity direction (cube Z-axis)

  uniform float uTime;
  uniform float uPointSize;
  uniform float uDisplacement;
  uniform float uFlowSpeed;
  uniform float uStoneStrength;
  uniform int   uStoneCount;
  uniform vec4  uStones[MAX_STONES];
  uniform vec4  uStoneSeeds[MAX_STONES];
  uniform float uAudioMids;
  uniform float uAudioTreble;
  uniform float uBeatPhase;
  uniform float uNoiseScale;
  uniform float uDomainWarp;
  uniform vec3  uFlowBias;
  uniform float uOrbitStrength;
  uniform float uJitter;
  uniform vec4  uShapeWeights;
  uniform float uShapeScale;
  uniform float uReveal;
  uniform float uElongation;

  // ── GPGPU sim state ────────────────────────────────────────────────────────
  uniform sampler2D uSimPos;     // xyz = position, w = age
  uniform sampler2D uSimCell;    // xyz = lattice cell the particle belongs to
  uniform vec2      uSimRes;     // sim texture resolution (w, h)
  uniform float     uSimW;       // sim texture width (for instanceID → uv)
  uniform vec3      uCamPos;     // camera world position (kill / fade)
  uniform float     uKillRadius; // respawn distance from camera
  uniform float     uBirthTime;  // seconds of alpha fade-in

  // Baked mood velocity volume + per-instance transform params (see INSTANCE_GLSL).
  uniform highp sampler3D uVelVolume;
  uniform float           uVolHalf;
  uniform float uInstPeriod;
  uniform float uInstJitter;
  uniform float uScaleMin;
  uniform float uScaleMax;

  uniform vec3  uLightPos;

  out vec3  vNormal;
  out vec3  vWorldPos;
  out vec3  vViewPos;
  out float vPhase;   // 0 = at soma (bright), 1 = at tip (dim)
  out float vFade;    // birth / far-distance alpha envelope [0,1]

  ${INSTANCE_GLSL}

  void main() {
    // ── Fetch simulated position + age from the GPGPU state texture ──────────
    float fi    = float(gl_InstanceID);
    vec2  simUV = (vec2(mod(fi, uSimW), floor(fi / uSimW)) + 0.5) / uSimRes;
    vec4  sp    = texture(uSimPos, simUV);
    vec3  p     = sp.xyz;
    float age   = sp.w;
    vec3  cell  = texture(uSimCell, simUV).xyz;

    vec3 displaced = p;

    // ── Orient cube Z-axis along this instance's transformed flow ────────────
    vec3 flow = normalize(instSampleVel(p, cell) + vec3(1e-4));
    vec3 up   = abs(flow.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
    vec3 rgt  = normalize(cross(up, flow));
    up        = cross(flow, rgt);
    mat3 orient = mat3(rgt, up, flow);

    // ── Cube dimensions ──────────────────────────────────────────────────────
    float taper    = 1.0 - 0.30 * aPhase;
    float sizeMult = taper * (1.0 + uAudioTreble * AUDIO_TREBLE_SIZE);
    float baseSize = aSize * CUBE_SCALE * sizeMult * uPointSize;
    vec3  localPos = position * vec3(baseSize, baseSize, baseSize * uElongation);
    vec3  worldVertex = displaced + orient * localPos;

    // ── Birth fade-in + fade-out near the kill radius ────────────────────────
    float birth   = smoothstep(0.0, uBirthTime, age);
    float dCam    = distance(p, uCamPos);
    float farFade = 1.0 - smoothstep(uKillRadius * 0.78, uKillRadius, dCam);
    vFade = birth * farFade;

    vNormal   = normalize(orient * normal);
    vWorldPos = worldVertex;
    vViewPos  = (modelViewMatrix * vec4(worldVertex, 1.0)).xyz;
    vPhase    = aPhase;
    gl_Position = projectionMatrix * vec4(vViewPos, 1.0);
  }
`;

export const fragmentShader = /* glsl */ `
  #define FOG_NEAR ${(SHAPE_SCALE * 0.30).toFixed(3)}
  #define FOG_FAR  ${(SHAPE_SCALE * 1.45).toFixed(3)}

  uniform vec3  uLightPos;
  uniform vec3  uLightColor;
  uniform float uAmbient;

  in vec3  vWorldPos;
  in vec3  vViewPos;
  in vec3  vNormal;
  in float vPhase;
  in float vFade;
  out vec4 fragColor;

  void main() {
    vec3  lightDir = normalize(uLightPos - vWorldPos);
    float diffuse  = max(0.0, dot(vNormal, lightDir));

    vec3  viewDir  = normalize(-vViewPos);
    vec3  halfVec  = normalize(lightDir + viewDir);
    float spec     = pow(max(0.0, dot(vNormal, halfVec)), 48.0) * 0.55;

    float bright   = 0.92 - vPhase * 0.32;
    vec3  color    = vec3(bright) * uLightColor * (uAmbient + diffuse) + spec;

    // Distance fade: near cubes fully opaque, far cubes transparent
    float dist  = length(vViewPos);
    float alpha = 1.0 - smoothstep(FOG_NEAR, FOG_FAR, dist);

    fragColor = vec4(color, alpha * vFade);
  }
`;
