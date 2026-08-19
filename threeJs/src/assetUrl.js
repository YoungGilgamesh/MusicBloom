/** Prefix a public/ path with Vite's base ( '/' locally, '/MusicBloom/' on GitHub Pages). */
export function assetUrl(path) {
  return `${import.meta.env.BASE_URL}${String(path).replace(/^\//, '')}`;
}
