/**
 * Training Room production deploy chain.
 *
 * Load order for map layout (best production → lab fallback):
 *  1. localStorage (author session from /devnode)
 *  2. Published fetch: same-origin maps/ → info → objectstore → CDN
 *  3. Built-in createTrainingRoomLayout()
 *
 * Node contract for Open/Forge handoff matches production world habits:
 *   id · meshKey · kind · position · physicsLayer · location
 *
 * @see docs/TRAINING_ROOM_SSOT.md · grudge-production-world · grudge-d1-r2
 */

import {
  ASSETS_URL,
  TRAINING_ROOM_LAYOUT_KEYS,
  TRAINING_ROOM_R2_PREFIX,
  fleetDeploySnapshot,
  resolveLabAssetUrl
} from '../config/fleetEnv.js';
import {
  TRAINING_ROOM_MAP_ID,
  TRAINING_ROOM_LABEL,
  createTrainingRoomLayout,
  loadTrainingRoomLayoutFromStorage,
  stampTrainingRoomLayout,
  paletteIdToHarvestDef
} from './trainingRoomMap.js';
import { HARVEST_NODE_DEFS, pickMeshUrl } from './devIslandCatalog.js';
import { validateNodeLayout } from './nodePalette.js';

/**
 * Fetch first OK JSON from candidate URLs.
 * @param {string[]} urls
 * @param {number} [timeoutMs]
 */
async function fetchFirstJson(urls, timeoutMs = 6000) {
  for (const url of urls) {
    if (!url) continue;
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), timeoutMs);
      const res = await fetch(url, {
        signal: ctrl.signal,
        headers: { Accept: 'application/json' },
        cache: 'no-cache'
      });
      clearTimeout(t);
      if (!res.ok) continue;
      const body = await res.json();
      if (body && typeof body === 'object') {
        return { ok: true, url, body };
      }
    } catch {
      /* try next */
    }
  }
  return { ok: false, url: null, body: null };
}

/**
 * Resolve production layout for play boot.
 * @param {{ skipStorage?: boolean, preferPublished?: boolean }} [opts]
 */
export async function loadTrainingRoomLayoutForPlay(opts = {}) {
  if (!opts.skipStorage) {
    const stored = loadTrainingRoomLayoutFromStorage();
    if (stored?.nodes?.length) {
      return {
        layout: stampTrainingRoomLayout(stored),
        source: 'localStorage',
        publishedUrl: null
      };
    }
  }

  // Published chain — same-origin first (always on casting Vercel)
  const keys = TRAINING_ROOM_LAYOUT_KEYS;
  const urls = [
    keys.local,
    // Prefer info catalog authority when promoted
    keys.info,
    keys.objectstore,
    keys.cdn
  ];
  if (opts.preferPublished) {
    // Prod smoke: try remote catalogs before local bundle
    urls.splice(0, urls.length, keys.info, keys.objectstore, keys.cdn, keys.local);
  }

  const got = await fetchFirstJson(urls);
  if (got.ok) {
    const v = validateNodeLayout(got.body);
    if (v.ok) {
      return {
        layout: stampTrainingRoomLayout(v.layout),
        source: 'published',
        publishedUrl: got.url
      };
    }
  }

  const builtIn = createTrainingRoomLayout();
  return {
    layout: stampTrainingRoomLayout(builtIn),
    source: 'builtin',
    publishedUrl: null
  };
}

/**
 * Convert Training Room layout → production world mesh nodes (Open/Forge handoff).
 * Does not invent UUIDs — ids stay lab-stable until ObjectStore mint.
 *
 * @param {object} layout
 * @returns {object[]}
 */
