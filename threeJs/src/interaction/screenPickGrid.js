import * as THREE from 'three';

export const GRID_CELL_PX = 48;

const _world = new THREE.Vector3();
const _projected = new THREE.Vector3();

/**
 * Uniform screen-space grid for particle picking.
 * Built once per click; reuses typed arrays to avoid GC churn at high counts.
 */
export class ScreenPickGrid {
  constructor() {
    this.cols = 0;
    this.rows = 0;
    this.counts = null;
    this.offsets = null;
    this.writeHead = null;
    this.indices = null;
  }

  build(morphed, matrixWorld, camera, width, height, count) {
    const cols = Math.max(1, Math.ceil(width / GRID_CELL_PX));
    const rows = Math.max(1, Math.ceil(height / GRID_CELL_PX));
    const numCells = cols * rows;

    if (this.cols !== cols || this.rows !== rows || !this.counts) {
      this.cols = cols;
      this.rows = rows;
      this.counts = new Uint32Array(numCells);
      this.offsets = new Uint32Array(numCells + 1);
      this.writeHead = new Uint32Array(numCells);
      this.indices = new Uint32Array(count);
    } else {
      this.counts.fill(0);
    }

    for (let i = 0; i < count; i++) {
      _world.set(morphed.getX(i), morphed.getY(i), morphed.getZ(i)).applyMatrix4(matrixWorld);
      _projected.copy(_world).applyMatrix4(camera.matrixWorldInverse);
      if (_projected.z >= 0) continue;

      _projected.copy(_world).project(camera);
      const px = (_projected.x * 0.5 + 0.5) * width;
      const py = (-_projected.y * 0.5 + 0.5) * height;

      if (px < 0 || py < 0 || px > width || py > height) continue;

      const cell = Math.floor(py / GRID_CELL_PX) * cols + Math.floor(px / GRID_CELL_PX);
      this.counts[cell]++;
    }

    this.offsets[0] = 0;
    for (let c = 0; c < numCells; c++) {
      this.offsets[c + 1] = this.offsets[c] + this.counts[c];
    }

    this.writeHead.set(this.offsets.subarray(0, numCells));

    for (let i = 0; i < count; i++) {
      _world.set(morphed.getX(i), morphed.getY(i), morphed.getZ(i)).applyMatrix4(matrixWorld);
      _projected.copy(_world).applyMatrix4(camera.matrixWorldInverse);
      if (_projected.z >= 0) continue;

      _projected.copy(_world).project(camera);
      const px = (_projected.x * 0.5 + 0.5) * width;
      const py = (-_projected.y * 0.5 + 0.5) * height;

      if (px < 0 || py < 0 || px > width || py > height) continue;

      const cell = Math.floor(py / GRID_CELL_PX) * cols + Math.floor(px / GRID_CELL_PX);
      this.indices[this.writeHead[cell]++] = i;
    }

    return this;
  }

  forEachCandidate(clickPxX, clickPxY, fn) {
    const cx = Math.floor(clickPxX / GRID_CELL_PX);
    const cy = Math.floor(clickPxY / GRID_CELL_PX);

    for (let dy = -1; dy <= 1; dy++) {
      const row = cy + dy;
      if (row < 0 || row >= this.rows) continue;

      for (let dx = -1; dx <= 1; dx++) {
        const col = cx + dx;
        if (col < 0 || col >= this.cols) continue;

        const cell = row * this.cols + col;
        const start = this.offsets[cell];
        const end = this.offsets[cell + 1];

        for (let n = start; n < end; n++) {
          fn(this.indices[n]);
        }
      }
    }
  }
}
