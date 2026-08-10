import { PerspectiveCamera, Vector3, MathUtils, MOUSE, TOUCH } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { settings } from '../config/settings.js';
import { clamp, damp } from '../utils/math.js';
import { LAYER } from './Layers.js';

const _dir = new Vector3();
const _desiredTarget = new Vector3();
const _desiredPos = new Vector3();
const _look = new Vector3();
const _shoulder = new Vector3();
const _soft = new Vector3();

/**
 * Camera rig: orbit (sandbox) or combat TPS follow.
 *
 * Combat TPS angles from grudge-third-person-controller (shoulder + pitch/FOV)
 * while keeping fleet rule: **OrbitControls never writes camera in TPS**.
 *
 * Soft lock: optional look bias toward CombatFocus.selectedTarget (not hard snap).
 *
 * @see docs/COMBAT_CAMERA_FOCUS_SSOT.md
 */
export class CameraRig {
  constructor(domElement) {
    this.camera = new PerspectiveCamera(
      settings.camera.fov,
      window.innerWidth / window.innerHeight,
      0.1,
      400
    );
    this.camera.position.set(-6.5, 6.0, 9.5);
    this.camera.layers.enable(LAYER.VFX);

    this.controls = new OrbitControls(this.camera, domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.075;
    this.controls.enablePan = false;
    this.controls.enableZoom = false;
    this.controls.minPolarAngle = settings.camera.minPolar;
    this.controls.maxPolarAngle = settings.camera.maxPolar;
    this.controls.rotateSpeed = 0.65;

    this.controls.mouseButtons = { LEFT: null, MIDDLE: null, RIGHT: MOUSE.ROTATE };
    this.controls.touches = { ONE: null, TWO: TOUCH.DOLLY_ROTATE };

    this.anchor = new Vector3(0, 0, 0);
    this.focus = new Vector3(0, 0, 0);
    this.focusWeight = 0;
    this.shakeOffset = new Vector3();
    this.shakeRoll = 0;

    /** Soft-lock world point (optional) */
    this.softLockPoint = null;
    this.softLockWeight = 0;

    /** @type {'orbit'|'tps'} */
    this.viewMode = 'orbit';
    this.characterYaw = 0;
    this._tpsYawOffset = 0;
    this._tpsPitch = settings.camera.tpsDefaultPitch ?? 0.38;

    this.controls.target.set(0, settings.camera.targetHeight, 0);
    this.controls.update();

    this.distance = settings.camera.distance;
    this._fov = settings.camera.fov;
    /** When set, TPS yaw ignores body reverse (backflip setup) */
    this._holdCharacterYaw = null;

    this.domElement = domElement;
    this._onWheel = this._onWheel.bind(this);
    this._onPointerMove = this._onPointerMove.bind(this);
    this._onPointerDown = this._onPointerDown.bind(this);
    this._onPointerUp = this._onPointerUp.bind(this);
    this._rmb = false;
    this._lastX = 0;
    this._lastY = 0;
    /** Optional CombatFocus for RMB orbit + toggle handoff */
    this.combatFocus = null;

    domElement.addEventListener('wheel', this._onWheel, { passive: false });
    window.addEventListener('pointerdown', this._onPointerDown);
    window.addEventListener('pointermove', this._onPointerMove);
    window.addEventListener('pointerup', this._onPointerUp);
    window.addEventListener('blur', () => {
      this._rmb = false;
      this.combatFocus?.clearHeld?.();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this._rmb = false;
        this.combatFocus?.clearHeld?.();
      }
    });
  }

  /**
   * @param {import('../combat/CombatFocus.js').CombatFocus|null} focus
   */
  setCombatFocus(focus) {
    this.combatFocus = focus || null;
  }

  /**
   * Soft-lock look target (world). Weight 0..1 from focus mode.
   * @param {Vector3|null} point
   * @param {number} [weight]
   */
  setSoftLock(point, weight = 0) {
    if (!point || weight <= 0) {
      this.softLockPoint = null;
      this.softLockWeight = 0;
      return;
    }
    if (!this.softLockPoint) this.softLockPoint = new Vector3();
    this.softLockPoint.copy(point);
    this.softLockWeight = MathUtils.clamp(weight, 0, 1);
  }

  /**
   * @param {'orbit'|'tps'} mode
   */
  setViewMode(mode) {
    const next = mode === 'tps' ? 'tps' : 'orbit';
    if (this.viewMode === next) return;
    this.viewMode = next;
    this.controls.enabled = next === 'orbit';
    if (next === 'tps') {
      this._tpsYawOffset = 0;
      this._tpsPitch = settings.camera.tpsDefaultPitch ?? 0.38;
      // Combat FOV
      if (settings.camera.fov) {
        this.camera.fov = settings.camera.fov;
        this.camera.updateProjectionMatrix();
      }
    }
  }

  /** Camera yaw for body/soft-lock movement (radians). */
  getTpsYaw() {
    return this.characterYaw + this._tpsYawOffset;
  }

