/**
 * Grudge asset SSOT for this sandbox.
 *
 * Meshes + atlases: assets.grudge-studio.com (R2 CDN) — grudge6-cdn-ssot
 * Baked Bip001 clips: open.grudge-studio.com/anims/baked/… (CORS *)
 *
 * Do not reintroduce Mixamo FBX or local character binaries.
 */

export const ASSETS_CDN = 'https://assets.grudge-studio.com';
export const OPEN_HOST = 'https://open.grudge-studio.com';

/** Western Kingdoms modular race kit (production GLB). */
export const CHARACTER_KIT_URL = `${ASSETS_CDN}/models/grudge6/races/WK_Characters.glb`;

/** Race atlas — rebound if the GLB materials are missing maps. */
export const CHARACTER_ATLAS_URL =
  `${ASSETS_CDN}/textures/grudge6/western-kingdoms/WK_Standard_Units.webp`;

/**
 * Magic pack clips (Bip001, rotation-only JSON).
 * Paths are relative to /anims/baked/ on Open.
 */
export const ANIM_PACK = {
  idle: 'magic/standing idle',
  cast: 'magic/standing 1h cast spell 01'
};

export function bakedClipUrl(rel) {
  const clean = String(rel).replace(/^\/+/, '').replace(/\.json$/i, '');
  return `${OPEN_HOST}/anims/baked/${encodeURI(clean)}.json`;
}

/** SI human target height (metres). */
export const TARGET_HEIGHT_M = 1.8;
