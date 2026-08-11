# T0 Flintlock pistol · grudgepistolzio · bullets

**Catalog:** `t0-gun` · **name:** Flintlock Pistol  
**Live JSON:** https://info.grudge-studio.com/api/v1/t0-weapons.json  
**Lab mesh:** `public/models/weapons/t0-flintlock.glb` (from `D:\Games\Models\flintlock.glb`)  
**Bullet:** `public/models/vfx/projectiles/bullet1.glb` (Styloo Guns pack)  
**Code:** `src/vfx/pistolBulletVfx.js` · `SkillProjectileSystem.spawnBullet` · `weaponSkillProduction` · `DrcCombatController`

**Equip lab:** `?t0=t0-gun` · Inventory Weapon tab

---

## Weapon stats (catalog SSOT)

| Stat | Value |
|------|-------|
| DMG | **28** |
| CRIT | **3%** |
| DEF | **3** |
| Flavor | Homemade · more loud than accurate |
| Craft T1 | starter + 2× scrap-ingot · 1× driftwood-log · 1× rough-stone @ Anywhere |
| Slots | 1–2 auto · slot 3 choose one · T0 only until T1 five-slot |

---

## T0 skill kit (catalog ids — do not invent)

| Slot | Id | Name | Role | DMG | CD | Cast | Effects | Runtime |
|------|-----|------|------|-----|----|------|---------|---------|
| 1 auto | `t0_gun_practice_shot` | Practice Shot | Starter Attack | 28 | — | Instant | Starter · bullet | 1× `spawnBullet` |
| 2 auto | `t0_gun_take_cover` | Take Cover | Starter Style | — | 5s | Instant | −dmg taken 2s | Ward · 20% DR 2s · block anim |
| 3 pick | `t0_gun_burst_fire` | Burst Fire | Choose (default) | 20 | 6s | Instant | Multi-hit · bullet | **3×** bullets · 80 ms gap · small fan |
| 3 pick | `t0_gun_suppressing_shot` | Suppressing Shot | Choose | 16 | 4s | Instant | Slow fire rate enemy · bullet | 1× bullet + **slow** status on soft-lock |

Default slot 3: **Burst Fire**.

**Best practices (lab):**

- Catalog numbers only — never invent damage/CD
- `projectile: "bullet"` preserved through `normalizeSkillDef`
- Pack = **`pistol`** (not longbow) · meshSlot `pistol`
- Blood only on living · terrain = micro explosion
- Take Cover is ward (not focus) — sets `_wardUntil` / `_wardReduce`
- Burst multiHit = 3 from description “Three-round burst”

---

## Anim pack review — grudgepistolzio

**Path:** `D:\Games\Models\_anim_packs\grudge6_incoming_2026-08-01\grudgepistolzio`

| Clip set | Role |
|----------|------|
| idle / walk / run / backward / strafe / arc | One-hand **loco** (guns + can cover crossbow-style stance) |
| jump | Jump |
| stand↔kneel / kneeling idle | Aim-down / braced idle |
| Heavy_mixamo | **Review** — likely heavy weapon, **not** flint fire default |

**Live combat fire/draw/whip** still from Open bake:

`open.grudge-studio.com/anims/baked/pistol/{gunplay,drawing-gun,charged-pistol,pistol-whip,idle,walk-*,run-*,strafe-*}.json`

**Next bake:** convert zio loco FBX → Bip001 JSON on Open CDN, then point `ANIM_PACKS.pistol` candidates at new names. Do **not** invent parallel packs.

Config: `src/config/pistolAnimSsot.js` · `GRUDGE_PISTOL_ZIO_INCOMING`

---

## Weapon mesh

| Field | Value |
|-------|--------|
| Catalog id | `t0-gun` |
| Local URL | `./models/weapons/t0-flintlock.glb` |
| Hand SI | ~0.48 m length (`WeaponMeshAttach` pistol profile) |
| Anim pack | `pistol` |
| Equip | `?t0=t0-gun` or Inventory Weapon tab |

`T0_MODEL_CDN['t0-gun']` points local until R2 `prod/gltf/weapons/t0-flintlock.glb` is uploaded.

**Size note:** source ~23 MB — compress with gltf-transform (Draco/WebP) before CDN promote.

---

## Bullet projectile

| Knob | Value |
|------|--------|
| Mesh | Styloo `bullet1.glb` (~2.7 cm raw) |
| Speed | **90 m/s** lab (readable ballistic; not real 300+) |
| Trail | **20%** default trail length (~0.2 m ribbon) |
| Life | 1.2 s |
| Contact | 0.12 m |

### Impact rules

| Target | VFX |
|--------|-----|
| Living (`hostile` · npc · player · boss · creature · unit) | Red **liquid blood** splatter + light inferno |
| Terrain · aim · props · ground | **Micro explosion** flash — **no blood** |

