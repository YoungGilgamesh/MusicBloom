/**

 * frozenDust.js — sparse small FROZEN world particles for flythrough spatial awareness.

 *

 * Not part of the flow sim / trails / paint. Tiny points seeded in a cube around the

 * camera and WORLD-FIXED until they leave that cube, then wrapped to the opposite

 * face (classic starfield wrap). As you fly, they stream past → parallax / depth cue

 * without costing a second GPGPU sim.

 *

 * Colour follows the trail/mood theme (uColorHSL) with wide per-mote hue scatter so

 * the field feels related but not a flat tint.

 *

 * Cheap: one THREE.Points draw, soft circular sprites, distance fade, no depth write.

 */



import * as THREE from 'three';

import {

  FROZEN_DUST_COUNT,

  FROZEN_DUST_RADIUS,

  FROZEN_DUST_SIZE,

  FROZEN_DUST_SIZE_VAR,

  FROZEN_DUST_COLOR,

  FROZEN_DUST_OPACITY,

  FROZEN_DUST_NEAR,

  FROZEN_DUST_FAR,

  FROZEN_DUST_HUE_VAR,

  FROZEN_DUST_SAT_SCALE,

  FROZEN_DUST_LIT_SCALE,

  TONE_MAPPING_EXPOSURE,

} from '../config.js';

import { TONE_MAP_GLSL } from '../render/toneMap.glsl.js';



const VERT_FULL = /* glsl */ `

  uniform float uSize;

  uniform float uSizeVar;

  uniform float uNear;

  uniform float uFar;

  attribute float aSize;

  attribute float aHue;

  varying float vFade;

  varying float vSeed;

  varying float vHue;



  void main() {

    vec4 mv = modelViewMatrix * vec4(position, 1.0);

    float dist = length(mv.xyz);

    float nearF = smoothstep(uNear, uNear * 2.2, dist);

    float farF  = 1.0 - smoothstep(uFar * 0.72, uFar, dist);

    vFade = nearF * farF;

    vSeed = aSize;

    vHue  = aHue;



    // Wide, skewed size mix: many small motes + occasional larger ones (not linear-uniform).

    float t = pow(aSize, 1.65);

    float mul = mix(1.0 - uSizeVar, 1.0 + 0.85 * uSizeVar, t);

    float sz = uSize * mul;

    // Perspective scale; low floor so tiny dust can stay tiny.

    gl_PointSize = clamp(sz * (420.0 / max(dist, 0.2)), 0.6, 72.0);

    gl_Position = projectionMatrix * mv;

  }

`;



const FRAG = /* glsl */ `

  uniform vec3 uColorHSL;   // theme colour (trail / mood)

  uniform float uHueVar;    // per-mote hue spread (± half of this)

  uniform float uSatScale;  // sat vs theme

  uniform float uLitScale;  // lightness vs theme

  uniform float uOpacity;

  varying float vFade;

  varying float vSeed;

  varying float vHue;



  ${TONE_MAP_GLSL}



  vec3 hsl2rgb(vec3 c) {

    vec3 rgb = clamp(abs(mod(c.x * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);

    return c.z + c.y * (rgb - 0.5) * (1.0 - abs(2.0 * c.z - 1.0));

  }



  void main() {

    // Soft disc (gl_PointCoord is 0..1 across the point sprite).

    vec2 c = gl_PointCoord * 2.0 - 1.0;

    float r2 = dot(c, c);

    if (r2 > 1.0) discard;

    float soft = 1.0 - smoothstep(0.35, 1.0, sqrt(r2));

    // Tiny per-point brightness variation so the field isn't a flat grid of clones.

    float tw = 0.75 + 0.25 * vSeed;

    float a = uOpacity * vFade * soft * tw;

    if (a < 0.02) discard;



    // Theme hue + wide per-mote scatter (vHue ∈ [0,1] → ±uHueVar/2).

    float hue = fract(uColorHSL.x + (vHue - 0.5) * uHueVar + 1.0);

    float sat = clamp(uColorHSL.y * uSatScale, 0.0, 1.0);

    float lit = clamp(uColorHSL.z * uLitScale, 0.0, 1.0);

    vec3 rgb = hsl2rgb(vec3(hue, sat, lit));



    gl_FragColor = vec4(applyOutputToneMap(rgb), a);

  }

`;



export class FrozenDust {

  /**

   * @param {object} [opts]

   * @param {number} [opts.count]

   * @param {number} [opts.radius] half-extent of the wrap cube (world units)

   */

