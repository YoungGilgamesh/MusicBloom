/**
 * fields/texture.js — Texture field: FBM noise isosurface.
 *
 * Particles placed where |fbm(x)| < band.  The isosurface of FBM looks like
 * organic material cross-sections — large blobs at low texture, fine wispy
 * shells and filaments at high texture.  Infinite (no sphere confinement).
 *
 * texP = { freq, oct } — precomputed once per resample.
 */

import { SHAPE_SCALE } from '../../config.js';
import { vn3 } from './shared.js';

export function fbmFreq(texture) {
  return (0.9 + texture * 1.1) / SHAPE_SCALE;  // coarse → fine
}
export function fbmOctaves(texture) {
  return 2 + Math.round(texture * 4);  // 2 → 6 octaves
}
export function fbmField(x, y, z, freq, oct) {
  let v = 0, a = 0.5, f = freq;
  for (let i = 0; i < oct; i++) {
    v += vn3(x*f, y*f, z*f, i * 1447) * a;
    f *= 2.0; a *= 0.5;
  }
  return v;  // range ≈ [−1, 1]
}

// ∇fbm via central differences — used both as warp direction and surface normal.
// texP = { freq, oct }
export function texturePsi(comp, x, y, z, texP) {
  const eps = SHAPE_SCALE * 0.018;
  const { freq, oct } = texP;
  if (comp === 0) return (fbmField(x+eps,y,z,freq,oct) - fbmField(x-eps,y,z,freq,oct)) / (2*eps);
  if (comp === 1) return (fbmField(x,y+eps,z,freq,oct) - fbmField(x,y-eps,z,freq,oct)) / (2*eps);
  return               (fbmField(x,y,z+eps,freq,oct) - fbmField(x,y,z-eps,freq,oct)) / (2*eps);
}
