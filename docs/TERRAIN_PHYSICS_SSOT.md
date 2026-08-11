# Terrain · land · water physics SSOT (Casting lab)

**Deploy host:** casting-abilities-threejs.vercel.app / casting.grudge-studio.com  
**Repo:** CastingAbilitiesThreeJS  
**Map:** Training Room · DevIsland (`training_room`) — see `docs/TRAINING_ROOM_SSOT.md`

## Learned references (patterns ported)

| Source | What we take |
|--------|----------------|
| [snakey-locomotion](https://github.com/muratkamci/snakey-locomotion) | Single CPU `heightAt` = mesh = feet; multi-band FBM; trees on height |
| [three-stylized](https://github.com/Steve245270533/three-stylized) | **Grounds** + instanced grass wind, dirt/meadow, external surface sample |
| [threejs-examples ∞ terrain](https://simonstorlschulke.github.io/threejs-examples/?scene=0) | Infinite tile stream (later chunk L0–L2) |
| Desktop `forestoutline.html` | Instanced trees, leaf texture/sway, SI scatter, LOD |
| three.js `physics_rapier_terrain` | Float32 heights → Rapier heightfield collider |
| `grudge-rapier` skill | Fixed 1/60, CCT, heightfield not dynamic trimesh |

**Full map:** `docs/THREE_LAYER_TERRAIN_SSOT.md` · `terrainLayers.js` · `StylizedGrassLayer.js`

## Layers (three + water)

| Layer | Visual | Physics | Sample API |
|-------|--------|---------|------------|
| **L0 height** | bake grid | Rapier **heightfield** | `islandTerrain.sample(x,z)` |
| **L1 ground** | `IslandHeightfield` mesh (meadow/dirt/shore) | same | same |
| **L2 vegetation** | `StylizedGrassLayer` + `GrowingForest` | none / harvest | roots on L0 |
| **L3 detail** | harvest rocks | static | L0 Y |
| **Water** | `StageWater` (waves) | Sensor + freeride Y | `water.sampleHeight` |

**One height source** for mesh, Rapier, harvest Y, player feet, **aim, and path draw**.

| Consumer | How |
|----------|-----|
| Rapier / feet | `PhysicsWorld` heightfield + `landHeightAt` |
| Aim / path | `terrainGround.projectToTerrain` via `this.terrain` |
| Harvest / forest / drops | `this.terrain.sample(x,z)` |

Do **not** invent a second heightmap or ray-plane-only ground when terrain is on.

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
[ ] Path trail sits on hills (not y=0 plane under mesh)
[ ] Ground aim marker on terrain surface
[ ] Ocean freeride still samples StageWater
[ ] Harvest rocks at correct Y
[ ] Trees grow and F harvests wood
[ ] ?physicsDebug=1 shows heightfield
[ ] No second physics engine / no duplicate height APIs
```
