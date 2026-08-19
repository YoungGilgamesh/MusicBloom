// ─── Single source of truth for all scene tunables ───────────────────────────
// Tweak values here; everything imports from this file.

import { assetUrl } from './assetUrl.js';

// ── Particle cloud ────────────────────────────────────────────────────────────
// Mesh share of the particle budget; trails take TRAIL_COUNT. Trails are
// density-clustered (TRAIL_CLUSTER_BIAS) so sparse regions stay mesh-only.
export const CLOUD_COUNT = 5000;

// Cheap flowing light dots — additional Points layer (own ParticleSim, same volume /
// paint / kill bubble as meshes). Explicit count (raised vs old half-mesh default).
export const FLOW_DOTS_ENABLED = true;
export const FLOW_DOTS_COUNT = 9000;
export const FLOW_DOTS_SIZE = 0.012;  // base point size (perspective-scaled) — overall smaller
export const FLOW_DOTS_SIZE_VAR = 1.15;   // per-dot size spread (many tiny, few larger)
export const FLOW_DOTS_OPACITY = 0.85;
export const FLOW_DOTS_HUE_VAR = 0.18;   // mild hue scatter around theme
export const FLOW_DOTS_SAT_SCALE = 0.95;
export const FLOW_DOTS_LIT_SCALE = 1.05;   // slightly brighter than trail mid (additive)
// Motion stretch: elongate soft sprites along flow direction (1 = round; ~1.5–2.2 = streaky).
export const FLOW_DOTS_STRETCH = 1.85;

// Render resolution (drawing-buffer size ÷ CSS size). The scene is FILL-RATE
// bound — the transparent particle cloud shades a lot of fragments per pixel —
// so this is the single biggest FPS lever. 1.0 = native CSS pixels; below 1.0
// renders smaller and upscales (softer, much faster).
export const RENDER_PIXEL_RATIO = 0.75;
// Phones only (`pointer: coarse`). Desktop keeps RENDER_PIXEL_RATIO.
export const RENDER_PIXEL_RATIO_MOBILE = 1.2;

// Output grade: ACES filmic (applied in custom shaders via toneMap.glsl.js).
export const TONE_MAPPING_ACES = true;
export const TONE_MAPPING_EXPOSURE = 1.0;

// ── Vignette (gameplay only) ──────────────────────────────────────────────────
// Cheap CSS radial-gradient overlay div (NOT a shader pass) — zero render cost,
// just a transparent-to-black gradient sitting on top of the canvas. Faded in
// alongside the rest of the gameplay atmosphere (BG theme/haze/orbs — see
// main.js's 'transitioning'/'ending' animate() branches, bgT/inv) so it eases
// in on Start and back out at the ending fade, rather than cutting in/out.
export const VIGNETTE_STRENGTH = 0.45;   // 0 = invisible, 1 = fully black at the corners
export const VIGNETTE_SIZE = 68;         // % of the shorter viewport dimension where the darkening starts

// Scale of the parametric shape (world units). Surface sits at ≈ SHAPE_SCALE from centre.
export const SHAPE_SCALE = 2.5;

// Mood contrast: how hard auto-generated moods (presets, and later audio) are
// pushed toward the extremes for more distinct shapes. 1 = off (identity),
// higher = punchier (highs→1, lows→0). See moodContrast.js.
export const MOOD_CONTRAST = 1.8;

// Field dominance: exponent applied to each mood param when combining the 6
// generative fields (fields/combine.js). Weight wᵢ = paramᵢ^FIELD_DOMINANCE drives
// BOTH the flow direction (strongest 1–2 fields steer; weak ones fade) and the
// particle budget (dominant fields stay dense). 1 = egalitarian blend (old
// behaviour, mushy when many params are high); higher = one/two clear shapes +
// thin accents.
export const FIELD_DOMINANCE = 4.0;

// ── Particle size model (shader-side; see shaders.js) ─────────────────────────
// Final per-particle size = grain × taper × moodScale, where:
//   grain     = SIZE_MIN + (SIZE_MAX-SIZE_MIN) * pow(rand[0,1], SIZE_POW)
//               → power-law spread. POW > 1 = mostly small with a few big grains
//               (more visual variety than a flat random band). Live via the panel.
//   taper     = mix(1, TIP_SCALE, aPhase) → STRUCTURAL: thick at the streamline
//               root (phase 0), thin at the tip (phase 1). TIP_SCALE = tip fraction.
//   moodScale = EXPRESSIVE: overall size breathing from the live mood (moodToSize.js;
//               heavy → chunkier, bright → finer). Applied as a uniform multiplier.
//   SIZE_FLOOR clamps grain×taper so tips never fully vanish.
export const PARTICLE_SIZE_MIN = 0.28;  // grain band floor
export const PARTICLE_SIZE_MAX = 1.35;  // grain band ceiling (cap the largest instances)
export const PARTICLE_SIZE_POW = 2.5;   // power-law exponent (>1 = many small, few large)
export const PARTICLE_TIP_SCALE = 0.40;  // streamline tip size as a fraction of the root
export const PARTICLE_SIZE_FLOOR = 0.12;  // min grain×taper (anti-vanish clamp)

// Rendered point size multiplier. Smaller for the denser tiled flythrough so
// overlapping instances read as a cloud rather than a solid mass.
export const POINT_SIZE = 0.5;

// ── Particle flow simulation (GPGPU advection) ────────────────────────────────
// Phase 0: particles advect along a velocity field, die when too far from the
// camera or past their lifetime, and are reborn at their shape seed position.
export const SIM_MAX_LIFE = 6.0;              // seconds before forced respawn
export const SIM_LIFE_JITTER = 0.8;              // ± fraction of life, per-particle stagger
export const SIM_FLOW_SPEED = 0.35;             // initial advection speed (world units/sec)
// before the first mood update — see below

// ── Living base field: slow GLOBAL evolution (domain warp) ────────────────────
// The base flow is a BAKED, world-fixed volume, so streamlines never move — which is
// fine for the mesh dots (you read their displacement) but makes the TRAIL bundle look
// frozen: every ribbon re-traces the exact same static streamline each life, so the
// summed silhouette is a still portrait. Instead of swapping the field's seed (which
// would POP/teleport particles + need a re-bake), we warp the SAMPLING COORDINATE with a
// slow, low-frequency animated curl — i.e. time is treated as an extra noise dimension —
// so the streamlines themselves morph continuously and the whole cloud breathes/flows.
// Applied inside instSampleVel (instanceTransform.glsl.js), so BOTH the sim advection and
// the mesh sprite-orientation see the same living field. This is also the groundwork for
// the deferred audio cloud-distort (bass would just push FIELD_WARP_AMOUNT).
//   AMOUNT = how far the sample coordinate is displaced (world units; 0 = frozen/old look)
//   FREQ   = spatial scale of the warp (low = big smooth swells; high = fine wobble)
//   RATE   = how fast the warp pattern drifts through time (evolve speed)
export const FIELD_WARP_AMOUNT = 0.18;  // 0 = static field (old behaviour); ~0.15–0.25 = gently alive
export const FIELD_WARP_FREQ = 0.55;  // low-frequency → coherent large-scale morph, not jitter
export const FIELD_WARP_RATE = 0.06;  // slow drift so the shape evolves over seconds, not frames

// Mood-driven flow speed (uFlowSpeed): the live currentMood maps to an advection
// speed in [FLOW_SPEED_MIN, FLOW_SPEED_MAX]. energy + tempo + dynamism push it up,
// heaviness damps it down (see audio/moodToFlowSpeed.js). Wide range on purpose so
// calm sections barely drift and intense sections rush. Live-tunable in the panel.
export const FLOW_SPEED_MIN = 0.02;   // calm / heavy → slow crawl (slower rest so surge pops)
export const FLOW_SPEED_MAX = 0.38;   // intense baseline ceiling — kept moderate so beat kick still leaps
// Visible bubble radius around the camera. Particles beyond it are recycled to
// the front (conveyor). Larger = farther trails/meshes ahead (more fill cost).
// Pushed out with near fades so the show-zone sits a bit farther from the lens.
export const SIM_KILL_RADIUS = SHAPE_SCALE * 3.05; // ≈ 7.6
// Near fade for meshes: a mesh right in front of the camera balloons and looks bad, so
// fade it out below this distance (fully gone at MESH_NEAR_FADE, back by ~2×). Mirrors
// the trails' near cull but as a soft alpha (meshes don't smear like lines). 0 = off.
export const MESH_NEAR_FADE = 0.70;
// Distance fog for meshes: fully opaque within MESH_FOG_NEAR, fading to transparent by
// MESH_FOG_FAR. Tracks the kill rim so meshes stay solid across most of the bubble.
// Live-tunable (fog near / fog far in the panel).
export const MESH_FOG_NEAR = SHAPE_SCALE * 1.10; // ≈ 2.75 — opaque within this
export const MESH_FOG_FAR = SHAPE_SCALE * 3.00; // ≈ 7.5 — gone by here (near the kill edge)
// Forward-biased ("flying INTO it") transition. The visible bubble is squashed along the
// camera's look axis: the cloud AHEAD stays visible out to the full kill radius (next
// cloud appears early), while BEHIND it fades out at this fraction of that reach (the
// passed cloud clears fast). 1.0 = symmetric (off); lower = more forward-biased. Shared
// by meshes (far fade) + trails (head cull). Live-tunable ('behind reach' slider).
export const CLOUD_BEHIND_FRAC = 0.35;
export const SIM_BIRTH_TIME = 0.45;             // seconds of alpha fade-in after (re)birth
// Symmetric fade-OUT over the last DEATH_TIME seconds of a particle's life, so
// lifetime-expiry respawns ease out instead of popping (the sim stores each
// particle's jittered life in the cell texture's w channel; the render shader
// fades age → life). Fixes the "particles suddenly disappear" mid-view.
export const SIM_DEATH_TIME = 0.6;              // seconds of alpha fade-out before respawn
// Shape-key "Open" bloom timing — longer than alpha fade so flowers ease open/closed.
export const MESH_MORPH_BIRTH_TIME = 1.05;       // seconds Close→Open on appear
export const MESH_MORPH_DEATH_TIME = 1.20;       // seconds Open→Close before despawn
// Unlit emissive boost: final color = (vertexColor × map) × MESH_EMISSIVE (self-lit look).
export const MESH_EMISSIVE = 1.85;
// How strongly vertex color multiplies the map: 0 = texture only, 1 = full vColor × map.
// 1 = full GLB vertex color (triangles); <1 washes toward white (useful when × texture).
export const MESH_VERTEX_COLOR_AMT = 1.0;

