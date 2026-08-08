# T0 starters — import from WEAPON_SKILLS only

**Browse:** https://info.grudge-studio.com/WEAPON_SKILLS.html  
**JSON:** https://info.grudge-studio.com/api/v1/t0-weapons.json  
**Lab:** `src/api/t0WeaponCatalog.js` · Inventory **Weapon** tab

Do **not** invent skill rows. Skills and stats come from ObjectStore / info host.

## Two T0 magic starters (now)

| Catalog id | Name | Weapon type | Skills |
|------------|------|-------------|--------|
| **t0-wand** | Apprentice Wand | WAND | Practice Bolt · Focus · Frost Spark \| Arcane Ping |
| **t0-nature-staff** | Sapling Staff | STAFF (nature) | Practice Root · Nature Ward · Vine Lash \| Healing Sprout |

**Later:** Mage Wand (class item) — not this pass.

---

### Apprentice Wand (`t0-wand`)

- DMG **14** · CRIT **1%** · DEF **3**
- Slot 1 **Practice Bolt** — arcane · DMG 14 · Cast 0.5s · fixed
- Slot 2 **Focus** — CD 5s · Cast 0.3s · **+spell dmg 3s** · fixed
- Slot 3 **Frost Spark** (default) or **Arcane Ping**
  - Frost Spark: frost · 12 · CD 4s · Cast 0.6s · Slow 1s
  - Arcane Ping: arcane · 10 · CD 3s · Cast 0.4s · Low mana
- Branches T1 → fire / frost / holy / arcane / lightning staves

### Sapling Staff (`t0-nature-staff`)

- DMG **16** · CRIT **1%** · DEF **5**
- Slot 1 **Practice Root** — nature · DMG 16 · Cast 0.5s · fixed
- Slot 2 **Nature Ward** — CD 6s · Cast 0.4s · **+defense 2s** · fixed
- Slot 3 **Vine Lash** (default) or **Healing Sprout**
  - Vine Lash: nature · 14 · CD 4s · Cast 0.6s · Root chance
  - Healing Sprout: Heal 12 · CD 8s · Cast 1s · Self heal

---

## Lab flow

1. Open https://casting.grudge-studio.com  
2. **I → Weapon** (loads `t0-weapons.json` live)  
3. Equip **Apprentice Wand** or **Sapling Staff**  
4. Combat **Q** · **1 / 2 / 3** = catalog slots  
5. Slot 3: click alternate skill on list  

URL shortcuts: `?wand=1` · equip path always preferred.

## Code map

| Concern | File |
|---------|------|
| Live import | `t0WeaponCatalog.loadEquippableWeapons` |
| Skill → DRC + VFX | `skillDefToDrc` + `bindFromCatalogSkill` |
| Equip | `equippedWeaponRuntime.js` |
| Hand mesh | `WeaponMeshAttach.js` (CDN model when prefab has modelUrl) |

## Assets (meshes)

GLB models are **separate** from skill import: catalog skills work without mesh.  
When models ship to `assets.grudge-studio.com` / prefab `modelUrl`, equip attaches them.  
Source authoring: apprentice = arcane resonance staff · sapling = mushroom_staff (slot tint later).
