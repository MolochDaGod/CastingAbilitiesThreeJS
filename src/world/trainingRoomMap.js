/**
 * Training Room = DevIsland = the one casting.* island map.
 *
 * Play (`index.html`), DevNode (`devnode.html`), and harvest runtime all
 * share this map profile. No second island / second height stack.
 *
 * Built with:
 *  L0  IslandHeightfield (FBM height · Rapier heightfield)
 *  L1  same mesh (meadow/dirt/shore vertex colors)
 *  L2  StylizedGrassLayer + GrowingForest
 *  L3  DevIslandHarvest rocks/ore/herbs + decor + training dummies
 *  Water StageWater + OpenSeaShells horizon
 *
 * @see docs/TRAINING_ROOM_SSOT.md
 * @see docs/THREE_LAYER_TERRAIN_SSOT.md
 */

import { WORLD } from '../config/worldScale.js';
import { settings } from '../config/settings.js';
import {
  DEFAULT_DECOR_LAYOUT,
  DEFAULT_DUMMY_LAYOUT,
  DEFAULT_HARVEST_LAYOUT,
  DECOR_MESH_POOL,
  HARVEST_NODE_DEFS
} from './devIslandCatalog.js';
import { createEmptyNodeLayout, harvestDefForPalette, paletteEntry } from './nodePalette.js';

/** Canonical map id (play + editor + export) */
export const TRAINING_ROOM_MAP_ID = 'training_room';
/** Product aliases — same thing */
export const TRAINING_ROOM_ALIASES = Object.freeze(['devisland', 'dev_island', 'devnode']);

export const TRAINING_ROOM_LABEL = 'Training Room · DevIsland';

/** localStorage key shared by DevNode export and play import */
export const TRAINING_ROOM_LAYOUT_KEY = 'grudge.casting.training_room.layout.v1';
/** Legacy DevNode key — still read for migration */
export const DEVNODE_LAYOUT_LEGACY_KEY = 'grudge.casting.devnode.layout.v1';

/**
 * What builds each world layer on casting.* right now.
 * Agent / product SSOT — do not invent parallel builders.
 */
export const TRAINING_ROOM_BUILDERS = Object.freeze({
  mapId: TRAINING_ROOM_MAP_ID,
  label: TRAINING_ROOM_LABEL,
  host: 'casting.grudge-studio.com · casting-abilities-threejs.vercel.app',
  playEntry: 'index.html',
  editorEntry: 'devnode.html',
  layers: {
    L0_height: {
      code: 'IslandHeightfield',
      path: 'src/world/IslandHeightfield.js',
      physics: 'PhysicsWorld.addHeightfield (Rapier)',
      sample: 'terrainHandle / IslandHeightfield.sample',
      learned: ['snakey-locomotion heightAt', 'three.js physics_rapier_terrain']
    },
    L1_surface: {
      code: 'IslandHeightfield.mesh',
      path: 'src/world/IslandHeightfield.js',
      note: 'Vertex meadow/dirt/shore — Ground.mesh hidden when terrain on',
      learned: ['three-stylized grounds']
    },
    L2_vegetation: {
      grass: { code: 'StylizedGrassLayer', path: 'src/world/StylizedGrassLayer.js' },
      forest: { code: 'GrowingForest', path: 'src/world/GrowingForest.js' },
      learned: ['three-stylized grass', 'Desktop forestoutline.html', 'snakey trees']
    },
    L3_detail: {
      harvest: { code: 'DevIslandHarvest', path: 'src/world/DevIslandHarvest.js' },
      catalog: { code: 'devIslandCatalog', path: 'src/world/devIslandCatalog.js' },
      editor: { code: 'DevNodeEditor + nodePalette', path: 'src/devnode · src/world/nodePalette.js' },
      note: 'Rocks/ore/herbs/dummies/decor — author on /devnode, play on index'
    },
    water: {
      code: 'StageWater + OpenSeaShells',
      path: 'src/world/StageWater.js · OpenSeaShells.js',
      note: 'Sibling of land — freeride / windsurf, not L1'
    },
    mount: {
      code: 'mountTerrainLayers (optional bundle)',
      path: 'src/world/terrainLayers.js',
      note: 'App still mounts L0–L2 inline; same modules'
    }
  },
  settingsKey: 'settings.terrain',
  worldKey: 'WORLD.islandRadius · shoreBand · waterY'
});

/**
 * Terrain knobs for the Training Room map (settings.terrain defaults).
 * @returns {{ seed: number, amp: number, flatCore: number, segments: number, grid: number }}
 */
export function trainingRoomTerrain() {
  const t = settings.terrain || {};
  return {
    seed: t.seed ?? 17,
    amp: t.amp ?? 0.85,
    flatCore: t.flatCore ?? 8,
    segments: t.segments ?? 96,
    grid: t.grid ?? 65
  };
}

/**
 * Polar catalog slot → world XZ on island pad.
 * @param {{ angle: number, r?: number }} slot
 * @param {number} [islandRadius]
 */
