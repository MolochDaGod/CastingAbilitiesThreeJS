/**
 * DevNode palette SSOT — creative resources for /devnode authoring.
 *
 * Extends (does not fork):
 *  - devIslandCatalog.js  harvest + décor rocks
 *  - deployableContract.js harvestable / buildable / enemy kinds
 *  - GrowingForest procedural trees
 *  - IslandHeightfield biomes knobs
 *
 * Each entry: kind + family + asset pointers + harvest/pve hooks when live.
 * Draft layouts export JSON consumable by DevIslandHarvest / world loaders.
 *
 * @see docs/DEVNODE_SSOT.md
 */

import {
  DECOR_MESH_POOL,
  HARVEST_NODE_DEFS,
  ORE_MESH_POOL,
  PEBBLE_MESH_POOL,
  ROCK_MESH_POOL
} from './devIslandCatalog.js';

/** Biome presets — drive terrain amp/seed + default scatter families */
export const BIOME_PRESETS = Object.freeze([
  {
    id: 'temperate_meadow',
    label: 'Temperate meadow',
    terrain: { seed: 17, amp: 0.7, flatCore: 10 },
    families: ['tree', 'flower', 'rock', 'herb', 'animal_passive']
  },
  {
    id: 'coastal_cliff',
    label: 'Coastal cliff',
    terrain: { seed: 41, amp: 1.1, flatCore: 6 },
    families: ['cliff', 'rock', 'ore', 'tree']
  },
  {
    id: 'deep_forest',
    label: 'Deep forest',
    terrain: { seed: 99, amp: 0.9, flatCore: 8 },
    families: ['tree', 'hemp', 'herb', 'rock', 'pve_mob']
  },
  {
    id: 'mine_sprawl',
    label: 'Mine sprawl',
    terrain: { seed: 7, amp: 0.55, flatCore: 12 },
    families: ['ore', 'rock', 'cliff', 'pve_mob']
  },
  {
    id: 'highland',
    label: 'Highland',
    terrain: { seed: 63, amp: 1.2, flatCore: 5 },
    families: ['cliff', 'ore', 'rock', 'animal_passive']
  },
  {
    id: 'home_island',
    label: 'Home island (NPC)',
    terrain: { seed: 21, amp: 0.55, flatCore: 14 },
    families: ['home_scenery', 'farm_module', 'tree', 'herb', 'flower', 'rock'],
    note: 'River village · lake · farm modular — flatter pad for building'
  },
  {
    id: 'river_valley',
    label: 'River valley',
    terrain: { seed: 88, amp: 0.75, flatCore: 9 },
    families: ['home_scenery', 'tree', 'rock', 'herb', 'animal_passive'],
    note: 'Village + water feature focus'
  }
]);

/**
 * Family → deployable kind (Admin F2/F3 alignment)
 * @type {Record<string, { label: string, adminTab: string, deployableKind: string }>}
 */
