import {
  ZONE_MAX,
  ZONE_RADIUS,
  ZONE_STRENGTH,
  ZONE_RAMP_TAU,
  ZONE_NOISE_SCALE_MIN,
  ZONE_NOISE_SCALE_MAX,
  ZONE_NOISE_OFFSET_RANGE,
} from '../config.js';

export { ZONE_MAX, ZONE_RADIUS, ZONE_STRENGTH };

function falloff(dist, radius) {
  if (dist >= radius || radius <= 0) return 0;
  const t = 1 - dist / radius;
  return t * t * (3 - 2 * t);
}

export class StoneField {
  constructor(maxZones = ZONE_MAX) {
    this.maxZones = maxZones;
    this.stones = [];
    // Flat Float32Array mirrors for CPU picking: [x, y, z, activeRadius] per zone.
    this._stoneData = new Float32Array(maxZones * 4);
    // Seed data per zone: [ox, oy, oz, scale].
    this._seedData = new Float32Array(maxZones * 4);
  }

  addStone(x, y, z, radius = ZONE_RADIUS) {
    if (this.stones.length >= this.maxZones) this.stones.shift();

    const ox = (Math.random() - 0.5) * ZONE_NOISE_OFFSET_RANGE;
    const oy = (Math.random() - 0.5) * ZONE_NOISE_OFFSET_RANGE;
    const oz = (Math.random() - 0.5) * ZONE_NOISE_OFFSET_RANGE;
    const scale = ZONE_NOISE_SCALE_MIN + Math.random() * (ZONE_NOISE_SCALE_MAX - ZONE_NOISE_SCALE_MIN);
    this.stones.push({ x, y, z, radius, power: 1, ox, oy, oz, scale });
  }

  update(dt) {
    if (this.stones.length === 0 || dt <= 0) return;
    const factor = 1 - Math.exp(-dt / Math.max(1e-4, ZONE_RAMP_TAU));
    for (const s of this.stones) {
      if (s.power >= 1) continue;
      s.power = Math.min(1, s.power + (1 - s.power) * factor);
      if (s.power >= 0.999) s.power = 1;
    }
  }

  get count() { return this.stones.length; }

  get isRamping() { return this.stones.some((s) => s.power < 1); }

  // Writes all zone data into GPU uniforms and CPU mirror arrays.
  syncUniforms(uniforms) {
    const uStones = uniforms.uStones.value;
    const uSeeds  = uniforms.uStoneSeeds.value;

    for (let i = 0; i < this.maxZones; i++) {
      const b = i * 4;
      if (i < this.stones.length) {
        const s = this.stones[i];
        const r = s.radius * s.power;
        uStones[i].set(s.x, s.y, s.z, r);
        uSeeds[i].set(s.ox, s.oy, s.oz, s.scale);
        this._stoneData[b]     = s.x;
        this._stoneData[b + 1] = s.y;
        this._stoneData[b + 2] = s.z;
        this._stoneData[b + 3] = r;
        this._seedData[b]      = s.ox;
        this._seedData[b + 1]  = s.oy;
        this._seedData[b + 2]  = s.oz;
        this._seedData[b + 3]  = s.scale;   // was missing — fixes CPU pick accuracy
      } else {
        uStones[i].set(0, 0, 0, 0);
        uSeeds[i].set(0, 0, 0, 0);
        this._stoneData[b] = this._stoneData[b+1] = this._stoneData[b+2] = this._stoneData[b+3] = 0;
        this._seedData[b]  = this._seedData[b+1]  = this._seedData[b+2]  = this._seedData[b+3]  = 0;
      }
    }

    uniforms.uStoneCount.value = this.stones.length;
  }

  // Call once at init to zero-out the GPU uniforms.
  initUniforms(uniforms) {
    uniforms.uStoneCount.value = 0;
    this.syncUniforms(uniforms);
  }
}
