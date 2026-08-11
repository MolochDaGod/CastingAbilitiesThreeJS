# Fall / jump locomotion SSOT

**Author FBX:** `D:\Games\Models\`  
**Lab copies:** `public/anim/locomotion/fall/*.fbx`  
**Code:** `config/fallAnimSsot.js` · `fbxClip.js` · `CharacterController` · `DrcCombatController`

## Clips

| Role | Disk file | Public | Loop | Use |
|------|-----------|--------|------|-----|
| `fallLoop` | Fall A Loop.fbx | `fall-loop.fbx` | yes | Descending air cycle |
| `fall` | Falling.fbx | `falling.fbx` | yes | Long / deep fall body |
| `fallLand` | Falling To Landing.fbx | `fall-to-landing.fbx` | no | Soft or default land |
| `fallRoll` | Falling To Roll.fbx | `fall-to-roll.fbx` | no | Hard impact + forward → roll |

Optional: `Falling Idle.fbx` → `fall-idle.fbx` / role `fallIdle`.

## State machine (deterministic)

```
ground ── Space ──► jump (holdAir)
jump / rise ── vy ≤ −0.55 & airTime ≥ 0.12 ──► fallLoop
fallLoop ── land ──►
   |impactVy| ≥ 6.5 && horiz ≥ 1.8 (or W/Shift) ──► fallRoll
   else ──► fallLand
fallLand / fallRoll ── clip end ──► idle/walk gait
```

No random picks. Thresholds in `FALL_THRESHOLDS`.

## Blending

| Transition | Fade |
|------------|------|
| jump → fallLoop | `fallInBlend` 0.16 s |
| fall → land/roll | exclusive one-shot |
| land/roll → gait | `landOutBlend` 0.14 s |

## Bind

Roles live on **`combat_mobility`** pack (always bound). FBX rematch to Bip001 via `loadFbxClipRematched` when baked JSON missing.

## Promote later

Bake rotation-only JSON → `open.grudge-studio.com/anims/baked/locomotion/fall-*.json` and list in `FALL_BAKED_CANDIDATES`.
