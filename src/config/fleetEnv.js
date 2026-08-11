/**
 * Fleet env SSOT for Casting lab (browser).
 *
 * Data plane (do not invent forks):
 *   Player / bag / wallet → Railway Postgres via grudge-api (/api/* rewrite)
 *   Auth                 → id.grudge-studio.com
 *   Binary meshes/icons  → assets.grudge-studio.com (R2)
 *   JSON catalogs        → info.grudge-studio.com + objectstore mirror
 *   Asset INDEX only     → D1 (never player SSOT)
 *   Skill drafts         → weapon-skills DO
 *
 * SPA never holds DATABASE_URL or CF tokens.
 * @see docs/CASTING_DEPLOY_ENV_SSOT.md · docs/TRAINING_ROOM_SSOT.md
 */

function env(key, fallback = '') {
  try {
    const v = typeof import.meta !== 'undefined' ? import.meta.env?.[key] : undefined;
    if (v === undefined || v === null || v === '') return fallback;
    return String(v).replace(/\/+$/, '');
  } catch {
    return fallback;
  }
}

/** R2 CDN binaries */
export const ASSETS_URL = env('VITE_ASSETS_URL', 'https://assets.grudge-studio.com');

/** ObjectStore JSON API */
export const OBJECTSTORE_URL = env(
  'VITE_OBJECTSTORE_URL',
  'https://objectstore.grudge-studio.com'
);

/** Info gamedata API (catalogs) */
export const INFO_API = env('VITE_INFO_API', 'https://info.grudge-studio.com/api/v1');

/** Grudge ID SSO */
export const AUTH_URL = env('VITE_AUTH_URL', 'https://id.grudge-studio.com');

/** Weapon skill drafts Durable Object */
export const WEAPON_SKILL_DO_URL = env(
  'VITE_WEAPON_SKILL_DO_URL',
  'https://weapon-skills.grudge-studio.com'
);

/** Railway absolute (player API fallback) */
export const RAILWAY_API = env(
  'VITE_RAILWAY_API',
  'https://grudge-api-production-0d46.up.railway.app'
);

/** Control plane hosts */
export const CASTING_CONTROL_PLANE = 'https://casting.grudge.studio';
export const CASTING_LEGACY_HOST = 'https://casting.grudge-studio.com';
export const CASTING_VERCEL =
  'https://casting-abilities-threejs.vercel.app';

/**
 * R2 / CDN key prefix for Training Room · DevIsland when promoted off Vercel static.
 * Lab still ships meshes under /models/dev-island on the SPA for fast deploys;
 * production promote copies same keys to R2 under this prefix + D1 index rows.
 */
export const TRAINING_ROOM_R2_PREFIX = 'lab/casting/training-room';

/** Published layout JSON keys (info/objectstore + local public mirror) */
export const TRAINING_ROOM_LAYOUT_KEYS = Object.freeze({
  /** Same-origin (Vercel dist / public) — always works on cast deploy */
  local: './maps/training_room/layout.default.json',
  /** ObjectStore mirror path (when uploaded) */
  objectstore: `${OBJECTSTORE_URL}/api/v1/maps/training_room/layout.json`,
  /** Info API path (when uploaded) */
  info: `${INFO_API}/maps/training_room/layout.json`,
  /** R2 direct */
  cdn: `${ASSETS_URL}/${TRAINING_ROOM_R2_PREFIX}/layout.default.json`
});

/**
 * Absolute CDN URL from path or full URL.
 * @param {string|null|undefined} path
 */
export function cdnUrl(path) {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  const p = String(path).replace(/^\/+/, '');
  return `${ASSETS_URL}/${p}`;
}

/**
 * Resolve a lab mesh/icon for best deploy behavior:
 *  1. Already absolute (https) → keep
 *  2. Same-origin relative (./models/… or /models/…) → keep (Vercel ships public/)
 *  3. Bare R2 key → CDN
 *
 * @param {string|null|undefined} path
 * @param {{ preferCdn?: boolean }} [opts]
 */
export function resolveLabAssetUrl(path, opts = {}) {
  if (!path) return null;
  const s = String(path);
  if (/^https?:\/\//i.test(s)) return s;
  if (opts.preferCdn) {
    // Map local lab paths → R2 promote keys
    const bare = s.replace(/^\.\//, '').replace(/^\//, '');
    if (bare.startsWith('models/dev-island/')) {
      return `${ASSETS_URL}/${TRAINING_ROOM_R2_PREFIX}/${bare.slice('models/'.length)}`;
    }
    if (bare.startsWith('icons/dev-island/')) {
      return `${ASSETS_URL}/${TRAINING_ROOM_R2_PREFIX}/${bare}`;
    }
    return cdnUrl(bare);
  }
  // Default: same-origin for casting Vercel (public/ in dist)
  if (s.startsWith('./') || s.startsWith('/')) return s;
  return `./${s}`;
}

/**
 * Production readiness snapshot for HUD / Admin.
 */
export function fleetDeploySnapshot() {
  return {
    assetsUrl: ASSETS_URL,
    objectstoreUrl: OBJECTSTORE_URL,
    infoApi: INFO_API,
    authUrl: AUTH_URL,
    weaponSkillDo: WEAPON_SKILL_DO_URL,
    railwayApi: RAILWAY_API,
    controlPlane: CASTING_CONTROL_PLANE,
    trainingRoomR2Prefix: TRAINING_ROOM_R2_PREFIX,
    layoutKeys: { ...TRAINING_ROOM_LAYOUT_KEYS },
    authority: {
      player: 'Railway Postgres (grudge-api)',
      binaries: 'R2 assets.grudge-studio.com',
      catalogs: 'info + objectstore',
      index: 'D1 (search only — not player)',
      drafts: 'WeaponSkillDrafts DO'
    }
  };
}
