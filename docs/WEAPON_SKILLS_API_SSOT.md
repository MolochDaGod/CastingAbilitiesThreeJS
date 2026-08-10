# Weapon skills API SSOT — do not invent skill rows

**Rule:** Prefer ObjectStore / info.grudge-studio.com catalog JSON for **every** skill field (name, dmg, CD, cast, range, effects). Only invent systems when a field is **missing** in all endpoints below.

Browse UI (same data):  
https://grudge-objectstore.pages.dev/WEAPON_SKILLS · https://info.grudge-studio.com/WEAPON_SKILLS.html  

Docs hub: https://info.grudge-studio.com/docs  

---

## Easiest path (what Casting uses)

| Need | Endpoint (try in order) | Notes |
|------|-------------------------|--------|
| **T0 starter 3-slot skills** | `GET …/api/v1/t0-weapons.json` | `weapons[].weaponSkills.slot1 / slot2 / slot3Options` — **Practice Slash, Guard Stance, Quick Thrust, Wide Sweep** for `t0-sword` |
| **All weapon skills (268)** | `GET …/api/v1/master-weaponSkills.json` | v3.1 · by weapon type · slots · damage · CD · cast · effects · prefab |
| **Prefab ↔ skill ids** | `GET …/api/v1/master-weapon-prefabs.json` | mesh/icon + skill slot ids for equip |
| **Older skills dump** | `GET …/api/v1/weaponSkills.json` | docs list; prefer **master-weaponSkills** + **t0-weapons** |

**Hosts (same JSON, CORS):**

1. `https://info.grudge-studio.com/api/v1/…`  
2. `https://objectstore.grudge-studio.com/api/v1/…`  
3. `https://grudge-objectstore.pages.dev/api/v1/…`  

Base URL from docs: `https://info.grudge-studio.com/api/v1/`

---

## Training Sword T0 (canonical — do not rename)

From live `t0-weapons.json` id **`t0-sword`**:

| Slot | Skill id | Name | DMG | CD | Cast | Effects |
|------|----------|------|-----|----|------|---------|
| 1 fixed | `t0_sword_practice_slash` | Practice Slash | 18 | 0 | Instant (`null`) | Starter |
| 2 fixed | `t0_sword_guard_stance` | Guard Stance | 0 | 6s | Instant | −15% damage 2s |
| 3 choose | `t0_sword_quick_thrust` | Quick Thrust | 16 | 3s | Instant | Extended reach |
| 3 choose | `t0_sword_wide_sweep` | Wide Sweep | 14 | 4s | Instant | Small AoE |

Production: player picks **one** of the two slot-3 options.  
Lab must **not** invent a 4th catalog skill; keys 1–3 only for T0.

---

## Code map (Casting lab)

| Concern | File |
|---------|------|
| Fetch T0 + prefabs + merge | `src/api/t0WeaponCatalog.js` |
| Fetch master skills | `src/api/weaponSkillsCatalog.js` |
| Equip → hotbar | `src/combat/equippedWeaponRuntime.js` · `hotbarForWeapon` |
| Runtime cast | `skillDefToDrc` → `DrcCombatController.useSkill` |

**Allowed lab-only layer:** map skill **id/name → anim role** (`attack1` / `block` / …) and interpret effect **strings** (e.g. “Small AoE”) for residual.  
**Forbidden:** invent skill ids, damage, CDs, or fake cast times when catalog has Instant/`null`.

---

## Field mapping

| Catalog field | Runtime |
|---------------|---------|
| `damage` | `skill.damage` |
| `cooldown` (0 / number) | `skill.cooldown` (0 = no CD / GCD only) |
| `castTime` `null` | `castDuration = 0` (Instant) |
| `range` `null` | melee default range only if style melee |
| `effects[]` | buff parse / residual hints |
| `resourceCost` | mana / stamina |
| `prefab` / `animation` | optional VFX / clip when present |

---

## When to invent systems

Only if **after** fetching t0-weapons + master-weaponSkills + prefabs a required runtime field is still empty (e.g. no VFX ref → lab residual default). Never invent **skill definitions** that contradict WEAPON_SKILLS.
