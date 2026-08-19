# Project notes & roadmap

Living dev log for the audio-reactive particle cloud. Newest work at the top of
each section.

## ▶ RESUME HERE

**Next session: tune mood oval spheres** (size / vertical stretch / opacity / emissive / count).

### Mood orbs — v1 shipped (needs polish tomorrow)
- Module: [`src/scene/moodOrbs.js`](src/scene/moodOrbs.js) · config `MOOD_ORBS_*` in [`config.js`](src/config.js).
- **12** large soft gaussian **billboards** (instanced quads), mood HSL + `MOOD_ORBS_HUE_SHIFT` +
  per-orb scatter; colour follows `trailColorMotion` each frame.
- **World-space, NOT screen-space:** each orb has world `aCenter`; camera-facing billboard only.
  Depth-tested; parallax as you fly. **Wrap** in camera-centered cube (same as frozen dust) —
  orbs recycle, you fly past them; not fixed anchors you leave forever.
- Current defaults (tweak tomorrow): size **6.5**, vertical aspect **1.35–2.6**, opacity **0.34**,
  emissive **1.45**, sat/lit **0.88 / 0.92**. Wired in `main.js` (`moodOrbs.setColorHSL` +
  `update` with dust).

### Also shipped since last resume block
- **Start camera further back:** `CAMERA_FRAME_DIST` **1.28×** `SHAPE_SCALE` (~3.2) — see
  [`frameCloud.js`](src/camera/frameCloud.js).
- **Nearer paint pick:** `PICK_LENS_GUARD` **0.5** (tried 0.4; settled 0.5).

### Shipped earlier (colour + paint + mesh) — still valid
- Mesh mix colours (`aMeshData` vec4), trail depth, permanent ink colour, paint drift,
  burst envelope, flat-track mid-song colour, etc. (see Done section below).

### Mood-driven BG select (still shipped)
- [`moodToBgType.js`](src/audio/moodToBgType.js): `cosmos|clouds|leaks` at bake; `?bg=` force.

### Parked / after orbs
1. Live-feel polish (paint / bloom / colour) if something nags.
2. Perf if FPS dips: leak discs, trail budget, unify warp clocks.
3. Roadmap: more mesh libs / enter-from-void.

Canvas: `optimize-assessment.canvas.tsx` (Cursor canvases folder).

---

## BG themes

**Colour wash** stays music-driven (`moodToBgGradient` / `BgColorMotion` ← `moodToTrailColor`).
Theme *structure* from mood select ([`moodToBgType.js`](src/audio/moodToBgType.js)) when
`BG_SELECT_MOOD` is on; else `BG_TYPE` / `?bg=`.

| Type | Module | Mood favours |
|------|--------|----------------|
| cosmos | [`starryBackground.js`](src/scene/starryBackground.js) | Darker, heavier, textured |
| clouds | [`cloudSkyBackground.js`](src/scene/cloudSkyBackground.js) | Bright, airy, soft |
| leaks | [`lightLeakBackground.js`](src/scene/lightLeakBackground.js) | Bright-soft, low grain, calm |
| wash | [`moodBackground.js`](src/scene/moodBackground.js) | Debug only (`?bg=wash`) — not in mood set |

**Elevation haze** (theme-agnostic): [`ElevationHaze`](src/scene/elevationHaze.js) over any theme.

### Also shipped / keep
- **Flow dots** (`FLOW_DOTS_ENABLED`): cheap additive Points, own `ParticleSim`, count =
  half mesh budget; same volume/paint/kill as meshes. Panel: `flow dots on` / dot size /
  opacity. [`flowDots.js`](src/particles/flowDots.js).
- **Elevation haze** shared pass (`BG_HAZE_ENABLED`): sparse horizontal veils for up/down space.
- **ACES tone mapping** on (`TONE_MAPPING_ACES`): shared `toneMap.glsl.js` in mesh / trails /
  BG / dust shaders + `renderer.toneMapping = ACESFilmicToneMapping`. Panel **`exposure`**
  (`TONE_MAPPING_EXPOSURE` default 1.0). Custom shaders need the GLSL path (renderer alone
  wouldn’t grade RawShaderMaterial / hand-rolled FS).
- First-paint hitch: **FIXED** (warmup in `GPUTrails.warmupPaint` + mesh sim dummy bloom).
- Beat surge louder: `AUDIO_BEAT_FLOW_KICK 5.20`, decay `0.85`, kick quiet `0.38`.
- Mood → trail spawn drift (`moodToSpawnDrift`, min/max band).
- Mood → fly speed **tempo-led** (`moodToFlySpeed`, scale 0.35–2.40).
- Tighter tiles: `SIM_INST_PERIOD = SHAPE_SCALE * 1.25` (≈ 3.13).
- Trail colour richer/brighter; BG sat up / lightness down (pre-starry mood wash).
- Frozen dust: more size randomness.
- Mesh: type05 `marble.glb` (5k) + cheap procedural marble (object-space fbm veins + fresnel;
  `MESH_MARBLE_*`). Flow dots 9k + stretch.
- Perf: trail SUB 4, count 12k, antialias off — FPS good.

### Backlog (after BG colour themes)
1. Mesh visual tuning + more libraries (`type01…06`); **per-type parameter blocks**.
2. Mood→mesh type wiring.
3. Initial enter / grow-from-void (discuss levers first).
4. More perf only if FPS regresses.

### Deferred / parked
- Phase B displacement (retired). Audio pulse-speed surge (off).
- Aggressive further trail cuts.

## Handoff (for the next AI / new tool) — read this first

**What this is:** an infinite fly-through of a mood/audio-reactive particle cloud built
with **Three.js + Vite** (GLSL3 / `RawShaderMaterial`). The cloud is one procedurally
generated shape, tiled infinitely with per-tile-varied transforms; the camera flies
forward (mouse-drag steering) and particles recycle around it at a fixed budget. Audio
features (precomputed offline) drive a 6-D "mood" and real-time motion (beat/loud/treble).

**Run it:** `npm install` then `npm run dev` (Vite dev server, usually
`http://localhost:5173`). `npm run build` → `dist/`. Press the tuning panel toggle for
live sliders; audio starts from the panel's track dropdown (`?track=N` reloads a track).

**Two coupled particle systems, one shared shape:**
- **Meshes** (`createQuantumCloud.js` + `shaders.js`): instanced GLB models, positions
  from a GPGPU sim (`particleSim.js`) that advects along a baked velocity volume +
  per-cell instance transform (`instanceTransform.glsl.js`).
