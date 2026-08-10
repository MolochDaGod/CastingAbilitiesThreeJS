# Weapon prefab + GRUDGE UUID SSOT

**Purpose:** One pattern for **what a weapon prefab is**, **which UUIDs link it**, and **what it must do** in bag / equip / combat / craft / export.

**Code:** `src/api/weaponPrefabContract.js` · `exportWarlordsWeaponPrefab` · `presentPrefab`  
**Catalog:** `master-weapon-prefabs.json` (~877) · `t0-weapons.json` (15) · `master-weaponSkills.json` (268)

---

## 1. GRUDGE UUID prefixes

| Prefix | Entity | Example |
|--------|--------|---------|
| **ITEM-** | Weapon / tool / equipment definition | `ITEM-20260423030000-000001-4D4C1056` (Training Sword) |
| **SKIL-** | Weapon skill definition | `SKIL-T0-AAB723-6F43B6` (Practice Slash) |
| **ICON-** | Icon registry entry | (often null on T0 — path still works) |
| **RECP-** | Crafting recipe | T1+ usually |
| **ATTR-** | Attribute affinity links | stat graph |
| **MATL-** | Material | scrap-ingot, etc. |
| **RELC- / MNT- / ARTF- / ENCH-** | Relic / mount / artifact / enchant | non-weapon prefabs |

**Rule:** Runtime prefers **UUID** for identity and skill binds; human `id` (`t0-sword`) is the slug for URLs and loadouts.

```
ITEM-* ──skills.skillUuids──► SKIL-* ──prefab.vfxRef──► VFX / effect
   │                              │
   ├──assets.iconUuid──► ICON-*   └── skill body (dmg, CD, cast, effects)
   ├──recipeUuid──► RECP-*
   └── instance (Railway bag) ── not ObjectStore
```

---

## 2. What a weapon prefab must **have** (6 layers)

| Layer | Required fields | Source |
|-------|-----------------|--------|
| **identity** | `uuid` ITEM-*, `id`, `name`, `tier`, `weaponType` | master-weapon-prefabs / t0 |
| **stats** | `stats.damage`, speed, crit, block, defense… | same |
| **skills** | `skills.slots[]` with `skillIds` + **`skillUuids`**, `slotPattern` | prefab + t0-weapons skill bodies |
| **assets** | `assets.iconUrl` (ICON-* when known), `modelUrl` / `prodGltfUrl` when wired, drop keys | CDN |
| **runtime** | derived: `meshSlot`, `animPack`, `labStyle` | weaponType map |
| **loadout** | `three-slot-starter` (T0) or `five-slot` (T1+) | prefab.loadout / skills.slotPattern |

Validate: `validateWeaponPrefab(prefab)` → score 6/6.

### T0 skill slots (product)

| Slot | type | fixed | choice | UUID count |
|------|------|-------|--------|------------|
| 1 | primary | yes | no | 1 SKIL-* |
| 2 | secondary | yes | no | 1 SKIL-* |
| 3 | ability | no | **yes** | 2–3 SKIL-* options, player picks one |

T1+ five-slot: primary · secondary · ability · ability · ultimate (see catalog `loadoutPattern`).

---

## 3. What a weapon prefab must **do** (runtime jobs)

| Job | Consumer | Contract field |
|-----|----------|----------------|
| **Bag / world drop** | WorldDrops, bag UI | iconUrl, tier border/glow, optional dropPrefab |
| **Equip** | EquipmentManager · WeaponMeshAttach | meshSlot · modelUrl · SI scale |
| **Controller** | CharacterController | animPack (sword_shield / magic / longbow) |
| **Hotbar** | DRC 1–3 (T0) / 1–5 (T1+) | skillIds + skillUuids → skill bodies |
| **Combat** | DrcCombatController | style · delivery · residual / cast / projectile |
| **Craft** | Craft UI | recipeUuid · craftsInto (T0 → T1) |
| **Export** | Unity / Warlords SO | full export JSON with `uuids` graph |

Lab export: Inventory equip → **Export prefab** → includes `uuids.item` + `uuids.skills[]`.

---

## 4. Example: Training Sword

| Field | Value |
|-------|--------|
| ITEM | `ITEM-20260423030000-000001-4D4C1056` |
| id | `t0-sword` |
| Slot 1 SKIL | `SKIL-T0-AAB723-6F43B6` Practice Slash |
| Slot 2 SKIL | `SKIL-T0-6228E2-DDBEA0` Guard Stance |
| Slot 3 SKIL options | `SKIL-T0-C0DE2D-41913A` Quick Thrust · `SKIL-T0-8A519A-906D3B` Wide Sweep |
| icon | CDN Sword_01.png |
| model | family / prod gltf when wired |
| pattern | `three-slot-starter` |

---

## 5. R2 layout (catalog)

```
models/weapons/{category}/{baseName}.glb
game-assets/icons/weapons/{slug}.png
prefabs/items/weapons/{weaponType}/{tier}/{baseName}.prefab.glb
effects/3d/loot/weapon-{rarity}.glb
```

CDN base: `https://assets.grudge-studio.com`

---

## 6. Agent / code rules

1. **Never invent ITEM-* or SKIL-*** — mint only in ObjectStore generators.  
2. **Resolve skills by UUID when present**, fall back to skill id.  
3. **T0 skill bodies** from `t0-weapons.json`; prefab row holds slot **UUID graph** + assets.  
4. **Instance state** (owned, durability, enchants) = Railway — not ObjectStore JSON.  
5. Incomplete model/iconUuid = **warning**, not a second catalog.  
6. Use `normalizeWeaponPrefabContract` / `exportWarlordsWeaponPrefab` for handoffs.

```js
import {
  validateWeaponPrefab,
  normalizeWeaponPrefabContract,
  summarizePrefabCompleteness,
  GRUDGE_UUID_PREFIX
} from './weaponPrefabContract.js';
```

---

## 7. Related

| Doc | Role |
|-----|------|
| `GAME_ITEM_PREFAB_PRODUCTION_SSOT.md` | All item categories |
| `WEAPON_SKILLS_API_SSOT.md` | Skill field sources |
| `T0_WEAPONS_SSOT.md` | 15 starters matrix |
| `SKILL_DELIVERY_SSOT.md` | How skills deploy in space |
