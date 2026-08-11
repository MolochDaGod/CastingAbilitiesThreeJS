/**
 * Element → Warlords staff skill migration (mirrors gameopen castingElementSkills).
 * Keep effect ids in sync with vfxCatalog + fleet FleetWeaponSkill cast/travel/impact.
 *
 * Product ELEMENTS (settings.ELEMENTS):
 *   fire · storm · ice · nature · holy · arcane
 *
 * Path-cast ability pools (AbilityManager):
 *   fire→FireAbility · ice→WaterAbility · nature→EarthAbility
 *   storm|holy|arcane→WindAbility
 *
 * HUD labels: ELEMENT_META in settings.js
 */

import { ELEMENT_META, ELEMENTS, abilityKeyForElement } from '../config/settings.js';

/** @typedef {'fire'|'storm'|'ice'|'nature'|'holy'|'arcane'} CastingElement */

/**
 * @typedef {object} ElementPhaseVfx
 * @property {CastingElement} element
 * @property {string} cast
 * @property {string} travel
 * @property {string} impact
 * @property {number} color
 * @property {string} staffWeaponId
 * @property {string} staffLabel
 * @property {string} castClip
 * @property {string} abilityKey  fire|water|earth|wind pool
 */

/** @type {Record<CastingElement, ElementPhaseVfx>} */
export const CASTING_ELEMENT_PHASE_VFX = {
  fire: {
    element: 'fire',
    cast: 'fire_hand',
    travel: 'fireball',
    impact: 'inferno',
    color: 0xff6a1e,
    staffWeaponId: ELEMENT_META.fire?.staffWeaponId || 'staffFire',
    staffLabel: ELEMENT_META.fire?.staffLabel || 'Fire Staff',
    castClip: 'magic/standing 1h cast spell 01',
    abilityKey: 'fire',
    /** Individual gd_orbs projectile for staff normal (slot 1) */
    projectileOrb: 'orb-fire',
    projectileMesh: './models/vfx/orbs/orb-fire.glb',
    chargeMesh: './models/vfx/charge/staff-charge.glb'
  },
  storm: {
    element: 'storm',
    cast: 'arcane_swirl',
    travel: 'chain_lightning',
    impact: 'ice_lightning_burst',
    color: 0x9fdcff,
    staffWeaponId: ELEMENT_META.storm?.staffWeaponId || 'staffStorm',
    staffLabel: ELEMENT_META.storm?.staffLabel || 'Storm Staff',
    castClip: 'magic/standing 1h cast spell 01',
    abilityKey: 'wind',
    projectileOrb: 'orb-storm',
    projectileMesh: './models/vfx/orbs/orb-storm.glb',
    chargeMesh: './models/vfx/charge/staff-charge.glb'
  },
  ice: {
    element: 'ice',
    cast: 'arcane_swirl',
    travel: 'moon_beam',
    impact: 'frost_wave',
    color: 0x5fd6ff,
    staffWeaponId: ELEMENT_META.ice?.staffWeaponId || 'staffIce',
    staffLabel: ELEMENT_META.ice?.staffLabel || 'Ice Staff',
    castClip: 'magic/standing 1h cast spell 01',
    abilityKey: 'water',
    projectileOrb: 'orb-ice',
    projectileMesh: './models/vfx/orbs/orb-ice.glb',
    chargeMesh: './models/vfx/charge/staff-charge.glb'
  },
  nature: {
    element: 'nature',
    cast: 'earth_surge',
    travel: 'earth_surge',
    impact: 'earth_surge',
    color: 0x6bbf4a,
    staffWeaponId: ELEMENT_META.nature?.staffWeaponId || 'staffNature',
    staffLabel: ELEMENT_META.nature?.staffLabel || 'Nature Staff',
    castClip: 'magic/standing 1h cast spell 01',
    abilityKey: 'earth',
    projectileOrb: 'orb-nature',
    projectileMesh: './models/vfx/orbs/orb-nature.glb',
    chargeMesh: './models/vfx/charge/staff-charge.glb'
  },
  holy: {
    element: 'holy',
    cast: 'arcane_swirl',
    travel: 'moon_beam',
    impact: 'moon_beam',
    color: 0xffe08a,
    staffWeaponId: ELEMENT_META.holy?.staffWeaponId || 'staffHoly',
    staffLabel: ELEMENT_META.holy?.staffLabel || 'Holy Staff',
    castClip: 'magic/standing 1h cast spell 01',
    abilityKey: 'wind',
    projectileOrb: 'orb-holy',
    projectileMesh: './models/vfx/orbs/orb-holy.glb',
    chargeMesh: './models/vfx/charge/staff-charge.glb'
  },
  arcane: {
    element: 'arcane',
    cast: 'arcane_swirl',
    travel: 'chain_lightning',
    impact: 'inferno',
    color: 0xb070ff,
    staffWeaponId: ELEMENT_META.arcane?.staffWeaponId || 'staffArcane',
    staffLabel: ELEMENT_META.arcane?.staffLabel || 'Arcane Staff',
    castClip: 'magic/standing 1h cast spell 01',
    abilityKey: 'wind',
    projectileOrb: 'orb-arcane',
    projectileMesh: './models/vfx/orbs/orb-arcane.glb',
    chargeMesh: './models/vfx/charge/staff-charge.glb'
  }
};

