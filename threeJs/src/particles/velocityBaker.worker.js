/**
 * velocityBaker.worker.js — bakes the combined mood velocity field into a
 * volume texture, off the main thread.
 *
 * On each shape change main.js posts the 6 mood params + warp order.  We rebuild
 * the (deterministic) field bundle and evaluate `combinedVelocity` at every cell
 * centre of an SIM_VOL_RES³ grid spanning [-half, +half]³ in world space.
 *
 * Output layout matches THREE.Data3DTexture (x fastest, then y, then z), RGBA
 * float:  rgb = velocity direction·speed (normalised so the field's peak speed
 * is 1), a = relative speed [0,1].  The Float32Array buffer is transferred back.
 */

import { buildFieldBundle, combinedVelocity } from './fields/combine.js';

self.onmessage = (e) => {
  const { jobId, energy, brightness, texture, heaviness, dynamism, bpm, warpOrder, res, half } = e.data;

  const F    = buildFieldBundle(energy, brightness, texture, heaviness, dynamism, bpm, warpOrder);
  const N    = res;
  const size = 2 * half;
  const cell = size / N;
  const data = new Float32Array(N * N * N * 4);

  let maxMag = 1e-6;
  for (let zi = 0; zi < N; zi++) {
    const z = -half + (zi + 0.5) * cell;
    for (let yi = 0; yi < N; yi++) {
      const y = -half + (yi + 0.5) * cell;
      const rowBase = ((zi * N) + yi) * N;
      for (let xi = 0; xi < N; xi++) {
        const x = -half + (xi + 0.5) * cell;
        const v = combinedVelocity(x, y, z, F);
        const o = (rowBase + xi) * 4;
        data[o]   = v[0];
        data[o+1] = v[1];
        data[o+2] = v[2];
        const m = Math.sqrt(v[0]*v[0] + v[1]*v[1] + v[2]*v[2]);
        data[o+3] = m;
        if (m > maxMag) maxMag = m;
      }
    }
  }

  // Normalise so the field's peak speed is 1 (uFlowSpeed then sets world speed);
  // relative-speed variation across the field is preserved.
  const inv = 1 / maxMag;
  for (let i = 0; i < data.length; i += 4) {
    data[i]   *= inv;
    data[i+1] *= inv;
    data[i+2] *= inv;
    data[i+3] *= inv;
  }

  self.postMessage({ jobId, data, res, half }, [data.buffer]);
};
