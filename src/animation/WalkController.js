import { MathUtils, Vector3 } from 'three';
import { settings } from '../config/settings.js';
import { HoverboardRide } from '../effects/HoverboardRide.js';
import { DecalType } from '../effects/GroundDecals.js';
import { getColor } from '../utils/color.js';
import { clamp, damp, Easing, saturate } from '../utils/math.js';

const TAU = Math.PI * 2;

const _p = new Vector3();
const _t = new Vector3();
const _side = new Vector3();
const _deck = new Vector3();
const _footL = new Vector3();
const _footR = new Vector3();

const wrapAngle = (angle) => MathUtils.euclideanModulo(angle + Math.PI, TAU) - Math.PI;

/** Local phase machine — also report every transition to SessionState.setRidePhase */
export const Phase = Object.freeze({
  IDLE: 'idle',
  LEAP: 'leap', // frontflip deploy → board
  RIDE: 'ride', // path-follow
  FREERIDE: 'freeride', // WASD boat (tslda-like)
  DISMOUNT: 'dismount'
});

/**
 * Walk / windsurf mode — board is a tiny boat (back-slot deployable).
 *
 * Deploy contract (new):
 *  1. Frontflip off land; sail/board materializes from back mid-flip
 *  2. Land feet on deck sockets · hands on sail boom (RideIK)
 *  3. Path ride OR freeride WASD (tslda / Wind Waker boat feel)
 *  4. Soft-body lean + wave follow (rigged body, ragdoll-lite to ocean)
 *  5. Space hop; skills allowed while freeride when settings.walk.skillsWhileRide
 *
 * Mount contract (until dismount):
 *  - Character reparented to unscaled RideSeat (never boardRoot scale)
 *  - RideIK feet→footL/R, hands→sailRail/boom (post-mixer; absolute hip Y)
 *  - Physics capsule glued to deck
 *  - Back-slot stow mesh hidden while vehicle live
 *
 * Ref: https://github.com/Robpayot/tslda · docs/WINDSURF_RIDE_SSOT.md
 */
export class WalkController {
  /**
   * @param {import('./CharacterController.js').CharacterController} character
   * @param {object} ctx { scene, particles, lights, decals, bursts, shake, physics?, water?, session? }
   */
  constructor(character, ctx) {
    this.character = character;
    this.ctx = ctx;
    /** @type {import('../core/SessionState.js').SessionState|null} */
    this.session = ctx.session || null;

    this.scooter = new HoverboardRide(ctx, ctx.assets || null);
    ctx.scene.add(this.scooter.group);

    // Init without emit (session may attach later)
    this.phase = Phase.IDLE;
    this.curve = null;
    this.length = 0;
    this.distance = 0;
    this.speed = 0;
    this._turnRate = 0;

    this._from = new Vector3();
    this._target = new Vector3();
    this._home = new Vector3();
    this._exit = new Vector3();
    this._anchor = new Vector3();
    this._vel = new Vector3(); // freeride XZ velocity
    this._vy = 0;
    this._leapTime = 0;
    this._leapDuration = 0;
    this._rideTime = 0;
    this._dismountTime = 0;
    this._yaw = 0;
    this._lean = 0;
    this._landStanding = false;
    this._mounted = false;
    this._rideShakeT = 0;
    this._sailSpawned = false;
    this._wasJump = false;
    /** @type {Set<string>|null} live keys from App while freeride */
    this._keys = null;
  }

  get active() {
    return this.phase !== Phase.IDLE;
  }

  get freeriding() {
    return this.phase === Phase.FREERIDE;
  }

  /**
   * Single phase transition — reports to SessionState for gates/HUD.
   * @param {string} next
   */
  _setPhase(next) {
    if (this.phase === next) return;
    this.phase = next;
    this.session?.setRidePhase?.(next);
  }

  /** Optional inject after construction. */
  setSession(session) {
    this.session = session || null;
    this.session?.setRidePhase?.(this.phase, { silent: true });
  }

  get ballHeight() {
    return this.scooter.deckHeight || settings.walk.hover || 0.06;
  }

