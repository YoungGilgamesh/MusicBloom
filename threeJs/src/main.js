import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { Pass } from 'three/addons/postprocessing/Pass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import { assetUrl } from './assetUrl.js';
import { createQuantumCloud, applyMeshMix, resampleAll6 } from './particles/createQuantumCloud.js';
import { loadMeshTypeCache } from './particles/particleModels.js';
import { ParticleSim } from './particles/particleSim.js';
import { moodToMeshMix } from './audio/moodToMeshMix.js';
import { moodToBgType } from './audio/moodToBgType.js';
import { GPUTrails } from './particles/gpuTrails.js';
import { FrozenDust } from './particles/frozenDust.js';
import { FlowDots } from './particles/flowDots.js';
import { createFlyControls } from './interaction/flyControls.js';
import { createOrbitControls } from './camera/orbitControls.js';
import { frameCloudCamera } from './camera/frameCloud.js';
import { createParticlePicker } from './interaction/particlePick.js';
import { playResultBloom2d, playResultGather2d } from './interaction/resultBloom2d.js';
import { BloomField } from './interaction/bloomField.js';
import { createPrecomputedAnalyser } from './audio/audioPrecompute.js';
import { createCoverBgm } from './audio/coverBgm.js';
import { contrastMood } from './moodContrast.js';
import { moodToFlowSpeed } from './audio/moodToFlowSpeed.js';
import { moodToFlySpeed } from './audio/moodToFlySpeed.js';
import { moodToSpawnDrift } from './audio/moodToSpawnDrift.js';
import { moodToSize } from './audio/moodToSize.js';
import { AudioMotion } from './audio/audioMotion.js';
import { TrailColorMotion, measureTrackColorHueSpan } from './audio/trailColorMotion.js';
import { paintColorFromMain } from './audio/moodToPaintColor.js';
import { BgColorMotion } from './audio/bgColorMotion.js';
import { StarryBackground } from './scene/starryBackground.js';
import { CloudSkyBackground } from './scene/cloudSkyBackground.js';
import { LightLeakBackground } from './scene/lightLeakBackground.js';
import { ElevationHaze } from './scene/elevationHaze.js';
import { MoodOrbs } from './scene/moodOrbs.js';
import {
  BG_COLOR,
  CAMERA_FOV,
  AUDIO_SRCS,
  AUDIO_TRACK_OVERRIDES,
  SIM_VOL_RES,
  SIM_VOL_HALF,
  MOOD_SMOOTH,
  RENDER_PIXEL_RATIO,
  FIELD_DOMINANCE,
  FLOW_SPEED_MIN,
  FLOW_SPEED_MAX,
  FLY_SPEED_SCALE_MIN,
  FLY_SPEED_SCALE_MAX,
  USE_MODEL,
  MESH_TYPES,
  MESH_BUDGET,
  TRAIL_ENABLED,
  FROZEN_DUST_ENABLED,
  FROZEN_DUST_OPACITY,
  MOOD_ORBS_ENABLED,
  FLOW_DOTS_ENABLED,
  FLOW_DOTS_COUNT,
  BG_TYPE,
  BG_SELECT_MOOD,
  BG_HAZE_ENABLED,
  BG_COLOR_DRIFT,
  BG_CONTRAST_SCALE,
  AUDIO_BEAT_DECAY,
  AUDIO_BEAT_FLOW_KICK,
  AUDIO_BEAT_KICK_QUIET,
  AUDIO_FLOW_ACCENT,
  AUDIO_TREBLE_AMT,
  AUDIO_BEAT_POP,
  TRAIL_COLOR_DRIFT,
  TRAIL_COLOR_BEAT_DRIFT,
  TRAIL_COLOR_BEAT_DECAY,
  TRAIL_COLOR_BEAT_LOUD,
  TRAIL_COLOR_BEAT_COOLDOWN,
  TRAIL_COLOR_BEAT_HUE,
  TONE_MAPPING_ACES,
  TONE_MAPPING_EXPOSURE,
  VIGNETTE_STRENGTH,
  VIGNETTE_SIZE,
  TRAIL_PULSE_STRENGTH,
  COVER_FADEOUT_TIME,
  COVER_CAMERA_EASE_TIME,
  coverCameraEaseIn,
  COVER_PIXEL_RATIO_MUL,
  COVER_CLOUD_RADIUS,
  COVER_CLUSTER_POWER,
  COVER_CLUSTER_COUNT,
  COVER_CLUSTER_SPREAD,
  COVER_CLUSTER_SIZE,
  COVER_FIELD_FREQ_MUL,
  COVER_COLOR_S,
  COVER_COLOR_L,
  COVER_HUE_DRIFT,
  COVER_TRAIL_OPACITY,
  COVER_FLOW_DOTS_OPACITY,
  COVER_FLOW_DOTS_SIZE_MUL,
  COVER_TRAIL_WIDTH_MUL,
  COVER_TRAIL_TAPER_TAIL,
  COVER_TRAIL_DEATH_TIME,
  TRAIL_TAPER_TAIL,
  TRAIL_DEATH_TIME,
  COVER_NEAR_CULL_FRAC,
  COVER_NEAR_FADE_START_FRAC,
  COVER_NEAR_FADE_END_FRAC,
  COVER_CAMERA_FAR,
  COVER_SIM_TICK_DIV,
  TRAIL_NEAR_CULL,
  TRAIL_FAR_CULL,
  TRAIL_WIDTH,
  TRAIL_SAMPLE_MIN_DIST,
  TRAIL_SAMPLE_MAX_DIST,
  TRAIL_SAMPLE_PAINT_MIN_DIST,
  TRAIL_COUNT,
  FLOW_DOTS_SIZE,
  CLOUD_BEHIND_FRAC,
  TRANSITION_BG_FADE_TIME,
  TUTORIAL_1_SRC,
  TUTORIAL_1_AT,
  TUTORIAL_2_SRC,
  TUTORIAL_2_DELAY,
  TUTORIAL_FADE_TIME,
  COVER_HINT_SRC,
  COVER_HINT_FADE,
  COVER_HINT_SIZE,
  COVER_HINT_BOTTOM,
  COVER_HINT_BREATHE,
  TRANSITION_SPAWN_RAMP_TIME,
  TRANSITION_LIFE_EASE_TIME,
  ENDING_FADE_TIME,
  RESULT_CAPTURE_DELAY_SEC,
  RESULT_FADE_TIME,
  RESULT_GATHER_TIME,
  RESULT_BLOOM_TIME,
  RESULT_IMAGE_SIZE,
  RESULT_END_TEXT_SRC,
  RESULT_END_TEXT_SIZE,
  RESULT_PAINT_SIZE,
  RESULT_PAINT_RADIUS,
  RESULT_PAINT_LEVELS,
  RESULT_PAINT_SAT,
  RESULT_OUTPUT_SIZE,
  INITIAL_LOAD_FADE_TIME,
  COVER_BGM_SRC,
  COVER_BGM_VOLUME,
  COVER_BGM_FADE_OUT_TIME,
  COVER_BGM_FADE_IN_TIME,
  BUTTON_SFX_SRC,
  BUTTON_SFX_VOLUME,
  END_CLICK_SFX_SRC,
  END_CLICK_SFX_VOLUME,
  END_FADEIN_SFX_SRC,
  END_FADEIN_SFX_VOLUME,
  TRAIL_OPACITY,
  FLOW_DOTS_OPACITY,
  BG_HAZE_STRENGTH,
  SIM_KILL_RADIUS,
  SIM_INST_PERIOD,
  SIM_INST_JITTER,
  SIM_INST_SCALE_MIN,
  SIM_INST_SCALE_MAX,
  SIM_MAX_LIFE,
} from './config.js';

// ── Scene setup ───────────────────────────────────────────────────────────────

const scene = new THREE.Scene();
// Flat clear as fallback; mood gradient mesh paints the sky when enabled.
scene.background = null;

const camera = new THREE.PerspectiveCamera(CAMERA_FOV, 1, 0.1, 100);

const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.debug.checkShaderErrors = true;
renderer.setClearColor(BG_COLOR, 1);
// ACES filmic grade — also applied inside custom shaders (uToneExposure); see toneMap.glsl.js.
if (TONE_MAPPING_ACES) {
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = TONE_MAPPING_EXPOSURE;
}
// Fill-rate lever: cap the drawing-buffer resolution (see RENDER_PIXEL_RATIO).
// Never exceed the device's native ratio (no point rendering above native).
// Cover uses COVER_PIXEL_RATIO_MUL on top of that; gameplay restores
// basePixelRatio when the cover fadeout finishes.
const basePixelRatio = Math.min(window.devicePixelRatio, RENDER_PIXEL_RATIO);
renderer.setPixelRatio(basePixelRatio * COVER_PIXEL_RATIO_MUL);
{
  const w = window.innerWidth, h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}
document.body.appendChild(renderer.domElement);

// Cover-only antialiasing — a post-process FXAA pass, NOT the WebGL context's
// native `antialias:true` flag (that's fixed at context-creation and can't be
// toggled per-phase, and MSAA'ing the whole context would also tax gameplay,
// which is the fill-rate-sensitive phase). Gameplay keeps the exact original
// direct renderer.render()+trail.render() path below (zero AA overhead);
// only appPhase==='cover' routes through this composer instead (see animate()).
// TrailPass re-uses the SAME depth-sharing trick the direct path relies on —
// it draws the trail ribbons straight into the composer's own read buffer
// (which still has the scene's depth attached) BEFORE the FXAA pass runs, so
// occlusion between meshes/dots and trails is preserved exactly as before;
// only the final FXAA blit changes what ends up on screen.
class TrailPass extends Pass {
  constructor(getTrail, cam) {
    super();
    this.getTrail = getTrail;
    this.camera = cam;
    this.needsSwap = false; // draws in-place; doesn't produce a new buffer to swap to
  }
  render(r, writeBuffer, readBuffer) {
    const trail = this.getTrail();
    if (!trail) return;
    r.setRenderTarget(readBuffer);
    trail.render(r, this.camera);
  }
}
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new TrailPass(() => trail, camera));
const fxaaPass = new ShaderPass(FXAAShader);
fxaaPass.renderToScreen = true;
composer.addPass(fxaaPass);
// Keeps the composer's target size AND the FXAA shader's per-texel resolution
// uniform in sync with the renderer's current CSS size + pixel ratio — must be
// re-run any time either changes (initial setup, window resize, refreshRenderer,
// and the fadeOutT>=1 pixel-ratio restore) or FXAA samples at the wrong scale.
function updateComposerSize(w, h) {
  composer.setSize(w, h);
  const pr = renderer.getPixelRatio();
  fxaaPass.material.uniforms['resolution'].value.set(1 / (w * pr), 1 / (h * pr));
}
updateComposerSize(window.innerWidth, window.innerHeight);

// Gameplay vignette — a cheap CSS radial-gradient overlay div layered on top
// of the canvas (zero render/shader cost, unlike a post-process pass). Starts
// fully transparent (cover page has no vignette); faded in/out alongside the
// rest of the gameplay atmosphere (BG theme/haze/orbs) in animate()'s
// 'transitioning'/'ending' branches — see bgT/inv there.
const vignetteEl = document.createElement('div');
Object.assign(vignetteEl.style, {
  position: 'fixed',
  inset: '0',
  pointerEvents: 'none',
  opacity: '0',
  background: `radial-gradient(ellipse at center, transparent ${VIGNETTE_SIZE}%, rgba(0,0,0,${VIGNETTE_STRENGTH}) 100%)`,
});
document.body.appendChild(vignetteEl);

// ── Cover page / gameplay phase machine ───────────────────────────────────────
// 'cover' = attract-mode splash (orbit camera, trail/dots only, random shape,
// no gameplay systems). 'transitioning' = Start clicked, camera/BG/spawn easing
// in flight. 'game' = full experience (paint/pick/audio-beat reactivity active).
// 'ending' = track finished, scene fading to black. 'result' = optional square
// still from a bloom, shown after that fade (skipped if they never painted).
// 'ending' = track finished, whole scene fading to black before looping back
// to a fresh 'cover' (see loopBackToCover()).
let appPhase = 'cover';
// Effectively-infinite lifetime used to suspend age-based respawn/death during
// the spawn ramp — see applyBaseShape's reframe block for why.
const SPAWN_RAMP_MAX_LIFE = 9999;
// Cover-page sim tick throttle state (see animate()'s runSimThisFrame block).
let simTickAccum = 0;
let simTickCounter = 0;
// Set once the mesh cloud is added to the scene (deferred to the black-screen
// hold — see animate()'s fadeOutT>=1 branch — instead of pre-warmed at cover
// page load, so cover doesn't pay its fill-rate cost the whole time it's up).
let meshAddedToScene = false;

