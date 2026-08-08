/**
 * Creative element presentation recipes — how product ELEMENTS reuse
 * existing Ability pools + VfxDirector primitives (no second engine).
 *
 * Ideas encoded here (ship iteratively):
 *  - Fire volley of micro projectiles + sky meteor shards
 *  - Ice ground-flood (earth move timing) then erupt swallow
 *  - Nature green earth + vine lashes + heal aura
 *  - Storm: narrow fast chain lightning + wind residual; shield on wall
 *  - Arcane purple + void black
 *  - Holy radiance beams
 *  - Cross-shader spikes (earth motion + water/fire/air beauty)
 *
 * Knobs: settings.presentation · deploy: VfxDirector.deployPresentation
 * @see docs/ELEMENT_PRESENTATION_SSOT.md
 */

import { CASTING_ELEMENT_PHASE_VFX, normalizeElement } from './elementWeaponSkills.js';

/**
 * @typedef {'volley'|'meteor'|'groundFlood'|'vineLash'|'shieldAura'|'lightning'|'voidBolt'|'radiance'|'hybridSpike'} PresentationStyle
 */

/**
 * @typedef {object} ElementPresentation
 * @property {string} element
 * @property {PresentationStyle} style
 * @property {string} abilityKey fire|water|earth|wind
 * @property {number} color primary
 * @property {number} [colorB] secondary (void black, leaf green, …)
 * @property {string} castEffectId
 * @property {string} travelEffectId
 * @property {string} impactEffectId
 * @property {boolean} [multiShot]
 * @property {boolean} [meteor]
 * @property {boolean} [groundFlood]
 * @property {boolean} [shield]
 * @property {boolean} [healAura]
 * @property {boolean} [microFirst]
 * @property {boolean} [lightning]
 * @property {boolean} [chain]
 * @property {string} learn note for agents
 */

/** @type {Record<string, ElementPresentation>} */
export const ELEMENT_PRESENTATION = {
  fire: {
    element: 'fire',
    style: 'volley',
    abilityKey: 'fire',
    color: 0xff6a1e,
    colorB: 0xffc14a,
    castEffectId: 'fire_hand',
    travelEffectId: 'fireball',
    impactEffectId: 'inferno',
    multiShot: true,
    meteor: true,
    microFirst: true,
    learn:
      'Volley of small fireballs (cheap) + optional sky meteor shards; not one fat volume only'
  },
  storm: {
    element: 'storm',
    style: 'lightning',
    abilityKey: 'wind',
    color: 0x9fdcff,
    colorB: 0xeef9ff,
    castEffectId: 'arcane_swirl',
    travelEffectId: 'chain_lightning',
    impactEffectId: 'ice_lightning_burst',
    lightning: true,
    chain: true,
    shield: true, // wall / guard only — see deployPresentation pathKind
    learn:
      'Narrow fast electric bolts + chain hops; wind silk residual; WindAbility path; shield on wall'
  },
  ice: {
    element: 'ice',
    style: 'groundFlood',
    abilityKey: 'water',
    color: 0x5fd6ff,
    colorB: 0xb8ecff,
    castEffectId: 'arcane_swirl',
    travelEffectId: 'moon_beam',
    impactEffectId: 'frost_wave',
    groundFlood: true,
    learn:
      'WaterAbility on ground like earth pave, then erupt / frost_wave swallow + knockback feel'
  },
  nature: {
    element: 'nature',
    style: 'vineLash',
    abilityKey: 'earth',
    color: 0x4ecf6a,
    colorB: 0x2d6b3a,
    castEffectId: 'earth_surge',
    travelEffectId: 'earth_surge',
    impactEffectId: 'earth_surge',
    healAura: true,
    learn:
      'Catalog nature school: EarthAbility + RockMaterial (green). Vine lash / earth_surge. No invented trap skills.'
  },
  holy: {
    element: 'holy',
    style: 'radiance',
    abilityKey: 'wind',
    color: 0xffe08a,
    colorB: 0xfff6d8,
    castEffectId: 'moon_beam',
    travelEffectId: 'moon_beam',
    impactEffectId: 'moon_beam',
    healAura: true,
    learn: 'Moon beam radiance + soft heal aura ring'
  },
  arcane: {
    element: 'arcane',
    style: 'voidBolt',
    abilityKey: 'wind',
    color: 0xb070ff,
    colorB: 0x1a0a28,
    castEffectId: 'arcane_swirl',
    travelEffectId: 'chain_lightning',
    impactEffectId: 'inferno',
    multiShot: true,
    microFirst: true,
    learn: 'Purple + void-black textures; micro first bullet then larger void bolts'
  }
};

/**
 * Hybrid spike beauty: earth motion + optional water/fire/air overlay colors.
 * Used when pathCast kind === spikes.
 */
export const HYBRID_SPIKE_OVERLAY = {
  fire: { beauty: 'inferno', color: 0xff6a1e, note: 'magma spikes' },
  ice: { beauty: 'frost_wave', color: 0x5fd6ff, note: 'ice spears' },
  storm: { beauty: 'ice_lightning_burst', color: 0x9fdcff, note: 'air-cut spikes' },
  nature: { beauty: 'earth_surge', color: 0x4ecf6a, note: 'vine spears' },
  holy: { beauty: 'moon_beam', color: 0xffe08a, note: 'light pillars' },
  arcane: { beauty: 'arcane_swirl', color: 0xb070ff, note: 'void spines' }
};

/** @param {string} element */
export function presentationFor(element) {
  const el = normalizeElement(element);
  return ELEMENT_PRESENTATION[el] || ELEMENT_PRESENTATION.fire;
}

/** Phase VFX + presentation merged for skill fire. */
export function presentationPoseVfx(element) {
  const el = normalizeElement(element);
  const phase = CASTING_ELEMENT_PHASE_VFX[el] || CASTING_ELEMENT_PHASE_VFX.fire;
  const pres = presentationFor(el);
  return {
    ...phase,
    ...pres,
    cast: pres.castEffectId || phase.cast,
    travel: pres.travelEffectId || phase.travel,
    impact: pres.impactEffectId || phase.impact
  };
}
