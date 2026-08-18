/**
 * Warlords character SSOT for this lab — matches live deploy:
 *   https://casting-abilities-threejs.vercel.app/
 *
 * Code: toonKitPlay.deployToonPlayKit · ObjectStore loadRaceKit parity
 * Mesh: assets…/toon-rts-characters/glb/characters/{race}.glb ONLY
 * Contract: WARLORDS_PLAY_CONTRACT_VERSION (same as ObjectStore)
 *
 * Do not add races bake / metaverse / FBX play loaders here.
 */

import { sameOriginFleetUrl } from './fleetEnv.js';

export const GRUDGE6_SSOT_VERSION = '2026-08-13.thirty-original';
/** Must match ObjectStore WARLORDS_PLAY_CONTRACT_VERSION */
export const WARLORDS_PLAY_CONTRACT_VERSION = '2026-08-07.harden.1';

/** Live lab that owns Warlords character + ability UX proof */
export const CASTING_LAB_LIVE = 'https://casting.grudge.studio/';
/** Always-on Vercel project URL (alias of same deploy) */
export const CASTING_LAB_VERCEL = 'https://casting-abilities-threejs.vercel.app/';

export const CDN = 'https://assets.grudge-studio.com';
export const CDN_MIRROR_OPEN = 'https://open.grudge-studio.com';
export const HUMAN_HEIGHT_M = 1.8;
export const ANIMS_BAKED = sameOriginFleetUrl(`${CDN}/prod/anims`);
export const GEAR_PRESETS_URL = sameOriginFleetUrl(`${CDN}/api/v1/grudge6-gear-presets.json`);
export const RACE_MODELS_URL = sameOriginFleetUrl(
  `${CDN}/asset-packs/toon-rts-characters/race-models.json`
);
/** Canonical Toon RTS kit directory (race-models.json) */
export const TOON_RTS_GLB_DIR = `${CDN}/asset-packs/toon-rts-characters/glb/characters`;

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

/** Kit child mesh utility + inventory back family (windsurf is external attach) */
export const UTILITY_SLOTS = Object.freeze(['bag', 'wood', 'quiver', 'back']);

/**
 * Equipment slot SSOT (matches info canonical-equipment-pattern + UMMORPG names).
 * Hands use WeaponMeshAttach; back uses BackSlotEquip (deployable vehicle).
 */
export const EQUIPMENT_SLOTS = Object.freeze({
  mainHand: { bone: 'R_hand_container', attach: 'weapon' },
  offHand: { bone: 'L_hand_container', attach: 'weapon' },
  head: { meshIds: true },
  body: { meshIds: true },
  arms: { meshIds: true },
  legs: { meshIds: true },
  back: { bone: 'Bip001 Spine1', attach: 'backSlot', deployable: true },
  relic: { hudOnly: true },
  mount: { controller: 'mount' }
});

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

/** ★ Toon RTS play URL — only play mesh family (human.glb not WK.glb) */
export function toonRtsKitUrl(libraryId) {
  const id = String(libraryId || 'human').toLowerCase();
  return sameOriginFleetUrl(`${TOON_RTS_GLB_DIR}/${id}.glb`);
}

/**
 * @typedef {{
 *   id: string,
 *   short: string,
 *   prefix: string,
 *   label: string,
 *   kitGlb: string,
 *   atlasUrl: string,
 * }} RaceDef
 */

/** PLAY races — Toon RTS kitGlb only (no kitFallback / FBX fields for play). */
/** @type {Record<string, RaceDef>} */
export const RACES = {
  WK: {
    id: 'WK',
    short: 'human',
    prefix: 'WK_',
    label: 'Western Kingdoms',
    kitGlb: toonRtsKitUrl('human'),
    atlasUrl: sameOriginFleetUrl(`${CDN}/textures/grudge6/western-kingdoms/WK_Standard_Units.webp`),
  },
  ELF: {
    id: 'ELF',
    short: 'elf',
    prefix: 'ELF_',
    label: 'High Elves',
    kitGlb: toonRtsKitUrl('elf'),
    atlasUrl: sameOriginFleetUrl(`${CDN}/textures/grudge6/elves/ELF_HighElves_Texture.webp`),
  },
  BRB: {
    id: 'BRB',
    short: 'barbarian',
    prefix: 'BRB_',
    label: 'Barbarians',
    kitGlb: toonRtsKitUrl('barbarian'),
    atlasUrl: sameOriginFleetUrl(`${CDN}/textures/grudge6/barbarians/BRB_StandardUnits_texture.webp`),
  },
  ORC: {
    id: 'ORC',
    short: 'orc',
    prefix: 'ORC_',
    label: 'Orcs',
    kitGlb: toonRtsKitUrl('orc'),
    atlasUrl: sameOriginFleetUrl(`${CDN}/textures/grudge6/orcs/ORC_StandardUnits.webp`),
  },
  UD: {
    id: 'UD',
    short: 'undead',
    prefix: 'UD_',
    label: 'Undead',
    kitGlb: toonRtsKitUrl('undead'),
    atlasUrl: sameOriginFleetUrl(`${CDN}/textures/grudge6/undead/UD_Standard_Units.webp`),
  },
  DWF: {
    id: 'DWF',
    short: 'dwarf',
    prefix: 'DWF_',
    label: 'Dwarves',
    kitGlb: toonRtsKitUrl('dwarf'),
    atlasUrl: sameOriginFleetUrl(`${CDN}/textures/grudge6/dwarves/DWF_Standard_Units.webp`),
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
 * Play candidates = Toon RTS only (short name from raceDef).
 * Do not chain races bake / metaverse — those hide broken Toon loads behind wrong models.
 */
export function kitUrlCandidates(raceId) {
  const def = raceDef(raceId);
  const short = def.short || 'human';
  const primary = def.kitGlb || toonRtsKitUrl(short);
  // Same file under rare alternate keys (legacy docs used race id)
  const alt = toonRtsKitUrl(short);
  return [...new Set([primary, alt].filter(Boolean))];
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

  // Archer quiver is part of the original 30 look. Bag/wood stay carry-only.
  if (loadout.quiver) ids.push(`${p}Xtra_quiver`);
  const allowUtility = loadout.carry === true || loadout.showUtility === true;
  if (allowUtility) {
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
