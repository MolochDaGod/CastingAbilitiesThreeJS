/**
 * CraftPix RPG MMO UI — production chrome for casting / Warlords player HUD.
 *
 * Local SSOT: D:\Games\Models\craftpix-rpg-mmo-ui
 * Shipped: public/ui/craftpix/* (and CDN assets.grudge-studio.com/ui/craftpix/*)
 * Skill: craftpix-rpg-mmo-ui
 *
 * Prefer same-origin /ui/craftpix (Vercel deploy). CDN is fallback for missing files.
 */

const CDN = 'https://assets.grudge-studio.com/ui/craftpix';
const LOCAL = '/ui/craftpix';

/** @type {Record<string, string>} */
export const CRAFTPIX = {
  // Unit frames
  avatarBg: 'unit/avatar_bg.png',
  avatarBorder: 'unit/avatar_border.png',
  avatarOverlay: 'unit/avatar_overlay.png',
  pbBg: 'unit/pb_bg.png',
  pbFill: 'unit/pb_fill.png',
  sbBg: 'unit/sb_bg.png',
  sbFill: 'unit/sb_fill.png',
  levelBg: 'unit/level_bg.png',
  levelBorder: 'unit/level_border.png',
  skull: 'unit/skull.png',
  // Hotbar
  slotBg: 'hotbar/slot_bg.png',
  slotBorder: 'hotbar/slot_border.png',
  slotCd: 'hotbar/slot_cd.png',
  slotPress: 'hotbar/slot_press.png',
  // Fill bars (thin tracks)
  trackBg: 'fill/track_bg.png',
  trackFill: 'fill/track_fill.png',
  // Panel
  panelBg: 'panel/bg.png',
  // Cast bar (under crosshair)
  castBg: 'cast/bg.png',
  castFill: 'cast/fill.png',
  castIconFrame: 'cast/icon_frame.png'
};

/**
 * Resolve CraftPix texture URL (local first).
 * @param {string} rel path under ui/craftpix
 * @param {{ preferCdn?: boolean }} [opts]
 */
export function craftpixUrl(rel, opts = {}) {
  const clean = String(rel || '').replace(/^\/+/, '');
  if (opts.preferCdn) return `${CDN}/${clean}`;
  return `${LOCAL}/${clean}`;
}

/**
 * CSS custom properties for CraftPix chrome — set on :root / .hud
 * @param {HTMLElement} [el]
 */
export function applyCraftpixCssVars(el = document.documentElement) {
  if (!el) return;
  const map = {
    '--cp-avatar-bg': CRAFTPIX.avatarBg,
    '--cp-avatar-border': CRAFTPIX.avatarBorder,
    '--cp-avatar-overlay': CRAFTPIX.avatarOverlay,
    '--cp-pb-bg': CRAFTPIX.pbBg,
    '--cp-pb-fill': CRAFTPIX.pbFill,
    '--cp-sb-bg': CRAFTPIX.sbBg,
    '--cp-sb-fill': CRAFTPIX.sbFill,
    '--cp-level-bg': CRAFTPIX.levelBg,
    '--cp-level-border': CRAFTPIX.levelBorder,
    '--cp-skull': CRAFTPIX.skull,
    '--cp-slot-bg': CRAFTPIX.slotBg,
    '--cp-slot-border': CRAFTPIX.slotBorder,
    '--cp-slot-cd': CRAFTPIX.slotCd,
    '--cp-slot-press': CRAFTPIX.slotPress,
    '--cp-track-bg': CRAFTPIX.trackBg,
    '--cp-track-fill': CRAFTPIX.trackFill,
    '--cp-panel-bg': CRAFTPIX.panelBg,
    '--cp-cast-bg': CRAFTPIX.castBg,
    '--cp-cast-fill': CRAFTPIX.castFill,
    '--cp-cast-icon': CRAFTPIX.castIconFrame
  };
  for (const [k, rel] of Object.entries(map)) {
    el.style.setProperty(k, `url("${craftpixUrl(rel)}")`);
  }
  el.classList.add('craftpix-ui');
}

/**
 * Race portrait CDN (Foundry / client fleet) — not CraftPix, but production chrome.
 * @param {string} raceId WK|ELF|…
 */
export function racePortraitUrl(raceId) {
  const map = {
    WK: 'human',
    ELF: 'elf',
    BRB: 'barbarian',
    ORC: 'orc',
    UD: 'undead',
    DWF: 'dwarf',
    human: 'human',
    elf: 'elf',
    barbarian: 'barbarian',
    orc: 'orc',
    undead: 'undead',
    dwarf: 'dwarf'
  };
  const key = map[String(raceId || 'WK')] || 'human';
  return `https://client.grudge-studio.com/images/portraits/${key}.png`;
}

/**
 * Preload unit-frame + hotbar sheets so first paint is not empty CSS boxes.
 * @returns {Promise<void>}
 */
export function preloadCraftpixUi() {
  const keys = Object.values(CRAFTPIX);
  return Promise.all(
    keys.map(
      (rel) =>
        new Promise((resolve) => {
          const img = new Image();
          img.onload = () => resolve();
          img.onerror = () => {
            // CDN fallback once
            const c = new Image();
            c.onload = () => resolve();
            c.onerror = () => resolve();
            c.src = craftpixUrl(rel, { preferCdn: true });
          };
          img.src = craftpixUrl(rel);
        })
    )
  ).then(() => undefined);
}
