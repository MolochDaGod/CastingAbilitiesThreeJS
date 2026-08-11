/**
 * Weapon sheath / unsheath runtime — hand ↔ stow bone reparent.
 *
 * Best practice (Casting lab · action RPG):
 *  1. Combat mesh attaches to **hand container** (R_hand_container / Bip001 R Hand)
 *  2. **Sheath** on traversal + mount: reparent to spine/hip stow sockets
 *  3. **Unsheath** on combat ready: idle, attack, cast, charge, reload, equip
 *  4. Hold-pose residual only while **drawn** (never fights stow transform)
 *  5. One mesh instance — never clone for stow (avoid double weapons)
 *
 * @see WeaponMeshAttach.js · weaponHoldPose.js · BackSlotEquip.findBackBone
 */

import { MathUtils, Vector3, Euler, Quaternion } from 'three';
import { findBackBone } from './BackSlotEquip.js';
import { getWeaponAttachFromHand } from './WeaponMeshAttach.js';

/** @typedef {'drawn'|'sheathed'} SheathState */

/**
 * Why the weapon should be sheathed.
 * Higher priority reasons win when mixed.
 * @typedef {'mount'|'ride'|'freeride'|'sprint'|'run'|'walk'|'air'|'mobility'|'manual'} SheathReason
 */

/**
 * Policy SSOT — toggle per product feel.
 * Default: sheath on walk/run/sprint + air + mount; unsheath idle/combat.
 */
export const WEAPON_SHEATH_POLICY = Object.freeze({
  /** Sheath while gait walk (1) */
  sheathOnWalk: true,
  /** Sheath while gait run (2) */
  sheathOnRun: true,
  /** Sheath while sprint flag (gait 2 + sprint) */
  sheathOnSprint: true,
  /** Sheath while ride / freeride / mount parented */
  sheathOnMount: true,
  /** Sheath while jump / fall / air loco */
  sheathOnAir: true,
  /** Sheath on dodge / roll / slide */
  sheathOnMobility: true,
  /** Blend time feel (visual only — reparent is instant) */
  blendHintSec: 0.12,
  /** Min seconds between sheath↔draw thrash (gait noise) */
  debounceSec: 0.18
});

/**
 * Per-profile stow pose on back/hip (local space of stow parent).
 * pos metres · euler degrees XYZ.
 */
export const STOW_POSES = Object.freeze({
  melee: {
    bone: 'hip',
    pos: [0.12, 0.05, -0.08],
    eulerDeg: [15, 95, 75],
    scale: 1
  },
  sword: {
    bone: 'hip',
    pos: [0.12, 0.05, -0.08],
    eulerDeg: [15, 95, 75],
    scale: 1
  },
  dagger: {
    bone: 'hip',
    pos: [0.1, 0.02, -0.06],
    eulerDeg: [10, 100, 80],
    scale: 1
  },
  staff: {
    bone: 'back',
    pos: [0.08, 0.12, -0.18],
    eulerDeg: [-25, 0, 12],
    scale: 1
  },
  wand: {
    bone: 'hip',
    pos: [0.1, 0.04, -0.05],
    eulerDeg: [20, 90, 60],
    scale: 1
  },
  bow: {
    bone: 'back',
    pos: [0.02, 0.18, -0.2],
    eulerDeg: [5, 0, 90],
    scale: 1
  },
  pistol: {
    bone: 'hip',
    pos: [0.14, 0.02, 0.02],
    eulerDeg: [-10, 90, 0],
    scale: 1
  },
  shield: {
    // Off-hand gear stays on arm — no sheath reparent
    bone: 'none',
    pos: [0, 0, 0],
    eulerDeg: [0, 0, 0],
    scale: 1
  },
  default: {
    bone: 'back',
    pos: [0.06, 0.1, -0.16],
    eulerDeg: [10, 180, 20],
    scale: 1
  }
});

/**
 * Anim / controller states that force **drawn** (combat override).
 */
const FORCE_DRAWN_STATES = new Set([
  'attack',
  'cast_loop',
  'charge',
  'parry',
  'block'
]);

/**
 * Anim states that force **sheathed** (mobility).
 */
const FORCE_SHEATH_STATES = new Set([
  'jump',
  'fall',
  'fallLoop',
  'fallLand',
  'fallRoll',
  'dodge',
  'roll',
  'slide'
]);

/**
 * @param {string|undefined} profile
 */
export function stowPoseForProfile(profile) {
  const p = String(profile || 'melee').toLowerCase();
  if (STOW_POSES[p]) return STOW_POSES[p];
  if (/sword|blade|axe|hammer|mace|spear|great/.test(p)) return STOW_POSES.melee;
  if (/staff|stave/.test(p)) return STOW_POSES.staff;
  if (/wand/.test(p)) return STOW_POSES.wand;
  if (/bow|crossbow/.test(p)) return STOW_POSES.bow;
  if (/pistol|gun|rifle|flint/.test(p)) return STOW_POSES.pistol;
  if (/shield/.test(p)) return STOW_POSES.shield;
  return STOW_POSES.default;
}

