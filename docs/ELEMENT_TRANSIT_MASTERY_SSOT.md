# Element transit mastery SSOT

**Lab:** casting.grudge-studio.com · **Catalog:** [WEAPON_SKILLS.html](https://info.grudge-studio.com/WEAPON_SKILLS.html) · JSON `master-weaponSkills.json`  
**Staff binds:** `src/combat/staffWeaponSkillsBind.js`

This is the vocabulary for **what you see after you draw a path** — not “smoke shader” generically.

---

## 1. Lifecycle names (what is “in transit”?)

After LMB path ends (or a digit skill fires), the cast goes through **Ability phases**:

| Phase | Code | What you see |
|-------|------|----------------|
| **Travel** | `AbilityPhase.TRAVEL` | Head moves along the drawn spline; ribbon/volume **follows** |
| **Impact** | `AbilityPhase.IMPACT` | Head reaches end — burst / tower / splash / tornado |
| **Fade** | `AbilityPhase.FADE` | Effect dies out |
| Beauty layer | `VfxDirector.deploy*` | Catalog effects layered on cast/travel/impact (particles, decals) |

Base class: `src/abilities/Ability.js`  
Pool: `AbilityManager` maps product element → one of four **Ability classes**.

**There is no separate “smoke shader” product name.** Smoke is **particles** on fire (`fire.smoke` system). Wind is **`WindMaterial`** + silk ribbons.

---

## 2. The four transit styles (ability + material + particles)

These are the **four projectile/path looks** you master by editing shaders + `settings.*` form knobs:

| Product element | Ability class (travel) | Material / “shader” | Particles | Settings block |
|-----------------|------------------------|---------------------|-----------|----------------|
| **Fire** | `FireAbility` | **`VolumetricFireMaterial`** (raymarched volume) | embers, sparks, **smoke** | `settings.fire` |
| **Ice** (legacy water) | `WaterAbility` | **`OceanWaterMaterial`** | droplets, spray, foam, mist | `settings.water` |
| **Nature** (legacy earth) | `EarthAbility` | **`RockMaterial`** + ground plates | dust, debris | `settings.earth` |
| **Storm** (legacy wind) | `WindAbility` | **`WindMaterial`** / `WindRibbonMaterial` | leaves, dust, residual cyan | `settings.wind` |
| Holy / Arcane | reuse Wind (for now) | same + beauty colors | motes / moon_beam | `settings.holy` / `arcane` |

**Trail under cursor (while drawing):** `TrailMaterial` + `PathTrail` — not the ability transit itself.

**Distortion / heat shimmer:** `DistortionMaterial` (often fire impact).

### What “transit” is physically

1. You draw a **CatmullRom curve** (path).
2. Ability head walks the curve (`u` 0→1) at `settings.<element>.speed`.
3. A **rolling window** of path points builds the ribbon/volume mesh each frame (`onTravel`).
4. Beauty VFX may **also** fire: cast tell → travel tell → impact (catalog ids).

So: **transit = Ability TRAVEL + material + particles**, optionally + **VfxDirector presentation** (volley, lightning, vines, trap…).

---

## 3. Four path *placement* modes (how the curve is used)

Independent of element look — `settings.staffCast` + `pathCastClassify`:

| Path mode | When | Meaning |
|-----------|------|---------|
| **stream** | long stroke / hold | Ability rides full path (classic bolt/stream) |
| **aoe** | short stroke | Place impact at endpoint (compressed curve) |
| **spikes** | medium stroke | Ground spears / hybrid overlays along path |
| **wall** | long hold / long path | Barrier / cage / shield presentation |

These four are the **placement styles**. The four Ability classes are the **transit looks**.

---

## 4. Skill mastery checklist (edit order)

| Skill | Where | Knobs |
|-------|-------|-------|
| Scale / form | `settings.fire|water|earth|wind` | width, length, speed, flightHeight, ribbonCount… |
| Shader look | materials above | colors, density, steps, opacity, glow |
| Beauty VFX | `vfxCatalog` + `elementPresentation` | cast/travel/impact ids, lightning, volley |
| Path place | `settings.staffCast` | aoeMaxLength, spikesMaxLength, wallHoldSec |
| Catalog bind | `staffWeaponSkillsBind.js` | every `staff_*` → pathMode + element + VFX |
| Anim | magic pack `cast` role | `weaponAnimPack` staff→magic |
| New asset from look | clone material palette + new presentation recipe | do **not** invent Ability2 |

Editor: lil-gui folders per element + Global (`cameraShake`, glow…).

---

## 5. Nature trap example (scripted presentation)

**Id:** `nature_trap` · ground-travel (EarthAbility stream) → foot burst (stun) → cage walls 2s → collapse free.

| Step | Time | Systems |
|------|------|---------|
| Travel | 0… | EarthAbility green path to target |
| Foot blast | impact | small `earth_surge` + burst under feet (stun VFX) |
| Cage | +0.05…2.0s | 4–6 wall pillars (`earth_surge` ring) |
| Free | 2.0s | pillars fade |

Knobs: `settings.presentation.natureTrap` · deploy: `VfxDirector._deployNatureTrap`.

---

## 6. All STAFF skills from WEAPON_SKILLS

Catalog type **STAFF** (~45 skills including T0). Lab enriches each id via **`STAFF_SKILL_BINDS`** so combat plays:

- magic **cast** anim  
- Ability transit (element)  
- pathMode  
- cast / travel / impact effect ids  
- optional presentation (`meteor`, `lightning`, `natureTrap`, `shield`, …)

Source of truth for ids:  
`https://info.grudge-studio.com/api/v1/master-weaponSkills.json` → weaponTypes `STAFF`  
Browse: `https://info.grudge-studio.com/WEAPON_SKILLS.html`

Remote `prefab.vfxRef` is still null on many rows — **lab bind fills runtime**; export `exportSpellKitJson` / staff binds for ObjectStore later.

---

## 7. Agent rules

1. Name layers correctly: **Ability TRAVEL** ≠ **presentation particles** ≠ **path mode**.
2. Master four materials before inventing a fifth Ability class.
3. New skill look = bind row + knobs + optional presentation recipe.
4. Staff skills always `animPack: magic`, `animRole: cast` unless catalog says otherwise.
5. Smoke = fire particles; wind = WindMaterial; ice water = OceanWaterMaterial; nature earth = RockMaterial + plates.
