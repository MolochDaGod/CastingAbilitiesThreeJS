# Asset & library audit — half-done, conflicts, keep/remove

**Date:** 2026-08-08 (live HEAD checks)  
**Scope:** ObjectStore / info / R2 / D1 + casting lab importers  
**Goal:** one design — no parallel prefab systems.

Re-run audit:

```bash
node scripts/audit-asset-library.mjs
```

---

## 1. Verdict (short)

| Layer | Verdict |
|-------|---------|
| **Weapon runtime SSOT** | **KEEP** `master-weapon-prefabs.json` + `master-weaponSkills.json` + `t0-weapons.json` |
| **Icons + family GLBs** | **KEEP** R2 `assets.grudge-studio.com` — most family meshes **200** |
| **Per-item dropPrefab.glb** | **HALF-DONE** — keys in JSON, sample **404** on R2 — do not block equip on these |
| **Armor** | Catalog **KEEP** `master-armor.json` — **DO NOT invent** `master-armor-prefabs` in lab until ObjectStore ships it |
| **D1 `weapon_prefabs`** | Seed SQL exists — index only; **JSON remains authority** |
| **Deprecated catalogs still HTTP 200** | **DO NOT wire** into lab/games loaders (see §3) |
| **Custom T0 wand meshes** | **UPLOADED 2026-08** `prod/gltf/weapons/t0-wand.glb` · `t0-nature-staff.glb` · `wand.glb` (HEAD 200) |

---

## 2. USE (canonical) — wire these only

| File / surface | Role | Live? |
|----------------|------|-------|
| `master-weapon-prefabs.json` | Weapons + tools + offhand equip prefabs | **200** · 877 |
| `master-weaponSkills.json` | SKIL-* · WEAPON_SKILLS.html | **200** |
| `t0-weapons.json` | 15 T0 starters (Apprentice Wand, Sapling Staff, …) | **200** |
| `master-armor.json` | Armour definitions | **200** · ~1344 |
| `master-items.json` | Aggregate catalog | **200** |
| `master-item-prefabs.json` | byUuid index | **200** |
| `master-relics.json` | Relics | **200** |
| `master-mounts.json` | Mounts | **200** |
| `master-classRelics.json` | Class items / relics | **200** |
| `master-consumables.json` | Food / potions | **200** |
| `master-materials.json` · `master-recipes.json` | Craft | **200** |
| `master-registry.json` | UUID index | **200** |
| `canonical-items-manifest.json` | Category map | **200** |
| CDN family models | `prod/gltf/weapons/{sword\|axe\|staff\|bow\|dagger\|hammer\|assault_rifle}.glb` | **200** |
| CDN icons | `game-assets/icons/...` | used by prefabs |

**Item browser:** https://info.grudge-studio.com/GRUDGE_Item_Database.html  
**Skills:** https://info.grudge-studio.com/WEAPON_SKILLS.html  

---

## 3. DO NOT USE (still online — conflict risk)

| File | Why conflict | Replace with |
|------|--------------|--------------|
| `weapons.json` | Design templates only | `master-weapon-prefabs` |
| `armor.json` | Design sets only | `master-armor.json` |
| `master-weapons.json` | Old flat list (~1MB) | `master-weapon-prefabs` |
| `master-t0-items.json` | **Archived** stub (`deprecated: true`) | `t0-weapons.json` + prefabs |
| `weaponSkills.json` | Empty / legacy | `master-weaponSkills.json` |
| `items-database.json` | Empty / legacy | `master-items.json` |
| `weapon-prefabs.json` | **404** (good) | never reintroduce |
| `master-armor-prefabs.json` | **404 planned** | wait for ObjectStore pipeline |
| `game-library.json` on **info** | **404** (2026-08-08) | use `canonical-items-manifest.json` until restored |

Agents must not “fix 404” by inventing a second library file in CastingAbilitiesThreeJS.

---

## 4. HALF-DONE (edit / finish carefully)

### 4.1 R2 drop prefabs (declared, missing binaries)

- Prefab JSON: `assets.dropPrefabR2Key` →  
  `prefabs/items/weapons/{type}/{tier}/{name}.prefab.glb`
- Sample HEAD: **all 404**
- **Action:** equip/HUD use **icon + family `modelUrl`** only. Upload drop prefabs later via convert + `wrangler r2 object put`. Do not code paths that require dropPrefab 200.

### 4.2 Family models incomplete

| Key | Status |
|-----|--------|
| sword, axe, staff, bow, dagger, hammer, assault_rifle | **200** |
| **wand.glb** | **404** — T0 wand uses **staff.glb** |
| **shield.glb** | **404** — offhand shields may 404 model |

**Action:** either upload `wand.glb` / `shield.glb` or keep staff/sword family mapping explicit in prefab `modelUrl`.

### 4.3 T0 Apprentice Wand / Sapling Staff meshes