export const NODE_FAMILIES = Object.freeze({
  terrain: {
    label: 'Terrain',
    adminTab: 'world',
    deployableKind: 'buildable',
    note: 'Heightfield knobs only — not a mesh node'
  },
  cliff: {
    label: 'Cliffs / walls',
    adminTab: 'assets',
    deployableKind: 'buildable',
    note: 'Rockform walls · cliffs · décor'
  },
  tree: {
    label: 'Trees',
    adminTab: 'assets',
    deployableKind: 'harvestable',
    note: 'GrowingForest + wood tool'
  },
  rock: {
    label: 'Rocks',
    adminTab: 'assets',
    deployableKind: 'harvestable',
    note: 'dev-island rock_* defs'
  },
  ore: {
    label: 'Ore',
    adminTab: 'assets',
    deployableKind: 'harvestable',
    note: 'pickaxe · ore outcrops'
  },
  flower: {
    label: 'Flowers',
    adminTab: 'assets',
    deployableKind: 'harvestable',
    note: 'Herb-class · hand gather'
  },
  hemp: {
    label: 'Hemp / fiber',
    adminTab: 'assets',
    deployableKind: 'harvestable',
    note: 'Fiber · sickle/hand'
  },
  herb: {
    label: 'Herbs',
    adminTab: 'assets',
    deployableKind: 'harvestable',
    note: 'Existing herb_patch'
  },
  animal_passive: {
    label: 'Animals (passive)',
    adminTab: 'creatures',
    deployableKind: 'npc',
    note: 'F3 creature drafts · stub mesh until CDN fauna'
  },
  pve_mob: {
    label: 'PvE enemies',
    adminTab: 'creatures',
    deployableKind: 'enemy',
    note: 'Training dummy + grudge6 enemy drafts'
  },
  /** Home-island scenery kits (farm · lake · river village) */
  home_scenery: {
    label: 'Home island scenery',
    adminTab: 'world',
    deployableKind: 'buildable',
    note: 'island-scenery GLBs · HomeIslandScenery runtime'
  },
  farm_module: {
    label: 'Farm modules',
    adminTab: 'assets',
    deployableKind: 'buildable',
    note: 'Modular dirt/grass/trees from farm_modular_pack'
  },
  fishing_dock: {
    label: 'Fishing docks',
    adminTab: 'assets',
    deployableKind: 'buildable',
    note: 'T1 berth anywhere · T2/T3 upgrade inside own claim flag · boat housing'
  }
});

/**
 * @typedef {object} NodePaletteEntry
 * @property {string} id
 * @property {string} label
 * @property {keyof typeof NODE_FAMILIES} family
 * @property {'mesh'|'procedural'|'creature'|'terrain_knob'} source
 * @property {string[]} [meshPool]
 * @property {string} [harvestDefId]  link to HARVEST_NODE_DEFS
 * @property {string} [tint]
 * @property {number} [defaultScale]
 * @property {string} [tool]
 * @property {string} [note]
 * @property {boolean} [ready]  false = palette placeholder (export still ok)
 */

