/**
 * paintField.glsl.js — shared GLSL for the persistent click-paint "bloom" field.
 *
 * A bloom has TWO parts with different behavior (see paintApply):
 *   - SHAPE (archetype field): persistent, but it REDIRECTS the base flow instead
 *     of adding to it. We steer the base velocity toward the archetype's direction
 *     field of the SAME speed, so particles fold into an abstract shape WITHOUT
 *     speeding up. Overlapping blooms clamp the blend weight (never stack speed).
 *   - BURST (shaped impulse): transient additive kick — outward AND along the
 *     archetype field — so the shape visibly bursts/swirls out on click. Fully
 *     decays to zero, leaving no permanent acceleration behind.
 *
 * The SHAPE is one of five distinct archetypes, blended dominant + partner:
 *     0 CURL    turbulent smoke/ink tangle (divergence-free curl noise)
 *     1 VORTEX  coherent whirlpool spiralling around a seeded axis
 *     2 LIGHTNING  jagged bolts along a branching vein network — random, non-radial
 *     3 TORUS   smoke ring — toroidal vortex rolling + drifting along its axis
 *     4 CELLS   Worley pockets — foamy/bubbly clusters
 * Each returns a unit direction + a 0..1 "presence" mask; presence is what carves
 * the silhouette (spikes/petals are sparse, curl/vortex fill space). Mood picks
 * the dominant + one partner per bloom (see bloomField.js); the rest never run.
 *
 * Camera-windowed active set uploaded as five vec4 arrays:
 *     uBloomA[i] = (center.xyz, radius)
 *     uBloomB[i] = (burstMag, seed, shapeWeight, shell)  // time-envelopes on CPU
 *     uBloomC[i] = (archA, archB, blendAB, openness)      // shape selection
 *     uBloomD[i] = (outward, shapeAmt, fieldFreq, detail) // per-bloom modulators
 *     uBloomE[i] = (colorH, colorS, colorL, colorRadius)  // permanent ink stain (ribbons + meshes + dots)
 * burstMag decays to 0; shapeWeight ramps then LRU-fades. Colour radius grows wider /
 * slower than shape and outlives shape fade (see bloomField.js).
 *
 * The including shader declares nothing else — this block declares its uniforms.
 * Requires GLSL3.
 */
import {
  BLOOM_MAX_ACTIVE,
  PAINT_BURST_SHAPED,
  PAINT_BURST_WIDEN,
  PAINT_DRIFT_SHAPED,
  PAINT_DRIFT_RADIAL,
} from '../config.js';