// Cheap procedural marble (object-space fbm veins + fresnel). No raymarch / env map.
// Designed for high instance counts — a few noise octaves + rim only.
export const MESH_MARBLE_ENABLED = true;
export const MESH_MARBLE_SCALE = 2.4;   // spatial frequency of veins
export const MESH_MARBLE_WARP = 0.45;  // domain warp (organic streaks)
export const MESH_MARBLE_VEIN = 0.72;  // vein contrast (0 = flat, 1 = sharp)
export const MESH_MARBLE_FRESNEL = 0.40;  // rim glass lift
export const MESH_MARBLE_FRESNEL_POW = 2.8;

// Light VS-only deforms (gated per type via aDeform). Keep amps modest for perf/readability.
export const MESH_PETAL_WAVE_AMT = 0.12;  // petal (pedal) flutter in model space
export const MESH_TRI_FOLD_AMT = 0.35;  // triangle shard fold angle scale (radians-ish)

// Per-particle rotation (render only). Each instance gets its own fixed reference
// axis (→ its own roll, no lockstep) plus a slow constant spin about the flow axis
// at this rate (rad/sec, scaled per-particle) so the mesh cloud turns organically
// while still streaming along the flow. 0 = no spin (fixed per-particle roll only).
export const PARTICLE_SPIN_RATE = 0.35;

// Baked velocity volume: the combined mood field is sampled onto a cubic grid
// (SIM_VOL_RES³) covering world-space [-SIM_VOL_HALF, +SIM_VOL_HALF] on each axis.
// Particles trilinearly sample it each frame to advect.  Rebaked in a Web Worker
// whenever the shape changes.  Half-extent sits just beyond the kill radius so
// dying particles still have a valid velocity.
export const SIM_VOL_RES = 64;
// Field is now sampled in each instance's LOCAL space; half-extent must contain
// the shape (surface ≈ SHAPE_SCALE*1.45). Volume wrapping is ClampToEdge.
export const SIM_VOL_HALF = SHAPE_SCALE * 1.6;   // ≈ 4.0

// ── Instance tiling (world-anchored varied copies) ────────────────────────────
// The shape is stamped on an infinite lattice of period SIM_INST_PERIOD. Each
// cell gets a deterministic rotation + mirror + scale + jitter (hash of the cell
// index) so copies look different while the world stays consistent (fly back →
// same transform). Period < shape diameter → neighbours interpenetrate = no gaps.
export const SIM_INST_PERIOD = SHAPE_SCALE * 1.25; // ≈ 3.125 (tighter tiles / more overlap; was 1.4 → ≈3.5)
export const SIM_INST_JITTER = 0.25;              // cell-origin jitter, fraction of the period
export const SIM_INST_SCALE_MIN = 0.8;
export const SIM_INST_SCALE_MAX = 1.4;

// ── Click paint blooms (persistent, world-anchored) ──────────────────────────
// A click stamps a persistent outward "bloom" force into the world. The full
// set lives on the CPU (cheap); each frame only the nearest BLOOM_MAX_ACTIVE
// within reach of the camera are uploaded to the sim shader (camera windowing),
// so GPU cost stays bounded no matter how much you paint.
export const BLOOM_MAX_ACTIVE = 32;                 // max blooms sent to the GPU at once
export const BLOOM_RADIUS = SHAPE_SCALE * 0.42; // ≈ 1.05 — base influence radius (world units)
// Distance-based radius: a mark's radius scales with how far the clicked point is from the
// camera at click time — FAR clicks bloom BIGGER, NEAR clicks SMALLER (keeps the apparent
// on-screen size more consistent, since far things project smaller). Linearly interpolated
// between NEAR_MUL @ DIST_NEAR and FAR_MUL @ DIST_FAR (clamped), on top of the mood radius.
export const BLOOM_RADIUS_DIST_NEAR = 1.0;              // world distance treated as "near"
export const BLOOM_RADIUS_DIST_FAR = SIM_KILL_RADIUS;  // ≈ 6.0 — "far" (edge of the live bubble)
export const BLOOM_RADIUS_NEAR_MUL = 0.6;              // radius multiplier for near clicks
export const BLOOM_RADIUS_FAR_MUL = 1.45;             // radius multiplier for far clicks
// Firework envelope: explosive snap to peak → FAST energy dump → soft residual tail,
// then fully off (SUSTAIN 0). Persistence lives in the SHAPE redirect, not the burst.
// outwardEnvelope blends two exponentials: mostly DECAY_TAU early, DECAY_SOFT later.
export const BLOOM_STRENGTH = 3.8;                // peak outward push (world units / sec) — hard initial hit
export const BLOOM_ATTACK = 0.03;               // seconds to peak (shorter = snappier explosion)
export const BLOOM_DECAY_TAU = 0.22;               // fast dump time constant (most of the pop dies here)
export const BLOOM_DECAY_SOFT_TAU = 0.85;           // soft residual tail after the dump
export const BLOOM_DECAY_FAST_W = 0.78;           // 0..1 — weight on the fast term (rest = soft)
export const BLOOM_SUSTAIN = 0.0;                // burst floor — 0 so the pop fully decays
// Ink-spread: after the burst, the radius keeps easing outward (slower than the
// force decays) and settles at (1 + BLOOM_GROWTH)× the initial radius.
export const BLOOM_GROWTH = 0.75;               // extra radius fraction the bloom spreads to
export const BLOOM_GROW_TAU = 1.2;                // seconds; spread time constant — lowered so the shape opens up FAST then settles (feel the speed)
export const BLOOM_CURL_RAMP = 0.4;                // seconds for the tangle field to settle in (then persists)
export const BLOOM_OPEN_TIME = 1.4;                // seconds for the petals archetype to open ring-by-ring (rose)

// Paint accumulation management (LRU soft-fade). Marks are world-anchored and used to
// persist forever → heavy painting piled up overlapping whirlpools that captured & froze
// trails. Now a mark holds full for BLOOM_HOLD sec, then fades its shape weight smoothly to
// 0 over BLOOM_FADE sec — as it fades, the redirect weakens and the life-boost drops, so
// captured trails release and recycle (clutter self-clears). Fully-faded marks are pruned,
// and the store is capped to BLOOM_MAX_STORED most-recent marks so it can't grow unbounded.
export const BLOOM_HOLD = 10.0;               // seconds at full strength before fading
export const BLOOM_FADE = 20.0;               // seconds to fade from full → gone (≈30s total life)
export const BLOOM_MAX_STORED = 96;                 // hard cap on stored marks (oldest dropped on overflow)
// Ink COLOUR stain: separate from shape redirect. Colour stays while the mark is stored
// (shape may already have faded). Wider + slower growth than shape → ink bleed.
export const BLOOM_COLOR_RADIUS_MUL = 1.55;         // colour stain vs shape radius at t=0
export const BLOOM_COLOR_GROWTH = 1.35;         // extra fraction colour radius spreads to
export const BLOOM_COLOR_GROW_TAU = 2.8;          // slower ink bleed than shape open
export const BLOOM_COLOR_LIFE = 180.0;        // seconds colour mark stays (LRU still caps store)
// Per-click paint hue: mood family + shift + jitter (snapshotted on bloom.add).
// Must sit outside TRAIL_HUE_JITTER (±0.28) so ink never reads as “same as main”.
export const BLOOM_PAINT_HUE_SHIFT = 0.34; // paint = live main hue + this (drifts with main)
export const BLOOM_PAINT_HUE_JITTER = 0.14; // per-click scatter around the paint palette
export const BLOOM_PAINT_HUE_REPLACE_SHIFT = 0.18; // extra hue jump when re-painting the same spot
export const BLOOM_PAINT_SAT = 0.95;
export const BLOOM_PAINT_LIT = 0.52;
// Re-paint: a new click within this distance of an existing mark replaces that stain's colour.
export const BLOOM_COLOR_REPLACE_DIST = SHAPE_SCALE * 0.55; // ≈ 1.375 world units

