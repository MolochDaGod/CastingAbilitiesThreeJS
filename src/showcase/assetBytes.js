/**
 * CDN asset bytes for the VFX showcase.
 *
 * Canonical, shareable URLs are always https://assets.grudge-studio.com/<key>.
 * The CDN's hotlink allowlist admits the production casting host; on any other
 * host (Vercel previews, localhost) bytes come through this app's existing
 * same-origin proxy `/api/assets/<key>` (api/cdn-proxy.js), which reads the
 * same R2 object. Every body is magic-byte checked; a miss returns null so the
 * UI shows the marker. No stand-in art.
 */
export const CDN = 'https://assets.grudge-studio.com';
const DIRECT_HOSTS = new Set(['casting.grudge-studio.com']);

export function encodeKey(key) {
  return String(key || '')
    .replace(/^\/+/, '')
    .split('/')
    .map((s) => encodeURIComponent(s))
    .join('/');
}

export function cdnUrlForKey(key) {
  return `${CDN}/${encodeKey(key)}`;
}

export function fetchUrlForKey(key) {
  if (typeof location !== 'undefined' && DIRECT_HOSTS.has(location.hostname)) return cdnUrlForKey(key);
  return `/api/assets/${encodeKey(key)}`;
}

export function sniffImage(bytes) {
  const b = bytes;
  if (!b || b.length < 12) return null;
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b[0] === 0xff && b[1] === 0xd8) return 'image/jpeg';
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return 'image/gif';
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
      b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp';
  return null;
}

/** @type {Map<string, Promise<{ok: boolean, key: string, bytes?: Uint8Array, mime?: string, image?: HTMLImageElement, reason?: string}>>} */
const cache = new Map();
export const stats = { ok: 0, missing: 0, missingKeys: new Set(), retries: 0 };

/*
 * A fresh deployment has an empty edge cache, so opening the grid used to fire
 * ~150 simultaneous /api/assets function invocations (cold starts) and some came
 * back as 5xx / 429 / non-image bodies — real sheets wrongly shown as missing.
 * Keep at most MAX_IN_FLIGHT requests open and retry transient failures; a sheet
 * is only "missing" when the CDN answers definitively (404, or 200 that is not
 * an image).
 */
const MAX_IN_FLIGHT = 6;
const RETRY_DELAYS_MS = [400, 1200, 2500];
let inFlight = 0;
const queue = [];

function acquire(priority = false) {
  if (inFlight < MAX_IN_FLIGHT) { inFlight++; return Promise.resolve(); }
  // The sheet on the stage jumps ahead of grid thumbnails.
  return new Promise((resolve) => (priority ? queue.unshift(resolve) : queue.push(resolve)));
}
function release() {
  const next = queue.shift();
  if (next) next();
  else inFlight--;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function isTransient(status, upstream) {
  if (status === 0 || status === 408 || status === 425 || status === 429 || status >= 500) return true;
  const up = Number(upstream);
  return Number.isFinite(up) && (up === 429 || up >= 500);
}

async function fetchBytesOnce(url, sameOrigin) {
  const res = await fetch(url, sameOrigin ? { credentials: 'same-origin' } : { mode: 'cors', credentials: 'omit' });
  const bytes = new Uint8Array(await res.arrayBuffer());
  return { status: res.status, upstream: res.headers.get('x-upstream-status'), bytes };
}

async function fetchBytes(key, priority = false) {
  const url = fetchUrlForKey(key);
  // Same-origin proxy keeps cookies (Vercel preview auth); the CDN gets none.
  const sameOrigin = url.startsWith('/');
  let last = { status: 0, upstream: null, bytes: null, reason: 'fetch error' };
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    if (attempt) { stats.retries++; await sleep(RETRY_DELAYS_MS[attempt - 1]); }
    await acquire(priority);
    try {
      const r = await fetchBytesOnce(url, sameOrigin);
      last = { ...r, reason: `http ${r.status}` };
      if (r.status >= 200 && r.status < 300 && sniffImage(r.bytes)) return last;
      if (!isTransient(r.status, r.upstream)) return last; // definitive: 404 / stored HTML
    } catch {
      last = { status: 0, upstream: null, bytes: null, reason: 'fetch error' };
    } finally {
      release();
    }
  }
  return last;
}

export function loadSheet(key, { priority = false } = {}) {
  let p = cache.get(key);
  if (p) return p;
  p = (async () => {
    try {
      const r = await fetchBytes(key, priority);
      if (!r.bytes || r.status < 200 || r.status >= 300) return miss(key, r.reason);
      const bytes = r.bytes;
      const mime = sniffImage(bytes);
      if (!mime) return miss(key, 'not an image');
      const objUrl = URL.createObjectURL(new Blob([bytes], { type: mime }));
      const image = new Image();
      image.decoding = 'async';
      image.src = objUrl;
      try {
        await image.decode();
      } catch {
        URL.revokeObjectURL(objUrl);
        return miss(key, 'decode failed');
      }
      URL.revokeObjectURL(objUrl);
      stats.ok++;
      return { ok: true, key, bytes, mime, image };
    } catch {
      return miss(key, 'fetch error');
    }
  })();
  cache.set(key, p);
  return p;
}

function miss(key, reason) {
  stats.missing++;
  stats.missingKeys.add(key);
  return { ok: false, key, reason };
}
