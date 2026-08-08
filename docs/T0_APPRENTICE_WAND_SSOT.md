# T0 Apprentice Wand — three-slot starter

**Weapon:** `t0-wand` · Apprentice Wand  
**Catalog SSOT:** [WEAPON_SKILLS.html](https://info.grudge-studio.com/WEAPON_SKILLS.html) · [t0-weapons.json](https://info.grudge-studio.com/api/v1/t0-weapons.json)  
**Lab import:** `src/api/t0WeaponCatalog.js` (preferred) · local `t0ApprenticeWand.js` only as offline mirror  
**Pair:** Sapling Staff `t0-nature-staff` — see `docs/T0_STARTERS_WEAPON_SKILLS_SSOT.md`

## Slots (product)

| Slot | Mode | Skill | Notes |
|------|------|-------|--------|
| **1 · Starter Attack** | Auto · fixed | **Practice Bolt** | Arcane · DMG 14 · Cast 0.5s · CD short |
| **2 · Starter Style** | Auto · fixed | **Focus** | Channel · CD 5s · Cast 0.3s · **+spell dmg 3s** |
| **3 · Choose One** | Choose 1 | **Frost Spark** (default) *or* **Arcane Ping** | Frost 12 / Arcane 10 |

### Slot 3 options

| Skill | Type | DMG | CD | Cast | Effect |
|-------|------|-----|----|------|--------|
| Frost Spark | frost | 12 | 4s | 0.6s | Slow 1s |
| Arcane Ping | arcane | 10 | 3s | 0.4s | Low mana |

## Lab binds

| Skill | Ability path | Cast → Travel → Impact |
|-------|--------------|------------------------|
| Practice Bolt | wind (arcane beauty) | arcane_swirl → chain_lightning → arcane_swirl |
| Focus | buff only | arcane_swirl hand tell |
| Frost Spark | water | … → moon_beam → frost_wave |
| Arcane Ping | wind aoe | arcane_swirl pulse |

Anim: **magic** pack · `standing 1h cast spell 01` · role **cast**.

## Lab UX

1. Combat **Q**  
2. **I → Skills → Apprentice Wand bar** (or URL `?wand=1`)  
3. Pick Slot 3: Frost Spark / Arcane Ping  
4. **1** Practice Bolt · **2** Focus · **3** choice  
5. Focus then Bolt → toast **FOCUSED** + boosted intensity  

## Pattern

Same **three-slot-starter** as other T0 weapons (fixed attack · fixed style · choose ability).  
Branches at T1 into fire / frost / holy / arcane / lightning staves (item description).

## Related

- `docs/CASTING_10_SPELLS_SSOT.md` (staff learning kit)  
- `src/api/weaponSkillsCatalog.js`  
- master-weaponSkills `WAND.starterSlots`  
