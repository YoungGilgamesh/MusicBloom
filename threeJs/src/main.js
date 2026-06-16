import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createQuantumCloud } from './particles/createQuantumCloud.js';
import { initPicking } from './interaction/picking.js';

const DISPLACEMENT_MARGIN = 2.5;

function fitCameraToCloud(camera, cloud, controls) {
  cloud.geometry.computeBoundingSphere();
  const { center, radius } = cloud.geometry.boundingSphere;
  const fitRadius = radius * DISPLACEMENT_MARGIN;

  const vFov = THREE.MathUtils.degToRad(camera.fov);
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);
  const distV = fitRadius / Math.sin(vFov / 2);
  const distH = fitRadius / Math.sin(hFov / 2);
  const distance = Math.max(distV, distH) * 1.12;

  camera.position.set(center.x, center.y + fitRadius * 0.1, center.z + distance);
  camera.near = Math.max(0.1, distance / 100);
  camera.far = distance * 20;
  camera.updateProjectionMatrix();

  controls.target.copy(center);
  controls.minDistance = fitRadius * 0.35;
  controls.maxDistance = distance * 2.8;
  controls.update();
}

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x030308);

const camera = new THREE.PerspectiveCamera(
  58,
  window.innerWidth / window.innerHeight,
  0.1,
  100
);
camera.position.set(0, 0, 5);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.debug.checkShaderErrors = true;
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.045;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.35;

const particles = createQuantumCloud({ count: 16000 });
scene.add(particles);
fitCameraToCloud(camera, particles, controls);
// Initialize picking (click-to-place marker)
const picking = initPicking({ scene, camera, renderer, particles, pixelThreshold: 12 });

const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);

  particles.material.uniforms.uTime.value = clock.getElapsedTime();

  controls.update();
  renderer.render(scene, camera);
}

animate();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  fitCameraToCloud(camera, particles, controls);
});
