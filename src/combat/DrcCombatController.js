import { CatmullRomCurve3, MathUtils, Vector3 } from 'three';
import { DRC_WEAPON_SKILLS, skillBySlot } from './drcSkills.js';
import { settings } from '../config/settings.js';

const _origin = new Vector3();
const _fwd = new Vector3();
const _end = new Vector3();
const _mid = new Vector3();
const _move = new Vector3();

/**
 * DRC combat session on Casting Abilities systems:
 *  - session: equip | combat (Q toggles)
 *  - WASD locomotion on Toon RTS gait clips
 *  - skills 1–4 fire AbilityManager VFX + CharacterController one-shots
 *  - melee skill uses attack anim + short slash path
 *
 * Does not re-implement epicfight CombatController — hosts this sandbox only.
 */
export class DrcCombatController {
  /**
   * @param {{
   *   character: import('../animation/CharacterController.js').CharacterController,
   *   abilities: import('../abilities/AbilityManager.js').AbilityManager,
   *   camera: import('three').Camera,
   *   physics?: import('../physics/PhysicsWorld.js').PhysicsWorld|null,
   *   vfx?: import('../vfx/VfxDirector.js').VfxDirector|null,
   *   onToast?: (msg: string) => void,
   *   onSession?: (session: 'equip'|'combat') => void
   * }} opts
   */
  constructor(opts) {
    this.character = opts.character;
    this.abilities = opts.abilities;
    this.camera = opts.camera;
    this.physics = opts.physics || null;
    this.vfx = opts.vfx || null;
    this.onToast = opts.onToast || (() => {});
    this.onSession = opts.onSession || (() => {});

    /** @type {'equip'|'combat'} — combat-first showcase (Q toggles equip) */
    this.session = 'combat';
    this.skills = DRC_WEAPON_SKILLS;
    /** @type {Map<string, number>} skillId → readyAt elapsed */
    this._cdUntil = new Map();
    this.stamina = 100;
    this.maxStamina = 100;
    this.elapsed = 0;

    this.moveSpeed = settings.drc?.moveSpeed ?? 3.6;
    this.sprintMul = settings.drc?.sprintMul ?? 1.65;
    this._moveX = 0;
    this._moveZ = 0;
    this._sprinting = false;
    this._yaw = 0;
    this._usePhysics = true;
  }

  setPhysics(physics) {
    this.physics = physics;
  }

  setVfx(vfx) {
    this.vfx = vfx;
  }

  get inCombat() {
    return this.session === 'combat';
  }

  toggleSession() {
    this.setSession(this.session === 'combat' ? 'equip' : 'combat');
  }

  /**
   * @param {'equip'|'combat'} session
   */
  setSession(session) {
    const next = session === 'combat' ? 'combat' : 'equip';
    if (this.session === next) return;
    this.session = next;
    settings.drc = settings.drc || {};
    settings.drc.session = next;
    this.onSession(next);
    this.onToast(next === 'combat' ? 'DRC Combat — WASD · 1–4 skills · F strike' : 'Equip — I inventory · mesh loadout');
  }

