/**
 * particlePick.js — click → the visible clump under the cursor → world point.
 *
 * Particle positions live only on the GPU (each element's own ParticleSim state
 * texture), so this reads those textures back on demand and does a screen-space
 * search against the *real* positions — across ALL THREE visible particle
 * systems (mesh cloud, GPU trail heads, flow dots), not just the mesh cloud.
 * Trails + flow dots together make up the majority of what's actually on
 * screen (see config.js's CLOUD_COUNT/TRAIL_COUNT/FLOW_DOTS_COUNT), so a
 * mesh-only picker would report "void" on a large fraction of clicks that
 * visibly land on a trail ribbon or a flow dot.
 *
 * Picking is CLUSTER-based (not depth-based). For each click:
 *   1. Gather every particle (from any enabled source) projected within
 *      `pixelRadius` of the cursor (in front of the camera, past a small
 *      `lensGuard` so blooms never fire on the lens).
 *   2. Score each candidate by local density = neighbours within `clusterRadius`
 *      (world space) among the gathered candidates — mixing sources freely (a
 *      trail head next to a mesh particle still counts as one dense clump).
 *   3. Pick the NEAREST candidate whose density ≥ `clusterMin` — the front-most
 *      visible clump (a near clump correctly occludes a far one). If none reach
 *      the threshold, fall back to the candidate closest to the cursor centre, so
 *      a click on sparse particles still counts.
 *   4. Report the winning cluster's CENTROID (or the lone particle on fallback).
 *   Nothing under the cursor → returns null (clicking the void does nothing).
 *
 * Fires `onPick` with the winning hit (no visual marker).
 */

import * as THREE from 'three';
import {
  PICK_PIXEL_RADIUS,
  PICK_CLUSTER_RADIUS,
  PICK_CLUSTER_MIN,
  PICK_LENS_GUARD,
  PICK_DRAG_TOLERANCE_PX,
} from '../config.js';

