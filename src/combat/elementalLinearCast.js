/**
 * Elemental skills × linear spell casting — one learning map (Casting lab).
 *
 * Merges what we learned from LinearAbilityCastingThreeJS with staff elemental
 * skills so DRC digit/F/LMB release can drive:
 *  1. Linear skillshots (line/zone, constant m/s, MOBA aim, procedural FX)
 *  2. Path-cast Fire/Water/Earth/Wind Ability pools (drawn stroke)
 *  3. Mesh delivery (orbs, rocks, freeze nova, bubbles, arrows)
 *
 * Does **not** invent skill rows or a third AbilityManager.
 *
 * @see docs/ELEMENTAL_LINEAR_CAST_SSOT.md
 * @see docs/LINEAR_SKILLSHOT_SSOT.md
 * @see src/skillshot/LinearSkillBridge.js
 * @see src/combat/elementWeaponSkills.js
 * @see src/vfx/elementAttackVfx.js
 */

import { PRODUCT_TO_LINEAR, CastShape, castShapeOf } from '../skillshot/LinearSkillBridge.js';
import { CASTING_ELEMENT_PHASE_VFX, normalizeElement } from './elementWeaponSkills.js';
import { inferElementAttackKind } from '../vfx/elementAttackVfx.js';
import { isStaffNormalAttack } from '../vfx/staffOrbVfx.js';
import { linearAttackEffectForElement } from '../api/linearAttackEffects.js';

/**
 * Product element → linear skillshot id (from LinearAbilityCasting learning).
 * ice→ice LINE · storm→thunder LINE · fire→meteor LINE · holy→beam LINE
 * arcane→snare ZONE · nature→glacier ZONE
 */
export { PRODUCT_TO_LINEAR };

/**
 * Learned cast layers — which systems fire for a skill release.
 * @typedef {'linear_line'|'linear_zone'|'path_ability'|'mesh_projectile'|'freeze_nova'|'earth_rocks'|'water_bubbles'|'arrow_path'|'arrow_loft'|'buff'} CastLayer
 */

/**
 * @typedef {object} ElementalLinearPlan
 * @property {string} element          product element
 * @property {string|null} linearId    ice|thunder|meteor|beam|snare|glacier
 * @property {'line'|'zone'|null} linearShape
 * @property {CastLayer[]} layers      ordered deploy layers
 * @property {boolean} useLinear       fire LinearSkillBridge.castToward
 * @property {boolean} usePathAbility  Fire/Water/Earth/Wind Ability curve
 * @property {boolean} useMeshDelivery SkillProjectileSystem (orbs/rocks/…)
 * @property {string|null} variantHint effectVariants id
 * @property {number} intensity        0.25..2
 * @property {object|null} meshKind    from inferElementAttackKind
 * @property {object|null} beautyEffect beautiful linear attack spec (speed, mesh url, FX ids)
 * @property {string} learn            short agent note
 */

/**
 * Decide cast plan from catalog skill + combat context.
 * Focus combat stream primaries → linear line/zone + mesh.
 * Path stroke / wall / spikes → path Ability primary.
 * Freeze / earth multi → mesh kinds learned in elementAttackVfx.
 *
 * @param {object} skill
 * @param {{ focusCombat?: boolean, pathDrawn?: boolean, intensity?: number }} [ctx]
 * @returns {ElementalLinearPlan}
 */
