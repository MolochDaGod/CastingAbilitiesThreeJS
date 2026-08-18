# Casting deploy + env + data SSOT

## Deploy practice (one path — do not fork)

1. **Name the system** you are shipping (`DevIslandHarvest`, `SessionState.play`, clips). Do not mix unrelated dirty-tree WIP into a “fix X” deploy.
2. **Extend existing files.** No `*2` harvest / terrain / controller.
3. **Same-origin only** in the browser: `/api/assets` (cdn-proxy), `/api/open`, `/anims/baked`. Never fetch `assets.*` or `open.*` (CORS / CF hotlink).
4. **Terrain:** ship L0–L3 stylized (`IslandHeightfield` vertex colors + `StylizedGrassLayer`). Do not depend on `dl.polyhaven.org` at runtime.
5. From repo `C:\Users\nugye\Documents\CastingAbilitiesThreeJS`:
   ```text
   vercel --prod --yes
   ```
   Project: `grudgenexus/casting-abilities-threejs`. Alias: **https://casting.grudge.studio**
6. **Smoke the live host** before claiming done: HTML 200, new JS hash, one clip URL, one harvest mesh (`/models/dev-island/…`).
7. `--force` only when cache is the bug. Prefer a normal prod deploy.

---

**Hosts**

| Host | Role |
|------|------|
| **https://casting.grudge.studio** | **Control plane** — dev → production lab (primary) |
| https://weapon-skills.grudge-studio.com | Weapon skill DO + equipWeaponById mirror API |
| https://casting-abilities-threejs.vercel.app | Vercel project hostname |
| https://casting.grudge-studio.com | Legacy (prefer grudge.studio) |
| Vercel Preview | PR / branch deploys |
| `npm run dev` | Local Vite |

**Vercel project:** `grudgenexus/casting-abilities-threejs`  
**Not:** orphan project `casting.grudge-studio.com` (empty — ignore / delete later)

---

## Data plane (do not invent forks)

| Concern | System | URL |
|---------|--------|-----|
| Player characters / bag / wallet | **Railway Postgres** via grudge-api | `https://grudge-api-production-0d46.up.railway.app` |
| Auth SSO | Grudge ID | `https://id.grudge-studio.com` |
| Realtime rooms | Colyseus on same Railway | `wss://grudge-api-production-0d46.up.railway.app` |
| Binary meshes / icons | R2 CDN | `https://assets.grudge-studio.com` |
| JSON catalogs / gamedata | **info** (live) + ObjectStore **Pages** | `info.grudge-studio.com/api/v1` · `grudge-objectstore.pages.dev/api/v1` |
| Asset **index** | Cloudflare D1 | not player SSOT |
| Weapon skill drafts + equip mirror | **CF Durable Object** `WeaponSkillDrafts` | `https://weapon-skills.grudge-studio.com` · control plane `casting.grudge.studio` · see `WEAPON_SKILL_DO_SSOT.md` |
| Training Room map layout | Same-origin `maps/training_room/` → info/objectstore/R2 promote | `docs/TRAINING_ROOM_DEPLOY_SSOT.md` · R2 prefix `lab/casting/training-room` |

**SPA never holds `DATABASE_URL`.** Player data only through `/api/*`.

### Production clip + texture path (browser)

Never fetch `assets.grudge-studio.com` or `open.grudge-studio.com` from the page (R2/Open lack CORS → `getTransfer` crash).  
Live `/api/assets` goes through `api/cdn-proxy.js` (same-host Referer) so CF hotlink does not 403 images.  
`/api/objectstore` rewrites to **grudge-objectstore.pages.dev** (custom-domain `/api/v1` is 404).

| Kind | Browser URL |
|------|-------------|
| Prod baked clips | `/api/assets/prod/anims/{pack}/{clip}.json` |
| Open baked (ghost rider / longbow dodge) | `/api/open/anims/baked/…` |
| Lab-shipped clips | `/anims/baked/…` (Vercel `public/`) |
| Fall FBX | `/anim/locomotion/fall/*.fbx` |
| Sand / R2 binaries | `/api/assets/…` |

Resolver: `bakedClipUrls` — 5733a06 first-URL-that-loads lists, every remote URL wrapped in `sameOriginFleetUrl` (`/api/assets` · `/api/open`). Prefixes `prod:` · `open:` · `local:` plus unprefixed Open/prod/local fan-out. Do not fetch assets.* / open.* from the page.

