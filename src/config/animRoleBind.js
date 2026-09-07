/**
 * Lab session binds: action role → clip rel (ANIM_PACKS candidate).
 * Showcase Anims tab writes here; production still ships from assets.js.
 * localStorage only — not Railway, not a second mixer.
 */
import { ANIM_PACKS } from './assets.js';
import { ANIM_ROLE_META } from './animLibrary.js';

const LS_KEY = 'casting.animRoleBind.v1';

function readAll() {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || '{}') || {};
  } catch {
    return {};
  }
}

function writeAll(data) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(data));
  } catch {
    /* quota */
  }
}

/** @param {string} packId @param {string} role */
export function getAnimRoleBind(packId, role) {
  const v = readAll()?.[packId]?.[role];
  return typeof v === 'string' && v ? v : null;
}

/** @param {string} packId @param {string} role @param {string|null} clipRel */
export function setAnimRoleBind(packId, role, clipRel) {
  const all = readAll();
  if (!all[packId]) all[packId] = {};
  if (!clipRel) delete all[packId][role];
  else all[packId][role] = String(clipRel).replace(/\.json$/i, '');
  writeAll(all);
}

export function clearAnimRoleBinds(packId) {
  const all = readAll();
  if (packId) delete all[packId];
  else Object.keys(all).forEach((k) => delete all[k]);
  writeAll(all);
}

/** Unique clip rels listed in a pack (and overlays). */
export function listPackClipRels(packId) {
  const seen = new Set();
  const out = [];
  const add = (rel) => {
    const s = String(rel || '').replace(/\.json$/i, '');
    if (!s || seen.has(s)) return;
    seen.add(s);
    out.push(s);
  };
  const pack = ANIM_PACKS[packId];
  if (pack) {
    for (const v of Object.values(pack)) {
      if (Array.isArray(v)) v.forEach(add);
      else add(v);
    }
  }
  if (packId !== 'combat_mobility' && ANIM_PACKS.combat_mobility) {
    for (const v of Object.values(ANIM_PACKS.combat_mobility)) {
      if (Array.isArray(v)) v.forEach(add);
      else add(v);
    }
  }
  if (packId !== 'reactions' && ANIM_PACKS.reactions) {
    for (const v of Object.values(ANIM_PACKS.reactions)) {
      if (Array.isArray(v)) v.forEach(add);
      else add(v);
    }
  }
  return out;
}

/**
 * Defined + desired roles for the pack picker (left column).
 * @param {string} packId
 */
export function listDesiredRoles(packId) {
  const pack = ANIM_PACKS[packId] || {};
  const packRoles = Object.keys(pack);
  const metaRoles = Object.keys(ANIM_ROLE_META);
  const seen = new Set();
  const rows = [];
  const push = (role) => {
    if (!role || seen.has(role)) return;
    seen.add(role);
    const meta = ANIM_ROLE_META[role] || {};
    rows.push({
      role,
      label: meta.label || role,
      family: meta.family || 'utility',
      input: meta.input || '',
      inPack: Object.prototype.hasOwnProperty.call(pack, role),
      bind: getAnimRoleBind(packId, role),
      defaultRel: pack[role]
        ? Array.isArray(pack[role])
          ? pack[role][0]
          : pack[role]
        : null
    });
  };
  const familyOrder = ['gait', 'combat', 'mobility', 'reaction', 'utility'];
  for (const fam of familyOrder) {
    for (const role of metaRoles) {
      if ((ANIM_ROLE_META[role].family || 'utility') === fam) push(role);
    }
  }
  for (const role of packRoles) push(role);
  return rows;
}
