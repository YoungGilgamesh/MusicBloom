/**
 * fields/brightness.js — Brightness field: Radiant spoke web.
 *
 * N radial spokes on a Fibonacci sphere; particles flow outward along each axis.
 * A Gaussian tube around every spoke gives a vector potential whose curl drives
 * along-spoke outward circulation.
 *
 * brightness → 0 :  3 wide fuzzy spokes
 * brightness → 1 : 12 fine tight spokes
 */

import { SHAPE_SCALE } from '../../config.js';

// ── Spoke generator ───────────────────────────────────────────────────────────
export function generateSpokes(brightness) {
  const N    = 3 + Math.round(brightness * 9);  // 3 → 12
  const dirs = [];
  for (let i = 0; i < N; i++) {
    const phi   = Math.acos(1 - 2*(i + 0.5) / N);
    const theta = 2 * Math.PI * i * 0.618;        // golden angle → even spread
    dirs.push([
      Math.sin(phi) * Math.cos(theta),
      Math.cos(phi),
      Math.sin(phi) * Math.sin(theta),
    ]);
  }
  return dirs;
}

// Field tube half-width: wide/fuzzy at low b, tighter at high b
export function spokeFieldSigma(brightness) {
  return SHAPE_SCALE * (0.10 - brightness * 0.05);  // 0.10 → 0.05
}

// ── Spoke vector potential ─────────────────────────────────────────────────────
// Ψ = Σ_i  w_i × cross(d_i, pos)
// Its curl drives along-spoke outward flow near each axis.
export function spokePsi(comp, x, y, z, spokes, sigma2) {
  let total = 0;
  for (const d of spokes) {
    // r_perp² = |pos|² − dot(pos,d)²
    const dpd  = x*d[0] + y*d[1] + z*d[2];
    const r2   = Math.max(0, x*x + y*y + z*z - dpd*dpd);
    const w    = Math.exp(-r2 / sigma2);
    // cross(d, pos)[comp]
    if      (comp === 0) total += w * (d[1]*z - d[2]*y);
    else if (comp === 1) total += w * (d[2]*x - d[0]*z);
    else                 total += w * (d[0]*y - d[1]*x);
  }
  return total;
}

const B_DIFF = 0.012;
export function curlBrightness(x, y, z, spokes, sigma2) {
  const f = (c, dx, dy, dz) => spokePsi(c, x+dx, y+dy, z+dz, spokes, sigma2);
  return [
    (f(2,0,B_DIFF,0)-f(2,0,-B_DIFF,0) - f(1,0,0,B_DIFF)+f(1,0,0,-B_DIFF)) / (2*B_DIFF),
    (f(0,0,0,B_DIFF)-f(0,0,0,-B_DIFF) - f(2,B_DIFF,0,0)+f(2,-B_DIFF,0,0)) / (2*B_DIFF),
    (f(1,B_DIFF,0,0)-f(1,-B_DIFF,0,0) - f(0,0,B_DIFF,0)+f(0,0,-B_DIFF,0)) / (2*B_DIFF),
  ];
}
