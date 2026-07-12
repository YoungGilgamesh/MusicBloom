/**
 * fields/bpm.js — BPM field: Wave interference bubbles.
 *
 * Multiple spherical wave sources; their interference pattern (constructive
 * surfaces) visualises tempo.  Slow BPM → long wavelength, clean hyperboloid
 * shells; fast BPM → short wavelength, dense micro-bubble foam.
 *
 * interferenceAndGrad returns both the normalised field value and its analytical
 * gradient in one pass (used as surface normal and as a domain-warp direction).
 */

import { SHAPE_SCALE } from '../../config.js';
import { seededRng } from './shared.js';

export function normBpm(bpm) { return Math.min(1, Math.max(0, (bpm - 40) / 160)); }

export function generateWaveSources(bpm) {
  const t   = normBpm(bpm);
  const N   = 2 + Math.round(t * 6);          // 2 → 8
  const rng = seededRng(31);
  const R   = SHAPE_SCALE * 0.52;
  const src = [];
  for (let i = 0; i < N; i++) {
    const phi   = Math.acos(1 - 2*(i + 0.5) / N);
    const theta = 2 * Math.PI * i * 0.618;
    const r     = R * (0.35 + rng() * 0.65);   // varied radii for asymmetric interference
    src.push([
      r * Math.sin(phi) * Math.cos(theta),
      r * Math.cos(phi),
      r * Math.sin(phi) * Math.sin(theta),
    ]);
  }
  return src;
}

// Wavenumber: 2π / wavelength.  Longer wavelength at slow BPM → cleaner geometry.
export function bpmWavenumber(bpm) {
  const t = normBpm(bpm);
  const wavelength = SHAPE_SCALE * (1.05 - t * 0.75);   // 1.05 → 0.30 world units
  return (2 * Math.PI) / wavelength;
}

// Compute normalised interference value AND analytical gradient in one pass.
// Gradient = −k · Σ sin(k·d_i) · (x−src_i)/d_i   (exact, no finite differences)
export function interferenceAndGrad(x, y, z, src, k) {
  let f = 0, gx = 0, gy = 0, gz = 0;
  for (const [sx, sy, sz] of src) {
    const dx = x-sx, dy = y-sy, dz = z-sz;
    const d  = Math.sqrt(dx*dx + dy*dy + dz*dz) + 1e-8;
    const kd = k * d;
    f += Math.cos(kd);
    const dw = -k * Math.sin(kd) / d;
    gx += dw * dx;  gy += dw * dy;  gz += dw * dz;
  }
  const N = src.length;
  return { f: f / N, gx: gx / N, gy: gy / N, gz: gz / N };
}