// Cover page orbits a fixed focal point; swapped for forward flight on Start
// (see startTransition()). `controls` is reassigned, so all later references
// (animate loop, frameCloudCamera) automatically pick up whichever is active.
// `let` (not `const`) — loopBackToCover() creates a brand-new orbitControls
// instance each time the scene loops back to cover, since the previous one
// was disposed at the last Start click.
let orbitControls = createOrbitControls(camera, renderer.domElement, dismissCoverHint);
let flyControlsInst = null;
let controls = orbitControls;
// Wall-clock (elapsed) timestamps for the parallel transition ramps — set by
// startTransition()/applyBaseShape(); read each frame in animate()'s
// 'transitioning' branch. null while inactive.
let transitionStart = null;      // camera ease + cover fadeout (COVER_FADEOUT_TIME)
let transitionSpawnStart = null; // sparse→full spawn ramp AND bg-fade trigger —
// set once the real track mood reshape actually
// lands (i.e. once music starts playing; may lag
// behind transitionStart while audio loads)
let bgFadeStart = null;          // set once BOTH the cover fadeout has finished
// AND music has started (transitionSpawnStart is
// set) — see animate()'s 'transitioning' branch
// Accumulates real seconds for the spawn ramp, but ONLY while the flow field
// is ready (see animate()'s flowReadyNow) — a shape-change bake can still be
// in flight right when transitionSpawnStart is set, and without this the ramp
// clock (and each particle's spawnFade) would silently advance while
// everything's hidden, so a chunk of already-partially-faded particles would
// all pop into view together the instant uFlowReady flips back to 1. Pausing
// this instead means the ramp visually starts from true zero once revealed.
let spawnRampElapsed = 0;
// True once the spawn ramp's own population growth has completed and the
// lifetime-cap ease-back (see TRANSITION_LIFE_EASE_TIME) has started —
// guards the one-shot kickoff of that ease.
let spawnRampLifeEaseStart = null;
// True once audio has decoded/analysed and the real track mood is ready to
// apply — but the actual (heavier) applyRealTrackMood() call is deliberately
// held off until the cover trail/dots have fully faded to black (see
// animate()'s 'transitioning' branch), so that one-time reshape/shader/texture
// costs land while the screen is solid black instead of visibly mid-fade.
let readyToApplyTrackMood = false;
// True once animate()'s 'transitioning' branch has kicked off startAudio() —
// guards against calling it more than once. startAudio() itself is deliberately
// NOT called from startTransition() (see startTransition's comment) — it's
// only fired once the cover fadeout is fully complete (fadeOutT >= 1), so its
// synchronous decode+FFT-analysis freeze lands on a solid black screen.
let audioRequested = false;
// Set when the 'ending' fade-to-black starts (track finished — see
// beginEnding()); null while inactive. Read each frame in animate()'s
// 'ending' branch to drive the whole-scene fade-out, mirroring
// transitionStart's role for the cover→game fade-in.
let endingStart = null;
// One square still from the fly camera after the first bloom (see
// scheduleResultCapture / captureResultSquare). No bloom → skip 'result'.
let resultCaptureAt = -1;
let resultCaptured = false;
let resultShotUrl = null;
let resultEl = null;
let resultPaintEl = null;
let resultBloom = null;
let resultStart = null;
let resultFadingOut = false;
// Set when loopBackToCover() re-enters 'cover' with fresh trail/dots at
// opacity 0 — drives their fade-BACK-in over coverFadeInDuration (see below).
// null once that ramp's done. Also used for the very first page load's
// fade-in (see loadingReady below) — same mechanic, different duration.
let coverFadeInStart = null;
// Duration for whichever fade-in coverFadeInStart is currently driving —
// INITIAL_LOAD_FADE_TIME the first time (page load), COVER_FADEOUT_TIME on
// every subsequent loop back from 'ending' (see loopBackToCover()).
let coverFadeInDuration = INITIAL_LOAD_FADE_TIME;
// True once BOTH the initial cover-page volume bake has landed (bakeJobId's
// onmessage) AND the one-time GPGPU/paint shader compile has run (see
// warmupPaintShaders) — only then do we know the cloud can ACTUALLY flow
// without a hitch, so only then does the black-hold end and coverFadeInStart
// get set. Prevents the "frozen for a beat, then suddenly flowing" glitch on
// first load (see this session's discussion).
let initialBakeDone = false;
let initialWarmupDone = false;
// Loop-back from ending: wait for the fresh cover volume bake before fading
// trail/dots in (same "ready, then reveal" idea as the first load).
let coverFadeArmed = false;
// True once the cover reveal sequence has begun (advice fade, or the
// title/particle fade). Stops maybeStart* from re-firing during the
// first-load wait after advice, when coverFadeInStart is still null.
let coverFadeScheduled = false;
function startCoverFadeIn(duration) {
  if (coverFadeInStart !== null || coverFadeScheduled) return;
  coverFadeScheduled = true;
  coverFadeInDuration = duration;
  if (coverUiPending) fadeInCoverUi();
  else beginCoverSceneFade();
}
function beginCoverSceneFade() {
  if (coverFadeInStart !== null) return;
  // Opacity goes to full immediately — the "growing in" look comes from the
  // spawnFrac population ramp, not from dimming an already-full population.
  if (trail) trail.opacity = COVER_TRAIL_OPACITY;
  if (flowDots) flowDots.opacity = COVER_FLOW_DOTS_OPACITY;
  // spawnRampTime must match this duration or the population stalls sparse
  // (revealAt is spread across a stale longer window).
  if (trail) trail.spawnRampTime = coverFadeInDuration;
  if (flowDots) flowDots.spawnRampTime = coverFadeInDuration;
  coverFadeInStart = elapsed;
  fadeInCoverBgm(coverFadeInDuration);
}
function maybeStartInitialCoverFadeIn() {
  if (!initialBakeDone || !initialWarmupDone || coverFadeInStart !== null || coverFadeScheduled) return;
  startCoverFadeIn(INITIAL_LOAD_FADE_TIME);
}
function maybeStartLoopBackCoverFadeIn() {
  if (!coverFadeArmed || pendingBakeJobId !== null || coverFadeInStart !== null || coverFadeScheduled) return;
  coverFadeArmed = false;
  startCoverFadeIn(COVER_FADEOUT_TIME);
}
// ── Particles + paint zones ───────────────────────────────────────────────────

// ── Mood → warp order (dominant warp + full superposition) ───────────────────
// Pick the top 1-2 fields by slider value as the domain-warp chain; every active
// field still contributes to the combined curl (superposition), only the
// strongest 1-2 deform the coordinate space itself. Shuffling the selected
// warpers preserves emergent unpredictability on each rebake without the chaos
// of a 6-deep chain. Hoisted to the top of the file — needed by the cover-page
// random-mood seeding below, as well as the normal track-mood rebake later.
const WARP_THRESHOLD = 0.15;   // minimum value to qualify as a warper
const MAX_WARPERS = 2;