  get seatHeight() {
    const stand = settings.walk.standOffset ?? 0.02;
    return this.ballHeight + stand;
  }

  async load(assets) {
    await this.scooter.load(assets);
  }

  /** @param {import('../physics/PhysicsWorld.js').PhysicsWorld|null} physics */
  setPhysics(physics) {
    this.ctx.physics = physics || null;
  }

  /** Live keyboard for freeride (App passes InputManager.keys each frame). */
  setKeys(keys) {
    this._keys = keys || null;
  }

  /**
   * Quick ocean deploy: frontflip + sail from back, freeride WASD.
   * Back-slot windsurf utility — no path required.
   * @param {{ yaw?: number }} [opts]
   */
  beginFreeride(opts = {}) {
    this._dismountRider(true);
    this.scooter.cancel();
    this.character.setRideActive?.(false);

    if (!this.scooter.ready && this.ctx.assets) {
      this.scooter.load(this.ctx.assets).catch((err) => console.warn('[Walk] board load', err));
    }

    this.curve = null;
    this.length = 0;
    this.distance = 0;
    this.speed = 0;
    this._vel.set(0, 0, 0);
    this._vy = 0;
    this._rideTime = 0;
    this._landStanding = false;
    this._turnRate = 0;
    this._rideShakeT = 0;
    this._sailSpawned = false;
    this._wasJump = false;

    this._home.copy(this.character.position);
    this._from.copy(this.character.position);
    const yaw = Number.isFinite(opts.yaw) ? opts.yaw : this.character.facing;
    this._yaw = yaw;
    // Land a few metres into water along facing
    const dist = 2.8;
    this._target.set(
      this._from.x + Math.sin(yaw) * dist,
      this.seatHeight,
      this._from.z + Math.cos(yaw) * dist
    );
    this._startLeap({ freeride: true, frontflip: true });
    return true;
  }

  begin(curve) {
    const length = curve.getLength();
    if (length < 0.5) return false;

    this._dismountRider(true);
    this.scooter.cancel();
    this.character.setRideActive?.(false);

    if (!this.scooter.ready && this.ctx.assets) {
      this.scooter.load(this.ctx.assets).catch((err) => console.warn('[Walk] board load', err));
    }

    this.curve = curve;
    this.length = length;
    this.distance = 0;
    this.speed = 0;
    this._vel.set(0, 0, 0);
    this._vy = 0;
    this._rideTime = 0;
    this._landStanding = false;
    this._turnRate = 0;
    this._rideShakeT = 0;
    this._sailSpawned = false;
    this._wasJump = false;

    if (!this.active) this._home.copy(this.character.position);

    this._from.copy(this.character.position);
    curve.getPointAt(0, this._target).setY(this.seatHeight);
    this._startLeap({ freeride: false, frontflip: true });
    return true;
  }

  /**
   * Hard abort: unparent rider, remove vehicle from scene, restore land loco.
   * Prefer {@link requestDismount} for play (soft step-off + board fade).
   */
  cancel() {
    if (!this.active && !this._mounted && !this.scooter.active) return;
    this._exitRideHard({ snapFeet: true });
  }

  /**
   * Player get-off while mounted (freeride / path ride).
   * Soft step-off → board release (fade out) → land controller normal.
   * @returns {boolean} true if dismount started
   */
  requestDismount() {
    if (this.phase !== Phase.RIDE && this.phase !== Phase.FREERIDE) return false;
    if (this.phase === Phase.DISMOUNT) return true;
    this._startDismount();
    return true;
  }

  /**
   * Full teardown: vehicle gone + character controller land state.
   * @param {{ snapFeet?: boolean }} [opts]
   */
  _exitRideHard(opts = {}) {
    const snapFeet = opts.snapFeet !== false;
    this._dismountRider(snapFeet);
    // Instant remove from scene (no lingering vehicle mesh)
    this.scooter.cancel();
    this.character.setRideActive?.(false);
    this.character.setRideParented?.(false);
    this.character.restoreFromRide?.(snapFeet ? { y: 0 } : undefined);
    this._setPhase(Phase.IDLE);
    this.curve = null;
    this._vel.set(0, 0, 0);
    this._vy = 0;
    this._mounted = false;
    this._sailSpawned = false;
    this._softHip = 0;
    this.character.setPose?.('idle', settings.walk.poseBlend);
    this._syncPhysicsToCharacter();
  }