export function planElementalLinearCast(skill, ctx = {}) {
  const el = normalizeElement(skill?.element || skill?.abilityElement || 'arcane');
  const phase = CASTING_ELEMENT_PHASE_VFX[el] || CASTING_ELEMENT_PHASE_VFX.arcane;
  const linearId = PRODUCT_TO_LINEAR[el] || null;
  const linearShape = linearId
    ? castShapeOf(linearId) === CastShape.ZONE
      ? 'zone'
      : 'line'
    : null;

  const meshKind = inferElementAttackKind(skill);
  const pathMode = skill?.pathMode || 'stream';
  const blob = `${skill?.id || ''} ${skill?.label || ''} ${skill?.catalogSkillId || ''}`.toLowerCase();
  const intensity = Math.max(0.25, Math.min(2, ctx.intensity ?? 1));

  const layers = /** @type {CastLayer[]} */ ([]);

  // Buffs never fire travel systems
  if (skill?.isFocus || skill?.isWard || skill?.skillKind === 'buff') {
    return {
      element: el,
      linearId: null,
      linearShape: null,
      layers: ['buff'],
      useLinear: false,
      usePathAbility: false,
      useMeshDelivery: false,
      variantHint: null,
      intensity,
      meshKind: null,
      learn: 'Buff / ward — cast tell only'
    };
  }

  // Explicit mesh kinds first (freeze, multi rock, arrow)
  if (meshKind?.kind === 'freeze_nova') {
    layers.push('freeze_nova');
    return pack(el, linearId, linearShape, layers, {
      useLinear: false,
      usePathAbility: pathMode === 'aoe' || pathMode === 'spikes',
      useMeshDelivery: true,
      variantHint: 'aoe_frost',
      intensity,
      meshKind,
      learn: 'Freeze nova from self — mesh expand + frost VFX; path Ability optional flood'
    });
  }
  if (meshKind?.kind === 'earth_rocks') {
    layers.push('earth_rocks');
    // Glacier zone for heavy nature aoe; linear glacier for stream optional
    const heavy = (meshKind.rockCount || 1) >= 3;
    if (heavy && linearId === 'glacier') {
      layers.push('linear_zone');
    }
    return pack(el, linearId, linearShape, layers, {
      useLinear: heavy && linearId === 'glacier',
      usePathAbility: pathMode === 'spikes' || pathMode === 'wall',
      useMeshDelivery: true,
      variantHint: heavy ? 'aoe_glacier' : null,
      intensity,
      meshKind,
      learn: 'Earth rocks emerge + fly; multi/quake can add glacier zone'
    });
  }
  if (meshKind?.kind === 'arrow_path' || meshKind?.kind === 'arrow_loft') {
    layers.push(meshKind.kind);
    return pack(el, linearId, linearShape, layers, {
      useLinear: false,
      usePathAbility: false,
      useMeshDelivery: true,
      variantHint: null,
      intensity,
      meshKind,
      learn: 'Arrow systems — path distance end events or loft throw/trap/summon'
    });
  }
  if (meshKind?.kind === 'water_bubbles') {
    layers.push('water_bubbles');
  }

  // Drawn path stroke → path Ability is primary (staffCast learning)
  if (ctx.pathDrawn) {
    layers.push('path_ability');
    if (isStaffNormalAttack(skill) || pathMode === 'stream') layers.push('mesh_projectile');
    return pack(el, linearId, linearShape, layers, {
      useLinear: false,
      usePathAbility: true,
      useMeshDelivery: true,
      variantHint: null,
      intensity,
      meshKind,
      learn: 'Path stroke → Fire/Water/Earth/Wind Ability + mesh travel'
    });
  }

  // Focus combat / digit skills: linear skillshot for stream/line elements
  const wantLinear =
    ctx.focusCombat !== false &&
    (pathMode === 'stream' ||
      skill?.slotType === 'primary' ||
      skill?.isWeaponPrimary ||
      isStaffNormalAttack(skill) ||
      /bolt|spark|ping|practice|beam|chain|tempest|inferno|meteor/.test(blob));

  // Zone elements (snare/glacier) for aoe pathMode
  const wantZone =
    linearShape === 'zone' &&
    (pathMode === 'aoe' || /nova|zone|snare|glacier|field/.test(blob));

  if (wantZone && linearId) {
    layers.push('linear_zone');
  } else if (wantLinear && linearId && linearShape === 'line') {
    layers.push('linear_line');
  } else if (wantLinear && linearId && linearShape === 'zone' && pathMode === 'stream') {
    // nature primary: rocks mesh + optional light glacier
    layers.push('mesh_projectile');
  }

  // Always keep path Ability beauty for elemental presentation (volley/flood/…)
  // except pure mesh-only arrows
  if (pathMode === 'wall' || pathMode === 'spikes' || pathMode === 'aoe') {
    layers.push('path_ability');
  } else if (!layers.includes('linear_line') && !layers.includes('linear_zone')) {
    layers.push('path_ability');
  } else {
    // Linear primary + soft path curve for continuity with staff presentation
    layers.push('path_ability');
  }

  // Staff normal / stream → mesh orbs (or rocks/bubbles already queued)
  if (
    !layers.includes('earth_rocks') &&
    !layers.includes('freeze_nova') &&
    (isStaffNormalAttack(skill) || pathMode === 'stream' || layers.includes('water_bubbles'))
  ) {
    layers.push('mesh_projectile');
  }

  // Dedup layers
  const uniq = [...new Set(layers)];
  const useLinear = uniq.some((l) => l === 'linear_line' || l === 'linear_zone');
  const beautyEffect = linearAttackEffectForElement(el);

  return pack(el, linearId, linearShape, uniq, {
    useLinear,
    usePathAbility: uniq.includes('path_ability'),
    useMeshDelivery:
      uniq.includes('mesh_projectile') ||
      uniq.includes('water_bubbles') ||
      uniq.includes('earth_rocks') ||
      uniq.includes('freeze_nova'),
    variantHint: variantForElement(el, pathMode),
    intensity,
    meshKind,
    beautyEffect,
    learn: `Element ${el} → linear ${linearId || '—'} (${linearShape || 'none'}) + path Ability + mesh; phase VFX ${phase.cast}/${phase.travel}/${phase.impact}`
  });
}