`isLivingTarget()` in `pistolBulletVfx.js` — extend kinds there, not ad-hoc.

---

## Charged Shot UX (hold · ticks · rest · blend)

| Step | Behavior |
|------|----------|
| **Hold 1 / F** | Begin charge · cast bar ticks (20 Hz) · **charged-pistol** wind-up blend |
| **Levels** | Tap → Wind → Charged → Power → Full (damage mul ~1–2.05) |
| **Release** | Fire with intensity costs + damage mul · muzzle bullet |
| **Best rest** | ~0.42 s + intensity · blocks next weapon skill |
| **GCD** | 0.12 s global combat timer between attacks |
| **Cancel** | short rest · restore gait blend |
| **UI click** | tap fire (no hold) |

Code: `weaponChargeSystem.js` · `beginWeaponCharge` / `releaseWeaponCharge` · `CharacterController.beginWeaponChargeAnim`

---

## Chamber (production) — empty → **1 = Reload**

| State | Key 1 | Fire (1 loaded / 3) |
|-------|-------|---------------------|
| **Loaded** | Practice Shot | bullet · then empty |
| **Empty** | **Reload** (baked) | blocked · toast “press 1” |
| **Reloading** | locked | blocked |

Code: `src/combat/flintlockChamber.js` · single powder load (capacity 1).

## Fire timing · barrel · soft-lock · reload

| Concern | SSOT | Value |
|---------|------|--------|
| Fire timeScale | `pistolTimeScale('fire')` | gunplay → ~0.38 s wall |
| Hit frame | `FLINTLOCK_FIRE.hitFrameSec` | **0.14 s** then bullet leaves muzzle |
| Burst gap | `FLINTLOCK_FIRE.burstGapSec` | **0.09 s** |
| Muzzle | `WeaponAttach` → `WeaponMuzzle` | farthest mesh tip from grip |
| Soft-lock blend | `settings.aim.pistolSoftLockBlend` | **0.82** · max **34°** |
| Crosshair | App pistol spread | tight on lock · wider free (inaccurate) |
| **Baked reload** | `public/anims/baked/pistol/reload.json` | drawing-gun tracks · role `reload` |
| Reload pose | `PistolReloadPose` | gun → chest · L-hand barrel · tilt ~22° (post-mixer) |
| Auto after shot | `FLINTLOCK_RELOAD.afterShot` | **false** (must press 1) |

## Open Danger pistol skill review (weapon-live-packs)

| Open slot | Anim clip | Casting T0 | Needs load |
|-----------|-----------|------------|------------|
| `pistol_shot` | gunplay | Practice Shot | yes |
| `pistol_double` | gunplay ×3 | Burst Fire | yes |
| `pistol_fan` | charged-pistol | Suppressing Shot | yes |
| `pistol_reload` | **reload** | empty → key 1 | no |
| (review) | pistol-whip | melee whip | no |
| (review) | charged-pistol | power | yes |

SSOT: `OPEN_DANGER_PISTOL_SLOTS` · `OPEN_PISTOL_SKILL_SLOTS` · `FLINTLOCK_ANIM_REVIEW`

## Wiring path

```
Equip t0-gun (?t0=t0-gun)
  → flintlock mesh + pistol anim pack + muzzle + chamber Loaded
  → hotbar: Practice Shot · Take Cover · Burst|Suppress
  → keys 1–3 / F  (+ RMB focus)
       1 Loaded  → gunplay → hit 0.14s → muzzle bullet → Empty
       1 Empty   → Reload (baked pistol/reload + powder pose) → Loaded
       2 Take Cover → ward (no ammo)
       3 Burst/Suppress → needs load · empties chamber
  → Showcase Anims: idle/walk/gunplay/reload/whip/charged review
```

---

## Checklist

```
[x] Flintlock mesh on t0-gun
[x] Bullet mesh + short trail + high speed
[x] Blood only on living
[x] Micro explode on terrain
[x] grudgepistolzio reviewed in SSOT
[x] Practice Shot / Take Cover / Burst Fire / Suppressing Shot runtime
[x] multiHit 3 for Burst · ward DR for Take Cover · slow for Suppress
[x] anim pack pistol (not longbow) in presentation
[x] Fire hit-frame timing + muzzle barrel spawn
[x] Soft-lock / crosshair assist for pistol pack
[x] Chamber: empty → key 1 Reload
[x] Baked pistol/reload.json (drawing-gun stamp) + procedural pour layer
[x] Open Danger skillSlots mapped (shot/double/fan/reload)
[ ] Promote reload.json to Open CDN anims/baked/pistol/reload.json
[ ] Dedicated Mixamo pistol reload FBX (replace drawing-gun stamp)
[ ] Upload flintlock mesh to R2 prod
[ ] Bake zio loco → Open CDN
[ ] Crossbow pack choice (longbow vs pistol) product decision
```
