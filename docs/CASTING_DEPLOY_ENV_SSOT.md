# Casting deploy + env + data SSOT

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
| JSON catalogs / gamedata | ObjectStore + info | `objectstore` / `info.grudge-studio.com` |
| Asset **index** | Cloudflare D1 | not player SSOT |
| Weapon skill drafts + equip mirror | **CF Durable Object** `WeaponSkillDrafts` | `https://weapon-skills.grudge-studio.com` · control plane `casting.grudge.studio` · see `WEAPON_SKILL_DO_SSOT.md` |

**SPA never holds `DATABASE_URL`.** Player data only through `/api/*`.

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

Zone NS: Cloudflare. Record **missing** → NXDOMAIN.

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
curl.exe -sI https://casting.grudge-studio.com/   # after DNS
```
