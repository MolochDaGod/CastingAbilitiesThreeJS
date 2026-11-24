/**
 * casting.grudge-studio.com/vfx — animated spell / VFX showcase.
 *
 * Data:
 *  - 3D casting effects: VFX_CATALOG (src/vfx/vfxCatalog.js), played by the
 *    game's own VfxDirector — procedural, no CDN file.
 *  - Sprite sheets: /api/v1/vfx-showcase-manifest.json, built by
 *    scripts/vfx-sprite-manifest.mjs from info's effectSprites.json with every
 *    key byte-verified on assets.grudge-studio.com. The browser re-verifies
 *    magic bytes on load; a miss shows the marker, never stand-in art.
 */
import './vfxShowcase.css';
import { VFX_CATALOG } from '../vfx/vfxCatalog.js';
import { VfxStage } from './vfxStage.js';
import { loadSheet, cdnUrlForKey, stats as assetStats } from './assetBytes.js';
import { zipStore } from './zipStore.js';

const $ = (sel, root = document) => root.querySelector(sel);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const hex = (n) => '#' + Number(n).toString(16).padStart(6, '0');

const state = {
  items: [],
  tab: 'all',
  cat: 'all',
  q: '',
  selected: null,
  manifest: null
};

/** 3D effects as showcase items */
function threeDItems() {
  return VFX_CATALOG.map((e) => ({
    id: e.id,
    group: '3d',
    name: e.name,
    categories: [e.category, ...(e.tags || [])],
    color: e.color,
    description: e.description,
    procedural: true
  }));
}

function flashToast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('is-on');
  clearTimeout(flashToast._t);
  flashToast._t = setTimeout(() => t.classList.remove('is-on'), 1600);
}

async function copyText(text, label) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch { /* ignore */ }
    ta.remove();
  }
  flashToast(`${label} copied`);
}

function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function shareLink(item) {
  const u = new URL(location.href);
  u.search = '';
  u.hash = '';
  // Deployed hosts serve the page at /vfx (vercel.json rewrite); dev keeps vfx.html.
  if (!/^(localhost|127\.0\.0\.1)$/.test(u.hostname)) u.pathname = '/vfx';
  u.searchParams.set('fx', item.id);
  return u.toString();
}

/** Metadata JSON for one sprite effect (what the download + snippet carry). */
function spriteMeta(item) {
  return {
    schema: 'grudge.vfx-sprite/1',
    id: item.id,
    name: item.name,
    url: item.cdnUrl,
    key: item.key,
    sheetWidth: item.sheet.width,
    sheetHeight: item.sheet.height,
    frameWidth: item.frameW,
    frameHeight: item.frameH,
    cols: item.cols,
    rows: item.rows,
    frameCount: item.frames,
    fps: state.selected === item ? stage.fps : item.fps,
    loop: true,
    blend: item.blendMode,
    categories: item.categories,
    sha256: item.sheet.sha256 || null,
    bytes: item.sheet.bytes || null,
    layoutSource: item.layoutSource,
    ...(item.layoutNote ? { layoutNote: item.layoutNote } : {}),
    share: shareLink(item)
  };
}

function threeDMeta(item) {
  return {
    schema: 'grudge.vfx-procedural/1',
    id: item.id,
    name: item.name,
    category: item.categories[0],
    color: hex(item.color),
    description: item.description,
    source: 'MolochDaGod/CastingAbilitiesThreeJS src/vfx/VfxDirector.js',
    deploy: { effectId: item.id, origin: [0, 0, 0], forward: [0, 0, 1], aim: [0, 1.1, 7.5], intensity: 1 },
    note: 'Procedural three.js effect (particles, bursts, decals, lights). No CDN file; runs from casting code.',
    share: shareLink(item)
  };
}

