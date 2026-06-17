import * as THREE from 'three';

const _v3a = new THREE.Vector3();
const _v3b = new THREE.Vector3();
const _v3c = new THREE.Vector3();
const _v3d = new THREE.Vector3();
const _v3e = new THREE.Vector3();
const _v4a = new THREE.Vector4();
const _v4b = new THREE.Vector4();
const _v4c = new THREE.Vector4();
const _v4d = new THREE.Vector4();
const _v4e = new THREE.Vector4();
const _v4f = new THREE.Vector4();

const OX = new THREE.Vector3(0, 17, 31);
const OY = new THREE.Vector3(43, 0, 19);
const OZ = new THREE.Vector3(23, 29, 0);

function mod289v3(v, out) {
  out.x = v.x - Math.floor(v.x * (1.0 / 289.0)) * 289.0;
  out.y = v.y - Math.floor(v.y * (1.0 / 289.0)) * 289.0;
  out.z = v.z - Math.floor(v.z * (1.0 / 289.0)) * 289.0;
  return out;
}

function mod289v4(v, out) {
  out.x = v.x - Math.floor(v.x * (1.0 / 289.0)) * 289.0;
  out.y = v.y - Math.floor(v.y * (1.0 / 289.0)) * 289.0;
  out.z = v.z - Math.floor(v.z * (1.0 / 289.0)) * 289.0;
  out.w = v.w - Math.floor(v.w * (1.0 / 289.0)) * 289.0;
  return out;
}

function permute(v, out) {
  out.set(v.x * 34.0 + 1.0, v.y * 34.0 + 1.0, v.z * 34.0 + 1.0, v.w * 34.0 + 1.0);
  out.x *= v.x;
  out.y *= v.y;
  out.z *= v.z;
  out.w *= v.w;
  return mod289v4(out, out);
}

function taylorInvSqrt(r, out) {
  out.set(
    1.79284291400159 - 0.85373472095314 * r.x,
    1.79284291400159 - 0.85373472095314 * r.y,
    1.79284291400159 - 0.85373472095314 * r.z,
    1.79284291400159 - 0.85373472095314 * r.w
  );
  return out;
}

