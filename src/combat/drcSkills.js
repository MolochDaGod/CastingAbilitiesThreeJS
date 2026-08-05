/**
 * DRC-style weapon skill kit for Casting Abilities sandbox.
 * Shape mirrors fleet FleetWeaponSkill (gameopen CANONICAL_COMBAT) without
 * importing monorepo packages — anim + VFX host is this app's systems.
 *
 * Slots 0–3 → keys 1–4 (combat mode). Elemental skills cast via AbilityManager
 * along a forward curve; melee uses sword_shield attack one-shot.
 */

/** @typedef {'melee'|'spell'|'ranged'} SkillStyle */

/**
 * @typedef {object} DrcWeaponSkill
 * @property {string} id
 * @property {string} label
 * @property {number} slot 0..3
 * @property {SkillStyle} style
 * @property {string} [element] fire|water|earth|wind
 * @property {string} animRole idle|cast|attack|block
 * @property {number} rangeM
 * @property {number} cooldown
 * @property {number} castDuration
 * @property {number} staminaCost
 * @property {string} [castEffectId]
 * @property {string} [impactEffectId]
 * @property {boolean} [attachToHand]
 * @property {string} hint
 */

/** @type {DrcWeaponSkill[]} */
export const DRC_WEAPON_SKILLS = [
  {
    id: 'drc_fire_bolt',
    label: 'Fire Bolt',
    slot: 0,
    style: 'spell',
    element: 'fire',
    animRole: 'cast',
    rangeM: 16,
    cooldown: 1.1,
    castDuration: 0.85,
    staminaCost: 12,
    castEffectId: 'fire_cast',
    impactEffectId: 'fire_impact',
    attachToHand: true,
    hint: '1 — path of fire from hand'
  },
  {
    id: 'drc_water_lash',
    label: 'Water Lash',
    slot: 1,
    style: 'spell',
    element: 'water',
    animRole: 'cast',
    rangeM: 14,
    cooldown: 1.2,
    castDuration: 0.9,
    staminaCost: 12,
    castEffectId: 'water_cast',
    impactEffectId: 'water_impact',
    attachToHand: true,
    hint: '2 — water strike along aim'
  },
  {
    id: 'drc_earth_spike',
    label: 'Earth Spike',
    slot: 2,
    style: 'spell',
    element: 'earth',
    animRole: 'cast',
    rangeM: 12,
    cooldown: 1.4,
    castDuration: 1.0,
    staminaCost: 16,
    castEffectId: 'earth_cast',
    impactEffectId: 'earth_impact',
    attachToHand: true,
    hint: '3 — earth burst path'
  },
  {
    id: 'drc_melee_strike',
    label: 'Blade Strike',
    slot: 3,
    style: 'melee',
    animRole: 'attack',
    rangeM: 2.6,
    cooldown: 0.75,
    castDuration: 0.7,
    staminaCost: 10,
    castEffectId: 'melee_slash',
    impactEffectId: 'melee_hit',
    attachToHand: true,
    hint: '4 / F — sword_shield attack + slash VFX'
  }
];

export function skillBySlot(slot) {
  return DRC_WEAPON_SKILLS.find((s) => s.slot === slot) || null;
}

export function skillById(id) {
  return DRC_WEAPON_SKILLS.find((s) => s.id === id) || null;
}

/**
 * Minimal readiness check (fleet assessWeaponSkillReadiness analogue).
 * @param {DrcWeaponSkill} skill
 */
export function assessSkill(skill) {
  const missing = [];
  if (!skill?.id) missing.push('id');
  if (skill.style === 'spell' && !skill.element) missing.push('element');
  if (!skill.animRole) missing.push('animRole');
  if (!(skill.cooldown >= 0)) missing.push('cooldown');
  return { ok: missing.length === 0, missing };
}
