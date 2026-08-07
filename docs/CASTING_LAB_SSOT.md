# Casting Lab SSOT — Warlords UX / ability effects

**Hosts:** https://casting-abilities-threejs.vercel.app · https://casting.grudge-studio.com (when DNS live)  
**Agent skill:** `~/.grok/skills/casting-warlords-lab/SKILL.md`

## Purpose

Test and push **client UX/UI** and **editable ability effects** for Warlords-era game modes.
Macro loop: learn → isolate primitives → edit knobs → bind skills → smoke → export prefab.

## What is already strong

| System | Notes |
|--------|--------|
| Element path VFX | Fire/Water/Earth/Wind full beauty stack |
| Live editor | lil-gui → `settings.js` (intensity via global/element fields) |
| VfxDirector + catalog | Aligns with vfxgrudge.puter.site |
| Toon character + packs | SI, hands-on idle, jump, cast |
| DRC combat UX | TPS, 1–4, stamina, melee/spell styles |
| World SI | `worldScale.js` MAP_SCALE 1.5 + StageWater |

## Effect primitive map (isolate for shared use)

| Primitive | Where it lives now | Prefab knobs to standardize |
|-----------|-------------------|-----------------------------|
| Trail | `settings.trail`, PathTrail, ability ribbons | width, length, opacity, color, flow, height |
| Travel | Ability path + particles | speed, size, arc height, lifetime, color |
| Cast | VfxDirector cast / hand | intensity, attach, duration |
| Impact | Burst, flash, shake, decals | aoe, intensity, life, color |
| Residual (melee) | Short path on melee skill | range, meshScale, color, contactRadius |
| Aura | fire_aura catalog | radius, spin, intensity |

## Melee → weapon-mesh projectile (target pattern)

From Open `MELEE_SLASH_FX.md` / `meleeStrikeFx`:

1. Play attack one-shot  
2. On hit frame: origin = weapon tip (or R_hand)  
3. Spawn slash_wave / getsuga residual along blade dir  
4. Profile: intensity, aoe, speed, size, color, mesh  

Casting lab **prototype:** DRC melee → short ability path.  
**Next hardening:** `getsuga_slash` + optional slash GLB + tip origin.

## Skill learning sources

| Source | Use |
|--------|-----|
| https://vfxgrudge.puter.site/ | Hotkey library + effect ids |
| https://vfx.grudge.studio/ | Full studio / export |
| Open `vfxEffectCatalog.ts` | Fleet effect id SSOT |
| `t0WeaponSkills.ts` | T0 combo kit structure |
| `grudge-vfx-orbs-strike` skill | Orbs + strawberry multi-mode |
| `elementWeaponSkills.js` | Element → cast/travel/impact bind |

## Expansion (ordered)

1. **EffectPrefab type** + export from Editor (JSON)  
2. **Melee residual** Getsuga bind on F / skill slot  
3. **Orb travel** for staff skills (not whole fireball.glb)  
4. **DRC bar icons** from warlords-hud-icons / T0  
5. **Main Panel link** (Open embed or deep link) — no second radial  
6. **Weapon pack swap** UI (magic ↔ sword_shield ↔ longbow)  

## Hard bans

- Second AnimationMixer / physics for VFX  
- Space = Getsuga (Space = jump only)  
- Whole fireball.glb as projectile  
- Invented Main Panel fork  
- Non-SI scale on weapons/orbs  

## DNS note

`casting.grudge-studio.com` requires Cloudflare CNAME (zone edit). App is always on Vercel production URL.