function buildWarpOrder(mood) {
  const bpmNorm = (mood.bpm - 40) / 160;   // mirrors normBpm() in createQuantumCloud.js
  const fields = [
    { name: 'energy', val: mood.energy },
    { name: 'brightness', val: mood.brightness },
    { name: 'texture', val: mood.texture },
    { name: 'heaviness', val: mood.heaviness },
    { name: 'dynamism', val: mood.dynamism },
    { name: 'bpm', val: bpmNorm },
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

// ── Cover-page shape: simple neutral flow field (NOT the real track shape) ────
// Cover is now a standalone decorative cloud of trails/dots swirling around the
// camera — deliberately independent from any track's mood/shape (previously
// this baked V1.mp3's actual mood fingerprint so cover "previewed" gameplay;
// removed per design change — cover no longer needs to resemble any specific
// track). This neutral mood only drives the shared velocity-volume bake (see
// bakeVolume below) that gives the cover trails/dots their swirling motion —
// it does NOT drive their seed positions (see randomSeedsInSphere below).
const coverMood = { energy: 0.5, brightness: 0.5, texture: 0.5, heaviness: 0.5, dynamism: 0.5, bpm: 120 };
const coverWarpOrder = ['dynamism', 'bpm'];

// Random point inside a sphere of the given radius, written at out[i*3].
// Radial distribution is NOT uniform-in-volume: COVER_CLUSTER_POWER > 1/3
// biases samples toward the center (denser core, sparse halo).
function randomPointInSphere(radius, out, i, power = COVER_CLUSTER_POWER) {
  let x, y, z, d2;
  do {
    x = Math.random() * 2 - 1;
    y = Math.random() * 2 - 1;
    z = Math.random() * 2 - 1;
    d2 = x * x + y * y + z * z;
  } while (d2 > 1 || d2 < 1e-8);
  const r = radius * Math.pow(Math.random(), power) / Math.sqrt(d2);
  out[i * 3 + 0] = x * r;
  out[i * 3 + 1] = y * r;
  out[i * 3 + 2] = z * r;
}

// Cover-only seed cloud: N clumps scattered inside `radius` (the camera sits
// at the origin — see orbitControls.js). Each particle is offset from a
// picked cluster center; leftover points past the outer sphere are pulled
// back in so they stay inside COVER_CLOUD_RADIUS. Count 1 keeps the old
// single-core-at-origin look.
function randomSeedsInSphere(count, radius) {
  const n = Math.max(1, COVER_CLUSTER_COUNT | 0);
  const centers = new Float32Array(n * 3);
  if (n === 1) {
    centers[0] = centers[1] = centers[2] = 0;
  } else {
    const spreadR = radius * COVER_CLUSTER_SPREAD;
    const minSep2 = (spreadR * 0.5) * (spreadR * 0.5);
    for (let c = 0; c < n; c++) {
      let ok = false;
      for (let tries = 0; tries < 24 && !ok; tries++) {
        randomPointInSphere(spreadR, centers, c, 1 / 3);
        ok = true;
        for (let p = 0; p < c; p++) {
          const dx = centers[c * 3] - centers[p * 3];
          const dy = centers[c * 3 + 1] - centers[p * 3 + 1];
          const dz = centers[c * 3 + 2] - centers[p * 3 + 2];
          if (dx * dx + dy * dy + dz * dz < minSep2) { ok = false; break; }
        }
      }
    }
  }

  const arr = new Float32Array(count * 3);
  const clumpR = radius * COVER_CLUSTER_SIZE;
  for (let i = 0; i < count; i++) {
    const c = n === 1 ? 0 : (Math.random() * n) | 0;
    randomPointInSphere(clumpR, arr, i);
    const x = arr[i * 3] + centers[c * 3];
    const y = arr[i * 3 + 1] + centers[c * 3 + 1];
    const z = arr[i * 3 + 2] + centers[c * 3 + 2];
    const d = Math.hypot(x, y, z);
    const s = d > radius && d > 1e-8 ? radius / d : 1;
    arr[i * 3] = x * s;
    arr[i * 3 + 1] = y * s;
    arr[i * 3 + 2] = z * s;
  }
  return arr;
}
// Disables the gameplay tiling lattice (infinite repeated copies of the shape,
// with per-cell random jitter/rotation/mirror/scale — see instanceTransform.
// glsl.js) on a trail/flowDots sim + render material, for the cover page's
// single, non-tiled cloud. Without this, respawned particles snap to whichever
// tiled copy is nearest the camera, offset by a per-cell jitter of roughly
// SIM_INST_JITTER * SIM_INST_PERIOD world units — which was quietly preventing
// particles from ever landing close to the camera no matter how tight
// COVER_CLOUD_RADIUS was set. uInstPeriod is set huge (not 0) so the "nearest
// cell" search still resolves cleanly to a single cell; uInstJitter=0 removes
// the per-cell origin offset; uScaleMin=uScaleMax=1 removes per-cell size
// variance. Restored to the real gameplay constants once the cover fadeout
// finishes (see animate()'s fadeOutT>=1 branch).
function disableTiling(uniforms) {
  uniforms.uInstPeriod.value = 1e6;
  uniforms.uInstJitter.value = 0;
  uniforms.uScaleMin.value = 1;
  uniforms.uScaleMax.value = 1;
}
function restoreTiling(uniforms) {
  uniforms.uInstPeriod.value = SIM_INST_PERIOD;
  uniforms.uInstJitter.value = SIM_INST_JITTER;
  uniforms.uScaleMin.value = SIM_INST_SCALE_MIN;
  uniforms.uScaleMax.value = SIM_INST_SCALE_MAX;
}

// The mesh cloud stays invisible/out of the scene until Start regardless (see
// below) — its shape here is irrelevant cosmetically, so a neutral mood is
// used (no V1 dependency); it's properly reshaped from the REAL track mood by
// applyBaseShape() once audio actually starts.
const particles = createQuantumCloud({
  energy: coverMood.energy, brightness: coverMood.brightness, texture: coverMood.texture,
  heaviness: coverMood.heaviness, dynamism: coverMood.dynamism, bpm: coverMood.bpm,
});
// NOT added to the scene yet — the mesh cloud (shader compile, mesh-mix texture
// upload, sim render-target allocation) is the single heaviest one-time cost on
// this page, and paying it during cover just to render it fully invisible
// (uSpawnFrac=0) wastes fill-rate the whole time the player is looking at the
// cover page for no visible benefit. Instead it's added once the cover fadeout
// finishes and the screen is solid black (see animate()'s fadeOutT>=1 branch),
// so the (larger, but now hidden) hitch lands there instead — same trick
// already used for startAudio()/applyRealTrackMood() below.
particles.material.uniforms.uSpawnFrac.value = 0;

// Preload all five mesh-type libraries. Mood mix (1 major + 2 accents) bakes on
// track mood / when the cache first lands (neutral mood until audio starts).
let meshTypeCache = null;
let lastMeshMix = null;

// GPGPU flow simulation — advects particles along the baked mood velocity
// volume with lifetime + camera-relative respawn.
const particleSim = new ParticleSim(renderer, particles.count, particles.userData.seedPositions);
particles.material.uniforms.uSimW.value = particleSim.width;
particles.material.uniforms.uSimRes.value.set(particleSim.width, particleSim.height);

function syncMeshSimUniforms() {
  const mu = particles.material.uniforms;
  const su = particleSim.mat.uniforms;
  mu.uSimW.value = particleSim.width;
  mu.uSimRes.value.set(particleSim.width, particleSim.height);
  // Share bloom arrays so mesh draw sees the same ink stains as the sim / trails.
  mu.uBloomCount = su.uBloomCount;
  mu.uBloomA = su.uBloomA;
  mu.uBloomE = su.uBloomE;
}

// ── Baked mood velocity volume ────────────────────────────────────────────────
// The combined field is evaluated onto a SIM_VOL_RES³ grid off the main thread
// (velocityBaker.worker.js) whenever the shape changes.  Both the sim (advection)
// and the cube-orientation shader trilinearly sample this one Data3DTexture.
const volTex = new THREE.Data3DTexture(
  new Float32Array(SIM_VOL_RES ** 3 * 4), SIM_VOL_RES, SIM_VOL_RES, SIM_VOL_RES);
volTex.format = THREE.RGBAFormat;
volTex.type = THREE.FloatType;
volTex.minFilter = THREE.LinearFilter;
volTex.magFilter = THREE.LinearFilter;
// Sampled in each instance's local space now (per-cell transform), so clamp at
// the shape's bounds rather than repeat.
volTex.wrapS = volTex.wrapT = volTex.wrapR = THREE.ClampToEdgeWrapping;
volTex.needsUpdate = true;
particles.material.uniforms.uVelVolume.value = volTex;
particleSim.setVolume(volTex, SIM_VOL_HALF);

// Standalone trail element — GPU-resident (own flow sim for the heads + a history
// texture + instanced line ribbons; see gpuTrails.js). Cover page: seeded with
// its OWN random points inside a sphere around the camera (see
// randomSeedsInSphere above) — NOT derived from the mesh cloud's shape, since
// cover no longer previews any particular track's shape.
const trail = TRAIL_ENABLED
  ? new GPUTrails(renderer, { seedPositions: randomSeedsInSphere(TRAIL_COUNT, COVER_CLOUD_RADIUS), volTex, volHalf: SIM_VOL_HALF })
  : null;
// NOTE: trails are NOT added to the main scene — they're drawn in a second pass straight
// onto the screen (sharing the meshes' depth) after the main render (see trail.render).
if (trail) {
  // Single radius controls both the seed sphere (above) and the recycle
  // shell — see COVER_CLOUD_RADIUS's comment in config.js (replaces the old
  // COVER_KILL_RADIUS_SCALE × COVER_OUTER_TIGHTEN × COVER_SHAPE_SCALE chain).
  trail.killRadius = COVER_CLOUD_RADIUS;
  trail.nearCull = COVER_CLOUD_RADIUS * COVER_NEAR_CULL_FRAC;
  trail.farCull = COVER_CLOUD_RADIUS;
  // Cover page doesn't need the traveling brightness pulse (a constant
  // ambient "light running along the ribbon" effect) — it's a gameplay-feel
  // accent that reads as unnecessary motion/noise on the calmer attract-mode
  // page. Restored to TRAIL_PULSE_STRENGTH once the cover fadeout finishes
  // (see animate()'s 'transitioning' branch, fadeOutT>=1).
  trail.pulseStrength = 0;
  // Cover page never flies forward (orbitControls only rotates in place) —
  // the forward-bias respawn/fade has no reason to apply here; force
  // symmetric. Restored to CLOUD_BEHIND_FRAC once real forward flight begins.
  trail.behindFrac = 1.0;
  // Ribbon width/sample spacing scaled to COVER_CLOUD_RADIUS's proportion of
  // the real gameplay bubble, so ribbons read as distinct streaks rather than
  // overlapping blobs. Restored to the real, unscaled values on transition.
  const coverSizeRatio = COVER_CLOUD_RADIUS / SIM_KILL_RADIUS;
  trail.width = TRAIL_WIDTH * coverSizeRatio * COVER_TRAIL_WIDTH_MUL;
  trail.taperTail = COVER_TRAIL_TAPER_TAIL;
  trail.deathTime = COVER_TRAIL_DEATH_TIME;
  trail.sampleMinDist = TRAIL_SAMPLE_MIN_DIST * coverSizeRatio;
  trail.sampleMaxDist = TRAIL_SAMPLE_MAX_DIST * coverSizeRatio;
  trail.samplePaintMinDist = TRAIL_SAMPLE_PAINT_MIN_DIST * coverSizeRatio;
  // Cover-only: disable depth-write on the ribbon material. Cover's denser,
  // more clustered cloud makes trails cross/overlap far more than gameplay,
  // and depth-write ON there causes z-fighting flicker where ribbons are
  // near-coincident in depth. Losing strict nearer-occludes-farther ordering
  // between overlapping trails is an acceptable trade for a glowy cover cloud.
  // Restored to true once real gameplay begins (see the fadeOutT>=1 branch).
  trail.material.depthWrite = false;
  // No tiling lattice for cover's single non-tiled cloud (see disableTiling's
  // comment above) — restored to the real gameplay constants on transition.
  disableTiling(trail.sim.mat.uniforms);
  // Initial page load: hold at zero population/opacity until the async volume
  // bake + first-use shader compile are both confirmed done (see
  // loadingReady/animate()'s initial-fade block below) — otherwise the very
  // first frames show a frozen (or literally invisible, via uFlowReady) cloud
  // for a beat before motion suddenly kicks in. Faded in together with flowDots
  // once ready, over INITIAL_LOAD_FADE_TIME.
  trail.opacity = 0;
  trail.spawnFrac = 0;
  trail.spawnElapsed = 0;
}

// Cheap flowing light dots — additional Points on their own sim (FLOW_DOTS_COUNT).
// Cover page: also seeded with its own random sphere positions (see trail above).
const flowDots = FLOW_DOTS_ENABLED
  ? new FlowDots(renderer, {
    count: Math.max(1, FLOW_DOTS_COUNT | 0),
    volTex,
    volHalf: SIM_VOL_HALF,
    mood: coverMood,
    warpOrder: coverWarpOrder,
  })
  : null;
if (flowDots) {
  scene.add(flowDots.object3D);
  flowDots.killRadius = COVER_CLOUD_RADIUS;
  flowDots.nearFadeStart = COVER_CLOUD_RADIUS * COVER_NEAR_FADE_START_FRAC;
  flowDots.nearFadeEnd = COVER_CLOUD_RADIUS * COVER_NEAR_FADE_END_FRAC;
  flowDots.behindFrac = 1.0;
  const coverSizeRatio = COVER_CLOUD_RADIUS / SIM_KILL_RADIUS;
  flowDots.size = FLOW_DOTS_SIZE * coverSizeRatio * COVER_FLOW_DOTS_SIZE_MUL;
  // Overwrite FlowDots' own (mood-shape-sampled) seed positions with our
  // random-sphere ones, then reset its sim so they take effect immediately.
  flowDots.seedPositions = randomSeedsInSphere(Math.max(1, FLOW_DOTS_COUNT | 0), COVER_CLOUD_RADIUS);
  flowDots.sim.reset(flowDots.seedPositions);
  // No tiling lattice for cover — see disableTiling's comment above. FlowDots'
  // OWN render material also samples the velocity field (for stretch
  // direction), so it needs the same override as the sim.
  disableTiling(flowDots.sim.mat.uniforms);
  disableTiling(flowDots.material.uniforms);
  // Same initial-load hold as the trail above — see that comment.
  flowDots.opacity = 0;
  flowDots.spawnFrac = 0;
  flowDots.spawnElapsed = 0;
}

// Sparse frozen dust — tiny world-fixed points wrapping around the camera for flythrough
// spatial awareness (parallax). Not in the flow sim / paint / trails.
const dust = FROZEN_DUST_ENABLED ? new FrozenDust() : null;
if (dust) { scene.add(dust.object3D); dust.enabled = false; dust.opacity = 0; } // off during cover — enabled + faded in on Start (see animate()'s 'transitioning' branch)

// Large soft mood ovals — frozen, wrap with camera, hue-shifted mood colour.
const moodOrbs = MOOD_ORBS_ENABLED ? new MoodOrbs() : null;
if (moodOrbs) { scene.add(moodOrbs.object3D); moodOrbs.enabled = false; moodOrbs.fadeMul = 0; }

// Theme BGs — mood select picks cosmos|clouds|leaks at bake.
// Construct the three select themes; enable exactly one. Shared BgColorMotion wash.
const starryBg = new StarryBackground();
const cloudSkyBg = new CloudSkyBackground();
const lightLeakBg = new LightLeakBackground();
scene.add(starryBg.object3D);
scene.add(cloudSkyBg.object3D);
scene.add(lightLeakBg.object3D);
// Cover page: flat black, no theme BG. All fadeMul→0 (faded in on Start).
starryBg.fadeMul = cloudSkyBg.fadeMul = lightLeakBg.fadeMul = 0;

/** @param {'cosmos'|'clouds'|'leaks'|null} type */
function applyBgType(type) {
  const t = (type === 'cosmos' || type === 'clouds' || type === 'leaks') ? type : 'clouds';
  starryBg.enabled = t === 'cosmos';
  starryBg.object3D.visible = starryBg.enabled;
  cloudSkyBg.enabled = t === 'clouds';
  cloudSkyBg.object3D.visible = cloudSkyBg.enabled;
  lightLeakBg.enabled = t === 'leaks';
  lightLeakBg.object3D.visible = lightLeakBg.enabled;
}

let activeTrackSrc = null;
function trackOverride() {
  return (activeTrackSrc && AUDIO_TRACK_OVERRIDES[activeTrackSrc]) || null;
}

function resolveBgType(mood) {
  const ov = trackOverride();
  if (ov?.bgType) return { type: ov.bgType, scores: null, forced: true };
  if (!BG_SELECT_MOOD) return { type: BG_TYPE, scores: null, forced: true };
  return { ...moodToBgType(mood), forced: false };
}

function bakeBgType(mood) {
  applyBgType(resolveBgType(mood).type);
}

// Initial theme before audio bake — resolved from the cover mood so a themed BG
// would be ready, but cover page keeps it fully faded (fadeMul=0 above); the
// pick becomes visible once the transition fades it in.
bakeBgType(coverMood);
// Theme-agnostic elevation haze — sits above any BG, not mood-driven.
const elevHaze = BG_HAZE_ENABLED ? new ElevationHaze() : null;
if (elevHaze) { scene.add(elevHaze.object3D); elevHaze.enabled = false; elevHaze.fadeMul = 0; }

const velocityBaker = new Worker(new URL('./particles/velocityBaker.worker.js', import.meta.url), { type: 'module' });
let bakeJobId = 0;
// Set while a bake is in flight (postMessage fired, onmessage not yet landed) —
// see animate()'s flow-speed freeze below. The worker bake is ASYNC (a few
// frames' latency for a full SIM_VOL_RES³ field), but resampleAll6/trail.reset/
// flowDots.reshape apply the NEW shape's seed positions SYNCHRONOUSLY in the
// same call as bakeVolume() (see applyBaseShape). Without this, particles sit
// at the new shape's positions for those few frames while still being advected
// by the OLD (stale, previous-shape) volume — whose flow direction at the new
// positions can point anywhere, including backwards — producing a brief
// "flowing backwards" glitch each time the shape changes, until the new bake
// lands and snaps the direction correct. Freezing flow speed (not the whole
// sim — respawn/lifetime/paint still run) just holds particles still instead.
let pendingBakeJobId = null;
velocityBaker.onmessage = (e) => {
  const { jobId, data } = e.data;
  if (jobId !== bakeJobId) return;   // a newer bake has superseded this one
  volTex.image.data = data;
  volTex.needsUpdate = true;
  if (jobId === pendingBakeJobId) pendingBakeJobId = null;
  // A preset switch (buffer re-uploads) leaves a transient GPU/vsync state that
  // pins FPS ~45 until a setSize refreshes the drawing buffer (same effect as
  // nudging the resolution slider or resizing the window). Force that refresh
  // once the new volume has uploaded (deferred so it lands after the upload).
  requestAnimationFrame(() => requestAnimationFrame(refreshRenderer));
  // First bake of the session landing → half of the initial-load readiness
  // gate (see maybeStartInitialCoverFadeIn/initialBakeDone declaration).
  // Guarded so a later reshape (e.g. loopBackToCover()'s re-bake) doesn't
  // re-trigger this — only the very first bake matters for the initial hold.
  if (!initialBakeDone) {
    initialBakeDone = true;
    maybeStartInitialCoverFadeIn();
  } else {
    maybeStartLoopBackCoverFadeIn();
  }
};
function bakeVolume(mood, warpOrder, dominance = FIELD_DOMINANCE, freqMul = 1) {
  bakeJobId++;
  pendingBakeJobId = bakeJobId;
  velocityBaker.postMessage({
    jobId: bakeJobId,
    energy: mood.energy, brightness: mood.brightness, texture: mood.texture,
    heaviness: mood.heaviness, dynamism: mood.dynamism, bpm: mood.bpm,
    warpOrder, dominance, res: SIM_VOL_RES, half: SIM_VOL_HALF, freqMul,
  });
}

// Initial bake — matches the shape createQuantumCloud built (the cover mood's
// own warp order), so mesh/trail/flowDots agree on the same cover-page shape.
// freqMul zooms the sampled field in (see COVER_FIELD_FREQ_MUL's comment in
// config.js) so the swirl reads with finer detail at cover's small radius.
bakeVolume(coverMood, coverWarpOrder, FIELD_DOMINANCE, COVER_FIELD_FREQ_MUL);

// Mesh particles are unlit (albedo / vertex color only) — no scene point light.
// Projection setup only (near/far) — no reframe here. The cover page orbits the
// origin (orbitControls positions the camera itself each frame); the flight
// camera gets framed once Start is clicked and the real track shape is known
// (see applyBaseShape's reframe path).
camera.near = 0.01;
camera.far = COVER_CAMERA_FAR;   // cover page doesn't need to see far — restored to 80 on transition (see animate()'s fadeOutT>=1 branch)
camera.updateProjectionMatrix();

// ── Audio ─────────────────────────────────────────────────────────────────────

// Last library pick this visit — skip it on the next Start when we can.
let lastLibraryTrack = null;
function pickLibraryTrack() {
  const n = AUDIO_SRCS.length;
  if (n < 1) return null;
  if (n === 1) {
    lastLibraryTrack = AUDIO_SRCS[0];
    return lastLibraryTrack;
  }
  let i = (Math.random() * n) | 0;
  if (AUDIO_SRCS[i] === lastLibraryTrack) i = (i + 1) % n;
  lastLibraryTrack = AUDIO_SRCS[i];
  return lastLibraryTrack;
}

// One-shot user upload for the next Start only. Cleared on loop-back to cover.
/** @type {{ name: string, buffer: ArrayBuffer } | null} */
let pendingUserAudio = null;

const coverBgm = createCoverBgm({ src: COVER_BGM_SRC, volume: COVER_BGM_VOLUME });
function fadeInCoverBgm(dur = COVER_BGM_FADE_IN_TIME) {
  coverBgm.play().then((ok) => {
    if (ok && appPhase === 'cover') coverBgm.fadeTo(coverBgm.targetVolume, dur, elapsed);
  });
}
function fadeOutCoverBgm() {
  coverBgm.fadeTo(0, COVER_BGM_FADE_OUT_TIME, elapsed, true);
}
window.addEventListener('pointerdown', () => {
  if (appPhase === 'cover' && coverBgm.paused) fadeInCoverBgm();
}, { once: true });

const buttonSfx = new Audio(BUTTON_SFX_SRC);
buttonSfx.preload = 'auto';
buttonSfx.volume = BUTTON_SFX_VOLUME;
function playSfx(el) {
  try {
    el.currentTime = 0;
    const play = el.play();
    if (play && typeof play.catch === 'function') play.catch(() => {});
  } catch { /* autoplay / missing file — ignore */ }
}
function playButtonSfx() { playSfx(buttonSfx); }

const endClickSfx = new Audio(END_CLICK_SFX_SRC);
endClickSfx.preload = 'auto';
endClickSfx.volume = END_CLICK_SFX_VOLUME;
function playEndClickSfx() { playSfx(endClickSfx); }

const endFadeInSfx = new Audio(END_FADEIN_SFX_SRC);
endFadeInSfx.preload = 'auto';
endFadeInSfx.volume = END_FADEIN_SFX_VOLUME;
function playEndFadeInSfx() { playSfx(endFadeInSfx); }

let audioAnalyser = null;
let audioStarted = false;
let lastAudioData = null;    // latest getAudioData() (audio motion / bands)

// Real-time audio → motion. `audioCtl` is live-mutable.
const audioCtl = {
  beatDecay: AUDIO_BEAT_DECAY,
  beatKick: AUDIO_BEAT_FLOW_KICK,
  kickQuiet: AUDIO_BEAT_KICK_QUIET,  // fraction of kick at low intensity (loud → full kick)
  flowAccent: AUDIO_FLOW_ACCENT,
  trebleAmt: AUDIO_TREBLE_AMT,
  beatPop: AUDIO_BEAT_POP,
};
const audioMotion = new AudioMotion(audioCtl);

// Trail base colour from music/mood (slow drift + rare big-beat swift change). Live-tunable.
const trailColorCtl = {
  drift: TRAIL_COLOR_DRIFT,
  beatDrift: TRAIL_COLOR_BEAT_DRIFT,
  beatDecay: TRAIL_COLOR_BEAT_DECAY,
  beatLoud: TRAIL_COLOR_BEAT_LOUD,
  beatCooldown: TRAIL_COLOR_BEAT_COOLDOWN,
  beatHue: TRAIL_COLOR_BEAT_HUE,
};
const trailColorMotion = new TrailColorMotion(trailColorCtl);

const coverColor = { h: 0, s: COVER_COLOR_S, l: COVER_COLOR_L };
let coverHueDriftDir = 1;
let coverColorLive = true;
function applyCoverColor() {
  const c = coverColor;
  if (trail) trail.material.uniforms.uColorHSL.value.set(c.h, c.s, c.l);
  if (flowDots) flowDots.setColorHSL(c);
}
function rerollCoverColor() {
  coverColor.h = Math.random();
  coverColor.s = COVER_COLOR_S;
  coverColor.l = COVER_COLOR_L;
  coverHueDriftDir = Math.random() < 0.5 ? -1 : 1;
  coverColorLive = true;
  applyCoverColor();
}
rerollCoverColor();
if (dust) dust.setColorHSL(trailColorMotion.current);
if (moodOrbs) moodOrbs.setColorHSL(trailColorMotion.current);
if (particles.material?.uniforms?.uColorHSL) {
  const c = trailColorMotion.current;
  particles.material.uniforms.uColorHSL.value.set(c.h, c.s, c.l);
}

// Background gradient: slow mood drift (similar↔contrast vs trails). No beat kick in v1.
const bgColorCtl = {
  drift: BG_COLOR_DRIFT,
  contrastScale: BG_CONTRAST_SCALE,
};
const bgColorMotion = new BgColorMotion(bgColorCtl);
{
  bgColorMotion.setFromMood({ energy: 0.5, brightness: 0.5, texture: 0.5, heaviness: 0.5, dynamism: 0.5, bpm: 120 });
  if (starryBg) starryBg.setColors(bgColorMotion.top, bgColorMotion.bottom);
  if (cloudSkyBg) cloudSkyBg.setColors(bgColorMotion.top, bgColorMotion.bottom);
  if (lightLeakBg) lightLeakBg.setColors(bgColorMotion.top, bgColorMotion.bottom);
}

async function startAudio() {
  if (audioStarted) return;
  audioStarted = true;
  try {
    const uploaded = pendingUserAudio;
    const librarySrc = uploaded ? null : pickLibraryTrack();
    activeTrackSrc = uploaded ? null : librarySrc;
    try {
      const src = uploaded?.buffer ?? librarySrc;
      audioAnalyser = await createPrecomputedAnalyser(src);
    } catch (err) {
      if (!uploaded) throw err;
      console.warn('[audio] uploaded file failed, falling back to library track:', err);
      audioAnalyser = await createPrecomputedAnalyser(pickLibraryTrack());
    }
    // Don't reshape yet — flag readiness and let animate()'s 'transitioning'
    // branch call applyRealTrackMood() once the cover has fully faded to black
    // (see readyToApplyTrackMood declaration for why).
    readyToApplyTrackMood = true;
    // Track finished playing (native 'ended', fires once) → fade the whole
    // scene to black and loop back to a fresh cover page (see beginEnding()).
    // Guarded to 'game' inside beginEnding() itself so this can't double-fire
    // or fire while still mid-transition.
    audioAnalyser.onEnded(() => beginEnding());
  } catch (err) {
    console.warn('[audio] failed to load:', err);
  }
}

// The actual (heavier) reshape-to-track-mood step — re-bakes the cloud/trail/
// flowDots/volume to the track's whole-track mood and snaps trail/BG colour.
// Deliberately called only once the cover trail/dots are fully faded to black
// (see animate()'s 'transitioning' branch) so this frame's cost is invisible.
function applyRealTrackMood() {
  coverColorLive = false;
  const rawMood = audioAnalyser.mood;
  // Shape only: contrastMood punches the baked cloud so one field can dominate.
  // Colour / live windowed mood stay on the raw fingerprint (no S-curve).
  baseMood = contrastMood(rawMood);
  currentMood = { ...rawMood };
  applyBaseShape({ reframe: true });   // new shape → re-frame camera onto it
  // Trail / dust colour: snap to RAW track mood, then slow-drift + rare big-beat surges.
  trailColorMotion.setFromMood(rawMood, trackOverride()?.startHue);
  bloomField.paintColor = paintColorFromMain(trailColorMotion.current);
  // Flat colour tracks (windowed hue barely moves) → one forced mid-song jump.
  {
    const spanInfo = measureTrackColorHueSpan(
      audioAnalyser.analysed, rawMood?.bpm ?? baseMood.bpm);
    trailColorMotion.armForceMid(audioAnalyser.duration, spanInfo.flat);
  }
  if (trail) trail.material.uniforms.uColorHSL.value.set(
    trailColorMotion.current.h, trailColorMotion.current.s, trailColorMotion.current.l);
  if (flowDots) flowDots.setColorHSL(trailColorMotion.current);
  if (dust) dust.setColorHSL(trailColorMotion.current);
  if (moodOrbs) moodOrbs.setColorHSL(trailColorMotion.current);
  if (particles.material?.uniforms?.uColorHSL) {
    const c = trailColorMotion.current;
    particles.material.uniforms.uColorHSL.value.set(c.h, c.s, c.l);
  }
  // Background gradient: snap with the RAW track mood (same family as trails).
  bgColorMotion.setFromMood(rawMood);
  if (starryBg) starryBg.setColors(bgColorMotion.top, bgColorMotion.bottom);
  if (cloudSkyBg) cloudSkyBg.setColors(bgColorMotion.top, bgColorMotion.bottom);
  if (lightLeakBg) lightLeakBg.setColors(bgColorMotion.top, bgColorMotion.bottom);
}

// Track finished (native 'ended' — see startAudio's onEnded wiring). Kicks off
// the whole-scene fade-to-black (animate()'s 'ending' branch); guarded to only
// fire once and only from full gameplay (not mid cover→game transition).
function beginEnding() {
  if (appPhase !== 'game') return;
  appPhase = 'ending';
  endingStart = elapsed;
  dismissTutorial1(false);
  dismissTutorial2();
  // Don't grab a fading frame — if the delay hasn't landed yet, first
  // ending frames (still nearly full) can still capture (see maybeCaptureResult).
}

function resetResultShot() {
  resultCaptureAt = -1;
  resultCaptured = false;
  resultShotUrl = null;
  resultStart = null;
  resultFadingOut = false;
  if (resultBloom) { resultBloom.cancel(); resultBloom = null; }
  resultPaintEl = null;
  if (resultEl) { resultEl.remove(); resultEl = null; }
}

function scheduleResultCapture() {
  if (resultCaptured || resultCaptureAt >= 0) return;
  if (appPhase === 'ending' || appPhase === 'result' || appPhase === 'cover') return;
  resultCaptureAt = elapsed + RESULT_CAPTURE_DELAY_SEC;
}

function captureResultSquare() {
  const src = renderer.domElement;
  const w = src.width;
  const h = src.height;
  if (w < 2 || h < 2) return false;
  const side = Math.min(w, h);
  const sx = ((w - side) / 2) | 0;
  const sy = ((h - side) / 2) | 0;
  try {
    resultShotUrl = paintResultPlate(src, sx, sy, side);
  } catch {
    return false;
  }
  if (!resultShotUrl) return false;
  resultCaptured = true;
  resultCaptureAt = -1;
  return true;
}

function paintResultPlate(src, sx, sy, side) {
  const n = Math.max(32, RESULT_PAINT_SIZE | 0);
  const work = document.createElement('canvas');
  work.width = n;
  work.height = n;
  const wctx = work.getContext('2d', { willReadFrequently: true });
  if (!wctx) return null;
  wctx.imageSmoothingEnabled = true;
  wctx.drawImage(src, sx, sy, side, side, 0, 0, n, n);

  const img = wctx.getImageData(0, 0, n, n);
  const srcPx = img.data;
  const outPx = oilPaintPixels(srcPx, n, n, RESULT_PAINT_RADIUS, RESULT_PAINT_LEVELS, RESULT_PAINT_SAT);
  img.data.set(outPx);
  wctx.putImageData(img, 0, 0);

  const out = document.createElement('canvas');
  out.width = RESULT_OUTPUT_SIZE;
  out.height = RESULT_OUTPUT_SIZE;
  const octx = out.getContext('2d');
  if (!octx) return work.toDataURL('image/jpeg', 0.88);
  octx.imageSmoothingEnabled = true;
  octx.imageSmoothingQuality = 'low';
  octx.drawImage(work, 0, 0, RESULT_OUTPUT_SIZE, RESULT_OUTPUT_SIZE);
  octx.fillStyle = 'rgba(255,248,230,0.06)';
  octx.fillRect(0, 0, RESULT_OUTPUT_SIZE, RESULT_OUTPUT_SIZE);
  return out.toDataURL('image/jpeg', 0.9);
}

function oilPaintPixels(src, w, h, radius, levels, sat) {
  const r = Math.max(1, radius | 0);
  const bins = Math.max(4, levels | 0);
  const satAmt = sat;
  const out = new Uint8ClampedArray(src.length);
  const counts = new Uint32Array(bins);
  const rSum = new Uint32Array(bins);
  const gSum = new Uint32Array(bins);
  const bSum = new Uint32Array(bins);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      counts.fill(0); rSum.fill(0); gSum.fill(0); bSum.fill(0);
      for (let dy = -r; dy <= r; dy++) {
        const yy = y + dy < 0 ? 0 : y + dy >= h ? h - 1 : y + dy;
        for (let dx = -r; dx <= r; dx++) {
          const xx = x + dx < 0 ? 0 : x + dx >= w ? w - 1 : x + dx;
          const i = (yy * w + xx) * 4;
          const pr = src[i], pg = src[i + 1], pb = src[i + 2];
          const bin = Math.min(bins - 1, (((pr + pg + pb) * bins / 3) / 256) | 0);
          counts[bin]++;
          rSum[bin] += pr;
          gSum[bin] += pg;
          bSum[bin] += pb;
        }
      }
      let best = 0;
      for (let k = 1; k < bins; k++) if (counts[k] > counts[best]) best = k;
      const n = counts[best] || 1;
      let pr = rSum[best] / n, pg = gSum[best] / n, pb = bSum[best] / n;
      const gray = 0.299 * pr + 0.587 * pg + 0.114 * pb;
      pr = gray + (pr - gray) * satAmt;
      pg = gray + (pg - gray) * satAmt;
      pb = gray + (pb - gray) * satAmt;
      const o = (y * w + x) * 4;
      out[o] = pr; out[o + 1] = pg; out[o + 2] = pb; out[o + 3] = 255;
    }
  }
  return out;
}

