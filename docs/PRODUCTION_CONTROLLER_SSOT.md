# Production controller SSOT — Warlords era (Casting lab)

**Live:** https://casting-abilities-threejs.vercel.app/  
**Repo:** CastingAbilitiesThreeJS — proof before grudgewarlords.com / Open

This document is the **agent learning map** for character, weapons, skills, anim, physics, windsurf, and creating new elemental skills.

---

## Stack layers (do not invent parallels)

| Layer | SSOT | Notes |
|-------|------|--------|
| **Session** | `SessionState.js` | mode · combat/equip · ride phase · gates |
| **Tweaks** | `settings.js` | numbers/colors live in editor |
| **Character mesh** | `toonKitPlay` · Toon RTS GLB | SI, mesh_ids equip |
| **Anim packs** | `ANIM_PACKS` · `animLibrary.js` | magic / sword_shield / longbow + mobility |
| **Gait / blend** | `CharacterController.play` | gaitBlend · combatBlend |
| **Combat** | `DrcCombatController` | land loco, skills, path cast, resources |
| **Resources** | `castResources.js` | **mana + stamina**, hold intensity |
| **Spells** | `castingSpellKit.js` + `staffSignatureSkills.js` | 10 + Inferno/Blizzard/Warp/Quake/Tempest |
| **T0 weapons** | `t0ApprenticeWand.js` · `t0WeaponCatalog.js` | base attacks + mana |
| **Weapon equip** | `equippedWeaponRuntime` · WeaponMeshAttach | prefabs |
| **Path place** | `pathCastClassify` · `staffCast` | aoe/spikes/wall/stream |
| **VFX** | Ability* · VfxDirector · effectPrefab | isolate primitives |
| **Physics** | Rapier CCT | board parents rider |
| **Windsurf** | WalkController · HoverboardRide · RideIK | vehicle parent |

---

## Dual resources (mana + stamina)

| Resource | Use | Regen |
|----------|-----|--------|
| **Mana (MP)** | Spells, path cast, signatures | `settings.drc.manaRegen` (~12/s) |
| **Stamina (STA)** | Spells + dodge/roll/slide + melee | `settings.drc.staminaRegen` (~18/s) |

### Hold LMB intensity

```
intensity = clamp(1 + holdSec * 0.42 + max(0, lengthM − 2) * 0.055, 1, 3)
manaCost  = ceil(baseMana * intensity)
stamina   = ceil(baseStam * (0.55 + 0.45 * intensity))
```

Longer hold + longer stroke = **bigger** Inferno/Blizzard feel and cost.  
Toast shows `×intensity · −N MP −N STA`.

Code: `castResources.js` · spend in `DrcCombatController._spendResources`.

---

## T0 weapons & base attacks

| Piece | Pattern |
|-------|---------|
| T0 wand | Practice Bolt (1) · Focus (2) · Frost/Arcane choice (3) |
| Base attack | Pack `attack`/`cast` one-shot + residual F |
| Locomotion | idle/walk/run + Shift freeride-run · combat mobility |
| Equip | mesh_ids + `animPackForLoadout` |

`?wand=1` activates T0 tree. Mana on bolts; Focus is buff.

---

## Staff elemental signatures

| Staff | Signature | Element | Path |
|-------|-----------|---------|------|
| Fire | **Inferno** | fire | stream |
| Ice | **Blizzard** | water | aoe |
| Nature | **Quake** | earth | wall |
| Storm | **Tempest** | wind | stream |
| Arcane | **Warp** | arcane | stream |

High path intensity (≥2.4) auto-tags signature impact VFX.

---

## Creating new skills / effects (AI learning loop)

```
1. Load casting-warlords-lab + grudge6-combat-runtime + anim library SSOT
2. Pick primitive: trail | travel | cast | impact | residual
3. Study element Ability + settings.* + materials
4. Add spell to castingSpellKit OR staffSignatureSkills
5. Set manaCost + staminaCost + animRole + vfx ids
6. Wire toDrcSkill → hotbar page / equip tree
7. Smoke: Q combat · hold LMB path · digit skills · toast costs
8. Export prefab bind for WEAPON_SKILLS / ObjectStore
```

### Animation creation (fleet)

- Prefer Bip001 baked JSON on open CDN (`prod:magic/…`)
- Roles only in `ANIM_PACKS` + `ANIM_ROLE_META` — no invented names
- Gait: longer crossfade; combat: short fade (`settings.character.gaitBlend`)

### Effects creation

- Extend existing Ability / VfxDirector catalog id
- Orbs for projectiles — never whole fireball.glb scene
- Knobs in settings.effect / residual / element blocks

---

## Windsurf

Vehicle **parents** character until dismount. Gates via SessionState.  
Skills on board when staff/bow + `skillsWhileRide`.

---

## Hard bans

- ❌ Second resource bar system  
- ❌ Spell costs stamina-only when kit has manaCost  
- ❌ New skill list outside castingSpellKit / signatures / T0  
- ❌ Space = residual  
- ❌ Second mixer for combat blends  

## Related docs

- `SESSION_STATE_SSOT.md` · `ANIM_LIBRARY_SSOT.md` · `CASTING_10_SPELLS_SSOT.md`  
- `WINDSURF_RIDE_SSOT.md` · `ISLAND_STAGE_SSOT.md` · `CASTING_LAB_SSOT.md`  
