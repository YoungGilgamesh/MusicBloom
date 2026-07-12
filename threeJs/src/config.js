// ─── Single source of truth for all scene tunables ───────────────────────────
// Tweak values here; everything imports from this file.

// ── Particle cloud ────────────────────────────────────────────────────────────
// Default budget. main.js honours a ?count=NNNN URL override (tuning harness).
export const CLOUD_COUNT = 40000;

// Scale of the parametric shape (world units). Surface sits at ≈ SHAPE_SCALE from centre.
export const SHAPE_SCALE = 2.5;

// Mood contrast: how hard auto-generated moods (presets, and later audio) are
// pushed toward the extremes for more distinct shapes. 1 = off (identity),
// higher = punchier (highs→1, lows→0). See moodContrast.js.
export const MOOD_CONTRAST = 1.8;

// Half-extents of the volume strands are seeded into (local space).
export const CLOUD_SPREAD = { x: 3.5, y: 2.8, z: 3.5 };

// Size variation per particle (min + random * range).
export const PARTICLE_SIZE_MIN = 0.45;
export const PARTICLE_SIZE_RANGE = 0.35;

// Rendered point size multiplier. Smaller for the denser tiled flythrough so
// overlapping instances read as a cloud rather than a solid mass.
export const POINT_SIZE = 0.5;

// ── Particle flow simulation (GPGPU advection) ────────────────────────────────
// Phase 0: particles advect along a velocity field, die when too far from the
// camera or past their lifetime, and are reborn at their shape seed position.
export const SIM_MAX_LIFE    = 6.0;              // seconds before forced respawn
export const SIM_LIFE_JITTER = 0.8;              // ± fraction of life, per-particle stagger
export const SIM_FLOW_SPEED  = 0.35;             // world units / second (placeholder field)
// Visible bubble radius around the camera. Particles beyond it are recycled to
// the front (conveyor). Short view = dense at a fixed budget; live-tunable.
export const SIM_KILL_RADIUS = SHAPE_SCALE * 1.9; // ≈ 4.75
export const SIM_BIRTH_TIME  = 0.45;             // seconds of alpha fade-in after (re)birth

// Baked velocity volume: the combined mood field is sampled onto a cubic grid
// (SIM_VOL_RES³) covering world-space [-SIM_VOL_HALF, +SIM_VOL_HALF] on each axis.
// Particles trilinearly sample it each frame to advect.  Rebaked in a Web Worker
// whenever the shape changes.  Half-extent sits just beyond the kill radius so
// dying particles still have a valid velocity.
export const SIM_VOL_RES  = 64;
// Field is now sampled in each instance's LOCAL space; half-extent must contain
// the shape (surface ≈ SHAPE_SCALE*1.45). Volume wrapping is ClampToEdge.
export const SIM_VOL_HALF = SHAPE_SCALE * 1.6;   // ≈ 4.0

// ── Instance tiling (world-anchored varied copies) ────────────────────────────
// The shape is stamped on an infinite lattice of period SIM_INST_PERIOD. Each
// cell gets a deterministic rotation + mirror + scale + jitter (hash of the cell
// index) so copies look different while the world stays consistent (fly back →
// same transform). Period < shape diameter → neighbours interpenetrate = no gaps.
export const SIM_INST_PERIOD    = SHAPE_SCALE * 1.4; // ≈ 3.5 (shape radius ≈ 3.6 → heavy overlap)
export const SIM_INST_JITTER    = 0.25;              // cell-origin jitter, fraction of the period
export const SIM_INST_SCALE_MIN = 0.8;
export const SIM_INST_SCALE_MAX = 1.4;

