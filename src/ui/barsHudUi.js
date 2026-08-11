/**
 * Bars HUD pack — Casting product picks (Warlords overhead + player frame).
 *
 * Disk SSOT: D:\Games\Models\bars-hud-pack
 * Shipped:   public/hud/bars/*
 * Skill:     craftpix-rpg-mmo-ui § Bars pack complement
 *
 * Product lock (owner):
 *  - Enemy overhead  → overhead/overhead_health_003.png
 *  - Ally overhead   → overhead/overhead_health_001.png
 *  - Player frame    → unit-frames/unit_frame_009.png
 *  - Bar fills       → fillers/health|mana|stamina_fill_*.png
 */

/**
 * Bars pack URLs must be absolute — CSS vars resolve relative to /assets/*.css
 * (not the document), which turned `./hud/bars` into `/assets/hud/bars` → 404.
 */
const BARS_CDN = 'https://assets.grudge-studio.com/hud/bars';

/**
 * Locked product asset map (do not invent alternate frames without owner pick).
 */
export const BARS_HUD_PICKS = Object.freeze({
  playerUnitFrame: 'unit-frames/unit_frame_009.png',
  overheadEnemy: 'overhead/overhead_health_003.png',
  overheadAlly: 'overhead/overhead_health_001.png',
  /** Primary bar interiors — thin colorful fillers */
  healthFill: 'fillers/health_fill_010.png',
  healthFillThin: 'fillers/health_fill_001.png',
  manaFill: 'fillers/mana_fill_001.png',
  staminaFill: 'fillers/stamina_fill_001.png',
  /** Overhead fill (sits inside overhead chrome) */
  overheadFill: 'fillers/health_fill_015.png'
});

/**
 * @param {string} rel path under hud/bars
 */
export function barsHudUrl(rel) {
  const clean = String(rel || '').replace(/^\/+/, '');
  // Origin-absolute (public/hud/bars is shipped). Do not use relative paths —
  // CSS url() resolves against /assets/*.css → /assets/hud/bars → 404.
  // assets.grudge-studio.com/hud/bars/* is not uploaded on fleet CDN (404).
  if (typeof window !== 'undefined' && window.location?.href) {
    try {
      return new URL(`./hud/bars/${clean}`, window.location.href).href;
    } catch {
      /* fall through */
    }
  }
  return `${BARS_CDN}/${clean}`;
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
    '--bars-overhead-fill': BARS_HUD_PICKS.overheadFill
  };
  for (const [k, rel] of Object.entries(map)) {
    el.style.setProperty(k, `url("${barsHudUrl(rel)}")`);
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
        })
    )
  ).then(() => undefined);
}

/**
 * Build overhead nameplate DOM (enemy or ally).
 * @param {'enemy'|'ally'} kind
 * @param {{ name?: string }} [opts]
 * @returns {HTMLElement}
 */
export function createOverheadBarEl(kind = 'enemy', opts = {}) {
  const isAlly = kind === 'ally';
  const el = document.createElement('div');
  el.className = `oh-bar oh-bar--${isAlly ? 'ally' : 'enemy'}`;
  el.setAttribute('data-oh-kind', isAlly ? 'ally' : 'enemy');
  el.innerHTML = `
    <div class="oh-bar__chrome" aria-hidden="true"></div>
    <div class="oh-bar__track">
      <div class="oh-bar__fill" data-oh-fill style="width:100%"></div>
    </div>
    ${opts.name ? `<span class="oh-bar__name">${escapeHtml(opts.name)}</span>` : ''}
  `;
  return el;
}

/**
 * @param {HTMLElement} el
 * @param {number} hp01 0..1
 */
export function setOverheadBarHp(el, hp01) {
  if (!el) return;
  const pct = Math.round(Math.max(0, Math.min(1, hp01)) * 100);
  const fill = el.querySelector('[data-oh-fill]');
  if (fill) fill.style.width = `${pct}%`;
  el.classList.toggle('is-dead', pct <= 0);
  el.classList.toggle('is-low', pct > 0 && pct <= 25);
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
