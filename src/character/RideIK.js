import { MathUtils, Quaternion, Vector3 } from 'three';

/**
 * Post-mixer ride IK for Toon RTS Bip001 on the windsurf / hoverboard.
 *
 * Sockets from public/models/ride/ride.manifest.json:
 *  - footL / footR → plant on deck
 *  - sailRail → primary hand (R) on boom metal bar
 *  - sailBoomL → secondary hand (L) on boom
 *
 * Gated by CharacterController.setRideActive — never runs during combat gait.
 * Not a second AnimationMixer: soft two-bone aim after mixer.update only.
 */

const _root = new Vector3();
const _mid = new Vector3();
const _end = new Vector3();
const _target = new Vector3();
const _pole = new Vector3();
const _toTarget = new Vector3();
const _elbow = new Vector3();
const _dir = new Vector3();
const _from = new Vector3();
const _qa = new Quaternion();
const _qb = new Quaternion();
const _qc = new Quaternion();
const _parentInv = new Quaternion();
const _up = new Vector3(0, 1, 0);
const _fwd = new Vector3(0, 0, 1);

function orientBone(bone, child, targetDir) {
  child.getWorldPosition(_from).sub(bone.getWorldPosition(_root));
  if (_from.lengthSq() < 1e-10) return;
  _from.normalize();

  bone.getWorldQuaternion(_qa);
  _qb.setFromUnitVectors(_from, targetDir);
  _qa.premultiply(_qb);
  if (bone.parent) {
    bone.parent.getWorldQuaternion(_parentInv).invert();
    bone.quaternion.copy(_parentInv.multiply(_qa));
  }
  bone.updateMatrixWorld(true);
}

/**
 * Two-bone IK: place end effector at world target; mid joint toward poleHint.
 * @returns {boolean}
 */
function solveTwoBone(upper, mid, end, target, poleHint) {
  if (!upper || !mid || !end) return false;

  upper.getWorldPosition(_root);
  mid.getWorldPosition(_mid);
  end.getWorldPosition(_end);

  const upperLen = _root.distanceTo(_mid);
  const lowerLen = _mid.distanceTo(_end);
  if (upperLen < 1e-4 || lowerLen < 1e-4) return false;

  _target.copy(target);
  _toTarget.subVectors(_target, _root);
  let dist = _toTarget.length();
  const maxReach = upperLen + lowerLen - 1e-3;
  const minReach = Math.abs(upperLen - lowerLen) + 1e-3;
  dist = MathUtils.clamp(dist, minReach, maxReach);
  if (_toTarget.lengthSq() < 1e-8) _toTarget.set(0, -1, 0);
  _toTarget.normalize();

  _pole.copy(poleHint);
  _pole.addScaledVector(_toTarget, -_pole.dot(_toTarget));
  if (_pole.lengthSq() < 1e-8) {
    _pole.crossVectors(_toTarget, _up);
    if (_pole.lengthSq() < 1e-8) _pole.set(1, 0, 0);
  }
  _pole.normalize();

  const along = (upperLen * upperLen - lowerLen * lowerLen + dist * dist) / (2 * dist);
  const out = Math.sqrt(Math.max(0, upperLen * upperLen - along * along));
  _elbow.copy(_root).addScaledVector(_toTarget, along).addScaledVector(_pole, out);

  orientBone(upper, mid, _dir.copy(_elbow).sub(_root).normalize());
  mid.getWorldPosition(_mid);
  orientBone(mid, end, _dir.copy(_target).sub(_mid).normalize());
  return true;
}

function pickBone(map, ...names) {
  for (const n of names) {
    if (map.has(n)) return map.get(n);
  }
  for (const n of names) {
    const needle = n.toLowerCase().replace(/^bip001[\s_]*/i, '').replace(/_/g, ' ');
    for (const [k, v] of map) {
      const key = k.toLowerCase().replace(/^bip001[\s_]*/i, '').replace(/_/g, ' ');
      if (key === needle || key.endsWith(needle) || k.toLowerCase().includes(needle)) return v;
    }
  }
  return null;
}

