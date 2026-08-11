# Abilities (path-cast pools)

Product language: these are the **path-cast engines under staff weapons**, not free “elements.”

| Ability class | Pool key | Staff weapons that use it |
|---------------|----------|---------------------------|
| `FireAbility` | `fire` | Fire staff |
| `WaterAbility` | `water` | Ice staff |
| `EarthAbility` | `earth` | Nature staff |
| `WindAbility` | `wind` | Storm · Holy · Arcane staffs |

**Staff product ids** (hotbar 1–6): `WEAPON_STAFF_IDS` in `src/config/settings.js`  
**Catalog combat weapons** (sword, gun, wand…): `equipWeaponById` + `docs/T0_WEAPON_PLAY_STACK_SSOT.md`  
**Agent skill:** `casting-t0-weapon-play`

Do not add a parallel element skill tree. Extend catalog weapons + production compile, or map a new staff brand onto an existing pool.
