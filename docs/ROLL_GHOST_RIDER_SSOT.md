# Ghost Rider rolls — clean bind (no deform)

**Clips:** `open…/anims/baked/ghost_rider/roll_{left,right,forward,back}.json`  
(Already **Bip001** rotation-only · ~0.77s · same data as `locomotion/roll_*`)  

**Code:** `CharacterController.playRoll` · `play(…, { exclusive: true })` · `bakeClip.rematchClipToSkeleton` · `DrcCombatController.roll`

## Why rolls looked deformed

| Cause | Fix |
|-------|-----|
| Idle/walk still weighted while roll played | **Exclusive** one-shot: fade out every other action |
| Impulse duration ≠ clip (~0.55 vs 0.77s) | Impulse **syncs to clip duration** |
| Missing `Toe0` / `Spine2` on Toon kit | Rematch Toe0→Foot, Spine2→best spine |
| Quaternion double-cover pops | `ensureQuaternionContinuity` on rematch |

## Input

| Key | Roll |
|-----|------|
| Ctrl+A | left |
| Ctrl+D | right |
| Ctrl+W | forward |
| Ctrl+S | back |

## Agent rules

- Do not invent a second mixer for rolls  
- Prefer Ghost Rider pack first (already Bip001) — no Mixamo retarget at runtime  
- Keep root motion as DRC impulse; clip is rotation-only (by design)  
