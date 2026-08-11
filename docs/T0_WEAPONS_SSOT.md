# T0 weapons — complete lab matrix

**SSOT JSON:** https://info.grudge-studio.com/api/v1/t0-weapons.json  
**Browse:** https://grudge-objectstore.pages.dev/WEAPON_SKILLS  
**Code:** `t0WeaponCatalog.js` · `equippedWeaponRuntime.js` · `hotbarForWeapon` · `applyT0Presentation`  
**Rule:** Catalog skills only — no invented skill rows. Anim roles = presentation.

**Deferred (not T0):** water traversal · climb · CC recovery · farm/harvest anim loops.

---

## Equip in lab

| Entry | Action |
|-------|--------|
| Inventory → Prefabs / T0 | Click equip on any starter |
| `?t0=t0-axe1h` | Equip that id |
| `?sword=1` | `t0-sword` |
| `?wand=1` | `t0-wand` |
| `?sapling=1` | `t0-nature-staff` |

Keys **1–3** fire hotbar. Slot 3 = chosen option (Inventory skill list).

---

## All 15 starters

| Id | Name | Pack | Slot 1 | Slot 2 | Slot 3 choices |
|----|------|------|--------|--------|----------------|
| `t0-sword` | Training Sword | sword_shield | Practice Slash | Guard Stance | Quick Thrust · Wide Sweep |
| `t0-axe1h` | Hand Axe | sword_shield | Practice Chop | Wind-Up | Cleaving Swing · Heavy Blow |
| `t0-dagger` | Training Dagger | sword_shield | Practice Stab | Evade Step | Backstab · Poison Scratch |
| `t0-hammer1h` | Training Hammer | sword_shield | Practice Smash | Brace | Shockwave · Stagger Blow |
| `t0-spear` | Hunting Spear | sword_shield | Practice Thrust | Pole Guard | Reach Strike · Sweeping Jab |
| `t0-greatsword` | Training Greatsword | sword_shield | Practice Cleave | Power Stance | Overhead Swing · Spinning Cut |
| `t0-greataxe` | Training Greataxe | sword_shield | Practice Hew | Lumber Stance | Wide Arc · Crushing Blow |
| `t0-hammer2h` | Training Warhammer | sword_shield | Practice Smash | Brace | Shockwave · Stagger Blow |
| `t0-bow` | Short Bow | longbow | Practice Shot | Take Aim | Pinning Arrow · Rapid Fire |
| `t0-crossbow` | Light Crossbow | longbow | Practice Bolt | Reload | Piercing Bolt · Knockback Shot |
| `t0-gun` | Flintlock Pistol | pistol | Practice Shot | Take Cover | Burst Fire · Suppressing Shot |
| `t0-wand` | Apprentice Wand | magic | Practice Bolt | Focus | Frost Spark · Arcane Ping |
| `t0-nature-staff` | Sapling Staff | magic | Practice Root | Nature Ward | Vine Lash · Healing Sprout |
| `t0-tool` | Crude Tool | sword_shield | Chop | Mine | Skin · Pry |
| `t0-offhand-tome` | Novice Tome | magic | Practice Cantrip | Read Page | Minor Heal · Ember Spark · Frost Wisp |

Numbers (dmg / CD / cast / effects) = live JSON only.

---

## Presentation map (anim only)

| Kind | Anim role |
|------|-----------|
| Practice / starter melee | `attack1` |
| AoE / sweep / shockwave | `attack2` |
| Heavy / overhead / backstab / reach | `attack3` |
| Guard / brace / ward / cover / stance | `block` (or `cast` on magic) |
| Focus / aim / wind-up / power / read | buff + next-hit mul |
| Evade Step | `dodgeB` |
| Ranged shots | `attack` (longbow / **pistol** pack) |
| Take Cover (gun) | `block` + ward −dmg taken 2s |
| Burst Fire | multiHit **3** · bullets staggered |
| Spells / heals | `cast` |

Delivery: melee residual · ranged projectile · spell path/element · see `SKILL_DELIVERY_SSOT.md`.

---

## After T0 (parked)

1. Water locomotion  
2. Climb  
3. Recover from loss of control  
4. Farming / harvesting animation loops (tool skills already catalog-ready; full harvest system later)
