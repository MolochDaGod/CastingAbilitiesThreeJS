import { MathUtils, Raycaster, Vector2, Vector3 } from 'three';
import { EventEmitter } from '../utils/EventEmitter.js';
import { settings } from '../config/settings.js';

const _ndc = new Vector2();
const _hit = new Vector3();
const _tmp = new Vector3();
const _camFwd = new Vector3();

/**
 * Soft-lock combat focus (production targeting SSOT).
 *
 * From grudge-combat-targeting + grudge-third-person-controller angles:
 *  - RMB **click** toggles focusEnabled (sticky hard-focus flag)
 *  - RMB **hold** = orbit only (does not clear toggle)
 *  - Soft lock: keep selectedTarget without snapping camera hard
 *  - Body faces camera-forward when focus on; travel dir when off
 *
 * Does **not** replace MouseAim ground ray — complements it.
 * LMB path cast stays primary in Casting lab; soft lock target via
 * raycast pick when focus is on (optional) or explicit select list.
 *
 * @see docs/COMBAT_CAMERA_FOCUS_SSOT.md
 * @see skill grudge-combat-targeting
 */
export class CombatFocus extends EventEmitter {
  constructor() {
    super();
    /** Sticky focus mode (RMB toggle) */
    this.focusEnabled = false;
    /** RMB currently held (orbit) */
    this.rmbHeld = false;
    /**
     * Soft-lock target
     * @type {{ id: string, point: Vector3, mesh?: import('three').Object3D, kind?: string }|null}
     */
    this.selectedTarget = null;
    /** Screen crosshair should show */
    this.showCrosshair = false;
    /** Meshes tagged userData.selectable for pick */
    this.selectables = [];
    this.raycaster = new Raycaster();
    this.raycaster.far = 80;
    this._rmbDownAt = 0;
    this._rmbMoved = false;
  }

  /**
   * @param {import('three').Object3D[]} meshes
   */
  setSelectables(meshes) {
    this.selectables = meshes || [];
  }

  addSelectable(mesh, kind = 'hostile') {
    if (!mesh) return;
    mesh.userData.selectable = kind;
    if (!this.selectables.includes(mesh)) this.selectables.push(mesh);
  }

  clearTarget() {
    this.selectedTarget = null;
    this.emit('target', null);
  }

  /**
   * @param {{ id?: string, point: Vector3, mesh?: import('three').Object3D, kind?: string }} ref
   */
  setTarget(ref) {
    if (!ref?.point) {
      this.clearTarget();
      return;
    }
    this.selectedTarget = {
      id: ref.id || ref.mesh?.uuid || 'target',
      point: ref.point.clone(),
      mesh: ref.mesh,
      kind: ref.kind || ref.mesh?.userData?.selectable || 'hostile'
    };
    this.emit('target', this.selectedTarget);
  }

  toggleFocus() {
    this.focusEnabled = !this.focusEnabled;
    this.showCrosshair = this.focusEnabled;
    this.emit('focus', this.focusEnabled);
    return this.focusEnabled;
  }

  /**
   * Pointer down RMB — start hold; click vs drag decided on up.
   * @param {PointerEvent} e
   */
  onPointerDown(e) {
    if (e.button !== 2) return;
    this.rmbHeld = true;
    this._rmbDownAt = performance.now();
    this._rmbMoved = false;
    this._lastX = e.clientX;
    this._lastY = e.clientY;
  }

  onPointerMove(e) {
    if (!this.rmbHeld) return;
    const dx = e.clientX - (this._lastX || e.clientX);
    const dy = e.clientY - (this._lastY || e.clientY);
    if (Math.hypot(dx, dy) > 4) this._rmbMoved = true;
    this._lastX = e.clientX;
    this._lastY = e.clientY;
  }

