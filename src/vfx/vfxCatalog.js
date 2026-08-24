/**
 * Fantasy VFX catalog — mirrors https://vfxgrudge.puter.site/
 * Stable effectIds for DRC weapon skill binds (Open vfxEffectCatalog SSOT).
 */

/** @typedef {'fire'|'ice'|'lightning'|'arcane'|'light'|'poison'|'slash'|'earth'} VfxCategory */

/**
 * @typedef {object} VfxCatalogEntry
 * @property {string} id
 * @property {string} name
 * @property {VfxCategory} category
 * @property {number} color
 * @property {string} description
 * @property {string[]} tags
 */

/** @type {readonly VfxCatalogEntry[]} */
export const VFX_CATALOG = Object.freeze([
  {
    id: 'ice_lightning_burst',
    name: 'Ice Serpent',
    category: 'ice',
    color: 0x9fdcff,
    description: 'Frost + lightning impact burst (sandbox V).',
    tags: ['ice', 'lightning', 'burst', 'impact']
  },
  {
    id: 'moon_beam',
    name: 'Moon Beam',
    category: 'light',
    color: 0xd0e8ff,
    description: 'Vertical holy / moon light beam (sandbox B).',
    tags: ['light', 'holy', 'beam']
  },
  {
    id: 'frost_wave',
    name: 'Frost Wave',
    category: 'ice',
    color: 0x9fdcff,
    description: 'Expanding ground frost wave (sandbox F).',
    tags: ['ice', 'wave', 'slam', 'shockwave']
  },
  {
    id: 'fire_aura',
    name: 'Fire Aura',
    category: 'fire',
    color: 0xff5510,
    description: 'Ring of fire around the caster (sandbox G).',
    tags: ['fire', 'aura', 'buff', 'ring']
  },
  {
    id: 'earth_surge',
    name: 'Earth Surge',
    category: 'earth',
    color: 0xc4a574,
    description: 'Ground-read quake surge (sandbox T).',
    tags: ['earth', 'wave', 'slam']
  },
  {
    id: 'nature_whip',
    name: 'Nature Whip',
    category: 'earth',
    color: 0x6bbf4a,
    description: '15 m vine whip from the hand bone · EarthWave rocks · AOE heal flower.',
    tags: ['nature', 'vine', 'whip', 'heal', 'spline']
  },
  {
    id: 'fireball',
    name: 'Fireball',
    category: 'fire',
    color: 0xff6a1e,
    description: 'Classic fire projectile (sandbox C).',
    tags: ['fire', 'projectile', 'bolt']
  },
  {
    id: 'inferno',
    name: 'Inferno Blast',
    category: 'fire',
    color: 0xff6a1e,
    description: 'Wide fire explosion with heat.',
    tags: ['fire', 'aoe', 'blast']
  },
  {
    id: 'arcane_swirl',
    name: 'Arcane Swirl',
    category: 'arcane',
    color: 0xb070ff,
    description: 'Orbiting arcane motes / cast channel.',
    tags: ['arcane', 'swirl', 'channel']
  },
  {
    id: 'getsuga_slash',
    name: 'Getsuga Slash',
    category: 'slash',
    color: 0x7dd3fc,
    description: 'Melee residual slash — attack frames only, not free hotkey.',
    tags: ['slash', 'melee-residual', 'getsuga']
  },
  {
    id: 'fire_hand',
    name: 'Fire Hand',
    category: 'fire',
    color: 0xff6020,
    description: 'Flaming hand cast tell.',
    tags: ['fire', 'hand', 'cast']
  },
  {
    id: 'chain_lightning',
    name: 'Chain Lightning',
    category: 'lightning',
    color: 0x7ec8ff,
    description:
      'Narrow fast electric bolts with chain hops + wind residual (storm presentation).',
    tags: ['lightning', 'chain', 'bolt', 'electric', 'wind', 'narrow', 'fast']
  },
  {
    id: 'lightning_bolt',
    name: 'Lightning Bolt',
    category: 'lightning',
    color: 0xa8e8ff,
    description: 'Single narrow electric projectile — core white, cyan glow, wind trail.',
    tags: ['lightning', 'bolt', 'electric', 'projectile', 'narrow', 'fast']
  },
  // Beautiful linear attack travel effects
  {
    id: 'ice_lance_trail',
    name: 'Ice Lance Trail',
    category: 'ice',
    color: 0x9fdcff,
    description: 'Trailing crystalline shards along lance path.',
    tags: ['ice', 'lance', 'travel', 'trail', 'crystal']
  },
  {
    id: 'ice_lance_shatter',
    name: 'Ice Lance Shatter',
    category: 'ice',
    color: 0x7dd3fc,
    description: 'Crystal shatters on impact with freeze nova.',
    tags: ['ice', 'lance', 'impact', 'shatter', 'freeze']
  },
  {
    id: 'lightning_bolt_arc',
    name: 'Lightning Arc',
    category: 'lightning',
    color: 0xffff00,
    description: 'Branching electric arcs along projectile path.',
    tags: ['lightning', 'bolt', 'travel', 'arc', 'chain']
  },
  {
    id: 'lightning_chain',
    name: 'Lightning Chain',
    category: 'lightning',
    color: 0x7ec8ff,
    description: 'Chain arcs connect to nearby targets on impact.',
    tags: ['lightning', 'impact', 'chain', 'aoe']
  },
  {
    id: 'fire_slash_trail',
    name: 'Fire Slash Trail',
    category: 'fire',
    color: 0xff6a1e,
    description: 'Ember scatter trail along melee weapon arc.',
    tags: ['fire', 'slash', 'melee', 'trail']
  },
  {
    id: 'fire_slash_burn',
    name: 'Fire Slash Burn',
    category: 'fire',
    color: 0xff5510,
    description: 'Ground fire lingers after melee strike.',
    tags: ['fire', 'slash', 'residual', 'burn']
  },
  {
    id: 'earth_spike_trail',
    name: 'Earth Spike Trail',
    category: 'earth',
    color: 0xc4a574,
    description: 'Dust cloud around projectile path.',
    tags: ['earth', 'spike', 'travel', 'dust']
  },
  {
    id: 'earth_spike_erupt',
    name: 'Earth Spike Erupt',
    category: 'earth',
    color: 0xa0825d,
    description: 'Ground eruption and cracks on landing.',
    tags: ['earth', 'spike', 'impact', 'erupt']
  },
  {
    id: 'water_stream_flow',
    name: 'Water Stream Flow',
    category: 'ice',
    color: 0x6ec8ff,
    description: 'Bubble trail flows smoothly along path.',
    tags: ['water', 'stream', 'travel', 'bubble']
  },
  {
    id: 'water_splash',
    name: 'Water Splash',
    category: 'ice',
    color: 0x9fdcff,
    description: 'Radial splash AOE on water impact.',
    tags: ['water', 'impact', 'splash', 'aoe']
  }
]);

