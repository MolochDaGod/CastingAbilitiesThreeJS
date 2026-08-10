/**
 * Bridge: LinearAbilityCastingThreeJS skillshots → Casting Warlords lab.
 *
 * Does **not** replace path-cast Fire/Water/Earth/Wind. Adds a second pool:
 * ice · thunder · meteor · beam · snare · glacier with MOBA line/zone aim.
 *
 * Best practices learned from LinearAbilityCasting:
 *  - settings SSOT sampled every frame (live editor knobs mid-cast)
 *  - pooled abilities, no alloc on cast
 *  - line advance at constant m/s + phase machine
 *  - aim indicator metres (SDF arrow / zone circle)
 *  - procedural geometry + GLSL materials (no texture sprites for FX)
 *
 * Hosts: casting.grudge.studio · casting.grudge-studio.com (same deploy)
 *
 * @see docs/LINEAR_SKILLSHOT_SSOT.md
 */

import { Vector3 } from 'three';
import { AbilityManager as LinearAbilityManager } from './abilities/AbilityManager.js';
import { AimController } from './AimController.js';
import {
  ELEMENTS as LINEAR_ELEMENTS,
  ELEMENT_META,
  settings as linearSettings,
  CastShape,
  castShapeOf
} from './linearSettings.js';
import { FissureSystem } from './effects/GroundFissures.js';

const _origin = new Vector3();
const _dir = new Vector3();

/** Product element / hotkey → linear skillshot id */
export const PRODUCT_TO_LINEAR = Object.freeze({
  ice: 'ice',
  storm: 'thunder',
  fire: 'meteor',
  holy: 'beam',
  arcane: 'snare',
  nature: 'glacier',
  // direct skillshot ids
  ice_shot: 'ice',
  thunder: 'thunder',
  meteor: 'meteor',
  beam: 'beam',
  snare: 'snare',
  glacier: 'glacier'
});

/** Sandbox arm keys (Linear README: Q E R F V + glacier) */
export const LINEAR_HOTKEYS = Object.freeze({
  KeyQ: 'ice',
  KeyE: 'thunder',
  KeyR: 'meteor',
  KeyF: 'beam',
  KeyV: 'snare',
  KeyG: 'glacier'
});

export { LINEAR_ELEMENTS, ELEMENT_META, linearSettings, CastShape, castShapeOf };

/**
 * Owns linear AbilityManager + AimController + fissures.
 * Wire from App after particles/decals/lights exist.
 */
export class LinearSkillBridge {
  /**
   * @param {{
   *   scene: import('three').Scene,
   *   camera: import('three').Camera,
   *   environment: object,
   *   particles: object,
   *   lights: object,
   *   decals: object,
   *   bursts: object,
   *   shake: object,
   *   flash: object,
   *   character?: object,
   *   onToast?: (s: string) => void
   * }} ctx
   */
  constructor(ctx) {
    this.ctx = ctx;
    this.onToast = ctx.onToast || (() => {});
    this.enabled = true;
    this.armed = false;
    this.selected = LINEAR_ELEMENTS[0];
    this.cooldowns = new Map(LINEAR_ELEMENTS.map((e) => [e, 0]));

    this.fissures = new FissureSystem(ctx.scene);

    this.manager = new LinearAbilityManager({
      scene: ctx.scene,
      camera: ctx.camera,
      environment: ctx.environment,
      particles: ctx.particles,
      lights: ctx.lights,
      decals: ctx.decals,
      fissures: this.fissures,
      bursts: ctx.bursts,
      shake: ctx.shake,
      flash: ctx.flash
    });

    this.aim = new AimController(ctx.camera);
    ctx.scene.add(this.aim.object3D);

    this.aim.on('cast', (origin, direction, distance) => {
      this._fire(origin, direction, distance);
    });
    this.aim.on('reject', () => this.onToast('Too close — aim further out'));
    this.aim.on('cancel', () => {
      this.armed = false;
    });
  }

  /**
   * Select + arm skillshot for MOBA aim (or fire immediately if opts.instant).
   * @param {string} id product element or linear id
   * @param {{ instant?: boolean, origin?: Vector3, direction?: Vector3, distance?: number }} [opts]
   */
  select(id, opts = {}) {
    const linear = PRODUCT_TO_LINEAR[id] || (LINEAR_ELEMENTS.includes(id) ? id : null);
    if (!linear) return false;
    this.selected = linear;
    this.manager.select(linear);
    this.aim.setElement(linear);

    if (opts.instant && opts.origin && opts.direction) {
      const dist =
        opts.distance ??
        linearSettings[linear]?.range ??
        12;
      this._fire(opts.origin, opts.direction, dist);
      return true;
    }
    return true;
  }