// ── Click paint blooms (persistent, world-anchored) ──────────────────────────
// A click stamps a persistent outward "bloom" force into the world. The full
// set lives on the CPU (cheap); each frame only the nearest BLOOM_MAX_ACTIVE
// within reach of the camera are uploaded to the sim shader (camera windowing),
// so GPU cost stays bounded no matter how much you paint.
export const BLOOM_MAX_ACTIVE = 32;                 // max blooms sent to the GPU at once
export const BLOOM_RADIUS     = SHAPE_SCALE * 0.55; // ≈ 1.375 — influence radius (world units)
// Firework envelope: a near-instant outward burst on click, decaying fast then
// slow (exponential), then settling to a small permanent residual so the mark
// still persists. Click on the beat → you feel the "pop".
export const BLOOM_STRENGTH   = 1.8;                // peak outward push at the burst (world units / sec)
export const BLOOM_ATTACK     = 0.06;               // seconds to snap to peak
export const BLOOM_DECAY_TAU  = 0.35;               // exponential decay time constant (fast → slow)
export const BLOOM_SUSTAIN    = 0.0;                // burst floor — 0 so the pop fully decays (no permanent accel)
// Ink-spread: after the burst, the radius keeps easing outward (slower than the
// force decays) and settles at (1 + BLOOM_GROWTH)× the initial radius.
export const BLOOM_GROWTH     = 0.6;                // extra radius fraction the bloom spreads to
export const BLOOM_GROW_TAU   = 2.5;                // seconds; lingering spread time constant (fast → slow)
export const BLOOM_CURL_RAMP  = 0.4;                // seconds for the tangle field to settle in (then persists)
export const BLOOM_OPEN_TIME  = 1.4;                // seconds for the petals archetype to open ring-by-ring (rose)

// Bloom shape (reworked): a bloom REDIRECTS the base flow through a localized
// archetype direction field at the same speed — so particles fold into a distinct
// persistent shape WITHOUT accelerating. A separate transient BURST (outward +
// shaped) gives the click "pop" and fully decays.
// These modulators are global (one look, live-tunable). The archetype SELECTION
// is per-bloom (snapshotted on add — see bloomField.js); Phase 3 drives it from mood.
export const PAINT_OUTWARD    = 1.0;   // burst (outward pop) strength
export const PAINT_CURL       = 1.0;   // shape override weight (0 = base flow, 1 = fully redirected)
export const PAINT_CURL_FREQ  = 1.6;   // field scale in world space (higher = finer / more petals / more cells)
export const PAINT_DETAIL     = 0.4;   // sharpness (0 = smooth folds/lobes, 1 = jagged tangles/spikes)
export const PAINT_SHELL      = 0.2;   // burst radial profile: 0 = clearing pocket, 1 = mid-radius shell

// Archetype selection (dominant + one blend partner, "top-2"). Distinct shape
// families the bloom can take; mood will pick these per-click in Phase 3.
//   0 CURL · 1 VORTEX · 2 LIGHTNING · 3 SMOKE RING · 4 CELLS
export const PAINT_ARCHETYPES = ['Curl', 'Vortex', 'Lightning', 'Smoke Ring', 'Cells'];
export const PAINT_ARCH_A     = 0;     // dominant archetype index
export const PAINT_ARCH_B     = 1;     // blend-partner archetype index
export const PAINT_BLEND      = 0.35;  // partner weight (0 = pure dominant .. 0.5 = equal mix)

// ── Camera flight (infinite flythrough) ───────────────────────────────────────
export const FLY_SPEED       = 0.12;   // constant forward speed (world units / sec) — slow, steady drift
export const FLY_SENSITIVITY = 0.0026; // radians of turn per pixel dragged
export const FLY_DAMPING     = 0.08;   // steering smoothing (per-frame lerp toward target)
export const FLY_MAX_PITCH   = 1.35;   // clamp pitch (radians) to avoid gimbal flip

// World-space size of each cube particle (scaled by per-particle aSize).
export const CUBE_SCALE = 0.030;   // unused by terrain, kept for compat

// ── Strand-based initialization ───────────────────────────────────────────────
// Particles are grouped into strands. Each strand shares one origin point in the
// volume; particles within a strand are staggered in phase so they string out
// along the curl-noise streamline → ribbon-like shape.
export const STRAND_COUNT        = 45;
export const STRAND_WIDTH_MIN    = 0.004;
export const STRAND_WIDTH_MAX    = 0.18;   // mid-range contrast
export const STRAND_PHASE_MIN    = 1.0;
export const STRAND_PHASE_MAX    = 5.5;
export const STRAND_DENSITY_POW  = 1.8;

// ── Curl noise streamline shape ───────────────────────────────────────────────
// Presets are defined in createQuantumCloud.js (CURL_PRESETS).
// The default preset key used on first load:
export const DEFAULT_PRESET = 'Silk';