  update(dt) {
    if (dt > 0) {
      switch (this.phase) {
        case Phase.LEAP:
          this._updateLeap(dt);
          break;
        case Phase.RIDE:
          this._updateRide(dt);
          break;
        case Phase.FREERIDE:
          this._updateFreeride(dt);
          break;
        case Phase.DISMOUNT:
          this._updateDismount(dt);
          break;
        default:
          break;
      }
    }

    // Board motion always when visible (includes releasing death)
    if (this.scooter.active) {
      _side.set(Math.cos(this._yaw), 0, -Math.sin(this._yaw));
      this.scooter.update(
        dt,
        this._anchor,
        _side,
        this.distance,
        this.speed,
        this._yaw,
        this._turnRate
      );
    }

    // After board bank/sway: mount pose + sockets (IK applied post-mixer via applyRiderIk)
    if ((this.phase === Phase.RIDE || this.phase === Phase.FREERIDE) && this._mounted) {
      this._syncMountedRider(dt);
    } else if (this.scooter.active && this.scooter.ready && this.phase === Phase.LEAP) {
      // Pre-land: aim hands/feet toward board sockets once board exists
      if (this.scooter.group.visible && this.scooter._birth > 0.2) {
        this.character.setRideSockets?.(this.scooter.getIkWorldTargets(), this._yaw);
      }
    }
  }

  /**
   * SSOT apply order: walk.update → character.update (mixer) → walk.applyRiderIk.
   * Plants feet on deck straps + hands on boom after mixer owns the pose.
   * @param {number} dt
   */
  applyRiderIk(dt) {
    // Only while vehicle-mounted — not during dismount/idle land
    if (this.phase !== Phase.RIDE && this.phase !== Phase.FREERIDE && this.phase !== Phase.LEAP) {
      return;
    }
    if (!this.character._rideActive && this.phase !== Phase.LEAP) return;
    if (this.character._softHipRide !== undefined) {
      this.character._softHipRide = this._softHip || 0;
    } else {
      this.character._softHipRide = this._softHip || 0;
    }
    this.character._rideIkExternal = true;
    this.character.applyRideIk?.(dt);
  }

  /* ------------------------------------------------------------------ */
  /* mount / physics                                                     */
  /* ------------------------------------------------------------------ */

  /**
   * Parent character.root under unscaled RideSeat (not boardRoot).
   * Vehicle group owns world transform until _dismountRider — do not
   * write world XZ to character while mounted.
   */
  _mountRider() {
    const seat = this.scooter.getSeat?.() || this.scooter.seatRoot || this.scooter.sockets?.deckCenter;
    if (!seat || !this.scooter.ready) {
      console.warn('[Walk] mount deferred — seat not ready');
      return;
    }

    // Never inherit birth scale 0.01 (rips / shrinks hero off screen)
    this.scooter.forceFullSize?.();
    this.scooter.group.updateWorldMatrix(true, true);
    seat.updateWorldMatrix(true, true);

    // Re-assert parent every call (recover if something stole root)
    if (this.character.root.parent !== seat) {
      seat.attach(this.character.root);
    }

    // Local feet on deck only — vehicle carries world pose; scale identity SI
    const stand = settings.walk.standOffset ?? 0.02;
    this.character.root.position.set(0, stand - (this._softHip || 0), 0);
    this.character.root.rotation.set(0, 0, 0);
    this.character.root.scale.set(1, 1, 1);
    this.character.clearFlip?.();
    this.character.setLean(0);

    this._mounted = true;
    this.character.setRideParented?.(true);
    this.character.setRideActive?.(true, this._yaw);
    this.character.setRideSockets?.(this.scooter.getIkWorldTargets(), this._yaw);
    // Back-slot stow mesh off while vehicle is live
    this.character.setBackSlotDeployed?.(true);
    this._syncPhysicsToCharacter();
    if (!this._mountLogged) {
      this._mountLogged = true;
      console.info('[Walk] mounted — character parented under', seat.name || 'RideSeat');
    }
  }

