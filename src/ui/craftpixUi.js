/**
 * CraftPix RPG MMO UI — production chrome for casting / Warlords player HUD.
 *
 * Local SSOT: D:\Games\Models\craftpix-rpg-mmo-ui
 * Shipped: public/ui/craftpix/* + CDN assets.grudge-studio.com/ui/craftpix/*
 *
 * CRITICAL: Never return relative urls for CSS custom properties.
 * When CSS in /assets/main-*.css does background-image: var(--cp-*),
 * relative urls resolve against the *stylesheet* path → /assets/ui/craftpix → 404.
 * Always use absolute https:// URLs.
 */

const CDN = 'https://assets.grudge-studio.com/ui/craftpix';

/** @type {Record<string, string>} */
export const CRAFTPIX = {
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
  slotBg: 'hotbar/slot_bg.png',
  slotBorder: 'hotbar/slot_border.png',
  slotCd: 'hotbar/slot_cd.png',
  slotPress: 'hotbar/slot_press.png',
  trackBg: 'fill/track_bg.png',
  trackFill: 'fill/track_fill.png',
  panelBg: 'panel/bg.png',
  castBg: 'cast/bg.png',
  castFill: 'cast/fill.png',
  castIconFrame: 'cast/icon_frame.png',
};

/**
 * Absolute CraftPix texture URL.
 * **Same-origin first** (`/ui/craftpix` shipped in public/) — CDN lacks CORS for
 * crossOrigin Image() preload and caused console noise + missing chrome on casting.grudge.studio.
 * Never return relative paths (CSS vars resolve against /assets/*.css → 404).
 *
 * @param {string} rel path under ui/craftpix
 * @param {{ preferCdn?: boolean, localOnly?: boolean }} [opts]
 */
export function craftpixUrl(rel, opts = {}) {
  const clean = String(rel || '').replace(/^\/+/, '');
  if (!clean) {
    return typeof window !== 'undefined' && window.location?.origin
      ? `${window.location.origin}/ui/craftpix`
      : CDN;
  }
  if (opts.preferCdn) return `${CDN}/${clean}`;
  // Default: same-origin ship (public/ui/craftpix) — production lab / client handoff
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}/ui/craftpix/${clean}`;
  }
  return `${CDN}/${clean}`;
}

/**
 * CSS custom properties — full absolute url("https://host/ui/craftpix/...") only.
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
    '--cp-cast-icon': CRAFTPIX.castIconFrame,
  };
  for (const [k, rel] of Object.entries(map)) {
    const abs = craftpixUrl(rel); // same-origin
    el.style.setProperty(k, `url("${abs}")`);
  }
  el.classList.add('craftpix-ui');
}

/**
 * Race portrait CDN (Foundry / client fleet).
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
    dwarf: 'dwarf',
  };
  const key = map[String(raceId || 'WK')] || 'human';
  return `https://client.grudge-studio.com/images/portraits/${key}.png`;
}

/**
 * Preload unit-frame + hotbar sheets.
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
          img.onerror = () => resolve();
          // Same-origin → no CORS; crossOrigin only needed for CDN canvas taint
          img.src = craftpixUrl(rel);
        }),
    ),
  ).then(() => undefined);
}