/** @type {NodePaletteEntry[]} */
export const NODE_PALETTE = Object.freeze([
  // —— Rocks / ore (live assets) ——
  {
    id: 'node.rock_boulder',
    label: 'Stone boulder',
    family: 'rock',
    source: 'mesh',
    harvestDefId: 'rock_boulder',
    meshPool: [...ROCK_MESH_POOL],
    defaultScale: 1,
    tool: 'pickaxe',
    tint: '#9aa3ad',
    ready: true
  },
  {
    id: 'node.rock_ore',
    label: 'Ore outcrop',
    family: 'ore',
    source: 'mesh',
    harvestDefId: 'rock_ore',
    meshPool: [...ORE_MESH_POOL],
    defaultScale: 0.95,
    tool: 'pickaxe',
    tint: '#c9a227',
    ready: true
  },
  {
    id: 'node.rock_pebbles',
    label: 'Pebble cluster',
    family: 'rock',
    source: 'mesh',
    harvestDefId: 'rock_pebbles',
    meshPool: [...PEBBLE_MESH_POOL],
    defaultScale: 0.85,
    tool: 'hand',
    tint: '#8b7e6a',
    ready: true
  },
  // —— Cliffs / décor walls ——
  {
    id: 'node.cliff_wall',
    label: 'Rock wall (straight)',
    family: 'cliff',
    source: 'mesh',
    meshPool: DECOR_MESH_POOL.filter((u) => /wall_straight|rockwall_straight/i.test(u)),
    defaultScale: 1.4,
    tint: '#6a7078',
    ready: true,
    note: 'Decor — not harvestable'
  },
  {
    id: 'node.cliff_arch',
    label: 'Rockform arch',
    family: 'cliff',
    source: 'mesh',
    meshPool: DECOR_MESH_POOL.filter((u) => /arch/i.test(u)),
    defaultScale: 1.5,
    tint: '#707880',
    ready: true
  },
  {
    id: 'node.cliff_column',
    label: 'Rock column',
    family: 'cliff',
    source: 'mesh',
    meshPool: DECOR_MESH_POOL.filter((u) => /column/i.test(u)),
    defaultScale: 1.3,
    tint: '#686e76',
    ready: true
  },
  // —— Trees (procedural GrowingForest language) ——
  {
    id: 'node.tree_grow',
    label: 'Growing tree',
    family: 'tree',
    source: 'procedural',
    defaultScale: 1,
    tool: 'axe',
    tint: '#3d8b4a',
    ready: true,
    note: 'forestoutline / GrowingForest instance'
  },
  // —— Flora ——
  {
    id: 'node.herb_patch',
    label: 'Herb patch',
    family: 'herb',
    source: 'mesh',
    harvestDefId: 'herb_patch',
    meshPool: [],
    defaultScale: 1,
    tool: 'hand',
    tint: '#4caf6a',
    ready: true
  },
  {
    id: 'node.flower_patch',
    label: 'Wildflowers',
    family: 'flower',
    source: 'procedural',
    defaultScale: 0.9,
    tool: 'hand',
    tint: '#e8a0c0',
    ready: true,
    note: 'Procedural stub until flora GLB pack on CDN'
  },
  // —— Home-island scenery (lake · village · farm pack) ——
  {
    id: 'node.scenery_lake',
    label: 'Low-poly lake',
    family: 'home_scenery',
    source: 'mesh',
    meshPool: ['./models/island-scenery/low_poly_lake.glb'],
    defaultScale: 1,
    tint: '#3a8ab8',
    ready: true,
    note: 'SI-fit water feature · HomeIslandScenery'
  },
  {
    id: 'node.scenery_village',
    label: 'River village',
    family: 'home_scenery',
    source: 'mesh',
    meshPool: ['./models/island-scenery/river_village.glb'],
    defaultScale: 1,
    tint: '#8a6a4a',
    ready: true,
    note: 'NPC home hub · cm author → SI fit'
  },
  {
    id: 'node.scenery_farm',
    label: 'Farm modular pack',
    family: 'farm_module',
    source: 'mesh',
    meshPool: ['./models/island-scenery/farm_modular_pack.glb'],
    defaultScale: 1,
    tint: '#5a8a3a',
    ready: true,
    note: 'Dirt/grass/trees kit · modular home fields'
  },
  {
    id: 'node.dock_t1',
    label: 'Dock T1 (Berth)',
    family: 'fishing_dock',
    source: 'mesh',
    meshPool: ['./models/fish/docks/dock_t1.glb'],
    defaultScale: 1,
    tint: '#6a8aaa',
    ready: true,
    note: 'Building · place anywhere · 1 boat slot · no claim'
  },
  {
    id: 'node.dock_t2',
    label: 'Dock T2 (Harbor)',
    family: 'fishing_dock',
    source: 'mesh',
    meshPool: ['./models/fish/docks/dock_t2.glb'],
    defaultScale: 1,
    tint: '#5a7a9a',
    ready: true,
    note: 'Upgrade inside **own claim flag** · 2 boats'
  },
  {
    id: 'node.dock_t3',
    label: 'Dock T3 (Port)',
    family: 'fishing_dock',
    source: 'mesh',
    meshPool: ['./models/fish/docks/dock_t3.glb'],
    defaultScale: 1,
    tint: '#4a6a8a',
    ready: true,
    note: 'Max port · own claim flag · 4 boats'
  },
  {
    id: 'node.home_spawn',
    label: 'Home spawn marker',
    family: 'home_scenery',
    source: 'procedural',
    defaultScale: 1,
    tint: '#7fd6ff',
    ready: true,
    note: 'Player/NPC home start pin for home-island layouts'
  },
  {
    id: 'node.hemp',
    label: 'Hemp stand',
    family: 'hemp',
    source: 'procedural',
    defaultScale: 1.1,
    tool: 'sickle',
    tint: '#6b8f3c',
    ready: true,
    note: 'Fiber gather · sickle preferred'
  },
  // —— Fauna / PvE (F3 alignment — placeholders ready for drafts) ——
  {
    id: 'node.animal_deer',
    label: 'Deer (passive)',
    family: 'animal_passive',
    source: 'creature',
    defaultScale: 1,
    tint: '#a08060',
    ready: false,
    note: 'Spawn via F3 creature draft · mesh TBD CDN'
  },
  {
    id: 'node.animal_boar',
    label: 'Boar (passive→aggro)',
    family: 'animal_passive',
    source: 'creature',
    defaultScale: 1,
    tint: '#705040',
    ready: false
  },
  {
    id: 'node.pve_dummy',
    label: 'Training dummy',
    family: 'pve_mob',
    source: 'creature',
    defaultScale: 1,
    tint: '#c45c4a',
    ready: true,
    note: 'DevIslandHarvest spawnTrainingDummies'
  },
  {
    id: 'node.pve_grunt',
    label: 'PvE grunt (race kit)',
    family: 'pve_mob',
    source: 'creature',
    defaultScale: 1,
    tint: '#8b3a3a',
    ready: false,
    note: 'grudge6 enemy · F3 create draft'
  }
]);

