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
export const stats = { ok: 0, missing: 0, missingKeys: new Set() };

export function loadSheet(key) {
  let p = cache.get(key);
  if (p) return p;
  p = (async () => {
    try {
      const res = await fetch(fetchUrlForKey(key), { mode: 'cors', credentials: 'omit' });
      if (!res.ok) return miss(key, `http ${res.status}`);
      const bytes = new Uint8Array(await res.arrayBuffer());
      const mime = sniffImage(bytes);
      if (!mime) return miss(key, 'not an image');
      const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
      const image = new Image();
      image.decoding = 'async';
      image.src = url;
      try {
        await image.decode();
      } catch {
        URL.revokeObjectURL(url);
        return miss(key, 'decode failed');
      }
      URL.revokeObjectURL(url);
      stats.ok++;
      return { ok: true, key, bytes, mime, image };
    } catch (e) {
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
