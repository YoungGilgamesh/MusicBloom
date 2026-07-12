import * as THREE from 'three';
import { ScreenPickGrid } from './screenPickGrid.js';
import { computeMorphedPositions } from '../particles/flowFieldCore.js';

const CLICK_MOVE_TOLERANCE_PX = 6;
const PICK_RADIUS_SCALE = 0.55;
const MIN_PICK_RADIUS_PX = 10;

const _world = new THREE.Vector3();
const _projected = new THREE.Vector3();
const _view = new THREE.Vector3();
const _screen = new THREE.Vector2();
const _pickGrid = new ScreenPickGrid();

let _pickScratch = null;
let _pickAttr = null;

function worldToScreenPx(worldPos, camera, width, height, out = _screen) {
  _projected.copy(worldPos).project(camera);
  out.x = (_projected.x * 0.5 + 0.5) * width;
  out.y = (-_projected.y * 0.5 + 0.5) * height;
  return out;
}

function buildPickPositions(pointCloud, stoneField) {
  const geometry = pointCloud.geometry;
  const uniforms = pointCloud.material.uniforms;
  const count = geometry.attributes.position.count;

  if (!_pickScratch || _pickScratch.length !== count * 3) {
    _pickScratch = new Float32Array(count * 3);
    _pickAttr = new THREE.BufferAttribute(_pickScratch, 3);
  }

  computeMorphedPositions(
    geometry.attributes.position.array,
    geometry.attributes.aPhase.array,
    count,
    uniforms.uTime.value,
    uniforms.uFlowSpeed.value,
    uniforms.uDisplacement.value,
    stoneField._stoneData,
    stoneField._seedData,
    stoneField.count,
    uniforms.uStoneStrength.value,
    _pickScratch
  );

  return _pickAttr;
}

function pickMorphedParticle(pointCloud, stoneField, camera, clickX, clickY, domElement, debug = false) {
  const geometry = pointCloud.geometry;
  const morphed = buildPickPositions(pointCloud, stoneField);
  const sizes = geometry.attributes.aSize;
  const uniforms = pointCloud.material.uniforms;

  const width = domElement.clientWidth;
  const height = domElement.clientHeight;
  const rect = domElement.getBoundingClientRect();
  const clickPxX = clickX - rect.left;
  const clickPxY = clickY - rect.top;

  camera.updateMatrixWorld(true);
  pointCloud.updateMatrixWorld(true);

  const matrixWorld = pointCloud.matrixWorld;
  const viewMatrix = camera.matrixWorldInverse;
  const count = morphed.count;

  _pickGrid.build(morphed, matrixWorld, camera, width, height, count);

  let bestIndex = -1;
  let bestPosition = null;
  let bestDistSq = Infinity;
  let nearestDistSq = Infinity;
  let candidatesChecked = 0;

  _pickGrid.forEachCandidate(clickPxX, clickPxY, (i) => {
    candidatesChecked++;
    _world.set(morphed.getX(i), morphed.getY(i), morphed.getZ(i)).applyMatrix4(matrixWorld);

    worldToScreenPx(_world, camera, width, height, _screen);
    const dx = _screen.x - clickPxX;
    const dy = _screen.y - clickPxY;
    const distSq = dx * dx + dy * dy;

    if (distSq < nearestDistSq) {
      nearestDistSq = distSq;
    }

    _view.copy(_world).applyMatrix4(viewMatrix);
    const sizeAtten = 90.0 / Math.max(-_view.z, 0.8);
    const pointDiameterPx = uniforms.uPointSize.value * sizes.getX(i) * sizeAtten;
    const pickRadiusPx = Math.max(MIN_PICK_RADIUS_PX, pointDiameterPx * PICK_RADIUS_SCALE);
    const pickRadiusSq = pickRadiusPx * pickRadiusPx;

    if (distSq <= pickRadiusSq && distSq < bestDistSq) {
      bestDistSq = distSq;
      bestIndex = i;
      bestPosition = _world.clone();
    }
  });

  if (debug) {
    if (bestPosition) {
      console.log(
        '[pick] hit index',
        bestIndex,
        'screen dist px:',
        Math.sqrt(bestDistSq).toFixed(1),
        'candidates:',
        candidatesChecked
      );
    } else {
      console.log(
        '[pick] miss, nearest px:',
        Math.sqrt(nearestDistSq).toFixed(1),
        'candidates:',
        candidatesChecked
      );
    }
  }

  if (bestIndex < 0) return null;

  const positions = geometry.attributes.position;
  const baseLocal = new THREE.Vector3(
    positions.getX(bestIndex),
    positions.getY(bestIndex),
    positions.getZ(bestIndex)
  );

  return { index: bestIndex, worldPoint: bestPosition, baseLocal };
}

export function pickAtClientPosition({
  pointCloud,
  stoneField,
  camera,
  renderer,
  clientX,
  clientY,
  debug = false,
}) {
  return pickMorphedParticle(
    pointCloud,
    stoneField,
    camera,
    clientX,
    clientY,
    renderer.domElement,
    debug
  );
}

export function setupClickPainting({
  camera,
  renderer,
  scene,
  pointCloud,
  stoneField,
  onPaint,
  showMarkers = true,
  markerRadius = 0.028,
  debug = false,
} = {}) {
  let pointerDown = null;
  const domElement = renderer.domElement;

  const markers = new THREE.Group();
  if (showMarkers && scene) scene.add(markers);

  const markerGeometry = new THREE.SphereGeometry(markerRadius, 10, 10);
  const markerMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000, toneMapped: false });
  let currentMarker = null;

  function placeMarker(worldPoint) {
    if (!showMarkers || !scene) return;
    // Replace previous marker so they don't accumulate.
    if (currentMarker) markers.remove(currentMarker);
    currentMarker = new THREE.Mesh(markerGeometry, markerMaterial);
    currentMarker.position.copy(worldPoint);
    markers.add(currentMarker);
  }

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
      if (debug) console.log('[pick] ignored drag');
      return;
    }

    const hit = pickMorphedParticle(
      pointCloud,
      stoneField,
      camera,
      event.clientX,
      event.clientY,
      domElement,
      debug
    );

    if (!hit) return;

    placeMarker(hit.worldPoint);
    if (onPaint) onPaint(hit);
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
      if (scene) scene.remove(markers);
    },
  };
}
