/**
 * Effect texture / presentation variants — one base texture, many cast looks.
 *
 * Product ask: spells of one texture usable with different size, speed, angle;
 * a second texture for additional usage (e.g. travel vs impact, core vs arc).
 * Does not invent a second VFX engine — multiplies existing prefab knobs.
 *
 * @see effectPrefab.js
 * @see skillshot/linearSettings.js (thunder electric look)
 */

/**
 * @typedef {object} EffectVariant
 * @property {string} id
 * @property {string} label
 * @property {string} textureKey   primary atlas / procedural channel
 * @property {string} [textureAlt] second texture (impact / residual / AOE rim)
 * @property {number} size         SI scale multiplier (1 = base)
 * @property {number} speed        travel / anim speed multiplier
 * @property {number} angleDeg     spawn / fan angle offset (degrees)
 * @property {number} [aoe]        AOE radius metres (overrides base when set)
 * @property {number} [intensity]  0..2
 * @property {string} [color]
 */

/** Electric family — single bolt look, many sizes/speeds/angles. */
export const ELECTRIC_VARIANTS = Object.freeze([
  {
    id: 'arc_bolt',
    label: 'Arc Bolt',
    textureKey: 'electric_core',
    textureAlt: 'electric_branch',
    size: 1.0,
    speed: 1.0,
    angleDeg: 0,
    aoe: 0,
    intensity: 1.0,
    color: '#9fd0ff'
  },
  {
    id: 'arc_wide',
    label: 'Wide Fan',
    textureKey: 'electric_core',
    textureAlt: 'electric_branch',
    size: 1.45,
    speed: 0.85,
    angleDeg: 18,
    aoe: 1.2,
    intensity: 1.15,
    color: '#b8e0ff'
  },
  {
    id: 'arc_fast',
    label: 'Snap Bolt',
    textureKey: 'electric_core',
    textureAlt: 'electric_branch',
    size: 0.72,
    speed: 1.55,
    angleDeg: -8,
    aoe: 0,
    intensity: 0.9,
    color: '#d0f0ff'
  },
  {
    id: 'arc_storm',
    label: 'Storm Field',
    textureKey: 'electric_core',
    textureAlt: 'electric_ground',
    size: 1.8,
    speed: 0.7,
    angleDeg: 0,
    aoe: 4.5,
    intensity: 1.4,
    color: '#7fb4ff'
  }
]);

/** AOE showcase set — zone footprint + rim texture. */
export const AOE_VARIANTS = Object.freeze([
  {
    id: 'aoe_frost',
    label: 'Frost Crown',
    textureKey: 'frost_plate',
    textureAlt: 'frost_rim',
    size: 1.0,
    speed: 1.0,
    angleDeg: 0,
    aoe: 5.0,
    intensity: 1.0,
    color: '#8ee8ff'
  },
  {
    id: 'aoe_meteor',
    label: 'Cinder Ring',
    textureKey: 'ember_core',
    textureAlt: 'scorch_rim',
    size: 1.2,
    speed: 0.9,
    angleDeg: 0,
    aoe: 6.5,
    intensity: 1.25,
    color: '#ff8a3c'
  },
  {
    id: 'aoe_snare',
    label: 'Voltaic Snare',
    textureKey: 'electric_core',
    textureAlt: 'electric_ground',
    size: 0.95,
    speed: 1.1,
    angleDeg: 12,
    aoe: 3.8,
    intensity: 1.1,
    color: '#a98bff'
  },
  {
    id: 'aoe_holy',
    label: 'Light Disk',
    textureKey: 'holy_core',
    textureAlt: 'holy_rim',
    size: 1.1,
    speed: 1.0,
    angleDeg: 0,
    aoe: 4.2,
    intensity: 1.05,
    color: '#ffe9a0'
  }
]);

/**
 * Apply variant multipliers onto a live settings-like block (in place).
 * @param {Record<string, number|string>} block  e.g. settings.thunder
 * @param {EffectVariant} variant
 * @param {{ baseRange?: number, baseSpeed?: number, baseWidth?: number }} [base]
 */
export function applyVariantToBlock(block, variant, base = {}) {
  if (!block || !variant) return block;
  const size = variant.size ?? 1;
  const speed = variant.speed ?? 1;
  if (typeof block.speed === 'number') {
    block.speed = (base.baseSpeed ?? block.speed) * speed;
  }
  if (typeof block.width === 'number') {
    block.width = (base.baseWidth ?? block.width) * size;
  }
  if (typeof block.spread === 'number') {
    block.spread = Math.max(0.02, (block.spread || 0.5) * size);
  }
  if (typeof block.zoneRadius === 'number' && variant.aoe > 0) {
    block.zoneRadius = variant.aoe;
  }
  if (typeof block.range === 'number' && base.baseRange) {
    /* range stays product; size affects body of effect not max range */
  }
  if (variant.color && typeof block.colorCore === 'string') {
    block.colorCore = variant.color;
  }
  if (variant.color && typeof block.color === 'string') {
    block.color = variant.color;
  }
  // Angle: store for launch fan (AbilityManager / LinearSkillBridge read)
  block._variantAngleDeg = variant.angleDeg ?? 0;
  block._variantTexture = variant.textureKey;
  block._variantTextureAlt = variant.textureAlt || null;
  block._variantId = variant.id;
  return block;
}

/**
 * Resolve variant by id from electric + aoe catalogs.
 * @param {string} id
 * @returns {EffectVariant|null}
 */
export function getEffectVariant(id) {
  return (
    ELECTRIC_VARIANTS.find((v) => v.id === id) ||
    AOE_VARIANTS.find((v) => v.id === id) ||
    null
  );
}

/** All showcase variants for lab / editor dropdowns. */
export const ALL_EFFECT_VARIANTS = Object.freeze([
  ...ELECTRIC_VARIANTS,
  ...AOE_VARIANTS
]);
