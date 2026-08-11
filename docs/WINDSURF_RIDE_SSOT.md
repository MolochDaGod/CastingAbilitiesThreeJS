# Windsurf ride SSOT — Casting lab

**Asset (ride):** `public/models/ride/windsurf_package.glb` + `ride.manifest.json`  
**Asset (back stow):** `public/models/ride/back_fly_windsurf.glb` — quiver-scale spine attach  
**Code:** `WalkController` · `HoverboardRide` · `RideIK` · `BackSlotEquip` · `SailCloth`  
**Feel ref:** [Robpayot/tslda](https://github.com/Robpayot/tslda) (Wind Waker boat / sail)  
**Back slot:** `settings.walk.backSlot = 'windsurf'` — deployable utility, not a second vehicle engine

---

## Product intent

**Windsurf is a vehicle when deployed** (not a free-floating prop).  
**Domain: water only** — not a land mobility tool. Dry island → deploy rejected.

| State | Rule |
|-------|------|
| **Deploy** | Space (walk mode) **on wet shore/ocean** → frontflip · board from back · vehicle |
| **Blocked** | Dry land (`isDryLand`) → toast “water-only” |
| **Mounted** | Character **parented under** `deckCenter` · **RideIK** feet→deck, hands→boom · stay until get-off |
| **Get off** | **E** (or mode leave / cancel) → unparent · **board removed** from scene · land character controller |
| **Land** | `_rideActive` / `_rideParented` false · gait free · Rapier feet at land pose |

### Parts (deployed) — logical sockets

Mesh is one Sketchfab Tube / Para_Coat — identify by sockets:

| Part | Socket(s) | Debug color |
|------|-----------|-------------|
| **Board** | deckCenter, footL/R, mastBase | blue |
| **Front** | bowTip | green |
| **Sail** | sailPeak, sailRail, sailBoomL/R | amber |
| **Engine** | engineMount (stern −Z) | red |

`settings.walk.debugParts = true` · `scooter.describeParts()`

Treat the board as a **tiny boat**:

| Socket | Role |
|--------|------|
| `footL` / `footR` | Feet planted on deck (IK) |
| `sailRail` / `sailBoomL/R` | Hands on sail bar (boom IK) |
| `deckCenter` | **Vehicle seat** — character reparented until dismount |
| `mastBase` / sail mesh | Sail deploys from **back** mid-frontflip |

**Body:** Bip001 stays **rigged** (one mixer). **Ragdoll-lite** = RideIK + soft hip/wave lean (not a second physics body). Full Rapier ragdoll is out of scope for lab.

**Back slot:** same inventory family as glider/parachute (`settings.walk.backSlot = 'windsurf'`) — deployable utility vehicle.

---

## Stroke semantics

`settings.mode` decides what a finished PathDrawer stroke means:

| mode | Receiver |
|------|----------|
| `casting` | `AbilityManager` (staff element path) |
| `walk` | `WalkController` four-phase sequence over the same curve |

### Four-phase sequence

| Phase | What happens |
|-------|----------------|
| **leap** | Parabolic / frontflip arc to path head. At `walk.tuck` IK weight ramps so hands/feet seek board sockets before landing. Sail deploys mid-flip (`sailDeployAt`). |
| **ride** | Board + mast + boom + sail live. Rider on deck; path follow by arc length; bank with lean. |
| **freeride** | WASD boat: **W thrust**, release W = **water coast** (low drag), A/D turn, **Space hop**, soft wave body. |
| **ranged freeride** | Staff/bow/wand: **non-focus** LMB path cast (unlocked cursor) on board. |
| **dismount** | **E** · IK off · board removed · land loco. |

### Apply order (hard)

```
walk.update → character.update (mixer) → walk.applyRiderIk
```

### Parenting (hard)

While mounted, **windsurf vehicle owns the player transform**:

```
HoverboardRide.group     (world XZ/Y + yaw)
  ├ boardRoot            (bank / deck height / birth SCALE — visual only)
  │    ├ mesh
  │    └ socketGroup     (footL/R, sail*, deckCenter for IK targets)
  └ seatRoot  RideSeat   (bank match, scale ALWAYS 1)
       └ character.root  (local stand only — until dismount)
```

**Why seat is not under boardRoot:** birth/death sets `boardRoot.scale` from 0.01→1.
Parenting the hero under that tree multiplies SI body by scale → micro hero / “ripped off screen”.

- `forceFullSize()` before mount; `seatRoot.attach(character.root)`
- **Do not** write world XZ to `character.root.position` while `_rideParented`
- Camera / dust use `character.getWorldPosition()` / `position` getter (world)
- Dismount: `scene.attach(root)` once, then restore world feet
- **RideIK hip drop is absolute vs bind Y** — never `hips.position.y -=` each frame
  (rotation-only packs do not restore bone.position)

Sockets (manifest SI, **travel frame +Z forward**):

| Socket | Stance |
|--------|--------|
| `footL` | Port aft (staggered — no foot cross) |
| `footR` | Starboard forward |
| `sailBoomL` / `sailBoomR` | Hand grips ~1.05 m height (elbows out) |
| `sailRail` | optional primary · prefer BoomR for R hand |
| `deckCenter` | Seat / hip pad |

**Art yaw:** `artYawDeg: 0` on mesh only (travel +Z = package nose). Sockets stay travel-frame.  
**Spawn:** `HoverboardRide.spawn(pos, yaw)` sets `group.rotation.y` immediately so land is not stern-first.

### Back-slot equip (equipment pattern)

| State | Mesh | Code |
|-------|------|------|
| Land + equipped | **Shrunk** `back_fly_windsurf.glb` on **quiver bone** (Spine1 / Xtra_quiver parent) | `BackSlotEquip` |
| Stow size | **~0.58 m** longest axis (quiver-class back item, not full board) | `stowLengthM` |
| Sail look | Cloth PBR + **vertex wind** (`SailCloth`) — no Rapier soft-body | `applySailClothMaterials` |
| Deployed vehicle | Stow **hidden** · full `windsurf_package.glb` vehicle | `setBackSlotDeployed(true)` |
| Get-off | Vehicle gone · stow **shown** + cloth wind resumes | `setBackSlotDeployed(false)` |

Same attach family as `WeaponMeshAttach` (hands) — **quiver-family** back bone, SI length cap, catalog slot **Back**.  
Settings: `settings.walk.backSlot = 'windsurf'`.

### Ocean wind indications (soft ambient)

Reuses **wind attack** primitives (`WindRibbonMaterial` silk + residual motes), not a new VFX stack.

| Setting | Default | Role |
|---------|---------|------|
| `walk.oceanWindIndicators` | true | Enable ambient gusts over sea |
| `walk.oceanWindYaw` | 0.75 rad | Prevailing direction |
| `walk.oceanWindSpeed` | 4 m/s | Soft advection |
| `walk.oceanWindMoteRate` | 8 /s | Nearly invisible dust |

Opacity ~**0.07**, low glow — readable as air over water, not a cast. Code: `effects/OceanWindIndicators.js`.

### Materials / textures (practice rules)

| Rule | Value |
|------|--------|
| baseColor map | `colorSpace = SRGBColorSpace`, `flipY = false` (glTF) |
| metal/rough / normal | linear data maps, flipY false |
| Sail / cloth | `metalness ≤ 0.08`, `roughness ≥ 0.72`, **doubleSide** |
| Cloth motion | shader vertex displace along normal (UV.y stronger at top) |
| Physics | **visual only** — not a second cloth/soft-body system |
| Scale | SI from human 1.8 m; stow never leaves author cm as metres |

## Deploy sequence

1. **Space** in Walk/Surf mode (or path start) → **frontflip** (`playFrontflip`)
2. Mid-flip (`sailDeployAt`) → board/sail **spawns from back** (`HoverboardRide.spawn`)
3. Land on deck → reparent to seat · RideIK feet + hands
4. **Path ride** if curve drawn, else **freeride** WASD

---

## Controls (freeride)

| Input | Action |
|-------|--------|
| **Space** (not riding) | Deploy vehicle (frontflip + board) |
| **WASD** | Boat thrust / turn (tslda-like) while mounted |
| **Space** (mounted) | Wave hop (board stays parented) |
| **E** | **Get off** — unparent, remove windsurfer, restore land controller |
| **1–4 / F** | Skills if staff or bow equipped (`skillsWhileRide`) |
| **M** | Leave walk mode → hard cancel (board removed) |
| **Draw path** | Path-follow course; end → freeride if `freerideAfterPath` |

### Get-off contract (hard)

```
requestDismount / cancel:
  1. seat unparent → scene.attach(character.root)  [world feet kept]
  2. setRideActive(false) · RideIK weight → 0
  3. HoverboardRide.release() fade OR cancel() instant hide
  4. character.restoreFromRide({ x,y,z,yaw })  [land loco normal]
  5. physics.setPlayerFeet(land)
  6. phase = idle · vehicle not in scene
```

---

## Soft ocean body

- `StageWater.sampleHeight(x, z, t)` — CPU wave sample
- Board Y follows water + Space jump ballistic
- Soft hip drop + lean from turn rate + wave slope

---

## Extend pattern

```
1. Sockets only in ride.manifest.json (no hardcode positions in IK)
2. Freeride physics knobs in settings.walk.freeride*
3. Keep one mixer + RideIK post-mixer only
4. Skills while ride: DrcCombatController._allowRideSkill (pack gate)
5. Do not invent a second boat controller package
```

---

## Related

- `docs/CASTING_LAB_SSOT.md`
- `docs/ANIM_LIBRARY_SSOT.md` (jump / flip channels)
- Animator ride / tslda boat velocity model
