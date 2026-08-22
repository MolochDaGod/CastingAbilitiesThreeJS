/**
 * Load fleet GrudgeGameUI (Warlords pack) same-origin.
 * One HUD chrome. HUD.js binds live gameplay into this pack.
 * Do not load hud-settings.js (default Q=block fights tap-Q weapon swap).
 *
 * @see public/ui/grudge-game-ui/game-ui-runtime.js
 * @see https://ui.grudge-studio.com/game-ui-packs/index.json
 */

export const GGUI_BASE = '/ui/grudge-game-ui';

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[data-ggui="${src}"]`)) {
      resolve();
      return;
    }
    const s = document.createElement('script');
    s.src = src;
    s.async = false;
    s.dataset.ggui = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`ggui script ${src}`));
    document.head.appendChild(s);
  });
}

/**
 * @param {'warlords'|'grudge6'} [packId]
 * @returns {Promise<object>} GameUIInstance
 */
export async function loadWarlordsGameUi(packId = 'warlords') {
  await loadScript(`${GGUI_BASE}/game-ui-runtime.js`);
  await loadScript(`${GGUI_BASE}/bars-hud-ssot.js`);
  const G = typeof window !== 'undefined' ? window.GrudgeGameUI : null;
  if (!G) throw new Error('GrudgeGameUI runtime missing');
  G.baseUrl = GGUI_BASE;
  const file = packId === 'grudge6' ? 'grudge6.json' : 'warlords.json';
  return G.loadFromUrl(`${GGUI_BASE}/${file}`);
}

/** XState activity → pack usageState (no harvest key in warlords pack). */
export function playScreenFromActivity(activity, inventoryOpen) {
  if (inventoryOpen) return 'inventory';
  if (activity === 'harvest') return 'explore';
  return 'combat';
}
