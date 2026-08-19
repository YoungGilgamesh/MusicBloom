# Audio test tracks

Drop your test tracks here. Vite serves `public/` at the site root, so a file at
`public/audio/V1.mp3` is fetched as `/audio/V1.mp3`.

## Wiring

List each track in `src/config.js`:

```js
export const AUDIO_SRCS       = ['/audio/V1.mp3', '/audio/V2.mp3'];
export const AUDIO_TRACK_LABELS = ['V1', 'V2'];
```

The tuning panel shows a **track** dropdown built from these; picking one reloads
with `?track=N` (deterministic, keeps the analysis simple). Index must match
between the two arrays.

## Notes

- Formats: whatever the browser can `decodeAudioData` (mp3, wav, ogg, m4a…).
- The whole track is analysed **once, offline** on load (FFT → 7 bands + beats +
  mood fingerprint), then played back by time index — no live FFT at runtime.
- Longer tracks take a touch longer to pre-analyse (a second or two); it's logged
  to the console (`[audio] pre-compute done in …`).

> Moving the current file: `public/V1.mp3` → `public/audio/V1.mp3`.
