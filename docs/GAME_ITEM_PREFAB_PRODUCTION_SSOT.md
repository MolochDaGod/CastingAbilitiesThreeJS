# Game item prefab production SSOT

**Purpose:** One map for prefabbing **weapons · armour · backs · relics · class items · mounts · off-hands · specials** into fleet games: items, character HUD, UI, controller, combat, and the casting **dev environment**.

**Do not invent parallel catalogs.** Authorities live on ObjectStore / info.grudge-studio.com.

| Resource | URL |
|----------|-----|
| Item browser | https://info.grudge-studio.com/GRUDGE_Item_Database.html |
| Weapon skills | https://info.grudge-studio.com/WEAPON_SKILLS.html |
| Start / game library | https://info.grudge-studio.com/api/v1/game-library.json |
| Items manifest | https://info.grudge-studio.com/api/v1/canonical-items-manifest.json |
| Equipment pattern | https://info.grudge-studio.com/api/v1/_meta/canonical-equipment-pattern.json |
| Lab import | `src/api/gameItemCatalog.js` · Inventory **Prefabs** tab |
| CDN | https://assets.grudge-studio.com |

Upstream doc: ObjectStore `docs/CANONICAL-ITEMS-WARLORDS.md`

---

## 1. Category → authority (runtime prefab)

| Category | Catalog authority | UUID | Count (approx) | Prefab status | Lab equip / combat |
|----------|-------------------|------|----------------|---------------|--------------------|
| **Weapons** (1H/2H/bow/gun/staff/wand…) | `master-weapon-prefabs.json` | ITEM-* | ~822 | **live** skills+icon+model family | Equip hand · hotbar · residual |
| **Tools** (harvest) | same · `weaponType=TOOL` | ITEM-* | ~49 | **live** | Equip · gather action |
| **T0 starters** | `t0-weapons.json` (+ prefab merge) | ITEM-* | 15 | **live** skills | Apprentice Wand · Sapling Staff… |
| **Off-hand** shield / tome | `master-weapon-prefabs` SHIELD · TOME | ITEM-* | shields ~48 · tome T0 | **live** | Off-hand mesh · loadout inject |
| **Armour** body/head/arms/legs | `master-armor.json` | ITEM-* | ~1344 | **catalog live** · prefabs **planned** | mesh_ids visibility · stats |
| **Back** (cape / pack / windsurf utility) | armor slot **back** or utility tag | ITEM-* | via armor sets | catalog / utility | back slot · ride deploy |
| **Relics** | `master-relics.json` | RELC-* | ~136 | **live** catalog | HUD relic · passive |
| **Class items / class relics** | `master-classRelics.json` · `classes.json` | RELC-* / class | per class | **live** catalog | class gate · Mage Wand later |
| **Mounts** | `master-mounts.json` | MNT-* | ~8 | **live** catalog | mount controller · not second loco |
| **Specials** (artifacts, enchants, infusions) | `master-artifacts` · enchants · infusions | ARTF/ENCH/INFU | ~112 | **live** catalog | socket · HUD · combat mods |
| **Consumables** | `master-consumables.json` | FOOD/POTN | ~132 | **live** | bag · use |
| **Materials / recipes** | materials · recipes | MATL/RECP | large | **live** craft | craft UI only |

**Aggregate mirror:** `master-items.json` (~2361) · **UUID index:** `master-registry.json`  
**Per-item prefab index:** `master-item-prefabs.json` (byUuid)

---

## 2. Prefab layers (every equippable)

Same industry layers as `_meta/canonical-equipment-pattern.json`:

| Layer | Role | Example |
|-------|------|---------|
| **Definition** | Static catalog row | name, tier, slot, base stats |
| **Ability binding** | SKIL-* / slots 1–5 | `skills.slots` on weapon prefabs |
| **Assets** | CDN only | `iconUrl`, `modelUrl`, dropPrefab key |
| **Instance** | Player ownership | Railway bag / equip (not ObjectStore) |
| **Presentation** | HUD / world drop | tier border, glow, sprite |
| **Economy** | recipes · drops | RECP-*, drop tables |

