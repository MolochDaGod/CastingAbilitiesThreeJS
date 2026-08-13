/**
 * Item-granted skills — gear and relic slots grant skills beside the weapon bar.
 *
 * LinearAbilty adoption: a skill is a *script* (catalog row + production
 * override JSON), and any item can be its source. Weapons already grant via
 * t0WeaponCatalog.hotbarForWeapon; this module gives gear/relics the same
 * contract through the SAME compile path (compileProductionWeaponSkill →
 * productionToDrcSkill) — no second skill stack.
 *
 * Grant sources, in priority order:
 *  1. equip-map entry `grantsSkills: string[]` (paperdoll item row — the
 *     shipping path once info.grudge-studio.com item rows carry grants)
 *  2. production override `skills/production/<itemId>.json` → `grantsSkills`
 *     (lab QA path, same override mechanism weapons use)
 *
 * Rules (fleet):
 *  - Never invent skill ids — grants must resolve in master-weaponSkills byId
 *  - Catalog numbers (damage/cd/cost) stay SSOT; overrides tune presentation
 *  - UUIDs come from the catalog rows; labs never mint
 *
 * @see docs/WEAPON_SKILL_PRODUCTION_SSOT.md
 * @see api/weaponSkillsCatalog.js loadWeaponSkillsCatalog
 */

import { loadEquipMap } from '../ui/mainPanelSlots.js';
import { loadWeaponSkillsCatalog } from '../api/weaponSkillsCatalog.js';
import { skillDefToDrc } from '../api/t0WeaponCatalog.js';
import {
  getCachedProductionOverride,
  warmProductionOverrides
} from './weaponSkillProduction.js';

/** Paperdoll slots that may carry skill grants (non-weapon sources). */
export const GRANT_SLOT_KINDS = Object.freeze({
  relic: 'relic',
  head: 'gear',
  chest: 'gear',
  legs: 'gear',
  hands: 'gear',
  feet: 'gear',
  shoulders: 'gear',
  back: 'gear'
});

/** @type {object[]} compiled DrcWeaponSkill[] with grantSource tags */
let _cachedBar = [];
/** @type {string} equip-map fingerprint the cache was built from */
let _cacheKey = '';
/** @type {Promise<object[]>|null} in-flight refresh */
let _refreshing = null;

/**
 * Fingerprint the non-weapon equip state (item ids in grant slots).
 * @param {Record<string, { id?: string }|null>} map
 */
function grantFingerprint(map) {
  const parts = [];
  for (const slot of Object.keys(GRANT_SLOT_KINDS)) {
    const id = map?.[slot]?.id;
    if (id) parts.push(`${slot}:${id}`);
  }
  return parts.join('|');
}

/**
 * Resolve granted skill ids for one equipped item.
 * @param {{ id?: string, grantsSkills?: string[] }} item
 * @returns {string[]}
 */
function grantsForItem(item) {
  if (!item?.id) return [];
  if (Array.isArray(item.grantsSkills) && item.grantsSkills.length) {
    return item.grantsSkills.map(String);
  }
  const ov = getCachedProductionOverride(item.id);
  if (Array.isArray(ov?.grantsSkills) && ov.grantsSkills.length) {
    return ov.grantsSkills.map(String);
  }
  return [];
}

/**
 * Rebuild the granted-skill bar from the current paperdoll. Async — resolves
 * catalog rows and compiles through the production pipeline.
 * @returns {Promise<object[]>}
 */
export async function refreshItemGrantedSkills() {
  if (_refreshing) return _refreshing;
  _refreshing = (async () => {
    const map = loadEquipMap() || {};
    const key = grantFingerprint(map);

    /** @type {{ itemId: string, kind: string, slot: string }[]} */
    const sources = [];
    for (const [slot, kind] of Object.entries(GRANT_SLOT_KINDS)) {
      const item = map[slot];
      if (item?.id) sources.push({ itemId: item.id, kind, slot, item });
    }
    if (!sources.length) {
      _cachedBar = [];
      _cacheKey = key;
      return _cachedBar;
    }

    // Warm item-level overrides (grantsSkills may live there), tolerate misses
    try {
      await warmProductionOverrides(sources.map((s) => s.itemId));
    } catch {
      /* optional */
    }

    /** @type {{ skillId: string, src: { itemId: string, kind: string, slot: string } }[]} */
    const wanted = [];
    for (const src of sources) {
      for (const skillId of grantsForItem(src.item)) {
        wanted.push({ skillId, src });
      }
    }
    if (!wanted.length) {
      _cachedBar = [];
      _cacheKey = key;
      return _cachedBar;
    }

    // Warm the granted skills' own overrides before compile
    try {
      await warmProductionOverrides(wanted.map((w) => w.skillId));
    } catch {
      /* optional */
    }

    let cat = null;
    try {
      cat = await loadWeaponSkillsCatalog();
    } catch (e) {
      console.warn('[itemGrantedSkills] catalog unreachable — grants skipped', e);
      _cachedBar = [];
      _cacheKey = key;
      return _cachedBar;
    }

    const bar = [];
    const seen = new Set();
    for (const { skillId, src } of wanted) {
      if (seen.has(skillId)) continue; // one grant per skill id
      const row = cat.byId.get(skillId);
      if (!row) {
        console.warn(
          `[itemGrantedSkills] ${src.kind} ${src.itemId} grants unknown skill "${skillId}" — ids come from master-weaponSkills, never invented`
        );
        continue;
      }
      seen.add(skillId);
      // Grant bar rides after the 4 weapon slots (X/C/V-band presentation)
      const drc = skillDefToDrc(row, 4 + bar.length, null);
      if (!drc) continue;
      drc.grantSource = { itemId: src.itemId, kind: src.kind, slot: src.slot };
      drc.hint = `${row.name} · granted by ${src.kind} ${src.itemId}`;
      bar.push(drc);
    }

    _cachedBar = bar;
    _cacheKey = key;
    return bar;
  })().finally(() => {
    _refreshing = null;
  });
  return _refreshing;
}

/**
 * Sync accessor for the skill-bar merge. Kicks a background refresh when the
 * paperdoll changed since the cache was built; callers get the fresh bar on a
 * later frame (same lazy pattern as the weapon catalog warm).
 * @returns {object[]}
 */
export function cachedItemGrantedSkills() {
  const key = grantFingerprint(loadEquipMap() || {});
  if (key !== _cacheKey && !_refreshing) {
    refreshItemGrantedSkills().catch(() => {});
  }
  return _cachedBar;
}

/** Test/dev: drop the cache (e.g. after Multiverse push). */
export function clearItemGrantedSkillsCache() {
  _cachedBar = [];
  _cacheKey = '';
}
