/**
 * Thin client for Grudge deployable game API (Railway Postgres SSOT).
 * SSOT: grudge-production-wiring — one account, Railway characters/bag.
 *
 * Production casting host prefers **same-origin** `/api/*` (vercel.json rewrite → Railway)
 * so the browser never needs CORS for player data. Absolute Railway URL is fallback
 * (local vite without proxy, or VITE_FLEET_API override).
 *
 * Database: never connect from the SPA. Characters/bag live on Railway Postgres
 * via grudge-api. D1 is asset index only (ObjectStore/info), not player SSOT.
 */

/** Absolute Railway game API (player DB). */
export const RAILWAY_API =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_RAILWAY_API) ||
  'https://grudge-api-production-0d46.up.railway.app';

/**
 * Resolve API base for browser:
 *  - VITE_FLEET_API if set ("" or "same-origin" → relative /api)
 *  - on casting / vercel.app hosts → same-origin (proxy)
 *  - else Railway absolute
 */
export function resolveFleetApiBase() {
  const env =
    typeof import.meta !== 'undefined' ? import.meta.env?.VITE_FLEET_API : undefined;
  if (env === '' || env === 'same-origin' || env === '/') return '';
  if (typeof env === 'string' && env.trim()) return env.replace(/\/+$/, '');

  if (typeof window !== 'undefined' && window.location?.hostname) {
    const h = window.location.hostname;
    // Control plane: casting.grudge.studio (primary) · legacy casting.grudge-studio.com
    if (
      h === 'casting.grudge.studio' ||
      h.endsWith('.casting.grudge.studio') ||
      h === 'casting.grudge-studio.com' ||
      h.endsWith('.casting.grudge-studio.com') ||
      h.includes('casting-abilities-threejs') ||
      h === 'localhost' ||
      h === '127.0.0.1'
    ) {
      // localhost: vite has no /api proxy unless configured — use Railway
      if (h === 'localhost' || h === '127.0.0.1') return RAILWAY_API;
      return '';
    }
  }
  return RAILWAY_API;
}

export const FLEET_API_DEFAULT = resolveFleetApiBase();

/** Production Main Panel / Open (do not fork UI here). */
export const MAIN_PANEL_URL =
  'https://ui.grudge-studio.com/main-panel.html?era=warlords';
export const OPEN_LIBRARY_URL = 'https://open.grudge-studio.com';
export const CHARACTER_FOUNDRY_URL = 'https://character.grudge-studio.com/foundry';
export const GRUDGE_ID_URL = 'https://id.grudge-studio.com';
/** Inventory / crafting / char select product SSOT (Warlords craft suite) */
export const CRAFT_SSOT_URL = 'https://grudgewarlords.com/craft/';

/**
 * @typedef {object} FleetApiStatus
 * @property {boolean} ok
 * @property {number} [latencyMs]
 * @property {string} [message]
 * @property {object} [body]
 */

export class FleetApi {
  /**
   * @param {{ baseUrl?: string, getToken?: () => string|null }} [opts]
   */
  constructor(opts = {}) {
    const base = opts.baseUrl !== undefined ? opts.baseUrl : resolveFleetApiBase();
    // '' = same-origin (vercel /api rewrites)
    this.baseUrl = String(base ?? '').replace(/\/+$/, '');
    this.getToken = opts.getToken || (() => {
      try {
        // Fleet JWT keys used across Open / Foundry / client
        return (
          localStorage.getItem('grudge_token') ||
          localStorage.getItem('grudge_jwt') ||
          localStorage.getItem('grudgeIdToken') ||
          localStorage.getItem('grudge_id_token') ||
          localStorage.getItem('grudge.sessionToken') ||
          localStorage.getItem('token') ||
          sessionStorage.getItem('grudge_token') ||
          null
        );
      } catch {
        return null;
      }
    });
    /** @type {FleetApiStatus|null} */
    this.lastHealth = null;
    /** @type {object[]|null} */
    this.lastCharacters = null;
  }