function maybeCaptureResult() {
  if (resultCaptured || resultCaptureAt < 0) return;
  if (appPhase === 'ending' && endingStart != null) {
    const fadeT = Math.min(1, (elapsed - endingStart) / ENDING_FADE_TIME);
    if (fadeT > 0.12) { resultCaptureAt = -1; return; }
    // Track ended before the bloom finished opening — grab while still bright.
    if (!captureResultSquare()) resultCaptureAt = -1;
    return;
  }
  if (elapsed >= resultCaptureAt) {
    if (!captureResultSquare()) resultCaptureAt = -1;
  }
}

function showResultCard(url) {
  ensureCoverUiStyles();
  const wrap = document.createElement('div');
  Object.assign(wrap.style, {
    position: 'fixed',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '32px',
    zIndex: '12',
    opacity: '0',
    transition: `opacity ${RESULT_FADE_TIME}s ease`,
    pointerEvents: 'none',
  });

  const el = document.createElement('img');
  el.src = url;
  el.alt = 'your painting';
  el.draggable = false;
  el.className = 'cover-img-btn';
  Object.assign(el.style, {
    width: RESULT_IMAGE_SIZE,
    height: 'auto',
    display: 'block',
    pointerEvents: 'none',
    userSelect: 'none',
    cursor: 'pointer',
    boxShadow: '0 12px 40px rgba(0,0,0,0.45)',
  });
  el.addEventListener('click', endResultPhase);
  resultPaintEl = el;

  const endMark = document.createElement('img');
  endMark.src = RESULT_END_TEXT_SRC;
  endMark.alt = '';
  endMark.draggable = false;
  Object.assign(endMark.style, {
    width: RESULT_END_TEXT_SIZE,
    height: 'auto',
    display: 'block',
    pointerEvents: 'none',
    userSelect: 'none',
  });

  wrap.appendChild(el);
  wrap.appendChild(endMark);
  document.body.appendChild(wrap);
  return wrap;
}

function startResultPhase() {
  appPhase = 'result';
  resultStart = elapsed;
  resultFadingOut = false;
  resultEl = showResultCard(resultShotUrl);
  const paint = resultPaintEl;
  const startGather = () => {
    if (appPhase !== 'result' || resultFadingOut || !paint) return;
    playEndFadeInSfx();
    resultBloom = playResultGather2d({
      img: paint,
      src: resultShotUrl,
      duration: RESULT_GATHER_TIME,
      onReveal() {
        if (resultEl && appPhase === 'result' && !resultFadingOut) {
          resultEl.style.opacity = '1';
        }
      },
      onDone() {
        resultBloom = null;
        if (appPhase !== 'result' || resultFadingOut) return;
        if (resultEl) resultEl.style.pointerEvents = 'auto';
        if (paint) paint.style.pointerEvents = 'auto';
      },
    });
  };
  const kick = () => requestAnimationFrame(startGather);
  if (paint?.decode) paint.decode().then(kick, kick);
  else kick();
}

function endResultPhase() {
  if (appPhase !== 'result' || resultFadingOut) return;
  // Wait until gather finishes so the still is actually there to burst from.
  if (resultBloom) return;
  playEndClickSfx();
  resultFadingOut = true;
  resultStart = elapsed;
  if (resultEl) {
    resultEl.style.pointerEvents = 'none';
    resultEl.style.opacity = '0';
  }
  const paint = resultPaintEl;
  if (paint && resultShotUrl) {
    resultBloom = playResultBloom2d({
      img: paint,
      src: resultShotUrl,
      duration: RESULT_BLOOM_TIME,
      onDone() {
        resultBloom = null;
        if (appPhase === 'result') loopBackToCover();
      },
    });
  }
}

function updateResultPhase() {
  if (!resultFadingOut) return;
  // Bloom callback returns to cover. If the burst never started, use the card fade.
  if (resultBloom) return;
  if (elapsed - resultStart >= RESULT_FADE_TIME) loopBackToCover();
}

