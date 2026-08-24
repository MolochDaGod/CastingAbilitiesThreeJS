/**
 * Pointer lock manager — focus-driven lock/unlock with read state.
 *
 * Rules (simple):
 * - Focus ON → request lock + stay locked
 * - Focus OFF → exit lock immediately
 * - Lock state always readable via isLocked
 * - Handles browser policy delays gracefully (single 40ms retry)
 */

export class PointerLockManager {
  constructor(canvas) {
    this.canvas = canvas;
    this.isLocked = false;
    this._lockAttempts = 0;
    this._maxRetries = 1; // One retry is enough

    this._onLockChange = this._onLockChange.bind(this);
    this._onLockError = this._onLockError.bind(this);

    document.addEventListener('pointerlockchange', this._onLockChange);
    document.addEventListener('pointerlockerror', this._onLockError);
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

  /**
   * Engage lock when focus mode activates.
   * Retries once (40ms) if browser delayed grant.
   */
  engageLock() {
    if (this.isLocked || this._lockAttempts >= this._maxRetries) return;
    this._requestLock();
    setTimeout(() => {
      if (!this.isLocked && this._lockAttempts < this._maxRetries) {
        this._requestLock();
      }
    }, 40);
  }

  /**
   * Disengage lock when focus mode deactivates.
   */
  disengageLock() {
    this._lockAttempts = 0;
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

  dispose() {
    this.disengageLock();
    document.removeEventListener('pointerlockchange', this._onLockChange);
    document.removeEventListener('pointerlockerror', this._onLockError);
  }
}
