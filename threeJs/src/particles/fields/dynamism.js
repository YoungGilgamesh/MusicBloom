/**
 * fields/dynamism.js — Dynamism field: Helix skein.
 *
 * N helix axes on a Fibonacci sphere; each generates a Gaussian-tubed vector
 * potential whose curl produces helical circulation that tightens with pitch.
 * Pitch k and coil radius R both scale with dynamism.
 *
 * dynamism → 0 :  2 wide gentle coils  (soft oscillation, slow pulse)
 * dynamism → 1 :  6 tight wound springs (compressed energy, rapid vibration)
 *
 * Axis layout per entry: [ax,ay,az, e1x,e1y,e1z, e2x,e2y,e2z, phase]
 */

import { SHAPE_SCALE } from '../../config.js';
import { seededRng } from './shared.js';

export function generateHelixAxes(dynamism) {
  const N   = 2 + Math.round(dynamism * 4);   // 2 → 6
  const rng = seededRng(77);
  const axes = [];
  for (let i = 0; i < N; i++) {
    const phi   = Math.acos(1 - 2*(i + 0.5) / N);
    const theta = 2 * Math.PI * i * 0.618;
    const ax = Math.sin(phi) * Math.cos(theta);
    const ay = Math.cos(phi);
    const az = Math.sin(phi) * Math.sin(theta);

    const upRef = Math.abs(ay) < 0.99 ? [0,1,0] : [1,0,0];
    let e1x = upRef[1]*az - upRef[2]*ay;
    let e1y = upRef[2]*ax - upRef[0]*az;
    let e1z = upRef[0]*ay - upRef[1]*ax;
    const e1l = Math.sqrt(e1x*e1x + e1y*e1y + e1z*e1z) + 1e-8;
    e1x /= e1l; e1y /= e1l; e1z /= e1l;
    const e2x = ay*e1z - az*e1y;
    const e2y = az*e1x - ax*e1z;
    const e2z = ax*e1y - ay*e1x;

    axes.push([ax, ay, az, e1x, e1y, e1z, e2x, e2y, e2z, rng() * Math.PI * 2]);
  }
  return axes;
}

// Field tube half-width: wide at low dynamism, narrower at high
export function helixSigma(dynamism) {
  return SHAPE_SCALE * (0.28 - dynamism * 0.14);  // 0.28 → 0.14
}

// Pitch wavenumber: how quickly the helix winds per world unit
export function helixPitchK(dynamism) {
  return (2.0 + dynamism * 9.0) / SHAPE_SCALE;   // slow → tight spiral
}

export function helixPsi(comp, x, y, z, axes, sigma2, pitchK) {
  let total = 0;
  for (const a of axes) {
    const ax=a[0], ay=a[1], az=a[2];
    const e1x=a[3], e1y=a[4], e1z=a[5];
    const e2x=a[6], e2y=a[7], e2z=a[8];
    const ph = a[9];
    const t  = x*ax + y*ay + z*az;
    const rx = x - t*ax, ry = y - t*ay, rz = z - t*az;
    const r2 = rx*rx + ry*ry + rz*rz;
    const w  = Math.exp(-r2 / sigma2);
    const ca = Math.cos(pitchK * t + ph);
    const sa = Math.sin(pitchK * t + ph);
    if      (comp === 0) total += w * (ca * e1x - sa * e2x);
    else if (comp === 1) total += w * (ca * e1y - sa * e2y);
    else                 total += w * (ca * e1z - sa * e2z);
  }
  return total;
}

const DY_DIFF = 0.012;
export function curlHelix(x, y, z, axes, sigma2, pitchK) {
  const f = (c, dx, dy, dz) => helixPsi(c, x+dx, y+dy, z+dz, axes, sigma2, pitchK);
  return [
    (f(2,0,DY_DIFF,0)-f(2,0,-DY_DIFF,0) - f(1,0,0,DY_DIFF)+f(1,0,0,-DY_DIFF)) / (2*DY_DIFF),
    (f(0,0,0,DY_DIFF)-f(0,0,0,-DY_DIFF) - f(2,DY_DIFF,0,0)+f(2,-DY_DIFF,0,0)) / (2*DY_DIFF),
    (f(1,DY_DIFF,0,0)-f(1,-DY_DIFF,0,0) - f(0,0,DY_DIFF,0)+f(0,0,-DY_DIFF,0)) / (2*DY_DIFF),
  ];
}