function embedSnippet(item) {
  if (item.group === '3d') {
    return `// Casting 3D effect "${item.name}" — procedural, from CastingAbilitiesThreeJS
import { VfxDirector } from './src/vfx/VfxDirector.js';
// ctx: { scene, particles, lights, decals, bursts, shake, flash } (see src/showcase/vfxStage.js)
const vfx = new VfxDirector(ctx);
vfx.deploy('${item.id}', {
  origin: new THREE.Vector3(0, 0, 0),
  forward: new THREE.Vector3(0, 0, 1),
  aim: new THREE.Vector3(0, 1.1, 7.5),
  intensity: 1
});
// each frame: particles.flush(); decals.update(dt); bursts.update(dt); lights.update(dt); vfx.update(dt);`;
  }
  const m = spriteMeta(item);
  return `// "${m.name}" sprite-sheet VFX — ${m.frameCount} frames @ ${m.fps} fps
import * as THREE from 'three';
const fx = ${JSON.stringify({ url: m.url, sheetW: m.sheetWidth, sheetH: m.sheetHeight, frameW: m.frameWidth, frameH: m.frameHeight, cols: m.cols, frames: m.frameCount, fps: m.fps, blend: m.blend })};
const tex = await new THREE.TextureLoader().loadAsync(fx.url);
tex.colorSpace = THREE.SRGBColorSpace;
tex.repeat.set(fx.frameW / fx.sheetW, fx.frameH / fx.sheetH);
const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
  map: tex, transparent: true, depthWrite: false,
  blending: fx.blend === 'normal' ? THREE.NormalBlending : THREE.AdditiveBlending
}));
scene.add(sprite);
let t = 0;
function updateFx(dt) {            // call from your render loop
  t += dt;
  const f = Math.floor(t * fx.fps) % fx.frames;
  tex.offset.set((f % fx.cols) * fx.frameW / fx.sheetW,
                 1 - (Math.floor(f / fx.cols) + 1) * fx.frameH / fx.sheetH);
}
// when done: sprite.material.dispose(); tex.dispose();`;
}

// ---------- grid ----------
const thumbs = new Map(); // card el -> { item, ctx, entry, t }
const visibleThumbs = new Set();
let thumbRaf = 0;
const thumbIO = new IntersectionObserver((ents) => {
  for (const e of ents) {
    const th = thumbs.get(e.target);
    if (!th) continue;
    if (e.isIntersecting) {
      visibleThumbs.add(th);
      ensureThumb(th);
    } else {
      visibleThumbs.delete(th);
    }
  }
  scheduleThumbs();
}, { rootMargin: '200px' });

function scheduleThumbs() {
  if (thumbRaf || document.hidden || !visibleThumbs.size) return;
  thumbRaf = requestAnimationFrame(drawThumbs);
}
document.addEventListener('visibilitychange', scheduleThumbs);

async function ensureThumb(th) {
  if (th.loading || th.entry) return;
  th.loading = true;
  const entry = await loadSheet(th.item.key);
  th.entry = entry;
  th.loading = false;
  if (!entry.ok) {
    markMissing(th.host, th.item.key);
    updateCounts();
  }
}

function markMissing(host, key) {
  if (!host || host.querySelector('.icon-missing')) return;
  const m = document.createElement('span');
  m.className = 'icon-missing';
  m.textContent = 'icon missing';
  m.setAttribute('role', 'img');
  m.setAttribute('aria-label', 'icon missing');
  m.title = key;
  host.appendChild(m);
  host.classList.add('has-icon-missing');
}

let lastThumb = 0;
function drawThumbs(now) {
  thumbRaf = 0;
  const dt = lastThumb ? Math.min(0.1, (now - lastThumb) / 1000) : 0;
  lastThumb = now;
  for (const th of visibleThumbs) {
    const e = th.entry;
    if (!e || !e.ok) continue;
    const it = th.item;
    th.t += dt;
    const f = Math.floor(th.t * it.fps) % Math.max(1, it.frames);
    const sx = (f % it.cols) * it.frameW;
    const sy = Math.floor(f / it.cols) * it.frameH;
    const c = th.ctx;
    const S = th.size;
    c.clearRect(0, 0, S, S);
    const scale = Math.min(S / it.frameW, S / it.frameH);
    const dw = it.frameW * scale, dh = it.frameH * scale;
    c.imageSmoothingEnabled = it.frameW > 64;
    c.globalCompositeOperation = it.blendMode === 'normal' ? 'source-over' : 'lighter';
    c.drawImage(e.image, sx, sy, it.frameW, it.frameH, (S - dw) / 2, (S - dh) / 2, dw, dh);
  }
  if (visibleThumbs.size) scheduleThumbs();
}