  getCameraForward(out = new Vector3()) {
    this.camera.getWorldDirection(out);
    out.y = 0;
    if (out.lengthSq() < 1e-6) out.set(0, 0, 1);
    else out.normalize();
    return out;
  }

  getCameraRight(out = new Vector3()) {
    this.getCameraForward(_dir);
    out.set(_dir.z, 0, -_dir.x);
    return out;
  }

  _onWheel(event) {
    event.preventDefault();
    const cam = settings.camera;
    const scale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 100 : 1;
    const delta = (event.deltaY * scale) / 100;
    cam.distance = clamp(
      cam.distance * Math.exp(delta * 0.12 * cam.zoomSpeed),
      cam.minDistance,
      cam.maxDistance
    );
  }

  setAnchor(x, y, z) {
    this.anchor.set(x, y, z);
  }

  setCharacterYaw(yaw) {
    // Backflip setup: freeze body-driven cam orbit (look stays where it was)
    if (this._holdCharacterYaw != null && Number.isFinite(this._holdCharacterYaw)) {
      this.characterYaw = this._holdCharacterYaw;
      return;
    }
    this.characterYaw = yaw;
  }

  /**
   * Hold TPS body yaw (e.g. backflip) — camera does not whip with reverse dash facing.
   * @param {number|null} yaw
   */
  setHoldCharacterYaw(yaw) {
    this._holdCharacterYaw = Number.isFinite(yaw) ? yaw : null;
    if (this._holdCharacterYaw != null) this.characterYaw = this._holdCharacterYaw;
  }

  lookAt(point, weight = 1) {
    this.focus.copy(point);
    this.focusWeight = Math.max(this.focusWeight, weight);
  }

  _onPointerDown = (event) => {
    if (event.button === 2) {
      event.preventDefault?.();
      this.combatFocus?.onPointerDown?.(event);
    }
    if (this.viewMode !== 'tps') return;
    if (event.button !== 2) return;
    this._rmb = true;
    this._lastX = event.clientX;
    this._lastY = event.clientY;
  };

  _onPointerUp = (event) => {
    this.combatFocus?.onPointerUp?.(event);
    this._rmb = false;
  };

  /**
   * TPS look:
   *  - Focus ON → mouse is aim (pointer-lock movementX/Y or free delta) — no cursor
   *  - Focus OFF → RMB hold only (orbit), unlocked cursor for select
   */
  _onPointerMove = (event) => {
    this.combatFocus?.onPointerMove?.(event);
    if (this.viewMode !== 'tps') return;

    const focusOn = !!this.combatFocus?.focusEnabled;
    const locked = document.pointerLockElement === this.domElement;
    // Focus: always look with mouse. Free: only while RMB held (orbit).
    if (!focusOn && !this._rmb) return;

    const base = settings.camera.orbitSensitivity ?? 0.0038;
    const lookMul = settings.controls?.lookSensitivity ?? 1;
    const sens = base * lookMul;
    const invertY = !!settings.controls?.invertLookY;
    let dx = 0;
    let dy = 0;
    if (locked || focusOn) {
      // Prefer movementX (pointer lock / focus aim)
      dx = event.movementX || 0;
      dy = event.movementY || 0;
      if (!locked && (dx === 0 && dy === 0) && this._rmb) {
        dx = event.clientX - this._lastX;
        dy = event.clientY - this._lastY;
      }
    } else {
      dx = event.clientX - this._lastX;
      dy = event.clientY - this._lastY;
    }
    this._lastX = event.clientX;
    this._lastY = event.clientY;
    if (dx === 0 && dy === 0) return;

    this._tpsYawOffset -= dx * sens;
    const minP = settings.camera.minPitch ?? 0.08;
    const maxP = settings.camera.maxPitch ?? 1.25;
    const dySign = invertY ? -1 : 1;
    this._tpsPitch = clamp(this._tpsPitch + dy * sens * 0.85 * dySign, minP, maxP);
  };

  update(dt) {
    const cam = settings.camera;

    // Fortnite TPS FOV: free ~70 · focus ~85 (grudge-third-person-controller)
    if (this.viewMode === 'tps') {
      const focusOn = !!this.combatFocus?.focusEnabled;
      const wantFov = focusOn ? (cam.actionFov ?? 85) : (cam.fov ?? 70);
      this._fov = damp(this._fov, wantFov, cam.fovDamping ?? 0.14, dt);
      if (Math.abs(this.camera.fov - this._fov) > 0.05) {
        this.camera.fov = this._fov;
        this.camera.updateProjectionMatrix();
      }
    }

    // Focus pulls distance + shoulder tighter (Fortnite 5.5 / 0.8)
    const focusOn = !!this.combatFocus?.focusEnabled;
    const wantDist = focusOn
      ? (cam.focusDistance ?? cam.distance ?? 5.5)
      : (cam.distance ?? 6);
    this.distance = damp(this.distance, wantDist, cam.zoomDamping, dt);
    this.focusWeight = damp(this.focusWeight, 0, 0.08, dt);

    if (this.viewMode === 'tps') {
      this._updateTps(dt, cam);
    } else {
      this._updateOrbit(dt, cam);
    }

    if (this.shakeOffset.lengthSq() > 0) {
      this.camera.position.add(this.shakeOffset);
      this.camera.rotateZ(this.shakeRoll);
    }
  }

