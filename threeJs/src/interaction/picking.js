import * as THREE from 'three';
import { getMorphedPosition } from '../particles/displacement.js';

const CLICK_MOVE_TOLERANCE_PX = 6;
const RAYCAST_THRESHOLD = 0.5;
const SCREEN_FALLBACK_RADIUS_PX = 72;
const MAX_SCREEN_HIT_PX = 32;

const _mouse = new THREE.Vector2();
const _world = new THREE.Vector3();
const _morphed = new THREE.Vector3();
const _projected = new THREE.Vector3();
const _view = new THREE.Vector3();
const _base = new THREE.Vector3();

function toScreenPx(projected, width, height, out) {
  out.x = (projected.x * 0.5 + 0.5) * width;
  out.y = (-projected.y * 0.5 + 0.5) * height;
  return out;
}

function screenDistSq(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

function collectCandidateIndices(pointCloud, camera, clickPxX, clickPxY, width, height) {
  const indices = new Set();
  const raycaster = new THREE.Raycaster();
  raycaster.params.Points.threshold = RAYCAST_THRESHOLD;

  raycaster.setFromCamera(_mouse, camera);
  const hits = raycaster.intersectObject(pointCloud, false);
  for (const hit of hits.slice(0, 40)) {
    if (hit.index !== undefined) indices.add(hit.index);
  }

  if (indices.size > 0) {
    return [...indices];
  }

  const geometry = pointCloud.geometry;
  const positions = geometry.attributes.position;
  const matrixWorld = pointCloud.matrixWorld;
  const fallbackRadiusSq = SCREEN_FALLBACK_RADIUS_PX * SCREEN_FALLBACK_RADIUS_PX;

  for (let i = 0; i < positions.count; i++) {
    _base.fromBufferAttribute(positions, i);
    _world.copy(_base).applyMatrix4(matrixWorld);
    _projected.copy(_world).project(camera);

    if (_projected.z < -1 || _projected.z > 1) continue;

    toScreenPx(_projected, width, height, _projected);
    if (screenDistSq(_projected.x, _projected.y, clickPxX, clickPxY) <= fallbackRadiusSq) {
      indices.add(i);
    }
  }

  return [...indices];
}

function pickMorphedParticle(pointCloud, camera, clickX, clickY, domElement, time) {
  const geometry = pointCloud.geometry;
  const positions = geometry.attributes.position;
  const phases = geometry.attributes.aPhase;
  const sizes = geometry.attributes.aSize;
  const uniforms = pointCloud.material.uniforms;

  const width = domElement.clientWidth;
  const height = domElement.clientHeight;
  const rect = domElement.getBoundingClientRect();
  const clickPxX = clickX - rect.left;
  const clickPxY = clickY - rect.top;

  _mouse.x = (clickPxX / width) * 2 - 1;
  _mouse.y = -(clickPxY / height) * 2 + 1;

  camera.updateMatrixWorld(true);
  pointCloud.updateMatrixWorld(true);

  const matrixWorld = pointCloud.matrixWorld;
  const viewMatrix = camera.matrixWorldInverse;
  const candidates = collectCandidateIndices(
    pointCloud,
    camera,
    clickPxX,
    clickPxY,
    width,
    height
  );

  if (candidates.length === 0) return null;

  let bestPosition = null;
  let bestScore = Infinity;

  for (const i of candidates) {
    _base.fromBufferAttribute(positions, i);
    const aPhase = phases.getX(i);
    const aSize = sizes.getX(i);

    getMorphedPosition(_base, aPhase, time, uniforms, _morphed);
    if (!Number.isFinite(_morphed.x + _morphed.y + _morphed.z)) continue;

    _world.copy(_morphed).applyMatrix4(matrixWorld);
    _projected.copy(_world).project(camera);

    if (_projected.z < -1 || _projected.z > 1) continue;

    toScreenPx(_projected, width, height, _projected);
    const distSq = screenDistSq(_projected.x, _projected.y, clickPxX, clickPxY);

    _view.copy(_world).applyMatrix4(viewMatrix);
    const sizeAtten = 90.0 / Math.max(-_view.z, 0.8);
    const pointRadiusPx = uniforms.uPointSize.value * aSize * sizeAtten * 0.5;
    const maxHitPx = Math.max(MAX_SCREEN_HIT_PX, pointRadiusPx * 1.5);
    const maxHitSq = maxHitPx * maxHitPx;

    if (distSq > maxHitSq) continue;

    const score = distSq - _view.z * 0.001;
    if (score < bestScore) {
      bestScore = score;
      bestPosition = _world.clone();
    }
  }

  return bestPosition;
}

export function setupClickMarkers({
  camera,
  renderer,
  scene,
  pointCloud,
  getTime,
  markerRadius = 0.028,
  markerColor = 0xff0000,
  debug = false,
} = {}) {
  const markers = new THREE.Group();
  scene.add(markers);

  const markerGeometry = new THREE.SphereGeometry(markerRadius, 10, 10);
  const markerMaterial = new THREE.MeshBasicMaterial({
    color: markerColor,
    toneMapped: false,
  });

  let pointerDown = null;
  const domElement = renderer.domElement;

  function onPointerDown(event) {
    if (event.button !== 0) return;
    pointerDown = { x: event.clientX, y: event.clientY };
  }

  function onPointerUp(event) {
    if (event.button !== 0 || !pointerDown) return;

    const dx = event.clientX - pointerDown.x;
    const dy = event.clientY - pointerDown.y;
    pointerDown = null;

    if (dx * dx + dy * dy > CLICK_MOVE_TOLERANCE_PX * CLICK_MOVE_TOLERANCE_PX) {
      return;
    }

    const point = pickMorphedParticle(
      pointCloud,
      camera,
      event.clientX,
      event.clientY,
      domElement,
      getTime()
    );

    if (debug) {
      console.log('[pick]', point ? point.toArray() : 'miss');
    }

    if (!point) return;

    const marker = new THREE.Mesh(markerGeometry, markerMaterial);
    marker.position.copy(point);
    markers.add(marker);
  }

  domElement.addEventListener('pointerdown', onPointerDown);
  domElement.addEventListener('pointerup', onPointerUp);

  return {
    markers,
    dispose() {
      domElement.removeEventListener('pointerdown', onPointerDown);
      domElement.removeEventListener('pointerup', onPointerUp);
      markerGeometry.dispose();
      markerMaterial.dispose();
      scene.remove(markers);
    },
  };
}
