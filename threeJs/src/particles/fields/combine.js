/**
 * fields/combine.js — combination + sampling layer for all 6 mood fields.
 *
 * Combination model — "Option A: Dominant Warp + Full Superposition":
 *   • Every active field contributes to the combined curl (linear superposition)
 *     evaluated at the (possibly warped) position.
 *   • Only the strongest 1–2 fields (chosen by the caller via `warpOrder`) deform
 *     the coordinate space itself through domain warping.
 *
 * Sampling — `sampleAll6Cloud`:
 *   • Particle budget is split proportionally across the 6 fields.
 *   • Energy seeds use a dedicated upward fire integrator (`integrateFireLine`).
 *   • Brightness / heaviness / dynamism seeds use the shared flow integrator
 *     (`integrateWarpedAll`).
 *   • Texture and BPM are rejection-sampled onto their isosurfaces.
 */

import { SHAPE_SCALE, PARTICLE_SIZE_MIN, PARTICLE_SIZE_RANGE } from '../../config.js';
import { WARP_MAX } from './shared.js';
import { generateEnergyPoles, fireVelocity, curlEnergy } from './energy.js';
import { generateSpokes, spokeFieldSigma, spokePsi, curlBrightness } from './brightness.js';
import { fbmFreq, fbmOctaves, fbmField, texturePsi } from './texture.js';
import { generateStreamChannels, heavinessPsi, curlHeaviness } from './heaviness.js';
import { generateHelixAxes, helixSigma, helixPitchK, helixPsi, curlHelix } from './dynamism.js';
import { normBpm, generateWaveSources, bpmWavenumber, interferenceAndGrad } from './bpm.js';

// Combined curl using linearity: curl(e·Ψe+b·Ψb+h·Ψh+d·Ψd) = e·curlE + b·curlB + …
// Guards skip zero-value fields, saving cost when params are inactive.
// Note: curlEnergy returns the fire velocity directly (not a mathematical curl).
function curlAll4EBHD(x, y, z, e, b, h, d, ePoles, spokes, sb2, channels, sh2, helixAxes, hsigma2, hpitchK) {
  let vx = 0, vy = 0, vz = 0;
  if (e > 0.01) { const c = curlEnergy(x, y, z, ePoles);                        vx+=c[0]*e; vy+=c[1]*e; vz+=c[2]*e; }
  if (b > 0.01) { const c = curlBrightness(x, y, z, spokes, sb2);               vx+=c[0]*b; vy+=c[1]*b; vz+=c[2]*b; }
  if (h > 0.01) { const c = curlHeaviness(x, y, z, channels, sh2, h);           vx+=c[0]*h; vy+=c[1]*h; vz+=c[2]*h; }
  if (d > 0.01) { const c = curlHelix(x, y, z, helixAxes, hsigma2, hpitchK);    vx+=c[0]*d; vy+=c[1]*d; vz+=c[2]*d; }
  return [vx, vy, vz];
}

// Apply warp steps in the order given.  Each warp direction is normalised so
// the displacement amplitude is purely  param_value × WARP_MAX.
// texP = { freq, oct } for FBM isosurface texture field.
// ePoles: precomputed from generateEnergyPoles().
function domainWarpPosOrdered(x, y, z, warpOrder, e, b, t, h, d, bpmSrc, bpmK, bpmN, ePoles, spokes, sb2, texP, channels, sh2, helixAxes, hsigma2, hpitchK) {
  let px = x, py = y, pz = z;
  for (const p of warpOrder) {
    let wx, wy, wz, amp;
    if      (p === 'energy'    && e    > 0.01) { const ef=fireVelocity(px,py,pz,ePoles); wx=ef[0]; wy=ef[1]; wz=ef[2]; amp=e; }
    else if (p === 'brightness'&& b    > 0.01) { wx=spokePsi(0,px,py,pz,spokes,sb2);         wy=spokePsi(1,px,py,pz,spokes,sb2);         wz=spokePsi(2,px,py,pz,spokes,sb2);         amp=b; }
    else if (p === 'texture'   && t    > 0.01) { wx=texturePsi(0,px,py,pz,texP);              wy=texturePsi(1,px,py,pz,texP);              wz=texturePsi(2,px,py,pz,texP);              amp=t; }
    else if (p === 'heaviness' && h    > 0.01) { wx=heavinessPsi(0,px,py,pz,channels,sh2,h); wy=heavinessPsi(1,px,py,pz,channels,sh2,h); wz=heavinessPsi(2,px,py,pz,channels,sh2,h); amp=h; }
    else if (p === 'dynamism'  && d    > 0.01) { wx=helixPsi(0,px,py,pz,helixAxes,hsigma2,hpitchK); wy=helixPsi(1,px,py,pz,helixAxes,hsigma2,hpitchK); wz=helixPsi(2,px,py,pz,helixAxes,hsigma2,hpitchK); amp=d; }
    else if (p === 'bpm'       && bpmN > 0.01) { const ig=interferenceAndGrad(px,py,pz,bpmSrc,bpmK); wx=ig.gx; wy=ig.gy; wz=ig.gz; amp=bpmN; }
    else continue;
    const wm = Math.sqrt(wx*wx+wy*wy+wz*wz)+1e-8;
    px+=(wx/wm)*amp*WARP_MAX; py+=(wy/wm)*amp*WARP_MAX; pz+=(wz/wm)*amp*WARP_MAX;
  }
  return [px, py, pz];
}

