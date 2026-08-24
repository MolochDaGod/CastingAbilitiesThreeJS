/**
 * Pointer lock manager — RMB-driven lock/unlock with read state.
 *
 * Rules:
 * - RMB down (focus enabled) → request lock
 * - RMB up → exit lock
 * - Focus toggle OFF → immediate exit
 * - Lock state always readable via isLocked
 *
 * Handles browser policy delays and re-acquisition gracefully.
 */

export class PointerLockManager {
  constructor(canvas) {
    this.canvas = canvas;
    this.isLocked = false;
    this._rmbDown = false;
    this._lockAttempts = 0;
    this._maxRetries = 3;

    this._onPointerDown = this._onPointerDown.bind(this);
    this._onPointerUp = this._onPointerUp.bind(this);
    this._onLockChange = this._onLockChange.bind(this);
    this._onLockError = this._onLockError.bind(this);

    document.addEventListener('pointerlockchange', this._onLockChange);
    document.addEventListener('pointerlockerror', this._onLockError);

    if (canvas) {
      canvas.addEventListener('pointerdown', this._onPointerDown, { capture: true });
      document.addEventListener('pointerup', this._onPointerUp, { capture: true });
    }
  }

  _onLockChange() {
    this.isLocked = document.pointerLockElement === this.canvas;
    if (this.isLocked) {
      this._lockAttempts = 0; // Reset on success
    }
  }

  _onLockError() {
    this._lockAttempts++;
  }

  _onPointerDown(e) {
    if (e.button !== 2) return; // Only RMB
    this._rmbDown = true;

    // RMB down + focus → request lock
    const focusEnabled = !!window.__castingApp?.combatFocus?.focusEnabled;
    if (focusEnabled && !this.isLocked && this._lockAttempts < this._maxRetries) {
      this._requestLock();
    }
  }

  _onPointerUp(e) {
    if (e.button !== 2) return; // Only RMB
    this._rmbDown = false;
    this._unlock();
  }

  _requestLock() {
    if (!this.canvas) return;
    try {
      this.canvas.requestPointerLock?.();
    } catch {
      // Policy violation — fallback to free mouse look
    }
  }

  _unlock() {
    try {
      if (this.isLocked) {
        document.exitPointerLock?.();
      }
    } catch {
      // Already unlocked or policy
    }
  }

  /**
   * Force unlock (e.g. focus toggle OFF).
   */
  forceUnlock() {
    this._rmbDown = false;
    this._unlock();
  }

  /**
   * Check if RMB is currently held.
   */
  isRmbDown() {
    return this._rmbDown;
  }

  dispose() {
    this.forceUnlock();
    document.removeEventListener('pointerlockchange', this._onLockChange);
    document.removeEventListener('pointerlockerror', this._onLockError);
    if (this.canvas) {
      this.canvas.removeEventListener('pointerdown', this._onPointerDown, { capture: true });
      document.removeEventListener('pointerup', this._onPointerUp, { capture: true });
    }
  }
}
