/**
 * gpuTrailsShaders.js — GLSL source for GPUTrails (gpuTrails.js), split out so the
 * class/logic file isn't ~40% shader-string text. Pure string exports, no behavior
 * change — moved verbatim out of gpuTrails.js.
 *
 *   BURST_FRAG   — per-trail shaped archetype burst (evaluated once per trail/head).
 *   ADVANCE_FRAG — adaptive per-trail "should we record a new history point" flag.
 *   RECORD_FRAG  — scrolls the history ring + glues slot 0 to the live head.
 *   RIBBON_VERT  — instanced camera-facing quad-strip through a Catmull-Rom spline.
 *   RIBBON_FRAG  — ribbon edge/fringe shading + tone mapping.
 */

import { PAINT_GLSL, PAINT_COLOR_GLSL } from './paintField.glsl.js';
import { BEAT_GLSL } from './beatField.glsl.js';
import { TONE_MAP_GLSL } from '../render/toneMap.glsl.js';

// ── Burst pass: full shaped archetype burst, evaluated ONCE PER TRAIL (at the head) ─
// Writes a per-trail burst vector into a small Wt×Ht texture. This is where the heavy
// archetype fields run — count times/frame, NOT count×history. Bloom uniforms are
// shared from the trail sim material (see constructor). Only run during the post-click
// window (gpuTrails.update), so it's free while flying.
export const BURST_FRAG = /* glsl */ `
  precision highp float;
  precision highp int;

  ${PAINT_GLSL}

  uniform sampler2D uHead;   // trail-head sim state (xyz = pos, w = age)  [Wt × Ht]

  out vec4 outColor;

  void main() {
    ivec2 px = ivec2(gl_FragCoord.xy);
    vec3 head = texelFetch(uHead, px, 0).xyz;
    outColor = vec4(paintBurst(head), 1.0);   // full shaped burst at this trail's head
  }
`;

// ── Advance pass: decide PER TRAIL whether to store a new history point this frame ─
// Adaptive recording (version B). Renders a Wt×Ht flag texture (r = 1 → advance). A
// trail advances when its head has moved MAX_DIST since the last stored point OR the
// heading has turned past the angle threshold (curve) — but never below MIN_DIST (so
// a tight kink can't record every frame). Reads only the head + the two most-recent
// stored points, so it's ~count cheap fetches/frame. Result feeds the record pass.
export const ADVANCE_FRAG = /* glsl */ `
  precision highp float;
  precision highp int;

  uniform sampler2D uHead;    // trail-head sim state (xyz = pos, w = age)  [Wt × Ht]
  uniform sampler2D uHist;    // current history                           [Wt × Ht·L]
  uniform int   uHt;          // head-grid height (rows per slot)
  uniform float uMinDist;     // never advance below this spacing (floor)
  uniform float uMaxDist;     // always advance past this spacing (straight-run cap)
  uniform float uTurnCos;     // advance if cos(turn) < this (heading bent enough)
  uniform float uDt;          // to skip just-respawned trails (age ≤ dt)

  out vec4 outColor;

  void main() {
    ivec2 px = ivec2(gl_FragCoord.xy);              // (x, yl) over the Wt×Ht head grid
    vec4  head = texelFetch(uHead, px, 0);          // xyz = head pos, w = age
    vec3  s1 = texelFetch(uHist, ivec2(px.x, px.y +      uHt), 0).xyz;  // last stored point
    vec3  s2 = texelFetch(uHist, ivec2(px.x, px.y + 2 *  uHt), 0).xyz;  // one before that

    vec3  d1   = head.xyz - s1;                      // head → last point
    float dist = length(d1);

    float adv = 0.0;
    // Skip the respawn frame (record pass collapses it) and anything below the floor.
    if (head.w > uDt && dist >= uMinDist) {
      vec3  d2 = s1 - s2;                            // previous segment direction
      float l2 = length(d2);
      // cos of the turn between the last stored segment and the head's current heading.
      float c  = (dist > 1e-5 && l2 > 1e-5) ? dot(d1, d2) / (dist * l2) : 1.0;
      if (dist >= uMaxDist || c < uTurnCos) adv = 1.0;
    }
    outColor = vec4(adv, 0.0, 0.0, 1.0);
  }
`;

