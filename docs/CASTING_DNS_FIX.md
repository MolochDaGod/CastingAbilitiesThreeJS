# casting.grudge-studio.com DNS fix

**Re-diagnosed 2026-08-09**

| Check | Result |
|-------|--------|
| https://casting-abilities-threejs.vercel.app/ | **200** — app healthy |
| https://casting.grudge-studio.com/ | **NXDOMAIN** — no DNS answer (Status=3) |
| open / client / id.grudge-studio.com | Resolve OK (Cloudflare) |
| Vercel project | `casting-abilities-threejs` · domain **Verified** · DNS **Invalid** |
| Zone NS | Cloudflare `colette` / `lou` (not Vercel) |

**Root cause:** missing Cloudflare DNS record for hostname `casting`.  
Not a Vercel build, not app code, not R2.

---

## Secrets review (why agents cannot auto-fix)

| Source | Key | Status |
|--------|-----|--------|
| `F:\GitHub\ObjectStore\.env` | `CF_DNS_API_TOKEN` | **401/403 Invalid** |
| `Documents\grudox\.env.local` | `CF_DNS_API_TOKEN`, `CF_ZERO_TRUST_TOKEN`, `CLOUDFLARE_USER_API` | **401** |
| `Desktop\grudgeproduction\.env` | `Cloudflare_api_token`, `CLOUDFLARE_USER_API` | **400/401** |
| Wrangler OAuth (`~/.wrangler/config`) | oauth_token | **zone:read only** — can list zone, **cannot** create DNS |

**Action required (owner):** create a fresh Cloudflare API token:

1. Cloudflare → My Profile → **API Tokens** → Create Token  
2. Template **Edit zone DNS** (or custom: Zone → DNS → Edit, Zone → Zone → Read)  
3. Zone Resources: **Include → Specific zone → grudge-studio.com**  
4. Save value as `CF_DNS_API_TOKEN` in ObjectStore `.env` (and grudox if used)  
5. Re-run: `node scripts/fix-casting-dns.mjs`

Until that token works, DNS must be fixed in the **dashboard** or via Domain Connect (below).

---

## Fix path A — Domain Connect (fastest, one browser approve)

Open (logged into Cloudflare as zone owner):

https://vercel.com/api/v9/projects/prj_UqrvF6d04qmAFGF7N2cpzPKLoYE/domains/casting.grudge-studio.com/domain-connect/apply?teamId=team_VZ7uiFGiR9QBdqtzne04xygG

Approve the DNS change in Cloudflare → wait 1–2 min → reload https://casting.grudge-studio.com/

---

## Fix path B — Manual DNS record

**Cloudflare → grudge-studio.com → DNS → Add record**

| Field | Value |
|-------|--------|
| Type | **A** (or CNAME) |
| Name | `casting` |
| Content | **A:** `76.76.21.21` · **CNAME:** `0788085f42cc3574.vercel-dns-016.com` |
| Proxy | **DNS only** (grey cloud) first — Vercel SSL verify |
| TTL | Auto |

Then:

```bash
npx vercel domains verify casting.grudge-studio.com
curl.exe -sI https://casting.grudge-studio.com/
```

After SSL is issued you may orange-cloud proxy if desired (optional). Grey is fine for Vercel.

---

## Verify

```bash
# DoH should return A 76.76.21.21 (or Vercel CNAME chain)
curl.exe -sS "https://cloudflare-dns.com/dns-query?name=casting.grudge-studio.com&type=A" -H "accept: application/dns-json"

# App
curl.exe -sI https://casting.grudge-studio.com/
# expect HTTP/2 200 and Server: Vercel
```

**Working now without DNS:** https://casting-abilities-threejs.vercel.app/

---

## Not the problem

- Vercel production deployment (Ready, alias on project)
- Vite / Three.js app body on `*.vercel.app`
- CDN character meshes / R2
- Casting **API/DB** wiring (Railway health OK; SPA uses `/api` rewrite + fleet CORS)

## Related

- Deploy/env/API SSOT: `docs/CASTING_DEPLOY_ENV_SSOT.md`
- After DNS: `curl.exe -sI https://casting.grudge-studio.com/api/health` → Railway JSON

## Deployment note

Do not “redeploy DNS” with another Vercel build — fix Cloudflare record only.  
Prod deploy already aliases `casting.grudge-studio.com` (SSL pending DNS).
