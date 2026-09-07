import { PerspectiveCamera, Vector3, MOUSE, TOUCH, Raycaster } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { settings } from '../config/settings.js';
import { clamp, damp } from '../utils/math.js';
import { enableMainCameraLayers } from './Layers.js';

const _dir = new Vector3();
const _desiredTarget = new Vector3();
const _follow = new Vector3();
const _right = new Vector3();
const _look = new Vector3();
const _desiredCam = new Vector3();
const Y_UP = new Vector3(0, 1, 0);
const _ray = new Raycaster();

/**
 * Third-person camera.
 *
 * Play TPS matches combat.grudge-studio.com (SaberGame.updateCamera):
 * owned yaw/pitch, pointer-lock look, exp follow, lookAt upper body.
 * OrbitControls stays for builder/equip only — never writes the lens in TPS.
 *
 * @see F:/GitHub/grudgecombat/grudgewarlordseracombat/artifacts/saber-academy/src/game/SaberGame.ts
 */
export class CameraRig {
  constructor(domElement) {
    const cam = settings.camera;
    this.camera = new PerspectiveCamera(
      cam.fov ?? 70,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    enableMainCameraLayers(this.camera);

    this.controls = new OrbitControls(this.camera, domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.075;
    this.controls.enablePan = false;
    this.controls.enableZoom = false;
    this.controls.minPolarAngle = cam.minPolar ?? 0.05;
    this.controls.maxPolarAngle = cam.maxPolar ?? 1.25;
    this.controls.rotateSpeed = 0.65;
    this.controls.mouseButtons = { LEFT: null, MIDDLE: null, RIGHT: MOUSE.ROTATE };
    this.controls.touches = { ONE: TOUCH.ROTATE, TWO: TOUCH.DOLLY_ROTATE };
    this.controls.enabled = false;
    this.controls.enableRotate = false;

    this.anchor = new Vector3(0, 0, 0);
    this.focus = new Vector3(0, 0, 0);
    this.focusWeight = 0;
    this.softLockPoint = null;
    this.softLockWeight = 0;
    this.combatFocus = null;

    /** @type {'orbit'|'tps'} */
    this.viewMode = 'tps';
    this.characterYaw = 0;
    this._tpsYawOffset = 0;
    this._holdCharacterYaw = null;
    this._sprinting = false;
    this._externalFovKick = 0;
    this._fov = cam.fov ?? 70;

    /** Owned look — yaw/pitch is the **aim** direction (crosshair). */
    this.yaw = Math.PI;
    this.pitch = cam.tpsDefaultPitch ?? 0.16;
    this.distance = cam.distance ?? 6.4;
    /** Combat follow: 1 - exp(-9 dt) */
    this.followLambda = cam.followLambda ?? 9;
    /** Meshes the lens must not clip (optional). */
    this.occluders = [];

    this._shake = 0;
    this._shakeOffset = new Vector3();
    this._shakeSeed = Math.random() * 100;
    this.shakeOffset = new Vector3();
    this.shakeRoll = 0;

    this.domElement = domElement;
    this._onWheel = this._onWheel.bind(this);
    this._onPointerMove = this._onPointerMove.bind(this);
    this._onPointerDown = this._onPointerDown.bind(this);
    this._onPointerUp = this._onPointerUp.bind(this);
    this._rmb = false;
    this._lastX = 0;
    this._lastY = 0;

    const th = cam.targetHeight ?? 1.95;
    this.controls.target.set(0, th, 0);
    this.camera.position.set(
      -Math.sin(this.yaw) * this.distance * Math.cos(this.pitch),
      th + Math.sin(this.pitch) * this.distance,
      -Math.cos(this.yaw) * this.distance * Math.cos(this.pitch)
    );
    this.camera.lookAt(0, th, 0);

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

  setOccluders(list) {
    this.occluders = Array.isArray(list) ? list : [];
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
   * Play = owned TPS (Orbit off). Builder/equip = OrbitControls.
   */
  setViewMode(mode) {
    this.viewMode = mode === 'orbit' ? 'orbit' : 'tps';
    const orbit = this.viewMode === 'orbit';
    this.controls.enabled = orbit;
    this.controls.enableRotate = orbit;
  }

  get azimuth() {
    return this.viewMode === 'orbit' ? this.controls.getAzimuthalAngle() : this.yaw;
  }

  getTpsYaw() {
    return this.yaw;
  }

  /** Camera look heading on XZ — combat camHeading (sin/cos yaw). */
  getCameraForward(out = new Vector3()) {
    if (this.viewMode === 'orbit') {
      this.camera.getWorldDirection(out);
      out.y = 0;
      if (out.lengthSq() < 1e-6) out.set(0, 0, 1);
      else out.normalize();
      return out;
    }
    out.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    return out;
  }

  /**
   * Full 3D look / aim direction (screen-center ray).
   * +pitch looks down (mouse-down). Negative pitch looks at the sky.
   */
  getLookDirection(out = new Vector3()) {
    const cosP = Math.cos(this.pitch);
    const sinP = Math.sin(this.pitch);
    out.set(Math.sin(this.yaw) * cosP, -sinP, Math.cos(this.yaw) * cosP);
    if (out.lengthSq() < 1e-8) out.set(0, 0, 1);
    else out.normalize();
    return out;
  }

  getCameraRight(out = new Vector3()) {
    this.getCameraForward(_dir);
    // combat: forward × up = (-fz, 0, fx)
    out.set(-_dir.z, 0, _dir.x);
    return out;
  }

  _onWheel(event) {
    if (this.viewMode === 'orbit' && !this.controls.enabled) return;
    event.preventDefault();
    const cam = settings.camera;
    const scale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 100 : 1;
    const delta = (event.deltaY * scale) / 100;
    cam.distance = clamp(
      cam.distance * Math.exp(delta * 0.12 * (cam.zoomSpeed ?? 0.55)),
      cam.minDistance ?? 2.5,
      cam.maxDistance ?? 14
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

  /**
   * Cone-limited soft-lock assist. Pulls yaw/pitch toward the target chest
   * only while the target is inside the look cone. Mouse movement still wins.
   */
  applySoftLockYawAssist(dt) {
    if (!this.softLockPoint || this.softLockWeight < 0.02) return;
    const cam = settings.camera;
    const yawRate = cam.softLockYawAssist ?? 0;
    const pitchOn = cam.softLockPitchAssist !== false;
    if (yawRate <= 0 && !pitchOn) return;
    const cone = ((cam.softLockYawConeDeg ?? 42) * Math.PI) / 180;

    const dx = this.softLockPoint.x - this.camera.position.x;
    const dy = this.softLockPoint.y - this.camera.position.y;
    const dz = this.softLockPoint.z - this.camera.position.z;
    const horiz = Math.hypot(dx, dz);
    if (horiz < 0.25) return;

    const wantYaw = Math.atan2(dx, dz);
    const wantPitch = -Math.atan2(dy, horiz);
    let dyaw = wantYaw - this.yaw;
    while (dyaw > Math.PI) dyaw -= Math.PI * 2;
    while (dyaw < -Math.PI) dyaw += Math.PI * 2;
    const dpitch = wantPitch - this.pitch;
    if (Math.hypot(dyaw, dpitch) > cone) return;

    const w = this.softLockWeight;
    if (yawRate > 0) {
      const k = 1 - Math.exp(-yawRate * Math.max(0, dt) * w);
      this.yaw += dyaw * k;
    }
    if (pitchOn) {
      const pk =
        1 -
        Math.exp(
          -(cam.softLockPitchDamp ?? 0.09) * 14 * Math.max(0, dt) * w
        );
      this.pitch += dpitch * pk;
    }
  }

  shake(amount) {
    this._shake = Math.max(this._shake, amount);
  }

  _applyShake(dt) {
    this._shake = Math.max(0, this._shake - this._shake * Math.min(1, dt * 9) - dt * 0.02);
    if (this._shake <= 1e-4) return this._shakeOffset.set(0, 0, 0);
    const t = (performance.now() * 0.001 + this._shakeSeed) * 34;
    this._shakeOffset.set(
      Math.sin(t) * 1,
      Math.sin(t * 1.7 + 1.3) * 0.6,
      0
    );
    return this._shakeOffset.multiplyScalar(this._shake);
  }

  _pointerLocked() {
    return document.pointerLockElement === this.domElement;
  }

  _onPointerDown = (event) => {
    if (event.target !== this.domElement && event.target !== this.domElement.parentElement) {
      if (event.button === 2) this.combatFocus?.onPointerDown?.(event);
      return;
    }
    if (event.button === 2) {
      event.preventDefault?.();
      this.combatFocus?.onPointerDown?.(event);
      this._rmb = true;
      this._lastX = event.clientX;
      this._lastY = event.clientY;
    }
    // Targeting SSOT: RMB look/lock. LMB lock only when focus is already ON
    // (attack). Never steal LMB from path-draw or select.
    if (this.viewMode === 'tps' && !this._pointerLocked()) {
      const focusOn = !!this.combatFocus?.focusEnabled;
      const wantLock = event.button === 2 || (event.button === 0 && focusOn);
      if (wantLock) {
        try {
          const p = this.domElement.requestPointerLock?.();
          if (p && typeof p.catch === 'function') p.catch(() => {});
        } catch {
          /* gesture / policy */
        }
      }
    }
  };

  _onPointerUp = (event) => {
    this.combatFocus?.onPointerUp?.(event);
    this._rmb = false;
  };

  _onPointerMove = (event) => {
    this.combatFocus?.onPointerMove?.(event);
    const locked = this._pointerLocked();
    const look = this.viewMode === 'tps' && (locked || this._rmb);
    if (!look) {
      this._lastX = event.clientX;
      this._lastY = event.clientY;
      return;
    }

    const cam = settings.camera;
    const base = cam.orbitSensitivity ?? 0.0022;
    const lookMul = settings.controls?.lookSensitivity ?? 1;
    const sens = base * lookMul;
    const invertY = !!settings.controls?.invertLookY;
    let dx = event.movementX || 0;
    let dy = event.movementY || 0;
    if (!locked && !dx && !dy) {
      dx = event.clientX - this._lastX;
      dy = event.clientY - this._lastY;
    }
    this._lastX = event.clientX;
    this._lastY = event.clientY;
    if (dx === 0 && dy === 0) return;
    const dySign = invertY ? -1 : 1;
    this.yaw -= dx * sens;
    this.pitch += dy * sens * dySign;
  };

  /** Rotate owned look (focus assist / tests). */
  _orbitLook(yawDelta, pitchDelta) {
    this.yaw += yawDelta;
    this.pitch += pitchDelta;
  }

  _updateOwnedTps(dt) {
    const cam = settings.camera;
    const minP = cam.minPitch ?? -0.72;
    const maxP = cam.maxPitch ?? 1.12;
    if (this.pitch < minP) this.pitch = minP;
    if (this.pitch > maxP) this.pitch = maxP;

    const focused = !!this.combatFocus?.focusEnabled;
    const wantDist = this._sprinting
      ? (cam.sprintDistance ?? cam.distance ?? 7.2)
      : focused
        ? (cam.focusDistance ?? 5.6)
        : (cam.distance ?? 6.4);
    this.distance = damp(this.distance, wantDist, cam.zoomDamping ?? 0.18, dt);

    const th = cam.targetHeight ?? 1.52;
    const lookAhead = cam.lookAhead ?? 1.6;
    const boomLift = cam.boomLift ?? 0.42;
    const side = cam.shoulderSide ?? 1;
    const shoulder = focused
      ? (cam.focusShoulderOffset ?? cam.shoulderOffset ?? 0.58)
      : (cam.shoulderOffset ?? 0.58);

    this.getLookDirection(_dir);
    this.getCameraForward(_look);
    _right.set(_look.z, 0, -_look.x);

    // Chest, then a pivot *in front* of the body so the reticle is on the world,
    // not glued to the hero mesh (orbit-look-at-chest kept the aim on torso).
    _desiredTarget.copy(this.anchor);
    _desiredTarget.y += th;
    if (this.softLockPoint && this.softLockWeight > 0.02) {
      _follow.copy(this.softLockPoint);
      _desiredTarget.lerp(_follow, 0.16 * this.softLockWeight);
    }
    _desiredTarget.addScaledVector(_look, lookAhead);

    let dist = this.distance;
    if (this.occluders.length) {
      _follow.copy(_dir).multiplyScalar(-1);
      _ray.set(_desiredTarget, _follow);
      _ray.far = dist;
      const hits = _ray.intersectObjects(this.occluders, true);
      if (hits.length && hits[0].distance < dist) {
        dist = Math.max(1.5, hits[0].distance - 0.35);
      }
    }

    _desiredCam.copy(_desiredTarget).addScaledVector(_dir, -dist);
    _desiredCam.y += boomLift;
    _desiredCam.addScaledVector(_right, shoulder * side);
    // Stay behind the body: if the boom crossed in front of the chest, push back.
    _follow.copy(_desiredCam).sub(this.anchor);
    _follow.y = 0;
    if (_follow.dot(_look) > 0.05) {
      _desiredCam.copy(this.anchor);
      _desiredCam.y += th + boomLift;
      _desiredCam.addScaledVector(_dir, -dist);
      _desiredCam.addScaledVector(_right, shoulder * side);
    }
    if (_desiredCam.y < 0.45) _desiredCam.y = 0.45;

    const k = 1 - Math.exp(-(this.followLambda ?? 11) * Math.max(0, dt));
    this.camera.position.lerp(_desiredCam, k);
    // Look along aim, not at the mesh — screen center is the world aim point
    _follow.copy(this.camera.position).addScaledVector(_dir, 48);
    this.camera.lookAt(_follow);
    this.controls.target.copy(_desiredTarget);
  }

  _updateOrbit(dt) {
    const cam = settings.camera;
    this.controls.minPolarAngle = cam.minPolar ?? 0.22;
    this.controls.maxPolarAngle = cam.maxPolar ?? 1.4;

    _desiredTarget.copy(this.anchor);
    _desiredTarget.y += cam.targetHeight ?? 1.55;

    const target = this.controls.target;
    _follow.set(
      damp(target.x, _desiredTarget.x, cam.damping ?? 0.06, dt) - target.x,
      damp(target.y, _desiredTarget.y, cam.damping ?? 0.06, dt) - target.y,
      damp(target.z, _desiredTarget.z, cam.damping ?? 0.06, dt) - target.z
    );
    target.add(_follow);
    this.camera.position.add(_follow);
    this.controls.update();

    this.distance = damp(this.distance, cam.distance, cam.zoomDamping ?? 0.18, dt);
    _dir.copy(this.camera.position).sub(this.controls.target);
    const len = _dir.length() || 1;
    _dir.multiplyScalar(1 / len);
    this.camera.position.copy(this.controls.target).addScaledVector(_dir, this.distance);
  }

  update(dt) {
    const cam = settings.camera;

    this.camera.position.sub(this._shakeOffset);
    if (this.shakeOffset.lengthSq() > 0) this.camera.position.sub(this.shakeOffset);
    if (this.shakeRoll) this.camera.rotateZ(-this.shakeRoll);

    const focused = !!this.combatFocus?.focusEnabled;
    const baseFov = this._sprinting
      ? (cam.sprintFov ?? cam.fov ?? 70)
      : focused
        ? (cam.actionFov ?? cam.fov ?? 72)
        : (cam.fov ?? 70);
    const wantFov = baseFov + (this._externalFovKick || 0);
    this._fov = damp(this._fov, wantFov, cam.fovDamping ?? 0.16, dt);
    if (Math.abs(this.camera.fov - this._fov) > 0.05) {
      this.camera.fov = this._fov;
      this.camera.updateProjectionMatrix();
    }

    if (this.viewMode === 'orbit') this._updateOrbit(dt);
    else this._updateOwnedTps(dt);

    this.camera.position.add(this._applyShake(dt));
    if (this.shakeOffset.lengthSq() > 0) this.camera.position.add(this.shakeOffset);
    if (this.shakeRoll) this.camera.rotateZ(this.shakeRoll);

    this.focusWeight = damp(this.focusWeight, 0, 0.08, dt);
  }

  snapToCharacter(x, y, z, yaw = 0) {
    this.setAnchor(x, y ?? 0, z);
    this.characterYaw = yaw;
    this.yaw = yaw;
    const cam = settings.camera;
    this.distance = cam.distance ?? 6.4;
    this.pitch = cam.tpsDefaultPitch ?? 0.16;
    const th = cam.targetHeight ?? 1.52;
    this.getLookDirection(_dir);
    this.getCameraForward(_look);
    _desiredTarget.set(x, (y ?? 0) + th, z);
    _desiredTarget.addScaledVector(_look, cam.lookAhead ?? 3.4);
    this.controls.target.copy(_desiredTarget);
    this.camera.position.copy(_desiredTarget).addScaledVector(_dir, -this.distance);
    this.camera.position.y += cam.boomLift ?? 0.42;
    _follow.copy(this.camera.position).addScaledVector(_dir, 48);
    this.camera.lookAt(_follow);
    this.setViewMode('tps');
  }

  applyGameplayMode(mode) {
    const play = settings.camera?.play || {};
    const apply = (p) => {
      if (p.distance != null) {
        settings.camera.distance = p.distance;
        this.distance = p.distance;
      }
      if (p.pitch != null) this.pitch = p.pitch;
      if (p.fov != null) {
        settings.camera.fov = p.fov;
        this._fov = p.fov;
      }
    };
    if (mode === 'combat' || mode === 'freeride' || mode === 'harvest') {
      apply(play.combat || {});
      this.setViewMode('tps');
      return;
    }
    if (mode === 'build' || mode === 'equip' || mode === 'builder') {
      apply(play.build || {});
      this.setViewMode('orbit');
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