function matches(item) {
  if (state.tab === '3d' && item.group !== '3d') return false;
  if (state.tab === 'sheets' && item.group !== 'effect') return false;
  if (state.tab === 'projectiles' && item.group !== 'projectile') return false;
  if (state.tab === 'beams' && item.group !== 'beam') return false;
  if (state.cat !== 'all' && !item.categories.includes(state.cat)) return false;
  if (state.q) {
    const q = state.q.toLowerCase();
    if (!(`${item.id} ${item.name} ${item.categories.join(' ')}`.toLowerCase().includes(q))) return false;
  }
  return true;
}

function renderGrid() {
  const grid = $('#grid');
  for (const el of thumbs.keys()) thumbIO.unobserve(el);
  thumbs.clear();
  visibleThumbs.clear();
  grid.textContent = '';
  const list = state.items.filter(matches);
  $('#shown').textContent = String(list.length);
  const frag = document.createDocumentFragment();
  for (const item of list) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'fx-card' + (state.selected?.id === item.id ? ' is-active' : '');
    card.dataset.id = item.id;
    const meta = item.group === '3d'
      ? `<span class="fx-badge fx-badge--3d">3D</span> ${esc(item.categories[0])}`
      : `${item.frames}f · ${item.frameW}×${item.frameH}`;
    card.innerHTML = `
      <span class="fx-thumb">${item.group === '3d'
        ? `<span class="fx-orb" style="--c:${hex(item.color)}"></span>`
        : '<canvas width="96" height="96"></canvas>'}</span>
      <span class="fx-name">${esc(item.name)}</span>
      <span class="fx-meta">${meta}</span>`;
    card.addEventListener('click', () => select(item));
    frag.appendChild(card);
    if (item.group !== '3d') {
      const cv = card.querySelector('canvas');
      const th = { item, host: card.querySelector('.fx-thumb'), ctx: cv.getContext('2d'), size: 96, entry: null, t: Math.random() * 2 };
      thumbs.set(card, th);
    }
  }
  grid.appendChild(frag);
  for (const el of thumbs.keys()) thumbIO.observe(el);
}

function renderPills() {
  const counts = new Map();
  for (const it of state.items) {
    if (!matchesTabOnly(it)) continue;
    for (const c of new Set(it.categories)) counts.set(c, (counts.get(c) || 0) + 1);
  }
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 24);
  const wrap = $('#pills');
  wrap.textContent = '';
  const mk = (id, label) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'pill' + (state.cat === id ? ' is-active' : '');
    b.textContent = label;
    b.addEventListener('click', () => { state.cat = id; renderPills(); renderGrid(); });
    wrap.appendChild(b);
  };
  mk('all', 'All');
  for (const [c, n] of top) mk(c, `${c} ${n}`);
}
function matchesTabOnly(item) {
  const saved = { cat: state.cat, q: state.q };
  state.cat = 'all'; state.q = '';
  const ok = matches(item);
  state.cat = saved.cat; state.q = saved.q;
  return ok;
}

function updateCounts() {
  const m = state.manifest;
  const sprites = m ? m.items.length : 0;
  const realManifest = m ? m.counts.real : 0;
  $('#count3d').textContent = String(VFX_CATALOG.length);
  $('#countSheets').textContent = String(sprites);
  $('#countReal').textContent = String(Math.max(0, realManifest - assetStats.missing));
  $('#countMissing').textContent = String((m ? m.counts.missing : 0) + assetStats.missing);
}

// ---------- detail / stage ----------
const stage = new VfxStage($('#stage'), {
  flashEl: $('#stageFlash'),
  onFrame: (info) => {
    if (info.frames != null) $('#frameReadout').textContent = `frame ${info.frame + 1} / ${info.frames}`;
    else $('#frameReadout').textContent = `cast #${info.cast} · ${info.t.toFixed(1)}s`;
  }
});
window.addEventListener('pagehide', () => stage.dispose(), { once: true });
if (new URLSearchParams(location.search).has('debug')) window.__vfxStage = stage;

