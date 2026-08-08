/**
 * Unified game item catalog import for production prefab work.
 *
 * SSOT (do not fork):
 *   https://info.grudge-studio.com/api/v1/game-library.json
 *   https://info.grudge-studio.com/api/v1/canonical-items-manifest.json
 *   master-weapon-prefabs · master-armor · master-relics · master-mounts · …
 * Browse: GRUDGE_Item_Database.html · WEAPON_SKILLS.html
 *
 * @see docs/GAME_ITEM_PREFAB_PRODUCTION_SSOT.md
 */

import { CDN, presentPrefab, loadPrefabCatalog, cdnUrl, tierPresent } from '../loot/prefabAssets.js';
import { loadEquippableWeapons, T0_STARTER_WEAPON_IDS } from './t0WeaponCatalog.js';

export const INFO_API = 'https://info.grudge-studio.com/api/v1';
export const INFO_MIRROR = 'https://objectstore.grudge-studio.com/api/v1';
export const GAME_LIBRARY_URL = `${INFO_API}/game-library.json`;
export const ITEMS_MANIFEST_URL = `${INFO_API}/canonical-items-manifest.json`;
export const ITEM_BROWSER_URL = 'https://info.grudge-studio.com/GRUDGE_Item_Database.html';
export const WEAPON_SKILLS_HTML = 'https://info.grudge-studio.com/WEAPON_SKILLS.html';

/** Prefab product categories for lab / production surfaces */
export const PREFAB_CATEGORIES = Object.freeze([
  { id: 'weapons', label: 'Weapons', authority: 'master-weapon-prefabs.json', equip: true },
  { id: 'tools', label: 'Tools', authority: 'master-weapon-prefabs.json (TOOL)', equip: true },
  { id: 'offhand', label: 'Off-hands', authority: 'SHIELD · TOME prefabs', equip: true },
  { id: 't0', label: 'T0 starters', authority: 't0-weapons.json', equip: true },
  { id: 'armor', label: 'Armour', authority: 'master-armor.json', equip: false },
  { id: 'relics', label: 'Relics', authority: 'master-relics.json', equip: false },
  { id: 'class', label: 'Class items', authority: 'master-classRelics.json · classes.json', equip: false },
  { id: 'mounts', label: 'Mounts', authority: 'master-mounts.json', equip: false },
  { id: 'special', label: 'Specials', authority: 'artifacts · enchants · infusions', equip: false }
]);

/**
 * @typedef {object} GameItemRow
 * @property {string} id
 * @property {string} [uuid]
 * @property {string} name
 * @property {string} category  weapons|armor|relics|mounts|class|offhand|t0|tools|special
 * @property {number} [tier]
 * @property {string} [slot] equip slot hint
 * @property {string} [iconUrl]
 * @property {string|null} [modelUrl]
 * @property {object} [stats]
 * @property {string} [description]
 * @property {string} [weaponType]
 * @property {boolean} equippable
 * @property {object} [raw]
 * @property {string} source  catalog file
 */

async function fetchJson(urls) {
  for (const url of urls) {
    try {
      const res = await fetch(url, { mode: 'cors' });
      if (!res.ok) continue;
      return await res.json();
    } catch {
      /* next */
    }
  }
  return null;
}

function iconOf(row) {
  return (
    row?.iconUrl ||
    row?.assets?.iconUrl ||
    cdnUrl(row?.assets?.iconR2Key) ||
    cdnUrl(row?.icon?.path) ||
    cdnUrl(row?.icon) ||
    null
  );
}

function modelOf(row) {
  return (
    row?.modelUrl ||
    row?.prodGltfUrl ||
    row?.assets?.modelUrl ||
    cdnUrl(row?.assets?.modelR2Key) ||
    cdnUrl(row?.modelPath) ||
    null
  );
}

/**
 * Normalize any catalog row into a HUD/equip-safe present item.
 * @param {object} row
 * @param {string} category
 * @param {string} source
 * @returns {GameItemRow|null}
 */
