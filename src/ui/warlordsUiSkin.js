/**
 * Warlords-era Dev Island UI skin SSOT (casting lab).
 *
 * Author sources (Documents):
 *  - inventory.png      → full bag / paperdoll + craft grid shell (MC-style layout ref)
 *  - miniinventory.png  → fantasy wood mini bag 9×4 + hotbar 1–10
 *  - button UI.png      → pixel icon atlas for chrome / toggles
 *  - Pirate Pack Cursors → hover intents (not a second inventory stack)
 *
 * Shipped: public/ui/warlords-dev/*
 * Does not replace CraftPix unit frames / hotbar — those stay craftpixUi.js.
 * This pack owns bag chrome + cursor theme for gameplay interact.
 *
 * @see docs/WARLORDS_DEV_UI_SSOT.md · docs/MAIN_PANEL_INVENTORY_SSOT.md
 */

const LOCAL = '/ui/warlords-dev';
const CDN = 'https://assets.grudge-studio.com/ui/warlords-dev';

/** @type {Record<string, string>} */
export const WARLORDS_UI = Object.freeze({
  inventoryShell: 'inventory/inventory.png',
  miniInventoryShell: 'inventory/miniinventory.png',
  buttonAtlas: 'buttons/button-ui.png',
  /** Legacy slot set still used by Main Panel grid cells */
  inventorySlotsSet: '/ui/inventory/inventory-slots-set.png',
  equipmentRef: '/ui/inventory/equipment-reference.png'
});

/**
 * Mini-inventory grid contract (from miniinventory.png art).
 */
export const MINI_INV = Object.freeze({
  bagCols: 9,
  bagRows: 4,
  bagSlots: 36,
  hotbarSlots: 10,
  /** Design art size */
  artW: 800,
  artH: 512
});

/**
 * Full inventory.png layout notes (201×188 author).
 * Armor doll TL · 2×2 craft + result · 9×3 bag · 9 hotbar · side tabs.
 */
export const FULL_INV = Object.freeze({
  bagCols: 9,
  bagRows: 3,
  bagSlots: 27,
  hotbarSlots: 9,
  craftGrid: 4,
  craftResult: 1,
  artW: 201,
  artH: 188
});

/**
 * Button atlas is 192×192 with an 8×8 cell grid (~24px cells).
 * Index = row * 8 + col (0-based). Used for CSS sprite icons.
 */
export const BUTTON_ATLAS = Object.freeze({
  size: 192,
  cols: 8,
  rows: 8,
  cell: 24
});

/**
 * @param {string} rel path under ui/warlords-dev
 * @param {{ preferCdn?: boolean }} [opts]
 */
export function warlordsUiUrl(rel, opts = {}) {
  const clean = String(rel || '').replace(/^\/+/, '');
  if (clean.startsWith('ui/') || clean.startsWith('/')) {
    return clean.startsWith('/') ? clean : `/${clean}`;
  }
  if (opts.preferCdn) return `${CDN}/${clean}`;
  return `${LOCAL}/${clean}`;
}

/**
 * CSS custom properties for Warlords bag / button chrome.
 * @param {HTMLElement} [el]
 */
export function applyWarlordsUiCssVars(el = document.documentElement) {
  if (!el) return;
  const inv = warlordsUiUrl(WARLORDS_UI.inventoryShell);
  const mini = warlordsUiUrl(WARLORDS_UI.miniInventoryShell);
  const btn = warlordsUiUrl(WARLORDS_UI.buttonAtlas);
  el.style.setProperty('--wl-inv-shell', `url("${inv}")`);
  el.style.setProperty('--wl-mini-inv-shell', `url("${mini}")`);
  el.style.setProperty('--wl-btn-atlas', `url("${btn}")`);
  el.style.setProperty('--wl-inv-slots', `url("${WARLORDS_UI.inventorySlotsSet}")`);
  el.classList.add('wl-ui-skin');
}

/**
 * Preload bag shells so first open is instant.
 * @returns {Promise<void>}
 */
export function preloadWarlordsUi() {
  const urls = [
    warlordsUiUrl(WARLORDS_UI.inventoryShell),
    warlordsUiUrl(WARLORDS_UI.miniInventoryShell),
    warlordsUiUrl(WARLORDS_UI.buttonAtlas)
  ];
  return Promise.all(
    urls.map(
      (u) =>
        new Promise((resolve) => {
          const img = new Image();
          img.onload = img.onerror = () => resolve();
          img.src = u;
        })
    )
  ).then(() => undefined);
}

/**
 * CSS background-position for a button-atlas cell.
 * @param {number} col 0..7
 * @param {number} row 0..7
 */
export function buttonAtlasPos(col, row) {
  const c = Math.max(0, Math.min(7, col | 0));
  const r = Math.max(0, Math.min(7, row | 0));
  const cell = BUTTON_ATLAS.cell;
  return `-${c * cell}px -${r * cell}px`;
}
