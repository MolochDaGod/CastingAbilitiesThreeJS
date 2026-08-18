import { PerspectiveCamera, Vector3, MOUSE, TOUCH } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { settings } from '../config/settings.js';
import { clamp, damp } from '../utils/math.js';
import { enableMainCameraLayers } from './Layers.js';

const _dir = new Vector3();
const _desiredTarget = new Vector3();
const _follow = new Vector3();
const _right = new Vector3();
const Y_UP = new Vector3(0, 1, 0);

/**
 * Third-person orbit rig — SamuraiThirdPersonTemplate CameraRig, adapted
 * for Casting play (LMB stays combat, RMB orbits).
 *
 * Distance always resolves to `settings.camera.distance`. Wheel writes that
 * setting. Follow translates the lens with the target so OrbitControls does
 * not rewrite azimuth when the hero runs. Shake is an offset taken off
 * before Orbit reads `camera.position`.
 *
 * @see https://github.com/MolochDaGod/SamuraiThirdPersonTemplateThreeJS/blob/main/src/core/CameraRig.js
 */
export class CameraRig {
  constructor(domElement) {
    this.camera = new PerspectiveCamera(
      settings.camera.fov,
      window.innerWidth / window.innerHeight,
      0.1,
      400
    );
    this.camera.position.set(1.7, 2.3, -5.4);
    enableMainCameraLayers(this.camera);

    this.controls = new OrbitControls(this.camera, domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.075;
    this.controls.enablePan = false;
    this.controls.enableZoom = false;
    this.controls.minPolarAngle = settings.camera.minPolar;
    this.controls.maxPolarAngle = settings.camera.maxPolar;
    this.controls.rotateSpeed = 0.65;
    // LMB is combat / select. RMB orbits (Samurai used both; that would steal LMB).
    this.controls.mouseButtons = { LEFT: null, MIDDLE: null, RIGHT: MOUSE.ROTATE };
    this.controls.touches = { ONE: TOUCH.ROTATE, TWO: TOUCH.DOLLY_ROTATE };

    this.anchor = new Vector3(0, 0, 0);
    this.focus = new Vector3(0, 0, 0);
    this.focusWeight = 0;
    this.softLockPoint = null;
    this.softLockWeight = 0;
    this.combatFocus = null;

    /** @type {'orbit'|'tps'} play label only — one rig either way */
    this.viewMode = 'orbit';
    this.characterYaw = 0;
    this._tpsYawOffset = 0;
    this._tpsPitch = settings.camera.tpsDefaultPitch ?? 0.18;
    this._holdCharacterYaw = null;
    this._sprinting = false;
    this._externalFovKick = 0;
    this._fov = settings.camera.fov;

    this._shake = 0;
    this._shakeOffset = new Vector3();
    this._shakeSeed = Math.random() * 100;
    /** Kept for CameraShake.js — applied after orbit, undone next frame. */
    this.shakeOffset = new Vector3();
    this.shakeRoll = 0;

    this.controls.target.set(0, settings.camera.targetHeight, 0);
    this.controls.update();
    this.distance = settings.camera.distance;

    this.domElement = domElement;
    this._onWheel = this._onWheel.bind(this);
    this._onPointerMove = this._onPointerMove.bind(this);
    this._onPointerDown = this._onPointerDown.bind(this);
    this._onPointerUp = this._onPointerUp.bind(this);
    this._rmb = false;
    this._lastX = 0;
    this._lastY = 0;

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

    /**
     * Shift/Ctrl/Meta would turn Orbit rotate into pan (disabled) and eat
     * the drag — sprint+look would lock. Mask those flags on capture.
     */
    this._onPointerDownCapture = (event) => {
      if (event.target !== domElement) return;
      if (!event.shiftKey && !event.ctrlKey && !event.metaKey) return;
      for (const flag of ['shiftKey', 'ctrlKey', 'metaKey']) {
        Object.defineProperty(event, flag, { value: false, configurable: true });
      }
    };
    window.addEventListener('pointerdown', this._onPointerDownCapture, true);
  }

  setCombatFocus(focus) {
    this.combatFocus = focus || null;
  }

  setSoftLock(point, weight = 0) {
    if (!point || weight <= 0) {
      this.softLockPoint = null;
      this.softLockWeight = 0;
      return;
    }
    if (!this.softLockPoint) this.softLockPoint = new Vector3();
    this.softLockPoint.copy(point);
    this.softLockWeight = clamp(weight, 0, 1);
  }

  /**
   * Play label. Combat/harvest stay on this orbit rig (Samurai follow).
   * Build/equip can still orbit — same update path.
   */
  setViewMode(mode) {
    this.viewMode = mode === 'tps' ? 'tps' : 'orbit';
    this.controls.enabled = true;
    const focusOn = !!this.combatFocus?.focusEnabled;
    this.controls.enableRotate = !focusOn;
  }

  get azimuth() {
    return this.controls.getAzimuthalAngle();
  }

  getTpsYaw() {
    return this.controls.getAzimuthalAngle();
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
    if (!this.controls.enabled) return;
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
    this.characterYaw = yaw;
  }

  setHoldCharacterYaw(yaw) {
    this._holdCharacterYaw = Number.isFinite(yaw) ? yaw : null;
    if (this._holdCharacterYaw != null) this.characterYaw = this._holdCharacterYaw;
  }

  lookAt(point, weight = 1) {
    this.focus.copy(point);
    this.focusWeight = Math.max(this.focusWeight, weight);
  }

  enterFocusLook() {
    this.controls.enableRotate = false;
  }

  setFovKick(extraDeg = 0) {
    this._externalFovKick = Number.isFinite(extraDeg) ? extraDeg : 0;
  }

  setSprinting(on) {
    this._sprinting = !!on;
  }

  aimRay() {
    const origin = new Vector3();
    const direction = new Vector3();
    this.camera.getWorldPosition(origin);
    this.camera.getWorldDirection(direction);
    direction.normalize();
    return { origin, direction };
  }

  applySoftLockYawAssist() {
    /* mouse owns look — Samurai orbit does not auto-yaw */
  }

  shake(amount) {
    this._shake = Math.max(this._shake, amount);
  }

  _applyShake(dt) {
    this._shake = Math.max(0, this._shake - this._shake * Math.min(1, dt * 9) - dt * 0.02);
    if (this._shake <= 1e-4) return this._shakeOffset.set(0, 0, 0);
    const t = (performance.now() * 0.001 + this._shakeSeed) * 42;
    this._shakeOffset.set(
      (Math.sin(t) + Math.sin(t * 1.7)) * 0.5,
      (Math.sin(t * 1.3 + 2.1) + Math.sin(t * 2.3)) * 0.5,
      (Math.sin(t * 0.9 + 4.2) + Math.sin(t * 1.9)) * 0.5
    );
    return this._shakeOffset.multiplyScalar(this._shake);
  }

  _onPointerDown = (event) => {
    if (event.button === 2) {
      event.preventDefault?.();
      this.combatFocus?.onPointerDown?.(event);
      this._rmb = true;
      this._lastX = event.clientX;
      this._lastY = event.clientY;
    }
  };

  _onPointerUp = (event) => {
    this.combatFocus?.onPointerUp?.(event);
    this._rmb = false;
  };

  /**
   * Focus: mouse look rotates the orbit around the feet (same math as drag).
   * Free: OrbitControls RMB handles rotate.
   */
  _onPointerMove = (event) => {
    this.combatFocus?.onPointerMove?.(event);
    const focusOn = !!this.combatFocus?.focusEnabled;
    this.controls.enableRotate = !focusOn;
    if (!focusOn) {
      this._lastX = event.clientX;
      this._lastY = event.clientY;
      return;
    }

    const locked = document.pointerLockElement === this.domElement;
    const base = settings.camera.orbitSensitivity ?? 0.00185;
    const lookMul = settings.controls?.lookSensitivity ?? 1;
    const sens = base * lookMul;
    const invertY = !!settings.controls?.invertLookY;
    let dx = 0;
    let dy = 0;
    if (locked) {
      dx = event.movementX || 0;
      dy = event.movementY || 0;
    } else {
      dx = event.movementX || event.clientX - this._lastX;
      dy = event.movementY || event.clientY - this._lastY;
    }
    this._lastX = event.clientX;
    this._lastY = event.clientY;
    if (dx === 0 && dy === 0) return;
    const dySign = invertY ? -1 : 1;
    this._orbitLook(-dx * sens, dy * sens * 0.55 * dySign);
  };

  /** Rotate the lens around the orbit target (focus look). */
  _orbitLook(yawDelta, pitchDelta) {
    const target = this.controls.target;
    _dir.copy(this.camera.position).sub(target);
    if (_dir.lengthSq() < 1e-8) return;
    _dir.applyAxisAngle(Y_UP, yawDelta);
    _right.crossVectors(Y_UP, _dir);
    if (_right.lengthSq() > 1e-8) {
      _right.normalize();
      _dir.applyAxisAngle(_right, pitchDelta);
    }
    this.camera.position.copy(target).add(_dir);
  }

  update(dt) {
    const cam = settings.camera;

    // Undo last frame shake before Orbit reads camera.position.
    this.camera.position.sub(this._shakeOffset);
    if (this.shakeOffset.lengthSq() > 0) this.camera.position.sub(this.shakeOffset);
    if (this.shakeRoll) this.camera.rotateZ(-this.shakeRoll);

    const wantFov = (cam.fov ?? 70) + (this._externalFovKick || 0);
    this._fov = damp(this._fov, wantFov, cam.fovDamping ?? 0.16, dt);
    if (Math.abs(this.camera.fov - this._fov) > 0.05) {
      this.camera.fov = this._fov;
      this.camera.updateProjectionMatrix();
    }

    this.controls.minPolarAngle = cam.minPolar;
    this.controls.maxPolarAngle = cam.maxPolar;

    _desiredTarget.copy(this.anchor);
    _desiredTarget.y += cam.targetHeight;

    const target = this.controls.target;
    _follow.set(
      damp(target.x, _desiredTarget.x, cam.damping, dt) - target.x,
      damp(target.y, _desiredTarget.y, cam.damping, dt) - target.y,
      damp(target.z, _desiredTarget.z, cam.damping, dt) - target.z
    );
    target.add(_follow);
    // Carry the lens with the target so Orbit does not rewrite azimuth/pitch.
    this.camera.position.add(_follow);

    this.controls.update();

    this.distance = damp(this.distance, cam.distance, cam.zoomDamping, dt);
    _dir.copy(this.camera.position).sub(this.controls.target);
    const len = _dir.length() || 1;
    _dir.multiplyScalar(1 / len);
    this.camera.position.copy(this.controls.target).addScaledVector(_dir, this.distance);

    this.camera.position.add(this._applyShake(dt));
    if (this.shakeOffset.lengthSq() > 0) this.camera.position.add(this.shakeOffset);
    if (this.shakeRoll) this.camera.rotateZ(this.shakeRoll);

    this.focusWeight = damp(this.focusWeight, 0, 0.08, dt);
  }

  snapToCharacter(x, y, z, yaw = 0) {
    this.setAnchor(x, y ?? 0, z);
    this.characterYaw = yaw;
    const cam = settings.camera;
    this.distance = cam.distance ?? 5.8;
    const pitch = cam.tpsDefaultPitch ?? 0.18;
    const th = cam.targetHeight ?? 1.35;
    _desiredTarget.set(x, (y ?? 0) + th, z);
    this.controls.target.copy(_desiredTarget);
    const cosP = Math.cos(pitch);
    this.camera.position.set(
      x - Math.sin(yaw) * this.distance * cosP,
      (y ?? 0) + th + Math.sin(pitch) * this.distance,
      z - Math.cos(yaw) * this.distance * cosP
    );
    this.controls.update();
    this.setViewMode('tps');
  }

  applyGameplayMode(mode) {
    const play = settings.camera?.play || {};
    const apply = (p) => {
      if (p.distance != null) {
        settings.camera.distance = p.distance;
        this.distance = p.distance;
      }
      if (p.pitch != null) this._tpsPitch = p.pitch;
    };
    if (mode === 'combat' || mode === 'freeride') {
      apply(play.combat || {});
      this.setViewMode('tps');
      return;
    }
    if (mode === 'harvest') {
      apply(play.harvest || {});
      this.setViewMode('tps');
      return;
    }
    if (mode === 'build' || mode === 'equip' || mode === 'builder') {
      apply(play.build || {});
      if (!this.combatFocus?.focusEnabled) this.setViewMode('orbit');
      else this.setViewMode('tps');
    }
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
    window.removeEventListener('pointerdown', this._onPointerDownCapture, true);
    this.controls.dispose();
  }
}