// Fade-to-black has finished (animate()'s 'ending' branch, fadeT>=1) — reroll
// a fresh cover-page shape/mood and fade it back in, exactly mirroring the
// very first page load, so Start behaves identically every loop. Mesh cloud
// leaves the scene again (same "defer its cost until hidden" reasoning as the
// initial load); trail/dots re-seed fresh random points inside COVER_CLOUD_
// RADIUS around the camera and start at opacity 0, fading back in via
// coverFadeInStart below. Audio/analyser state is fully torn down so the next
// Start behaves like a first-ever play (fresh decode/analysis).
function loopBackToCover() {
  appPhase = 'cover';
  endingStart = null;
  transitionStart = null;
  transitionSpawnStart = null;
  bgFadeStart = null;
  spawnRampElapsed = 0;
  spawnRampLifeEaseStart = null;
  readyToApplyTrackMood = false;
  audioRequested = false;
  audioStarted = false;
  if (audioAnalyser) {
    try { audioAnalyser.context.close(); } catch (err) { /* already closed / unsupported — harmless */ }
    audioAnalyser = null;
  }
  lastAudioData = null;
  // User upload is one play only — next Start uses the library track unless they upload again.
  pendingUserAudio = null;
  activeTrackSrc = null;
  bloomField.clear();

  if (meshAddedToScene) { scene.remove(particles); meshAddedToScene = false; }

  // Neutral cover mood/warp order (module-level constants) — reused as-is so
  // the mesh cloud (invisible, cosmetic-only during cover) and the shared
  // velocity bake stay consistent every loop-back too.
  const mood = coverMood;
  const warpOrder = coverWarpOrder;
  baseMood = { ...mood };
  currentMood = { energy: 0.5, brightness: 0.5, texture: 0.5, heaviness: 0.5, dynamism: 0.5, bpm: 120 };

  if (USE_MODEL && meshTypeCache) {
    const mix = moodToMeshMix(mood, { budget: MESH_BUDGET });
    particles.count = mix.totalCount;
    lastMeshMix = mix;
  }
  resampleAll6(particles, mood.energy, mood.brightness, mood.texture,
    mood.heaviness, mood.dynamism, mood.bpm, warpOrder, u, fieldDominance);
  if (USE_MODEL && meshTypeCache && lastMeshMix) applyMeshMix(particles, lastMeshMix, meshTypeCache);
  particleSim.resize(particles.count, particles.userData.seedPositions);
  syncMeshSimUniforms();
  if (picker?.setCount) picker.setCount(particles.count);
  particleSim.mat.uniforms.uMaxLife.value = SIM_MAX_LIFE;

  if (trail) {
    trail.killRadius = COVER_CLOUD_RADIUS;
    trail.pulseStrength = 0;
    trail.nearCull = COVER_CLOUD_RADIUS * COVER_NEAR_CULL_FRAC;
    trail.farCull = COVER_CLOUD_RADIUS;
    // Symmetric (no forward-bias) during cover — camera only rotates here.
    trail.behindFrac = 1.0;
    const coverSizeRatio = COVER_CLOUD_RADIUS / SIM_KILL_RADIUS;
    trail.width = TRAIL_WIDTH * coverSizeRatio * COVER_TRAIL_WIDTH_MUL;
    trail.taperTail = COVER_TRAIL_TAPER_TAIL;
    trail.deathTime = COVER_TRAIL_DEATH_TIME;
    trail.sampleMinDist = TRAIL_SAMPLE_MIN_DIST * coverSizeRatio;
    trail.sampleMaxDist = TRAIL_SAMPLE_MAX_DIST * coverSizeRatio;
    trail.samplePaintMinDist = TRAIL_SAMPLE_PAINT_MIN_DIST * coverSizeRatio;
    // See the initial cover setup's comment — avoids z-fighting flicker
    // between overlapping ribbons in cover's denser cloud.
    trail.material.depthWrite = false;
    // No tiling lattice for cover's single non-tiled cloud (see disableTiling's
    // comment above the initial cover setup) — restored on transition.
    disableTiling(trail.sim.mat.uniforms);
    // Fresh random-sphere reseed (NOT derived from the mesh cloud's shape —
    // see the initial cover setup's comment).
    trail.reset(randomSeedsInSphere(TRAIL_COUNT, COVER_CLOUD_RADIUS));
    trail.maxLife = SIM_MAX_LIFE;
    // Opacity stays at full — the "growing from 0" look comes from the
    // spawnFrac/spawnElapsed population ramp below (same sparse→full reveal
    // mechanic as the cover→game transition), not from dimming the whole
    // already-full population. See animate()'s cover-fade-in block.
    trail.opacity = COVER_TRAIL_OPACITY;
    trail.spawnFrac = 0;
    trail.spawnElapsed = 0;
  }
  if (flowDots) {
    flowDots.killRadius = COVER_CLOUD_RADIUS;
    flowDots.nearFadeStart = COVER_CLOUD_RADIUS * COVER_NEAR_FADE_START_FRAC;
    flowDots.nearFadeEnd = COVER_CLOUD_RADIUS * COVER_NEAR_FADE_END_FRAC;
    flowDots.behindFrac = 1.0;
    const coverSizeRatio = COVER_CLOUD_RADIUS / SIM_KILL_RADIUS;
    flowDots.size = FLOW_DOTS_SIZE * coverSizeRatio * COVER_FLOW_DOTS_SIZE_MUL;
    // Fresh random-sphere reseed, same as trail above.
    flowDots.seedPositions = randomSeedsInSphere(Math.max(1, FLOW_DOTS_COUNT | 0), COVER_CLOUD_RADIUS);
    flowDots.sim.reset(flowDots.seedPositions);
    disableTiling(flowDots.sim.mat.uniforms);
    disableTiling(flowDots.material.uniforms);
    flowDots.maxLife = SIM_MAX_LIFE;
    flowDots.opacity = COVER_FLOW_DOTS_OPACITY;
    flowDots.spawnFrac = 0;
    flowDots.spawnElapsed = 0;
  }
  bakeVolume(mood, warpOrder, fieldDominance, COVER_FIELD_FREQ_MUL);

  // Cover-only atmosphere off again (was faded to 0 already by the ending
  // fade, but reset .enabled too so nothing ticks needlessly on cover).
  if (moodOrbs) { moodOrbs.enabled = false; moodOrbs.fadeMul = 0; }
  if (elevHaze) { elevHaze.enabled = false; elevHaze.fadeMul = 0; }
  if (dust) { dust.enabled = false; dust.opacity = 0; }
  starryBg.fadeMul = cloudSkyBg.fadeMul = lightLeakBg.fadeMul = 0;
  u.uGlobalFadeIn.value = 0;

  // Camera / controls back to the pivot-in-place orbit rig. Position MUST be
  // reset to the origin here — gameplay's flyControls has since flown the
  // camera far away, but the cover cloud is freshly re-seeded inside a tiny
  // COVER_CLOUD_RADIUS sphere AROUND THE ORIGIN (see randomSeedsInSphere
  // above); without this the camera stays wherever flight left it and the new
  // cloud (no longer infinitely tiled — see disableTiling) is nowhere nearby,
  // so cover reappears empty. (The old tiled shape masked this bug: identical
  // copies repeated everywhere in space meant particles were always near the
  // camera regardless of its position.)
  camera.position.set(0, 0, 0);
  if (flyControlsInst) { flyControlsInst.dispose(); flyControlsInst = null; }
  orbitControls = createOrbitControls(camera, renderer.domElement, dismissCoverHint);
  controls = orbitControls;
  camera.near = 0.01;
  camera.far = COVER_CAMERA_FAR;
  camera.updateProjectionMatrix();
  renderer.domElement.style.filter = '';
  renderer.setPixelRatio(basePixelRatio * COVER_PIXEL_RATIO_MUL);

  attachStartButton();
  skipGameplayTutorials = true;
  resetTutorials();
  resetResultShot();
  rerollCoverColor();
  // Hold black until the cover volume bake lands, then fade trail/dots in
  // (same gate as first load — see maybeStartLoopBackCoverFadeIn).
  coverFadeScheduled = false;
  coverFadeArmed = true;
}


// ── Cover-page Start button (placeholder — real UI to be designed later) ─────
// Click hands off cover → gameplay: fades the cover trail/dots out, swaps the
// orbit camera for forward flight (heading seeded from the orbit's current
// look direction so the handoff is a continuous, un-jarring motion), and once
// that fadeout finishes (animate()'s 'transitioning' branch) starts audio and
// fades in the theme BG/haze/orbs. The sparse→full spawn ramp kicks in once
// the real track mood actually reshapes the cloud (see applyBaseShape).
// `let` + attachStartButton() (not a one-off const) — loopBackToCover() needs
// to create a brand-new button (with a fresh fade-in + click listener) each
// time the scene loops back to cover, since the previous one was removed.
// logoEl follows the exact same lifecycle (created alongside the button,
// removed on Start, recreated on loop-back) so the two fade in/out together.
let startBtn = null;
let uploadBtn = null;
let logoEl = null;
let logoIconEl = null;
let adviceEl = null;
// First load only: icon + advice sit through the black hold. Advice fades
// out first; one second later title, buttons, and BG particles fade in
// together. Loop-back skips icon/advice and fades title + buttons with
// the particles.
let coverUiPending = false;
function fadeInCoverUi() {
  coverUiPending = false;
  const advice = adviceEl;
  if (!advice) {
    revealCoverTitleUi();
    return;
  }
  const adviceFadeSec = 0.55;
  advice.style.transition = `opacity ${adviceFadeSec}s ease`;
  requestAnimationFrame(() => { advice.style.opacity = '0'; });
  window.setTimeout(() => {
    advice.remove();
    if (adviceEl === advice) adviceEl = null;
    window.setTimeout(revealCoverTitleUi, 1000);
  }, adviceFadeSec * 1000);
}
function revealCoverTitleUi() {
  beginCoverSceneFade();
  if (startBtn) startBtn.style.pointerEvents = '';
  if (uploadBtn) uploadBtn.style.pointerEvents = '';
  const fade = `opacity ${coverFadeInDuration}s ease`;
  if (logoEl) logoEl.style.transition = fade;
  if (startBtn) startBtn.style.transition = fade;
  if (uploadBtn) uploadBtn.style.transition = fade;
  const icon = logoIconEl;
  if (icon) icon.style.transition = fade;
  requestAnimationFrame(() => {
    if (logoEl) logoEl.style.opacity = '1';
    if (startBtn) startBtn.style.opacity = '1';
    if (uploadBtn) uploadBtn.style.opacity = '1';
    if (icon) icon.style.opacity = '0';
  });
  if (icon) {
    window.setTimeout(() => {
      icon.remove();
      if (logoIconEl === icon) logoIconEl = null;
    }, coverFadeInDuration * 1000);
  }
  startCoverHint();
}
function attachStartButton(instant = false) {
  logoEl = createLogo();
  startBtn = createStartButton();
  uploadBtn = createUploadButton();
  if (instant) {
    // First page load: icon on from the black hold (same slot as the title).
    // Title + buttons fade in with the particles (maybeStartInitialCoverFadeIn).
    logoIconEl = createLogoIcon();
    logoIconEl.style.opacity = '1';
    adviceEl = createAdvice();
    adviceEl.style.opacity = '1';
    logoEl.style.opacity = '0';
    startBtn.style.opacity = '0';
    uploadBtn.style.opacity = '0';
    startBtn.style.pointerEvents = 'none';
    uploadBtn.style.pointerEvents = 'none';
    coverUiPending = true;
  } else {
    // Looped-back cover: hold UI at 0 until the volume bake lands, then
    // fade with the particles (maybeStartLoopBackCoverFadeIn → fadeInCoverUi).
    logoEl.style.opacity = '0';
    startBtn.style.opacity = '0';
    uploadBtn.style.opacity = '0';
    startBtn.style.pointerEvents = 'none';
    uploadBtn.style.pointerEvents = 'none';
    coverUiPending = true;
  }
  startBtn.addEventListener('click', startTransition, { once: true });
}
attachStartButton(true);

function fadeOutCoverUi() {
  stopCoverHint();
  const els = [logoEl, logoIconEl, adviceEl, startBtn, uploadBtn].filter(Boolean);
  for (const el of els) {
    el.style.pointerEvents = 'none';
    el.style.opacity = '0';
  }
  window.setTimeout(() => {
    for (const el of els) el.remove();
  }, COVER_FADEOUT_TIME * 1000);
}

let coverHintEl = null;
let coverHintTimer = null;
let coverHintAlive = false;
let coverHintDismissing = false;

function clearCoverHintTimer() {
  if (coverHintTimer == null) return;
  window.clearTimeout(coverHintTimer);
  coverHintTimer = null;
}

function stopCoverHint() {
  coverHintAlive = false;
  coverHintDismissing = false;
  clearCoverHintTimer();
  if (coverHintEl) {
    coverHintEl.remove();
    coverHintEl = null;
  }
}

function startCoverHint() {
  stopCoverHint();
  if (appPhase !== 'cover') return;
  ensureCoverUiStyles();
  coverHintAlive = true;
  const el = document.createElement('img');
  el.src = COVER_HINT_SRC;
  el.alt = '';
  el.className = 'cover-hint';
  Object.assign(el.style, {
    position: 'fixed',
    left: '50%',
    bottom: COVER_HINT_BOTTOM,
    transform: 'translateX(-50%)',
    width: COVER_HINT_SIZE,
    height: 'auto',
    pointerEvents: 'none',
    userSelect: 'none',
    zIndex: '7',
    animationDuration: `${COVER_HINT_BREATHE}s`,
  });
  document.body.appendChild(el);
  coverHintEl = el;
}

function dismissCoverHint() {
  if (!coverHintAlive || coverHintDismissing || !coverHintEl) return;
  coverHintDismissing = true;
  coverHintAlive = false;
  const el = coverHintEl;
  const op = getComputedStyle(el).opacity;
  el.style.animation = 'none';
  el.style.opacity = op;
  void el.offsetWidth;
  el.style.transition = `opacity ${COVER_HINT_FADE}s ease`;
  el.style.opacity = '0';
  clearCoverHintTimer();
  coverHintTimer = window.setTimeout(() => {
    if (coverHintEl === el) {
      el.remove();
      coverHintEl = null;
    }
    coverHintDismissing = false;
  }, COVER_HINT_FADE * 1000);
}

let tutorial1El = null;
let tutorial2El = null;
let tutorial1Shown = false;
let tutorial1Dismissed = false;
let tutorial2Shown = false;
let tutorial2Dismissed = false;
let tutorial2Timer = null;
// After one finished play this page-load, later Start clicks skip the hints.
// Reload clears this (in-memory only).
let skipGameplayTutorials = false;

function createTutorialHint(src) {
  const el = document.createElement('img');
  el.src = src;
  el.alt = '';
  Object.assign(el.style, {
    position: 'fixed',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    maxWidth: 'min(32vw, 220px)',
    width: 'auto',
    height: 'auto',
    pointerEvents: 'none',
    userSelect: 'none',
    opacity: '0',
    zIndex: '8',
    transition: `opacity ${TUTORIAL_FADE_TIME}s ease`,
  });
  document.body.appendChild(el);
  return el;
}

function fadeInTutorialEl(el) {
  if (!el) return;
  let kicked = false;
  const kick = () => {
    if (kicked || !el.isConnected) return;
    kicked = true;
    // Flush so the browser paints opacity 0 before we ease up (else it pops).
    void el.offsetWidth;
    requestAnimationFrame(() => {
      if (el.isConnected) el.style.opacity = '1';
    });
  };
  if (el.complete && el.naturalWidth > 0) kick();
  else {
    el.addEventListener('load', kick, { once: true });
    if (el.decode) el.decode().then(kick, kick);
  }
}

