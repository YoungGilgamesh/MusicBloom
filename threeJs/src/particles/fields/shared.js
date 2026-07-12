/**
 * fields/shared.js — primitives shared by every field module.
 *
 *  • seededRng  — deterministic Mulberry32 PRNG (reproducible seed layouts)
 *  • vn3        — single-octave 3-D value noise (turbulence / FBM building block)
 *  • WARP_MAX   — max coordinate displacement per domain-warp step
 */

import { SHAPE_SCALE } from '../../config.js';

// ── Seeded RNG (Mulberry32) ───────────────────────────────────────────────────
export function seededRng(seed) {
  let s = (seed * 0x9e3779b9 + 0x6a09e667) >>> 0;
  return () => {
    s  = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) >>> 0;
    return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
  };
}

// ── Single-octave 3-D value noise ─────────────────────────────────────────────
function ihash(n) {
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  return ((n ^ (n >>> 16)) >>> 0) / 0xffffffff;
}
function h3(ix, iy, iz, seed) {
  return ihash((ix*1597) ^ (iy*31337) ^ (iz*123457) ^ (seed*997)) * 2 - 1;
}
function sm(t) { return t * t * (3 - 2 * t); }
function lp(a, b, t) { return a + (b - a) * t; }
export function vn3(x, y, z, seed) {
  const ix=Math.floor(x)|0, iy=Math.floor(y)|0, iz=Math.floor(z)|0;
  const u=sm(x-ix), v=sm(y-iy), w=sm(z-iz), s=seed|0;
  return lp(
    lp(lp(h3(ix,  iy,  iz,  s),h3(ix+1,iy,  iz,  s),u),
       lp(h3(ix,  iy+1,iz,  s),h3(ix+1,iy+1,iz,  s),u),v),
    lp(lp(h3(ix,  iy,  iz+1,s),h3(ix+1,iy,  iz+1,s),u),
       lp(h3(ix,  iy+1,iz+1,s),h3(ix+1,iy+1,iz+1,s),u),v),
    w);
}

// Maximum coordinate displacement per warp step (world units, per active param).
// With Option-A only 1–2 fields warp (vs the old 6), so we can afford a larger
// per-warp displacement without compounding into chaos.
export const WARP_MAX = SHAPE_SCALE * 0.24;