---

## How the SPA talks to API/DB

```
Browser (casting.grudge.studio)
  → GET/POST /api/*          (same origin)
  → Vercel rewrite           (vercel.json)
  → Railway grudge-api
  → Postgres
  → weapon-skills.grudge-studio.com  (skill DO / equip mirror, CORS)
```

`src/api/fleetApi.js` uses:

- Production casting / vercel.app → **same-origin** (`baseUrl = ''`)
- Local vite → absolute `VITE_FLEET_API` / Railway
- Override: `VITE_FLEET_API=https://…` or `same-origin`

Railway CORS already allowlists:

- `https://casting.grudge.studio`
- `https://casting.grudge-studio.com` (legacy)
- `https://casting-abilities-threejs.vercel.app`

Same-origin is still preferred (cookies / fewer CORS footguns).

---

## Environment variables

### Vercel (Production / Preview / Development)

| Name | Value | Notes |
|------|-------|--------|
| `VITE_FLEET_API` | `same-origin` | build-time; empty string also OK |
| `VITE_RAILWAY_API` | `https://grudge-api-production-0d46.up.railway.app` | fallback |
| `VITE_AUTH_URL` | `https://id.grudge-studio.com` | |
| `VITE_ASSETS_URL` | `https://assets.grudge-studio.com` | |
| `VITE_OBJECTSTORE_URL` | `https://objectstore.grudge-studio.com` | |
| `VITE_INFO_API` | `https://info.grudge-studio.com/api/v1` | |
| `VITE_COLYSEUS_URL` | `wss://grudge-api-production-0d46.up.railway.app` | |
| `VITE_WEAPON_SKILL_DO_URL` | `https://weapon-skills.grudge-studio.com` | Multiverse bundle + equipWeaponById mirror DO |

**Do not** put `DATABASE_URL`, `CF_DNS_API_TOKEN`, or Postgres secrets on this frontend project.

### Local

Copy `.env.example` → `.env.local` (absolute Railway for vite).

---

## DNS (casting.grudge-studio.com)

Live **200** as of 2026-08-18 (legacy alias). Primary control plane is **casting.grudge.studio**.

If the alias ever NXDOMAINs again:

| Type | Name | Content | Proxy |
|------|------|---------|-------|
| A | `casting` | `76.76.21.21` | DNS only (grey) first |
| or CNAME | `casting` | `0788085f42cc3574.vercel-dns-016.com` | DNS only |

Domain Connect:  
https://vercel.com/api/v9/projects/prj_UqrvF6d04qmAFGF7N2cpzPKLoYE/domains/casting.grudge-studio.com/domain-connect/apply?teamId=team_VZ7uiFGiR9QBdqtzne04xygG

### CF secrets status (2026-08-09)

All local `CF_DNS_API_TOKEN` / `CLOUDFLARE_USER_API` copies in ObjectStore + grudox + grudgeproduction **return 401/403**.  
Wrangler OAuth: workers scopes only — **cannot write zone DNS**.

Owner must create **Edit zone DNS** token → save as `CF_DNS_API_TOKEN` →  
`node scripts/fix-casting-dns.mjs`

---

## Deploy

```bash
cd CastingAbilitiesThreeJS
npx vercel --prod
npx vercel domains verify casting.grudge-studio.com
```

Smoke:

```bash
curl.exe -sI https://casting-abilities-threejs.vercel.app/api/health
curl.exe -sI https://casting-abilities-threejs.vercel.app/devnode.html
curl.exe -sI https://casting-abilities-threejs.vercel.app/maps/training_room/layout.default.json
curl.exe -sI https://casting.grudge.studio/   # control plane
```

Training Room promote (optional fleet handoff): DevNode Export → `*-promote-*.json` → R2 + D1 + info layout upload.

---

## Data-plane audit (2026-08-18) — one player DB

**Worry:** “accounts, characters, Warlords each have their own database.”  
**Fact:** Casting does **not** own a player database. Every live host rewrites player `/api/*` to the **same** Railway Postgres (`grudge-api-production-0d46`).

