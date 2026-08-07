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
   *   aim?: import('../input/MouseAim.js').MouseAim|null,
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
    this.aim = opts.aim || null;
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
    /** @type {Map<string, number>} utility action max CD for HUD */
    this._cdMax = new Map();

    /** Double-tap dodge: AA left · DD right · WW forward · X back */
    this._lastTap = { KeyA: 0, KeyD: 0, KeyW: 0, KeyS: 0 };
    this._keyWasDown = new Set();
    /** Active dodge slide (world XZ) */
    this._dodgeT = 0;
    this._dodgeDur = 0;
    this._dodgeVel = new Vector3();
  }

  setPhysics(physics) {
    this.physics = physics;
  }

  setVfx(vfx) {
    this.vfx = vfx;
  }

  setAim(aim) {
    this.aim = aim;
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
    this.onToast(
      next === 'combat'
        ? 'Combat · AA/DD/WW dodge · X back · C parry · LMB path cast'
        : 'Equip — I inventory · mesh loadout'
    );
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

    // Double-tap AA / DD / WW → directional dodge (longbow clips)
    this._pollDoubleTapDodge(keys);

    // Active dodge slide overrides move
    if (this._dodgeT > 0) {
      this._dodgeT -= dt;
      const vx = this._dodgeVel.x;
      const vz = this._dodgeVel.z;
      if (this.physics?.ready && this._usePhysics) {
        const pose = this.physics.movePlayer(vx, vz, dt);
        this.character.root.position.set(pose.x, pose.y, pose.z);
        this._grounded = !!pose.grounded;
      } else {
        this.character.root.position.x += vx * dt;
        this.character.root.position.z += vz * dt;
      }
      if (this._dodgeT <= 0) {
        this._dodgeVel.set(0, 0, 0);
      }
      return;
    }

    // ── WASD: W/S along look, A/D pure strafe left/right ─────────────
    // Body faces mouse aim; strafe is body-local so A = left, D = right
    // of where you look (not inverted camera-right).
    let ix = 0; // −1 = strafe left (A), +1 = strafe right (D)
    let iz = 0; // −1 = forward (W), +1 = back (S)
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

    // Forward basis: aim when valid, else body facing, else camera
    const useAim =
      settings.aim?.enabled !== false &&
      settings.aim?.moveRelativeToAim !== false &&
      this.aim?.valid;

    if (useAim) {
      _fwd.copy(this.aim.forward);
    } else {
      // Prefer body facing so A/D stay true strafe even without aim hit
      const yaw = this.character.facing;
      _fwd.set(Math.sin(yaw), 0, Math.cos(yaw));
      if (_fwd.lengthSq() < 1e-6) {
        this.camera.getWorldDirection(_fwd);
        _fwd.y = 0;
        if (_fwd.lengthSq() < 1e-6) _fwd.set(0, 0, 1);
        else _fwd.normalize();
      }
    }

    // Character local +X right when facing yaw: (cos(y), 0, −sin(y))
    // Matches forward (sin(y), 0, cos(y)) used elsewhere on this hero.
    const fx = _fwd.x;
    const fz = _fwd.z;
    const rx = fz; // right.x
    const rz = -fx; // right.z

    // W (iz=-1) → +forward · A (ix=-1) → −right · D (ix=+1) → +right
    _move.set(0, 0, 0);
    _move.x = fx * -iz + rx * ix;
    _move.z = fz * -iz + rz * ix;
    if (_move.lengthSq() > 1e-6) _move.normalize();

    const speed = this.moveSpeed * (this._sprinting ? this.sprintMul : 1) * (settings.global?.animationSpeed || 1);
    const moving = _move.lengthSq() > 1e-6;
    let vx = moving ? _move.x * speed : 0;
    let vz = moving ? _move.z * speed : 0;

    // Face mouse aim (or move dir if aim disabled)
    this._updateFacingToAim(dt, moving);

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

    // Gait: lock during jump/flip one-shots
    if (!this.character._gaitLocked && this._grounded) {
      this.character.setGait?.(moving ? (this._sprinting ? 2 : 1) : 0, this._sprinting);
    } else if (!this._grounded && !this.character._gaitLocked) {
      // Air: keep last gait weight low — jump clip owns pose when present
      this.character.setGait?.(0, false);
    }
  }

  /**
   * Rotate body toward mouse aim (crosshair). Backflip owns facing while active.
   * @param {number} dt
   * @param {boolean} moving
   */
  _updateFacingToAim(dt, moving) {
    if (this._backflipBoostT > 0 && this._backflipDir.lengthSq() > 1e-6) {
      this._yaw = Math.atan2(this._backflipDir.x, this._backflipDir.z);
      this.character.setFacing(this._yaw);
      return;
    }
    if (this._dodgeT > 0) return;
    if (this.character._gaitLocked && this.character.animState === 'dodge') return;

    let targetYaw = this.character.facing;
    if (settings.aim?.enabled !== false && this.aim?.valid) {
      targetYaw = this.aim.yaw;
    } else if (moving) {
      targetYaw = Math.atan2(_move.x, _move.z);
    } else {
      return;
    }

    const turn = settings.aim?.turnSpeed ?? 14;
    let cur = this.character.facing;
    let diff = targetYaw - cur;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const maxStep = turn * dt;
    if (Math.abs(diff) <= maxStep) cur = targetYaw;
    else cur += Math.sign(diff) * maxStep;
    this._yaw = cur;
    this.character.setFacing(cur);
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

    // Animation one-shot from equipped weapon pack (magic cast · sword attack · bow attack)
    if (skill.animRole === 'attack') {
      this.character.playWeaponCombat?.('attack') ||
        this.character.playWeaponAttack?.() ||
        this.character.requestOneShot?.('attack');
    } else {
      this.character.playWeaponCombat?.('cast') ||
        this.character.requestOneShot?.(skill.animRole) ||
        this.character.playCastFlourish?.();
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

    this.character.playWeaponCombat?.('attack') ||
      this.character.playWeaponAttack?.() ||
      this.character.requestOneShot?.('attack');

    // Residual aims along mouse aim when available
    if (this.aim?.valid) {
      _fwd.copy(this.aim.forward);
    } else {
      const yaw = this.character.facing;
      _fwd.set(Math.sin(yaw), 0, Math.cos(yaw));
    }
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

  /** Cooldown fraction 0..1 remaining for HUD (skill id or utility action id). */
  cooldown01(skillId) {
    const readyAt = this._cdUntil.get(skillId) || 0;
    if (this.elapsed >= readyAt) return 0;
    const skill =
      this.skills.find((s) => s.id === skillId) ||
      (skillId === 'drc_melee_strike' ? getMeleeStrikeSkill() : null);
    const cdMax = skill?.cooldown ?? this._cdMax.get(skillId) ?? 1;
    if (!skill && !this._cdUntil.has(skillId)) return 0;
    return MathUtils.clamp((readyAt - this.elapsed) / Math.max(0.01, cdMax), 0, 1);
  }

  /**
   * Danger Room / tight-bar quick action (parry, dodge, heavy, bag, skills…).
   * Lab implementations: real skill fire where wired; mobility stubs with CD toast.
   * @param {string} actionId QuickActionId
   * @returns {boolean}
   */
  performQuickAction(actionId) {
    if (!this.inCombat && actionId !== 'mode') {
      this.onToast('Enter combat (Q)');
      return false;
    }
    if (this.character._rideActive) return false;

    switch (actionId) {
      case 'primary':
        // Weapon pack attack (melee swing or staff cast flourish)
        if (this.character.animPackId === 'magic') {
          return this.character.playWeaponCombat?.('cast') || this.useMeleeStrike();
        }
        return this.useMeleeStrike() || this.character.playWeaponCombat?.('attack') || false;
      case 'fskill':
        return this.useMeleeStrike();
      case 'sig1':
        return this.useSkill(0);
      case 'sig2':
        return this.useSkill(1);
      case 'sig3':
        return this.useSkill(2);
      case 'sig4':
        return this.useSkill(3);
      case 'dodge':
        // X = back dodge (Danger Room)
        return this.dodge('back');
      case 'parry':
        return this.parry();
      case 'block':
        return this._utilityAction('block', 0.4, settings.drc?.parryStamina ?? 4, () => {
          this.character.playParry?.() || this.character.requestOneShot?.('block');
          this.onToast('Guard (E)');
        });
      case 'heavy':
        return this._utilityAction('heavy', 1.4, 14, () => {
          this.useMeleeStrike();
          _fwd.set(Math.sin(this.character.facing), 0, Math.cos(this.character.facing));
          this.vfx?.deploy?.('getsuga_slash', {
            origin: this.character.position.clone(),
            forward: _fwd.clone(),
            fromTip: true,
            intensity: 1.35,
            size: 1.2
          });
          this.onToast('Heavy (R)');
        });
      case 'kick':
        return this._utilityAction('kick', 0.9, 6, () => {
          this.character.playWeaponAttack?.();
          this.onToast('Kick (V)');
        });
      case 'heal':
        return this._utilityAction('heal', 4.0, 0, () => {
          this.stamina = Math.min(this.maxStamina, this.stamina + 35);
          _fwd.set(Math.sin(this.character.facing), 0, Math.cos(this.character.facing));
          this.vfx?.deploy?.('moon_beam', {
            origin: this.character.position.clone(),
            forward: _fwd.clone(),
            intensity: 0.8
          });
          this.onToast('Heal tonic (J)');
        });
      case 'bomb':
        return this._utilityAction('bomb', 5.0, 10, () => {
          _fwd.set(Math.sin(this.character.facing), 0, Math.cos(this.character.facing));
          const origin = this.character.position.clone().addScaledVector(_fwd, 2.5);
          this.vfx?.deploy?.('inferno', {
            origin,
            forward: _fwd.clone(),
            intensity: 1.1
          });
          this.onToast('Bomb (H)');
        });
      case 'mode':
        this.toggleSession();
        return true;
      default:
        return false;
    }
  }

  /**
   * @param {string} id
   * @param {number} cooldown
   * @param {number} staminaCost
   * @param {() => void} fn
   */
  _utilityAction(id, cooldown, staminaCost, fn) {
    if (!this._cdMax) this._cdMax = new Map();
    this._cdMax.set(id, cooldown);
    const readyAt = this._cdUntil.get(id) || 0;
    if (this.elapsed < readyAt) {
      this.onToast(`${id} CD`);
      return false;
    }
    if (this.stamina < staminaCost) {
      this.onToast('Low stamina');
      return false;
    }
    this.stamina -= staminaCost;
    this._cdUntil.set(id, this.elapsed + cooldown);
    fn();
    return true;
  }

  /** Map quick-action id → CD fraction for tight bar. */
  quickCd01(actionId) {
    if (actionId === 'fskill' || actionId === 'primary') {
      return this.cooldown01('drc_melee_strike');
    }
    if (actionId?.startsWith('sig')) {
      const slot = Number(actionId.slice(3)) - 1;
      const skill = this.skills.find((s) => s.slot === slot);
      return skill ? this.cooldown01(skill.id) : 0;
    }
    if (actionId === 'dodge') return this.cooldown01('dodge');
    return this.cooldown01(actionId);
  }

  /**
   * Edge-detect double-tap A/D/W for left/right/forward dodge.
   * @param {Set<string>} keys
   */
  _pollDoubleTapDodge(keys) {
    if (this._dodgeT > 0) return;
    const windowMs = settings.drc?.doubleTapMs ?? 280;
    const now = performance.now();
    const pairs = [
      ['KeyA', 'left'],
      ['KeyD', 'right'],
      ['KeyW', 'forward']
    ];
    for (const [code, dir] of pairs) {
      const down = keys.has(code);
      const was = this._keyWasDown.has(code);
      if (down && !was) {
        const last = this._lastTap[code] || 0;
        if (now - last < windowMs && last > 0) {
          this.dodge(dir);
          this._lastTap[code] = 0;
        } else {
          this._lastTap[code] = now;
        }
      }
      if (down) this._keyWasDown.add(code);
      else this._keyWasDown.delete(code);
    }
  }

  /**
   * Directional dodge with longbow standing dodge clips.
   * @param {'left'|'right'|'forward'|'back'} dir
   */
  dodge(dir) {
    const d = dir === 'left' || dir === 'right' || dir === 'forward' || dir === 'back' ? dir : 'back';
    const stam = settings.drc?.dodgeStamina ?? 10;
    const cd = 0.75;
    return this._utilityAction(`dodge_${d}`, cd, stam, () => {
      // Also put shared 'dodge' on CD for tight-bar X slot
      this._cdUntil.set('dodge', this.elapsed + cd);
      this._cdMax.set('dodge', cd);

      // Same basis as move: face/aim forward, A=left D=right
      if (this.aim?.valid && settings.aim?.enabled !== false) {
        _fwd.copy(this.aim.forward);
      } else {
        const yaw = this.character.facing;
        _fwd.set(Math.sin(yaw), 0, Math.cos(yaw));
      }
      const rx = _fwd.z;
      const rz = -_fwd.x;

      let wx = 0;
      let wz = 0;
      if (d === 'forward') {
        wx = _fwd.x;
        wz = _fwd.z;
      } else if (d === 'back') {
        wx = -_fwd.x;
        wz = -_fwd.z;
      } else if (d === 'left') {
        wx = -rx;
        wz = -rz;
      } else {
        // right
        wx = rx;
        wz = rz;
      }
      const dist = settings.drc?.dodgeDistance ?? 2.4;
      const dur = settings.drc?.dodgeDuration ?? 0.42;
      const speed = dist / Math.max(0.12, dur);
      this._dodgeVel.set(wx * speed, 0, wz * speed);
      this._dodgeT = dur;
      this._dodgeDur = dur;

      const played = this.character.playDodge?.(d);
      const labels = { left: 'AA left', right: 'DD right', forward: 'WW forward', back: 'X back' };
      this.onToast(`${labels[d] || d} dodge${played ? '' : ' (no clip)'}`);
    });
  }

  /** Parry with block/parry clip. */
  parry() {
    const stam = settings.drc?.parryStamina ?? 8;
    return this._utilityAction('parry', 0.65, stam, () => {
      this.character.playParry?.() || this.character.requestOneShot?.('block');
      _fwd.set(Math.sin(this.character.facing), 0, Math.cos(this.character.facing));
      this.vfx?.deploy?.('arcane_swirl', {
        origin: this.character.position.clone(),
        forward: _fwd.clone(),
        intensity: 0.75
      });
      this.onToast('Parry (C)');
    });
  }

  /**
   * Staff / combat path cast: classify stroke → aoe | spikes | wall | stream.
   * @param {import('three').CatmullRomCurve3} curve
   * @param {number} length
   * @param {number} [holdSec]
   * @returns {{ kind: string, element: string }|null}
   */
  castPathAbility(curve, length, holdSec = 0) {
    if (!curve) return null;
    const sc = settings.staffCast || {};
    if (sc.enabled === false) {
      this.abilities.cast(curve);
      return { kind: 'stream', element: this.abilities.selected };
    }

    const aoeMax = sc.aoeMaxLength ?? 3.2;
    const spikesMax = sc.spikesMaxLength ?? 9;
    const wallHold = sc.wallHoldSec ?? 0.85;

    let kind = 'stream';
    if (length <= aoeMax || holdSec < 0.2) kind = 'aoe';
    else if (holdSec >= wallHold || length >= (sc.wallMinLength ?? 9)) kind = 'wall';
    else if (length <= spikesMax) kind = 'spikes';

    let element = this.abilities.selected;
    if (kind === 'aoe' && sc.aoeElement) element = sc.aoeElement;
    if (kind === 'spikes' && sc.spikesElement) element = sc.spikesElement;
    if (kind === 'wall' && sc.wallElement) element = sc.wallElement;
    if (kind === 'stream' && sc.streamElement) element = sc.streamElement;

    // AOE: compress path to short arc at endpoint for impact placement
    if (kind === 'aoe') {
      const end = curve.getPoint(1);
      const mid = end.clone();
      mid.y += 0.4;
      const start = end.clone().add(new Vector3(0.01, 0.8, 0.01));
      const short = new CatmullRomCurve3([start, mid, end], false, 'catmullrom', 0.5);
      this.abilities.select(element);
      this.abilities.cast(short, element);
      this.vfx?.deployElementImpact?.(element, {
        origin: end.clone(),
        forward: _fwd.set(Math.sin(this.character.facing), 0, Math.cos(this.character.facing)).clone()
      });
    } else {
      this.abilities.select(element);
      this.abilities.cast(curve, element);
      if (kind === 'wall') {
        this.vfx?.deploy?.('earth_surge', {
          origin: curve.getPoint(0.5),
          forward: _fwd.set(Math.sin(this.character.facing), 0, Math.cos(this.character.facing)).clone(),
          intensity: 1.2
        });
      } else if (kind === 'spikes') {
        this.vfx?.deploy?.('frost_wave', {
          origin: curve.getPoint(0.5),
          forward: _fwd.clone(),
          intensity: 1.0
        });
      }
    }

    this.character.requestOneShot?.('cast') || this.character.playCastFlourish?.();
    const labels = { aoe: 'AOE place', spikes: 'Spikes', wall: 'Wall', stream: 'Stream' };
    this.onToast(`Staff · ${labels[kind]} (${element})`);
    return { kind, element };
  }
}