// Bloom shape (reworked): a bloom REDIRECTS the base flow through a localized
// archetype direction field at the same speed — so particles fold into a distinct
// persistent shape WITHOUT accelerating. A separate transient BURST (outward +
// shaped) gives the click "pop" and fully decays.
// These modulators are global (one look, live-tunable). The archetype SELECTION
// is per-bloom (snapshotted on add — see bloomField.js); Phase 3 drives it from mood.
export const PAINT_OUTWARD = 1.5;   // burst (outward pop) strength — manual-path base (mood path uses its own range)
export const PAINT_CURL = 1.3;   // shape override weight (>1 saturates the redirect faster → stronger, more permanent whirlpool)
export const PAINT_CURL_FREQ = 2.4;   // field scale in world space (higher = finer / more petals / more cells → detail reads instead of one big blob)
export const PAINT_DETAIL = 0.55;  // sharpness (0 = smooth folds/lobes, 1 = jagged tangles/spikes)
export const PAINT_SHELL = 0.2;   // burst radial profile: 0 = clearing pocket, 1 = mid-radius shell

// Burst DIRECTION balance (radial "push out" vs shaped "fold along the field"). The click
// pop is a blend of a radial outward kick and a push along the archetype field; when the
// radial part dominates, trails just explode straight out without deforming. These tilt the
// SHAPED part up so the pop reads as swirling/folding out instead of a rigid shove:
//   SHAPED = gain on the along-field burst term.
//   WIDEN  = exponent on its (1-t)² falloff — <1 broadens it toward the bloom RIM (so rim
//            trails fold too, not just the core ones). 1 = unchanged (center-weighted).
export const PAINT_BURST_SHAPED = 1.8;
export const PAINT_BURST_WIDEN = 0.5;

// Persistent field ANIMATION: the painted shape is not frozen — its sampling frame
// slowly ROTATES (swirl) and DRIFTS through the noise domain (evolve), so streamlines
// keep moving and ribbons visibly flow through a LIVING whirlpool. Both are gentle
// (rad/sec and world-units/sec); 0 = frozen shape (old behaviour). A few math ops in
// paintApply/paintBurst — see paintField.glsl.js (paintWarp).
export const PAINT_SWIRL_RATE = 0.35;  // rad/sec the shape frame rotates about a per-bloom axis (swirl)
export const PAINT_EVOLVE_RATE = 0.15;  // world-units amplitude of the BOUNDED domain wander (evolve/morph); bounded so geometric archetypes stay valid

// Painted heads live LONGER: while a trail head sits inside the persistent mark, its
// lifetime is stretched by up to this factor (× at the mark core, tapering to 0 at the
// edge), so a ribbon holds the painted shape longer before it recycles. 0 = off. Only
// the trail sim sets this (meshes keep the default 0); see particleSim / gpuTrails.
export const PAINT_LIFE_BOOST = 2.0;   // extra life multiplier at the mark core (2 = up to 3× lifetime)

// Post-surge DRIFT (trails only): after the firework burst fully decays, painted ribbons
// would otherwise sit dead-still. This keeps a tiny PERSISTENT outward creep — the same
// radial pop silhouette, but weighted by the SETTLED shape (shapeWeight, not the transient
// burst) so it only lives where a mark persists and fades out with the LRU soft-fade. It's
// self-limiting: as a head creeps toward the bloom rim the (1-t)² falloff eases it to 0, so
// the mark slowly spreads and settles instead of freezing. World units/sec-ish (× the pop
// profile), so keep it WELL under SIM_FLOW_SPEED (0.35). Only the trail sim sets this
// (meshes keep 0 — no creep, so the cloud doesn't evacuate its marks); see gpuTrails.
export const PAINT_DRIFT = 1.8;   // post-surge creep speed for settled painted trails (0 = frozen after surge)
// Creep DIRECTION balance (was 100% radial → spikes after every bloom, archetype ignored).
// SHAPED = along the archetype field (keeps growing as curls/rings/cells); RADIAL = leftover
// outward push (small). Sum doesn't need to be 1 — both scale with uPaintDrift.
export const PAINT_DRIFT_SHAPED = 1.0;  // post-surge creep along the archetype field
export const PAINT_DRIFT_RADIAL = 0.12; // small radial floor so the core doesn't freeze

// Archetype selection (dominant + one blend partner, "top-2").
//   0 CURL · 1 VORTEX · 2 LIGHTNING · 3 SMOKE RING · 4 CELLS
export const PAINT_ARCH_A = 0;     // dominant archetype index
export const PAINT_ARCH_B = 1;     // blend-partner archetype index
export const PAINT_BLEND = 0.35;  // partner weight (0 = pure dominant .. 0.5 = equal mix)

// ── Click picking (cluster-based) ─────────────────────────────────────────────
// A click gathers every particle whose projected position is within
// PICK_PIXEL_RADIUS of the cursor, scores each by local density (neighbours
// within PICK_CLUSTER_RADIUS in world space), then picks the NEAREST candidate
// whose density ≥ PICK_CLUSTER_MIN (the front-most visible clump). If none reach
// that, it falls back to the candidate closest to the cursor (sparse clicks still
// count). The bloom lands at the winning cluster's centroid. Nothing under the
// cursor → no-op (clicking the void does nothing).
export const PICK_PIXEL_RADIUS = 34;    // cursor tolerance (screen px) — widened again: most "clicked but nothing happened" misses are void no-ops (nothing at all within radius), not cluster-threshold rejections
export const PICK_CLUSTER_RADIUS = 0.5;   // world radius that defines a "clump"
export const PICK_CLUSTER_MIN = 2;     // min neighbours within radius to be a cluster — lowered so sparser clumps still register as real clusters
export const PICK_LENS_GUARD = 0.4;   // ignore particles closer than this (nearer paint than 0.5)
// A pointerdown→pointerup pair is only treated as a click (vs. a camera-steer
// drag) if it moves less than this many screen px. 6 was too tight — ordinary
// mouse/trackpad clicks routinely drift more than that between press and
// release, so a real "I clicked a particle" attempt was silently swallowed as
// a steering drag before pick() ever ran (no fallback, no log — just nothing).
export const PICK_DRAG_TOLERANCE_PX = 14;

// ── Camera flight (infinite flythrough) ───────────────────────────────────────
export const FLY_SPEED = 0.12;   // base forward speed (world units / sec); scaled by mood each frame
// Mood → fly scale via moodToFlySpeed (tempo-led). Actual speed = FLY_SPEED × scale.
export const FLY_SPEED_SCALE_MIN = 0.35; // slow-tempo / calm — much slower cruise
export const FLY_SPEED_SCALE_MAX = 2.40; // fast-tempo / intense — strong flythrough

// Initial camera framing (pull back + aim at home-cell centroid). Kept inside the kill
// bubble so the far side of the shape still reads. A bit further back than "just outside
// the core" so the first fly-in shows the form before you reach the front edge.
export const CAMERA_FRAME_DIST = SHAPE_SCALE * 1.28; // ≈ 3.2 — slightly behind the form, looking in
export const FLY_SENSITIVITY = 0.0026; // radians of turn per pixel dragged (desktop; boosted on narrow screens)
export const FLY_DAMPING = 0.08;   // steering smoothing (per-frame lerp toward target)
export const FLY_MAX_PITCH = 1.35;   // clamp pitch (radians) to avoid gimbal flip

// World-space size of each cube particle (scaled by per-particle aSize).
export const CUBE_SCALE = 0.030;

// Instanced particle meshes — five named type libraries (see public/models/README.md).
// Mood picks 1 major + 2 accents once at track bake (moodToMeshMix.js); counts are
// cost-weighted from MESH_BUDGET (triangle-equivalent units).
export const USE_MODEL = true;
export const MESH_BUDGET = 5000;
// Mood RGB overlay on vertex colour (0 = VC only, 1 = full VC × moodRgb).
export const MESH_MOOD_COLOR_AMT = 0.65;
// Per-type mesh colour roles (aHueOff baked at mesh-mix): all stay on the mood family;
// major = small scatter; accents = larger directed hue shifts (not complement).
export const MESH_MAJOR_HUE_JITTER = 0.06; // ± around mood hue for major type
export const MESH_ACCENT_HUE_SHIFT = 0.11; // accent A base offset from main
export const MESH_ACCENT_B_HUE_SHIFT = 0.20; // accent B further along the wheel
export const MESH_ACCENT_HUE_JITTER = 0.05; // ± scatter within each accent band

/** @type {Record<string, {
 *   id: string, folder: string, srcs: string[], map: string|null,
 *   scales: number[], cost: number, sizeMul: number, marble: boolean
 * }>} */
