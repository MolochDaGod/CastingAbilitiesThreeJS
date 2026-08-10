/**
 * Pirate Pack cursors — Warlords / casting mouse-intent theme.
 *
 * Pack: public/ui/warlords-dev/cursors/pirate/MouseIcon1…10.png
 * Display size ~28–32 px (near OS arrow) — source art is large; we bake downscaled
 * blob URLs so CSS cursor matches normal mouse size.
 *
 * Tooltips: LMB / RMB action lines follow the pointer (animate on intent change).
 * Focus combat still hides OS cursor for crosshair.
 */

import { warlordsUiUrl } from './warlordsUiSkin.js';

/** @typedef {keyof typeof CURSOR_INTENTS | 'default' | 'none'} CursorIntentId */

/**
 * Intent → pack file + LMB/RMB product actions.
 * Hotspot in source px is remapped to display size after scale.
 */
export const CURSOR_INTENTS = Object.freeze({
  default: {
    file: 'MouseIcon2.png',
    hotspot: [8, 4],
    label: 'Ready',
    lmb: 'Select target',
    rmb: 'Focus look (toggle)'
  },
  attack: {
    file: 'MouseIcon2.png',
    hotspot: [8, 4],
    label: 'Hostile',
    lmb: 'Select / attack (focus)',
    rmb: 'Focus · soft lock'
  },
  slash: {
    file: 'MouseIcon3.png',
    hotspot: [10, 6],
    label: 'Strike',
    lmb: 'Primary attack',
    rmb: 'Focus look'
  },
  enter_ship: {
    file: 'MouseIcon1.png',
    hotspot: [16, 6],
    label: 'Board ship',
    lmb: 'Board / enter',
    rmb: 'Focus look'
  },
  sail: {
    file: 'MouseIcon6.png',
    hotspot: [12, 12],
    label: 'Sail',
    lmb: 'Helm / use',
    rmb: 'Focus look'
  },
  door: {
    file: 'MouseIcon4.png',
    hotspot: [12, 6],
    label: 'Door',
    lmb: 'Open / enter',
    rmb: 'Focus look'
  },
  loot: {
    file: 'MouseIcon7.png',
    hotspot: [14, 14],
    label: 'Loot',
    lmb: 'Open / select',
    rmb: 'Focus look'
  },
  look: {
    file: 'MouseIcon5.png',
    hotspot: [6, 18],
    label: 'Inspect',
    lmb: 'Examine',
    rmb: 'Focus look'
  },
  harvest: {
    file: 'MouseIcon8.png',
    hotspot: [10, 6],
    label: 'Harvest',
    lmb: 'Select node',
    rmb: 'Focus look',
    extra: 'F · harvest nearest (tool)'
  },
  talk: {
    file: 'MouseIcon9.png',
    hotspot: [12, 12],
    label: 'Talk',
    lmb: 'Dialogue',
    rmb: 'Focus look'
  },
  use: {
    file: 'MouseIcon10.png',
    hotspot: [12, 12],
    label: 'Use',
    lmb: 'Interact',
    rmb: 'Focus look'
  },
  pickup: {
    file: 'MouseIcon7.png',
    hotspot: [14, 14],
    label: 'Pickup',
    lmb: 'Select drop',
    rmb: 'Focus look',
    extra: 'F · pick up'
  },
  /** Path draw / freeride cast (unlocked) */
  draw: {
    file: 'MouseIcon5.png',
    hotspot: [6, 18],
    label: 'Draw path',
    lmb: 'Draw cast / course',
    rmb: 'Focus look'
  },
  /** Soft select idle */
  select: {
    file: 'MouseIcon2.png',
    hotspot: [8, 4],
    label: 'Select',
    lmb: 'Select target',
    rmb: 'Focus look (toggle)'
  }
});

const BASE = 'cursors/pirate';
/** Target display size (px) — OS arrows are typically 16–32 */
const DISPLAY_SIZE = 28;
const SOURCE_HINT = 128; // pack icons are large; scale factor from this if unknown

/** @type {{ theme: string, enabled: boolean, intent: string, target: HTMLElement|null, tipEl: HTMLElement|null, tipVisible: boolean }} */
const state = {
  theme: 'pirate',
  enabled: true,
  intent: 'default',
  target: null,
  tipEl: null,
  tipVisible: false,
  /** @type {Map<string, { url: string, hx: number, hy: number }>} */
  baked: new Map()
};

/**
 * @param {string} file
 */
function cursorUrl(file) {
  return warlordsUiUrl(`${BASE}/${file}`);
}

/**
 * Bake a small cursor from source PNG (blob URL).
 * @param {string} file
 * @param {[number, number]} hotspotSrc
 * @returns {Promise<{ url: string, hx: number, hy: number }>}
 */