  /**
   * Arm ground indicator (line or zone). Call after select.
   * @param {Vector3} feet
   */
  arm(feet) {
    if (!this.enabled) return;
    const cd = this.cooldowns.get(this.selected) || 0;
    if (cd > 0) {
      this.onToast(`${this.selected} cooling · ${cd.toFixed(1)}s`);
      return;
    }
    this.armed = true;
    this.aim.setElement(this.selected);
    if (feet) this.aim.setOrigin(feet);
    this.aim.arm();
    const meta = ELEMENT_META[this.selected];
    this.onToast(
      `Arm ${meta?.label || this.selected} · ${
        castShapeOf(this.selected) === CastShape.ZONE ? 'zone' : 'line'
      } · click to fire · Esc cancel`
    );
  }

  /** Cancel arming without cast. */
  cancel() {
    this.armed = false;
    this.aim.cancel();
  }

  /** Confirm cast if armed (LMB while skillshot aiming). */
  confirm() {
    if (!this.armed && !this.aim.isArmed) return false;
    return this.aim.confirm();
  }

  /**
   * Fire from focus crosshair / mouse aim (combat skill path).
   * @param {Vector3} feet
   * @param {Vector3} aimPoint world
   * @param {string} [id]
   */
  castToward(feet, aimPoint, id) {
    if (id) this.select(id);
    _origin.copy(feet);
    _origin.y = 0;
    _dir.set(aimPoint.x - feet.x, 0, aimPoint.z - feet.z);
    const len = _dir.length();
    if (len < 0.15) _dir.set(0, 0, 1);
    else _dir.multiplyScalar(1 / len);
    const maxR = linearSettings[this.selected]?.range ?? 14;
    const minR = linearSettings[this.selected]?.minRange ?? 1.5;
    const dist = Math.max(minR, Math.min(maxR, len || maxR * 0.7));
    return this._fire(_origin, _dir, dist);
  }

  /**
   * @param {Vector3} origin
   * @param {Vector3} direction
   * @param {number} distance
   */
  _fire(origin, direction, distance) {
    const cd = this.cooldowns.get(this.selected) || 0;
    if (cd > 0) return null;
    const ab = this.manager.cast(origin, direction, distance, this.selected);
    if (!ab) return null;
    const cool = linearSettings[this.selected]?.cooldown ?? 0.5;
    this.cooldowns.set(this.selected, cool);
    this.armed = false;
    this.ctx.character?.playCastFlourish?.() ||
      this.ctx.character?.playWeaponCombat?.('cast') ||
      this.ctx.character?.requestOneShot?.('cast');
    // Face cast
    if (this.ctx.character && direction) {
      const yaw = Math.atan2(direction.x, direction.z);
      if (typeof this.ctx.character.facing === 'number') this.ctx.character.facing = yaw;
      if (this.ctx.character.root) this.ctx.character.root.rotation.y = yaw;
    }
    this.onToast(`${ELEMENT_META[this.selected]?.label || this.selected} cast`);
    return ab;
  }

  /**
   * @param {number} dt
   * @param {Vector3} feet
   * @param {{x:number,y:number}|null} pointerNdc
   */
  update(dt, feet, pointerNdc) {
    for (const [k, v] of this.cooldowns) {
      if (v > 0) this.cooldowns.set(k, Math.max(0, v - dt));
    }
    this.manager.update(dt);
    this.fissures?.update?.(dt);

    if (this.aim.isArmed || this.armed) {
      this.armed = this.aim.isArmed;
      if (feet) this.aim.setOrigin(feet);
      if (pointerNdc) this.aim.point(pointerNdc);
      this.aim.update(dt);
    } else {
      this.aim.update(dt); // reveal fade-out
    }
  }

  /** Intensity / global knobs → linearSettings.global (live mid-cast). */
  applyIntensity(level = 1) {
    const g = linearSettings.global;
    if (!g) return;
    const t = Math.max(0.25, Math.min(2, level));
    g.shaderIntensity = t;
    g.glow = t;
    g.explosionIntensity = t;
    g.particleSize = 0.85 + t * 0.25;
    g.lightIntensity = t;
  }

  clear() {
    this.manager.clear?.();
    this.cancel();
  }

  dispose() {
    this.clear();
    this.aim?.object3D?.removeFromParent?.();
  }
}
