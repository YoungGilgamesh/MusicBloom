# Quantum Cloud — Dev Notes & Plan

Running progress log + roadmap for the interactive Three.js particle cloud.

Last updated (2026-08-17): **Cover page rebuilt as a standalone, non-tiled random-sphere cloud — abandoned the `COVER_KILL_RADIUS_SCALE`/`COVER_OUTER_TIGHTEN`/`COVER_SHAPE_SCALE` multiplicative chain entirely.**
Root cause of "particles never actually get close to the camera" no matter how far those three
scale constants were pushed: the gameplay tiling lattice (`instanceTransform.glsl.js`'s
`instRespawn`/`instToWorld`/`instOrigin`) snaps every respawned particle to a per-cell random
jitter/rotation/mirror/scale (`SIM_INST_JITTER * SIM_INST_PERIOD ≈ 0.78` world units, plus an
`0.8–1.4×` scale variance) — a floor completely independent of, and unaffected by, any of the
shell/shape scale constants. Rather than keep patching the gameplay-tuned tiled/mood-shaped
system to behave like a small static decoration, cover is now fully decoupled from it:
- `coverMood`/`coverWarpOrder` are a fixed neutral value (`energy/brightness/texture/heaviness/
  dynamism = 0.5`, `bpm = 120`, warp `['dynamism','bpm']`) — only used to drive the shared
  velocity-bake swirl motion, no longer meant to preview any real track's shape (previously this
  baked V1.mp3's actual mood fingerprint via `COVER_FIXED_MOOD`/`contrastMood()` — removed).
- New `randomPointInSphere()`/`randomSeedsInSphere()` helpers (`main.js`) seed the cover trail/
  flowDots directly with uniformly-distributed random points inside a sphere of radius
  `COVER_CLOUD_RADIUS` around the camera (which is the fixed cover-camera pivot at the origin) —
  no mood-shape sampling at all for cover.
- New `disableTiling()`/`restoreTiling()` helpers (`main.js`) zero out the tiling lattice
  (`uInstPeriod=1e6`, `uInstJitter=0`, `uScaleMin=uScaleMax=1`) on the trail/flowDots sim (and
  flowDots' own render material, which independently samples the velocity field) for cover, and
  restore the real gameplay constants (`SIM_INST_PERIOD`/`SIM_INST_JITTER`/`SIM_INST_SCALE_MIN/
  MAX`) once the cover fadeout finishes.
- `config.js`'s three old constants (`COVER_KILL_RADIUS_SCALE`, `COVER_OUTER_TIGHTEN`,
  `COVER_SHAPE_SCALE`) replaced with a single `COVER_CLOUD_RADIUS = 1.1` (controls both the seed
  sphere and the recycle shell directly — no multiplication chain) plus `COVER_NEAR_CULL_FRAC`,
  `COVER_NEAR_FADE_START_FRAC`, `COVER_NEAR_FADE_END_FRAC` (fractions of `COVER_CLOUD_RADIUS` for
  the trail/dots' near dead-zones). `scalePositionsInPlace()` removed (no longer needed — seed
  positions are generated at the right radius directly).
- The mesh cloud is still built (with the neutral cosmetic mood) and still deliberately NOT
  added to the scene until the cover fadeout hits solid black (`fadeOutT>=1`) — this
  hitch-hiding trick is unrelated to the shape/tiling rework and was explicitly kept as-is.
- Wired into both cover-setup paths (initial load + `loopBackToCover()`) and the
  transition-finish restore block. Verified error-free (`config.js`/`main.js`/`flowDots.js`,
  which had one stale comment updated); dev server confirmed 200. **Not yet visually verified in
  a browser** — next step is to actually load the page and confirm the swirling trail/dot cloud
  reads correctly and the full cover → gameplay → ending → loop-back cycle still works.

Previously (2026-08-16): **Re-added `COVER_SHAPE_SCALE` (`0.3`) to fix "almost no particles" after shrinking `COVER_KILL_RADIUS_SCALE` alone.**
Root cause found: shrinking only the recycle/visibility SHELL (`COVER_KILL_RADIUS_SCALE`, pushed
down to `0.12` for a "closer to camera" test) without also shrinking the actual seed positions
meant the real V1 shape (spread out to `SIM_KILL_RADIUS≈7.6`) mostly sat OUTSIDE the now-tiny
visible shell (`nearCull≈0.11`–`farCull≈0.79`) — `killRadius` only gradually reels stray
particles back in as they respawn (a leash, not an instant snap), so almost the whole population
was invisible at any given moment. Fix: re-added `COVER_SHAPE_SCALE` (config.js) + its
`scalePositionsInPlace()` helper (main.js) — uniformly scales the ACTUAL seed positions (mesh/
trail/flowDots) toward the origin (which is also the camera's fixed position on cover — see
orbitControls.js), so the real shape itself shrinks to match the shrunk shell instead of hanging
outside it. Wired into both cover-setup paths (initial load + `loopBackToCover()`) for all three
particle systems, with matching proportional trail/dot size scaling (`TRAIL_WIDTH`, sample
distances, `FLOW_DOTS_SIZE` — all switched from `COVER_KILL_RADIUS_SCALE` to `COVER_SHAPE_SCALE`
for this purpose). Settled on `COVER_KILL_RADIUS_SCALE = 0.3` (up from the too-thin `0.12`) +
`COVER_SHAPE_SCALE = 0.3` as a paired starting point — shell and shape now shrink together,
keeping the visible band densely populated instead of sparse. `COVER_OUTER_TIGHTEN` unchanged
(`1.0`). Both files verified error-free; dev server confirmed 200.

Previously (2026-08-16): **Cover bubble shrunk again (`COVER_KILL_RADIUS_SCALE = 0.5`) — this time with proportional trail/dot size scaling so it reads denser, not emptier.**
Earlier the shrink constants were reverted to `1.0` because shrinking the bubble alone made
cover look SPARSER (fixed-size ribbons/dots became huge relative to the tiny bubble and
overlapped into a few blobs instead of reading as many small distinct points — bubble volume
shrinks by radius³ while sprite sizes stayed fixed absolute world units). This time, `main.js`
scales `trail.width`, `trail.sampleMinDist`/`sampleMaxDist`/`samplePaintMinDist`, and
`flowDots.size` down by the SAME `COVER_KILL_RADIUS_SCALE` factor wherever the bubble radius
itself is scaled (both the initial cover setup and `loopBackToCover()`), keeping ribbon-width:
bubble-radius and dot-size:bubble-radius ratios identical to gameplay's. Net effect: shrinking
the bubble now behaves like zooming in on a smaller version of the same picture — same particle
count, tighter volume, proportionally-sized sprites — reading as a smaller but genuinely denser
cloud instead of overlapping mush. All new per-instance overrides (`trail.width`,
`trail.sampleMinDist/MaxDist/PaintMinDist`, `flowDots.size`) are restored to their real
`config.js` values in the existing transition-finish restore block (`fadeOutT>=1`), alongside
the pre-existing `killRadius`/`nearCull`/`behindFrac`/`pulseStrength` restores. `COVER_OUTER_
TIGHTEN` left at `1.0` (only one shrink factor now, simpler to reason about + scale).