| Item | Skills (catalog) | Model on CDN now |
|------|------------------|------------------|
| t0-wand | Practice Bolt / Focus / Frost Spark\|Arcane Ping | **staff.glb** (generic) |
| t0-nature-staff | Practice Root / Nature Ward / Vine Lash\|Healing Sprout | **staff.glb** (generic) |

Local author GLBs (not in R2 yet):

- `D:\Games\Models\arcane_staff_of_resonance_-_wow_inspired_weapon.glb` → intended Apprentice Wand  
- `D:\Games\Models\mushroom_staff.glb` → intended Sapling Staff  

**Action:** convert SI wand scale → R2 `prod/gltf/weapons/t0-wand.glb` + `t0-nature-staff.glb` → patch prefab `modelUrl`. Until then skills import is fine; mesh is placeholder.

### 4.4 Armor prefabs

- Catalog live; **runtime armor-prefabs file not shipped**
- Lab Prefabs tab can **browse** armor; equip combat bar is **weapons/T0 only**

### 4.5 D1 `weapon_prefabs` (objectstore-meta)

- Seed: `ObjectStore/workers/seed/weapon-prefabs.sql` (huge upsert)
- Columns: uuid, weapon_type, tier, icon_r2_key, model_r2_key, prefab_json
- **Role:** search/index mirror — **not** player bag SSOT
- **Action:** keep seed in ObjectStore pipeline; games read **JSON first**. Confirm remote D1 applied after `build:weapon-pipeline` (ops).

### 4.6 R2 layout dual paths

| Path pattern | Use |
|--------------|-----|
| `prod/gltf/weapons/{family}.glb` | **What models resolve to today** |
| `models/weapons/{category}/{baseName}.glb` | Declared in r2Layout — may be empty/sparse |
| `prefabs/items/weapons/...` | Drop prefabs — **missing** |

**Action:** prefer writing **prod/gltf** for play meshes; treat `models/weapons/...` as secondary until audited full.

---

## 5. Lab (CastingAbilitiesThreeJS) — overlap map

| Module | Role | Conflict? |
|--------|------|-----------|
| `prefabAssets.js` | Load master-weapon-prefabs | **OK** — keep |
| `t0WeaponCatalog.js` | t0-weapons + equip | **OK** — keep |
| `weaponSkillsCatalog.js` | master-weaponSkills | **OK** — keep |
| `gameItemCatalog.js` | Multi-category import | **OK** — keep; soft-fail if game-library 404 |
| `t0ApprenticeWand.js` | **Local skill mirror** | **HALF** — offline fallback only; prefer live t0-weapons |
| `staffWeaponSkillsBind.js` | VFX bind for catalog skill ids | **OK** — not a skill DB |
| Prefabs tab / Weapon tab | Dev equip | **OK** |

**Remove / freeze (do not grow):**

- Growing **local skill tables** that duplicate `t0-weapons` / WEAPON_SKILLS  
- Lab-only `staff_nature_trap` style invented skills (already removed)  
- Second “items database” JSON in the casting repo  

---

## 6. Design rules (no conflicts)

1. **One authority per layer** — weapons = prefabs; skills = weaponSkills; T0 = t0-weapons; armor = master-armor.  
2. **Never load deprecated files** in new code even if HTTP 200.  
3. **Missing R2 binary ≠ missing catalog row** — show icon + family mesh.  
4. **Player inventory** = Railway (production-wiring), not D1 assets.  
5. **D1** = asset/prefab **index** only.  
6. New meshes: convert skill → R2 → update prefab modelUrl → (optional) D1 reseed.  
7. Casting lab is **dev proof**; ObjectStore pipelines own generate/publish.

---

## 7. Recommended cleanup actions

| Priority | Action | Owner |
|----------|--------|-------|
| P0 | Lab already uses USE list — **do not** add master-weapons / weapons.json loaders | agents |
| P0 | Document game-library 404 — use canonical-items-manifest | ObjectStore ops / this doc |
| P1 | Upload wand/shield family or keep explicit modelUrl | convert + R2 |
| P1 | Bake + upload t0-wand / t0-nature-staff author GLBs | convert + prefab patch |
| P2 | Batch dropPrefab.glb upload or stop writing dead keys | ObjectStore pipeline |
| P2 | Confirm D1 weapon_prefabs seed on remote | wrangler d1 execute |
| P3 | Ship master-armor-prefabs when ready | ObjectStore only |
| P3 | Shrink/archive 200 deprecated JSON from public API (redirect stubs) | ObjectStore |

---

## 8. Related

- `GAME_ITEM_PREFAB_PRODUCTION_SSOT.md` — category → consumer  
- `WEAPON_EQUIP_PREFABS_SSOT.md` — equip try path  
- `T0_STARTERS_WEAPON_SKILLS_SSOT.md` — Apprentice + Sapling  
- ObjectStore `docs/CANONICAL-ITEMS-WARLORDS.md` · `CANONICAL-EQUIPMENT.md`  