/** Legacy product aliases → canonical CastingElement */
const LEGACY_ELEMENT = {
  water: 'ice',
  frost: 'ice',
  earth: 'nature',
  wind: 'storm',
  lightning: 'storm'
};

/** @param {string} element */
export function normalizeElement(element) {
  if (!element) return 'fire';
  if (CASTING_ELEMENT_PHASE_VFX[element]) return element;
  return LEGACY_ELEMENT[element] || element;
}

/** Element id → staff weapon id (equip / catalog). */
export function staffWeaponIdForElement(element) {
  const el = normalizeElement(element);
  return CASTING_ELEMENT_PHASE_VFX[el]?.staffWeaponId || null;
}

/**
 * Arcane skill tree (purple + explosive + storm-like) for Warlords staff.
 * Slots 0–3 = DRC / fleet hotbar.
 */
export const ARCANE_WEAPON_SKILLS = [
  {
    id: 'arcane_bolt',
    weaponId: 'staffArcane',
    slot: 0,
    label: 'Arcane Bolt',
    style: 'spell',
    element: 'arcane',
    animRole: 'cast',
    rangeM: 14,
    cooldown: 1.0,
    castDuration: 0.85,
    staminaCost: 10,
    castEffectId: 'arcane_swirl',
    travelEffectId: 'chain_lightning',
    impactEffectId: 'arcane_swirl',
    attachToHand: true,
    hint: '1 — purple bolt + swirl'
  },
  {
    id: 'arcane_gale',
    weaponId: 'staffArcane',
    slot: 1,
    label: 'Arcane Gale',
    style: 'spell',
    element: 'arcane',
    animRole: 'cast',
    rangeM: 12,
    cooldown: 3.0,
    castDuration: 0.95,
    staminaCost: 14,
    castEffectId: 'arcane_swirl',
    travelEffectId: 'chain_lightning',
    impactEffectId: 'ice_lightning_burst',
    attachToHand: true,
    hint: '2 — storm + purple burst'
  },
  {
    id: 'void_burst',
    weaponId: 'staffArcane',
    slot: 2,
    label: 'Void Burst',
    style: 'spell',
    element: 'arcane',
    animRole: 'cast',
    rangeM: 10,
    cooldown: 6.0,
    castDuration: 1.05,
    staminaCost: 18,
    castEffectId: 'arcane_swirl',
    travelEffectId: 'fireball',
    impactEffectId: 'inferno',
    attachToHand: true,
    hint: '3 — purple explosive'
  },
  {
    id: 'storm_arcane',
    weaponId: 'staffArcane',
    slot: 3,
    label: 'Storm Arcane',
    style: 'spell',
    element: 'arcane',
    animRole: 'cast',
    rangeM: 16,
    cooldown: 12.0,
    castDuration: 1.15,
    staminaCost: 24,
    castEffectId: 'chain_lightning',
    travelEffectId: 'chain_lightning',
    impactEffectId: 'inferno',
    attachToHand: true,
    hint: '4 — storm + detonation'
  }
];