// ── Flow field ────────────────────────────────────────────────────────────────
// How fast the curl pattern drifts over time.
export const FLOW_SPEED = 0.25;

// How far particles are displaced from their base positions.
export const FLOW_DISPLACEMENT = 1.8;

// Base scale of the curl noise — lower = larger sweeping arcs, more ribbon spacing.
export const FLOW_NOISE_SCALE = 0.23;

// Domain warp strength — reduced to prevent streamline divergence into void.
export const DOMAIN_WARP = 0.9;

// ── Click paint zones ─────────────────────────────────────────────────────────
// Radius of each painted zone (local space units).
export const ZONE_RADIUS = 4;

// How strongly the stone's curl replaces the base flow (0–1; 1 = full replace).
export const ZONE_STRENGTH = 1.0;

// Exponential ramp-in time constant (seconds). Higher = slower fade-in.
export const ZONE_RAMP_TAU = 0.9;

// Maximum number of simultaneous zones. Oldest is evicted when full.
export const ZONE_MAX = 64;

// Per-zone curl noise scale range (random between min and max each click).
export const ZONE_NOISE_SCALE_MIN = 0.35;
export const ZONE_NOISE_SCALE_MAX = 1.45;

// Range of the random world-space offset injected per zone.
export const ZONE_NOISE_OFFSET_RANGE = 40;

// ── Scene ─────────────────────────────────────────────────────────────────────
export const BG_COLOR = 0x030308;
export const CAMERA_FOV = 58;
export const AUTO_ROTATE_SPEED = 0.35;
export const DISPLACEMENT_MARGIN = 2.8;

// ── Light ─────────────────────────────────────────────────────────────────────
export const LIGHT_COLOR   = 0xffffff;  // point light colour
export const LIGHT_INTENSITY = 2.0;
export const LIGHT_POSITION = { x: 3, y: 5, z: 4 };  // world-space position
export const LIGHT_AMBIENT  = 0.18;     // base brightness (0 = fully dark without light)

// ── Audio ─────────────────────────────────────────────────────────────────────
export const AUDIO_SRC = '/V1.mp3';

// ── Frequency bands — mirrors aijinglemaker.com analyzer exactly ──────────────
export const BAND_SUB_BASS   = [20,    60];   // Hz
export const BAND_BASS       = [60,   250];   // Hz  ← beat detection source
export const BAND_LOW_MID    = [250,  500];   // Hz
export const BAND_MID        = [500,  2000];  // Hz
export const BAND_HIGH_MID   = [2000, 4000];  // Hz
export const BAND_PRESENCE   = [4000, 6000];  // Hz
export const BAND_BRILLIANCE = [6000, 20000]; // Hz

// ── Visual influence per band (0 = off, tune up to enable) ───────────────────
// Bass beat is handled separately via BEAT_SPEED_BOOST below.
export const AUDIO_MID_SPEED      = 0.0;   // mid → flow-speed boost (off; bass handles speed)
export const AUDIO_MID_DISP       = 0.0;   // mid → displacement swell (off)
export const AUDIO_MID_NOISE_SCALE= 0.0;   // mid → curl noise scale (off)
export const AUDIO_TREBLE_SIZE    = 2.5;   // treble → point-size shimmer

// ── Beat — spikes flow speed, then decays ────────────────────────────────────
export const BEAT_SPEED_BOOST = 4.0;    // extra flow-speed added at peak
export const BEAT_SPEED_DECAY = 4.0;    // units/second decay rate

// ── Beat detection — spectral flux on BAND_BASS (60–250 Hz) ──────────────────
// Uses LINEAR magnitudes (not dB) for sharp transient sensitivity.
// Perceptual weighting (2× below 200 Hz) makes kick drums register strongly.
export const BEAT_FLUX_THRESHOLD = 1.4;    // peak must exceed meanFlux × this
export const BEAT_MIN_FLUX       = 1e-5;   // absolute floor on linear scale
export const BEAT_COOLDOWN_MS    = 250;    // minimum ms between beats
export const BEAT_PEAK_WINDOW    = 5;      // frames on each side for local-max check