export const MESH_TYPES = {
  triangle: {
    id: 'triangle',
    folder: 'type01',
    srcs: [
      '/models/type01/triangle_01.glb',
      '/models/type01/triangle_02.glb',
      '/models/type01/triangle_03.glb',
      '/models/type01/triangle_04.glb',
    ].map(assetUrl),
    map: null,
    scales: [1.9, 1.6, 1.35, 1.0],
    cost: 1.0,
    sizeMul: 0.85,
    marble: false,
  },
  flower: {
    id: 'flower',
    folder: 'type02',
    srcs: [
      '/models/type02/flower_01.glb',
      '/models/type02/flower_02.glb',
      '/models/type02/flower_03.glb',
    ].map(assetUrl),
    map: assetUrl('/models/type02/flower_texture.jpg'),
    scales: [1.45, 1.2, 1.0],
    cost: 2.0,
    // Fewer instances (cost 2.0) — size up so they still read in the mix.
    sizeMul: 1.28,
    marble: false,
  },
  pedal: {
    id: 'pedal',
    folder: 'type03',
    srcs: ['/models/type03/pedal.glb'].map(assetUrl),
    map: assetUrl('/models/type03/pedal_texture.jpg'),
    scales: [1.25],
    cost: 2.4,
    // Heaviest cost — size up so sparse instances still read.
    sizeMul: 1.32,
    marble: false,
  },
  rock: {
    id: 'rock',
    folder: 'type04',
    srcs: [
      '/models/type04/rock_01.glb',
      '/models/type04/rock_02.glb',
      '/models/type04/rock_03.glb',
    ].map(assetUrl),
    map: null,
    scales: [1.4, 1.2, 1.0],
    cost: 1.3,
    sizeMul: 1.05,
    marble: false,
  },
  marble: {
    id: 'marble',
    folder: 'type05',
    srcs: ['/models/type05/marble.glb'].map(assetUrl),
    map: null,
    scales: [1.25],
    cost: 1.6,
    sizeMul: 0.95,
    marble: true,
  },
};

// Neutral marble default until mood mix bakes. Prefer MESH_TYPES.
export const MODEL_SCALES = MESH_TYPES.marble.scales;

// ── Particle trails (GPU ribbons) ─────────────────────────────────────────────
// A separate element (NOT attached to the mesh particles): heads flow along the
// same baked velocity volume and draw recent path as thin glowing ribbons.
// Implemented in gpuTrails.js. Recycled around the camera like the cloud, and
// speed rides the live mood/audio flow speed so it belongs.
export const TRAIL_ENABLED = true;
export const TRAIL_COUNT = 12000;    // GPU trails (gpuTrails.js). Density-clustered into dense regions (TRAIL_CLUSTER_BIAS); sparse regions are mesh-only.
// Trails seed preferentially in DENSE regions of the shape so they form bundles/clusters
// instead of lonely filaments. Each trail's home seed is drawn ∝ localDensity^BIAS:
//   0 = uniform (old behaviour, trails everywhere), 1 = ∝ density, 2–3 = tight clusters.
// Sparse regions then get few/no trails → those are covered by mesh particles. Computed
// once at load / base-shape change via a grid-hash neighbour count (seedDensity.js).
export const TRAIL_CLUSTER_BIAS = 2.0;
export const TRAIL_HISTORY = 32;       // recorded points per trail. Baseline vert/VRAM cost ∝ this. Longer ribbons.
// Ribbon curve smoothing: each history segment is subdivided into this many drawn
// segments, following a Catmull-Rom spline through the recorded points (so bends read
// smooth, not faceted). 1 = off (straight between points). Costs verts + fill ∝ this.
export const TRAIL_SMOOTH_SUB = 4;       // Catmull-Rom subdivisions per history segment (higher = smoother growth/curves)

// Adaptive history recording. Instead of a fixed timer,
// each trail stores a new point when its head has moved SAMPLE_MAX_DIST (straight) OR
// turned past SAMPLE_TURN_DEG (a bend). So the fixed HISTORY budget spends its points
// where the curve needs them: dense on bends, sparse on straights → curvier trails read
// smoother at the SAME vertex count. SAMPLE_MIN_DIST floors the spacing so a tight kink
// can't record every frame. Trade-off: trail LENGTH now varies with curvature (straight
// ≈ MAX×HISTORY long, curvy shorter), bounded by [MIN,MAX]×HISTORY, and is speed-
// independent (distance-based, so trails no longer shrink when the flow slows).
export const TRAIL_SAMPLE_MIN_DIST = 0.025;  // min world spacing (floor) — slightly tighter so growth steps are smaller/smoother
export const TRAIL_SAMPLE_MAX_DIST = 0.080;  // max spacing on straights — tighter → more frequent records → less stepped grow
export const TRAIL_SAMPLE_TURN_DEG = 9.0;    // record a point once the heading turns this many degrees

// Paint keeps trail LENGTH: click-blooms curl the head hard, and the adaptive recorder
// would otherwise bunch all the points onto that tiny curl → the ribbon collapses to a
// stub. So WHILE blooms are active the spacing floor is raised near MAX_DIST (spacing
// goes near-uniform → length ≈ MAX×HISTORY), so trails BEND through the painted shape
// instead of shrinking. Free (just a different number fed to the advance pass). Lower it
// toward SAMPLE_MIN_DIST if you'd rather keep full adaptive detail while painting.
export const TRAIL_SAMPLE_PAINT_MIN_DIST = 0.060;
export const TRAIL_SPEED = 0.5;      // flow-speed multiplier vs the sim's mood/audio flow speed (1.0 = move with the meshes)
export const TRAIL_OPACITY = 0.85;     // ribbon coverage (alpha) at the head — 1 = fully solid
// Soft-additive glow (SrcAlpha/One). Hybrid look (B): keep at 0 → NormalBlending so
// opacity/coverage can actually hit 1; emission comes from TRAIL_EMISSIVE on RGB instead.
// >0 re-enables soft-add (glow, but coverage never reads solid).
export const TRAIL_SOFT_ADD = 0.0;
// RGB brightness boost before tone-map (hybrid emission without soft-add). 1 = mood lit only.
export const TRAIL_EMISSIVE = 1.55;  // ribbon glow / fake bloom body
// Same-pass soft fringe: outer ribbon edge gets extra RGB (fake halo) while core stays
// solid NormalBlending. Higher = wider/brighter edge bloom.
export const TRAIL_FRINGE = 1.05;
export const TRAIL_COLOR = 0x6cc6ff; // base colour
export const TRAIL_PAINT_COLOR_AMT = 1.0; // 0 = off, 1 = full ink at stain core
export const TRAIL_HUE_JITTER = 0.28;    // per-trail hue variation around mood colour (wider family)
// Sparse contrast spice: a small fraction of ribbons take a near-complement hue so the
// field isn't one flat mood wash. Hashed per trail index (stable), not random flicker.
export const TRAIL_CONTRAST_FRAC = 0.05; // ~5% of trails
export const TRAIL_CONTRAST_HUE = 0.48;  // hue wrap offset (≈ complement)
export const TRAIL_CONTRAST_SAT = 0.10;  // extra sat on those ribbons
export const TRAIL_CONTRAST_LIT = 1.0;   // lightness multiplier (1 = keep mood lit)

// Trail base colour from music/mood (moodToTrailColor → uColorHSL). Slow continuous drift,
// plus rare BIG-beat swift changes (bloom-like: fast then smooth settle — not every surge).
export const TRAIL_COLOR_DRIFT = 0.12; // per-second ease toward mood colour (slow section drift)
export const TRAIL_COLOR_BEAT_DRIFT = 4.5;  // per-second ease during a big-beat colour surge (swift)
export const TRAIL_COLOR_BEAT_DECAY = 0.90; // seconds for the big-beat colour surge envelope → 0
export const TRAIL_COLOR_BEAT_LOUD = 0.55; // loudness gate — only beats at/above this fire a colour change
export const TRAIL_COLOR_BEAT_COOLDOWN = 2.0; // min seconds between colour beats (keeps them seldom)
export const TRAIL_COLOR_BEAT_HUE = 0.05; // extra hue nudge on a big-beat hit (shortest-path wrap)
// Atmospheric depth on ribbons: farther heads → less sat, slightly higher lit.
// (Toned down — was reading as blown-out white at far reach: less lit boost,
// milder desaturation, and more fade so far trails recede instead of glowing.)
export const TRAIL_FAR_SAT_MUL = 0.72;   // sat multiplier at far reach (1 = no change)
export const TRAIL_FAR_LIT_ADD = 0.06;   // lightness add at far reach
export const TRAIL_FAR_OPACITY_MUL = 0.42; // alpha multiplier at far reach (air / depth)
// If whole-track windowed colour barely moves, force one mid-song hue retarget (smooth).
export const TRAIL_COLOR_FORCE_SPAN = 0.06; // max hue span → treat as "never changes"
export const TRAIL_COLOR_FORCE_HUE = 0.38; // forced mid-song hue shift (smooth retarget, not a surge)
export const TRAIL_COLOR_FORCE_AT = 0.50; // fraction of duration (0.5 = middle)
export const TRAIL_FADE_POW = 1.15;     // tail falloff curve (higher = brighter head, faster fade)

// Traveling brightness PULSE along the ribbon (perceptual "current"): even with the base
// field now morphing, a static-ish path reads as more alive if light visibly RUNS along it
// head→tail, like charge through a wire. A low-frequency brightness wave scrolls down each
// trail's length over time, per-trail phase-offset so they don't blink in lockstep. Purely
// a render effect (RIBBON_VERT) — no motion/state change. Modulates brightness (+ a touch of
// alpha). 0 strength = off (flat ribbon).
export const TRAIL_PULSE_STRENGTH = 0.58; // brightness modulation depth (0 = off, 1 = strong dark↔bright banding)
export const TRAIL_PULSE_SPEED = 1.0;  // how fast the pulse travels head→tail (waves/sec)
export const TRAIL_PULSE_DENSITY = 1.6;  // number of pulse waves along the full trail length

