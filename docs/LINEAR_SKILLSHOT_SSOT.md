# Linear skillshots — LinearAbilityCastingThreeJS → Casting lab

**Upstream learn:** https://github.com/achrefelouafi/LinearAbiltyCastingThreeJS  
**Local ref:** `Documents/_refs/LinearAbiltyCastingThreeJS`  
**Integration:** `src/skillshot/*` · `LinearSkillBridge.js`  
**Live:** casting.grudge.studio · casting.grudge-studio.com (same Vercel deploy)

Does **not** replace path-cast Fire/Water/Earth/Wind staff strokes. Adds a **second** pooled skillshot system.

---

## What we learned (best practices)

| Practice | Upstream | Casting use |
|----------|----------|-------------|
| **Settings SSOT** | Every metre/colour/time sampled live each frame | `skillshot/linearSettings.js` |
| **No alloc on cast** | ObjectPool per ability type | `skillshot/abilities/AbilityManager.js` |
| **Phase machine** | travel → impact → fade → done | `Ability.js` base |
| **Constant m/s front** | Frame-rate independent line advance | base Ability |
| **MOBA aim** | Line arrow · zone circle (metres, SDF) | `AimController` + Aim/Zone indicators |
| **Procedural FX** | Geometry + GLSL, no sprite sheets | materials + `ProceduralGeometry` |
| **Variants / intensity** | global multipliers + per-ability knobs | `applyIntensity()` + editor later |
| **Ground marks** | FROST / ARC / SCORCH + fissures | extended `DecalType` + FissureSystem |
| **Post** | Grade + distortion (already in casting) | shared PostProcessing |

---

## Skill map

| Hotkey | Linear id | Shape | Product element map |
|--------|-----------|-------|---------------------|
| **Alt+Shift+Q** | ice | LINE | ice |
| **Alt+Shift+E** | thunder | LINE | storm |
| **Alt+Shift+R** | meteor | LINE | fire |
| **Alt+Shift+F** | beam | LINE | holy |
| **Alt+Shift+V** | snare | ZONE | arcane |
| **Alt+Shift+G** | glacier | ZONE | nature |

1. Hold **Alt+Shift** + key → arm indicator  
2. Aim with mouse  
3. **LMB** → fire  
4. **Esc** → cancel arm  

Combat path cast (draw path) and DRC skills stay on bare keys.

---

## Code layout

```
src/skillshot/
  LinearSkillBridge.js     App bridge
  AimController.js
  linearSettings.js        full knob SSOT from upstream
  ProceduralGeometry.js    crystals / ribbons / asteroids
  abilities/               Ice Thunder Meteor Beam Snare Glacier
  materials/               Ice Lightning Meteor Beam Snare Glacier FrostField
  effects/                 AimIndicator ZoneIndicator GroundFissures
```

---

## Merge with weapon skills (next)

| Step | Action |
|------|--------|
| 1 | ~~Port skillshot kit + bridge~~ |
| 2 | Wire `castToward` from DRC skill release when skill `delivery=line` |
| 3 | Intensity tiers T0–T3 → `linearSettings.global` + ability scale |
| 4 | Texture variants for residual slash + skillshot materials |
| 5 | Editor folder for linear knobs (subset of 938) |
| 6 | Export effect-prefab packs for Open / Warlords |

---

## Agent rules

1. Extend `skillshot/` + bridge — do **not** fork a third AbilityManager  
2. Path-cast staff and skillshots share particles/decals/lights/post  
3. SI metres only  
4. One AnimationMixer on hero  
5. Smoke both hosts after deploy  