function fadeOutTutorialEl(elRef, clearRef) {
  const el = elRef;
  if (!el) return;
  el.style.opacity = '0';
  window.setTimeout(() => {
    el.remove();
    clearRef();
  }, TUTORIAL_FADE_TIME * 1000);
}

function resetTutorials() {
  if (tutorial2Timer != null) { window.clearTimeout(tutorial2Timer); tutorial2Timer = null; }
  if (tutorial1El) { tutorial1El.remove(); tutorial1El = null; }
  if (tutorial2El) { tutorial2El.remove(); tutorial2El = null; }
  if (skipGameplayTutorials) {
    tutorial1Shown = tutorial1Dismissed = true;
    tutorial2Shown = tutorial2Dismissed = true;
  } else {
    tutorial1Shown = false;
    tutorial1Dismissed = false;
    tutorial2Shown = false;
    tutorial2Dismissed = false;
  }
}

function scheduleTutorial2() {
  if (tutorial2Shown || tutorial2Dismissed || tutorial2Timer != null) return;
  tutorial2Timer = window.setTimeout(() => {
    tutorial2Timer = null;
    if (tutorial2Dismissed || appPhase === 'cover' || appPhase === 'ending') return;
    tutorial2Shown = true;
    tutorial2El = createTutorialHint(TUTORIAL_2_SRC);
    fadeInTutorialEl(tutorial2El);
  }, TUTORIAL_2_DELAY * 1000);
}

function dismissTutorial1(showNext = true) {
  if (tutorial1Dismissed) return;
  tutorial1Dismissed = true;
  if (tutorial1El) {
    const el = tutorial1El;
    fadeOutTutorialEl(el, () => { if (tutorial1El === el) tutorial1El = null; });
  }
  if (showNext) scheduleTutorial2();
}

function dismissTutorial2() {
  if (tutorial2Dismissed) return;
  tutorial2Dismissed = true;
  if (tutorial2Timer != null) { window.clearTimeout(tutorial2Timer); tutorial2Timer = null; }
  if (tutorial2El) {
    const el = tutorial2El;
    fadeOutTutorialEl(el, () => { if (tutorial2El === el) tutorial2El = null; });
  }
}

function maybeShowTutorial1(t) {
  if (tutorial1Shown || tutorial1Dismissed || t < TUTORIAL_1_AT) return;
  tutorial1Shown = true;
  tutorial1El = createTutorialHint(TUTORIAL_1_SRC);
  fadeInTutorialEl(tutorial1El);
}

function startTransition() {
  if (appPhase !== 'cover') return;
  playButtonSfx();
  appPhase = 'transitioning';
  transitionStart = elapsed;
  fadeOutCoverUi();
  fadeOutCoverBgm();
  resetTutorials();

  // Camera handoff: same position, matching look direction (orbitControls'
  // internal yaw/pitch maps onto flyControls' the same way — see orbitControls.js).
  const heading = orbitControls.getHeading();
  flyControlsInst = createFlyControls(camera, renderer.domElement, dismissTutorial1);
  flyControlsInst.setHeading(heading.yaw, heading.pitch, heading.targetYaw, heading.targetPitch);
  flyControlsInst.setSpeedScale(0);   // ramps up over COVER_CAMERA_EASE_TIME (see animate)
  // Carry over the cover page's idle auto-drift rotation (if it was actively
  // spinning, i.e. the user wasn't mid-drag) so the yaw rotation doesn't stop
  // dead the instant Start is clicked — it decays smoothly to 0 instead,
  // blending into whatever the player steers next (see flyControls.js).
  flyControlsInst.setInitialSpin(orbitControls.getAutoDriftRate());
  orbitControls.dispose();
  controls = flyControlsInst;

  // Cover-only atmosphere turns on now; BG themes/haze/orbs/dust fade in over
  // TRANSITION_BG_FADE_TIME (driven in animate()). dust.enabled flips true only
  // once that fade actually starts (see animate()'s 'transitioning' branch) —
  // NOT here — otherwise it pops in at full opacity immediately on click,
  // visible right through the cover fadeout and the black-screen hold.
  if (moodOrbs) moodOrbs.enabled = true;
  if (elevHaze) elevHaze.enabled = true;

  // NOTE: startAudio() is NOT called here — see animate()'s 'transitioning'
  // branch. createPrecomputedAnalyser() decodes AND runs a full-track FFT
  // analysis (analyseBuffer) SYNCHRONOUSLY on the main thread the instant
  // decode resolves — a real multi-hundred-ms freeze. Kicking it off here
  // would land that freeze at a random point mid cover-fade. Deferring the
  // call itself (not just the reshape) until the cover has fully faded to
  // black guarantees the freeze — whenever it actually lands — hits a solid
  // black screen instead.
}

// ── Interaction ───────────────────────────────────────────────────────────────

const clock = new THREE.Clock();
let elapsed = 0;
// Scratch vector — camera look direction, refreshed once per frame in animate()
// and reused for uCamFwd on the mesh/trail/flowDots sims (forward-biased
// respawn reach) AND the render uniform (forward-biased fade), so both always
// agree on the same forward axis for a given frame.
const camFwd = new THREE.Vector3(0, 0, -1);

// Live 6-param mood, driven by the audio "mood of the moment" (getWindowedMood)
// while a track plays. Drives flow speed / particle size and the shape of new
// click-blooms. Before audio starts it rests at neutral (0.5). Rendering never
// reads it directly, so updating it is free.
let currentMood = { energy: 0.5, brightness: 0.5, texture: 0.5, heaviness: 0.5, dynamism: 0.5, bpm: 120 };
let moodUpdateAccum = 0;   // throttles the windowed-mood recompute (~10 Hz)

// Base-cloud shape state. baseMood is the last mood baked into the cloud — starts
// at the cover-page random mood (so the auto mesh-mix bake below, which fires as
// soon as the mesh type cache loads, matches the cover shape instead of snapping
// to a neutral default) and is replaced with the track's whole-track mood once
// Start is clicked (see startAudio). fieldDominance is the combine.js exponent.
let baseMood = { ...coverMood };
let fieldDominance = FIELD_DOMINANCE;

// Mood-driven flow speed. The live currentMood maps (moodToFlowSpeed) into this
// [min, max] band; audioMotion then adds a beat/loudness accent on top before the
// value is written to the sim's uFlowSpeed every frame — cheap (just scales the
// baked volume, no re-bake). Live-tunable band; .current holds the last speed.
const flowSpeed = { min: FLOW_SPEED_MIN, max: FLOW_SPEED_MAX, current: 0 };

// Persistent, world-anchored click-paint blooms (outward force on the flow).
const bloomField = new BloomField();
bloomField.getMood = () => currentMood;
bloomField.paintColor = paintColorFromMain(trailColorMotion.current);

// Click a particle → stamp a persistent bloom at that spot. Picks across all
// three visible systems (mesh cloud + trail heads + flow dots) — trails/dots
// make up most of what's on screen, so a mesh-only picker would miss most clicks.
const picker = createParticlePicker({
  renderer, camera,
  particleSim,
  count: particles.count,
  trail,
  flowDots,
  onPick: (hit) => {
    if (appPhase === 'cover' || appPhase === 'ending' || appPhase === 'result') return;
    bloomField.add(hit.world, {
      time: elapsed,
      camDist: hit.world.distanceTo(camera.position),   // far clicks bloom bigger, near smaller
    });
    dismissTutorial2();
    scheduleResultCapture();
  },
});

// Warm paint/burst shaders once at load so the first click doesn't freeze on compile.
// Also primes the trail/flowDots GPGPU + ribbon-draw shaders (first-use compile
// stalls otherwise land on the first REAL visible frame — see this session's
// "particles frozen then suddenly flowing" discussion) — harmless to run since
// both are still held at opacity/spawnFrac 0 at this point (see the initial-load
// hold set right after their construction above), so nothing visibly renders.
// Runs after the first frame so the GL context is fully ready.
function warmupPaintShaders() {
  const pos = camera.position;
  try {
    if (trail) trail.warmupPaint(pos);
    // Mesh sim already includes PAINT_GLSL; one step with a dummy bloom primes that path too.
    const u = particleSim.mat.uniforms;
    if (u.uBloomCount && u.uBloomA?.value?.[0]) {
      const prev = u.uBloomCount.value;
      u.uBloomCount.value = 1;
      u.uBloomA.value[0].set(pos.x, pos.y, pos.z, 1.5);
      u.uBloomB.value[0].set(1.0, 0.42, 1.0, 0.5);
      u.uBloomC.value[0].set(0, 1, 0.35, 0.6);
      u.uBloomD.value[0].set(1.4, 1.0, 2.5, 0.5);
      particleSim.update(1 / 60, pos);
      u.uBloomCount.value = prev;
    }
    // Prime the trail's advance/record GPGPU sim + its instanced ribbon-draw
    // material (NOT part of the main scene graph — drawn manually in
    // trail.render — so renderer.compile(scene, camera) below never touches
    // it). Still opacity/spawnFrac 0 here, so the one forced draw is invisible.
    if (trail) {
      trail.update(1 / 60, pos, 0, camera, null, null);
      trail.render(renderer, camera);
    }
    // FlowDots' sim likewise needs a manual prime (its render material IS in
    // the scene graph — flowDots.object3D — so renderer.compile below covers
    // that half; only the sim-side GPGPU shaders need this explicit step).
    if (flowDots) flowDots.update(1 / 60, camera, 0, null);
    renderer.compile(scene, camera);
  } catch (err) {
    console.warn('[warmup] paint shader warmup failed:', err);
  } finally {
    // Second half of the initial-load readiness gate (see initialBakeDone) —
    // runs even if warmup partially failed, so a shader-compile hiccup can't
    // permanently strand the cover page on a black hold.
    initialWarmupDone = true;
    maybeStartInitialCoverFadeIn();
  }
}
requestAnimationFrame(() => requestAnimationFrame(warmupPaintShaders));

// ── Animate ───────────────────────────────────────────────────────────────────

const u = particles.material.uniforms;

// ── Base-cloud shaping ────────────────────────────────────────────────────────
// The base cloud is re-baked to the track's whole-track mood once when audio starts
// (startAudio). The warp order (below) picks the top 1-2 fields as the domain-warp
// chain; a fresh shuffle each rebake keeps A→B / B→A emergent variety.

// Option A — Dominant Warp + Full Superposition:
// Pick the top 1-2 fields by slider value as the warp chain.
// All active fields still contribute to the combined curl (superposition) at
// the warped position, so every parameter shapes the flow — only the strongest
// 1-2 deform the coordinate space itself.
// Shuffling the selected warpers preserves emergent unpredictability on each
// slider change without the chaos of a 6-deep chain.
// (buildWarpOrder + its consts moved to the top of the file — needed by the
// cover-page random-mood seeding before this point.)


// Re-shape the baked base cloud to `baseMood` at the current `fieldDominance`.
// Called on audio start (track mood, with reframe).
// Also bakes the one-shot mood mesh mix (1 major + 2 accents) when type cache is ready.
function applyBaseShape({ reframe = false } = {}) {
  const warpOrder = buildWarpOrder(baseMood);

  // One-shot mood BG theme (cosmos|clouds|leaks) — same bake as mesh mix / volume.
  bakeBgType(baseMood);

  if (USE_MODEL && meshTypeCache) {
    const mix = moodToMeshMix(baseMood, { budget: MESH_BUDGET });
    particles.count = mix.totalCount;
    lastMeshMix = mix;
  }

  resampleAll6(particles, baseMood.energy, baseMood.brightness, baseMood.texture,
    baseMood.heaviness, baseMood.dynamism, baseMood.bpm, warpOrder, u, fieldDominance);

  if (USE_MODEL && meshTypeCache && lastMeshMix) {
    applyMeshMix(particles, lastMeshMix, meshTypeCache);
  }

  particleSim.resize(particles.count, particles.userData.seedPositions);
  syncMeshSimUniforms();
  if (picker?.setCount) picker.setCount(particles.count);

  // Trail/flowDots/volume are NOT touched here while still on the cover page
  // (appPhase === 'cover') — this fires from the async mesh-type-cache load
  // (see its .then() below), which lands at an unpredictable moment AFTER the
  // cover-page cloud has already been correctly set up (tiny random-sphere
  // seeds, COVER_CLOUD_RADIUS-scaled kill/cull, tiling disabled — see the
  // cover-setup block above). Without this guard, this call would silently
  // overwrite the trail/flowDots seed positions with the MESH cloud's real,
  // gameplay-scale shape (particles.userData.seedPositions, spread out to
  // ~SIM_KILL_RADIUS) — since cover's cull distances are still tiny and
  // tiling (which used to mask this by tiling copies everywhere) is off,
  // almost the whole reseeded population would land outside the tiny visible
  // band, reading as "way fewer particles" versus the correctly-seeded look
  // loopBackToCover() produces. The mesh cloud itself is harmless to update
  // here (it's invisible/out of the scene during cover regardless — see its
  // deferred scene.add() at fadeOutT>=1), so only trail/flowDots/bakeVolume
  // are skipped; they'll get their real reshape once startAudio() actually
  // calls applyBaseShape({reframe:true}).
  if (appPhase === 'cover') return;

  if (trail) trail.reset(particles.userData.seedPositions);   // trails follow the new shape too
  if (flowDots) flowDots.reshape(baseMood, warpOrder, fieldDominance);
  bakeVolume(baseMood, warpOrder, fieldDominance);        // rebake the flow to match

  // This is the real track-mood reshape fired mid-transition (from startAudio,
  // reframe:true) — kick off the sparse→full spawn ramp (see animate()'s
  // transition branch; particles is already in the scene, pre-warmed during
  // cover — see its creation above). Mid-flight dominance-slider resamples
  // (reframe:false, appPhase already 'game') must NOT re-trigger the ramp, so
  // this only fires once per session.
  if (reframe && appPhase === 'transitioning') {
    u.uSpawnFrac.value = 0;
    u.uSpawnElapsed.value = 0;
    // Restore the real gameplay reveal timescale — the cover-page ramps (see
    // maybeStartInitialCoverFadeIn/loopBackToCover) shorten this to match
    // their own faster coverFadeInDuration; must snap back to the full
    // TRANSITION_SPAWN_RAMP_TIME here or this ramp will similarly stall sparse.
    if (trail) trail.spawnRampTime = TRANSITION_SPAWN_RAMP_TIME;
    if (flowDots) flowDots.spawnRampTime = TRANSITION_SPAWN_RAMP_TIME;
    u.uSpawnRampTime.value = TRANSITION_SPAWN_RAMP_TIME;
    if (trail) { trail.spawnFrac = 0; trail.spawnElapsed = 0; }
    if (flowDots) { flowDots.spawnFrac = 0; flowDots.spawnElapsed = 0; }
    transitionSpawnStart = elapsed;
    spawnRampElapsed = 0;
    // Push lifetime way out for the duration of the ramp so a particle/trail/dot
    // that has just grown in doesn't age-out and respawn (which would fade it
    // back to 0 via the age-based death envelope, then birth-fade back in) before
    // the whole population has finished growing in — that read as particles
    // dying and reappearing instead of the scene purely filling up. Restored to
    // SIM_MAX_LIFE once the ramp completes (see animate()'s transition branch),
    // so normal age-based recycling only kicks in after growth is done.
    particleSim.mat.uniforms.uMaxLife.value = SPAWN_RAMP_MAX_LIFE;
    if (trail) trail.maxLife = SPAWN_RAMP_MAX_LIFE;
    if (flowDots) flowDots.maxLife = SPAWN_RAMP_MAX_LIFE;
  }

  if (reframe) frameCloudCamera(camera, controls, particles.userData.seedPositions);
}

