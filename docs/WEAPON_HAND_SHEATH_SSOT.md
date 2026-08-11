# Weapon hand bones · hold pose · sheath / unsheath (Casting lab)

**Live:** https://casting.grudge.studio  
**Code:** `WeaponMeshAttach` · `weaponHoldPose` · `WeaponSheathRuntime` · `CharacterController`

## Hand-bone best practices

| Rule | Detail |
|------|--------|
| Prefer kit containers | `R_hand_container` / `L_hand_container` (Toon RTS) over raw finger bones |
| Fallback bones | `Bip001 R Hand` · `mixamorig:RightHand` (same order as hold-pose SSOT) |
| One attach group | `WeaponAttach` under hand — never merge into skinned mesh |
| SI scale first | Normalize longest axis to profile max length, then soft-cap width |
| Grip orientation | Mesh long axis → local +Y; pitch ≈ −90° for melee/pistol (bow −75°) |
| Muzzle / tip | Marker on attach after parent (world-farthest from grip) |
| Post-mixer residual | `applyWeaponHoldPose` **after** `mixer.update` — never bake into clip |
| Hold only when drawn | Skip residual while sheathed (stow owns local TRS) |

### Stack (do not fork)

```
1. attachWeaponModel(handBone, url, { profile })   // equip
2. static mesh appearance (optional lab tint/scale)
3. AnimationMixer.update(dt)                         // locomotion / combat
4. WeaponSheathRuntime.update(policy)                // hand ↔ hip/back
5. applyWeaponHoldPose(mixer, gait, kind)            // drawn only
6. optional HandIK / RideIK / pistol reload overlay
```

## Auto sheath / unsheath policy

| Event | Action | Reason |
|-------|--------|--------|
| Walk / run / sprint gait | **Sheath** | Traversal — free arms, no blade in face |
| Jump / fall / dodge / roll / slide | **Sheath** | Air + mobility |
| Mount / freeride / ride parented | **Sheath** | Hands for boom/rail IK; no weapon on deck |
| Idle (gait 0) | **Unsheath** | Combat ready |
| Attack / cast / charge / parry / reload | **Unsheath** | Combat needs hand mesh |
| Equip weapon | **Unsheath** | Fresh attach on hand |
| Dismount | **Unsheath** | Land combat ready |

Policy knobs: `WEAPON_SHEATH_POLICY` in `WeaponSheathRuntime.js`  
(`sheathOnWalk`, `sheathOnRun`, `sheathOnSprint`, `sheathOnMount`, `sheathOnAir`, `sheathOnMobility`, debounce).

Combat always wins over gait (attack while walking keeps weapon drawn for the one-shot window).

## Stow sockets

| Profile | Parent | Pose |
|---------|--------|------|
| sword / melee / dagger | `Bip001 Pelvis` (hip) | blade along hip |
| staff | spine / quiver family | diagonal back |
| bow | spine / quiver family | flat on back |
| pistol | pelvis | hip holster |
| shield | **none** | stays on arm |

Back bone resolution shares `findBackBone()` with windsurf stow (quiver-family).

## API

```js
character.isWeaponDrawn
character.setWeaponSheathed(true|false|null)  // null = policy
character.weaponSheath.sheath('manual')
character.weaponSheath.unsheath('manual')
```

## Related

- `docs/WINDSURF_RIDE_SSOT.md` — mount parent + RideIK (hands on sockets)
- `docs/PISTOL_ANIM_SSOT.md` — draw / fire / reload (always drawn path)
- ObjectStore `grudge6-weapon-hold-pose.js` — residual tables (keep in sync)