/** Alt+key sandbox shortcuts (fleet: never steal bare C/G combat keys). */
export const VFX_SANDBOX_SHORTCUTS = Object.freeze([
  { key: 'V', code: 'KeyV', label: 'Ice Serpent', effectId: 'ice_lightning_burst' },
  { key: 'B', code: 'KeyB', label: 'Moon Beam', effectId: 'moon_beam' },
  { key: 'F', code: 'KeyF', label: 'Frost Wave', effectId: 'frost_wave' },
  { key: 'G', code: 'KeyG', label: 'Aura Ring', effectId: 'fire_aura' },
  { key: 'T', code: 'KeyT', label: 'Earth Surge', effectId: 'earth_surge' },
  { key: 'U', code: 'KeyU', label: 'Nature Whip', effectId: 'nature_whip' },
  { key: 'C', code: 'KeyC', label: 'Fireball', effectId: 'fireball' },
  { key: 'L', code: 'KeyL', label: 'Chain Lightning', effectId: 'chain_lightning' }
]);

const BY_ID = new Map(VFX_CATALOG.map((e) => [e.id, e]));

export function vfxCatalogById(id) {
  return BY_ID.get(id) || null;
}

/** Map elemental ability → primary beauty effectId for layered deploy. */
export const ELEMENT_EFFECT_MAP = Object.freeze({
  fire: { cast: 'fire_hand', impact: 'inferno', path: 'fireball' },
  water: { cast: 'arcane_swirl', impact: 'frost_wave', path: 'moon_beam' },
  earth: { cast: 'earth_surge', impact: 'earth_surge', path: 'earth_surge' },
  wind: { cast: 'arcane_swirl', impact: 'ice_lightning_burst', path: 'chain_lightning' }
});

/** DRC skill id → layered sandbox effectIds */
export const SKILL_VFX_BIND = Object.freeze({
  drc_fire_bolt: { cast: 'fire_hand', travel: 'fireball', impact: 'inferno' },
  drc_water_lash: { cast: 'arcane_swirl', travel: 'moon_beam', impact: 'frost_wave' },
  drc_earth_spike: { cast: 'earth_surge', travel: 'earth_surge', impact: 'earth_surge' },
  drc_wind_tempest: { cast: 'arcane_swirl', travel: 'chain_lightning', impact: 'ice_lightning_burst' },
  drc_melee_strike: { cast: 'getsuga_slash', travel: null, impact: 'getsuga_slash' },
  // Arcane tree (optional)
  arcane_bolt: { cast: 'arcane_swirl', travel: 'chain_lightning', impact: 'arcane_swirl' },
  arcane_gale: { cast: 'arcane_swirl', travel: 'chain_lightning', impact: 'ice_lightning_burst' },
  void_burst: { cast: 'arcane_swirl', travel: 'fireball', impact: 'inferno' },
  storm_arcane: { cast: 'chain_lightning', travel: 'chain_lightning', impact: 'inferno' }
});
