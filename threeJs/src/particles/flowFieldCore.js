import { createNoise3D } from 'simplex-noise';

const noise3D = createNoise3D();

const OX = [0, 17, 31];
const OY = [43, 0, 19];
const OZ = [23, 29, 0];

function potential(x, y, z, ox, oy, oz, dx, dy, dz) {
  return noise3D(x + ox + dx, y + oy + dy, z + oz + dz);
}

export function curlNoise(x, y, z, w, scale) {
  const e = 0.02;
  const driftX = w * 0.04;
  const driftY = w * 0.03;
  const driftZ = w * 0.02;

  const sx = x * scale;
  const sy = y * scale;
  const sz = z * scale;

  const cx =
    (potential(sx, sy + e, sz, OZ[0], OZ[1], OZ[2], driftX, driftY, driftZ) -
      potential(sx, sy - e, sz, OZ[0], OZ[1], OZ[2], driftX, driftY, driftZ) -
      (potential(sx, sy, sz + e, OY[0], OY[1], OY[2], driftX, driftY, driftZ) -
        potential(sx, sy, sz - e, OY[0], OY[1], OY[2], driftX, driftY, driftZ))) /
    (2.0 * e);

  const cy =
    (potential(sx, sy, sz + e, OX[0], OX[1], OX[2], driftX, driftY, driftZ) -
      potential(sx, sy, sz - e, OX[0], OX[1], OX[2], driftX, driftY, driftZ) -
      (potential(sx + e, sy, sz, OZ[0], OZ[1], OZ[2], driftX, driftY, driftZ) -
        potential(sx - e, sy, sz, OZ[0], OZ[1], OZ[2], driftX, driftY, driftZ))) /
    (2.0 * e);

  const cz =
    (potential(sx + e, sy, sz, OY[0], OY[1], OY[2], driftX, driftY, driftZ) -
      potential(sx - e, sy, sz, OY[0], OY[1], OY[2], driftX, driftY, driftZ) -
      (potential(sx, sy + e, sz, OX[0], OX[1], OX[2], driftX, driftY, driftZ) -
        potential(sx, sy - e, sz, OX[0], OX[1], OX[2], driftX, driftY, driftZ))) /
    (2.0 * e);

  return [cx, cy, cz];
}

function curlTurbulence(x, y, z, seed) {
  let rx = 0;
  let ry = 0;
  let rz = 0;
  let amp = 1.0;
  let freq = 1.0;
  let total = 0;

  for (let octave = 0; octave < 2; octave++) {
    const [cx, cy, cz] = curlNoise(
      x * freq + seed * 1.3,
      y * freq + seed * 2.1,
      z * freq + seed * 0.7,
      seed * 0.5 + octave * 1.7,
      1.1
    );
    rx += cx * amp;
    ry += cy * amp;
    rz += cz * amp;
    total += amp;
    amp *= 0.5;
    freq *= 2.0;
  }

  return [rx / total, ry / total, rz / total];
}

export function fluidFlow(x, y, z, w) {
  const [tx, ty, tz] = curlTurbulence(x, y, z, 0);

  const scale = 0.5;
  const [f0x, f0y, f0z] = curlNoise(x, y, z, w, scale);
  const [f1x, f1y, f1z] = curlNoise(x + 2.1, y + 5.3, z + 1.7, w * 0.7 + 1.1, scale * 2.0);

  return [
    tx * 0.55 + f0x * 1.25 + f1x * 0.65,
    ty * 0.55 + f0y * 1.25 + f1y * 0.65,
    tz * 0.55 + f0z * 1.25 + f1z * 0.65,
  ];
}

// CPU mirror — used for click picking only.
// Blends the base flow toward each stone's unique curl pattern (mirrors the shader mix).
function noiseRepulsionAt(x, y, z, w, flowX, flowY, flowZ, fx, fy, fz, stoneData, seedData, stoneCount, strength) {
  let rfx = fx, rfy = fy, rfz = fz;

  for (let i = 0; i < stoneCount; i++) {
    const b = i * 4;
    const sx = stoneData[b], sy = stoneData[b+1], sz = stoneData[b+2], sr = stoneData[b+3];
    if (sr <= 0) continue;

    const dx = flowX - sx, dy = flowY - sy, dz = flowZ - sz;
    const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
    if (dist >= sr) continue;

    const t = 1 - dist / sr;
    const f = Math.min(1, t * t * (3 - 2 * t) * strength);

    const ox = seedData[b], oy = seedData[b+1], oz = seedData[b+2];
    const sc = seedData[b+3];

    const [cx, cy, cz] = curlNoise(x * sc + ox, y * sc + oy, z * sc + oz, w, sc * 0.5);

    rfx = rfx + (cx - rfx) * f;
    rfy = rfy + (cy - rfy) * f;
    rfz = rfz + (cz - rfz) * f;
  }

  return [rfx, rfy, rfz];
}

// CPU mirror of GPU displacement — used only for click picking.
export function computeMorphedPositions(
  positions,
  phases,
  count,
  time,
  flowSpeed,
  displacement,
  stoneData,
  seedData,
  stoneCount,
  stoneStrength,
  outMorphed
) {
  for (let i = 0; i < count; i++) {
    const i3 = i * 3;
    const x = positions[i3];
    const y = positions[i3 + 1];
    const z = positions[i3 + 2];
    const w = time * flowSpeed + phases[i];

    const [fx, fy, fz] = fluidFlow(x, y, z, w);
    const flowX = x + fx * displacement;
    const flowY = y + fy * displacement;
    const flowZ = z + fz * displacement;

    const [bfx, bfy, bfz] = noiseRepulsionAt(
      x, y, z, w,
      flowX, flowY, flowZ,
      fx, fy, fz,
      stoneData, seedData, stoneCount, stoneStrength
    );

    outMorphed[i3]     = x + bfx * displacement;
    outMorphed[i3 + 1] = y + bfy * displacement;
    outMorphed[i3 + 2] = z + bfz * displacement;
  }
}
