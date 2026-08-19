# Particle models (5 type libraries)

Mesh particles are organized as **five named type libraries**. Mood picks **one
major + two accents** once per track bake (`moodToMeshMix.js`).

```
public/models/
  type01/   triangle_01…04.glb
  type02/   flower_01…03.glb + flower_texture.jpg
  type03/   pedal.glb + pedal_texture.jpg
  type04/   rock_01…03.glb
  type05/   marble.glb   (procedural marble shader)
```

Anything in `public/` is served at the site root, e.g.
`/models/type01/triangle_01.glb`.

## Catalog

Defined in `src/config.js` as `MESH_TYPES` (srcs, map, scales, GPU cost, sizeMul).
Instance counts come from `MESH_BUDGET` ÷ per-type cost × mood ratios.

## Authoring tips

- Several low-poly `.glb` variants per type when useful.
- Ideally **&lt; ~500 triangles** each (thousands of instances).
- Centered at origin, roughly unit-sized; elongated models: long axis on **+Z**.
- Prefer **vertex colors**; `.glb` over multi-file `.gltf`.
- Optional sidecar albedo via `MESH_TYPES[id].map`.