// Animated trail SPAWN (trails only): with one fixed shape-seed per trail, every ribbon
// re-traces the same streamline each life → the summed bundle looks frozen. Two levers, both
// SAFE because the record pass collapses the ribbon onto the head on respawn (no streak):
//   CHURN  — on respawn the trail adopts a slowly-drifting seed INDEX (seeds/sec), so which
//            streamline it occupies gently reshuffles over time → different places light up.
//            The seed set is preserved (we permute it), so the overall shape density holds.
//   DRIFT  — additionally slide the spawn a little DOWNSTREAM along its flow line (world
//            units), with the offset animated over time (DRIFT_RATE), so births travel along
//            the path. Coherent accent (doesn't change the envelope, just where trails start).
// Both 0 = old fixed-seed behaviour. Mesh sim keeps 0 (only the trail sim raises them).
export const TRAIL_SPAWN_CHURN = 0.50; // seeds/sec the adopted seed index drifts (0 = fixed seed)
// Mood maps into [MIN, MAX] each frame (moodToSpawnDrift) — intense → more downstream birth travel.
export const TRAIL_SPAWN_DRIFT_MIN = 0.12; // calm / planted
export const TRAIL_SPAWN_DRIFT_MAX = 0.80; // intense / restless
export const TRAIL_SPAWN_DRIFT = 0.30; // initial / mid default before mood write
export const TRAIL_SPAWN_DRIFT_RATE = 0.10; // how fast the downstream offset phase cycles (per sec)

// ── Phase B: cluster-local beat displacement ──────────────────────────────────
// On each precomputed beat, punch the particles LOCALLY (per region), not as one global
// breathe — we fly inside the cloud, so it must beat around you. A render-time, non-
// accumulating offset added to BOTH mesh dots and trail ribbons from a smooth world-space
// VECTOR field (see beatField.glsl.js): each cluster jolts in its own direction, all on the
// same beat. Between beats the pulse → 0 so particles rest on their true position.
//   AMT   = punch magnitude (world units) at a full beat. Cap it so a beat during a paint
//           burst doesn't over-fling. 0 = off.
//   FREQ  = cluster field frequency; CLUSTER SIZE ≈ 1/FREQ. Keep LOW so trails stay smooth
//           (cluster ≫ history point spacing) or ribbons shatter. ~0.6 → clusters ≈ 1.6 units.
//   DRIFT = world-units/sec the cluster field slowly drifts (so clusters aren't world-pinned).
// RETIRED — beat displacement caused dizziness while flying (mesh + trails). Kept at 0 so the
// shared shader early-outs; musical trail reaction moved to thickness + pulse (TRAIL_AUDIO_*).
export const BEAT_DISPLACE_AMT = 0.0;   // MESH beat punch OFF (dizzy)
export const BEAT_DISPLACE_AMT_TRAIL = 0.0;   // TRAIL beat punch OFF
export const BEAT_DISPLACE_FREQ = 0.6;   // cluster field freq (cluster size ≈ 1/freq); keep low for trail-safety
export const BEAT_FIELD_DRIFT = 0.05;  // slow drift of the cluster field (world-units/sec)

// Trail DEATH reel-in: birth already grows the ribbon out from a collapsed point (record pass
// collapses on respawn); this mirrors it at the END. In the last TRAIL_DEATH_TIME seconds of a
// head's life, the drawn ribbon length is clamped down so the TAIL retracts toward the head —
// the ribbon shrinks to a point and vanishes, giving an "ending" instead of a flat fade. Only
// age-death animates (distance/behind recycling still uses the forward-biased fade). Needs the
// sim age+life bound to the ribbon (RIBBON_VERT). 0 = off (instant collapse, old behaviour).
export const TRAIL_DEATH_TIME = 0.7;   // seconds the tail takes to reel into the head at end-of-life
// A SUBTLE whole-ribbon fade layered on the reel-in: over the death window the ribbon dims to
// this alpha FLOOR (not to 0), so the geometric retraction stays the primary "ending" and the
// fade just softens the last moment. 1 = no fade (pure retraction), 0 = fades fully to gone.
export const TRAIL_DEATH_FADE_FLOOR = 0.5;

// Trails render as camera-facing QUAD RIBBONS (not 1px lines — WebGL caps lineWidth at
// 1px), so each trail has a real, per-trail WIDTH. Width is world-space (far trails
// shrink → cheaper fill) and hashed per trail, skewed toward thin so most trails stay
// cheap and only some are fat. Soft edges keep the fat ones from looking blocky.
// Fill-rate scales with width — mitigated by the half-res buffer + distance cull.
export const TRAIL_WIDTH = 0.0055;  // max world-space ribbon width (thickest trails); thinner resting base — audio thickness still swells on beat
export const TRAIL_WIDTH_VAR = 0.90;    // per-trail width spread (0 = all same width, 1 = ~0…WIDTH)
// Distribution of per-trail width: >1 pushes trails toward the THIN and THICK extremes
// (fewer mediums → more contrast), 1 = linear/uniform, <1 = bunched in the middle.
export const TRAIL_WIDTH_CONTRAST = 3.5;
// Fraction of trails in the THIN group (rest are thick). Higher = more thin, fewer fat.
export const TRAIL_THIN_RATIO = 0.9;

// Along-length thickness shaping (varies width WITHIN a single trail — see gpuTrails
// RIBBON_VERT). Two effects layer on top of the per-trail base width:
//  1. Head/tail taper — each end thins to a point over this fraction of the trail length.
//  2. Curvature swell — the ribbon gets THICKER where the path bends (curls/whirlpools)
//     and thinner on straights, so the swirling motion reads as bulges.
export const TRAIL_TAPER_HEAD = 0.12;   // head taper length (fraction of the trail)
export const TRAIL_TAPER_TAIL = 0.18;   // tail taper length (fraction of the trail)
export const TRAIL_CURVE_WIDTH = 1.7;    // width multiplier at max curvature (1 = flat, >1 = thicker on bends)
export const TRAIL_CURVE_SCALE = 0.5;    // curvature sensitivity: maps geometric κ (1/radius) → 0..1

// GPU-trail fill-rate controls (gpuTrails.js). Trails now draw straight into the main
// framebuffer (sharing the meshes' depth so meshes occlude them), and each trail is
// culled/faded by its head's distance to the camera so the closest ones (which smear
// across the whole screen) and the far edge don't waste fragments.
export const TRAIL_NEAR_CULL = 0.95;     // cull trails whose head is nearer than this (world units)
// Safety cap above kill (≈6.0); forward reach is still min(farCull, kill) so kill binds.
export const TRAIL_FAR_CULL = SIM_KILL_RADIUS * 1.1; // ≈ 6.6

// Trail audio reactivity (Phase A) — driven by the SAME AudioMotion source as the
// meshes (main.js passes {beat, loud} into trail.update), so beats hit both together.
// Complementary channels: meshes pop SIZE, trails flare BRIGHTNESS + stretch LENGTH +
// get a speed WHIP. All are amounts layered on top of the base slider values.
// Set to 0 to disable a channel.
export const TRAIL_AUDIO_BEAT_WHIP = 1.4;  // beat → extra transient trail-speed surge (× on top of shared flow). Raised so trails punch harder on the beat than the meshes
export const TRAIL_AUDIO_LENGTH = 0.5;  // loudness → sustained trail lengthening (eases the max sample spacing up)
export const TRAIL_AUDIO_GLOW_BEAT = 0.35; // beat → transient brightness/opacity flare
export const TRAIL_AUDIO_GLOW_LOUD = 0.75; // how strongly loudness drives the opacity breathe (1 = full 0.6→1 range)
// Opacity breathe floor: quiet sections sit at this × baseOpacity, loud sections at 1× (was feeling 0↔1).
export const TRAIL_OPACITY_BREATH_MIN = 0.88;
// Appearance-only musical reactions (NO geometry wobble — displacement retired as dizzy):
export const TRAIL_AUDIO_THICKNESS = 0.55; // beat → ribbon width swell (path stays put)
export const TRAIL_AUDIO_PULSE_BEAT = 0.70; // beat → traveling-pulse strength boost
export const TRAIL_AUDIO_PULSE_LOUD = 0.35; // loudness → sustained pulse strength
export const TRAIL_AUDIO_PULSE_SPEED = 0.0;  // beat → pulse travel-speed surge OFF (even tiny gains read as flashing)

// How much click-paint (blooms) bends the TRAILS, independent of the meshes (which
// are always full = 1.0). 0 = trails ignore paint, 1 = same as meshes. See gpuTrails
// (sets the trail sim's uPaintStrength) + bloomField.syncUniforms.
export const TRAIL_PAINT_STRENGTH = 1.0;

// How strongly a click's BURST bends the frozen trail HISTORY (the tail), so the whole
// existing ribbon blooms on click instead of only the head-forward path growing new
// streaks. 0 = tail stays frozen (old behaviour), 1 = tail pops ~like the head. The
// record pass displaces every history slot by paintBurst() (gpuTrails.js); it's free
// when no bloom is active.
export const TRAIL_TAIL_BURST = 1.3;