- **Trails** (`gpuTrails.js`): a *second* `ParticleSim` for trail heads + a ping-pong
  history texture + instanced quad-ribbon draw. Uses the **same** baked volume + instance
  transform (bit-identical integer hash CPU/GPU) so trails follow the exact same tiles.
  Density-clustered into dense regions (`seedDensity.js`, `TRAIL_CLUSTER_BIAS`).

**Render order (important):** `renderer.render(scene)` draws meshes (opaque, write depth),
then `trail.render()` draws ribbons straight onto the screen with `autoClear = false`,
sharing the mesh depth. See "Depth interaction" in Done below.

**Rendering model (current):**
- Meshes are **opaque + depth-writing**; soft birth/death/fog fades are done with a
  **dithered screen-door `discard`** (fragment shader), so they read solid and occlude.
- Trails use **normal blending + depth-write** (nearer trails occlude farther ones →
  dense-area overdraw collapses; no additive glow / no milky blow-out). Low-alpha
  fragments `discard` so faint tails don't punch occluding holes.
- **Forward-biased transition** (Lever 1): the visible bubble is squashed along the look
  axis — ahead reaches the full kill radius, behind shrinks to `CLOUD_BEHIND_FRAC` (0.35).
  Uniforms `uCamFwd` / `uBehindFrac` on both materials; live `behind reach` slider.

**Known issues / dead code (safe to clean — flagged, not yet removed):**
- `src/particles/trailField.js` — the legacy **CPU** trail element, fully superseded by
  `gpuTrails.js`. **Not imported anywhere.** Safe to delete (and its CPU-only config:
  `TRAIL_INTERVAL`, `TRAIL_BUNDLES`, `TRAIL_BUNDLE_RADIUS`, `TRAIL_DENSITY_BIAS`).
- `src/debug/moodDebugPanel.js` — the old manual-mood slider panel, removed in audio
  Phase A. **Not imported anywhere.** Safe to delete.
- `uReveal` — declared in `shaders.js` and incremented in `main.js` (`revealing`), but
  **never used in GLSL**, so the intended reveal fade-in is a no-op. Either wire it into
  the mesh `vFade` or drop the reveal logic.
- `TRAIL_RES_SCALE` — deprecated (the half-res trail buffer was removed with the
  depth-shared pass); kept only so old references don't break.
- `dist/` is a **stale build** (still contains the old Mood Debug panel); rebuild before
  shipping.

## Current mesh/trail split (experiment — ratio still tunable)

- `src/config.js`: `MESH_BUDGET = 5000` (triangle-equivalent → mood mesh mix counts) /
  `CLOUD_COUNT = 5000` (pre-mix init) / `TRAIL_COUNT = 16000` (trail).
- Mood mesh mix (`moodToMeshMix.js`): always **1 major + 2 accents** from five types
  (triangle/flower/pedal/rock/marble), cost-weighted instance counts, baked once with
  track mood. Panel shows major/accents/counts after bake.
- Trails are **quad ribbons** with per-trail thickness. Baked defaults after tuning:
  `TRAIL_WIDTH 0.010`, `TRAIL_WIDTH_VAR 0.90`, `TRAIL_WIDTH_CONTRAST 3.5`,
  `TRAIL_THIN_RATIO 0.9`, `TRAIL_NEAR_CULL 0.6`, `TRAIL_FAR_CULL 8.0` (≈ off; kill-radius
  governs). Ribbon follows a **Catmull-Rom spline** (`TRAIL_HISTORY 32`, `TRAIL_SMOOTH_SUB 3`).
- Trails are **density-clustered** into dense regions via `TRAIL_CLUSTER_BIAS = 2.0`
  (`seedDensity.js` + gpuTrails `_buildSeeds`), so sparse regions are mesh-only. Live
  `cluster bias` slider re-seeds.

## To do (roadmap)

Combined mesh + trail look is in good shape (depth occlusion + fill fixed). Remaining:

1. **Cloud transition — Lever 2 (optional, stronger).** Lever 1 (directional fade) is
   DONE. Lever 2 = **asymmetric recycle**: kill particles once they fall *behind* the
   camera (shorter behind-distance) and bias `instRespawn` to spawn them *ahead* (needs a
   camera-forward uniform in the sim + a forward-biased seed pick). Moves the budget
   forward → next cloud is fuller/earlier, and it's also a perf win. Risk: churn/pop on
   fast turns (needs smoothing). Only do if Lever 1 isn't enough — ask the user first.

2. **Test more trail paint** — keep tuning click-bloom → trail (`paint strength`,
   `tail bend`, per-trail burst) across archetypes/moods; confirm FPS holds after paint.
   (Note: paint blooms are still additive-era tuned — re-check feel now trails are solid.)

3. **Bloom drift after surge — DONE (awaiting test).** Shipped as a **trails-only gentle
   OUTWARD CREEP** (the flavor the user picked: accept that the mark slowly spreads). After
   the firework `burstMag` decays to 0, `paintApply` adds a small persistent `creep` term =
   the *same* radial pop silhouette (`dir * outP * outward * popMask`) but weighted by the
   **settled `shapeW`** (persistent) instead of the transient `burstMag`, scaled by a new
   `uPaintDrift` uniform. So the ribbon keeps drifting out gently instead of freezing.
   Self-limiting by design: as a head creeps toward the rim `outP→0` eases it to a stop, and
   `shapeW`'s LRU soft-fade kills the creep as the mark fades → no unbounded accumulation.
   Meshes keep `uPaintDrift = 0` (only the trail sim raises it via `PAINT_DRIFT = 0.04`), so
   the cloud never evacuates its marks. Live-tunable via the **`paint drift`** slider.
   Config `PAINT_DRIFT`; wired in `paintField.glsl.js` (creep accum + return), `particleSim.js`
   (uniform, default 0), `gpuTrails.js` (sets it + getter/setter), `tuningPanel.js` (slider).

4. **Camera initial framing — ✅ DONE.** Pull-back + aim at home-cell world centroid
   (`src/camera/frameCloud.js`). Pull-back kept moderate (`CAMERA_FRAME_DIST = SHAPE_SCALE·0.95`)
   so the far side stays inside `SIM_KILL_RADIUS`. Re-frames once on audio-start mood bake;
   dominance-slider reshapes leave the camera alone.

5. **Trail individual speed** — ~~per-trail hashed `speedMul`~~ **DROPPED (not needed).**

6. **Color** — richer / mood- or audio-driven hue for trails (and cloud), beyond the
   single base hue + small jitter (`uColorHSL` / `TRAIL_HUE_JITTER`).

