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

const wrapAngle = (angle) => MathUtils.euclideanModulo(angle + Math.PI, TAU) - Math.PI;

const Phase = Object.freeze({
  IDLE: 'idle',
  LEAP: 'leap',
  RIDE: 'ride',
  DISMOUNT: 'dismount'
});

/**
 * Walk mode: drawn path becomes a windsurf/hoverboard ride.
 *
 * leap → land on deck → feet IK on footL/footR · hands on sailRail/boom →
 * bank L↔R along path → dismount.
 *
 * Board sockets: public/models/ride/ride.manifest.json (from sail IK graph).
 */
export class WalkController {
  /**
   * @param {import('./CharacterController.js').CharacterController} character
   * @param {object} ctx { scene, particles, lights, decals, bursts, shake }
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
  }

  get active() {
    return this.phase !== Phase.IDLE;
  }

  /** Deck hover height (replaces ball radius stack). */
  get ballHeight() {
    return this.scooter.deckHeight || settings.walk.hover || 0.06;
  }

  /** Rider root height: deck + small stand offset (standing, not lotus sink). */
  get seatHeight() {
    const stand = settings.walk.standOffset ?? 0.02;
    return this.ballHeight + stand;
  }

  /** Call after AssetLoader exists. */
  async load(assets) {
    await this.scooter.load(assets);
  }

  begin(curve) {
    const length = curve.getLength();
    if (length < 0.5) return false;

    this.scooter.cancel();
    this.character.setRideActive?.(false);

    // Lazy-load board if boot skipped it
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

    if (!this.active) this._home.copy(this.character.position);

    this._from.copy(this.character.position);
    curve.getPointAt(0, this._target).setY(this.seatHeight);
    this._startLeap();
    return true;
  }

  cancel() {
    if (!this.active) return;
    this.scooter.cancel();
    this.character.setRideActive?.(false);
    this.phase = Phase.IDLE;
    this.curve = null;
    this.character.setPose('idle', settings.walk.poseBlend);
    this.character.resetPlacement();
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

    if (this.scooter.active) {
      if (this.phase === Phase.RIDE) {
        this._anchor.set(this.character.position.x, this.seatHeight, this.character.position.z);
      }
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

      // Feed IK sockets every frame while board is up (ride + late leap blend)
      if (this.scooter.ready && (this.phase === Phase.RIDE || this.phase === Phase.LEAP)) {
        this.character.setRideSockets?.(this.scooter.getIkWorldTargets(), this._yaw);
      }
    }
  }

  _startLeap() {
    const c = settings.walk;
    const reach = _p.copy(this._target).setY(0).distanceTo(_t.copy(this._from).setY(0));

    this.phase = Phase.LEAP;
    this._leapTime = 0;
    this._leapDuration = clamp(reach / Math.max(0.5, c.jumpSpeed), c.jumpMin, c.jumpMax);
    this._yaw = this.character.facing;

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

    _p.lerpVectors(this._from, this._target, t);
    _p.y += c.jumpHeight * 4 * t * (1 - t);
    this.character.root.position.copy(_p);

    this._faceLeap(dt, t);
    this._lean = damp(this._lean, 0, 0.01, dt);
    this.character.setLean(this._lean);

    // Standing crouch into board stance (not full lotus) near landing
    if (!this._landStanding && t >= c.tuck) {
      this.character.setPose('idle', c.poseBlend);
    }

    if (t < 1) return;

    this.character.root.position.copy(this._target);

    if (this._landStanding) {
      this.character.resetPlacement();
      this.character.setRideActive?.(false);
      this.phase = Phase.IDLE;
      this.curve = null;
      this._land(0.5);
      return;
    }

    this._anchor.set(this._target.x, this.seatHeight, this._target.z);
    this.scooter.spawn(this._anchor);
    this.character.setRideActive?.(true, this._yaw);
    if (this.scooter.ready) {
      this.character.setRideSockets?.(this.scooter.getIkWorldTargets(), this._yaw);
    } else {
      // Board still loading — IK will start once sockets exist next frames
      console.warn('[Walk] windsurf board not ready yet — ride without mesh until load finishes');
    }
    this.phase = Phase.RIDE;
    this._rideTime = 0;
    this.distance = 0;
    this.speed = 0;
    this._land(1);
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
    _p.set(this.character.position.x, 0.02, this.character.position.z);
    this.ctx.decals.spawn(DecalType.DUSTRING, _p, {
      radius: 2.2 * scale,
      life: 1.0,
      intensity: 0.6 * scale,
      colorA: getColor(c.colorInner),
      colorB: getColor(c.colorOuter)
    });
    this.ctx.shake.add(0.22 * c.landShake * settings.global.explosionIntensity * scale, 1.0, 24);
  }

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

    const bob =
      Math.sin(this._rideTime * c.bobRate * TAU) * c.bob * saturate(this.speed / Math.max(0.5, c.speed));
    this.character.root.position.set(_p.x, this.seatHeight + bob, _p.z);

    // Character bank matches board (negative roll into left turn)
    const rate = Math.max(0.05, c.leanRate);
    const target = -clamp(this._turnRate / rate, -1, 1) * c.lean * MathUtils.DEG2RAD;
    this._lean = damp(this._lean, target, c.leanDamping, dt);
    this.character.setLean(this._lean);

    if (this.distance >= this.length - 1e-4) this._startDismount();
  }

  _startDismount() {
    this.phase = Phase.DISMOUNT;
    this._dismountTime = 0;
    this._exit.copy(this.character.position);
    this.scooter.release();
    this.character.setRideActive?.(false);
    this.character.setPose('idle', settings.walk.poseBlend);
  }

  _updateDismount(dt) {
    const c = settings.walk;
    this._dismountTime += dt;
    const t = saturate(this._dismountTime / Math.max(0.05, c.dismountTime));
    const e = Easing.outCubic(t);

    _t.set(Math.sin(this._yaw), 0, Math.cos(this._yaw));
    _p.copy(this._exit).addScaledVector(_t, e * 0.45);
    _p.y = MathUtils.lerp(this._exit.y, 0, e);
    this.character.root.position.copy(_p);

    this._lean = damp(this._lean, 0, 0.0005, dt);
    this.character.setLean(this._lean);

    if (t < 1) return;

    this.character.resetPlacement();
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
    this.character.setFacing(this._yaw);
    return step / Math.max(dt, 1e-4);
  }

  dispose() {
    this.scooter.dispose();
    this.ctx.scene.remove(this.scooter.group);
  }
}
