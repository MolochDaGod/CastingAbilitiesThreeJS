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
  },
  {
    id: 'aoe_glacier',
    label: 'Glacier Plate',
    textureKey: 'frost_plate',
    textureAlt: 'earth_rim',
    size: 1.35,
    speed: 0.8,
    angleDeg: 0,
    aoe: 5.8,
    intensity: 1.2,
    color: '#9fd4c4'
  }
]);

/** Fire / ice / holy line casts — same knobs as electric (size · speed · color · angle). */
export const LINE_CAST_VARIANTS = Object.freeze([
  {
    id: 'fire_bolt',
    label: 'Fire bolt',
    textureKey: 'ember_core',
    textureAlt: 'ember_flare',
    size: 1.0,
    speed: 1.0,
    angleDeg: 0,
    aoe: 0,
    intensity: 1.0,
    color: '#ff6a22'
  },
  {
    id: 'fire_fast',
    label: 'Fire snap',
    textureKey: 'ember_core',
    size: 0.72,
    speed: 1.5,
    angleDeg: -6,
    intensity: 0.95,
    color: '#ffb02e'
  },
  {
    id: 'ice_bolt',
    label: 'Ice bolt',
    textureKey: 'frost_plate',
    size: 1.0,
    speed: 1.0,
    angleDeg: 0,
    intensity: 1.0,
    color: '#8ee8ff'
  },
  {
    id: 'ice_fast',
    label: 'Ice snap',
    textureKey: 'frost_plate',
    size: 0.75,
    speed: 1.45,
    angleDeg: 8,
    intensity: 0.9,
    color: '#d8f6ff'
  },
  {
    id: 'holy_beam',
    label: 'Holy beam',
    textureKey: 'holy_core',
    textureAlt: 'holy_rim',
    size: 1.0,
    speed: 1.0,
    angleDeg: 0,
    intensity: 1.05,
    color: '#ffe9a0'
  },
  {
    id: 'holy_wide',
    label: 'Holy fan',
    textureKey: 'holy_core',
    size: 1.4,
    speed: 0.88,
    angleDeg: 14,
    aoe: 1.6,
    intensity: 1.15,
    color: '#fff6d8'
  },
  {
    id: 'nature_bolt',
    label: 'Nature bolt',
    textureKey: 'frost_plate',
    textureAlt: 'earth_rim',
    size: 1.0,
    speed: 1.05,
    angleDeg: 0,
    intensity: 1.0,
    color: '#7fe06b'
  },
  {
    id: 'nature_fast',
    label: 'Nature snap',
    textureKey: 'frost_plate',
    size: 0.7,
    speed: 1.5,
    angleDeg: -7,
    intensity: 0.92,
    color: '#b8f0a0'
  },
  {
    id: 'arcane_bolt',
    label: 'Arcane bolt',
    textureKey: 'electric_core',
    textureAlt: 'electric_branch',
    size: 0.95,
    speed: 1.12,
    angleDeg: 0,
    intensity: 1.05,
    color: '#b06bff'
  },
  {
    id: 'arcane_fast',
    label: 'Arcane snap',
    textureKey: 'electric_core',
    size: 0.68,
    speed: 1.6,
    angleDeg: 10,
    intensity: 0.95,
    color: '#d4b0ff'
  },
  {
    id: 'shadow_bolt',
    label: 'Shadow bolt',
    textureKey: 'electric_core',
    size: 1.05,
    speed: 0.92,
    angleDeg: 0,
    intensity: 1.1,
    color: '#9a5cff'
  },
  {
    id: 'holy_fast',
    label: 'Holy snap',
    textureKey: 'holy_core',
    size: 0.7,
    speed: 1.55,
    angleDeg: -5,
    intensity: 0.95,
    color: '#fff6d8'
  },
  {
    id: 'nature_wide',
    label: 'Nature fan',
    textureKey: 'frost_plate',
    textureAlt: 'earth_rim',
    size: 1.35,
    speed: 0.88,
    angleDeg: 16,
    aoe: 1.8,
    intensity: 1.15,
    color: '#5cb86a'
  },
  {
    id: 'shadow_fast',
    label: 'Shadow snap',
    textureKey: 'electric_core',
    size: 0.66,
    speed: 1.62,
    angleDeg: 9,
    intensity: 0.92,
    color: '#c4a0ff'
  }
]);

