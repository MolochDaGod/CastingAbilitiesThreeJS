# Island stage SSOT — Training Room · DevIsland

Lab is **not** a full Open sector shell. It is the **Training Room** island pad (`mapId: training_room`) with SI rules that match fleet production-world habits, dressed with harvest content for Warlords mastery.

**Same map as** `/devnode.html` authoring.  
**Code:** `worldScale.js` · `IslandHeightfield` · `StageWater` · `OpenSeaShells` · `devIslandCatalog` · `DevIslandHarvest` · `trainingRoomMap` · `trainingRoomDeploy`  
**Deploy:** `docs/TRAINING_ROOM_DEPLOY_SSOT.md` (Vercel + R2/D1 promote)  
**Fleet skill:** `grudge-production-world` · `grudge-world-scale` · `mine-loader-harvest-chests` (pattern)

**Terrain note:** pad uses **heightfield** (`IslandHeightfield` + Rapier), not planar y=0 only (docs below updated for hills).

---

## Hard rules (lab)

| Rule | Value |
|------|--------|
| Units | **1 unit = 1 m** · human **1.8 m** |
| Terrain surface | **IslandHeightfield** L0 sample = mesh = feet = aim (not plane-only) |
| Island pad | `WORLD.islandRadius` dry land before shore blend |
| Shore | `shoreBand` + heightfield waterY blend |
| Water | `StageWater` + freeride; OpenSeaShells CDN backdrop |
| Physics | Rapier **heightfield** when terrain on; water freeride |
| **Content** | Training Room harvest + dummies · layout from storage/maps JSON |

---

## Dev Island content

| System | SSOT |
|--------|------|
| Mesh bake | `public/models/dev-island/rock__*.glb` (Rocks.zip → isolate) |
| Icons | `public/icons/dev-island/{minerals,inventory}/` |
| Node defs | `src/world/devIslandCatalog.js` |
| Runtime | `src/world/DevIslandHarvest.js` → `App.worldHarvest` |
| F interact | Nearest alive node within **`HARVEST_RANGE_M = 5`** · tool in hand when required |
| F priority | pickup (2.4 m) → harvest (5 m) → weapon skill |
| Tool | `t0-tool` / `weaponType=TOOL` for rock/ore; **hand** for pebbles/herbs |
| Anim | One mixer · `playWeaponAttack` / attack one-shot (sword_shield tool pack) |
| Loot | Bag + world drop splash · table family `harvest_node` |
| Combat targets | Training dummies (CombatFocus `hostile`) |
| Admin | `]` World → respawn harvest · equip tool · respawn dummies |

Do **not** invent a second harvest engine or second AnimationMixer.

---

## Visual best practices

1. **Pad** — dark polished stone + light pool (Ground shader).  
2. **Shore** — sand/moss tint + light foam noise toward water.  
3. **Ocean ring** — StageWater discard under pad; storm waves + optional normal map (open-sea).  
4. **Horizon islands** — `OpenSeaShells` CDN `models/worlds/small_island.glb` (backdrop only).  
5. **Fog** — floor and fog share deep colour so horizon dissolves.  
6. **Windsurf freeride** — board Y follows `sampleHeight`; nose = travel +Z (`artYawDeg: 0`).  
7. **Harvest nodes** — DevIslandHarvest on pad; SI boulders; feet y=0.

Do **not** raise Ground mesh for cliffs — that breaks path cast and earth paving. Production islands use heightfield shells on CDN.

---

## Constants (`WORLD`)

```
islandRadius  — dry pad radius (m)
shoreBand     — shore ring width (m)
shoreTint     — shore color mix 0..1
waterSize     — ocean plane extent
waterY        — surface base height
floorPool*    — light pool falloff
HARVEST_RANGE_M — 5 (devIslandCatalog)
```

Editor: `settings.environment.shoreColor`, floor colors.

---

## Related

- `docs/WINDSURF_RIDE_SSOT.md` — freeride on water ring  
- `docs/CASTING_LAB_SSOT.md` — lab macro  
- `docs/DROP_RATES_SSOT.md` — `harvest_node`  
- Production islands: Open CDN shells + seed kits (fleet heightfield, not this pad mesh)