// Kick mesh-mix bake once the five type libraries are in cache (neutral mood until audio).
if (USE_MODEL) {
  loadMeshTypeCache(MESH_TYPES)
    .then((cache) => {
      meshTypeCache = cache;
      applyBaseShape({ reframe: false });
    })
    .catch((err) => console.warn('[models] mesh type cache failed — keeping cubes:', err));
}

function animate() {
  requestAnimationFrame(animate);

  const dt = clock.getDelta();
  elapsed += dt;
  coverBgm.update(elapsed);
  u.uTime.value = elapsed;
  // Keep the mesh sprite-orientation's living-field warp in step with the sim (the sim
  // advances its own copy in ParticleSim.update; the render shader just needs the clock).
  if (u.uFieldWarpTime) u.uFieldWarpTime.value = elapsed;

  // Fly the camera forward + apply steering.
  controls.update(dt);

  // Frozen dust: wrap the sparse field around the camera (parallax / spatial cue).
  if (dust) dust.update(camera.position);
  if (moodOrbs) moodOrbs.update(camera.position, elapsed);

  // Cover→game transition: sequenced (not parallel) ramps kicked off by
  // startTransition(). 1) cover trail/dots fade to 0 over COVER_FADEOUT_TIME,
  // BG stays flat black throughout; 2) once THAT fadeout has finished AND music
  // has actually started playing (transitionSpawnStart, set inside
  // applyBaseShape when the real track mood reshapes the cloud — may lag
  // behind transitionStart while audio loads), the BG theme/haze/mood-orbs
  // begin fading in over TRANSITION_BG_FADE_TIME; 3) the same
  // transitionSpawnStart also drives the sparse→full spawn ramp (0→1 over
  // TRANSITION_SPAWN_RAMP_TIME) across mesh/trail/dots in parallel with the BG
  // fade. Camera-speed ease is handled below alongside the mood-driven speed calc.
  if (appPhase === 'transitioning') {
    const te = elapsed - transitionStart;

    const fadeOutT = Math.min(1, te / COVER_FADEOUT_TIME);
    if (trail) trail.opacity = COVER_TRAIL_OPACITY * (1 - fadeOutT);
    if (flowDots) flowDots.opacity = COVER_FLOW_DOTS_OPACITY * (1 - fadeOutT);
    // Blur / cover-only kill-radius pull-in don't need to ease — the screen is
    // fully black by fadeOutT=1, so just snap both back to normal the instant
    // the fade finishes (no visible pop, it's black).
    if (fadeOutT >= 1) {
      renderer.domElement.style.filter = '';
      if (trail) {
        trail.killRadius = SIM_KILL_RADIUS;
        trail.nearCull = TRAIL_NEAR_CULL;
        trail.farCull = TRAIL_FAR_CULL;
        trail.behindFrac = CLOUD_BEHIND_FRAC;
        trail.pulseStrength = TRAIL_PULSE_STRENGTH;
        // Restore the real, unscaled ribbon width/sample distances (see the
        // cover-setup's coverSizeRatio proportional-shrink comment).
        trail.width = TRAIL_WIDTH;
        trail.taperTail = TRAIL_TAPER_TAIL;
        trail.deathTime = TRAIL_DEATH_TIME;
        trail.sampleMinDist = TRAIL_SAMPLE_MIN_DIST;
        trail.sampleMaxDist = TRAIL_SAMPLE_MAX_DIST;
        trail.samplePaintMinDist = TRAIL_SAMPLE_PAINT_MIN_DIST;
        // Restore proper depth-write (nearer trails occlude farther ones) —
        // see the cover-setup's depthWrite=false comment.
        trail.material.depthWrite = true;
        // Restore the real gameplay tiling lattice (see disableTiling's
        // comment above the initial cover setup) — cover's single non-tiled
        // cloud no longer applies once real gameplay begins.
        restoreTiling(trail.sim.mat.uniforms);
      }
      if (flowDots) {
        flowDots.killRadius = SIM_KILL_RADIUS;
        flowDots.nearFadeStart = 0.25;
        flowDots.nearFadeEnd = 0.7;
        flowDots.behindFrac = CLOUD_BEHIND_FRAC;
        // Restore the real, unscaled dot size (see the cover-setup comment).
        flowDots.size = FLOW_DOTS_SIZE;
        restoreTiling(flowDots.sim.mat.uniforms);
        restoreTiling(flowDots.material.uniforms);
      }
      if (camera.far !== 80) { camera.far = 80; camera.updateProjectionMatrix(); }
      renderer.setPixelRatio(basePixelRatio);
      updateComposerSize(window.innerWidth, window.innerHeight);
      // Mesh cloud's one-time shader-compile/texture-upload/sim-allocate cost
      // (previously paid during cover — see its creation above) now lands here
      // instead, on the solid black screen, so it's not visible either way.
      if (!meshAddedToScene) { scene.add(particles); meshAddedToScene = true; }
    }

    // startAudio() itself (decode + synchronous FFT analysis — the actual
    // source of the freeze) is deliberately held off until the cover fadeout
    // is fully done, so that freeze lands on a solid black screen.
    if (!audioRequested && fadeOutT >= 1) {
      audioRequested = true;
      startAudio();
    }

    // The heavy reshape-to-track-mood step (resample/rebake/mesh-mix/sim-resize)
    // is also deliberately held off until the cover trail/dots are fully faded
    // to black, so whatever hitch it additionally causes also lands there.
    if (readyToApplyTrackMood && fadeOutT >= 1) {
      readyToApplyTrackMood = false;
      applyRealTrackMood();
    }

    // BG fade only begins once the cover fadeout is fully done AND the real
    // track mood has landed (music started) — whichever comes later.
    if (bgFadeStart === null && fadeOutT >= 1 && transitionSpawnStart !== null) {
      bgFadeStart = elapsed;
    }
    // Also drives the mesh/trail/dots whole-scene fade-in from black (see
    // uGlobalFadeIn / trail+flowDots opacity below) — kept in lockstep with the
    // BG so gameplay fades in as one unified reveal over TRANSITION_BG_FADE_TIME,
    // rather than the BG fading in while particles just pop straight to full.
    let bgT = 0;
    if (bgFadeStart !== null) {
      bgT = Math.min(1, (elapsed - bgFadeStart) / TRANSITION_BG_FADE_TIME);
      maybeShowTutorial1(elapsed - bgFadeStart);
      starryBg.fadeMul = cloudSkyBg.fadeMul = lightLeakBg.fadeMul = bgT;
      if (moodOrbs) moodOrbs.fadeMul = bgT;
      if (elevHaze) elevHaze.fadeMul = bgT;
      // FrozenDust has no fadeMul uniform — ramp its opacity directly instead,
      // and only flip it visible once the ramp actually starts (bgT > 0).
      if (dust) {
        dust.enabled = true;
        dust.opacity = FROZEN_DUST_OPACITY * bgT;
      }
      vignetteEl.style.opacity = String(bgT);
    }
    u.uGlobalFadeIn.value = bgT;

    if (transitionSpawnStart !== null) {
      // Only accumulate the ramp clock while the flow field is actually ready
      // (see spawnRampElapsed's declaration comment) — otherwise particles
      // hidden behind a pending bake would silently accrue spawnFade progress
      // and then all pop into view together once revealed.
      if (pendingBakeJobId === null) spawnRampElapsed += dt;
      const spawnElapsedSec = spawnRampElapsed;
      const st = Math.min(1, spawnElapsedSec / TRANSITION_SPAWN_RAMP_TIME);
      u.uSpawnFrac.value = st;
      u.uSpawnElapsed.value = spawnElapsedSec;
      if (trail) { trail.opacity = TRAIL_OPACITY * bgT; trail.spawnFrac = st; trail.spawnElapsed = spawnElapsedSec; }
      if (flowDots) { flowDots.opacity = FLOW_DOTS_OPACITY * bgT; flowDots.spawnFrac = st; flowDots.spawnElapsed = spawnElapsedSec; }
      // Ramp's own population growth is done — start gradually easing the
      // lifetime cap back down to SIM_MAX_LIFE (see TRANSITION_LIFE_EASE_TIME
      // comment in config.js for why this is eased rather than snapped).
      if (st >= 1 && spawnRampLifeEaseStart === null) {
        spawnRampLifeEaseStart = elapsed;
      }
      if (spawnRampLifeEaseStart !== null) {
        const lifeT = Math.min(1, (elapsed - spawnRampLifeEaseStart) / TRANSITION_LIFE_EASE_TIME);
        // Lerp the RECIPROCAL (1/life), not the raw life value. SPAWN_RAMP_MAX_LIFE
        // (9999) is ~1600x SIM_MAX_LIFE (6) — a linear lerp of the raw value spends
        // ~99.9% of TRANSITION_LIFE_EASE_TIME still in the thousands (nowhere near
        // any particle's actual accumulated age), then crashes through the
        // 6-16s range that matters in the final ~0.1% of the window — so every
        // particle whose age already exceeds that shrunk-small cap respawns in
        // the same instant (a mass "thundering herd" recycle) instead of the
        // intended gradual spread. Lerping 1/life is linear in RECYCLE RATE, so
        // the effective cap glides smoothly through the whole 6-16s age range
        // across the whole window, spreading respawns out as intended.
        const invLife = THREE.MathUtils.lerp(1 / SPAWN_RAMP_MAX_LIFE, 1 / SIM_MAX_LIFE, lifeT);
        const life = 1 / invLife;
        particleSim.mat.uniforms.uMaxLife.value = life;
        if (trail) trail.maxLife = life;
        if (flowDots) flowDots.maxLife = life;
      }
      if (st >= 1 && bgFadeStart !== null && elapsed - bgFadeStart >= TRANSITION_BG_FADE_TIME) {
        appPhase = 'game';   // transition fully complete
      }
    }
  }

  // Track finished (beginEnding(), triggered by the audio source's native
  // 'ended' event) — fade the whole scene to black over ENDING_FADE_TIME,
  // mirroring the cover→game fade-in in reverse (same uGlobalFadeIn/opacity/
  // fadeMul uniforms, just eased the other direction), then loop back to a
  // freshly re-rolled cover page once fully black.
  if (appPhase === 'ending') {
    const et = elapsed - endingStart;
    const fadeT = Math.min(1, et / ENDING_FADE_TIME);
    const inv = 1 - fadeT;
    u.uGlobalFadeIn.value = inv;
    if (trail) trail.opacity = TRAIL_OPACITY * inv;
    if (flowDots) flowDots.opacity = FLOW_DOTS_OPACITY * inv;
    starryBg.fadeMul = cloudSkyBg.fadeMul = lightLeakBg.fadeMul = inv;
    if (moodOrbs) moodOrbs.fadeMul = inv;
    if (elevHaze) elevHaze.fadeMul = inv;
    if (dust) dust.opacity = FROZEN_DUST_OPACITY * inv;
    vignetteEl.style.opacity = String(inv);
    if (fadeT >= 1) {
      if (resultShotUrl) startResultPhase();
      else loopBackToCover();
    }
  }

  if (appPhase === 'result') {
    updateResultPhase();
  }

  // Cover-page population fade-in — used both for the very first page load
  // (initial black hold → maybeStartInitialCoverFadeIn, duration
  // INITIAL_LOAD_FADE_TIME) and every subsequent loop back from 'ending'
  // (loopBackToCover, duration COVER_FADEOUT_TIME) — see coverFadeInDuration.
  // Grows the trail/dots population sparse→full from true zero (same
  // spawnFrac/spawnElapsed reveal mechanic the cover→game transition uses —
  // each particle gets a randomly-spread reveal instant across the ramp, then
  // fades in over its own short window) rather than dimming an already-full
  // population — that reads as a "pop" since every particle would already be
  // present (just faint) from frame one. Opacity itself is set to full
  // up-front by whichever caller starts this ramp; only the population grows
  // here. Also fades the Start button in via its own CSS transition
  // (attachStartButton). No-op until one of those callers sets
  // coverFadeInStart.
  if (appPhase === 'cover' && coverFadeInStart !== null) {
    const spawnElapsedSec = elapsed - coverFadeInStart;
    const st = Math.min(1, spawnElapsedSec / coverFadeInDuration);
    if (trail) { trail.spawnFrac = st; trail.spawnElapsed = spawnElapsedSec; }
    if (flowDots) { flowDots.spawnFrac = st; flowDots.spawnElapsed = spawnElapsedSec; }
    if (st >= 1) coverFadeInStart = null;
  }

  // Time-varying mood: while audio plays, ease currentMood toward the live windowed
  // "mood of the moment" so flow speed / size / bloom shape track the section.
  // Throttled (~10 Hz) + EMA-smoothed; CPU-only, no GPU work.
  if (audioAnalyser) {
    moodUpdateAccum += dt;
    if (moodUpdateAccum >= 0.1) {
      moodUpdateAccum = 0;
      const t = audioAnalyser.getWindowedMood();
      const a = MOOD_SMOOTH;
      currentMood = {
        energy: a * currentMood.energy + (1 - a) * t.energy,
        brightness: a * currentMood.brightness + (1 - a) * t.brightness,
        texture: a * currentMood.texture + (1 - a) * t.texture,
        heaviness: a * currentMood.heaviness + (1 - a) * t.heaviness,
        dynamism: a * currentMood.dynamism + (1 - a) * t.dynamism,
        bpm: a * currentMood.bpm + (1 - a) * t.bpm,
      };
    }
  }

  // Mood-driven flow speed: map the live currentMood into the [min, max] band.
  // Free (uniform write, no re-bake); currentMood is EMA-smoothed so it eases.
  flowSpeed.current = flowSpeed.min
    + (flowSpeed.max - flowSpeed.min) * moodToFlowSpeed(currentMood);

  // Camera fly speed: TEMPO-led (moodToFlySpeed) — slow music crawls, fast music rushes.
  // Wider scale band than particle flow for a clearer contrast. During the cover→game
  // transition this is additionally eased up from a standstill over COVER_CAMERA_EASE_TIME
  // (orbitControls/flyControlsInst.setSpeedScale is a no-op on whichever isn't active).
  const flyT = moodToFlySpeed(currentMood);
  let speedScale = FLY_SPEED_SCALE_MIN + (FLY_SPEED_SCALE_MAX - FLY_SPEED_SCALE_MIN) * flyT;
  if (appPhase === 'transitioning') {
    const camT = Math.min(1, (elapsed - transitionStart) / COVER_CAMERA_EASE_TIME);
    speedScale *= coverCameraEaseIn(camT);
  }
  controls.setSpeedScale(speedScale);

  // Mood-driven overall size (expressive channel): scales the render grain on top
  // of the panel's static band + streamline taper. Free uniform write, eased mood.
  u.uSizeMoodScale.value = moodToSize(currentMood);

  // Mood-driven trail spawn drift: intense → births slide farther downstream.
  if (trail) {
    const t = moodToSpawnDrift(currentMood);
    const d0 = trail.spawnDriftMin;
    const d1 = trail.spawnDriftMax;
    trail.spawnDrift = d0 + (d1 - d0) * t;
  }

  // Real-time audio motion (Phase A): layer the per-frame beat/loudness/treble on
  // top — a transient flow-speed surge on beats + loud-section accent, and a size
  // shimmer/pop via uAudioTreble. Cheap: just scales the already-computed uniforms.
  let trailAudio = null;
  if (audioAnalyser) {
    lastAudioData = audioAnalyser.getAudioData();
    const m = audioMotion.update(lastAudioData, dt);
    flowSpeed.current *= m.flowMul;
    u.uAudioTreble.value = m.treble;
    trailAudio = { beat: m.beat, loud: m.loud };   // same beat source → trails react in sync
  } else {
    u.uAudioTreble.value = 0;
  }
  // Refresh the shared forward-direction scratch vector once per frame — used
  // below both for the sims' forward-biased respawn reach and the render
  // uniform's forward-biased fade, so they always agree (see camFwd's decl).
  camera.getWorldDirection(camFwd);
  // Freeze advection while a shape-change bake is in flight (see bakeVolume's
  // pendingBakeJobId comment) — the new seed positions are already applied,
  // but the matching velocity volume hasn't landed yet, so advecting with the
  // stale old volume can send particles the wrong way. Holding flow speed at 0
  // just pauses drift for those few frames instead (respawn/lifetime/paint
  // still run normally). On top of that, HIDE everything for the same window
  // (uFlowReady) so the player never sees the frozen/motionless cloud at all —
  // it simply isn't visible until the matching flow field is ready, then
  // appears already flowing correctly.
  const flowReadyNow = pendingBakeJobId === null;
  const effectiveFlowSpeed = flowReadyNow ? flowSpeed.current : 0;
  particleSim.mat.uniforms.uFlowSpeed.value = effectiveFlowSpeed;
  u.uFlowReady.value = flowReadyNow ? 1.0 : 0.0;
  if (trail) trail.flowReady = flowReadyNow ? 1.0 : 0.0;
  if (flowDots) flowDots.flowReady = flowReadyNow ? 1.0 : 0.0;

  // Trail / dust theme colour; paint ink = live main + fixed hue offset (drifts with main).
  if (coverColorLive) {
    coverColor.h = (coverColor.h + coverHueDriftDir * COVER_HUE_DRIFT * dt + 1) % 1;
    applyCoverColor();
  } else {
    const playT = audioAnalyser ? audioAnalyser.getTime() : null;
    const audioCol = lastAudioData
      ? { isBeat: lastAudioData.isBeat, loud: audioMotion.loudEMA }
      : null;
    const hsl = trailColorMotion.update(currentMood, dt, audioCol, playT);
    bloomField.paintColor = paintColorFromMain(hsl);
    // Cover page: trails/dots use the plain, un-boosted colour (no bright
    // pulse) — just the normal mood-driven hue/sat/lightness.
    const coverHsl = hsl;
    if (trail) trail.material.uniforms.uColorHSL.value.set(coverHsl.h, coverHsl.s, coverHsl.l);
    if (flowDots) flowDots.setColorHSL(coverHsl);
    if (dust) dust.setColorHSL(hsl);
    if (moodOrbs) moodOrbs.setColorHSL(hsl);
    if (u.uColorHSL) u.uColorHSL.value.set(hsl.h, hsl.s, hsl.l);
  }

  // Theme BG: mood colour wash + structure (cosmos / clouds / leaks).
  if (starryBg || cloudSkyBg || lightLeakBg) {
    const g = bgColorMotion.update(
      currentMood,
      dt,
      coverColorLive ? null : trailColorMotion.current,
    );
    if (starryBg) {
      starryBg.setColors(g.top, g.bottom);
      starryBg.update(camera);
    }
    if (cloudSkyBg) {
      cloudSkyBg.setColors(g.top, g.bottom);
      cloudSkyBg.update(camera, elapsed);
    }
    if (lightLeakBg) {
      lightLeakBg.setColors(g.top, g.bottom);
      lightLeakBg.update(camera, elapsed);
    }
  }
  // Elevation haze: shared spatial cue over whatever theme BG is active.
  if (elevHaze) elevHaze.update(camera);

  // Cover page: the GPGPU sims tick at a fraction of the frame rate (skip N-1
  // of every N frames, stepping with an N×dt catch-up on the frame that does
  // run) — nothing on the pre-warmed, blurred cover page needs full-rate
  // advection. Motion speed is unchanged (dt is scaled to compensate), only
  // the GPU pass count drops. Reverts to every-frame the instant appPhase
  // leaves 'cover'.
  simTickAccum += dt;
  simTickCounter = (simTickCounter + 1) % Math.max(1, COVER_SIM_TICK_DIV);
  const runSimThisFrame = appPhase !== 'cover' || COVER_SIM_TICK_DIV <= 1 || simTickCounter === 0;
  const simDt = runSimThisFrame ? simTickAccum : 0;
  if (runSimThisFrame) simTickAccum = 0;

  if (runSimThisFrame) {
    // Standalone trails: advect along the same volume at the live flow speed (GPU),
    // react to the shared audio motion (brightness flare + length + speed whip), and
    // feel the same click-paint blooms (scaled by trail.paintStrength).
    if (trail) trail.update(simDt, camera.position, effectiveFlowSpeed, camera, trailAudio, { field: bloomField, elapsed });

    // Mesh GPGPU sim is unused on cover (cloud not in the scene). Skip until
    // fadeOutT>=1 adds it — shaders are already primed by warmupPaintShaders().
    if (meshAddedToScene) {
      bloomField.syncUniforms(particleSim.mat.uniforms, camera.position, elapsed);
      particleSim.update(simDt, camera.position, camFwd);
      u.uSimPos.value = particleSim.getPositionTexture();
      u.uSimCell.value = particleSim.getCellTexture();
    }
  }
  u.uCamPos.value.copy(camera.position);
  u.uCamFwd.value.copy(camFwd);   // look axis → forward-biased cloud fade (shared with the sims' respawn reach)

  // Flowing light dots: same volume / paint / flow speed, own sim + cheap Points.
  if (runSimThisFrame && flowDots) flowDots.update(simDt, camera, effectiveFlowSpeed, { field: bloomField, elapsed });

  // Cover page: route through the FXAA composer (see TrailPass/updateComposerSize
  // above) for cheap antialiasing. Gameplay uses the original direct path — no
  // AA overhead during the fill-rate-sensitive phase.
  if (appPhase === 'cover') {
    composer.render();
  } else {
    renderer.render(scene, camera);
    // Trails draw last, straight onto the screen — they share the meshes' depth buffer, so
    // meshes (and nearer trails) occlude the trails behind them.
    if (trail) trail.render(renderer, camera);
    maybeCaptureResult();
  }
}

