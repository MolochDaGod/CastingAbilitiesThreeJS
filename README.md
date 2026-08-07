# Grudge Casting Abilities (Three.js)

Elemental casting sandbox for **Grudge Studio**: draw a path, release, and Fire / Water / Earth / Air travel the spline and detonate. Live VFX editor, DRC combat, Toon RTS hero, windsurf ride.

**Repo:** [MolochDaGod/CastingAbilitiesThreeJS](https://github.com/MolochDaGod/CastingAbilitiesThreeJS)  
**Live (Vercel):** [casting-abilities-threejs.vercel.app](https://casting-abilities-threejs.vercel.app)  
**Live (fleet):** [casting.grudge-studio.com](https://casting.grudge-studio.com) — requires Cloudflare DNS below  
**Team:** Vercel `grudgenexus` · project `casting-abilities-threejs`

### DNS for `casting.grudge-studio.com` (Cloudflare)

Apex `grudge-studio.com` NS → Cloudflare. Vercel project already has the domain + production alias.

In **Cloudflare → grudge-studio.com → DNS → Add record**:

| Type | Name | Target | Proxy |
|------|------|--------|-------|
| **CNAME** | `casting` | `0788085f42cc3574.vercel-dns-016.com` | **DNS only** (grey) first |
| or **A** | `casting` | `76.76.21.21` | DNS only first |

One-click Domain Connect (approve in Cloudflare):  
https://vercel.com/api/v9/projects/prj_UqrvF6d04qmAFGF7N2cpzPKLoYE/domains/casting.grudge-studio.com/domain-connect/apply?teamId=team_VZ7uiFGiR9QBdqtzne04xygG

Then: `vercel domains verify casting.grudge-studio.com` → SSL issues automatically.

---

## Stack (fleet package gate)

| Package | Role |
|---------|------|
| `three` ^0.185 | Renderer / GLTF / AnimationMixer |
| `@dimforge/rapier3d-compat` ^0.19 | Ground + human CCT (SI capsule) |
| VFX beauty | [vfxgrudge.puter.site](https://vfxgrudge.puter.site/) → `src/vfx/VfxDirector.js` |

**Do not** reintroduce Mixamo FBX, Meshy heroes, dual mixers, or OrbitControls during combat TPS.

---

## Assets (SSOT)

### Character (runtime CDN — not bundled)

| Resource | URL |
| --- | --- |
| **Play kit ★** | `https://assets.grudge-studio.com/asset-packs/toon-rts-characters/glb/characters/{human\|barbarian\|elf\|orc\|undead\|dwarf}.glb` |
| Race atlas (optional) | `https://assets.grudge-studio.com/textures/grudge6/…/*.webp` |
| Gear presets | `https://assets.grudge-studio.com/api/v1/grudge6-gear-presets.json` |
| Idle clip | `https://open.grudge-studio.com/anims/baked/magic/standing%20idle.json` |
| Cast clip | `https://open.grudge-studio.com/anims/baked/magic/standing%201h%20cast%20spell%2001.json` |
| Walk clip | `https://open.grudge-studio.com/anims/baked/magic/Standing%20Walk%20Forward.json` |

Code: `src/config/grudge6SSOT.js` + `src/config/assets.js`  
Deploy path: `deployToonPlayKit` (`src/character/toonKitPlay.js`) — bone SI fit, **yaw 0**, mesh_ids equip.

**Not play defaults** (author/lab only): `models/grudge6/races/*_Characters.glb` / `.fbx`

### Windsurf ride (shipped with site)

| Resource | Path |
| --- | --- |
| Package GLB | `public/models/ride/windsurf_package.glb` (~11.7 MB) |
| Hoverboard fallback | `public/models/ride/hoverboard.glb` |
| IK sockets | `public/models/ride/ride.manifest.json` |
| IK reference | `public/models/ride/ik-reference.png` |

Live: `https://casting-abilities-threejs.vercel.app/models/ride/…`  
Code: `HoverboardRide.js` + `RideIK.js` (feet → deck, hands → boom/`sailRail`)

### Local only

| Resource | Path |
| --- | --- |
| HDRI | `public/hdri/spruit_sunrise.hdr` |

---

## Controls

| Input | Action |
| --- | --- |
| **Hold LMB + drag** | Draw path |
| **Release** | Cast element — or **windsurf ride** in walk mode |
| **RMB + drag** | Orbit (equip/sandbox) · TPS yaw offset in combat |
| **M** | Cast ↔ **walk** (windsurf) |
| **WASD** | Move (DRC combat) · Shift sprint |
| **1–4** | Weapon skills (combat) / elements (equip) |
| **Q** | Equip ↔ combat session |
| **I** | Inventory panel |
| **F** | Blade / attack skill |
| **G** | VFX editor |
| **C** | Clear effects / cancel ride |
| **P** | Pause |
| **H** | Help |
| **Alt+V/B/F/G/T/C** | Sandbox VFX previews |

---

## Character + ride stack

- **Loader:** GLTFLoader + DRACO + Meshopt  
- **Clone:** SkeletonUtils / deployToonPlayKit  
- **Equip:** mesh_ids visibility (`EquipmentManager`)  
- **Anims:** Bip001 magic + sword_shield packs (Open baked JSON)  
- **Combat:** `DrcCombatController` + Rapier CCT + TPS camera  
- **Ride:** walk mode → leap → board sockets → **RideIK** post-mixer  

```
[ ] Height ~1.55–2.05 m (bone SI fit)
[ ] Feet grounded (structural min.y / bone feet), not pelvis-as-feet
[ ] Toon play GLB only (asset-packs/toon-rts-characters/…)
[ ] One AnimationMixer; RideIK only while `_rideActive`
[ ] windsurf_package.glb 200 on prod + manifest sockets
```

---

## Quick start

```bash
npm install
npm run dev
```

```bash
npm run build
npm run preview
```

First boot needs network for race kits + baked clips.

---

## Deploy (Vercel)

```bash
npm run build
vercel --prod
```

Linked project: **casting-abilities-threejs** (`grudgenexus`).  
`vercel.json`: Vite · `dist` · COOP header.

| What ships in `dist` | What loads at runtime |
| --- | --- |
| App JS/CSS, HDRI, **ride GLBs** | Toon RTS kits, atlases, anim JSON (CDN / Open) |

---

## Project layout

```
src/
  abilities/      Element abilities + pool
  animation/      CharacterController, WalkController, bakeClip
  character/      toonKitPlay, RideIK, EquipmentManager, grudge6Deploy
  combat/         DrcCombatController, skill trees
  config/         settings, assets, grudge6SSOT
  effects/        HoverboardRide, trails, bursts
  physics/        Rapier world
  ui/             HUD, inventory, editor
  vfx/            VfxDirector
public/
  models/ride/    windsurf_package.glb + manifest
  hdri/
```