Weapon **runtime prefab** = definition + skills + assets (ready for Unity SO import + Three equip).  
Armor is **definition+assets first**; full armor-prefab file planned (`master-armor-prefabs.json`).

---

## 3. Consumer surfaces (production)

| Surface | What it consumes | Lab now | Production target |
|---------|------------------|---------|-------------------|
| **Items / bag** | presentPrefab / presentItem | World drops T0–T8 weapons | full bag from Railway + catalog |
| **Character HUD** | iconUrl · tier · HP/MP · hotbar skills | TightBar · action slots | craftpix + catalog icons |
| **UI panels** | equip slots · relic · mount | Inventory Weapon + Prefabs | Foundry / Open panel |
| **Controller** | meshSlot · animPack · back utility | WeaponMeshAttach · anim pack | fleet controller |
| **Combat** | skillDefToDrc · residual · cast | DRC from equip / STAFF bind | Warlords combat |
| **Dev environment** | Prefabs tab · export JSON | casting.grudge-studio.com | Forge + ObjectStore generate |

---

## 4. Equip slots (character)

| Slot | Typical items | Anim / mesh |
|------|---------------|-------------|
| mainHand | sword, axe, staff, wand, bow… | sword_shield / magic / longbow |
| offHand | shield, tome | sword_shield / magic |
| head / body / arms / legs | armor | mesh_ids show/hide |
| back | cape, pack, **windsurf** utility | back attach · ride gate |
| relic | RELC-* | HUD only / passive |
| classItem | class relic / Mage Wand | class gate |
| mount | MNT-* | mount controller |

Loadout pattern (weapons): T0 **three-slot starter** · T1+ **five-slot** (`loadoutPattern` on weapon prefabs).

---

## 5. Lab: Prefabs tab (dev)

**Import only** from info API — no forked skill rows.

1. **I → Prefabs**
2. Filter category: Weapons · Armor · Relics · Mounts · Class · Offhand · T0
3. Select row → see icon, stats, skills (if any), model URL, export snapshot
4. **Equip** if weapon/tool/offhand → combat bar + hand mesh when model exists
5. **Export** Warlords-style prefab JSON for that row

Code: `gameItemCatalog.js` · `presentItem` · Inventory Prefabs panel.

---

## 6. Asset pipeline (when shipping meshes)

```
Author GLB → grudge-asset-convert (SI scale, mesh parts)
  → R2 assets.grudge-studio.com (prod/gltf | models/…)
  → master-*-prefabs / catalog assets.iconUrl + modelUrl
  → D1 weapon_prefabs index (optional mirror)
  → Lab equip / Warlords Unity import / Open
```

- Weapons: family GLBs live; per-item dropPrefab keys often **declared, binary pending**
- Armor: atlas mesh_ids preferred over whole-body swap (grudge6)
- Mounts: separate mount controller, same session as map open rules

---

## 7. Agent rules

1. **Read `game-library.json` + canonical-items-manifest** before adding items.  
2. **Never invent** ITEM-* / SKIL-* ids in the lab — only bind VFX/anim to existing ids.  
3. Weapons with skills → `master-weapon-prefabs` + `master-weaponSkills`.  
4. Armor → `master-armor` until armor-prefabs ship.  
5. Relics / mounts / class → their master-* files.  
6. Player bag SSOT remains **Railway**, not D1/R2.  
7. Casting lab is **dev/proof**; Warlords / Open consume the same JSON.

---

## 8. Pipelines (ObjectStore repo)

```bash
npm run build:weapon-pipeline   # weapons + tools prefabs
npm run build:items-pipeline    # full catalog + manifest + audit
npm run generate:all
npm run validate:catalog
```

---

## Related lab docs

- `WEAPON_EQUIP_PREFABS_SSOT.md` — weapon equip try path  
- `T0_STARTERS_WEAPON_SKILLS_SSOT.md` — Apprentice Wand · Sapling Staff  
- `DROP_RATES_SSOT.md` — world drop presentation  
- `ELEMENT_TRANSIT_MASTERY_SSOT.md` — staff school VFX  