export function polarToXZ(slot, islandRadius = WORLD.islandRadius) {
  const r = (islandRadius ?? 40) * (slot.r ?? 0.4);
  return {
    x: Math.cos(slot.angle) * r,
    z: Math.sin(slot.angle) * r
  };
}

/**
 * Map harvest defId → nodePalette id when known.
 * @param {string} defId
 */
export function harvestDefToPaletteId(defId) {
  const map = {
    rock_boulder: 'node.rock_boulder',
    rock_ore: 'node.rock_ore',
    rock_pebbles: 'node.rock_pebbles',
    herb_patch: 'node.herb_patch'
  };
  return map[defId] || null;
}

/**
 * Palette id → harvest defId.
 * @param {string} paletteId
 */
export function paletteIdToHarvestDef(paletteId) {
  const e = paletteEntry(paletteId);
  if (e?.harvestDefId) return e.harvestDefId;
  const def = harvestDefForPalette(paletteId);
  return def?.id || null;
}

/**
 * Built-in Training Room layout as DevNode document (cartesian).
 * Merges harvest ring + cliff decor + dummy pads into one node list.
 */
export function createTrainingRoomLayout() {
  const terrain = trainingRoomTerrain();
  const R = WORLD.islandRadius ?? 51;
  /** @type {import('./nodePalette.js').PlacedNode[]} */
  const nodes = [];
  let i = 0;

  for (const slot of DEFAULT_HARVEST_LAYOUT) {
    const pid = harvestDefToPaletteId(slot.defId);
    if (!pid) continue;
    const { x, z } = polarToXZ(slot, R);
    nodes.push({
      id: `tr_h_${i++}`,
      paletteId: pid,
      x,
      z,
      yaw: (slot.angle || 0) + 0.3,
      scale: HARVEST_NODE_DEFS[slot.defId]?.scale ?? 1
    });
  }

  for (const slot of DEFAULT_DECOR_LAYOUT) {
    const url = DECOR_MESH_POOL[slot.mesh % DECOR_MESH_POOL.length] || '';
    let paletteId = 'node.cliff_wall';
    if (/arch/i.test(url)) paletteId = 'node.cliff_arch';
    else if (/column/i.test(url)) paletteId = 'node.cliff_column';
    const { x, z } = polarToXZ(slot, R);
    nodes.push({
      id: `tr_d_${i++}`,
      paletteId,
      x,
      z,
      yaw: slot.yaw ?? 0,
      scale: slot.scale ?? 1.3
    });
  }

  for (const slot of DEFAULT_DUMMY_LAYOUT) {
    const { x, z } = polarToXZ(slot, R);
    nodes.push({
      id: `tr_p_${i++}`,
      paletteId: 'node.pve_dummy',
      x,
      z,
      yaw: slot.angle + Math.PI,
      scale: 1,
      label: slot.label
    });
  }

  return {
    version: 1,
    source: 'casting-training-room',
    mapId: TRAINING_ROOM_MAP_ID,
    mapLabel: TRAINING_ROOM_LABEL,
    biomeId: 'temperate_meadow',
    terrain: { ...terrain },
    nodes,
    createdAt: new Date().toISOString()
  };
}

/**
 * Normalize any layout JSON to Training Room map stamp.
 * @param {object} layout
 */
export function stampTrainingRoomLayout(layout) {
  const base = createEmptyNodeLayout(layout?.biomeId || 'temperate_meadow');
  return {
    ...base,
    ...layout,
    version: 1,
    source: layout?.source || 'casting-training-room',
    mapId: TRAINING_ROOM_MAP_ID,
    mapLabel: TRAINING_ROOM_LABEL,
    terrain: { ...trainingRoomTerrain(), ...(layout?.terrain || {}) },
    nodes: Array.isArray(layout?.nodes) ? layout.nodes : []
  };
}

/**
 * Load layout from localStorage (new key, then legacy DevNode).
 * @returns {object|null}
 */
export function loadTrainingRoomLayoutFromStorage() {
  if (typeof localStorage === 'undefined') return null;
  for (const key of [TRAINING_ROOM_LAYOUT_KEY, DEVNODE_LAYOUT_LEGACY_KEY]) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const o = JSON.parse(raw);
      if (o && Array.isArray(o.nodes)) return stampTrainingRoomLayout(o);
    } catch {
      /* next */
    }
  }
  return null;
}

/**
 * Persist layout under canonical + legacy keys so DevNode/play stay synced.
 * @param {object} layout
 */
export function saveTrainingRoomLayoutToStorage(layout) {
  if (typeof localStorage === 'undefined') return;
  const stamped = stampTrainingRoomLayout(layout);
  const json = JSON.stringify(stamped);
  try {
    localStorage.setItem(TRAINING_ROOM_LAYOUT_KEY, json);
    localStorage.setItem(DEVNODE_LAYOUT_LEGACY_KEY, json);
  } catch {
    /* quota */
  }
  return stamped;
}

/**
 * True if map id is this island (training room / devisland / devnode).
 * @param {string} [id]
 */
export function isTrainingRoomMap(id) {
  if (!id) return true;
  const s = String(id).toLowerCase();
  return s === TRAINING_ROOM_MAP_ID || TRAINING_ROOM_ALIASES.includes(s);
}
