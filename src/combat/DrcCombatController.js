import { CatmullRomCurve3, MathUtils, Vector3 } from 'three';
import {
  getActiveSkills,
  getMeleeStrikeSkill,
  setActiveSkillTree,
  skillBySlot
} from './drcSkills.js';
import { settings } from '../config/settings.js';
import { residualFromSettings } from '../vfx/effectPrefab.js';

const _origin = new Vector3();
const _tip = new Vector3();
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
    this.skills = getActiveSkills();
    // ?arcane=1 → purple arcane tree (Warlords staff migrate preview)
    if (typeof location !== 'undefined' && /[?&]arcane=1\b/.test(location.search)) {
      setActiveSkillTree('arcane');
      this.skills = getActiveSkills();
    }
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

    /** Jump state machine */
    this._jumpsLeft = settings.drc?.maxJumps ?? 2;
    this._wasJumpDown = false;
    this._grounded = true;
    this._airborne = false;
    /** After backflip, keep reverse dash until land */
    this._backflipBoostT = 0;
    this._backflipDir = new Vector3();
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

    // Yield fully while mounted on windsurf (WalkController owns root + physics glue)
    if (this.character._rideActive || this.character.root?.parent?.name?.startsWith?.('socket_')) {
      this.character.setGait?.(0, false);
      return;
    }
    if (!this.inCombat) {
      this.character.setGait?.(0, false);
      return;
    }

    // ── Camera-relative WASD (SI) ─────────────────────────────────────
    // W/S along camera look on XZ; A/D along camera RIGHT (cross(fwd, up)).
    // Previous code used (-right) → A/D were reversed.
    let ix = 0; // −1 = left (A), +1 = right (D)
    let iz = 0; // −1 = forward (W), +1 = back (S)  [input space]
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

    const cam = this.camera;
    cam.getWorldDirection(_fwd);
    _fwd.y = 0;
    if (_fwd.lengthSq() < 1e-6) _fwd.set(0, 0, 1);
    else _fwd.normalize();
    // right = normalize(cross(forward, worldUp)) = (-fz, 0, fx)
    const rx = -_fwd.z;
    const rz = _fwd.x;

    // World wish: forward * (−iz) so W (iz=-1) walks along +look
    _move.set(0, 0, 0);
    _move.x = _fwd.x * -iz + rx * ix;
    _move.z = _fwd.z * -iz + rz * ix;
    if (_move.lengthSq() > 1e-6) _move.normalize();

    const speed = this.moveSpeed * (this._sprinting ? this.sprintMul : 1) * (settings.global?.animationSpeed || 1);
    const moving = _move.lengthSq() > 1e-6;
    let vx = moving ? _move.x * speed : 0;
    let vz = moving ? _move.z * speed : 0;

    // ── Jump / double-jump / S+Space backflip ─────────────────────────
    this._handleJump(dt, keys, moving);

    // Backflip reverse dash override (second jump with S held)
    if (this._backflipBoostT > 0) {
      this._backflipBoostT -= dt;
      const sp = settings.drc?.backflipSpeed ?? 4.2;
      vx = this._backflipDir.x * sp;
      vz = this._backflipDir.z * sp;
    }

    if (this.physics?.ready && this._usePhysics) {
      const pose = this.physics.movePlayer(vx, vz, dt);
      this.character.root.position.set(pose.x, pose.y, pose.z);
      this._grounded = !!pose.grounded;
      if (this._grounded) {
        this._jumpsLeft = settings.drc?.maxJumps ?? 2;
        this._airborne = false;
        this._backflipBoostT = 0;
        this.character.clearFlip?.();
      } else {
        this._airborne = true;
      }
    } else {
      // Kinematic fallback (no Rapier)
      if (moving || this._backflipBoostT > 0) {
        this.character.root.position.x += vx * dt;
        this.character.root.position.z += vz * dt;
      }
      this._integrateKinematicJump(dt, keys);
    }

    // Face move wish on ground; keep facing during air unless backflip dash
    if (moving && this._grounded && this._backflipBoostT <= 0) {
      this._yaw = Math.atan2(_move.x, _move.z);
      this.character.setFacing(this._yaw);
    } else if (this._backflipBoostT > 0 && this._backflipDir.lengthSq() > 1e-6) {
      // Face the flip direction of travel (backward)
      this._yaw = Math.atan2(this._backflipDir.x, this._backflipDir.z);
      this.character.setFacing(this._yaw);
    }

    // Gait: lock during jump/flip one-shots
    if (!this.character._gaitLocked && this._grounded) {
      this.character.setGait?.(moving ? (this._sprinting ? 2 : 1) : 0, this._sprinting);
    } else if (!this._grounded && !this.character._gaitLocked) {
      // Air: keep last gait weight low — jump clip owns pose when present
      this.character.setGait?.(0, false);
    }
  }

  /**
   * Edge-detect Space: ground jump, air double-jump, S+Space → backflip.
   * @param {number} dt
   * @param {Set<string>} keys
   * @param {boolean} moving
   */
  _handleJump(dt, keys, moving) {
    const jumpDown = keys.has('Space');
    const pressed = jumpDown && !this._wasJumpDown;
    this._wasJumpDown = jumpDown;
    if (!pressed) return;
    if (this.character._rideActive) return;

    const cfg = settings.drc || {};
    const maxJ = cfg.maxJumps ?? 2;
    const holdS = keys.has('KeyS') || keys.has('ArrowDown');

    // Ground / coyote: refresh jumps when grounded
    if (this._grounded) this._jumpsLeft = maxJ;

    if (this._jumpsLeft <= 0) return;

    const isSecond = this._jumpsLeft < maxJ || !this._grounded;
    const wantBackflip = isSecond && holdS;

    if (wantBackflip) {
      // Double jump backflip: reverse along current facing, spin, jump up
      const yaw = this.character.facing;
      this._backflipDir.set(-Math.sin(yaw), 0, -Math.cos(yaw));
      this._backflipBoostT = cfg.backflipDuration ?? 0.55;
      const jv = cfg.doubleJumpVelocity ?? 5.0;
      if (this.physics?.ready) this.physics.jump(jv);
      else this._kinVy = jv;
      this.character.playBackflip?.(cfg.backflipDuration ?? 0.55);
      this._jumpsLeft = 0;
      this._grounded = false;
      this.onToast?.('Backflip');
      return;
    }

    // Normal jump (1st) or air hop (2nd without S)
    const jv = isSecond ? cfg.doubleJumpVelocity ?? 5.0 : cfg.jumpVelocity ?? 5.4;
    if (this.physics?.ready) this.physics.jump(jv);
    else this._kinVy = jv;
    this.character.playJump?.(0.08);
    this._jumpsLeft -= 1;
    this._grounded = false;
  }

  /** Simple ballistic Y when Rapier unavailable. */
  _integrateKinematicJump(dt) {
    if (this._kinVy === undefined) this._kinVy = 0;
    const g = -9.81;
    if (this._grounded && this._kinVy <= 0) {
      this.character.root.position.y = 0;
      this._kinVy = 0;
      this._jumpsLeft = settings.drc?.maxJumps ?? 2;
      return;
    }
    this._kinVy += g * dt;
    this.character.root.position.y += this._kinVy * dt;
    if (this.character.root.position.y <= 0) {
      this.character.root.position.y = 0;
      this._kinVy = 0;
      this._grounded = true;
      this._jumpsLeft = settings.drc?.maxJumps ?? 2;
      this._backflipBoostT = 0;
      this.character.clearFlip?.();
    } else {
      this._grounded = false;
    }
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
      this._fireMeleeResidual(skill, pose);
      this.onToast(skill.label);
      return true;
    }

    return false;
  }

  /**
   * F-key / light attack: attack anim + Getsuga residual from weapon tip.
   * Uses settings.residual knobs (intensity, aoe, speed, size, color, mesh).
   * Space is jump only — never bind residual here.
   */
  useMeleeStrike() {
    if (!this.inCombat) {
      this.onToast('Enter combat (Q) to strike');
      return false;
    }
    if (this.character._rideActive) return false;
    const skill = getMeleeStrikeSkill();
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

    this.character.playWeaponAttack?.() || this.character.requestOneShot?.('attack');

    const yaw = this.character.facing;
    _fwd.set(Math.sin(yaw), 0, Math.cos(yaw));
    const pose = {
      origin: this.character.position.clone(),
      forward: _fwd.clone()
    };
    this._fireMeleeResidual(skill, pose);
    this.onToast(skill.label);
    return true;
  }

  /**
   * Spawn residual after hit-frame delay: tip origin + short path + VfxDirector.
   * @param {import('./drcSkills.js').DrcWeaponSkill} skill
   * @param {{ origin: Vector3, forward: Vector3 }} pose
   */
  _fireMeleeResidual(skill, pose) {
    const prim = residualFromSettings();
    const delayMs = Math.max(0, (prim.hitFrameDelay ?? 0.18) * 1000);
    const range = prim.range ?? skill.rangeM ?? 3.2;
    const intensity = (prim.intensity ?? 1) * (settings.effect?.intensity ?? 1);

    const fire = () => {
      const tipOff = prim.tipOffset ?? settings.residual?.tipOffset ?? 0.55;
      if (typeof this.character.getWeaponTip === 'function') {
        this.character.getWeaponTip(_tip, tipOff);
      } else {
        this.character.getCastOrigin(_tip);
        _tip.addScaledVector(pose.forward, tipOff);
      }
      // Short residual path along blade dir (Open: grip→tip travel 1–10 m)
      const pathRange = MathUtils.clamp(range, 1, 10);
      _end.copy(_tip).addScaledVector(pose.forward, pathRange);
      _end.y = Math.max(0.12, _tip.y * 0.4);
      _mid.lerpVectors(_tip, _end, 0.45);
      _mid.y = Math.max(_tip.y, _mid.y) + pathRange * 0.04;
      const curve = new CatmullRomCurve3([_tip.clone(), _mid.clone(), _end.clone()], false, 'catmullrom', 0.5);

      // Beauty residual (catalog getsuga) with live knobs — origin is weapon tip
      this.vfx?.deploy?.('getsuga_slash', {
        origin: _tip.clone(),
        forward: pose.forward.clone(),
        aim: _end.clone(),
        fromTip: true,
        intensity,
        aoe: prim.aoe,
        size: prim.size,
        speed: prim.speed,
        color: prim.color
      });

      // Short elemental ribbon as travel residual (shared trail primitive)
      if (settings.residual?.enabled !== false) {
        const el = this.abilities.selected || 'wind';
        this.abilities.cast(curve, el === 'earth' ? 'wind' : el);
      }
    };

    if (delayMs > 4) setTimeout(fire, delayMs);
    else fire();
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