  /**
   * Unparent character to scene; keep world position.
   * Only call when ride ends — not mid-ride.
   * @param {boolean} [snapY] force feet to y=0
   */
  _dismountRider(snapY = false) {
    this._mountLogged = false;
    if (!this._mounted) {
      this.character.setRideParented?.(false);
      if (this.character.root.parent !== this.ctx.scene) {
        this.ctx.scene.attach(this.character.root);
      }
      return;
    }

    // World pose before unparent
    this.character.root.updateWorldMatrix(true, false);
    this.character.root.getWorldPosition(_p);
    const worldYaw = this._yaw;

    this.ctx.scene.attach(this.character.root);
    this.character.setRideParented?.(false);
    this.character.setLean(0);
    this.character.root.position.set(_p.x, snapY ? 0 : Math.max(0, _p.y), _p.z);
    this.character.root.rotation.set(0, worldYaw, 0);
    this.character.root.scale.set(1, 1, 1);
    this._mounted = false;
    this.character.setRideActive?.(false);
    // Stow back-slot item mesh again (windsurf utility)
    this.character.setBackSlotDeployed?.(false);
    this._syncPhysicsToCharacter();
  }

  /** Place Rapier capsule under rider so combat resume doesn't drop through. */
  _syncPhysicsToCharacter() {
    const phys = this.ctx.physics;
    if (!phys?.ready || !phys.setPlayerFeet) return;
    this.character.root.updateWorldMatrix(true, false);
    this.character.root.getWorldPosition(_p);
    // Feet ≈ root when grounded kit; while mounted root is near deck
    phys.setPlayerFeet(_p.x, Math.max(0, _p.y), _p.z);
  }

  /**
   * Each ride frame after board update: keep parent, local stand, IK, physics.
   * Never writes world XZ onto character.root — vehicle group owns that.
   */
  _syncMountedRider(dt) {
    if (!this.scooter.ready) return;

    // Hard guarantee: stay parented under seat for whole ride
    this._mountRider();

    const stand = settings.walk.standOffset ?? 0.02;
    const soft = this._softHip || 0;
    // Local-only stand pose (parent = deck)
    this.character.root.position.set(0, stand - soft, 0);
    this.character.root.rotation.set(0, 0, 0);
    this.character.root.scale.set(1, 1, 1);

    // Board yaw is world; IK poles use _rideYaw, root stays local 0
    this.character.setRideActive?.(true, this._yaw);
    this._rideYawForIk = this._yaw;

    this.scooter.group.updateWorldMatrix(true, true);
    const targets = this.scooter.getIkWorldTargets();
    this.character.setRideSockets?.(targets, this._yaw);

    if (targets.deckCenter) {
      _deck.copy(targets.deckCenter);
    } else {
      this.scooter.getSocketWorld('deckCenter', _deck);
    }
    const phys = this.ctx.physics;
    if (phys?.ready && phys.setPlayerFeet) {
      phys.setPlayerFeet(_deck.x, Math.max(0, _deck.y), _deck.z);
    }

    this._rideShakeT += dt;
    const c = settings.walk;
    const refSp = this.phase === Phase.FREERIDE ? c.freerideSpeed ?? 7 : c.speed;
    const speedN = saturate(this.speed / Math.max(0.5, refSp));
    const shakeAmp =
      (c.rideShake ?? 0.045) * speedN * (settings.global.cameraShake ?? 1) * settings.global.explosionIntensity;
    if (shakeAmp > 0.004 && this.ctx.shake && this._rideShakeT > 0.08) {
      this._rideShakeT = 0;
      this.ctx.shake.add(shakeAmp, 0.55, 18 + speedN * 10);
    }
  }

  /* ------------------------------------------------------------------ */
  /* leap                                                                */
  /* ------------------------------------------------------------------ */