function snoise3(v) {
  const Cx = 1.0 / 6.0;
  const Cy = 1.0 / 3.0;

  const dotC = v.x * Cy + v.y * Cy + v.z * Cy;
  _v3a.set(Math.floor(v.x + dotC), Math.floor(v.y + dotC), Math.floor(v.z + dotC));

  const dotI = _v3a.x * Cx + _v3a.y * Cx + _v3a.z * Cx;
  _v3b.set(v.x - _v3a.x + dotI, v.y - _v3a.y + dotI, v.z - _v3a.z + dotI);

  const gx = _v3b.y >= _v3b.x ? 1 : 0;
  const gy = _v3b.z >= _v3b.y ? 1 : 0;
  const gz = _v3b.x >= _v3b.z ? 1 : 0;
  const lx = 1 - gx;
  const ly = 1 - gy;
  const lz = 1 - gz;

  const i1x = Math.min(gx, lz);
  const i1y = Math.min(gy, lx);
  const i1z = Math.min(gz, ly);
  const i2x = Math.max(gx, lz);
  const i2y = Math.max(gy, lx);
  const i2z = Math.max(gz, ly);

  _v3c.set(_v3b.x - i1x + Cx, _v3b.y - i1y + Cx, _v3b.z - i1z + Cx);
  _v3d.set(_v3b.x - i2x + Cy, _v3b.y - i2y + Cy, _v3b.z - i2z + Cy);
  _v3e.set(_v3b.x - 0.5, _v3b.y - 0.5, _v3b.z - 0.5);

  mod289v3(_v3a, _v3a);

  _v4a.set(_v3a.z, _v3a.z + i1z, _v3a.z + i2z, _v3a.z + 1.0);
  permute(_v4a, _v4a);
  _v4a.x += _v3a.y;
  _v4a.y += _v3a.y + i1y;
  _v4a.z += _v3a.y + i2y;
  _v4a.w += _v3a.y + 1.0;
  permute(_v4a, _v4a);
  _v4a.x += _v3a.x;
  _v4a.y += _v3a.x + i1x;
  _v4a.z += _v3a.x + i2x;
  _v4a.w += _v3a.x + 1.0;
  permute(_v4a, _v4a);

  const nsx = 0.142857142857 * 2.0;
  const nsy = 0.142857142857 * 1.0 - 1.0;
  const nsz = 0.142857142857 * 0.5;

  _v4b.x = _v4a.x - 49.0 * Math.floor(_v4a.x * nsz * nsz);
  _v4b.y = _v4a.y - 49.0 * Math.floor(_v4a.y * nsz * nsz);
  _v4b.z = _v4a.z - 49.0 * Math.floor(_v4a.z * nsz * nsz);
  _v4b.w = _v4a.w - 49.0 * Math.floor(_v4a.w * nsz * nsz);

  _v4c.x = Math.floor(_v4b.x * nsz);
  _v4c.y = Math.floor(_v4b.y * nsz);
  _v4c.z = Math.floor(_v4b.z * nsz);
  _v4c.w = Math.floor(_v4b.w * nsz);

  _v4d.x = Math.floor(_v4b.x - 7.0 * _v4c.x);
  _v4d.y = Math.floor(_v4b.y - 7.0 * _v4c.y);
  _v4d.z = Math.floor(_v4b.z - 7.0 * _v4c.z);
  _v4d.w = Math.floor(_v4b.w - 7.0 * _v4c.w);

  _v4e.x = _v4c.x * nsx + nsy;
  _v4e.y = _v4c.y * nsx + nsy;
  _v4e.z = _v4c.z * nsx + nsy;
  _v4e.w = _v4c.w * nsx + nsy;

  _v4f.x = _v4d.x * nsx + nsy;
  _v4f.y = _v4d.y * nsx + nsy;
  _v4f.z = _v4d.z * nsx + nsy;
  _v4f.w = _v4d.w * nsx + nsy;

  const hx = 1.0 - Math.abs(_v4e.x) - Math.abs(_v4f.x);
  const hy = 1.0 - Math.abs(_v4e.y) - Math.abs(_v4f.y);
  const hz = 1.0 - Math.abs(_v4e.z) - Math.abs(_v4f.z);
  const hw = 1.0 - Math.abs(_v4e.w) - Math.abs(_v4f.w);

  const shx = hx < 0 ? 1 : 0;
  const shy = hy < 0 ? 1 : 0;
  const shz = hz < 0 ? 1 : 0;
  const shw = hw < 0 ? 1 : 0;

  const a0x = _v4e.x + (Math.floor(_v4e.x * 2.0 + 1.0) * 2.0 + 1.0) * shx;
  const a0y = _v4f.x + (Math.floor(_v4f.x * 2.0 + 1.0) * 2.0 + 1.0) * shx;
  const a0z = hx;
  const a1x = _v4e.y + (Math.floor(_v4e.y * 2.0 + 1.0) * 2.0 + 1.0) * shy;
  const a1y = _v4f.y + (Math.floor(_v4f.y * 2.0 + 1.0) * 2.0 + 1.0) * shy;
  const a1z = hy;
  const a2x = _v4e.z + (Math.floor(_v4e.z * 2.0 + 1.0) * 2.0 + 1.0) * shz;
  const a2y = _v4f.z + (Math.floor(_v4f.z * 2.0 + 1.0) * 2.0 + 1.0) * shz;
  const a2z = hz;
  const a3x = _v4e.w + (Math.floor(_v4e.w * 2.0 + 1.0) * 2.0 + 1.0) * shw;
  const a3y = _v4f.w + (Math.floor(_v4f.w * 2.0 + 1.0) * 2.0 + 1.0) * shw;
  const a3z = hw;

  _v4c.set(
    a0x * a0x + a0y * a0y + a0z * a0z,
    a1x * a1x + a1y * a1y + a1z * a1z,
    a2x * a2x + a2y * a2y + a2z * a2z,
    a3x * a3x + a3y * a3y + a3z * a3z
  );
  taylorInvSqrt(_v4c, _v4c);

  const p0x = a0x * _v4c.x;
  const p0y = a0y * _v4c.x;
  const p0z = a0z * _v4c.x;
  const p1x = a1x * _v4c.y;
  const p1y = a1y * _v4c.y;
  const p1z = a1z * _v4c.y;
  const p2x = a2x * _v4c.z;
  const p2y = a2y * _v4c.z;
  const p2z = a2z * _v4c.z;
  const p3x = a3x * _v4c.w;
  const p3y = a3y * _v4c.w;
  const p3z = a3z * _v4c.w;

  let m0 = Math.max(0.6 - (_v3b.x * _v3b.x + _v3b.y * _v3b.y + _v3b.z * _v3b.z), 0.0);
  let m1 = Math.max(0.6 - (_v3c.x * _v3c.x + _v3c.y * _v3c.y + _v3c.z * _v3c.z), 0.0);
  let m2 = Math.max(0.6 - (_v3d.x * _v3d.x + _v3d.y * _v3d.y + _v3d.z * _v3d.z), 0.0);
  let m3 = Math.max(0.6 - (_v3e.x * _v3e.x + _v3e.y * _v3e.y + _v3e.z * _v3e.z), 0.0);

  m0 *= m0;
  m1 *= m1;
  m2 *= m2;
  m3 *= m3;

  return (
    42.0 *
    (m0 * m0 * (p0x * _v3b.x + p0y * _v3b.y + p0z * _v3b.z) +
      m1 * m1 * (p1x * _v3c.x + p1y * _v3c.y + p1z * _v3c.z) +
      m2 * m2 * (p2x * _v3d.x + p2y * _v3d.y + p2z * _v3d.z) +
      m3 * m3 * (p3x * _v3e.x + p3y * _v3e.y + p3z * _v3e.z))
  );
}