async function bakeCursor(file, hotspotSrc) {
  const key = file;
  if (state.baked.has(key)) return state.baked.get(key);

  const src = cursorUrl(file);
  const img = await new Promise((resolve, reject) => {
    const i = new Image();
    i.crossOrigin = 'anonymous';
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error(`cursor load ${file}`));
    i.src = src;
  }).catch(() => null);

  if (!img) {
    const fallback = { url: src, hx: 4, hy: 2 };
    state.baked.set(key, fallback);
    return fallback;
  }

  const sw = img.naturalWidth || img.width || SOURCE_HINT;
  const sh = img.naturalHeight || img.height || SOURCE_HINT;
  const size = DISPLAY_SIZE;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.clearRect(0, 0, size, size);
  ctx.drawImage(img, 0, 0, sw, sh, 0, 0, size, size);

  const scale = size / Math.max(sw, sh, 1);
  const hx = Math.max(0, Math.min(size - 1, Math.round((hotspotSrc[0] || 8) * scale)));
  const hy = Math.max(0, Math.min(size - 1, Math.round((hotspotSrc[1] || 4) * scale)));

  const url = canvas.toDataURL('image/png');
  const baked = { url, hx, hy };
  state.baked.set(key, baked);
  return baked;
}

/**
 * @param {string} intentId
 * @returns {string} CSS cursor value
 */
export function cursorCssForIntent(intentId) {
  if (intentId === 'none') return 'none';
  const def = CURSOR_INTENTS[intentId] || CURSOR_INTENTS.default;
  const baked = state.baked.get(def.file);
  if (baked) {
    return `url("${baked.url}") ${baked.hx} ${baked.hy}, auto`;
  }
  // Pre-bake fallback: raw file with small hotspot (may be large until preload)
  const url = cursorUrl(def.file);
  return `url("${url}") 4 2, auto`;
}

/**
 * Ensure tip DOM exists.
 */
function ensureTipEl() {
  if (state.tipEl) return state.tipEl;
  const el = document.createElement('div');
  el.id = 'wl-cursor-tip';
  el.className = 'wl-cursor-tip';
  el.hidden = true;
  el.setAttribute('aria-live', 'polite');
  document.body.appendChild(el);
  state.tipEl = el;

  // Inject once
  if (!document.getElementById('wl-cursor-tip-style')) {
    const st = document.createElement('style');
    st.id = 'wl-cursor-tip-style';
    st.textContent = `
      .wl-cursor-tip {
        position: fixed;
        z-index: 120;
        pointer-events: none;
        min-width: 120px;
        max-width: 220px;
        padding: 6px 10px 7px;
        border-radius: 6px;
        background: rgba(10, 12, 16, 0.88);
        border: 1px solid rgba(180, 160, 120, 0.45);
        box-shadow: 0 6px 20px rgba(0,0,0,0.45);
        color: #e8e4d8;
        font: 600 11px/1.35 system-ui, Segoe UI, sans-serif;
        letter-spacing: 0.02em;
        opacity: 0;
        transform: translate(14px, 16px) scale(0.94);
        transition: opacity 0.14s ease, transform 0.16s ease;
        backdrop-filter: blur(6px);
      }
      .wl-cursor-tip.is-on {
        opacity: 1;
        transform: translate(14px, 16px) scale(1);
      }
      .wl-cursor-tip[hidden] { display: none !important; }
      .wl-cursor-tip__title {
        font-size: 10px;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: #c9b48a;
        margin-bottom: 3px;
      }
      .wl-cursor-tip__row {
        display: flex;
        gap: 6px;
        align-items: baseline;
        margin-top: 2px;
      }
      .wl-cursor-tip__key {
        flex: 0 0 auto;
        font-size: 9px;
        font-weight: 700;
        color: #7ec8ff;
        min-width: 2.4em;
      }
      .wl-cursor-tip__act {
        color: #f0ece0;
        font-weight: 500;
      }
      .wl-cursor-tip__extra {
        margin-top: 4px;
        font-size: 10px;
        color: #9ef0b8;
      }
    `;
    document.head.appendChild(st);
  }

  window.addEventListener(
    'pointermove',
    (e) => {
      if (!state.tipEl || state.tipEl.hidden) return;
      state.tipEl.style.left = `${e.clientX}px`;
      state.tipEl.style.top = `${e.clientY}px`;
    },
    { passive: true }
  );

  return el;
}

/**
 * @param {string} intentId
 * @param {{ lmb?: string, rmb?: string, extra?: string, label?: string }|null} [override]
 */
