# T0 weapon play stack — full production pipeline

**Product language:** we ship **weapons**, not free “elements.”  
Hotbar **1–6** staff brands (`fire`…`arcane`) are **staff weapons** with path-cast pools under the hood.  
Catalog weapons (`t0-sword`, `t0-gun`, …) own skills, anim packs, meshes, and projectiles.

**Lab:** CastingAbilitiesThreeJS · **Live:** casting.grudge.studio / casting-abilities-threejs.vercel.app  
**Agent skill:** `casting-t0-weapon-play` (load after `casting-warlords-lab` + `grudge-studio`)

---

## Non-negotiables

| Rule | Detail |
|------|--------|
| **Catalog first** | Skill ids from `t0-weapons.json` / `master-weaponSkills` only — never invent |
| **Item owns skills** | Equip weapon → hotbar + anim pack + mesh (`equippedWeaponRuntime`) |
| **One mixer** | Bip001 packs; no second AnimationMixer |
| **SI** | metres; human ~1.8 m; knockback MM (100 = 1 m) |
| **No multipack projectiles** | Split orbs/rocks/arrows — never whole fireball / gd_orbs pack |
| **Extend, don’t fork** | `weaponSkillProduction` · `skillDelivery` · existing Ability pools |
| **Dual loadout** | Paperdoll Weapon 1 / Weapon 2 · combat **Tap Q** swap |

---

## Layers every T0 weapon must fill

```
1. Identity      t0-weapons / master-weapon-prefabs (id, name, tier, weaponType)
2. Mesh          modelUrl · hand attach · kit mesh_ids exclusive slot
3. Icon          iconUrl (CDN)
4. Anim pack     magic | sword_shield | longbow | pistol (+ locomotion bind)
5. Locomotion    idle / walk / run / jump / fall / roll / dodge (pack roles)
6. Traversal     back slot / ride only when weapon-appropriate (not default T0)
7. Skills        slot1 · slot2 · slot3 options (catalog)
8. Production    animRole · VFX · physics · statuses (optional override JSON)
9. Projectiles   delivery mesh (orb-*, arrow, bullet) SI split
10. Prefab       Warlords export (equip → export JSON)
11. Deploy       Vercel lab smoke · DO promote when ready
```

---

## Weapon families → packs (play)

| Family | T0 examples | Anim pack | Primary delivery |
|--------|-------------|-----------|------------------|
| 1H melee | sword, axe, dagger, hammer | `sword_shield` | melee residual / tip |
| 2H melee | greatsword, greataxe, spear, hammer2h | `sword_shield` | residual / heavy roles |
| Bow / xbow | bow, crossbow | `longbow` | arrow projectile |
| Gun | flintlock `t0-gun` | `pistol` | bullet + chamber |
| Magic staff | wand, nature staff | `magic` | path stream / orbs / linear |
| Tool | `t0-tool` | `sword_shield` | harvest swing (activity harvest) |
| Offhand | tome | `magic` | cantrip path |

Full 15 matrix: `docs/T0_WEAPONS_SSOT.md`.

---

## Staff weapons (hotbar 1–6) vs catalog weapons

| Concept | Product name | Code key | Runtime |
|---------|--------------|----------|---------|
| Fire / Storm / Ice / Nature / Holy / Arcane staff | **Staff weapon** | `ELEMENTS` / `WEAPON_STAFF_IDS` | Path cast Ability pools |
| Training Sword, Flintlock, … | **Catalog weapon** | `t0-*` equip | `equipWeaponById` + skills |

Internal path pools remain `fire|water|earth|wind` (`ELEMENT_ABILITY` / `abilityKeyForWeapon`).  
**Do not** rebrand code keys without a migration plan — product copy and HUD use **weapon** language.

---

## Author loop — new catalog T0 weapon