  /**
   * RMB release — if short click without drag, toggle focus.
   * @param {PointerEvent} [e]
   */
  onPointerUp(e) {
    if (e && e.button !== 2 && e.button !== undefined) return;
    const held = performance.now() - this._rmbDownAt;
    const wasHeld = this.rmbHeld;
    this.rmbHeld = false;
    if (!wasHeld) return;
    // Click toggle (not a long orbit drag)
    if (!this._rmbMoved && held < 280) {
      const on = this.toggleFocus();
      this.emit('toast', on ? 'Focus ON · soft lock' : 'Focus OFF · free aim');
    }
  }

  /** Clear latched RMB on blur / tab hide */
  clearHeld() {
    this.rmbHeld = false;
  }

  /**
   * Raycast pick from NDC into selectables (soft lock target).
   * @param {import('three').Camera} camera
   * @param {Vector2} ndc
   * @returns {boolean}
   */
  pickFromNdc(camera, ndc) {
    if (!this.selectables.length) return false;
    this.raycaster.setFromCamera(ndc, camera);
    const hits = this.raycaster.intersectObjects(this.selectables, true);
    for (const h of hits) {
      let o = h.object;
      while (o && !o.userData?.selectable && o.parent) o = o.parent;
      if (o?.userData?.selectable) {
        const pt = h.point.clone();
        pt.y += 1.1; // chest-ish
        this.setTarget({
          id: o.uuid,
          point: pt,
          mesh: o,
          kind: o.userData.selectable
        });
        return true;
      }
    }
    return false;
  }

  /**
   * Soft-lock aim point: lerp ground aim toward target (no hard snap).
   * @param {Vector3} playerPos
   * @param {Vector3} groundAim MouseAim.point
   * @param {Vector3} out
   * @returns {Vector3}
   */
  resolveAimPoint(playerPos, groundAim, out = new Vector3()) {
    if (!this.focusEnabled || !this.selectedTarget) {
      return out.copy(groundAim);
    }
    // Soft lock: blend ground aim toward locked target XZ
    const soft = settings.aim?.softLockBlend ?? 0.55;
    out.copy(groundAim);
    out.x = MathUtils.lerp(out.x, this.selectedTarget.point.x, soft);
    out.z = MathUtils.lerp(out.z, this.selectedTarget.point.z, soft);
    out.y = MathUtils.lerp(out.y, this.selectedTarget.point.y * 0.15, soft * 0.5);
    // Keep ahead of player (min 1.5 m)
    _tmp.subVectors(out, playerPos);
    _tmp.y = 0;
    const d = _tmp.length();
    if (d < 1.5 && d > 1e-4) {
      _tmp.multiplyScalar(1.5 / d);
      out.copy(playerPos).add(_tmp);
      out.y = groundAim.y;
    }
    // Update target point if mesh moved
    if (this.selectedTarget.mesh) {
      this.selectedTarget.mesh.getWorldPosition(_hit);
      _hit.y += 1.1;
      this.selectedTarget.point.lerp(_hit, 0.35);
    }
    return out;
  }

  /**
   * Desired body yaw for facing.
   * Focus ON → camera forward; else aim / travel.
   * @param {number} aimYaw
   * @param {number} travelYaw
   * @param {boolean} moving
   * @param {import('three').Camera} camera
   */
  resolveBodyYaw(aimYaw, travelYaw, moving, camera) {
    if (this.focusEnabled || this.rmbHeld) {
      camera.getWorldDirection(_camFwd);
      _camFwd.y = 0;
      if (_camFwd.lengthSq() < 1e-6) return aimYaw;
      _camFwd.normalize();
      return Math.atan2(_camFwd.x, _camFwd.z);
    }
    if (moving && settings.aim?.faceTravelWhenMoving) return travelYaw;
    return aimYaw;
  }

  snapshot() {
    return {
      focusEnabled: this.focusEnabled,
      rmbHeld: this.rmbHeld,
      hasTarget: !!this.selectedTarget,
      targetId: this.selectedTarget?.id || null,
      showCrosshair: this.showCrosshair || this.focusEnabled
    };
  }
}
