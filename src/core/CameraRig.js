import { PerspectiveCamera, Vector3, MathUtils, MOUSE, TOUCH } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { settings } from '../config/settings.js';
import { clamp, damp } from '../utils/math.js';
import { LAYER } from './Layers.js';

const _dir = new Vector3();
const _desiredTarget = new Vector3();
const _desiredPos = new Vector3();
const _look = new Vector3();

/**
 * Camera rig: orbit (sandbox) or combat TPS follow.
 *
 * Hard rule: **OrbitControls must not write the camera during combat TPS** —
 * when `viewMode === 'tps'`, controls are disabled and we place the camera
 * behind the character (fleet Danger Room style).
 *
 * - Left mouse reserved for path draw / combat aim
 * - Orbit: right-drag (sandbox cast/walk)
 * - TPS: yaw from character facing + optional right-drag offset
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

    /** @type {'orbit'|'tps'} */
    this.viewMode = 'orbit';
    this.characterYaw = 0;
    this._tpsYawOffset = 0;
    this._tpsPitch = 0.38;

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
  }

  /**
   * @param {'orbit'|'tps'} mode
   */
  setViewMode(mode) {
    const next = mode === 'tps' ? 'tps' : 'orbit';
    if (this.viewMode === next) return;
    this.viewMode = next;
    // Combat TPS: freeze OrbitControls so they cannot fight follow camera
    this.controls.enabled = next === 'orbit';
    if (next === 'tps') {
      this._tpsYawOffset = 0;
    }
  }

  /** Wheel zoom. Multiplicative, so each notch feels the same at any distance. */
  _onWheel(event) {
    event.preventDefault();

    const cam = settings.camera;
    // Firefox reports lines (deltaMode 1) and pages (2) rather than pixels.
    const scale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 100 : 1;
    const delta = (event.deltaY * scale) / 100;

    cam.distance = clamp(
      cam.distance * Math.exp(delta * 0.12 * cam.zoomSpeed),
      cam.minDistance,
      cam.maxDistance
    );
  }

  /** Point the rig should orbit around (character position). */
  setAnchor(x, y, z) {
    this.anchor.set(x, y, z);
  }

  /** Character facing (radians) for TPS back-follow. */
  setCharacterYaw(yaw) {
    this.characterYaw = yaw;
  }

  /** Nudge the look-at point toward an ability. `weight` 0..1, decays on its own. */
  lookAt(point, weight = 1) {
    this.focus.copy(point);
    this.focusWeight = Math.max(this.focusWeight, weight);
  }

  _onPointerDown = (event) => {
    if (this.viewMode !== 'tps') return;
    if (event.button !== 2) return;
    this._rmb = true;
    this._lastX = event.clientX;
    this._lastY = event.clientY;
  };

  _onPointerUp = () => {
    this._rmb = false;
  };

  _onPointerMove = (event) => {
    if (this.viewMode !== 'tps' || !this._rmb) return;
    const dx = event.clientX - this._lastX;
    const dy = event.clientY - this._lastY;
    this._lastX = event.clientX;
    this._lastY = event.clientY;
    this._tpsYawOffset -= dx * 0.004;
    this._tpsPitch = clamp(this._tpsPitch + dy * 0.003, 0.12, 1.15);
  };

  update(dt) {
    const cam = settings.camera;

    if (this.camera.fov !== cam.fov) {
      this.camera.fov = cam.fov;
      this.camera.updateProjectionMatrix();
    }

    this.distance = damp(this.distance, cam.distance, cam.zoomDamping, dt);
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
   * Combat TPS: place camera behind character; OrbitControls disabled.
   * @param {number} dt
   * @param {object} cam settings.camera
   * @param {boolean} [snap] skip damping (spawn / mode switch)
   */
  _updateTps(dt, cam, snap = false) {
    this.controls.enabled = false;

    const yaw = this.characterYaw + this._tpsYawOffset;
    const pitch = this._tpsPitch;
    const dist = this.distance * (cam.tpsDistanceScale ?? 0.85);
    const height = cam.targetHeight + Math.sin(pitch) * dist * 0.9;

    _desiredTarget.copy(this.anchor);
    _desiredTarget.y += cam.targetHeight;
    if (this.focusWeight > 0.05) {
      _desiredTarget.lerp(this.focus, Math.min(0.45, this.focusWeight * cam.autoFrame));
    }

    // Behind character: opposite of facing (+Z local face when yaw=0)
    _desiredPos.set(
      this.anchor.x - Math.sin(yaw) * dist * Math.cos(pitch),
      this.anchor.y + height,
      this.anchor.z - Math.cos(yaw) * dist * Math.cos(pitch)
    );

    if (snap || dt <= 0) {
      this.camera.position.copy(_desiredPos);
    } else {
      const dampT = cam.tpsDamping ?? 0.14;
      this.camera.position.x = damp(this.camera.position.x, _desiredPos.x, dampT, dt);
      this.camera.position.y = damp(this.camera.position.y, _desiredPos.y, dampT, dt);
      this.camera.position.z = damp(this.camera.position.z, _desiredPos.z, dampT, dt);
    }

    _look.copy(_desiredTarget);
    this.camera.lookAt(_look);
    this.controls.target.copy(_look);
  }

  /** Instant TPS frame on character (call after load / session enter). */
  snapToCharacter(x, y, z, yaw = 0) {
    this.setAnchor(x, y ?? 0, z);
    this.setCharacterYaw(yaw);
    this.setViewMode('tps');
    this.distance = settings.camera.distance;
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
