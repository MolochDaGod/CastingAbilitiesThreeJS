# Prefab scaffold control — access + generation

**Code:** `src/api/prefabScaffold.js` · `weaponPrefabContract.js` · Inventory **Prefabs** tab  
**Goal:** Correct **control** of the fleet item scaffold (read authorities, UUID graph, validation) **and** generation packs for **icons · 3D sprites · item scripts · stats · craft formulas** — without inventing ITEM-*/SKIL-* outside ObjectStore.

---

## Control (read / resolve)

| Need | Endpoint / tool |
|------|-----------------|
| Authority map | `canonical-items-manifest.json` |
| Equipment layers | `_meta/canonical-equipment-pattern.json` |
| Weapon prefabs | `master-weapon-prefabs.json` |
| T0 skills + craft | `t0-weapons.json` |
| Skill bodies | `master-weaponSkills.json` |
| Craft formulas | `master-recipes.json` (RECP-*) + T0 `craftingRecipe` |
| UUID index | `master-registry.json` |
| Icons | `icon-registry.json` · ICON_BROWSER · assets CDN |
| Validate | `validateWeaponPrefab` · 6 layers |
| Export | `exportWarlordsWeaponPrefab` · `buildItemScaffoldPack` |

**Hosts:** `info.grudge-studio.com/api/v1/` → `objectstore.grudge-studio.com/api/v1/` → GitHub Pages ObjectStore.

**Binaries only:** `assets.grudge-studio.com` (never put GLB blobs in JSON).

---

## What “scaffold” means

```
Definition (ITEM-*)  +  Skills (SKIL-*)  +  Assets (ICON-*, R2 paths)
       +  Recipe (RECP-* / T0 materials)  +  Runtime (meshSlot, animPack, jobs)
```

Instance (owned, durability) = **Railway** — not this scaffold.

---

## Generation (drafts you control)

| Artifact | Output | Then |
|----------|--------|------|
| **Style icon** | Prompt + palette + target CDN path | Artist / Imagine → R2 → `assets.iconUrl` + ICON-* |
| **3D sprite / mesh** | SI brief + R2 path + dropPrefab path | grudge-asset-convert → `modelUrl` / drop key |
| **Item script** | JS module stub (use, stats, skills, craft) | Reference for fleet wiring — not eval |
| **Stats** | From catalog `stats` | Edit only in ObjectStore generators |
| **Craft formula** | T0 materials or RECP-* materials[] | ObjectStore recipes pipeline |

**Never mint GRUDGE UUIDs in the lab.** Lab produces **briefs + export JSON**; ObjectStore `build:weapon-pipeline` / `generate:master` writes catalog.

Style families: `warlords_dark` · `toon_rts` · `starter_t0` (`ITEM_STYLE_FAMILIES`).

---

## Lab UI

### Admin Hub **F4 Prefabs** (primary tools surface)

Hotkeys **F1–F5** open Admin Hub (`docs/ADMIN_HUB_F1_F5_SSOT.md`):

- **F4** — weapon/armour drafts, T0 scaffold download, local save/export  
- **F2** — buildables (purpose + script)  
- **F3** — enemy / ally / Grudge kits  

### Inventory **Prefabs** tab (I)

1. Select weapon / T0 row  
2. **Scaffold** panel: validation score, UUID graph, craft formula  
3. Download: full pack · icon brief · 3D brief · item script · prefab export  
4. Equip → combat bar (catalog skills only)

---

## Agent rules

1. Access catalogs via `loadPrefabScaffold` / existing loaders — no forked JSON.  
2. Generation = **briefs + contract JSON**, not silent ITEM-* invent.  
3. Craft: prefer T0 `craftingRecipe`, else `master-recipes` by result.  
4. Icon/3D: SI + house style; register on CDN then patch prefab in ObjectStore.  
5. After generation assets land, re-run `validateWeaponPrefab` → 6/6.

---

## Related

| Doc | Role |
|-----|------|
| `WEAPON_PREFAB_UUID_SSOT.md` | UUID graph + 6 layers + 7 jobs |
| `GAME_ITEM_PREFAB_PRODUCTION_SSOT.md` | All categories |
| `WEAPON_SKILLS_API_SSOT.md` | Skill fields |
| `T0_WEAPONS_SSOT.md` | 15 starters |
