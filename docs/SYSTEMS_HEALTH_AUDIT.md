# Systems health audit — conflicts · organization · forgetting

**Scope:** Casting lab + fleet touchpoints (2026-08)  
**Action:** audit + fix bare loaders, override wire, single decoder pins  

---

## 1. Conflict matrix

| Pair | Status | Notes |
|------|--------|-------|
| Draco vs KTX2 | **OK** | Different glTF extensions — not mutually exclusive |
| Draco vs Meshopt | **OK** | Can coexist on one asset |
| Dual DRACOLoader (AssetLoader + projectiles) | **Fixed** | Projectiles → `sharedGltfLoader()` |
| Bare `GLTFLoader` (weapon / back / devnode) | **Fixed** | Now shared pipeline |
| Dual DRACO path strings (assets.js vs gltfPipeline) | **Fixed** | assets re-exports pipeline |
| Open vs Casting decoder pins | **Aligned** | versioned Draco 1.5.7 · basis 0.185.1 |
| Dual heightmap (feet vs aim) | **OK** | One `IslandHeightfield.sample` |
| Dual AnimationMixer | **OK** | One on CharacterController |
| Path Ability + linear castToward | **OK** | Planned layers (elementalLinearCast) |
| Production skill + legacy skillDefToDrc | **OK** | Production first, legacy fallback |
| SkillStatusSystem + ad-hoc freeze | **OK** | Hits go through statuses |
| Ground.js + IslandHeightfield | **OK** | Flat ground hidden when heightfield on |
| `mountTerrainLayers` vs App manual mount | **Soft** | App wires L0–L2 explicitly; helper unused — not a conflict |

---

## 2. Organization map (correct ownership)

| Concern | Owner | Do not |
|---------|-------|--------|
| glTF decode | `loaders/gltfPipeline.js` | `new GLTFLoader()` elsewhere |
| Asset boot | `AssetLoader` + `bindRenderer` | Skip KTX2 bind |
| Height L0 | `IslandHeightfield.heightAt` | Second FBM in grass |
| Ground L1 | heightfield mesh | Raise Ground.js verts for hills |
| Vegetation L2 | StylizedGrass + GrowingForest | Own heightmap |
| Aim / path | `terrainGround.projectToTerrain` | Plane-only when heightfield on |
| Catalog skills | master-weaponSkills / t0 | Invent skill ids |
| Skill package | `weaponSkillProduction` | Parallel combat DB |
| Statuses | `skillStatusSystem` | Random `userData` without status sys |
| Linear spells | `LinearSkillBridge` + plan | Third AbilityManager |
| Entry hosts | Open `entryCatch` PRODUCT_STARTS | Guessed deep-links |

---

## 3. Fixed this pass

| Item | Change |
|------|--------|
| WeaponMeshAttach | `sharedGltfLoader()` |
| BackSlotEquip | `sharedGltfLoader()` |
| DevNodeEditor | `sharedGltfLoader()` |
| Decoder pins | single export from gltfPipeline |
| Production overrides | `warmProductionOverrides` on equip → cache in skillDefToDrc |

---

## 4. Remaining soft gaps (not blockers)

| Gap | Severity | Note |
|-----|----------|------|
| `mountTerrainLayers` unused by App | Low | App duplicates wiring; could consolidate later |
| Hostile full HP bar from damage | Med | Status package ready; host HP later |
| Infinite terrain stream | Low | Island pad only |
| Self-host draco/basis under public/ | Low | CDN ok |
| CI: load one Draco GLB smoke | Med | Recommended |
| Open still needs `bindKtx2` at Studio boot | Check | already had API — ensure called |

---

## 5. Forget checklist (before “systems done”)

```
[x] One Draco pool
[x] KTX2 after renderer
[x] Weapons/back/projectiles use shared loader
[x] One height sample
[x] One mixer
[x] Production skill compile on equip
[x] Overrides warm on equip
[x] Statuses on projectile hit
[x] Linear plan on spell release
[x] Entry via PRODUCT_STARTS (Open)
[ ] Optional: App uses mountTerrainLayers only
[ ] Optional: CI decoder smoke
```

---

## 6. Quick health commands

```bash
# Casting
cd CastingAbilitiesThreeJS
npm run build
# grep remaining bare loaders:
#   new GLTFLoader  should only appear in gltfPipeline.js

# Open entry
cd gameopen/artifacts/animator
npx vitest run src/lib/entryCatch.test.ts
```

---

## 7. Verdict

| Area | Health |
|------|--------|
| Loaders | **Healthy** after shared pipeline + bare-loader fix |
| Terrain layers | **Healthy** — one height; App manual mount is fine |
| Skills / statuses / linear | **Healthy** — one plan path |
| Entry / deploy | **Healthy** — Open SSOT |
| Overrides | **Healthy** — warm on equip |

**No hard system conflicts remaining** in Casting after this pass. Soft debt is consolidation/CI only.
