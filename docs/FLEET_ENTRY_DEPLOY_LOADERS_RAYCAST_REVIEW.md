# Review: player entry · deploy · loaders · anim · textures · raycast

**Date:** 2026-08 · **Scope:** fleet + Casting lab  
**Status:** review of live SSOT / code — gaps called honestly  

---

## 1. Player entry paths (start points)

**SSOT:** `gameopen/docs/ENTRY_CATCH_SSOT.md` · `artifacts/animator/src/lib/entryCatch.ts`  
**Rule:** use `PRODUCT_STARTS` / `startUrlForIntent` — never invent hosts.

| Intent | Start URL | Notes |
|--------|-----------|--------|
| Open library | https://open.grudge-studio.com/ | Steam-like hub |
| Danger Room | https://open.grudge-studio.com/danger | Combat lab on Open |
| Account / roster | https://open.grudge-studio.com/account | After Foundry handoff |
| Campfire roster | https://open.grudge-studio.com/characters | 4-seat hub (not AccountPanel) |
| Sign-in | https://open.grudge-studio.com/login | `returnTo` via `safeReturnUrl` only |
| Create hero | https://character.grudge-studio.com/foundry | Create-only |
| Foundry 4-slot | https://character.grudge-studio.com/ | Hub |
| Warlords home | https://client.grudge-studio.com/home-island?characterId= | Needs id |
| Warlords map | https://client.grudge-studio.com/island-3d?mode=lobby | Sector sail |
| GRUDOX arcade | https://grudox.grudge-studio.com/arcade | Cabinets never Open Danger |
| Cabinet play | https://grudox.grudge-studio.com/arcade/play/&lt;id&gt; | racer, zombie, z-brawl… |
| Mine-Loader | https://mineloader.grudge-studio.com/ | Realms islands |
| Casting lab | https://casting-abilities-threejs.vercel.app / casting.grudge-studio.com | Warlords UX + skills proof |
| Player+grass | https://threejs-player-and-grass.vercel.app/play | L0–L3 grass lobby |

### Catch rules (must keep)

| Wrong landing | Fix |
|---------------|-----|
| Open `/arcade/play/racer` | → GRUDOX arcade |
| Open `?mode=create` / foundry | → character.grudge-studio.com/foundry |
| Open `/home-island` | → Warlords client |
| Login return → character.* / id.* | → Open account / hub only |
| Foundry save → Open Danger by default | → home-island or account |

### Entry quality score

| Area | Grade | Note |
|------|-------|------|
| PRODUCT_STARTS table | **A** | Clear intents |
| entryCatch tests | **A** | vitest suite |
| Agent habit | **B** | Still risk of guessed hosts in ad-hoc links |
| Casting / grass satellites | **B** | Not all in PRODUCT_STARTS (lab hosts OK) |

**Best practice:** any new deep-link = one line in `PRODUCT_STARTS` + catch rule + test.

---

## 2. Deployments (production map)

**SSOT:** skill `grudge-live-servers` · gameopen deploy scripts  

| Surface | Host | Deploy | Player SSOT |
|---------|------|--------|-------------|
| **Open** | open.grudge-studio.com | Vercel `gameopen` → `artifacts/animator/dist/public` | Railway Postgres |
| **GRUDOX** | grudox.grudge-studio.com | CF Worker + Vercel SPA + Railway room | Railway |
| **Warlords client** | client.grudge-studio.com / grudgewarlords.com | GrudgeBuilder | Railway |
| **Foundry** | character.grudge-studio.com | Foundry Vercel | Railway slots |
| **Casting lab** | casting*.vercel.app | Vercel CastingAbilitiesThreeJS | Lab-only (not player bag) |
| **Assets** | assets.grudge-studio.com | R2 | binaries only |
| **Defs** | info / objectstore | CF / Pages | catalogs JSON |
| **Auth** | id.grudge-studio.com | ID worker | session JWT |

### Five-layer asset SSOT (every deploy)