// Shared flow integrator for brightness / heaviness / dynamism seeds.
// texP = { freq, oct } for FBM isosurface texture field.
// ePoles: precomputed from generateEnergyPoles() — passed through to curlAll4EBHD.
function integrateWarpedAll(x0, y0, z0, warpOrder, e, b, t, h, d, bpmSrc, bpmK, bpmN, ePoles, spokes, sb2, texP, channels, sh2, helixAxes, hsigma2, hpitchK) {
  const steps     = 10;
  const total     = e + b + h + d + 1e-8;
  const stepSize  = 0.038 + (total / 4) * 0.010;
  const maxR2     = (SHAPE_SCALE * 1.38) ** 2;
  const maxTravel = steps * stepSize;

  let x = x0, y = y0, z = z0;
  let lvx = 0, lvy = -1, lvz = 0;
  let traveled = 0;

  for (let i = 0; i < steps; i++) {
    const [wx, wy, wz] = domainWarpPosOrdered(x, y, z, warpOrder, e, b, t, h, d, bpmSrc, bpmK, bpmN, ePoles, spokes, sb2, texP, channels, sh2, helixAxes, hsigma2, hpitchK);
    let [vx, vy, vz]   = curlAll4EBHD(wx, wy, wz, e, b, h, d, ePoles, spokes, sb2, channels, sh2, helixAxes, hsigma2, hpitchK);

    const len = Math.sqrt(vx*vx+vy*vy+vz*vz);
    if (len < 1e-6) break;
    const inv = 1/len;
    x+=vx*inv*stepSize; y+=vy*inv*stepSize; z+=vz*inv*stepSize;
    lvx=vx; lvy=vy; lvz=vz;
    traveled+=stepSize;
    const r2=x*x+y*y+z*z;
    if (r2>maxR2){const s=Math.sqrt(maxR2/r2);x*=s;y*=s;z*=s;break;}
  }

  const phase = Math.min(1, traveled/maxTravel);
  const fl    = Math.sqrt(lvx*lvx+lvy*lvy+lvz*lvz)+1e-8;
  return [x,y,z,lvx/fl,lvy/fl,lvz/fl,phase];
}