  /**
   * @param {Set<string>} keys InputManager.keys codes
   * @param {number} dt
   */
  update(dt, keys) {
    this.elapsed += dt;
    // stamina regen
    this.stamina = Math.min(this.maxStamina, this.stamina + dt * 18);

    if (!this.inCombat || this.character._rideActive) {
      this.character.setGait?.(0, false);
      return;
    }

    // WASD relative to camera yaw (flat)
    let ix = 0;
    let iz = 0;
    if (keys.has('KeyW') || keys.has('ArrowUp')) iz -= 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) iz += 1;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) ix -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) ix += 1;
    this._sprinting = keys.has('ShiftLeft') || keys.has('ShiftRight');

    const len = Math.hypot(ix, iz);
    if (len > 1e-4) {
      ix /= len;
      iz /= len;
    }

    // Camera-relative XZ
    const cam = this.camera;
    _fwd.set(cam.position.x - this.character.position.x, 0, cam.position.z - this.character.position.z);
    // Actually face opposite camera forward on ground: use camera look direction
    cam.getWorldDirection(_fwd);
    _fwd.y = 0;
    if (_fwd.lengthSq() < 1e-6) _fwd.set(0, 0, 1);
    else _fwd.normalize();
    // right = cross(up, fwd) wait standard: right = normalize(cross(fwd, up))
    const rx = _fwd.z;
    const rz = -_fwd.x;

    _move.set(0, 0, 0);
    _move.x = _fwd.x * -iz + rx * ix;
    _move.z = _fwd.z * -iz + rz * ix;
    if (_move.lengthSq() > 1e-6) _move.normalize();

    const speed = this.moveSpeed * (this._sprinting ? this.sprintMul : 1) * (settings.global?.animationSpeed || 1);
    const moving = _move.lengthSq() > 1e-6;
    const vx = moving ? _move.x * speed : 0;
    const vz = moving ? _move.z * speed : 0;

    if (this.physics?.ready && this._usePhysics) {
      const pose = this.physics.movePlayer(vx, vz, dt);
      this.character.root.position.set(pose.x, pose.y, pose.z);
    } else if (moving) {
      this.character.root.position.x += vx * dt;
      this.character.root.position.z += vz * dt;
      this.character.root.position.y = 0;
    }

    if (moving) {
      this._yaw = Math.atan2(_move.x, _move.z);
      this.character.setFacing(this._yaw);
    }

    this.character.setGait?.(moving ? (this._sprinting ? 2 : 1) : 0, this._sprinting);
  }

  /**
   * Fire skill slot 0–3.
   * @param {number} slot
   * @returns {boolean}
   */
  useSkill(slot) {
    if (!this.inCombat) {
      this.onToast('Enter combat (Q) to use DRC skills');
      return false;
    }
    if (this.character._rideActive) return false;

    const skill = skillBySlot(slot);
    if (!skill) return false;

    const readyAt = this._cdUntil.get(skill.id) || 0;
    if (this.elapsed < readyAt) {
      this.onToast(`${skill.label} CD`);
      return false;
    }
    if (this.stamina < skill.staminaCost) {
      this.onToast('Low stamina');
      return false;
    }

    this.stamina -= skill.staminaCost;
    this._cdUntil.set(skill.id, this.elapsed + skill.cooldown);

    // Animation one-shot
    if (skill.animRole === 'attack') {
      this.character.playWeaponAttack?.() || this.character.requestOneShot?.('attack');
    } else {
      this.character.requestOneShot?.(skill.animRole) || this.character.playCastFlourish?.();
    }

    const yaw = this.character.facing;
    _fwd.set(Math.sin(yaw), 0, Math.cos(yaw));
    this.character.getCastOrigin(_origin);
    const pose = {
      origin: this.character.position.clone(),
      forward: _fwd.clone(),
      aim: _end.copy(_origin).addScaledVector(_fwd, skill.rangeM * 0.65)
    };

    // High-beauty cast tell (vfxgrudge catalog)
    this.vfx?.deploySkill?.(skill.id, pose, 'cast');

    // VFX: spell → elemental ability along forward curve; melee → short slash + residual
    if (skill.style === 'spell' && skill.element) {
      const curve = this._aimCurve(skill.rangeM);
      this.abilities.select(skill.element);
      this.abilities.cast(curve, skill.element);
      this.character.setCasting?.(true, {
        aimX: _end.x,
        aimY: _end.y,
        aimZ: _end.z
      });
      // Delayed impact beauty at curve end
      const impactAt = skill.castDuration * 0.55;
      setTimeout(() => {
        this.vfx?.deploySkill?.(skill.id, { ...pose, origin: pose.aim, aim: pose.aim }, 'impact');
      }, impactAt * 1000);
      this.onToast(skill.label);
      return true;
    }

    if (skill.style === 'melee') {
      const curve = this._aimCurve(Math.min(skill.rangeM, 3.2));
      const el = this.abilities.selected || 'wind';
      this.abilities.cast(curve, el === 'earth' ? 'wind' : el);
      this.vfx?.deploySkill?.(skill.id, pose, 'full');
      this.onToast(skill.label);
      return true;
    }

    return false;
  }

  /** Alt+sandbox hotkey from vfxgrudge.puter.site */
  previewSandboxEffect(effectId) {
    if (!this.vfx || !effectId) return false;
    const yaw = this.character.facing;
    _fwd.set(Math.sin(yaw), 0, Math.cos(yaw));
    this.vfx.deploy(effectId, {
      origin: this.character.position.clone(),
      forward: _fwd.clone()
    });
    return true;
  }

  /** Build CatmullRom from hand → aim point for Ability.spawn */
  _aimCurve(rangeM) {
    this.character.getCastOrigin(_origin);
    // Aim along character facing on ground, slight arc up
    const yaw = this.character.facing;
    _fwd.set(Math.sin(yaw), 0, Math.cos(yaw));
    _end.copy(_origin).addScaledVector(_fwd, rangeM);
    _end.y = Math.max(0.15, _origin.y * 0.35);
    _mid.lerpVectors(_origin, _end, 0.5);
    _mid.y = Math.max(_origin.y, _mid.y) + rangeM * 0.06;

    const pts = [
      _origin.clone(),
      _mid.clone(),
      _end.clone()
    ];
    return new CatmullRomCurve3(pts, false, 'catmullrom', 0.5);
  }

  /** Cooldown fraction 0..1 remaining for HUD */
  cooldown01(skillId) {
    const readyAt = this._cdUntil.get(skillId) || 0;
    const skill = this.skills.find((s) => s.id === skillId);
    if (!skill || this.elapsed >= readyAt) return 0;
    return MathUtils.clamp((readyAt - this.elapsed) / Math.max(0.01, skill.cooldown), 0, 1);
  }
}
