/**
 * Pirate Pack cursors — Warlords / casting mouse-intent theme.
 *
 * Pack: public/ui/warlords-dev/cursors/pirate/MouseIcon1…10.png
 * Fleet rule: theme under ui-cursor SSOT — not a second inventory system.
 *
 * Use:
 *   configureWarlordsCursors({ theme: 'pirate' })
 *   setCursorIntent('harvest' | 'attack' | 'loot' | …)
 *   setCursorIntent('default') on leave
 *
 * Focus combat (RMB) still hides OS cursor for crosshair — intents apply when unlocked.
 */

import { warlordsUiUrl } from './warlordsUiSkin.js';

/** @typedef {keyof typeof CURSOR_INTENTS | 'default' | 'none'} CursorIntentId */

/**
 * Intent → pack file. Hotspot = tip of the icon (approx).
 * Mapping from Pirate Pack art review + prior Warlords ship/door/loot split.
 */
export const CURSOR_INTENTS = Object.freeze({
  /** Default free roam / UI */
  default: { file: 'MouseIcon2.png', hotspot: '4 2', label: 'Default (cutlass)' },
  /** Hostile / combat hover */
  attack: { file: 'MouseIcon2.png', hotspot: '4 2', label: 'Attack' },
  /** Slash / skill ready */
  slash: { file: 'MouseIcon3.png', hotspot: '6 4', label: 'Slash' },
  /** Board ship / gangway (anchor) — NOT sail */
  enter_ship: { file: 'MouseIcon1.png', hotspot: '12 4', label: 'Board ship' },
  /** Sail / helm (mapped to distinct icon; do not use enter_ship) */
  sail: { file: 'MouseIcon6.png', hotspot: '8 8', label: 'Sail / helm' },
  /** Door / portal / key */
  door: { file: 'MouseIcon4.png', hotspot: '8 4', label: 'Door / portal' },
  /** Loot / coin / chest */
  loot: { file: 'MouseIcon7.png', hotspot: '10 10', label: 'Loot' },
  /** Inspect / telescope */
  look: { file: 'MouseIcon5.png', hotspot: '4 12', label: 'Inspect' },
  /** Harvest node in range (pick / gather) */
  harvest: { file: 'MouseIcon8.png', hotspot: '6 4', label: 'Harvest' },
  /** Talk / NPC */
  talk: { file: 'MouseIcon9.png', hotspot: '8 8', label: 'Talk' },
  /** Grab / use / general interact */
  use: { file: 'MouseIcon10.png', hotspot: '8 8', label: 'Use' },
  /** Pickup world drop */
  pickup: { file: 'MouseIcon7.png', hotspot: '10 10', label: 'Pickup' }
});

const BASE = 'cursors/pirate';

/** @type {{ theme: string, enabled: boolean, intent: string, target: HTMLElement|null }} */
const state = {
  theme: 'pirate',
  enabled: true,
  intent: 'default',
  target: null
};

/**
 * @param {string} file
 */
function cursorUrl(file) {
  return warlordsUiUrl(`${BASE}/${file}`);
}

/**
 * @param {string} intentId
 * @returns {string} CSS cursor value
 */
export function cursorCssForIntent(intentId) {
  if (intentId === 'none') return 'none';
  const def = CURSOR_INTENTS[intentId] || CURSOR_INTENTS.default;
  const url = cursorUrl(def.file);
  return `url("${url}") ${def.hotspot}, auto`;
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
  if (opts.root) applyCursorTo(opts.root, state.intent);
  // Body + canvas
  applyCursorTo(document.body, state.intent);
  if (state.target) applyCursorTo(state.target, state.intent);
  return { ...state };
}

/**
 * @param {string} intentId
 * @param {{ force?: boolean }} [opts]
 */
export function setCursorIntent(intentId, opts = {}) {
  const id = intentId || 'default';
  if (!opts.force && id === state.intent) return state.intent;
  state.intent = id;
  if (!state.enabled && id !== 'none') return state.intent;

  const css = cursorCssForIntent(id);
  if (document.body) document.body.style.cursor = css;
  if (state.target) state.target.style.cursor = css;
  // Keep canvas in sync when not focus-locked
  const canvas = document.getElementById('viewport');
  if (canvas && canvas.style.cursor !== 'none') {
    canvas.style.cursor = id === 'none' ? 'none' : css;
  }
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
  if (/loot|chest|drop|coin|pickup/.test(k)) return 'loot';
  if (/hostile|enemy|dummy|attack|combat/.test(k)) return 'attack';
  if (/ship|board|gang|anchor|hull/.test(k)) return 'enter_ship';
  if (/sail|helm|oar|windsurf|board_ride/.test(k)) return 'sail';
  if (/door|portal|gate|key/.test(k)) return 'door';
  if (/npc|talk|dialogue|quest/.test(k)) return 'talk';
  if (/look|inspect|examine|info/.test(k)) return 'look';
  if (/use|interact/.test(k)) return 'use';
  return 'default';
}

/**
 * Preload pirate cursor PNGs.
 */
export function preloadWarlordsCursors() {
  const files = new Set(Object.values(CURSOR_INTENTS).map((d) => d.file));
  return Promise.all(
    [...files].map(
      (f) =>
        new Promise((resolve) => {
          const img = new Image();
          img.onload = img.onerror = () => resolve();
          img.src = cursorUrl(f);
        })
    )
  ).then(() => undefined);
}
