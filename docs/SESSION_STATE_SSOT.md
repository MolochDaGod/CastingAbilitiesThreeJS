# Session state SSOT — Casting lab

**Code:** `src/core/SessionState.js`  
**Owner:** `App` constructs one instance and applies side effects on `change`.

---

## Two layers (do not collapse)

| Layer | Purpose | Source of truth |
|-------|---------|-----------------|
| **Tweaks** | Speeds, colors, VFX knobs, walk physics numbers | `settings.js` (lil-gui, presets) |
| **Session** | Interaction mode, combat/equip, ride phase, element, gates | `SessionState` |

Presets patch **settings** only. After import, call `session.syncFromSettings()`.

---

## Fields

| Field | Values | Who writes |
|-------|--------|------------|
| `mode` | `casting` \| `walk` | App / M key / HUD |
| `drc` | `combat` \| `equip` | DrcCombatController / Q |
| `ridePhase` | `idle` \| `leap` \| `ride` \| `freeride` \| `dismount` | WalkController only |
| `element` | `fire` \| `water` \| `earth` \| `wind` | Ability select / digits |
| `paused` | bool | App P key |

---

## Gates (read these — no ad-hoc chains)

```js
session.gates.landLoco      // WASD land combat
session.gates.combatSkills  // 1–4 / F
session.gates.pathIsCast    // stroke → AbilityManager
session.gates.pathIsRide    // stroke → WalkController
session.gates.freerideDeploy
session.gates.rideParented
session.gates.combatKeys
session.gates.tpsCamera
session.gates.orbitCamera
session.gates.inventoryOk
```

---

## Pattern

```
1. User input / controller event
2. session.setX(...)  OR walk reports setRidePhase
3. session emits 'change' (snapshot, prev, reason)
4. App._onSessionChange applies camera, inventory, HUD, combat keys once
5. Controllers in update() read session.gates / session.riding
```

### Hard bans

- ❌ Second copy of mode/session on App + HUD + DRC without sync  
- ❌ Walk writing camera/inventory directly  
- ❌ DRC checking `walk.phase` string without session  
- ❌ Inventing Redux/Zustand — EventEmitter + snapshot is enough  

---

## Controllers

| System | Owns | Reports to session |
|--------|------|-------------------|
| WalkController | leap/ride/freeride/dismount machine | `setRidePhase` |
| DrcCombatController | stamina, CDs, land move | `setDrc` via setSession |
| AbilityManager | cast pools | element via App.selectElement → session |
| CharacterController | mesh, mixer, ride parent flags | (flags only; no session write) |

---

## Related

- `docs/WINDSURF_RIDE_SSOT.md` — ride parenting + phases  
- `docs/CASTING_LAB_SSOT.md` — lab macro  
- `settings.js` — tweak knobs  
