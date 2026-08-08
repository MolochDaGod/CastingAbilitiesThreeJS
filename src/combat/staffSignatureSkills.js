/**
 * Staff signature elemental skills — Inferno, Blizzard, Warp, Quake, Tempest.
 *
 * One signature per Warlords staff brand (ELEMENT_META staffWeaponId).
 * Bound into castingSpellKit page 2 / ultimate slots and learnable via AI loop.
 *
 * Anim: magic cast · VFX: vfxCatalog · Ability: Fire/Water/Earth/Wind path.
 * @see castingSpellKit.js · docs/PRODUCTION_CONTROLLER_SSOT.md
 */

import { CASTING_ELEMENT_PHASE_VFX } from './elementWeaponSkills.js';

const F = CASTING_ELEMENT_PHASE_VFX.fire;
const W = CASTING_ELEMENT_PHASE_VFX.ice;
const E = CASTING_ELEMENT_PHASE_VFX.nature;
const A = CASTING_ELEMENT_PHASE_VFX.storm;
const R = CASTING_ELEMENT_PHASE_VFX.arcane;
const CAST_CLIP = 'magic/standing 1h cast spell 01';

/**
 * @typedef {import('./castingSpellKit.js').CastingSpell} CastingSpell
 */

/**
 * Signature skills — production names agents should learn first.
 * @type {readonly import('./castingSpellKit.js').CastingSpell[]}
 */
export const STAFF_SIGNATURE_SKILLS = Object.freeze([
  {
    id: 'casting_inferno',
    catalogSkillId: 'staff_inferno',
    label: 'Inferno',
    description: 'Fire Staff signature — dense volumetric fire stream + white-core impact.',
    element: 'fire',
    pathMode: 'stream',
    style: 'spell',
    animRole: 'cast',
    animPack: 'magic',
    castClip: CAST_CLIP,
    abilityClass: 'FireAbility',
    castEffectId: F.cast,
    travelEffectId: F.travel,
    impactEffectId: 'inferno',
    staffWeaponId: F.staffWeaponId,
    rangeM: 18,
    cooldown: 6.5,
    castDuration: 1.15,
    staminaCost: 18,
    manaCost: 22,
    slot: 10,
    slotType: 'ultimate',
    learnFrom: 'FireAbility volume · VolumetricFireMaterial · settings.fire.volumeSteps',
    assets: [
      'src/abilities/FireAbility.js',
      'src/materials/VolumetricFireMaterial.js',
      'vfx:inferno|fireball|fire_hand'
    ]
  },
  {
    id: 'casting_blizzard',
    catalogSkillId: 'staff_blizzard',
    label: 'Blizzard',
    description: 'Ice Staff signature — wide frost AOE place + frost_wave crown.',
    element: 'ice',
    pathMode: 'aoe',
    style: 'spell',
    animRole: 'cast',
    animPack: 'magic',
    castClip: CAST_CLIP,
    abilityClass: 'WaterAbility',
    castEffectId: W.cast,
    travelEffectId: W.travel,
    impactEffectId: 'frost_wave',
    staffWeaponId: W.staffWeaponId,
    rangeM: 12,
    cooldown: 7.0,
    castDuration: 1.1,
    staminaCost: 16,
    manaCost: 24,
    slot: 11,
    slotType: 'ultimate',
    learnFrom: 'WaterAbility surface march · frost_wave · settings.water',
    assets: [
      'src/abilities/WaterAbility.js',
      'src/materials/OceanWaterMaterial.js',
      'vfx:frost_wave|moon_beam'
    ]
  },
  {
    id: 'casting_warp',
    catalogSkillId: 'staff_warp',
    label: 'Warp',
    description: 'Arcane signature — short blink stream + arcane impact (void displacement).',
    element: 'arcane',
    pathMode: 'stream',
    style: 'spell',
    animRole: 'cast',
    animPack: 'magic',
    castClip: CAST_CLIP,
    abilityClass: 'arcane',
    castEffectId: R.cast,
    travelEffectId: 'chain_lightning',
    impactEffectId: 'arcane_swirl',
    staffWeaponId: R.staffWeaponId,
    rangeM: 10,
    cooldown: 5.5,
    castDuration: 0.7,
    staminaCost: 14,
    manaCost: 20,
    slot: 12,
    slotType: 'ultimate',
    learnFrom: 'arcane phase VFX · short path blink feel · distortion optional',
    assets: [
      'src/combat/elementWeaponSkills.js#arcane',
      'vfx:arcane_swirl|chain_lightning',
      'src/postprocessing/DistortionShader.js'
    ]
  },
  {
    id: 'casting_quake',
    catalogSkillId: 'staff_quake',
    label: 'Quake',
    description: 'Nature Staff signature — earth wall/spikes along path + tower impact.',
    element: 'nature',
    pathMode: 'wall',
    style: 'spell',
    animRole: 'cast',
    animPack: 'magic',
    castClip: CAST_CLIP,
    abilityClass: 'EarthAbility',
    castEffectId: E.cast,
    travelEffectId: E.travel,
    impactEffectId: 'earth_surge',
    staffWeaponId: E.staffWeaponId,
    rangeM: 14,
    cooldown: 7.5,
    castDuration: 1.2,
    staminaCost: 20,
    manaCost: 22,
    slot: 13,
    slotType: 'ultimate',
    learnFrom: 'EarthAbility pave + fracture · settings.earth crust/tower',
    assets: [
      'src/abilities/EarthAbility.js',
      'src/materials/RockMaterial.js',
      'vfx:earth_surge'
    ]
  },
  {
    id: 'casting_tempest',
    catalogSkillId: 'staff_tempest',
    label: 'Tempest',
    description: 'Storm Staff signature — long wind stream + lightning burst impact.',
    element: 'storm',
    pathMode: 'stream',
    style: 'spell',
    animRole: 'cast',
    animPack: 'magic',
    castClip: CAST_CLIP,
    abilityClass: 'WindAbility',
    castEffectId: A.cast,
    travelEffectId: A.travel,
    impactEffectId: 'ice_lightning_burst',
    staffWeaponId: A.staffWeaponId,
    rangeM: 16,
    cooldown: 6.0,
    castDuration: 1.0,
    staminaCost: 16,
    manaCost: 20,
    slot: 14,
    slotType: 'ultimate',
    learnFrom: 'WindAbility silk sheets · residual after cast · ice_lightning_burst',
    assets: [
      'src/abilities/WindAbility.js',
      'src/materials/WindMaterial.js',
      'vfx:ice_lightning_burst|chain_lightning'
    ]
  }
]);

/** staffWeaponId → signature skill */
export const SIGNATURE_BY_STAFF = Object.freeze(
  Object.fromEntries(STAFF_SIGNATURE_SKILLS.map((s) => [s.staffWeaponId, s]))
);

/** element → signature */
export const SIGNATURE_BY_ELEMENT = Object.freeze(
  Object.fromEntries(STAFF_SIGNATURE_SKILLS.map((s) => [s.element, s]))
);

/**
 * @param {string} element fire|water|earth|wind|arcane
 */
export function signatureForElement(element) {
  return SIGNATURE_BY_ELEMENT[element] || null;
}

/**
 * @param {string} staffWeaponId staffFire|staffIce|…
 */
export function signatureForStaff(staffWeaponId) {
  return SIGNATURE_BY_STAFF[staffWeaponId] || null;
}
