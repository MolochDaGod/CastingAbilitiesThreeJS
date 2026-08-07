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

const Phase = Object.freeze({
  IDLE: 'idle',
  LEAP: 'leap',
  RIDE: 'ride',
  DISMOUNT: 'dismount'
});

/**
 * Walk mode: drawn path → windsurf ride.
 *
 * Mount contract (until dismount):
 *  1. Path owns board XZ + yaw
 *  2. Board bank/sway/bob update first
 *  3. Character **reparented** to deck seat (sticks through bank/shake)
 *  4. RideIK feet→footL/R, hands→sailRail/boom (post-mixer)
 *  5. Rapier capsule teleported to deck every frame (no CCT freefall)
 */
export class WalkController {
  /**
   * @param {import('./CharacterController.js').CharacterController} character
   * @param {object} ctx { scene, particles, lights, decals, bursts, shake, physics? }
   */
  constructor(character, ctx) {
    this.character = character;
    this.ctx = ctx;

    this.scooter = new HoverboardRide(ctx, ctx.assets || null);
    ctx.scene.add(this.scooter.group);

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
    this._leapTime = 0;
    this._leapDuration = 0;
    this._rideTime = 0;
    this._dismountTime = 0;
    this._yaw = 0;
    this._lean = 0;
    this._landStanding = false;
    this._mounted = false;
    this._rideShakeT = 0;
  }

  get active() {
    return this.phase !== Phase.IDLE;
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
    this._rideTime = 0;
    this._landStanding = false;
    this._turnRate = 0;
    this._rideShakeT = 0;

    if (!this.active) this._home.copy(this.character.position);

    this._from.copy(this.character.position);
    curve.getPointAt(0, this._target).setY(this.seatHeight);
    this._startLeap();
    return true;
  }

