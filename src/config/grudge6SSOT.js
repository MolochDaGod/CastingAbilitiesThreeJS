/**
 * grudge6 STONE SSOT — mirror Multiverse `game/grudge6SSOT.js` + grudge6-cdn-ssot.
 * Production browser kit = GLB; atlas under textures/grudge6/; never invent hosts.
 */

export const GRUDGE6_SSOT_VERSION = '2026-08-01.1';

export const CDN = 'https://assets.grudge-studio.com';
export const CDN_MIRROR_OPEN = 'https://open.grudge-studio.com';
export const HUMAN_HEIGHT_M = 1.8;
export const ANIMS_BAKED = `${CDN_MIRROR_OPEN}/anims/baked`;
export const GEAR_PRESETS_URL = `${CDN}/api/v1/grudge6-gear-presets.json`;
export const RACE_MODELS_URL = `${CDN}/asset-packs/toon-rts-characters/race-models.json`;

/**
 * @typedef {{
 *   id: string,
 *   short: string,
 *   prefix: string,
 *   label: string,
 *   kitGlb: string,
 *   kitFbx: string,
 *   atlasUrl: string,
 * }} RaceDef
 */

/** @type {Record<string, RaceDef>} */
export const RACES = {
  WK: {
    id: 'WK',
    short: 'human',
    prefix: 'WK_',
    label: 'Western Kingdoms',
    kitGlb: `${CDN}/models/grudge6/races/WK_Characters.glb`,
    kitFbx: `${CDN}/models/grudge6/races/WK_Characters.fbx`,
    atlasUrl: `${CDN}/textures/grudge6/western-kingdoms/WK_Standard_Units.webp`
  },
  ELF: {
    id: 'ELF',
    short: 'elf',
    prefix: 'ELF_',
    label: 'High Elves',
    kitGlb: `${CDN}/models/grudge6/races/ELF_Characters.glb`,
    kitFbx: `${CDN}/models/grudge6/races/ELF_Characters.fbx`,
    atlasUrl: `${CDN}/textures/grudge6/elves/ELF_HighElves_Texture.webp`
  },
  BRB: {
    id: 'BRB',
    short: 'barbarian',
    prefix: 'BRB_',
    label: 'Barbarians',
    kitGlb: `${CDN}/models/grudge6/races/BRB_Characters.glb`,
    kitFbx: `${CDN}/models/grudge6/races/BRB_Characters.fbx`,
    atlasUrl: `${CDN}/textures/grudge6/barbarians/BRB_StandardUnits_texture.webp`
  },
  ORC: {
    id: 'ORC',
    short: 'orc',
    prefix: 'ORC_',
    label: 'Orcs',
    kitGlb: `${CDN}/models/grudge6/races/ORC_Characters.glb`,
    kitFbx: `${CDN}/models/grudge6/races/ORC_Characters.fbx`,
    atlasUrl: `${CDN}/textures/grudge6/orcs/ORC_StandardUnits.webp`
  },
  UD: {
    id: 'UD',
    short: 'undead',
    prefix: 'UD_',
    label: 'Undead',
    kitGlb: `${CDN}/models/grudge6/races/UD_Characters.glb`,
    kitFbx: `${CDN}/models/grudge6/races/UD_Characters.fbx`,
    atlasUrl: `${CDN}/textures/grudge6/undead/UD_Standard_Units.webp`
  },
  DWF: {
    id: 'DWF',
    short: 'dwarf',
    prefix: 'DWF_',
    label: 'Dwarves',
    kitGlb: `${CDN}/models/grudge6/races/DWF_Characters.glb`,
    kitFbx: `${CDN}/models/grudge6/races/DWF_Characters.fbx`,
    atlasUrl: `${CDN}/textures/grudge6/dwarves/DWF_Standard_Units.webp`
  }
};

export const DEFAULT_RACE = 'WK';

export function raceDef(raceId) {
  return RACES[raceId] || RACES[DEFAULT_RACE];
}

export function kitUrlForRace(raceId) {
  return raceDef(raceId).kitGlb;
}

export function atlasUrlForRace(raceId) {
  return raceDef(raceId).atlasUrl;
}

/**
 * Slot/variant loadout → exact mesh names on the kit.
 * Author names: WK_Units_Body_A, WK_Units_head_E, WK_weapon_staff_A, WK_Shield_A, WK_Xtra_quiver
 */
export function loadoutToMeshIds(prefix, loadout = {}) {
  const p = prefix.endsWith('_') ? prefix : `${prefix}_`;
  const ids = [];
  const armor = {
    body: 'Units_Body',
    arms: 'Units_Arms',
    legs: 'Units_Legs',
    head: 'Units_head',
    shoulders: 'Units_shoulderpads'
  };
  for (const [slot, stem] of Object.entries(armor)) {
    const v = loadout[slot];
    if (!v || v === 'none') continue;
    ids.push(`${p}${stem}_${String(v).toUpperCase()}`);
  }
  const weapons = {
    sword: 'weapon_sword',
    axe: 'weapon_axe',
    hammer: 'weapon_hammer',
    spear: 'weapon_spear',
    staff: 'weapon_staff',
    bow: 'weapon_Bow'
  };
  for (const [slot, stem] of Object.entries(weapons)) {
    const v = loadout[slot];
    if (!v || v === 'none') continue;
    if (slot === 'bow' || v === '_default') ids.push(`${p}${stem}`);
    else if (slot === 'spear' && (v === '_default' || v === 'A')) ids.push(`${p}weapon_spear`);
    else ids.push(`${p}${stem}_${String(v).toUpperCase()}`);
  }
  if (loadout.shield && loadout.shield !== 'none') {
    const v = loadout.shield === '_default' ? 'A' : String(loadout.shield).toUpperCase();
    ids.push(`${p}Shield_${v}`);
  }
  if (loadout.quiver && loadout.quiver !== 'none') ids.push(`${p}Xtra_quiver`);
  if (loadout.bag && loadout.bag !== 'none') ids.push(`${p}Xtra_bag`);
  return ids;
}
