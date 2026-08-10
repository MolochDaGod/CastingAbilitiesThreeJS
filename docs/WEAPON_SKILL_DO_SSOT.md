# Weapon skill Durable Object SSOT

**Worker:** `grudge-weapon-skill-drafts`  
**Repo path:** `CastingAbilitiesThreeJS/worker`  
**DO class:** `WeaponSkillDrafts` (SQLite-backed, instance name `production`)

## Hosts

| Host | Role |
|------|------|
| **https://casting.grudge.studio** | **Control plane** — Casting lab, dev → production promote / equip mirror push |
| **https://weapon-skills.grudge-studio.com** | **Public DO API** (CNAME → Worker; production route) |
| `https://grudge-weapon-skill-drafts.grudge.workers.dev` | Fallback Worker URL |
| `https://casting.grudge-studio.com` | Legacy alias only (NXDOMAIN unless re-added) |
| `https://casting-abilities-threejs.vercel.app` | Vercel project hostname |

## Dev → production flow

```
Multiverse F4 drafts
  → PUT https://weapon-skills.grudge-studio.com/api/v1/bundle
Casting lab (casting.grudge.studio)
  → GET  equip-catalog  (merge into equipWeaponById)
  → PUT  equip-catalog  (pushLocalEquipMirror)
  → POST /api/v1/promote   (stamp production)
Fleet consumers
  → GET equip-catalog / bundle from weapon-skills.*
```

## Contracts

| Contract | Direction |
|----------|-----------|
| `grudge.weaponSkillPrefabBundle/v1` | Multiverse `exportDurableBundle()` → `PUT /api/v1/bundle` |
| `grudge.equipWeaponCatalog/v1` | Mirrors Casting `equipWeaponById` → `GET|PUT /api/v1/equip-catalog` |
| `grudge.weaponSkillPrefab/v1` | Single skill rows |

**Not** player SSOT (Railway). **Not** mesh binaries (R2).

## API

```
GET  /api/health
GET|PUT /api/v1/bundle
GET  /api/v1/skills
GET|PUT|DELETE /api/v1/skills/:id
GET|PUT /api/v1/equip-catalog
POST /api/v1/equip-catalog/weapon
POST /api/v1/promote
GET  /api/v1/meta
```

CORS: `casting.grudge.studio`, `*.grudge.studio`, `*.grudge-studio.com`, `*.vercel.app`, localhost Vite.

## Client wiring

| Surface | Module | Behavior |
|---------|--------|----------|
| Multiverse F4 | `pushDurableBundleToDo` | Push → `weapon-skills.grudge-studio.com` (fallback workers.dev) |
| Casting equip | `weaponSkillDoApi` + `t0WeaponCatalog` | Merge DO; **t0 wins on id** |
| Casting promote | `promoteCatalog` / `pushLocalEquipMirror` | Lab control plane → DO |

Env: `VITE_WEAPON_SKILL_DO_URL=https://weapon-skills.grudge-studio.com`

## Deploy

```bash
cd worker
npx wrangler deploy --env production
# route: weapon-skills.grudge-studio.com/*
```

## DNS

| Type | Name | Target |
|------|------|--------|
| CNAME | `weapon-skills` on `grudge-studio.com` | Worker / CF (live) |
| CNAME | `casting` on `grudge.studio` | Vercel (control plane) |
