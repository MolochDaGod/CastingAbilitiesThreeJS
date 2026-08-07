# Casting Lab SSOT — Warlords UX / ability effects

**Hosts:** https://casting-abilities-threejs.vercel.app · https://casting.grudge-studio.com (when DNS live)  
**Agent skill:** `~/.grok/skills/casting-warlords-lab/SKILL.md`  
**Repo:** `C:\Users\nugye\Documents\CastingAbilitiesThreeJS`

## Purpose

Test and push **client UX/UI** and **editable ability effects** for Warlords-era game modes  
**before** shipping to grudgewarlords.com / Open Danger / island play.

Macro loop:

```
learn source → isolate primitive → edit knobs → bind skill → smoke → export prefab JSON
```

**Not:** full MMO shell, Railway player SSOT, second combat engine, Main Panel fork.

---

## What is already strong

| System | Notes |
|--------|--------|
| Element path VFX | Fire/Water/Earth/Wind full beauty stack (`settings.fire`…) |
| Live editor | lil-gui → `settings.js` (no rebuild mid-cast) |
| **Effect Prefab folder** | intensity / AOE / speed / size / color / mesh + export JSON |
| VfxDirector + catalog | Aligns with vfxgrudge.puter.site |
| **F = melee residual** | Attack anim + tip spawn + `settings.residual` knobs |
| Toon character + packs | SI, hands-on idle, jump/double/backflip, cast |
| DRC combat UX | TPS, 1–4 spells, stamina, Q equip/combat |
| World SI | `worldScale.js` MAP_SCALE 1.5 + StageWater |

---

## Effect primitives (isolate for shared use)

Author **once**, bind many skills. Do not bake one-off mega-shaders per skill.

| Primitive | Casting source | Open / fleet source | Edit knobs |
|-----------|----------------|---------------------|------------|
| **Trail** | `settings.trail`, PathTrail, ability ribbons | blade trail, strawberry trail | width, length, opacity, color, flow |
| **Travel** | Ability path + particles | orbs (`orb-fire`…), path cast | speed, size, arc, meshId, color, lifetime |
| **Cast** | VfxDirector cast / hand | fire_hand, arcane_swirl | intensity, attach bone |
| **Impact** | Burst, flash, shake, decals | inferno, frost_wave, strawberry force | aoe, intensity, life, color |
| **Residual** | F strike + `settings.residual` | Getsuga / meleeStrikeFx | range 1–10 m, meshScale, contactRadius, variant |
| **Decal** | GroundDecals | same | radius, life, colorA/B |
| **Aura** | fire_aura catalog | status aura | radius, spin, intensity |

### Schema (`src/vfx/effectPrefab.js`)

```ts
type EffectPrimitive = {
  kind: 'trail' | 'travel' | 'cast' | 'impact' | 'residual' | 'decal' | 'aura';
  intensity: number;   // 0..2
  aoe: number;         // metres
  speed: number;       // m/s
  size: number;        // SI scale
  color: string;       // #rrggbb
  meshId?: string;     // slash* | orb-* | none
  duration?: number;
  attach?: 'R_hand' | 'L_hand' | 'root' | 'feet' | 'weapon_tip';
  effectId?: string;   // catalog id
};
```

**Editor:** lil-gui → **⚡ Effect Prefab**  
**Export:** solo kind · melee residual · fire bolt · all skill pack JSON

---

## Melee → projectile from weapon mesh (learned + wired)

**Open SSOT:** `gameopen/docs/MELEE_SLASH_FX.md` · `meleeStrikeFx.ts`

| Step | Rule | Casting lab |
|------|------|-------------|
| 1 | Attack anim one-shot (`sword_shield` / pack attack) | `playWeaponAttack` / `requestOneShot('attack')` |
| 2 | Hit frame delay | `settings.residual.hitFrameDelay` (default 0.18 s) |
| 3 | Origin = weapon tip | `CharacterController.getWeaponTip` (R_hand + tipOffset) |
| 4 | Dir = blade / facing | character facing on XZ |
| 5 | Spawn residual | `VfxDirector.deploy('getsuga_slash', { fromTip })` + short path |
| 6 | Profile knobs | range, speed, meshScale, contactRadius, aoeRadius, color, variant |

**Input:** **F** = melee residual · **Space** = jump only · **1–4** = element spells  
**Never:** free Space Getsuga · whole `fireball.glb` as bolt

### Open profile examples (1H) — learn ranges

| Stage | Range | Variant | meshScale |
|-------|-------|---------|-----------|
| light | ~1.15 m | slashblue | 0.55 |
| mid | ~4 m | slashblue | 0.9 |
| finisher | ~9 m | slashyellow | 1.35 |

Lab default residual: range **3.2 m**, slashblue, meshScale **0.9** — tune in editor.

---

## Skill ability sources (do not miss)