// Tail-bend is TRANSIENT: the record pass only displaces the history for this many
// seconds after a click, then goes free again (the burst has mostly decayed by then).
// Keeps the whole-ribbon bloom a "pop-and-settle" and avoids a persistent per-frame
// cost while blooms linger near the camera. See gpuTrails.js.
export const TRAIL_TAIL_BURST_WINDOW = 1.2;

// The tail-bend accumulates (each frame adds the burst to the already-displaced history),
// so an unbounded burst flings the whole ribbon out of the bloom → it shoots away/vanishes.
// The record pass caps the PER-FRAME displacement, and — crucially — that cap is now
// FIREWORK-SHAPED over the burst window (gpuTrails.update): full at the click, decaying
// smoothly to 0 by TRAIL_TAIL_BURST_WINDOW. Because the CAP (not the raw burst) governs
// the ribbon's outward SPEED, the bloom reads as fast-then-slow and eases to a DEAD STOP
// (no cliff), while the total displacement stays bounded (∝ area under the curve → settles
// inside BLOOM_RADIUS ≈ 1.375). This value is the PEAK budget (world units/frame at t=0).
export const TRAIL_TAIL_BURST_MAX = 0.09;
// Firework falloff: how sharply the per-frame budget decays across the window. Higher =
// faster initial bloom + longer gentle tail (more "firework" CONTRAST); ~1 ≈ linear. The
// curve is exp(-F·x) normalized to hit exactly 0 at the window end, so there's never a hard
// stop. Raised to 5 (with the peak bumped to keep reach) for a punchier fast→slow contrast.
export const TRAIL_TAIL_BURST_FALLOFF = 5.0;

// ── Scene ─────────────────────────────────────────────────────────────────────
export const BG_COLOR = 0x030308;   // clear-color fallback when gradient is off
export const CAMERA_FOV = 58;

// Mood vertical gradient (bottom dark → top bright). Hue related to trail colour
// via similar↔contrast axis from energy+dynamism — see moodToBgGradient.js.
// Theme BGs share BgColorMotion wash; structure differs. One theme draw at a time.
// Mood select (moodToBgType.js) picks cosmos|clouds|leaks at track bake when enabled.
export const BG_SELECT_MOOD = true;
// Fallback when BG_SELECT_MOOD is false.
export const BG_TYPE = 'clouds';

// BG type 1 — starry cosmos. Mood wash + nebula + multi-scale stars. Top-biased.
export const STARRY_STAR_BRIGHTNESS = 1.55; // layered micro → hero stars (pop on dark wash)
export const STARRY_DENSITY = 1.35;
export const STARRY_NEBULA_STRENGTH = 0.72; // quieter nebula so space reads darker
export const STARRY_TOP_BIAS = 0.9;         // 0 = flat elev; 1 = strong top-bright / bottom-dark

// BG type 2 — abstract cloud sky (cirrus / brushstroke wisps). Mood wash + anisotropic fbm.
// Cost ≈ cosmos (4-oct × 3 sheets, no star cells). Top denser/brighter, bottom darker/sparse.
export const CLOUD_SKY_STRENGTH = 0.16;   // wisp coverage / mix into wash (keep soft so particles pop)
export const CLOUD_SKY_TOP_BIAS = 0.9;    // elevation bias strength
export const CLOUD_SKY_STRETCH = 2.8;    // horizontal stretch (>1 = longer streaks)
export const CLOUD_SKY_DRIFT = 0.012;  // slow sheet drift (0 = static)

// BG type 3 — blurry light leak / soft bokeh. Mood wash + large soft discs + mild chroma fringe.
export const LIGHT_LEAK_STRENGTH = 0.30;  // leak mix (nudged up after disc count trim)
export const LIGHT_LEAK_TOP_BIAS = 0.92;  // top bright / bottom dark (elevation cue)
export const LIGHT_LEAK_CHROMA = 0.50;  // cheap rim tint (no extra disc samples)
export const LIGHT_LEAK_CAUSTIC = 0.38;  // soap-bubble rim (subtle but present)
export const LIGHT_LEAK_DRIFT = 0.018; // slow blob drift
// Theme-agnostic elevation haze (separate pass over any BG). Fixed tint — not mood-driven.
export const BG_HAZE_ENABLED = true;
export const BG_HAZE_STRENGTH = 0.14;       // overall veil amount (quiet; hard edges read as seams)
export const BG_HAZE_WIDTH = 0.12;       // soft band thickness in elevation space
export const BG_HAZE_DENSITY = 0.55;       // spawn gate — higher = more bands
export const BG_HAZE_BANDS = 7;          // candidate slots (sparse subset actually draws)
export const BG_HAZE_WOBBLE = 0.04;       // bend so bands don’t read as hard horizontals
export const BG_HAZE_COLOR = 0xd0dae8;   // fixed cool-neutral mist
export const BG_COLOR_DRIFT = 0.06;  // slower than TRAIL_COLOR_DRIFT (room tone)
export const BG_CONTRAST_SCALE = 1.0;   // panel scale on relation r (0 = force similar)
export const BG_HUE_ANALOG = 0.06;  // hue offset at r=0 (never clone trails)
export const BG_HUE_COMPLEMENT = 0.50;  // hue offset at r=1 (complement)
export const BG_SAT_SCALE = 1.45;  // sat vs trail-derived band (richer / more saturated sky)
export const BG_REL_ENERGY = 0.55;  // weight in relation r
export const BG_REL_DYNAMISM = 0.45;

// Sparse frozen world dust — tiny static points wrapping in a camera-centered cube for
// flythrough spatial awareness (parallax). Not in the flow sim / paint / trails.
export const FROZEN_DUST_ENABLED = true;
export const FROZEN_DUST_COUNT = 1400;              // sparse field (cheap Points draw)
export const FROZEN_DUST_RADIUS = SHAPE_SCALE * 3.2; // ≈ 8 — wrap-cube half-extent (world)
export const FROZEN_DUST_SIZE = 0.03;              // base point size (perspective-scaled)
export const FROZEN_DUST_SIZE_VAR = 0.95;             // per-point size spread (higher = less uniform)
export const FROZEN_DUST_COLOR = 0xffffff;          // fallback until mood theme writes
export const FROZEN_DUST_OPACITY = 0.75;
export const FROZEN_DUST_NEAR = 0.35;              // fade out near the lens
export const FROZEN_DUST_FAR = SHAPE_SCALE * 3.1; // soft far fade (≈ wrap edge)
// Theme tint (follows trail mood HSL) with wide per-mote hue scatter.
export const FROZEN_DUST_HUE_VAR = 0.32; // ±0.16 around theme hue (trails use ~0.10 jitter)
export const FROZEN_DUST_SAT_SCALE = 0.90; // sat vs theme (slightly softer than ribbons)
export const FROZEN_DUST_LIT_SCALE = 0.85;

// Large soft gaussian ovals — few frozen billboards, mood colour + hue shift, wrap with cam.
export const MOOD_ORBS_ENABLED = true;
export const MOOD_ORBS_COUNT = 12;                 // keep low — cheap but fill-ratey if huge
export const MOOD_ORBS_RADIUS = SHAPE_SCALE * 3.4;  // wrap-cube half-extent
export const MOOD_ORBS_SIZE = 6.5;                // world diameter of a mid orb (large gaussian blob)
export const MOOD_ORBS_SIZE_VAR = 0.85;               // size spread (wider — more small/large contrast)
export const MOOD_ORBS_OPACITY = 0.34;               // more visible veil
export const MOOD_ORBS_EMISSIVE = 1.45;               // RGB boost before tone-map (self-lit read)
export const MOOD_ORBS_NEAR = 2.0;                // fade when too close
export const MOOD_ORBS_FAR = SHAPE_SCALE * 4.2;
export const MOOD_ORBS_HUE_SHIFT = 0.22;               // base offset from live mood hue
export const MOOD_ORBS_HUE_VAR = 0.32;               // per-orb scatter around that (wider spread of colours)
export const MOOD_ORBS_SAT_SCALE = 0.88;
export const MOOD_ORBS_LIT_SCALE = 0.92;
// Circular gaussian point sprite (cheapest option — no geometry at all, just a
// perspective-scaled gl_PointSize dot). Round, so it reads correctly from any
// viewing angle without betraying that it's a billboard (no elongation to give
// it away). GAUSS_K = falloff steepness (higher = tighter/smaller-looking core);
// EDGE_SOFT = where the smooth roll-off to fully transparent begins (0..1 of
// radius) — pushed close to 1 for a gentle edge instead of a visible disc rim.
export const MOOD_ORBS_GAUSS_K = 2.2;
export const MOOD_ORBS_EDGE_SOFT = 0.85;
// After a camera-wrap teleport, an orb eases its opacity in over this many seconds
// (from 0 → full) instead of appearing instantly — kills the "pop into view" when
// flying fast enough to wrap orbs into view range.
export const MOOD_ORBS_WRAP_FADE_TIME = 1.6;

