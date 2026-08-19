import { defineConfig } from 'vite';

// GitHub Pages serves this repo at /MusicBloom/. Local `npm run dev` stays at /.
export default defineConfig({
  base: process.env.VITE_BASE || '/',
});
