/**
 * Fleet env SSOT for Casting lab (browser).
 *
 * Data plane (do not invent forks):
 *   Player / bag / wallet → Railway Postgres via grudge-api (/api/* rewrite)
 *   Auth                 → id.grudge-studio.com
 *   Binary meshes/icons  → assets.grudge-studio.com (R2)
 *   JSON catalogs        → info.grudge-studio.com (+ Pages.dev mirror; not objectstore /api/v1)
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

/** ObjectStore JSON API (custom domain — /api/v1 catalogs 404 as of 2026-08-18) */
export const OBJECTSTORE_URL = env(
  'VITE_OBJECTSTORE_URL',
  'https://objectstore.grudge-studio.com'
);

/**
 * Live ObjectStore Pages (catalog JSON actually 200).
 * Do not treat objectstore.grudge-studio.com/api/v1 as a second catalog DB.
 */
export const OBJECTSTORE_PAGES_URL = env(
  'VITE_OBJECTSTORE_PAGES_URL',
  'https://grudge-objectstore.pages.dev'
);

/** Info gamedata API (catalogs — live SSOT for JSON) */
export const INFO_API = env('VITE_INFO_API', 'https://info.grudge-studio.com/api/v1');

/**
 * Catalog JSON fetch order. Same Railway player DB is never involved.
 * 1. same-origin /api/info (casting rewrites)
 * 2. info.grudge-studio.com
 * 3. ObjectStore Pages (working git host)
 * Never objectstore.grudge-studio.com/api/v1 — those keys 404.
 * @param {string} file e.g. t0-weapons.json
 * @returns {string[]}
 */
export function catalogJsonUrls(file) {
  const name = String(file || '').replace(/^\/+/, '');
  const info = String(INFO_API || '').replace(/\/+$/, '');
  return [
    `/api/info/v1/${name}`,
    `${info}/${name}`,
    `${OBJECTSTORE_PAGES_URL}/api/v1/${name}`
  ];
}

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

/** ThreeFlow embed — prefab / asset editor (not a second Admin Hub). */
export const THREEFLOW_URL = env(
  'VITE_THREEFLOW_URL',
  'https://threeflow-grudgenexus.vercel.app'
);

/**
 * Open ThreeFlow with an asset for prefab authoring.
 * @param {{ assetUrl?: string, name?: string, intent?: string }} [opts]
 */
export function threeflowPrefabUrl(opts = {}) {
  const u = new URL(THREEFLOW_URL.replace(/\/+$/, '') + '/');
  u.searchParams.set('embed', '1');
  u.searchParams.set('intent', opts.intent || 'prefab');
  u.searchParams.set('returnTo', CASTING_CONTROL_PLANE);
  if (opts.assetUrl) u.searchParams.set('asset', opts.assetUrl);
  if (opts.name) u.searchParams.set('name', opts.name);
  return u.toString();
}

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

/** Large lab meshes (rare fish / ride / summons) when promoted off Vercel */
export const CASTING_LAB_R2_PREFIX = 'lab/casting';

/** Published layout JSON keys (info/objectstore + local public mirror) */
export const TRAINING_ROOM_LAYOUT_KEYS = Object.freeze({
  /** Same-origin (Vercel dist / public) — always works on cast deploy */
  local: './maps/training_room/layout.default.json',
  /** ObjectStore mirror path (when uploaded) */
  objectstore: `/api/objectstore/v1/maps/training_room/layout.json`,
  /** Info API path (when uploaded) */
  info: `/api/info/v1/maps/training_room/layout.json`,
  /** R2 via same-origin proxy */
  cdn: `/api/assets/${TRAINING_ROOM_R2_PREFIX}/layout.default.json`
});

/**
 * Absolute CDN URL from path or full URL.
 * @param {string|null|undefined} path
 */
export function cdnUrl(path) {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return sameOriginFleetUrl(path);
  const p = String(path).replace(/^\/+/, '');
  return sameOriginFleetUrl(`${ASSETS_URL}/${p}`);
}

/**
 * Browser on casting.* cannot CORS-read assets.grudge-studio.com / open.*
 * (no Access-Control-Allow-Origin). Rewrite to same-origin Vercel proxies.
 * @param {string} url
 * @returns {string}
 */
export function sameOriginFleetUrl(url) {
  if (!url || typeof url !== 'string') return url;
  if (url.startsWith('./') || url.startsWith('/') || url.startsWith('data:')) return url;
  try {
    const base =
      typeof location !== 'undefined' && location.origin
        ? location.origin
        : CASTING_CONTROL_PLANE;
    const u = new URL(url, base);
    if (u.hostname === 'assets.grudge-studio.com') {
      return `/api/assets${u.pathname}${u.search}`;
    }
    if (u.hostname === 'open.grudge-studio.com') {
      return `/api/open${u.pathname}${u.search}`;
    }
    if (u.hostname === 'objectstore.grudge-studio.com') {
      const path = u.pathname.replace(/^\/api(?=\/)/, '');
      return `/api/objectstore${path}${u.search}`;
    }
    if (u.hostname === 'info.grudge-studio.com') {
      const path = u.pathname.replace(/^\/api(?=\/)/, '');
      return `/api/info${path}${u.search}`;
    }
  } catch {
    /* keep */
  }
  return url;
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
  if (/^https?:\/\//i.test(s)) return sameOriginFleetUrl(s);
  if (opts.preferCdn) {
    // Map local lab paths → R2 promote keys
    const bare = s.replace(/^\.\//, '').replace(/^\//, '');
    if (bare.startsWith('models/dev-island/')) {
      return sameOriginFleetUrl(
        `${ASSETS_URL}/${TRAINING_ROOM_R2_PREFIX}/${bare.slice('models/'.length)}`
      );
    }
    if (bare.startsWith('icons/dev-island/')) {
      return sameOriginFleetUrl(`${ASSETS_URL}/${TRAINING_ROOM_R2_PREFIX}/${bare}`);
    }
    if (
      bare.startsWith('models/fish/species/rare/') ||
      bare.startsWith('models/ride/') ||
      bare.startsWith('models/vfx/summons/')
    ) {
      return sameOriginFleetUrl(`${ASSETS_URL}/${CASTING_LAB_R2_PREFIX}/${bare}`);
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
    castingLabR2Prefix: CASTING_LAB_R2_PREFIX,
    layoutKeys: { ...TRAINING_ROOM_LAYOUT_KEYS },
    authority: {
      player: 'Railway Postgres (grudge-api)',
      binaries: 'R2 assets.grudge-studio.com',
      catalogs: 'info.grudge-studio.com (+ Pages mirror)',
      index: 'D1 (search only — not player)',
      drafts: 'WeaponSkillDrafts DO'
    }
  };
}
