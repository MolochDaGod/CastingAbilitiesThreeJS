# /devnode — Training Room · DevIsland authoring

**URL:** `…/devnode.html` (local) · `…/devnode.html` on casting deploy  
**Map:** same as play — **`training_room`** (aliases: devisland, devnode)  
**Purpose:** Edit **nodes** for biomes, terrain knobs, cliffs, trees, rocks, flowers/hemp, animals, ore, PvE — without inventing a second Forge or harvest engine.

**SSOT:** `docs/TRAINING_ROOM_SSOT.md` · `src/world/trainingRoomMap.js`

---

## Review: what already exists (extend these)

| System | Role | Reuse on /devnode |
|--------|------|-------------------|
| `devIslandCatalog.js` | Harvest defs, rock/ore meshes, default layouts | Palette rock/ore/herb |
| `DevIslandHarvest.js` | F interact, HP, loot, dummies | Import layout → play |
| `GrowingForest.js` | Growing trees, wood harvest | Tree palette |
| `IslandHeightfield.js` | Land height + shore | Biome terrain knobs |
| `AdminHub` F2 Assets | Buildable/harvestable drafts + purpose | Export feeds drafts |
| `AdminHub` F3 Creatures | Enemy/ally/NPC | PvE / animals |
| `deployableContract.js` | harvestable · enemy · buildable kinds | Contract alignment |
| `Editor.js` (lil-gui) | VFX/live settings | Not duplicated — link to main lab |
| Desktop `forestoutline.html` | Instanced tree CONFIG / LOD / leaf texture | Reference for tree procedural |

**Do not:** second physics world, second mixer, second ObjectStore mint path, Meshy capsule heroes.

---

## Creative resources (ready vs stub)

| Family | Ready assets | Stub / next wire |
|--------|--------------|------------------|
| **Rocks / ore / cliffs** | `public/models/dev-island/rock__*` | — |
| **Herbs** | Procedural stub + loot icons | Nature flora GLB when on CDN |
| **Trees** | GrowingForest procedural | Optional GLB tree packs later |
| **Flowers / hemp** | Palette procedural stubs | Nature pack meshPool |
| **Terrain / biomes** | Heightfield seed/amp | Biome material kits |
| **Animals** | Palette only | F3 creature + fauna CDN |
| **PvE** | Training dummy live | grudge6 enemy draft F3 |
| **Loot icons** | `icons/dev-island/*` | ObjectStore materials |

---

## Node document (export)

```json
{
  "version": 1,
  "source": "casting-devnode",
  "biomeId": "temperate_meadow",
  "terrain": { "seed": 17, "amp": 0.7, "flatCore": 10 },
  "nodes": [
    { "id": "n1", "paletteId": "node.rock_ore", "x": 4.2, "z": -3.1, "yaw": 0.4, "scale": 1 }
  ]
}
```

Play lab imports via `DevIslandHarvest.applyNodeLayout(layout)` (localStorage handoff after Export).

---

## Editor options (MVP)

| Control | Action |
|---------|--------|
| Biome select | Sets terrain seed/amp + filters palette |
| Family filter | cliff · tree · rock · ore · flower · hemp · animal · pve |
| Click place | Drop selected palette on terrain sample Y |
| R click / Del | Remove nearest |
| Export JSON | Download layout |
| Import JSON | Load layout |
| Open play lab | `index.html` main casting |

---

## Admin alignment

| Hotkey | Tab | Node family |
|--------|-----|-------------|
| F2 | Assets | harvestable, cliff buildable |
| F3 | Creatures | animal, pve_mob |
| ] | World | biome / terrain notes |

---

## Confirmation

```
[x] /devnode.html loads palette from NODE_PALETTE
[x] Place rock/ore uses real GLB from dev-island (meshPool + GLTFLoader cache)
[x] Terrain sample places Y on heightfield (IslandHeightfield + projectToTerrain)
[x] Export JSON validates (validateNodeLayout)
[x] No second harvest runtime inside devnode (preview only)
[x] DevIslandHarvest.applyNodeLayout(layout) — play imports Training Room storage
[ ] Fauna CDN meshes for animal_passive / pve_grunt
```
