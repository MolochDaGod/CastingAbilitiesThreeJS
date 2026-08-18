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

/** Same keys as GrudgeBuilder shared/fleet/authConnect.ts — do not invent a second store. */
export const FLEET_AUTH_TOKEN_KEYS = [
  'grudge.open.token',
  'grudge_auth_token',
  'grudge_session_token',
  'grudge.token',
  'sso_token',
  'grudge_token',
  'grudge_jwt',
  'grudgeIdToken',
  'grudge_id_token',
  'grudge.sessionToken',
  'token'
];

export function readFleetToken() {
  try {
    for (const k of FLEET_AUTH_TOKEN_KEYS) {
      const v = localStorage.getItem(k) || sessionStorage.getItem(k);
      if (v) return v;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function storeFleetToken(token) {
  if (!token) return;
  try {
    localStorage.setItem('grudge.open.token', token);
    localStorage.setItem('grudge_token', token);
    localStorage.setItem('sso_token', token);
  } catch {
    /* ignore */
  }
}

/** Pull ?grudge_token= / #sso_token= from Grudge ID return and persist. */
export function consumeFleetAuthReturn() {
  if (typeof window === 'undefined') return null;
  try {
    const url = new URL(window.location.href);
    const hash = new URLSearchParams(String(url.hash || '').replace(/^#/, ''));
    const token =
      url.searchParams.get('grudge_token') ||
      url.searchParams.get('sso_token') ||
      url.searchParams.get('token') ||
      hash.get('grudge_token') ||
      hash.get('sso_token') ||
      hash.get('token');
    if (token) {
      storeFleetToken(token);
      url.searchParams.delete('grudge_token');
      url.searchParams.delete('sso_token');
      url.searchParams.delete('token');
      const clean = url.pathname + (url.searchParams.toString() ? `?${url.searchParams}` : '') + url.hash;
      window.history.replaceState({}, '', clean);
    }
    const characterId =
      url.searchParams.get('characterId') || url.searchParams.get('char');
    if (characterId) {
      localStorage.setItem('grudge_active_character', characterId);
    }
    return token || readFleetToken();
  } catch {
    return readFleetToken();
  }
}

/** Production Main Panel / Open (do not fork UI here). */
export const MAIN_PANEL_URL =
  'https://ui.grudge-studio.com/main-panel.html?era=warlords';
export const OPEN_LIBRARY_URL = 'https://open.grudge-studio.com';
export const CHARACTER_FOUNDRY_URL = 'https://character.grudge-studio.com/foundry';
export const GRUDGE_ID_URL = 'https://id.grudge-studio.com';
/** Inventory / crafting / char select product SSOT (Warlords craft suite) */
export const CRAFT_SSOT_URL = 'https://grudgewarlords.com/craft/';
export const WARLORDS_ENGINE_URL = 'https://threeflow-grudgenexus.vercel.app';

export function fleetLoginUrl(returnTo) {
  const dest =
    returnTo ||
    (typeof window !== 'undefined'
      ? window.location.href.split('#')[0]
      : 'https://casting-abilities-threejs.vercel.app/');
  return `${GRUDGE_ID_URL}/login?redirect_uri=${encodeURIComponent(dest)}`;
}

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
    this.getToken = opts.getToken || readFleetToken;
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

  /**
   * GET inventory / materials bag — tries fleet paths used by Open / craft.
   * @returns {Promise<{ ok: boolean, items: object[], message: string, path?: string }>}
   */
  async listInventory() {
    // UUID law: account bag is /api/account/inventory (same Railway Postgres).
    // Do not invent /bag /materials forks — those 404 and look like a second DB.
    const paths = [
      '/api/account/inventory',
      '/api/inventory'
    ];
    for (const p of paths) {
      try {
        const { res, body } = await this.fetch(p);
        if (res.status === 401 || res.status === 403) {
          return {
            ok: false,
            items: [],
            message: 'Not signed in — Grudge ID token required for account bag'
          };
        }
        if (!res.ok) continue;
        const items =
          body?.items ||
          body?.materials ||
          body?.bag ||
          body?.slots ||
          (Array.isArray(body) ? body : body?.data) ||
          [];
        const list = Array.isArray(items) ? items : [];
        return {
          ok: true,
          items: list,
          message: list.length ? `${list.length} inventory row(s) via ${p}` : `Empty bag (${p})`,
          path: p,
          body
        };
      } catch {
        /* next path */
      }
    }
    return {
      ok: false,
      items: [],
      message: 'No inventory endpoint reachable (sign-in on fleet host or CORS)'
    };
  }

  /**
   * Best-effort deposit one stack to account bag (Railway).
   * Fail closed with honest message — never fake success.
   * @param {object} item
   * @param {{ characterId?: string }} [opts]
   */
  async depositItem(item, opts = {}) {
    if (!item?.id) {
      return { ok: false, message: 'No item id' };
    }
    const payload = {
      id: item.id,
      itemId: item.id,
      name: item.name,
      qty: item.qty || 1,
      tier: item.tier ?? 0,
      category: item.category || item.kind || 'materials',
      iconUrl: item.iconUrl || item.icon,
      characterId: opts.characterId || null,
      source: 'casting-main-panel'
    };
    const tries = [
      { path: '/api/account/inventory', method: 'POST' },
      { path: '/api/inventory/deposit', method: 'POST' }
    ];
    for (const t of tries) {
      try {
        const { res, body } = await this.fetch(t.path, {
          method: t.method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (res.status === 401 || res.status === 403) {
          return {
            ok: false,
            message: 'Not signed in — cannot deposit to Railway bag',
            authRequired: true
          };
        }
        if (res.ok) {
          return {
            ok: true,
            message: `Deposited ${payload.name || payload.id} ×${payload.qty}`,
            body,
            path: t.path
          };
        }
      } catch {
        /* next */
      }
    }
    return {
      ok: false,
      message:
        'Deposit API not available — use Craft SSOT (grudgewarlords.com/craft/) for account bag',
      openCraft: true
    };
  }

  async authMe() {
    try {
      const { res, body } = await this.fetch('/api/auth/me');
      if (!res.ok) {
        return { ok: false, status: res.status, message: `auth/me ${res.status}`, body };
      }
      return { ok: true, message: 'signed in', body };
    } catch (err) {
      return { ok: false, message: err?.message || 'auth/me fail', body: null };
    }
  }

  /** On-chain mirror of ownership (cNFT). Railway remains game truth. */
  async listNfts() {
    try {
      const { res, body } = await this.fetch('/api/nfts');
      if (res.status === 401 || res.status === 403) {
        return { ok: false, nfts: [], message: 'Not signed in — cannot list cNFTs' };
      }
      if (!res.ok) return { ok: false, nfts: [], message: `HTTP ${res.status}` };
      const nfts = body?.nfts || body?.items || (Array.isArray(body) ? body : []);
      return {
        ok: true,
        nfts: Array.isArray(nfts) ? nfts : [],
        message: `${(nfts || []).length} cNFT row(s) (chain mirrors Railway)`
      };
    } catch (err) {
      return { ok: false, nfts: [], message: err?.message || 'nfts fail' };
    }
  }

  async getCharacter(characterId) {
    if (!characterId) return { ok: false, character: null, message: 'No characterId' };
    try {
      const { res, body } = await this.fetch(`/api/characters/${encodeURIComponent(characterId)}`);
      if (!res.ok) return { ok: false, character: null, message: `HTTP ${res.status}`, body };
      return { ok: true, character: body, message: 'character ok' };
    } catch (err) {
      return { ok: false, character: null, message: err?.message || 'fail' };
    }
  }

  /**
   * POST /api/characters/:id/progress — character-scoped save only.
   * Never send bag/inventory here.
   */
  async saveCharacterProgress(characterId, payload) {
    if (!characterId) return { ok: false, message: 'No character UUID — open Foundry' };
    try {
      const { res, body } = await this.fetch(
        `/api/characters/${encodeURIComponent(characterId)}/progress`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload || {})
        }
      );
      if (res.status === 401 || res.status === 403) {
        return { ok: false, message: 'Not signed in — cannot save progress', authRequired: true };
      }
      if (!res.ok) {
        return {
          ok: false,
          message: body?.error || `HTTP ${res.status}`,
          body
        };
      }
      return {
        ok: true,
        message: `Saved progress r${body?.progressRevision ?? '?'}`,
        body
      };
    } catch (err) {
      return { ok: false, message: err?.message || 'progress save fail' };
    }
  }

  /**
   * Parallel health + roster + bag + cNFT ownership.
   */
  async fleetStatusBundle() {
    const [health, me, chars, inv, account, nfts] = await Promise.all([
      this.health(),
      this.authMe(),
      this.listCharacters(),
      this.listInventory(),
      this.accountBag(),
      this.listNfts()
    ]);
    const grudgeId = me.body?.grudgeId || me.body?.grudge_id || me.body?.user?.grudge_id;
    return {
      health,
      me,
      characters: chars,
      inventory: inv,
      account,
      nfts,
      hasToken: !!this.getToken(),
      grudgeId: grudgeId || null,
      engine: WARLORDS_ENGINE_URL,
      baseUrl: this.baseUrl || '(same-origin)',
      law: {
        player: 'Railway Postgres',
        chain: 'cNFT mirrors via /api/nfts — not a second bag',
        saves: 'POST /api/characters/:id/progress',
        deploy: 'Warlords Engine (ThreeFlow) → R2 sector keys'
      }
    };
  }
}

export const fleetApi = new FleetApi();