  /**
   * @param {string} path
   * @param {RequestInit} [init]
   */
  async fetch(path, init = {}) {
    let url;
    if (path.startsWith('http')) {
      url = path;
    } else {
      const p = path.startsWith('/') ? path : `/${path}`;
      url = this.baseUrl ? `${this.baseUrl}${p}` : p;
    }
    const headers = new Headers(init.headers || {});
    if (!headers.has('Accept')) headers.set('Accept', 'application/json');
    const token = this.getToken();
    if (token && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${token}`);
    }
    // Same-origin /api can use credentials; cross-origin Railway uses bearer only
    const sameOrigin = !this.baseUrl || url.startsWith('/') || (typeof window !== 'undefined' && url.startsWith(window.location.origin));
    const res = await fetch(url, {
      ...init,
      headers,
      mode: 'cors',
      credentials: sameOrigin ? 'include' : 'omit'
    });
    const text = await res.text();
    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = { raw: text?.slice(0, 200) };
    }
    return { res, body, url };
  }

  /** GET /api/health or /health */
  async health() {
    const t0 = performance.now();
    const tryPaths = ['/api/health', '/health', '/api/status'];
    for (const p of tryPaths) {
      try {
        const { res, body } = await this.fetch(p);
        if (res.ok) {
          this.lastHealth = {
            ok: true,
            latencyMs: Math.round(performance.now() - t0),
            message: `OK ${p}`,
            body
          };
          return this.lastHealth;
        }
      } catch (err) {
        this.lastHealth = {
          ok: false,
          latencyMs: Math.round(performance.now() - t0),
          message: err?.message || String(err)
        };
      }
    }
    if (!this.lastHealth?.ok) {
      this.lastHealth = {
        ok: false,
        latencyMs: Math.round(performance.now() - t0),
        message: 'No health endpoint reachable (CORS or down)'
      };
    }
    return this.lastHealth;
  }

  /**
   * GET /api/characters — requires auth; lab shows honest fail if no token/CORS.
   * @returns {Promise<{ ok: boolean, characters: object[], message: string }>}
   */
  async listCharacters() {
    try {
      // Warlords era only on this host (player frontend path)
      const paths = [
        '/api/characters?era=warlords',
        '/api/characters'
      ];
      let lastStatus = 0;
      let lastBody = null;
      for (const p of paths) {
        const { res, body } = await this.fetch(p);
        lastStatus = res.status;
        lastBody = body;
        if (res.status === 401 || res.status === 403) {
          this.lastCharacters = [];
          return {
            ok: false,
            characters: [],
            message:
              'Not signed in — open Grudge ID, then return with a session token (grudge_token)'
          };
        }
        if (!res.ok) continue;
        let list = Array.isArray(body)
          ? body
          : body?.characters || body?.items || body?.data || [];
        // Prefer Warlords-era rows when API returns mixed eras
        const warlords = list.filter((c) => {
          const era = String(c.gameEra || c.era || '').toLowerCase();
          return !era || era === 'warlords' || era === 'warlord';
        });
        if (warlords.length) list = warlords;
        this.lastCharacters = list;
        return {
          ok: true,
          characters: list,
          message: list.length
            ? `${list.length} Warlords character(s)`
            : 'Signed in — no Warlords characters on this account yet (create in Foundry)'
        };
      }
      return {
        ok: false,
        characters: [],
        message: `HTTP ${lastStatus}` + (lastBody?.error ? `: ${lastBody.error}` : '')
      };
    } catch (err) {
      return {
        ok: false,
        characters: [],
        message: err?.message || 'fetch failed (CORS — use Grudge ID on a fleet host)'
      };
    }
  }

  /**
   * GET account bag summary if authorized.
   */
  async accountBag() {
    try {
      const { res, body } = await this.fetch('/api/account');
      if (!res.ok) return { ok: false, message: `HTTP ${res.status}`, body: null };
      return { ok: true, message: 'account ok', body };
    } catch (err) {
      return { ok: false, message: err?.message || 'fail', body: null };
    }
  }
}

export const fleetApi = new FleetApi();