  _updateOrbit(dt, cam) {
    this.controls.enabled = true;
    this.controls.minPolarAngle = cam.minPolar;
    this.controls.maxPolarAngle = cam.maxPolar;

    const blend = MathUtils.clamp(this.focusWeight * cam.autoFrame, 0, 0.85);
    _desiredTarget.copy(this.anchor);
    _desiredTarget.y += cam.targetHeight;
    _desiredTarget.lerp(this.focus, blend);

    this.controls.target.set(
      damp(this.controls.target.x, _desiredTarget.x, cam.damping, dt),
      damp(this.controls.target.y, _desiredTarget.y, cam.damping, dt),
      damp(this.controls.target.z, _desiredTarget.z, cam.damping, dt)
    );

    this.controls.update();

    _dir.copy(this.camera.position).sub(this.controls.target);
    const len = _dir.length() || 1;
    _dir.multiplyScalar(1 / len);
    this.camera.position.copy(this.controls.target).addScaledVector(_dir, this.distance);
  }

  /**
   * Combat TPS: shoulder offset + spherical pitch (ref Fortnite/WoW blend).
   * Soft lock only biases lookAt — never snaps camera to target.
   */
  _updateTps(dt, cam, snap = false) {
    this.controls.enabled = false;

    const yaw = this.characterYaw + this._tpsYawOffset;
    const pitch = this._tpsPitch;
    const dist = this.distance * (cam.tpsDistanceScale ?? 1);
    const focusOn = !!this.combatFocus?.focusEnabled;
    const shoulder = focusOn
      ? (cam.focusShoulderOffset ?? cam.shoulderOffset ?? 0.8)
      : (cam.shoulderOffset ?? 0.72);

    // Look target: chest + optional soft lock + ability frame
    _desiredTarget.copy(this.anchor);
    _desiredTarget.y += cam.targetHeight;

    // Over-the-shoulder pivot (side from settings.camera.shoulderSide)
    const side = Math.sign(cam.shoulderSide ?? 1) || 1;
    _shoulder.set(Math.cos(yaw) * shoulder * side, 0, -Math.sin(yaw) * shoulder * side);
    _desiredTarget.add(_shoulder);

    if (this.focusWeight > 0.05) {
      _desiredTarget.lerp(this.focus, Math.min(0.45, this.focusWeight * cam.autoFrame));
    }

    // Soft lock bias — stronger in focus (soft lock ON); never hard snap
    const softBase = focusOn
      ? (cam.softLockLookFocus ?? cam.softLockLook ?? 0.55)
      : (cam.softLockLook ?? 0.28);
    const softW = softBase * (this.softLockWeight || 0);
    if (this.softLockPoint && softW > 0.01) {
      _soft.copy(this.softLockPoint);
      _desiredTarget.lerp(_soft, softW);
    }

    // Spherical offset behind shoulder pivot (ref grudge-third-person-controller)
    const cosP = Math.cos(pitch);
    const sinP = Math.sin(pitch);
    _desiredPos.set(
      _desiredTarget.x - Math.sin(yaw) * dist * cosP,
      _desiredTarget.y + Math.sin(pitch) * dist * 0.92 + cam.targetHeight * 0.15,
      _desiredTarget.z - Math.cos(yaw) * dist * cosP
    );

    if (snap || dt <= 0) {
      this.camera.position.copy(_desiredPos);
    } else {
      const dampT = cam.tpsDamping ?? 0.16;
      this.camera.position.x = damp(this.camera.position.x, _desiredPos.x, dampT, dt);
      this.camera.position.y = damp(this.camera.position.y, _desiredPos.y, dampT, dt);
      this.camera.position.z = damp(this.camera.position.z, _desiredPos.z, dampT, dt);
    }

    _look.copy(_desiredTarget);
    this.camera.lookAt(_look);
    this.controls.target.copy(_look);
  }

  snapToCharacter(x, y, z, yaw = 0) {
    this.setAnchor(x, y ?? 0, z);
    this.setCharacterYaw(yaw);
    this.setViewMode('tps');
    this.distance = settings.camera.distance;
    this._tpsPitch = settings.camera.tpsDefaultPitch ?? 0.38;
    this._updateTps(0, settings.camera, true);
  }

  resize(width, height) {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  dispose() {
    this.domElement.removeEventListener('wheel', this._onWheel);
    window.removeEventListener('pointerdown', this._onPointerDown);
    window.removeEventListener('pointermove', this._onPointerMove);
    window.removeEventListener('pointerup', this._onPointerUp);
    this.controls.dispose();
  }
}
