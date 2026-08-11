# Grudge Casting Abilities (Three.js)

**Warlords-era lab** for Grudge Studio: Toon RTS hero, DRC combat, catalog weapon skills, elemental path cast + linear skillshots, three-layer terrain, windsurf ride, and production skill/VFX authoring before fleet ship.

**Repo:** [MolochDaGod/CastingAbilitiesThreeJS](https://github.com/MolochDaGod/CastingAbilitiesThreeJS)  
**Live (control plane):** [casting.grudge.studio](https://casting.grudge.studio) — dev → production lab  
**Weapon skill DO:** [weapon-skills.grudge-studio.com](https://weapon-skills.grudge-studio.com/api/health)  
**Live (Vercel):** [casting-abilities-threejs.vercel.app](https://casting-abilities-threejs.vercel.app)  
**API/DB:** same-origin `/api/*` → Railway `grudge-api` → Postgres · `docs/CASTING_DEPLOY_ENV_SSOT.md`  
**Skills DO:** `docs/WEAPON_SKILL_DO_SSOT.md`  
**Team:** Vercel `grudgenexus` · project `casting-abilities-threejs`

### Hosts

| Host | Role |
|------|------|
| `casting.grudge.studio` | **Primary lab** — equip / promote / handoff |
| `weapon-skills.grudge-studio.com` | CF Worker + Durable Object (CNAME live) |
| `casting-abilities-threejs.vercel.app` | Project hostname |
| `casting.grudge-studio.com` | Legacy (optional) |

---

## Stack (fleet package gate)

| Package | Role |
|---------|------|
| `three` ^0.185 | Renderer / GLTF / AnimationMixer · Draco + Meshopt + KTX2 |
| `@dimforge/rapier3d-compat` ^0.19 | Ground heightfield + human CCT (SI capsule) |
| `xstate` | Player activity machine |
| VFX beauty | [vfxgrudge.puter.site](https://vfxgrudge.puter.site/) → `src/vfx/VfxDirector.js` |

**Do not** reintroduce Mixamo FBX as play, Meshy heroes, dual mixers, dual Draco loaders, or OrbitControls during combat TPS.

### Loaders (shared pipeline)

| Decoder | Pin |
|---------|-----|
| Draco | `gstatic` versioned **1.5.7** |
| Meshopt | three `meshopt_decoder` |
| KTX2 / Basis | `three@0.185.1` basis transcoder · bind after WebGLRenderer |

Code: `src/loaders/gltfPipeline.js` · `AssetLoader` · **one** `sharedGltfLoader()` for weapons / projectiles / equip.  
Audit: `docs/LOADER_DRACO_KTX2_AUDIT.md` · health: `docs/SYSTEMS_HEALTH_AUDIT.md`

---

## Combat · skills · VFX (production pattern)

| Layer | Role |
|-------|------|
| Catalog skills | `master-weaponSkills` / `t0-weapons` — **never invent skill ids** |
| Production package | `weaponSkillProduction.js` — anim · VFX · physics · statuses |
| Statuses | push · freeze · stun · slow · burn · root · knockup (`skillStatusSystem`) |
| Staff normal | Hotbar **1** + **focus LMB** → shared stream orb |
| Linear skillshots | ice / thunder / meteor / beam / snare / glacier (`elementalLinearCast`) |
| Path cast | Fire/Water/Earth/Wind Ability pools (draw stroke) |
| Mesh delivery | orbs · rocks · freeze nova · bubbles · dual arrows |

```bash
# Optional per-skill override scaffold
node scripts/scaffold-weapon-skill.mjs --id staff_fire_bolt --weapon STAFF
# Split multipacks → SI production meshes
node scripts/split-gd-orbs-and-charge.mjs
node scripts/split-element-attack-meshes.mjs
```

Docs: `WEAPON_SKILL_PRODUCTION_SSOT.md` · `ELEMENTAL_LINEAR_CAST_SSOT.md` · `STAFF_NORMAL_ORBS_CHARGE_SSOT.md` · `ELEMENT_ATTACK_MESHES_SSOT.md`

### Controls (combat)

| Input | Action |
|-------|--------|
| **Q** | Equip ↔ combat |
| **1–4** | Weapon skills (catalog hotbar) |
| **RMB** | Focus aim (TPS) |
| **Focus + LMB** | Staff/wand → **slot 1 normal** (orb stream) |
| **F** | Weapon primary skill |
| **Hold LMB + drag** | Path cast stroke (non-focus / freeride) |
| **Alt+Shift+Q/E/R/F/V/G** | Arm linear skillshot (MOBA aim) |

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

### VFX meshes (shipped splits — SI)

| Pack | Path | Use |
|------|------|-----|
| Element orbs | `public/models/vfx/orbs/orb-*.glb` | Staff normal projectiles (gd_orbs split) |
| Charge shell | `public/models/vfx/charge/staff-charge.glb` | Cast charge (kamehameha bake) |
| Earth rocks | `public/models/vfx/rocks/rock-0..7.glb` | Nature/earth pull → linear/aimed |
| Arrows | `public/models/vfx/arrows/arrow-path.glb` · `arrow-loft.glb` | Linear path vs lofted throw/trap |
| Summons | `public/models/vfx/summons/` | Fire fist / ice shard (legacy heavy) |
| Skill overrides | `public/skills/production/<id>.json` | Optional per-skill production tweaks |

**Never** load multipack sources whole as projectiles (`*_src.glb` = author only).

### Local only

| Resource | Path |
| --- | --- |
| HDRI | `public/hdri/spruit_sunrise.hdr` |

---

## Terrain (three layers)

| Layer | Role | Code |
|-------|------|------|
| **L0** | Height field (one sample) | `IslandHeightfield` · Rapier heightfield |
| **L1** | Surface ground colors | heightfield mesh |
| **L2** | Grass + growing forest | `StylizedGrassLayer` · `GrowingForest` |
| **L3** | Harvest rocks | `DevIslandHarvest` |
| Water | Ocean sibling | `StageWater` |

Patterns: snakey-locomotion · three-stylized · forestoutline · Rapier terrain.  
Docs: `THREE_LAYER_TERRAIN_SSOT.md` · `TERRAIN_PHYSICS_SSOT.md`

Aim / path / feet all use **one** `terrain.sample` via `projectToTerrain`.

---

## Controls

| Input | Action |
| --- | --- |
| **Hold LMB + drag** | Draw path (equip / freeride cast) |
| **Release** | Cast element — or **windsurf path course** in walk mode |
| **RMB** | Focus aim (combat) · orbit in equip |
| **Focus + LMB** | Staff normal (slot 1) |
| **M** | Cast ↔ **walk** (windsurf vehicle mode) |
| **Space** (walk, not riding) | Deploy windsurf **vehicle** (frontflip + board) |
| **E** (mounted) | **Get off** — unparent, remove board, land controller |
| **WASD** | Land move (DRC) · freeride boat thrust/turn when mounted |
| **1–4** | Weapon skills (combat) / elements (equip) |
| **Q** | Equip ↔ combat session |
| **I** | Inventory panel |
| **F** | Weapon primary skill |
| **G** | VFX editor |
| **C** | Clear effects / hard cancel ride |
| **P** | Pause |
| **H** | Help |
| **Alt+V/B/F/G/T/C** | Sandbox VFX previews |
| **Alt+Shift+Q/E/R/F/V/G** | Linear skillshot arm |

---

## Character + ride stack

- **Loader:** shared glTF pipeline (Draco + Meshopt + KTX2 after renderer bind)  
- **Clone:** SkeletonUtils / deployToonPlayKit  
- **Equip:** mesh_ids visibility (`EquipmentManager`) + catalog hand mesh  
- **Anims:** Bip001 magic + sword_shield packs (Open baked JSON) · **one mixer**  
- **Combat:** `DrcCombatController` + Rapier CCT + TPS camera + production skills  
- **Ride vehicle:** walk mode → deploy → **parent under deckCenter** → **RideIK** until **E** get-off → board removed  

```
[ ] Height ~1.55–2.05 m (bone SI fit)
[ ] Feet grounded (structural min.y / bone feet), not pelvis-as-feet
[ ] Toon play GLB only (asset-packs/toon-rts-characters/…)
[ ] One AnimationMixer; RideIK only while `_rideActive` / mounted
[ ] windsurf_package.glb 200 on prod + manifest sockets
[ ] Dismount: vehicle gone + character.restoreFromRide land loco
[ ] No bare GLTFLoader (use sharedGltfLoader)
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
  abilities/      Element path-cast Ability pools
  animation/      CharacterController, WalkController (one mixer)
  character/      toonKitPlay, RideIK, EquipmentManager, WeaponMeshAttach
  combat/         DRC, skill production, statuses, delivery, linear plan
  loaders/        gltfPipeline (Draco/Meshopt/KTX2), AssetLoader
  config/         settings, assets, grudge6SSOT, worldScale
  effects/        HoverboardRide, trails, bursts
  physics/        Rapier world + heightfield
  skillshot/      Linear skillshots (ice/thunder/meteor/…)
  ui/             HUD, inventory, editor, AdminHub
  vfx/            VfxDirector, staffOrbVfx, elementAttackVfx
  world/          IslandHeightfield, grass, forest, StageWater, harvest
public/
  models/ride/    windsurf_package.glb + manifest
  models/vfx/     orbs, charge, rocks, arrows, summons
  skills/production/  optional skill override JSON
  hdri/
docs/             CASTING_LAB · WEAPON_SKILL_PRODUCTION · THREE_LAYER_TERRAIN · LOADER audit …
scripts/          split orbs/rocks · scaffold-weapon-skill
```

### Key docs

| Doc | Topic |
|-----|--------|
| `CASTING_LAB_SSOT.md` | Lab macro map |
| `WEAPON_SKILL_PRODUCTION_SSOT.md` | Scriptable production skills |
| `ELEMENTAL_LINEAR_CAST_SSOT.md` | Element × linear merge |
| `THREE_LAYER_TERRAIN_SSOT.md` | L0–L2 terrain |
| `LOADER_DRACO_KTX2_AUDIT.md` | Decoder pins · no conflicts |
| `SYSTEMS_HEALTH_AUDIT.md` | Conflict / forget checklist |
| `FLEET_ENTRY_DEPLOY_LOADERS_RAYCAST_REVIEW.md` | Entry · deploy · raycast review |
| `ENTRY_CATCH` (gameopen) | Player start URLs · anti-loop |

### Player entry (fleet)

Use Open `PRODUCT_STARTS` / `startUrlForIntent` — not guessed hosts.  
Library: `open.grudge-studio.com` · create hero: `character.grudge-studio.com/foundry` · cabinets: `grudox.grudge-studio.com/arcade`.
