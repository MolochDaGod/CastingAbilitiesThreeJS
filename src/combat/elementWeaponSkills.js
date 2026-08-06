/**
 * Element → Warlords weapon-skill migration (mirrors gameopen castingElementSkills).
 * Keep effect ids in sync with vfxCatalog + fleet FleetWeaponSkill cast/travel/impact.
 *
 * Warlords staffs:
 *   fire → staffFire · water → staffIce · earth → staffNature
 *   wind → staffStorm · arcane → staff (purple explosive + wind shaders)
 */

/** @typedef {'fire'|'water'|'earth'|'wind'|'arcane'} CastingElement */

/**
 * @typedef {object} ElementPhaseVfx
 * @property {CastingElement} element
 * @property {string} cast
 * @property {string} travel
 * @property {string} impact
 * @property {number} color
 * @property {string} staffWeaponId
 * @property {string} castClip
 */

/** @type {Record<CastingElement, ElementPhaseVfx>} */
export const CASTING_ELEMENT_PHASE_VFX = {
  fire: {
    element: 'fire',
    cast: 'fire_hand',
    travel: 'fireball',
    impact: 'inferno',
    color: 0xff6a1e,
    staffWeaponId: 'staffFire',
    castClip: 'magic/standing 1h cast spell 01'
  },
  water: {
    element: 'water',
    cast: 'arcane_swirl',
    travel: 'moon_beam',
    impact: 'frost_wave',
    color: 0x5fd6ff,
    staffWeaponId: 'staffIce',
    castClip: 'magic/standing 1h cast spell 01'
  },
  earth: {
    element: 'earth',
    cast: 'earth_surge',
    travel: 'earth_surge',
    impact: 'earth_surge',
    color: 0xc4a574,
    staffWeaponId: 'staffNature',
    castClip: 'magic/standing 1h cast spell 01'
  },
  wind: {
    element: 'wind',
    cast: 'arcane_swirl',
    travel: 'chain_lightning',
    impact: 'ice_lightning_burst',
    color: 0x9fdcff,
    staffWeaponId: 'staffStorm',
    castClip: 'magic/standing 1h cast spell 01'
  },
  arcane: {
    element: 'arcane',
    cast: 'arcane_swirl',
    travel: 'chain_lightning',
    impact: 'inferno',
    color: 0xb070ff,
    staffWeaponId: 'staff',
    castClip: 'magic/standing 1h cast spell 01'
  }
};

/**
 * Arcane skill tree (purple + explosive + wind-like) for Warlords staff.
 * Slots 0–3 = DRC / fleet hotbar.
 */
export const ARCANE_WEAPON_SKILLS = [
  {
    id: 'arcane_bolt',
    weaponId: 'staff',
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
    weaponId: 'staff',
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
    hint: '2 — wind + purple burst'
  },
  {
    id: 'void_burst',
    weaponId: 'staff',
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
    weaponId: 'staff',
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

/** Element hotbar (4 skills) for a Casting element → Warlords staff kit. */
export function elementHotbarSkills(element) {
  const phase = CASTING_ELEMENT_PHASE_VFX[element] || CASTING_ELEMENT_PHASE_VFX.arcane;
  const labels = {
    fire: ['Fire Bolt', 'Flame Wave', 'Meteor Path', 'Inferno'],
    water: ['Water Lash', 'Frost Wave', 'Moon Beam', 'Blizzard Shell'],
    earth: ['Earth Spike', 'Quake Surge', 'Stone Path', 'Tectonic Burst'],
    wind: ['Wind Bolt', 'Gale Nova', 'Chain Storm', 'Tempest'],
    arcane: ARCANE_WEAPON_SKILLS.map((s) => s.label)
  };
  if (element === 'arcane') return ARCANE_WEAPON_SKILLS.slice();
  const names = labels[element] || labels.arcane;
  return names.map((label, slot) => ({
    id: `${element}_skill_${slot}`,
    weaponId: phase.staffWeaponId,
    slot,
    label,
    style: 'spell',
    element,
    animRole: 'cast',
    rangeM: [14, 10, 16, 8][slot],
    cooldown: [1.1, 3.0, 6.0, 12.0][slot],
    castDuration: 0.85 + slot * 0.1,
    staminaCost: 12 + slot * 4,
    castEffectId: phase.cast,
    travelEffectId: phase.travel,
    impactEffectId: phase.impact,
    attachToHand: true,
    hint: `${slot + 1} — ${label}`
  }));
}

/** All five trees for export / Warlords seed. */
export function allElementWeaponSkillTrees() {
  return {
    fire: elementHotbarSkills('fire'),
    water: elementHotbarSkills('water'),
    earth: elementHotbarSkills('earth'),
    wind: elementHotbarSkills('wind'),
    arcane: elementHotbarSkills('arcane')
  };
}
