/**
 * Equipped weapon → Bip001 anim pack + combat role map.
 * SSOT for lab: mesh_ids weapon slot drives locomotion + attack/cast clips.
 *
 * Packs live in assets.js ANIM_PACKS.
 * Shared mobility (dodge/roll/slide) lives in combat_mobility — always bound.
 * Role language / families: config/animLibrary.js · docs/ANIM_LIBRARY_SSOT.md
 */

/** @typedef {'magic'|'sword_shield'|'longbow'|'pistol'} WeaponAnimPackId */

/**
 * Weapon inventory slot → anim pack.
 * @type {Record<string, WeaponAnimPackId>}
 */
export const WEAPON_SLOT_TO_PACK = Object.freeze({
  staff: 'magic',
  tome: 'magic',
  sword: 'sword_shield',
  axe: 'sword_shield',
  hammer: 'sword_shield',
  spear: 'sword_shield',
  shield: 'sword_shield',
  bow: 'longbow',
  longbow: 'longbow',
  /** Handgun / T0 pistol — Open baked pistol/* (gunplay spin, draw, whip) */
  pistol: 'pistol',
  gun: 'pistol',
  handgun: 'pistol'
});

/** Shared mobility roles (combat_mobility pack — not weapon-specific). */
export const MOBILITY_ROLES = Object.freeze([
  'dodgeL',
  'dodgeR',
  'dodgeF',
  'dodgeB',
  'rollL',
  'rollR',
  'rollF',
  'rollB',
  'slide',
  'parry',
  'block'
]);

/**
 * What one-shot roles each pack owns for combat skills.
 * Mobility is always layered from combat_mobility (see MOBILITY_ROLES).
 * @type {Record<WeaponAnimPackId, { attack: string, cast: string, block: string, loco: string[], mobility: string[] }>}
 */
export const PACK_COMBAT_ROLES = Object.freeze({
  magic: {
    attack: 'cast',
    cast: 'cast',
    block: 'block',
    loco: ['idle', 'walk', 'run', 'jump'],
    mobility: [...MOBILITY_ROLES]
  },
  sword_shield: {
    /** Light path uses combo roles; finisher uses attack / finisherAir */
    attack: 'attack1',
    cast: 'attack1',
    block: 'block',
    combo: ['attack1', 'attack2', 'attack3'],
    finisher: 'finisher',
    finisherAir: 'finisherAir',
    loco: ['idle', 'walk', 'run', 'jump'],
    mobility: [...MOBILITY_ROLES]
  },
  longbow: {
    attack: 'attack',
    cast: 'attack',
    block: 'block',
    loco: ['idle', 'walk', 'run', 'jump'],
    mobility: [...MOBILITY_ROLES]
  },
  pistol: {
    /** gunplay = spin/flourish fire; cast = drawing-gun */
    attack: 'attack',
    cast: 'draw',
    block: 'block',
    gunplay: 'gunplay',
    spin: 'spin',
    skill: ['skill1', 'skill2', 'skill3', 'skill4', 'skill5'],
    loco: ['idle', 'walk', 'run', 'jump', 'walkL', 'walkR'],
    mobility: [...MOBILITY_ROLES]
  }
});

/**
 * Resolve active weapon slot from loadout (exclusive).
 * @param {Record<string, string>} loadout
 * @returns {string|null}
 */
export function activeWeaponSlot(loadout = {}) {
  const order = ['staff', 'pistol', 'gun', 'bow', 'sword', 'axe', 'hammer', 'spear'];
  for (const s of order) {
    if (loadout[s] && loadout[s] !== 'none') return s;
  }
  return null;
}

/**
 * @param {Record<string, string>} loadout
 * @param {string} [presetPack] fallback from class preset
 * @returns {WeaponAnimPackId}
 */
export function animPackForLoadout(loadout = {}, presetPack) {
  const slot = activeWeaponSlot(loadout);
  if (slot && WEAPON_SLOT_TO_PACK[slot]) return WEAPON_SLOT_TO_PACK[slot];
  if (
    presetPack === 'magic' ||
    presetPack === 'sword_shield' ||
    presetPack === 'longbow' ||
    presetPack === 'pistol'
  ) {
    return presetPack;
  }
  if (presetPack?.includes?.('pistol') || presetPack?.includes?.('gun')) return 'pistol';
  if (presetPack?.includes?.('bow')) return 'longbow';
  if (presetPack?.includes?.('sword') || presetPack?.includes?.('shield')) return 'sword_shield';
  return 'magic';
}

/**
 * Human label for UI.
 * @param {WeaponAnimPackId} packId
 */
export function packCombatBlurb(packId) {
  const r = PACK_COMBAT_ROLES[packId] || PACK_COMBAT_ROLES.magic;
  return `${packId}: ${r.attack}/${r.cast} · loco ${r.loco.join('·')} · mobility dodge/roll/slide`;
}
