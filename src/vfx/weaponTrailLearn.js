/**
 * Learn skill: LMB-held PathTrail (bending preset) → every weapon paint.
 *
 * Author: D:\Games\Models\bending-presets (1).json
 *   "bulletspoisonaoestun turnado".trail  (width · glow · dissolve · sparkle)
 *
 * Runtime: PathTrail / TrailMaterial knobs = settings.trail
 *          WeaponTipTrailSystem paints spine: blade · blunt · special · barrel · feet
 *
 * Ready uses (one learn, three exports):
 *   tail    — follows projectile for its life (gun / wand / orb)
 *   slash   — blade swing ribbon + residual
 *   special — kick / finisher / special socket
 *
 * Do not invent a second ribbon engine.
 *
 * @see docs/BENDING_PRESETS_SSOT.md
 * @see src/effects/PathTrail.js
 * @see src/vfx/weaponTipTrail.js
 */

import { settings } from '../config/settings.js';
import { familyFromWeaponType, primaryCombatPointId } from '../character/weaponPrefabSpine.js';
import { getEffectVariant, trailVariantForUse } from './effectVariants.js';

/** @typedef {'tail'|'slash'|'blunt'|'special'|'kick'} WeaponTrailUse */

export const TRAIL_LEARN_ID = 'learn_bending_path_trail';

export const TRAIL_USES = Object.freeze({
  tail: {
    id: 'tail',
    spine: 'barrel',
    kind: 'trail',
    label: 'Projectile tail',
    blurb: 'Lasts as long as the projectile · painted from barrel/cast'
  },
  slash: {
    id: 'slash',
    spine: 'blade',
    kind: 'residual',
    label: 'Blade slash',
    blurb: 'Attack swing paints blade path · residual slash'
  },
  blunt: {
    id: 'blunt',
    spine: 'blunt',
    kind: 'trail',
    label: 'Blunt paint',
    blurb: 'Hammer / mace / kick mass paints crush trail'
  },
  special: {
    id: 'special',
    spine: 'special',
    kind: 'trail',
    label: 'Special',
    blurb: 'Finisher / aux socket · kick / flourish'
  },
  kick: {
    id: 'kick',
    spine: 'effect',
    kind: 'trail',
    label: 'Kick / anim',
    blurb: 'Attack animation kick · feet / effect socket'
  }
});

/** Width scale vs LMB mouse trail (0.55 m) — weapon paint is thinner. */
const WIDTH_MUL = Object.freeze({
  tail: 0.22,
  slash: 0.28,
  blunt: 0.36,
  special: 0.32,
  kick: 0.24
});

/** Bending LMB trail knobs (same as settings.trail). */
export function bendingTrailKnobs() {
  const t = settings.trail || {};
  return {
    width: t.width ?? 0.55,
    length: t.length ?? 1,
    opacity: t.opacity ?? 0.85,
    glow: t.glow ?? 1.4,
    colorInner: t.colorInner || '#eafcff',
    colorOuter: t.colorOuter || '#4fb9ff',
    flowSpeed: t.flowSpeed ?? 1.6,
    dissolveSpeed: t.dissolveSpeed ?? 1.5,
    taper: t.taper ?? 0.65,
    softness: t.softness ?? 0.65,
    sparkle: t.sparkle ?? 0.6,
    noiseStrength: t.noiseStrength ?? 0.55,
    noiseFrequency: t.noiseFrequency ?? 2.6
  };
}

/**
 * Fire-bending stream as PathTrail paint.
 * Same settings.fire FireAbility / VolumetricFire reads — not a second engine.
 * Default tail for bullets and projectiles.
 */
export function fireBendingTrailKnobs() {
  const f = settings.fire || {};
  return {
    width: f.flameWidth ?? 0.12,
    length: Math.min(1, (f.streamLength ?? 1.5) / 6),
    opacity: f.opacity ?? 0.96,
    glow: f.glow ?? 3.06,
    colorInner: f.colorCore || '#fff6d8',
    colorOuter: f.colorMid || '#ffb02e',
    flowSpeed: f.flameSpeed ?? 4.06,
    dissolveSpeed: Math.max(0.4, f.detachment ?? 0.9),
    taper: 0.72,
    softness: f.softness ?? 0.42,
    sparkle: Math.min(1, (f.sparkRate ?? 57) / 80),
    noiseStrength: f.noiseStrength ?? 1.55,
    noiseFrequency: f.noiseFrequency ?? 4.16
  };
}

/**
 * Pick trail use from skill + weapon family.
 * @param {object} skill
 * @param {string} [family]
 */
export function trailUseForSkill(skill, family) {
  const blob = `${skill?.id || ''} ${skill?.label || ''} ${skill?.animRole || ''} ${(skill?.effects || []).join(' ')}`.toLowerCase();
  if (/kick|stomp|hurricane|uppercut|knee/.test(blob)) return TRAIL_USES.kick;
  if (/finisher|special|flourish|spin/.test(blob)) return TRAIL_USES.special;
  if (family === 'hammer' || family === 'mace' || /blunt|smash|crush/.test(blob)) {
    return TRAIL_USES.blunt;
  }
  if (
    skill?.useBulletProjectile ||
    skill?.projectile === 'bullet' ||
    skill?.style === 'ranged' ||
    skill?.style === 'spell' ||
    family === 'gun' ||
    family === 'rifle' ||
    family === 'bow'
  ) {
    return TRAIL_USES.tail;
  }
  return TRAIL_USES.slash;
}

