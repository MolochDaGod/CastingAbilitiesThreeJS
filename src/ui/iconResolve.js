/**
 * Unified item icon resolution for Main Panel, DropBag, world drops.
 *
 * Priority:
 *  1. Absolute / already-resolved URL on the item
 *  2. Same-origin lab paths (./icons/dev-island/…)
 *  3. Known material / weapon id map → CDN 496_rpg_icons
 *  4. Category fallbacks
 *
 * Never invent AI icons — only CDN pack + lab packs.
 * @see assets.grudge-studio.com/icons · public/icons/dev-island
 */

import { ASSETS_URL, resolveLabAssetUrl } from '../config/fleetEnv.js';
import { cdnUrl } from '../loot/prefabAssets.js';

const I496 = `${ASSETS_URL}/icons/496_rpg_icons`;

/** Lab mineral / harvest icons (shipped in dist) */
export const LAB_ICONS = Object.freeze({
  stone: './icons/dev-island/minerals/FD_Minerals_Stones.png',
  inventorySlot: './icons/dev-island/inventory/Inventory_Slot_1.png',
  inventoryShell: './icons/dev-island/inventory/Inventory.png',
  health: './icons/dev-island/inventory/Health_01.png'
});

/**
 * Stable id → CDN / lab icon (materials, T0, common loot).
 * @type {Record<string, string>}
 */
export const ICON_BY_ID = Object.freeze({
  // Harvest materials
  'mat-stone': LAB_ICONS.stone,
  'mat-ore-chunk': `${I496}/I_Coal.png`,
  'mat-pebble': LAB_ICONS.stone,
  'mat-wood': `${I496}/I_Wood01.png`,
  'mat-herb': `${I496}/I_Leaf.png`,
  'mat-fiber': `${I496}/I_Fiber.png`,
  'mat-hemp': `${I496}/I_Fiber.png`,
  t0_stone: LAB_ICONS.stone,
  t0_wood: `${I496}/I_Wood01.png`,
  // T0 weapons (match t0WeaponCatalog ids)
  't0-sword': `${I496}/W_Sword001.png`,
  't0-wand': `${I496}/W_Wand001.png`,
  't0-tool': `${I496}/W_PickAxe001.png`,
  't0-bow': `${I496}/W_Bow01.png`,
  't0-staff': `${I496}/W_Staff01.png`,
  't0-axe': `${I496}/W_Axe001.png`,
  't0-dagger': `${I496}/W_Dagger001.png`,
  // Armour kits
  kit_body_a: `${I496}/A_Armour01.png`,
  kit_head_a: `${I496}/A_Helmet01.png`,
  kit_arms_a: `${I496}/A_Armour02.png`,
  kit_legs_a: `${I496}/A_Shoes01.png`
});

/** Kind / class → fallback icon */
const KIND_FALLBACK = Object.freeze({
  weapon: `${I496}/W_Sword001.png`,
  tool: `${I496}/W_PickAxe001.png`,
  armour: `${I496}/A_Armour01.png`,
  armor: `${I496}/A_Armour01.png`,
  shield: `${I496}/E_Shield01.png`,
  mat: LAB_ICONS.stone,
  material: LAB_ICONS.stone,
  materials: LAB_ICONS.stone,
  herb: `${I496}/I_Leaf.png`,
  wood: `${I496}/I_Wood01.png`,
  ore: `${I496}/I_Coal.png`,
  rock: LAB_ICONS.stone,
  consumable: `${I496}/P_Red01.png`,
  food: `${I496}/I_C_Meat.png`,
  relic: `${I496}/I_Gem01.png`,
  mount: `${I496}/S_Buff07.png`,
  default: `${I496}/I_Bag.png`
});

/**
 * @param {object|null|undefined} item
 * @returns {string|null}
 */
