# T0 pistol animation SSOT

## Sources

| Source | Path | Use |
|--------|------|-----|
| **Bip001 bake (live)** | `open.grudge-studio.com/anims/baked/pistol/*` | grudge6 / Casting / Multiverse |
| **Mixamo author FBX** | `gameopen/.../anim/pistol/` — gunplay, drawing-gun, charged-pistol, pistol-whip | re-bake |
| **grudgepistolzio (incoming)** | `D:\Games\Models\_anim_packs\grudge6_incoming_2026-08-01\grudgepistolzio` | one-hand gun **loco** + kneel; bake next |
| **Minecraft TPS reference** | `minecraft_tps_model_1780812780503.glb` | timing + prop nodes only |
| **Lab copy** | `Casting…/public/models/reference/minecraft_tps_pistol.glb` | preview |
| **Flintlock mesh** | `public/models/weapons/t0-flintlock.glb` | `t0-gun` hand mesh |
| **Bullet** | `public/models/vfx/projectiles/bullet1.glb` | Styloo pack · see PISTOL_FLINTLOCK_SSOT |

**Do not** retarget TPS clips onto Bip001 — rigid Minecraft nodes (`Pistol_13`, `Rightarm_14`).

## TPS clip → fleet role

| TPS clip | ~s | Fleet role | Bip001 clip |
|----------|-----|------------|-------------|
| fire / fireaim | 0.21 | `attack` | `pistol/gunplay` (spin) @ timeScale ~1.6 |
| draw / drawaim | 0.17–0.25 | `draw` | `pistol/drawing-gun` |
| drawnidle / drawaimidle | 1.6–2.0 | `idle` / `cast` | `pistol/idle` |
| walk | 0.88 | `walk` | `pistol/walk-forward` |
| idle | 9.1 | `idle` | `pistol/idle` |

**gunplay** = Mixamo pistol spin flourish (primary fire / spin skill).

## Casting wiring

- `ANIM_PACKS.pistol` in `src/config/assets.js`
- `WEAPON_TYPE` PISTOL/GUN/HANDGUN → meshSlot `pistol` → pack `pistol`
- Equip attach profile `pistol` (~0.42 m SI handgun)
- `pistolAnimSsot.js` — timings + `pistolTimeScale()`

## Multiverse

`game/animPackLoader.js` pistol roles prefer `gunplay` / `drawing-gun` / `charged-pistol` over dual_wield fallbacks.