async function select(item, { push = true } = {}) {
  state.selected = item;
  for (const el of document.querySelectorAll('.fx-card.is-active')) el.classList.remove('is-active');
  const card = document.querySelector(`.fx-card[data-id="${CSS.escape(item.id)}"]`);
  card?.classList.add('is-active');
  if (push) {
    const u = new URL(location.href);
    u.searchParams.set('fx', item.id);
    history.replaceState(null, '', u);
  }
  const host = $('#stageWrap');
  host.querySelector('.icon-missing')?.remove();
  host.classList.remove('has-icon-missing');
  $('#detailName').textContent = item.name;
  $('#detailId').textContent = item.id;
  const is3d = item.group === '3d';
  document.body.classList.toggle('sel-3d', is3d);
  $('#btnCopyCdn').disabled = is3d;
  $('#btnPng').disabled = is3d;
  $('#btnZip').disabled = is3d;
  $('#fps').disabled = is3d;
  $('#modeToggle').disabled = is3d;
  $('#btnPrev').disabled = is3d;
  $('#btnNext').disabled = is3d;
  $('#btnCast').textContent = is3d ? 'Cast' : 'Restart';
  stage.playing = true;
  syncPlayButton();
  if (is3d) {
    stage.show3d(item.id);
    renderDetailRows(item);
    return;
  }
  stage.fps = item.fps;
  $('#fps').value = String(item.fps);
  $('#fpsVal').textContent = String(item.fps);
  stage.clear();
  $('#frameReadout').textContent = 'loading…';
  renderDetailRows(item);
  const entry = await loadSheet(item.key, { priority: true });
  if (state.selected !== item) return;
  if (!entry.ok) {
    markMissing(host, item.key);
    $('#frameReadout').textContent = 'icon missing';
    updateCounts();
    return;
  }
  stage.showSprite(item, entry.image);
}

function renderDetailRows(item) {
  const rows = item.group === '3d'
    ? [
        ['Type', 'Procedural 3D (VfxDirector)'],
        ['Category', item.categories[0]],
        ['Colour', hex(item.color)],
        ['About', item.description]
      ]
    : [
        ['CDN', `<a href="${esc(item.cdnUrl)}" target="_blank" rel="noopener">${esc(item.cdnUrl.replace('https://', ''))}</a>`],
        ['Sheet', `${item.sheet.width}×${item.sheet.height} ${item.sheet.mime || ''}`],
        ['Frames', `${item.frames} (${item.cols}×${item.rows} @ ${item.frameW}×${item.frameH})`],
        ['Blend', item.blendMode],
        ['Bytes', item.sheet.bytes ? `${(item.sheet.bytes / 1024).toFixed(1)} KB` : '—'],
        ['sha256', `<code>${esc((item.sheet.sha256 || '').slice(0, 16))}…</code>`],
        ['Tags', esc(item.categories.join(', '))],
        ...(item.layoutNote ? [['Layout', esc(item.layoutNote)]] : [])
      ];
  $('#detailRows').innerHTML = rows.map(([k, v]) => `<div class="drow"><span>${esc(k)}</span><span>${k === 'CDN' || k === 'sha256' || k === 'Tags' || k === 'Layout' ? v : esc(v)}</span></div>`).join('');
}

function syncPlayButton() {
  $('#btnPlay').textContent = stage.playing ? 'Pause' : 'Play';
}

