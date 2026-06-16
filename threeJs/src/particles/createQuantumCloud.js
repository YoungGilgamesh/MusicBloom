import * as THREE from 'three';
import { vertexShader, fragmentShader } from './shaders.js';

function randomInCloud() {
  const r = 0.45;
  return [
    (Math.random() - 0.5) * 3.6 * r,
    (Math.random() - 0.5) * 2.8 * r,
    (Math.random() - 0.5) * 3.2 * r,
  ];
}

export function createQuantumCloud({ count = 16000 } = {}) {
  const positions = new Float32Array(count * 3);
  const phases = new Float32Array(count);
  const sizes = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    const [x, y, z] = randomInCloud();

    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;

    phases[i] = Math.random() * 6.0;
    sizes[i] = 0.45 + Math.random() * 0.35;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
  geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uPointSize: { value: 0.55 },
      uDisplacement: { value: 0.25 },
      uFlowSpeed: { value: 0.9 },
    },
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: true,
    blending: THREE.NormalBlending,
  });

  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;

  return points;
}