/**
 * Bend / spline travel — same knobs, curved path (verduror mist, vines, poison arc).
 * Used when play class travelMode is `bend` (not a second VFX engine).
 */
export const BEND_CAST_VARIANTS = Object.freeze([
  {
    id: 'fire_curve',
    label: 'Fire curve',
    textureKey: 'ember_core',
    textureAlt: 'ember_flare',
    size: 1.1,
    speed: 0.82,
    angleDeg: 22,
    aoe: 1.4,
    intensity: 1.15,
    color: '#ff6a22'
  },
  {
    id: 'frost_curve',
    label: 'Frost curve',
    textureKey: 'frost_plate',
    textureAlt: 'frost_rim',
    size: 1.15,
    speed: 0.78,
    angleDeg: -18,
    aoe: 1.6,
    intensity: 1.1,
    color: '#8ee8ff'
  },
  {
    id: 'nature_vine',
    label: 'Vine whip',
    textureKey: 'frost_plate',
    textureAlt: 'earth_rim',
    size: 1.25,
    speed: 0.7,
    angleDeg: 28,
    aoe: 2.2,
    intensity: 1.2,
    color: '#5cb86a'
  },
  {
    id: 'jade_mist',
    label: 'Jade mist',
    textureKey: 'frost_plate',
    textureAlt: 'holy_rim',
    size: 1.45,
    speed: 0.55,
    angleDeg: 0,
    aoe: 3.6,
    intensity: 1.25,
    color: '#34d399'
  },
  {
    id: 'poison_arc',
    label: 'Poison arc',
    textureKey: 'electric_core',
    textureAlt: 'earth_rim',
    size: 1.05,
    speed: 0.88,
    angleDeg: 16,
    aoe: 1.8,
    intensity: 1.05,
    color: '#86efac'
  },
  {
    id: 'storm_ribbon',
    label: 'Storm ribbon',
    textureKey: 'electric_core',
    textureAlt: 'electric_branch',
    size: 1.2,
    speed: 0.9,
    angleDeg: -24,
    aoe: 2.0,
    intensity: 1.2,
    color: '#9fd0ff'
  },
  {
    id: 'holy_curve',
    label: 'Holy curve',
    textureKey: 'holy_core',
    textureAlt: 'holy_rim',
    size: 1.15,
    speed: 0.8,
    angleDeg: 12,
    aoe: 2.4,
    intensity: 1.1,
    color: '#ffe9a0'
  },
  {
    id: 'arcane_curve',
    label: 'Arcane curve',
    textureKey: 'electric_core',
    textureAlt: 'electric_branch',
    size: 1.12,
    speed: 0.86,
    angleDeg: -20,
    aoe: 1.7,
    intensity: 1.15,
    color: '#b06bff'
  },
  {
    id: 'shadow_curve',
    label: 'Shadow curve',
    textureKey: 'electric_core',
    size: 1.18,
    speed: 0.74,
    angleDeg: 26,
    aoe: 2.0,
    intensity: 1.2,
    color: '#6b3dff'
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
  if (!block._variantBase) {
    block._variantBase = {
      speed: block.speed,
      width: block.width,
      spread: block.spread,
      zoneRadius: block.zoneRadius,
      color: block.color,
      colorCore: block.colorCore
    };
  }
  const snap = block._variantBase;
  const size = variant.size ?? 1;
  const speed = variant.speed ?? 1;
  const baseSpeed = base.baseSpeed ?? snap.speed;
  const baseWidth = base.baseWidth ?? snap.width;
  if (typeof snap.speed === 'number') block.speed = baseSpeed * speed;
  if (typeof snap.width === 'number') block.width = baseWidth * size;
  if (typeof snap.spread === 'number') {
    block.spread = Math.max(0.02, snap.spread * size);
  }
  if (typeof snap.zoneRadius === 'number' && variant.aoe > 0) {
    block.zoneRadius = variant.aoe;
  }
  if (variant.color && typeof snap.colorCore === 'string') {
    block.colorCore = variant.color;
  }
  if (variant.color && typeof snap.color === 'string') {
    block.color = variant.color;
  }
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
    LINE_CAST_VARIANTS.find((v) => v.id === id) ||
    BEND_CAST_VARIANTS.find((v) => v.id === id) ||
    FIRE_TRAIL_VARIANTS.find((v) => v.id === id) ||
    AIR_TRAIL_VARIANTS.find((v) => v.id === id) ||
    null
  );
}

/** Default live variant per product element + path mode. */
export function variantIdForElement(el, pathMode = 'stream') {
  const aoe = pathMode === 'aoe' || pathMode === 'spikes';
  const bend = pathMode === 'stream' && (el === 'nature' || el === 'poison');
  return variantHintForElement(el, { aoe, bend });
}

/** Pick a saved fire/air trail by use (dash · jump2 · slash · arrow · splash). */
export function trailVariantForUse(use, element = 'wind') {
  const list = element === 'fire' ? FIRE_TRAIL_VARIANTS : AIR_TRAIL_VARIANTS;
  return list.find((v) => v.use === use) || list[0] || null;
}

/** All showcase variants for lab / editor dropdowns. */
/**
 * Fire bending trail saves — same FireAbility / PathTrail knobs, many colors + lengths.
 * Uses: tail (arrows) · slash (projectile slash) · splash (impact) · dash.
 */
export const FIRE_TRAIL_VARIANTS = Object.freeze([
  {
    id: 'fire_ember_short',
    label: 'Ember short',
    textureKey: 'fire_core',
    use: 'tail',
    size: 0.72,
    speed: 1.15,
    angleDeg: 0,
    length: 1.4,
    color: '#ff6a22',
    meshId: 'slashred'
  },
  {
    id: 'fire_core_mid',
    label: 'Core mid',
    textureKey: 'fire_core',
    use: 'tail',
    size: 1.0,
    speed: 1.0,
    angleDeg: 0,
    length: 2.6,
    color: '#ffb02e',
    meshId: 'orb-fire'
  },
  {
    id: 'fire_flare_long',
    label: 'Flare long',
    textureKey: 'fire_flare',
    use: 'tail',
    size: 1.25,
    speed: 0.9,
    angleDeg: 0,
    length: 4.8,
    color: '#fff6d8',
    meshId: 'orb-flare'
  },
  {
    id: 'fire_gold_slash',
    label: 'Gold slash',
    textureKey: 'fire_core',
    use: 'slash',
    size: 1.1,
    speed: 1.05,
    angleDeg: 8,
    length: 3.2,
    color: '#ffcc44',
    meshId: 'slashyellow'
  },
  {
    id: 'fire_blue_arrow',
    label: 'Blue fire arrow',
    textureKey: 'fire_core',
    use: 'arrow',
    size: 0.85,
    speed: 1.35,
    angleDeg: 0,
    length: 5.5,
    color: '#6ec8ff',
    meshId: 'arrow-path'
  },
  {
    id: 'fire_white_splash',
    label: 'White splash',
    textureKey: 'ember_core',
    use: 'splash',
    size: 1.35,
    speed: 0.8,
    angleDeg: 0,
    aoe: 1.6,
    length: 1.1,
    color: '#ffe8c8',
    meshId: 'none'
  }
]);

/**
 * Air bending trail saves — WindRibbon / PathTrail cyan silk.
 * Mobility + arrows + slash + splash.
 */
export const AIR_TRAIL_VARIANTS = Object.freeze([
  {
    id: 'air_dash',
    label: 'Dash silk',
    textureKey: 'wind_silk',
    use: 'dash',
    size: 1.0,
    speed: 1.2,
    angleDeg: 0,
    length: 4.2,
    color: '#c9f0ff'
  },
  {
    id: 'air_jump2',
    label: '2nd jump tell',
    textureKey: 'wind_silk',
    use: 'jump2',
    size: 0.78,
    speed: 1.1,
    angleDeg: 12,
    length: 2.4,
    color: '#eafcff'
  },
  {
    id: 'air_backflip',
    label: 'Backflip hang',
    textureKey: 'wind_silk',
    use: 'backflip',
    size: 0.95,
    speed: 0.85,
    angleDeg: 0,
    length: 3.6,
    color: '#b6d8ea'
  },
  {
    id: 'air_arrow',
    label: 'Air arrow',
    textureKey: 'wind_silk',
    use: 'arrow',
    size: 0.7,
    speed: 1.4,
    angleDeg: 0,
    length: 6.0,
    color: '#8ed4ff',
    meshId: 'arrow-path'
  },
  {
    id: 'air_slash',
    label: 'Air slash',
    textureKey: 'wind_silk',
    use: 'slash',
    size: 1.05,
    speed: 1.15,
    angleDeg: -6,
    length: 5.2,
    color: '#d8f6ff',
    meshId: 'slashblue'
  },
  {
    id: 'air_splash',
    label: 'Air splash',
    textureKey: 'wind_haze',
    use: 'splash',
    size: 1.3,
    speed: 0.75,
    angleDeg: 0,
    aoe: 1.8,
    length: 1.2,
    color: '#f4fcff',
    meshId: 'none'
  }
]);

/** All showcase variants for lab / editor dropdowns. */
export const ALL_EFFECT_VARIANTS = Object.freeze([
  ...ELECTRIC_VARIANTS,
  ...AOE_VARIANTS,
  ...LINE_CAST_VARIANTS,
  ...BEND_CAST_VARIANTS,
  ...FIRE_TRAIL_VARIANTS,
  ...AIR_TRAIL_VARIANTS
]);

/**
 * Pick a linear vs bend showcase variant for a product element.
 * @param {string} el fire|ice|storm|nature|holy|arcane
 * @param {{ aoe?: boolean, bend?: boolean }} [opts]
 */
export function variantHintForElement(el, opts = {}) {
  const aoe = !!opts.aoe;
  const bend = !!opts.bend;
  if (bend) {
    if (el === 'fire') return 'fire_curve';
    if (el === 'ice') return 'frost_curve';
    if (el === 'storm') return 'storm_ribbon';
    if (el === 'nature') return aoe ? 'jade_mist' : 'nature_vine';
    if (el === 'holy') return 'holy_curve';
    if (el === 'arcane') return 'arcane_curve';
    if (el === 'shadow' || el === 'poison') return aoe ? 'poison_arc' : 'shadow_curve';
    return 'nature_vine';
  }
  if (el === 'storm') return aoe ? 'arc_storm' : 'arc_bolt';
  if (el === 'fire') return aoe ? 'aoe_meteor' : 'fire_bolt';
  if (el === 'ice') return aoe ? 'aoe_frost' : 'ice_bolt';
  if (el === 'arcane') return aoe ? 'aoe_snare' : 'arcane_bolt';
  if (el === 'nature') return aoe ? 'aoe_glacier' : 'nature_bolt';
  if (el === 'holy') return aoe ? 'aoe_holy' : 'holy_beam';
  if (el === 'shadow') return aoe ? 'aoe_snare' : 'shadow_bolt';
  return aoe ? 'aoe_snare' : 'arcane_bolt';
}

/** Catalog hex → Three color number for VfxDirector. */
export function variantColorNumber(id) {
  const v = getEffectVariant(id);
  if (!v?.color) return null;
  return Number.parseInt(String(v.color).replace('#', ''), 16) || null;
}