export function resolveItemIcon(item) {
  if (!item) return null;

  // Explicit fields
  const direct =
    item.iconUrl ||
    item.icon ||
    item.assets?.iconUrl ||
    (item.iconR2Key ? cdnUrl(item.iconR2Key) : null) ||
    (item.assets?.iconR2Key ? cdnUrl(item.assets.iconR2Key) : null);
  if (direct) return normalizeIconUrl(direct);

  const id = String(item.id || item.itemId || item.defId || '').toLowerCase();
  if (id && ICON_BY_ID[id]) return normalizeIconUrl(ICON_BY_ID[id]);
  // Partial id match
  for (const [key, url] of Object.entries(ICON_BY_ID)) {
    if (id.includes(key) || key.includes(id)) return normalizeIconUrl(url);
  }

  const kind = String(
    item.kind || item.category || item.classId || item.weaponType || ''
  ).toLowerCase();
  for (const [k, url] of Object.entries(KIND_FALLBACK)) {
    if (k !== 'default' && kind.includes(k)) return normalizeIconUrl(url);
  }

  // Name heuristics
  const name = String(item.name || '').toLowerCase();
  if (/wood|log|timber/.test(name)) return normalizeIconUrl(KIND_FALLBACK.wood);
  if (/ore|iron|copper|coal/.test(name)) return normalizeIconUrl(KIND_FALLBACK.ore);
  if (/stone|rock|pebble/.test(name)) return normalizeIconUrl(LAB_ICONS.stone);
  if (/herb|leaf|flower/.test(name)) return normalizeIconUrl(KIND_FALLBACK.herb);
  if (/sword|blade/.test(name)) return normalizeIconUrl(ICON_BY_ID['t0-sword']);
  if (/wand|staff/.test(name)) return normalizeIconUrl(ICON_BY_ID['t0-wand']);
  if (/pick|tool|axe/.test(name)) return normalizeIconUrl(ICON_BY_ID['t0-tool']);

  return normalizeIconUrl(KIND_FALLBACK.default);
}

/**
 * Normalize relative lab paths and CDN.
 * @param {string} url
 */
export function normalizeIconUrl(url) {
  if (!url) return null;
  const s = String(url).trim();
  if (!s) return null;
  if (/^https?:\/\//i.test(s) || s.startsWith('data:')) return s;
  // Prefer same-origin for lab icons
  if (s.startsWith('./') || s.startsWith('/')) return s;
  if (s.startsWith('icons/') || s.startsWith('ui/')) return `./${s}`;
  return resolveLabAssetUrl(s) || cdnUrl(s) || s;
}

/**
 * Attach icon + iconUrl to bag/equip/drop items (mutates copy).
 * @param {object} item
 */
export function withResolvedIcon(item) {
  if (!item) return item;
  const icon = resolveItemIcon(item);
  return {
    ...item,
    icon: icon || item.icon || null,
    iconUrl: icon || item.iconUrl || item.icon || null
  };
}

/**
 * Present bag-safe item from harvest loot or world drop.
 * @param {object} loot
 */
export function bagItemFromLoot(loot) {
  const base = {
    id: loot.id || loot.itemId,
    name: loot.name || loot.id,
    kind: loot.kind || loot.category || 'mat',
    category: loot.category || 'materials',
    tier: loot.tier ?? 0,
    qty: loot.qty || 1,
    slotHint: loot.slotHint,
    iconUrl: loot.iconUrl,
    icon: loot.icon || loot.iconUrl
  };
  return withResolvedIcon(base);
}

/**
 * Map catalog GameItemRow → bag slot item.
 * @param {import('../api/gameItemCatalog.js').GameItemRow} row
 */
export function bagItemFromCatalogRow(row) {
  if (!row) return null;
  return withResolvedIcon({
    id: row.id,
    name: row.name,
    kind: row.equippable
      ? row.category === 'tools'
        ? 'tool'
        : row.category === 'armor'
          ? 'armour'
          : 'weapon'
      : row.category || 'mat',
    category: row.category,
    tier: row.tier ?? 0,
    qty: 1,
    slotHint: mapCatalogSlotHint(row),
    iconUrl: row.iconUrl,
    modelUrl: row.modelUrl,
    weaponType: row.weaponType
  });
}

/**
 * @param {{ slot?: string, weaponType?: string, category?: string }} row
 */
function mapCatalogSlotHint(row) {
  const s = String(row.slot || row.weaponType || '').toLowerCase();
  if (/head|helm/.test(s)) return 'head';
  if (/body|chest|armor/.test(s) && !/arm/.test(s)) return 'body';
  if (/arm|glove/.test(s)) return 'arms';
  if (/leg|boot|shoe/.test(s)) return 'legs';
  if (/shield|off|tome/.test(s)) return 'offHand';
  if (/back|cape|cloak/.test(s)) return 'back';
  if (/mount/.test(s)) return 'mount';
  if (/relic/.test(s)) return 'relic';
  if (row.category === 'weapons' || row.category === 'tools' || row.category === 't0') {
    return 'mainHand';
  }
  return undefined;
}
