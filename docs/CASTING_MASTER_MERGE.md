# Casting Master Merge — Linear + CastingAbilities → Islands

**Version:** 1.2.0  
**Sources:**

| Repo | Role |
|------|------|
| [LinearAbiltyCastingThreeJS](https://github.com/MolochDaGod/LinearAbiltyCastingThreeJS) | Line/zone skillshots, procedural GLSL materials, MOBA aim |
| [CastingAbilitiesThreeJS](https://github.com/MolochDaGod/CastingAbilitiesThreeJS) | Path cast, weapon skills, VfxDirector, three-layer terrain, staff orbs |
| [simonstorlschulke threejs-examples scene 0](https://simonstorlschulke.github.io/threejs-examples/?scene=0) | Infinite terrain / height sample patterns (L0 SSOT) |

## What shipped in Grudge Builder

| Path | Content |
|------|---------|
| `shared/casting/masterCatalog.ts` | Product→linear map, cast planner, terrain rules |
| `client/src/island3d/casting/` | Vendored skillshot + shaders + path abilities + **CastingMaster** |
| `client/src/island3d/vfx/WorldFxBus.ts` | `attachCastingMaster` / `castSkill` |
| `client/public/api/v1/casting-master-contract.json` | Public contract for **info.grudge-studio.com** |
| `client/public/api/v1/casting-lab-contract.json` | Lab SDK contract |

## Three-layer islands

```
L0 height     — one sample for feet · mesh · aim · grass
L1 surface    — visual ground on L0
L2 vegetation — grass / forest (heightSample callback)
L3 detail     — rocks / harvest
water         — sibling (not L1)
```

Code: `island3d/casting/world/terrainLayers.js` (+ IslandHeightfield, StylizedGrass, GrowingForest).

## Linear skillshots (styles)

| Id | Name | Shape | Product elements |
|----|------|-------|------------------|
| ice | Frost Lance | line | ice |
| thunder | Storm Lance | line | storm |
| meteor | Cinder Fall | line | fire |
| beam | Nova Beam | line | holy |
| snare | Voltaic Snare | zone | arcane |
| glacier | Glacier Wall | zone | nature |

Hotkeys (lab): Q / E / R / F / V / G

## GLSL

- `shaders/lib/common.glsl.js` — soft particles, fresnel, dissolve, gradients  
- `shaders/lib/noise.glsl.js` — simplex, fbm, ridged, curl, voronoi  
- Materials under `skillshot/materials/` and `materials/` — ice, lightning, meteor, beam, snare, glacier, fire, trail, wind, water  

## Runtime API

```ts
import { getWorldFxBus } from '@/island3d/vfx/WorldFxBus';
import { SpellFxSystem } from '@/island3d/vfx/SpellFxSystem';

const bus = getWorldFxBus(scene);
const spellFx = new SpellFxSystem({ parent: scene });
bus.attachCastingMaster({ spellFx, getHeight: (x, z) => heightAt(x, z) });

bus.castSkill({
  skill: { element: 'fire', id: 'staff_fire_bolt' },
  origin: player.position,
  direction: aimDir,
  distance: 14,
  intensity: 1,
});
```

## info.grudge-studio.com

Mirror / fetch:

- `https://client.grudge-studio.com/api/v1/casting-master-contract.json`  
- Lab: `https://casting.grudge.studio/api/v1/casting-lab-contract.json`  

## Deploy

| Target | Command |
|--------|---------|
| Grudge Builder (Vercel) | `npm run build:client` · existing project aliases |
| Casting lab | `cd CastingAbilitiesThreeJS && npx vercel --prod` |
| Contract only | ship `casting-master-contract.json` on client public |

## Do not

- Second heightmap for feet vs grass  
- Empty AnimationClips / dual mixers for cast tells  
- Invent skill ids outside master-weaponSkills / t0 catalog  
