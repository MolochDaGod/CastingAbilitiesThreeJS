# Grudge Casting Abilities (Three.js)

Elemental casting sandbox for **Grudge Studio**: draw a path, release, and Fire / Water / Earth / Air travel the spline and detonate. Every visual parameter is live-editable in the in-game VFX editor.

This is the fleet-owned rebrand of the original bending playground: **Mixamo character models are removed**. The avatar is **grudge6** (Western Kingdoms kit) with **Bip001 magic-pack** idle + cast animations.

**Repo:** [MolochDaGod/CastingAbilitiesThreeJS](https://github.com/MolochDaGod/CastingAbilitiesThreeJS)  
**Live:** [casting-abilities-threejs.vercel.app](https://casting-abilities-threejs.vercel.app)

---

## About

| | |
|---|---|
| **Product** | Casting Abilities — elemental VFX sandbox (not a full MMO shell) |
| **Engine** | Three.js `^0.185` + Vite + hand-written GLSL |
| **Character** | grudge6 race kit `WK_Characters.glb` from `assets.grudge-studio.com` |
| **Animations** | Bip001 JSON under `open.grudge-studio.com/anims/baked/magic/…` |
| **Scale** | SI units — hero fitted to ~**1.8 m**, feet grounded from skinned body min.y |
| **VFX** | Fire / Water / Earth / Air abilities + path ride (air scooter) |

### What changed (this version)

- Removed `public/models/Standing Idle.fbx` (Mixamo) and local pixel albedo atlas
- Character + atlas load from **Grudge CDN** (R2); clips from **Open** baked anims (CORS `*`)
- Single `AnimationMixer`, rotation-only tracks, art-forward **+Z**, grudge6 bone-aware sit pose
- Cast flourishes play `magic/standing 1h cast spell 01` when an ability is released
- README / branding updated for Grudge Studio fleet deploy on **Vercel**

### What stayed

- Path-draw casting, walk/ride mode, lil-gui VFX editor, HDRI environment, post stack

---

## Quick start

```bash
npm install
npm run dev
```

Open the URL Vite prints (default <http://127.0.0.1:5173>).

```bash
npm run build
npm run preview
```

**Network:** first boot fetches the race kit + atlas from `assets.grudge-studio.com` and magic clips from `open.grudge-studio.com`. Offline boot without those hosts will fail character load.

---

## Assets (SSOT)

| Resource | URL |
| --- | --- |
| Race kit (GLB) | `https://assets.grudge-studio.com/models/grudge6/races/WK_Characters.glb` |
| Race atlas | `https://assets.grudge-studio.com/textures/grudge6/western-kingdoms/WK_Standard_Units.webp` |
| Idle clip | `https://open.grudge-studio.com/anims/baked/magic/standing%20idle.json` |
| Cast clip | `https://open.grudge-studio.com/anims/baked/magic/standing%201h%20cast%20spell%2001.json` |
| Local HDRI | `public/hdri/spruit_sunrise.hdr` |

Code SSOT: `src/config/assets.js`.

**Do not** reintroduce Mixamo FBX, Meshy heroes, or a second physics/mixer stack.

---

## Controls

| Input | Action |
| --- | --- |
| **Hold LMB + drag** | Draw a path on the ground |
| **Release** | Cast the selected element — or ride the path in walk mode |
| **RMB + drag** | Orbit camera |
| **M** | Toggle **cast** / **walk** mode |
| **1 / 2 / 3 / 4** | Fire / Water / Earth / Air |
| **Q / E** | Cycle elements |
| **G** | Show/hide VFX editor |
| **C** | Clear effects (cancel ride) |
| **P** | Pause / resume |
| **T** | Toggle standing idle ↔ meditation sit |
| **H** | Hide help |

---

## Project layout

```
src/
  abilities/      Element abilities + pool manager
  animation/      grudge6 CharacterController, SittingPose, bakeClip, walk ride
  assets/         Procedural rocks / plates / shards
  config/         settings.js + assets.js (CDN SSOT)
  core/           App, renderer, camera, time
  effects/        Trails, scooter, bursts, shadows
  loaders/        AssetLoader (GLTF + HDR + textures)
  materials/      GLSL materials
  postprocessing/ Grade + distortion stack
  ui/             HUD + lil-gui editor
public/
  hdri/           Local environment probe only
```

---

## Deploy (Vercel)

```bash
# from repo root (linked to a Vercel project)
npm run build
vercel --prod
```

`vercel.json` uses Vite framework, `dist` output. Character bytes are **not** bundled — CDN + Open at runtime.

Suggested project name: **`casting-abilities-threejs`** under the Grudge Vercel team (`grudgenexus`).

---

## Character correctness checklist

```
[ ] Height ~1.55–2.05 m after fit
[ ] Feet on ground (body min.y), not pelvis-as-feet
[ ] Facing +Z when root yaw = 0 (art-forward π/2 on kit)
[ ] Idle from magic/standing idle (Bip001), not mixamorig
[ ] One AnimationMixer only
[ ] Cast one-shot returns to idle
```

Skills: `grudge6-cdn-ssot`, `grudge-character-correctness`, `grudge-studio`.

---

## License

See [LICENSE](./LICENSE). HDR probe and third-party packs keep their original terms. grudge6 race kits and baked anims are Grudge Studio production assets served from fleet CDN/Open hosts.