// ── Cover page (attract-mode splash before Start) ─────────────────────────────
// On load: flat black BG, no mesh cloud / mood orbs / haze, camera sits at the
// cloud's center (world origin) and only rotates in place to look around — the
// camera IS the pivot (same steering feel as gameplay's flyControls, just with
// zero forward travel), not an orbit around a distant focus point. Only trails
// + flow dots run — a simple, standalone decorative cloud of glowing streaks/
// dots swirling around the camera, DELIBERATELY independent of the real
// gameplay shape/mood system (no mesh cloud, no per-track shape, no tiling
// lattice, no paint/beat/forward-bias reactivity — see main.js's cover-setup
// comments). A Start button kicks off the transition into the real experience
// (see TRANSITION_* below).
export const COVER_ORBIT_SPEED = 0.03;                // idle auto-drift (rad/sec) when not dragging
export const COVER_ORBIT_SENSITIVITY = 0.0045;            // drag → yaw/pitch radians per pixel (desktop; boosted on narrow screens)
export const COVER_ORBIT_DAMPING = 0.06;                // steering smoothing (per-frame lerp)
export const COVER_ORBIT_MAX_PITCH = 1.3;                 // clamp pitch (radians)
// Cover draws a bit below gameplay resolution (no mesh cloud; sim is throttled).
// 1 = same as gameplay (RENDER_PIXEL_RATIO).
export const COVER_PIXEL_RATIO_MUL = 0.9;
// Single radius (world units, absolute — NOT a fraction of any gameplay
// constant) controlling the cover-only trail/flow-dots cloud: seed positions
// are random points inside a sphere of this radius around the camera (which
// sits at the world origin — see orbitControls.js), and killRadius/farCull
// match it exactly, so the visible population always fills the whole sphere
// (no separate "shell" vs "shape" scale to keep in sync — this replaced an
// earlier multi-constant scheme (COVER_KILL_RADIUS_SCALE × COVER_OUTER_
// TIGHTEN × COVER_SHAPE_SCALE, all fractions of gameplay's SIM_KILL_RADIUS)
// that was fighting itself: shrinking the shell alone left most of the real
// seed positions outside the visible band, reading as "almost no particles").
// Lower = a smaller, tighter cloud right around the camera; higher = a bigger,
// airier one.
export const COVER_CLOUD_RADIUS = 0.95;
// How many separate clumps the cover seed cloud is built from (see
// randomSeedsInSphere in main.js). 1 = the old single core around the
// origin; higher = several blobs scattered inside COVER_CLOUD_RADIUS.
export const COVER_CLUSTER_COUNT = 3;
// How far cluster centers sit from the origin, as a fraction of
// COVER_CLOUD_RADIUS. Higher = clumps spread apart; lower = they pile
// back into one blob in the middle.
export const COVER_CLUSTER_SPREAD = 0.20;
// Each clump's own radius, as a fraction of COVER_CLOUD_RADIUS. Smaller
// = tighter, more distinct blobs; larger = they overlap into one cloud.
export const COVER_CLUSTER_SIZE = 0.50;
// Radial clustering exponent *inside each clump* (see randomPointInSphere
// in main.js) — 1/3 = uniform-in-volume, 1 = denser core / sparser edge,
// higher = tighter toward that clump's center.
export const COVER_CLUSTER_POWER = 1.6;
// Zooms the baked velocity field's sampling coordinates for the cover-only
// bake (see bakeVolume's freqMul param / velocityBaker.worker.js) — the
// field's noise wavelengths are tuned around gameplay's much larger
// SHAPE_SCALE/SIM_KILL_RADIUS, so at cover's tiny COVER_CLOUD_RADIUS only a
// small fraction of one wave is visible, reading as smooth/featureless
// swirl. >1 samples the SAME field zoomed in, packing more full swirl cycles
// into the small visible sphere — pure detail/complexity increase, doesn't
// change the field's shape or the mood mapping itself. 1 = no change.
export const COVER_FIELD_FREQ_MUL = 3.0;
// Cover-page theme colour: random hue each load (like the cluster shape), then
// a slow continuous hue drift from that start. Saturation stays full; lightness
// is lower than gameplay so the swarm sits back without going grey.
// Drift is hue-cycles per second (0.02 ≈ 72° in 10s).
export const COVER_COLOR_S = 1.0;
export const COVER_COLOR_L = 0.26;
export const COVER_HUE_DRIFT = 0.02;
// Cover-only alpha (gameplay keeps TRAIL_OPACITY / FLOW_DOTS_OPACITY).
// Lower than gameplay so additive overlap doesn't bleach toward white.
export const COVER_TRAIL_OPACITY = 0.36;
export const COVER_FLOW_DOTS_OPACITY = 0.36;
// Extra multiplier on top of the proportional coverSizeRatio shrink applied to
// flowDots.size for cover (see main.js's cover-setup) — the dots' base size
// (FLOW_DOTS_SIZE) is tuned for gameplay's much larger SIM_KILL_RADIUS, so
// shrinking it by the SAME ratio as the cloud radius leaves them nearly
// invisible at cover scale. >1 boosts them back up to a comfortably visible
// size without affecting real gameplay (only used in cover-setup/loopBack).
export const COVER_FLOW_DOTS_SIZE_MUL = 4.5;
// Same idea as COVER_FLOW_DOTS_SIZE_MUL but for the trail ribbon width — extra
// multiplier on top of the proportional coverSizeRatio shrink (see main.js's
// cover-setup/loopBack). >1 makes cover trails read as thicker/bolder streaks
// without touching real gameplay's TRAIL_WIDTH.
export const COVER_TRAIL_WIDTH_MUL = 1.8;
// Cover-only tail pinch (gameplay keeps TRAIL_TAPER_TAIL). Longer fraction so
// the thin tail reads in the small, overlapping cover cloud.
export const COVER_TRAIL_TAPER_TAIL = 0.40;
// Cover-only death reel-in (gameplay keeps TRAIL_DEATH_TIME). Cover trails
// live in a small overlapping cloud so the 0.7s retract reads as a snap —
// longer window lets the tail ease into the head.
export const COVER_TRAIL_DEATH_TIME = 1.6;
// Near dead-zone as a fraction of COVER_CLOUD_RADIUS (mirrors gameplay's fixed
// TRAIL_NEAR_CULL/flowDots nearFadeStart, just expressed relative to the
// cover-only radius instead of an absolute gameplay-scale unit).
export const COVER_NEAR_CULL_FRAC = 0.08;
export const COVER_NEAR_FADE_START_FRAC = 0.22;
export const COVER_NEAR_FADE_END_FRAC = 0.6;
// Cover page doesn't need to see far into the distance (everything's blurred
// and pulled in close anyway) — shrink the far clip plane so nothing distant
// even renders. Restored to the normal far plane the instant the cover
// fadeout finishes (see animate()'s fadeOutT>=1 branch — screen is black by
// then, so no visible pop).
export const COVER_CAMERA_FAR = 12;                       // near-clip stays the same, only far shrinks
// The GPGPU sims (mesh/trail/flow-dots) tick every frame even though the cover
// page is fully pre-warmed and mostly hidden/blurred — nothing on the cover
// page needs 60Hz-accurate advection. Skip every other frame and step with a
// doubled dt on the frame that does run, so motion speed is unchanged but the
// GPU only pays for half as many sim passes. Restored to every-frame the
// instant the cover fadeout finishes (see animate()'s fadeOutT>=1 branch).
export const COVER_SIM_TICK_DIV = 1;                      // 1 = every frame (smoother cover flow), 2 = every other frame


// ── Transition (cover → gameplay, on Start click) ─────────────────────────────
export const COVER_FADEOUT_TIME = 2.5;   // seconds: cover trail/dots fade to 0 (also the black-screen hold's start — see main.js's mesh-cloud deferred pre-warm)
export const COVER_CAMERA_EASE_TIME = 4.0;  // seconds: orbit → flight speed-up ramp (0 → full flight speed) — kept >= COVER_FADEOUT_TIME so the camera is still easing up (not already at full flight speed) for the whole visible fade, not just its first couple seconds
// Cubic ease-in for that ramp (and the matching orbit-spin decay). Linear
// felt like the auto-orbit died and forward flight kicked in as two separate
// events; this holds the spin / delays translation at the start.
export function coverCameraEaseIn(t) {
  const x = t < 0 ? 0 : t > 1 ? 1 : t;
  return x * x * x;
}
export const TRANSITION_BG_FADE_TIME = 10.0;  // seconds: BG theme / haze / mood orbs fade in (starts once music starts, after COVER_FADEOUT_TIME)
// Tutorial hint ("Drag to look around") — fades in at the midpoint of the
// 10s gameplay reveal, stays until the player drags (or until the track ends).
export const TUTORIAL_1_SRC = assetUrl('/images/gameplay/tutorial_1.png');
export const TUTORIAL_1_AT = 2.0;            // seconds into TRANSITION_BG_FADE_TIME
export const TUTORIAL_2_SRC = assetUrl('/images/gameplay/tutorial_2.png');
export const TUTORIAL_2_DELAY = 3.0;         // seconds after a drag before tutorial 2 fades in
export const TUTORIAL_FADE_TIME = 0.8;       // seconds: hint fade in / out
// Cover-page look-around hint — pinned to the bottom, breathes, fades out on first drag.
export const COVER_HINT_SRC = assetUrl('/images/cover/hint.png');
export const COVER_HINT_FADE = 0.7;          // seconds: dismiss fade-out
export const COVER_HINT_BREATHE = 2.8;       // seconds per opacity breath cycle
export const TRANSITION_SPAWN_RAMP_TIME = 10.0; // seconds: sparse → full gameplay particle density
// Each particle/trail/dot's OWN individual fade-in duration, in real seconds —
// decoupled from TRANSITION_SPAWN_RAMP_TIME above. Particles/trails/dots each
// get a random "reveal instant" spread evenly across the 10s ramp (so the
// population grows sparse→full at a steady, predictable rate), and once an
// element's reveal instant arrives it fades in over this many seconds. Keeping
// this short relative to the ramp means the population growth you actually
// see matches TRANSITION_SPAWN_RAMP_TIME exactly, while each individual
// element still eases in smoothly instead of a hard pop.
export const TRANSITION_SPAWN_FADE_DUR = 1.5; // seconds: one element's own fade-in length
// Once the spawn ramp's population growth finishes, sim lifetime was being
// suspended (pushed to a huge value) during the ramp so nothing aged-out and
// respawned mid-growth. Snapping it straight back to SIM_MAX_LIFE caused a
// mass simultaneous respawn — every particle/trail/dot whose accumulated age
// already exceeded SIM_MAX_LIFE (a LOT of them, after a 10s ramp) all hit
// "age > life" on the very same frame, reading as the whole cloud suddenly
// jumping/reshaping. Instead, ease the lifetime cap back down gradually over
// this many seconds so those overdue respawns get staggered out naturally
// (life crosses each particle's age at a different moment) instead of firing
// all at once.
export const TRANSITION_LIFE_EASE_TIME = 6.0; // seconds: lifetime cap eases back to SIM_MAX_LIFE

