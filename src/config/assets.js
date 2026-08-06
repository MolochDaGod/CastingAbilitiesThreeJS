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
  kitUrlForRace
} from './grudge6SSOT.js';

export const ASSETS_CDN = CDN;
export const OPEN_HOST = 'https://open.grudge-studio.com';

/** Official Draco wasm path (same major as three r185 fleet). */
export const DRACO_DECODER_PATH =
  'https://www.gstatic.com/draco/versioned/decoders/1.5.7/';

export const GEAR_PRESETS_URL = SSOT_GEAR_PRESETS;
export { DEFAULT_RACE, atlasUrlForRace, kitUrlForRace };

/** Race kits + atlases (production GLB) — re-export stone SSOT shape for UI. */
export const RACES = Object.fromEntries(
  Object.entries(SSOT_RACES).map(([id, r]) => [
    id,
    {
      id: r.id,
      label: r.label,
      prefix: r.prefix,
      kitUrl: r.kitGlb,
      atlasUrl: r.atlasUrl
    }
  ])
);

/**
 * Baked pack clip relatives under /anims/baked/.
 * magic = casting sandbox default; sword_shield = melee attack.
 */
export const ANIM_PACKS = {
  magic: {
    idle: 'magic/standing idle',
    cast: 'magic/standing 1h cast spell 01',
    walk: 'magic/Standing Walk Forward',
    run: 'magic/Standing Run Forward'
  },
  sword_shield: {
    idle: 'sword_shield/sword and shield idle',
    attack: 'sword_shield/sword and shield attack',
    block: 'sword_shield/sword and shield block',
    run: 'sword_shield/sword and shield run'
  }
};

/** Fallback loadouts if CDN presets fail (mage-first for casting). */
export const FALLBACK_PRESETS = [
  {
    id: 'mage',
    label: 'Mage',
    description: 'Robes and a staff.',
    pack: 'magic',
    loadout: { body: 'D', arms: 'D', legs: 'C', head: 'E', staff: 'A' }
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

export function bakedClipUrl(rel) {
  const clean = String(rel).replace(/^\/+/, '').replace(/\.json$/i, '');
  return `${OPEN_HOST}/anims/baked/${encodeURI(clean)}.json`;
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
