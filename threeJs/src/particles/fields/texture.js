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
import { vn3, vn3grad } from './shared.js';

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

// Texture flow — curl-noise: v = ∇fbm × ∇n, where n is a decorrelated value-noise
// field.  The cross product is perpendicular to ∇fbm, so the flow runs *along* the
// FBM isosurface (the |fbm|<band shell where texture seeds live) instead of pushing
// off it — coherent organic layers/filaments that don't wash out.  Fully 3-D (no
// degenerate planar axis), and it keeps seeds on their own structure.
export function curlTexture(x, y, z, texP) {
  const g1x = texturePsi(0, x, y, z, texP);
  const g1y = texturePsi(1, x, y, z, texP);
  const g1z = texturePsi(2, x, y, z, texP);
  // Secondary gradient at ~2× the FBM frequency so the flow lines get texture-scale
  // meander rather than long straight runs.
  const sf = texP.freq * 2.0;
  const [g2x, g2y, g2z] = vn3grad(x * sf, y * sf, z * sf, 917);
  return [
    g1y * g2z - g1z * g2y,
    g1z * g2x - g1x * g2z,
    g1x * g2y - g1y * g2x,
  ];
}
