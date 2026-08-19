/**
 * One-off: print V1.mp3's raw mood fingerprint (before contrastMood), so it
 * can be hardcoded as COVER_FIXED_MOOD in main.js — matches exactly what the
 * real gameplay shape would be if V1.mp3 were played.
 * Usage: node scripts/getV1Mood.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import decodeAudio from 'audio-decode';
import { analyseBuffer } from '../src/audio/audioPrecompute.js';
import { computeMoodFingerprint } from '../src/audio/audioMoodAnalyze.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const file = path.join(root, 'public', 'audio', 'V1.mp3');

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

const buf = fs.readFileSync(file);
const decoded = await decodeAudio(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
const analysed = analyseBuffer(asAudioBuffer(decoded));
const mood = computeMoodFingerprint(analysed);

console.log('V1.mp3 raw mood fingerprint:');
console.log({
    energy: +mood.energy.toFixed(4),
    brightness: +mood.brightness.toFixed(4),
    texture: +mood.texture.toFixed(4),
    heaviness: +mood.heaviness.toFixed(4),
    dynamism: +mood.dynamism.toFixed(4),
    bpm: +mood.bpm.toFixed(2),
});
