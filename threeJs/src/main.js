import * as THREE from 'three';
import { createQuantumCloud, resampleAll6 } from './particles/createQuantumCloud.js';
import { ParticleSim } from './particles/particleSim.js';
import { createFlyControls } from './interaction/flyControls.js';
import { createParticlePicker } from './interaction/particlePick.js';
import { BloomField } from './interaction/bloomField.js';
import { createPrecomputedAnalyser } from './audio/audioPrecompute.js';
import { createMoodDebugPanel } from './debug/moodDebugPanel.js';
import { createTuningPanel } from './debug/tuningPanel.js';
import {
  BG_COLOR,
  CAMERA_FOV,
  AUDIO_SRC,
  LIGHT_COLOR,
  LIGHT_INTENSITY,
  LIGHT_POSITION,
  SIM_VOL_RES,
  SIM_VOL_HALF,
} from './config.js';

// ── Scene setup ───────────────────────────────────────────────────────────────

const scene    = new THREE.Scene();
scene.background = new THREE.Color(BG_COLOR);

const camera = new THREE.PerspectiveCamera(CAMERA_FOV, window.innerWidth / window.innerHeight, 0.1, 100);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.debug.checkShaderErrors = true;
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// Constant-speed forward flight; drag to steer (see flyControls.js).
const controls = createFlyControls(camera, renderer.domElement);

// ── Particles + paint zones ───────────────────────────────────────────────────

// ?count=NNNN URL override for the tuning harness (falls back to CLOUD_COUNT).
const countParam = parseInt(new URLSearchParams(window.location.search).get('count'), 10);
const cloudCount = Number.isFinite(countParam) && countParam > 0 ? countParam : undefined;

const particles  = createQuantumCloud({ count: cloudCount, energy: 0.5, brightness: 0.5, texture: 0.5, heaviness: 0.5, dynamism: 0.5, bpm: 120 });
scene.add(particles);

// GPGPU flow simulation — advects particles along the baked mood velocity
// volume with lifetime + camera-relative respawn.
const particleSim = new ParticleSim(renderer, particles.count, particles.userData.seedPositions);
particles.material.uniforms.uSimW.value = particleSim.width;
particles.material.uniforms.uSimRes.value.set(particleSim.width, particleSim.height);

// ── Baked mood velocity volume ────────────────────────────────────────────────
// The combined field is evaluated onto a SIM_VOL_RES³ grid off the main thread
// (velocityBaker.worker.js) whenever the shape changes.  Both the sim (advection)
// and the cube-orientation shader trilinearly sample this one Data3DTexture.
const volTex = new THREE.Data3DTexture(
  new Float32Array(SIM_VOL_RES ** 3 * 4), SIM_VOL_RES, SIM_VOL_RES, SIM_VOL_RES);
volTex.format = THREE.RGBAFormat;
volTex.type   = THREE.FloatType;
volTex.minFilter = THREE.LinearFilter;
volTex.magFilter = THREE.LinearFilter;
// Sampled in each instance's local space now (per-cell transform), so clamp at
// the shape's bounds rather than repeat.
volTex.wrapS = volTex.wrapT = volTex.wrapR = THREE.ClampToEdgeWrapping;
volTex.needsUpdate = true;
particles.material.uniforms.uVelVolume.value = volTex;
particleSim.setVolume(volTex, SIM_VOL_HALF);

const velocityBaker = new Worker(new URL('./particles/velocityBaker.worker.js', import.meta.url), { type: 'module' });
let bakeJobId = 0;
velocityBaker.onmessage = (e) => {
  const { jobId, data } = e.data;
  if (jobId !== bakeJobId) return;   // a newer bake has superseded this one
  volTex.image.data = data;
  volTex.needsUpdate = true;
};
function bakeVolume(mood, warpOrder) {
  bakeJobId++;
  velocityBaker.postMessage({
    jobId: bakeJobId,
    energy: mood.energy, brightness: mood.brightness, texture: mood.texture,
    heaviness: mood.heaviness, dynamism: mood.dynamism, bpm: mood.bpm,
    warpOrder, res: SIM_VOL_RES, half: SIM_VOL_HALF,
  });
}

