import { Quaternion, Vector3 } from 'three';

const _boneW = new Vector3();
const _target = new Vector3();
const _from = new Vector3();
const _qa = new Quaternion();
const _qb = new Quaternion();
const _delta = new Vector3();

/**
 * Post-mixer ride IK for Toon RTS Bip001 on the windsurf / hoverboard.
 *
 * Sockets come from public/models/ride/ride.manifest.json (mapped from the
 * sail/deck IK reference graph):
 *  - footL / footR → Bip001 L/R Foot (plant on deck)
 *  - sailRail / sailBoom* → R Hand (grip boom/rail)
 *  - optional L Hand on secondary boom
 *
 * Not a second AnimationMixer — soft aim after mixer.update, same pattern as HandIK.
 */
export class RideIK {
  /**
   * @param {import('three').Object3D} model kit root
   */
  constructor(model) {
    this.model = model;
    this.enabled = false;
    this.weight = 0; // 0..1 blend in
    this.footWeight = 0.85;
    this.handWeight = 0.7;

    this.footL = null;
    this.footR = null;
    this.handR = null;
    this.handL = null;
    this.calfL = null;
    this.calfR = null;

    /** @type {Record<string, Vector3>} world-space socket targets */
    this.targets = {
      footL: new Vector3(),
      footR: new Vector3(),
      sailRail: new Vector3(),
      sailBoomL: new Vector3(),
      sailBoomR: new Vector3()
    };

    this._resolveBones(model);
  }

  _resolveBones(root) {
    const map = new Map();
    root.traverse((n) => {
      if (n.isBone || n.type === 'Bone') map.set(n.name, n);
    });
    const pick = (...names) => {
      for (const n of names) {
        if (map.has(n)) return map.get(n);
        for (const [k, v] of map) {
          if (k.toLowerCase().includes(n.toLowerCase().replace(/^bip001\s*/i, ''))) return v;
        }
      }
      return null;
    };

    this.footL = pick('Bip001 L Foot', 'L Foot', 'LeftFoot');
    this.footR = pick('Bip001 R Foot', 'R Foot', 'RightFoot');
    this.calfL = pick('Bip001 L Calf', 'L Calf', 'LeftLeg');
    this.calfR = pick('Bip001 R Calf', 'R Calf', 'RightLeg');
    this.handR =
      pick('R_hand_container', 'Bip001 R Hand', 'R Hand', 'RightHand') || null;
    this.handL =
      pick('L_hand_container', 'Bip001 L Hand', 'L Hand', 'LeftHand') || null;
  }

  /**
   * @param {Record<string, {x:number,y:number,z:number}|Vector3>} worldSockets
   */
  setTargets(worldSockets) {
    for (const [key, v] of Object.entries(worldSockets || {})) {
      if (!this.targets[key]) this.targets[key] = new Vector3();
      if (v.isVector3) this.targets[key].copy(v);
      else this.targets[key].set(v.x, v.y, v.z);
    }
  }

  setActive(active, blend = 0.2) {
    this.enabled = !!active;
    if (!active) this.weight = Math.max(0, this.weight - blend);
  }

  /**
   * Call after mixer.update. Soft-plants feet and pulls hands to boom/rail.
   * @param {number} dt
   */
  update(dt) {
    if (!this.enabled && this.weight <= 1e-3) return;
    const target = this.enabled ? 1 : 0;
    this.weight += (target - this.weight) * Math.min(1, dt * 6);
    if (this.weight < 1e-3) return;

    const fw = this.footWeight * this.weight;
    const hw = this.handWeight * this.weight;

    if (this.footL && this.targets.footL) this._aimBone(this.footL, this.targets.footL, fw * 0.9);
    if (this.footR && this.targets.footR) this._aimBone(this.footR, this.targets.footR, fw * 0.9);

    // Slight calf pull so ankles reach deck without full two-bone CCD
    if (this.calfL && this.targets.footL) this._pullToward(this.calfL, this.targets.footL, fw * 0.25);
    if (this.calfR && this.targets.footR) this._pullToward(this.calfR, this.targets.footR, fw * 0.25);

    // Primary hand on sail rail (boom grip); secondary on left boom if present
    if (this.handR && this.targets.sailRail) {
      this._aimBone(this.handR, this.targets.sailRail, hw);
    }
    if (this.handL && this.targets.sailBoomL) {
      this._aimBone(this.handL, this.targets.sailBoomL, hw * 0.75);
    }
  }

  _aimBone(bone, worldTarget, w) {
    if (w < 1e-3) return;
    bone.getWorldPosition(_boneW);
    _toTargetFrom(_boneW, worldTarget, _target);
    if (_target.lengthSq() < 1e-10) return;
    _target.normalize();

    const child = bone.children.find((c) => c.isBone) || bone.children[0];
    if (child) {
      child.getWorldPosition(_from).sub(_boneW);
      if (_from.lengthSq() < 1e-10) _from.set(0, -1, 0);
      else _from.normalize();
    } else {
      _from.set(0, -1, 0);
    }

    _qb.setFromUnitVectors(_from, _target);
    bone.getWorldQuaternion(_qa);
    _qa.premultiply(_qb);
    if (bone.parent) {
      bone.parent.getWorldQuaternion(_qb).invert();
      _qa.premultiply(_qb);
    }
    bone.quaternion.slerp(_qa, Math.min(1, w));
  }

  _pullToward(bone, worldTarget, w) {
    if (w < 1e-3 || !bone.parent) return;
    bone.getWorldPosition(_boneW);
    _delta.copy(worldTarget).sub(_boneW);
    // Convert small world delta into parent-local translation nudge on bone
    bone.parent.worldToLocal(_target.copy(worldTarget));
    bone.parent.worldToLocal(_from.copy(_boneW));
    _delta.copy(_target).sub(_from).multiplyScalar(w * 0.15);
    bone.position.add(_delta);
  }
}

function _toTargetFrom(from, to, out) {
  out.copy(to).sub(from);
}