export class RideIK {
  /**
   * @param {import('three').Object3D} model kit root
   */
  constructor(model) {
    this.model = model;
    this.enabled = false;
    this.weight = 0;
    /** 0..1 how hard feet plant / hands grip */
    this.footWeight = 0.98;
    this.handWeight = 0.92;
    /** Blend rate toward enabled target (higher = snappier mount) */
    this.blendRate = 10;

    this.chains = {
      leftLeg: { upper: null, mid: null, end: null },
      rightLeg: { upper: null, mid: null, end: null },
      leftArm: { upper: null, mid: null, end: null },
      rightArm: { upper: null, mid: null, end: null }
    };
    this.hips = null;

    /** @type {Record<string, Vector3>} world-space socket targets */
    this.targets = {
      footL: new Vector3(),
      footR: new Vector3(),
      sailRail: new Vector3(),
      sailBoomL: new Vector3(),
      sailBoomR: new Vector3(),
      deckCenter: new Vector3()
    };

    this.valid = false;
    this._resolveBones(model);
  }

  _resolveBones(root) {
    if (!root) {
      this.valid = false;
      return;
    }
    this.model = root;
    const map = new Map();
    root.traverse((n) => {
      if (n.isBone || n.type === 'Bone') map.set(n.name, n);
    });

    this.chains.leftLeg = {
      upper: pickBone(map, 'Bip001 L Thigh', 'Bip001_L_Thigh', 'LeftUpLeg', 'mixamorig:LeftUpLeg'),
      mid: pickBone(map, 'Bip001 L Calf', 'Bip001_L_Calf', 'LeftLeg', 'mixamorig:LeftLeg'),
      end: pickBone(map, 'Bip001 L Foot', 'Bip001_L_Foot', 'LeftFoot', 'mixamorig:LeftFoot')
    };
    this.chains.rightLeg = {
      upper: pickBone(map, 'Bip001 R Thigh', 'Bip001_R_Thigh', 'RightUpLeg', 'mixamorig:RightUpLeg'),
      mid: pickBone(map, 'Bip001 R Calf', 'Bip001_R_Calf', 'RightLeg', 'mixamorig:RightLeg'),
      end: pickBone(map, 'Bip001 R Foot', 'Bip001_R_Foot', 'RightFoot', 'mixamorig:RightFoot')
    };
    this.chains.leftArm = {
      upper: pickBone(map, 'Bip001 L UpperArm', 'Bip001_L_UpperArm', 'LeftArm', 'mixamorig:LeftArm'),
      mid: pickBone(map, 'Bip001 L Forearm', 'Bip001_L_Forearm', 'LeftForeArm', 'mixamorig:LeftForeArm'),
      end: pickBone(
        map,
        'L_hand_container',
        'Bip001 L Hand',
        'Bip001_L_Hand',
        'LeftHand',
        'mixamorig:LeftHand'
      )
    };
    this.chains.rightArm = {
      upper: pickBone(map, 'Bip001 R UpperArm', 'Bip001_R_UpperArm', 'RightArm', 'mixamorig:RightArm'),
      mid: pickBone(map, 'Bip001 R Forearm', 'Bip001_R_Forearm', 'RightForeArm', 'mixamorig:RightForeArm'),
      end: pickBone(
        map,
        'R_hand_container',
        'Bip001 R Hand',
        'Bip001_R_Hand',
        'RightHand',
        'mixamorig:RightHand'
      )
    };
    this.hips = pickBone(map, 'Bip001 Pelvis', 'Bip001_Pelvis', 'Pelvis', 'Hips', 'mixamorig:Hips');
    // Bind local hip Y — grudge packs strip position tracks; mixer never restores this.
    // Absolute offset only (never accumulate hips.position.y -= each frame).
    this._hipBindY = this.hips ? this.hips.position.y : 0;

    const legs =
      this.chains.leftLeg.upper &&
      this.chains.leftLeg.end &&
      this.chains.rightLeg.upper &&
      this.chains.rightLeg.end;
    const arms =
      (this.chains.leftArm.upper && this.chains.leftArm.end) ||
      (this.chains.rightArm.upper && this.chains.rightArm.end);

    this.valid = !!(legs || arms);
    if (this.valid) {
      console.info('[RideIK] bound', {
        Lfoot: this.chains.leftLeg.end?.name,
        Rfoot: this.chains.rightLeg.end?.name,
        Lhand: this.chains.leftArm.end?.name,
        Rhand: this.chains.rightArm.end?.name,
        hips: this.hips?.name,
        hipBindY: this._hipBindY
      });
    } else {
      console.warn('[RideIK] no usable chains on kit');
    }
  }

  /** Re-index after kit reload. */
  rebind(model) {
    this._resolveBones(model);
  }

  /**
   * @param {Record<string, {x:number,y:number,z:number}|import('three').Vector3>} worldSockets
   */
  setTargets(worldSockets) {
    for (const [key, v] of Object.entries(worldSockets || {})) {
      if (!this.targets[key]) this.targets[key] = new Vector3();
      if (v && v.isVector3) this.targets[key].copy(v);
      else if (v && Number.isFinite(v.x)) this.targets[key].set(v.x, v.y, v.z);
    }
  }