  constructor({

    count  = FROZEN_DUST_COUNT,

    radius = FROZEN_DUST_RADIUS,

  } = {}) {

    this.count  = count;

    this.radius = radius;

    this.enabled = true;



    const positions = new Float32Array(count * 3);

    const sizes     = new Float32Array(count);

    const hues      = new Float32Array(count);

    // Seed in a cube around the origin (camera starts at framing pose; first update wraps).

    for (let i = 0; i < count; i++) {

      positions[i * 3]     = (Math.random() * 2 - 1) * radius;

      positions[i * 3 + 1] = (Math.random() * 2 - 1) * radius;

      positions[i * 3 + 2] = (Math.random() * 2 - 1) * radius;

      // Skew toward small (pow>1); a few stay large for visible size contrast.

      sizes[i] = Math.pow(Math.random(), 1.8);

      hues[i]  = Math.random();

    }



    const geom = new THREE.BufferGeometry();

    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    geom.setAttribute('aSize',    new THREE.BufferAttribute(sizes, 1));

    geom.setAttribute('aHue',     new THREE.BufferAttribute(hues, 1));

    this._positions = positions;

    this.geom = geom;



    // Initial HSL from legacy flat colour until mood write arrives.

    const init = new THREE.Color(FROZEN_DUST_COLOR);

    const hsl = { h: 0, s: 0, l: 0 };

    init.getHSL(hsl);



    this.material = new THREE.ShaderMaterial({

      vertexShader: VERT_FULL,

      fragmentShader: FRAG,

      transparent: true,

      depthTest: true,

      depthWrite: false,   // soft points — don't punch holes in the cloud

      blending: THREE.NormalBlending,

      toneMapped: false,   // ACES applied in FS

      uniforms: {

        uSize:    { value: FROZEN_DUST_SIZE },

        uSizeVar: { value: FROZEN_DUST_SIZE_VAR },

        uColorHSL: { value: new THREE.Vector3(hsl.h, hsl.s, hsl.l) },

        uHueVar:   { value: FROZEN_DUST_HUE_VAR },

        uSatScale: { value: FROZEN_DUST_SAT_SCALE },

        uLitScale: { value: FROZEN_DUST_LIT_SCALE },

        uOpacity: { value: FROZEN_DUST_OPACITY },

        uNear:    { value: FROZEN_DUST_NEAR },

        uFar:     { value: FROZEN_DUST_FAR },

        uToneExposure: { value: TONE_MAPPING_EXPOSURE },

      },

    });



    this.object3D = new THREE.Points(geom, this.material);

    this.object3D.frustumCulled = false;

    this.object3D.renderOrder = -1; // behind the cloud meshes when depths are close

  }



  get size() { return this.material.uniforms.uSize.value; }

  set size(v) { this.material.uniforms.uSize.value = v; }

  get opacity() { return this.material.uniforms.uOpacity.value; }

  set opacity(v) { this.material.uniforms.uOpacity.value = v; }



  /** Drive dust from trail/mood theme HSL ({ h, s, l } in 0..1). */

  setColorHSL(hsl) {

    if (!hsl) return;

    this.material.uniforms.uColorHSL.value.set(hsl.h, hsl.s, hsl.l);

  }



  /**

   * Wrap any dust that left the camera-centered cube back onto the opposite face.

   * Call once per frame with the live camera position.

   * @param {THREE.Vector3} camPos

   */

  update(camPos) {

    this.object3D.visible = this.enabled;

    if (!this.enabled) return;



    const R = this.radius;

    const twoR = R * 2;

    const pos = this._positions;

    const cx = camPos.x, cy = camPos.y, cz = camPos.z;

    let dirty = false;



    for (let i = 0, n = this.count; i < n; i++) {

      const o = i * 3;

      let x = pos[o] - cx;

      let y = pos[o + 1] - cy;

      let z = pos[o + 2] - cz;

      // Wrap each axis independently (keeps density uniform in the moving cube).

      if (x >  R) { pos[o] -= twoR; dirty = true; }

      else if (x < -R) { pos[o] += twoR; dirty = true; }

      if (y >  R) { pos[o + 1] -= twoR; dirty = true; }

      else if (y < -R) { pos[o + 1] += twoR; dirty = true; }

      if (z >  R) { pos[o + 2] -= twoR; dirty = true; }

      else if (z < -R) { pos[o + 2] += twoR; dirty = true; }

    }



    if (dirty) this.geom.attributes.position.needsUpdate = true;

    // Far fade tracks the wrap radius so the field edge stays soft.

    this.material.uniforms.uFar.value = Math.max(FROZEN_DUST_FAR, R * 0.98);

  }



  dispose() {

    this.geom.dispose();

    this.material.dispose();

  }

}


