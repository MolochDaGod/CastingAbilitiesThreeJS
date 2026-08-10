/**
 * Dev Island harvest catalog SSOT (Casting Warlords lab).
 *
 * Production-baked rocks live under public/models/dev-island/.
 * Icons: public/icons/dev-island/{minerals,inventory}/.
 *
 * Does not invent a second harvest engine — node classes + tool gates match
 * Mine-Loader / Warlords profession patterns (pickaxe→rock/ore, axe→wood, hand→herb).
 *
 * @see docs/ISLAND_STAGE_SSOT.md · docs/DROP_RATES_SSOT.md (harvest_node)
 */

/** F / interact harvest radius (metres) — product: nearest node within 5 m */
export const HARVEST_RANGE_M = 5;

/** Seconds between harvest swings on the same node */
export const HARVEST_SWING_CD = 0.55;

/** Default hits to deplete a node (lab pacing) */
export const DEFAULT_NODE_HP = 3;

const ROCK_DIR = './models/dev-island';
const ICON_MINERALS = './icons/dev-island/minerals';
const ICON_INV = './icons/dev-island/inventory';

/** Shore / pad décor (not harvestable) — rockforms + walls for map read */
export const DECOR_MESH_POOL = Object.freeze([
  `${ROCK_DIR}/rock__rockform_arch_medium.glb`,
  `${ROCK_DIR}/rock__rockform_column_medium.glb`,
  `${ROCK_DIR}/rock__rockform_wall_short1_medium.glb`,
  `${ROCK_DIR}/rock__rockform_wall_long_medium.glb`,
  `${ROCK_DIR}/rock__rockwall_straight_medium.glb`,
  `${ROCK_DIR}/rock__rockwall_corner_medium.glb`,
  `${ROCK_DIR}/rock__debris1_medium.glb`,
  `${ROCK_DIR}/rock__rock5_natural_dark.glb`
]);

/**
 * Preferred rock isolates for harvestable nodes (SI ~human-scale debris/boulders).
 * Natural medium variants first; base mesh as fallback.
 */
export const ROCK_MESH_POOL = Object.freeze([
  `${ROCK_DIR}/rock__rock1_natural_medium.glb`,
  `${ROCK_DIR}/rock__rock2_natural_medium.glb`,
  `${ROCK_DIR}/rock__rock3_natural_medium.glb`,
  `${ROCK_DIR}/rock__rock4_natural_medium.glb`,
  `${ROCK_DIR}/rock__rock5_natural_medium.glb`,
  `${ROCK_DIR}/rock__rock6_natural_medium.glb`,
  `${ROCK_DIR}/rock__rock7_natural_medium.glb`,
  `${ROCK_DIR}/rock__rock8_natural_medium.glb`,
  `${ROCK_DIR}/rock__rock1.glb`,
  `${ROCK_DIR}/rock__rock2.glb`,
  `${ROCK_DIR}/rock__rock3.glb`
]);

export const ORE_MESH_POOL = Object.freeze([
  `${ROCK_DIR}/rock__rock9_natural_medium.glb`,
  `${ROCK_DIR}/rock__rock10_natural_medium.glb`,
  `${ROCK_DIR}/rock__rock9_natural_dark.glb`,
  `${ROCK_DIR}/rock__rock10_cave_medium.glb`,
  `${ROCK_DIR}/rock__rock5_cave_dark.glb`
]);

export const PEBBLE_MESH_POOL = Object.freeze([
  `${ROCK_DIR}/rock__pebbles1.glb`,
  `${ROCK_DIR}/rock__pebbles2.glb`,
  `${ROCK_DIR}/rock__pebbles3.glb`,
  `${ROCK_DIR}/rock__pebbles4.glb`,
  `${ROCK_DIR}/rock__debris1.glb`,
  `${ROCK_DIR}/rock__debris2.glb`
]);

/**
 * Tool affinity tags. Equipped weapon matches if weaponType/id/name hits any tag.
 * TOOL / t0-tool / pick / axe family cover mining + chopping on the lab.
 */
export const TOOL_TAGS = Object.freeze({
  pickaxe: ['tool', 'pick', 'pickaxe', 'mine', 't0-tool', 'hammer'],
  axe: ['tool', 'axe', 'hatchet', 'chop', 't0-axe', 't0-tool'],
  sickle: ['tool', 'sickle', 'scythe', 'knife', 't0-tool'],
  hand: [] // always allowed
});

/**
 * @typedef {object} HarvestLootSpec
 * @property {string} id
 * @property {string} name
 * @property {number} [tier]
 * @property {string} [iconUrl]
 * @property {string} [category]
 * @property {[number, number]} [qty]
 */

/**
 * @typedef {object} HarvestNodeDef
 * @property {string} id
 * @property {string} label
 * @property {'rock'|'ore'|'wood'|'herb'|'fiber'} classId
 * @property {keyof typeof TOOL_TAGS | 'hand'} tool
 * @property {string[]} meshPool
 * @property {number} hp
 * @property {number} [scale]
 * @property {number} [respawnS]
 * @property {HarvestLootSpec[]} loot
 * @property {string} [tint] hex for highlight ring
 */