export function paletteByFamily(family) {
  return NODE_PALETTE.filter((e) => e.family === family);
}

export function paletteEntry(id) {
  return NODE_PALETTE.find((e) => e.id === id) || null;
}

/**
 * Resolve harvest def if palette entry links one.
 * @param {string} paletteId
 */
export function harvestDefForPalette(paletteId) {
  const e = paletteEntry(paletteId);
  if (!e?.harvestDefId) return null;
  return HARVEST_NODE_DEFS[e.harvestDefId] || null;
}

/**
 * Empty layout document for export / localStorage.
 * @param {string} [biomeId]
 */
export function createEmptyNodeLayout(biomeId = 'temperate_meadow') {
  const biome = BIOME_PRESETS.find((b) => b.id === biomeId) || BIOME_PRESETS[0];
  return {
    version: 1,
    source: 'casting-devnode',
    biomeId: biome.id,
    terrain: { ...biome.terrain },
    nodes: [],
    createdAt: new Date().toISOString()
  };
}

/**
 * @typedef {object} PlacedNode
 * @property {string} id  instance id
 * @property {string} paletteId
 * @property {number} x
 * @property {number} z
 * @property {number} [y]
 * @property {number} [yaw]
 * @property {number} [scale]
 */

/**
 * Validate layout for import.
 * @param {unknown} raw
 */
export function validateNodeLayout(raw) {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'not an object' };
  const o = /** @type {Record<string, unknown>} */ (raw);
  if (o.version !== 1 && o.version !== undefined) {
    return { ok: false, error: `unsupported version ${o.version}` };
  }
  if (!Array.isArray(o.nodes)) return { ok: false, error: 'nodes[] required' };
  return { ok: true, layout: o };
}

/** Creative resource map — where to pull assets (no parallel CDN invent) */
export const CREATIVE_RESOURCE_MAP = Object.freeze({
  rocks_cliffs: {
    local: 'public/models/dev-island/rock__*',
    note: 'Baked rock pack already in lab'
  },
  harvest_defs: {
    code: 'src/world/devIslandCatalog.js',
    note: 'HARVEST_NODE_DEFS + layouts'
  },
  trees: {
    code: 'src/world/GrowingForest.js',
    ref: 'Desktop forestoutline.html + snakey trees',
    note: 'Procedural grow + instanced'
  },
  terrain: {
    code: 'src/world/IslandHeightfield.js',
    ref: 'snakey-locomotion · three-stylized'
  },
  weapons_loot: {
    cdn: 'info.grudge-studio.com/api/v1/master-weapon-prefabs.json',
    note: 'World drop icons/models'
  },
  creatures: {
    admin: 'F3 Creatures',
    cdn: 'assets.grudge-studio.com/asset-packs/toon-rts-characters/glb/characters/',
    note: 'Enemy/ally drafts — no second AI brain'
  },
  flora_future: {
    note: 'Nature stylized packs via grudge-warlords-assets / D1 — wire meshPool when uploaded'
  },
  forestoutline: {
    path: 'C:/Users/nugye/Desktop/forestoutline.html',
    note: 'Instanced tree CONFIG + leaf LOD reference only'
  }
});