export function presentItem(row, category, source) {
  if (!row) return null;
  const id = row.id || row.uuid || row.slug;
  if (!id) return null;
  const tier = Number(row.tier) || 0;
  const t = tierPresent(tier);
  const equippable =
    category === 'weapons' ||
    category === 'tools' ||
    category === 'offhand' ||
    category === 't0' ||
    !!row.equippable;

  return {
    id: String(id),
    uuid: row.uuid || null,
    name: row.name || row.baseName || String(id),
    category,
    tier,
    slot: row.slot || row.equipSlot || row.subCategory || row.weaponType || null,
    iconUrl: iconOf(row) || cdnUrl('icons/pack/weapons/staff_1.png'),
    modelUrl: modelOf(row),
    stats: row.stats || null,
    description: row.description || row.lore || row.note || '',
    weaponType: row.weaponType || null,
    equippable,
    borderColor: t.border,
    glowColor: t.glow,
    tierLabel: t.label,
    source,
    raw: row
  };
}

let _cache = null;
let _loading = null;

/**
 * Load all prefab-relevant catalogs for the lab dev environment.
 */
export async function loadGameItemCatalog() {
  if (_cache) return _cache;
  if (_loading) return _loading;

  _loading = (async () => {
    const [
      library,
      manifest,
      weaponsCat,
      armor,
      relics,
      mounts,
      classRelics,
      equippable
    ] = await Promise.all([
      fetchJson([GAME_LIBRARY_URL, `${INFO_MIRROR}/game-library.json`]),
      fetchJson([ITEMS_MANIFEST_URL, `${INFO_MIRROR}/canonical-items-manifest.json`]),
      loadPrefabCatalog().catch(() => null),
      fetchJson([`${INFO_API}/master-armor.json`, `${INFO_MIRROR}/master-armor.json`]),
      fetchJson([`${INFO_API}/master-relics.json`, `${INFO_MIRROR}/master-relics.json`]),
      fetchJson([`${INFO_API}/master-mounts.json`, `${INFO_MIRROR}/master-mounts.json`]),
      fetchJson([`${INFO_API}/master-classRelics.json`, `${INFO_MIRROR}/master-classRelics.json`]),
      loadEquippableWeapons().catch(() => null)
    ]);

    /** @type {Record<string, GameItemRow[]>} */
    const byCategory = {
      weapons: [],
      tools: [],
      offhand: [],
      t0: [],
      armor: [],
      relics: [],
      class: [],
      mounts: [],
      special: []
    };

    // Weapons / tools / offhand from master-weapon-prefabs
    for (const raw of weaponsCat?._rawPrefabs || []) {
      const wt = String(raw.weaponType || '').toUpperCase();
      const cat = String(raw.category || '');
      let bucket = 'weapons';
      if (wt === 'TOOL' || /tool/i.test(cat)) bucket = 'tools';
      else if (wt === 'SHIELD' || wt === 'TOME' || /offhand|shield|tome/i.test(cat)) bucket = 'offhand';
      const row = presentItem(raw, bucket, 'master-weapon-prefabs.json');
      if (row) byCategory[bucket].push(row);
    }

    // T0 starters (skills live here)
    for (const w of equippable?.weapons || []) {
      const row = presentItem(
        {
          id: w.id,
          name: w.name,
          tier: w.tier,
          weaponType: w.weaponType,
          stats: w.stats,
          description: w.description,
          iconUrl: w.iconUrl,
          modelUrl: w.modelUrl,
          equippable: true
        },
        't0',
        't0-weapons.json'
      );
      if (row) {
        row.slot1 = w.slot1;
        row.slot2 = w.slot2;
        row.slot3Options = w.slot3Options;
        row.defaultSlot3Id = w.defaultSlot3Id;
        row.animPack = w.animPack;
        row.meshSlot = w.meshSlot;
        byCategory.t0.push(row);
      }
    }

    // Armor
    for (const a of armor?.items || []) {
      const row = presentItem(
        {
          ...a,
          equipSlot: a.slot || a.equipSlot,
          icon: a.icon || a.iconPath
        },
        'armor',
        'master-armor.json'
      );
      if (row) byCategory.armor.push(row);
    }

    // Relics
    const relicList = relics?.relics || relics?.items || [];
    for (const r of relicList) {
      const row = presentItem(r, 'relics', 'master-relics.json');
      if (row) byCategory.relics.push(row);
    }

    // Class relics / class items
    const cr = classRelics?.classRelics || classRelics?.items || classRelics?.relics || [];
    const crArr = Array.isArray(cr) ? cr : Object.values(cr).flat();
    for (const r of crArr) {
      const row = presentItem(r, 'class', 'master-classRelics.json');
      if (row) byCategory.class.push(row);
    }

    // Mounts
    for (const m of mounts?.mounts || mounts?.items || []) {
      const row = presentItem(m, 'mounts', 'master-mounts.json');
      if (row) byCategory.mounts.push(row);
    }

    const counts = Object.fromEntries(
      Object.entries(byCategory).map(([k, v]) => [k, v.length])
    );

    _cache = {
      library,
      manifest,
      byCategory,
      counts,
      equippable,
      weaponsCat,
      starters: {
        apprenticeWand: equippable?.byId?.get?.(T0_STARTER_WEAPON_IDS.apprenticeWand) || null,
        saplingStaff: equippable?.byId?.get?.(T0_STARTER_WEAPON_IDS.saplingStaff) || null
      },
      urls: {
        library: GAME_LIBRARY_URL,
        manifest: ITEMS_MANIFEST_URL,
        browser: ITEM_BROWSER_URL,
        skills: WEAPON_SKILLS_HTML,
        cdn: CDN
      },
      loadedAt: Date.now()
    };
    _loading = null;
    return _cache;
  })();

  return _loading;
}