5. **Audio reaction — thickness** — now easy with quad ribbons: modulate `uWidth` from
   beat/loudness (`AudioMotion`), like the mesh size pop.

6. **Audio cloud-distort (Phase B) — ✅ IMPLEMENTED (awaiting test).** See the dedicated
   **"## Phase B — grounded plan (cluster-local beat displacement)"** section below for the full
   design, and the RESUME block at top for what shipped + what to test/tune. Short version: a
   render-time, non-accumulating, **spatially-local** positional pulse on the beat, applied to
   BOTH meshes and trails (each cluster/region beats on its own — NOT a global breathe).
   Superseded the old "drive `uFieldWarpAmt` from bass" idea (that = global breathe; wrong).
   Deferred within Phase B: bass-sub-band magnitude, per-cluster phase ripple. Also still open:
   size shimmer (treble→size) a touch strong — dial `AUDIO_TREBLE_AMT` / `AUDIO_BEAT_POP` subtler.

## Phase B — grounded plan (cluster-local beat displacement)

**Goal (user, refined):** on the precomputed **beat**, displace the particles so the cloud
*beats* — but **locally, per cluster/region**, NOT the whole shape breathing as one blob. We fly
*inside* the cloud, so it must feel like the space *around* you is pulsing (nearby clumps punch
on the beat), not a global zoom. Must apply to **both** meshes (dots) and **trails** (frozen
ribbons), and they must stay mutually consistent.

### Core principle — render-time, non-accumulating positional offset
Add a displacement `d(worldPos, t)` to the world position **at draw time**, in a **shared GLSL
snippet** included by BOTH the mesh render shader and the trail ribbon shader, driven by the
**same uniforms**. Do NOT do it in the sim:
- The sim advects + is stateful → a displacement there would accumulate / fight the flow, and
  **frozen trail history can't be re-simulated** anyway.
- A render offset is clean + reversible: between beats the pulse envelope → 0, so every particle
  sits exactly on its true (sim) rest position → the cloud pulses around its shape, no drift.
- Because mesh + trail sample the **identical** `d(world)`, where they overlap they move
  together → visually coherent.

### Making it CLUSTER-LOCAL (the key requirement) — smooth world-space field
`d = uBeatAmt * pulse(t) * vecField(world * uBeatFreq + drift·t)`
- `vecField` = a **smooth vector noise** in world space → every region gets its OWN direction +
  magnitude, so on a beat each blob punches differently instead of one uniform breathe. **Cluster
  size ≈ 1 / uBeatFreq** (a tunable). This is why we use a world-space field (not a global scalar
  scale): spatial variation == locality.
- Chosen over per-tile-cell pulsing because trails span multiple cells and every history point
  has a world position but not a well-defined single cell — world-field needs only position.
- Optional **phase ripple**: let each region peak at a slightly different time
  (`phase = noise(world·phaseFreq)`, evaluate the beat envelope at `beatClock − phase`) so the
  beat visibly *travels* through the clusters around you. v1 can ship with phase ripple = 0
  (all clusters punch on the beat but in different local directions/amps); ripple is a v2 knob.
- Slowly **drift** the field (`drift·t`) so cluster centers aren't pinned to world coordinates.

### pulse(t) — the beat envelope
Fast attack, exponential decay per beat (reuse the firework/`outwardEnvelope` shape), triggered
by the **precomputed beat** stream we already feed to meshes/trails (beat/loud). Optionally scale
its magnitude by a **sub-bass/loud** band so louder hits punch harder. Scalar uniform per frame
(`uBeatPulse` 0..1), plus `uBeatTime` for the ripple/drift clocks.

### Mesh vs trail — the analysis the user asked for
- **Mesh (a dot):** trivial. In `shaders.js` after fetching the sim position `p`, do
  `p += beatDisplace(p)` before orientation/projection. One point → any field frequency is safe.
