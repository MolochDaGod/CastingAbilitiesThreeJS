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
    description: 'Branching lightning arcs.',
    tags: ['lightning', 'chain', 'burst']
  }
]);

/** Alt+key sandbox shortcuts (fleet: never steal bare C/G combat keys). */
export const VFX_SANDBOX_SHORTCUTS = Object.freeze([
  { key: 'V', code: 'KeyV', label: 'Ice Serpent', effectId: 'ice_lightning_burst' },
  { key: 'B', code: 'KeyB', label: 'Moon Beam', effectId: 'moon_beam' },
  { key: 'F', code: 'KeyF', label: 'Frost Wave', effectId: 'frost_wave' },
  { key: 'G', code: 'KeyG', label: 'Aura Ring', effectId: 'fire_aura' },
  { key: 'T', code: 'KeyT', label: 'Earth Surge', effectId: 'earth_surge' },
  { key: 'C', code: 'KeyC', label: 'Fireball', effectId: 'fireball' }
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
  drc_melee_strike: { cast: 'getsuga_slash', travel: null, impact: 'getsuga_slash' }
});
