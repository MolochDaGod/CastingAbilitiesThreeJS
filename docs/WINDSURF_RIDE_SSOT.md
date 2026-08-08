# Windsurf ride SSOT — Casting lab

**Asset:** `public/models/ride/windsurf_package.glb` + `ride.manifest.json`  
**Code:** `WalkController` · `HoverboardRide` · `RideIK`  
**Feel ref:** [Robpayot/tslda](https://github.com/Robpayot/tslda) (Wind Waker boat / sail)  
**Back slot:** `settings.walk.backSlot = 'windsurf'` — deployable utility, not a second vehicle engine

---

## Product intent

Treat the board as a **tiny boat**:

| Socket | Role |
|--------|------|
| `footL` / `footR` | Feet planted on deck |
| `sailRail` / `sailBoomL/R` | Hands on sail bar (boom) |
| `deckCenter` | Seat parent (character reparented) |
| `mastBase` / sail mesh | Sail deploys from **back** mid-frontflip |

**Body:** Bip001 stays **rigged** (one mixer). **Ragdoll-lite** = RideIK + soft hip/wave lean (not a second physics body). Full Rapier ragdoll is out of scope for lab.

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
| **freeride** | After path (optional) or Space deploy: WASD boat (tslda), Space hop, soft wave body. |
| **dismount** | IK blends off, board fades, step to floor → **idle**. |

### Apply order (hard)

```
walk.update → character.update (mixer) → walk.applyRiderIk
```

Sockets (manifest SI): `footL`/`footR` deck straps · `sailRail`/`sailBoom*` boom grips · `deckCenter` seat.

Wind cushion: AirScooter-style streamlines may sit under deck (visual); seat is always deck.

## Deploy sequence

1. **Space** in Walk/Surf mode (or path start) → **frontflip** (`playFrontflip`)
2. Mid-flip (`sailDeployAt`) → board/sail **spawns from back** (`HoverboardRide.spawn`)
3. Land on deck → reparent to seat · RideIK feet + hands
4. **Path ride** if curve drawn, else **freeride** WASD

---

## Controls (freeride)

| Input | Action |
|-------|--------|
| **WASD** | Boat thrust / turn (tslda-like) |
| **Space** | Wave hop |
| **1–4 / F** | Skills if staff or bow equipped (`skillsWhileRide`) |
| **M** | Toggle mode off to cancel |
| **Draw path** | Path-follow course; end → freeride if `freerideAfterPath` |

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
