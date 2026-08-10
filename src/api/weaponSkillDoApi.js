/**
 * Cloudflare Durable Object client — weapon skill drafts + equipWeaponById mirror.
 *
 * Control plane (dev → production): https://casting.grudge.studio
 * Public DO host (CNAME live):      https://weapon-skills.grudge-studio.com
 * Fallback: workers.dev
 *
 * Contracts:
 *   grudge.weaponSkillPrefabBundle/v1  (Multiverse exportDurableBundle)
 *   grudge.equipWeaponCatalog/v1       (mirrors Casting equipWeaponById)
 *
 * Override: VITE_WEAPON_SKILL_DO_URL
 */

export const CASTING_LAB_ORIGIN = 'https://casting.grudge.studio';
export const WEAPON_SKILL_DO_PUBLIC = 'https://weapon-skills.grudge-studio.com';
export const WEAPON_SKILL_DO_WORKERS_DEV =
  'https://grudge-weapon-skill-drafts.grudge.workers.dev';

const DEFAULT_DO_BASE =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_WEAPON_SKILL_DO_URL) ||
  WEAPON_SKILL_DO_PUBLIC;

/** @type {string} */
let _base = String(DEFAULT_DO_BASE).replace(/\/+$/, '');

export function getWeaponSkillDoBase() {
  return _base;
}

export function setWeaponSkillDoBase(url) {
  if (url) _base = String(url).replace(/\/+$/, '');
  return _base;
}

/**
 * Prefer public CNAME when healthy; fall back to workers.dev.
 * @returns {Promise<string>}
 */
export async function resolveWeaponSkillDoBase() {
  const candidates = [
    (typeof import.meta !== 'undefined' && import.meta.env?.VITE_WEAPON_SKILL_DO_URL) || null,
    WEAPON_SKILL_DO_PUBLIC,
    WEAPON_SKILL_DO_WORKERS_DEV,
  ].filter(Boolean);

  for (const base of candidates) {
    try {
      const r = await fetch(`${String(base).replace(/\/+$/, '')}/api/health`, {
        mode: 'cors',
        cache: 'no-store',
      });
      if (r.ok) {
        _base = String(base).replace(/\/+$/, '');
        return _base;
      }
    } catch {
      /* try next */
    }
  }
  return _base;
}

