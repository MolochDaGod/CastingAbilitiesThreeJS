/**
 * Procedural flintlock reload pose — post-mixer bone/weapon overlay.
 *
 * Not a second AnimationMixer. Layers on R_hand WeaponAttach + L_hand:
 *  1) Rotate gun toward body midline (chest)
 *  2) Off-hand reaches to barrel mouth
 *  3) Tilt barrel up slightly (powder / power-shot refill feel)
 *
 * @see config/pistolAnimSsot.js · FLINTLOCK_RELOAD
 */

import { MathUtils, Quaternion, Vector3 } from 'three';
import { FLINTLOCK_RELOAD } from '../config/pistolAnimSsot.js';

const _chest = new Vector3();
const _handW = new Vector3();
const _muzzleW = new Vector3();
const _toMid = new Vector3();
const _fwd = new Vector3();
const _right = new Vector3();
const _qa = new Quaternion();
const _qb = new Quaternion();
const _qc = new Quaternion();
const _bindAttachQ = new Quaternion();
const _bindLHandQ = new Quaternion();
const _tmp = new Vector3();
const _up = new Vector3(0, 1, 0);

/**
 * @typedef {object} ReloadOpts
 * @property {number} [durationSec]
 * @property {number} [barrelTiltDeg]  muzzle up during pour
 * @property {number} [gunInWeight]    how hard gun pulls to chest (0..1)
 * @property {boolean} [power]         longer power-shot refill
 */

export class PistolReloadPose {
  constructor() {
    this.active = false;
    this.t = 0;
    this.duration = FLINTLOCK_RELOAD.durationSec;
    this.barrelTiltDeg = FLINTLOCK_RELOAD.barrelTiltDeg;
    this.gunInWeight = FLINTLOCK_RELOAD.gunInWeight;
    this.power = false;
    /** @type {import('./CharacterController.js').CharacterController|null} */
    this.character = null;
    this._hasBind = false;
  }

  /**
   * @param {import('./CharacterController.js').CharacterController} character
   * @param {ReloadOpts} [opts]
   */
  start(character, opts = {}) {
    if (!character) return false;
    this.character = character;
    this.power = !!opts.power;
    this.duration = Number(
      opts.durationSec ??
        (this.power ? FLINTLOCK_RELOAD.powerDurationSec : FLINTLOCK_RELOAD.durationSec)
    );
    this.barrelTiltDeg = Number(opts.barrelTiltDeg ?? FLINTLOCK_RELOAD.barrelTiltDeg);
    this.gunInWeight = Number(opts.gunInWeight ?? FLINTLOCK_RELOAD.gunInWeight);
    this.t = 0;
    this.active = true;

    const attach = character.weaponAttach || findWeaponAttach(character);
    const lHand = character.bones?.lHand;
    if (attach) {
      _bindAttachQ.copy(attach.quaternion);
      attach.userData._reloadBindQ = _bindAttachQ.clone();
    }
    if (lHand) {
      _bindLHandQ.copy(lHand.quaternion);
      lHand.userData._reloadBindQ = _bindLHandQ.clone();
    }
    this._hasBind = !!(attach || lHand);
    character._gaitLocked = true;
    character._oneShotTimer = Math.max(character._oneShotTimer || 0, this.duration * 0.95);
    character.animState = 'reload';
    // Prefer draw/cast clip under reload for arm motion while procedural layers gun
    character.requestOneShot?.('reload') ||
      character.requestOneShot?.('draw') ||
      character.requestOneShot?.('cast') ||
      character.playLibraryClip?.('draw');
    return true;
  }

  stop() {
    if (!this.active) return;
    this._restoreBind();
    this.active = false;
    this.t = 0;
    if (this.character) {
      this.character._gaitLocked = false;
      if (this.character.animState === 'reload') this.character.animState = 'idle';
    }
  }

  _restoreBind() {
    const ch = this.character;
    if (!ch) return;
    const attach = ch.weaponAttach || findWeaponAttach(ch);
    const lHand = ch.bones?.lHand;
    if (attach?.userData?._reloadBindQ) {
      attach.quaternion.copy(attach.userData._reloadBindQ);
    }
    if (lHand?.userData?._reloadBindQ) {
      lHand.quaternion.copy(lHand.userData._reloadBindQ);
    }
  }

