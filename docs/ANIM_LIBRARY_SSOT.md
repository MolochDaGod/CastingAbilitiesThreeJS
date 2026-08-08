# Animation Library SSOT — Casting / Warlords lab

**Code:** `src/config/animLibrary.js` · `src/config/assets.js` (`ANIM_PACKS`) · `src/config/weaponAnimPack.js`  
**Play:** `src/animation/CharacterController.js` · mobility drive `src/combat/DrcCombatController.js`  
**MM:** `src/combat/motionMath.js` · afterimage `src/vfx/DodgeAfterimage.js`  
**UI:** Showcase **Anims** tab (`O` / Show) — roles grouped by family  

Use this language in code comments, toasts, agent notes, and fleet ports.  
**Do not invent parallel role names or a second mixer.**

---

## Vocabulary

| Term | Meaning | Example |
|------|---------|---------|
| **pack** | Named clip set bound to the hero mixer | `magic`, `sword_shield`, `longbow`, `combat_mobility` |
| **role** | Logical clip key on the mixer | `idle`, `walk`, `dodgeL`, `rollR`, `slide` |
| **family** | Grouping for UI / agents | `gait` · `combat` · `mobility` · `utility` |
| **channel** | How the role is driven | `gait` (`setGait`) · `oneShot` · `mobility` (impulse + clip) |
| **MM** | Motion-math body travel | **100 MM = 1 m** |
| **afterimage** | Trailing model ghosts on MM dodge | wind cyan additive mesh clones |
| **invuln** | I-frames while dodge channel runs | `drc.isInvincible` |

Prefixed roles like `combat_mobility:rollL` mean “same role, non-primary pack bind.”  
`baseRoleName()` strips the prefix.

---

## Bind order (hero load)

1. **Weapon pack** from equip / preset (`magic` | `sword_shield` | `longbow`)
2. **Magic fallback** if needed (hands-on idle)
3. **`combat_mobility` always** — rolls, dodges, slide, parry/block

Weapon mesh swap → `animPackForLoadout` → `setAnimPack` → rebind mobility.

---

## Packs

| Pack | Owns | Notes |
|------|------|--------|
| `magic` | idle, cast, walk, run, jump | Staff; prod idle has Hand tracks |
| `sword_shield` | idle, attack, block, walk, run, jump | Melee |
| `longbow` | idle, attack, walk, run, jump, dodge* | Dodges also in combat_mobility |
| `combat_mobility` | roll L/R/F/B, slide, dodge L/R/F/B, parry | Shared; Ghost Rider rolls first |
| `locomotion_8way` | optional overlay | Bind only if CDN clips exist |

Clip URL candidates: `bakedClipUrlsForRole` — `prod:…` then open baked.

---

## Families & play API

| Family | Roles | API |
|--------|-------|-----|
| **gait** | idle, walk, run, jump | `setGait(0\|1\|2, sprinting)` · `playJump` |
| **combat** | cast, attack, block, parry | `playWeaponCombat` · `requestOneShot` · `playParry` |
| **mobility** | dodge*, roll*, slide | `playDodge` · `playRoll` · `playSlide` + DRC input |
| **utility** | anything else | `playLibraryClip(role)` |

### Mobility inputs (DRC combat)

| Action | Input | Clip priority | Motion |
|--------|-------|---------------|--------|
| **MM dodge** | AA / DD / WW double-tap · X back | longbow dodge → locomotion → ghost_rider dodge | Lateral **720 MM (7.2 m)**; F/B 240 MM; afterimage + invuln |
| **Roll** | Ctrl+A/D (W/S) | **ghost_rider/roll_*** → locomotion → longbow dodge | Impulse + one-shot |
| **Slide** | Shift+Ctrl while sprint | `prod:extra/running-slide` | Forward impulse |

---

## Extend pattern (agents)

```
1. Add role URL list under ANIM_PACKS[pack] in assets.js
2. Register meta in animLibrary.js ANIM_ROLE_META (+ MOBILITY_BINDINGS if input)
3. roleMap LoopOnce/LoopRepeat in CharacterController._bindPack
4. play* helper or DRC poll (do not one-off in App.js)
5. Showcase Anims tab picks it up via listAnimRoles / getAnimLibrary
6. Document in this file + CASTING_LAB_SSOT if fleet-facing
7. Smoke casting.grudge-studio.com / casting-abilities-threejs.vercel.app
```

### Hard bans

- ❌ Second `AnimationMixer` on the same body  
- ❌ Inventing `rollLeft` when role is `rollL`  
- ❌ Strafe-as-run without Shift freelook channel  
- ❌ Binding residual to Space (jump only)  
- ❌ Skipping `combat_mobility` after pack swap  

---

## Diagnostics

```js
character.getAnimLibrary()
// { version, activePack, packs, roles, byFamily, mobility, dodgeMm, playApi, extendPattern }

character.describeRole('rollL')
// "Roll left (Ghost Rider) · Ctrl+A [mobility/mobility]"

drc.isInvincible  // true during MM dodge window
```

Console on load lists bound clips: `[CharacterController] clip rollL ← …ghost_rider/roll_left…`

---

## Related

| Doc / skill | Role |
|-------------|------|
| `docs/CASTING_LAB_SSOT.md` | Lab macro |
| `casting-warlords-lab` skill | Agent entry |
| `grudge6-combat-runtime` | Fleet combat one-shots |
| Animator Studio `MM_TO_M` | Same 100 MM = 1 m contract |