Previously (2026-08-16): **Removed `randomPointsInBall()` — it fought the "cover = V1's real shape" goal.**
User asked (after the shape/scale fixes above) whether the cover page's uniform-ball reseed
actually conflicted with the new V1-mood-based shape — it did. While the mesh cloud correctly
seeded from `createQuantumCloud(coverMood)` (V1's real mood-shaped positions), the trail and
flowDots elements — which make up nearly all of what's visually on screen — were immediately
RE-seeded with `randomPointsInBall()`, a generic uniform-density sphere fill completely
unrelated to V1's mood/shape. So cover showed V1's real shape only in the (invisible-until-
Start) mesh cloud, while the visible trail/dots showed a generic sphere. Removed
`randomPointsInBall()` entirely (function + all 4 call sites: initial trail/flowDots setup,
and `loopBackToCover()`'s trail/flowDots reseed) along with the now-unused `COVER_VERTICAL_SPREAD`
config constant (only ever passed to that function). Trail/flowDots now simply keep whatever
seed positions they're naturally constructed/reshaped with — `GPUTrails`'s constructor already
takes `particles.userData.seedPositions` (V1's shape), and `FlowDots`'s constructor/`.reshape()`
already sample fresh positions from the given `mood`/`warpOrder` internally — so no separate
reseed call was actually needed; the override was actively working against the shape those
constructors had just correctly sampled. `loopBackToCover()`'s trail reseed now uses
`particles.userData.seedPositions` directly (mirrors the exact pattern `applyBaseShape()` uses
for the real track-mood path) instead of calling the removed helper. Cover-page trail/flowDots
will now visually match the mesh cloud's V1 shape, same as real gameplay — whether V1's specific
mood (energy-dominant, low dynamism) produces any hollow/uneven clustering remains to be
visually verified next.

Previously (2026-08-16): **Cover bubble scaled UP to match gameplay exactly (again) — `COVER_KILL_RADIUS_SCALE`/`COVER_OUTER_TIGHTEN` were still 0.22/0.55.**
User compared cover-page and gameplay-V1 screenshots side by side (now that cover uses V1's
actual mood, the shapes should look equally dense) and cover was still dramatically emptier —
just a handful of visible dots vs. gameplay's dense tangle of trails. Root cause: despite the
earlier plan to revert these to `1.0`, `config.js` still had `COVER_KILL_RADIUS_SCALE = 0.22`
and `COVER_OUTER_TIGHTEN = 0.55` — shrinking the cover bubble's radius to ~12% of the real
gameplay bubble (`0.22 * 0.55 ≈ 0.121`) and its VOLUME (∝ radius³) to roughly 1/560th, while
every trail/dot SIZE constant (`TRAIL_WIDTH`, `FLOW_DOTS_SIZE`, sample distances, etc.) stays
fixed at gameplay-scale absolute world units. Same particle count spread over a ~560x smaller
volume reads as drastically sparser — exactly the "cover empty, gameplay full" symptom in the
screenshots. **Fixed** by setting both back to `1.0` in `config.js` (cover bubble = gameplay
bubble, so all existing fixed particle/trail sizes are automatically correctly proportioned
again — no per-constant size tuning needed). Added stronger inline warnings on both constants
directly in `config.js` this time (not just DEV_NOTES) so this doesn't regress a third time.
`COVER_VERTICAL_SPREAD` (horizon-clustering) and the uniform-ball reseed are untouched — those
solve real distribution problems independent of overall scale.

Previously (2026-08-16): **Cover-page shape fixed to V1.mp3's actual mood fingerprint.**
User wanted the cover page's particle cloud shape to be a single, fixed shape — specifically
the SAME shape real gameplay would produce for `V1.mp3` (`AUDIO_SRCS[0]`, the default track),
not an arbitrary hand-tuned or randomized shape. Wrote a one-off script,
`scripts/getV1Mood.mjs` (mirrors `scripts/scanMeshMix.mjs`'s decode→analyse path), that
decodes `public/audio/V1.mp3` and runs the exact same `computeMoodFingerprint()` real
playback uses, then prints the raw mood: `{ energy:0.9256, brightness:0.578, texture:0.7213,
heaviness:0.4207, dynamism:0.0713, bpm:172.27 }`. Hardcoded this as a new `COVER_FIXED_MOOD`
constant in `main.js`; `coverMood` is now `contrastMood(COVER_FIXED_MOOD)` (was
`contrastMood(randomMood())`, re-rolled fresh every load). `coverWarpOrder` is hardcoded
directly to `['energy', 'bpm']` (V1's top-2 fields by contrasted value — verified
`contrastMood` applies the same monotonic curve per-field, so it can't reorder fields
relative to each other) rather than calling `buildWarpOrder()`, since that helper's 2-warper
shuffle uses `Math.random()` internally (intentional variety for the REAL track-mood path)
and would otherwise still flip warp order on every reload even with a fixed mood input.
`loopBackToCover()` updated to reuse these same module-level `coverMood`/`coverWarpOrder`
constants (aliased to local `mood`/`warpOrder`) instead of re-rolling `contrastMood(randomMood())`
+ `buildWarpOrder(mood)` every loop-back — cover shape is now bit-for-bit identical on first
load AND every subsequent loop-back. Removed the now-fully-unused `randomMood()` function
(`buildWarpOrder()` itself is still used by the real track-mood path, kept as-is). Color was
explicitly out of scope (user asked for shape only) — no trail/flowDots/paint color logic
touched. Real track-mood gameplay is completely unaffected.

Previously (2026-08-16): **Cover-page trail brightness pulse disabled.**
User wanted the trail ribbons' traveling brightness pulse (`uPulseTime`/`uPulseSpeed`/
`uPulseStrength` — a constant time-driven "light running along the ribbon" band, NOT
audio-reactive, runs even with no track playing) off during cover — it read as
unnecessary motion/noise on the calmer attract-mode page. Set `trail.pulseStrength = 0`
at both cover-entry sites (initial setup + `loopBackToCover()`), restored to
`TRAIL_PULSE_STRENGTH` in the transition-finish restore block (screen is black by then,
no visible pop) alongside the existing `killRadius`/`nearCull`/`behindFrac` restores.
flowDots has no pulse system, so nothing needed there.

Previously (2026-08-16): **Cover-page shell thickness control — outer boundary pulled independently of inner boundary.**
Clarified with the user that the cover-page particle zone is a concentric spherical
SHELL (inner dead-zone near the lens via nearCull/nearFadeStart/End, outer soft-fade
recycle edge via killRadius/farCull), not a single-radius sphere. `COVER_KILL_RADIUS_
SCALE` previously scaled BOTH boundaries together (same shell thickness, just bigger/
smaller overall). User wanted the shell itself thinner — outer edge pulled in closer to
the inner edge — to gather particles into a tighter, denser band. Added new
`COVER_OUTER_TIGHTEN = 0.55` in config.js: an EXTRA multiplier applied only to the outer-
boundary terms (`killRadius`, `farCull`, and the uniform-ball seed radius, via a new
`coverOuterRadius = SIM_KILL_RADIUS * COVER_KILL_RADIUS_SCALE * COVER_OUTER_TIGHTEN`
computed once in main.js) — the inner boundary (`nearCull`/`nearFadeStart`/`nearFadeEnd`)
is left driven by `COVER_KILL_RADIUS_SCALE` alone, untouched. Applied at all cover call
sites (initial setup + `loopBackToCover()`, both trail + flowDots); restored to real
unscaled gameplay values (`SIM_KILL_RADIUS`, `TRAIL_FAR_CULL`) on transition-finish as
before — cover-only change, gameplay unaffected. To tune shell thickness: lower
`COVER_OUTER_TIGHTEN` for a thinner/denser shell, raise toward 1.0 to widen it back out
(1.0 = outer boundary matches the old behavior exactly, same thickness as
`COVER_KILL_RADIUS_SCALE` alone gave).

Previously (2026-08-16): **Cover-page recycle bubble tightened — particles now spawn much closer to the camera.**
User still saw particles spawning noticeably far from the cover camera even after the
uniform-ball reseed. Since `randomPointsInBall`'s radius is `SIM_KILL_RADIUS *
COVER_KILL_RADIUS_SCALE`, and the trail/flowDots kill-radius/near-cull/far-cull all scale
by that same constant, `COVER_KILL_RADIUS_SCALE` is the single knob controlling how big
the whole cover-page particle bubble is. Lowered it `0.45 → 0.22` (roughly half) — this
proportionally shrinks the seed ball, recycle radius, and near/far cull together (their
ratios stay the same, so nothing degenerates), pulling the entire visible particle field
in tight around the camera instead of extending out to ~3.4 world units. Also cleaned up
`COVER_SEED_SCALE`'s comment (now unused/legacy — the seed reset samples a fresh ball
sized directly off `COVER_KILL_RADIUS_SCALE` instead). To tune further: raise/lower
`COVER_KILL_RADIUS_SCALE` in `config.js` directly — no other file needs to change.

Previously (2026-08-16): **Cover-page particles squashed to the camera's horizon.**
Follow-up to the uniform-ball reseed just below: with a true sphere, particles could
still spawn directly overhead/underfoot — reading as "popping in at the very top" since
the cover camera (pivot-in-place, `COVER_ORBIT_MAX_PITCH`-limited) rarely tilts that far.
Fix: `randomPointsInBall()` now takes a `verticalSpread` (0-1) factor that scales ONLY
the Y (up-axis) component of each sampled point, squashing the sphere into an oblate
spheroid flattened against the horizon — X/Z stay a full circle around the camera so it
still reads as "surrounding", just concentrated in height. New `COVER_VERTICAL_SPREAD =
0.35` in `config.js`, threaded through all 4 call sites (trail + flowDots, initial setup +
`loopBackToCover()`).

Previously (2026-08-16): **Cover-page particles now spawn in a uniform ball around the camera.**
User feedback: cover particles could still spawn "quite far, and not even" around the
camera. Root cause: the old `scaleSeedsTowardOrigin()` approach just linearly shrank the
track mood's own field-sampled seed positions (rings/spirals/hollow shells produced by
`fields/energy.js`, `fields/heaviness.js` (fixed ring at `R = SHAPE_SCALE*0.78`),
`fields/dynamism.js`'s spiral, etc. — see `sampleAll6Cloud`) toward the origin. Scaling
preserves whatever unevenness/hollowness the original shape had — a ring stays a ring,
just a smaller one, so particles still clumped with visible gaps rather than filling the
space around the camera. Fix: new `randomPointsInBall(count, radius)` helper generates
genuinely volume-uniform positions in a solid ball (`r = radius · ∛(random)` for uniform
density, uniform random direction via z/theta sampling to avoid pole-clustering) — used
in place of `scaleSeedsTowardOrigin` for both the trail and flowDots seed reset, at both
cover-entry call sites (`initial page load setup` and `loopBackToCover()`), sized to the
same `SIM_KILL_RADIUS * COVER_KILL_RADIUS_SCALE` as the recycle bubble so the seed volume
and the kill/near-cull shell agree. `COVER_SEED_SCALE` is now unused for this path (left
imported, harmless) since the ball is generated fresh at the right radius directly. Mesh
cloud is unaffected (not in the scene during cover at all — only trail + flowDots are
visible on the cover page).

Previously (2026-08-16): **Cover-page particles stuck sparse — real culprit found.**
Screenshot evidence: cover page showed only a handful of faint dots/one trail streak,

rest of the view empty, well after the intended 2s fade-in should have completed. Root
cause: the per-particle "reveal instant" spread (`revealHash(id) * uSpawnRampTime`, used
by trail/flowDots/mesh shaders to stagger individual particles' pop-in across the ramp)
was hard-coded at construction time to `TRANSITION_SPAWN_RAMP_TIME` (10s — the real
cover→game gameplay ramp's duration) and NEVER updated to match the much shorter
`coverFadeInDuration` (`INITIAL_LOAD_FADE_TIME` = 2s on first load, `COVER_FADEOUT_TIME`
on loop-back) that actually drives `spawnElapsed` on the cover page. Result: by the time
`spawnFrac` reaches 1 (2s in) and the ramp is presumed "done", `spawnElapsed` has only
reached 2 of the particles' individually-assigned 0–10s reveal thresholds — so only
~20% of the population had crossed their own reveal instant, and the rest just sat
invisible indefinitely (since nothing ever advanced `uSpawnRampTime` down to match, later
real elapsed time would eventually reveal the rest after the full stale 10s, but that's
far longer than intended and reads as permanently sparse in the interim). This was the
actual "cover particle visibility absent" bug — the earlier `behindFrac`/near-cull fixes
this session were real fixes too, just not the dominant cause of what the user was
literally seeing.
Fix: added a `spawnRampTime` getter/setter to both `GPUTrails` and `FlowDots` (mirroring
`spawnFrac`/`spawnElapsed`'s pattern). Set `trail.spawnRampTime = flowDots.spawnRampTime =
coverFadeInDuration`'s value at both places that actually start a cover ramp
(`maybeStartInitialCoverFadeIn()` → `INITIAL_LOAD_FADE_TIME`, `loopBackToCover()` →
`COVER_FADEOUT_TIME`), and restored to `TRANSITION_SPAWN_RAMP_TIME` (also the mesh
cloud's `u.uSpawnRampTime` uniform, for symmetry) at the real gameplay ramp's start in
`applyBaseShape`'s `reframe && appPhase === 'transitioning'` branch. Lesson: any
"stagger/spread" uniform whose timescale is copied from one ramp's duration must be
explicitly re-set whenever a *different* ramp (different duration) reuses the same
underlying reveal/fade uniforms — the mismatch doesn't error, it just silently changes
the effective completion time, which is much harder to spot than a hard crash.

Previously (2026-07-25): **Cover-page trail/flowDots hemisphere-asymmetry fix.**
Bug: cover page showed trails on only ~one side, empty on the opposite ~180°. Root cause: the
forward-biased respawn/fade system (`uCamFwd`/`uBehindFrac`/`CLOUD_BEHIND_FRAC=0.35`) — designed to
prevent a "gap ahead" while flying FORWARD during gameplay — was running unconditionally on cover
too. But the cover camera (`orbitControls.js`) only ROTATES in place, never translates, so the
permanently-shrunk "behind camera" hemisphere just continuously followed wherever the player looked,
reading as a static one-sided dead zone. Same root-cause pattern as the earlier near-cull/kill-radius
mismatch bug: a gameplay-forward-motion-specific uniform left active in a context (in-place rotation)
where its rationale doesn't apply.
Fix: added `behindFrac` getter/setter to both `GPUTrails` and `FlowDots` (sets both `sim.mat` and
`material` uniforms explicitly — unlike `killRadius`, `uBehindFrac` isn't auto-synced sim→material
each frame). Forced `trail.behindFrac = flowDots.behindFrac = 1.0` (fully symmetric, no bias) in all
three cover-related call sites in `main.js`: the initial cover setup, `loopBackToCover()`, and
restored to `CLOUD_BEHIND_FRAC` in the transition-finish block once the screen goes black and real
gameplay begins. Lesson: any uniform/behavior reasoned around "forward motion" should be explicitly
gated/reset per `appPhase`, not left at its gameplay default.

Previously (2026-07-25): **Cover-page attract-mode → gameplay transition, fully polished** (§5o).
Long session chasing down the whole cover→black→BG-fade→spawn-ramp→game handoff until it read
seamless. **User: "finally looking good now."** Chain of fixes, each one uncovering the next:
- Stray-particle leak during the black hold → hard `step()` gate on `uSpawnFrac`.
- FrozenDust popping in early → opacity now rides the BG fade.
- Cover-page FPS drop → traced to CSS blur cost + full-rate sim ticking of a pre-warmed-but-invisible
  mesh cloud. First pass cut `COVER_PIXEL_RATIO_MUL`/added `COVER_SIM_TICK_DIV`; then reverted the
  pixel-ratio cut in favor of the bigger win — deferring `scene.add()` of the mesh cloud until the
  black-screen hold instead of pre-warming during cover (restored full blur, bumped
  `COVER_FADEOUT_TIME` 1.0→2.5s).
- Whole-scene fade-in from black on entering gameplay: new `uGlobalFadeIn` uniform (mesh) + trail/
  flowDots opacity, all driven by the same `bgT` clock as BG/haze/orbs (10s).
- "Particles spawning all at once" — root cause was `spawnFade`'s reveal-window math coupling
  population-growth-rate to individual fade-duration. First attempt (widen the window) made it
  worse. Real fix: fully decouple via real-seconds `uSpawnElapsed`/`uSpawnRampTime`(10s)/
  `uSpawnFadeDur`(1.5s) — population grows linearly over 10s, each particle still fades in over a
  fixed 1.5s regardless of when it spawns.
- Found a real bug while sanity-checking `SIM_MAX_LIFE=6s` vs the 10s ramp: particles were aging out
  and respawning mid-ramp, breaking the "growing population" illusion. Fixed with a `maxLife`
  getter/setter + `SPAWN_RAMP_MAX_LIFE=9999` suspended during the ramp.
- Restoring `uMaxLife` back to 6s too abruptly then caused a mass-simultaneous-respawn "jump" at the
  10s mark (many particles' accumulated age already over the real cap). Fixed with a gradual lerp,
  `TRANSITION_LIFE_EASE_TIME=6.0s`.
- "Flowing backwards" glitch: `bakeVolume()` is async (Web Worker), but new seed positions apply
  synchronously — for a few frames before the new bake lands, particles sat at new-shape positions
  advected by the STALE old-shape velocity field. Fixed via `pendingBakeJobId` freezing
  `effectiveFlowSpeed=0` while a bake is pending.
- That still left visible-but-frozen particles as a glitch, so upgraded to fully HIDE via a new
  `uFlowReady` uniform (mesh/trail/flowDots) instead of just freezing.
- Last bug: hiding via `uFlowReady` let the spawn-ramp clock keep ticking while hidden, so a backlog
  of already-faded particles popped in together once revealed. Fixed with a `spawnRampElapsed`
  accumulator that only advances on frames where the flow is actually ready.
- **Lesson (recurred twice this session):** whenever an async/deferred system (worker bake, hidden
  state) gates what's visible, the driving *clock* must be paused by that same readiness condition,
  not just the rendered output — otherwise you get a "backlog pop" once revealed.

**Project health pass (same session):** file-size survey of `src/**/*.js` — top 5 by line count:
`gpuTrails.js` (1122), `main.js` (1041), `config.js` (843), `tuningPanel.js` (581),
`createQuantumCloud.js` (479). Findings:
- `gpuTrails.js` — ~40% of the file is inline GLSL template strings (`BURST_FRAG`, `ADVANCE_FRAG`,
  `RECORD_FRAG`, `RIBBON_VERT`, `RIBBON_FRAG`). Good split candidate: move shader strings to their
  own module(s), leaving the `GPUTrails` class/logic on its own.
- `main.js` — has grown into the central orchestrator for camera, sim, transition choreography, audio,
  BG, and UI wiring all in one file/animate loop. Candidate to split transition-phase logic
  (cover/transitioning/game state machine + all the ramp/ease constants) into its own module.
- `config.js` — large but a flat, well-commented constants file; probably fine as-is, though could be
  split into logical groups (core sim / cover+transition / audio) if it keeps growing.
- **Redundancy flagged:** the reveal/spawn-fade GLSL pattern (`uSpawnElapsed`/`uSpawnRampTime`/
  `uSpawnFadeDur`/`uFlowReady`) is duplicated near-identically in three places (`shaders.js`,
  `flowDots.js`, `gpuTrails.js`) — a shared GLSL snippet/include would remove the triplication.

**Backlog — next up (not started):**
1. Paint interaction adjustment: more clicks should register, cluster click threshold lower.
   Relevant knobs already live in `config.js`: `PICK_PIXEL_RADIUS=24`, `PICK_CLUSTER_RADIUS=0.5`,
   `PICK_CLUSTER_MIN=2`, `PICK_LENS_GUARD=0.4` (used by `src/interaction/particlePick.js`, a
   cluster-based — not depth-based — picker). Likely just needs `PICK_CLUSTER_MIN` lowered further
   and/or `PICK_PIXEL_RADIUS` widened again.
2. Cover page should slowly rotate. `src/camera/orbitControls.js` already auto-drifts yaw via
   `COVER_ORBIT_SPEED=0.06` rad/sec when idle (killed the moment the user drags) — likely just needs
   this constant increased, or drift re-enabled even after a drag, depending on what "slowly rotate"
   should feel like.

Prior (2026-07-24): **Particle rotation + sudden-disappear fixes** (§5n). Per-particle roll +
slow spin about the flow axis (killed the world-up lockstep + pole snap); death-fade so particles
ease out over the last `SIM_DEATH_TIME` instead of popping mid-view (sim stores per-particle `life`
in `cell.w`); low-speed **heading hold** stops the orientation shivering in stagnation zones. New live
`spin rate` slider. **User: "very nice."** **Next: audio animation system (§6b) — user deferred, talk later.**
Prior (2026-07-22): **Combined particle size model** — random power-law grain × structural
streamline taper × expressive mood breathing, + per-model size classes baked into each GLB (§5m).
**User: "looks great."** Default count dropped 40k→28k (bigger particles fill more space).
Earlier queue (mostly done): (1) ✅ particle rotation, (2) ✅ sudden-disappear, (3) particle-mesh
libraries, (4) more optimization talk. See §6d. Prior (2026-07-21): **Custom GLB particle models** — cubes
replaced by 4 low-poly vertex-colored triangle GLBs, randomly assigned per particle, rendered as a
Group of instanced meshes sharing one material (§5l). Prior (2026-07-19d): **mood-driven flow speed**
(§5k, wide [0.06,0.95] band).
**Next: (1) verify the GLB models look right + tune, (2) audio-reactivity system.**
Prior (2026-07-19b): **Cloud-shape legibility fix — dominance weighting + texture/bpm flow.**
Combining many high params used to go "sparse noise": (a) fixed budget split thin across all active
fields, (b) equal curl superposition decohered the flow into mush, (c) texture & bpm had NO flow
(only warp + seeds). Fixed with **Lever 1** (dominance weighting: `wᵢ = paramᵢ^FIELD_DOMINANCE` drives
BOTH flow direction — direction-normalized so weight, not finite-diff magnitude, wins — AND the
particle budget) + **Lever 2** (gave texture & bpm curl-noise flows along their isosurfaces). Live
`dominance` slider (1–5) in the tuning panel; **user picked 4.0, now the baked default.** See §5i.
**Resume next session (user's stated order):** (1) ✅ mood tester (§5g); (2) ✅ cloud-shape tuning
(§5i); (3) **audio animation system** (§6b) — NEXT. Also open: refine Step 4 feel, base-cloud
shaping from audio (§6b option 1), tune texture/bpm secondary-noise freq if needed. Trails/mesh
particles remain notes-only.

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
- `debug/tuningPanel.js` — live harness (top-left): FPS/ms, sliders for kill radius / point size / tile period / jitter / scale max, **+ bloom-shape section: a `mood-driven (click)` checkbox (default ON — disables the manual controls), `dominant` / `blend partner` archetype dropdowns, `blend amt`, and `outward` / `shape amt` / `field freq` / `detail` / `shell` sliders (all now edit `bloomField.shape` → NEW blooms only), and a `last:` readout of the most-recent bloom's shape**, plus count presets (20K/40K/60K/100K, reload via `?count`). Takes `bloomField` as a 3rd arg (created after it in `main.js`).
- `interaction/particlePick.js` — **NEW** GPU-accurate click picking. Reads the sim state texture back (`particleSim.readPositions()`), projects every live particle, selects the **frontmost within ~16px** of the cursor (the one you see). Drops a red marker + fires `onPick`. Distinguishes click vs. steer-drag by a 6px tolerance.
- `interaction/bloomField.js` — persistent, world-anchored store of click-paint "blooms". Never-trimmed CPU array; each bloom **snapshots the full shape on `add()`** — archetypes `{archA, archB, blendAB}` **+ the five modulators** `{outward, shapeAmt, fieldFreq, detail, shell}`. Source: if `moodDriven` (default true) → `moodToBloomShape(getMood())` (mood → shape, Phase 3); else → `this.shape` (manual panel). `getMood` is set by `main.js` (→ live `currentMood`); `lastShape` feeds the panel readout. `syncUniforms()` windows the nearest `BLOOM_MAX_ACTIVE` to the camera, applies the envelopes, and packs **four** uniform arrays: `uBloomA`=(center,radius), `uBloomB`=(burstMag, seed, shapeWeight, **shell**), `uBloomC`=(archA, archB, blendAB, **openness**), `uBloomD`=(**outward, shapeAmt, fieldFreq, detail**). Envelopes: `outwardEnvelope` (burst, decays to 0), `curlEnvelope` (shape weight, ramps + persists), `bloomRadius` (ink spread), `openEnvelope` (0→1 over `BLOOM_OPEN_TIME` — used by smoke ring to grow its ring).
- `particles/`
  - `createQuantumCloud.js` — builds the InstancedMesh + material/uniforms; exposes `mesh.userData.seedPositions` (shape-local seed points).
  - `shaders.js` — GLSL3 render shaders. Reads sim state + **cell** textures; orients each cube through its instance's transform (see instancing below). NOTE: render orientation does **not** yet include paint (Phase-1 decision — positions move via the sim; optional polish to add paint to orientation).
  - `particleSim.js` — GPGPU advection. MRT ping-pong of two float textures: `[0]` state (xyz pos, w age), `[1]` cell (xyz lattice index). Advects each particle via `paintApply(pos, instSampleVel(pos,cell)*uFlowSpeed)` — the base field first, then **redirected through any active blooms + their transient burst**; staggered lifetime; camera-relative respawn. Has `readPositions()` (MRT readback for picking) + the `uBloomA/B/C/D` uniform arrays. (The old global `uPaint*` uniforms were **removed** — modulators are per-bloom now.)
  - `instanceTransform.glsl.js` — shared GLSL snippet (injected into both sim + render) implementing the per-cell transform (see §3).
  - `paintField.glsl.js` — shared GLSL for the blooms. `paintApply(p, baseVel)` loops the active blooms and, per bloom, reads its **per-bloom modulators** (`uBloomD` = outward/shapeAmt/fieldFreq/detail, `uBloomB.w` = shell) and evaluates its **shape archetype** (dominant + blend partner, `top-2` chosen on CPU) via `archetypeDir(idx, r, t, openness, seed, freq, detail, → pres, steer)`. Two effects: (1) **SHAPE** — steer `baseVel` toward the archetype direction at the **same speed** (presence-weighted, clamped so overlaps don't stack speed) → persistent shape, no runaway acceleration; (2) **BURST** — a transient shaped impulse (outward, masked by presence + a small floor, plus the archetype direction) that fully decays. Archetypes: `archCurl` (turbulent), `archVortex` (whirlpool), `archLightning` (domain-warped ridged veins, non-radial jagged bolts; steers broadly), `archTorus` (smoke ring — poloidal roll + axial drift), `archCells` (Worley). Declares `uBloomA/B/C/D`. **Watch: no backticks in comments here** (they close the JS template literal — bit us 3× today).
  - `velocityBaker.worker.js` — bakes the combined mood field into a `SIM_VOL_RES³` volume off-thread.
  - `fields/` — one module per mood param + `shared.js` + `combine.js` (`buildFieldBundle`, `combinedVelocity`, `sampleAll6Cloud`; "Dominant Warp + Full Superposition").
- `audio/`
  - `audioPrecompute.js` — offline FFT over the whole track → per-frame band arrays + beat timestamps + mood fingerprint. `getAudioData()` plays it back by time index (no live FFT). **Step 4:** retains the full `analysed` object and exposes `getTime()` + `getWindowedMood(windowSec=MOOD_WINDOW_SEC)` (live mood-of-the-moment from the current playhead).
  - `audioMoodAnalyze.js` — refactored to a shared `fingerprintFromRange(data, s, e, bpm)` core. `computeMoodFingerprint()` = whole track (one-shot, drives base cloud). **`computeWindowedMood(data, tSec, windowSec, trackBpm)` (Step 4)** = same math over a trailing ~`windowSec` frame window; local BPM from beats in a wider window, else track BPM.
  - `moodToBloomShape.js` — **Phase 3 + this session's tuning.** Pure `mood → {archA, archB, blendAB, outward, shapeAmt, fieldFreq, detail, shell, radiusScale, strengthScale}`. Scores all five archetypes, picks top-2, blend from score ratio. **NEW:** `radiusScale`/`strengthScale` (multipliers on `BLOOM_RADIUS`/`BLOOM_STRENGTH`) ride `intensity = 0.65·energy + 0.20·tempoT + 0.15·heaviness`. Modulator floors raised (see §6a). Read at click time by `bloomField.add()`.
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
  - **Bloom modulators (now PER-BLOOM; config values are just the defaults / manual-mode values):** `PAINT_OUTWARD = 1.0` (burst pop), `PAINT_CURL = 1.0` (shape/redirect weight → `shapeAmt`), `PAINT_CURL_FREQ = 1.6` (field scale → `fieldFreq`), `PAINT_DETAIL = 0.4` (sharpness), `PAINT_SHELL = 0.2` (burst profile). When `moodDriven`, these are overridden per-click by `moodToBloomShape`.
  - **Bloom archetype (per-bloom selection):** `PAINT_ARCHETYPES = ['Curl','Vortex','Lightning','Smoke Ring','Cells']`, defaults `PAINT_ARCH_A = 0` (dominant), `PAINT_ARCH_B = 1` (partner), `PAINT_BLEND = 0.35` (partner weight, capped ~0.5).
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

## 5d. Pick-paint Phase 3 (mood → bloom) — DONE ✅

Mood now drives the click blooms. Built in three steps (all verified in-browser):

1. **Step 1 — `moodToBloomShape.js`** (pure, standalone). `mood → {archA, archB, blendAB,
   outward, shapeAmt, fieldFreq, detail, shell}`. Every archetype gets a mood-derived score;
   **top-2** become dominant + partner, blend from the score ratio (cap 0.5). Modulators are
   `lerp`s of individual params (see §6a for the mapping table). All five archetypes are
   reachable as dominant.
2. **Step 2 — modulators went PER-BLOOM.** Dropped the five global `uPaint*` uniforms; added
   `uBloomD` (outward, shapeAmt, fieldFreq, detail) + reused `uBloomB.w` (shell). `archetypeDir`
   now takes `freq`/`detail` as args. `bloomField.shape` carries all 8 fields; snapshotted per
   click. Tuning-panel sliders repointed at `bloomField.shape` (affect NEW blooms only).
3. **Step 3 — wired mood in.** `bloomField.add()` uses `moodToBloomShape(getMood())` when
   `moodDriven` (default on), else the manual `shape`. `main.js` keeps a live `currentMood`
   (updated immediately on every mood-panel change; base-cloud rebake stays debounced) and sets
   `bloomField.getMood`. Panel gained a **mood-driven checkbox** (disables manual controls) + a
   **`last:` readout**. Verified: Anxious → `Cells+Lightning` (det .89, out 1.63); toggle off →
   manual `Curl+Vortex` defaults.

Key architectural win: because a bloom is analytic and reads mood **once at click**, driving it
from a time-varying mood later costs **nothing extra** on the GPU (no re-bake). See §6b.

## 5e. Time-varying mood (Step 4) — IN, needs refinement 🟡

Blooms now react to the **live "mood of the moment"** while audio plays. Mechanism (all CPU,
no GPU work, base cloud untouched):
1. `computeWindowedMood()` (`audioMoodAnalyze.js`) — shares `fingerprintFromRange()` with the
   whole-track fingerprint; averages the same per-frame features over the last `MOOD_WINDOW_SEC`
   (3.0 s) ending at the playhead. Local BPM from beats in a ±2× window, else track BPM.
2. `analyser.getWindowedMood()` (`audioPrecompute.js`) — reads the live playhead; the per-frame
   arrays are retained for it. Cheap (a few array means per call).
3. `main.js` — while `audioAnalyser` exists, `currentMood` eases toward the windowed mood at
   ~10 Hz with an EMA (`MOOD_SMOOTH = 0.90`, ≈1 s time-constant). Blooms read `currentMood` at
   click → quiet verse = small/soft, drop = big/hard (uses the radius/strength levers from §6a #1).
- **Audio playback re-enabled** (was off during the rebuild): first `pointerdown` on the canvas
  calls `startAudio()` (browser autoplay needs the gesture; that click also drops the first bloom).
  The "click anywhere to start audio" hint is shown again until audio loads.
- **Scope kept tight:** only blooms react. `audioAnalyser.mood` (whole-track) is still **unused** —
  the base cloud stays on its static 0.5-mood bake (no re-bake). Base-cloud shaping from audio is
  §6b option 1, still open.
- **Debug interaction:** while audio plays it overrides the mood panel for blooms (intended). Before
  the user clicks to start audio, the panel presets drive blooms exactly as before. New **live mood
  readout** (`mood e.. b.. t.. h.. d.. ..bpm`) at the top of the tuning panel updates every frame.
- Config: `MOOD_WINDOW_SEC = 3.0`, `MOOD_SMOOTH = 0.90`.
- **Not perfect yet (resume here):** tune window length / smoothing / intensity high-ends so the
  contrast between sections reads well; confirm it feels tied to the music.

## 5f. Mood-source fix — manual panel beats audio — DONE ✅ (2026-07-17)

**Symptom:** selecting a bloom-shape preset (e.g. "Airy · smoke ring") and clicking still produced
Curl+Cells / Curl+Vortex blooms — the preset never seemed to apply.

**Root cause (NOT the scoring algorithm — that checks out):** the first canvas click starts audio
(`startAudio`, `{once:true}`). From then on the animate loop eases `currentMood` toward the live
windowed mood **every 100 ms** (§5e). So a preset set `currentMood = mood` once (line ~230) and the
audio loop stomped it back within a frame → blooms read the track's moment-mood, not the preset. The
design comment even declared audio the priority source — backwards for per-preset bloom testing.
(Verified by hand: "Airy · smoke ring" scores Smoke Ring dominant ~1.0 vs Vortex ~0.55 — selection
was fine; the mood just wasn't the preset.)

**Fix (`main.js`):** added `let audioDrivesMood = true;`. The mood-panel `onChange` sets it `false`
(manual takeover), and the animate-loop windowed-mood block is gated on `if (audioAnalyser &&
audioDrivesMood)`. So: touch the panel → mood pins to the panel value, audio stops overwriting;
don't touch it → audio drives as before; reload to return control to audio. Confirmed presets now
stick and the readout shows the expected dominant archetype. **User: "works like a charm."**

**Still-open algorithm notes (deferred — not blocking; surfaced during this debug):** even with the
correct dominant, *sparse* archetypes (Lightning veins, Smoke Ring tube — `pres < 1`, only particles
on the structure show the shape) get visually drowned by the always-on ≥10% *space-filling* partner
(Curl/Vortex fill every particle). Levers when we return to it: (a) fill-aware blending + lower
min-blend so a sparse dominant isn't diluted; (b) thicken Lightning veins / Smoke Ring tube + raise
their steer in `paintField.glsl.js`; (c) trim Curl's `0.30` score floor + Vortex's calm baseline so
they stop hogging the partner slot.

## 5g. Auto-random mood tester + audio off — DONE ✅ (2026-07-19)

**Problem:** only one audio track, and it's mood-biased → can't see how mood-varying click-blooms
look at the weak vs strong ends (or across archetypes). User didn't want to hand-crank 6 sliders.

**Built:** a hands-free **auto-random mood driver** (all CPU, blooms-only, no rebake). Toggle
`auto mood (random)` at the top of the tuning panel. When on:
- Every `AUTO_MOOD_INTERVAL` (4.0 s, jittered ×0.7–1.3) it picks a fresh **random** mood, run
  through `contrastMood` so it lands near the extremes (distinct archetypes + clear weak/strong,
  not muddy mids) — same treatment presets get.
- Eases `currentMood` toward that target at ~10 Hz with the same EMA (`MOOD_SMOOTH = 0.90`) the
  audio path uses → smooth wander. Reuses the existing throttled mood block in `animate()`.
- Mirrors the live value onto the **6 mood-panel sliders** (new `moodDebugPanel.setDisplay()` —
  updates slider positions + labels **without** firing `onChange`, so no base-cloud rebake) and the
  tuning-panel `mood …` readout. Each click samples `currentMood` at that instant.

**Source priority in `animate()`:** `moodAuto.enabled` → else `audioAnalyser && audioDrivesMood`.
`auto mood` owns the mood while on; untick to use presets/sliders. Base cloud stays static (this is
a bloom tester; base-cloud shaping is §6b option 1).

**Audio disabled for now:** `AUDIO_ENABLED = false` in `main.js` gates both the click-to-start
`pointerdown` listener and the audio hint — so the biased track can't drag the mood around during
testing. **Reversible:** flip the one flag back to `true` to restore autoplay + live audio mood.

Files: `main.js` (flag, `moodAuto` state + `randomMoodTarget()`, animate block, passes `moodAuto`
to the tuning panel, captures `moodPanel`), `debug/tuningPanel.js` (6th arg `moodAuto` + checkbox),
`debug/moodDebugPanel.js` (`setDisplay()` + returned).

**Open tuning (user may want):** pacing (`AUTO_MOOD_INTERVAL`) and whether to *dwell/snap* on each
extreme vs. continuous easing (with `MOOD_SMOOTH = 0.90` some clicks catch mid-transition values).
Not throwaway — this weak/strong calibration is the anchor we'll reuse for the audio→mood mapping.

## 5l. Custom GLB particle models (cubes → triangles) — DONE ✅ (2026-07-21)

Replaced the instanced cube with the user's 4 low-poly GLB models (`triangle_01..04.glb`, vertex
colors, <100 tris each), randomly assigned per particle.

**Key enabler:** the render shader derives each particle's POSITION entirely from the GPGPU sim
texture and its ORIENTATION from the live flow — it never used `instanceMatrix` or `aNormal`. So the
geometry is free to change; we just needed multiple geometries + a per-instance sim lookup.

**Architecture — Group of instanced meshes sharing ONE material:**
- The cloud is now a `THREE.Group` (`createQuantumCloud` returns it) with attached `.material`
  (shared), `.count`, `userData.seedPositions/phases/sizes`. Box mode = 1 child mesh; model mode = one
  child InstancedMesh per GLB, each rendering a random subset of particles. All children share the one
  ShaderMaterial, so the existing single-uniform-write animate loop drives them all unchanged.
- `gl_InstanceID` → new **`aParticleId`** attribute (global index), because instances are now split
  across meshes; the shader uses it for the sim-texture UV. `aPhase`/`aSize` are sliced per mesh by
  the particle ids it owns; `aNormal` dropped (was dead). The dead `setMatrixAt` loops are gone.
- Vertex color: shader reads a `color` attribute → `vColor`, used as albedo in the fragment
  (`vColor * lightColor * (ambient+diffuse) * bright + spec`). Box fallback gets white vertex color so
  both paths share the shader.

**Files:** `particleModels.js` (new — `loadParticleGeometries(srcs)` via GLTFLoader; bakes each node's
world transform, ensures color/normal, logs tris/size/hasColor). `createQuantumCloud.js` rewritten
(Group + shared material via `buildMaterial`, `buildInstancedMesh`, `setCloudGeometries` for the swap,
`resampleAll6` scatters attrs across children). `shaders.js` (aParticleId + vertex color). `config.js`
`USE_MODEL=true` + `MODEL_SRCS[4]`. `main.js` async `loadParticleGeometries().then(setCloudGeometries)`
after cloud creation (cubes show until the GLBs load; falls back to cubes on load error).

**Couldn't verify via build/HMR** (shell hung all session; no browser tab connected so no HMR log) —
reviewed manually. **Needs the user to reload + eyeball.** Watch for: (1) files actually present in
public/models/; (2) Draco-compressed GLBs would need DRACOLoader (falls back to cubes + console warn);
(3) vertex-color color-space may need a tweak (renderer.outputColorSpace) if colors look off; (4) if
the 4 models differ a lot in authored size, particles will look uneven — can normalize in the loader.

## 5n. Particle rotation + sudden-disappear fixes — DONE ✅ (2026-07-24)

Two issues surfaced once the meshes were big flat triangles (cubes hid both). All render/sim-shader
changes; hot-reloaded clean. **User: "very nice."**

**A. Sudden disappear (particles popping out mid-view).** Root cause: `particleSim.js` had two death
paths but only one faded. **Distance death** (crosses `uKillRadius`) was covered by the render
`farFade`; **lifetime death** (`age > life`, `life = SIM_MAX_LIFE ± jitter ≈ 5.2–6.8s`) teleported the
particle instantly with `age=0` — so a fully-opaque particle blinked out every ~6s (×28k staggered =
constant sprinkle of pops). Birth was faded, age-out wasn't → asymmetry.
- Fix: the sim now writes each particle's deterministic jittered `life` into the **previously-unused
  `cell.w`** channel (both the reset and step paths; `outCell = vec4(cell, life)`). The render shader
  reads it and multiplies a **death fade** into `vFade`: `death = life>0.001 ? 1 - smoothstep(life -
  uDeathTime, life, age) : 1`. So particles ease out over their last `SIM_DEATH_TIME` and are invisible
  when they teleport. Birth/death/distance fades are now all symmetric. Config `SIM_DEATH_TIME = 0.6`.

**B. Rotation.** User picked (of 4 options) **flow-aligned + per-particle roll + slow spin + kill the
snap**. The old orientation (`shaders.js`) built the perpendicular basis from a **fixed world-up** with
a hard `abs(flow.y) < 0.99 ? Y : X` branch → (1) synchronized 90° **pole snap** near vertical flow, (2)
**lockstep** (every particle shared the same up → iron-filings alignment, no variety).
- Fix: basis now built from a **fixed per-particle reference axis** (hashed from `simUV` via
  `instHash33`), so each mesh has its own roll and the gimbal singularity is per-particle/uncorrelated
  (no mass snap). Added a per-particle **roll phase + slow spin** about the flow axis (`uTime *
  uSpinRate`, scaled per particle, phase `mod`-wrapped to keep trig precise over long sessions). New
  live `spin rate` slider (0–2, default `PARTICLE_SPIN_RATE = 0.35`; 0 = varied static roll, no turning).

**C. Shiver/jitter (follow-up in same session).** After B, user saw meshes "shiver." Diagnosed as
**orientation instability**, two sources: (1 main) **stagnation wander** — the baked field has many
low-speed spots where `normalize(vel)` has no well-defined direction, so a creeping particle's forward
axis flipped frame-to-frame; (2) the per-particle **gimbal swing** when flow sweeps near a particle's
`ref`.
- Fix: for orientation only, blend the forward axis toward a **steady per-particle heading** (`pdir`,
  its own hash, independent of `ref`) when local speed is low: `flow = normalize(mix(pdir, vel,
  smoothstep(0.0, 0.15, speed)))`. In slow regions the mesh holds still; in fast flow it points fully
  downstream. **Display only — the sim advects on its own `instSampleVel * uFlowSpeed`, motion
  unchanged.** Also wrapped the spin phase (`mod 2π`) for long-session trig stability. User confirmed.
- **Open if it recurs:** raise the `0.15` low-speed threshold; damp spin near the gimbal; or add
  per-particle temporal coherence (store a heading/roll ref in a sim channel) — heavier, deferred.

**Aside (raised, not a bug):** user first thought particles "collide." There is **no collision system** —
it's cross-stream **interpenetration**: the shape tiles overlap heavily (`SIM_INST_PERIOD ≈ 3.5` vs shape
span ≈ 8 → ~10 overlapping tiled fields per point, each rotated/mirrored), so particles bound to different
cells cross paths. Cosmetic; levers if ever wanted: raise `tile period` (risk gaps), smaller `point size` /
more transparency, lower `spin rate`.

**Files:** `config.js` (`SIM_DEATH_TIME`, `PARTICLE_SPIN_RATE`), `particles/particleSim.js` (life →
`cell.w`, reset + step), `particles/shaders.js` (per-particle frame + roll/spin + heading-hold + death
fade; new uniforms `uDeathTime`, `uSpinRate`; read `life` from `cell.w`), `particles/createQuantumCloud.js`
(uniform defaults), `debug/tuningPanel.js` (`spin rate` slider).

## 5m. Combined particle size model (structural + expressive + random + per-model) — DONE ✅ (2026-07-22)

Replaced the flat random size band (`aSize ∈ [0.45,0.80]` used directly) with one unified size
model evaluated in the **vertex shader** (`shaders.js`), plus per-model size classes baked into the
GLBs. **User confirmed "looks great."**

**Shader formula:**
`size = max(grain × taper, uSizeFloor) × uSizeMoodScale × treble × CUBE_SCALE × uPointSize`
- **grain (RANDOM):** `uSizeMin + uSizeRange · pow(aSize, uSizePow)`. `aSize` is now a **raw [0,1]
  random** (combine.js just writes `Math.random()` — dropped the `PARTICLE_SIZE_MIN/RANGE` band from
  the sampler). `uSizePow > 1` = power-law → mostly small grains with a few big ones (more variety
  than a flat band). Config: `PARTICLE_SIZE_MIN 0.30`, `PARTICLE_SIZE_MAX 1.55`, `PARTICLE_SIZE_POW 2.2`.
- **taper (STRUCTURAL):** `mix(1, uTipScale, aPhase)` — thick at the streamline root (phase 0),
  thin at the tip (phase 1). Replaces the old fixed `1 − 0.30·aPhase`. Config `PARTICLE_TIP_SCALE 0.40`.
- **moodScale (EXPRESSIVE):** `uSizeMoodScale`, written every frame in `main.js` from
  `moodToSize(currentMood)` (new `audio/moodToSize.js`, mirrors `moodToFlowSpeed`): heavy → chunkier,
  bright → finer, `1.0` at neutral, clamped `[0.6,1.7]`. Free uniform write (no re-sample), eased mood.
- `uSizeFloor 0.12` = anti-vanish clamp so tips never disappear.

**Per-model size classes:** `MODEL_SCALES = [2.6, 1.95, 1.4, 1.0]` in `config.js` (one per
`MODEL_SRCS`, order = triangle_01→04). Baked into each GLB's geometry at load via `geom.scale()` in
`buildInstancedMesh` (uniform scale → normals stay valid). Amplifies the **contrast** between the
authored large→small triangles (bigger factor on the already-bigger model) and lifts overall size;
index 3 (triangle_04, smallest) stays at `1.0` = the user's stated minimum-acceptable size. This
stacks on top of the shader grain/taper/mood. Bump the array to exaggerate the size classes.

**Count:** since particles are bigger, `CLOUD_COUNT` dropped **40000 → 28000** (bigger particles fill
more space per particle + cheaper to render). Still overridable via the panel presets / `?count`.

**Panel:** new "particle size" section in `tuningPanel.js` — `size min` / `size max` (band, recompute
range), `size power`, `tip scale`, all live (write the uniforms directly). Mood adds the overall
multiplier on top, so sliders set the base look and the mood breathes around it.

**Files:** `config.js` (size consts + `MODEL_SCALES` + count), `particles/shaders.js` (new size math +
6 uniforms: `uSizeMin/Range/Pow/TipScale/Floor/MoodScale`), `particles/createQuantumCloud.js` (uniform
defaults + `scale` param baked in `buildInstancedMesh`, applied per-model in `setCloudGeometries`),
`particles/fields/combine.js` (`aSize` → raw `Math.random()`, dropped size imports), `audio/moodToSize.js`
(new), `main.js` (per-frame `u.uSizeMoodScale`), `debug/tuningPanel.js` (size sliders).

**Deliberate scope note:** mood drives **overall** size only right now. Wiring `texture`/`dynamism` →
size **variance** (mood-driven `uSizePow`) is a clean follow-up (would need the state-object pattern —
like `flowSpeed` — so slider + mood don't both write the uniform). Offered; not yet requested.

## 5k. Mood-driven flow speed — DONE ✅ (2026-07-19)

The advection speed now tracks the live mood, so the whole cloud drifts slowly in calm sections
and rushes in intense ones — both directions, per user ("flow should be able to go slow and fast").

**Mechanism (why it's cheap):** the sim shader already scales the peak-normalised velocity volume by
a single scalar `uFlowSpeed` (`particleSim.js`: `instSampleVel(...) * uFlowSpeed`). So speed is a
**free live knob** — a per-frame uniform write, NO velocity re-bake (unlike shape). Drive it from the
LIVE `currentMood` (not the baked `baseMood`): during the auto-tester / audio the shape stays baked
but the speed breathes. `currentMood` is already EMA-smoothed, so the speed eases, never jumps.

**Mapping** (`audio/moodToFlowSpeed.js`, pure, mirrors moodToBloomShape's `tempoT`=(bpm-60)/120):
`speedNorm = clamp(0.55·energy + 0.30·tempoT + 0.15·dynamism − 0.25·heaviness, 0, 1)`. energy is the
primary driver, tempo IS speed, dynamism adds urgency, heaviness DAMPS (heavy/sludgy reads slower).
main.js lerps into `[FLOW_SPEED_MIN, FLOW_SPEED_MAX]` = `[0.06, 0.95]` (config) each frame and writes
`particleSim.mat.uniforms.uFlowSpeed`. All-mid mood → ~0.39 (≈ the old static 0.35 feel); calm+heavy
floors ~0.06, energetic+fast+light saturates ~0.95.

**Wiring:** `config.js` FLOW_SPEED_MIN/MAX (SIM_FLOW_SPEED kept as the pre-first-frame init). main.js
holds `flowSpeed = {min, max, current}` (mutable object, `.current` for the panel readout), updates it
in the animate loop right after the mood-source block. Tuning panel got `flow min` / `flow max`
sliders + a live `flow: <cur> [min–max]` readout (passed as the new 7th arg, before `onDominance`).

**Note:** at the extreme top end, faster flow = shorter on-screen particle life (they cross the kill
radius quicker → more respawns). Fine at 0.95; if pushed higher, bump `SIM_MAX_LIFE` / kill radius too.

## 5j. Codebase health pass — dead-code prune before audio/mesh work — DONE ✅ (2026-07-19)

Pre-flight cleanup before the audio-reactivity + GLB-mesh work, so neither builds on cruft.
Verified via the running dev server (HMR reloaded every edited file, zero transform errors).

**Deleted 6 orphan files** (~23 KB, nothing in the reachable graph imported them; `index.html`
loads only `main.js`):
- `particles/stoneField.js` — old ZONE force system → replaced by `interaction/bloomField.js`.
- `particles/flowFieldCore.js` — old CPU simplex `computeMorphedPositions` → replaced by the
  GPGPU sim (`particleSim.js`) + `fields/`.
- `interaction/picking.js` + `interaction/screenPickGrid.js` — old CPU picking → replaced by the
  GPU-readback picker `interaction/particlePick.js`.
- `interaction/forceDebugHUD.js` — unused debug HUD.
- `audio/moodToConfig.js` — old direct feature→config map → replaced by `fields/combine.js`
  (base cloud) + `audio/moodToBloomShape.js` (blooms).

**Removed dead render-shader uniforms** (`shaders.js` declared them but `main()` never read them;
JS only inited, never updated): the whole stone set (`uStoneStrength/Count/Stones/StoneSeeds` +
`MAX_STONES` #define), the old CPU-displacement set (`uNoiseScale`, `uDomainWarp`, `uFlowBias`,
`uOrbitStrength`, `uJitter`, `uShapeWeights`, `uShapeScale`), and never-wired audio placeholders
(`uAudioMids`, `uBeatPhase`, `uDisplacement`, and a dead **duplicate** `uFlowSpeed` — the LIVE one
is in the SIM shader `particleSim.js`). Matching uniform entries pruned from `createQuantumCloud.js`.
Kept: `uAudioTreble` (LIVE — treble→size pulse), `uTime` + `uReveal` (JS-wired each frame).

**Removed dead config constants** (`config.js`, defined but referenced nowhere): `ZONE_*` (7),
`STRAND_*` (6), `DEFAULT_PRESET`, `FLOW_SPEED`, `FLOW_DISPLACEMENT`, `FLOW_NOISE_SCALE`,
`DOMAIN_WARP`, `AUTO_ROTATE_SPEED`, `DISPLACEMENT_MARGIN`. Kept `SIM_FLOW_SPEED` + `CUBE_SCALE`
(both LIVE; fixed `CUBE_SCALE`'s stale "unused" comment). Fixed stale `moodToConfig` doc references
in `moodDebugPanel.js` + `audioMoodAnalyze.js`.

**File sizes — all healthy** (no god-files): main 415, audioPrecompute 394, combine 364,
paintField.glsl 306, tuningPanel 258, particleSim 254, particlePick 231, audioMoodAnalyze 166,
bloomField 164, createQuantumCloud 159.

**Audio-readiness confirmed:** `audioPrecompute.js` exposes `getAudioData()` (7 bands + legacy
mids/treble/volume aliases + `isBeat`), `getTime()`, `getWindowedMood()`, `mood`. The `animate`
loop has the wiring hook (TODO near the `renderer.render`): read `getAudioData()` → modulate the
SIM `uFlowSpeed` / beat pulse / `uAudioTreble` size. `AUDIO_ENABLED=false` gate + first-pointerdown
autoplay path are intact.

**Flagged (not changed — needs a decision):** `uReveal` is written every frame by the load/reshape
reveal ramp (`main.js`) but the shader never reads it → the reveal is currently a **no-op** (per-
particle `vFade` birth-fade superseded it). Either wire a global fade-in or delete the ramp. `uTime`
is also unread by the shader but kept — it's about to be used for GLB-mesh vertex animation.

## 5i. Cloud-shape legibility — dominance weighting + texture/bpm flow — DONE ✅ (2026-07-19)

**Diagnosis** (confirmed against the code, see §5h for the map): three stacking causes of "sparse
noise when several params are high":
1. **Budget dilution** — `sampleAll6Cloud` split the fixed particle budget *linearly* (`paramᵢ/Σ`),
   so N high params → each structure drawn at 1/N density → thin.
2. **Equal curl superposition decoheres** — `curlAll4EBHD` summed all active curls weighted by raw
   param. Worse, the finite-difference curls (brightness/heaviness/dynamism) are ~10–25× the
   magnitude of `fireVelocity`, so the sum was *magnitude*-dominated, not param-dominated → a
   direction tug-of-war that averaged into turbulence. (The warp was already top-2 biased; the curl
   was egalitarian — the mismatch was the mush.)
3. **texture & bpm had no flow** — `curlAll4EBHD` only took e/b/h/d. Texture/bpm only warped (if
   top-2) + dropped seeds on their isosurfaces; those seeds then rode *other* fields' flow → scatter.

Also, the seed integrator **normalizes direction every step**, so for the static spawn shape only
the summed curl's *direction* matters — the fix had to sharpen direction, not magnitude.

**Lever 1 — dominance weighting** (`FIELD_DOMINANCE = 4.0`, live slider 1–5). One exponent `k`:
- **Curl direction** (`curlAll6`, renamed): each field's curl is reduced to a **unit direction**
  first, then scaled by `wᵢ = paramᵢ^k` → the *weight* controls influence, not the incidental
  finite-diff magnitude. Sum's magnitude now encodes alignment (agreeing fields flow fast). `k=1`
  ≈ old egalitarian blend; higher `k` → strongest 1–2 fields own the direction, tail fades. No hard
  cutoff (smooth), so nothing pops as the auto-tester wanders. Concentration knob: what survives =
  however many params are genuinely high (2 high → 2 dominant; 1 high → 1).
- **Budget** (`sampleAll6Cloud`): same `paramᵢ^k` split → dominant field(s) stay dense; weak fields
  become thin accents instead of equal slices.

**Lever 2 — texture & bpm gained curl-noise flows** (flow *along* their isosurfaces, so seeds stay
on their own shell, fully 3-D, no planar degeneracy):
- `curlTexture` (texture.js) = `∇fbm × ∇n` (n = decorrelated value-noise grad at ~2× FBM freq).
- `curlBpm` (bpm.js) = `∇interference × ∇n` (n freq `1.2`). Flows along constructive-interference
  surfaces so the standing-wave bubbles keep shape.
- New `vn3grad` helper in shared.js (central-difference value-noise gradient).
Now all 6 fields carry flow → dominance weighting applies uniformly; the "top-2 warper has no curl"
dead-zone is gone.

**Refactor:** combine.js now passes the field bundle `F` (carries descriptors + `F.W` weights)
instead of ~18 positional args through `curlAll6` / `domainWarpPos` / `integrateWarpedAll` /
`integrateFireLine` / `combinedVelocity`. `buildFieldBundle(..., dominance)` computes `W`.

**Plumbing for the live knob:** `dominance` threaded through `sampleAll6Cloud` / `buildFieldBundle`
(default `FIELD_DOMINANCE`), `resampleAll6(...,dominance)`, `bakeVolume(mood,warpOrder,dominance)` →
worker message → `buildFieldBundle`. main.js holds `baseMood` + `fieldDominance`, extracted
`applyBaseShape()` (shared by mood panel + dominance slider, debounced). Tuning panel got a 7th arg
`onDominance` + a `dominance` slider (1–5, default `FIELD_DOMINANCE`).

**Behaviour note:** single-field shapes are unchanged (direction identical; only per-field magnitude
was dropped, and the integrator normalizes anyway). Combined shapes are the win.
**User picked dominance 4.0 → baked as the default.**
**Open tuning:** texture/bpm secondary-noise frequencies (`sf`, `nf`) if their flow character needs
work; whether budget should keep a small floor for accent fields.

## 5h. Cloud-shape tuning (multi-param "all over the place") — analysis (superseded by §5i)

User's observation: when several mood params are high at once, the **base cloud** goes "all over the
place" (particles scattered/noisy). Hypothesis (to confirm): additive stacking in the
**Dominant Warp + Full Superposition** combine — every active field contributes to the curl, so with
many hot params the summed displacement blows up + decorrelates. Candidate levers to discuss/try:
- **Normalise the superposition** (divide by active-field count / RMS) so total magnitude is stable.
- **Cap total displacement** (clamp field magnitude) so no runaway.
- **Scale down per-field warp weight as more fields go hot** (soft budget across active fields).
- Revisit `WARP_THRESHOLD` / `MAX_WARPERS` (currently top-2 warp) vs. the full superposition set.
Look in `particles/fields/combine.js` (`buildFieldBundle`, `combinedVelocity`) + the per-param field
modules. NB: this is a **base-field / bake** change (worker rebakes the volume) — heavier than the
bloom work, so profile the shape visually via the mood panel presets first. **Discuss before coding.**

## 6. Next session — cloud-shape tuning, then audio animation

### 6a. Pick-paint — remaining / to adjust

**NEXT (user-requested):**

1. **Adjust the modulator↔mood mapping (PARTLY DONE 2026-07-16 — keep tuning).** This
   session widened ranges + raised floors so calm/slow music still shows the click shape,
   and **wired radius + strength to mood**. Current wiring (`moodToBloomShape.js`):
   | Output | formula | range | driver |
   | --- | --- | --- | --- |
   | `radiusScale` | `lerp(0.8, 1.7, intensity)` | 0.8–1.7 | intensity |
   | `strengthScale` | `lerp(0.8, 2.0, intensity)` | 0.8–2.0 | intensity |
   | `outward` | `lerp(0.7, 1.5, energy)` | 0.7–1.5 | energy |
   | `shapeAmt` | `lerp(0.55, 1.0, 0.5·texture+0.5·dynamism)` | 0.55–1.0 | busy/complex |
   | `fieldFreq` | `lerp(1.0, 3.0, 0.6·texture+0.4·brightness)` | 1.0–3.0 | bright + complex |
   | `detail` | `lerp(0.35, 1.0, dynamism)` | 0.35–1.0 | restless |
   | `shell` | `lerp(0.0, 0.6, heaviness)` | 0.0–0.6 | bass-heavy |
   where **`intensity = 0.65·energy + 0.20·tempoT + 0.15·heaviness`**. `radiusScale`/
   `strengthScale` multiply `BLOOM_RADIUS`(≈1.375)/`BLOOM_STRENGTH`(1.8) → world radius
   0.83–2.34, burst peak 0.9–3.6. Manual `radius x` / `strength x` sliders added to the
   panel (0.3–3.0) for hunting the strong end. Archetype scores (top-2 win): Curl←texture·
   (1−dynamism); Vortex←energy·(1−texture); Lightning←dynamism·(.55+.45·heaviness)+energy·
   heaviness; SmokeRing←brightness·(1−heaviness)·(1−texture); Cells←texture·(.55+.45·brightness).
   **Still to revisit:** the intensity high-ends (user will hand-tune a "strong end" and
   we anchor to it), preset→distinct-archetype, blend cap, per-archetype default modulators.
2. **DONE — cluster-based click judgement.** Rewrote `particlePick.js`: gather candidates
   within `PICK_PIXEL_RADIUS` (past a small `PICK_LENS_GUARD`), score each by local density
   (neighbours within `PICK_CLUSTER_RADIUS` world), then **Rule A** — pick the NEAREST
   candidate with density ≥ `PICK_CLUSTER_MIN` (front-most visible clump; near clump occludes
   far), else fall back to the candidate closest to the cursor (sparse clicks still count).
   Bloom lands at the **cluster centroid**; **empty void = no-op** (returns null). Live sliders
   `cluster min` / `cluster radius` added to the tuning panel (picker passed as 4th arg, created
   before the panel in `main.js`). Config: `PICK_PIXEL_RADIUS 16`, `PICK_CLUSTER_RADIUS 0.5`,
   `PICK_CLUSTER_MIN 4`, `PICK_LENS_GUARD 0.8`. Verified: void→null, clumps→centroid, sparse→
   fallback, full click adds one bloom + marker. **User approved the feel — DONE.** Defaults
   left at config values (min/radius still live-tunable in the panel if needed later).
   (Threshold is absolute-count, not adaptive — predictable + slider-tunable across count presets.)

- **Keep tuning the archetypes** — dial defaults for each of the five via the panel, then
  bake into `config.js`. Balance knobs: smoke-ring `axis * 0.5` (roll↔drift), lightning
  `warpAmt` / base freq (wilder vs. longer segments), blend cap.
- **DONE — pick near-camera preference.** Prefers far beyond `minPickDistance`, else farthest
  within. (Being superseded by the cluster-based rework above.)
- **DONE — Phase 3 mood → bloom shape.** See §5d. Plumbing + mapping shipped; the mood source
  swaps to audio later with **no shader change** (only where `currentMood` is fed).
- **Phase 4 (optional polish).** Feed paint into the cube-orientation shader too; brightness
  accents inside blooms; magnitude cap if superposed bursts get too hot; swap to a windowed
  3D paint texture only if dozens overlap in view.

### 6b. Audio animation system (PRECOMPUTED — confirmed)
- `audioPrecompute.js` already analyses the **whole track offline** (FFT → 7 bands, bass flux, spectral features, **beat timestamps**, mood fingerprint). `getAudioData()` just indexes those arrays by playback time and fires `isBeat` on stored timestamps. No live FFT at runtime → deterministic, cheap, GPGPU-friendly.
- The consumer hookup in `main.js` is **commented out** and used pre-GPGPU uniforms — **needs rewiring** for the baked-volume flow. Real-time features should modulate *on top* of the baked field: e.g. flow speed, a beat pulse/expansion, treble→size, bass→displacement. Precompute layer stays as-is; only the hookup changes.
- Two distinct audio jobs (don't conflate): (1) **mood extraction** → sets the *shape* (via `computeMoodFingerprint` → `contrastMood`); (2) **audio animation** → real-time *motion* from the precomputed timeline.
- **Mood is one-shot today (whole-track).** `computeMoodFingerprint` averages the whole track → a single fingerprint that does **not** change during playback. So Phase-3 blooms clicked anywhere in a song share one mood character.
- **Time-varying mood (Step 4) — DONE 🟡 (see §5e).** `computeWindowedMood` + live `currentMood`
  refresh (~10 Hz, EMA) during playback; blooms react to the moment at ~zero GPU cost. Base cloud
  still whole-track. Refinement of window/smoothing/high-ends pending.
- **Base-cloud shaping from audio (option 1, OPEN — user asked, deferred).** On audio start, run
  `audioAnalyser.mood` (whole-track) through the same path the debug panel uses (`contrastMood →
  resampleAll6 → particleSim.reset → bakeVolume`) so the ambient cloud morphs **once** to match the
  song. One re-bake (off-thread worker) → not a perf concern. Continuous/time-varying base cloud
  (option 2) is the expensive one → skip or heavily debounce.

### 6b-opt. Optimization pass — root cause FOUND ✅ (fill-rate), first fix shipped 🔧

**Diagnosis (2026-07-16), confirmed by evidence, not guessed:**
- DevTools Performance capture: **main thread ~95% idle** (~670 ms work in 12.4 s; our JS = 80 ms) →
  **NOT** CPU/JS bound. Killed every CPU suspect (syncUniforms scan, readback, marker draw calls).
- **Window-resize test is decisive:** full-screen = 30 fps, shrink the window = 60 fps → classic
  **fill-rate / fragment-overdraw** bound. FPS scales with pixels drawn, not particle count.
- Matches all symptoms: a single paint slid FPS to 30 (paint clumps particles toward the camera →
  more coverage/overdraw); disabling blooms, freezing the sim, and halving particle count did
  **nothing** (the cost is *rendering fragments*, not the sim or CPU); unprompted dips to ~45 while
  drifting = flying into denser regions.
- Root config: the particle material is `transparent:true, depthWrite:false, NormalBlending` — every
  fragment shaded + blended with **no depth rejection**, so dense overlaps shade each pixel many times,
  and the (lighting+specular+fog) fragment shader runs per overdraw layer.

**Fixes tried (live A/B toggles added to the tuning panel — keep them):**
- `resolution` slider (live `renderer.setPixelRatio`) — **the winner.** At ~**0.75** FPS snapped back to
  a solid 60 full-screen, smooth. **Shipped:** `RENDER_PIXEL_RATIO = 0.75` in config, applied in `main.js`
  (`min(devicePixelRatio, RENDER_PIXEL_RATIO)`); slider still lets you trade sharpness↔fps.
- `depth write` checkbox — only a *little* better (overdraw depth wasn't the dominant cost; it's raw
  pixels × fragment cost). Left as a toggle, default OFF (keeps the soft see-through look).
- `freeze sim` checkbox — froze advection to prove the sim isn't the cost (it wasn't).
- `blooms ON` checkbox — proved paint force isn't the sustained cost.
- `markers` checkbox — ruled out the red pick markers.

**Still on the table (do if more headroom needed / for the paint worst-case + mobile):**
- **Cheaper fragment shader** — drop / cheapen specular `pow(...,48.0)` + lighting; buys back
  resolution for the same fps (sharper pixels, simpler shading). Quality tradeoff to judge.
- **Dynamic resolution scaling** — auto-lower pixel ratio when fps dips (paint stress / dense regions),
  raise it when there's headroom. Adapts across machines; watch for visible "res breathing".
- **Smaller cubes / shorter kill radius / fewer particles** — secondary coverage levers (panel).
- **Per-tap `readRenderTargetPixels`** (`particlePick.js`) — a GPU→CPU stall per click; fine on desktop,
  revisit for mobile (cache / smaller region / async).
- **`bloomField.syncUniforms`** O(all blooms) scan — fine now (CPU is idle), revisit only if paint grows huge.

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

### 6d. SESSION QUEUE — status

**✅ DONE 2026-07-24 (see §5n):** (1) particle rotation, (2) sudden-disappear. Also handled the
follow-up shiver/jitter (stagnation heading-hold) + explained the "collide" (cross-stream
interpenetration, not physics).

**NEXT — user deferred, "talk about audio animation system later":** the audio-animation rewire (§6b)
is the next topic. Precompute layer (`audioPrecompute.js`) is ready; the `main.js` consumer hookup is
stubbed (TODO near `renderer.render`) and needs rewiring to modulate the **baked-volume GPGPU flow**:
beat pulse, treble→size (`uAudioTreble` already wired), bass→displacement, flow-speed accents — on
**top** of the baked field. `AUDIO_ENABLED=false` gate + first-pointerdown autoplay path intact; flip
to re-enable. Two jobs not to conflate: mood extraction (shape) vs. audio animation (real-time motion).

**Still open from the original queue (lower priority):**

3. **Particle-mesh libraries.** Extend `MODEL_SRCS`/`MODEL_SCALES` (loader + buckets already generic);
   consider weighted assignment + a cleaner `{src, scale, weight}` config; watch per-mesh tri budget as
   variety grows.
4. **More optimization talk.** Fill-rate/overdraw is the root cause (§6b-opt); shipped `RENDER_PIXEL_RATIO
   0.75` + count 40k→28k. On the table: cheaper fragment shader, dynamic resolution, per-mesh LOD, GLB
   vertex cost as libraries grow. Re-profile after audio adds per-frame work.

---

**Rotation reference (kept for when we revisit / build on it):**

1. **Particle rotation.** ✅ Implemented (§5n). Original leads below. Right now each instance is oriented by the **flow direction** only
   (`shaders.js`: builds `orient = mat3(rgt, up, flow)` so local +Z aligns with `instSampleVel`).
   There is **no spin** — models are locked to the stream, and the `up`/`rgt` basis is derived from a
   fixed world-up, so there's zero roll variety. Options to discuss:
   - **Per-particle roll** about the flow axis: add a `aSpin` (or reuse a hash of `aParticleId`) →
     rotate the (rgt,up) basis by `phase + uTime·rate` before building `orient`. Cheap, adds life.
   - **Free tumble** (mood/​time-driven rotation decoupled from flow) for a less rigid look — needs a
     per-instance random axis + rate; trades the "pointing along the stream" read.
   - Rotation **rate from mood** (dynamism/energy → faster spin) mirroring flow-speed/size — same
     free-uniform pattern (`moodTo*` helper). Decide flow-locked-roll vs. full-tumble first.

2. **Sudden-disappear issue (particles popping out).** Suspects to check, in order:
   - **Respawn pop:** the GPGPU conveyor respawns particles at the nearest tiled seed when they pass
     `SIM_KILL_RADIUS` (`particleSim.js`). The render fade is `farFade = 1 − smoothstep(kill·0.78, kill,
     dCam)` + birth fade (`shaders.js`). If a particle respawns *inside* the fade band or the birth
     ramp (`SIM_BIRTH_TIME 0.45`) is too short, it can visibly pop. Check the far-fade band width vs.
     kill radius and whether respawn distance ≥ kill radius (so it's born already faded-out).
   - **Lifetime cull:** `SIM_MAX_LIFE 6.0` ± `SIM_LIFE_JITTER 0.8` — a particle hitting max life may
     vanish without a death fade (only birth + distance fades exist; **no age-out fade**). Likely the
     culprit → add an end-of-life alpha ramp keyed to `age/maxLife`.
   - **Faster flow = shorter on-screen life** (noted in §5k): high `uFlowSpeed` crosses the bubble
     quicker → more respawns → more pops. May interact with the above.
   - `frustumCulled = false` is already set on the meshes, so it's **not** frustum culling.

3. **Particle-mesh libraries (more GLB variety / management).** Current: `MODEL_SRCS[4]` +
   `MODEL_SCALES[4]`, random assignment via `seededRng(0xC10D)` bucketed into one InstancedMesh per
   model (§5l/§5m). To scale up: more GLBs (just extend both arrays — loader + buckets already
   generic), maybe **weighted** assignment (rarity per model), grouping/tags, and a cleaner
   config shape (array of `{src, scale, weight}` objects instead of parallel arrays). Also revisit the
   per-mesh triangle budget vs. count (see §6c-B polycount guide) as variety grows.

4. **More optimization talk.** Root cause is **fill-rate/overdraw** (§6b-opt, proven). Already shipped
   `RENDER_PIXEL_RATIO 0.75` + live toggles. On the table: cheaper fragment shader (drop specular
   `pow(...,48)`), dynamic resolution scaling, per-mesh LOD, and the fact that GLB models = **more
   verts/tris than cubes** now (watch vertex cost as libraries grow). The count drop to 28k already
   bought headroom. Profile again after rotation (more per-vertex work) before deciding.

**Also still open (carry-over, lower priority):** refine Step 4 feel (§5e), base-cloud shaping from
audio (§6b opt 1), audio-animation rewire (§6b), mobile/touch pass, `uReveal` no-op decision,
mood→size *variance* follow-up (§5m), prune now-unwired legacy modules (§9).

---

## 7. Roadmap (phases)

- [x] Shape system (6 mood params, combiner, contrast).
- [x] Animation system (GPGPU advection, baked velocity volume, worker).
- [x] **Flythrough** — flight controls + world-anchored varied instancing + conveyor recycling. Dense, gapless, non-repetitive, ~165 FPS.
- [x] **Pick-paint Phase 1–2** — GPU-accurate picking + persistent analytic blooms (firework + ink-spread). §5b.
- [x] **Bloom rework** — same-speed redirect + shaped burst; **5-archetype library** (Curl/Vortex/Lightning/Smoke Ring/Cells), per-bloom dominant+partner selection via `uBloomC`. §5c.
- [x] **Pick near-camera preference** — superseded by cluster-based picking below.
- [x] **Pick-paint Phase 3** — mood → per-bloom archetype selection + all 5 modulators; per-bloom `uBloomD`; mood-driven toggle + readout. §5d.
- [x] **Cluster-based click judgement** — Rule A (nearest dense clump, else nearest-to-cursor fallback), centroid placement, void=no-op, live cluster min/radius sliders (§6a #2). **User approved.**
- [ ] **Mobile / touch pass** — picking already runs on touch (Pointer Events, tap = click). Before calling it mobile-ready: add `touch-action: none` on the canvas (stop browser scroll/zoom/tap-delay), test tap-vs-steer on a real device, consider throttling the per-tap `readRenderTargetPixels` (heavier on mobile GPUs).
- [~] **Adjust modulator↔mood mapping** — ranges widened + floors raised + radius/strength wired to mood (§6a #1). Still tuning intensity high-ends / per-archetype defaults.
- [x] **Time-varying mood (Step 4)** — `computeWindowedMood` + live `currentMood` refresh (~10 Hz, EMA) during playback → blooms react to the moment; ~zero GPU cost (§5e). 🟡 needs feel refinement.
- [x] **Mood-source fix** — manual panel now beats audio for bloom testing (`audioDrivesMood` gate); presets stick, correct archetype selection confirmed (§5f).
- [x] **Mood-varying tester** — auto-random hands-free mood driver (`auto mood (random)`); contrast-to-extremes targets, EMA wander, sliders mirror live value; audio gated off (`AUDIO_ENABLED`). §5g. **User: "very nice."**
- [x] **Cloud-shape tuning** — dominance weighting (`FIELD_DOMINANCE=4.0`, live slider) on flow direction + budget, and texture/bpm gained curl-noise flows so all 6 fields contribute. Fixes "sparse noise" when many params are high. §5i.
- [~] **Optimization pass** — root cause = **fill-rate/overdraw** (not CPU/sim), proven by window-resize test + idle-CPU profile. Shipped `RENDER_PIXEL_RATIO = 0.75` (holds 60 full-screen) + live perf toggles. Optional next: cheaper frag shader, dynamic res scaling (§6b-opt).
- [ ] **Base-cloud shaping from audio (option 1)** — one-time re-bake to `audioAnalyser.mood` on audio start (§6b). *(user asked; deferred.)*
- [x] **Custom GLB particle models** — cubes → 4 vertex-colored triangle GLBs, random per particle, Group of instanced meshes sharing one material (§5l). **User confirmed working + looks great.**
- [x] **Combined particle size model** — random power-law grain × structural taper × expressive mood + per-model size classes (`MODEL_SCALES`); count 40k→28k (§5m). **User: "looks great."**
- [x] **Particle rotation** — flow-aligned + per-particle roll + slow spin, killed the world-up lockstep/pole snap; low-speed heading-hold fixes stagnation shiver. Live `spin rate` slider (§5n). **User: "very nice."**
- [x] **Sudden-disappear fix** — added symmetric death fade (per-particle `life` in `cell.w`, `SIM_DEATH_TIME=0.6`); lifetime-expiry respawns now ease out instead of popping (§5n).
- [ ] **Particle-mesh libraries** — more GLBs + weighted assignment + cleaner `{src,scale,weight}` config. §6d #3.
- [ ] **Particle trails** — GPU history ribbons (N≈8–12), preferably subset; see §6c. **Notes only until asked.**
- [ ] **Audio animation** — rewire precomputed per-frame features to the baked-volume/GPGPU flow (§6b): flow speed / beat pulse / treble→size on top of the baked field.
- [ ] Cleanup — prune now-unwired legacy modules (§2/§9) once confirmed off-path.

---

## 8. Known loose ends

- Baked field isn't perfectly seamless (curl noise isn't periodic), but that no longer matters — the field is sampled per-instance in local space now, not wrap-tiled.
- **User wants to tweak some script tomorrow before continuing** (specific values TBD — ask which).
- Paint affects particle **positions** only; cube **orientation** still follows the base field (Phase-4 optional).
- Bloom envelope is per-bloom (not per-particle): particles entering after the burst only get the sustain residual — intended for "one firework per beat".
- Red pick markers (`particlePick.js`) currently persist/recycle at 120; decide later whether to keep them once paint is the real feedback.
- Picking is now **cluster-based** (§6a #2): nearest dense clump under the cursor → centroid; sparse fallback so clicks count; void = no-op. Tunables `cluster min` / `cluster radius` live in the panel; `PICK_LENS_GUARD 0.8` keeps blooms off the lens.
- **Mood-driven blooms default ON** (tuning-panel checkbox); uncheck for manual archetype/modulator control. Manual controls gray out while on.
- **Mood is now time-varying WHILE AUDIO PLAYS** (Step 4, §5e): `currentMood` eases toward the live windowed mood, so blooms react to the section. **Audio is off until the first click** (autoplay gesture) — before that, the mood panel drives blooms. **Base cloud is still whole-track/static** (its audio-mood shaping is §6b option 1, not wired).
- **Manual takeover (§5f):** touching the mood panel sets `audioDrivesMood = false`, pinning `currentMood` to the panel value so audio stops overwriting it — this is what lets you test bloom shapes per-preset. Reload to hand mood control back to audio. (There's no in-UI re-enable yet; add a toggle if we want to switch back live.)
- **Audio playback re-enabled** — first canvas `pointerdown` starts it (also drops a bloom). If you don't want sound, just don't click, or we can gate it behind a toggle.
- Dev server: `npm run dev` → `http://localhost:5173/` (must run outside the sandbox — plain runs fail to spawn with a sandbox-policy error; start with elevated perms). Tuning panel top-left (now with live `mood` + `last:` readouts), mood panel top-right.

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

---

## 10. 2026-08-16 — pending user decision + cover-particle visibility Q&A

- **User is thinking over the recent fixes and wants to note it for later** — no specific values given
  yet, revisit next session. Context: this follows the forward-biased respawn-reach fix (closes the
  "empty ahead / full behind" gap while flying) and the multi-source click-picking fix (mesh + trail +
  flowDots), both implemented but **not yet playtested/confirmed** by the user as of this note.
- **Q: "cover particles are closer now, but are we seeing ALL the particles?"** — Checked `main.js`:
  during `appPhase === 'cover'`, the **mesh cloud is intentionally NOT added to the scene**
  (`meshAddedToScene` only flips true once `fadeOutT >= 1` inside the `'transitioning'` phase — see
  §5o FPS-drop fix, deferred `scene.add(particles)` to hide its one-time shader-compile/texture-upload
  cost on the black screen). So on the cover page you are only ever seeing **`trail`
  (`TRAIL_COUNT=12000`) + `flowDots` (`FLOW_DOTS_COUNT=9000`)**, both reset via
  `scaleSeedsTowardOrigin(seeds, COVER_SEED_SCALE=0.16)` and given
  `killRadius = SIM_KILL_RADIUS * COVER_KILL_RADIUS_SCALE (0.16)`. The mesh cloud (`CLOUD_COUNT=5000`)
  never appears until the transition's black-hold. This is existing, intentional perf behavior from
  the prior session — not a regression from the "make cover particles closer" tweak. If we ever want
  the mesh cloud visible on cover too, it'd mean re-paying that shader-compile/texture-upload cost
  during cover instead of on the black screen — a deliberate tradeoff, revisit only if it's visually
  missed.
- **Follow-up: "I don't see 12000/9000 that amount" of trail/flowDots on cover.** Traced the actual
  geometry, not just counts — found the real cause: `scaleSeedsTowardOrigin(seeds, COVER_SEED_SCALE)`
  scales every seed toward the **world origin**, and `orbitControls.js`'s cover camera **sits AT the
  world origin** (it's a pivot-in-place rig, "camera stays put... at the cloud's center"). So shrinking
  seeds toward origin = shrinking them toward the camera lens itself. At `COVER_SEED_SCALE = 0.16`,
  most of the 12000 trail / 9000 flowDots seeds land within a tiny radius of the camera position —
  `instRespawn`'s nearest-tile search (`instToWorld(seed*scale, cell)`) then places their world
  positions extremely close to `camPos`. Perspective-scaled point/ribbon sprites blow up hugely in
  screen-space the closer they get to the lens, so instead of 12000/9000 small distinct dots you get a
  much smaller number of giant, heavily-overlapping blurry blobs — **the count rendered is correct,
  but the perceived/distinguishable count collapses due to massive near-camera overdraw/blur**, not a
  missing-particle bug. This is the real mechanism behind "they're closer but I don't see the full
  amount." **Fixed**: `COVER_SEED_SCALE` 0.16→0.45 (still visibly closer than the unscaled 1.0 shape,
  but far enough from the lens that individual trails/dots stay distinct instead of smearing into
  overlapping blobs) and `COVER_KILL_RADIUS_SCALE` 0.16→0.45 to match (kept roughly aligned so the
  respawn leash doesn't recycle particles before they reach the new, farther-out visible shape edge —
  otherwise that mismatch alone can waste life-slots). Verified no errors in `config.js`.
- **Follow-up: camera "sudden stop" on clicking Start.** Root cause: `orbitControls.js`'s idle
  auto-drift continuously advances `targetYaw` by `COVER_ORBIT_SPEED` rad/sec every frame — that's a
  real, ongoing yaw rotation. `startTransition()` disposes `orbitControls` and hands off to
  `flyControls`, which only turns via active drag-steering (`targetYaw` otherwise sits frozen at the
  handoff heading) — so the auto-drift's rotation stops instantly the frame Start is clicked, while the
  forward-flight speed already eases in smoothly over `COVER_CAMERA_EASE_TIME`. That mismatch (speed
  eases, rotation snaps) is what read as a sudden stop. **Fixed**: added
  `orbitControls.getAutoDriftRate()` (returns the current auto-drift rad/sec, or 0 if the user was
  mid-drag) and `flyControls.setInitialSpin(rate, easeTime)` (carries that rate over into `targetYaw`,
  linearly decaying to 0 over `easeTime`, default `COVER_CAMERA_EASE_TIME`; a real drag-steer input
  cancels it immediately). Wired in `main.js`'s `startTransition()` right after `setHeading`/
  `setSpeedScale(0)`. Verified no errors across `main.js`/`orbitControls.js`/`flyControls.js`, dev
  server 200.
- **Auto-rotate speed slower**: `COVER_ORBIT_SPEED` 0.06→0.03 (config.js). Halves both the idle
  cover-page drift AND the carried-over spin at Start handoff (same constant feeds both).
- **Audio now plays once (was looping)**: `audioPrecompute.js`'s `source.loop` `true`→`false`. Also
  fixed a latent follow-on bug: `getTime()`/`getWindowedMood()`/`getAudioData()` all used `% duration`
  to compute the playhead, which — once the source stopped looping — would still silently wrap back to
  0 forever (since `ctx.currentTime` keeps climbing after the buffer ends), fake-looping the
  mood/beat-driven visuals even though the sound had genuinely stopped. Changed all three to
  `Math.min(rawTime, duration)` (clamp, don't wrap) so the analysis data holds at the final frame once
  the track truly ends.
- **New: end-of-track → fade to black → loop back to cover.** User request: after the track ends, fade
  particles/BG to black over 10s, then re-enter the cover page (fresh random shape, Start button faded
  back in). Implemented as a full mirror of the existing cover→game transition, reusing the same
  uniforms/pattern in reverse:
  - `audioPrecompute.js`: added `onEnded(cb)` — wires the underlying `AudioBufferSourceNode.onended`
    (native, fires once, reliable) so `main.js` can react the instant playback genuinely finishes.
  - `config.js`: new `ENDING_FADE_TIME = 10.0` (whole-scene fade-to-black duration on track end).
  - `main.js`: new phase `'ending'` in the `appPhase` machine (cover → transitioning → game → ending →
    cover, looping). New state: `endingStart`, `coverFadeInStart`.
    - `startAudio()` now calls `audioAnalyser.onEnded(() => beginEnding())` right after the analyser
      resolves.
    - `beginEnding()`: guarded to only fire from `'game'`; sets `appPhase='ending'` + `endingStart`.
    - `animate()`'s new `'ending'` branch: eases `inv = 1 - fadeT` over `ENDING_FADE_TIME` and drives
      `u.uGlobalFadeIn`, `trail.opacity`, `flowDots.opacity`, all three BG `fadeMul`s, `moodOrbs.fadeMul`,
      `elevHaze.fadeMul`, and `dust.opacity` down to 0 together (identical uniforms the cover→game
      fade-IN already used, just run backwards) — so the whole scene fades out as one unified dissolve
      instead of independent layers drifting out of sync. At `fadeT>=1`, calls `loopBackToCover()`.
    - `loopBackToCover()`: full reset mirroring the original page-load cover setup — tears down
      `audioAnalyser`/`audioStarted`/`audioRequested`/all transition timestamps back to their initial
      `null`/`false` state; closes the old `AudioContext`; removes the mesh cloud from the scene again
      (`meshAddedToScene=false`); rolls a brand-new `contrastMood(randomMood())` + `buildWarpOrder`;
      re-resamples the mesh cloud + resizes the sim + reshapes trail/flowDots to the new mood, scaling
      trail/flowDots seeds toward the origin via `COVER_SEED_SCALE`/`COVER_KILL_RADIUS_SCALE` (same as
      the original cover setup) and starting their opacity at 0; re-bakes the flow volume; turns cover-
      only atmosphere back off (`moodOrbs`/`elevHaze`/`dust` disabled, BG `fadeMul`s to 0); disposes
      `flyControlsInst` and creates a fresh `orbitControls` (now reassignable — see below); restores
      `camera.far`/near, the CSS cover blur, and the reduced cover pixel ratio; calls the new
      `attachStartButton()` to spawn a fresh Start button; sets `coverFadeInStart = elapsed`.
    - `animate()`'s new cover-fade-in block: while `appPhase === 'cover' && coverFadeInStart !== null`,
      ramps `trail.opacity`/`flowDots.opacity` from 0 back up to full over `COVER_FADEOUT_TIME` (reused
      — same duration as the original fade-out, just run forward), then clears `coverFadeInStart`.
      No-op on the very first (non-looped) cover page load.
    - `orbitControls` changed from `const` to `let` (loopBackToCover() must create a new instance each
      loop, since the previous one was disposed at the last Start click); `startBtn` changed from a
      one-off `const` to a mutable `let` populated by the new `attachStartButton()` helper (creates the
      button, fades it in via a CSS `opacity` transition over `COVER_FADEOUT_TIME`, wires the click
      listener) — called once at module load and again from `loopBackToCover()`.
  - Verified no errors across `main.js`/`audioPrecompute.js`/`config.js`; dev server 200.
  - **Not yet playtested end-to-end** (a full track runthrough is long) — worth a quick manual check
    with a short/looped test or by temporarily lowering `ENDING_FADE_TIME`/seeking near the track's end
    to confirm the whole loop (ending fade → cover reroll → fade back in → Start still works) end to
    end.
- **Follow-up fix: looped-back cover particles "popped" instead of growing.** Root cause: the fade-in
  only ramped a global `opacity` uniform, but the trail/flowDots population was already fully
  "revealed" (`spawnFrac=1` left over from the prior gameplay session) — so every particle was present
  (just dim) from frame one, then all brightened together. **Fixed**: `loopBackToCover()` now sets
  opacity to full immediately and resets `spawnFrac`/`spawnElapsed` to 0; the fade-in block in
  `animate()` ramps the actual sparse→full population growth (same mechanic as the cover→game
  transition) instead of dimming.
- **New: initial page-load "frozen then suddenly flowing" fix.** User observation: on first page load,
  cover particles/trails sit static for a beat, then abruptly start flowing — same underlying causes as
  the ending/loop-back work, just never addressed for the very first load. Two real causes: (1) the
  cover mood's velocity-volume bake (`bakeVolume` → `velocityBaker.worker.js`) is async, a few frames'
  latency — until it lands, `pendingBakeJobId !== null` forces `uFlowReady=0` (invisible, not just
  frozen) and flow speed 0; (2) trail/flowDots/mesh GPGPU + ribbon-draw shaders hadn't been JIT-compiled
  by the driver yet — the existing `warmupPaintShaders()` only primed the mesh paint/burst path via
  `renderer.compile(scene, camera)`, which never touches the trail (drawn manually outside the scene
  graph, see `trail.render()`) or the sim-side GPGPU passes for trail/flowDots (only their *render*
  material is in `scene`, not their sim materials) — so those all compiled for the first time visibly,
  mid-animation, on the actual first frames.
  - **User's requested fix, implemented**: hold flat black (scene background is already black on cover)
    with ONLY the Start button visible (shown instantly, no fade) until both causes are confirmed
    resolved, then fade the trail/flowDots population in over `INITIAL_LOAD_FADE_TIME` (new config,
    2.0s) — so they arrive already flowing instead of frozen-then-jumping.
  - `config.js`: new `INITIAL_LOAD_FADE_TIME = 2.0`.
  - `main.js`:
    - Trail/flowDots now start at `opacity=0`/`spawnFrac=0`/`spawnElapsed=0` right after construction
      (previously trail started implicitly "ready"; flowDots too) — true zero population/visibility
      until the readiness gate below clears them.
    - New readiness gate: `initialBakeDone` (set in the volume-bake worker's `onmessage`, guarded to
      only fire once — a later reshape like `loopBackToCover()`'s re-bake mustn't re-trigger it) and
      `initialWarmupDone` (set at the end of `warmupPaintShaders()`, in a `finally` so a compile error
      can't permanently strand the black hold). `maybeStartInitialCoverFadeIn()` checks both + sets
      opacity to full and starts the population ramp once both are true.
    - `warmupPaintShaders()` extended: now also runs one `trail.update()` + `trail.render()` (primes
      the trail's GPGPU sim shaders AND its ribbon-draw material, invisible since opacity/spawnFrac are
      still 0 at this point) and one `flowDots.update()` (primes its sim shaders; its render material
      was already covered by the existing `renderer.compile(scene, camera)` since `flowDots.object3D`
      IS in the scene graph, unlike trail).
    - New shared `coverFadeInStart`/`coverFadeInDuration` pair drives BOTH this initial fade-in
      (`INITIAL_LOAD_FADE_TIME`) and the existing loop-back-from-ending fade-in
      (`COVER_FADEOUT_TIME`) through the same `animate()` ramp block — same spawnFrac/spawnElapsed
      population-growth mechanic either way, just a different duration depending on which caller
      started it.
    - `attachStartButton(instant)`: the very first call (module load) now passes `instant=true` — the
      button appears immediately, no CSS fade, since it should be visible right away during the black
      hold per the user's request. The loop-back call (from `loopBackToCover()`) keeps the original
      fade-in-via-CSS-transition behaviour, coinciding with the particle fade-in.
  - Verified no errors in `main.js`/`config.js`; dev server 200.
  - **Not yet playtested** — worth confirming in-browser that (a) the black hold + button appear
    correctly on a hard refresh, (b) the bake/warmup readiness gate clears within a reasonable time
    (should be well under a second normally), and (c) particles genuinely arrive already flowing with
    no visible freeze-frame at the start of the 2s fade-in.
- **Found + fixed: cover page "looks way sparser than gameplay" despite identical particle counts.**
  User correctly suspected something was off — trail (`TRAIL_COUNT=12000`) and flowDots
  (`FLOW_DOTS_COUNT=9000`) use the EXACT same counts on cover and gameplay (constructed once at module
  load, never resized). The real culprit: near/far camera-distance culling. `TRAIL_NEAR_CULL≈0.95` /
  `TRAIL_FAR_CULL≈6.6` (gpuTrailsShaders.js) and flowDots' near-fade band (previously hardcoded
  `smoothstep(0.25, 0.7, dCam)` in its fragment shader) are FIXED absolute world-unit values, calibrated
  for the full-size gameplay shape/kill-radius. They never scaled down alongside
  `COVER_SEED_SCALE`/`COVER_KILL_RADIUS_SCALE` (0.45) the way `killRadius` itself already does. Cover's
  effective kill radius shrinks to `~7.6×0.45≈3.4`, but the near-cull dead zone stays at its full
  ~0.95-1 size — so a much bigger proportional slice of the shrunk cover volume falls inside that dead
  zone (or gets squeezed into a much thinner visible shell) than on full-size gameplay, even though the
  particle COUNT is identical. This is what actually made cover look sparser.
  - `particles/flowDots.js`: promoted the previously-hardcoded near-fade band to real uniforms
    `uNearFadeStart`/`uNearFadeEnd` (defaults 0.25/0.7, matching the old hardcoded values exactly for
    gameplay), with new `nearFadeStart`/`nearFadeEnd` getter/setters.
  - `main.js`: at cover-page construction (and again in `loopBackToCover()`), scale
    `trail.nearCull`/`trail.farCull` and `flowDots.nearFadeStart`/`nearFadeEnd` by
    `COVER_KILL_RADIUS_SCALE` (same factor already used for `killRadius`) so the dead-zone/visible-shell
    proportions match gameplay's. Restored to the real, unscaled `TRAIL_NEAR_CULL`/`TRAIL_FAR_CULL`/
    `0.25`/`0.7` the instant the cover fadeout finishes (`animate()`'s `'transitioning'` branch,
    `fadeOutT>=1`), same spot `killRadius` itself already gets restored.
  - Verified no errors across `main.js`/`flowDots.js`; dev server 200. Not yet playtested — worth a
    visual check that the cover page now reads as dense as gameplay near the camera.
