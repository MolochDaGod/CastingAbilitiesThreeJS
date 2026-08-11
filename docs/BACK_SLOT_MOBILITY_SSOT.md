# Back-slot mobility SSOT

**Code:** `src/config/backSlotMobilitySsot.js` · `BackSlotEquip.js` · `WalkController` · `HoverboardRide`  
**Live:** casting.grudge.studio / casting-abilities-threejs.vercel.app

---

## Domains (hard)

| Domain | Item | Deploy on land? | Deploy on water? | Air? |
|--------|------|-----------------|------------------|------|
| **water** | Windsurf | **No** | **Yes** (vehicle) | No |
| **water** | **Shark Fin** | Equip yes | **Passive always-on** | No |
| **land** | Cape · shell · pack | Cosmetic / passive | No vehicle | No |
| **air** | Holy / Traveler wings | Equip yes | Equip yes | **Flight deploy** |

**Windsurf is a water mobility tool only.** Dry island pad → deploy rejected.

### Shark Fin (passive water)

| Buff | Value |
|------|--------|
| Swim on + under water | **×2** (100% faster) |
| Shark aggro | **Immune** (`sharkAggroImmune`) |
| Underwater breath | **Yes** (no oxygen drain / drown) |

Equip: `character.equipBackSlot('shark_fin')` · mesh `public/models/ride/shark_fin.glb`  
Source: `D:\Games\Models\Shark fin by Poly by Google - 1L9OjE5KOlC.glb`  
Code: `waterBuffs` on catalog · applied in `DrcCombatController` loco + breath tick.

---

## Windsurf parts (when deployed)

Author GLB (`windsurf_package.glb`) is a **single Sketchfab mesh** (`Tube003` / `OBJ_Para_Coat`) — no named board/sail nodes.  
Parts are **logical SI sockets** from `ride.manifest.json`:

| Part | Sockets | Color (debug) | Role |
|------|---------|---------------|------|
| **Board / deck** | `deckCenter`, `footL`, `footR`, `mastBase` | blue | Feet IK · seat |
| **Front / bow** | `bowTip` | green | Travel +Z nose |
| **Sail / boom** | `sailPeak`, `sailRail`, `sailBoomL/R`, `mastBase` | amber | Hands IK · SailCloth |
| **Engine / stern** | `engineMount` | red | Aft (−Z) thrust mount |

**Back stow** uses `back_fly_windsurf.glb` (same Para mesh, quiver scale) — not the full vehicle.

### Debug

```js
settings.walk.debugSockets = true  // or debugParts
// colored spheres on sockets after deploy
```

API: `scooter.describeParts()` · `scooter.getPartWorldPosition('sail')`

---

## Wings prefabs (next system)

| Id | Label | Jump model (WoW DF-like) |
|----|-------|---------------------------|
| `holy_wings` | Holy Wings | **Jump up → glide** (no multi-flap) |
| `traveler_wings` | Traveler's Wings | **Double jump → fly pose · 2 flaps · glide** |

### Traveler state machine

```
idle ── air Space (2nd jump) ──► fly (flapsLeft=2)
fly ── Space flap ──► fly (flapsLeft−1)  or  glide if 0
fly/glide ── land ──► idle
```

### Asset drop (not found yet on disk/CDN)

```
public/models/ride/wings/holy_wings_stow.glb
public/models/ride/wings/holy_wings_open.glb
public/models/ride/wings/traveler_wings_stow.glb
public/models/ride/wings/traveler_wings_open.glb
public/anims/baked/wings/holy-*.json
public/anims/baked/wings/traveler-*.json
```

Icons exist under GrudgeBuilder `icons/armor/wings/wing_*.png` (2D only).  
**Animated wing meshes not located** in lab public or assets CDN at time of write — drop GLBs into paths above and equip via `equipBackSlot('holy_wings')`.

---

## Equip API

```js
character.equipBackSlot('windsurf')
character.equipBackSlot('holy_wings')
character.equipBackSlot('traveler_wings')
character.equipBackSlot('none')
```

Deploy windsurf: walk mode · wet surface · Space (freeride gate).  
Wings flight runtime: scaffold in SSOT; host loop next (Space flaps + fall glide).
