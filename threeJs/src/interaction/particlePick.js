/**
 * particlePick.js — click → nearest visible particle → world point.
 *
 * Particle positions live only on the GPU (the ParticleSim state texture), so
 * this reads that texture back on demand and does a screen-space nearest search
 * against the *real* positions. For each click we pick the FRONTMOST particle
 * whose projected screen position falls within `pixelRadius` of the cursor —
 * i.e. the one you actually see under the pointer.
 *
 * For now this just drops a red marker at the hit so we can verify accuracy.
 * The flow-distortion layer will hook in via the `onPick` callback later.
 */

import * as THREE from 'three';

export function createParticlePicker({
  renderer,
  camera,
  scene,
  particleSim,
  count,
  pixelRadius = 16,   // cursor tolerance in screen pixels
  markerRadius = 0.04,
  maxMarkers = 120,   // recycle oldest beyond this so memory stays bounded
  dragTolerancePx = 6,
  minPickDistance = 1.5,  // ignore particles closer than this to the camera, so a
                          // bloom never bursts right on the lens (pick farther ones)
  onPick = null,
  debug = false,
} = {}) {
  const dom = renderer.domElement;

  // ── Marker pool ─────────────────────────────────────────────────────────────
  // depthTest off so every dropped dot stays visible even inside the dense
  // cloud — the point here is to verify where the click landed.
  const markers = new THREE.Group();
  markers.renderOrder = 999;
  scene.add(markers);
  const markerGeo = new THREE.SphereGeometry(markerRadius, 12, 12);
  const markerMat = new THREE.MeshBasicMaterial({
    color: 0xff2233,
    toneMapped: false,
    depthTest: false,
    depthWrite: false,
  });
  const pool = [];

  function placeMarker(world) {
    let m;
    if (pool.length >= maxMarkers) {
      m = pool.shift();            // recycle oldest
    } else {
      m = new THREE.Mesh(markerGeo, markerMat);
      m.renderOrder = 999;
      markers.add(m);
    }
    m.position.copy(world);
    pool.push(m);
  }

  // ── Picking ──────────────────────────────────────────────────────────────────
  let posBuf = null;
  const _w = new THREE.Vector3();
  const _view = new THREE.Vector3();
  const _ndc = new THREE.Vector3();

  function pick(clientX, clientY) {
    posBuf = particleSim.readPositions(posBuf);
    const width = particleSim.width;

    // Fresh camera matrices (camera keeps flying between rendered frames).
    camera.updateMatrixWorld();
    camera.matrixWorldInverse.copy(camera.matrixWorld).invert();

    const rect = dom.getBoundingClientRect();
    const px = clientX - rect.left;
    const py = clientY - rect.top;
    const W = dom.clientWidth;
    const H = dom.clientHeight;
    const radiusSq = pixelRadius * pixelRadius;

    let bestIndex = -1;
    let bestDepth = Infinity;   // smallest view-space depth = frontmost
    let bestWorld = null;

    for (let i = 0; i < count; i++) {
      const o = i * 4;
      _w.set(posBuf[o], posBuf[o + 1], posBuf[o + 2]);

      // Reject anything behind the camera, or too close (would burst on the lens).
      _view.copy(_w).applyMatrix4(camera.matrixWorldInverse);
      if (_view.z > -camera.near) continue;
      const depth = -_view.z;
      if (depth < minPickDistance) continue;

      _ndc.copy(_w).project(camera);
      const sx = (_ndc.x * 0.5 + 0.5) * W;
      const sy = (-_ndc.y * 0.5 + 0.5) * H;
      const dx = sx - px;
      const dy = sy - py;
      if (dx * dx + dy * dy > radiusSq) continue;

      if (depth < bestDepth) {
        bestDepth = depth;
        bestIndex = i;
        bestWorld = _w.clone();
      }
    }

    if (bestIndex < 0) {
      if (debug) console.log('[pick] miss');
      return null;
    }
    if (debug) {
      console.log('[pick] hit', bestIndex,
        'world', bestWorld.toArray().map((v) => v.toFixed(2)),
        'depth', bestDepth.toFixed(2));
    }
    return { index: bestIndex, world: bestWorld };
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
    if (dx * dx + dy * dy > dragTolSq) return;   // this was a steering drag

    const hit = pick(e.clientX, e.clientY);
    if (!hit) return;
    placeMarker(hit.world);
    if (onPick) onPick(hit);
  }

  dom.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointerup', onPointerUp);

  return {
    markers,
    pick,
    clear() {
      for (const m of pool) markers.remove(m);
      pool.length = 0;
    },
    dispose() {
      dom.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointerup', onPointerUp);
      scene.remove(markers);
      markerGeo.dispose();
      markerMat.dispose();
    },
  };
}
