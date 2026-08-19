/**
 * beatField.glsl.js — shared GLSL for Phase B: CLUSTER-LOCAL beat displacement.
 *
 * On each precomputed beat we punch the particles so the cloud *beats* — but LOCALLY, per
 * region, NOT as one global breathe (we fly INSIDE the cloud, so it must beat around you).
 *
 * The displacement is a RENDER-TIME, NON-ACCUMULATING offset added to the world position of
 * BOTH the mesh dots (shaders.js) and the trail ribbon points (gpuTrails.js RIBBON_VERT),
 * from this one shared snippet with the SAME uniforms — so where they overlap they move
 * together. It is NOT done in the sim (that would accumulate / fight the flow, and frozen
 * trail history can't be re-simulated). Between beats the pulse envelope → 0, so every
 * particle sits exactly on its true (sim) rest position → the cloud pulses around its shape.
 *
 * CLUSTER-LOCAL = a smooth world-space VECTOR field: each region gets its own wobble
 * DIRECTION + amount (cluster size ≈ 1 / uBeatFreq), so on a beat every clump punches
 * differently instead of a uniform scale. Decided look (planning session):
 *   - character = DIRECTIONAL WOBBLE (each cluster jolts in its own noise-picked direction)
 *   - phase     = TOGETHER (single global uBeatPulse; spatial variation only in dir/amount)
 *   - magnitude = BEAT IMPULSE ONLY (uBeatPulse is audioMotion's [0,1] beat envelope)
 *
 * TRAIL SAFETY: the field must be SMOOTH relative to a ribbon (cluster size ≫ history point
 * spacing) or adjacent points get very different offsets and the ribbon shatters. So keep
 * uBeatFreq low. A trail spanning a cluster boundary just flexes — which is fine.
 *
 * Noise fns are bt*-prefixed: the mesh shader also includes INSTANCE_GLSL (iw*), and both
 * must not collide. Requires GLSL3. Amt or pulse = 0 → returns 0 (exact rest = off).
 */
export const BEAT_GLSL = /* glsl */ `
  uniform float uBeatAmt;    // displacement magnitude (world units) at full pulse (0 = off)
  uniform float uBeatFreq;   // spatial frequency of the cluster field (cluster size ≈ 1/freq)
  uniform float uBeatPulse;  // beat envelope [0,1] — snaps to 1 on a beat, decays to 0
  uniform float uBeatTime;   // elapsed seconds (slow field drift so clusters aren't world-pinned)
  uniform float uBeatDrift;  // world-units/sec the cluster field drifts

  float btHash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float btNoise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(btHash(i + vec3(0,0,0)), btHash(i + vec3(1,0,0)), f.x),
                   mix(btHash(i + vec3(0,1,0)), btHash(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(btHash(i + vec3(0,0,1)), btHash(i + vec3(1,0,1)), f.x),
                   mix(btHash(i + vec3(0,1,1)), btHash(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
  // Smooth per-region vector in [-1,1]^3 (decorrelated samples) → the wobble DIRECTION +
  // amount, varying from cluster to cluster (cluster size set by uBeatFreq).
  vec3 btVec(vec3 p) {
    return vec3(btNoise(p),
                btNoise(p + vec3( 19.3,  7.1, 33.7)),
                btNoise(p + vec3(-11.9, 41.3,  5.2))) * 2.0 - 1.0;
  }

  // Cluster-local beat displacement at a world point. Each region jolts in its OWN direction
  // on the beat, then eases back as uBeatPulse decays to 0 (→ zero offset → rest).
  vec3 beatDisplace(vec3 world) {
    if (uBeatAmt <= 0.0 || uBeatPulse <= 0.0) return vec3(0.0);
    vec3 q = world * uBeatFreq + uBeatTime * uBeatDrift;
    return btVec(q) * (uBeatAmt * uBeatPulse);
  }
`;
