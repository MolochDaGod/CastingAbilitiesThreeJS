/**
 * Classify LMB path strokes for staff casting / placement.
 * Used by PathDrawer end + DrcCombatController.castPathAbility.
 */

/**
 * @param {number} length metres
 * @param {number} holdSec seconds held
 * @param {{ aoeMaxLength?: number, spikesMaxLength?: number, wallMinLength?: number, wallHoldSec?: number }} [cfg]
 * @returns {'aoe'|'spikes'|'wall'|'stream'}
 */
export function classifyPathCast(length, holdSec = 0, cfg = {}) {
  const aoeMax = cfg.aoeMaxLength ?? 3.2;
  const spikesMax = cfg.spikesMaxLength ?? 9;
  const wallMin = cfg.wallMinLength ?? 9;
  const wallHold = cfg.wallHoldSec ?? 0.85;

  if (length <= aoeMax && holdSec < wallHold) return 'aoe';
  if (holdSec >= wallHold || length >= wallMin) return 'wall';
  if (length <= spikesMax) return 'spikes';
  return 'stream';
}