/** Holy skill tree — light bolts / beams. */
export const HOLY_WEAPON_SKILLS = [
  {
    id: 'holy_bolt',
    weaponId: 'staffHoly',
    slot: 0,
    label: 'Holy Bolt',
    style: 'spell',
    element: 'holy',
    animRole: 'cast',
    rangeM: 14,
    cooldown: 1.0,
    castDuration: 0.85,
    staminaCost: 10,
    castEffectId: 'arcane_swirl',
    travelEffectId: 'moon_beam',
    impactEffectId: 'moon_beam',
    attachToHand: true,
    hint: '1 — holy bolt'
  },
  {
    id: 'holy_radiance',
    weaponId: 'staffHoly',
    slot: 1,
    label: 'Radiance',
    style: 'spell',
    element: 'holy',
    animRole: 'cast',
    rangeM: 10,
    cooldown: 3.5,
    castDuration: 0.95,
    staminaCost: 14,
    castEffectId: 'moon_beam',
    travelEffectId: 'moon_beam',
    impactEffectId: 'moon_beam',
    attachToHand: true,
    hint: '2 — radiance AOE'
  },
  {
    id: 'holy_smite',
    weaponId: 'staffHoly',
    slot: 2,
    label: 'Smite',
    style: 'spell',
    element: 'holy',
    animRole: 'cast',
    rangeM: 12,
    cooldown: 6.0,
    castDuration: 1.05,
    staminaCost: 18,
    castEffectId: 'arcane_swirl',
    travelEffectId: 'moon_beam',
    impactEffectId: 'ice_lightning_burst',
    attachToHand: true,
    hint: '3 — smite'
  },
  {
    id: 'holy_judgment',
    weaponId: 'staffHoly',
    slot: 3,
    label: 'Judgment',
    style: 'spell',
    element: 'holy',
    animRole: 'cast',
    rangeM: 16,
    cooldown: 12.0,
    castDuration: 1.15,
    staminaCost: 22,
    castEffectId: 'moon_beam',
    travelEffectId: 'moon_beam',
    impactEffectId: 'inferno',
    attachToHand: true,
    hint: '4 — judgment'
  }
];

/** Element hotbar (4 skills) for a Casting element → Warlords staff kit. */
export function elementHotbarSkills(element) {
  const el = normalizeElement(element);
  const phase = CASTING_ELEMENT_PHASE_VFX[el] || CASTING_ELEMENT_PHASE_VFX.arcane;
  if (el === 'arcane') return ARCANE_WEAPON_SKILLS.slice();
  if (el === 'holy') return HOLY_WEAPON_SKILLS.slice();
  const labels = {
    fire: ['Fire Bolt', 'Flame Wave', 'Meteor Path', 'Inferno'],
    storm: ['Lightning Bolt', 'Chain Lightning', 'Storm Shield', 'Tempest'],
    ice: ['Ice Lash', 'Frost Wave', 'Moon Beam', 'Blizzard Shell'],
    nature: ['Vine Spike', 'Quake Surge', 'Stone Path', "Nature's Fury"]
  };
  const names = labels[el] || labels.fire;
  return names.map((label, slot) => ({
    id: `${el}_skill_${slot}`,
    weaponId: phase.staffWeaponId,
    slot,
    label,
    style: 'spell',
    element: el,
    animRole: 'cast',
    rangeM: [14, 10, 16, 8][slot],
    cooldown: [1.1, 3.0, 6.0, 12.0][slot],
    castDuration: 0.85 + slot * 0.1,
    staminaCost: 12 + slot * 4,
    castEffectId: phase.cast,
    travelEffectId: phase.travel,
    impactEffectId: phase.impact,
    attachToHand: true,
    abilityElement: abilityKeyForElement(el),
    hint: `${slot + 1} — ${label}`
  }));
}

/** All product element trees for export / Warlords seed. */
export function allElementWeaponSkillTrees() {
  /** @type {Record<string, ReturnType<typeof elementHotbarSkills>>} */
  const out = {};
  for (const el of ELEMENTS) {
    out[el] = elementHotbarSkills(el);
  }
  return out;
}