export function getGameItemCatalogCache() {
  return _cache;
}

/**
 * Filter rows for Prefabs UI.
 * @param {Awaited<ReturnType<loadGameItemCatalog>>} cat
 * @param {{ category?: string, q?: string, limit?: number }} opts
 */
export function queryGameItems(cat, opts = {}) {
  if (!cat) return [];
  const limit = opts.limit ?? 80;
  const q = String(opts.q || '')
    .trim()
    .toLowerCase();
  let pool = [];
  if (opts.category && cat.byCategory[opts.category]) {
    pool = cat.byCategory[opts.category];
  } else {
    pool = Object.values(cat.byCategory).flat();
  }
  if (q) {
    pool = pool.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.id.toLowerCase().includes(q) ||
        String(r.weaponType || '')
          .toLowerCase()
          .includes(q) ||
        String(r.slot || '')
          .toLowerCase()
          .includes(q)
    );
  }
  return pool.slice(0, limit);
}

/**
 * Export a production-oriented prefab snapshot for any row.
 * @param {GameItemRow} row
 */
export function exportItemPrefabSnapshot(row) {
  if (!row) return null;
  return {
    version: '1.0.0',
    generated: new Date().toISOString(),
    kind: 'grudge-game-item-prefab',
    id: row.id,
    uuid: row.uuid,
    name: row.name,
    category: row.category,
    tier: row.tier,
    slot: row.slot,
    weaponType: row.weaponType,
    equippable: row.equippable,
    stats: row.stats,
    description: row.description,
    assets: {
      iconUrl: row.iconUrl,
      modelUrl: row.modelUrl
    },
    presentation: {
      borderColor: row.borderColor,
      glowColor: row.glowColor,
      tierLabel: row.tierLabel
    },
    skills: row.slot1
      ? {
          slot1: row.slot1,
          slot2: row.slot2,
          slot3Options: row.slot3Options,
          defaultSlot3Id: row.defaultSlot3Id
        }
      : row.raw?.skills || null,
    lab: {
      meshSlot: row.meshSlot || null,
      animPack: row.animPack || null,
      liveLab: 'https://casting.grudge-studio.com/',
      source: row.source
    },
    production: {
      itemBrowser: ITEM_BROWSER_URL,
      weaponSkills: WEAPON_SKILLS_HTML,
      gameLibrary: GAME_LIBRARY_URL,
      consumers: ['items', 'character-hud', 'ui', 'controller', 'combat', 'dev-lab']
    }
  };
}