  /**
   * Post-mixer. Call after AnimationMixer.update.
   * @param {number} dt
   */
  update(dt) {
    if (!this.active || !this.character) return;
    this.t += dt;
    const u = MathUtils.clamp(this.t / Math.max(0.05, this.duration), 0, 1);

    // Envelope: ease in → hold pour → ease out
    let w;
    if (u < 0.22) w = easeOutCubic(u / 0.22);
    else if (u < 0.62) w = 1;
    else w = 1 - easeInCubic((u - 0.62) / 0.38);

    const ch = this.character;
    const attach = ch.weaponAttach || findWeaponAttach(ch);
    const rHand = ch.bones?.rHand;
    const lHand = ch.bones?.lHand;
    const root = ch.root || ch.model;

    // Chest midline world target
    if (root) {
      root.getWorldPosition(_chest);
      _chest.y += (ch.height || 1.8) * 0.58;
      // Slightly in front of torso
      const yaw = ch.facing || 0;
      _chest.x += Math.sin(yaw) * 0.12;
      _chest.z += Math.cos(yaw) * 0.12;
    }

    // ── Gun: rotate toward body middle + barrel tilt up ──────────────
    if (attach && rHand) {
      const bindQ = attach.userData._reloadBindQ || attach.quaternion;
      attach.getWorldPosition(_handW);

      // Direction from grip to chest midline (bring gun in)
      _toMid.copy(_chest).sub(_handW);
      if (_toMid.lengthSq() > 1e-8) {
        _toMid.normalize();
        // Prefer current attach "up/long" as barrel axis proxy
        const muzzle = attach.userData?.muzzle;
        if (muzzle) {
          muzzle.getWorldPosition(_muzzleW);
          _fwd.copy(_muzzleW).sub(_handW);
          if (_fwd.lengthSq() < 1e-8) _fwd.set(0, 0, 1);
          else _fwd.normalize();
        } else {
          _fwd.set(0, 1, 0).applyQuaternion(attach.getWorldQuaternion(_qa));
          if (_fwd.lengthSq() < 1e-8) _fwd.set(0, 0, 1);
          else _fwd.normalize();
        }

        // Blend barrel direction toward chest for "gun into body middle"
        _tmp.copy(_fwd).lerp(_toMid, this.gunInWeight * w);
        if (_tmp.lengthSq() > 1e-8) _tmp.normalize();
        _qb.setFromUnitVectors(_fwd, _tmp);

        // Barrel tilt up (powder pour) — pitch around hand local right
        const tilt = MathUtils.degToRad(this.barrelTiltDeg) * w;
        rHand.getWorldQuaternion(_qa);
        _right.set(1, 0, 0).applyQuaternion(_qa);
        if (_right.lengthSq() < 1e-8) _right.set(1, 0, 0);
        else _right.normalize();
        // Prefer axis perpendicular to barrel × up so muzzle lifts
        _right.crossVectors(_tmp, _up);
        if (_right.lengthSq() < 1e-8) _right.set(1, 0, 0);
        else _right.normalize();
        _qc.setFromAxisAngle(_right, tilt);

        attach.getWorldQuaternion(_qa);
        _qa.premultiply(_qb).premultiply(_qc);
        if (attach.parent) {
          attach.parent.getWorldQuaternion(_qb).invert();
          _qa.premultiply(_qb);
        }
        // Blend from bind
        attach.quaternion.copy(bindQ).slerp(_qa, Math.min(1, w * 0.92));
      }
    }

    // ── Off-hand: move toward barrel muzzle ──────────────────────────
    if (lHand && attach) {
      const bindL = lHand.userData._reloadBindQ || lHand.quaternion;
      const muzzle = attach.userData?.muzzle || attach;
      muzzle.getWorldPosition(_muzzleW);
      // Reach slightly short of muzzle (fingers at pan / barrel mouth)
      _muzzleW.y += 0.02;
      lHand.getWorldPosition(_handW);
      _toMid.copy(_muzzleW).sub(_handW);
      if (_toMid.lengthSq() > 1e-8) {
        _toMid.normalize();
        const child = lHand.children.find((c) => c.isBone) || lHand.children[0];
        if (child) {
          child.getWorldPosition(_fwd).sub(_handW);
          if (_fwd.lengthSq() < 1e-8) _fwd.set(0, 0, 1);
          else _fwd.normalize();
        } else {
          _fwd.set(0, 0, 1).applyQuaternion(lHand.getWorldQuaternion(_qa));
        }
        _qb.setFromUnitVectors(_fwd, _toMid);
        lHand.getWorldQuaternion(_qa);
        _qa.premultiply(_qb);
        if (lHand.parent) {
          lHand.parent.getWorldQuaternion(_qb).invert();
          _qa.premultiply(_qb);
        }
        lHand.quaternion.copy(bindL).slerp(_qa, Math.min(1, w * 0.85));
      }
    }

    if (u >= 1) {
      this._restoreBind();
      this.active = false;
      this.t = 0;
      if (ch.animState === 'reload') ch.animState = 'idle';
      ch._gaitLocked = false;
    }
  }
}

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}
function easeInCubic(t) {
  return t * t * t;
}

/**
 * @param {import('./CharacterController.js').CharacterController} character
 * @returns {import('three').Object3D|null}
 */
export function findWeaponAttach(character) {
  if (character?.weaponAttach) return character.weaponAttach;
  const hand = character?.bones?.rHand;
  if (!hand) return null;
  for (const c of hand.children) {
    if (c.userData?.weaponAttach || c.name === 'WeaponAttach') return c;
  }
  let found = null;
  hand.traverse((o) => {
    if (!found && (o.userData?.weaponAttach || o.name === 'WeaponAttach')) found = o;
  });
  return found;
}

/**
 * World-space muzzle (barrel tip) from WeaponAttach marker or long-axis tip.
 * @param {import('three').Object3D|null} attach
 * @param {import('three').Vector3} [out]
 */
export function getMuzzleWorld(attach, out = new Vector3()) {
  if (!attach) return out.set(0, 0, 0);
  const m = attach.userData?.muzzle;
  if (m) {
    m.getWorldPosition(out);
    return out;
  }
  attach.getWorldPosition(out);
  return out;
}

/**
 * Barrel forward unit vector (grip → muzzle).
 * @param {import('three').Object3D|null} attach
 * @param {import('three').Vector3} [out]
 */
export function getBarrelForward(attach, out = new Vector3()) {
  if (!attach) return out.set(0, 0, 1);
  const m = attach.userData?.muzzle;
  if (m) {
    attach.getWorldPosition(_handW);
    m.getWorldPosition(_muzzleW);
    out.copy(_muzzleW).sub(_handW);
    if (out.lengthSq() < 1e-8) out.set(0, 0, 1);
    else out.normalize();
    return out;
  }
  out.set(0, 0, 1).applyQuaternion(attach.getWorldQuaternion(_qa));
  if (out.lengthSq() < 1e-8) out.set(0, 0, 1);
  else out.normalize();
  return out;
}