// ── Record pass: scroll the history ring + glue slot 0 to the live head ───────
// Scrolls each trail's ring by its PER-TRAIL advance flag (from the advance pass) and
// bends the frozen TAIL by reading the per-trail burst vector (from the burst pass) —
// one cheap texture fetch per slot, no noise.
export const RECORD_FRAG = /* glsl */ `
  precision highp float;
  precision highp int;

  uniform sampler2D uHead;      // trail-head sim state (xyz = pos, w = age)  [Wt × Ht]
  uniform sampler2D uPrevHist;  // previous history                          [Wt × Ht·L]
  uniform sampler2D uBurst;     // per-trail shaped burst vector             [Wt × Ht]
  uniform sampler2D uAdvanceTex;// per-trail advance flag (r = 1 → shift)    [Wt × Ht]
  uniform int   uHt;            // head-grid height (rows per slot)
  uniform int   uL;             // history length (slots)
  uniform float uDt;            // sim dt (respawn-collapse threshold + displacement scale)
  uniform float uInit;          // 1 = seed every slot from the head (first frame)
  uniform float uTailBurst;     // how strongly the paint burst bends the frozen tail
  uniform float uTailBurstMax;  // per-frame cap on that displacement (stops fling-away)

  out vec4 outColor;

  void main() {
    ivec2 px = ivec2(gl_FragCoord.xy);
    int j  = px.y / uHt;             // which history slot this texel belongs to
    int yl = px.y - j * uHt;         // local row inside the head grid
    vec4 head = texelFetch(uHead, ivec2(px.x, yl), 0);

    // First frame OR just-respawned → collapse the whole trail onto the head so it
    // grows out from the spawn point (no long streak from the teleport).
    if (uInit > 0.5 || head.w <= uDt) { outColor = vec4(head.xyz, 1.0); return; }

    if (j == 0) { outColor = vec4(head.xyz, 1.0); return; }   // slot 0 = live head

    // Per-trail decision: shift this trail's ring one slot, or hold it (from advance pass).
    float adv = texelFetch(uAdvanceTex, ivec2(px.x, yl), 0).r;
    vec4 base = (adv > 0.5)
      ? texelFetch(uPrevHist, ivec2(px.x, yl + (j - 1) * uHt), 0)  // shift: inherit slot j-1
      : texelFetch(uPrevHist, px, 0);                              // hold

    // Bend the frozen tail: displace this slot by the trail's shaped burst vector (one
    // cheap fetch — the archetype was evaluated per-trail in the burst pass). The whole
    // ribbon pops in its head's archetype direction; across many trails the mass blooms.
    // uTailBurst is CPU-gated to a short window after each click, so this is a no-op
    // (and the burst pass is skipped) while flying / after the pop settles.
    vec3 disp = vec3(0.0);
    if (uTailBurst > 0.0) {
      disp = texelFetch(uBurst, ivec2(px.x, yl), 0).xyz * (uDt * uTailBurst);
      // Cap the per-frame nudge — the displacement accumulates across the window, so an
      // uncapped burst would fling the whole ribbon out of the bloom (= "disappears").
      float dl = length(disp);
      if (dl > uTailBurstMax) disp *= uTailBurstMax / dl;
    }
    outColor = vec4(base.xyz + disp, base.w);
  }
`;