/** @type {Record<string, HarvestNodeDef>} */
export const HARVEST_NODE_DEFS = Object.freeze({
  rock_boulder: {
    id: 'rock_boulder',
    label: 'Stone boulder',
    classId: 'rock',
    tool: 'pickaxe',
    meshPool: [...ROCK_MESH_POOL],
    hp: DEFAULT_NODE_HP,
    scale: 1.0,
    respawnS: 28,
    tint: '#9aa3ad',
    loot: [
      {
        id: 'mat-stone',
        name: 'Stone',
        tier: 0,
        category: 'materials',
        iconUrl: `${ICON_MINERALS}/FD_Minerals_Stones.png`,
        qty: [2, 5]
      }
    ]
  },
  rock_ore: {
    id: 'rock_ore',
    label: 'Ore outcrop',
    classId: 'ore',
    tool: 'pickaxe',
    meshPool: [...ORE_MESH_POOL],
    hp: DEFAULT_NODE_HP + 1,
    scale: 0.95,
    respawnS: 36,
    tint: '#c9a227',
    loot: [
      {
        id: 'mat-ore-chunk',
        name: 'Ore chunk',
        tier: 1,
        category: 'materials',
        iconUrl: `${ICON_MINERALS}/FD_Minerals_Stones.png`,
        qty: [1, 3]
      },
      {
        id: 'mat-stone',
        name: 'Stone',
        tier: 0,
        category: 'materials',
        iconUrl: `${ICON_MINERALS}/FD_Minerals_Stones.png`,
        qty: [1, 2]
      }
    ]
  },
  rock_pebbles: {
    id: 'rock_pebbles',
    label: 'Pebble cluster',
    classId: 'rock',
    tool: 'hand',
    meshPool: [...PEBBLE_MESH_POOL],
    hp: 1,
    scale: 0.85,
    respawnS: 18,
    tint: '#8b7e6a',
    loot: [
      {
        id: 'mat-pebble',
        name: 'Pebbles',
        tier: 0,
        category: 'materials',
        iconUrl: `${ICON_MINERALS}/FD_Minerals_Stones.png`,
        qty: [1, 4]
      }
    ]
  },
  herb_patch: {
    id: 'herb_patch',
    label: 'Herb patch',
    classId: 'herb',
    tool: 'hand',
    meshPool: [], // procedural plant stub
    hp: 1,
    scale: 1,
    respawnS: 22,
    tint: '#4caf6a',
    loot: [
      {
        id: 'mat-herb',
        name: 'Wild herb',
        tier: 0,
        category: 'materials',
        iconUrl: `${ICON_INV}/Hearts_Yellow_1.png`,
        qty: [1, 2]
      }
    ]
  }
});

/**
 * Default pad layout — rings of harvestables for the lab island.
 * Positions are relative (angle, radiusFrac of islandRadius).
 * Spawn cluster is close so F harvest is reachable without a long run.
 */
export const DEFAULT_HARVEST_LAYOUT = Object.freeze([
  // Spawn cluster (~4–8 m) — tutorial harvest
  { defId: 'rock_pebbles', angle: 0.4, r: 0.1 },
  { defId: 'herb_patch', angle: 1.2, r: 0.09 },
  { defId: 'rock_pebbles', angle: 2.1, r: 0.11 },
  { defId: 'herb_patch', angle: 3.4, r: 0.1 },
  { defId: 'rock_boulder', angle: 5.0, r: 0.12 },
  { defId: 'rock_pebbles', angle: 5.8, r: 0.095 },
  // Inner ring — hand + herbs
  { defId: 'rock_pebbles', angle: 0.2, r: 0.22 },
  { defId: 'herb_patch', angle: 1.1, r: 0.2 },
  { defId: 'rock_pebbles', angle: 2.0, r: 0.24 },
  { defId: 'herb_patch', angle: 3.0, r: 0.21 },
  { defId: 'rock_pebbles', angle: 4.2, r: 0.23 },
  { defId: 'herb_patch', angle: 5.2, r: 0.2 },
  // Mid ring — stone boulders
  { defId: 'rock_boulder', angle: 0.5, r: 0.38 },
  { defId: 'rock_boulder', angle: 1.6, r: 0.4 },
  { defId: 'rock_boulder', angle: 2.7, r: 0.37 },
  { defId: 'rock_boulder', angle: 3.8, r: 0.41 },
  { defId: 'rock_boulder', angle: 4.9, r: 0.39 },
  { defId: 'rock_boulder', angle: 5.8, r: 0.4 },
  // Outer ring — ore
  { defId: 'rock_ore', angle: 0.9, r: 0.58 },
  { defId: 'rock_ore', angle: 2.3, r: 0.6 },
  { defId: 'rock_ore', angle: 3.5, r: 0.56 },
  { defId: 'rock_ore', angle: 4.7, r: 0.59 },
  { defId: 'rock_ore', angle: 5.9, r: 0.57 },
  // Shore practice boulders
  { defId: 'rock_boulder', angle: 1.3, r: 0.72 },
  { defId: 'rock_boulder', angle: 4.0, r: 0.7 },
  { defId: 'rock_ore', angle: 2.8, r: 0.74 }
]);