export const PAINT_GLSL = /* glsl */ `
  #define MAX_BLOOMS ${BLOOM_MAX_ACTIVE}
  #define PAINT_BURST_SHAPED ${PAINT_BURST_SHAPED.toFixed(4)}
  #define PAINT_BURST_WIDEN ${PAINT_BURST_WIDEN.toFixed(4)}
  #define PAINT_DRIFT_SHAPED ${PAINT_DRIFT_SHAPED.toFixed(4)}
  #define PAINT_DRIFT_RADIAL ${PAINT_DRIFT_RADIAL.toFixed(4)}
  uniform int  uBloomCount;
  uniform float uPaintStrength;       // scales the whole paint deviation (1 = full, 0 = off)
  uniform float uPaintTime;           // elapsed seconds — drives the LIVING field animation
  uniform float uPaintSwirl;          // rad/sec the shape frame rotates (swirl); 0 = frozen
  uniform float uPaintEvolve;         // world units/sec the noise domain drifts (evolve/morph)
  uniform float uPaintDrift;          // post-surge outward creep speed (trails only; 0 for meshes)
  uniform vec4 uBloomA[MAX_BLOOMS];   // xyz = center, w = radius
  uniform vec4 uBloomB[MAX_BLOOMS];   // x = burstMag, y = seed, z = shapeWeight, w = shell
  uniform vec4 uBloomC[MAX_BLOOMS];   // x = archA, y = archB, z = blendAB, w = openness
  uniform vec4 uBloomD[MAX_BLOOMS];   // x = outward, y = shapeAmt, z = fieldFreq, w = detail

  float pkHash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float pkNoise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(pkHash(i + vec3(0,0,0)), pkHash(i + vec3(1,0,0)), f.x),
                   mix(pkHash(i + vec3(0,1,0)), pkHash(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(pkHash(i + vec3(0,0,1)), pkHash(i + vec3(1,0,1)), f.x),
                   mix(pkHash(i + vec3(0,1,1)), pkHash(i + vec3(1,1,1)), f.x), f.y), f.z);
  }

  // Three decorrelated scalar potentials → a vector potential for curl.
  vec3 pkPot(vec3 p) {
    return vec3(pkNoise(p),
                pkNoise(p + vec3( 31.4, 17.3,  9.1)),
                pkNoise(p + vec3( -8.2, 23.7, 41.9)));
  }
  // Curl of the vector potential = divergence-free (incompressible) flow.
  vec3 curlNoise(vec3 p) {
    const float e = 0.15;
    vec3 dx = pkPot(p + vec3(e,0,0)) - pkPot(p - vec3(e,0,0));
    vec3 dy = pkPot(p + vec3(0,e,0)) - pkPot(p - vec3(0,e,0));
    vec3 dz = pkPot(p + vec3(0,0,e)) - pkPot(p - vec3(0,0,e));
    return vec3(dy.z - dz.y, dz.x - dx.z, dx.y - dy.x) / (2.0 * e);
  }
  vec3 curlFbm(vec3 p, float detail) {
    vec3 c = curlNoise(p);
    c += detail * curlNoise(p * 2.03 + 11.7) * 0.5;
    return c;
  }

  // Seeded random axis + orthonormal basis (for the axis-based archetypes).
  vec3 randAxis(float seed) {
    vec3 h = fract(sin(vec3(seed * 12.9898, seed * 78.233, seed * 37.719)) * 43758.5453);
    return normalize(h * 2.0 - 1.0 + vec3(1e-3));
  }
  void basis(vec3 n, out vec3 t, out vec3 b) {
    vec3 up = abs(n.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
    t = normalize(cross(up, n));
    b = cross(n, t);
  }

  // Animate the persistent field: return a SLOWLY MOVING sampling coordinate for the
  // shape. The bloom-local offset r is rotated about a per-bloom axis (SWIRL) and the
  // noise domain is drifted over time (EVOLVE), so the archetype pattern keeps turning
  // and morphing → streamlines move → ribbons flow through a living whirlpool. Only the
  // SHAPE sampling uses this; the radial outward pop + spatial falloff keep the raw r.
  vec3 paintWarp(vec3 r, float seed) {
    // SWIRL: rotate the offset about a per-bloom axis. Geometry-safe (preserves length),
    // so vortex/torus just spin coherently; noise archetypes turn.
    vec3 ax  = randAxis(seed + 3.1);
    float ang = uPaintTime * uPaintSwirl;
    float c = cos(ang), s = sin(ang);
    vec3 rot = r * c + cross(ax, r) * s + ax * dot(ax, r) * (1.0 - c);
    // EVOLVE: a BOUNDED slow wander of the domain (two decorrelated sines → non-repeating
    // morph). Bounded on purpose — a linearly-growing drift would push r arbitrarily far
    // and DEGENERATE the geometric archetypes (vortex/torus). Amplitude = uPaintEvolve.
    vec3 ax2 = randAxis(seed + 9.7);
    vec3 ax3 = randAxis(seed + 21.3);
    vec3 drift = ax2 * sin(uPaintTime * 0.31 + seed)
               + ax3 * sin(uPaintTime * 0.17 + seed * 1.7);
    return rot + drift * uPaintEvolve;
  }

  // ── Archetypes ──────────────────────────────────────────────────────────────
  // Each returns a unit direction; pres (0..1) is the presence mask that carves
  // the silhouette. r = p - center (world offset inside the bloom).

  // 0 CURL — turbulent smoke/ink tangle. Fills space (presence = 1).
  vec3 archCurl(vec3 r, float freq, float detail, float seed, out float pres) {
    vec3 off = fract(sin(vec3(seed * 1.1, seed * 2.3, seed * 3.7)) * 43758.5453) * 100.0;
    vec3 c = curlFbm(r * freq + off, detail);
    pres = 1.0;
    float l = length(c);
    return l > 1e-5 ? c / l : vec3(0.0, 1.0, 0.0);
  }

  // 1 VORTEX — coherent whirlpool spiralling around a seeded axis. Fills space.
  vec3 archVortex(vec3 r, float seed, out float pres) {
    vec3 axis = randAxis(seed);
    vec3 tang = cross(axis, r);
    float lt = length(tang);
    vec3 dir = lt > 1e-5 ? tang / lt : vec3(1.0, 0.0, 0.0);
    vec3 radial = r - axis * dot(r, axis);
    vec3 inward = -normalize(radial + vec3(1e-5));
    pres = 1.0;
    return normalize(dir + 0.35 * inward + 0.22 * axis + vec3(1e-6));
  }

  // Cheap value-noise vector in [-1,1]^3 (a wandering low-frequency direction).
  vec3 vnVec(vec3 x) {
    return vec3(pkNoise(x),
                pkNoise(x + vec3( 19.3,  7.1, 33.7)),
                pkNoise(x + vec3(-11.9, 41.3,  5.2))) * 2.0 - 1.0;
  }

  // Ridged fbm whose crest set forms a branching, zig-zagging filament network —
  // the "veins" of a lightning bolt. 1 on a vein, 0 in the gaps.
  float boltField(vec3 q) {
    float f = 0.5   * pkNoise(q)
            + 0.25  * pkNoise(q * 2.03 + 11.7)
            + 0.125 * pkNoise(q * 4.07 + 37.2);
    return 1.0 - abs(2.0 * (f / 0.875) - 1.0);
  }

  // Vein field with LOW-frequency domain warp → the bolts bend into big, sharp,
  // non-repetitive sweeps instead of a regular zigzag. warpAmt = how wild.
  float boltFieldW(vec3 x, float warpAmt) {
    vec3 w = vnVec(x * 0.6);
    return boltField(x + w * warpAmt);
  }

  // 2 LIGHTNING — jagged bolts striking through the cloud in RANDOM directions (not
  // radial). Flow converges onto a domain-warped, branching vein network and runs
  // ALONG it following a WANDERING low-frequency direction, so the path turns hard
  // and unpredictably. Thin presence = empty space between strikes.
  vec3 archLightning(vec3 r, float freq, float detail, float seed, out float pres) {
    vec3 seedOff = fract(sin(vec3(seed * 1.7, seed * 4.3, seed * 9.1)) * 43758.5453) * 50.0;
    float baseFreq = 1.4 + 2.2 * freq;          // lower base → bigger edges / longer segments
    vec3  q = r * baseFreq + seedOff;

    float warpAmt = mix(0.8, 2.2, detail);      // domain warp: big, random, sharp bends
    float sharp   = mix(4.0, 16.0, detail);

    float f0 = boltFieldW(q, warpAmt);
    float e  = 0.1;
    vec3  g  = vec3(boltFieldW(q + vec3(e,0,0), warpAmt) - boltFieldW(q - vec3(e,0,0), warpAmt),
                    boltFieldW(q + vec3(0,e,0), warpAmt) - boltFieldW(q - vec3(0,e,0), warpAmt),
                    boltFieldW(q + vec3(0,0,e), warpAmt) - boltFieldW(q - vec3(0,0,e), warpAmt));
    float glen = length(g);
    vec3  up = glen > 1e-6 ? g / glen : vec3(0.0, 1.0, 0.0);   // uphill toward the vein

    // Along-vein flow from a WANDERING low-frequency direction (not a fixed axis),
    // so the bolt path turns drastically and unpredictably.
    vec3  flow  = vnVec(r * (0.5 + 0.6 * freq) + seedOff * 1.7);
    vec3  along = normalize(flow - up * dot(flow, up) + vec3(1e-6));
    float pull  = mix(0.7, 1.5, detail) * (1.0 - clamp(f0, 0.0, 1.0));
    vec3  dir   = normalize(along + up * pull + vec3(1e-6));

    pres = pow(clamp(f0, 0.0, 1.0), sharp);
    return dir;
  }

  // 4 CELLS — Worley pockets (nearest jittered feature). Foamy clusters.
  vec3 archCells(vec3 r, float freq, float seed, out float pres) {
    vec3 p = r * freq + vec3(seed * 7.0);
    vec3 g = floor(p), f = p - g;
    float best = 1e9; vec3 bestDir = vec3(0.0, 1.0, 0.0);
    for (int z = -1; z <= 1; z++)
    for (int y = -1; y <= 1; y++)
    for (int x = -1; x <= 1; x++) {
      vec3 o = vec3(float(x), float(y), float(z));
      vec3 fp = o + vec3(pkNoise(g + o),
                         pkNoise(g + o + 31.7),
                         pkNoise(g + o + 57.3)) - f;
      float dd = dot(fp, fp);
      if (dd < best) { best = dd; bestDir = fp; }
    }
    pres = 1.0 - smoothstep(0.2, 0.9, sqrt(best));   // strong near cell centres
    float l = length(bestDir);
    return l > 1e-5 ? -bestDir / l : vec3(0.0, 1.0, 0.0);
  }

  // 3 SMOKE RING — a toroidal vortex. Particles roll around the tube (poloidal
  // circulation) while the whole ring drifts along its seeded axis, like a blown
  // smoke ring or a jellyfish pulse. Fully 3D and view-independent. The ring
  // radius grows as the bloom opens (openness 0..1).
  vec3 archTorus(vec3 r, float freq, float detail, float t, float openness, float seed, out float pres) {
    vec3 axis = randAxis(seed);
    float d = length(r) + 1e-5;
    vec3 dir = r / d;
    vec3 rn  = dir * t;                          // normalized offset (length 0..1)

    float zc  = dot(rn, axis);                   // axial coordinate
    vec3  rp  = rn - axis * zc;                  // in-plane component
    float rho = length(rp);
    vec3  er  = rho > 1e-4 ? rp / rho : vec3(1.0, 0.0, 0.0);

    float Rr = mix(0.32, 0.55, openness) * mix(0.8, 1.2, clamp(freq / 4.0, 0.0, 1.0));
    float a  = rho - Rr;                         // radial offset from the tube centre
    float b  = zc;                               // axial offset
    float tubeDist = sqrt(a * a + b * b);
    float tubeR = mix(0.30, 0.16, detail);       // tube thickness (detail = tighter)

    pres = 1.0 - smoothstep(tubeR * 0.25, tubeR, tubeDist);

    // Poloidal roll: circulate around the tube centre (rotate (a,b) by 90 deg),
    // blended with a forward drift along the axis so the ring translates.
    vec3 roll = normalize(er * (-b) + axis * a + vec3(1e-6));
    return normalize(roll + axis * 0.5 + vec3(1e-6));
  }

  // Dispatch: return the archetype's unit direction + two masks.
  //   pres  = where DENSITY / the outward pop concentrates (thin for spikes).
  //   steer = how broadly the flow is REDIRECTED toward the direction. For most
  //           archetypes steer == pres, but spikes steer broadly (=1) so gap
  //           particles are pulled ONTO the crest lines and converge into bolts.
  // t = normalized radius (0 center .. 1 edge), openness = rose unfurl 0..1.
  // freq/detail are per-bloom (from uBloomD), so each bloom shapes its own field.
  vec3 archetypeDir(int idx, vec3 r, float t, float openness, float seed, float freq, float detail, out float pres, out float steer) {
    vec3 dir;
    if (idx == 1)      { dir = archVortex(r, seed, pres);                       steer = pres; }
    else if (idx == 2) { dir = archLightning(r, freq, detail, seed, pres);      steer = 1.0;  }
    else if (idx == 3) { dir = archTorus(r, freq, detail, t, openness, seed, pres); steer = pres; }
    else if (idx == 4) { dir = archCells(r, freq, seed, pres);                  steer = pres; }
    else               { dir = archCurl(r, freq, detail, seed, pres);           steer = pres; }
    return dir;
  }

  // How strongly a world point sits inside the PERSISTENT mark (0 = outside all blooms,
  // 1 = dead centre of a fully-settled bloom). Uses the same smooth spatial falloff and
  // the persistent shapeWeight (NOT the transient burst), so it tracks the lasting shape.
  // The trail sim uses this to stretch the lifetime of heads sitting in the mark.
  float paintInfluence(vec3 p) {
    float inf = 0.0;
    for (int i = 0; i < MAX_BLOOMS; i++) {
      if (i >= uBloomCount) break;
      vec3  c      = uBloomA[i].xyz;
      float radius = uBloomA[i].w;
      float shapeW = uBloomB[i].z;
      float d = length(p - c);
      if (d >= radius) continue;
      float t = d / radius;
      float w = (1.0 - t) * (1.0 - t);
      inf = max(inf, w * shapeW);
    }
    return inf;
  }

  // Redirect the base flow through the painted shape + add the transient burst.
  vec3 paintApply(vec3 p, vec3 baseVel) {
    float baseSpeed = length(baseVel);

    vec3  accum = vec3(0.0);   // presence-weighted shape direction
    float wSum  = 0.0;         // total redirect weight (clamped later)
    vec3  burst = vec3(0.0);   // transient additive impulse
    vec3  creep = vec3(0.0);   // persistent post-surge outward drift (trails only)

    for (int i = 0; i < MAX_BLOOMS; i++) {
      if (i >= uBloomCount) break;
      vec3  c        = uBloomA[i].xyz;
      float radius   = uBloomA[i].w;
      float burstMag = uBloomB[i].x;
      float seed     = uBloomB[i].y;
      float shapeW   = uBloomB[i].z;
      int   archA    = int(uBloomC[i].x + 0.5);
      int   archB    = int(uBloomC[i].y + 0.5);
      float blendAB  = uBloomC[i].z;
      float openness = uBloomC[i].w;
      // Per-bloom modulators (snapshotted from mood on click — see bloomField.js).
      float outward  = uBloomD[i].x;
      float curlW    = uBloomD[i].y;
      float freq     = uBloomD[i].z;
      float detail   = uBloomD[i].w;
      float shell    = uBloomB[i].w;

      vec3  r = p - c;
      float d = length(r);
      if (d > radius || d < 1e-5) continue;

      vec3  dir = r / d;
      float t   = d / radius;                 // 0 center .. 1 edge
      float w   = (1.0 - t) * (1.0 - t);       // smooth spatial falloff

      // Shape = dominant archetype + one blend partner (top-2, chosen on CPU). Sample the
      // archetypes at the ANIMATED (swirling/evolving) coordinate so the shape is alive.
      vec3  rs = paintWarp(r, seed);
      float presA, presB, steerA, steerB;
      vec3  dA = archetypeDir(archA, rs, t, openness, seed,        freq, detail, presA, steerA);
      vec3  dB = archetypeDir(archB, rs, t, openness, seed + 17.0, freq, detail, presB, steerB);
      float pres  = mix(presA,  presB,  blendAB);
      float steer = mix(steerA, steerB, blendAB);
      // Direction is weighted by STEER so the redirect survives where density is
      // thin (e.g. spike gaps) — that is what lets flow converge onto the crests.
      vec3  fdir = mix(dA * steerA, dB * steerB, blendAB);
      float fl   = length(fdir);
      fdir = fl > 1e-5 ? fdir / fl : dir;

      // SHAPE: persistent same-speed redirect, weighted by steer (broad).
      float sw = w * shapeW * curlW * steer;
      accum += fdir * sw;
      wSum  += sw;

      // BURST: outward pop masked by PRESENCE (thin → spiky, not a sphere; small
      // floor so a click always registers) + a broad shaped push along the field. The
      // shaped term is boosted (PAINT_BURST_SHAPED) and widened toward the rim
      // (PAINT_BURST_WIDEN) so the pop folds along the shape instead of shoving out.
      float shellP  = 4.0 * t * (1.0 - t);
      float outP    = mix(w, shellP, shell);
      float popMask = 0.1 + 0.9 * pres;
      float wShaped = pow(w, PAINT_BURST_WIDEN);
      burst += (dir * (outP * outward * popMask)
              + fdir * (wShaped * curlW * steer * PAINT_BURST_SHAPED)) * burstMag;

      // POST-SURGE CREEP (trails only, uPaintDrift): keep ribbons moving after the firework
      // dies — but ALONG THE ARCHETYPE (fdir), not pure radial. Pure radial (old) made every
      // bloom grow straight spikes after the deform, wiping the archetype. Small radial floor
      // keeps the core from freezing. Self-limiting via w/outP + shapeW LRU fade.
      // uPaintDrift is 0 for meshes (no creep there).
      creep += (fdir * (w * curlW * steer) * PAINT_DRIFT_SHAPED
              + dir  * (outP * outward * popMask) * PAINT_DRIFT_RADIAL) * shapeW;
    }

    // Redirect base velocity toward the shape direction at the SAME speed, so the
    // shape never adds speed; blend weight is clamped so overlaps don't stack.
    vec3 redirect = baseVel;
    if (dot(accum, accum) > 1e-10) {
      redirect = normalize(accum) * baseSpeed;
    }
    vec3 shaped = mix(baseVel, redirect, clamp(wSum, 0.0, 1.0));
    // Scale the ENTIRE paint deviation (redirect + burst + creep) so different sims (mesh
    // vs trails) can feel the same blooms by different amounts. 1 = full, 0 = clean flow.
    return mix(baseVel, shaped + burst + creep * uPaintDrift, uPaintStrength);
  }

  // Full shaped BURST impulse at a world position — the SAME term paintApply adds,
  // but with NO base flow. Used by the trail "burst pass" (gpuTrails.js) which runs
  // this ONCE PER TRAIL (at the head) into a small per-trail texture; the record pass
  // then applies that vector to the whole ribbon. So the heavy archetype fields are
  // evaluated ~count times/frame, not count×history. 0 when no bloom is active.
  vec3 paintBurst(vec3 p) {
    vec3 burst = vec3(0.0);
    for (int i = 0; i < MAX_BLOOMS; i++) {
      if (i >= uBloomCount) break;
      vec3  c        = uBloomA[i].xyz;
      float radius   = uBloomA[i].w;
      float burstMag = uBloomB[i].x;
      float seed     = uBloomB[i].y;
      int   archA    = int(uBloomC[i].x + 0.5);
      int   archB    = int(uBloomC[i].y + 0.5);
      float blendAB  = uBloomC[i].z;
      float openness = uBloomC[i].w;
      float outward  = uBloomD[i].x;
      float curlW    = uBloomD[i].y;
      float freq     = uBloomD[i].z;
      float detail   = uBloomD[i].w;
      float shell    = uBloomB[i].w;

      vec3  r = p - c;
      float d = length(r);
      if (d > radius || d < 1e-5) continue;
      vec3  dir = r / d;
      float t   = d / radius;
      float w   = (1.0 - t) * (1.0 - t);

      vec3  rs = paintWarp(r, seed);
      float presA, presB, steerA, steerB;
      vec3  dA = archetypeDir(archA, rs, t, openness, seed,        freq, detail, presA, steerA);
      vec3  dB = archetypeDir(archB, rs, t, openness, seed + 17.0, freq, detail, presB, steerB);
      float pres  = mix(presA,  presB,  blendAB);
      float steer = mix(steerA, steerB, blendAB);
      vec3  fdir  = mix(dA * steerA, dB * steerB, blendAB);
      float fl    = length(fdir);
      fdir = fl > 1e-5 ? fdir / fl : dir;

      float shellP  = 4.0 * t * (1.0 - t);
      float outP    = mix(w, shellP, shell);
      float popMask = 0.1 + 0.9 * pres;
      float wShaped = pow(w, PAINT_BURST_WIDEN);
      burst += (dir * (outP * outward * popMask)
              + fdir * (wShaped * curlW * steer * PAINT_BURST_SHAPED)) * burstMag;
    }
    return burst;
  }
`;

