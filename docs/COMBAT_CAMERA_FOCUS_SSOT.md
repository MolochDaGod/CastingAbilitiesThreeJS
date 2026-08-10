# Combat camera + soft-lock focus SSOT

**Refs:**
- Camera angles: [grudge-third-person-controller](https://github.com/MolochDaGod/grudge-third-person-controller) (Fortnite/WoW blend)
- Targeting: skill `grudge-combat-targeting` (LMB select · RMB focus toggle · soft lock)

**Code:** `CameraRig.js` · `CombatFocus.js` · `MouseAim.js` · `settings.camera` / `settings.aim`

---

## What we take from the third-person controller

**Repo:** [grudge-third-person-controller](https://github.com/MolochDaGod/grudge-third-person-controller) · Fortnite mode in `CAMERA_MODES.md`

| Feature | Production value (Fortnite TPS) |
|---------|----------------------------------|
| Distance | **5.5 m** focus · ~6 m free |
| Shoulder | **0.8 m** focus · 0.72 free |
| FOV free | **70°** |
| FOV focus | **85°** (situational awareness) |
| Soft lock | **ON in focus** · Tab / Shift+Tab cycle |
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
| **RMB click** (short, no drag) | Toggle **focus** (sticky) · soft lock ON · auto nearest target |
| **RMB hold** (Focus OFF) | Orbit camera pitch/yaw |
| **Mouse move · Focus ON** | **Look** (mouse = camera aim; OS cursor hidden) |
| **Tab** | Soft-lock **next** target in range |
| **Shift+Tab** | Soft-lock **previous** target |
| **LMB · Focus ON** | **Attack** (primary / residual) |
| **LMB · Focus OFF** | **Select** target (soft lock) · **unlocked mouse** |
| **LMB · sandbox / walk** | Path draw (cast or ride course) |
| **Shift hold** | Sprint |
| **Shift + tap Ctrl** | **Slide** (while sprinting) |
| **Ctrl** (+ optional dir) | **Roll** forward / L/R/B with WASD |
| **Focus ON** | Cursor **none** · center **crosshair** · pointer-lock look · body **lag-follows** camera (deadzone + low turn rate) · WASD cam-relative · LMB attack |
| **Focus OFF** | Unlocked cursor; LMB select; A/D tank-turn; W/S body forward |
| Soft target | Soft-lock bias when a target is selected (not hard snap) |

### Two aim visuals (do not conflate)

| Visual | When |
|--------|------|
| **Screen crosshair** (HUD center) | Focus ON only — look / projectile aim |
| **Ground ring** (`aimMarker`) | Placement / AoE / path only: wall, spikes, zone, trap, summon, path draw, `at_location` / `path_*` / under-target — **not** idle focus look or pure melee residual |

Defaults: `focusTurnSpeed` **6.5**, `focusTurnDeadzoneDeg` **16°** (Editor → Controls → Aim).

### Focus = “remove the mouse”

| Piece | Focus ON | Focus OFF |
|-------|----------|-----------|
| OS cursor | **Hidden** (`cursor: none` + pointer lock when allowed) | Default / free |
| Reticle | Screen-center HUD crosshair | Off |
| Ground ring | Only if skill needs ground aim | Only if path draw / placement cast |
| Aim point | **Snow-brawl ray**: `setFromCamera(center)` → ground/colliders/far hit | Free pointer NDC → ground |
| Launch | `dir = (hit − spawn).normalize()` 3D · hand offset · chest spawn | Horizontal aim XZ |
| Soft lock | Magnetic pull **inside cone** (`softLockMaxAngleDeg`) — no hard snap | Select only |
| Look | `movementX/Y` drives TPS yaw/pitch · body lag-follows past deadzone | RMB hold only |
| LMB | Attack (projectile uses 3D launch) | Select target |

Register enemies with `combatFocus.addSelectable(mesh, 'hostile')`.

### Projectile vector math (snow-brawl ref)

Discourse: [snow-brawl](https://discourse.threejs.org/t/snow-brawl-full-featured-holiday-snowball-shooter-in-pure-three-js/88678)  
Local design HTML: `_grudge-kit-extract/.../Pasted--https-discourse-threejs-org-t-snow-brawl-...html`

```
ndc = (0,0)                    // focus crosshair
ray.setFromCamera(ndc, camera)
hit = intersect(ground|walls) || origin + dir * aimRayFar
// soft-lock: if target in cone, lerp hit toward target.chest
spawn = feet + up*spawnHeight + forward*spawnForward + right*handOff
vel  = normalize(hit − spawn) * speed
```

Code: `MouseAim.updateFocusAim` · `MouseAim.computeLaunch` · `DrcCombatController` skill release.

### Focus strafe (lower body)

When focus is ON and A/D dominate WASD, play pack **walkL/walkR** or **runL/runR** (CDN: `prod:magic/standing-walk-left` etc., longbow side walks). Forward W/S still uses walk/run.

---

## Action mode polish

| Feature | Behavior |
|---------|----------|
| FOV | Free `camera.fov` (70) → focus `actionFov` (85), damped |
| Crosshair | Positional N/E/S/W ticks · soft-lock tint · fire scale · spread from move |
| Strafe gait | World move · cam right/forward → walkL/R / runL/R when lateral dominates |
| Backflip | Real FBX clip when bound · **camera yaw held** (setup for air attack) |
| Frontflip | Real extra/front-flip FBX when bound |
| **Directional soft lock** | Acquire / Tab order by **camera cone × distance** (not pure nearest) |
| **Yaw assist** | Subtle `softLockYawAssist` rad/s toward target in cone — framing help |
| **Pitch assist** | Soft damp pitch toward target chest while locked |
| **Aim magnet** | Crosshair hit blends toward soft target inside `softLockMaxAngleDeg` |
| **Camera ownership** | Focus: mouse owns orbit yaw (not body-driven) · free: body drives base |

## Agent rules

1. Extend `CameraRig` / `CombatFocus` / `MouseAim` — do not import a second controller  
2. Soft lock ≠ camera hard lock (cone-limited magnetic only)  
3. Focus projectiles use **3D** `forward3d` / `computeLaunch` — do not flatten Y to ground-only  
4. Body still rotates with camera look in focus  
5. Backflip must **not** whip camera 180° — hold look yaw  
6. Prefer Open FBX flip clips rematched to Bip001 (`fbxClip.js`)  
7. Never enable OrbitControls during TPS combat  
8. Clear `rmbHeld` on blur / visibilitychange  

## Related

- `PRODUCTION_CONTROLLER_SSOT.md`  
- `SESSION_STATE_SSOT.md`  
- skill `grudge-combat-targeting`  
