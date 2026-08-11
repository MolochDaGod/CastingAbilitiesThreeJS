# Weapon mesh collider SSOT (Casting lab)

**Code:** `src/character/weaponMeshCollider.js`  
**Consumers:** `CharacterController` · `equippedWeaponRuntime` · `weaponTipTrail` · parry / residual / IK

## Goal

From the **actual weapon mesh** (catalog `WeaponAttach` or kit mesh_ids):

1. Fit an **oriented cylinder** along the blade/barrel (principal axis of vertices)  
2. **Pad radius +0.02 m** around the mesh (`WEAPON_COLLIDER_PAD_M`)  
3. Parent tip / grip / mid markers to the mesh so they **ride the anim**  
4. Drive **melee residual, tip trail, projectiles, IK grip, effects, sounds, parry** from that one volume  

No free-floating Y-stick on the hand. No second collider stack.

## Pipeline

```
equipWeaponById / mesh_ids change
  → resolveWeaponMesh (attach child or kit sword/axe/…)
  → sample vertices (mesh-local)
  → principal axis (power iteration on covariance)
  → cylinder length + max radial extent + 0.02 m pad
  → orient grip end toward R_hand
  → attach WeaponVolume markers (Tip / Grip / Mid)
  → character.weaponVolume = vol
```

## API

| Function | Use |
|----------|-----|
| `buildWeaponMeshVolume(root, { weaponAttach, handBone, padM, debug })` | Full rebuild |
| `getVolumeTipWorld(vol)` | Residual / projectile / trail sample |
| `getVolumeGripWorld(vol)` | IK off-hand / whoosh origin |
| `getVolumeAxisWorld(vol)` | Blade forward for residual path |
| `getVolumeContactRadius(vol)` | Physics residual contact |
| `pointHitsWeaponVolume(vol, point, r)` | Parry / block tests |
| `weaponVolumeToJSON(vol)` | Prefab export |

## Character hooks

```js
character.rebuildWeaponVolume({ debug: false }); // after equip
character.getWeaponTip(out);   // prefers weaponVolume tip
character.getWeaponForward(out); // prefers volume axis
character.weaponVolume.radiusM;  // cylinder radius incl. pad
```

## Systems fed by volume

| System | How |
|--------|-----|
| **Tip trail** | Samples `getWeaponTip` each frame in swing |
| **Apex residual** | Tip + `beyondBladeM` · contact = max(settings, volume.radius) |
| **Physics projectile** | Spawn along axis, radius from volume |
| **Fire blur path** | Fire Ability along residual curve |
| **IK** | Grip marker for off-hand / reload reach |
| **Parry** | `pointHitsWeaponVolume` during guard window (wire attack sphere) |
| **SFX** | Tip velocity / impact at tip (use tip world) |

## Defaults

| Knob | Value |
|------|-------|
| Pad | **0.02 m** |
| Min radius | 0.015 m + pad |
| Min length | 0.08 m |
| Shape | cylinder (convex hull optional later) |

## Hard bans

- ❌ Hand-bone Y-stick as blade collider  
- ❌ Second tip measure that ignores `weaponVolume` after rebuild  
- ❌ Whole-body GLB swap for weapon change (mesh_ids / attach only)  

## Related

- Open `/space` `fitCollidersToMeshes` — same “parent to weapon mesh” rule  
- `WeaponMeshAttach.placeMuzzleMarker` — tip heuristic for catalog guns  
- `docs/CASTING_LAB_SSOT.md` · melee residual  
