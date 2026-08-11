# Three-layer terrain SSOT

**Lab:** CastingAbilitiesThreeJS · `src/world/terrainLayers.js`  
**Also:** grudge-player-and-grass L0–L3 · `docs/TERRAIN_PHYSICS_SSOT.md`

World texturing and locomotion share **one height field**. References teach patterns — we do **not** ship three parallel engines.

---

## Learn from (patterns only)

| Source | Take |
|--------|------|
| [snakey-locomotion](https://github.com/muratkamci/snakey-locomotion) | CPU `heightAt` = mesh = feet; multi-band FBM; trail-on-surface; reactive grass ideas; trees on height |
| [three-stylized](https://github.com/Steve245270533/three-stylized) | **Grounds** + instanced grass wind, meadow colors, external `surface` sample, dispose ownership |
| [threejs-examples scene=0](https://simonstorlschulke.github.io/threejs-examples/?scene=0) | Infinite / streaming terrain tiles (later chunk L0–L2) |
| Desktop `forestoutline.html` | Instanced procedural trees, leaf texture/sway, LOD cull, SI scatter, bark/leaf color |

---

## Layers (production)

| Layer | Name | Casting code | Physics |
|-------|------|--------------|---------|
| **L0** | Height field | `IslandHeightfield.heightAt` / `sample` | Rapier heightfield |
| **L1** | Surface ground | `IslandHeightfield.mesh` (meadow/dirt/shore vertex colors) | same mesh |
| **L2** | Vegetation | `StylizedGrassLayer` + `GrowingForest` | none on blades; trees harvest |
| **L3** | Detail | `DevIslandHarvest` rocks/ore | static props |
| **Water** | Sibling | `StageWater` | freeride / sensor |

```
L2 grass roots ──┐
L2 forest feet ──┼──► L0 heightSample(x,z)  ◄── player feet / aim / path
L1 mesh verts ───┘
L3 harvest Y ────┘
```

**Hard:** no second heightmap. Map load rebinds MapSurface only — controller/session keep (fleet rule).

---

## How layers map to references

### L0 — snakey + stylized terrain math

- Multi-band FBM (rolling / medium / micro) from snakey  
- `seed`, amp, flat core, shore blend  
- Baked Float32 grid for Rapier (three.js physics_rapier_terrain pattern)

### L1 — three-stylized grounds

- Dirt/meadow/shore color lerp on vertices  
- `groundColor` / floor settings  
- Optional flat `Ground.js` pad when heightfield off  

### L2 — vegetation

| Sub | Pattern | Code |
|-----|---------|------|
| Grass | three-stylized instanced blades + wind | `StylizedGrassLayer` |
| Forest | forestoutline + snakey simple trees + growth | `GrowingForest` |
| Texture world | leaf colors / bark from forestoutline CONFIG | materials on instances |

### Streaming (later)

- simonstorlschulke infinite terrain → chunk keys for L0+L1+L2 together  
- Toroidal grass tiles from snakey (5×5) when open-world beyond island pad  

---

## Settings

```js
settings.terrain = {
  enabled: true,
  seed: 17,
  amp: 0.85,           // L0 hill m
  segments: 96,        // L1 mesh
  grid: 65,            // L0 Rapier
  flatCore: 8,
  forestEnabled: true, // L2 trees
  forestCount: 48,
  grassEnabled: true,  // L2 stylized grass
  grassDensity: 28,
  grassBladeMax: 0.55, // SI under 1.8 m human
  grassWind: 0.22,
  grassColorBottom: '#3d6b1a',
  grassColorTop: '#a8d44a'
};
```

---

## Mount API

```js
import { mountTerrainLayers, TERRAIN_LEARNED } from './world/terrainLayers.js';

const layers = mountTerrainLayers({
  scene,
  heightfield: islandTerrain, // or null → creates IslandHeightfield
  forest: true,
  grass: true
});
// layers.heightSample(x,z)  — only height API
// layers.grass.update(dt)
// layers.forest.update(dt)
```

App still constructs `IslandHeightfield` first for physics; forest/grass attach to same sample.

---

## Locomotion note (snakey)

Snakey’s procedural trail body is a **creature locomotion** study — not a second player controller.  
Fleet player stays CCT + anim packs. Optional future: trail-follow NPCs / mount paths sample L0 the same way.

---

## Checklist

```
[ ] One heightSample for feet, aim, forest, grass
[ ] L1 mesh matches L0 bake
[ ] L2 grass blades SI (~0.2–0.55 m)
[ ] L2 forest on dry land only
[ ] Water freeride still StageWater
[ ] No Babylon / no second terrain engine
[ ] Infinite stream not required for island pad smoke
```