// ── Ribbon: instanced camera-facing QUAD strip, positions fetched from history ──
// Each trail = 2 vertices per history point (aSide = ∓1), expanded sideways from the
// centreline by a per-trail world-space WIDTH (WebGL can't do lineWidth>1). The offset
// direction is perpendicular to the segment tangent AND faces the camera, so the ribbon
// always shows its full width. Width is hashed per trail (skewed thin → cheap), and
// vSide carries the ∓1 across the quad for a soft edge in the fragment shader.
export const RIBBON_VERT = /* glsl */ `
  precision highp float;
  precision highp int;

  uniform sampler2D uHist;
  uniform int  uWt;        // history/head grid width
  uniform int  uHt;        // head-grid height (rows per slot)
  uniform int  uL;         // history length
  uniform mat4 uProj;
  uniform mat4 uView;
  uniform vec3 uCamPos;    // for per-trail distance cull/fade + camera-facing offset
  uniform vec3 uCamFwd;    // camera look direction (for forward-biased fade)
  uniform float uNearCull; // cull trails whose head is nearer than this
  uniform float uFarCull;  // hard far cap on head distance (manual; ≥ kill = off)
  uniform float uKillRadius;  // front reach reference for the directional fade
  uniform float uBehindFrac;  // behind reach as a fraction of the front reach (<1 = forward-biased)
  uniform float uFarSatMul;   // sat at far reach (atmospheric depth)
  uniform float uFarLitAdd;   // lit add at far reach
  uniform float uFarOpacityMul; // alpha at far reach
  uniform vec3 uColorHSL;  // base colour in HSL
  uniform float uHueJitter;
  uniform float uContrastFrac; // fraction of trails that take contrast spice (0 = off)
  uniform float uContrastHue;  // hue wrap offset for spice trails (≈0.5 = complement)
  uniform float uContrastSat;  // sat add on spice trails
  uniform float uContrastLit;  // lightness multiplier on spice trails
  uniform float uFadePow;
  uniform float uOpacity;
  uniform float uSpawnFrac; // sparse→full ramp (1 = normal, all trails revealed)
  // See shaders.js's uSpawnElapsed comment — decouples population growth rate
  // from each trail's own fixed-duration individual fade-in.
  uniform float uSpawnElapsed;
  uniform float uSpawnRampTime;
  uniform float uSpawnFadeDur;
  // Hides all trails while a shape-change's velocity bake is pending — see
  // createQuantumCloud.js's uFlowReady comment. 1 = off (normal).
  uniform float uFlowReady;
  uniform float uWidth;    // max world-space ribbon width
  uniform float uWidthVar; // per-trail width spread (0 = uniform, 1 = 0..uWidth)
  uniform float uWidthContrast; // >1 pushes widths to thin/thick extremes (more contrast)
  uniform float uThinRatio;     // fraction of trails in the thin group (rest are thick)
  uniform float uCurveWidth;    // width multiplier at max curvature (>1 = thicker on bends)
  uniform float uCurveScale;    // curvature sensitivity: maps geometric κ (1/radius) → 0..1
  uniform float uTaperHead;     // head taper length (fraction of trail → thin point at the head)
  uniform float uTaperTail;     // tail taper length (fraction of trail → thin point at the tail)
  uniform float uPulseTime;     // elapsed seconds — scrolls the brightness pulse
  uniform float uPulseSpeed;    // pulse travel speed head→tail (waves/sec)
  uniform float uPulseDensity;  // number of pulse waves along the full trail length
  uniform float uPulseStrength; // brightness modulation depth (0 = off)
  uniform sampler2D uSimState;  // trail-head sim state (xyz = pos, w = age)  [Wt × Ht]
  uniform sampler2D uSimCell;   // trail-head sim cell  (w = per-particle lifetime)
  uniform float uDeathTime;     // reel-in window: seconds before age-death the tail retracts (0 = off)
  uniform float uDeathFadeFloor;// subtle whole-ribbon alpha at full death (1 = no fade, pure retract; 0 = fade to gone)
  ${PAINT_COLOR_GLSL}

  in float aParam;         // continuous slot along the trail [0 = head .. L-1 = tail]
  in float aSide;          // -1 / +1 — which edge of the ribbon

  out vec4 vColor;
  out float vSide;         // interpolated -1..1 across the width (soft edge)

  float h1(float n) { return fract(sin(n) * 43758.5453123); }
  // Integer (Wang) hash -- unlike h1() above, this stays exact regardless of
  // magnitude, so it does not clump for large trail indices (h1's sin()-based
  // precision collapses once the argument gets into the thousands). Used only
  // for the spawn-reveal threshold below, where clumping was visibly popping
  // in whole batches of trails together instead of a smooth one-by-one ramp.
  float revealHash(float i) {
    uint n = uint(i);
    n = (n ^ 61u) ^ (n >> 16u);
    n *= 9u;
    n = n ^ (n >> 4u);
    n *= 0x27d4eb2du;
    n = n ^ (n >> 15u);
    return float(n) * (1.0 / 4294967296.0);
  }
  vec3 hsl2rgb(vec3 c) {
    vec3 rgb = clamp(abs(mod(c.x * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
    return c.z + c.y * (rgb - 0.5) * (1.0 - abs(2.0 * c.z - 1.0));
  }
  vec3 fetchP(int x, int yl, int j) { return texelFetch(uHist, ivec2(x, yl + j * uHt), 0).xyz; }

  ${BEAT_GLSL}

  void main() {
    int i = gl_InstanceID;
    int x  = i % uWt;
    int yl = i / uWt;

    // Distance cull/fade by the trail HEAD (slot 0), so the whole ribbon shares one
    // decision. Culled trails collapse to a clipped point → zero fragments (fill saving).
    vec3 head = texelFetch(uHist, ivec2(x, yl), 0).xyz;
    float d = distance(head, uCamPos);
    // Forward-biased reach: ahead (s→1) keeps the full kill-radius reach; behind (s→0)
    // it shrinks to uBehindFrac·kill so trails you've passed clear fast (also a fill win —
    // fewer trails linger behind you). uFarCull is still a hard manual cap on top.
    float s     = 0.5 * (dot(normalize(head - uCamPos + vec3(1e-6)), uCamFwd) + 1.0);
    float reach = min(uFarCull, uKillRadius * mix(uBehindFrac, 1.0, s));
    if (d < uNearCull || d > reach) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
    // Snappier near/far ramps → wider fully-opaque mid band (was 12% / 15%).
    float nband = max(0.001, (reach - uNearCull) * 0.06);
    float distFade = smoothstep(uNearCull, uNearCull + nband, d)
                   * (1.0 - smoothstep(reach - reach * 0.08, reach, d));

    // AGE-DEATH REEL-IN: in the last uDeathTime seconds of the head's life, retract the tail
    // toward the head (the inverse of birth's grow-from-a-point) so the ribbon shrinks to a
    // point and vanishes — a real "ending" instead of a flat fade. deathT 0 (alive) → 1 (gone).
    // Fetch the head's age (state.w) + lifetime (cell.w) from the sim for THIS trail.
    float age   = texelFetch(uSimState, ivec2(x, yl), 0).w;
    float lifeT = texelFetch(uSimCell,  ivec2(x, yl), 0).w;
    float deathT = 0.0;
    if (uDeathTime > 0.0 && lifeT > uDeathTime) {
      float dr = (age - (lifeT - uDeathTime)) / uDeathTime;
      deathT = clamp(dr, 0.0, 1.0);
      deathT = deathT * deathT * (3.0 - 2.0 * deathT);   // smoothstep ease
    }
    // Clamp the drawn length to Leff: vertices past it fold onto the retreating tail endpoint,
    // so the tail races forward toward the (still-moving) head as deathT → 1.
    float Leff = float(uL - 1) * (1.0 - deathT);

    // CENTRIPETAL Catmull-Rom (α = 0.5) through the recorded points at continuous slot
    // aParam. Plain (uniform) Catmull-Rom OVERSHOOTS / loops when the control points are
    // unevenly spaced — which they are here (adaptive recording packs points on curves,
    // spreads them on straights) → the "wobble on curves". Centripetal spaces the knots by
    // sqrt(chord length), which provably removes those overshoots + self-intersections.
    // Evaluated as a Hermite segment with non-uniform tangents (gives position AND tangent).
    float fj   = clamp(min(aParam, Leff), 0.0, float(uL - 1));
    int   b    = int(floor(fj));
    float t    = fj - float(b);
    vec3 p0 = fetchP(x, yl, max(b - 1, 0));
    vec3 p1 = fetchP(x, yl, b);
    vec3 p2 = fetchP(x, yl, min(b + 1, uL - 1));
    vec3 p3 = fetchP(x, yl, min(b + 2, uL - 1));

    // Knot spacings = sqrt(chord length) (α = 0.5). Guarded so coincident points (clamped
    // ends / a collapsed respawn) can't divide by zero.
    float t01 = max(sqrt(length(p1 - p0)), 1e-4);
    float t12 = max(sqrt(length(p2 - p1)), 1e-4);
    float t23 = max(sqrt(length(p3 - p2)), 1e-4);
    // Non-uniform tangents at p1, p2 (Barry-Goldman → Hermite form, scaled to [0,1]).
    vec3 m1 = ((p1 - p0) / t01 - (p2 - p0) / (t01 + t12) + (p2 - p1) / t12) * t12;
    vec3 m2 = ((p2 - p1) / t12 - (p3 - p1) / (t12 + t23) + (p3 - p2) / t23) * t12;

    float t2 = t * t, t3 = t2 * t;
    vec3 p   = (2.0 * t3 - 3.0 * t2 + 1.0) * p1
             + (t3 - 2.0 * t2 + t)         * m1
             + (-2.0 * t3 + 3.0 * t2)      * p2
             + (t3 - t2)                   * m2;
    vec3 d1 = (6.0 * t2 - 6.0 * t)         * p1   // Hermite 1st derivative → spline tangent (p')
             + (3.0 * t2 - 4.0 * t + 1.0)  * m1
             + (-6.0 * t2 + 6.0 * t)       * p2
             + (3.0 * t2 - 2.0 * t)        * m2;
    float dl = length(d1);
    vec3 dir = dl > 1e-6 ? d1 / dl : vec3(0.0, 1.0, 0.0);
    // 2nd derivative (p'') → geometric curvature κ = |p'×p''| / |p'|³ (parameterization-
    // invariant, world 1/radius). Used below to thicken the ribbon where the path bends.
    vec3 d2 = (12.0 * t - 6.0) * p1 + (6.0 * t - 4.0) * m1
            + (-12.0 * t + 6.0) * p2 + (6.0 * t - 2.0) * m2;
    float kappa = dl > 1e-5 ? length(cross(d1, d2)) / (dl * dl * dl) : 0.0;

    // Phase B: cluster-local beat punch — flex the ribbon centerline on the beat. The field is
    // smooth (low uBeatFreq) so adjacent spline points move together → the ribbon BENDS with
    // its cluster instead of shattering. Same beatDisplace() the mesh uses, so they move as one.
    p += beatDisplace(p);

    // Camera-facing sideways offset (perpendicular to tangent AND to view direction).
    vec3 side = cross(dir, uCamPos - p);
    float sl = length(side);
    side = sl > 1e-6 ? side / sl : vec3(1.0, 0.0, 0.0);

    // Per-trail width. Split the trails into a THIN group (fraction uThinRatio → widths
    // in [0,0.5)) and a THICK group (→ [0.5,1]); uWidthContrast pushes each toward its
    // extreme (fewer mediums = more contrast). uWidthVar sets the spread (small floor so
    // the thinnest stay visible), uWidth the thickest. Higher uThinRatio = more thin.
    float h  = h1(float(i) * 3.19 + 0.7);
    float tr = clamp(uThinRatio, 0.02, 0.98);
    float hw = h < tr ? 0.5 * pow(h / tr, uWidthContrast)
                      : 1.0 - 0.5 * pow((1.0 - h) / (1.0 - tr), uWidthContrast);
    float width = uWidth * (1.0 - uWidthVar + uWidthVar * hw);

    // Along-length shaping (this trail): taper to a thin point at BOTH ends (head + tail),
    // and swell where the path BENDS — the ribbon bulges into swirls, thins on straights.
    float u = fj / max(1.0, float(uL - 1));           // 0 = head .. 1 = tail
    float taper = smoothstep(0.0, max(1e-3, uTaperHead), u)
                * (1.0 - smoothstep(1.0 - max(1e-3, uTaperTail), 1.0, u));
    // Reel-in folds leftover verts onto one world point but kept their mid-ribbon
    // width → a camera-facing square cap. Same if the tangent dies (coincident
    // history). Pinch those rings to a point so the last segment is a triangle.
    if (aParam >= Leff - 1e-3 || dl <= 1e-6 || sl <= 1e-6) taper = 0.0;
    float curveAmt = 1.0 - exp(-kappa * uCurveScale); // 0 straight .. →1 sharply curved
    width *= taper * mix(1.0, uCurveWidth, curveAmt);

    vec3 wpos = p + side * (aSide * 0.5 * width);
    gl_Position = uProj * uView * vec4(wpos, 1.0);

    // Normal "over" blending: keep rgb at FULL brightness (no pre-multiply) and put the
    // whole head→tail fade + distance fade + opacity into the ALPHA (coverage). This reads
    // as a solid ribbon whose tail fades to transparent, instead of the old darkened glow.
    float f  = pow(max(0.0, 1.0 - fj / float(uL)), uFadePow);   // head opaque → tail fade
    float hue = fract(uColorHSL.x + (h1(float(i) * 1.7) - 0.5) * uHueJitter + 1.0);
    float sat = uColorHSL.y;
    float lit = uColorHSL.z;
    // Atmospheric depth: farther ribbons → less sat, slightly lighter, lower opacity.
    float depthT = smoothstep(uNearCull, max(uNearCull + 0.01, reach * 0.92), d);
    sat *= mix(1.0, uFarSatMul, depthT);
    lit  = clamp(lit + uFarLitAdd * depthT, 0.0, 1.0);
    float depthOpacity = mix(1.0, uFarOpacityMul, depthT);
    // Sparse contrast spice: a few stable ribbons flip toward the complement family so
    // the mood wash gets occasional opposing colour (not a second full palette).
    if (uContrastFrac > 0.0 && h1(float(i) * 9.13 + 2.4) < uContrastFrac) {
      hue = fract(hue + uContrastHue);
      sat = clamp(sat + uContrastSat, 0.0, 1.0);
      lit = clamp(lit * uContrastLit, 0.0, 1.0);
    }
    // Permanent ink: world-space colour stain (spreads + outlives shape redirect).
    {
      vec3 inked = applyPaintInk(vec3(hue, sat, lit), p);
      hue = inked.x;
      sat = inked.y;
      lit = inked.z;
    }
    vec3 rgb = hsl2rgb(vec3(fract(hue + 1.0), sat, lit));
    // Traveling PULSE: a low-frequency brightness wave that RUNS head→tail over time, so
    // the ribbon reads as flowing "current" even where the path is near-static. Per-trail
    // phase offset (h1(i)) desyncs them. Modulates brightness + a light touch of alpha.
    if (uPulseStrength > 0.0) {
      float ph   = 6.2831853 * (u * uPulseDensity - uPulseTime * uPulseSpeed) + h1(float(i) * 5.3) * 6.2831853;
      float pulse = 0.5 + 0.5 * sin(ph);            // 0..1
      rgb *= 1.0 + uPulseStrength * (pulse - 0.5) * 2.0;   // darken↔brighten around base
      f   *= 1.0 + 0.35 * uPulseStrength * (pulse - 0.5) * 2.0;
    }
    // Subtle age-death fade: on top of the geometric reel-in, dim the WHOLE ribbon toward a
    // floor (not to 0) so the retraction stays the primary "ending" — at recycle the ribbon is
    // ~floor opacity AND collapsed to a point. Gated by the same deathT → age-death only.
    float deathFade = mix(1.0, uDeathFadeFloor, deathT);
    // See shaders.js's mesh-cloud comment — fixed-duration individual fade,
    // decoupled from population growth rate (per-trail hash, decorrelated
    // from the width/hue/contrast seeds above).
    float revealAt   = revealHash(float(i)) * uSpawnRampTime;
    float timeSince  = uSpawnElapsed - revealAt;
    float spawnFade  = smoothstep(0.0, uSpawnFadeDur, timeSince) * step(0.0001, uSpawnFrac);
    vColor = vec4(rgb, max(0.0, f) * uOpacity * distFade * deathFade * depthOpacity * spawnFade * uFlowReady);
    vSide = aSide;
  }
`;

