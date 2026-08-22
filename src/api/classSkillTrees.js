/**
 * Class skill trees — ObjectStore definitions SSOT.
 *   info/objectstore …/api/v1/master-skillTrees.json
 * Do not invent skill ids. Weapon 1–3 stay on the equipped item.
 *
 * @see F:\GitHub\ObjectStore\api\v1\master-skillTrees.json
 * @see docs/MAIN_PANEL_INVENTORY_SSOT.md
 */

import { ASSETS_URL, catalogJsonUrls } from '../config/fleetEnv.js';

export const CLASS_SKILL_TREES_URLS = Object.freeze([
  ...catalogJsonUrls('master-skillTrees.json'),
  'https://molochdagod.github.io/ObjectStore/api/v1/master-skillTrees.json'
]);

export const CLASS_SKILL_HTML = 'https://info.grudge-studio.com/WEAPON_SKILLS.html';

/**
 * Product classes — four families, eight specs. There is no Knight class.
 * 30-character look `knight` (plate) maps to Worge, the fourth family.
 */
export const CLASS_IDS = Object.freeze([
  'warrior', 'raider', 'mage', 'priest', 'ranger', 'thief', 'worge', 'verduror'
]);

export const CLASS_LABELS = Object.freeze({
  warrior: 'Warrior',
  raider: 'Raider',
  mage: 'Mage',
  priest: 'Priest',
  ranger: 'Ranger',
  thief: 'Thief',
  worge: 'Worge',
  verduror: 'Verduror'
});

export const FAMILY_OF = Object.freeze({
  warrior: 'warrior', raider: 'warrior',
  mage: 'mage', priest: 'mage',
  ranger: 'ranger', thief: 'ranger',
  worge: 'worge', verduror: 'worge'
});

/** Original-30 / Foundry look → product class. */
export const ROLE_TO_CLASS_ID = Object.freeze({
  warrior: 'warrior',
  raider: 'raider',
  knight: 'worge',
  tank: 'warrior',
  spearman: 'warrior',
  worker: 'warrior',
  berserker: 'raider',
  mage: 'mage',
  priest: 'priest',
  healer: 'priest',
  ranger: 'ranger',
  archer: 'ranger',
  rogue: 'thief',
  thief: 'thief',
  outlaw: 'thief',
  worge: 'worge',
  worg: 'worge',
  verduror: 'verduror',
  mistweaver: 'verduror'
});

/** @type {null | { version: string, skillTrees: Record<string, object> }} */
let _cache = null;

async function fetchJson(url) {
  const res = await fetch(url, { mode: 'cors' });
  if (!res.ok) throw new Error(`${url} ${res.status}`);
  return res.json();
}

export async function ensureClassSkillTrees() {
  if (_cache?.skillTrees) return _cache;
  let last = null;
  for (const url of CLASS_SKILL_TREES_URLS) {
    try {
      const json = await fetchJson(url);
      if (json?.skillTrees && Object.keys(json.skillTrees).length) {
        _cache = json;
        return _cache;
      }
    } catch (err) {
      last = err;
    }
  }
  throw last || new Error('class skill trees catalog failed');
}

export function classIdFromRole(roleOrClass) {
  const k = String(roleOrClass || 'warrior').toLowerCase();
  return ROLE_TO_CLASS_ID[k] || 'warrior';
}

export function listClassIds() {
  return CLASS_IDS.slice();
}

export function getClassTree(classId) {
  const id = classIdFromRole(classId);
  const trees = _cache?.skillTrees || {};
  if (trees[id]) return trees[id];
  if (id === 'worge' && trees.knight) return { ...trees.knight, id: 'worge', name: 'Worge' };
  return null;
}

export function classLabel(classId) {
  const id = classIdFromRole(classId);
  return CLASS_LABELS[id] || id;
}

export function resolveClassSkillIcon(path) {
  const p = String(path || '');
  if (!p) return '';
  if (/^https?:\/\//i.test(p)) return p;
  const rel = p.replace(/^\.\//, '').replace(/^\//, '');
  return `${ASSETS_URL}/${rel}`;
}

export function flattenClassSkills(tree) {
  const out = [];
  if (!tree?.tiers) return out;
  for (const tier of tree.tiers) {
    for (const sk of tier.skills || []) {
      out.push({
        ...sk,
        requiredLevel: tier.requiredLevel ?? 1,
        tierName: tier.name,
        iconUrl: resolveClassSkillIcon(sk.iconUrl || sk.icon)
      });
    }
  }
  return out;
}
