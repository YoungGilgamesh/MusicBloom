/**
 * fields/energy.js — Energy field: Fire tongues.
 *
 * N flame tongues erupt outward from a sphere surface.
 * Velocity = radially-outward-from-origin + upward bias + height-scaled turbulence,
 * so tongues point in all directions — volumetric fireball, not a flat plane.
 *
 * Low  energy (0): 3 tongues,  mild turbulence → clean solar flares
 * High energy (1): 8 tongues,  heavy turbulence → chaotic corona
 *
 * ePoles = { energy, bases: [[bx,by,bz], …] }
 */

import { SHAPE_SCALE } from '../../config.js';
import { seededRng, vn3 } from './shared.js';

export function generateEnergyPoles(energy) {
  const N   = 3 + Math.round(energy * 5);          // 3 → 8 tongues
  const R   = SHAPE_SCALE * (0.28 + energy * 0.14);
  const rng = seededRng(71);
  const bases = [];
  for (let i = 0; i < N; i++) {
    const phi   = Math.acos(1 - 2*(i+0.5)/N);      // Fibonacci sphere
    const theta = 2*Math.PI*i*0.618;
    const jit   = SHAPE_SCALE * 0.06;
    bases.push([
      R*Math.sin(phi)*Math.cos(theta) + (rng()-0.5)*jit,
      R*Math.cos(phi)                 + (rng()-0.5)*jit,
      R*Math.sin(phi)*Math.sin(theta) + (rng()-0.5)*jit,
    ]);
  }
  return { energy, bases };
}

// Fire velocity: radially outward from origin + upward bias + turbulence.
// Seeds at any position on the inner sphere will erupt outward → 3D fireball.
export function fireVelocity(x, y, z, eData) {
  const { energy } = eData;
  // Radial outward direction with upward lean
  const r  = Math.sqrt(x*x + y*y + z*z) + 1e-6;
  let vx = x/r * 0.65 ;
  let vy = y/r * 0.65 + 0.75;   // bias toward +Y
  let vz = z/r * 0.65;
  const vl = Math.sqrt(vx*vx+vy*vy+vz*vz);
  vx/=vl; vy/=vl; vz/=vl;

  // Turbulence grows with radial distance (tips flicker, roots are steady)
  const rNorm = Math.min(1, r / (SHAPE_SCALE * 1.1));
  const turb  = (0.28 + energy * 0.58) * (0.10 + rNorm * 0.90);
  const freq  = 3.0 + energy * 3.5;
  vx += (vn3(x*freq, y*freq, z*freq, 3) - 0.5) * 2.0 * turb;
  vz += (vn3(x*freq, y*freq, z*freq, 7) - 0.5) * 2.0 * turb;
  return [vx, vy, vz];
}

// curlEnergy — particle velocity = fire field (direct field, not a mathematical curl)
export function curlEnergy(x, y, z, ePoles) {
  return fireVelocity(x, y, z, ePoles);
}
