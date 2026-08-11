# Island · water · seafloor · bathymetry (Casting lab)

| Layer | Y | Notes |
|-------|---|--------|
| Water surface | **0 m** | `StageWater` only (no second water plane) |
| Dry land pad | ≥ ~0 | Heightfield FBM hills (amp ~0.85 m) |
| Shore slope | 0 → **−5 m** | Slow first, sharper later (`shoreEasePow` ≈ 1.75) |
| Island shelf weld | **−5 m** | `WORLD.seafloorY` · horizon islands plant here |
| Deep ocean floor | **−50 m** | `WORLD.oceanFloorY` · open sea beyond pad |

## Profile (radial)

```
r < pad − shoreBand     land FBM (dry)
pad − shoreBand → pad   bathymetry: waterline → −5 (power ease)
r > pad                 deepen −5 → −50 over oceanDepthBand
```

Code: `heightAt` / `bathymetryAt` in `IslandHeightfield.js`.

## Physics

- **Solid walk:** Rapier heightfield = same bake (includes underwater slope + shelf)
- **Water surface:** sensor at y=0
- **Water volume:** sensor slab from 0 down to −50 (submersion queries)
- `waterDepthAt(x,z) = max(0, waterY − landY)` — water “hits” terrain at shore

## Visuals

- Heightfield mesh sized past pad (covers oceanDepthBand)
- `Seafloor` plane at **−50 m** (deep sand backdrop)
- Horizon `OpenSeaShells` welded to **−5 m** shelf

## Weapon prefab lab

Admin Hub **F4 Prefabs**: live SI scale readout, import GLB, assign modelUrl, equip on hand.
`equipment/weaponPrefabLab.js` · appearance in `meshAppearance.js`.