| Store | What it is | Owns | Not |
|-------|------------|------|-----|
| **Railway Postgres** | One physical DB | `grudge_id` account · bag · wallet · `characters.id` UUID (`era=warlords`) | — |
| **id.grudge-studio.com** | SSO | JWT / session | Roster / bag |
| **ObjectStore / info** | JSON catalogs | Recipes, master-weapon-prefabs, skills | Ownership |
| **R2 + D1** | Binaries + **index** | GLB / icons | Bag / heroes |
| **Weapon-skill DO** | CF Durable Object | Lab skill *drafts* + equip catalog mirror | Player SSOT |
| **localStorage** | Browser | JWT cache, prefab drafts, mesh appearance | Production bag |
| **Colyseus** | Same Railway | Room session | Saves |
| **cNFT `/api/nfts`** | Chain **mirror** | Display ownership | Second bag |

### Deployments (all same player API)

| Host | Status 2026-08-18 | Player data |
|------|-------------------|-------------|
| **casting.grudge.studio** | Live 200 (primary) | `/api/*` → Railway |
| casting.grudge-studio.com | Live 200 (legacy alias) | same |
| casting-abilities-threejs.vercel.app | Live 200 | same |
| weapon-skills.grudge-studio.com | Live 200 `/api/health` | drafts only |
| Vercel Preview | branch | same rewrites |

### Duplicate confusions (do not treat as extra DBs)

| Looks like a second DB | What it actually is | Rule |
|------------------------|---------------------|------|
| `listInventory` probing `/api/account/bag` + `/materials` | Dead paths | Use `/api/account/inventory` |
| 10+ `localStorage` token keys | Fleet JWT aliases (`authConnect`) | One token, many key names |
| `playerIdentity` vs `fleetApi.listCharacters` | Handoff cache vs Railway roster | UUID from Foundry/`?characterId=` |
| Admin Hub F1–F5 drafts | localStorage authoring | Export JSON → ObjectStore; never a roster |
| D1 `weapon_prefabs` | Asset index | JSON catalog is authority |
| `WARLORDS_ENGINE_URL` (ThreeFlow) | Map/prefab deploy to R2 | Not player DB |
| Casting `worker/` Durable Object | Skill drafts | Not accounts |
| Untracked `tmp/` · `_qa_*` · extra `public/models/fish/*.glb` | Disk dumps | Not deployed SSOT |
| `objectstore.grudge-studio.com/api/v1/*.json` | Dead custom-domain path (404) | Use info + `grudge-objectstore.pages.dev` |
| `game-library.json` on info **and** Pages | 404 both | Use `canonical-items-manifest.json` |
| `/api/characters` · `/api/account/inventory` unauthed | **401** from **same** Railway | JWT required — not a missing second DB |

### Macro goal (do not grow Casting into Warlords)

Lab = **UX + Toon play proof + editable effects** before ship.  
Not: second MMO shell, second bag, second character table.

Create heroes on **character.grudge-studio.com**. Bag/craft on **grudgewarlords.com/craft/**. Play body = `loadRaceKit` / `toonKitPlay` only.

### Blob audit (admin)

| Location | Size | Git? | Action |
|----------|------|------|--------|
| `public/models/fish/species/rare/*.glb` | 59+24+22 MB | yes | Still Vercel — wrangler put >20 MB flakes |
| `public/models/vfx/summons/*` | 16+8 MB | yes | **On R2** `lab/casting/models/vfx/summons/*` (HEAD 200) |
| `public/models/ride/windsurf*` | ~23 MB | yes | **On R2** `lab/casting/models/ride/*` (HEAD 200) |
| `public/models/fish/` loose GLBs | ~335 MB | **no** | **gitignored** (`fish/*.glb` + `_bundle/`) |
| `public/models/class-forms/` · `island-scenery/` | ~74 MB | **no** | **gitignored** until convert + R2 |
| `tmp/` | ~247 MB | no | Local only (now gitignored) |
| `_qa_*.png` · `deploy-out*.txt` | ~4 MB | no | Deleted / gitignored |
| `worker/node_modules` | ~181 MB | no | Already ignored |

R2 prefix: `lab/casting/models/{fish|ride|vfx}/…`  
Ride + summons **HEAD 200** on assets.* (2026-08-18). Rare fish still Vercel-only (22–59 MB wrangler put failed).  
Resolver exists: `resolveLabAssetUrl(path, { preferCdn: true })` — **do not flip preferCdn** on loaders until fish keys are 200.  
CF Hotlink still 403s **images** on `/api/assets` with a foreign Referer; JS + Vercel-shipped GLBs are 200.

Player data law: **`grudge-production-wiring`** → `references/account-game-uuid-law.md`.