// Draw-pass ink only (meshes, flow dots, ribbons). Does not include the heavy
// paintApply field — those shaders already get motion from the sim.
export const PAINT_COLOR_GLSL = /* glsl */ `
#ifndef MAX_BLOOMS
#define MAX_BLOOMS ${BLOOM_MAX_ACTIVE}
#endif
  uniform int  uBloomCount;
  uniform vec4 uBloomA[MAX_BLOOMS];
  uniform vec4 uBloomE[MAX_BLOOMS];   // xyz = paint HSL, w = colour stain radius
  uniform float uPaintColorAmt;       // 0 = off, 1 = full tint at ink core

  // Soft ink weight at p from permanent colour stains (wider radius, soft edge bleed).
  // Returns best (hsl, weight); weight is independent of shape fade.
  vec4 paintColorAt(vec3 p) {
    float bestW = 0.0;
    vec3  bestHsl = vec3(0.0);
    for (int bi = 0; bi < MAX_BLOOMS; bi++) {
      if (bi >= uBloomCount) break;
      vec3  c      = uBloomA[bi].xyz;
      float radius = uBloomE[bi].w;
      if (radius < 1e-4) continue;
      float d = length(p - c);
      if (d >= radius) continue;
      float t = d / radius;
      // Soft ink: slow edge falloff (more bleed than hard (1-t)² shape mask).
      float w = 1.0 - smoothstep(0.15, 1.0, t);
      w = w * w * (3.0 - 2.0 * w);
      if (w > bestW) {
        bestW = w;
        bestHsl = uBloomE[bi].xyz;
      }
    }
    return vec4(bestHsl, bestW);
  }

  vec3 applyPaintInk(vec3 hsl, vec3 p) {
    if (uPaintColorAmt <= 0.0 || uBloomCount <= 0) return hsl;
    vec4 ink = paintColorAt(p);
    float tw = ink.w * uPaintColorAmt;
    return vec3(mix(hsl.x, ink.x, tw), mix(hsl.y, ink.y, tw), mix(hsl.z, ink.z, tw));
  }
`;