// Initial bake — matches the shape createQuantumCloud built (energy & brightness
// are the top-2 warpers when every param is 0.5).
bakeVolume({ energy: 0.5, brightness: 0.5, texture: 0.5, heaviness: 0.5, dynamism: 0.5, bpm: 120 },
  ['energy', 'brightness']);

// ── Light ─────────────────────────────────────────────────────────────────────

const pointLight = new THREE.PointLight(LIGHT_COLOR, LIGHT_INTENSITY, 0);
pointLight.position.set(LIGHT_POSITION.x, LIGHT_POSITION.y, LIGHT_POSITION.z);
scene.add(pointLight);

fitCamera();

// ── Audio ─────────────────────────────────────────────────────────────────────

let audioAnalyser = null;
let audioStarted  = false;
let revealing     = false;   // true once mood is applied, drives reveal animation

// Audio hint hidden while audio is disabled.
const audioHint = createAudioHint();
audioHint.remove();

async function startAudio() {
  if (audioStarted) return;
  audioStarted = true;
  audioHint.textContent = 'loading audio…';
  try {
    audioAnalyser = await createPrecomputedAnalyser(AUDIO_SRC);
    audioHint.remove();

    // TODO (audio rebuild, tomorrow): wire audioAnalyser into the GPGPU pipeline —
    //   • audioAnalyser.mood → shape via contrastMood + resampleAll6 + bakeVolume
    //   • per-frame getAudioData() → modulate flow speed / beat pulse / size ON TOP
    //     of the baked field. (The old moodToConfig→uFlowSpeed… uniforms are
    //     pre-GPGPU and no longer drive the shader, so that block was removed.)
    revealing = true;
  } catch (err) {
    console.warn('[audio] failed to load:', err);
    audioHint.textContent = 'audio failed to load';
  }
}

// renderer.domElement.addEventListener('pointerdown', startAudio, { once: true });

// Auto-reveal on load so the cloud appears immediately without user interaction.
// The debug panel can still refine the shape; this just uncompresses the resting state.
setTimeout(() => { revealing = true; }, 600);

// ── Interaction ───────────────────────────────────────────────────────────────

const clock     = new THREE.Clock();
let   elapsed   = 0;
const pickDebug = new URLSearchParams(window.location.search).has('pickDebug');

// Persistent, world-anchored click-paint blooms (outward force on the flow).
const bloomField = new BloomField();

// Live tuning harness — FPS + density/overlap knobs + bloom shape + count presets.
createTuningPanel(particles, particleSim, bloomField);

// Click a particle → drop a red marker + stamp a persistent bloom at that spot.
const picker = createParticlePicker({
  renderer, camera, scene,
  particleSim,
  count: particles.count,
  onPick: (hit) => bloomField.add(hit.world, { time: elapsed }),
  debug: pickDebug,
});

if (pickDebug) {
  window.__particles   = particles;
  window.__particleSim = particleSim;
  window.__picker      = picker;
  window.__bloomField  = bloomField;
  console.log('[pickDebug] click a particle → red marker + persistent bloom');
}

// ── Animate ───────────────────────────────────────────────────────────────────

const u = particles.material.uniforms;

// ── Mood debug panel ──────────────────────────────────────────────────────────
// Each slider change picks a fresh random warp order — the 5 curl/gradient fields
// (energy, brightness, heaviness, dynamism, bpm) are shuffled so the domain-warp
// chain produces a different emergent shape each time the user adjusts a slider.
let resampleTimer = null;

// Option A — Dominant Warp + Full Superposition:
// Pick the top 1-2 fields by slider value as the warp chain.
// All active fields still contribute to the combined curl (superposition) at
// the warped position, so every parameter shapes the flow — only the strongest
// 1-2 deform the coordinate space itself.
// Shuffling the selected warpers preserves emergent unpredictability on each
// slider change without the chaos of a 6-deep chain.
const WARP_THRESHOLD = 0.15;   // minimum value to qualify as a warper
const MAX_WARPERS    = 2;

