# Weapon skill production — scriptable pattern (SSOT)

**Goal:** Every weapon skill is production-ready: **anim · effects · physics · statuses · damage · delivery**, with a **repeatable scriptable** author path for individual skills.

**Lab:** CastingAbilitiesThreeJS  
**Catalog (never invent skill rows):** [WEAPON_SKILLS](https://info.grudge-studio.com/WEAPON_SKILLS.html) · `master-weaponSkills.json` · `t0-weapons.json`  
**Fleet shape:** `gameopen/lib/epicfight/.../weaponSkill.ts` `FleetWeaponSkill`  
**Code:** `src/combat/weaponSkillProduction.js` · `skillStatusSystem.js` · `skillDelivery.js` · `elementalLinearCast.js`

---

## Non-negotiables

| Rule | Detail |
|------|--------|
| Catalog first | Skill **id / dmg / CD / cast / range / effects** from ObjectStore only |
| One mixer | Character anim packs only — no second AnimationMixer for skills |
| SI physics | metres, knockback **MM** (100 MM = 1 m), force impulse scale |
| No multipack projectiles | Split orbs/rocks/arrows — never whole fireball / gd_orbs / rock pack |
| Extend, don’t fork | Compile into DRC + FleetWeaponSkill shape — no parallel combat tree |

---

## Production package (every skill)

`compileProductionWeaponSkill(catalogRow, weaponCtx)` →:

| Layer | Fields | Source |
|-------|--------|--------|
| **Identity** | id, label, weaponTypeId, slot, slotType | catalog |
| **Economy** | damage, cooldown, castDuration, mana, stamina | catalog |
| **Anim** | pack, role, clip, hitFrameDelay, comboStages | pack map + override |
| **VFX** | cast / travel / impact effectIds, mesh, charge | staff bind + catalog prefab |
| **Delivery** | path_stream / caster_to_target / around_caster / weapon / … | skillDelivery infer |
| **Linear** | castPlan (ice/thunder/meteor/…) | elementalLinearCast |
| **Mesh kind** | freeze_nova / earth_rocks / orbs / arrows | elementAttackVfx |
| **Physics** | force, knockbackMm, knockupVy, contactRadius, aoe, speed, collider | defaults by style + override |
| **Statuses** | freeze, stun, slow, burn, root, push, knockup, silence, ward, focus | parse `effects[]` + override |

### Status IDs (runtime)

| Status | Effect |
|--------|--------|
| **push** | Knockback MM + optional hit react |
| **freeze** | Move lock + cyan emissive · `frozenUntil` |
| **stun** | Move lock · yellow flash |
| **slow** | moveMul &lt; 1 |
| **root** | Move lock (nature) |
| **burn** | DoT magnitude (HP host later) |
| **knockup** | vy kick |
| **silence** | Cast lock flag |
| **shield_break** | Flag for guard systems |
| **focus_buff** / **ward** | Self buffs |

Runtime: `SkillStatusSystem.applyHit` on projectile / residual contact.

---

## Author loop (individual skill)

```
1. Catalog id exists on WEAPON_SKILLS / t0  (never invent)
2. node scripts/scaffold-weapon-skill.mjs --id <catalog_id> --weapon STAFF
3. Edit skills/production/<id>.json  (overrides only)
4. compileProductionWeaponSkill(row, { overrides: json })
5. assessProductionReadiness → green
6. Smoke casting lab: equip · Q · 1–4 / F / focus LMB
7. Promote prefab.vfxRef / animation via ObjectStore when ready
```

### Scaffold

```bash
node scripts/scaffold-weapon-skill.mjs --id staff_fire_bolt --weapon STAFF
node scripts/scaffold-weapon-skill.mjs --id t0_sword_practice_slash --weapon SWORD
node scripts/scaffold-weapon-skill.mjs --list-ready
```

### Override JSON (optional fields only)

```json
{
  "id": "staff_fire_bolt",
  "animRole": "cast",
  "animClip": "magic/standing 1h cast spell 01",
  "hitFrameDelay": 0.35,
  "castEffectId": "fire_hand",
  "travelEffectId": "fireball",
  "impactEffectId": "inferno",
  "projectileMeshUrl": "./models/vfx/orbs/orb-fire.glb",
  "force": 9,
  "knockbackMm": 200,
  "aoeM": 1.2,
  "statuses": [
    { "id": "burn", "durationSec": 3, "magnitude": 4 },
    { "id": "push", "durationSec": 0.35, "magnitude": 180 }
  ]
}
```

---

## Runtime path (all weapons)

```
Equip weapon (t0 / prefab)
  → skillDefToDrc = productionToDrcSkill(compileProductionWeaponSkill(…))
  → DRC hotbar 1–4 / F / focus LMB
  → useSkill
      → cast bar + anim role (pack)
      → planElementalLinearCast → linear skillshot when stream/primary
      → _deploySkillDelivery → orbs / rocks / freeze / arrows / residual
      → path Ability presentation
      → on hit → statuses.applyHit (dmg + push + freeze + stun + …)
```

---

## Readiness scores

`assessProductionReadiness(prod)`:

| Score | Meaning |
|-------|---------|
| **green** | id, dmg, cd, anim, resources; no critical gaps |
| **yellow** | ok but warnings (no VFX, no statuses, buff-only) |
| **red** | missing id/label/cooldown/damage/anim |

Layers reported: anim · vfx · physics · statuses · delivery · linear · meshKind.

---

## Weapon families (same pattern)

| Family | Pack | Style | Default delivery |
|--------|------|-------|------------------|
| Sword / axe / hammer / spear | sword_shield | melee | weapon residual |
| Bow / crossbow | longbow | ranged | caster_to_target |
| Pistol | pistol | ranged | caster_to_target |
| Staff / wand / tome | magic | spell | stream + orbs / linear |

Staff schools fill VFX via `staffWeaponSkillsBind`. Melee uses residual Getsuga profiles. All share **status + physics** package.

---

## Perfect one skill (checklist)

```
[ ] Catalog id verified on WEAPON_SKILLS.html
[ ] anim pack + role + optional clip path
[ ] hitFrameDelay feels right on cast
[ ] cast / travel / impact effect ids fire
[ ] projectile mesh SI (if any)
[ ] force / knockbackMm / aoe SI tuned
[ ] effects[] → statuses correct (freeze/stun/push/…)
[ ] assessProductionReadiness green
[ ] Smoke: casting lab host with that weapon equipped
[ ] Prefab fields promoted to ObjectStore when shipping fleet
```

---

## Code map

| File | Role |
|------|------|
| `weaponSkillProduction.js` | compile · readiness · DRC flatten |
| `skillStatusSystem.js` | parse effects · apply statuses |
| `skillDelivery.js` | delivery patterns |
| `elementalLinearCast.js` | linear LINE/ZONE merge |
| `staffWeaponSkillsBind.js` | staff VFX from catalog |
| `t0WeaponCatalog.skillDefToDrc` | equip → production package |
| `DrcCombatController` | cast + hit → statuses |
| `scripts/scaffold-weapon-skill.mjs` | override scaffold |
| `skills/production/*.json` | per-skill overrides |

---

## Fleet handoff

Production package maps to `FleetWeaponSkill`:

| Production | FleetWeaponSkill |
|------------|------------------|
| anim.clip / role | animClip / animRole |
| physics.collider | collider |
| vfx.cast/impact | castEffectId / impactEffectId |
| physics + projectile mesh | projectile |
| cooldown / castDuration / stamina | same |
| damage / force | same |
| statuses | tags[] + host status layer |

Open / Warlords hosts implement HP from `damage` and respect `frozenUntil` / `stunnedUntil` on units.