export function setCursorTooltip(intentId, override = null) {
  const el = ensureTipEl();
  if (intentId === 'none' || !state.enabled) {
    hideCursorTooltip();
    return;
  }
  const def = CURSOR_INTENTS[intentId] || CURSOR_INTENTS.default;
  const label = override?.label ?? def.label;
  const lmb = override?.lmb ?? def.lmb ?? 'Select';
  const rmb = override?.rmb ?? def.rmb ?? 'Focus look';
  const extra = override?.extra ?? def.extra ?? '';

  el.innerHTML = `
    <div class="wl-cursor-tip__title">${escapeHtml(label)}</div>
    <div class="wl-cursor-tip__row"><span class="wl-cursor-tip__key">LMB</span><span class="wl-cursor-tip__act">${escapeHtml(lmb)}</span></div>
    <div class="wl-cursor-tip__row"><span class="wl-cursor-tip__key">RMB</span><span class="wl-cursor-tip__act">${escapeHtml(rmb)}</span></div>
    ${extra ? `<div class="wl-cursor-tip__extra">${escapeHtml(extra)}</div>` : ''}
  `;
  el.hidden = false;
  // reflow for animation
  void el.offsetWidth;
  el.classList.add('is-on');
  state.tipVisible = true;
}

export function hideCursorTooltip() {
  if (!state.tipEl) return;
  state.tipEl.classList.remove('is-on');
  state.tipVisible = false;
  window.setTimeout(() => {
    if (!state.tipVisible && state.tipEl) state.tipEl.hidden = true;
  }, 150);
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * @param {{
 *   theme?: string,
 *   enabled?: boolean,
 *   target?: HTMLElement|null,
 *   root?: HTMLElement
 * }} [opts]
 */
export function configureWarlordsCursors(opts = {}) {
  if (opts.theme != null) state.theme = opts.theme;
  if (opts.enabled != null) state.enabled = !!opts.enabled;
  if (opts.target !== undefined) state.target = opts.target;
  ensureTipEl();
  if (opts.root) applyCursorTo(opts.root, state.intent);
  applyCursorTo(document.body, state.intent);
  if (state.target) applyCursorTo(state.target, state.intent);
  return { ...state };
}

/**
 * @param {string} intentId
 * @param {{ force?: boolean, tooltip?: boolean, lmb?: string, rmb?: string, extra?: string, label?: string }} [opts]
 */
export function setCursorIntent(intentId, opts = {}) {
  const id = intentId || 'default';
  const tipOn = opts.tooltip !== false;
  if (!opts.force && id === state.intent) {
    if (tipOn && id !== 'none') setCursorTooltip(id, opts);
    return state.intent;
  }
  state.intent = id;
  if (!state.enabled && id !== 'none') return state.intent;

  const css = cursorCssForIntent(id);
  if (document.body) document.body.style.cursor = css;
  if (state.target) state.target.style.cursor = css;
  const canvas = document.getElementById('viewport');
  if (canvas) {
    if (id === 'none') canvas.style.cursor = 'none';
    else if (canvas.style.cursor !== 'none' || opts.force) canvas.style.cursor = css;
  }

  if (id === 'none' || !tipOn) hideCursorTooltip();
  else setCursorTooltip(id, opts);

  return state.intent;
}

/**
 * @param {HTMLElement|null} el
 * @param {string} intentId
 */
function applyCursorTo(el, intentId) {
  if (!el) return;
  el.style.cursor = cursorCssForIntent(intentId);
}

export function getCursorIntent() {
  return state.intent;
}

/**
 * Map world interact kind → cursor intent (dev island).
 * @param {string|null|undefined} kind
 * @returns {string}
 */
export function intentFromInteractKind(kind) {
  const k = String(kind || '').toLowerCase();
  if (!k || k === 'none') return 'default';
  if (/harvest|mine|ore|rock|tree|gather|herb|node/.test(k)) return 'harvest';
  if (/loot|chest|drop|coin|pickup/.test(k)) return 'pickup';
  if (/hostile|enemy|dummy|attack|combat/.test(k)) return 'attack';
  if (/ship|board|gang|anchor|hull/.test(k)) return 'enter_ship';
  if (/sail|helm|oar|windsurf|board_ride/.test(k)) return 'sail';
  if (/door|portal|gate|key/.test(k)) return 'door';
  if (/npc|talk|dialogue|quest/.test(k)) return 'talk';
  if (/look|inspect|examine|info/.test(k)) return 'look';
  if (/draw|cast|path/.test(k)) return 'draw';
  if (/use|interact/.test(k)) return 'use';
  return 'default';
}

/**
 * Preload + bake all pirate cursors to ~28px.
 */
export async function preloadWarlordsCursors() {
  const entries = Object.values(CURSOR_INTENTS);
  const files = new Map();
  for (const d of entries) {
    if (!files.has(d.file)) files.set(d.file, d.hotspot || [8, 4]);
  }
  await Promise.all(
    [...files.entries()].map(([file, hs]) => bakeCursor(file, hs).catch(() => null))
  );
  // Refresh current intent with baked sizes
  if (state.intent && state.intent !== 'none') {
    setCursorIntent(state.intent, { force: true });
  }
}
