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
    ctx.character.playHitReaction?.() || ctx.character.requestOneShot?.('hitReact');
  }
  return true;
}
