import { MathUtils } from 'three';
import { settings } from '../config/settings.js';

/**
 * Spell resource costs — mana + stamina for Warlords lab / production controller.
 *
 * **Intensity** scales with LMB hold time and path length (bigger spell = bigger cost).
 * Use for path cast, digit skills, and T0 base attacks.
 *
 * @see docs/PRODUCTION_CONTROLLER_SSOT.md
 */

/**
 * Cast intensity 1..3 from hold + path length.
 * @param {number} holdSec LMB hold seconds
 * @param {number} [lengthM] path length metres
 * @returns {number}
 */
export function castIntensity(holdSec = 0, lengthM = 0) {
  const cfg = settings.drc?.resources || {};
  const holdW = cfg.holdWeight ?? 0.42;
  const lenW = cfg.lengthWeight ?? 0.055;
  const minI = cfg.intensityMin ?? 1;
  const maxI = cfg.intensityMax ?? 3;
  const hold = Math.max(0, Number(holdSec) || 0);
  const len = Math.max(0, Number(lengthM) || 0);
  // Base 1 + hold ramp + long-path tax after 2 m
  return MathUtils.clamp(1 + hold * holdW + Math.max(0, len - 2) * lenW, minI, maxI);
}

/**
 * Scaled mana + stamina from base costs and intensity.
 * @param {{ manaCost?: number, staminaCost?: number, mana?: number, stamina?: number }} base
 * @param {number} intensity 1..3
 * @returns {{ mana: number, stamina: number, intensity: number }}
 */
export function scaleResourceCost(base = {}, intensity = 1) {
  const i = MathUtils.clamp(intensity, 1, 3);
  const mana0 = Number(base.manaCost ?? base.mana ?? 0) || 0;
  const sta0 = Number(base.staminaCost ?? base.stamina ?? 0) || 0;
  // Mana tracks intensity hard; stamina rises slower (channel effort)
  const mana = Math.ceil(mana0 * i);
  const stamina = Math.ceil(sta0 * (0.55 + 0.45 * i));
  return { mana, stamina, intensity: i };
}

/**
 * Default path-cast base costs by placement kind (before intensity).
 * @param {'aoe'|'spikes'|'wall'|'stream'} kind
 * @param {string} [element]
 */
export function pathCastBaseCost(kind = 'stream', element = 'fire') {
  const table = settings.drc?.pathCastCosts || {};
  const byKind = table[kind] || table.stream || { mana: 10, stamina: 8 };
  // Earth wall / fire stream slightly pricier
  let mul = 1;
  if (kind === 'wall') mul = 1.25;
  if (kind === 'stream' && element === 'fire') mul = 1.1;
  if (kind === 'aoe') mul = 0.9;
  return {
    mana: Math.ceil((byKind.mana ?? 10) * mul),
    stamina: Math.ceil((byKind.stamina ?? 8) * mul)
  };
}

/**
 * Full cost for a path cast stroke.
 * @param {number} holdSec
 * @param {number} lengthM
 * @param {'aoe'|'spikes'|'wall'|'stream'} kind
 * @param {string} [element]
 */
export function pathCastCosts(holdSec, lengthM, kind, element) {
  const base = pathCastBaseCost(kind, element);
  const intensity = castIntensity(holdSec, lengthM);
  return { ...scaleResourceCost(base, intensity), kind, element };
}

/**
 * Full cost for a hotbar / T0 skill (optional hold intensity for charged cast).
 * @param {{ manaCost?: number, staminaCost?: number }} skill
 * @param {number} [holdSec]
 * @param {number} [lengthM]
 */
export function skillCastCosts(skill, holdSec = 0, lengthM = 0) {
  const intensity = holdSec > 0.05 || lengthM > 0.5 ? castIntensity(holdSec, lengthM) : 1;
  return scaleResourceCost(
    {
      manaCost: skill?.manaCost ?? skill?.mana ?? defaultManaForSkill(skill),
      staminaCost: skill?.staminaCost ?? skill?.stamina ?? 8
    },
    intensity
  );
}

/** Infer mana when skill only has stamina (legacy kit). */
export function defaultManaForSkill(skill) {
  if (!skill) return 8;
  if (skill.manaCost != null) return skill.manaCost;
  if (skill.style === 'melee' || skill.style === 'ranged') return 0;
  // Spells: mana ≈ 0.75 × stamina baseline
  return Math.max(4, Math.ceil((skill.staminaCost ?? 10) * 0.75));
}