function wireControls() {
  $('#btnPlay').addEventListener('click', () => { stage.playing = !stage.playing; syncPlayButton(); });
  $('#btnCast').addEventListener('click', () => { stage.playing = true; stage.cast(); syncPlayButton(); });
  $('#btnPrev').addEventListener('click', () => { stage.stepFrame(-1); syncPlayButton(); });
  $('#btnNext').addEventListener('click', () => { stage.stepFrame(1); syncPlayButton(); });
  $('#loop').addEventListener('change', (e) => { stage.loop = e.target.checked; });
  $('#speed').addEventListener('input', (e) => {
    stage.speed = Number(e.target.value);
    $('#speedVal').textContent = `${stage.speed.toFixed(2)}×`;
  });
  $('#fps').addEventListener('input', (e) => {
    stage.fps = Number(e.target.value);
    $('#fpsVal').textContent = String(stage.fps);
  });
  $('#modeToggle').addEventListener('change', (e) => stage.setMode(e.target.checked ? 'ground' : 'billboard'));
  $('#btnCopyCdn').addEventListener('click', () => {
    const it = state.selected;
    if (it && it.cdnUrl) copyText(it.cdnUrl, 'CDN URL');
  });
  $('#btnCopyLink').addEventListener('click', () => state.selected && copyText(shareLink(state.selected), 'Share link'));
  $('#btnCopyJson').addEventListener('click', () => {
    const it = state.selected;
    if (!it) return;
    copyText(JSON.stringify(it.group === '3d' ? threeDMeta(it) : spriteMeta(it), null, 2), 'JSON');
  });
  $('#btnCopyEmbed').addEventListener('click', () => state.selected && copyText(embedSnippet(state.selected), 'Embed snippet'));
  $('#btnJson').addEventListener('click', () => {
    const it = state.selected;
    if (!it) return;
    const data = it.group === '3d' ? threeDMeta(it) : spriteMeta(it);
    saveBlob(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), `${it.id}.json`);
  });
  $('#btnPng').addEventListener('click', async () => {
    const it = state.selected;
    if (!it || it.group === '3d') return;
    const e = await loadSheet(it.key);
    if (!e.ok) return flashToast('Sheet missing on CDN');
    saveBlob(new Blob([e.bytes], { type: e.mime }), it.key.split('/').pop());
  });
  $('#btnZip').addEventListener('click', async () => {
    const it = state.selected;
    if (!it || it.group === '3d') return;
    const e = await loadSheet(it.key);
    if (!e.ok) return flashToast('Sheet missing on CDN');
    const png = it.key.split('/').pop();
    const meta = { ...spriteMeta(it), file: png };
    const readme = `${it.name} (${it.id})\nGrudge Studio VFX sprite sheet\n\n${png}: ${meta.sheetWidth}x${meta.sheetHeight}, ${meta.frameCount} frames of ${meta.frameWidth}x${meta.frameHeight} in a ${meta.cols}x${meta.rows} grid, row-major from top-left.\nPlay at ${meta.fps} fps, blend ${meta.blend}.\nCDN: ${meta.url}\nsha256: ${meta.sha256}\n`;
    const zip = zipStore([
      { name: png, data: e.bytes },
      { name: `${it.id}.json`, data: JSON.stringify(meta, null, 2) },
      { name: 'README.txt', data: readme }
    ]);
    saveBlob(zip, `${it.id}.zip`);
  });
  $('#search').addEventListener('input', (e) => { state.q = e.target.value.trim(); renderGrid(); });
  for (const b of document.querySelectorAll('.tab')) {
    b.addEventListener('click', () => {
      state.tab = b.dataset.tab;
      state.cat = 'all';
      for (const x of document.querySelectorAll('.tab')) x.classList.toggle('is-active', x === b);
      renderPills();
      renderGrid();
    });
  }
  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement) return;
    if (e.code === 'Space') { e.preventDefault(); stage.playing = !stage.playing; syncPlayButton(); }
    if (e.code === 'KeyR') stage.cast();
  });
}

async function boot() {
  wireControls();
  let manifest = null;
  try {
    const res = await fetch('/api/v1/vfx-showcase-manifest.json', { cache: 'no-cache' });
    if (res.ok) manifest = await res.json();
  } catch { /* shown below */ }
  state.manifest = manifest;
  const sprites = manifest ? manifest.items : [];
  state.items = [...threeDItems(), ...sprites];
  if (!manifest) flashToast('Sprite manifest failed to load');
  updateCounts();
  renderPills();
  renderGrid();
  const want = new URL(location.href).searchParams.get('fx');
  const first = state.items.find((i) => i.id === want) || state.items.find((i) => i.id === 'fireball') || state.items[0];
  if (first) select(first, { push: false });
  document.body.classList.add('is-ready');
}

boot();
