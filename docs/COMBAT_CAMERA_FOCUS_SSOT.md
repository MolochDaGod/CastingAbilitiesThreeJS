# Combat camera + soft-lock focus SSOT

**Refs:**
- Camera angles: [grudge-third-person-controller](https://github.com/MolochDaGod/grudge-third-person-controller) (Fortnite/WoW blend)
- Targeting: skill `grudge-combat-targeting` (LMB select · RMB focus toggle · soft lock)

**Code:** `CameraRig.js` · `CombatFocus.js` · `MouseAim.js` · `settings.camera` / `settings.aim`

---

## What we take from the third-person controller

| Feature | Production value |
|---------|------------------|
| Shoulder offset | Over-the-shoulder combat (~0.72 m) |
| Pitch/distance | Tighter combat distance + default pitch |
| Wider FOV | ~58° combat awareness |
| Smooth damping | Calm follow without OrbitControls fight |

## What we keep (production)

| System | Behavior |
|--------|----------|
| Soft lock | Bias aim + camera look toward target — **no hard snap** |
| Session gates | TPS only when combat/freeride |
| Path cast LMB | Staff path remains primary cast stroke |
| OrbitControls | **Disabled in TPS** (fleet hard rule) |
| Ride parent | Windsurf still owns transform |

---

## Input (combat)

| Input | Action |
|-------|--------|
| **RMB click** (short, no drag) | Toggle **focus** (sticky) |
| **RMB hold** | Orbit camera pitch/yaw |
| **LMB drag** | Path cast (staff) |
| **Shift hold** | Sprint |
| **Shift + tap Ctrl** | **Slide** (while sprinting) |
| **Ctrl** (+ optional dir) | **Roll** forward / L/R/B with WASD |
| **Focus ON** | Character **rotates with camera**; WASD camera-relative strafe |
| **Focus OFF** | Camera free; **A/D tank-turn** body; W/S along body facing |
| Soft target | Ring/crosshair hostile red; camera soft-look (not hard snap) |

Register enemies with `combatFocus.addSelectable(mesh, 'hostile')`.

---

## Agent rules

1. Extend `CameraRig` / `CombatFocus` — do not import the whole third-person repo as a second controller  
2. Soft lock ≠ camera hard lock  
3. Never enable OrbitControls during TPS combat  
4. Clear `rmbHeld` on blur / visibilitychange  

## Related

- `PRODUCTION_CONTROLLER_SSOT.md`  
- `SESSION_STATE_SSOT.md`  
- skill `grudge-combat-targeting`  
