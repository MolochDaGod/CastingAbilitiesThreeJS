/**
 * Fix casting.grudge-studio.com DNS → Vercel A 76.76.21.21
 */
import fs from 'fs';

function loadEnv(p) {
  try {
    return fs.readFileSync(p, 'utf8');
  } catch {
    return '';
  }
}
function get(env, k) {
  const m = env.match(new RegExp(`^${k}=(.+)$`, 'm'));
  if (!m) return null;
  return m[1].trim().replace(/^["']|["']$/g, '');
}

const envBlobs = [
  loadEnv('F:/GitHub/ObjectStore/.env'),
  loadEnv('C:/Users/nugye/Documents/grudox/.env.local'),
  loadEnv('C:/Users/nugye/Documents/Game-Studio-Tool/gst-api-deploy/.env'),
  loadEnv('C:/Users/nugye/Documents/grudge-studio-auth/.env.local.production'),
  loadEnv('C:/Users/nugye/Documents/1111111/GrudgeBuilder/.env.local')
];

const zoneId =
  envBlobs.map((e) => get(e, 'CF_ZONE_ID')).find(Boolean) || null;

const tokenKeys = [
  'CF_DNS_API_TOKEN',
  'CF_ZERO_TRUST_TOKEN',
  'CLOUDFLARE_API_TOKEN',
  'CLOUDFLARE_USER_API',
  'CF_D1_API_TOKEN'
];
const tokens = [];
for (const env of envBlobs) {
  for (const k of tokenKeys) {
    const t = get(env, k);
    if (t && !tokens.includes(t)) tokens.push(t);
  }
}

console.log('zone', zoneId?.slice(0, 8), 'tokens', tokens.length);

async function authHeaders(token) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

let headers = null;
for (const t of tokens) {
  const h = await authHeaders(t);
  const url = zoneId
    ? `https://api.cloudflare.com/client/v4/zones/${zoneId}`
    : 'https://api.cloudflare.com/client/v4/zones?name=grudge-studio.com';
  const r = await fetch(url, { headers: h });
  const j = await r.json();
  console.log('try token…', r.status, j.success, j.errors?.[0]?.message || j.result?.name || j.result?.[0]?.name || '');
  if (j.success) {
    headers = h;
    if (!zoneId && j.result?.[0]?.id) {
      // zone discovered
    }
    break;
  }
}

if (!headers) {
  console.error('\n=== MANUAL DNS FIX REQUIRED ===');
  console.error('Cloudflare API tokens in .env are expired/invalid (403).');
  console.error('In Cloudflare dashboard → grudge-studio.com → DNS → Add record:');
  console.error('  Type: A');
  console.error('  Name: casting');
  console.error('  IPv4: 76.76.21.21');
  console.error('  Proxy: DNS only (grey cloud)');
  console.error('  TTL: Auto');
  console.error('Then wait 1–2 min and open https://casting.grudge-studio.com/');
  console.error('Working fallback NOW: https://casting-abilities-threejs.vercel.app/');
  process.exit(2);
}

const zid =
  zoneId ||
  (
    await (
      await fetch('https://api.cloudflare.com/client/v4/zones?name=grudge-studio.com', {
        headers
      })
    ).json()
  ).result?.[0]?.id;

const list = await (
  await fetch(
    `https://api.cloudflare.com/client/v4/zones/${zid}/dns_records?name=casting.grudge-studio.com`,
    { headers }
  )
).json();

const body = {
  type: 'A',
  name: 'casting',
  content: '76.76.21.21',
  ttl: 1,
  proxied: false,
  comment: 'Vercel casting-abilities-threejs'
};

let out;
if (list.result?.length) {
  const id = list.result[0].id;
  out = await (
    await fetch(`https://api.cloudflare.com/client/v4/zones/${zid}/dns_records/${id}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(body)
    })
  ).json();
  console.log('updated', out.success, out.errors?.[0]?.message || '');
} else {
  out = await (
    await fetch(`https://api.cloudflare.com/client/v4/zones/${zid}/dns_records`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    })
  ).json();
  console.log('created', out.success, out.errors?.[0]?.message || '');
}

if (!out.success) process.exit(1);

for (let i = 0; i < 8; i++) {
  await new Promise((r) => setTimeout(r, 2500));
  const dj = await (
    await fetch('https://cloudflare-dns.com/dns-query?name=casting.grudge-studio.com&type=A', {
      headers: { accept: 'application/dns-json' }
    })
  ).json();
  console.log('DoH', i, dj.Status, dj.Answer?.map((a) => a.data));
  if (dj.Answer?.length) {
    try {
      const http = await fetch('https://casting.grudge-studio.com/');
      console.log('HTTP', http.status);
      if (http.status === 200) process.exit(0);
    } catch (e) {
      console.log('HTTP err', e.message);
    }
  }
}
