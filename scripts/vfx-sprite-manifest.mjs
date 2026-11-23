#!/usr/bin/env node
/**
 * Build public/api/v1/vfx-showcase-manifest.json from the info ObjectStore
 * effectSprites.json (SSOT), verifying every sheet on assets.grudge-studio.com
 * by its actual bytes (PNG/JPEG/GIF/WebP magic). Never invents assets: a key
 * that is not a real image is kept with status "missing" so the UI shows the
 * marker. Read-only against the CDN — no uploads.
 *
 *   node scripts/vfx-sprite-manifest.mjs
 */
import { createHash } from 'node:crypto';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'public/api/v1/vfx-showcase-manifest.json');
const SSOT = 'https://info.grudge-studio.com/api/v1/effectSprites.json';
const CDN = 'https://assets.grudge-studio.com';
// The production casting host is on the CDN hotlink allowlist.
const REFERER = 'https://casting.grudge-studio.com/';

function sniff(b) {
  if (b.length < 12) return null;
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b[0] === 0xff && b[1] === 0xd8) return 'image/jpeg';
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return 'image/gif';
  if (b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}
function pngSize(b) {
  if (b.length < 24) return null;
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}
function encodeKey(p) {
  return p.split('/').map((s) => encodeURIComponent(s)).join('/');
}

async function probe(path) {
  const url = CDN + encodeKey(path.startsWith('/') ? path : '/' + path);
  try {
    const res = await fetch(url, { headers: { Referer: REFERER } });
    const buf = Buffer.from(await res.arrayBuffer());
    const mime = res.ok ? sniff(buf) : null;
    if (!mime) {
      return { url, status: 'missing', http: res.status, reason: res.ok ? 'not-an-image (' + (res.headers.get('content-type') || '?') + ', ' + buf.length + ' B)' : 'http ' + res.status };
    }
    const dim = mime === 'image/png' ? pngSize(buf) : null;
    return {
      url, status: 'real', http: res.status, mime, bytes: buf.length,
      sha256: createHash('sha256').update(buf).digest('hex'),
      width: dim?.w ?? null, height: dim?.h ?? null
    };
  } catch (e) {
    return { url, status: 'missing', http: 0, reason: 'fetch error ' + e.message };
  }
}

function layoutOf(fx, w, h) {
  const frames = Math.max(1, Math.floor(Number(fx.frames) || 1));
  let cols, rows, frameW, frameH, layoutSource;
  if (Number(fx.cols) > 0 && Number(fx.frameW) > 0) {
    cols = Number(fx.cols); rows = Number(fx.rows) || Math.ceil(frames / cols);
    frameW = Number(fx.frameW); frameH = Number(fx.frameH) || frameW;
    layoutSource = 'catalog';
  } else {
    cols = Math.max(1, Math.round(Math.sqrt(frames)));
    rows = Math.ceil(frames / cols);
    const sheetW = w || Number(fx.size) || 0;
    const sheetH = h || Number(fx.size) || 0;
    frameW = Math.round(sheetW / cols) || 64;
    frameH = Math.round(sheetH / rows) || 64;
    layoutSource = w ? 'square-grid-from-image' : 'square-grid-from-size';
  }
  // Catalog grids that overflow the real image are re-fit to the image
  // (cols x rows kept); grids that cannot fit cleanly fall back to one frame.
  let note = null;
  if (w && h && (cols * frameW > w + 1 || rows * frameH > h + 1)) {
    const fw = w / cols, fh = h / rows;
    if (Number.isInteger(fw) && Number.isInteger(fh) && fw >= 8 && fh >= 8) {
      note = `catalog frame ${frameW}x${frameH} overflowed ${w}x${h}; re-fit to ${fw}x${fh}`;
      frameW = fw; frameH = fh; layoutSource = 'catalog-grid-fit-to-image';
    } else if (cols * frameW <= w * 1.1 && rows * frameH <= h * 1.1) {
      note = `catalog frame ${frameW}x${frameH} slightly overflowed ${w}x${h}; trimmed to ${Math.floor(fw)}x${Math.floor(fh)}`;
      frameW = Math.floor(fw); frameH = Math.floor(fh); layoutSource = 'catalog-grid-trimmed';
    } else {
      note = `catalog grid ${cols}x${rows}@${frameW}x${frameH} does not fit ${w}x${h}; shown as one frame`;
      cols = 1; rows = 1; frameW = w; frameH = h; layoutSource = 'single-frame-fallback';
    }
  }
  // Frames that the sheet cannot hold are not invented.
  let usable = frames;
  if (w && h) {
    const fitCols = Math.max(1, Math.floor(w / frameW));
    const fitRows = Math.max(1, Math.floor(h / frameH));
    usable = Math.min(frames, Math.min(cols, fitCols) * Math.min(rows, fitRows));
  }
  return { frames: usable, declaredFrames: frames, cols, rows, frameW, frameH, layoutSource, layoutNote: note };
}

