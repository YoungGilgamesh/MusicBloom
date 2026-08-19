/**
 * Batch: decode each AUDIO_SRCS track → mood fingerprint → mesh mix.
 * Usage: node scripts/scanMeshMix.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import decodeAudio from 'audio-decode';
import { AUDIO_SRCS, AUDIO_TRACK_LABELS } from '../src/config.js';
import { analyseBuffer } from '../src/audio/audioPrecompute.js';
import { computeMoodFingerprint } from '../src/audio/audioMoodAnalyze.js';
import { contrastMood } from '../src/moodContrast.js';
import { moodToMeshMix } from '../src/audio/moodToMeshMix.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const audioDir = path.join(root, 'public', 'audio');

function resolveAudioFile(src) {
  const name = decodeURIComponent(src.replace(/^\/audio\//, ''));
  const direct = path.join(audioDir, name);
  if (fs.existsSync(direct)) return direct;
  // Tolerate missing space: "Studio Kolomna" vs "StudioKolomna"
  const alt = name.replace('Studio Kolomna', 'StudioKolomna');
  const altPath = path.join(audioDir, alt);
  if (fs.existsSync(altPath)) return altPath;
  return null;
}

function asAudioBuffer(decoded) {
  const channelData = decoded.channelData || decoded.channels;
  const numberOfChannels = decoded.numberOfChannels ?? channelData.length;
  const length = channelData[0].length;
  return {
    numberOfChannels,
    length,
    sampleRate: decoded.sampleRate,
    duration: decoded.duration ?? length / decoded.sampleRate,
    getChannelData(c) { return channelData[c]; },
  };
}

const rows = [];
for (let i = 0; i < AUDIO_SRCS.length; i++) {
  const src = AUDIO_SRCS[i];
  const label = AUDIO_TRACK_LABELS[i] || src;
  const file = resolveAudioFile(src);
  if (!file) {
    rows.push({ i, label, error: 'file missing', src });
    continue;
  }
  process.stdout.write(`analysing ${i}: ${label}…\n`);
  const buf = fs.readFileSync(file);
  const decoded = await decodeAudio(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  const analysed = analyseBuffer(asAudioBuffer(decoded));
  const mood = contrastMood(computeMoodFingerprint(analysed));
  const mix = moodToMeshMix(mood);
  rows.push({
    i,
    label,
    major: mix.major,
    accents: mix.accents,
    types: mix.types,
    counts: mix.counts,
    hasPedal: mix.types.includes('pedal'),
    mood: {
      e: +mood.energy.toFixed(3),
      b: +mood.brightness.toFixed(3),
      t: +mood.texture.toFixed(3),
      h: +mood.heaviness.toFixed(3),
      d: +mood.dynamism.toFixed(3),
      bpm: Math.round(mood.bpm),
    },
    scores: Object.fromEntries(
      Object.entries(mix.scores).map(([k, v]) => [k, +v.toFixed(3)]),
    ),
  });
}

console.log('\n=== mesh mix per track ===\n');
for (const r of rows) {
  if (r.error) {
    console.log(`[${r.i}] ${r.label}: MISSING (${r.src})`);
    continue;
  }
  const pedal = r.hasPedal ? 'PEDAL' : '     ';
  console.log(
    `[${r.i}] ${pedal} ${r.label.padEnd(22)} major=${r.major.padEnd(8)} `
    + `accents=${r.accents.join('+').padEnd(18)} `
    + `mood e${r.mood.e} b${r.mood.b} t${r.mood.t} h${r.mood.h} d${r.mood.d} ${r.mood.bpm}bpm`,
  );
  console.log(
    `       scores flower=${r.scores.flower} pedal=${r.scores.pedal} rock=${r.scores.rock} `
    + `marble=${r.scores.marble} tri=${r.scores.triangle}`,
  );
}

const withPedal = rows.filter((r) => r.hasPedal);
console.log(`\nPedal in mix: ${withPedal.length}/${rows.filter((r) => !r.error).length}`);
if (withPedal.length) {
  for (const r of withPedal) {
    console.log(`  - ${r.label}: major=${r.major}, accents=${r.accents.join('+')}, count=${r.counts.pedal}`);
  }
} else {
  console.log('  (none)');
}
