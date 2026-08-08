# Equip weapons → skills + assets → Warlords prefabs

**Live lab:** https://casting-abilities-threejs.vercel.app/  
**Catalog UI:** https://info.grudge-studio.com/WEAPON_SKILLS.html  
**Runtime:** `src/combat/equippedWeaponRuntime.js` · `src/api/t0WeaponCatalog.js`

## Product rule

A weapon is **tried by equipping it**. Equip loads:

| Layer | Source |
|-------|--------|
| **Icon** (UI + world sprite) | `master-weapon-prefabs` `assets.iconUrl` |
| **3D model** (hand attach + world) | `modelUrl` / `prod/gltf/weapons/*.glb` |
| **Drop prefab key** | `assets.dropPrefabR2Key` |
| **Weapon skills** (3-slot starter) | `t0-weapons` + `master-weaponSkills` starters |
| **Anim pack** | weaponType → magic / sword_shield / longbow |
| **Kit mesh_ids** | exclusive sword/axe/staff/bow slot on Toon kit |

Not a free skill tree switch alone — **the item owns the skills**.

## Lab UX

1. **I → Weapon**
2. Click any **T0** card (Training Sword, Apprentice Wand, …)
3. See icon banner + model path + skill list
4. Combat **Q** → **1 / 2 / 3** fire that weapon’s skills
5. Slot 3 choices: click alternate ability on the list
6. **Export Warlords prefab JSON** / Copy

## Prefab export shape

```json
{
  "kind": "warlords-weapon-prefab",
  "id": "t0-wand",
  "assets": { "iconUrl", "modelUrl", "dropPrefabUrl", "animPack", "meshSlot" },
  "presentation": { "iconUrl", "modelUrl", "borderColor", "glowColor" },
  "skills": { "slot1", "slot2", "slot3Options", "hotbar" },
  "lab": { "meshSlot", "animPack", "labStyle" }
}
```

Use this to seed Warlords entity/weapon prefabs (icon + mesh + skill binds).

## SSOT files

| File | Role |
|------|------|
| `api/v1/master-weapon-prefabs.json` | 877 prefabs · icon · model · tier |
| `api/v1/t0-weapons.json` | 15 starters · three-slot skill bodies |
| `api/v1/master-weaponSkills.json` | Full skill defs / WAND STAFF … |
| `src/character/WeaponMeshAttach.js` | Hand GLB attach |
| `src/loot/prefabAssets.js` | presentPrefab icon/model |

## All weapons pattern

Same pipeline for every `weaponType` (SWORD … WAND … BOW):

1. Resolve prefab presentation  
2. Resolve 3-slot (or 4) skills  
3. Map to lab mesh + anim pack  
4. Equip → playtest → export  

Higher tiers: same equip path when prefab has `skills.slots` + catalog skill ids.

## Related

- `docs/T0_APPRENTICE_WAND_SSOT.md`  
- `docs/CASTING_10_SPELLS_SSOT.md`  
- `docs/WORLD_DROP_PRESENTATION.md`  
