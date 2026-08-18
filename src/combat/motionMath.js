/**
 * Motion-math (MM) — fleet high-level displacement descriptors.
 *
 * Same contract as Animator Studio: 100 MM = 1 m of body travel.
 * Dodge / roll / attack profiles speak in MM; runtime converts with mmToM.
 *
 * @see Documents/animator animator/src/three/Studio.ts MM_TO_M
 */

/** 100 motion-math units = 1 metre. */
export const MM_TO_M = 0.01;

/**
 * @param {number} mm
 * @returns {number} metres
 */
export function mmToM(mm) {
  return (Number(mm) || 0) * MM_TO_M;
}

/**
 * @param {number} m metres
 * @returns {number} MM units
 */
export function mToMm(m) {
  return (Number(m) || 0) / MM_TO_M;
}

/**
 * Dodge profiles in MM (peak body travel along dodge axis).
 * Lateral AA/DD is 3× the walk-dodge baseline so escapes clear attack ranges.
 *
 * Baseline walk dodge was ~2.4 m = 240 MM; lateral escape = 720 MM = 7.2 m.
 */
export const DODGE_MM = Object.freeze({
  /** AA / DD escape */
  lateral: 720,
  /** WW forward */
  forward: 240,
  /** X / S back */
  back: 240
});

/**
 * Ranged kite (staff / bow) — shorter than melee escape, camera-relative.
 * Keep facing the aim so the next shot stays on target.
 */
export const KITE_MM = Object.freeze({
  sidestep: 380,
  backstep: 280,
  fade: 200
});

/**
 * @param {'left'|'right'|'forward'|'back'} dir
 * @returns {number} metres
 */
export function kiteDistanceM(dir) {
  if (dir === 'left' || dir === 'right') return mmToM(KITE_MM.sidestep);
  if (dir === 'back') return mmToM(KITE_MM.backstep);
  return mmToM(KITE_MM.fade);
}

/**
 * Resolve dodge travel distance (metres) for a direction.
 * @param {'left'|'right'|'forward'|'back'} dir
 * @param {{ dodgeDistance?: number, dodgeLateralMul?: number, dodgeMm?: { lateral?: number, forward?: number, back?: number } }} [cfg]
 * @returns {number}
 */
export function dodgeDistanceM(dir, cfg = {}) {
  const baseM = cfg.dodgeDistance ?? 2.4;
  const baseMm = mToMm(baseM);
  const mm = cfg.dodgeMm || {};
  if (dir === 'left' || dir === 'right') {
    // Prefer explicit MM; else 3× baseline metres
    const latMm = mm.lateral ?? DODGE_MM.lateral ?? baseMm * (cfg.dodgeLateralMul ?? 3);
    return mmToM(latMm);
  }
  if (dir === 'forward') {
    return mmToM(mm.forward ?? DODGE_MM.forward ?? baseMm);
  }
  return mmToM(mm.back ?? DODGE_MM.back ?? baseMm);
}