| Source | Path / URL | Learn |
|--------|------------|--------|
| **vfxgrudge panel** | https://vfxgrudge.puter.site/ | Hotkeys V/B/F/G/T/C + library |
| **VFX Studio** | https://vfx.grudge.studio/ | Full library / skillswrite |
| **Open catalog** | `artifacts/animator/src/three/fx/vfxEffectCatalog.ts` | Stable effectIds |
| **Casting catalog** | `src/vfx/vfxCatalog.js` | Bound subset + SKILL_VFX_BIND |
| **meleeStrikeFx** | `artifacts/animator/src/three/combat/meleeStrikeFx.ts` | Residual profiles |
| **MELEE_SLASH_FX** | `gameopen/docs/MELEE_SLASH_FX.md` | Deterministic residual rules |
| **Orbs** | `docs/vfx/FIREBALL_ORBS.md` · `models/vfx/orbs/*` | Staff projectiles (not whole fireball) |
| **Strawberry** | `docs/vfx/STRAWBERRY_STRIKE_MULTI_FX.md` | force / trail / slash / cool modes |
| **T0 kits** | `t0WeaponSkills.ts` | Combo/Special/Ranged/Power |
| **Element trees** | `src/combat/elementWeaponSkills.js` | cast/travel/impact per staff |
| **Blade trail** | Open `Vfx.bladeTrailSegment` · Studio swingTimer | grip→tip ribbon |
| **Slash meshes** | `models/vfx/slash/slash{color}.glb` | Residual visuals |
| **Kenney audio** | kenney-audio skill | Hit/cast SFX pairs |

### Harvested gaps → lab status

| Opportunity | Status |
|-------------|--------|
| Getsuga residual on F | **Wired** (`useMeleeStrike` + residual knobs) |
| EffectPrefab export | **Wired** (Editor ⚡ folder) |
| Orb travel for staff | Next — bind `meshId: orb-*` to Ability travel |
| Blade trail during swing | Next — sample tip each frame in hit window |
| Strawberry force/cool presets | **Editor buttons** apply knobs (no mesh yet) |
| Main Panel T0 icons on DRC bar | Next — icons only, no new radial |
| Wind SKILL_VFX_BIND | **Fixed** |
| Arcane SKILL_VFX_BIND | **Fixed** |

---

## Animation learning (smooth, clean)

| Role | Lab clips | Expansion |
|------|-----------|-----------|
| idle | prod magic standing-idle (**hands**) | per weapon pack idle |
| walk/run | magic walk/run | locomotion_8way later |
| cast | 1h/2h cast | channel loop overlay |
| attack | sword_shield attack | combo stages 0–2 |
| jump | standing-jump | fall / land |
| backflip | procedural + jump | baked flip if added |

**Rules:** rotation-only tracks; prod-first; rematch bones-only; re-ground after equip; one mixer; RideIK only mounted.

---

## UX expansion (Warlords game modes)

```
casting lab
  ├─ Combat mode (TPS · WASD · 1–4 · F residual · Space jump)
  ├─ Equip / inventory mesh_ids
  ├─ Path cast + VFX editor + Effect Prefab export
  ├─ Element bar + optional ?arcane=1 tree
  └─ Walk ride (optional)
         │
         ▼ push contracts only (JSON prefab + feel)
  grudgewarlords.com / Open Danger / island
```

**Do not** rebuild Main Panel radial inside casting — link/embed Open when ready.

---

## Agent skill-learning loop

```
1. Load casting-warlords-lab + grudge-vfx-hotkeys + grudge-vfx-orbs-strike + combat-runtime
2. Identify primitive (trail|travel|cast|impact|residual)
3. Find existing settings / catalog id — extend, don't fork
4. Knobs in settings.effect + settings.residual + Editor
5. Wire VfxDirector.deploy / Ability / useMeleeStrike
6. Smoke on casting-abilities-threejs.vercel.app
7. Export prefab JSON for Warlords import
```

### Confirmation gates

```
[x] EffectPrefab type + export
[x] Melee residual from weapon tip + hit frame (F)
[ ] Orb travel for staff (meshId orb-*)
[ ] Blade trail grip→tip during attack window
[ ] Space = jump only (not Getsuga)
[ ] Orbs not whole fireball.glb
[ ] SI sizes
[ ] Shared primitive reusable by ≥2 skills
[ ] Editor knobs map 1:1 to settings fields
```

---

## Repo anchors

| Concern | File |
|---------|------|
| Live params | `src/config/settings.js` (`effect`, `residual`, elements) |
| Prefab schema / export | `src/vfx/effectPrefab.js` |
| World SI | `src/config/worldScale.js` |
| VFX catalog | `src/vfx/vfxCatalog.js` |
| Deploy beauty | `src/vfx/VfxDirector.js` |
| Editor | `src/ui/Editor.js` (⚡ Effect Prefab) |
| DRC skills | `src/combat/drcSkills.js` · `elementWeaponSkills.js` |
| Melee F strike | `src/combat/DrcCombatController.js` `useMeleeStrike` |
| Weapon tip | `src/animation/CharacterController.js` `getWeaponTip` |
| Element path FX | `src/abilities/*Ability.js` |

## Sibling skills

`grudge-studio` · `grudge6-full-stack` · `grudge6-combat-runtime` · `grudge-fleet-combat` ·  
`grudge-vfx-hotkeys` · `grudge-vfx-orbs-strike` · `craftpix-rpg-mmo-ui` · `kenney-audio`

## DNS note

`casting.grudge-studio.com` requires Cloudflare CNAME (zone edit). App is always on Vercel production URL.
