# Terrain · land · water physics SSOT (Casting lab)

**Deploy host:** casting-abilities-threejs.vercel.app / casting.grudge-studio.com  
**Repo:** CastingAbilitiesThreeJS

## Learned references (patterns ported)

| Source | What we take |
|--------|----------------|
| [snakey-locomotion](https://github.com/muratkamci/snakey-locomotion) | Single CPU `heightAt` = mesh = feet; multi-band FBM; trees on height |
| [three-stylized](https://github.com/Steve245270533/three-stylized) | Warped FBM terrain, SI cell density, dirt/meadow |
| three.js `physics_rapier_terrain` | Float32 heights → Rapier heightfield collider |
| Desktop `forestoutline.html` | Instanced trees, growth/scatter SI, leaf sway |
| `grudge-rapier` skill | Fixed 1/60, CCT, heightfield not dynamic trimesh |

## Layers

| Layer | Visual | Physics | Sample API |
|-------|--------|---------|------------|
| **Land** | `IslandHeightfield` mesh | Rapier **heightfield** | `islandTerrain.sample(x,z)` |
| **Water** | `StageWater` (waves) | Sensor slab + freeride Y | `water.sampleHeight(x,z,t)` |
| **Void / far** | fog | outer flat removed under pad | — |

**One height source** for mesh, Rapier, harvest Y, player feet. Do not invent a second heightmap.

## SI scaling

| Knob | Default | Notes |
|------|---------|--------|
| `settings.terrain.amp` | 0.85 m | Peak hills — human ~1.8 m yardstick |
| `settings.terrain.flatCore` | 8 m | Spawn/combat pad stays flatter |
| `settings.terrain.grid` | 65 | Rapier verts |
| `WORLD.islandRadius` | mapScale | Shore blend to `waterY` |

## Harvestables

| System | Role |
|--------|------|
| `DevIslandHarvest` | Ore/rock/herb nodes on heightfield |
| `GrowingForest` | Trees grow 0→1; F chops when age≥0.55; regrow ~45 s |

## Settings

```js
settings.terrain = {
  enabled: true,
  seed: 17,
  amp: 0.85,
  segments: 96,
  grid: 65,
  flatCore: 8,
  forestEnabled: true,
  forestCount: 48
};
```

## Confirmation

```
[ ] Walk hills — feet follow heightfield (no float)
[ ] Path / cast still works on pad
[ ] Ocean freeride still samples StageWater
[ ] Harvest rocks at correct Y
[ ] Trees grow and F harvests wood
[ ] ?physicsDebug=1 shows heightfield
[ ] No second physics engine
```