function potential(p, offset, drift) {
  _v3a.copy(p).add(offset).add(drift);
  return snoise3(_v3a);
}

function curlNoise(p, w, scale, out) {
  const e = 0.02;
  _v3d.set(w * 0.04, w * 0.03, w * 0.02);
  _v3a.copy(p).multiplyScalar(scale);

  const cx =
    (potential(_v3b.set(_v3a.x, _v3a.y + e, _v3a.z), OZ, _v3d) -
      potential(_v3b.set(_v3a.x, _v3a.y - e, _v3a.z), OZ, _v3d) -
      (potential(_v3b.set(_v3a.x, _v3a.y, _v3a.z + e), OY, _v3d) -
        potential(_v3b.set(_v3a.x, _v3a.y, _v3a.z - e), OY, _v3d))) /
    (2.0 * e);

  const cy =
    (potential(_v3b.set(_v3a.x, _v3a.y, _v3a.z + e), OX, _v3d) -
      potential(_v3b.set(_v3a.x, _v3a.y, _v3a.z - e), OX, _v3d) -
      (potential(_v3b.set(_v3a.x + e, _v3a.y, _v3a.z), OZ, _v3d) -
        potential(_v3b.set(_v3a.x - e, _v3a.y, _v3a.z), OZ, _v3d))) /
    (2.0 * e);

  const cz =
    (potential(_v3b.set(_v3a.x + e, _v3a.y, _v3a.z), OY, _v3d) -
      potential(_v3b.set(_v3a.x - e, _v3a.y, _v3a.z), OY, _v3d) -
      (potential(_v3b.set(_v3a.x, _v3a.y + e, _v3a.z), OX, _v3d) -
        potential(_v3b.set(_v3a.x, _v3a.y - e, _v3a.z), OX, _v3d))) /
    (2.0 * e);

  return out.set(cx, cy, cz);
}

function fluidFlow(p, w, out) {
  const scale = 0.5;

  curlNoise(p, w, scale, _v3a);
  _v3b.set(p.x + 2.1, p.y + 5.3, p.z + 1.7);
  curlNoise(_v3b, w * 0.7 + 1.1, scale * 2.0, _v3b);

  return out.copy(_v3a).multiplyScalar(1.25).addScaledVector(_v3b, 0.65);
}

export function getMorphedPosition(base, aPhase, time, uniforms, target) {
  const w = time * uniforms.uFlowSpeed.value + aPhase;
  fluidFlow(base, w, _v3a);
  return target.copy(base).addScaledVector(_v3a, uniforms.uDisplacement.value);
}
