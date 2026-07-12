/**
 * fields/heaviness.js — Heaviness field: Gravity fall streams.
 *
 * N vertical channels seeded on an XZ disc (sunflower spiral).  Each channel is a
 * Gaussian tube whose vector potential produces downward circulation.  A value-noise
 * "wander" fades in at low heaviness for a floaty/drifting feel.
 *
 * heaviness → 0 :  5 wide wandering columns
 * heaviness → 1 : 20 tight straight rods
 */

import { SHAPE_SCALE } from '../../config.js';
import { vn3 } from './shared.js';

// ── Stream channel generator ──────────────────────────────────────────────────
export function generateStreamChannels(heaviness) {
  const N = 5 + Math.round(heaviness * 15);   // 5 → 20
  const R = SHAPE_SCALE * 0.78;
  const channels = [];
  for (let i = 0; i < N; i++) {
    // Sunflower spiral: even area distribution in XZ disc
    const theta = 2 * Math.PI * i * 0.618;
    const r     = R * Math.sqrt((i + 0.5) / N);
    channels.push([r * Math.cos(theta), r * Math.sin(theta)]);  // [cx, cz]
  }
  return channels;
}

// ── Heaviness vector potential ────────────────────────────────────────────────
// Ψ = −W(x,z)·(z, 0, −x)   →  curl = (0, −2W(1−r²/σ²), 0) along each channel
// Noise wander fades out above heaviness = 0.5
export function heavinessPsi(comp, x, y, z, channels, sigma2, heaviness) {
  let W = 0;
  for (const c of channels) {
    const dx = x - c[0], dz = z - c[1];
    W += Math.exp(-(dx*dx + dz*dz) / sigma2);
  }
  let val;
  if      (comp === 0) val = -W * z;
  else if (comp === 1) val = 0.0;
  else                 val =  W * x;

  // Value-noise wander: only at low heaviness (floaty/drifting feel)
  const wanderAmt = Math.max(0, (0.5 - heaviness) * 0.8);
  if (wanderAmt > 0.01) {
    const nf = 0.55;
    val += vn3(x*nf, y*nf + comp*5.1, z*nf, 33 + comp*17) * wanderAmt;
  }
  return val;
}

const H_DIFF = 0.012;
export function curlHeaviness(x, y, z, channels, sigma2, heaviness) {
  const f = (c, dx, dy, dz) => heavinessPsi(c, x+dx, y+dy, z+dz, channels, sigma2, heaviness);
  return [
    (f(2,0,H_DIFF,0)-f(2,0,-H_DIFF,0) - f(1,0,0,H_DIFF)+f(1,0,0,-H_DIFF)) / (2*H_DIFF),
    (f(0,0,0,H_DIFF)-f(0,0,0,-H_DIFF) - f(2,H_DIFF,0,0)+f(2,-H_DIFF,0,0)) / (2*H_DIFF),
    (f(1,H_DIFF,0,0)-f(1,-H_DIFF,0,0) - f(0,0,H_DIFF,0)+f(0,0,-H_DIFF,0)) / (2*H_DIFF),
  ];
}
