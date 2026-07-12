# Quantum Cloud — Dev Notes & Plan

Running progress log + roadmap for the interactive Three.js particle cloud.
Last updated: design notes for **particle trails** + **GLB mesh particles** (vertex color +
vertex-shader mood animation). Pick near-camera preference and Phase 3 still deferred.
Implement trails/meshes only when the user asks — notes only for now.

---

## 1. Vision

An interactive Three.js particle cloud that:
- Forms **generative shapes** driven by a 6-dimensional **mood fingerprint**.
- **Flows/animates** (GPGPU particle advection along a baked velocity field).
- Lets the camera **auto-navigate forward** through an endless cloud, mouse-drag steering.
- (Next) A **pick-paint** system — click to add local, persistent flow distortion.
- (Next) An **audio animation** system — precomputed track features drive motion in real time.

Mood fingerprint (6 params, each ~0..1 except bpm): `energy, brightness, texture, heaviness, dynamism, bpm`.

---

## 2. Current architecture (files)

Under `src/`:

- `main.js` — scene, render loop, worker plumbing, flight + tuning wiring. Reads `?count=NNNN` URL override.
- `config.js` — **all tunable constants** (see §4).
- `moodContrast.js` — pushes mood values toward extremes (logistic S-curve). Applied to presets; later to audio.
- `interaction/flyControls.js` — constant forward flight + drag-to-steer (yaw/pitch, damped, pitch-clamped).
- `debug/moodDebugPanel.js` — mood sliders + presets (top-right).
- `debug/tuningPanel.js` — live harness (top-left): FPS/ms, sliders for kill radius / point size / tile period / jitter / scale max, **+ bloom-shape controls: `dominant` / `blend partner` archetype dropdowns, `blend amt`, and `outward` / `shape amt` / `field freq` / `detail` / `shell` sliders**, and count presets (20K/40K/60K/100K, reload via `?count`). Takes `bloomField` as a 3rd arg (created after it in `main.js`).
- `interaction/particlePick.js` — **NEW** GPU-accurate click picking. Reads the sim state texture back (`particleSim.readPositions()`), projects every live particle, selects the **frontmost within ~16px** of the cursor (the one you see). Drops a red marker + fires `onPick`. Distinguishes click vs. steer-drag by a 6px tolerance.
- `interaction/bloomField.js` — persistent, world-anchored store of click-paint "blooms". Never-trimmed CPU array; each bloom **snapshots the current shape** (`{archA, archB, blendAB}` from `this.shape`, set by the tuning panel — Phase 3 will set it from mood). `syncUniforms()` windows the nearest `BLOOM_MAX_ACTIVE` to the camera, applies the envelopes, and packs into three uniform arrays: `uBloomA`=(center,radius), `uBloomB`=(burstMag, seed, shapeWeight), `uBloomC`=(archA, archB, blendAB, **openness**). Envelopes: `outwardEnvelope` (burst, decays to 0), `curlEnvelope` (shape weight, ramps + persists), `bloomRadius` (ink spread), `openEnvelope` (0→1 over `BLOOM_OPEN_TIME` — used by smoke ring to grow its ring).
- `particles/`
  - `createQuantumCloud.js` — builds the InstancedMesh + material/uniforms; exposes `mesh.userData.seedPositions` (shape-local seed points).
  - `shaders.js` — GLSL3 render shaders. Reads sim state + **cell** textures; orients each cube through its instance's transform (see instancing below). NOTE: render orientation does **not** yet include paint (Phase-1 decision — positions move via the sim; optional polish to add paint to orientation).
  - `particleSim.js` — GPGPU advection. MRT ping-pong of two float textures: `[0]` state (xyz pos, w age), `[1]` cell (xyz lattice index). Advects each particle via `paintApply(pos, instSampleVel(pos,cell)*uFlowSpeed)` — the base field first, then **redirected through any active blooms + their transient burst**; staggered lifetime; camera-relative respawn. Has `readPositions()` (MRT readback for picking) + the `uBloom*`/`uPaint*` uniforms (incl. `uBloomC`).
  - `instanceTransform.glsl.js` — shared GLSL snippet (injected into both sim + render) implementing the per-cell transform (see §3).
  - `paintField.glsl.js` — shared GLSL for the blooms. `paintApply(p, baseVel)` loops the active blooms and, per bloom, evaluates its **shape archetype** (dominant + blend partner, `top-2` chosen on CPU) via `archetypeDir(idx, r, t, openness, seed, → pres)`. Two effects: (1) **SHAPE** — steer `baseVel` toward the archetype direction at the **same speed** (presence-weighted, clamped so overlaps don't stack speed) → persistent shape, no runaway acceleration; (2) **BURST** — a transient shaped impulse (outward, masked by presence + a small floor, plus the archetype direction) that fully decays. Archetypes: `archCurl` (turbulent), `archVortex` (whirlpool), `archSpikes` (ridged radial), `archTorus` (smoke ring — poloidal roll + axial drift), `archCells` (Worley). Declares `uBloomA/B/C` + `uPaint*`. **Watch: no backticks in comments here** (they close the JS template literal — bit us 3× today).
  - `velocityBaker.worker.js` — bakes the combined mood field into a `SIM_VOL_RES³` volume off-thread.
  - `fields/` — one module per mood param + `shared.js` + `combine.js` (`buildFieldBundle`, `combinedVelocity`, `sampleAll6Cloud`; "Dominant Warp + Full Superposition").
- `audio/`
  - `audioPrecompute.js` — offline FFT over the whole track → per-frame band arrays + beat timestamps + mood fingerprint. `getAudioData()` plays it back by time index (no live FFT).
  - `audioMoodAnalyze.js` — `computeMoodFingerprint()` from the analysis.
  - `moodToConfig.js` — maps a mood → legacy (pre-GPGPU) flow uniforms. No longer referenced after the end-of-session cleanup; see §9.

Legacy / **now fully unwired** (no longer imported by `main.js` — kept on disk as
reference only, safe to delete): `particles/stoneField.js`, `particles/flowFieldCore.js`,
`interaction/picking.js`, `interaction/forceDebugHUD.js`, `interaction/screenPickGrid.js`.
(`audio/audioAnalyser.js` was deleted earlier.) The new pick-paint (`particlePick.js`
+ `bloomField.js` + `paintField.glsl.js`) fully replaces the old prototype — these can
be pruned whenever (see §9).

---

## 3. How the pipeline fits together (current)

1. Mood (sliders/presets → `contrastMood`) →
2. `buildFieldBundle` → deterministic per-param field descriptors →
3. Worker bakes `combinedVelocity` onto a 64³ volume → `THREE.Data3DTexture` (**ClampToEdge** now) →
4. `particleSim` advects particles through the **per-instance-transformed** field (GPGPU MRT ping-pong), respawning dead ones at the nearest tiled copy to the camera →
5. `shaders.js` renders instanced cubes, oriented by the same per-instance transformed field, faded by birth/distance →
6. `flyControls` moves the camera; particles recycle around it (conveyor).

**Instancing model (the core of today's work).** The shape is stamped on an
infinite integer lattice of period `SIM_INST_PERIOD`. Each cell `c` gets a
**deterministic** transform from `hash(c)`:
`world = origin(c) + scale(c) · Rot(c) · Mirror(c) · localSeed`.
Because the transform is a pure function of the world-fixed cell index, a place
looks identical every time you return — which is what will keep the paint layer
consistent. Cells **overlap** (period < shape diameter) + **jitter** → no gaps.
Each particle stores its cell so its field/orientation stay coherent for its life
(otherwise the variation washes out as it advects). Respawn scans the 3×3×3 cells
around the camera and picks the nearest tiled copy of the particle's seed.

**Two key realizations from today (keep in mind):**
- Every particle always lives inside the ~kill-radius bubble (recycled), so **visible count = total count** — bumping count directly raises density.
- With a fixed budget, density in the bubble = count ÷ bubble-volume. Filling gaps by spreading = thinner; **shortening the view is a cubic density multiplier**. So the density lever is short view + modest count bump. Motion (conveyor) is free.

---

## 4. Key tuning constants (`config.js`)

- `SHAPE_SCALE = 2.5`, `MOOD_CONTRAST = 1.8`.
- Sim lifetime/flow: `SIM_MAX_LIFE = 6.0`, `SIM_LIFE_JITTER = 0.8`, `SIM_FLOW_SPEED = 0.35` (slowed from 0.55), `SIM_BIRTH_TIME = 0.45`.
- **Bloom paint:** `BLOOM_MAX_ACTIVE = 32`, `BLOOM_RADIUS ≈ 1.375`, `BLOOM_STRENGTH = 1.8` (burst peak), `BLOOM_ATTACK = 0.06`, `BLOOM_DECAY_TAU = 0.35`, `BLOOM_SUSTAIN = 0.0` (burst fully decays — the persistent shape now comes from the redirect, not a force residual), `BLOOM_GROWTH = 0.6` + `BLOOM_GROW_TAU = 2.5` (ink spread), `BLOOM_CURL_RAMP = 0.4` (shape weight ease-in), `BLOOM_OPEN_TIME = 1.4` (smoke-ring open speed).
  - **Bloom shape (global modulators, live in panel):** `PAINT_OUTWARD = 1.0` (burst pop), `PAINT_CURL = 1.0` (shape/redirect weight), `PAINT_CURL_FREQ = 1.6` (field scale), `PAINT_DETAIL = 0.4` (sharpness), `PAINT_SHELL = 0.2` (burst profile).
  - **Bloom archetype (per-bloom selection):** `PAINT_ARCHETYPES = ['Curl','Vortex','Spikes','Smoke Ring','Cells']`, defaults `PAINT_ARCH_A = 0` (dominant), `PAINT_ARCH_B = 1` (partner), `PAINT_BLEND = 0.35` (partner weight, capped ~0.5).
- **Density / view:**
  - `CLOUD_COUNT = 40000` (default; `?count=` overrides). ~165 FPS at 40K on this machine — big headroom.
  - `SIM_KILL_RADIUS = SHAPE_SCALE * 1.9 ≈ 4.75` — visible bubble radius (short view = dense).
  - `POINT_SIZE = 0.5` — smaller cubes for the denser cloud.
- **Instancing (baked volume now sampled in LOCAL space, ClampToEdge):**
  - `SIM_VOL_RES = 64`, `SIM_VOL_HALF = SHAPE_SCALE * 1.6 ≈ 4.0` (must contain the shape).
  - `SIM_INST_PERIOD = SHAPE_SCALE * 1.4 ≈ 3.5` (< shape radius ⇒ heavy overlap ⇒ no gaps).
  - `SIM_INST_JITTER = 0.25`, `SIM_INST_SCALE_MIN = 0.8`, `SIM_INST_SCALE_MAX = 1.4`.
- Flight: `FLY_SPEED = 0.12`, `FLY_SENSITIVITY = 0.0026`, `FLY_DAMPING = 0.08`, `FLY_MAX_PITCH = 1.35`.

All of kill radius / point size / period / jitter / scale-max are **live** in the tuning panel; count is a reload. Once dialed in, bake the chosen values here.

---

## 5. Today's work — DONE ✅

Goal: fly through an endless cloud that doesn't obviously repeat and never goes empty.

Journey (for context): tiled-identical → total void at cube corners (kill radius was
just under the cube half-diagonal) → tried camera-attached (no travel, rejected) →
tried space-filling medium (**rejected: new noise field made shapes generic**) →
landed on **world-anchored, per-tile-varied instancing** with overlap.

Shipped:
- `instanceTransform.glsl.js` (shared per-cell rotation/mirror/scale/jitter + local-field sampling + 3×3×3 nearest respawn).
- `particleSim.js` rewritten: MRT (state + cell), per-instance advection, staggered conveyor recycling.
- `shaders.js`: cube orientation through each particle's instance transform.
- `config.js`: 40K, kill radius 4.75, point size 0.5, instancing constants; volume → ClampToEdge.
- `createQuantumCloud.js` / `main.js`: wire the cell texture + instance uniforms, `?count` override.
- `debug/tuningPanel.js`: live FPS + knobs + count presets (top-left; mood panel stays top-right).

Verified in-browser: dense, varied cloud that fills the view and **stays populated
while flying** (no void); ~165 FPS at 40K. One bug fixed en route: a stray backtick
in a GLSL comment closed the JS template literal early ("Unexpected identifier 'seed'").

Status: **user is happy with the look.** Optional later: dial defaults via the panel; add per-cell RNG-seed variation (multi-bake) only if rotation/scale/jitter ever feels too samey.

---

## 5b. Pick-paint session — DONE (Phases 1–2) ✅

**New GPU-accurate picking.** The old CPU picking mirrored the *pre-GPGPU* flow and
was fully broken. New approach (`particlePick.js`): read the sim state texture back
(`readPositions()` → `readRenderTargetPixels`, MRT `textureIndex 0`), project every
live particle, pick the **frontmost within ~16px** of the cursor. Exact — user: "super
accurate". Confirmed against three r177 source that RGBA+FloatType MRT readback is valid.

**Persistent "bloom" paint.** Chose **analytic mood-stampable blooms** over the 3D paint
texture from the original plan — simpler, exact, and instant to tune (no re-bake). A
click appends a `Bloom {pos, birth, seed, radius, strength}` to a never-trimmed CPU
array (= the persistence, world-anchored). Each frame the nearest `BLOOM_MAX_ACTIVE` in
reach are packed into sim uniform arrays (camera windowing → bounded GPU cost). The sim
advects by `instSampleVel()*uFlowSpeed + paintVelocity(pos)`, so paint is an **additive,
world-space** layer independent of tile transforms; overlapping blooms **superpose**.

- **Phase 1 — force + timing.** Outward push. Firework envelope: near-instant `BLOOM_ATTACK`
  snap → exponential decay (`BLOOM_DECAY_TAU`) → permanent `BLOOM_SUSTAIN` floor (so the
  mark persists). Ink-spread: radius eases outward on the slower `BLOOM_GROW_TAU` to
  `(1+BLOOM_GROWTH)×`. Envelope is keyed to the *bloom's* age (shared by all particles) →
  "click on the beat = one firework"; newly-born particles only feel the residual.
- **Phase 2 — shape (not a sphere).** `paintField.glsl.js`: radial profile blends clearing
  pocket ↔ mid-radius shell (`uPaintShell`); angular petals/spikes from direction-space
  value noise (`uPaintLobeFreq/Amt`, `uPaintSpike`); per-bloom tangential swirl
  (`uPaintSwirl`). Each bloom's `seed` → unique petals + swirl axis. 5 live sliders added.

Bug fixed en route: a `*/` inside a JSDoc comment (`uPaintLobe*/Spike`) closed the block
comment early → Vite parse error. (Same family as the old stray-backtick bug — watch
comments inside these `.glsl.js` files.)

## 5c. Bloom-archetype session — DONE ✅

Reworked the Phase-2 shape twice, in response to feedback:

1. **Redirect, not add.** The old `paintVelocity` was purely *additive* → particles
   accelerated and got messy with overlapping/repeat clicks. Replaced with `paintApply`:
   the persistent shape **redirects** the base flow toward a field direction at the
   **same speed** (presence-weighted, blend clamped so overlaps never stack speed), and
   a separate **transient burst** carries the shape outward on click then fully decays
   (`BLOOM_SUSTAIN = 0`). Fixes runaway speed; the shape lives via steering, not force.
2. **Archetype library (top-2).** One curl field looked same-y across moods, so shape is
   now **five distinct archetypes**, and each bloom uses a **dominant + one blend partner**
   (top-2; sharper identity than averaging all). Per-bloom selection is snapshotted on
   click into `uBloomC` (`archA, archB, blendAB, openness`); the shader only ever evaluates
   two archetypes regardless of library size. Global modulators (`uPaint*`) tune the look;
   the panel has dominant/partner dropdowns + `blend amt`.

**Archetype journey (context):** Curl/Vortex were keepers. **Petals** went through 3
iterations (flat masked sphere → cupped/converging → unfolding rose) but planar shapes
read badly in a volume — rejected. **3D bloom** (Fibonacci lobes) liked but parked
(removed; recoverable from git). **Spikes** (radial ridged filaments) always read as a
spherical outward push even after crest-convergence — replaced by **Lightning**:
domain-warped ridged veins + wandering along-flow (non-radial jagged bolts). **Smoke
Ring** kept as the soft organic slot. Final five: **Curl, Vortex, Lightning, Smoke Ring,
Cells.**

Bugs fixed en route: the **backtick-in-a-GLSL-comment** trap recurred **3×** (`` `pres` ``,
`` `detail` ``, and one more) — each closes the JS template literal → "Unexpected identifier".
Rule of thumb now: **never put backticks in comments inside `paintField.glsl.js`.** Also
avoided `pow(negative, 2.0)` (undefined) and `smoothstep(hi, lo, x)` (undefined edge order).

Status: **user likes smoke ring + lightning.** Tuning continues; Phase 3 next after tweaks.

## 6. Tomorrow — finish pick-paint (Phase 3), then audio

### 6a. Pick-paint — remaining
- **Keep tuning the archetypes** — dial defaults for each of the five via the panel, then
  bake into `config.js`. Balance knobs: smoke-ring `axis * 0.5` (roll↔drift), lightning
  `warpAmt` / base freq (wilder vs. longer segments), blend cap.
- **DEFERRED — pick near-camera preference (do later, do not ship yet).**  
  `particlePick.js` currently has a hard `minPickDistance = 1.5`: particles closer than
  that are ignored. Side effect: if *every* particle under the cursor is inside the
  threshold and none sit farther in the same pixel radius, the click misses entirely.  
  **Agreed fix (implement later):**
  1. Prefer the frontmost particle with depth ≥ `minPickDistance` (avoid lens-bursts).
  2. If none outside the threshold under the cursor → fall back to the **farthest**
     particle *within* the threshold (still under the cursor).
  3. Goal: every click that has a particle under the pointer still counts; near-lens
     blooms only happen when there is no farther option.  
  File: `src/interaction/particlePick.js` (`pick()` loop). No code change until the
  user asks to implement this.
- **Phase 3 — mood → bloom shape.** The per-bloom plumbing is **already in place**:
  `bloomField.shape = {archA, archB, blendAB}` is snapshotted on every `add()` and packed
  into `uBloomC`. Phase 3 = compute that trio (and maybe the global `uPaint*` look) **from
  the current mood** at click time instead of the panel: map mood → archetype **weights**,
  sharpen, take the **top-2** (dominant + partner) → so intense→Lightning, dynamic→Vortex,
  soft→Smoke Ring, textured→Cells/Curl, etc. Mood source is the mood panel now, audio later
  — **no shader change when the source swaps** (only where `bloomField.shape` is set).
- **Phase 4 (optional polish).** Feed paint into the cube-orientation shader too; brightness
  accents inside blooms; magnitude cap if superposed bursts get too hot; swap to a windowed
  3D paint texture only if dozens overlap in view.

### 6b. Audio animation system (PRECOMPUTED — confirmed)
- `audioPrecompute.js` already analyses the **whole track offline** (FFT → 7 bands, bass flux, spectral features, **beat timestamps**, mood fingerprint). `getAudioData()` just indexes those arrays by playback time and fires `isBeat` on stored timestamps. No live FFT at runtime → deterministic, cheap, GPGPU-friendly.
- The consumer hookup in `main.js` is **commented out** and used pre-GPGPU uniforms — **needs rewiring** for the baked-volume flow. Real-time features should modulate *on top* of the baked field: e.g. flow speed, a beat pulse/expansion, treble→size, bass→displacement. Precompute layer stays as-is; only the hookup changes.
- Two distinct audio jobs (don't conflate): (1) **mood extraction** → sets the *shape* (via `computeMoodFingerprint` → `contrastMood`); (2) **audio animation** → real-time *motion* from the precomputed timeline.

### 6c. Future rendering — trails + mesh particles (NOTES ONLY — implement when asked)

Agreed direction from design discussion (no code yet):

#### A. Curvy particle trails
- **Method:** GPU **position-history ribbons** (not velocity-stretch, not rigged GLB).
  Stretch is straight-only; curved trails need past positions + segmented geometry.
- **How:** ring-buffer of N previous positions per particle (extend sim textures / atlas);
  a ribbon draw samples `pos[t]…pos[t−N]` and builds a thin strip (2 tris per segment).
- **N (segments):** start **8–12** (~16–24 tris per trail). More length detail = smoother curves;
  width stays a simple strip (not a dense tube).
- **Budget:** full trails on all 40k is heavy — prefer trails on a **subset**, or shorter N /
  only when speed/paint is high. Optional: cube/model as the **head**, ribbon as the **tail**.
- **Skip:** skeletal/rigged meshes along a path; screen afterimage (not per-particle curves).

#### B. Replace *some* particles with authored 3D meshes
- Keep the dense cube (or low-poly) cloud for atmosphere; swap a **subset** of instances to
  GLB meshes (separate `InstancedMesh` per mesh type, or a small hero set sharing sim state).
- **Polycount guide (head mesh):**
  - dense cloud (tens of k): **~12–50 tris**
  - medium (~5k–15k): **~100–300**
  - sparse heroes (~500–2k): **~500–2k**
  Aim roughly `instances × tris` under ~1–2M for comfort.
- **Vertex color:** GLB `COLOR_0` → `geometry.attributes.color`; enable in material/shader
  (`vertexColors` / `attribute vec3 color`). Shared geometry color is fine; **per-instance**
  tint needs an instanced color attribute or custom shader.
- **Animation:** **vertex-shader procedural deform** driven by mood (and time / instance seed /
  flow), not skeletal animation as the first path. Shape keys (morph targets) work on normal
  meshes; per-instance different morph mixes need a custom shader path on InstancedMesh.
- Textures optional: keep albedo, realtime tint via `material.color` or shader multiply;
  vertex color can layer with or without maps.

#### Suggested build order (when we start)
1. History ring in sim → ribbon pass on a subset of particles.  
2. Load one GLB as a second InstancedMesh subset (vertex color lit in custom shader).  
3. Mood uniforms → vertex displace / tint on the mesh; trail length/width from mood later.

---

## 7. Roadmap (phases)

- [x] Shape system (6 mood params, combiner, contrast).
- [x] Animation system (GPGPU advection, baked velocity volume, worker).
- [x] **Flythrough** — flight controls + world-anchored varied instancing + conveyor recycling. Dense, gapless, non-repetitive, ~165 FPS.
- [x] **Pick-paint Phase 1–2** — GPU-accurate picking + persistent analytic blooms (firework + ink-spread). §5b.
- [x] **Bloom rework** — same-speed redirect + shaped burst; **5-archetype library** (Curl/Vortex/Lightning/Smoke Ring/Cells), per-bloom dominant+partner selection via `uBloomC`. §5c.
- [ ] **Pick near-camera preference** — prefer far beyond `minPickDistance`; else farthest inside threshold (every click counts). Deferred; see §6a. **Do not implement until asked.**
- [ ] **Pick-paint Phase 3** — mood-driven per-bloom archetype selection + params (§6a). *(Plumbing done; just set `bloomField.shape` from mood.)*
- [ ] **Particle trails** — GPU history ribbons (N≈8–12), preferably subset; see §6c. **Notes only until asked.**
- [ ] **Mesh particles** — replace some instances with GLB (vertex color + vertex-shader mood anim); see §6c. **Notes only until asked.**
- [ ] **Audio animation** — rewire precomputed features to the baked-volume/GPGPU flow (§6b).
- [ ] **Audio → mood** — feed the precomputed fingerprint into the 6 params (through `contrastMood`); this is also the source for Phase-3 bloom shape.
- [ ] Cleanup — prune now-unwired legacy modules (§2/§9) once confirmed off-path.

---

## 8. Known loose ends

- Baked field isn't perfectly seamless (curl noise isn't periodic), but that no longer matters — the field is sampled per-instance in local space now, not wrap-tiled.
- **User wants to tweak some script tomorrow before continuing** (specific values TBD — ask which).
- Paint affects particle **positions** only; cube **orientation** still follows the base field (Phase-4 optional).
- Bloom envelope is per-bloom (not per-particle): particles entering after the burst only get the sustain residual — intended for "one firework per beat".
- Red pick markers (`particlePick.js`) currently persist/recycle at 120; decide later whether to keep them once paint is the real feedback.
- `minPickDistance = 1.5` hard-rejects near particles → occasional dead clicks when nothing farther sits under the cursor. Fix agreed + deferred in §6a (prefer far, else farthest-in-threshold).
- Dev server: `npm run dev` → `http://localhost:5173/` (must run outside the sandbox — plain runs were failing to spawn with a sandbox-policy error). Tuning panel top-left, mood panel top-right.

---

## 9. Self-check audit (end of session) — decrepit inventory

**Cleaned now (safe deletions in `main.js`):**
- Removed the broken `startAudio` mood block: it called `moodToConfig()` which was **never imported** (a latent `ReferenceError` if audio were ever started) and set pre-GPGPU uniforms (`uFlowSpeed`, `uNoiseScale`, `uDomainWarp`, `uOrbitStrength`, `uShapeWeights`, …) that the current vertex shader no longer reads. Replaced with a TODO.
- Removed unused imports: `AUTO_ROTATE_SPEED`, `DISPLACEMENT_MARGIN`, `BEAT_SPEED_BOOST`, `BEAT_SPEED_DECAY`.
- Removed dead locals `beatSpeed` / `beatPhase` and collapsed the commented mid/treble/beat block to a single TODO.

**Now unwired — safe to prune (kept as reference only):**
- Old paint prototype chain, **no longer imported by `main.js`** (replaced by `particlePick.js` + `bloomField.js` + `paintField.glsl.js`): `particles/stoneField.js`, `interaction/picking.js`, `interaction/screenPickGrid.js`, `particles/flowFieldCore.js`, `interaction/forceDebugHUD.js`. Delete whenever.
- Dead shader uniforms declared in `shaders.js` + set in `createQuantumCloud.js` but unread by the new vertex/fragment body: `uFlowSpeed`, `uStones[]`, `uStoneStrength`, `uStoneCount`, `uNoiseScale`, `uDomainWarp`, `uOrbitStrength`, `uShapeWeights`, `uReveal`, `uDisplacement`, `uFlowBias`, `uJitter`, `uShapeScale`, `uAudioMids`, `uBeatPhase`. They're coupled to the old paint/flow/reveal path (e.g. `stoneField.syncUniforms` writes `uStones`), so remove them **together** with the old prototype to avoid breaking setters.
- `audio/moodToConfig.js` maps mood → those legacy flow uniforms; no longer referenced anywhere after this cleanup. Keep only if the new audio hookup reuses the mapping, otherwise delete.
- Reveal animation in `animate` still ticks `u.uReveal`, but the shader ignores it — retire with the uniform cleanup above.

**Keep (dormant but current):** `audio/audioPrecompute.js`, `audio/audioMoodAnalyze.js` — the precompute path is the good part; rewire tomorrow.
