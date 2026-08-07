/**
 * Thin client for Grudge deployable game API (Railway).
 * SSOT: grudge-production-wiring — one account, Railway characters/bag.
 *
 * Lab only: health + optional character list for Main Panel parity testing.
 * No invented auth stack — uses existing Grudge ID cookie/token when present.
 *
 * Base (production):
 *   https://grudge-api-production-0d46.up.railway.app
 * Open / Warlords proxy same routes via /api/* rewrites.
 */

export const FLEET_API_DEFAULT =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_FLEET_API) ||
  'https://grudge-api-production-0d46.up.railway.app';

/** Production Main Panel / Open (do not fork UI here). */
export const MAIN_PANEL_URL =
  'https://ui.grudge-studio.com/main-panel.html?era=warlords';
export const OPEN_LIBRARY_URL = 'https://open.grudge-studio.com';
export const CHARACTER_FOUNDRY_URL = 'https://character.grudge-studio.com/foundry';
export const GRUDGE_ID_URL = 'https://id.grudge-studio.com';

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
    this.baseUrl = String(opts.baseUrl || FLEET_API_DEFAULT).replace(/\/+$/, '');
    this.getToken = opts.getToken || (() => {
      try {
        return (
          localStorage.getItem('grudge_token') ||
          localStorage.getItem('grudgeIdToken') ||
          localStorage.getItem('token') ||
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
    const url = path.startsWith('http') ? path : `${this.baseUrl}${path.startsWith('/') ? '' : '/'}${path}`;
    const headers = new Headers(init.headers || {});
    if (!headers.has('Accept')) headers.set('Accept', 'application/json');
    const token = this.getToken();
    if (token && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${token}`);
    }
    const res = await fetch(url, { ...init, headers, mode: 'cors', credentials: 'omit' });
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
      const { res, body } = await this.fetch('/api/characters');
      if (res.status === 401 || res.status === 403) {
        this.lastCharacters = [];
        return {
          ok: false,
          characters: [],
          message: 'Auth required — sign in via Grudge ID, then retry'
        };
      }
      if (!res.ok) {
        return {
          ok: false,
          characters: [],
          message: `HTTP ${res.status}`
        };
      }
      const list = Array.isArray(body)
        ? body
        : body?.characters || body?.items || body?.data || [];
      this.lastCharacters = list;
      return {
        ok: true,
        characters: list,
        message: `${list.length} character(s)`
      };
    } catch (err) {
      return {
        ok: false,
        characters: [],
        message: err?.message || 'fetch failed (CORS?)'
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
