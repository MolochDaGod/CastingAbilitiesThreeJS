/**
 * grudge6 STONE SSOT — CastingAbilities + Multiverse parity.
 *
 * ★ PLAY MESH only (browser):
 *   assets.grudge-studio.com/asset-packs/toon-rts-characters/glb/characters/{race}.glb
 *
 * Atlas: textures/grudge6/{folder}/*.webp (optional rebind; Toon keeps embeds)
 * Anims: open.grudge-studio.com/anims/baked/*
 *
 * NOT play defaults (keep on CDN for lab/author, do not load as player):
 *   models/grudge6/races/*_Characters.glb | .fbx | metaverse/*
 */

export const GRUDGE6_SSOT_VERSION = '2026-08-07.2-head-feet-fix';

export const CDN = 'https://assets.grudge-studio.com';
export const CDN_MIRROR_OPEN = 'https://open.grudge-studio.com';
export const HUMAN_HEIGHT_M = 1.8;
export const ANIMS_BAKED = `${CDN_MIRROR_OPEN}/anims/baked`;
export const GEAR_PRESETS_URL = `${CDN}/api/v1/grudge6-gear-presets.json`;
export const RACE_MODELS_URL = `${CDN}/asset-packs/toon-rts-characters/race-models.json`;

export const BIP001_CORE_BONES = Object.freeze([
  'Bip001 Pelvis',
  'Bip001 Spine',
  'Bip001 Neck',
  'Bip001 Head',
  'Bip001 L Clavicle',
  'Bip001 L UpperArm',
  'Bip001 L Forearm',
  'Bip001 L Hand',
  'Bip001 R Clavicle',
  'Bip001 R UpperArm',
  'Bip001 R Forearm',
  'Bip001 R Hand',
  'Bip001 L Thigh',
  'Bip001 L Calf',
  'Bip001 L Foot',
  'Bip001 R Thigh',
  'Bip001 R Calf',
  'Bip001 R Foot',
]);

export const BIP001_BONE_COUNT = BIP001_CORE_BONES.length;

export const UTILITY_SLOTS = Object.freeze(['bag', 'wood', 'quiver']);