/**
 * Resolve whether policy wants sheathed given controller snapshot.
 * @param {{
 *   gait?: number,
 *   sprinting?: boolean,
 *   rideActive?: boolean,
 *   rideParented?: boolean,
 *   animState?: string,
 *   casting?: boolean,
 *   pistolReload?: boolean,
 *   oneShotActive?: boolean,
 *   policy?: typeof WEAPON_SHEATH_POLICY
 * }} snap
 * @returns {{ sheath: boolean, reason: string }}
 */
export function resolveSheathDesire(snap = {}) {
  const pol = { ...WEAPON_SHEATH_POLICY, ...(snap.policy || {}) };
  const state = String(snap.animState || 'idle');

  // Combat always wins — hands need the weapon
  if (snap.casting || snap.pistolReload || snap.oneShotActive) {
    return { sheath: false, reason: 'combat' };
  }
  if (FORCE_DRAWN_STATES.has(state)) {
    return { sheath: false, reason: state };
  }

  // Mount / freeride / vehicle
  if (pol.sheathOnMount && (snap.rideActive || snap.rideParented)) {
    return { sheath: true, reason: 'mount' };
  }

  // Air + mobility one-shots
  if (pol.sheathOnAir && (FORCE_SHEATH_STATES.has(state) || state.startsWith('fall'))) {
    return { sheath: true, reason: state };
  }
  if (pol.sheathOnMobility && (state === 'dodge' || state === 'roll' || state === 'slide')) {
    return { sheath: true, reason: state };
  }

  const g = Number(snap.gait) || 0;
  if (pol.sheathOnSprint && (snap.sprinting || g >= 2.5)) {
    return { sheath: true, reason: 'sprint' };
  }
  if (pol.sheathOnRun && g >= 2) {
    return { sheath: true, reason: 'run' };
  }
  if (pol.sheathOnWalk && g >= 1) {
    return { sheath: true, reason: 'walk' };
  }

  // Idle / combat ready
  return { sheath: false, reason: 'idle' };
}

/**
 * Runtime: reparents WeaponAttach between hand and stow bone.
 */
export class WeaponSheathRuntime {
  /**
   * @param {{
   *   getModel?: () => import('three').Object3D|null,
   *   getBones?: () => { rHand?: import('three').Object3D|null, lHand?: import('three').Object3D|null, pelvis?: import('three').Object3D|null },
   *   getAttach?: () => import('three').Object3D|null,
   *   setAttach?: (a: import('three').Object3D|null) => void,
   *   policy?: Partial<typeof WEAPON_SHEATH_POLICY>
   * }} [opts]
   */
  constructor(opts = {}) {
    this.getModel = opts.getModel || (() => null);
    this.getBones = opts.getBones || (() => ({}));
    this.getAttach = opts.getAttach || (() => null);
    this.setAttach = opts.setAttach || (() => {});
    this.policy = { ...WEAPON_SHEATH_POLICY, ...(opts.policy || {}) };

    /** @type {SheathState} */
    this.state = 'drawn';
    /** @type {string} */
    this.reason = 'init';
    /** @type {import('three').Object3D|null} */
    this._handParent = null;
    /** @type {import('three').Object3D|null} */
    this._stowParent = null;
    this._debounce = 0;
    this._lastDesire = false;
    this.enabled = true;
    /** Manual lock: null | true(sheath) | false(draw) */
    this._manual = null;
  }

  /** Rebind after kit swap. */
  rebind() {
    this._handParent = null;
    this._stowParent = null;
    // Prefer keep logical state; next tick will reparent
  }

  /**
   * Force sheath or draw (equip UI). Pass null to return to policy.
   * @param {boolean|null} sheath
   * @param {string} [reason]
   */
  setManual(sheath, reason = 'manual') {
    this._manual = sheath === null ? null : !!sheath;
    if (this._manual === null) return;
    if (this._manual) this.sheath(reason);
    else this.unsheath(reason);
  }

  get isSheathed() {
    return this.state === 'sheathed';
  }

  get isDrawn() {
    return this.state === 'drawn';
  }

  /**
   * Resolve hand + stow parents from kit.
   */
  _resolveParents(attach) {
    const bones = this.getBones() || {};
    const model = this.getModel();
    let hand = bones.rHand || null;
    if (!hand && attach?.parent) {
      // attach may already be on hand or stow
      const p = attach.parent;
      if (/hand/i.test(p.name || '') || p.userData?.isHandSocket) hand = p;
    }
    if (!hand && model) {
      model.traverse((n) => {
        if (hand) return;
        if (/R_hand_container/i.test(n.name || '') || /^Bip001[\s_]R[\s_]Hand$/i.test(n.name || '')) {
          hand = n;
        }
      });
    }
    this._handParent = hand;

    const pose = stowPoseForProfile(attach?.userData?.profile);
    let stow = null;
    if (pose.bone === 'hip') {
      stow = bones.pelvis || null;
      if (!stow && model) {
        model.traverse((n) => {
          if (stow) return;
          if (/^Bip001[\s_]Pelvis$/i.test(n.name || '') || /pelvis/i.test(n.name || '')) stow = n;
        });
      }
    }
    if (!stow && pose.bone !== 'none') {
      stow = findBackBone(model) || bones.pelvis || null;
    }
    this._stowParent = stow;
    return { hand, stow, pose };
  }

