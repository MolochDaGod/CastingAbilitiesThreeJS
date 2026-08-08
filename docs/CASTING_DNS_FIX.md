# casting.grudge-studio.com DNS fix

**Diagnosed 2026-08-08:** custom domain **NXDOMAIN** (no DNS record).  
**App is healthy** on Vercel production.

| URL | Status |
|-----|--------|
| https://casting-abilities-threejs.vercel.app/ | **200** works |
| https://casting.grudge-studio.com/ | **broken** — no Cloudflare DNS A/CNAME |

Vercel already aliases the project to `casting.grudge-studio.com`. Nameservers for the zone are **Cloudflare** (`colette` / `lou`), not Vercel.

## Fix (1 minute in Cloudflare)

1. Open **Cloudflare** → zone **grudge-studio.com** → **DNS** → **Records**
2. **Add record**:
   - **Type:** `A`
   - **Name:** `casting`
   - **IPv4 address:** `76.76.21.21` (Vercel)
   - **Proxy status:** **DNS only** (grey cloud) — required for Vercel SSL verify
   - **TTL:** Auto
3. Save → wait ~30–120s
4. Open https://casting.grudge-studio.com/

**Alternate:** `CNAME` `casting` → `cname.vercel-dns.com` (also DNS only).

## After DNS is set

```bash
# optional verify
node scripts/fix-casting-dns.mjs   # needs a valid CF_DNS_API_TOKEN with Zone.DNS Edit
vercel domains verify casting.grudge-studio.com
curl -sI https://casting.grudge-studio.com/
```

## API tokens

ObjectStore / grudox `.env` `CF_DNS_API_TOKEN` values currently return **403 Invalid access token**.  
Create a new token: Cloudflare → My Profile → API Tokens → **Edit zone DNS** for `grudge-studio.com` → save as `CF_DNS_API_TOKEN`.

## Not the problem

- Vercel project build (**Ready**)
- Alias assignment on project
- App code / R2 meshes