  cancel() {
    if (!this.active && !this._mounted) return;
    this._dismountRider(true);
    this.scooter.cancel();
    this.character.setRideActive?.(false);
    this.phase = Phase.IDLE;
    this.curve = null;
    this.character.setPose('idle', settings.walk.poseBlend);
    this.character.resetPlacement();
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

    // After board bank/sway: mount pose + IK sockets + physics glue
    if (this.phase === Phase.RIDE && this._mounted) {
      this._syncMountedRider(dt);
    } else if (this.scooter.active && this.scooter.ready && this.phase === Phase.LEAP) {
      // Pre-land: aim hands/feet toward board sockets once board exists
      if (this.scooter.group.visible && this.scooter._birth > 0.2) {
        this.character.setRideSockets?.(this.scooter.getIkWorldTargets(), this._yaw);
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /* mount / physics                                                     */
  /* ------------------------------------------------------------------ */

  /**
   * Parent character to deck seat so bank/sway/bob stick until dismount.
   */
  _mountRider() {
    if (this._mounted) return;
    const seat = this.scooter.getSeat?.() || this.scooter.sockets?.deckCenter;
    if (!seat || !this.scooter.ready) {
      console.warn('[Walk] mount deferred — seat not ready');
      return;
    }

    // Preserve world pose, then parent under seat
    seat.updateWorldMatrix(true, false);
    seat.attach(this.character.root);

    // Local feet on deck: small stand offset along seat up
    const stand = settings.walk.standOffset ?? 0.02;
    this.character.root.position.set(0, stand, 0);
    this.character.root.rotation.set(0, 0, 0);
    this.character.root.scale.set(1, 1, 1);
    this.character.setLean(0);

    this._mounted = true;
    this.character.setRideActive?.(true, this._yaw);
    this.character.setRideSockets?.(this.scooter.getIkWorldTargets(), this._yaw);
    this._syncPhysicsToCharacter();
    console.info('[Walk] mounted on deck seat');
  }

  /**
   * Unparent character to scene; keep world position.
   * @param {boolean} [snapY] force feet to y=0
   */
  _dismountRider(snapY = false) {
    if (!this._mounted) {
      // Ensure scene ownership even if never mounted
      if (this.character.root.parent !== this.ctx.scene) {
        this.ctx.scene.attach(this.character.root);
      }
      return;
    }

    this.ctx.scene.attach(this.character.root);
    this.character.setLean(0);
    if (snapY) {
      this.character.root.position.y = 0;
      this.character.root.rotation.x = 0;
      this.character.root.rotation.z = 0;
    }
    this._mounted = false;
    this.character.setRideActive?.(false);
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
   * Each ride frame after board update: refresh IK + physics + light shake.
   */
  _syncMountedRider(dt) {
    if (!this.scooter.ready) return;

    // Seat local stand offset (bob lives on board root, parented rider follows)
    const stand = settings.walk.standOffset ?? 0.02;
    this.character.root.position.set(0, stand, 0);
    this.character.root.rotation.set(0, 0, 0);

    // Facing = board forward (seat already yaws with board group)
    this.character.setFacing(0);
    this._rideYawForIk = this._yaw;

    this.scooter.group.updateWorldMatrix(true, true);
    const targets = this.scooter.getIkWorldTargets();
    this.character.setRideSockets?.(targets, this._yaw);
    this.character.setRideActive?.(true, this._yaw);

    // Physics glued to deck center world
    if (targets.deckCenter) {
      _deck.copy(targets.deckCenter);
    } else {
      this.scooter.getSocketWorld('deckCenter', _deck);
    }
    const phys = this.ctx.physics;
    if (phys?.ready && phys.setPlayerFeet) {
      phys.setPlayerFeet(_deck.x, Math.max(0, _deck.y), _deck.z);
    }

    // Continuous ride shake (speed-scaled) + board bank feel
    this._rideShakeT += dt;
    const c = settings.walk;
    const speedN = saturate(this.speed / Math.max(0.5, c.speed));
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

  _startLeap() {
    const c = settings.walk;
    const reach = _p.copy(this._target).setY(0).distanceTo(_t.copy(this._from).setY(0));

    this.phase = Phase.LEAP;
    this._leapTime = 0;
    this._leapDuration = clamp(reach / Math.max(0.5, c.jumpSpeed), c.jumpMin, c.jumpMax);
    this._yaw = this.character.facing;

    // Spawn board early under path head so IK can pre-aim
    this._anchor.set(this._target.x, this.seatHeight, this._target.z);
    if (this.scooter.ready && !this.scooter.active) {
      this.scooter.spawn(this._anchor);
    }

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

    // Keep board under landing spot during leap
    this._anchor.set(this._target.x, this.seatHeight, this._target.z);

    _p.lerpVectors(this._from, this._target, t);
    _p.y += c.jumpHeight * 4 * t * (1 - t);
    // Only free-move root while not mounted
    if (!this._mounted) {
      if (this.character.root.parent !== this.ctx.scene) {
        this.ctx.scene.attach(this.character.root);
      }
      this.character.root.position.copy(_p);
    }

    this._faceLeap(dt, t);
    this._lean = damp(this._lean, 0, 0.01, dt);
    this.character.setLean(this._lean);

    // Blend IK weight up before landing
    if (!this._landStanding && t >= (c.tuck ?? 0.55)) {
      this.character.setPose('idle', c.poseBlend);
      this.character.setRideActive?.(true, this._yaw);
    }

    if (t < 1) return;

    if (this._landStanding) {
      this._dismountRider(true);
      this.character.resetPlacement();
      this.character.setRideActive?.(false);
      this.phase = Phase.IDLE;
      this.curve = null;
      this._land(0.5);
      return;
    }

    // Land → mount seat
    this._anchor.set(this._target.x, this.seatHeight, this._target.z);
    if (!this.scooter.active) this.scooter.spawn(this._anchor);
    // Force board to landing pose once before attach
    _side.set(Math.cos(this._yaw), 0, -Math.sin(this._yaw));
    this.scooter.update(0, this._anchor, _side, 0, 0, this._yaw, 0);
    this.scooter.group.updateWorldMatrix(true, true);

    this._mountRider();
    this.phase = Phase.RIDE;
    this._rideTime = 0;
    this.distance = 0;
    this.speed = 0;
    this._land(1);
    this._syncMountedRider(0);
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

    // Path bob applied to board anchor (rider parented → follows automatically)
    const bob =
      Math.sin(this._rideTime * c.bobRate * TAU) * c.bob * saturate(this.speed / Math.max(0.5, c.speed));
    this._anchor.set(_p.x, this.seatHeight + bob, _p.z);

    // Character lean = board bank feel (extra visual; parent already banks)
    const rate = Math.max(0.05, c.leanRate);
    const target = -clamp(this._turnRate / rate, -1, 1) * c.lean * MathUtils.DEG2RAD * 0.35;
    this._lean = damp(this._lean, target, c.leanDamping, dt);
    // While mounted, lean is mostly board rotation — keep body lean mild
    if (!this._mounted) this.character.setLean(this._lean);

    if (!this._mounted && this.scooter.ready) this._mountRider();

    if (this.distance >= this.length - 1e-4) this._startDismount();
  }

  /* ------------------------------------------------------------------ */
  /* dismount                                                            */
  /* ------------------------------------------------------------------ */

  _startDismount() {
    this.phase = Phase.DISMOUNT;
    this._dismountTime = 0;

    // Capture world exit before unparent
    this.character.root.updateWorldMatrix(true, false);
    this.character.root.getWorldPosition(this._exit);
    this._dismountRider(false);
    this.character.setRideActive?.(false);
    this.scooter.release();
    this.character.setPose('idle', settings.walk.poseBlend);
  }

  _updateDismount(dt) {
    const c = settings.walk;
    this._dismountTime += dt;
    const t = saturate(this._dismountTime / Math.max(0.05, c.dismountTime));
    const e = Easing.outCubic(t);

    _t.set(Math.sin(this._yaw), 0, Math.cos(this._yaw));
    _p.copy(this._exit).addScaledVector(_t, e * 0.55);
    _p.y = MathUtils.lerp(Math.max(0, this._exit.y), 0, e);
    this.character.root.position.copy(_p);
    this.character.root.rotation.y = this._yaw;
    this.character.root.rotation.x = 0;
    this.character.root.rotation.z = 0;

    this._lean = damp(this._lean, 0, 0.0005, dt);
    this.character.setLean(this._lean);
    this._syncPhysicsToCharacter();

    // Board still releases at last anchor
    this._anchor.set(this._exit.x, this.seatHeight, this._exit.z);

    if (t < 1) return;

    this.character.resetPlacement();
    this.character.root.position.set(_p.x, 0, _p.z);
    this.character.setFacing(this._yaw);
    this._syncPhysicsToCharacter();
    this._land(0.7);

    if (settings.walk.returnHome && this._home.distanceTo(this.character.position) > 0.5) {
      this._from.copy(this.character.position);
      this._target.copy(this._home).setY(0);
      this._landStanding = true;
      this._startLeap();
      return;
    }

    this.phase = Phase.IDLE;
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
