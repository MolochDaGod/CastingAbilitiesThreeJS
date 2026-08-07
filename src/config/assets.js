/**
 * Grudge / Toon RTS asset config for this sandbox.
 *
 * Race kits / atlases: `grudge6SSOT.js` (Multiverse stone SSOT).
 * Mesh load: GLTFLoader + DRACO + Meshopt (AssetLoader).
 * Baked Bip001 clips: open.grudge-studio.com/anims/baked/…
 */

import {
  CDN,
  DEFAULT_RACE,
  GEAR_PRESETS_URL as SSOT_GEAR_PRESETS,
  HUMAN_HEIGHT_M,
  RACES as SSOT_RACES,
  atlasUrlForRace,
  kitUrlCandidates,
  kitUrlForRace
} from './grudge6SSOT.js';

export const ASSETS_CDN = CDN;
export const OPEN_HOST = 'https://open.grudge-studio.com';

/** Official Draco wasm path (same major as three r185 fleet). */
export const DRACO_DECODER_PATH =
  'https://www.gstatic.com/draco/versioned/decoders/1.5.7/';

export const GEAR_PRESETS_URL = SSOT_GEAR_PRESETS;
export { DEFAULT_RACE, atlasUrlForRace, kitUrlCandidates, kitUrlForRace, HUMAN_HEIGHT_M };

/** Race kits + atlases — Toon RTS ★ play URLs. */
export const RACES = Object.fromEntries(
  Object.entries(SSOT_RACES).map(([id, r]) => [
    id,
    {
      id: r.id,
      label: r.label,
      prefix: r.prefix,
      kitUrl: r.kitGlb,
      atlasUrl: r.atlasUrl,
    },
  ]),
);

/**
 * Baked pack clips — each role is a candidate list (first URL that loads wins).
 *
 * HARD idle lesson (2026-08): open `magic/standing idle` is rotation-only but
 * **has no Hand tracks** and drives Spine1/Spine2. Toon bind leaves hands in a
 * broken rest while cast (`…1h cast spell…`) animates hands → cast looks formed,
 * idle does not. Prefer **prod** magic idle (hands + same bone set as cast).
 */
export const ANIM_PACKS = {
  magic: {
    // Prefer prod (has L/R Hand). Open standing idle is hand-less — avoid as primary.
    idle: [
      'prod:magic/standing-idle',
      'magic/standing idle' // last resort only
    ],
    cast: [
      'prod:magic/standing-1h-cast-spell-01',
      'magic/standing 1h cast spell 01',
      'magic/standing 2h cast spell 01'
    ],
    walk: ['prod:magic/standing-walk-forward', 'magic/Standing Walk Forward'],
    run: ['prod:magic/standing-run-forward', 'magic/Standing Run Forward']
  },
  sword_shield: {
    idle: ['sword_shield/sword and shield idle'],
    attack: ['sword_shield/sword and shield attack'],
    block: ['sword_shield/sword and shield block'],
    run: ['sword_shield/sword and shield run']
  }
};

/** Fallback loadouts if CDN presets fail (mage-first for casting).
 *  Letters match Toon RTS human kit: Body A–E, Arms A–D, Legs A–C, head A–I, staff A–C.
 */
export const FALLBACK_PRESETS = [
  {
    id: 'mage',
    label: 'Mage',
    description: 'Robes and a staff.',
    pack: 'magic',
    // Conservative A/B set so every race kit has matching mesh_ids
    loadout: { body: 'A', arms: 'A', legs: 'A', head: 'A', staff: 'A' }
  },
  {
    id: 'knight',
    label: 'Knight',
    description: 'Heavy plate, sword & shield.',
    pack: 'sword_shield',
    loadout: {
      body: 'C',
      arms: 'C',
      legs: 'C',
      head: 'D',
      shoulders: 'B',
      sword: 'A',
      shield: 'A'
    }
  },
  {
    id: 'berserker',
    label: 'Berserker',
    description: 'Light armor, axe.',
    pack: 'sword_shield',
    loadout: { body: 'B', arms: 'B', legs: 'B', head: 'B', axe: 'A' }
  },
  {
    id: 'archer',
    label: 'Archer',
    description: 'Cloth + leather, bow (quiver only via carry).',
    pack: 'longbow',
    loadout: {
      body: 'A',
      arms: 'A',
      legs: 'A',
      head: 'A',
      bow: '_default'
    }
  },
  {
    id: 'tank',
    label: 'Tank',
    description: 'Maximum plate, hammer & tower shield.',
    pack: 'sword_shield',
    loadout: {
      body: 'E',
      arms: 'D',
      legs: 'C',
      head: 'F',
      shoulders: 'B',
      hammer: 'A',
      shield: 'B'
    }
  }
];

/**
 * Resolve one relative path (or `prod:pack/file`) to absolute URL candidates.
 * @param {string} rel
 * @returns {string[]}
 */
export function bakedClipUrl(rel) {
  return bakedClipUrls(rel)[0];
}

/**
 * Absolute URL candidates for a baked clip.
 * - `prod:magic/standing-idle` → assets…/prod/anims/magic/standing-idle.json
 * - `magic/standing idle` → open…/anims/baked/magic/standing%20idle.json (+ assets mirror)
 * @param {string} rel
 * @returns {string[]}
 */
export function bakedClipUrls(rel) {
  const raw = String(rel || '').replace(/^\/+/, '').replace(/\.json$/i, '');
  if (!raw) return [];

  if (raw.startsWith('prod:')) {
    const path = raw.slice(5).replace(/^\/+/, '');
    const enc = path
      .split('/')
      .map((s) => encodeURIComponent(s))
      .join('/');
    return [
      `${ASSETS_CDN}/prod/anims/${enc}.json`,
      // dash→space open fallback for same logical clip
      `${OPEN_HOST}/anims/baked/${enc.replace(/-/g, '%20')}.json`
    ];
  }

  const enc = raw
    .split('/')
    .map((s) => encodeURIComponent(s))
    .join('/');
  return [
    `${OPEN_HOST}/anims/baked/${enc}.json`,
    `${ASSETS_CDN}/anims/baked/${enc}.json`
  ];
}

/**
 * Flatten pack role value (string | string[]) into ordered absolute URLs.
 * @param {string|string[]} roleEntry
 * @returns {string[]}
 */
export function bakedClipUrlsForRole(roleEntry) {
  const list = Array.isArray(roleEntry) ? roleEntry : [roleEntry];
  const out = [];
  const seen = new Set();
  for (const rel of list) {
    for (const url of bakedClipUrls(rel)) {
      if (seen.has(url)) continue;
      seen.add(url);
      out.push(url);
    }
  }
  return out;
}

/** SI human target height (metres). */
export const TARGET_HEIGHT_M = HUMAN_HEIGHT_M;

/** Armor / weapon slots used by EquipmentManager + inventory panel. */
/** Inventory UI slots — utility listed last (carry-only, hidden by default). */
export const EQUIP_SLOTS = [
  'body',
  'arms',
  'legs',
  'head',
  'shoulders',
  'sword',
  'axe',
  'hammer',
  'spear',
  'staff',
  'bow',
  'shield'
  // bag / wood / quiver intentionally omitted from default equip UI
];

export const WEAPON_SLOTS = ['sword', 'axe', 'hammer', 'spear', 'staff', 'bow'];
