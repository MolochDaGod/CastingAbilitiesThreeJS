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
    /** Soft lock active (auto ON with focus when settings.aim.softLockOnFocus) */
    this.softLockEnabled = false;
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
    /** Index into sorted target list for Tab cycle */
    this._cycleIndex = -1;
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

  /**
   * @param {import('three').Object3D} mesh
   */
  removeSelectable(mesh) {
    if (!mesh) return;
    this.selectables = this.selectables.filter((m) => m !== mesh);
    if (this.selectedTarget?.mesh === mesh) this.clearTarget();
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
    // Soft lock engages with focus (Fortnite/TPS style — not free roam)
    if (this.focusEnabled && settings.aim?.softLockOnFocus !== false) {
      this.softLockEnabled = true;
    } else if (!this.focusEnabled) {
      // Keep selected target for re-focus, but mark soft lock idle
      this.softLockEnabled = false;
    }
    this.emit('focus', this.focusEnabled);
    return this.focusEnabled;
  }

  /** Human toast copy for focus mode. */
  focusToast() {
    return this.focusEnabled
      ? 'Focus ON · mouse = look · crosshair aim · LMB attack'
      : 'Focus OFF · free cursor · LMB select';
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
    // Hold mode: focus while RMB down (settings.controls.focusToggle === false)
    if (settings.controls?.focusToggle === false && !this.focusEnabled) {
      this.focusEnabled = true;
      this.showCrosshair = true;
      this.emit('focus', true);
      this.emit('toast', this.focusToast());
    }
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

    // Hold mode: release RMB ends focus
    if (settings.controls?.focusToggle === false) {
      if (this.focusEnabled) {
        this.focusEnabled = false;
        this.showCrosshair = false;
        this.emit('focus', false);
        this.emit('toast', this.focusToast());
      }
      return;
    }

    // Toggle mode (default): short click without drag
    if (!this._rmbMoved && held < 280) {
      this.toggleFocus();
      this.emit('toast', this.focusToast());
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
   * Soft-lock aim point: magnetic blend toward target (no hard snap).
   * Prefer 3D hit points from MouseAim.updateFocusAim (cone-limited).
   * @param {Vector3} playerPos
   * @param {Vector3} groundAim MouseAim.point or hitPoint
   * @param {Vector3} out
   * @returns {Vector3}
   */
  resolveAimPoint(playerPos, groundAim, out = new Vector3()) {
    // Track moving soft-lock mesh first
    if (this.selectedTarget?.mesh) {
      this.selectedTarget.mesh.getWorldPosition(_hit);
      _hit.y += 1.1;
      this.selectedTarget.point.lerp(_hit, 0.4);
    }
    if (!this.focusEnabled || !this.selectedTarget) {
      return out.copy(groundAim);
    }
    // Soft lock: blend toward locked target (3D-aware)
    const soft = settings.aim?.softLockBlend ?? 0.55;
    out.copy(groundAim);
    out.x = MathUtils.lerp(out.x, this.selectedTarget.point.x, soft);
    out.z = MathUtils.lerp(out.z, this.selectedTarget.point.z, soft);
    out.y = MathUtils.lerp(
      out.y,
      this.selectedTarget.point.y,
      soft * 0.75
    );
    // Keep ahead of player (min 1.5 m XZ)
    _tmp.subVectors(out, playerPos);
    _tmp.y = 0;
    const d = _tmp.length();
    if (d < 1.5 && d > 1e-4) {
      _tmp.multiplyScalar(1.5 / d);
      const y = out.y;
      out.copy(playerPos).add(_tmp);
      out.y = y;
    }
    return out;
  }

  /** Soft-lock world point for MouseAim magnetic cone (null if none). */
  getSoftLockPoint() {
    const softOn =
      this.softLockEnabled ||
      (this.focusEnabled && settings.aim?.softLockOnFocus !== false);
    if (!softOn || !this.selectedTarget) return null;
    if (this.selectedTarget.mesh) {
      // Drop dead / removed meshes
      if (!this.selectedTarget.mesh.parent) {
        this.clearTarget();
        return null;
      }
      this.selectedTarget.mesh.getWorldPosition(_hit);
      _hit.y += 1.1;
      this.selectedTarget.point.lerp(_hit, 0.35);
    }
    return this.selectedTarget.point;
  }

  /**
   * Live selectable entries with world points (for Tab cycle + auto-acquire).
   * @param {Vector3} playerPos
   * @param {number} [range]
   * @returns {Array<{ id: string, point: Vector3, mesh: import('three').Object3D, kind: string, dist: number }>}
   */
  listTargetsInRange(playerPos, range) {
    const maxR = range ?? settings.aim?.softLockRange ?? 28;
    const maxR2 = maxR * maxR;
    /** @type {Array<{ id: string, point: Vector3, mesh: import('three').Object3D, kind: string, dist: number }>} */
    const out = [];
    for (const mesh of this.selectables) {
      if (!mesh || !mesh.parent || mesh.visible === false) continue;
      if (mesh.userData?.dead || mesh.userData?.selectable === false) continue;
      mesh.getWorldPosition(_hit);
      _hit.y += 1.1;
      const dx = _hit.x - playerPos.x;
      const dz = _hit.z - playerPos.z;
      const d2 = dx * dx + dz * dz;
      if (d2 > maxR2) continue;
      out.push({
        id: mesh.uuid,
        point: _hit.clone(),
        mesh,
        kind: mesh.userData?.selectable || 'hostile',
        dist: Math.sqrt(d2)
      });
    }
    // Nearest first for stable Tab order
    out.sort((a, b) => a.dist - b.dist);
    return out;
  }

  /**
   * Auto soft-lock nearest target when focus engages (no Tab yet).
   * @param {Vector3} playerPos
   * @returns {boolean}
   */
  acquireNearest(playerPos) {
    const list = this.listTargetsInRange(playerPos);
    if (!list.length) return false;
    const t = list[0];
    this._cycleIndex = 0;
    this.setTarget(t);
    return true;
  }

  /**
   * Tab / Shift+Tab soft-lock cycle (grudge-combat-targeting style).
   * @param {Vector3} playerPos
   * @param {boolean} [reverse]
   * @returns {boolean}
   */
  cycleTarget(playerPos, reverse = false) {
    const list = this.listTargetsInRange(playerPos);
    if (!list.length) {
      this.clearTarget();
      this._cycleIndex = -1;
      this.emit('toast', 'No targets in range');
      return false;
    }
    // Find current in list
    let idx = list.findIndex((t) => t.id === this.selectedTarget?.id);
    if (idx < 0) idx = reverse ? 0 : -1;
    idx = reverse
      ? (idx - 1 + list.length) % list.length
      : (idx + 1) % list.length;
    this._cycleIndex = idx;
    this.setTarget(list[idx]);
    this.softLockEnabled = true;
    const label =
      list[idx].mesh?.userData?.displayName ||
      list[idx].mesh?.name ||
      list[idx].kind ||
      'Target';
    this.emit('toast', `Target · ${label} (${idx + 1}/${list.length})`);
    return true;
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
      softLockEnabled:
        this.softLockEnabled ||
        (this.focusEnabled && settings.aim?.softLockOnFocus !== false),
      rmbHeld: this.rmbHeld,
      hasTarget: !!this.selectedTarget,
      targetId: this.selectedTarget?.id || null,
      showCrosshair: this.showCrosshair || this.focusEnabled
    };
  }
}
