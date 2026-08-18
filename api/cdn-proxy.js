/**
 * Same-origin R2 proxy — classic Vercel Node (req, res).
 * Pattern from Warlords api/cdn-proxy.ts — do not invent a second CDN.
 *
 * vercel.json:
 *   /api/assets/:path* → /api/cdn-proxy?key=:path*
 *
 * node:https with same-host Referer. Do not use fetch() — Vercel forwards
 * the incoming Referer and Cloudflare Hotlink Protection 1011s PNGs.
 */
import https from 'node:https';

const CDN_HOST = 'assets.grudge-studio.com';
const MAX_PATH = 512;

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Range');
  res.setHeader(
    'Access-Control-Expose-Headers',
    'ETag, Accept-Ranges, Content-Length, Content-Type, Content-Range, X-Upstream-Status'
  );
  res.setHeader('X-Grudge-Asset-Proxy', 'cdn-proxy');
}

function sanitizeKey(raw) {
  let key = String(raw || '').trim();
  try {
    key = decodeURIComponent(key);
  } catch {
    return null;
  }
  key = key.replace(/^\/+/, '');
  if (!key || key.length > MAX_PATH) return null;
  if (key.includes('..') || key.includes('\\') || key.includes('://')) return null;
  if (key.includes('//')) return null;
  if (!/^[A-Za-z0-9._\-/% ]+$/.test(key)) return null;
  return key;
}

function keyFromReq(req) {
  const host = req.headers.host || 'localhost';
  const url = new URL(req.url || '/', `http://${host}`);
  const q = url.searchParams.get('key');
  if (q) return sanitizeKey(q);
  const path = url.pathname;
  for (const prefix of ['/api/cdn-proxy/', '/api/assets/']) {
    if (path.startsWith(prefix)) return sanitizeKey(path.slice(prefix.length));
  }
  return null;
}

export default function handler(req, res) {
  setCors(res);

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.statusCode = 405;
    res.end('Method Not Allowed');
    return;
  }

  const key = keyFromReq(req);
  if (!key) {
    res.statusCode = 400;
    res.end('Bad Request');
    return;
  }

  const host = req.headers.host || 'localhost';
  const url = new URL(req.url || '/', `http://${host}`);
  const extra = [...url.searchParams.entries()]
    .filter(([k]) => k !== 'key')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
  const path = `/${key}${extra ? `?${extra}` : ''}`;

  const headers = {
    Host: CDN_HOST,
    Accept: typeof req.headers.accept === 'string' ? req.headers.accept : '*/*',
    'User-Agent': 'grudge-vercel-asset-proxy',
    Referer: `https://${CDN_HOST}/`
  };
  if (typeof req.headers.range === 'string') headers.Range = req.headers.range;
  if (typeof req.headers['if-none-match'] === 'string') {
    headers['If-None-Match'] = req.headers['if-none-match'];
  }

  const up = https.request(
    {
      protocol: 'https:',
      hostname: CDN_HOST,
      path,
      method: req.method,
      headers
    },
    (upRes) => {
      res.statusCode = upRes.statusCode || 502;
      res.setHeader('X-Upstream-Status', String(upRes.statusCode || 502));
      for (const name of [
        'content-type',
        'content-length',
        'content-range',
        'accept-ranges',
        'etag',
        'last-modified',
        'cache-control'
      ]) {
        const v = upRes.headers[name];
        if (typeof v === 'string') res.setHeader(name, v);
        else if (Array.isArray(v)) res.setHeader(name, v.join(', '));
      }
      if (!res.getHeader('cache-control')) {
        res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=3600');
      }
      if (req.method === 'HEAD') {
        upRes.resume();
        res.end();
        return;
      }
      upRes.pipe(res);
    }
  );
  up.setTimeout(20000, () => {
    up.destroy(new Error('cdn timeout'));
  });
  up.on('error', () => {
    if (!res.headersSent) {
      res.statusCode = 502;
      res.end('Bad Gateway');
    } else {
      res.end();
    }
  });
  up.end();
}