  /**
   * @param {{ freeride?: boolean, frontflip?: boolean }} [opts]
   */
  _startLeap(opts = {}) {
    const c = settings.walk;
    const reach = _p.copy(this._target).setY(0).distanceTo(_t.copy(this._from).setY(0));

    this._setPhase(Phase.LEAP);
    this._leapTime = 0;
    this._leapDuration = clamp(reach / Math.max(0.5, c.jumpSpeed), c.jumpMin, c.jumpMax);
    this._yaw = this.character.facing;
    this._enterFreeride = !!opts.freeride;
    this._sailSpawned = false;

    // Frontflip while sailing out of the back slot
    if (opts.frontflip !== false) {
      this.character.playFrontflip?.(c.frontflipDuration ?? 0.72);
    }

    // Board spawns mid-flip from "back" (sail deploy) — not immediately under feet
    this._anchor.set(this._target.x, this.seatHeight, this._target.z);

    _p.set(this._from.x, 0.02, this._from.z);
    this.ctx.decals.spawn(DecalType.DUSTRING, _p, {
      radius: 1.4,
      life: 0.8,
      intensity: 0.5,
      colorA: getColor(c.colorInner),
      colorB: getColor(c.colorOuter)
    });
  }

  _updateLeap(dt) {
    const c = settings.walk;
    this._leapTime += dt;
    const t = saturate(this._leapTime / Math.max(0.05, this._leapDuration));

    // Sail/board deploys from back mid-frontflip
    const deployAt = c.sailDeployAt ?? 0.28;
    if (!this._sailSpawned && t >= deployAt) {
      this._sailSpawned = true;
      // Spawn slightly behind rider (back slot) then board will track landing
      const back = 0.6 * (1 - t);
      this._anchor.set(
        this._from.x + (this._target.x - this._from.x) * t - Math.sin(this._yaw) * back,
        this.seatHeight + c.jumpHeight * 0.35,
        this._from.z + (this._target.z - this._from.z) * t - Math.cos(this._yaw) * back
      );
      if (this.scooter.ready && !this.scooter.active) {
        // Point board along leap facing immediately (not default yaw 0)
        this.scooter.spawn(this._anchor, this._yaw);
      }
    }

    // Keep board gliding toward landing deck
    if (this._sailSpawned) {
      this._anchor.lerp(
        _t.set(this._target.x, this.seatHeight, this._target.z),
        1 - Math.pow(0.02, dt)
      );
    }

    _p.lerpVectors(this._from, this._target, t);
    _p.y += c.jumpHeight * 4 * t * (1 - t);
    if (!this._mounted) {
      if (this.character.root.parent !== this.ctx.scene) {
        this.ctx.scene.attach(this.character.root);
      }
      this.character.root.position.copy(_p);
    }

    this._faceLeap(dt, t);
    this._lean = damp(this._lean, 0, 0.01, dt);
    // Frontflip owns tilt — don't fight with setLean
    if (!this.character._flipActive) this.character.setLean(this._lean);

    if (!this._landStanding && t >= (c.tuck ?? 0.55)) {
      this.character.setPose('idle', c.poseBlend);
      // Pre-weight RideIK toward boom/feet before contact
      if (this.scooter.active) {
        this.character.setRideActive?.(true, this._yaw);
        this.character.setRideSockets?.(this.scooter.getIkWorldTargets(), this._yaw);
      }
    }

    if (t < 1) return;

    if (this._landStanding) {
      this._dismountRider(true);
      this.character.clearFlip?.();
      this.character.resetPlacement();
      this.character.setRideActive?.(false);
      this._setPhase(Phase.IDLE);
      this.curve = null;
      this._land(0.5);
      return;
    }

    // Land on deck — group at surface Y=0; force full board size; parent to unscaled seat
    this._anchor.set(this._target.x, 0, this._target.z);
    if (!this.scooter.active) this.scooter.spawn(this._anchor, this._yaw);
    else {
      this.scooter.group.rotation.y = this._yaw;
      this.scooter._yaw = this._yaw;
    }
    this.scooter.forceFullSize?.();
    _side.set(Math.cos(this._yaw), 0, -Math.sin(this._yaw));
    this.scooter.update(0, this._anchor, _side, 0, 0, this._yaw, 0);
    this.scooter.group.updateWorldMatrix(true, true);

    this.character.clearFlip?.();
    this._mountRider();
    this._rideTime = 0;
    this.distance = 0;
    this.speed = 0;
    this._vel.set(0, 0, 0);
    this._land(1);
    this._syncMountedRider(0);

    if (this._enterFreeride || !this.curve) {
      this._setPhase(Phase.FREERIDE);
      this._enterFreeride = false;
    } else {
      this._setPhase(Phase.RIDE);
    }
  }