export function createParticlePicker({
  renderer,
  camera,
  particleSim,
  count,
  trail = null,       // optional GPUTrails instance — its head sim is pickable too
  flowDots = null,     // optional FlowDots instance — its sim is pickable too
  pixelRadius = PICK_PIXEL_RADIUS,       // cursor tolerance in screen pixels
  clusterRadius = PICK_CLUSTER_RADIUS,   // world radius defining a clump
  clusterMin = PICK_CLUSTER_MIN,         // min neighbours to count as a cluster
  lensGuard = PICK_LENS_GUARD,           // ignore particles closer than this
  dragTolerancePx = PICK_DRAG_TOLERANCE_PX,
  onPick = null,
} = {}) {
  const dom = renderer.domElement;

  // Mutable knobs.
  const cfg = { clusterRadius, clusterMin, lensGuard, pixelRadius };
  // Mesh mix can change particle count at track bake — keep pick loop in sync.
  let liveCount = count;
  let meshSim = particleSim;

  // ── Picking ──────────────────────────────────────────────────────────────────
  // One readback buffer PER SOURCE (each sim has its own texture size), reused
  // across clicks to avoid per-click GC.
  let posBufMesh = null, posBufTrail = null, posBufDots = null;
  const _w = new THREE.Vector3();
  const _view = new THREE.Vector3();
  const _ndc = new THREE.Vector3();

  // Candidate scratch (flat arrays, grown as needed) to avoid per-click GC.
  let cx = new Float32Array(0), cy, cz, cd, cp, cDens;
  function ensureCap(n) {
    if (cx.length >= n) return;
    cx = new Float32Array(n); cy = new Float32Array(n); cz = new Float32Array(n);
    cd = new Float32Array(n); cp = new Float32Array(n); cDens = new Int32Array(n);
  }

  function pick(clientX, clientY) {
    // Fresh camera matrices (camera keeps flying between rendered frames).
    camera.updateMatrixWorld();
    camera.matrixWorldInverse.copy(camera.matrixWorld).invert();

    const rect = dom.getBoundingClientRect();
    const px = clientX - rect.left;
    const py = clientY - rect.top;
    const W = dom.clientWidth;
    const H = dom.clientHeight;
    const radiusSq = cfg.pixelRadius * cfg.pixelRadius;

    // 1. Gather candidates under the cursor, across every enabled source.
    const maxTotal = liveCount + (trail?.count ?? 0) + (flowDots?.count ?? 0);
    ensureCap(maxTotal);
    let k = 0;
    const gather = (posBuf, n) => {
      for (let i = 0; i < n; i++) {
        const o = i * 4;
        _w.set(posBuf[o], posBuf[o + 1], posBuf[o + 2]);

        _view.copy(_w).applyMatrix4(camera.matrixWorldInverse);
        if (_view.z > -camera.near) continue;         // behind camera
        const depth = -_view.z;
        if (depth < cfg.lensGuard) continue;          // too close (lens guard)

        _ndc.copy(_w).project(camera);
        const sx = (_ndc.x * 0.5 + 0.5) * W;
        const sy = (-_ndc.y * 0.5 + 0.5) * H;
        const dx = sx - px;
        const dy = sy - py;
        const pd = dx * dx + dy * dy;
        if (pd > radiusSq) continue;

        cx[k] = _w.x; cy[k] = _w.y; cz[k] = _w.z; cd[k] = depth; cp[k] = pd;
        k++;
      }
    };

    if (meshSim) {
      posBufMesh = meshSim.readPositions(posBufMesh);
      gather(posBufMesh, liveCount);
    }
    if (trail?.sim) {
      posBufTrail = trail.sim.readPositions(posBufTrail);
      gather(posBufTrail, trail.count);
    }
    if (flowDots?.sim) {
      posBufDots = flowDots.sim.readPositions(posBufDots);
      gather(posBufDots, flowDots.count);
    }

    if (k === 0) {                                   // nothing under the cursor
      return null;
    }

    // 2. Local density: neighbours within clusterRadius (world) among candidates.
    const r2 = cfg.clusterRadius * cfg.clusterRadius;
    for (let i = 0; i < k; i++) {
      let dens = 0;
      const ax = cx[i], ay = cy[i], az = cz[i];
      for (let j = 0; j < k; j++) {
        if (j === i) continue;
        const ddx = ax - cx[j], ddy = ay - cy[j], ddz = az - cz[j];
        if (ddx * ddx + ddy * ddy + ddz * ddz <= r2) dens++;
      }
      cDens[i] = dens;
    }

    // 3. Nearest candidate whose density ≥ clusterMin (front-most clump); else the
    //    candidate closest to the cursor centre (sparse fallback).
    let win = -1;
    let bestDepth = Infinity;
    for (let i = 0; i < k; i++) {
      if (cDens[i] >= cfg.clusterMin && cd[i] < bestDepth) { bestDepth = cd[i]; win = i; }
    }
    const isCluster = win >= 0;
    if (!isCluster) {
      let bestPix = Infinity;
      for (let i = 0; i < k; i++) {
        if (cp[i] < bestPix) { bestPix = cp[i]; win = i; }
      }
    }

    // 4. Centroid of the winning cluster (winner + its neighbours); the lone
    //    particle itself on the sparse fallback.
    let wx = cx[win], wy = cy[win], wz = cz[win], n = 1;
    if (isCluster) {
      const ax = cx[win], ay = cy[win], az = cz[win];
      wx = 0; wy = 0; wz = 0; n = 0;
      for (let j = 0; j < k; j++) {
        const ddx = ax - cx[j], ddy = ay - cy[j], ddz = az - cz[j];
        if (ddx * ddx + ddy * ddy + ddz * ddz <= r2) { wx += cx[j]; wy += cy[j]; wz += cz[j]; n++; }
      }
      wx /= n; wy /= n; wz /= n;
    }
    _w.set(wx, wy, wz);

    return { world: _w.clone(), cluster: isCluster, clusterSize: n };
  }

  // ── Click vs. steer-drag ───────────────────────────────────────────────────
  let down = null;
  const dragTolSq = dragTolerancePx * dragTolerancePx;

  function onPointerDown(e) {
    if (e.button !== 0) return;
    down = { x: e.clientX, y: e.clientY };
  }
  function onPointerUp(e) {
    if (e.button !== 0 || !down) return;
    const dx = e.clientX - down.x;
    const dy = e.clientY - down.y;
    down = null;
    if (dx * dx + dy * dy > dragTolSq) {
      return;   // this was a steering drag
    }

    const hit = pick(e.clientX, e.clientY);
    if (!hit) return;
    if (onPick) onPick(hit);
  }

  dom.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointerup', onPointerUp);

  return {
    pick,
    cfg,
    setCount(n) { liveCount = Math.max(0, n | 0); },
    setParticleSim(sim) { meshSim = sim || null; },
    setClusterMin(v) { cfg.clusterMin = v; },
    setClusterRadius(v) { cfg.clusterRadius = v; },
    dispose() {
      dom.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointerup', onPointerUp);
    },
  };
}
