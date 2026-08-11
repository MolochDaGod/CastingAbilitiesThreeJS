# Skill delivery · projectiles · physics (Casting lab)

**Code:** `src/combat/skillDelivery.js` · `SkillProjectileSystem.js` · `hitReaction.js` · `DrcCombatController`  
**Catalog skills:** `docs/WEAPON_SKILLS_API_SSOT.md` (never invent skill rows)  
**Meshes:** `public/models/vfx/summons/summon-fire-fist.glb` · `summon-ice-shard.glb`  
**Hit anim:** `public/anims/baked/reactions/knocked-up.json`

---

## Rule: catalog first, delivery second

| Layer | Source | Invent? |
|-------|--------|---------|
| Skill id / dmg / CD / cast / effects | `t0-weapons` · `master-weaponSkills` | **No** |
| Delivery pattern | Inferred from catalog text + style + pathMode | Heuristic only |
| Projectile mesh | Element → orbs / rocks / arrows / summons (not whole multipack) | Extract only |
| Freeze / earth / arrows | `elementAttackVfx.js` · see `ELEMENT_ATTACK_MESHES_SSOT.md` | Heuristic only |
| Contact force / knockback | SI profile by pattern | Tunable knobs |
| Hit reaction | `knocked-up` bake + MM impulse | Clip from author FBX |

---

## Delivery patterns

| Pattern | Spawn | Travel | Result |
|---------|-------|--------|--------|
| **weapon** | Weapon tip | Short residual path | Melee residual / Getsuga |
| **caster_to_target** | Cast origin (hand) | Projectile to aim / soft-lock | Impact + force |
| **over_target** | Sky above aim/target | Drop with gravity | Explosion + knockup |
| **under_target** | Ground under aim | Erupt up | Knockup heavy |
| **around_caster** | Caster feet | Pulse ring | AoE force |
| **around_target** | Target feet | Pulse ring | AoE force |
| **at_location** | Ground aim | Pulse | Zone |
| **toggle_aura** | Caster | No travel | Buff/ward on/off |
| **path_stream / aoe / spikes / wall** | Path stroke | Ability path | Existing path cast |

Infer: `inferDeliveryPattern(skill)` · resolve: `resolveDeliveryPose(pattern, pose)`.

---

## Projectiles (clear rules)

1. **Mesh** — SI-scaled extract only (`summon-fire-fist` / `summon-ice-shard`). Never load `fire__ice_____rtj4d.glb` whole.  
2. **Motion** — kinematic velocity + optional gravity (over_target).  
3. **Collider** — contact **sphere** radius ≈ `0.55 × size` (m). Distance vs targets.  
4. **On contact** — explode VFX · `onHit` → knockback MM + optional `vy` · hit reaction anim.  
5. **Force** — `force` (impulse scale) + `knockbackMm` (100 MM = 1 m body slide) + `knockupVy` (m/s).  
6. **Life** — despawn after `life` s or first hit.  
7. **Targets** — soft-lock hostile + aim point (lab).  

Physics: **one Rapier CCT** for hero. Projectiles are **not** a second full physics engine; they use spheres + impulse into existing CCT dodge channel.

---

## Holy

- School still catalog `staff_holy_*` / holy element.  
- Delivery often **over_target** (smite / light) or **caster_to_target**.  
- Mesh: fire-fist tinted gold/emissive until dedicated holy mesh ships.  
- VFX: `moon_beam` cast/travel/impact from staff school bind.

---

## Assets provenance

| Asset | Role |
|-------|------|
| `Documents/fire__ice_____rtj4d.glb` | Author multipack (Fist_Rock / Gun_Rock) — **source only** |
| `summon-fire-fist.glb` | Fire / holy projectile (~0.55 m) |
| `summon-ice-shard.glb` | Ice / frost projectile (~0.5 m) |
| `Documents/knocked up.fbx` | Mixamo hit launch — baked `reactions/knocked-up.json` |

---

## Agent checklist

```
[ ] Skill numbers from catalog only
[ ] Delivery pattern documented / inferred, not a second skill DB
[ ] No whole multipack load for projectiles
[ ] SI scale on summons
[ ] Contact sphere + knockback MM + hitReact clip
[ ] One Rapier world / one hero mixer
```
