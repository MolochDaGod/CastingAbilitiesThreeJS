# Island stage SSOT — Casting lab Dev Island

Lab is **not** a full production sector heightfield. It is a **playable island pad** with SI rules that match fleet production-world habits, now **dressed with production-baked harvest content** for mastering Warlords systems.

**Code:** `worldScale.js` · `Ground.js` · `StageWater.js` · `Environment.js` · `devIslandCatalog.js` · `DevIslandHarvest.js`  
**Fleet skill:** `grudge-production-world` · `grudge-world-scale` · `mine-loader-harvest-chests` (pattern)

---

## Hard rules (lab)

| Rule | Value |
|------|--------|
| Units | **1 unit = 1 m** · human **1.8 m** |
| Terrain surface | **Planar y = 0** (path raycast, earth crust, CCT feet) |
| Island pad | `WORLD.islandRadius` dry stone |
| Shore | Visual band `shoreBand` inside pad edge — **no vertex hills** |
| Water | `StageWater` hole under pad; `waterY` slightly below deck |
| Physics | Rapier ground cuboid; water not a collider yet |
| **Content** | Harvest nodes + training dummies on pad (Dev Island) |

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
3. **Ocean ring** — StageWater discard under island; fresnel + wave amp.  
4. **Fog** — floor and fog share deep colour so horizon dissolves.  
5. **Windsurf freeride** — board Y follows `sampleHeight` on water ring.  
6. **Harvest meshes** — SI-fit boulders (~1.1–1.6 m); feet snap to y=0.

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
