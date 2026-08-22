/**
 * Hit reactions — knockback impulse + knocked-up clip.
 *
 * Clip: public/anims/baked/reactions/knocked-up.json (Mixamo → rematch Bip001)
 * Physics: horizontal MM impulse + optional vy kick on PhysicsWorld / kinematic.
 *
 * @see docs/SKILL_DELIVERY_SSOT.md
 */

import { Vector3 } from 'three';
import { mmToM } from './motionMath.js';

const _fwd = new Vector3();

/**
 * Pick locomotion reaction from MM / knockup — flinch overlays gait;
 * knockback/blownAway exclusive one-shots.
 * @param {{ knockbackMm?: number, knockupVy?: number, reaction?: string }} hit
 */
export function reactionKindFromHit(hit = {}) {
  if (hit.reaction) return hit.reaction;
  const mm = hit.knockbackMm ?? 0;
  const vy = hit.knockupVy ?? 0;
  if (vy >= 2.4 || mm >= 320) return 'blownAway';
  if (mm >= 140 || vy >= 1.2) return 'knockback';
  return 'flinch';
}

/**
 * Apply knockback to lab hero (or future NPC with same shape).
 *
 * @param {{
 *   character: import('../animation/CharacterController.js').CharacterController,
 *   physics?: import('../physics/PhysicsWorld.js').PhysicsWorld|null,
 *   drc?: import('./DrcCombatController.js').DrcCombatController|null
 * }} ctx
 * @param {{
 *   forward: Vector3,
 *   knockbackMm?: number,
 *   knockupVy?: number,
 *   playAnim?: boolean
 * }} hit
 */
/**
 * Pull a mesh toward a world point (tornado / cyclone).
 * @param {import('three').Object3D} mesh
 * @param {import('three').Vector3} center
 * @param {number} [mm]
 */
export function applyPullToward(mesh, center, mm = 220) {
  if (!mesh?.position || !center) return false;
  const dist = mmToM(mm);
  _fwd.copy(center).sub(mesh.position);
  _fwd.y = 0;
  if (_fwd.lengthSq() < 1e-8) return false;
  _fwd.normalize();
  const step = Math.min(dist, mesh.position.distanceTo(center) * 0.85);
  mesh.position.x += _fwd.x * step;
  mesh.position.z += _fwd.z * step;
  return true;
}

export function applyKnockback(ctx, hit) {
  if (!ctx?.character) return false;
  const mm = hit.knockbackMm ?? 180;
  const dist = mmToM(mm);
  const dur = 0.35;
  _fwd.copy(hit.forward || new Vector3(0, 0, 1));
  _fwd.y = 0;
  if (_fwd.lengthSq() < 1e-8) _fwd.set(0, 0, 1);
  else _fwd.normalize();

  // Horizontal slide via DRC dodge impulse channel (same CCT path)
  if (ctx.drc && typeof ctx.drc._dodgeVel !== 'undefined') {
    const speed = dist / Math.max(0.12, dur);
    ctx.drc._dodgeVel.set(_fwd.x * speed, 0, _fwd.z * speed);
    ctx.drc._dodgeT = dur;
    ctx.drc._dodgeDur = dur;
  } else {
    // Fallback: direct root nudge
    ctx.character.root.position.x += _fwd.x * dist * 0.35;
    ctx.character.root.position.z += _fwd.z * dist * 0.35;
  }

  // Vertical kick
  const vy = hit.knockupVy ?? 2.2;
  if (vy > 0.05) {
    if (ctx.physics?.ready) ctx.physics.jump(vy);
    else if (ctx.drc) ctx.drc._kinVy = Math.max(ctx.drc._kinVy || 0, vy);
  }

  if (hit.playAnim !== false) {
    const kind = reactionKindFromHit(hit);
    ctx.character.playReaction?.(kind) ||
      ctx.character.playHitReaction?.() ||
      ctx.character.requestOneShot?.('hitReact');
  }
  return true;
}
