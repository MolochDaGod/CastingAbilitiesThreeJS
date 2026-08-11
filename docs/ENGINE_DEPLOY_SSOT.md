# Casting engine + deploy SSOT (lab → client production)

**Host:** https://casting.grudge.studio (control plane) · Vercel `casting-abilities-threejs`  
**Stack:** **vanilla Three.js ^0.185** + **@dimforge/rapier3d-compat ^0.19** + Vite 8 — **not R3F**

R3F lives on Forge / other fleet apps. Do **not** add `@react-three/fiber` here — one scene graph, one mixer, one Rapier world.

---

## Two systems people confuse (not duplicates)

| Name | File | What it is |
|------|------|------------|
| **`LAYER` (render)** | `src/core/Layers.js` | Camera bit mask: WORLD=0 · VFX=1 · DISTORTION=2 · CONTACT=3 |
| **`TERRAIN_LAYER` L0–L3** | `src/world/terrainLayers.js` | Authoring labels only (height / surface / vegetation / detail) |
| **Overhead bars** | `src/ui/OverheadNameplates.js` | **HTML/DOM** nameplates for dummies — not a Three layer |
| **Camera** | `src/core/CameraRig.js` | **One** PerspectiveCamera · orbit sandbox / TPS combat · Orbit never writes mid-TPS combat |

Dummy bars floating on a black void was **not** a second camera — land vertex colors matched void `#14181d` + low ambient. Fixed: meadow colors + fill light.

---

## Engine ownership

| Concern | Module |
|---------|--------|
| WebGL + tone map knobs | `src/core/Renderer.js` |
| Scene / sun / fog / HDR IBL | `src/world/Environment.js` |
| Post (depth · distortion · bloom · grade) | `src/postprocessing/PostProcessing.js` |
| Rapier heightfield + CCT | `src/physics/PhysicsWorld.js` |
| Island mesh + sample | `src/world/IslandHeightfield.js` |
| Character / equip / hold pose | `src/animation/CharacterController.js` |
| Combat / skills / residual | `src/combat/DrcCombatController.js` |
| SFX | `src/audio/skillSfx.js` |
| HUD CraftPix chrome | `src/ui/craftpixUi.js` · **same-origin** `/ui/craftpix` |
| Bars pack | `src/ui/barsHudUi.js` · same-origin `/hud/bars` |

---

## Dev environment

```bash
cd CastingAbilitiesThreeJS
npm install
npm run dev          # Vite → http://localhost:5173
# optional: .env.local with VITE_FLEET_API=https://grudge-api-production-0d46.up.railway.app
```

Smoke local:

```bash
npm run build && npm run preview
```

---

## Production deploy (client handoff quality gate)

```bash
npm run build
npx vercel --prod --yes
# aliases: casting.grudge.studio · casting.grudge-studio.com (vercel.json)
```

| Gate | Check |
|------|-------|
| Build | `npm run build` exits 0 (no missing exports) |
| Boot | Loader → “Ready — Dev Island”, `window.app` set |
| Scene | Green/meadow island visible, hero skinned, Draw &gt; 0 |
| HUD | CraftPix + bars load from **same origin** (no CDN CORS errors) |
| Audio | Spell cast = `cast_ramp` · impact = `impact_magic` · not death chant |
| Physics | Rapier heightfield or kinematic fallback logged |
| API | `/api/health` 200 via Vercel rewrite |

**Ship to client production** only after casting lab smoke passes. Export patterns via:

- `docs/CASTING_SDK_EXPORT_SSOT.md` · `/api/v1/casting-lab-contract.json`
- Effect prefab JSON · weapon skill production package
- **Not** a second Three/Rapier stack in the client repo — wire the same packages (`three@0.185`, `rapier3d-compat`)

---

## npm pin (do not invent)

| Package | Role |
|---------|------|
| `three` ^0.185.1 | Scene · GLTF · AnimationMixer · post addons |
| `@dimforge/rapier3d-compat` ^0.19 | Heightfield + CCT |
| `xstate` | Player activity machine |
| `lil-gui` | Lab editor only |
| `vite` ^8 | Build / dev |

No dual three, no second physics, no R3F dual renderer.

---

## Related

- `docs/CASTING_DEPLOY_ENV_SSOT.md` — hosts, env, API rewrites  
- `docs/CASTING_LAB_SSOT.md` — product role  
- `docs/WEAPON_MESH_COLLIDER_SSOT.md` — weapon volume / parry  
- `docs/THREE_LAYER_TERRAIN_SSOT.md` — L0–L3 authoring  
- `docs/COMBAT_CAMERA_FOCUS_SSOT.md` — single camera TPS/focus  