async function doFetch(path, opts = {}) {
  const url = `${_base}${path.startsWith('/') ? path : `/${path}`}`;
  const headers = {
    Accept: 'application/json',
    'X-Grudge-Source': opts.source || 'casting.grudge.studio',
    ...(opts.headers || {}),
  };
  if (opts.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  const res = await fetch(url, {
    method: opts.method || 'GET',
    mode: 'cors',
    cache: 'no-store',
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const err = new Error(data?.message || data?.error || `DO ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export async function healthCheck() {
  return doFetch('/api/health');
}

export async function fetchBundle() {
  return doFetch('/api/v1/bundle');
}

/**
 * Push Multiverse exportDurableBundle (or partial) into the DO.
 * @param {object} bundle
 * @param {{ source?: string }} [opts]
 */
export async function putBundle(bundle, opts = {}) {
  return doFetch('/api/v1/bundle', {
    method: 'PUT',
    body: bundle,
    source: opts.source || 'casting.grudge.studio',
  });
}

export async function fetchEquipCatalog() {
  return doFetch('/api/v1/equip-catalog');
}

/**
 * Replace equip catalog mirror (Casting equipWeaponById shape).
 * @param {{ weapons: object[], version?: number }} catalog
 */
export async function putEquipCatalog(catalog, opts = {}) {
  return doFetch('/api/v1/equip-catalog', {
    method: 'PUT',
    body: catalog,
    source: opts.source || 'casting.grudge.studio',
  });
}

/** Upsert one equippable weapon row. */
export async function postEquipWeapon(weapon, opts = {}) {
  return doFetch('/api/v1/equip-catalog/weapon', {
    method: 'POST',
    body: weapon,
    source: opts.source || 'casting.grudge.studio',
  });
}

/**
 * Stamp production promote metadata on all skills + catalog.
 * Called from Casting lab (dev → production handoff).
 * @param {{ label?: string, note?: string }} [body]
 */
export async function promoteCatalog(body = {}, opts = {}) {
  return doFetch('/api/v1/promote', {
    method: 'POST',
    body,
    source: opts.source || 'casting.grudge.studio',
  });
}

/**
 * Merge DO equip catalog weapons into a live equippable list (byId Map + weapons[]).
 * DO entries fill gaps; local t0 SSOT wins on id collision unless preferRemote.
 *
 * @param {{ weapons: object[], byId: Map<string, object> }} catalog
 * @param {{ preferRemote?: boolean }} [opts]
 * @returns {Promise<{ weapons: object[], byId: Map<string, object>, doMeta: object|null, merged: number }>}
 */
export async function mergeDoEquipCatalog(catalog, opts = {}) {
  if (!catalog?.byId) {
    return { weapons: catalog?.weapons || [], byId: catalog?.byId || new Map(), doMeta: null, merged: 0 };
  }
  let remote = null;
  try {
    await resolveWeaponSkillDoBase();
    remote = await fetchEquipCatalog();
  } catch (e) {
    console.warn('[weaponSkillDoApi] equip-catalog unavailable', e?.message || e);
    return { ...catalog, doMeta: null, merged: 0 };
  }

  const preferRemote = !!opts.preferRemote;
  let merged = 0;
  const weapons = [...(catalog.weapons || [])];
  const byId = catalog.byId instanceof Map ? catalog.byId : new Map(Object.entries(catalog.byId || {}));

  for (const w of remote.weapons || []) {
    if (!w?.id) continue;
    const existing = byId.get(w.id);
    if (existing && !preferRemote) continue;
    const row = normalizeDoWeapon(w, existing);
    if (existing && preferRemote) {
      const i = weapons.findIndex((x) => x.id === w.id);
      if (i >= 0) weapons[i] = row;
      else weapons.push(row);
    } else if (!existing) {
      weapons.push(row);
    }
    byId.set(w.id, row);
    merged++;
  }

  if (typeof globalThis !== 'undefined') {
    globalThis.__castingWeaponSkillDo = {
      base: _base,
      controlPlane: CASTING_LAB_ORIGIN,
      equipCount: remote.count,
      meta: remote.meta || null,
      mergedAt: Date.now(),
    };
  }

  return {
    weapons,
    byId,
    doMeta: remote.meta || null,
    merged,
    remoteCount: remote.count,
    contract: remote.contract,
  };
}

function normalizeDoWeapon(w, existing) {
  return {
    ...(existing || {}),
    id: w.id,
    name: w.name || existing?.name || w.id,
    weaponType: w.weaponType || existing?.weaponType || 'SWORD',
    animPack: w.animPack || existing?.animPack || 'sword_shield',
    meshSlot: w.meshSlot || existing?.meshSlot || 'sword',
    modelUrl: w.modelUrl || existing?.modelUrl || null,
    icon: w.icon || existing?.icon || null,
    iconUrl: w.iconUrl || existing?.iconUrl || null,
    defaultSlot3Id: w.defaultSlot3Id || existing?.defaultSlot3Id || null,
    slot1: w.slot1 || existing?.slot1 || null,
    slot2: w.slot2 || existing?.slot2 || null,
    slot3Options: w.slot3Options || existing?.slot3Options || [],
    skills: w.skills || existing?.skills || null,
    source: w.source || 'do',
    catalogSource: {
      ...(existing?.catalogSource || {}),
      durableObject: 'WeaponSkillDrafts',
      doBase: _base,
      controlPlane: CASTING_LAB_ORIGIN,
    },
  };
}

/**
 * Push local Casting equippable weapons into the DO mirror (lab → production handoff).
 * @param {object[]} weapons
 */
export async function pushLocalEquipMirror(weapons, opts = {}) {
  const list = (weapons || []).map((w) => ({
    id: w.id,
    name: w.name,
    weaponType: w.weaponType,
    animPack: w.animPack,
    meshSlot: w.meshSlot,
    modelUrl: w.modelUrl,
    icon: w.icon,
    iconUrl: w.iconUrl,
    defaultSlot3Id: w.defaultSlot3Id,
    slot1: w.slot1,
    slot2: w.slot2,
    slot3Options: w.slot3Options,
    skills: w.skills,
    source: 'casting.grudge.studio',
  }));
  return putEquipCatalog({ weapons: list }, opts);
}
