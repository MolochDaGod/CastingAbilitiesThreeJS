# Elemental skills × linear spell casting (learned SSOT)

**Lab:** casting.grudge-studio.com / CastingAbilitiesThreeJS  
**Code:** `src/combat/elementalLinearCast.js` · `DrcCombatController` · `LinearSkillBridge`  
**Upstream learn:** LinearAbilityCastingThreeJS → `docs/LINEAR_SKILLSHOT_SSOT.md`

This is the **merge complete** map: elemental staff skills and linear skillshot systems are one planned cast, not two silos.

---

## What we took in (elemental skills)

| Layer | SSOT | Role |
|-------|------|------|
| Product elements | `CASTING_ELEMENT_PHASE_VFX` | fire · storm · ice · nature · holy · arcane |
| Catalog binds | `staffWeaponSkillsBind` | pathMode + VFX from WEAPON_SKILLS |
| Staff normal | slot 1 + focus LMB | shared stream normal |
| Orbs / charge | `staffOrbVfx` | gd_orbs + kamehameha charge |
| Freeze / rocks / bubbles / arrows | `elementAttackVfx` | mesh delivery kinds |
| Path place | `staffCast` + AbilityManager | aoe · spikes · wall · stream strokes |
| Presentation | `elementPresentation` | volley · meteor · flood · lightning · … |

---

## What we learned (linear spell casting)

| Practice | Where |
|----------|--------|
| Settings SSOT sampled every frame | `skillshot/linearSettings.js` |
| Pooled abilities, no alloc on cast | `skillshot/abilities/*` |
| Phase machine travel → impact → fade | `Ability.js` |
| Constant m/s line front | base Ability |
| MOBA line / zone aim | `AimController` · Alt+Shift arm |
| **Combat castToward** (no re-arm) | DRC skill release via plan |
| Procedural geo + GLSL | materials + ProceduralGeometry |
| Ground marks + fissures | DecalType + FissureSystem |
| Intensity live mid-cast | `applyIntensity` ← focus mul |
| Variants size/speed/angle | `effectVariants` → linear block |

---

## Element → linear map

| Element | Linear id | Shape |
|---------|-----------|-------|
| ice | ice | LINE |
| storm | thunder | LINE |
| fire | meteor | LINE |
| holy | beam | LINE |
| arcane | snare | ZONE |
| nature | glacier | ZONE |

---

## Cast layers (one plan per skill release)

`planElementalLinearCast(skill, ctx)` → ordered layers:

| Layer | System |
|-------|--------|
| `linear_line` / `linear_zone` | `LinearSkillBridge.castToward` |
| `path_ability` | Fire/Water/Earth/Wind Ability curve |
| `mesh_projectile` | orbs / summons |
| `freeze_nova` | expanding freeze AOE |
| `earth_rocks` | pull from below + linear/aimed |
| `water_bubbles` | procedural water |
| `arrow_path` / `arrow_loft` | dual arrow end-event systems |
| `buff` | focus / ward only |

### When linear fires

- Combat / focus digit skills with **stream** or **primary**  
- Zone elements when pathMode **aoe** / nova text  
- **Not** when path stroke is actively drawn (path Ability owns that)  
- **Not** for pure freeze_nova / arrow-only plans (mesh first)

### When path Ability still fires

- wall / spikes / aoe presentation  
- alongside linear for continuity (element volley/flood beauty)

### When mesh fires

- staff normal orbs  
- nature rocks  
- ice bubbles  
- freeze / arrows as kind-specific

---

## Input map (product)

| Input | System |
|-------|--------|
| **1–4** / **F** / focus **LMB** (staff) | Plan → linear + mesh + path Ability |
| **LMB draw** (path cast) | Path Ability + mesh (no linear arm) |
| **Alt+Shift+Q/E/R/F/V/G** | Arm MOBA linear only (learn / sandbox) |
| **Esc** | Cancel linear arm |

---

## Code flow

```
useSkill → cast bar → releaseSpell
  → planElementalLinearCast(skill, { focusCombat, intensity })
  → fireLinearFromPlan(linearSkills, plan, pose)   // if useLinear
  → _deploySkillDelivery(skill, pose)              // freeze/rocks/orbs/arrows
  → abilities.cast(curve, element)                 // if usePathAbility
  → deployPresentation(element, …)
```

---

## Agent rules

1. Extend `elementalLinearCast` + existing bridges — **no third combat tree**  
2. Catalog skill ids stay WEAPON_SKILLS / t0 only  
3. SI metres; one mixer; shared particles/decals/post  
4. Linear knobs stay in `linearSettings` (sample, never copy at spawn)  
5. Smoke: equip staff · Q combat · RMB focus · LMB / 1 → toast shows `lin:ice` etc.

---

## Checklist

```
[x] Elemental skills bound (staff + phase VFX + orbs/rocks/freeze/arrows)
[x] Linear practices ported (skillshot/*)
[x] PRODUCT_TO_LINEAR element map
[x] planElementalLinearCast merge
[x] DRC release → castToward
[x] App wires linearSkills into DrcCombatController
[ ] Live smoke on casting host after deploy
```
