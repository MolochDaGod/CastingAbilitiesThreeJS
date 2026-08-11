# Staff normal attack · orbs · charge SSOT

**Lab:** casting.grudge-studio.com / CastingAbilitiesThreeJS  
**Skills:** `grudge-vfx-orbs-strike` · `casting-warlords-lab`

## Contract

| Input | Behavior |
|-------|----------|
| **Hotbar 1** | Staff **normal attack** (primary / slot index 0) for **all** weapon staffs |
| **Focus + LMB** | Fires that same slot-1 normal (not melee residual) |
| **Digit 1** | Same as hotbar 1 |
| **F** | Weapon primary (same skill when equipped staff/wand) |

Catalog skill **ids** stay per-weapon (Practice Bolt, Practice Root, Fire Bolt, …).  
**Delivery** is shared: charge shell → elemental orb stream → impact.

## Assets (split — never multipack as projectile)

| Role | Path | Source |
|------|------|--------|
| Fire orb | `public/models/vfx/orbs/orb-fire.glb` | `gd_orbs_pack.glb` Sphere_0 + Torus_1 |
| Ice | `…/orb-ice.glb` | Sphere.001 + Torus.001 |
| Nature | `…/orb-nature.glb` | Sphere.002 + Torus.002 |
| Storm | `…/orb-storm.glb` | Sphere.003 + Torus.003 |
| Holy | `…/orb-holy.glb` | Sphere.004 + Torus.004 |
| Arcane | `…/orb-arcane.glb` | Sphere.005 + Torus.005 |
| Charge shell | `public/models/vfx/charge/staff-charge.glb` | `kamehameha_charging.glb` (SI ~0.35 m) |

**Regen:** `node scripts/split-gd-orbs-and-charge.mjs`  
Author materials are black — split bake + runtime `applyElementalOrbMaterials` apply element colors/emissive.

**Do not** load `gd_orbs_pack_src.glb` or whole fireball.glb as a staff bolt.

## Code map

| Piece | File |
|-------|------|
| Orb / charge SSOT | `src/vfx/staffOrbVfx.js` |
| Element → mesh | `CASTING_ELEMENT_PHASE_VFX` · `projectileMesh` / `projectileOrb` |
| Staff bind | `src/combat/staffWeaponSkillsBind.js` |
| Delivery mesh pick | `src/combat/skillDelivery.js` `resolveSkillProjectileMesh` |
| Projectile + charge | `src/combat/SkillProjectileSystem.js` |
| Cast charge + LMB | `DrcCombatController` · `App._onLmbAttack` |
| Prefab mesh ids | `src/vfx/effectPrefab.js` |

## Per-staff management

Each staff attack owns:

1. **Element** (school from catalog) → orb id  
2. **Materials** tint/emissive on clone  
3. **Charge** at tip during cast bar (additive pulse)  
4. **Travel** mesh projectile with contact sphere  
5. **Impact** existing VfxDirector effect ids  

Signatures / AoE / wards keep pathMode presentation (wall/aoe/spikes) — only **stream primary** is the shared normal.

## Smoke

1. Equip Apprentice Wand or Sapling Staff (I → Weapon)  
2. Combat **Q** · **RMB focus**  
3. **LMB** → cast charge at tip → colored orb flies to aim  
4. **1** same as LMB for staff  
5. Switch fire/ice/nature staffs → different orb colors  

## Checklist

```
[ ] No whole gd_orbs_pack / fireball as projectile
[ ] Orbs under models/vfx/orbs/orb-*.glb
[ ] Charge under models/vfx/charge/staff-charge.glb
[ ] Focus LMB = useSkill(0) for staff/wand
[ ] Slot 1 primary uses orb + charge
[ ] SI orb ~0.45 m · charge ~0.35 m
```
