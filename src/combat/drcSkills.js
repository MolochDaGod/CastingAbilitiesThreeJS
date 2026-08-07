/**
 * DRC weapon skills — fleet-shaped (FleetWeaponSkill) for Warlords migration.
 * Elements fire/water/earth/wind use Casting path ability + cast/travel/impact VFX.
 * Slot 3 can be blade residual OR arcane ultimate (see ARCANE tree).
 *
 * @see elementWeaponSkills.js · gameopen castingElementSkills.ts
 */

import { ARCANE_WEAPON_SKILLS, CASTING_ELEMENT_PHASE_VFX } from './elementWeaponSkills.js';

/** @typedef {'melee'|'spell'|'ranged'} SkillStyle */

/**
 * @typedef {object} DrcWeaponSkill
 * @property {string} id
 * @property {string} label
 * @property {number} slot 0..3
 * @property {SkillStyle} style
 * @property {string} [element] fire|water|earth|wind|arcane
 * @property {string} animRole idle|cast|attack|block
 * @property {number} rangeM
 * @property {number} cooldown
 * @property {number} castDuration
 * @property {number} staminaCost
 * @property {string} [castEffectId]
 * @property {string} [impactEffectId]
 * @property {string} [travelEffectId]
 * @property {boolean} [attachToHand]
 * @property {string} hint
 */

const F = CASTING_ELEMENT_PHASE_VFX.fire;
const W = CASTING_ELEMENT_PHASE_VFX.water;
const E = CASTING_ELEMENT_PHASE_VFX.earth;
const A = CASTING_ELEMENT_PHASE_VFX.wind;

/**
 * Melee residual (Getsuga-class) — F strike / attack frame.
 * Not a free hotkey; not Space. Profile knobs: settings.residual.
 * Open SSOT: meleeStrikeFx.ts · MELEE_SLASH_FX.md
 */
/** @type {DrcWeaponSkill} */
export const DRC_MELEE_STRIKE = {
  id: 'drc_melee_strike',
  label: 'Blade Residual',
  slot: -1, // F key — not digit bar
  style: 'melee',
  animRole: 'attack',
  rangeM: 3.2,
  cooldown: 0.55,
  castDuration: 0.45,
  staminaCost: 8,
  castEffectId: 'getsuga_slash',
  impactEffectId: 'getsuga_slash',
  attachToHand: true,
  weaponId: 'sword',
  hint: 'F — attack anim + residual from weapon tip (edit settings.residual)'
};

/** Default combat bar: 3 elements + wind ultimate (classic DRC digits). F = melee residual. */
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
    castEffectId: F.cast,
    travelEffectId: F.travel,
    impactEffectId: F.impact,
    attachToHand: true,
    weaponId: F.staffWeaponId,
    hint: '1 — fire cast/travel/impact → Warlords staffFire'
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
    castEffectId: W.cast,
    travelEffectId: W.travel,
    impactEffectId: W.impact,
    attachToHand: true,
    weaponId: W.staffWeaponId,
    hint: '2 — frost path → Warlords staffIce'
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
    castEffectId: E.cast,
    travelEffectId: E.travel,
    impactEffectId: E.impact,
    attachToHand: true,
    weaponId: E.staffWeaponId,
    hint: '3 — earth surge → Warlords staffNature'
  },
  {
    id: 'drc_wind_tempest',
    label: 'Wind Tempest',
    slot: 3,
    style: 'spell',
    element: 'wind',
    animRole: 'cast',
    rangeM: 14,
    cooldown: 2.5,
    castDuration: 0.95,
    staminaCost: 14,
    castEffectId: A.cast,
    travelEffectId: A.travel,
    impactEffectId: A.impact,
    attachToHand: true,
    weaponId: A.staffWeaponId,
    hint: '4 — wind/lightning → Warlords staffStorm'
  }
];

/** Purple arcane tree (optional bar: ?arcane=1 or setActiveSkillTree('arcane')). */
export const DRC_ARCANE_SKILLS = ARCANE_WEAPON_SKILLS;

/** Active hotbar (default elemental; swap to arcane for staff tree preview). */
let _activeTree = 'elements';

export function setActiveSkillTree(tree) {
  _activeTree = tree === 'arcane' ? 'arcane' : 'elements';
}

export function getActiveSkills() {
  return _activeTree === 'arcane' ? DRC_ARCANE_SKILLS : DRC_WEAPON_SKILLS;
}

export function skillBySlot(slot) {
  return getActiveSkills().find((s) => s.slot === slot) || null;
}

export function skillById(id) {
  if (id === DRC_MELEE_STRIKE.id) return DRC_MELEE_STRIKE;
  return (
    DRC_WEAPON_SKILLS.find((s) => s.id === id) ||
    DRC_ARCANE_SKILLS.find((s) => s.id === id) ||
    null
  );
}

/** F-key / light attack residual skill (always available in combat). */
export function getMeleeStrikeSkill() {
  return DRC_MELEE_STRIKE;
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
