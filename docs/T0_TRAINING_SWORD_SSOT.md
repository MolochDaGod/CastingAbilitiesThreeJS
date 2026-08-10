# Training Sword T0 — Casting lab

**Canon:** [WEAPON_SKILLS](https://grudge-objectstore.pages.dev/WEAPON_SKILLS) · `api/v1/t0-weapons.json` id `t0-sword`  
**Code:** `t0WeaponCatalog.js` · `equippedWeaponRuntime.js` · `hotbarForWeapon` · `drcSkills` tree `equipped`

## Product slots (production)

| Slot | Key | Skill | Notes |
|------|-----|-------|--------|
| 1 | **1** | **Practice Slash** | Auto · light melee · `attack1` / combo |
| 2 | **2** | **Guard Stance** | Auto · block · −15% dmg 2s · `block` |
| 3 | **3** | **Choose one** | Quick Thrust **or** Wide Sweep (player picks one) |

Craft T1 to unlock five-slot loadout. T0 has **no** tier upgrades.

### Slot 3 options

| Choice | DMG | CD | Anim role | Residual |
|--------|-----|----|-----------|----------|
| Quick Thrust | 16 | 3s | `attack3` | Reach ~3.6 m |
| Wide Sweep | 14 | 4s | `attack2` | Wider AoE residual |

## No invented 4th skill

T0 production is **3 slots only**. Do not add lab-only skill ids to the hotbar.  
Keys **1–3** = catalog skills. LMB free attack = combo / finisher (anim layer, not a new skill row).

## Lab entry

- Inventory **Prefabs / Weapons** → equip Training Sword  
- URL `?sword=1` → equip `t0-sword` + skill tree `equipped`  
- Keys **1–3** fire hotbar  

## Anim bind only (not new skills)

| Catalog skill | Anim role (presentation) |
|---------------|--------------------------|
| Practice Slash | `attack1` |
| Guard Stance | `block` |
| Quick Thrust | `attack3` |
| Wide Sweep | `attack2` |

Numbers stay from JSON. See `docs/WEAPON_SKILLS_API_SSOT.md`.