export function layoutToWorldMeshNodes(layout) {
  const nodes = layout?.nodes || [];
  const out = [];
  for (const n of nodes) {
    const defId = paletteIdToHarvestDef(n.paletteId);
    const def = defId ? HARVEST_NODE_DEFS[defId] : null;
    let meshKey = null;
    let kind = 'prop';
    if (def) {
      kind = 'harvestable';
      const url = pickMeshUrl(def, (n.id || '').length) || def.meshPool?.[0];
      meshKey = urlToR2Key(url);
    } else if (String(n.paletteId || '').includes('pve') || String(n.paletteId || '').includes('dummy')) {
      kind = 'enemy';
      meshKey = null; // procedural dummy — client spawns kit later
    } else if (String(n.paletteId || '').includes('cliff') || String(n.paletteId || '').includes('wall')) {
      kind = 'buildable';
      meshKey = `${TRAINING_ROOM_R2_PREFIX}/dev-island/rock__rockform_wall_short1_medium.glb`;
    } else if (String(n.paletteId || '').includes('tree')) {
      kind = 'harvestable';
      meshKey = null; // GrowingForest procedural
    }

    out.push({
      id: n.id || `node_${out.length}`,
      mapId: TRAINING_ROOM_MAP_ID,
      paletteId: n.paletteId,
      meshKey,
      kind,
      position: {
        x: Number(n.x) || 0,
        y: Number(n.y) || 0,
        z: Number(n.z) || 0
      },
      yaw: Number(n.yaw) || 0,
      scale: Number(n.scale) || 1,
      physicsLayer: kind === 'enemy' ? 'NPC' : kind === 'harvestable' ? 'Item' : 'Default',
      collider: kind === 'harvestable' || kind === 'buildable' ? 'static' : 'none',
      location: {
        mapId: TRAINING_ROOM_MAP_ID,
        label: TRAINING_ROOM_LABEL,
        sector: 'casting_lab'
      },
      harvestDefId: defId || undefined
    });
  }
  return out;
}

/**
 * Local path → R2 key for D1 index / promote.
 * @param {string|null|undefined} url
 */
export function urlToR2Key(url) {
  if (!url) return null;
  const s = String(url);
  if (/^https?:\/\//i.test(s)) {
    try {
      const u = new URL(s);
      return u.pathname.replace(/^\//, '');
    } catch {
      return s;
    }
  }
  const bare = s.replace(/^\.\//, '').replace(/^\//, '');
  if (bare.startsWith('models/dev-island/')) {
    return `${TRAINING_ROOM_R2_PREFIX}/${bare.slice('models/'.length)}`;
  }
  if (bare.startsWith('icons/dev-island/')) {
    return `${TRAINING_ROOM_R2_PREFIX}/${bare}`;
  }
  return bare;
}

/**
 * D1-ready asset index rows for Training Room binaries (upload checklist).
 * Binary still lives on R2; D1 only indexes.
 *
 * @param {string[]} meshUrls relative lab paths
 */
export function d1IndexRowsForMeshes(meshUrls) {
  const rows = [];
  const seen = new Set();
  for (const u of meshUrls || []) {
    const key = urlToR2Key(u);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    rows.push({
      key,
      cdnUrl: `${ASSETS_URL}/${key}`,
      kind: 'mesh',
      tags: ['casting', 'training_room', 'devisland', 'lab'],
      mapId: TRAINING_ROOM_MAP_ID,
      source: 'casting-lab-promote'
    });
  }
  return rows;
}

/**
 * Export package for promote (ObjectStore / R2 / D1 operators).
 * @param {object} layout
 */
export function buildTrainingRoomPromotePackage(layout) {
  const stamped = stampTrainingRoomLayout(layout || createTrainingRoomLayout());
  const worldNodes = layoutToWorldMeshNodes(stamped);
  const meshUrls = [];
  for (const n of stamped.nodes || []) {
    const defId = paletteIdToHarvestDef(n.paletteId);
    const def = defId ? HARVEST_NODE_DEFS[defId] : null;
    if (def?.meshPool?.length) meshUrls.push(...def.meshPool);
  }
  return {
    contract: 'grudge.trainingRoomPromote/v1',
    mapId: TRAINING_ROOM_MAP_ID,
    mapLabel: TRAINING_ROOM_LABEL,
    layout: stamped,
    worldMeshNodes: worldNodes,
    d1Index: d1IndexRowsForMeshes(meshUrls),
    r2Prefix: TRAINING_ROOM_R2_PREFIX,
    publishTargets: {
      layoutJson: [
        `objectstore:/api/v1/maps/training_room/layout.json`,
        `info:/api/v1/maps/training_room/layout.json`,
        `r2:${TRAINING_ROOM_R2_PREFIX}/layout.default.json`
      ],
      binaries: `r2:${TRAINING_ROOM_R2_PREFIX}/dev-island/*`
    },
    fleet: fleetDeploySnapshot(),
    createdAt: new Date().toISOString()
  };
}

/**
 * Resolve harvest mesh URL for runtime load (local first, CDN promote optional).
 * @param {string} url
 * @param {{ preferCdn?: boolean }} [opts]
 */
export function resolveTrainingRoomMeshUrl(url, opts = {}) {
  return resolveLabAssetUrl(url, opts);
}