/**
 * @param {string} el
 * @param {string} pathMode
 */
function variantForElement(el, pathMode) {
  if (el === 'storm') return pathMode === 'aoe' ? 'arc_storm' : 'arc_bolt';
  if (el === 'fire') return pathMode === 'aoe' || pathMode === 'stream' ? null : null;
  if (el === 'ice') return pathMode === 'aoe' ? 'aoe_frost' : null;
  if (el === 'arcane') return pathMode === 'aoe' ? 'aoe_snare' : null;
  if (el === 'nature') return pathMode === 'aoe' ? 'aoe_glacier' : null;
  return null;
}

function pack(el, linearId, linearShape, layers, rest) {
  const beautyEffect = rest.beautyEffect ?? linearAttackEffectForElement(el);
  return {
    element: el,
    linearId,
    linearShape,
    layers,
    beautyEffect,
    ...rest
  };
}

/**
 * Fire planned linear skillshot from combat pose (no re-arm MOBA UI).
 * Skips linear CD gate for weapon-skill driven casts (weapon CD already spent).
 *
 * @param {import('../skillshot/LinearSkillBridge.js').LinearSkillBridge|null} linear
 * @param {ElementalLinearPlan} plan
 * @param {{ origin: import('three').Vector3, aim: import('three').Vector3, feet?: import('three').Vector3 }} pose
 * @returns {boolean}
 */
export function fireLinearFromPlan(linear, plan, pose) {
  if (!linear || !plan?.useLinear || !plan.linearId) return false;
  const feet = pose.feet || pose.origin;
  const aim = pose.aim;
  if (!feet || !aim) return false;

  linear.applyIntensity?.(plan.intensity);
  if (plan.variantHint) {
    try {
      linear.applyVariant?.(plan.variantHint, plan.linearId);
    } catch {
      /* optional */
    }
  }

  // Bypass arm UI — combat skill already committed cast
  // Temporarily clear CD so digit skills aren't double-blocked by linear pool
  const prevCd = linear.cooldowns?.get?.(plan.linearId) ?? 0;
  linear.cooldowns?.set?.(plan.linearId, 0);
  linear.select(plan.linearId);
  const ab = linear.castToward(feet, aim, plan.linearId);
  // Restore a short cosmetic CD so Alt+Shift spam still rates
  if (prevCd > 0) linear.cooldowns?.set?.(plan.linearId, Math.min(prevCd, 0.35));
  return !!ab;
}

/**
 * Agent learning summary table (runtime-readable).
 */
export const ELEMENTAL_LINEAR_LEARNED = Object.freeze({
  practices: [
    'settings SSOT sampled every frame (linearSettings + settings.js)',
    'pooled abilities, no alloc on cast',
    'phase machine travel → impact → fade',
    'constant m/s line front',
    'MOBA line/zone aim (Alt+Shift arm) + combat castToward',
    'procedural geometry + GLSL materials',
    'ground marks + fissures',
    'element → PRODUCT_TO_LINEAR map',
    'staff normal slot1 + focus LMB shared',
    'orbs / rocks / freeze / arrows as mesh layers'
  ],
  elementMap: { ...PRODUCT_TO_LINEAR },
  layers: [
    'linear_line',
    'linear_zone',
    'path_ability',
    'mesh_projectile',
    'freeze_nova',
    'earth_rocks',
    'water_bubbles',
    'arrow_path',
    'arrow_loft',
    'buff'
  ]
});
