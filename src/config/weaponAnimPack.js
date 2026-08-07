/**
 * Equipped weapon → Bip001 anim pack + combat role map.
 * SSOT for lab: mesh_ids weapon slot drives locomotion + attack/cast clips.
 *
 * Packs live in assets.js ANIM_PACKS.
 */

/** @typedef {'magic'|'sword_shield'|'longbow'} WeaponAnimPackId */

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
  longbow: 'longbow'
});

/**
 * What one-shot roles each pack owns for combat skills.
 * @type {Record<WeaponAnimPackId, { attack: string, cast: string, block: string, loco: string[] }>}
 */
export const PACK_COMBAT_ROLES = Object.freeze({
  magic: {
    attack: 'cast',
    cast: 'cast',
    block: 'block',
    loco: ['idle', 'walk', 'run', 'jump']
  },
  sword_shield: {
    attack: 'attack',
    cast: 'attack',
    block: 'block',
    loco: ['idle', 'walk', 'run', 'jump']
  },
  longbow: {
    attack: 'attack',
    cast: 'attack',
    block: 'block',
    loco: ['idle', 'walk', 'run', 'jump']
  }
});

/**
 * Resolve active weapon slot from loadout (exclusive).
 * @param {Record<string, string>} loadout
 * @returns {string|null}
 */
export function activeWeaponSlot(loadout = {}) {
  const order = ['staff', 'bow', 'sword', 'axe', 'hammer', 'spear'];
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
  if (presetPack === 'magic' || presetPack === 'sword_shield' || presetPack === 'longbow') {
    return presetPack;
  }
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
  return `${packId}: ${r.attack}/${r.cast} · loco ${r.loco.join('·')}`;
}
