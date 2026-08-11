/**
 * Weapon charge UX — hold → ticks → release fire · rest recovery · anim blend hooks.
 *
 * Used by flintlock **Charged Shot** (and any chargeable skill):
 *  - Tap: quick fire (no charge)
 *  - Hold: wind-up (charged-pistol blend) · cast bar ticks · intensity 1..3
 *  - Release: fire with damage/cost mul · weapon rest (best rest)
 *  - Cancel (move / re-tap empty): short cancel rest · restore gait blend
 *
 * Builds on castResources.castIntensity + DRC cast bar — not a second combat engine.
 *
 * @see docs/PISTOL_FLINTLOCK_SSOT.md · docs/PRODUCTION_CONTROLLER_SSOT.md
 */

import { MathUtils } from 'three';
import { castIntensity, skillCastCosts } from './castResources.js';
import { settings } from '../config/settings.js';

/**
 * Defaults — overridable via settings.drc.weaponCharge
 */
export const WEAPON_CHARGE_DEFAULTS = Object.freeze({
  /** Seconds before hold counts as charge (else tap fire) */
  tapMaxSec: 0.18,
  /** Full charge hold */
  maxHoldSec: 1.35,
  /** Min hold to fire as charged (between tap and full) */
  minChargeSec: 0.22,
  /** UI / combat tick rate for charge bar */
  tickHz: 20,
  /** Weapon rest after release fire (best rest — blocks next attack) */
  restSec: 0.42,
  /** Extra rest per intensity above 1 */
  restPerIntensity: 0.12,
  /** Cancel / interrupt rest */
  cancelRestSec: 0.18,
  /** Global weapon GCD between any weapon skills (s) */
  gcdSec: 0.12,
  /** Damage / force mul at full charge */
  maxDamageMul: 2.05,
  /** Hit-frame delay scale when charged (longer windup) */
  hitFrameMul: 1.15,
  /** Cast bar label base */
  label: 'Charged Shot'
});

/** Named charge levels for toast / bar */
export const CHARGE_LEVELS = Object.freeze([
  { min: 0, id: 'tap', label: 'Tap', mul: 1 },
  { min: 0.22, id: 'wind', label: 'Wind', mul: 1.25 },
  { min: 0.55, id: 'charged', label: 'Charged', mul: 1.55 },
  { min: 0.95, id: 'power', label: 'Power', mul: 1.85 },
  { min: 1.25, id: 'full', label: 'Full', mul: 2.05 }
]);

/**
 * @returns {typeof WEAPON_CHARGE_DEFAULTS}
 */
export function weaponChargeConfig() {
  const ov = settings.drc?.weaponCharge || {};
  return { ...WEAPON_CHARGE_DEFAULTS, ...ov };
}

/**
 * Skill should use hold-to-charge UX (firearm power / charged-pistol).
 * @param {object} skill
 * @param {{ animPack?: string, weaponId?: string }} [ctx]
 */
export function isChargeableWeaponSkill(skill, ctx = {}) {
  if (!skill) return false;
  if (skill.isReload || skill.skillKind === 'reload' || skill.isWard || skill.isFocus) {
    return false;
  }
  if (skill.chargeable === true || skill.useWeaponCharge === true) return true;
  if (skill.chargeable === false) return false;

  const blob = `${skill.id || ''} ${skill.label || ''} ${skill.animRole || ''} ${skill.catalogSkillId || ''}`.toLowerCase();
  // Explicit charged / power / fan / suppress / charged-pistol
  if (/charg|power|fan|suppress|overcharg|heavy.?shot/i.test(blob)) return true;
  if (skill.animRole === 'skill2' || skill.animRole === 'charged') return true;

  // Flintlock primary Practice Shot — hold for charged shot, tap for quick
  if (
    (ctx.animPack === 'pistol' || /t0_gun|flint|pistol/i.test(blob + (ctx.weaponId || ''))) &&
    (skill.slot === 0 || skill.slotType === 'primary' || /practice.?shot|pistol_shot/i.test(blob))
  ) {
    return true;
  }
  return false;
}

/**
 * Level from hold seconds.
 * @param {number} holdSec
 */
export function chargeLevelFromHold(holdSec) {
  const h = Math.max(0, holdSec);
  let level = CHARGE_LEVELS[0];
  for (const L of CHARGE_LEVELS) {
    if (h >= L.min) level = L;
  }
  return level;
}

/**
 * Progress 0..1 toward full charge.
 * @param {number} holdSec
 * @param {object} [cfg]
 */
export function chargeProgress01(holdSec, cfg = weaponChargeConfig()) {
  return MathUtils.clamp(holdSec / Math.max(0.05, cfg.maxHoldSec), 0, 1);
}

/**
 * Damage / force multiplier from hold.
 * @param {number} holdSec
 * @param {object} [cfg]
 */