// Dedicated integration for fire-tongue seeds.
//
// • 18 steps × 0.068 step size → total travel ≈ 1.22 × SHAPE_SCALE
//   (base to top of cloud in one pass)
// • Velocity = fire field (up + turbulence), evaluated at domain-warped position
// • Energy excluded from its own warp chain — fire tongues don't self-distort
//
function integrateFireLine(x0, y0, z0, warpOrder, e, b, t, h, d,
    bpmSrc, bpmK, bpmN, ePoles, spokes, sb2, texP, channels, sh2, helixAxes, hsigma2, hpitchK) {
  const steps     = 18;
  const stepSize  = 0.068;
  const maxR2     = (SHAPE_SCALE * 1.45) ** 2;
  const maxTravel = steps * stepSize;

  const warpNoE = warpOrder.filter(p => p !== 'energy');

  let x = x0, y = y0, z = z0;
  let lvx = 0, lvy = 1, lvz = 0;
  let traveled = 0;

  for (let i = 0; i < steps; i++) {
    const [wx, wy, wz] = domainWarpPosOrdered(x, y, z, warpNoE,
      e, b, t, h, d, bpmSrc, bpmK, bpmN, ePoles, spokes, sb2, texP, channels, sh2, helixAxes, hsigma2, hpitchK);
    const fv  = fireVelocity(wx, wy, wz, ePoles);
    const len = Math.sqrt(fv[0]*fv[0]+fv[1]*fv[1]+fv[2]*fv[2]);
    if (len < 1e-6) break;
    const inv = 1 / len;
    x += fv[0]*inv*stepSize; y += fv[1]*inv*stepSize; z += fv[2]*inv*stepSize;
    lvx = fv[0]; lvy = fv[1]; lvz = fv[2];
    traveled += stepSize;
    const r2 = x*x+y*y+z*z;
    if (r2 > maxR2) { const s=Math.sqrt(maxR2/r2); x*=s; y*=s; z*=s; break; }
  }

  const phase = Math.min(1, traveled / maxTravel);
  const fl    = Math.sqrt(lvx*lvx+lvy*lvy+lvz*lvz) + 1e-8;
  return [x, y, z, lvx/fl, lvy/fl, lvz/fl, phase];
}

// ── Field bundle ──────────────────────────────────────────────────────────────
// Generates every field descriptor once for a given mood.  All generators are
// deterministic (seeded RNG), so the seed-sampler (main thread) and the velocity
// baker (worker) produce the *identical* field from the same params — flow and
// spawn positions always agree.
export function buildFieldBundle(energy, brightness, texture, heaviness, dynamism, bpm, warpOrder) {
  const bpmN = normBpm(bpm);
  return {
    warpOrder,
    energy, brightness, texture, heaviness, dynamism, bpmN,
    ePoles:    generateEnergyPoles(energy),
    spokes:    generateSpokes(brightness),
    sb2:       spokeFieldSigma(brightness) ** 2,
    texP:      { freq: fbmFreq(texture), oct: fbmOctaves(texture) },
    channels:  generateStreamChannels(heaviness),
    sh2:       (SHAPE_SCALE * (0.11 - heaviness * 0.04)) ** 2,
    helixAxes: generateHelixAxes(dynamism),
    hsigma2:   helixSigma(dynamism) ** 2,
    hpitchK:   helixPitchK(dynamism),
    bpmSrc:    generateWaveSources(bpm),
    bpmK:      bpmWavenumber(bpm),
  };
}

// Combined flow velocity at a point — the exact per-step velocity used by the
// streamline integrator: superposition curl evaluated at the domain-warped
// position.  This is what gets baked into the velocity volume.
export function combinedVelocity(x, y, z, F) {
  const [wx, wy, wz] = domainWarpPosOrdered(
    x, y, z, F.warpOrder,
    F.energy, F.brightness, F.texture, F.heaviness, F.dynamism,
    F.bpmSrc, F.bpmK, F.bpmN,
    F.ePoles, F.spokes, F.sb2, F.texP, F.channels, F.sh2, F.helixAxes, F.hsigma2, F.hpitchK);
  return curlAll4EBHD(
    wx, wy, wz, F.energy, F.brightness, F.heaviness, F.dynamism,
    F.ePoles, F.spokes, F.sb2, F.channels, F.sh2, F.helixAxes, F.hsigma2, F.hpitchK);
}

