# Training Room · DevIsland · DevNode — one map

**Map id:** `training_room`  
**Aliases:** `devisland` · `dev_island` · `devnode`  
**Label:** Training Room · DevIsland  

Play (`index.html`) and author (`devnode.html`) are **the same island**. Export from DevNode → localStorage → play harvest layout.

**Code SSOT:** `src/world/trainingRoomMap.js` · `src/world/trainingRoomDeploy.js` · `src/config/fleetEnv.js`  
**Production deploy:** `docs/TRAINING_ROOM_DEPLOY_SSOT.md`

---

## What casting.* terrain / world is built with

| Layer | Name | Built by | Physics / sample |
|-------|------|----------|------------------|
| **L0** | Height field | `IslandHeightfield` (FBM seed/amp/flatCore) | Rapier `PhysicsWorld.addHeightfield` · `sample(x,z)` |
| **L1** | Surface ground | Same mesh (meadow/dirt/shore verts); flat `Ground` hidden | same |
| **L2** | Vegetation | `StylizedGrassLayer` + `GrowingForest` | roots on L0 sample |
| **L3** | Detail | `DevIslandHarvest` rocks/ore/herbs + decor + dummies | static props on L0 Y |
| **Water** | Open sea | `StageWater` + `OpenSeaShells` | freeride / windsurf (sibling of land) |

**One height API:** `this.terrain` = `terrainHandle(islandTerrain)` → aim, path, feet, harvest, forest, grass, drops.

### Learned patterns (not parallel engines)

| Source | Used for |
|--------|----------|
| snakey-locomotion | multi-band heightAt, feet on surface |
| three-stylized | grounds colors, instanced grass wind |
| forestoutline.html | procedural tree / leaf ideas → GrowingForest |
| three.js Rapier terrain | Float32 → heightfield collider |

### Settings

`settings.terrain` in `src/config/settings.js`:

```js
{ enabled, seed: 17, amp: 0.85, segments: 96, grid: 65, flatCore: 8,
  forestEnabled, forestCount: 48, grassEnabled, grassDensity: 28, … }
```

Pad size: `WORLD.islandRadius` · `WORLD.shoreBand` · `WORLD.waterY` (`worldScale.js`).

---

## One product surface

| Surface | Role |
|---------|------|
| **Play lab** `index.html` | Combat · harvest F · Training Room map boot |
| **DevNode** `devnode.html` | Place nodes · export layout · same terrain knobs |
| **Admin World** | Link → Training Room editor |
| **Catalog** `devIslandCatalog.js` | Mesh pools + default polar layouts |
| **Palette** `nodePalette.js` | Editor families (cliff/tree/rock/ore/flora/PvE) |

Storage keys (synced):

- `grudge.casting.training_room.layout.v1` (canonical)
- `grudge.casting.devnode.layout.v1` (legacy, still written)

---

## Flow

```
DevNode place/export ──► localStorage (Training Room layout)
                              │
Play App.init ───────────────► DevIslandHarvest.applyNodeLayout
                              │
                        default if empty: DEFAULT_HARVEST + DECOR + DUMMIES
```

---

## Confirmation

```
[x] Map stamped training_room on play + editor
[x] Layers L0–L3 + water documented as current builders
[x] DevNode export/import ↔ play harvest layout
[x] No second island / second heightfield for DevNode vs play
[ ] Redeploy casting.* and smoke index + devnode.html
```
