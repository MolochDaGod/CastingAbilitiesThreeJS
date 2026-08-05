/**
 * Grudge / Toon RTS asset SSOT for this sandbox.
 *
 * Mesh load: three.js GLTFLoader + DRACO + Meshopt (see AssetLoader).
 * Kit binaries: assets.grudge-studio.com (grudge6-cdn-ssot).
 * Baked Bip001 clips: open.grudge-studio.com/anims/baked/…
 */

export const ASSETS_CDN = 'https://assets.grudge-studio.com';
export const OPEN_HOST = 'https://open.grudge-studio.com';

/** Official Draco wasm path (same major as three r185 fleet). */
export const DRACO_DECODER_PATH =
  'https://www.gstatic.com/draco/versioned/decoders/1.5.7/';

export const GEAR_PRESETS_URL = `${ASSETS_CDN}/api/v1/grudge6-gear-presets.json`;

/** Race kits + atlases (production GLB). */
export const RACES = {
  WK: {
    id: 'WK',
    label: 'Western Kingdoms',
    prefix: 'WK_',
    kitUrl: `${ASSETS_CDN}/models/grudge6/races/WK_Characters.glb`,
    atlasUrl: `${ASSETS_CDN}/textures/grudge6/western-kingdoms/WK_Standard_Units.webp`
  },
  ELF: {
    id: 'ELF',
    label: 'High Elves',
    prefix: 'ELF_',
    kitUrl: `${ASSETS_CDN}/models/grudge6/races/ELF_Characters.glb`,
    atlasUrl: `${ASSETS_CDN}/textures/grudge6/elves/ELF_HighElves_Texture.webp`
  },
  BRB: {
    id: 'BRB',
    label: 'Barbarians',
    prefix: 'BRB_',
    kitUrl: `${ASSETS_CDN}/models/grudge6/races/BRB_Characters.glb`,
    atlasUrl: `${ASSETS_CDN}/textures/grudge6/barbarians/BRB_StandardUnits_texture.webp`
  }
};

export const DEFAULT_RACE = 'WK';

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
    description: 'Cloth + leather, bow & quiver.',
    pack: 'longbow',
    loadout: {
      body: 'A',
      arms: 'A',
      legs: 'A',
      head: 'A',
      bow: '_default',
      quiver: '_default'
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

export function kitUrlForRace(raceId) {
  return (RACES[raceId] || RACES[DEFAULT_RACE]).kitUrl;
}

export function atlasUrlForRace(raceId) {
  return (RACES[raceId] || RACES[DEFAULT_RACE]).atlasUrl;
}

/** SI human target height (metres). */
export const TARGET_HEIGHT_M = 1.8;

/** Armor / weapon slots used by EquipmentManager + inventory panel. */
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
  'shield',
  'quiver',
  'bag'
];

export const WEAPON_SLOTS = ['sword', 'axe', 'hammer', 'spear', 'staff', 'bow'];