function buildWarpOrder(mood) {
  const bpmNorm = (mood.bpm - 40) / 160;   // mirrors normBpm() in createQuantumCloud.js
  const fields = [
    { name: 'energy',    val: mood.energy },
    { name: 'brightness',val: mood.brightness },
    { name: 'texture',   val: mood.texture },
    { name: 'heaviness', val: mood.heaviness },
    { name: 'dynamism',  val: mood.dynamism },
    { name: 'bpm',       val: bpmNorm },
  ];

  const warpers = fields
    .filter(f => f.val > WARP_THRESHOLD)
    .sort((a, b) => b.val - a.val)
    .slice(0, MAX_WARPERS)
    .map(f => f.name);

  // Shuffle the selected warpers so A→B and B→A are both possible
  for (let i = warpers.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [warpers[i], warpers[j]] = [warpers[j], warpers[i]];
  }
  return warpers;
}

createMoodDebugPanel(
  (mood) => {
    clearTimeout(resampleTimer);
    resampleTimer = setTimeout(() => {
      const warpOrder = buildWarpOrder(mood);
      resampleAll6(particles, mood.energy, mood.brightness, mood.texture, mood.heaviness, mood.dynamism, mood.bpm, warpOrder, u);
      particleSim.reset(particles.userData.seedPositions);   // respawn onto the new shape
      bakeVolume(mood, warpOrder);                            // rebake the flow field to match
      revealing = true;
    }, 450);
  },
  () => { revealing = true; }
);

function animate() {
  requestAnimationFrame(animate);

  const dt = clock.getDelta();
  elapsed += dt;
  u.uTime.value = elapsed;

  // Fly the camera forward + apply steering.
  controls.update(dt);

  // Upload the camera-windowed set of persistent blooms, then advance the sim
  // (so this step's advection includes the paint force).
  bloomField.syncUniforms(particleSim.mat.uniforms, camera.position, elapsed);

  // Advance the GPGPU flow sim and feed its position texture to the renderer.
  particleSim.update(dt, camera.position);
  u.uSimPos.value  = particleSim.getPositionTexture();
  u.uSimCell.value = particleSim.getCellTexture();
  u.uCamPos.value.copy(camera.position);

  // Reveal animation: 0 → 1 over ~3 seconds after mood is applied.
  if (revealing && u.uReveal.value < 1.0) {
    u.uReveal.value = Math.min(1.0, u.uReveal.value + dt / 3.0);
  }

  // TODO (audio rebuild, tomorrow): if (audioAnalyser) read getAudioData() and
  // modulate the GPGPU flow (uFlowSpeed / beat pulse / uAudioTreble size) here.

  renderer.render(scene, camera);
}

animate();

// ── Helpers ───────────────────────────────────────────────────────────────────

function fitCamera() {
  // Start at the origin, flying forward (-Z). flyControls integrates motion.
  camera.position.set(0, 0, 0);
  camera.near = 0.01;
  camera.far  = 80;
  camera.updateProjectionMatrix();
}


function createAudioHint() {
  const el = document.createElement('div');
  Object.assign(el.style, {
    position:   'fixed',
    bottom:     '24px',
    left:       '50%',
    transform:  'translateX(-50%)',
    padding:    '8px 20px',
    fontFamily: 'monospace',
    fontSize:   '13px',
    color:      'rgba(255,255,255,0.55)',
    background: 'rgba(0,0,0,0.45)',
    border:     '1px solid rgba(255,255,255,0.15)',
    borderRadius: '20px',
    pointerEvents: 'none',
    letterSpacing: '0.05em',
    transition: 'opacity 0.4s',
  });
  el.textContent = 'click anywhere to start audio';
  document.body.appendChild(el);
  return el;
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
