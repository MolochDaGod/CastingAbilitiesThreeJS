# Training Room production deploy (D1 · R2 · ObjectStore · Vercel)

**Map:** `training_room` (= DevIsland = /devnode)  
**Code:** `src/config/fleetEnv.js` · `src/world/trainingRoomDeploy.js` · `src/world/trainingRoomMap.js`  
**Layout package:** `public/maps/training_room/layout.default.json`

---

## Authority split (do not invent forks)

| Concern | System | URL / path |
|---------|--------|------------|
| SPA (play + DevNode) | **Vercel** | casting.grudge.studio · casting-abilities-threejs.vercel.app |
| Player / bag / wallet | **Railway Postgres** via grudge-api | `/api/*` rewrite → Railway |
| Auth | Grudge ID | id.grudge-studio.com |
| Binary meshes / icons | **R2 CDN** | assets.grudge-studio.com |
| JSON catalogs / layouts | **info + ObjectStore** | info…/api/v1 · objectstore…/api |
| Asset **index** only | **D1** | search — never player SSOT |
| Skill drafts | CF Durable Object | weapon-skills.grudge-studio.com |

**SPA never holds `DATABASE_URL` or CF write tokens.**

---

## Best deploy path for Dev Island content

### Today (lab-on-Vercel — correct default)

1. Meshes live under `public/models/dev-island/*` → ship in `dist` on `vercel --prod`.
2. Default layout ships as `public/maps/training_room/layout.default.json`.
3. Play load order:
   - `localStorage` (author session from DevNode export)
   - same-origin `./maps/training_room/layout.default.json`
   - info / objectstore / CDN (when promoted)
   - built-in `createTrainingRoomLayout()`
4. Characters stay CDN Toon RTS; harvest rocks stay same-origin until promote.

### Promote to fleet production (R2 + D1 + info)

When content is ready for Open/client handoff (not just casting lab):

| Step | Action |
|------|--------|
| 1 | DevNode **Export** → layout JSON + **promote package** (`grudge.trainingRoomPromote/v1`) |
| 2 | Upload binaries → R2 key prefix `lab/casting/training-room/dev-island/*` |
| 3 | Insert D1 index rows from promote package `d1Index[]` (tags: casting, training_room) |
| 4 | Publish layout JSON → `info/api/v1/maps/training_room/layout.json` + objectstore mirror + R2 layout |
| 5 | Optional: set play `preferPublished` for smoke against CDN catalog |
| 6 | Forge/Open can consume `worldMeshNodes[]` (id · meshKey · kind · position · physicsLayer · location) |

**Promote package fields:**

```json
{
  "contract": "grudge.trainingRoomPromote/v1",
  "mapId": "training_room",
  "layout": { "version": 1, "nodes": [] },
  "worldMeshNodes": [],
  "d1Index": [{ "key": "lab/casting/…", "cdnUrl": "https://assets…", "tags": [] }],
  "r2Prefix": "lab/casting/training-room",
  "publishTargets": { "layoutJson": [], "binaries": "r2:…" }
}
```

---

## Vercel routing (multi-page)

| Path | Serves |
|------|--------|
| `/` · SPA routes | `index.html` play lab |
| `/devnode.html` | Training Room editor (**not** rewritten to index) |
| `/models/**` `/maps/**` `/icons/**` | static public |
| `/api/**` | Railway / assets / objectstore / info rewrites |

`vercel.json` excludes `devnode`, `maps/`, `models/`, `anims/`, `skills/`, etc. from the SPA catch-all.

---

## Env (Vercel Production)

| Name | Value |
|------|--------|
| `VITE_FLEET_API` | `same-origin` |
| `VITE_RAILWAY_API` | grudge-api Railway URL |
| `VITE_ASSETS_URL` | `https://assets.grudge-studio.com` |
| `VITE_OBJECTSTORE_URL` | `https://objectstore.grudge-studio.com` |
| `VITE_INFO_API` | `https://info.grudge-studio.com/api/v1` |
| `VITE_AUTH_URL` | `https://id.grudge-studio.com` |
| `VITE_WEAPON_SKILL_DO_URL` | `https://weapon-skills.grudge-studio.com` |

See `.env.example` · `docs/CASTING_DEPLOY_ENV_SSOT.md`.

---

## Terrain / world layers (unchanged SSOT)

L0 `IslandHeightfield` · L1 mesh · L2 grass+forest · L3 harvest · Water StageWater  
Physics: Rapier heightfield · one `terrain.sample`  
@see `docs/TRAINING_ROOM_SSOT.md` · `docs/THREE_LAYER_TERRAIN_SSOT.md`

---

## Confirmation

```
[x] fleetEnv + layout load chain (storage → published → builtin)
[x] vercel SPA rewrite keeps /devnode.html + /maps/
[x] promote package with d1Index + worldMeshNodes + R2 keys
[x] default layout in public/maps/training_room/
[ ] Owner: upload promote package to R2/D1 when ready for Open handoff
[ ] Smoke: https://casting.grudge.studio/ + /devnode.html after deploy
```