export function chargeDamageMul(holdSec, cfg = weaponChargeConfig()) {
  const p = chargeProgress01(holdSec, cfg);
  const level = chargeLevelFromHold(holdSec);
  // Smooth between level muls + cap
  const base = level.mul;
  const top = cfg.maxDamageMul;
  return MathUtils.clamp(MathUtils.lerp(base, top, p * p), 1, top);
}

/**
 * Rest duration after a successful charged (or tap) weapon fire.
 * @param {number} holdSec
 * @param {number} intensity
 * @param {object} [cfg]
 */
export function weaponRestAfterFire(holdSec, intensity = 1, cfg = weaponChargeConfig()) {
  const p = chargeProgress01(holdSec, cfg);
  return cfg.restSec + Math.max(0, intensity - 1) * cfg.restPerIntensity + p * 0.08;
}

/**
 * Build cast-bar state for charge channel.
 * @param {{
 *   holdSec: number,
 *   skill?: object,
 *   active?: boolean
 * }} opts
 */
export function chargeBarState(opts) {
  const cfg = weaponChargeConfig();
  const hold = Math.max(0, opts.holdSec || 0);
  const p = chargeProgress01(hold, cfg);
  const level = chargeLevelFromHold(hold);
  const mul = chargeDamageMul(hold, cfg);
  const label = opts.skill?.label
    ? `${opts.skill.label} · ${level.label}`
    : `${cfg.label} · ${level.label}`;
  return {
    active: opts.active !== false,
    label,
    progress01: p,
    duration: cfg.maxHoldSec,
    remaining: Math.max(0, cfg.maxHoldSec - hold),
    element: opts.skill?.element || 'physical',
    chargeLevel: level.id,
    damageMul: mul,
    kind: 'weapon_charge'
  };
}

/**
 * Resource cost for charged weapon release (uses hold intensity).
 * @param {object} skill
 * @param {number} holdSec
 */
export function chargedSkillCosts(skill, holdSec) {
  return skillCastCosts(skill, holdSec, 0);
}

/**
 * Mutable charge session (owned by DrcCombatController).
 */
export class WeaponChargeSession {
  constructor() {
    this.active = false;
    this.slot = 0;
    /** @type {object|null} */
    this.skill = null;
    this.startedAt = 0;
    this.holdSec = 0;
    this._tickAccum = 0;
    this._lastLevelId = 'tap';
    this.animRole = 'skill2';
  }

  /**
   * @param {number} slot
   * @param {object} skill
   * @param {number} elapsed
   * @param {string} [animRole]
   */
  begin(slot, skill, elapsed, animRole = 'skill2') {
    this.active = true;
    this.slot = slot;
    this.skill = skill;
    this.startedAt = elapsed;
    this.holdSec = 0;
    this._tickAccum = 0;
    this._lastLevelId = 'tap';
    this.animRole = animRole || skill.animRole || 'skill2';
  }

  /**
   * @param {number} dt
   * @param {number} elapsed
   * @returns {{ tick: boolean, levelChanged: boolean, level: object, progress01: number, holdSec: number }}
   */
  update(dt, elapsed) {
    if (!this.active) {
      return { tick: false, levelChanged: false, level: CHARGE_LEVELS[0], progress01: 0, holdSec: 0 };
    }
    this.holdSec = Math.max(0, elapsed - this.startedAt);
    const cfg = weaponChargeConfig();
    this._tickAccum += dt;
    const tickPeriod = 1 / Math.max(1, cfg.tickHz);
    let tick = false;
    if (this._tickAccum >= tickPeriod) {
      this._tickAccum = 0;
      tick = true;
    }
    const level = chargeLevelFromHold(this.holdSec);
    const levelChanged = level.id !== this._lastLevelId;
    if (levelChanged) this._lastLevelId = level.id;
    return {
      tick,
      levelChanged,
      level,
      progress01: chargeProgress01(this.holdSec, cfg),
      holdSec: this.holdSec
    };
  }

  /**
   * End session — returns release payload for fire / cancel.
   * @param {'release'|'cancel'} reason
   */
  end(reason = 'release') {
    const holdSec = this.holdSec;
    const skill = this.skill;
    const slot = this.slot;
    const cfg = weaponChargeConfig();
    const isTap = holdSec < cfg.tapMaxSec;
    const isCharged = holdSec >= cfg.minChargeSec;
    const intensity = isCharged ? castIntensity(holdSec, 0) : 1;
    const damageMul = isCharged ? chargeDamageMul(holdSec, cfg) : 1;
    const level = chargeLevelFromHold(holdSec);
    this.active = false;
    this.skill = null;
    this.holdSec = 0;
    return {
      reason,
      slot,
      skill,
      holdSec,
      isTap,
      isCharged,
      intensity,
      damageMul,
      level,
      restSec:
        reason === 'cancel'
          ? cfg.cancelRestSec
          : weaponRestAfterFire(holdSec, intensity, cfg),
      costs: skill ? chargedSkillCosts(skill, isCharged ? holdSec : 0) : null
    };
  }
}
