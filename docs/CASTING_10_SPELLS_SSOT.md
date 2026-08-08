# Casting lab → 10 spells → WEAPON_SKILLS

**Live lab:** https://casting-abilities-threejs.vercel.app/  
**Catalog UI:** https://info.grudge-studio.com/WEAPON_SKILLS.html  
**JSON kit:** ObjectStore `api/v1/casting-spell-kit.json`  
**Runtime:** `src/combat/castingSpellKit.js` · bar via `drcSkills.js`

## Goal

Learn **each element’s** animation pack, Ability script, textures/materials, and VFX so staff (and the same pattern for every weapon type) skills on WEAPON_SKILLS are **fully bound** — not empty `animation` / `prefab.vfxRef` nulls.

## Resources

Spells cost **mana + stamina**. LMB hold + path length raise intensity (1–3×).  
See `castResources.js` · `docs/PRODUCTION_CONTROLLER_SSOT.md`.

## The 10 core spells + 5 signatures

| # | Lab id | STAFF catalog id | Element | Path mode | Ability | Cast → Travel → Impact |
|---|--------|------------------|---------|-----------|---------|------------------------|
| 1 | casting_fire_bolt | staff_fire_bolt | fire | stream | FireAbility | fire_hand → fireball → inferno |
| 2 | casting_flame_wave | staff_flame_wave | fire | aoe | FireAbility | fire_hand → fireball → inferno |
| 3 | casting_frost_bolt | staff_frost_bolt | water | stream | WaterAbility | arcane_swirl → moon_beam → frost_wave |
| 4 | casting_ice_nova | staff_ice_nova | water | spikes | WaterAbility | … → frost_wave |
| 5 | casting_earth_spike | staff_earthquake | earth | spikes | EarthAbility | earth_surge ×3 |
| 6 | casting_stone_wall | staff_natures_fury | earth | wall | EarthAbility | earth_surge |
| 7 | casting_wind_tempest | staff_storm_call | wind | stream | WindAbility | arcane_swirl → chain_lightning → ice_lightning_burst |
| 8 | casting_gale_nova | staff_thunder_cataclysm | wind | aoe | WindAbility | … → ice_lightning_burst |
| 9 | casting_holy_light | staff_holy_light | arcane | stream | (wind path + beauty) | arcane_swirl → moon_beam |
| 10 | casting_meteor_strike | staff_meteor_strike | fire | stream | FireAbility | fire_hand → fireball → inferno (long range) |
| S | casting_inferno | staff_inferno | fire | stream | FireAbility | **Inferno** signature |
| S | casting_blizzard | staff_blizzard | water | aoe | WaterAbility | **Blizzard** signature |
| S | casting_warp | staff_warp | arcane | stream | arcane | **Warp** signature |
| S | casting_quake | staff_quake | earth | wall | EarthAbility | **Quake** signature |
| S | casting_tempest | staff_tempest | wind | stream | WindAbility | **Tempest** signature |

## What to study per element

| Element | Script | Settings | Materials / FX |
|---------|--------|----------|----------------|
| **Fire** | `FireAbility.js` | `settings.fire` | `VolumetricFireMaterial`, embers/sparks, BurstSphere |
| **Water** | `WaterAbility.js` | `settings.water` | ribbons, spray, foam, frost_wave |
| **Earth** | `EarthAbility.js` | `settings.earth` | ground rise, earth_surge |
| **Wind** | `WindAbility.js` | `settings.wind` | sheets, residual cyan, chain_lightning |
| **Path place** | `pathCastClassify.js` | `settings.staffCast` | aoe · spikes · wall · stream |
| **Anim** | magic pack | `weaponAnimPack` staff→magic | `standing 1h cast spell 01` |
| **Primitives** | `effectPrefab.js` | `settings.effect` | intensity / aoe / speed / size / color / mesh |

## Lab UX

- **I → Skills** — 10-spell kit list + pages **1–4 / 5–8 / 9–10** on hotbar  
- **1–4** cast active page · **LMB draw** path place · **F** interact  
- **Q** combat session  

## Pattern for *all* weapons (WEAPON_SKILLS)

| labStyle | animPack | animRole | default residual/VFX |
|----------|----------|----------|----------------------|
| spell | magic | cast | element cast/travel/impact |
| melee | sword_shield | attack | getsuga_slash from tip |
| ranged | longbow | attack | projectile + impact |

Staff is the **spell** proof. Sword/axe/bow keep the same FleetWeaponSkill shape: `castEffectId` / `travelEffectId` / `impactEffectId` + `animRole` + pack.

## Export / fleet

```js
import { exportSpellKitJson, CASTING_SPELL_KIT } from './castingSpellKit.js';
// ObjectStore api/v1/casting-spell-kit.json
// master-weaponSkills STAFF skills get prefab.castingLab + animation clip
```

## Agent rules

1. Extend **castingSpellKit** + Ability/settings — do not invent a parallel spell list  
2. Catalog `id` must match WEAPON_SKILLS (`staff_*`) when binding  
3. Orbs for travel mesh — never whole `fireball.glb` as scene  
4. Space = jump; residual only on attack frames  
5. After enrich, smoke: combat Q → 1–4 each page → toast shows `→ staff_*`  

## Related

- `docs/CASTING_LAB_SSOT.md`  
- `src/combat/elementWeaponSkills.js`  
- `src/api/weaponSkillsCatalog.js`  
- ObjectStore `docs/DROP_TABLES_SSOT.md` (separate)  
