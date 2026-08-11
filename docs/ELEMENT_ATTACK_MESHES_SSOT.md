# Element attack meshes · freeze · rocks · arrows

**Lab:** CastingAbilitiesThreeJS  
**Code:** `src/vfx/elementAttackVfx.js` · `SkillProjectileSystem` · `skillDelivery` · `DrcCombatController`  
**Split:** `node scripts/split-element-attack-meshes.mjs`

Does **not** invent catalog skill rows. Delivery inferred from existing staff/catalog skills.

---

## Assets

| Source | Product | Use |
|--------|---------|-----|
| `bubbles_2.glb` | **Procedural** SI spheres (not whole 37MB morph pack) | Water travel · freeze ring animation |
| `assorted_rock_pack.glb` | `models/vfx/rocks/rock-0..7.glb` (~0.55 m) | Earth: emerge underfoot → linear / aimed |
| `kamehameha_charging.glb` | `models/vfx/charge/staff-charge.glb` | Earth emerge tell + staff charge |
| `teleport_arrow.glb` | `models/vfx/arrows/arrow-path.glb` | Linear attack path |
| `arrow_curved.glb` | `models/vfx/arrows/arrow-loft.glb` | Lofted throw / place / trap / summon |

**Never** load multipack sources whole as one projectile.

---

## Freeze AOE

| | |
|--|--|
| Trigger | Ice nova / absolute zero / freeze / frost AoE catalog · `around_caster` ice |
| Spawn | Caster feet |
| Motion | Expanding bubble ring all directions |
| On catch | `freeze: true` · `frozenUntil` on hostile mesh · frost VFX |
| Defaults | radius ~5.5 m · expand 0.45 s · freeze 2.5 s |

API: `projectiles.spawnFreezeNova({ origin, radiusM, targets })`

---

## Earth rocks

| | |
|--|--|
| Trigger | Nature/earth stream · spikes · quake · practice root · vine lash |
| Spawn | **Below terrain** beside caster (+ charge emerge tell) |
| Path | **linear** (primary/stream) or **aimed** (soft-lock / aim) |
| Count | 1 normal · 3 spikes · 4 multi/quake |
| Mesh | Random `rock-0..7` (individual) |

API: `projectiles.spawnEarthRocks({ casterPos, target, aimMode, rockCount })`

---

## Water bubbles

| | |
|--|--|
| Trigger | Water/ice stream (non-nova) |
| Mesh | Procedural spheres + `MeshPhysicalMaterial` (transmission) |
| Source note | `bubbles_2.glb` morph multipack deferred — do not ship 37MB per cast |

API: `projectiles.spawnBubbleStream({ origin, target, count })`

---

## Two arrow systems

| System | Mesh | Loft | Role |
|--------|------|------|------|
| **path** | `arrow-path` (teleport_arrow) | 0 | Linear attack path; **distance** sets end event location |
| **loft** | `arrow-loft` (arrow_curved) | ~0.42 | Throw · place device · trap · summon |

### Path end events (distance → where)

`impact` · `explode` · `aoe` · `blink` · `return`

- Size can scale slightly with distance on path system.
- **blink** moves lab character to end point (teleport arrow learning).

### Loft end events

`throw` · `place_device` · `trap` · `summon`

API: `projectiles.spawnArrow({ system: 'path'|'loft', endEvent, distanceM, origin, target })`

Infer from catalog text (`blink`, `trap`, `summon arrow`, …) via `inferElementAttackKind`.

---

## Checklist

```
[ ] No whole assorted_rock_pack / bubbles_2 / fireball as projectile
[ ] rock-0..7 + arrow-path/loft under public/models/vfx
[ ] Freeze marks hostiles frozenUntil
[ ] Earth rocks emerge from y < 0 then fly
[ ] Arrow path distance drives end event
[ ] SI scales (rocks ~0.55 m, arrows ~1 m)
```