export function normalizeBoneKey(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

export function validateBip001Bones(root) {
  const byKey = new Map();
  const actualNames = [];
  root.traverse((n) => {
    const name = n.name || '';
    if (!name) return;
    const isBone = n.isBone === true || n.type === 'Bone';
    if (!isBone && !/^bip001/i.test(name)) return;
    actualNames.push(name);
    const k = normalizeBoneKey(name);
    if (!byKey.has(k)) byKey.set(k, name);
  });

  const found = [];
  const missing = [];
  for (const want of BIP001_CORE_BONES) {
    const hit = byKey.get(normalizeBoneKey(want));
    if (hit) found.push(hit);
    else missing.push(want);
  }

  return {
    ok: missing.length === 0 && found.length >= BIP001_BONE_COUNT,
    found,
    missing,
    count: found.length,
    expected: BIP001_BONE_COUNT,
    boneNodes: actualNames.length,
    sampleNames: actualNames.slice(0, 8),
  };
}

/** ★ Toon RTS play URL */
export function toonRtsKitUrl(libraryId) {
  return `${CDN}/asset-packs/toon-rts-characters/glb/characters/${libraryId}.glb`;
}

export function legacyRaceKitUrl(prefixFile) {
  return `${CDN}/models/grudge6/races/${prefixFile}`;
}

/**
 * @typedef {{
 *   id: string,
 *   short: string,
 *   prefix: string,
 *   label: string,
 *   kitGlb: string,
 *   kitFallback: string,
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
    kitGlb: toonRtsKitUrl('human'),
    kitFallback: legacyRaceKitUrl('WK_Characters.glb'),
    kitFbx: `${CDN}/models/grudge6/races/WK_Characters.fbx`,
    atlasUrl: `${CDN}/textures/grudge6/western-kingdoms/WK_Standard_Units.webp`,
  },
  ELF: {
    id: 'ELF',
    short: 'elf',
    prefix: 'ELF_',
    label: 'High Elves',
    kitGlb: toonRtsKitUrl('elf'),
    kitFallback: legacyRaceKitUrl('ELF_Characters.glb'),
    kitFbx: `${CDN}/models/grudge6/races/ELF_Characters.fbx`,
    atlasUrl: `${CDN}/textures/grudge6/elves/ELF_HighElves_Texture.webp`,
  },
  BRB: {
    id: 'BRB',
    short: 'barbarian',
    prefix: 'BRB_',
    label: 'Barbarians',
    kitGlb: toonRtsKitUrl('barbarian'),
    kitFallback: legacyRaceKitUrl('BRB_Characters.glb'),
    kitFbx: `${CDN}/models/grudge6/races/BRB_Characters.fbx`,
    atlasUrl: `${CDN}/textures/grudge6/barbarians/BRB_StandardUnits_texture.webp`,
  },
  ORC: {
    id: 'ORC',
    short: 'orc',
    prefix: 'ORC_',
    label: 'Orcs',
    kitGlb: toonRtsKitUrl('orc'),
    kitFallback: legacyRaceKitUrl('ORC_Characters.glb'),
    kitFbx: `${CDN}/models/grudge6/races/ORC_Characters.fbx`,
    atlasUrl: `${CDN}/textures/grudge6/orcs/ORC_StandardUnits.webp`,
  },
  UD: {
    id: 'UD',
    short: 'undead',
    prefix: 'UD_',
    label: 'Undead',
    kitGlb: toonRtsKitUrl('undead'),
    kitFallback: legacyRaceKitUrl('UD_Characters.glb'),
    kitFbx: `${CDN}/models/grudge6/races/UD_Characters.fbx`,
    atlasUrl: `${CDN}/textures/grudge6/undead/UD_Standard_Units.webp`,
  },
  DWF: {
    id: 'DWF',
    short: 'dwarf',
    prefix: 'DWF_',
    label: 'Dwarves',
    kitGlb: toonRtsKitUrl('dwarf'),
    kitFallback: legacyRaceKitUrl('DWF_Characters.glb'),
    kitFbx: `${CDN}/models/grudge6/races/DWF_Characters.fbx`,
    atlasUrl: `${CDN}/textures/grudge6/dwarves/DWF_Standard_Units.webp`,
  },
};

export const DEFAULT_RACE = 'WK';

export function raceDef(raceId) {
  return RACES[raceId] || RACES[DEFAULT_RACE];
}

export function kitUrlForRace(raceId) {
  return raceDef(raceId).kitGlb;
}

/**
 * Play candidates = Toon RTS only.
 * Do not chain races bake / metaverse — those hide broken Toon loads behind wrong models.
 */
export function kitUrlCandidates(raceId) {
  return [kitUrlForRace(raceId)].filter(Boolean);
}

export function atlasUrlForRace(raceId) {
  return raceDef(raceId).atlasUrl;
}

export function isToonRtsKitUrl(url) {
  return /asset-packs\/toon-rts-characters\/glb\/characters\/[a-z]+\.glb/i.test(String(url || ''));
}

/**
 * Slot/variant loadout → mesh names on Toon RTS kits.
 * Author: WK_Units_Body_A · WK_Units_sword_A · WK_Units_Staff_A · WK_Shield_A
 * Also accept weapon_ prefix from older bakes.
 */
export function loadoutToMeshIds(prefix, loadout = {}) {
  const p = prefix.endsWith('_') ? prefix : `${prefix}_`;
  const ids = [];
  const letter = (v) => String(v || 'A').toUpperCase();

  // Armor
  const armor = {
    body: 'Units_Body',
    arms: 'Units_Arms',
    legs: 'Units_Legs',
    head: 'Units_head',
    shoulders: 'Units_shoulderpads',
  };
  for (const [slot, stem] of Object.entries(armor)) {
    const v = loadout[slot];
    if (!v || v === 'none') continue;
    ids.push(`${p}${stem}_${letter(v)}`);
  }

  // Weapons — push both Toon author and weapon_ forms; exclusive equip picks best
  const addWeapon = (stemToon, stemLegacy, v) => {
    if (!v || v === 'none') return;
    if (v === '_default') {
      ids.push(`${p}${stemToon}`);
      ids.push(`${p}${stemLegacy}`);
      return;
    }
    const L = letter(v);
    ids.push(`${p}${stemToon}_${L}`);
    ids.push(`${p}${stemLegacy}_${L}`);
    // BRB sometimes omits Units_
    ids.push(`${p}${stemToon.replace(/^Units_/, '')}_${L}`);
  };

  if (loadout.sword) addWeapon('Units_sword', 'weapon_sword', loadout.sword);
  if (loadout.axe) addWeapon('Units_axe', 'weapon_axe', loadout.axe);
  if (loadout.hammer) addWeapon('Units_hammer', 'weapon_hammer', loadout.hammer);
  if (loadout.spear) addWeapon('Units_spear', 'weapon_spear', loadout.spear);
  if (loadout.staff) {
    addWeapon('Units_Staff', 'weapon_staff', loadout.staff);
    addWeapon('Units_staff', 'weapon_staff', loadout.staff);
  }
  if (loadout.bow) {
    ids.push(`${p}Units_Bow`);
    ids.push(`${p}weapon_Bow`);
    ids.push(`${p}Bow`);
  }
  if (loadout.shield && loadout.shield !== 'none') {
    const L = loadout.shield === '_default' ? 'A' : letter(loadout.shield);
    ids.push(`${p}Shield_${L}`);
    ids.push(`${p}Units_Shield_${L}`);
  }

  // Utility only when carry
  const allowUtility = loadout.carry === true || loadout.showUtility === true;
  if (allowUtility) {
    if (loadout.quiver) ids.push(`${p}Xtra_quiver`);
    if (loadout.bag) ids.push(`${p}Xtra_bag`);
    if (loadout.wood) ids.push(`${p}Xtra_wood`);
  }

  return [...new Set(ids)];
}

export function logSSOT() {
  console.info(
    `[grudge6SSOT ${GRUDGE6_SSOT_VERSION}] play=ToonRTS★ CDN=${CDN} ` +
      `human=${HUMAN_HEIGHT_M}m anims=${ANIMS_BAKED}`,
  );
}