/**
 * Seconds the paint lives — projectile life, else swing window.
 * @param {object} skill
 */
export function trailLifeSec(skill) {
  const phys = skill?.physics?.life ?? skill?.life ?? skill?.projectileLife;
  if (Number(phys) > 0.05) return Number(phys);
  const t = settings.residual?.trailDuration ?? 0.34;
  return t;
}

/**
 * Compile ready trail bind for a skill (tail / slash / special).
 * @param {object} skill
 * @param {{ weaponType?: string, family?: string }} [ctx]
 */
export function compileWeaponTrail(skill, ctx = {}) {
  const family = ctx.family || familyFromWeaponType(ctx.weaponType || skill?.weaponTypeId);
  const forced = ctx.use && TRAIL_USES[ctx.use] ? TRAIL_USES[ctx.use] : null;
  const use = forced || trailUseForSkill(skill, family);
  const el = String(skill?.element || skill?.abilityElement || '').toLowerCase();
  const knobs =
    use.id === 'tail' || el === 'fire'
      ? fireBendingTrailKnobs()
      : bendingTrailKnobs();
  const variant =
    getEffectVariant(skill?.trailVariant || skill?.vfx?.trailVariant) ||
    (el === 'fire' || el === 'wind' || el === 'storm'
      ? trailVariantForUse(use.id === 'slash' ? 'slash' : use.id === 'tail' ? 'arrow' : use.id, el === 'fire' ? 'fire' : 'wind')
      : null);
  if (variant) {
    if (variant.color) knobs.colorInner = variant.color;
    if (variant.size) knobs.width = (knobs.width || 0.55) * variant.size;
    if (Number(variant.length) > 0) knobs.length = Math.min(1, Number(variant.length) / 6);
  }
  const spine = use.spine || primaryCombatPointId(family);
  const life = trailLifeSec(skill);
  const color =
    skill?.vfx?.trailColor ||
    skill?.trailColor ||
    knobs.colorInner;
  return {
    learnId: TRAIL_LEARN_ID,
    use: use.id,
    kind: use.kind,
    spine,
    life,
    followProjectile: use.id === 'tail',
    color,
    colorOuter: knobs.colorOuter,
    width: Math.max(0.05, knobs.width * (WIDTH_MUL[use.id] ?? 0.28)),
    opacity: knobs.opacity,
    glow: knobs.glow,
    dissolveSpeed: knobs.dissolveSpeed,
    taper: knobs.taper,
    softness: knobs.softness,
    sparkle: knobs.sparkle,
    flowSpeed: knobs.flowSpeed,
    noiseStrength: knobs.noiseStrength,
    noiseFrequency: knobs.noiseFrequency,
    length: knobs.length
  };
}

/**
 * Ready entry: slash/blunt/kick/special = beginSwing on spine;
 * tail = beginFollow on a live projectile mesh.
 * @param {import('./weaponTipTrail.js').WeaponTipTrailSystem|null} tipTrail
 * @param {object} [skill]
 * @param {{ follow?: import('three').Object3D, paint?: object, use?: string, family?: string, duration?: number, forward?: import('three').Vector3, hit?: object, fireBlur?: boolean, color?: string, width?: number }} [opts]
 */
export function startWeaponTrail(tipTrail, skill, opts = {}) {
  if (!tipTrail) return null;
  const paint =
    opts.paint ||
    skill?.trail ||
    compileWeaponTrail(skill || {}, { family: opts.family, use: opts.use });
  if (opts.follow && tipTrail.beginFollow) {
    return tipTrail.beginFollow(opts.follow, {
      ...opts,
      skill,
      paint,
      duration: opts.duration ?? paint.life
    });
  }
  if (!tipTrail.beginSwing) return null;
  return tipTrail.beginSwing({
    ...opts,
    skill,
    paint,
    spineId: opts.spineId || paint.spine,
    duration: opts.duration ?? paint.life
  });
}

/**
 * EffectPrefab primitive for a learned use (tail / slash / special).
 * @param {object} [skill]
 * @param {string} [useId]
 */
export function trailPrimitiveForUse(skill, useId) {
  const paint = compileWeaponTrail(skill || {}, { use: useId });
  const use = TRAIL_USES[paint.use] || TRAIL_USES.slash;
  return {
    kind: 'trail',
    intensity: Math.min(2, (paint.glow || 1.4) * 0.65),
    aoe: 0,
    speed: paint.flowSpeed ?? 1.6,
    size: paint.width,
    color: paint.color,
    duration: paint.life,
    attach: use.spine,
    learnId: TRAIL_LEARN_ID,
    trailUse: use.id,
    followProjectile: paint.followProjectile
  };
}

/** Scriptable learn card — studio / worker. */
export function describeTrailLearnSkill() {
  return {
    id: TRAIL_LEARN_ID,
    label: 'Bending path trail',
    source: 'bending-presets (1).json · bulletspoisonaoestun turnado · LMB held',
    knobs: bendingTrailKnobs(),
    uses: Object.values(TRAIL_USES),
    apply: 'compileWeaponTrail(skill) → WeaponTipTrailSystem.beginSwing / beginFollow',
    ready: ['tail', 'slash', 'special']
  };
}