  _faceLeap(dt, t) {
    _t.copy(this._target).sub(this._from).setY(0);
    const travel = _t.lengthSq() > 1e-4 ? Math.atan2(_t.x, _t.z) : this._yaw;

    let target = travel;
    if (this.curve && !this._landStanding) {
      this.curve.getTangentAt(0, _t).setY(0);
      if (_t.lengthSq() > 1e-6) {
        const along = Math.atan2(_t.x, _t.z);
        target = travel + wrapAngle(along - travel) * (t * t);
      }
    }
    this._turnTo(target, dt, 0.0005);
  }

  _land(scale) {
    const c = settings.walk;
    this.character.root.updateWorldMatrix(true, false);
    this.character.root.getWorldPosition(_p);
    _p.y = 0.02;
    this.ctx.decals.spawn(DecalType.DUSTRING, _p, {
      radius: 2.2 * scale,
      life: 1.0,
      intensity: 0.6 * scale,
      colorA: getColor(c.colorInner),
      colorB: getColor(c.colorOuter)
    });
    this.ctx.shake.add(0.28 * c.landShake * settings.global.explosionIntensity * scale, 1.0, 26);
  }

  /* ------------------------------------------------------------------ */
  /* ride                                                                */
  /* ------------------------------------------------------------------ */