// ── Master sampler — all 6 fields, dominant-warp + full superposition ─────────
export function sampleAll6Cloud(count, energy, brightness, texture, heaviness, dynamism, bpm, warpOrder) {
  const bpmN   = normBpm(bpm);
  const total6 = energy + brightness + texture + heaviness + dynamism + bpmN + 1e-8;

  const bpmC  = Math.round(count * bpmN / total6);
  const intC  = count - bpmC;

  const ebthd = energy + brightness + texture + heaviness + dynamism + 1e-8;
  const eC = Math.round(intC * energy     / ebthd);
  const bC = Math.round(intC * brightness / ebthd);
  const tC = Math.round(intC * texture    / ebthd);
  const hC = Math.round(intC * heaviness  / ebthd);
  const dC = intC - eC - bC - tC - hC;

  // Precompute all field descriptors once — shared across every integrate call.
  // Identical to what the velocity baker uses (see buildFieldBundle).
  const { ePoles, spokes, sb2, texP, channels, sh2, helixAxes, hsigma2, hpitchK, bpmSrc, bpmK }
    = buildFieldBundle(energy, brightness, texture, heaviness, dynamism, bpm, warpOrder);

  // Convenience alias so every integrateWarpedAll call is identical in shape.
  const iwa = (x0, y0, z0) =>
    integrateWarpedAll(x0, y0, z0, warpOrder,
      energy, brightness, texture, heaviness, dynamism,
      bpmSrc, bpmK, bpmN,
      ePoles, spokes, sb2, texP, channels, sh2, helixAxes, hsigma2, hpitchK);

  const positions = new Float32Array(count * 3);
  const normals   = new Float32Array(count * 3);
  const phases    = new Float32Array(count);
  const sizes     = new Float32Array(count);
  let off = 0;

  // ── Energy seeds (fire tongues) ──────────────────────────────────────────────
  // Seeds scattered around each tongue root on the inner sphere.
  // integrateFireLine carries them outward + upward with turbulence.
  // Phase inverted so roots are bright (hot core) and tips are dim (cool wisps).
  if (eC > 0) {
    const { bases } = ePoles;
    const nTongues  = bases.length;
    const tongueR   = SHAPE_SCALE * (0.07 + energy * 0.05);
    const perTongue = Math.floor(eC / nTongues);
    const eStart    = off;
    const iwe = (x0, y0, z0) =>
      integrateFireLine(x0, y0, z0, warpOrder,
        energy, brightness, texture, heaviness, dynamism,
        bpmSrc, bpmK, bpmN, ePoles, spokes, sb2, texP, channels, sh2, helixAxes, hsigma2, hpitchK);
    for (let ti = 0; ti < nTongues; ti++) {
      const [bx, by, bz] = bases[ti];
      const nCount   = ti < nTongues-1 ? perTongue : eStart+eC-off;
      for (let j = 0; j < nCount && off < eStart+eC; j++) {
        const u = Math.random(), v = Math.random();
        const th = Math.acos(1-2*u), ph2 = v*Math.PI*2;
        const r0 = tongueR * Math.sqrt(Math.random());
        const x0 = bx + r0*Math.sin(th)*Math.cos(ph2);
        const y0 = by + r0*Math.cos(th);
        const z0 = bz + r0*Math.sin(th)*Math.sin(ph2);
        const [fx,fy,fz,nx,ny,nz,phase] = iwe(x0,y0,z0);
        positions[off*3]=fx;positions[off*3+1]=fy;positions[off*3+2]=fz;
        normals[off*3]=nx;normals[off*3+1]=ny;normals[off*3+2]=nz;
        phases[off] = 1.0 - phase;   // invert: bright base, dim tip
        sizes[off]  = PARTICLE_SIZE_MIN + Math.random() * PARTICLE_SIZE_RANGE;
        off++;
      }
    }
  }

  // ── Brightness seeds (spoke axes) ───────────────────────────────────────────
  if (bC > 0) {
    const NS=spokes.length,spokeLen=SHAPE_SCALE*1.10,seedR=Math.sqrt(sb2)*0.32,perSpoke=Math.floor(bC/NS),bStart=off;
    for (let si=0;si<NS;si++) {
      const d=spokes[si],nCount=(si<NS-1)?perSpoke:bStart+bC-off;
      const upRef=Math.abs(d[1])<0.99?[0,1,0]:[1,0,0];
      let ux=upRef[1]*d[2]-upRef[2]*d[1],uy=upRef[2]*d[0]-upRef[0]*d[2],uz=upRef[0]*d[1]-upRef[1]*d[0];
      const ul=Math.sqrt(ux*ux+uy*uy+uz*uz)+1e-8;ux/=ul;uy/=ul;uz/=ul;
      const cvx=d[1]*uz-d[2]*uy,cvy=d[2]*ux-d[0]*uz,cvz=d[0]*uy-d[1]*ux;
      for (let j=0;j<nCount&&off<bStart+bC;j++) {
        const tt=Math.min(1,Math.max(0.01,(j+0.5)/nCount+(Math.random()-0.5)*0.20));
        const dist=tt*spokeLen,r0=seedR*Math.sqrt(Math.random()),ang=Math.random()*Math.PI*2;
        const x0=d[0]*dist+ux*r0*Math.cos(ang)+cvx*r0*Math.sin(ang);
        const y0=d[1]*dist+uy*r0*Math.cos(ang)+cvy*r0*Math.sin(ang);
        const z0=d[2]*dist+uz*r0*Math.cos(ang)+cvz*r0*Math.sin(ang);
        const [fx,fy,fz,nx,ny,nz,phase]=iwa(x0,y0,z0);
        positions[off*3]=fx;positions[off*3+1]=fy;positions[off*3+2]=fz;
        normals[off*3]=nx;normals[off*3+1]=ny;normals[off*3+2]=nz;
        phases[off]=phase;sizes[off]=PARTICLE_SIZE_MIN+Math.random()*PARTICLE_SIZE_RANGE;off++;
      }
    }
  }

  // ── Texture seeds (FBM isosurface, flow-integrated) ─────────────────────────
  // Seeds placed where |fbm(x)| < band — organic material cross-sections.
  // Low texture = large blobs/peeling layers; high texture = fine wispy filaments.
  if (tC > 0) {
    const { freq, oct } = texP;
    const band   = 0.04 - texture * 0.02;
    const maxR   = SHAPE_SCALE * 0.95, maxR2 = maxR * maxR;
    const tStart = off; let tp = 0, att = 0;
    while (tp < tC && att < tC * 25) {
      att++;
      const x=(Math.random()*2-1)*maxR, y=(Math.random()*2-1)*maxR, z=(Math.random()*2-1)*maxR;
      if (x*x+y*y+z*z > maxR2) continue;
      const f = fbmField(x, y, z, freq, oct);
      if (Math.abs(f) >= band) continue;
      const [fx,fy,fz,nx,ny,nz,phase] = iwa(x, y, z);
      positions[off*3]=fx; positions[off*3+1]=fy; positions[off*3+2]=fz;
      normals[off*3]=nx;   normals[off*3+1]=ny;   normals[off*3+2]=nz;
      phases[off] = Math.abs(f) / band;
      sizes[off]  = PARTICLE_SIZE_MIN + Math.random() * PARTICLE_SIZE_RANGE;
      off++; tp++;
    }
    if (tp>0){while(off<tStart+tC){const src=tStart+Math.floor(Math.random()*tp);positions[off*3]=positions[src*3];positions[off*3+1]=positions[src*3+1];positions[off*3+2]=positions[src*3+2];normals[off*3]=normals[src*3];normals[off*3+1]=normals[src*3+1];normals[off*3+2]=normals[src*3+2];phases[off]=phases[src];sizes[off]=PARTICLE_SIZE_MIN+Math.random()*PARTICLE_SIZE_RANGE;off++;}}
  }

  // ── Heaviness seeds (stream channels) ───────────────────────────────────────
  if (hC > 0) {
    const hN=channels.length,seedR=Math.sqrt(sh2)*0.30,perCh=Math.floor(hC/hN),hStart=off;
    for (let ci=0;ci<hN;ci++) {
      const [cx,cz]=channels[ci],nCount=(ci<hN-1)?perCh:hStart+hC-off;
      for (let j=0;j<nCount&&off<hStart+hC;j++) {
        const r0=seedR*Math.sqrt(Math.random()),ang=Math.random()*Math.PI*2;
        const x0=cx+r0*Math.cos(ang),z0=cz+r0*Math.sin(ang);
        const maxY=Math.sqrt(Math.max(0,SHAPE_SCALE*SHAPE_SCALE*1.28-x0*x0-z0*z0));
        const y0=(Math.random()*2-1)*maxY;
        const [fx,fy,fz,nx,ny,nz,phase]=iwa(x0,y0,z0);
        positions[off*3]=fx;positions[off*3+1]=fy;positions[off*3+2]=fz;
        normals[off*3]=nx;normals[off*3+1]=ny;normals[off*3+2]=nz;
        phases[off]=phase;sizes[off]=PARTICLE_SIZE_MIN+Math.random()*PARTICLE_SIZE_RANGE;off++;
      }
    }
  }

  // ── Dynamism seeds (helix curves) ───────────────────────────────────────────
  if (dC > 0) {
    const N=helixAxes.length,R_coil=SHAPE_SCALE*(0.40-dynamism*0.25),halfL=SHAPE_SCALE*0.72;
    const jitter=Math.sqrt(hsigma2)*0.18,perAxis=Math.floor(dC/N),dStart=off;
    for (let ai=0;ai<N;ai++) {
      const a=helixAxes[ai];
      const ax=a[0],ay=a[1],az=a[2],e1x=a[3],e1y=a[4],e1z=a[5],e2x=a[6],e2y=a[7],e2z=a[8],ph=a[9];
      const nCount=(ai<N-1)?perAxis:dStart+dC-off;
      for (let j=0;j<nCount&&off<dStart+dC;j++) {
        const frac=(j+0.5)/nCount+(Math.random()-0.5)*0.7/nCount;
        const tt=(-1+2*Math.min(1,Math.max(0,frac)))*halfL;
        const ca=Math.cos(hpitchK*tt+ph),sa=Math.sin(hpitchK*tt+ph);
        const x0=tt*ax+R_coil*(ca*e1x-sa*e2x)+(Math.random()-0.5)*jitter*2;
        const y0=tt*ay+R_coil*(ca*e1y-sa*e2y)+(Math.random()-0.5)*jitter*2;
        const z0=tt*az+R_coil*(ca*e1z-sa*e2z)+(Math.random()-0.5)*jitter*2;
        const [fx,fy,fz,nx,ny,nz,phase]=iwa(x0,y0,z0);
        positions[off*3]=fx;positions[off*3+1]=fy;positions[off*3+2]=fz;
        normals[off*3]=nx;normals[off*3+1]=ny;normals[off*3+2]=nz;
        phases[off]=Math.abs(tt)/halfL;sizes[off]=PARTICLE_SIZE_MIN+Math.random()*PARTICLE_SIZE_RANGE;off++;
      }
    }
  }

  // ── BPM (wave interference, additive rejection layer) ───────────────────────
  // BPM warps coordinate space inside integrateWarpedAll via interferenceAndGrad.
  // Its own seeds live on interference surfaces (no Ψ → no curl → no flow-integration).
  if (bpmC > 0) {
    const THRESH=0.52,maxR=SHAPE_SCALE*1.12,maxR2=maxR*maxR;
    const bStart=off; let tp=0,att=0;
    while (tp<bpmC&&att<bpmC*45) {
      att++;
      const x=(Math.random()*2-1)*maxR,y=(Math.random()*2-1)*maxR,z=(Math.random()*2-1)*maxR;
      if (x*x+y*y+z*z>maxR2) continue;
      const {f,gx,gy,gz}=interferenceAndGrad(x,y,z,bpmSrc,bpmK);
      if (f<THRESH) continue;
      const gl=Math.sqrt(gx*gx+gy*gy+gz*gz)+1e-8;
      positions[off*3]=x;positions[off*3+1]=y;positions[off*3+2]=z;
      normals[off*3]=gx/gl;normals[off*3+1]=gy/gl;normals[off*3+2]=gz/gl;
      phases[off]=1-(f-THRESH)/(1-THRESH);sizes[off]=PARTICLE_SIZE_MIN+Math.random()*PARTICLE_SIZE_RANGE;
      off++;tp++;
    }
    if (tp>0){const jitter=SHAPE_SCALE*0.018;while(off<bStart+bpmC){const src=bStart+Math.floor(Math.random()*tp);positions[off*3]=positions[src*3]+(Math.random()-0.5)*jitter;positions[off*3+1]=positions[src*3+1]+(Math.random()-0.5)*jitter;positions[off*3+2]=positions[src*3+2]+(Math.random()-0.5)*jitter;normals[off*3]=normals[src*3];normals[off*3+1]=normals[src*3+1];normals[off*3+2]=normals[src*3+2];phases[off]=phases[src];sizes[off]=PARTICLE_SIZE_MIN+Math.random()*PARTICLE_SIZE_RANGE;off++;}}
  }

  return { positions, normals, phases, sizes };
}
