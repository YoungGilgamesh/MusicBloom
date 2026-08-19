/**
 * frameCloud.js — initial camera pose: pull back + aim at the home-cell cloud.
 *
 * Why: camera used to spawn at the origin (cloud center) looking -Z, while the home
 * cell applies a random rot/mirror/jitter — so the densest mass often sat "above"
 * or off-screen. This places the camera a short distance outside the shape centroid
 * and aims at it so the whole form reads in the first frame.
 *
 * Constraint: stay inside SIM_KILL_RADIUS so the far side of the form still reads.
 * Pull-back is CAMERA_FRAME_DIST — a little behind the core so the first fly-in
 * shows the shape before you reach the front edge. AIM does the rest for framing.
 *
 * Uses the same per-cell transform as the GPU (lowbias32) so the centroid matches
 * what you actually see for cell (0,0,0).
 */

import * as THREE from 'three';
import {
  SIM_INST_PERIOD,
  SIM_INST_JITTER,
  SIM_INST_SCALE_MIN,
  SIM_INST_SCALE_MAX,
  CAMERA_FRAME_DIST,
} from '../config.js';

// ── Bit-identical cell hash (mirrors instanceTransform.glsl.js) ─
function instU(x) {
  x = x >>> 0;
  x = (x ^ (x >>> 16)) >>> 0;
  x = Math.imul(x, 0x7feb352d) >>> 0;
  x = (x ^ (x >>> 15)) >>> 0;
  x = Math.imul(x, 0x846ca68b) >>> 0;
  x = (x ^ (x >>> 16)) >>> 0;
  return x;
}
const INV24 = 1 / 16777216;
const instU2F = (h) => (h >>> 8) * INV24;

function cellRand(cx, cy, cz, salt, out) {
  const ix = Math.floor(cx + 0.5) | 0;
  const iy = Math.floor(cy + 0.5) | 0;
  const iz = Math.floor(cz + 0.5) | 0;
  let h = Math.imul(salt, 0x9e3779b9) >>> 0;
  h = instU(h ^ (ix >>> 0));
  h = instU(h ^ (iy >>> 0));
  h = instU(h ^ (iz >>> 0));
  const h1 = instU(h);
  const h2 = instU(h1);
  out[0] = instU2F(h); out[1] = instU2F(h1); out[2] = instU2F(h2);
  return out;
}

const _h = new Float32Array(3);
const _R = new Float32Array(9);

function buildRot(cx, cy, cz) {
  cellRand(cx, cy, cz, 1, _h);
  let x = _h[0] * 2 - 1 + 1e-4, y = _h[1] * 2 - 1 + 1e-4, z = _h[2] * 2 - 1 + 1e-4;
  const inv = 1 / Math.sqrt(x * x + y * y + z * z);
  x *= inv; y *= inv; z *= inv;
  cellRand(cx, cy, cz, 2, _h);
  const ang = _h[0] * 6.2831853;
  const s = Math.sin(ang), co = Math.cos(ang), t = 1 - co;
  _R[0] = t * x * x + co;   _R[1] = t * x * y + s * z; _R[2] = t * x * z - s * y;
  _R[3] = t * x * y - s * z; _R[4] = t * y * y + co;   _R[5] = t * y * z + s * x;
  _R[6] = t * x * z + s * y; _R[7] = t * y * z - s * x; _R[8] = t * z * z + co;
}

function toWorld(lx, ly, lz, cx, cy, cz, period, jitter, scaleMin, scaleMax, out) {
  buildRot(cx, cy, cz);
  cellRand(cx, cy, cz, 3, _h);
  const mx = _h[0] >= 0.5 ? 1 : -1;
  const my = _h[1] >= 0.5 ? 1 : -1;
  const mz = _h[2] >= 0.5 ? 1 : -1;
  const vx = lx * mx, vy = ly * my, vz = lz * mz;
  const rx = _R[0] * vx + _R[3] * vy + _R[6] * vz;
  const ry = _R[1] * vx + _R[4] * vy + _R[7] * vz;
  const rz = _R[2] * vx + _R[5] * vy + _R[8] * vz;
  cellRand(cx, cy, cz, 4, _h);
  const sc = scaleMin + (scaleMax - scaleMin) * _h[1];
  cellRand(cx, cy, cz, 5, _h);
  out.x = cx * period + (_h[0] * 2 - 1) * jitter * period + sc * rx;
  out.y = cy * period + (_h[1] * 2 - 1) * jitter * period + sc * ry;
  out.z = cz * period + (_h[2] * 2 - 1) * jitter * period + sc * rz;
  return out;
}

const _p = new THREE.Vector3();
const _c = new THREE.Vector3();
const _euler = new THREE.Euler(0, 0, 0, 'YXZ');

/**
 * Place `camera` outside the home-cell cloud looking at its centroid, and sync
 * fly-controls heading so the next update doesn't snap the view back.
 *
 * @param {THREE.PerspectiveCamera} camera
 * @param {{ setHeading?: Function }} controls  fly controls (needs setHeading)
 * @param {Float32Array} seedPositions  shape-local seeds (xyz packed)
 */
export function frameCloudCamera(camera, controls, seedPositions, {
  period   = SIM_INST_PERIOD,
  jitter   = SIM_INST_JITTER,
  scaleMin = SIM_INST_SCALE_MIN,
  scaleMax = SIM_INST_SCALE_MAX,
  dist     = CAMERA_FRAME_DIST,
} = {}) {
  const n = seedPositions ? (seedPositions.length / 3) | 0 : 0;
  if (n <= 0) {
    camera.position.set(0, 0, dist);
    camera.lookAt(0, 0, 0);
  } else {
    // World centroid of the home cell (0,0,0) — matches the GPU stamp you see at spawn.
    _c.set(0, 0, 0);
    for (let i = 0; i < n; i++) {
      toWorld(
        seedPositions[i * 3], seedPositions[i * 3 + 1], seedPositions[i * 3 + 2],
        0, 0, 0, period, jitter, scaleMin, scaleMax, _p,
      );
      _c.add(_p);
    }
    _c.multiplyScalar(1 / n);

    // Approach along the default fly axis (-Z): sit behind the centroid, same height,
    // looking through the shape. Aim = centroid → no more "cloud feels above".
    camera.position.set(_c.x, _c.y, _c.z + dist);
    camera.lookAt(_c);
  }

  // Sync fly-controls yaw/pitch from the new orientation (YXZ euler).
  if (controls && typeof controls.setHeading === 'function') {
    _euler.setFromQuaternion(camera.quaternion, 'YXZ');
    controls.setHeading(_euler.y, _euler.x);
  }
}
