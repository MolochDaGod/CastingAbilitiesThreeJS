# Melee combo SSOT — sword & shield (Casting lab)

**Code:** `settings.meleeCombo` · `CharacterController.playMeleeAttack` · `DrcCombatController.useMeleeStrike` / `_useJumpAttackLmb`  
**Clips:** `public/anims/baked/sword_shield/*` + Open CDN Bip001 finisher + `public/anim/greatsword/great-sword-jump-attack.fbx`  
**Pack:** `ANIM_PACKS.sword_shield` · roles `attack1|attack2|attack3|attack|finisher|finisherAir|jumpAttack`

## Problem

CDN `sword_shield/sword and shield attack` is a **jump / dash finisher**, not a light swing. Using it for every LMB/F made every hit look like a finisher leap.

## Contract

| Input | Condition | Role | Body MM | Residual |
|-------|-----------|------|---------|----------|
| LMB / F melee | Grounded, normal | `attack1` → `attack2` → `attack3` (chain) | none | light ~2.6 m +0.35/step |
| LMB / F melee | **Airborne** or **just landed (0.48 s)** | `jumpAttack` + **soft-lock dash** to target | dash 4.8 m · slash residual at 0.46 s · small **earth** under feet | ~6.5 m |
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
| `dropto target.fbx` | 0.83 s | **finisherAir** fallback |
| `_anim_packs/greatsword/great sword jump attack.fbx` | — | **jumpAttack** / air LMB |
| `_anim_packs/greatsword/great sword blocking.fbx` (+2, +3) | — | **block / parry / blockHit** (combat_mobility) |
| `_anim_packs/greatsword/great sword casting.fbx` | — | **cast** (staff + melee) |
| CDN `sword and shield attack` | 2.33 s | **finisher** (jump/dash) — Bip001 native |
| CDN `sword and shield slash` | 3.53 s | Fallback if local bake 404 |
| `Documents/combo1.glb` | 6.27 s | **spearAttack1** (warrior mesh stripped → Bip001) |
| `Documents/combo2.glb` | 4.50 s | **spearAttack2** + `spear_cyclone` skill |
| `Documents/attack3.glb` | 2.47 s | **Spear** basic (`spear/attack3` · `polearm/attack3`) — Bip01→Bip001 |
| `Documents/zaraki_kenpachi.glb` | 1.00 / 0.70 / 0.47 s | **Primary light 1H + 2H** `ken_strike` → `ken_slash` → `ken_hit3` (same-author; fits 0.85 s window). Run = `ken_run`. Skip stubs < 0.35 s. |
| `Documents/quincy_ichigo.glb` | 2.17 / 2.57 / 6.00 s | Bow `longbow/ichi_shot` · staff `magic/ichi_cast` / `ichi_skill`. Not a melee combo. |
| `Documents/hero_estes_old_2016.glb` | 1.33–1.50 s | **Staff** `magic/estes_cast` · `estes_skill` 1–3. Not melee. |
| `Documents/longhai.glb` | 1.30 s attack · 1.43 s walk | `hai_strike` after Ken on attack1 · `hai_walk` · `hai_skill`. Skip `wait` (no Pelvis). |
| `Documents/attackcombo01.glb` | 6.92 s Mixamo | **Fallback** 3-hit `combo01-hit1..3` (2.31 s each) if Ken JSON 404 |
| `Documents/attack_combo_2.glb` | 12.08 s Mixamo | **2H fallback** `combo2-hit1..3` after Ken / Bane |
| Knight CDN `sword and shield attack` | 2.33 s | **Finisher** three-slash jump-dash — keep, not light LMB |
| `Documents/run.glb` | 0.80 s | **sword_shield run** (2H/spear) |
| `Documents/chinese_warrior_monk.glb` | 1.63 s | **twoHandAttack** (hammer/axe) |
| `Documents/quickleapattack.glb` | 2.33 s | **magic jumpAttack** staff in-air MMB |

Bake: `node scripts/bake-warrior-monk-clips.mjs` → `public/anims/baked/{spear,2h_melee,magic}/`  
Manifest: `public/anims/baked/warrior-monk-manifest.json`

Spear LMB uses combo1 → combo2 → attack3 (not generic sword slashes). Staff MMB while airborne plays quickleap. Warrior mesh is never loaded in play.

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