animate();

// ── Helpers ───────────────────────────────────────────────────────────────────

// Cover-page logo — the project's title art, centered on screen. Placed just
// above the Start button (see createStartButton) so together they read as a
// single centered title-card group. Follows the exact same fade lifecycle as
// the Start button (see attachStartButton/startTransition).
function ensureCoverUiStyles() {
  if (document.getElementById('cover-ui-styles')) return;
  const s = document.createElement('style');
  s.id = 'cover-ui-styles';
  s.textContent = `
    .cover-img-btn {
      padding: 0;
      border: none;
      background: transparent;
      cursor: pointer;
      line-height: 0;
      transition: transform 0.18s ease, filter 0.18s ease, opacity 0.18s ease;
    }
    .cover-img-btn img {
      display: block;
      height: auto;
      pointer-events: none;
      user-select: none;
    }
    .cover-img-btn:hover {
      transform: scale(1.06);
      filter: brightness(1.18);
    }
    .cover-img-btn:active {
      transform: scale(0.98);
      filter: brightness(0.92);
    }
    @keyframes cover-hint-breathe {
      0%, 100% { opacity: 0.22; }
      50% { opacity: 0.9; }
    }
    .cover-hint {
      animation-name: cover-hint-breathe;
      animation-timing-function: ease-in-out;
      animation-iteration-count: infinite;
    }
  `;
  document.head.appendChild(s);
}

function createCoverMark(src) {
  const el = document.createElement('img');
  el.src = src;
  el.alt = '';
  Object.assign(el.style, {
    position: 'fixed',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    maxWidth: 'min(48%, 460px)',
    maxHeight: '28%',
    width: 'auto',
    height: 'auto',
    pointerEvents: 'none',
    userSelect: 'none',
    transition: `opacity ${COVER_FADEOUT_TIME}s ease`,
  });
  document.body.appendChild(el);
  return el;
}

function createLogo() {
  return createCoverMark(assetUrl('/images/cover/musicBloom_title.png'));
}

function createLogoIcon() {
  return createCoverMark(assetUrl('/images/cover/musicBloom_icon.png'));
}

function createAdvice() {
  const el = document.createElement('img');
  el.src = assetUrl('/images/cover/advice.png');
  el.alt = '';
  Object.assign(el.style, {
    position: 'fixed',
    top: 'calc(50% + 40px)',
    left: 'calc(50% - 6px)',
    transform: 'translateX(-50%)',
    width: 'min(26vw, 165px)',
    height: 'auto',
    pointerEvents: 'none',
    userSelect: 'none',
    transition: `opacity ${COVER_FADEOUT_TIME}s ease`,
  });
  document.body.appendChild(el);
  return el;
}

function createImageButton(src, alt, imgWidth) {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'cover-img-btn';
  el.setAttribute('aria-label', alt);
  const img = document.createElement('img');
  img.src = src;
  img.alt = alt;
  img.style.width = imgWidth;
  el.appendChild(img);
  return el;
}

// Cover-page Start — image button. Wrapper holds the fixed position so hover
// scale on the inner button doesn't fight translate(-50%, -50%).
function createStartButton() {
  ensureCoverUiStyles();
  const wrap = document.createElement('div');
  Object.assign(wrap.style, {
    position: 'fixed',
    top: 'calc(50% + 144px)',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    transition: `opacity ${COVER_FADEOUT_TIME}s ease`,
  });
  wrap.appendChild(createImageButton(assetUrl('/images/cover/start_button.jpg'), 'Start', 'min(17.6vw, 92px)'));
  document.body.appendChild(wrap);
  return wrap;
}

// Cover-page upload — pick a local audio file for the next Start only.
// After the track ends we drop the buffer (see loopBackToCover); no upload
// means Start uses the library track as before.
function createUploadButton() {
  ensureCoverUiStyles();
  const wrap = document.createElement('div');
  Object.assign(wrap.style, {
    position: 'fixed',
    top: 'calc(50% + 188px)',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    transition: `opacity ${COVER_FADEOUT_TIME}s ease`,
  });

  const el = createImageButton(assetUrl('/images/cover/uploadAudio_button.png'), 'Upload audio', 'min(20.2vw, 109px)');

  const hint = document.createElement('div');
  Object.assign(hint.style, {
    position: 'absolute',
    top: 'calc(100% + 8px)',
    left: '50%',
    transform: 'translateX(-50%)',
    fontFamily: "'Roboto', sans-serif",
    fontSize: '11px',
    letterSpacing: '0.04em',
    color: 'rgba(255,255,255,0.45)',
    maxWidth: '280px',
    textAlign: 'center',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    pointerEvents: 'none',
  });
  hint.textContent = '';

  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'audio/*,.mp3,.wav,.ogg,.m4a,.aac,.flac';
  input.style.display = 'none';

  el.addEventListener('click', (e) => {
    e.stopPropagation();
    playButtonSfx();
    input.click();
  });
  input.addEventListener('change', async () => {
    const file = input.files && input.files[0];
    input.value = '';
    if (!file) return;
    try {
      const buffer = await file.arrayBuffer();
      pendingUserAudio = { name: file.name, buffer };
      hint.textContent = file.name;
      hint.title = file.name;
      hint.style.color = 'rgba(255,255,255,0.7)';
    } catch (err) {
      console.warn('[audio] upload failed:', err);
      pendingUserAudio = null;
      hint.textContent = 'upload failed';
      hint.style.color = 'rgba(255,255,255,0.45)';
    }
  });

  wrap.appendChild(el);
  wrap.appendChild(hint);
  wrap.appendChild(input);
  document.body.appendChild(wrap);
  return wrap;
}

window.addEventListener('resize', () => {
  const w = window.innerWidth, h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  updateComposerSize(w, h);
  updateOrientationOverlay();
});

// Recreate the drawing buffer at the current size/ratio. Clears the post-rebake
// FPS transient (see velocityBaker.onmessage).
function refreshRenderer() {
  renderer.setPixelRatio(renderer.getPixelRatio());
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h);
  updateComposerSize(w, h);
}

// ── Narrow-window / portrait lock-out ─────────────────────────────────────────
// Full-screen black overlay + "please rotate" message whenever the window is
// narrower than it is tall — this experience is designed landscape-first
// (forward-flight camera, wide framing) and reads badly narrow. Applies to
// ANY window at this ratio, not just touch devices — desktop windows resized
// down to portrait get the same overlay (simpler than trying to distinguish
// "meant to be narrow" desktop use from an actual phone in portrait).
const rotateOverlay = document.createElement('div');
Object.assign(rotateOverlay.style, {
  position: 'fixed',
  // Explicit top/left/right/bottom rather than the 'inset' shorthand — inset
  // is unsupported on some older mobile WebViews, which would silently leave
  // this fixed element sized to its (tiny) content instead of covering the
  // screen.
  top: '0',
  left: '0',
  right: '0',
  bottom: '0',
  width: '100%',
  height: '100%',
  zIndex: '1000',
  display: 'none',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  background: '#000',
  color: '#fff',
  fontFamily: "'Roboto', sans-serif",
  fontWeight: '700',
  fontSize: '18px',
  letterSpacing: '0.08em',
  textAlign: 'center',
  lineHeight: '2',
  pointerEvents: 'none',
});
rotateOverlay.innerHTML = '<div>Rotate your device</div><div>for the better experience</div>';
document.body.appendChild(rotateOverlay);

function isNarrowWindow() {
  return window.innerHeight > window.innerWidth;
}
function updateOrientationOverlay() {
  rotateOverlay.style.display = isNarrowWindow() ? 'flex' : 'none';
}
updateOrientationOverlay();
window.addEventListener('orientationchange', updateOrientationOverlay);