- **Trail (frozen ribbon):** offset **every** history/centerline point by the SAME field:
  `p += beatDisplace(p)` on each sampled spline point in `RIBBON_VERT`. **Hard constraint:** the
  field must be **spatially SMOOTH relative to the ribbon** — cluster size (`1/uBeatFreq`) must be
  ≫ the history point spacing (ideally ≳ a trail's length), or adjacent points get very different
  offsets and the ribbon **shatters**. So `uBeatFreq` is bounded by trail geometry. A trail that
  spans a cluster boundary will **flex/stretch** on the beat — desirable, as long as the field is
  smooth. (Width/tangent detail: v1 keeps the tangent from the undisplaced spline — cheap, minor;
  v2 can recompute the tangent from displaced neighbors for exact ribbon orientation.)

### Files to touch tomorrow
- **new `src/particles/beatField.glsl.js`** — `BEAT_GLSL`: uniforms (`uBeatAmt`, `uBeatFreq`,
  `uBeatPulse`, `uBeatTime`, `uBeatPhaseRipple`, `uBeatDrift`) + `vec3 beatDisplace(vec3 world)`
  (smooth vector noise × pulse; uniquely-named noise fns — the sim shader already has
  `pk*`/`iw*`, so use `bt*`).
- **`shaders.js`** — include `BEAT_GLSL`; `p += beatDisplace(p)`; add uniforms; drive
  `uBeatPulse`/`uBeatTime` from `main.js` (mesh material) off the audio beat envelope.
- **`gpuTrails.js` `RIBBON_VERT`** — include `BEAT_GLSL`; offset each sampled centerline point;
  add uniforms; drive them in `gpuTrails.update` from the same beat envelope.
- **`config.js`** — `BEAT_DISPLACE_AMT`, `BEAT_CLUSTER_SCALE` (→ `uBeatFreq`), `BEAT_DECAY_TAU`,
  `BEAT_PHASE_RIPPLE`, `BEAT_FIELD_DRIFT`, `BEAT_SUBBASS_GAIN`.
- **`tuningPanel.js`** — sliders: `beat amt`, `cluster size`, `beat decay`, `phase ripple`.

### Coexistence
- **Field warp (Fix A)** = slow global *evolve* of the flow (sim-side). **Phase B** = punchy
  *local beat* offset (render-side). Orthogonal — keep both.
- **Paint blooms**, spawn churn/drift, trail reel-in — all independent (velocity/state or other
  render offsets); beat-displace stacks on top additively. Watch total offset magnitude so a
  beat during a paint burst doesn't over-fling (cap `uBeatAmt`).

### DECIDED (user, planning session)
1. **Character = DIRECTIONAL WOBBLE.** Each cluster jolts in its OWN noise-picked direction on the
   beat (i.e. `vecField(world)` = a smooth vector-noise direction × amp), then eases back. NOT
   radial-from-center, NOT along-flow. So `beatDisplace = uBeatAmt · pulse(t) · btVecNoise(world·uBeatFreq)`.
2. **Phase = TOGETHER.** All clusters punch on the same beat; spatial variation lives only in the
   per-region **direction + magnitude** (from the vector field), not in timing. So `uBeatPhaseRipple`
   ships at 0 (single global `uBeatPulse` scalar). Keep the ripple knob wired but default 0 — add
   later only if "together" feels too uniform.
3. **Magnitude = BEAT IMPULSE ONLY.** Clean, every beat equal — a single fast-attack/exp-decay
   `pulse(t)` fired on each precomputed beat. No sub-bass/loud scaling for v1 (drop
   `BEAT_SUBBASS_GAIN` for now; can add a loudness multiply later).

### Still to pick while coding (minor)
- **Cluster source:** world-noise blobs (recommended, trail-safe) — assume this unless it looks bad.
- **Trail cost:** displace final centerline only (v1, cheap); recompute tangent from displaced
  neighbours only if ribbon orientation looks off during strong beats (v2).

### Dropped (no longer needed — user call, this session)
- Per-trail individual speed (hashed `speedMul`).
- Pulsing/breathing whole-ribbon tail-burst.
- Exempt recently-painted spots from the forward-biased behind-fade.
- 'Flow-through' paint mode/knob.

### Also observing (no change yet)

- **"Cloud feels above me"** → now promoted to roadmap #4 (camera initial framing). User's
  theory: random shape seed + rotation + spawn at cloud center → whole shape not in view.

## Done

### Camera initial framing — pull-back + aim (latest)
- Problem: camera spawned at origin inside a randomly rotated home-cell cloud → mass felt
  "above" / not framed. Plan: (1) pull back + (2) aim at centroid.
- New `src/camera/frameCloud.js`: world-centroid of home-cell `(0,0,0)` seeds via the same
  lowbias32 cell transform as the GPU, then `camera at (C.x, C.y, C.z + CAMERA_FRAME_DIST)`
  looking at `C` (approach along default fly `-Z`). Syncs fly-controls via new `setHeading()`.
- Pull-back kept **moderate** (`CAMERA_FRAME_DIST = SHAPE_SCALE·0.95 ≈ 2.4`) — a full FOV-fit
  would put the far side outside `SIM_KILL_RADIUS` and recycle/fade it. Aim does the heavy lift.
- Wired in `fitCamera()` (init) and `applyBaseShape({ reframe: true })` on audio-start mood bake.
  Dominance-slider reshapes do **not** reframe (no mid-flight teleport).

### Phase B — cluster-local beat displacement (awaiting musical rework)
- Goal: on each precomputed beat, punch the particles LOCALLY per region (we fly INSIDE the
  cloud, so it must beat around you), NOT one global breathe. Applies to BOTH mesh dots and
  trail ribbons so overlapping regions jolt together.
- New `src/particles/beatField.glsl.js` (`BEAT_GLSL`): `vec3 beatDisplace(vec3 world)` =
  `btVec(world*uBeatFreq + uBeatTime*uBeatDrift) * (uBeatAmt*uBeatPulse)`. `btVec` = smooth
  world-space vector noise (bt*-prefixed to avoid clashing with instanceTransform's iw*), so each
  cluster (size ≈ 1/uBeatFreq) gets its own wobble DIRECTION + amount. Early-outs to 0 when
  `uBeatPulse<=0` → ~free between beats.
- RENDER-TIME + non-accumulating (NOT in the sim): mesh offsets the drawn center only
  (`vec3 displaced = p + beatDisplace(p)` in shaders.js — fades/orientation stay on true `p`);
  trail offsets each spline centerline point (`p += beatDisplace(p)` in RIBBON_VERT, after the
  curvature calc, before side/wpos). Frozen trail history can't be re-simmed, so this is the only
  coherent way to make ribbons beat.
- Driver: `audioMotion.beat` is a firework [0,1] envelope (snaps to 1 on `isBeat`, decays over
  `beatDecay`). The MESH punch is now GATED separately in main.js off the raw `isBeat`: a dedicated
  `beatDispPulse` fires only every `BEAT_DISPLACE_EVERY`(2)th beat and decays over
  `BEAT_DISPLACE_DECAY`(0.5s) → sparser than, and decoupled from, the shared beat (flow-kick /
  size-pop keep their rhythm). `uBeatTime = elapsed`. Decisions: directional wobble / together /
  beat-impulse-only (no bass scale v1). (Trail feeds off `audioMod.beat` but amt=0 → moot.)
- Trail-safety: cluster size (1/uBeatFreq) ≫ history point spacing so adjacent ribbon points move
  together (ribbon FLEXES, doesn't shatter). Default `BEAT_DISPLACE_FREQ 0.6` (cluster ≈ 1.6u).
- Knobs (BAKED): mesh `BEAT_DISPLACE_AMT 0.01`, trail `BEAT_DISPLACE_AMT_TRAIL 0.0` (**OFF —
  mesh only**; ribbons flex too strongly), `BEAT_DISPLACE_FREQ 0.6`, `BEAT_FIELD_DRIFT 0.05`.
  Sparser: `BEAT_DISPLACE_EVERY 4` + `BEAT_DISPLACE_DECAY 1.5` (decoupled gate in main.js, routed
  through live `beatCtl`). Live panel: **`mesh beat`** + **`trail beat`** (trail 0) + shared
  **`beat cluster`** + **`beat every`** (N) + **`beat decay`**. Shader early-outs at amt 0 → free.
  Also toned: size-shimmer master gain `AUDIO_TREBLE_SIZE 0.6` (baked), now promoted from a shader
  `#define` to a LIVE uniform `uAudioSizeGain` with a **`shimmer size`** slider (scales the sustained
  `treble amt` + beat `beat pop` together; those remain their own sliders too).
- Deferred: bass sub-band magnitude, per-cluster phase ripple, pulse-squaring for punchier attack.

### Bloom radius trimmed smaller
- User: bloom still too large + clicking flings trails too far; keep the STRENGTH the same.
- `BLOOM_RADIUS` `SHAPE_SCALE*0.46` (≈1.15) → `SHAPE_SCALE*0.34` (≈0.85); `BLOOM_RADIUS_FAR_MUL`
  `1.45` → `1.3`. `BLOOM_STRENGTH` (2.8) untouched.
- Why this also cuts the fling without weakening the pop: the burst only acts on a particle
  **while it's inside the radius**, so a tighter radius means the head crosses out sooner →
  less accumulated impulse → travels less far, while the per-frame peak push is unchanged.
- If too small, nudge `BLOOM_RADIUS` toward `0.40`; far clicks still big → `FAR_MUL` toward 1.15.

### Trail death: tail reels into head (latest)
- **Goal (user):** make death the INVERSE of birth. Birth already grows the ribbon out from a
  collapsed point (record pass collapses on respawn); death should retract the TAIL forward
  into the head so the ribbon shrinks to a point and vanishes — an "ending", not a flat fade.
- **Fix (age-death only — user pick):** `RIBBON_VERT` now reads the head's **age** (sim
  state.w) + **lifetime** (sim cell.w) for its trail, computes `deathT` (smoothstep over the
  last `TRAIL_DEATH_TIME` s of life), and clamps the drawn length to `Leff = (L-1)·(1-deathT)`.
  Vertices past `Leff` fold onto the retreating tail endpoint, so the tail races forward toward
  the still-moving head as `deathT→1`, collapsing to a point right before the sim respawns it.
  Then (with the new churn/drift) it's reborn elsewhere → full lifecycle: **grow → live → reel
  in → reborn.**
- **Plumbing:** bound the trail sim's state+cell textures to the ribbon material
  (`uSimState`/`uSimCell`, refreshed each frame because the sim ping-pongs its RTs) — the mesh
  already does the same. Config `TRAIL_DEATH_TIME` (0.7 s); uniform `uDeathTime`; getter
  `deathTime`; live slider **reel-in** (0 = off / instant collapse = old behaviour).
- **Subtle fade floor (refinement):** on top of the retraction, the whole ribbon dims over the
  death window toward an alpha FLOOR (not to 0) via `deathFade = mix(1.0, uDeathFadeFloor,
  deathT)` — so the retraction stays the primary ending and the fade just softens the last
  moment (at recycle: ~floor opacity AND collapsed to a point). Gated by the same `deathT` →
  age-death only. Config `TRAIL_DEATH_FADE_FLOOR` (0.5; 1 = pure retract, 0 = fade fully out);
  uniform `uDeathFadeFloor`; getter `deathFadeFloor`; live slider **reel fade floor**.
- **Scope note:** distance/behind recycling still uses the forward-biased fade (unchanged), so
  the reel-in shows on trails that live to full age in view. **Manual-review only — not built
  (shell down); Vite dev server showed no JS transform errors, but GLSL is only validated at
  runtime in the browser.**

### Animated trail spawn: churn + downstream drift (latest)
- **Problem:** one fixed shape-seed per trail → every ribbon re-traces the same streamline each
  life, so the bundle looks frozen even with the living field. Wanted spawns to animate so
  trails are born in different places.
- **Fix (hybrid, gentle — user pick):** `particleSim.js` gains `animatedRespawn()` (replaces the
  two `instRespawn` calls). Two layered, independently-tunable effects, both **trails-only**
  (mesh sim keeps the knobs at 0 → byte-identical old behaviour):
  - **CHURN** — on respawn the trail adopts a slowly-drifting seed **index**
    (`shift = floor(uSpawnTime · uSpawnChurn · (0.5+hash))`, per-trail rate jitter to desync),
    permuting the seed set → which streamline each ribbon rides gently reshuffles over seconds.
    Shape **density preserved** (we permute, not resample randomly).
  - **DRIFT** — slide the resulting spawn a little **downstream** along the (warped) flow line
    via a short 4-step Euler walk, offset animated by `fract(uSpawnTime·rate + hash)` → births
    travel along the path (coherent accent; doesn't change the envelope).
  - **Safe:** the record pass already collapses the ribbon onto the head on respawn
    (`head.w <= uDt`), so teleporting spawns never streak.
- Config `TRAIL_SPAWN_CHURN` (0.30) / `TRAIL_SPAWN_DRIFT` (0.25) / `TRAIL_SPAWN_DRIFT_RATE`
  (0.10); uniforms `uSpawn{Time,Churn,Drift,DriftRate}` (default 0 on the sim, trail sim raises
  them); `uSpawnTime` shares the field-warp wall clock. Live sliders **spawn churn / spawn
  drift**. Getters on `GPUTrails`. **Manual-review only — shell was down, not built.**

### Living base field + traveling trail pulse (latest)
- **Problem (user):** the base flow is a **baked, world-fixed** volume, so streamlines never
  move. Fine for mesh *dots* (you read their displacement), but the **trail bundle looks
  frozen** — every ribbon re-traces the identical static streamline each life, so the summed
  silhouette is a still portrait, not flowing.
- **Fix A — living field (slow global domain warp).** `instSampleVel` now nudges the WORLD
  point by a slow, low-frequency animated value-noise (`iwFieldWarp`, time = extra noise
  dimension) BEFORE folding into the tile's local frame, so the streamlines **morph
  continuously** (whole cloud breathes; trail bundle flows). Applied in
  `instanceTransform.glsl.js`, so BOTH the sim advection AND the mesh sprite-orientation see
  one coherent living field. NOT a seed-swap (that would pop/teleport + need a re-bake) — a
  continuous coordinate warp. Config `FIELD_WARP_AMOUNT` (0.18) / `FIELD_WARP_FREQ` (0.55) /
  `FIELD_WARP_RATE` (0.06); uniforms `uFieldWarp{Amt,Freq,Rate,Time}` on the mesh sim
  (`particleSim.js`), mesh material (`createQuantumCloud.js`), and trail sim. Time is advanced
  in `ParticleSim.update` (wall-clock dt) and set from `elapsed` in `main.js` for the mesh
  material. Live sliders: **field warp / field evolve / field scale** (drive all three
  together). 0 amount = exact old static behaviour. This is also the **groundwork for Phase B**
  (audio bass just pushes `FIELD_WARP_AMOUNT`).
- **Fix B — traveling brightness pulse (perceptual current).** A low-frequency brightness wave
  scrolls head→tail along each ribbon over time (`RIBBON_VERT`), per-trail phase-offset so
  they don't blink in lockstep — light visibly RUNS along the trail like charge in a wire.
  Pure render effect (no motion/state change), modulates brightness + a touch of alpha. Config
  `TRAIL_PULSE_STRENGTH` (0.45) / `TRAIL_PULSE_SPEED` (0.5) / `TRAIL_PULSE_DENSITY` (1.6);
  uniforms `uPulse{Time,Speed,Density,Strength}`; live sliders **pulse / pulse speed / pulse
  waves**. 0 strength = flat ribbon.
- **Caveat / untested:** shell was unresponsive so this is **manual-review only, not built**.
  Also the warp noise is seeded by absolute world position, so *very* far from origin (after a
  long flythrough) float precision may soften the warp — fine for now, revisit if it shows.

### Paint: outward strength + distance radius + easier clicking (latest)
- **Stronger outward pop.** After boosting the shaped burst, the radial kick read weak.
  Raised the mood `outward` range 0.7-1.5 → **1.1-2.2** (moodToBloomShape) + `PAINT_OUTWARD`
  1.0 → 1.5 (manual base).
- **Distance-based radius.** A mark's radius now scales with the click's distance from the
  camera at click time — far = bigger, near = smaller (keeps apparent size consistent).
  `bloomField.add({ camDist })` (passed from main.js pick handler) lerps `BLOOM_RADIUS_NEAR_MUL`
  (0.6) → `BLOOM_RADIUS_FAR_MUL` (1.7) between `BLOOM_RADIUS_DIST_NEAR` (1.0) and `_FAR`
  (=SIM_KILL_RADIUS), multiplied on top of the mood radius.
- **Easier clicking.** A click only no-ops when NO particle projects within `pixelRadius`
  (cluster threshold has a sparse fallback, never blocks alone). So widened
  `PICK_PIXEL_RADIUS` 16 → **24** (real fix for "clicked but nothing bloomed") and lowered
  `PICK_CLUSTER_MIN` 4 → **2** (sparser clumps still count as real clusters).

### Paint: burst deform-balance + LRU soft-fade (latest)
- **Burst tilted toward deform.** Trails sometimes "exploded straight out" instead of
  deforming because the trail tail-burst is a RIGID translation of the whole ribbon by the
  head's burst vector — when that vector was mostly radial (`dir`), it just shoved out.
  Varied by mood (`outward` = lerp(0.7,1.5,energy)) and where heads landed (shaped term has
  a `(1-t)²` center falloff → rim trails got shoved, not folded). Fix in `paintField.glsl`
  burst term: `PAINT_BURST_SHAPED` (1.8) gains the along-field term, `PAINT_BURST_WIDEN`
  (0.5) is an exponent on its falloff (`pow(w,WIDEN)`) so it reaches the rim. Baked as
  `#define`s (injected from config; `.toFixed(4)` to stay float-typed). Applied in BOTH
  `paintApply` and `paintBurst`.
- **LRU soft-fade (bounds accumulation).** Longer painted-head life + never-trimmed
  world-anchored blooms meant heavy painting captured/froze many trails locally. `bloomField`
  now fades a mark's shape weight to 0 via `fadeEnvelope` (hold `BLOOM_HOLD` 10s → smoothstep
  down over `BLOOM_FADE` 20s). As `uBloomB.z` fades, the redirect weakens AND the trail
  life-boost drops (paintInfluence reads the same weight) → captured trails release & recycle.
  `add()` prunes expired marks + caps to `BLOOM_MAX_STORED` (96, LRU drop-oldest); syncUniforms
  skips fully-faded. Medium permanence (~30s total). Tune HOLD/FADE for more/less permanent.

### Trail thickness: within-trail taper + curvature swell (latest)
Width used to be constant along a ribbon (only hashed between trails). Now it varies along
the length, all in `RIBBON_VERT` (no geometry/perf change):
- **Head + tail taper** to a thin point (`TRAIL_TAPER_HEAD` 0.12, `TRAIL_TAPER_TAIL` 0.18 =
  fraction of the trail each end tapers over; smoothstep in/out on `u = fj/(uL-1)`).
- **Curvature swell** — the ribbon gets THICKER where the path bends, thinner on straights,
  so swirls/whirlpools bulge. Uses the spline's analytic 2nd derivative for geometric
  curvature `κ = |p'×p''|/|p'|³`, mapped `1-exp(-κ·scale)` → `mix(1, curveWidth, amt)`.
  Knobs: `TRAIL_CURVE_WIDTH` 1.7 (multiplier at max curvature), `TRAIL_CURVE_SCALE` 0.5
  (sensitivity). Final width = per-trail base × taper × curve factor.
- Live sliders added (taper head/tail, curve width/sens). Getters/setters on GPUTrails.

### Bloom/paint rework: living whirlpool + punchier surge (latest)
One pass over the click-paint feel. All essentially free at runtime (constants + a few
shader math ops; no new passes/particles).
- **Surge feels faster + eases smoother (meshes).** `outwardEnvelope` (bloomField.js) now
  uses a **smoothstep** attack (rounded peak, no up-side "snap"); `BLOOM_STRENGTH` 1.8→2.8
  (punchier push), `BLOOM_GROW_TAU` 2.5→1.2 (shape opens up fast), `BLOOM_DECAY_TAU`
  0.35→0.7 (longer, gentler glide-down). Meshes ease to a stop naturally (velocity =
  strength·envelope).
- **Trail bloom = firework ramp (no sudden stop).** The trail whole-ribbon bloom used to be
  a FLAT per-frame cap (constant-speed plateau) hard-gated OFF at `TRAIL_TAIL_BURST_WINDOW`
  → a visible "sudden stop" (worse after the tau bump left the burst at ~20% when cut). Fix:
  the per-frame cap is now **firework-shaped** in `gpuTrails.update` — `exp(-F·x)` normalized
  to 1 at the click and exactly 0 at the window end (`TRAIL_TAIL_BURST_FALLOFF` = 5). The CAP
  (not the raw burst) governs the ribbon's outward speed, so it goes fast → smooth-slow →
  dead stop, and the total stays bounded (area under the curve → settles inside BLOOM_RADIUS).
  `TRAIL_TAIL_BURST_MAX` is the PEAK budget (0.09). Peak + falloff were bumped together for
  more fast→slow CONTRAST at ~unchanged reach. Tune: MAX = start speed/reach, FALLOFF =
  contrast (higher = punchier start + longer gentle tail).
- **Shape detail reads (not one big blob).** The real path is mood-driven, so the ranges
  live in `moodToBloomShape.js`: `fieldFreq` 1.0-3.0 → **1.8-4.0** (higher frequency),
  `detail` floor 0.35 → **0.55**. Manual-path config parity: `PAINT_CURL_FREQ` 1.6→2.4,
  `PAINT_DETAIL` 0.4→0.55.
- **Stronger persistent redirect.** `shapeAmt` range 0.55-1.0 → **0.8-1.3** (moodToBloomShape)
  + `PAINT_CURL` 1.0→1.3 (manual). `wSum` still clamps to 1, so this just saturates the
  same-speed redirect faster → the whirlpool dominates and reads permanent.
- **Living field (swirl + evolve).** `paintField.glsl.js` new `paintWarp(r, seed)` warps
  the SHAPE sampling coord only (raw `r` kept for the radial pop/falloff): a per-bloom
  **swirl** rotation (geometry-safe) + a **BOUNDED** two-sine domain **evolve** wander
  (bounded on purpose — a growing drift would degenerate vortex/torus). Knobs
  `PAINT_SWIRL_RATE` (0.35 rad/s), `PAINT_EVOLVE_RATE` (0.15 world-unit amplitude). New
  uniforms `uPaintTime`/`uPaintSwirl`/`uPaintEvolve` on the sim material; `uPaintTime` is
  written each frame in `bloomField.syncUniforms` (covers both mesh + trail sims); the
  trail **burst** material shares the same three uniform objects.
- **Painted heads live longer.** New `paintInfluence(p)` (persistent spatial weight, 0..1)
  + `uPaintLifeBoost` in the sim frag stretches a head's lifetime by up to `PAINT_LIFE_BOOST`
  (2 = up to 3× at the mark core). Meshes keep the default 0 (free no-op / guarded); the
  trail sim sets it in `gpuTrails.js`. A ribbon now holds the mark longer, and recycles
  once it leaves the bloom.
- Not yet verified in-browser: the sandbox shell was unresponsive this session, so `npm
  run build` couldn't run. Watch for GLSL compile logs on first load; watch fling-away on
  the raised trail cap.

### Depth interaction: meshes occlude trails (Option A) (latest)
- Goal: meshes in front should hide trails behind them (before: trails were an additive
  overlay with no depth relationship).
- **Meshes → opaque + depth-write.** `createQuantumCloud.js` material now `transparent:
  false`, `depthWrite: true`, `NoBlending`. Soft birth/death/near/fog fades are preserved
  via a **dithered screen-door `discard`** in `shaders.js` (interleaved-gradient hash;
  fully-faded fragments discard so invisible far meshes don't write occluding depth).
  Side benefit: meshes occlude each other → they finally read solid (closed the old
  "meshes too transparent" ask).
- **Trails → shared depth pass.** Removed the half-res composite buffer (`trailRT` /
  `composeMat` / `TRAIL_RES_SCALE` / `render scale` slider — it was at 1.0 = off). Trails
  now draw straight into the main framebuffer after the meshes (`autoClear = false`),
  depth-testing against the mesh depth.

### Trails: normal blending + depth-write (fixed dense-area FPS) (latest)
- Confirmed the dense-area FPS drop was **additive trail overdraw** (toggling trails off
  restored FPS). Additive can't cull overdraw — every layer must accumulate.
- Fix: trails now **normal "over" blending + `depthWrite: true`**, so nearer trails
  occlude farther ones and a dense clump's depth complexity collapses from dozens of
  layers to a few. Color model updated for normal blend: rgb stays full-brightness, the
  whole head→tail + distance + opacity fade goes into **alpha** (was pre-multiplied for
  additive). Low-alpha `discard` (`< 0.04`) so faint tails don't punch occluding holes.
- Trade-off (accepted by user — "we don't need the glow"): solid ribbons instead of glow,
  and no more milky/blown-out pile-up.

### Forward-biased cloud transition — Lever 1 (latest)
- The recycle bubble + fades were spherical/symmetric, so the cloud behind lingered as
  long as ahead. Added a **directional fade** biased by the camera look axis (`uCamFwd`):
  ahead keeps the full kill-radius reach (next cloud appears early), behind shrinks to
  `CLOUD_BEHIND_FRAC` (0.35) of it (passed cloud clears fast — also a small trail-fill
  win). Applied to both mesh far-fade (`shaders.js`) and trail head-cull (`gpuTrails.js`);
  live `behind reach` slider (1.0 = symmetric/off). **Lever 2** (asymmetric *recycle*,
  actually spawning budget ahead) is deferred — see roadmap #1.

### Mesh opacity — widened fog (this session)
- Meshes read "half-transparent most of the time" because the distance fog faded them
  from alpha 1 at 0.75 to 0 at 3.625, while the visible bubble reaches 4.75 — so most
  particles sat mid-fade. Widened it (`MESH_FOG_NEAR ≈2.0`, `MESH_FOG_FAR ≈4.6`) so
  meshes stay solid across most of the bubble and only fade at the far rim. Converted the
  fog from a compile-time `#define` to `uFogNear`/`uFogFar` uniforms → live `fog near` /
  `fog far` sliders. (Option #1 of the opacity plan; #2 = depthWrite + alpha-test for true
  occlusion still available if overlap still looks translucent.)

### Quad-ribbon trails w/ per-trail thickness (this session)
- Replaced the 1px `LineSegments` (WebGL caps lineWidth at 1px) with **camera-facing quad
  ribbons**: 2 verts per history point (aSide ∓1), expanded sideways by a per-trail
  **world-space width** (far trails shrink → cheaper). Width is hashed per trail, skewed
  toward thin so most trails stay cheap; soft edges via `vSide` in the fragment. Sim/
  record/advance/burst passes unchanged — draw-only change (`object3D` is now a `Mesh`,
  DoubleSide, additive). Config `TRAIL_WIDTH` / `TRAIL_WIDTH_VAR`; panel `trail width` /
  `width var`. Fill-rate scales with width (mitigated by half-res + cull). This also lays
  the groundwork for roadmap #2 (audio→thickness): just modulate `uWidth` later.
- Width distribution made contrasty + thin-biased: `TRAIL_WIDTH_CONTRAST` (push to thin/
  thick extremes) + `TRAIL_THIN_RATIO` (fraction of trails that are thin). Panel `width
  contrast` / `thin ratio`.

### Mesh near fade (this session)
- Meshes ballooned when the camera got too close. Added a soft **near fade** in the mesh
  vertex shader (`uNearFade`, config `MESH_NEAR_FADE = 0.55`): fades a mesh out below that
  distance, back by ~2×. Complements the existing far handling (kill-radius recycle +
  farFade + fog). Panel `mesh near` (0 = off). (Meshes don't smear like lines, so this is
  a soft alpha, not a hard cull.)

### Trail-paint fix: shrink + disappear (this session)
- Painting made trails **collapse to a stub then fling away/vanish**. Two causes, both
  from paint colliding with version-B adaptive recording:
  1. Paint curls the head hard → the advance pass over-sampled the tiny curl → all 24
     points bunched onto it (short). Fix: **while blooms are active, raise the spacing
     floor** to `TRAIL_SAMPLE_PAINT_MIN_DIST` (near max → near-uniform spacing → keeps
     length; ribbon BENDS through the shape). Gate = `uBloomCount > 0`. Free (just a
     different number to the advance pass).
  2. The tail-bend displacement **accumulates every frame** over the 1.2 s window →
     flung the ribbon out of the bloom. Fix: **per-frame clamp** `TRAIL_TAIL_BURST_MAX`
     in the record pass (bounded pop, settles within `BLOOM_RADIUS`). One `clamp` → free.
- Perf-safe: no return of per-slot archetype noise (burst pass unchanged). New panel
  sliders: `paint keep-len`, `bend cap`.

### Speed contrast (this session)
- Retuned so the resting flow is a slow mood-driven drift and each beat leaps: mood
  still sets the baseline (`moodToFlowSpeed` → `[FLOW_SPEED_MIN, FLOW_SPEED_MAX]`), but
  the band ceiling is lower (`FLOW_SPEED_MAX 0.95→0.60`), the sustained loud accent is
  smaller (`AUDIO_FLOW_ACCENT 0.50→0.20`), and the transient beat surge is much bigger
  (`AUDIO_BEAT_FLOW_KICK 0.80→2.20`, trail `TRAIL_AUDIO_BEAT_WHIP 0.60→1.40`). Panel
  `beat kick` slider widened to 0–4. Surge is still mood-*proportional* (multiplicative);
  a baseline-independent "every beat hits hard" option was offered for later.

### Trail optimization + reactivity (this session)
- **Fill-rate cuts**: per-trail distance cull/fade by head distance (`TRAIL_NEAR_CULL` /
  `TRAIL_FAR_CULL`), live `trail count` (drawCount) slider.
- **Depth-shared trails (Option A)**: meshes are now OPAQUE + write depth (dithered
  screen-door fade in the fragment shader keeps soft birth/death/fog), and trails draw
  straight into the main framebuffer sharing that depth → meshes in front occlude trails
  behind them. The half-res composite buffer + `TRAIL_RES_SCALE` / `render scale` slider
  were removed (buffer was at 1.0 = off anyway). This also makes meshes read solid.
- **Adaptive history recording (version B)**: new per-trail *advance pass* stores a
  history point only when the head moves `TRAIL_SAMPLE_MAX_DIST` (straight) or turns
  past `TRAIL_SAMPLE_TURN_DEG` (bend), floored by `MIN_DIST`. Fixed 24-point budget now
  concentrates on curves → smoother ribbons at the same vert count. Record pass reads
  a per-trail `uAdvanceTex` instead of a global timer. Panel: `trail length` (= max
  spacing), `sample turn`, `min space`. Trade-off: length now varies with curvature +
  is speed-independent.
- **Trail audio reactivity (Phase A)**: same `AudioMotion` source as meshes → beat
  `whip` on trail speed, loudness eases sample spacing up (length breathing), beat+loud
  brightness flare. Gains: `TRAIL_AUDIO_BEAT_WHIP/LENGTH/GLOW_BEAT/GLOW_LOUD`.
- **Trail paint reactivity**: blooms now bend trails (`uPaintStrength` on the trail sim,
  `TRAIL_PAINT_STRENGTH`) + whole-tail burst. Perf-safe via a **burst pass** that
  evaluates the shaped archetype burst *once per trail* (head) into `burstTex`, gated to
  a short post-click window (`TRAIL_TAIL_BURST` / `TRAIL_TAIL_BURST_WINDOW`) — ~24×
  cheaper than per-history-slot noise, so FPS holds after painting.

### GPU trails (this session)
- New `src/particles/gpuTrails.js`: GPU-resident trails to replace the CPU version.
  - Heads = a second `ParticleSim` (same baked volume + per-cell instance transform
    as the mesh cloud → identical tiled shape, lifetime, camera-relative respawn).
  - History = ping-pong float texture (`Wt × Ht·L`); a fullscreen "record" pass keeps
    slot 0 on the live head, time-gated ring scroll, collapse-on-respawn (no teleport
    streaks).
  - Ribbon = `InstancedBufferGeometry` of `L-1` line segments, instanced per trail;
    vertex shader `texelFetch`es slots from the history texture (`gl_InstanceID` →
    trail), additive, per-slot fade + per-trail hue jitter.
  - Wired in `main.js` (replaced `TrailField`), `tuningPanel.js` (`trail.opacity`
    accessor), bumped `TRAIL_COUNT` to 40000.
  - Fixed GLSL3 compile error (`attribute` → `in`).
- Note: the CPU `src/particles/trailField.js` is now unused (kept for reference).

### Trail / mesh alignment + CPU trails (earlier this session)
- Replaced the sin-based per-cell hash with a **CPU/GPU bit-identical integer hash**
  (lowbias32) in `instanceTransform.glsl.js` (kept sin-hash only for GPU-only
  per-particle orientation). Added `precision highp int` to the sim fragment shader.
  This made trails land on exactly the same tiles as the meshes.
- CPU `TrailField`: dense-region **bundle seeding** + per-bundle recycle (mirrors the
  integer hash on the CPU). Config: `TRAIL_BUNDLES` / `TRAIL_BUNDLE_RADIUS` /
  `TRAIL_DENSITY_BIAS`. (Superseded by GPU trails, code retained.)

### Audio library
- Wired 10 test tracks into `AUDIO_SRCS` / `AUDIO_TRACK_LABELS` (`config.js`), with
  the loader running paths through `encodeURI` (`audioPrecompute.js`) so filenames
  with spaces/() work. Tuning-panel **track** dropdown switches via `?track=N` reload.

### Earlier milestones (pre-this-session, for context)
- Audio Phase A: `audioMotion.js` (beat/loudness/treble → live motion), audio as the
  mood source, streamlined mood update, audio debug meters in the tuning panel.
- Mood-driven flow speed (`moodToFlowSpeed.js`) + mood-driven size (`moodToSize.js`).
- GLB model particles (`particleModels.js`, `MESH_TYPES` catalog), combined size model,
  per-particle rotation + death fade + stagnation heading hold.
- Mood presets, field dominance weighting, GPGPU advection (`particleSim.js`),
  persistent click-paint blooms (`bloomField.js`), infinite flythrough + recycling.