/**
 * Non-interactive décor (rockforms / walls) for map silhouette.
 * r near shore so pad center stays clear for combat + harvest.
 */
export const DEFAULT_DECOR_LAYOUT = Object.freeze([
  { mesh: 0, angle: 0.3, r: 0.82, yaw: 0.4, scale: 1.4 },
  { mesh: 1, angle: 1.0, r: 0.85, yaw: 1.2, scale: 1.2 },
  { mesh: 2, angle: 1.8, r: 0.8, yaw: 0.1, scale: 1.5 },
  { mesh: 3, angle: 2.6, r: 0.86, yaw: 2.0, scale: 1.3 },
  { mesh: 4, angle: 3.4, r: 0.83, yaw: 0.7, scale: 1.6 },
  { mesh: 5, angle: 4.2, r: 0.84, yaw: 1.5, scale: 1.25 },
  { mesh: 6, angle: 5.0, r: 0.81, yaw: 0.2, scale: 1.1 },
  { mesh: 7, angle: 5.7, r: 0.87, yaw: 2.4, scale: 1.35 },
  { mesh: 0, angle: 0.8, r: 0.78, yaw: 1.0, scale: 1.15 },
  { mesh: 2, angle: 3.9, r: 0.79, yaw: 0.5, scale: 1.45 }
]);

/**
 * Training dummy pads for combat focus (not harvest).
 * Closer ring so Tab soft-lock works from spawn.
 * @type {{ angle: number, r: number, label: string }[]}
 */
export const DEFAULT_DUMMY_LAYOUT = Object.freeze([
  { angle: 0.0, r: 0.18, label: 'Dummy · North' },
  { angle: Math.PI * 0.5, r: 0.18, label: 'Dummy · East' },
  { angle: Math.PI, r: 0.18, label: 'Dummy · South' },
  { angle: Math.PI * 1.5, r: 0.18, label: 'Dummy · West' },
  { angle: Math.PI * 0.25, r: 0.28, label: 'Dummy · NE' },
  { angle: Math.PI * 1.25, r: 0.28, label: 'Dummy · SW' }
]);

/**
 * Whether equipped weapon satisfies the node tool requirement.
 * @param {import('../api/t0WeaponCatalog.js').EquippableWeapon|null|undefined} weapon
 * @param {HarvestNodeDef} def
 */
export function toolMatches(weapon, def) {
  if (!def || def.tool === 'hand') return true;
  if (!weapon) return false;
  const tags = TOOL_TAGS[def.tool] || [];
  if (!tags.length) return true;
  const hay = `${weapon.id || ''} ${weapon.name || ''} ${weapon.weaponType || ''}`.toLowerCase();
  // Any TOOL weapon type covers pick/axe lab tools (t0-tool uses sword_shield attack)
  if (/tool/i.test(weapon.weaponType || '') || /tool/i.test(weapon.id || '')) return true;
  return tags.some((t) => hay.includes(t));
}

/**
 * Human-readable tool need for toasts.
 * @param {HarvestNodeDef} def
 */
export function toolLabel(def) {
  if (!def || def.tool === 'hand') return 'hands';
  if (def.tool === 'pickaxe') return 'pickaxe / tool';
  if (def.tool === 'axe') return 'axe / tool';
  if (def.tool === 'sickle') return 'sickle / tool';
  return def.tool;
}

/**
 * Roll loot bag entries from a node def.
 * @param {HarvestNodeDef} def
 * @param {() => number} [rng]
 */
export function rollNodeLoot(def, rng = Math.random) {
  const out = [];
  for (const spec of def.loot || []) {
    const [a, b] = Array.isArray(spec.qty) ? spec.qty : [1, 1];
    const qty = Math.max(1, Math.floor(a + rng() * (b - a + 1)));
    out.push({
      id: spec.id,
      name: spec.name,
      tier: spec.tier ?? 0,
      qty,
      category: spec.category || 'materials',
      iconUrl: spec.iconUrl || null,
      modelUrl: null,
      weaponType: null,
      source: 'harvest_node',
      nodeClass: def.classId
    });
  }
  return out;
}

/**
 * Pick a mesh URL from the def pool.
 * @param {HarvestNodeDef} def
 * @param {number} [seed]
 */
export function pickMeshUrl(def, seed = 0) {
  const pool = def?.meshPool || [];
  if (!pool.length) return null;
  const i = Math.abs(Math.floor(seed)) % pool.length;
  return pool[i];
}
