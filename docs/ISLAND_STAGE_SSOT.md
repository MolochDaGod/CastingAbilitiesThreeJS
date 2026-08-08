# Island stage SSOT — Casting lab shell

Lab is **not** a full production sector. It is a **playable island pad** with SI rules that match fleet production-world habits without heightfield complexity.

**Code:** `worldScale.js` · `Ground.js` · `StageWater.js` · `Environment.js`  
**Fleet skill:** `grudge-production-world` · `grudge-world-scale`

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
| Shell ≠ content | No harvest nodes / bosses on lab pad |

---

## Visual best practices

1. **Pad** — dark polished stone + light pool (Ground shader).  
2. **Shore** — sand/moss tint + light foam noise toward water.  
3. **Ocean ring** — StageWater discard under island; fresnel + wave amp.  
4. **Fog** — floor and fog share deep colour so horizon dissolves.  
5. **Windsurf freeride** — board Y follows `sampleHeight` on water ring.

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
```

Editor: `settings.environment.shoreColor`, floor colors.

---

## Related

- `docs/WINDSURF_RIDE_SSOT.md` — freeride on water ring  
- `docs/CASTING_LAB_SSOT.md` — lab macro  
- Production islands: Open CDN shells + seed kits (not this repo’s stage)