| Layer | Authority |
|-------|-----------|
| Player state | Railway Postgres |
| Definitions | ObjectStore / info `/api/v1` |
| Binaries | R2 `assets.grudge-studio.com` |
| Index | D1 `api.grudge-studio.com/assets` |
| Worlds | Mine-Loader Railway |

### Deploy checklist (Open)

```
1. node scripts/verify-fleet-assets.mjs --cdn-only
2. npm run deploy:prod   # or vercel-build + vercel --prod
3. verify-fleet-assets --base https://open.grudge-studio.com
4. HEAD / + /api/health
```

### Deploy grades

| Practice | Grade | Note |
|----------|-------|------|
| CDN not git for GLB | **A** | Vercel ban large meshes |
| Same-origin `/api/*` → Railway | **A** | Open proxy |
| WS on Vercel alone | **F** | Use L2 co-locate or L3 CF Worker |
| Magic-byte verify | **B** | Scripts exist; run before wire |
| Casting prod smoke | **B** | Build green; live URL smoke optional |

---

## 3. Loaders (best practices)

**Casting:** `src/loaders/AssetLoader.js` · `DRACO_DECODER_PATH` gstatic 1.5.7  

| Practice | Status | Rule |
|----------|--------|------|
| GLTFLoader + **Draco** | ✅ | Production kits compressed |
| **Meshopt** decoder | ✅ | EXT/KHR meshopt |
| Shared LoadingManager | ✅ | Boot progress |
| Block absolute local paths in FBX | ✅ | Placeholder texture (no C:\ leaks) |
| Parallel load during cinema | Open pattern | `warmupProductionSurface` — never serial block |
| Prefer CDN URL then local | Fleet | Open rewrites `/models` → R2 |
| Magic-byte before trust | Ops | Reject HTML-as-GLB |
| Isolate multipack mesh names | Nature / orbs | Never load whole fireball / island pack |
| KTX2 / Basis | ✅ Casting `bindKtx2` + Open gltf.ts (pins aligned) | See `LOADER_DRACO_KTX2_AUDIT.md` — not a Draco conflict |

### Loader pipeline (target)

```
URL resolve (CDN / same-origin)
  → HEAD / magic-byte
  → GLTFLoader (Draco + Meshopt)
  → materials: SRGBColorSpace maps, flipY=false for glTF
  → SI fit (Box3 / target 1.8 m hero)
  → one AnimationMixer bind
```

---

## 4. Animations (best practices)

| Practice | Status | Rule |
|----------|--------|------|
| **One AnimationMixer** per body | ✅ Casting CharacterController | No second mixer for VFX |
| Bip001 packs bones-only rematch | ✅ | `stripPositions: true` |
| Role names in animLibrary | ✅ | No invented aliases |
| Prod magic idle **with hands** | ✅ assets.js note | Open idle handless = bad |
| Weapon pack swap (magic / sword / bow) | ✅ | animPackForLoadout |
| Cast / attack one-shot roles | ✅ DRC | hitFrameDelay production skill |
| RideIK post-mixer | ✅ WalkController order | update → mixer → IK |
| Multi-`pose()` unify | ❌ Ban | grudge6 correctness |

### Skill anim production loop

```
catalog skill id
  → compileProductionWeaponSkill (anim.role / clip / hitFrameDelay)
  → playWeaponCombat / requestOneShot
  → release on cast bar end
```

---

## 5. Textures · sizing (best practices)

| Practice | Status | Rule |
|----------|--------|------|
| **SRGBColorSpace** on color maps | ✅ CharacterController atlas | three r152+ |
| **flipY = false** for glTF | ✅ | Author UV convention |
| Atlas WebP on CDN | ✅ grudge6SSOT | Not raw TGA in browser |
| SI texture density | Soft | Ground/vertex color ok; no 8k full-screen |
| Hero height **1.8 m** | ✅ | WORLD / grudge6 |
| Weapon hand scale | WeaponMeshAttach | Soft width cap |
| Grass blades ~0.2–0.55 m | ✅ StylizedGrassLayer | Under human yardstick |
| Hills amp ≤ ~0.85 m | ✅ terrain.amp | Not 100× giants |
| Compress atlases / Draco kits | Ops | R2 pipeline convert skill |

