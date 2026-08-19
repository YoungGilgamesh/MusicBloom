/**
 * particleModels.js — load the GLB particle models.
 *
 * Loads each .glb in `srcs`, extracts its first mesh geometry (baking the node's
 * world transform so exporter rotations/scales are applied), and returns the
 * geometries in the same order. Vertex colors / UVs are kept for the cloud shader.
 *
 * Shape keys (morph targets): if a target named "Open" exists (Blender shape key),
 * its relative position/normal deltas are baked into `aMorphOpen` /
 * `aMorphOpenNormal` attributes. The cloud shader slides that morph with the
 * particle birth→death fade (closed at appear/despawn, open while alive).
 *
 * Optional shared albedo: `loadParticleMap(url)`.
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const loader = new GLTFLoader();
const texLoader = new THREE.TextureLoader();

/** Transform relative morph deltas by the node's world 3×3 (rotation + scale, no translate). */
function bakeMorphDeltaAttr(srcAttr, matrixWorld) {
  const attr = srcAttr.clone();
  const e = matrixWorld.elements;
  const v = new THREE.Vector3();
  for (let i = 0; i < attr.count; i++) {
    v.fromBufferAttribute(attr, i);
    const x = v.x, y = v.y, z = v.z;
    attr.setXYZ(
      i,
      e[0] * x + e[4] * y + e[8] * z,
      e[1] * x + e[5] * y + e[9] * z,
      e[2] * x + e[6] * y + e[10] * z,
    );
  }
  attr.needsUpdate = true;
  return attr;
}

function bakeMorphNormalAttr(srcAttr, matrixWorld) {
  const attr = srcAttr.clone();
  const normalMat = new THREE.Matrix3().getNormalMatrix(matrixWorld);
  attr.applyNormalMatrix(normalMat);
  return attr;
}

function zeroAttr(count, itemSize) {
  return new THREE.BufferAttribute(new Float32Array(count * itemSize), itemSize);
}

function firstMeshGeometry(gltf, src) {
  gltf.scene.updateMatrixWorld(true);
  let mesh = null;
  gltf.scene.traverse((o) => { if (!mesh && o.isMesh) mesh = o; });
  if (!mesh) throw new Error(`[models] no mesh found in ${src}`);

  const geom = mesh.geometry.clone();
  const nVerts = geom.getAttribute('position').count;

  // Pull "Open" morph (or index 0) BEFORE applyMatrix4 — relative deltas must not get translation.
  const dict = mesh.morphTargetDictionary || {};
  const openIdx = (dict.Open !== undefined) ? dict.Open
    : (dict.open !== undefined) ? dict.open
    : 0;
  const morphPos = geom.morphAttributes?.position?.[openIdx] || null;
  const morphNor = geom.morphAttributes?.normal?.[openIdx] || null;

  if (morphPos) {
    geom.setAttribute('aMorphOpen', bakeMorphDeltaAttr(morphPos, mesh.matrixWorld));
  } else {
    geom.setAttribute('aMorphOpen', zeroAttr(nVerts, 3));
    console.warn(`[models] ${src}: no morph target "Open" — bloom morph disabled for this mesh`);
  }

  if (morphNor) {
    geom.setAttribute('aMorphOpenNormal', bakeMorphNormalAttr(morphNor, mesh.matrixWorld));
  } else {
    geom.setAttribute('aMorphOpenNormal', zeroAttr(nVerts, 3));
  }

  // Drop native morph payload — custom shader drives aMorphOpen* instead.
  geom.morphAttributes = {};
  geom.morphTargetsRelative = false;

  // Bake the node's world transform into base position/normal/color/uv.
  geom.applyMatrix4(mesh.matrixWorld);

  return geom;
}

/**
 * @param {string[]} srcs - URLs to .glb files (served from public/)
 * @returns {Promise<import('three').BufferGeometry[]>} geometries in src order
 */
export async function loadParticleGeometries(srcs) {
  const gltfs = await Promise.all(srcs.map((s) => loader.loadAsync(s)));
  return gltfs.map((gltf, i) => firstMeshGeometry(gltf, srcs[i]));
}

/**
 * Load a shared albedo map for textured particle models (e.g. flower_texture.jpg).
 * @param {string} url
 * @returns {Promise<THREE.Texture>}
 */
export async function loadParticleMap(url) {
  const tex = await texLoader.loadAsync(url);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.flipY = false; // match glTF UV convention
  return tex;
}

/**
 * Preload all MESH_TYPES libraries (geometries + optional maps) into a cache.
 * @param {Record<string, { srcs: string[], map: string|null, scales: number[], sizeMul?: number, marble?: boolean, cost?: number }>} meshTypes
 * @returns {Promise<Record<string, {
 *   id: string, geoms: THREE.BufferGeometry[], map: THREE.Texture|null,
 *   scales: number[], sizeMul: number, marble: boolean, cost: number
 * }>>}
 */
export async function loadMeshTypeCache(meshTypes) {
  const ids = Object.keys(meshTypes);
  const cache = {};
  await Promise.all(ids.map(async (id) => {
    const t = meshTypes[id];
    const [geoms, map] = await Promise.all([
      loadParticleGeometries(t.srcs),
      t.map ? loadParticleMap(t.map) : Promise.resolve(null),
    ]);
    cache[id] = {
      id,
      geoms,
      map,
      scales: t.scales || geoms.map(() => 1),
      sizeMul: t.sizeMul ?? 1,
      marble: !!t.marble,
      cost: t.cost ?? 1,
    };
  }));
  return cache;
}
