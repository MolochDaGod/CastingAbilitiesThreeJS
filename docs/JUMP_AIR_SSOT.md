# Jump / air mobility SSOT

**Code:** `DrcCombatController._handleJump` · `CharacterController.playJump|playFrontflip|playBackflip` · `PhysicsWorld.setGravityScale`  
**Settings:** `settings.drc` (velocities, hang) · Editor **Jump / air** + **Controls**

## Input

| Press | Grounded | Airborne |
|-------|----------|----------|
| **Space** | Jump + blend `jump` clip (hold pose until land) | — |
| **Space** (2nd) | — | **Frontflip** (standard double jump) + slight forward push |
| **S + Space** (2nd) | — | **Hard stop** → **backflip** reverse dash (horizontal-heavy) → **hang** gravity |

## Why hang after backflip

`backflipHangGravity` (~0.32) + `backflipHangDuration` (~1.15 s) slow the fall so **air attacks / aim** stay usable after the flip.

## Clip sources

| Role | Source |
|------|--------|
| Jump | `prod:magic/standing-jump` / pack `jump` |
| Front / back flip | Procedural tilt 360° + jump clip underlay (no second mixer) |

## Related controls

| Setting | Default | Meaning |
|---------|---------|---------|
| `controls.sprintToggle` | **true** | Shift **press** toggles sprint |
| `controls.focusToggle` | **true** | RMB **click** toggles focus (false = hold RMB) |