### Sizing yardstick

| Asset | Target |
|-------|--------|
| Human | 1.8 m |
| Orc | ~2.0 m |
| Staff / wand | ~0.95–1.25 m hand |
| Orb projectile | ~0.45 m |
| Charge shell | ~0.35 m |
| Grass blade max | ~0.55 m |
| Island hill amp | ~0.85 m |

---

## 6. Player raycasting (best systems)

**Casting SSOT:** `terrainGround.projectToTerrain` · `MouseAim` · `PathDrawer` · `CombatFocus`

### Order (correct)

```
1. setFromCamera(ndc, camera)
2. Prefer aim colliders (walls/props) in focus
3. projectToTerrain:
     a. raycast terrain.mesh (IslandHeightfield)
     b. else plane y=0 + sample(x,z) lift
4. Soft-lock blend within cone
5. Launch origin from hand/chest (computeLaunch)
```

### Why this is “best of fleet”

| Pattern | Source | Grade |
|---------|--------|-------|
| One terrain handle for aim + path | terrainGround | **A** |
| Mesh hit then height sample | IslandHeightfield | **A** |
| Soft-lock cone | grudge-combat-targeting | **A** |
| Focus LMB → skill primary | App + DRC | **A** staff |
| Path stroke same ground | PathDrawer | **A** |
| three-mesh-bvh for complex mesh | Not default on island pad | **B** — add for dense colliders |
| BVH accelerate terrain | Gap | Optional when segments high |

### Do not

- Ray only against y=0 when heightfield is on  
- Second heightmap for feet vs aim  
- OrbitControls writing camera during combat TPS  
- Soft-lock without max angle  

### Player feet vs raycast

| System | API |
|--------|-----|
| Feet Y | `terrain.sample` / physics heightfield |
| Aim XZ | camera ray → terrain |
| Soft target | CombatFocus selected point |
| Harvest / pick | ray or proximity + same sample Y |

---

## 7. Gap list (prioritized)

| # | Gap | Priority |
|---|-----|----------|
| 1 | ~~KTX2/Basis not in AssetLoader~~ → fixed (`bindRenderer` + gltfPipeline) | Done |
| 2 | Infinite terrain stream (simonstorlschulke) not on island | Low (open world later) |
| 3 | three-mesh-bvh on aim colliders for dense props | Medium |
| 4 | PRODUCT_STARTS missing casting / grass lab URLs | Low |
| 5 | Snakey reactive trample map not ported | Low |
| 6 | Hostiles HP from production skill damage | Medium (status layer ready) |
| 7 | Always run entryCatch + CDN verify in CI | High ops |

---

## 8. Agent checklist (before “ship player path”)

```
[ ] Deep-link uses startUrlForIntent / PRODUCT_STARTS
[ ] Login returnTo passes safeReturnUrl
[ ] Deploy: CDN GLB not git; build green; smoke live host
[ ] Loader: Draco + Meshopt; SRGB; flipY false
[ ] Anim: one mixer; bones-only; strip position tracks
[ ] SI sizes vs 1.8 m human
[ ] Raycast: projectToTerrain + one height sample
[ ] Map open = same session (controller / skills kept)
```

---

## References

| Topic | Doc / code |
|-------|------------|
| Entry | `docs/ENTRY_CATCH_SSOT.md` · `entryCatch.ts` |
| Live deploy | skill `grudge-live-servers` |
| Terrain / ray | `THREE_LAYER_TERRAIN_SSOT.md` · `terrainGround.js` · `MouseAim.js` |
| Assets | `AssetLoader.js` · `grudge6SSOT.js` · `OPEN_PACKAGE_SSOT.md` |
| Combat aim | skill `grudge-combat-targeting` |
| Skills | `WEAPON_SKILL_PRODUCTION_SSOT.md` |
