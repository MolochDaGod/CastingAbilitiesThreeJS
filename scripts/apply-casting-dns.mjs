/**
 * Create/update casting.grudge-studio.com → Vercel A 76.76.21.21 (DNS only).
 * Loads CF_DNS_API_TOKEN + CF_ZONE_ID from Desktop secretnow.txt (or env).
 */
import fs from 'fs';

function loadSecrets(path) {
  let raw = '';
  try {
    raw = fs.readFileSync(path, 'utf8');
  } catch {
    return {};
  }
  raw = raw.replace(/^\uFEFF/, '');
  const out = {};
  for (const line of raw.split(/\r?\n/)) {
    if (!line || line.trim().startsWith('#')) continue;
    const i = line.indexOf('=');
    if (i < 1) continue;
    const k = line.slice(0, i).trim();
    let v = line.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[k] = v;
  }
  return out;
}

const secrets = {
  ...loadSecrets('C:/Users/nugye/Desktop/secretnow.txt'),
  ...loadSecrets('F:/GitHub/ObjectStore/.env'),
};

const zoneId = process.env.CF_ZONE_ID || secrets.CF_ZONE_ID;
const tokens = [
  ['CF_DNS_API_TOKEN', process.env.CF_DNS_API_TOKEN || secrets.CF_DNS_API_TOKEN],
  ['CLOUDFLARE_USER_API', process.env.CLOUDFLARE_USER_API || secrets.CLOUDFLARE_USER_API],
  ['CF_ZERO_TRUST_TOKEN', process.env.CF_ZERO_TRUST_TOKEN || secrets.CF_ZERO_TRUST_TOKEN],
  ['CF_AI_WORKERS_API', process.env.CF_AI_WORKERS_API || secrets.CF_AI_WORKERS_API],
  ['CF_WORKER_R2_API', process.env.CF_WORKER_R2_API || secrets.CF_WORKER_R2_API],
  ['CF_AI_WORKERS_API_alt', secrets.CF_AI_WORKERS_API],
].filter(([, t]) => t && t.length > 10);

console.log('zone', zoneId?.slice(0, 8), 'token candidates', tokens.length);

async function verify(token) {
  const r = await fetch('https://api.cloudflare.com/client/v4/user/tokens/verify', {
    headers: { Authorization: `Bearer ${token}` },
  });
  const j = await r.json();
  return { ok: j.success, status: j.result?.status, err: j.errors?.[0]?.message, http: r.status };
}

async function dnsList(token) {
  const r = await fetch(
    `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records?name=casting.grudge-studio.com`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const j = await r.json();
  return { ok: j.success, result: j.result || [], err: j.errors?.[0]?.message, http: r.status };
}

async function upsertA(token) {
  const body = {
    type: 'A',
    name: 'casting',
    content: '76.76.21.21',
    ttl: 1,
    proxied: false,
    comment: 'Vercel casting-abilities-threejs',
  };
  const list = await dnsList(token);
  if (!list.ok) throw new Error(`list failed: ${list.err || list.http}`);

  let out;
  if (list.result.length) {
    const rec = list.result[0];
    if (rec.type !== 'A') {
      await fetch(
        `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records/${rec.id}`,
        { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } },
      );
      out = await (
        await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        })
      ).json();
      console.log('replaced', rec.type, '→ A', out.success, out.errors?.[0]?.message || '');
    } else {
      out = await (
        await fetch(
          `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records/${rec.id}`,
          {
            method: 'PUT',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
          },
        )
      ).json();
      console.log('updated A', out.success, out.result?.content, 'proxied', out.result?.proxied);
    }
  } else {
    out = await (
      await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      })
    ).json();
    console.log('created A', out.success, out.result?.content, 'proxied', out.result?.proxied);
  }
  if (!out.success) throw new Error(out.errors?.[0]?.message || 'upsert failed');
  return out;
}

async function probeDoh() {
  for (let i = 0; i < 12; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const j = await (
      await fetch(
        'https://cloudflare-dns.com/dns-query?name=casting.grudge-studio.com&type=A',
        { headers: { accept: 'application/dns-json' } },
      )
    ).json();
    const ans = (j.Answer || []).map((a) => a.data).join(',');
    console.log('DoH', i, 'status', j.Status, ans || '(empty)');
    if (ans.includes('76.76.21.21')) {
      try {
        const http = await fetch('https://casting.grudge-studio.com/', {
          redirect: 'follow',
        });
        console.log('HTTP casting', http.status);
      } catch (e) {
        console.log('HTTP casting err', e.message);
      }
      try {
        const h = await fetch('https://casting.grudge-studio.com/api/health');
        const t = await h.text();
        console.log('HTTP /api/health', h.status, t.slice(0, 120));
      } catch (e) {
        console.log('health err', e.message);
      }
      return true;
    }
  }
  return false;
}

let token = null;
for (const [name, t] of tokens) {
  const v = await verify(t);
  console.log(name, 'verify', v.http, v.ok, v.status || v.err || '');
  if (!v.ok) continue;
  const d = await dnsList(t);
  console.log(name, 'dns', d.http, d.ok, d.err || `count=${d.result.length}`);
  if (d.ok) {
    token = t;
    console.log('using', name);
    break;
  }
}

if (!token) {
  console.error('No CF token with Zone DNS Edit. secretnow CF_DNS_API_TOKEN is invalid/revoked.');
  console.error('Mint new token: Cloudflare → API Tokens → Edit zone DNS → grudge-studio.com');
  process.exit(2);
}

await upsertA(token);
const ok = await probeDoh();
process.exit(ok ? 0 : 1);
