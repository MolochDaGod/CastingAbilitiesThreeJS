# Mastery systems SSOT (Casting Warlords lab)

**Goal:** fun → **awesome** — electric/AOE spell look, texture variants (size/speed/angle + alt texture), weapon/tool equip, mobility, GRUDOX animator camera/focus/crosshair closer parity, XState activity split.

**Host:** `casting-abilities-threejs.vercel.app` · `casting.grudge-studio.com`  
**Repo:** `CastingAbilitiesThreeJS`

---

## 1. XState activity machine

| File | Role |
|------|------|
| `src/combat/playerActivityMachine.js` | Pure states: `combat` ↔ `harvest` · hand · tool memory · loco |
| `src/combat/playerActivity.js` | Radials + tool defs + labels (SSOT data) |
| `App.js` | Side effects: equip / stow / toast |

### Events

| Event | Effect |
|-------|--------|
| `ENTER_HARVEST` | Stow combat weapon id → draw last tool (default **pick**) |
| `ENTER_COMBAT` | Stow tool → restore `combatWeaponId` (or t0-wand) |
| `SELECT_TOOL` | Hold-R radial pick |
| `DRAW_LAST_TOOL` | **Tap R** — last used tool, default pick |
| `SET_LOCO` | idle / walk / run / sprint / jump / harvest_swing / cast |

Do **not** invent a second mode store — SessionState still owns cast/walk/ride gates; this machine owns **activity + hand**.

### Input map

| Input | Behaviour |
|-------|-----------|
| Hold Q | Mode radial ↑ combat · ↓ harvest |
| Tap Q | Toggle combat ↔ harvest |
| Hold R (harvest) | Tool radial |
| Tap R (harvest) | Draw last tool (default pick) |
| F | Harvest nearest ≤5 m (tool in hand) or combat skill |

---

## 2. Camera / focus / crosshair (GRUDOX animator)

Reference: `grudox.grudge-studio.com/animator/` · `Documents/animator/animator/src/three/Controller.ts` + `Crosshair.tsx` + `aim/AimSystem.ts`.

| Animator concept | Casting wiring |
|------------------|----------------|
| Screen-centre aim ray | `CameraRig.aimRay()` · `MouseAim.updateFocusAim` |
| Soft lock frame (look bias, not hard snap) | `CameraRig.setSoftLock` · weight focus 0.42 |
| Crosshair bloom gap | HUD `--ch-gap` from spread 0..1 |
| Range ring close/optimal/far | `settings.aim.optimalRangeMin/Max` |
| Hit marker pulse | `setCrosshairState({ hitMarker })` |
| Sprint FOV kick | `camera.sprintFov` 78 · `setSprinting` |
| Focus tighter distance/shoulder | `focusDistance` 5.5 · `focusShoulderOffset` 0.8 |

OrbitControls **never** writes camera in TPS (fleet rule).

---

## 3. Spell mastery — variants + electric / AOE

| File | Role |
|------|------|
| `src/vfx/effectVariants.js` | Catalog: electric + AOE size/speed/angle + textureKey / textureAlt |
| `LinearSkillBridge.applyVariant(id)` | Live apply to linearSettings block |
| `linearSettings.thunder` | Electric look: denser strands, brighter core/halo, ground arcs |
| `linearSettings.snare` / `glacier` | Larger zoneRadius AOE footprints |
| `linearSettings.meteor` | Larger radius + dual texture keys |

**Rule:** one texture family · many casts via size / speed / angle; second texture for impact/rim/ground.

---

## 4. Weapon skills + mobility (existing, extended)

| System | File |
|--------|------|
| DRC 1–4 / F residual | `DrcCombatController.js` |
| Weapon equip | `equippedWeaponRuntime.js` |
| MM dodge / roll / slide | `motionMath.js` · CharacterController |
| Sprint FOV | CameraRig |

Next mastery slices (not blocking this ship): intensity tiers in editor, DRC castToward for line skills on soft-lock, weapon skill tree polish per pack.

---

## Confirmation gates

```
[ ] Tap Q harvest → pick auto-equipped (or last tool)
[ ] Tap Q combat → weapon restored
[ ] Tap R in harvest → last tool, default pick
[ ] Focus → crosshair + range ring on soft-lock
[ ] Sprint → FOV opens slightly
[ ] Alt+Shift+E thunder looks electric (strands/glow/arcs)
[ ] Snare/glacier zone footprints readable
[ ] No second mixer / second combat engine
```
