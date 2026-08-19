/**
 * seedDensity.js — local density estimate for shape seeds, used to cluster trails.
 *
 * Trails look best flowing in bundles along the DENSE parts of the cloud, not as lonely
 * filaments in thin regions. To bias trail spawning toward dense regions we need a cheap
 * per-seed density: how many other seeds sit within a small radius. A uniform grid hash
 * makes this ~O(n) (each point only tests its own + 26 neighbour cells).
 *
 * Returned values are normalized to [0,1] (÷ max count) so callers can weight by
 * density^bias directly. Computed once at load / base-shape change (a few ms for ~20k).
 */

/**
 * @param {Float32Array} positions  length n*3 (shape-local seed positions)
 * @param {number}       radius     neighbourhood radius (world units)
 * @returns {Float32Array}          length n, each in [0,1] (0 = isolated, 1 = densest)
 */
export function computeSeedDensity(positions, radius) {
  const n = (positions.length / 3) | 0;
  const out = new Float32Array(n);
  if (n === 0) return out;

  const inv = 1 / radius;
  const r2 = radius * radius;

  // Grid-cell key: encode integer cell coords into one number. Positions live within a
  // few SHAPE_SCALE of the origin, so a 1024³ range (offset +512) is comfortably unique.
  const key = (gx, gy, gz) => (gx + 512) + (gy + 512) * 1024 + (gz + 512) * 1048576;

  const grid = new Map();
  const gxs = new Int32Array(n), gys = new Int32Array(n), gzs = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    const gx = Math.floor(positions[i * 3]     * inv);
    const gy = Math.floor(positions[i * 3 + 1] * inv);
    const gz = Math.floor(positions[i * 3 + 2] * inv);
    gxs[i] = gx; gys[i] = gy; gzs[i] = gz;
    const k = key(gx, gy, gz);
    let bucket = grid.get(k);
    if (!bucket) { bucket = []; grid.set(k, bucket); }
    bucket.push(i);
  }

  let maxC = 1;
  for (let i = 0; i < n; i++) {
    const x = positions[i * 3], y = positions[i * 3 + 1], z = positions[i * 3 + 2];
    const gx = gxs[i], gy = gys[i], gz = gzs[i];
    let c = 0;
    for (let dz = -1; dz <= 1; dz++)
    for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      const bucket = grid.get(key(gx + dx, gy + dy, gz + dz));
      if (!bucket) continue;
      for (let b = 0; b < bucket.length; b++) {
        const j = bucket[b];
        const ex = positions[j * 3] - x, ey = positions[j * 3 + 1] - y, ez = positions[j * 3 + 2] - z;
        if (ex * ex + ey * ey + ez * ez <= r2) c++;
      }
    }
    out[i] = c;               // includes self (≥1)
    if (c > maxC) maxC = c;
  }

  const norm = 1 / maxC;
  for (let i = 0; i < n; i++) out[i] *= norm;   // → [0,1]
  return out;
}

/**
 * Weighted sampling of `count` seed indices ∝ density^bias (with replacement). A tiny
 * floor keeps thin regions from being *impossible* (so a huge bias doesn't collapse to a
 * single point). bias=0 → uniform.
 *
 * @param {Float32Array} density  normalized densities [0,1], length n
 * @param {number}       count    how many indices to draw
 * @param {number}       bias     density exponent (0 uniform, higher = tighter clusters)
 * @returns {Int32Array}          length count of seed indices
 */
export function densityWeightedIndices(density, count, bias) {
  const n = density.length;
  const idx = new Int32Array(count);
  if (n === 0) return idx;

  // Cumulative weight table for O(log n) sampling.
  const cum = new Float32Array(n);
  let acc = 0;
  for (let i = 0; i < n; i++) {
    acc += Math.pow(density[i] + 0.02, bias);   // small floor avoids zero-probability seeds
    cum[i] = acc;
  }
  const total = acc || 1;

  for (let s = 0; s < count; s++) {
    const r = Math.random() * total;
    // binary search for the first cum >= r
    let lo = 0, hi = n - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] < r) lo = mid + 1; else hi = mid;
    }
    idx[s] = lo;
  }
  return idx;
}
