/**
 * Mesh mixer — one AnimationMixer per non-hero skeleton (vehicle law).
 *
 * Hero Toon kit: CharacterController.mixer only.
 * Horse / harvest animal / heal-field GLB / projectile aura / TPS pistol prop:
 * their own root gets this mixer + clip *states* (idle / run / death / draw).
 *
 * Not XState — playerActivityMachine stays combat↔harvest only.
 * Same rule as HorseMount and animal harvest.
 *
 * @see docs/ANIM_LIBRARY_SSOT.md
 * @see src/world/HorseMount.js
 */
import { AnimationMixer, LoopOnce, LoopRepeat } from 'three';

export class MeshMixer {
  /**
   * @param {import('three').Object3D} root  vehicle / animal / VFX / prop — never the play kit
   */
  constructor(root) {
    this.root = root;
    this.mixer = new AnimationMixer(root);
    /** @type {Map<string, import('three').AnimationAction>} */
    this.actions = new Map();
    /** @type {import('three').AnimationAction|null} */
    this.current = null;
  }

  /**
   * @param {import('three').AnimationClip} clip
   * @param {string|null} [role]  idle | run | death | draw | …
   * @param {{ once?: boolean }} [opts]
   */
  addClip(clip, role = null, opts = {}) {
    if (!clip) return null;
    const once = !!opts.once;
    const act = this.mixer.clipAction(clip);
    act.setLoop(once ? LoopOnce : LoopRepeat, once ? 1 : Infinity);
    act.clampWhenFinished = once;
    if (clip.name) this.actions.set(clip.name, act);
    if (role) this.actions.set(role, act);
    return act;
  }

  /**
   * Crossfade to a named clip state.
   * @param {string} role
   * @param {number} [fade]
   */
  play(role, fade = 0.12) {
    const next = this.actions.get(role);
    if (!next) return false;
    if (this.current === next && next.isRunning()) return true;
    const f = Math.max(0.04, fade);
    for (const a of this.actions.values()) {
      if (a !== next && a.isRunning()) a.fadeOut(f);
    }
    next.reset().fadeIn(f * 0.85).play();
    this.current = next;
    return true;
  }

  /** @param {number} dt */
  update(dt) {
    if (dt > 0) this.mixer.update(dt);
  }

  dispose() {
    this.mixer.stopAllAction();
    try {
      this.mixer.uncacheRoot(this.root);
    } catch {
      /* older three */
    }
    this.actions.clear();
    this.current = null;
  }
}
