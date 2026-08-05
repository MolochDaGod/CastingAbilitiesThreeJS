import { Quaternion, Vector3 } from 'three';

const _handWorld = new Vector3();
const _parentWorld = new Vector3();
const _toTarget = new Vector3();
const _from = new Vector3();
const _qa = new Quaternion();
const _qb = new Quaternion();

/**
 * Lightweight hand / cast-origin helpers for grudge6 kits.
 *
 * After AnimationMixer each frame:
 *  - expose R_hand_container / Bip001 R Hand as cast + weapon origin
 *  - optional soft aim of the hand toward a world target (cast path head)
 *
 * Not a second mixer. Full dual-foot CCD IK is optional fleet work.
 */
export class HandIK {
  /**
   * @param {import('three').Object3D} model kit root
   * @param {{ rHand?: import('three').Object3D|null, lHand?: import('three').Object3D|null, pelvis?: import('three').Object3D|null }} bones
   */
  constructor(model, bones = {}) {
    this.model = model;
    this.rHand = bones.rHand || null;
    this.lHand = bones.lHand || null;
    this.pelvis = bones.pelvis || null;
    this.enabled = true;
    /** Soft aim weight 0..1 toward world target while casting */
    this.aimWeight = 0;
    this._aimTarget = new Vector3();
  }

  setBones(bones) {
    this.rHand = bones.rHand || this.rHand;
    this.lHand = bones.lHand || this.lHand;
    this.pelvis = bones.pelvis || this.pelvis;
  }

  /** World-space cast / weapon spawn point. */
  getCastOrigin(out = new Vector3()) {
    if (this.rHand) {
      this.rHand.getWorldPosition(out);
      return out;
    }
    this.model.getWorldPosition(out);
    out.y += 1.35;
    return out;
  }

  getCastQuaternion(out = new Quaternion()) {
    if (this.rHand) {
      this.rHand.getWorldQuaternion(out);
      return out;
    }
    this.model.getWorldQuaternion(out);
    return out;
  }

  setAimTarget(x, y, z, weight = 0.4) {
    this._aimTarget.set(x, y, z);
    this.aimWeight = weight;
  }

  clearAim() {
    this.aimWeight = 0;
  }

  /**
   * Soft-rotate hand so bone→child (or hand local +Z) leans toward aim target.
   * Runs after mixer so it layers on top of cast/idle clips.
   */
  update() {
    if (!this.enabled || this.aimWeight < 1e-3 || !this.rHand) return;

    const hand = this.rHand;
    hand.getWorldPosition(_handWorld);
    _toTarget.copy(this._aimTarget).sub(_handWorld);
    if (_toTarget.lengthSq() < 1e-8) return;
    _toTarget.normalize();

    // Prefer bone→child as "current forward"
    const child = hand.children.find((c) => c.isBone) || hand.children[0];
    if (child) {
      child.getWorldPosition(_from).sub(_handWorld);
      if (_from.lengthSq() < 1e-8) _from.set(0, 0, 1);
      else _from.normalize();
    } else {
      _from.set(0, 0, 1).applyQuaternion(hand.getWorldQuaternion(_qa));
    }

    _qb.setFromUnitVectors(_from, _toTarget);
    hand.getWorldQuaternion(_qa);
    _qa.premultiply(_qb);

    if (hand.parent) {
      hand.parent.getWorldQuaternion(_qb).invert();
      _qa.premultiply(_qb);
    }

    hand.quaternion.slerp(_qa, Math.min(1, this.aimWeight * 0.45));
  }
}
