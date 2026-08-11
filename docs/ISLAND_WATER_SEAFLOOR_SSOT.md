# Island · water · seafloor · town (Casting lab)

| Layer | Y | Notes |
|-------|---|--------|
| Seafloor sand | **-5 m** | `Seafloor.js` — single sand plane |
| Water surface | **0 m** | `StageWater` only (no second water) |
| Island heightfield | ≥ shore → 0 | Land pad; no Ground plane when HF on |
| Horizon islands | welded to −5 | `OpenSeaShells` plantOnSeafloor |
| River town | on pad height | `IslandTown` sand/timber, not snow GLB |

## Fixes (2026-08)
- Removed double ground (Ground hidden/removed when heightfield present)
- White/snow island materials → sand/rock
- Horizon scale capped (no towering snow peaks)
- Town placed on island via heightSample
