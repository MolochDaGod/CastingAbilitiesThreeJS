# Melee combo SSOT — sword & shield (Casting lab)

**Code:** `settings.meleeCombo` · `CharacterController.playMeleeAttack` · `DrcCombatController.useMeleeStrike`  
**Clips:** `public/anims/baked/sword_shield/*` + Open CDN Bip001 finisher  
**Pack:** `ANIM_PACKS.sword_shield` · roles `attack1|attack2|attack3|attack|finisher|finisherAir`

## Problem

CDN `sword_shield/sword and shield attack` is a **jump / dash finisher**, not a light swing. Using it for every LMB/F made every hit look like a finisher leap.

## Contract

| Input | Condition | Role | Body MM | Residual |
|-------|-----------|------|---------|----------|
| LMB / F melee | Grounded, normal | `attack1` → `attack2` → `attack3` (chain) | none | light ~2.6 m +0.35/step |
| LMB / F melee | **Airborne** | `finisherAir` → `dropto-target` | air lunge ~180 MM | ~6.5 m |
| LMB / F melee | **Large MM toward target** (sprint into aim) | `finisher` / `attack` (CDN jump-dash) | lunge ~320 MM | ~5.5 m |

- **Chain window:** `settings.meleeCombo.chainWindow` (default 0.85 s)  
- **Finisher MM threshold:** `settings.meleeCombo.finisherMm` (default 280 MM ≈ 2.8 m intent)  
- **100 MM = 1 m** (`motionMath.js`)

## Reviewed source FBX (Mixamo → same-origin bake)

All sources under `Documents\*.fbx`, skeleton **Mixamo** (`Hips`…), rematched to **Bip001** at bind (`bakeClip.rematchClipToSkeleton`).

| File | Dur | Role in lab |
|------|-----|-------------|
| `intoout.fbx` | 1.70 s | **attack1** light (in→out slash) |
| `St1able Sword Inward Slash.fbx` | 2.23 s | **attack2** light (stable inward) |
| `11Upward Thrust.fbx` | 2.37 s | **attack3** light (upward thrust) |
| `One Hand Sword Combo.fbx` | 4.57 s | Full chain + equal thirds `one-hand-combo-hit1..3` (fallback) |
| `Two Hand Sword Combo.fbx` | 3.30 s | 2H style (baked, not primary S&S light) |
| `Dual Weapon Combo.fbx` | 3.67 s | Dual wield (baked, not primary) |
| `spear1.fbx` | 3.30 s | Spear pack candidate |
| `greataxe.fbx` | 5.47 s | Greataxe pack candidate |
| `dropto target.fbx` | 0.83 s | **finisherAir** |
| CDN `sword and shield attack` | 2.33 s | **finisher** (jump/dash) — Bip001 native |
| CDN `sword and shield slash` | 3.53 s | Fallback if local bake 404 |

Raw GLB intermediates: `public/anims/raw/*.glb`  
Baked JSON: `public/anims/baked/sword_shield/*.json`  
Manifest: `public/anims/baked/sword_shield/_melee_combo_manifest.json`

## Extend pattern

1. Drop FBX → Blender headless GLB → Node `AnimationClip.toJSON` into `public/anims/baked/sword_shield/`  
2. Add role URL list under `ANIM_PACKS.sword_shield`  
3. Register `ANIM_ROLE_META`  
4. Prefer same-origin `./anims/baked/…` (already first in `bakedClipUrls`)  
5. Smoke: equip sword_shield, LMB×3 grounded, LMB in air, sprint+LMB toward aim  

## Hard bans

- ❌ Binding every light hit to CDN `sword and shield attack` (finisher only)  
- ❌ Second mixer for combo  
- ❌ Shipping raw Mixamo FBX to browser (JSON bake only)  
- ❌ Inventing `slashLeft` role names — use `attack1|2|3|finisher|finisherAir`