// ── Ending (gameplay → cover, once the track finishes) ────────────────────────
// Mirrors the cover→gameplay transition in reverse: once the audio track's
// native 'ended' event fires (see audioPrecompute.js's onEnded), the whole
// scene (mesh cloud + trail/dots + BG theme/haze/orbs/dust) fades to black
// together over this many seconds, then the cover page's random shape/mood is
// re-rolled and faded back in (see main.js's loopBackToCover), looping back to
// the attract-mode splash with a fresh Start button.
export const ENDING_FADE_TIME = 10.0;   // seconds: whole-scene fade to black on track end
// Result still: one square crop from the fly camera after the first bloom.
// No bloom → skip this phase and loop to cover. Wait until the bloom has
// opened (~0.5s); card holds after the 3D fade.
export const RESULT_CAPTURE_DELAY_SEC = 0.5;
export const RESULT_FADE_TIME = 1.0;    // seconds: result image / ending text fade in / out
export const RESULT_GATHER_TIME = 2.6;  // seconds: particles flow in before the still appears
export const RESULT_BLOOM_TIME = 1.75;  // seconds: 2D pigment burst after accepting the still
export const RESULT_IMAGE_SIZE = 'min(42vmin, 300px)'; // on-screen square size
export const RESULT_END_TEXT_SRC = assetUrl('/images/ending/ending_text.png');
export const RESULT_END_TEXT_SIZE = 'min(42vmin, 300px)'; // width under the paint still
export const RESULT_PAINT_SIZE = 160;   // working resolution for the oil-paint pass
export const RESULT_PAINT_RADIUS = 2;   // neighborhood radius (higher = chunkier strokes)
export const RESULT_PAINT_LEVELS = 18;  // intensity bins (lower = flatter, more poster-like)
export const RESULT_PAINT_SAT = 1.35;   // saturation boost after the smear
export const RESULT_OUTPUT_SIZE = 512;  // upscaled plate shown on screen

// ── Initial load (page-open black hold → cover fade-in) ───────────────────────
// The very first cover-page frame can't actually flow yet: the mood velocity
// volume bake is async (Web Worker, a few frames' latency) and the trail/
// flowDots/mesh GPGPU shaders haven't been JIT-compiled by the driver yet
// (first-use compile stalls). Rather than show a frozen/invisible cloud for
// that window (see main.js's loadingReady gate), the page holds flat black
// (just the Start button) until both are confirmed ready, then fades trail/
// dots in — same spawnFrac population-growth + this fade duration, so they
// arrive already flowing instead of frozen-then-suddenly-moving.
export const INITIAL_LOAD_FADE_TIME = 2.0;   // seconds: cover trail/dots fade in once ready
export const COVER_BGM_SRC = assetUrl('/audio/cover_bgm.mp3');
export const COVER_BGM_VOLUME = 0.7;
export const COVER_BGM_FADE_OUT_TIME = 2.5;  // seconds: Start click → silent (matches cover visual fade)
export const COVER_BGM_FADE_IN_TIME = 4.0;   // seconds: loop-back / first-load rise
export const BUTTON_SFX_SRC = assetUrl('/audio/button.mp3');
export const BUTTON_SFX_VOLUME = 0.6;
export const END_CLICK_SFX_SRC = assetUrl('/audio/end_click.mp3');
export const END_CLICK_SFX_VOLUME = 0.6;
export const END_FADEIN_SFX_SRC = assetUrl('/audio/end_fadeIn.mp3');
export const END_FADEIN_SFX_VOLUME = 0.6;

// ── Audio ─────────────────────────────────────────────────────────────────────
// Playable library. Start (no upload) picks one at random.
export const AUDIO_SRCS = [
  '/audio/song_lulu.mp3',
  '/audio/song_fantasy.mp3',
  '/audio/song_playgod.mp3',
  '/audio/song_OD.mp3',
  '/audio/song_epic.mp3',
  '/audio/song_kaze.mp3',
  '/audio/song_lofi.mp3',
].map(assetUrl);
// Per-track exceptions (library Start only). Omitted keys keep the global defaults.
// startHue = HSL hue 0–1 (orange ≈ 0.08). bgType = 'cosmos' | 'clouds' | 'leaks'.
export const AUDIO_TRACK_OVERRIDES = {
  [assetUrl('/audio/song_lulu.mp3')]: { startHue: 0.08, bgType: 'leaks' },
  [assetUrl('/audio/song_fantasy.mp3')]: { startHue: 0.15 },
  [assetUrl('/audio/song_epic.mp3')]: { startHue: 0.00 },
  [assetUrl('/audio/song_lofi.mp3')]: { startHue: 0.47, bgType: 'leaks' },
  [assetUrl('/audio/song_playgod.mp3')]: { bgType: 'clouds' },
  [assetUrl('/audio/song_OD.mp3')]: { startHue: 0.66, bgType: 'clouds' },
};

// ── Audio animation (Phase A) ─────────────────────────────────────────────────
// Real-time motion layered ON TOP of the mood-driven baked flow (see audioMotion.js
// + main.js). Beats snap instantly then decay (firework feel).
export const AUDIO_BEAT_DECAY = 0.85;  // seconds for a beat pulse to fade to 0 (longer → more readable surge travel)
export const AUDIO_BEAT_FLOW_KICK = 5.20;  // beat → peak flow-speed surge (+× on top) at FULL intensity (was 3.60)
// Quiet beats use this fraction of the kick; loud/intense beats ramp to full kick (drastic on drops).
export const AUDIO_BEAT_KICK_QUIET = 0.38;
export const AUDIO_FLOW_ACCENT = 0.22;  // loudness → sustained baseline lift (kept modest so rest↔surge contrast stays clear)
export const AUDIO_TREBLE_AMT = 0.40;  // treble/brilliance → sustained size shimmer (→ uAudioTreble)
export const AUDIO_BEAT_POP = 0.72; // beat → transient size pop (→ uAudioTreble)
export const AUDIO_BAND_SMOOTH = 12.0;  // per-second EMA rate for the smoothed bands

// ── Time-varying mood (Step 4) ────────────────────────────────────────────────
// The whole-track fingerprint is one static value; during playback we also derive
// a LIVE mood from a short rolling window of the precomputed per-frame features,
// so click-blooms react to the moment (quiet verse → small/soft, drop → big/hard).
// This is CPU-only (a few array averages) and drives blooms ONLY — the baked base
// cloud stays on its static mood (no re-bake), so it costs effectively nothing.
export const MOOD_WINDOW_SEC = 3.0;    // rolling window length used for the live mood
export const MOOD_SMOOTH = 0.90;   // per-update EMA on the live mood (0 = snap, →1 = slow)

// ── Frequency bands — mirrors aijinglemaker.com analyzer exactly ──────────────
export const BAND_SUB_BASS = [20, 60];   // Hz
export const BAND_BASS = [60, 250];   // Hz  ← beat detection source
export const BAND_LOW_MID = [250, 500];   // Hz
export const BAND_MID = [500, 2000];  // Hz
export const BAND_HIGH_MID = [2000, 4000];  // Hz
export const BAND_PRESENCE = [4000, 6000];  // Hz
export const BAND_BRILLIANCE = [6000, 20000]; // Hz

export const AUDIO_TREBLE_SIZE = 1.35;  // master gain on size shimmer + beat pop (shader: 1 + uAudioTreble * gain)

// ── Beat detection — spectral flux on BAND_BASS (60–250 Hz) ──────────────────
// Uses LINEAR magnitudes (not dB) for sharp transient sensitivity.
// Perceptual weighting (2× below 200 Hz) makes kick drums register strongly.
export const BEAT_FLUX_THRESHOLD = 1.4;    // peak must exceed meanFlux × this
export const BEAT_MIN_FLUX = 1e-5;   // absolute floor on linear scale
export const BEAT_COOLDOWN_MS = 250;    // minimum ms between beats
export const BEAT_PEAK_WINDOW = 5;      // frames on each side for local-max check