  /**
   * @param {string} [reason]
   * @returns {boolean}
   */
  sheath(reason = 'policy') {
    if (!this.enabled) return false;
    const attach = this.getAttach() || null;
    if (!attach) return false;
    if (attach.userData?.profile === 'shield') return false;

    const { hand, stow, pose } = this._resolveParents(attach);
    if (!stow || pose.bone === 'none') {
      // No stow bone — hide in hand as soft sheath
      if (this.state !== 'sheathed') {
        attach.visible = false;
        this.state = 'sheathed';
        this.reason = reason + ':hidden';
      }
      return true;
    }

    if (this.state === 'sheathed' && attach.parent === stow) {
      this.reason = reason;
      return true;
    }

    // Remember hand for unsheath
    if (hand) this._handParent = hand;
    else if (attach.parent && attach.parent !== stow) this._handParent = attach.parent;

    stow.attach(attach);
    const e = pose.eulerDeg || [0, 0, 0];
    const p = pose.pos || [0, 0, 0];
    attach.position.set(p[0] || 0, p[1] || 0, p[2] || 0);
    attach.rotation.set(
      MathUtils.degToRad(e[0] || 0),
      MathUtils.degToRad(e[1] || 0),
      MathUtils.degToRad(e[2] || 0)
    );
    if (pose.scale && pose.scale !== 1) attach.scale.setScalar(pose.scale);
    else attach.scale.set(1, 1, 1);
    attach.visible = true;
    attach.userData.sheathed = true;
    attach.userData.sheathReason = reason;
    this.state = 'sheathed';
    this.reason = reason;
    this.setAttach(attach);
    return true;
  }

  /**
   * @param {string} [reason]
   * @returns {boolean}
   */
  unsheath(reason = 'policy') {
    if (!this.enabled) return false;
    const attach = this.getAttach() || null;
    if (!attach) return false;

    const { hand } = this._resolveParents(attach);
    const target = hand || this._handParent;
    if (!target) {
      attach.visible = true;
      attach.userData.sheathed = false;
      this.state = 'drawn';
      this.reason = reason + ':no-hand';
      return false;
    }

    if (this.state === 'drawn' && attach.parent === target) {
      attach.visible = true;
      attach.userData.sheathed = false;
      this.reason = reason;
      return true;
    }

    target.attach(attach);
    // Grip residual comes from weaponHoldPose post-mixer — reset local to grip identity
    attach.position.set(0, 0, 0);
    attach.rotation.set(0, 0, 0);
    attach.scale.set(1, 1, 1);
    attach.visible = true;
    attach.userData.sheathed = false;
    attach.userData.sheathReason = reason;
    this.state = 'drawn';
    this.reason = reason;
    this.setAttach(attach);
    return true;
  }

  /**
   * Per-frame policy evaluation (call from CharacterController.update).
   * @param {{
   *   gait?: number,
   *   sprinting?: boolean,
   *   rideActive?: boolean,
   *   rideParented?: boolean,
   *   animState?: string,
   *   casting?: boolean,
   *   pistolReload?: boolean,
   *   oneShotActive?: boolean,
   *   dt?: number
   * }} snap
   */
  update(snap = {}) {
    if (!this.enabled) return;
    const dt = snap.dt ?? 0;
    if (this._debounce > 0) this._debounce -= dt;

    // Refresh attach pointer if equip re-bound under hand
    let attach = this.getAttach();
    if (!attach) {
      const bones = this.getBones() || {};
      attach = getWeaponAttachFromHand(bones.rHand) || null;
      if (attach) this.setAttach(attach);
    }
    if (!attach) return;

    if (this._manual !== null) {
      if (this._manual && this.state !== 'sheathed') this.sheath('manual');
      if (!this._manual && this.state !== 'drawn') this.unsheath('manual');
      return;
    }

    const desire = resolveSheathDesire({ ...snap, policy: this.policy });
    if (desire.sheath === this._lastDesire && this._debounce > 0) return;
    if (desire.sheath === (this.state === 'sheathed')) {
      this._lastDesire = desire.sheath;
      this.reason = desire.reason;
      return;
    }

    // Debounce only gait-driven thrash (walk↔idle), not mount/combat
    const hard =
      desire.reason === 'mount' ||
      desire.reason === 'combat' ||
      FORCE_DRAWN_STATES.has(desire.reason) ||
      FORCE_SHEATH_STATES.has(desire.reason);
    if (!hard && this._debounce > 0) return;

    if (desire.sheath) this.sheath(desire.reason);
    else this.unsheath(desire.reason);
    this._lastDesire = desire.sheath;
    this._debounce = this.policy.debounceSec;
  }
}