  /**
   * @param {boolean} active
   */
  setActive(active) {
    this.enabled = !!active;
    if (!active && this.weight < 0.05) this.weight = 0;
  }

  /**
   * Call AFTER mixer.update. Plants feet on deck + hands on boom.
   * @param {number} dt
   * @param {{ boardForward?: Vector3, boardLeft?: Vector3, hipDrop?: number }} [opts]
   */
  update(dt, opts = {}) {
    if (!this.valid) return;
    if (!this.enabled && this.weight <= 1e-3) return;

    const target = this.enabled ? 1 : 0;
    this.weight += (target - this.weight) * Math.min(1, dt * this.blendRate);
    this.weight = MathUtils.clamp(this.weight, 0, 1);
    if (this.weight < 1e-3) return;

    const w = this.weight;
    const fw = this.footWeight * w;
    const hw = this.handWeight * w;

    // Soft hip drop so knees can bend onto deck straps.
    // MUST be absolute vs bind — rotation-only clips never rewrite bone.position.
    const hipDrop = opts.hipDrop ?? 0.1;
    if (this.hips && fw > 0.05) {
      const bindY = Number.isFinite(this._hipBindY) ? this._hipBindY : 0;
      this.hips.position.y = bindY - hipDrop * fw * 0.55;
      this.hips.updateMatrixWorld(true);
    } else if (this.hips && this.weight < 0.05 && Number.isFinite(this._hipBindY)) {
      this.hips.position.y = this._hipBindY;
    }

    const forward = opts.boardForward || _fwd;
    // Board left (windward); default +X if caller did not pass heading
    const leftDir = opts.boardLeft || new Vector3(1, 0, 0);

    // Legs: knees bend forward + slightly out
    if (this.targets.footL && this.chains.leftLeg.upper) {
      _pole
        .copy(forward)
        .multiplyScalar(0.55)
        .addScaledVector(leftDir, 0.4)
        .addScaledVector(_up, 0.2);
      this._blendSolve(this.chains.leftLeg, this.targets.footL, _pole, fw);
    }
    if (this.targets.footR && this.chains.rightLeg.upper) {
      _pole
        .copy(forward)
        .multiplyScalar(0.55)
        .addScaledVector(leftDir, -0.4)
        .addScaledVector(_up, 0.2);
      this._blendSolve(this.chains.rightLeg, this.targets.footR, _pole, fw);
    }

    // Hands: R → starboard boom, L → port boom (never same point — prevents arm cross)
    const handRTarget =
      this.targets.sailBoomR || this.targets.sailRail || this.targets.sailBoomL;
    const handLTarget =
      this.targets.sailBoomL || this.targets.sailRail || this.targets.sailBoomR;

    // Elbows out + slightly down so grip looks natural (boom at ~chest/shoulder)
    if (handRTarget && this.chains.rightArm.upper) {
      _pole
        .copy(leftDir)
        .multiplyScalar(-1.1)
        .addScaledVector(_up, -0.35)
        .addScaledVector(forward, 0.25);
      this._blendSolve(this.chains.rightArm, handRTarget, _pole, hw);
    }
    if (
      handLTarget &&
      this.chains.leftArm.upper &&
      (!handRTarget || handLTarget.distanceToSquared(handRTarget) > 0.01)
    ) {
      _pole
        .copy(leftDir)
        .multiplyScalar(1.1)
        .addScaledVector(_up, -0.35)
        .addScaledVector(forward, 0.25);
      this._blendSolve(this.chains.leftArm, handLTarget, _pole, hw * 0.95);
    }
  }

  _blendSolve(chain, target, pole, weight) {
    const { upper, mid, end } = chain;
    if (!upper || !mid || !end || weight < 1e-3) return;

    const u0 = upper.quaternion.clone();
    const m0 = mid.quaternion.clone();
    const e0 = end.quaternion.clone();

    solveTwoBone(upper, mid, end, target, pole);

    const u1 = upper.quaternion.clone();
    const m1 = mid.quaternion.clone();
    const e1 = end.quaternion.clone();
    upper.quaternion.copy(u0).slerp(u1, weight);
    mid.quaternion.copy(m0).slerp(m1, weight);
    end.quaternion.copy(e0).slerp(e1, weight);
    upper.updateMatrixWorld(true);
    mid.updateMatrixWorld(true);
    end.updateMatrixWorld(true);
  }
}
