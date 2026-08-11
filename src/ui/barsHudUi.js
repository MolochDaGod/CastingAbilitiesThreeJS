/**
 * Bars HUD pack — Casting product picks (Warlords overhead + player frame).
 *
 * Disk SSOT: D:\Games\Models\bars-hud-pack
 * Shipped:   public/hud/bars/*
 *
 * CRITICAL: CSS var url() must be absolute https:// (or origin absolute).
 * Relative ./hud/bars resolves against /assets/main-*.css → /assets/hud/bars → 404.
 */

/**
 * Locked product asset map (do not invent alternate frames without owner pick).
 */
export const BARS_HUD_PICKS = Object.freeze({
  playerUnitFrame: 'unit-frames/unit_frame_009.png',
  overheadEnemy: 'overhead/overhead_health_003.png',
  overheadAlly: 'overhead/overhead_health_001.png',
  healthFill: 'fillers/health_fill_010.png',
  healthFillThin: 'fillers/health_fill_001.png',
  manaFill: 'fillers/mana_fill_001.png',
  staminaFill: 'fillers/stamina_fill_001.png',
  overheadFill: 'fillers/health_fill_015.png',
});

/**
 * @param {string} rel path under hud/bars
 */
export function barsHudUrl(rel) {
  const clean = String(rel || '').replace(/^\/+/, '');
  // Same-origin absolute (files live in public/hud/bars on Vercel)
  const origin =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'https://casting.grudge.studio';
  return `${origin}/hud/bars/${clean}`;
}

/**
 * CSS custom properties for Bars pack chrome.
 * @param {HTMLElement} [el]
 */
export function applyBarsHudCssVars(el = document.documentElement) {
  if (!el) return;
  const map = {
    '--bars-player-frame': BARS_HUD_PICKS.playerUnitFrame,
    '--bars-overhead-enemy': BARS_HUD_PICKS.overheadEnemy,
    '--bars-overhead-ally': BARS_HUD_PICKS.overheadAlly,
    '--bars-health-fill': BARS_HUD_PICKS.healthFill,
    '--bars-health-fill-thin': BARS_HUD_PICKS.healthFillThin,
    '--bars-mana-fill': BARS_HUD_PICKS.manaFill,
    '--bars-stamina-fill': BARS_HUD_PICKS.staminaFill,
    '--bars-overhead-fill': BARS_HUD_PICKS.overheadFill,
  };
  for (const [k, rel] of Object.entries(map)) {
    const abs = barsHudUrl(rel);
    el.style.setProperty(k, `url("${abs}")`);
  }
  el.classList.add('bars-hud-ui');
}

/**
 * Preload product picks so first paint is not empty.
 * @returns {Promise<void>}
 */
export function preloadBarsHudUi() {
  const keys = Object.values(BARS_HUD_PICKS);
  return Promise.all(
    keys.map(
      (rel) =>
        new Promise((resolve) => {
          const img = new Image();
          img.onload = () => resolve();
          img.onerror = () => resolve();
          img.src = barsHudUrl(rel);
        }),
    ),
  ).then(() => undefined);
}