export const RIBBON_FRAG = /* glsl */ `
  precision highp float;
  uniform float uSoftAdd;    // 0 = solid normal blend; >0 scales SrcAlpha/One glow strength
  uniform float uEmissive;   // RGB boost (hybrid emission when soft-add is off)
  uniform float uFringe;     // same-pass outer-edge RGB halo (0 = off)
  in vec4 vColor;
  in float vSide;
  out vec4 outColor;

  ${TONE_MAP_GLSL}

  void main() {
    float s = abs(vSide);
    // Solid core (opacity/sat) + soft outer falloff. Fringe band is the ring near the edge.
    float edge = 1.0 - smoothstep(0.72, 1.0, s);
    float fringe = smoothstep(0.55, 0.82, s) * (1.0 - smoothstep(0.82, 1.0, s));
    float a = vColor.a * edge;
    // Trails WRITE DEPTH now, so discard near-invisible fragments (faint tail-end + soft
    // edges) — otherwise they'd write occluding depth and punch transparent "holes" into
    // the trails behind them. Slightly lower threshold so the fringe halo survives.
    if (a < 0.02) discard;
    // Soft-add mode: blend is SrcAlpha/One → dest += rgb * a. Scale a by uSoftAdd so the
    // glow stays slight; depthWrite still occludes farther trails (no milky stack).
    // Hybrid (softAdd=0): NormalBlending + full coverage; glow = emissive×RGB + fringe.
    float aa = uSoftAdd > 0.0 ? a * uSoftAdd : a;
    // Keep hue/sat (multiply, don't mix toward white). Fringe over-brights the rim only.
    vec3 rgb = vColor.rgb * max(uEmissive, 0.0) * (1.0 + max(uFringe, 0.0) * fringe);
    outColor = vec4(applyOutputToneMap(rgb), aa);
  }
`;