async function pool(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); }
  }));
  return out;
}

const ssot = await (await fetch(SSOT)).json();
const entries = [];
for (const [id, fx] of Object.entries(ssot.effects || {})) {
  entries.push({ id, group: 'effect', name: null, fx, categories: fx.categories || [] });
}
for (const [id, fx] of Object.entries(ssot.projectiles || {})) {
  entries.push({ id: 'projectile.' + id, group: 'projectile', name: fx.name || null, fx, categories: ['projectile', fx.type].filter(Boolean) });
}
for (const [id, src] of Object.entries(ssot.beamTrails || {})) {
  entries.push({ id: 'beam.' + id, group: 'beam', name: 'Beam ' + id, fx: { src, frames: 1, cols: 1, rows: 1 }, categories: ['beam', 'trail'] });
}

const probed = await pool(entries, 8, (e) => probe(e.fx.sourceUrl || e.fx.src));
const items = entries.map((e, k) => {
  const p = probed[k];
  const path = e.fx.sourceUrl || e.fx.src;
  const lay = layoutOf(e.fx, p.width, p.height);
  if (e.group === 'beam' && p.width) { lay.frameW = p.width; lay.frameH = p.height; }
  return {
    id: e.id,
    group: e.group,
    name: e.name || e.id.replace(/([a-z])([A-Z0-9])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase()),
    key: path.replace(/^\//, ''),
    cdnUrl: p.url,
    categories: [...new Set(e.categories)],
    blendMode: e.fx.blendMode && e.fx.blendMode !== 'normal' ? e.fx.blendMode : (e.group === 'projectile' || (e.fx.blendMode === 'normal') ? 'normal' : 'additive'),
    fps: 16,
    ...lay,
    sheet: p.status === 'real'
      ? { status: 'real', mime: p.mime, bytes: p.bytes, sha256: p.sha256, width: p.width, height: p.height }
      : { status: 'missing', http: p.http, reason: p.reason }
  };
});

const real = items.filter((i) => i.sheet.status === 'real').length;
const manifest = {
  schema: 'grudge.vfx-showcase-manifest/1',
  generatedAt: new Date().toISOString(),
  source: SSOT,
  sourceVersion: ssot.version || null,
  cdn: CDN,
  verification: 'GET each key on the CDN; real = 2xx with image magic bytes (PNG/JPEG/GIF/WebP); sha256 of full body',
  counts: { total: items.length, real, missing: items.length - real },
  categories: Object.fromEntries(Object.entries(ssot.categories || {}).map(([k, v]) => [k, v.length])),
  buffVisuals: ssot.buffVisuals || {},
  weaponVisuals: ssot.weaponVisuals || {},
  items
};
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(manifest, null, 1) + '\n');
console.log(JSON.stringify(manifest.counts), '->', OUT);
for (const i of items.filter((x) => x.sheet.status !== 'real')) console.log('MISSING', i.id, i.key, i.sheet.reason);