  _updateRide(dt) {
    const c = settings.walk;
    this._rideTime += dt;

    const remaining = Math.max(0, this.length - this.distance);
    const rampIn = Easing.outCubic(saturate(this._rideTime / Math.max(0.01, c.accel)));
    const brakeDistance = Math.max(0.05, c.speed * c.brake);
    const rampOut = MathUtils.lerp(0.22, 1, Easing.outQuad(saturate(remaining / brakeDistance)));
    this.speed = c.speed * rampIn * rampOut;
    this.distance += this.speed * dt;

    const u = saturate(this.distance / this.length);
    this.curve.getPointAt(u, _p);
    this.curve.getTangentAt(u, _t).setY(0);

    const heading = _t.lengthSq() > 1e-6 ? Math.atan2(_t.x, _t.z) : this._yaw;
    this._turnRate = this._turnTo(heading, dt, c.turnDamping);

    // Board group Y = surface (bob); deckHeight is local on boardRoot — rider parented
    const bob =
      Math.sin(this._rideTime * c.bobRate * TAU) * c.bob * saturate(this.speed / Math.max(0.5, c.speed));
    this._anchor.set(_p.x, bob, _p.z);

    // Character lean = board bank feel (extra visual; parent already banks)
    const rate = Math.max(0.05, c.leanRate);
    const target = -clamp(this._turnRate / rate, -1, 1) * c.lean * MathUtils.DEG2RAD * 0.35;
    this._lean = damp(this._lean, target, c.leanDamping, dt);
    // While mounted, lean is mostly board rotation — keep body lean mild
    if (!this._mounted) this.character.setLean(this._lean);

    if (!this._mounted && this.scooter.ready) this._mountRider();

    if (this.distance >= this.length - 1e-4) {
      if (c.freerideAfterPath !== false && c.freeride !== false) {
        // Path done → freeride boat (tslda) with residual velocity
        this.curve = null;
        this._vel.set(Math.sin(this._yaw) * this.speed, 0, Math.cos(this._yaw) * this.speed);
        this._setPhase(Phase.FREERIDE);
      } else {
        this._startDismount();
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /* freeride — WASD boat (tslda / Wind Waker)                           */
  /* ------------------------------------------------------------------ */

  /**
   * Sample water elevation (CPU stand-in for StageWater waves).
   * @param {number} x
   * @param {number} z
   */
  _sampleWaterY(x, z) {
    const base = settings.walk.freerideWaterY ?? 0;
    const t = this._rideTime || 0;
    // Match StageWater feel: low amp multi-sine (SI metres)
    const a =
      Math.sin(x * 0.35 + t * 1.4) * 0.045 +
      Math.sin(z * 0.28 + t * 1.1) * 0.035 +
      Math.sin((x + z) * 0.5 + t * 2.0) * 0.02;
    const water = this.ctx.water;
    if (water?.sampleHeight) {
      try {
        return water.sampleHeight(x, z, t);
      } catch {
        /* fall through */
      }
    }
    return base + a;
  }

  _updateFreeride(dt) {
    const c = settings.walk;
    this._rideTime += dt;
    if (!this._mounted && this.scooter.ready) this._mountRider();

    const keys = this._keys;
    let ix = 0;
    let iz = 0;
    if (keys) {
      if (keys.has('KeyW') || keys.has('ArrowUp')) iz -= 1;
      if (keys.has('KeyS') || keys.has('ArrowDown')) iz += 1;
      // A/D turn (boat feel) — same invert as combat strafe fix: A left turn
      if (keys.has('KeyA') || keys.has('ArrowLeft')) ix -= 1;
      if (keys.has('KeyD') || keys.has('ArrowRight')) ix += 1;
    }

    // Turn boat (tslda joystick X → yaw)
    const turn = (c.freerideTurnRate ?? 1.85) * ix;
    this._yaw += turn * dt;
    this._turnRate = turn;

    // Thrust along board forward (W) / reverse (S)
    // Water physics: release W → gentle coast (not hard stop)
    const fwdX = Math.sin(this._yaw);
    const fwdZ = Math.cos(this._yaw);
    const maxSp = c.freerideSpeed ?? 7.2;
    const accel = c.freerideAccel ?? 4.5;
    const coastDrag = c.freerideDrag ?? 0.55;
    const brakeDrag = c.freerideBrakeDrag ?? 2.4;

    if (iz < 0) {
      // forward thrust
      this._vel.x += fwdX * accel * dt;
      this._vel.z += fwdZ * accel * dt;
    } else if (iz > 0) {
      // reverse + stronger drag while braking
      this._vel.x -= fwdX * accel * 0.45 * dt;
      this._vel.z -= fwdZ * accel * 0.45 * dt;
      const spB = Math.hypot(this._vel.x, this._vel.z);
      if (spB > 1e-4) {
        const d = Math.min(spB, brakeDrag * dt);
        this._vel.x -= (this._vel.x / spB) * d;
        this._vel.z -= (this._vel.z / spB) * d;
      }
    } else {
      // water coast — keep glide when player releases W
      const sp = Math.hypot(this._vel.x, this._vel.z);
      if (sp > 1e-4) {
        const d = Math.min(sp, coastDrag * dt);
        this._vel.x -= (this._vel.x / sp) * d;
        this._vel.z -= (this._vel.z / sp) * d;
      }
    }

    // Clamp speed
    let sp = Math.hypot(this._vel.x, this._vel.z);
    if (sp > maxSp) {
      this._vel.x = (this._vel.x / sp) * maxSp;
      this._vel.z = (this._vel.z / sp) * maxSp;
      sp = maxSp;
    }
    this.speed = sp;

    // Space jump (edge) — hop off wave
    const jumpDown = !!(keys && keys.has('Space'));
    if (jumpDown && !this._wasJump && Math.abs(this._vy) < 0.05) {
      this._vy = c.freerideJumpVy ?? 5.8;
      this.character.playJump?.(0.06);
    }
    this._wasJump = jumpDown;

    // Integrate XZ
    this._anchor.x += this._vel.x * dt;
    this._anchor.z += this._vel.z * dt;

    // Wave follow + hop: group Y is water surface; deckHeight is on boardRoot local
    const waterY = this._sampleWaterY(this._anchor.x, this._anchor.z);
    const surface = waterY * (c.freerideWaveFollow ?? 0.85);
    this._vy -= (c.freerideGravity ?? 14) * dt;
    let y = (Number.isFinite(this._anchor.y) ? this._anchor.y : surface) + this._vy * dt;
    if (y <= surface) {
      y = surface;
      this._vy = 0;
    }
    this._anchor.y = y;

    // Soft-body ragdoll-lite: hip drop + lean from bank + wave slope
    if (c.softBody !== false) {
      const waveDelta =
        this._sampleWaterY(this._anchor.x + fwdX, this._anchor.z + fwdZ) -
        this._sampleWaterY(this._anchor.x - fwdX, this._anchor.z - fwdZ);
      const softHip = (c.softBodyHip ?? 0.06) * MathUtils.clamp(Math.abs(waveDelta) * 8, 0, 1);
      this._softHip = softHip;
      const rate = Math.max(0.05, c.leanRate);
      const target =
        -clamp(this._turnRate / rate, -1, 1) * c.lean * MathUtils.DEG2RAD * 0.45 +
        waveDelta * (c.softBodyLean ?? 0.12);
      this._lean = damp(this._lean, target, c.leanDamping, dt);
    }

    if (!this._mounted) this.character.setLean(this._lean);
  }

  /* ------------------------------------------------------------------ */
  /* dismount                                                            */
  /* ------------------------------------------------------------------ */

  _startDismount() {
    this._setPhase(Phase.DISMOUNT);
    this._dismountTime = 0;

    // Capture world exit before unparent
    this.character.root.updateWorldMatrix(true, false);
    this.character.root.getWorldPosition(this._exit);
    this._exit.y = Math.max(0, this._exit.y);

    // Unparent first so character is free in scene
    this._dismountRider(false);
    this.character.setRideActive?.(false);
    this.character.setRideParented?.(false);

    // Vehicle leaves scene (fade then retire; cancel if already gone)
    if (this.scooter.active) this.scooter.release();
    else this.scooter.cancel();

    this.character.setPose('idle', settings.walk.poseBlend);
    this.character.clearFlip?.();
  }

  _updateDismount(dt) {
    const c = settings.walk;
    this._dismountTime += dt;
    const t = saturate(this._dismountTime / Math.max(0.05, c.dismountTime));
    const e = Easing.outCubic(t);

    // Guarantee not parented mid-step
    if (this.character.root.parent !== this.ctx.scene) {
      this.ctx.scene.attach(this.character.root);
      this.character.setRideParented?.(false);
    }

    _t.set(Math.sin(this._yaw), 0, Math.cos(this._yaw));
    _p.copy(this._exit).addScaledVector(_t, e * 0.55);
    _p.y = MathUtils.lerp(Math.max(0, this._exit.y), 0, e);
    this.character.root.position.copy(_p);
    this.character.root.rotation.set(0, this._yaw, 0);
    this.character.root.scale.set(1, 1, 1);

    this._lean = damp(this._lean, 0, 0.0005, dt);
    this.character.setLean(this._lean);
    this._syncPhysicsToCharacter();

    // Board fade anchor (vehicle no longer carries player)
    this._anchor.set(this._exit.x, this._exit.y, this._exit.z);

    if (t < 1) return;

    // Land normal: vehicle must be gone; controller fully land
    this.scooter.cancel();
    this.character.restoreFromRide?.({ x: _p.x, y: 0, z: _p.z, yaw: this._yaw });
    this.character.setFacing(this._yaw);
    this._mounted = false;
    this._vel.set(0, 0, 0);
    this._vy = 0;
    this._softHip = 0;
    this._syncPhysicsToCharacter();
    this._land(0.7);

    if (settings.walk.returnHome && this._home.distanceTo(this.character.position) > 0.5) {
      this._from.copy(this.character.position);
      this._target.copy(this._home).setY(0);
      this._landStanding = true;
      this._startLeap();
      return;
    }

    this._setPhase(Phase.IDLE);
    this.curve = null;
  }

  _turnTo(target, dt, rate) {
    const delta = wrapAngle(target - this._yaw);
    const step = delta * (1 - Math.pow(rate, dt));
    this._yaw += step;
    if (!this._mounted) this.character.setFacing(this._yaw);
    return step / Math.max(dt, 1e-4);
  }

  dispose() {
    this._dismountRider(true);
    this.scooter.dispose();
    this.ctx.scene.remove(this.scooter.group);
  }
}
