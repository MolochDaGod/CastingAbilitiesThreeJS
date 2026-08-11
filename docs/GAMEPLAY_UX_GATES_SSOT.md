# Gameplay + UX gates SSOT (Casting lab)

**Most important checks** for playable lab → client handoff.  
**Code:** `src/core/gameplayGates.js` · runs after boot · `window.__gameplayGates`

---

## Gate matrix

| Gate | Pass means | Owner |
|------|------------|--------|
| **feet_grounded** | Character feet Y ≈ heightfield sample (Δ < 0.35 m) | PhysicsWorld CCT + IslandHeightfield |
| **feet_mesh_ground** | Kit diagnose feetMinY ≈ 0 (no pelvis-as-feet float) | CharacterController / toonKitPlay |
| **anim_mixer** | Single AnimationMixer | CharacterController |
| **anim_state** | Named state (idle/walk/run/attack/…) + gait lock | CharacterController.animState |
| **anim_idle_clip** | Idle action present | anim packs |
| **camera_tps_combat** | Combat → viewMode `tps` | SessionState gates · CameraRig |
| **camera_orbit_off_in_tps** | OrbitControls **disabled** in TPS | CameraRig (fleet hard rule) |
| **camera_fortnite_distance** | Distance 2.5–10 m (not map-scale 14 m) | settings.camera · **not** WORLD.cameraDistance |
| **camera_single** | One PerspectiveCamera | CameraRig |
| **weapon_skills_bar** | ≥1 skill on DRC bar | drcSkills / equip |
| **weapon_pack** | animPackId / hold kind reported | equippedWeaponRuntime |
| **loco_input / loco_drc / loco_physics** | Input + DRC + Rapier CCT | stack |
| **ux_hud / ux_focus_crosshair** | HUD + focus reticle API | HUD · CombatFocus |

---

## Camera (Fortnite shoulder / builder)

| Mode | Camera | Notes |
|------|--------|--------|
| **Combat / freeride** | TPS shoulder | distance free **6 m** · focus **5.5 m** · shoulder **0.72 / 0.8** · FOV **70 / 78 sprint** |
| **Focus ON** | Same TPS, tighter | Mouse = look · body lag · crosshair · Orbit **off** |
| **Equip / builder** | Orbit allowed | Review assets; focus still forces TPS |

**Hard ban:** OrbitControls writing camera mid-combat TPS.  
**Hard ban:** Soft-lock auto yaw/pitch (aim bias only).

@see `docs/COMBAT_CAMERA_FOCUS_SSOT.md`

---

## Feet

1. Spawn/placeAt uses **heightfield sample**, never hardcoded y=0 after terrain load.  
2. Physics `setPlayerFeet` + CCT snap-to-ground + landHeightAt.  
3. Strip hip **position** tracks on grounded kits (bakeClip).  
4. Ground aim ring Y = terrain sample + 0.05.

---

## Anim state

| State | Source |
|-------|--------|
| idle / walk / run / sprint | gait from DRC movement |
| attack / cast / charge | one-shots · gaitLocked |
| roll / dodge / slide / parry | mobility one-shots |
| jump / fall | fall locomotion pack |

One mixer. Pack swap via weapon equip (sword_shield / magic / longbow / pistol).

---

## Weapon skills · locomotion · traversal

| Layer | System |
|-------|--------|
| Skills 1–4 / F | DrcCombatController + catalog |
| Residual F fallback | settings.residual · tip volume |
| WASD / sprint / slide / roll / dodge | DRC + motionMath MM |
| Jump / double | physics vy + anim |

---

## Console

```js
window.__gameplayGates
// { ok, summary, gates: [{ id, ok, detail }] }
```

---

## Related

- `docs/COMBAT_CAMERA_FOCUS_SSOT.md`  
- `docs/PRODUCTION_CONTROLLER_SSOT.md`  
- `docs/MELEE_COMBO_SSOT.md` · weapon skill production  
- Character: `grudge-character-correctness` · combat: `grudge-fleet-combat`  