```
1. Catalog exists on t0-weapons + prefab model/icon (ObjectStore)
2. Map weaponType → anim pack (weaponAnimPack.js) — do not invent packs lightly
3. Equip path works: equipWeaponById → mesh · pack · hotbar
4. For each skill id:
     node scripts/scaffold-weapon-skill.mjs --id <catalog_skill_id> --weapon SWORD
   Edit public/skills/production/<id>.json (anim · VFX · physics · statuses)
5. Projectiles: public/models/vfx/orbs|arrows|… SI splits only
6. Smoke lab: I equip · combat · 1–4 · F · Tap Q dual set · focus LMB staff
7. Export Warlords prefab · promote DO when green
8. Deploy casting Vercel if code/assets changed
```

### Scaffold helpers

```bash
# Per catalog skill (production override)
node scripts/scaffold-weapon-skill.mjs --id t0_sword_practice_slash --weapon SWORD

# Full play-stack checklist manifest for one T0 weapon
node scripts/scaffold-t0-weapon-play.mjs --id t0-sword
# → docs/play-stack/t0-sword.play-stack.json
node scripts/scaffold-t0-weapon-play.mjs --list
```

---

## Author loop — new staff weapon brand (was “element”)

Adding a **7th staff** or new brand is rare. Prefer bind new catalog skills to existing six staffs.

If required:

1. Add product id to `WEAPON_STAFF_IDS` / `ELEMENTS` (hotbar order)
2. `WEAPON_STAFF_META` / `ELEMENT_META` label + accent + `staffWeaponId`
3. `ELEMENT_ABILITY` pool map → fire|water|earth|wind (or new Ability class — last resort)
4. `settings.<id>` presentation knobs if unique VFX
5. HUD action bar already maps `ELEMENTS` — smoke 1–6
6. Linear skillshots / orbs: extend existing binds, don’t fork AbilityManager

---

## Code SSOT map

| Layer | File |
|-------|------|
| Equip runtime | `src/combat/equippedWeaponRuntime.js` |
| T0 catalog | `src/api/t0WeaponCatalog.js` |
| Production compile | `src/combat/weaponSkillProduction.js` |
| Delivery | `src/combat/skillDelivery.js` |
| Statuses | `src/combat/skillStatusSystem.js` |
| Linear cast | `src/combat/elementalLinearCast.js` |
| Path abilities | `src/abilities/*` · `AbilityManager` |
| Anim packs | `src/config/weaponAnimPack.js` · `animLibrary.js` |
| Staff product ids | `src/config/settings.js` `WEAPON_STAFF_*` |
| Dual loadout Q | `swapWeaponLoadout` · paperdoll `mainPanelSlots` |
| Projectiles VFX | `src/vfx/*` · `public/models/vfx/*` |
| Deploy | `docs/CASTING_DEPLOY_ENV_SSOT.md` · `WEAPON_SKILL_DO_SSOT.md` |

---

## Deploy / promote

| Surface | Action |
|---------|--------|
| Lab code/UI/assets | `npm run build` · Vercel `casting-abilities-threejs` |
| Skill DO | weapon-skills.grudge-studio.com · see WEAPON_SKILL_DO |
| Catalog JSON | ObjectStore / info.grudge-studio.com — agents do not invent rows |
| Smoke URL | https://casting-abilities-threejs.vercel.app/?t0=t0-sword |

---

## Related docs

- `T0_WEAPONS_SSOT.md` · `T0_STARTERS_WEAPON_SKILLS_SSOT.md`
- `WEAPON_SKILL_PRODUCTION_SSOT.md` · `SKILL_DELIVERY_SSOT.md`
- `WEAPON_EQUIP_PREFABS_SSOT.md` · `ANIM_LIBRARY_SSOT.md`
- `ELEMENTAL_LINEAR_CAST_SSOT.md` · `STAFF_NORMAL_ORBS_CHARGE_SSOT.md`
- `PISTOL_FLINTLOCK_SSOT.md` · `MAIN_PANEL_INVENTORY_SSOT.md`
