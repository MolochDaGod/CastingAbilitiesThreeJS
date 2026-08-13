import { CatmullRomCurve3, MathUtils, Vector3 } from 'three';
import {
  getActiveSkills,
  getMeleeStrikeSkill,
  setActiveSkillTree,
  setSkillKitPage,
  skillBySlot,
  skillForFKey
} from './drcSkills.js';
import { settings } from '../config/settings.js';
import { residualFromSettings } from '../vfx/effectPrefab.js';
import { getSkillBinding } from './skillBindings.js';
import { bindFromCatalogSkill, staffBindFor } from './staffWeaponSkillsBind.js';
import { vfxIdForSkill, animRoleForSkill } from '../api/weaponSkillsCatalog.js';
import { dodgeDistanceM, mmToM, mToMm } from './motionMath.js';
import {
  skillCastCosts,
  pathCastCosts,
  castIntensity
} from './castResources.js';
import { signatureForElement } from './staffSignatureSkills.js';
import {
  enrichSkillDelivery,
  resolveDeliveryPose,
  STAFF_CHARGE_MESH
} from './skillDelivery.js';
import { SkillProjectileSystem } from './SkillProjectileSystem.js';
import { applyKnockback } from './hitReaction.js';
import {
  isStaffNormalAttack,
  STAFF_NORMAL_ATTACK,
  staffProjectileMeshUrl
} from '../vfx/staffOrbVfx.js';
import { inferElementAttackKind } from '../vfx/elementAttackVfx.js';
import {
  isPistolBulletSkill,
  pistolBulletCount,
  PISTOL_BULLET
} from '../vfx/pistolBulletVfx.js';
import {
  FLINTLOCK_FIRE,
  FLINTLOCK_RELOAD,
  PISTOL_SOFT_LOCK,
  pistolHitFrameSec
} from '../config/pistolAnimSsot.js';
import {
  playForWeaponSkillCast,
  playForImpact,
  playParrySfx,
  playHealSfx,
  setPlayerBurningSfx
} from '../audio/skillSfx.js';
import {
  createFlintlockChamber,
  skillNeedsLoad,
  isFlintlockContext,
  makeReloadSkillDef
} from './flintlockChamber.js';
import { getEquippedWeapon } from './equippedWeaponRuntime.js';
import {
  WeaponChargeSession,
  isChargeableWeaponSkill,
  chargeBarState,
  weaponChargeConfig,
  weaponRestAfterFire
} from './weaponChargeSystem.js';
import {
  planElementalLinearCast,
  fireLinearFromPlan
} from './elementalLinearCast.js';
import { SkillStatusSystem } from './skillStatusSystem.js';
import { WeaponTipTrailSystem } from '../vfx/weaponTipTrail.js';
import { pointHitsWeaponVolume } from '../character/weaponMeshCollider.js';
import { getBackWaterBuffs } from '../config/backSlotMobilitySsot.js';
import { WORLD } from '../config/worldScale.js';

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
    /** Mesh projectiles + contact force (fire/ice summons) */
    this.scene = opts.scene || null;
    this.projectiles =
      opts.projectiles ||
      (opts.scene
        ? new SkillProjectileSystem({
            scene: opts.scene,
            vfx: this.vfx,
            onHit: (hit) => this._onProjectileHit(hit)
          })
        : null);
    /**
     * Weapon-tip trail + apex residual (blade ribbon · fire blur · physics past tip).
     * @type {WeaponTipTrailSystem|null}
     */
    this.tipTrail =
      opts.tipTrail ||
      (opts.scene
        ? new WeaponTipTrailSystem({
            scene: opts.scene,
            character: this.character,
            projectiles: this.projectiles,
            vfx: this.vfx,
            abilities: this.abilities
          })
        : null);
    /** @type {import('./CombatFocus.js').CombatFocus|null} */
    this.combatFocus = opts.combatFocus || null;
    /** @type {import('../core/SessionState.js').SessionState|null} */
    this.sessionState = opts.sessionState || null;
    this.onToast = opts.onToast || (() => {});
    this.onSession = opts.onSession || (() => {});
    /** Snow-brawl alternate hand for projectile spawn offset */
    this._throwHand = 'right';
    /**
     * Linear skillshot bridge (learned LinearAbilityCasting systems).
     * @type {import('../skillshot/LinearSkillBridge.js').LinearSkillBridge|null}
     */
    this.linearSkills = opts.linearSkills || null;
    /** Production status effects (freeze/stun/push/slow/…) */
    this.statuses = new SkillStatusSystem({
      onToast: (m) => this.onToast(m),
      getElapsed: () => this.elapsed
    });
    /** Last skill used (for hit status package) */
    this._lastSkill = null;

    /** @type {'equip'|'combat'} — mirrored in SessionState.drc */
    this.session = this.sessionState?.drc || 'combat';
    this.skills = getActiveSkills();
    /** Focus buff: until elapsed, spell damage mul (T0 Apprentice Wand Focus) */
    this._focusUntil = 0;
    this._focusMul = 1;
    /** Ward / Take Cover: until elapsed, incoming damage mul (1 − reduce) */
    this._wardUntil = 0;
    this._wardReduce = 0;
    /** Flintlock single-load chamber (empty → key 1 = Reload) */
    this.flintlock = createFlintlockChamber();
    /** Hold-to-charge weapon session (Charged Shot UX) */
    this.weaponCharge = new WeaponChargeSession();
    /** Best rest — next weapon skill blocked until elapsed */
    this._weaponRestUntil = 0;
    /** Short global combat timer between weapon attacks */
    this._weaponGcdUntil = 0;
    /** Air fall locomotion (deterministic) */
    this._airTime = 0;
    this._lastVy = 0;
    this._impactVy = 0;
    // Catalog starters: ?wand=1 · ?sapling=1 · ?sword=1 Training Sword · ?arcane=1
    if (typeof location !== 'undefined') {
      if (/[?&]wand=1\b/.test(location.search)) {
        setActiveSkillTree('wand');
        this.skills = getActiveSkills();
      } else if (/[?&]sapling=1\b/.test(location.search)) {
        setActiveSkillTree('sapling');
        this.skills = getActiveSkills();
      } else if (/[?&]sword=1\b/.test(location.search)) {
        setActiveSkillTree('equipped');
        this.skills = getActiveSkills();
        this._pendingEquipId = 't0-sword';
      } else if (/[?&]arcane=1\b/.test(location.search)) {
        setActiveSkillTree('arcane');
        this.skills = getActiveSkills();
      }
    }
    /** @type {Map<string, number>} skillId → readyAt elapsed */
    this._cdUntil = new Map();
    this.stamina = 100;
    this.maxStamina = 100;
    /** Mana pool (spells) — dual resource with stamina */
    this.mana = settings.drc?.manaMax ?? 100;
    this.maxMana = settings.drc?.manaMax ?? 100;
    /** Health pool — real number (starts full; no fake regen UI when undamaged) */
    this.maxHealth = settings.drc?.healthMax ?? 100;
    this.health = this.maxHealth;
    this.elapsed = 0;
    /** Last path-cast intensity (for HUD / VFX) */
    this.lastCastIntensity = 1;

    /**
     * Active cast channel (cast bar + cast anim).
     * @type {{
     *   label: string,
     *   element: string,
     *   startedAt: number,
     *   duration: number,
     *   endsAt: number,
     *   onComplete: () => void,
     *   interruptible: boolean,
     *   aim?: { x: number, y: number, z: number }
     * }|null}
     */
    this._cast = null;
    /** @type {((state: object|null) => void)|null} */
    this.onCastBar = opts.onCastBar || null;

    this.moveSpeed = settings.drc?.moveSpeed ?? 3.6;
    this.sprintMul = settings.drc?.sprintMul ?? 1.65;
    this._moveX = 0;
    this._moveZ = 0;
    this._sprinting = false;
    /** Toggle-sprint latch (when settings.controls.sprintToggle) */
    this._sprintLatched = false;
    /**
     * Backtick (`) auto run / freeride sail — holds forward + sprint until toggled off.
     * Same intent as Multiverse mvAutoTraverse.
     */
    this._autoTraverse = false;
    this._wasShiftDown = false;
    this._yaw = 0;
    this._usePhysics = true;

    /** Jump state machine */
    this._jumpsLeft = settings.drc?.maxJumps ?? 2;
    this._wasJumpDown = false;
    this._grounded = true;
    this._airborne = false;
    /** After backflip, reverse dash + hang window */
    this._backflipBoostT = 0;
    this._backflipDir = new Vector3();
    this._backflipHardStopT = 0;
    /** Look yaw held during backflip (camera does not whip reverse) */
    this._flipHoldYaw = null;
    this._hangT = 0;
    this._frontflipBoostT = 0;
    this._frontflipDir = new Vector3();
    /** @type {Map<string, number>} utility action max CD for HUD */
    this._cdMax = new Map();

    /** Double-tap dodge: AA left · DD right · WW forward · X back */
    this._lastTap = { KeyA: 0, KeyD: 0, KeyW: 0, KeyS: 0 };
    this._keyWasDown = new Set();
    /** Active dodge / roll / slide impulse (world XZ) */
    this._dodgeT = 0;
    this._dodgeDur = 0;
    this._dodgeVel = new Vector3();
    /** I-frames while MM dodge / afterimage trail runs (seconds remaining) */
    this.invuln = 0;
    /** Edge state for Ctrl roll + Shift+Ctrl slide */
    this._ctrlWasDown = false;
    this._rollKeyWas = { KeyA: false, KeyD: false, KeyW: false, KeyS: false };

    /** Underwater oxygen (s) — shark_fin sets breatheUnderwater → never drains */
    this.oxygen = 20;
    this.maxOxygen = 20;
    this._drownTick = 0;
    this._inWater = false;
    this._submerged = false;
  }

  /**
   * Equipped back-slot water buffs (shark fin → 2× swim · no shark aggro · breath).
   */
  getBackWaterBuffs() {
    const id =
      this.character?.backSlot?.itemId ||
      settings.walk?.backSlot ||
      'none';
    return getBackWaterBuffs(id);
  }

  /** Shark / fauna AI: true = do not aggro player */
  get sharkAggroImmune() {
    return !!this.getBackWaterBuffs().sharkAggroImmune;
  }

  /** True while dodge MM + afterimage invuln window is active. */
  get isInvincible() {
    return this.invuln > 0 || this._dodgeT > 0;
  }

  /**
   * Oxygen while submerged; shark_fin.breatheUnderwater → full O₂ forever.
   * @param {number} dt
   * @param {{ breatheUnderwater?: boolean }} buffs
   */
  _tickUnderwaterBreath(dt, buffs) {
    if (!this._submerged) {
      // Surface recovery
      this.oxygen = Math.min(this.maxOxygen, this.oxygen + dt * 4);
      this._drownTick = 0;
      return;
    }
    if (buffs?.breatheUnderwater) {
      this.oxygen = this.maxOxygen;
      this._drownTick = 0;
      return;
    }
    this.oxygen = Math.max(0, this.oxygen - dt);
    if (this.oxygen <= 0) {
      this._drownTick += dt;
      // Damage every ~0.5s while drowning
      if (this._drownTick >= 0.5) {
        this._drownTick = 0;
        this.health = Math.max(0, (this.health || 0) - (settings.drc?.drownDamage ?? 4));
        this.onToast?.('Drowning… equip Shark Fin to breathe');
      }
    }
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

  /**
   * Attach linear skillshot bridge (elemental LINE/ZONE casts).
   * @param {import('../skillshot/LinearSkillBridge.js').LinearSkillBridge|null} linear
   */
  setLinearSkills(linear) {
    this.linearSkills = linear || null;
  }

  get inCombat() {
    return this.sessionState ? this.sessionState.inCombat : this.session === 'combat';
  }

  /** Prefer session.gates when present. */
  get gates() {
    return this.sessionState?.gates || null;
  }

  setSessionState(sessionState) {
    this.sessionState = sessionState || null;
    if (sessionState) this.session = sessionState.drc;
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
    // Report to SessionState (App applies camera/HUD once on change)
    this.sessionState?.setDrc?.(next);
    this.onSession(next);
    this.onToast(
      next === 'combat'
        ? 'Combat · Shift run-turn · Ctrl+A/D roll · Shift+Ctrl slide · AA/DD dodge · C parry'
        : 'Equip — I inventory · mesh loadout'
    );
  }

  /**
   * @param {Set<string>} keys InputManager.keys codes
   * @param {number} dt
   */
  /**
   * Projectile contact → knockback / hit reaction (physical results).
   * @param {import('./SkillProjectileSystem.js').ProjectileHit} hit
   */
  _onProjectileHit(hit) {
    if (hit.endEvent === 'blink' && hit.point) {
      const p = this.character.position;
      p.x = hit.point.x;
      p.z = hit.point.z;
      this.vfx?.deploy?.('arcane_swirl', { origin: hit.point.clone(), intensity: 1 });
      this.onToast?.(`Blink · ${hit.endEvent}`);
      return;
    }

    // Production status package (damage · push · freeze · stun · slow · …)
    const skill = this._lastSkill || {
      id: 'projectile',
      damage: 0,
      element: hit.element,
      effects: hit.freeze ? ['Freeze 2.5s'] : [],
      statuses: hit.freeze
        ? [{ id: 'freeze', durationSec: hit.freezeSec || 2.5, magnitude: 1 }]
        : [],
      force: hit.force,
      knockbackMm: hit.knockbackMm,
      knockupVy: hit.knockupVy
    };

    const isHostile = hit.target?.kind === 'hostile';
    const applyToPlayer =
      !hit.target ||
      hit.target.kind === 'self' ||
      hit.target.id === 'player' ||
      hit.target.applyToPlayer;

    // P0 defensive early-out (also enforced in SkillStatusSystem.applyHit):
    // invuln / C-parry weapon cylinder vs incoming projectile contact on player.
    if (applyToPlayer && hit.point) {
      if (this.isInvincible || this.invuln > 0) {
        this.onToast?.('Invincible');
        return;
      }
      const attackR =
        Number(hit.contactRadius ?? hit.radius ?? hit.hitRadius ?? 0.18) || 0.18;
      if (this.tryParryBlock(hit.point, attackR)) {
        return;
      }
    }

    this.statuses.applyHit({
      target: hit.target || { id: 'aim', point: hit.point, kind: 'aim' },
      skill: {
        ...skill,
        damage: skill.damage,
        // Inject freeze from projectile flag when skill had no statuses
        effects: skill.effects,
        statuses:
          skill.statuses?.length
            ? skill.statuses
            : hit.freeze
              ? [{ id: 'freeze', durationSec: hit.freezeSec || 2.5, magnitude: 1 }]
              : undefined
      },
      hit: {
        ...hit,
        damage: skill.damage,
        // Hostiles: push from skill physics; player only if self-hit test
        knockbackMm: isHostile || applyToPlayer ? hit.knockbackMm : 0
      },
      character: this.character,
      physics: this.physics,
      drc: this,
      applyToPlayer: applyToPlayer && !hit.freeze
    });
  }

  /**
   * Deploy skill by delivery pattern (over/under/around/projectile…).
   * Catalog skills only — pattern inferred from skill row.
   * @param {object} skill
   * @param {{ origin: Vector3, forward: Vector3, aim?: Vector3 }} pose
   */
  _deploySkillDelivery(skill, pose) {
    const enriched = enrichSkillDelivery(skill);
    const pattern = enriched.delivery;
    const phys = enriched.deliveryPhysics || {};

    // Prefer snow-brawl launch origin from pose (chest + hand) when provided
    if (pose?.origin) _origin.copy(pose.origin);
    else this.character.getCastOrigin(_origin);
    // Barrel muzzle for pistol; melee tip otherwise
    if (typeof this.character.getWeaponTip === 'function') {
      const tipOff =
        this.character.animPackId === 'pistol'
          ? FLINTLOCK_FIRE.muzzleFallbackM
          : settings.residual?.tipOffset ?? 0.55;
      this.character.getWeaponTip(_tip, tipOff);
    } else {
      _tip.copy(_origin);
    }

    // Soft-lock assist: auto-acquire frontal hostile for gun shots if none selected
    if (
      isPistolBulletSkill(skill) &&
      PISTOL_SOFT_LOCK.acquireOnFire &&
      this.combatFocus &&
      !this.combatFocus.selectedTarget
    ) {
      const feet = this.character.position;
      const fwd0 =
        pose.forward?.clone?.() ||
        this.aim?.forward?.clone?.() ||
        new Vector3(Math.sin(this.character.facing), 0, Math.cos(this.character.facing));
      this.combatFocus.acquireBest?.(feet, fwd0);
    }

    // 3D hit (focus) > soft-lock target > ground marker
    const aimPt =
      (this.aim?.valid && this.aim.hitPoint?.clone?.()) ||
      pose.aim?.clone?.() ||
      (this.aim?.valid && this.aim.point?.clone?.()) ||
      this.character.position.clone().addScaledVector(pose.forward, skill.rangeM || 8);

    const targetPt =
      this.combatFocus?.selectedTarget?.point?.clone?.() || aimPt.clone();

    // Prefer soft-lock / aim launch dir; barrel for presentation only at spawn
    let fwd3 =
      (this.combatFocus?.selectedTarget?.point
        ? targetPt.clone().sub(_tip)
        : null) ||
      pose.forward?.clone?.() ||
      (this.aim?.forward3d?.lengthSq?.() > 1e-6
        ? this.aim.forward3d.clone()
        : null) ||
      this.aim?.forward?.clone?.() ||
      new Vector3(0, 0, 1);
    if (fwd3.lengthSq() > 1e-8) fwd3.normalize();
    else if (typeof this.character.getWeaponForward === 'function') {
      this.character.getWeaponForward(fwd3);
    }

    const resolved = resolveDeliveryPose(pattern, {
      casterPos: this.character.position.clone(),
      castOrigin: _origin.clone(),
      weaponTip: _tip.clone(),
      aimPoint: aimPt,
      targetPoint: targetPt,
      forward: fwd3,
      skyHeight: 8,
      groundY: 0.05
    });

    // Hostiles as projectile contact targets (soft-lock)
    const targets = [];
    if (this.combatFocus?.selectedTarget?.point) {
      targets.push({
        id: this.combatFocus.selectedTarget.id,
        point: this.combatFocus.selectedTarget.point.clone(),
        mesh: this.combatFocus.selectedTarget.mesh,
        kind: this.combatFocus.selectedTarget.kind || 'hostile'
      });
    }
    // Aim point as soft target for lab (always)
    targets.push({
      id: 'aim',
      point: resolved.target.clone(),
      kind: 'aim'
    });

    // Cast tell VFX
    if (enriched.castEffectId) {
      this.vfx?.deploy?.(enriched.castEffectId, {
        origin: resolved.origin.clone(),
        forward: resolved.forward.clone(),
        intensity: 0.9
      });
    }

    // Element attack kinds (freeze nova / earth rocks / water bubbles / arrows)
    const atk = inferElementAttackKind(enriched);
    if (this.projectiles && atk.kind) {
      if (atk.kind === 'freeze_nova') {
        this.projectiles.spawnFreezeNova?.({
          origin: this.character.position.clone(),
          radiusM: atk.aoeM,
          freeze: true,
          targets,
          element: 'ice'
        });
        enriched._deliveryLabel = 'Freeze Nova';
        return enriched;
      }
      if (atk.kind === 'earth_rocks') {
        void this.projectiles.spawnEarthRocks?.({
          casterPos: this.character.position.clone(),
          target: resolved.target,
          forward: resolved.forward,
          rockCount: atk.rockCount ?? 1,
          aimMode: atk.aimMode || 'linear',
          targets,
          speed: phys.speed ?? 13
        });
        enriched._deliveryLabel =
          atk.aimMode === 'aimed' ? 'Earth Rocks · aimed' : 'Earth Rocks · linear';
        return enriched;
      }
      if (atk.kind === 'water_bubbles') {
        this.projectiles.spawnBubbleStream?.({
          origin: resolved.origin,
          target: resolved.target,
          forward: resolved.forward,
          speed: phys.speed ?? 11,
          targets
        });
        enriched._deliveryLabel = 'Water Bubbles';
        return enriched;
      }
      if (atk.kind === 'arrow_path' || atk.kind === 'arrow_loft') {
        const dist = this.character.position.distanceTo(resolved.target);
        void this.projectiles.spawnArrow?.({
          origin: resolved.origin,
          target: resolved.target,
          system: atk.kind === 'arrow_loft' ? 'loft' : 'path',
          endEvent: atk.endEvent,
          distanceM: dist,
          targets
        });
        enriched._deliveryLabel = `Arrow · ${atk.endEvent || atk.kind}`;
        return enriched;
      }
    }

    if (pattern === 'toggle_aura' || pattern === 'around_caster' || pattern === 'around_target' || pattern === 'at_location') {
      const el = enriched.element || enriched.abilityElement;
      // Ice around_caster → freeze nova when catalog implies freeze
      if (
        (pattern === 'around_caster' || pattern === 'around_target') &&
        (el === 'ice' || el === 'frost') &&
        this.projectiles?.spawnFreezeNova
      ) {
        this.projectiles.spawnFreezeNova({
          origin:
            pattern === 'around_target'
              ? resolved.origin.clone()
              : this.character.position.clone(),
          radiusM: phys.aoe ?? 5,
          targets,
          element: 'ice'
        });
        enriched._deliveryLabel = 'Freeze Nova';
        return enriched;
      }
      this.projectiles?.pulse?.({
        origin: resolved.origin,
        aoe: phys.aoe ?? 1.5,
        force: phys.force,
        knockbackMm: phys.knockbackMm,
        knockupVy: phys.knockupVy,
        element: el,
        targets,
        intensity: 1.1,
        freeze: el === 'ice' || el === 'frost'
      });
      return enriched;
    }

    if (pattern === 'weapon') {
      this._fireMeleeResidual(skill, pose, {
        rangeOverride: skill.rangeM,
        hit: { kind: 'light', step: 0 }
      });
      return enriched;
    }

    // Traveling mesh projectile — staff normals use per-element orbs (gd_orbs split)
    if (this.projectiles && phys.meshKey !== 'residual') {
      const el = enriched.element || enriched.abilityElement || 'arcane';
      // Flintlock / handgun — muzzle origin · hit-frame delay · burst · reload
      if (isPistolBulletSkill(enriched) && this.projectiles.spawnBullet) {
        const count = pistolBulletCount(enriched);
        const speed = enriched.projectileSpeed || PISTOL_BULLET.speed;
        const meshUrl = enriched.projectileMeshUrl || PISTOL_BULLET.meshUrl;
        // Charged Shot: slightly longer hit-frame (wind-up already played)
        const chargeMul = Number(enriched._chargeMul) || 1;
        const hitSec =
          pistolHitFrameSec(enriched) *
          (chargeMul > 1.01 ? (settings.drc?.weaponCharge?.hitFrameMul ?? 1.15) : 1);
        const gapSec = FLINTLOCK_FIRE.burstGapSec;
        const spreadRad = FLINTLOCK_FIRE.burstSpreadRad;
        const fireOne = (spreadYaw = 0) => {
          // Live barrel tip at fire frame (hand moved with gunplay)
          if (typeof this.character.getWeaponTip === 'function') {
            this.character.getWeaponTip(_tip, FLINTLOCK_FIRE.muzzleFallbackM);
          }
          const origin = _tip.clone();
          let f;
          if (this.combatFocus?.selectedTarget?.point) {
            f = this.combatFocus.selectedTarget.point.clone().sub(origin);
          } else if (this.aim?.hitPoint) {
            f = this.aim.hitPoint.clone().sub(origin);
          } else if (typeof this.character.getWeaponForward === 'function') {
            f = this.character.getWeaponForward(new Vector3());
          } else {
            f = resolved.forward.clone();
          }
          if (!f || f.lengthSq() < 1e-8) f = resolved.forward.clone();
          f.normalize();
          if (spreadYaw !== 0) {
            const c = Math.cos(spreadYaw);
            const s = Math.sin(spreadYaw);
            const x = f.x * c - f.z * s;
            const z = f.x * s + f.z * c;
            f.x = x;
            f.z = z;
            f.normalize();
          }
          const tgt = origin.clone().addScaledVector(f, 48);
          void this.projectiles.spawnBullet({
            origin: origin.clone(),
            target: tgt,
            forward: f,
            targets,
            speed,
            meshUrl
          });
        };

        const scheduleFire = () => {
          // Consume chamber on first round leave barrel (single-load flintlock)
          if (this.flintlock && isFlintlockContext(enriched, getEquippedWeapon?.(), this.character?.animPackId)) {
            this.flintlock.consume();
            this.onSession?.({ flintlock: this.flintlock.state });
          }
          if (count <= 1) {
            fireOne(0);
            enriched._deliveryLabel = 'Bullet · muzzle';
          } else {
            for (let i = 0; i < count; i++) {
              const yaw = (i - (count - 1) / 2) * spreadRad;
              const delayMs = Math.round(i * gapSec * 1000);
              if (delayMs <= 0) fireOne(yaw);
              else {
                setTimeout(() => {
                  try {
                    fireOne(yaw);
                  } catch {
                    /* dispose mid-cast */
                  }
                }, delayMs);
              }
            }
            enriched._deliveryLabel = `Bullet · burst ×${count}`;
          }
          // Soft-lock status package (Suppressing Shot slow)
          if (this.statuses && enriched.statuses?.length && this.combatFocus?.selectedTarget) {
            this.statuses.applyHit({
              target: {
                id: this.combatFocus.selectedTarget.id,
                point: this.combatFocus.selectedTarget.point,
                mesh: this.combatFocus.selectedTarget.mesh,
                kind: this.combatFocus.selectedTarget.kind || 'hostile'
              },
              skill: enriched,
              hit: { damage: enriched.damage, force: phys.force },
              character: this.character,
              physics: this.physics,
              drc: this
            });
          }
          // Optional lab auto-reload (default OFF — production uses key 1 when empty)
          if (FLINTLOCK_RELOAD.afterShot === true && this.character?.playPistolReload) {
            const lastRound = (count - 1) * gapSec;
            const reloadAt = Math.round(
              (lastRound + FLINTLOCK_FIRE.reloadAfterShotSec) * 1000
            );
            setTimeout(() => {
              try {
                if (this.flintlock?.isEmpty()) {
                  this.useSkill(0, { skill: makeReloadSkillDef() });
                }
              } catch {
                /* */
              }
            }, reloadAt);
          } else if (this.flintlock?.isEmpty()) {
            this.onToast('Empty · 1 Reload');
          }
        };

        const hitMs = Math.round(Math.max(0, hitSec) * 1000);
        if (hitMs <= 0) scheduleFire();
        else {
          setTimeout(() => {
            try {
              scheduleFire();
            } catch {
              /* */
            }
          }, hitMs);
        }
        return enriched;
      }
      // Nature stream: prefer rocks over orbs for earth school staffs
      if (
        (el === 'nature' || el === 'earth') &&
        (enriched.pathMode === 'stream' || isStaffNormalAttack(enriched)) &&
        this.projectiles.spawnEarthRocks
      ) {
        void this.projectiles.spawnEarthRocks({
          casterPos: this.character.position.clone(),
          target: resolved.target,
          forward: resolved.forward,
          rockCount: 1,
          aimMode: 'linear',
          targets,
          speed: phys.speed ?? 14
        });
        return enriched;
      }
      // Ice stream soft bolts: bubbles + orb
      if ((el === 'ice' || el === 'frost' || el === 'water') && this.projectiles.spawnBubbleStream) {
        this.projectiles.spawnBubbleStream({
          origin: resolved.origin,
          target: resolved.target,
          forward: resolved.forward,
          count: 4,
          speed: phys.speed ?? 12,
          targets
        });
      }
      const meshUrl =
        enriched.projectileMeshUrl ||
        enriched.summonMeshUrl ||
        (isStaffNormalAttack(enriched) ? staffProjectileMeshUrl(el) : null);
      const orbSize =
        enriched.useOrbProjectile || isStaffNormalAttack(enriched)
          ? STAFF_NORMAL_ATTACK.projectileDiameterM
          : phys.size;
      void this.projectiles.spawn({
        origin: resolved.origin,
        target: resolved.target,
        forward: resolved.forward,
        element: el,
        meshUrl,
        speed: phys.speed ?? 16,
        gravity: phys.gravity,
        contactRadius: phys.contactRadius ?? 0.4,
        life: phys.life,
        force: phys.force,
        knockbackMm: phys.knockbackMm,
        knockupVy: phys.knockupVy,
        aoe: phys.aoe,
        size: orbSize,
        targets,
        explodeOnHit: phys.explodeOnHit !== false,
        useOrbMaterials: true
      });
    }
    return enriched;
  }

  update(dt, keys) {
    this.elapsed += dt;
    this.projectiles?.update?.(dt);
    this.tipTrail?.update?.(dt, this.elapsed);
    this.statuses?.update?.(this.elapsed);
    // Soft burn crackle only while player has burn status (not on fire impacts)
    try {
      setPlayerBurningSfx(!!this.statuses?.hasStatus?.('player', 'burn'), { volume: 0.22 });
    } catch (_) {}
    this.flintlock?.tick?.(this.elapsed);
    this._tickWeaponCharge(dt, keys);
    // Dual resource regen (settings.drc)
    const staR = settings.drc?.staminaRegen ?? 18;
    const manaR = settings.drc?.manaRegen ?? 12;
    this.stamina = Math.min(this.maxStamina, this.stamina + dt * staR);
    this.mana = Math.min(this.maxMana, this.mana + dt * manaR);

    // Cast channel tick (bar + complete) before loco so interrupt can cancel
    this._tickCast(dt, keys);

    // Session gates (preferred) — land loco off while riding / equip / walk mode
    const g = this.gates;
    const parentName = this.character.root?.parent?.name || '';
    const riding =
      g?.rideParented ||
      this.sessionState?.riding ||
      this.character._rideActive ||
      this.character._rideParented ||
      this.character.isRideParented ||
      parentName === 'RideSeat' ||
      parentName.startsWith('socket_');
    if (riding || (g && !g.landLoco)) {
      this.character.setGait?.(0, false);
      if (this.invuln > 0) this.invuln = Math.max(0, this.invuln - dt);
      // Never write root.position while seat-parented (world coords would fling hero)
      // Skills still via useSkill when gates.combatSkills — no land move
      if (riding || !this.inCombat) return;
      if (g && !g.landLoco) return;
    }
    if (!this.inCombat) {
      this.character.setGait?.(0, false);
      return;
    }

    const ctrlHeld = keys.has('ControlLeft') || keys.has('ControlRight');
    // Sprint: toggle (default) or hold — settings.controls.sprintToggle
    this._updateSprint(keys);

    // I-frame timer (dodge sets this; other systems can extend)
    if (this.invuln > 0) this.invuln = Math.max(0, this.invuln - dt);

    // Shift+tap Ctrl = slide · Ctrl(+dir) = roll · AA/DD dodges
    this._pollSlide(keys, ctrlHeld);
    this._pollCtrlRoll(keys, ctrlHeld);
    if (!ctrlHeld) this._pollDoubleTapDodge(keys);
    this._ctrlWasDown = ctrlHeld;

    // Active dodge / roll / slide impulse overrides move
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
      // Continuous model afterimage trail while MM dodge / invuln runs
      const src = this.character.model || this.character.root;
      const pos = this.character.root?.position;
      this.vfx?.updateDodgeTrail?.(
        dt,
        true,
        src,
        pos,
        this.character.facing
      );
      if (this._dodgeT <= 0) {
        this._dodgeVel.set(0, 0, 0);
        // Keep fading residual ghosts after impulse ends
        this.vfx?.updateDodgeTrail?.(0, false, null, null);
      }
      return;
    }

    // Fade leftover afterimages when not dodging
    this.vfx?.updateDodgeTrail?.(dt, false, null, null);

    // ── WASD locomotion ──────────────────────────────────────────────
    // Focus ON (RMB toggle): camera-relative move + character rotates WITH camera
    // Focus OFF: tank turn with A/D, W/S along body facing (camera free)
    // Ctrl held: A/D reserved for roll · Shift hold = sprint
    const focusOn = !!this.combatFocus?.focusEnabled;
    let ix = 0;
    let iz = 0;
    if (keys.has('KeyW') || keys.has('ArrowUp') || this._autoTraverse) iz -= 1;
    if ((keys.has('KeyS') || keys.has('ArrowDown')) && !this._autoTraverse) iz += 1;

    if (focusOn) {
      // Strafe relative to camera (A/D don't turn body — camera yaw does)
      if (!ctrlHeld) {
        if (keys.has('KeyA') || keys.has('ArrowLeft')) ix += 1;
        if (keys.has('KeyD') || keys.has('ArrowRight')) ix -= 1;
      }
    } else if (!ctrlHeld) {
      // Free aim: A/D rotate character in place (tank turn)
      const turnRate = settings.aim?.tankTurnSpeed ?? 2.6; // rad/s
      let turn = 0;
      if (keys.has('KeyA') || keys.has('ArrowLeft')) turn += 1;
      if (keys.has('KeyD') || keys.has('ArrowRight')) turn -= 1;
      if (turn !== 0) {
        const yaw = this.character.facing + turn * turnRate * dt;
        this._yaw = yaw;
        this.character.setFacing(yaw);
      }
    }

    const len = Math.hypot(ix, iz);
    if (len > 1e-4) {
      ix /= len;
      iz /= len;
    }

    // Movement basis
    if (focusOn) {
      // Camera-relative
      this.camera.getWorldDirection(_fwd);
      _fwd.y = 0;
      if (_fwd.lengthSq() < 1e-6) _fwd.set(0, 0, 1);
      else _fwd.normalize();
    } else {
      // Body-facing (W/S only after A/D turn)
      const yaw = this.character.facing;
      _fwd.set(Math.sin(yaw), 0, Math.cos(yaw));
    }

    const fx = _fwd.x;
    const fz = _fwd.z;
    const rx = fz;
    const rz = -fx;

    _move.set(0, 0, 0);
    if (focusOn) {
      _move.x = fx * -iz + rx * ix;
      _move.z = fz * -iz + rz * ix;
    } else {
      // Only W/S along body
      _move.x = fx * -iz;
      _move.z = fz * -iz;
    }
    if (_move.lengthSq() > 1e-6) _move.normalize();

    // Water surface / submerge (shark fin back-slot buffs)
    const waterY = WORLD.waterY ?? settings.walk?.freerideWaterY ?? -0.04;
    const feetY = this.character?.position?.y ?? this.character?.root?.position?.y ?? 0;
    const headY = feetY + (this.character?.height || 1.8) * 0.88;
    this._inWater = feetY < waterY + 0.35;
    this._submerged = headY < waterY - 0.05;
    const waterBuffs = this.getBackWaterBuffs();
    // Sync for AI / fishing / other systems
    try {
      if (this.character) {
        this.character.sharkAggroImmune = !!waterBuffs.sharkAggroImmune;
        this.character.userData = this.character.userData || {};
        this.character.userData.sharkAggroImmune = !!waterBuffs.sharkAggroImmune;
        this.character.userData.breatheUnderwater = !!waterBuffs.breatheUnderwater;
        this.character.userData.swimSpeedMul = waterBuffs.swimSpeedMul;
      }
    } catch {
      /* optional */
    }

    let swimMul = 1;
    if (this._inWater || this._submerged) {
      swimMul = waterBuffs.swimSpeedMul || 1;
    }

    const speed =
      this.moveSpeed *
      (this._sprinting ? this.sprintMul : 1) *
      (settings.global?.animationSpeed || 1) *
      swimMul;
    const moving = _move.lengthSq() > 1e-6;
    let vx = moving ? _move.x * speed : 0;
    let vz = moving ? _move.z * speed : 0;

    // Underwater vertical assist (kinematic vy sample — no dedicated swim API yet)
    if (this._submerged) {
      if (keys.has('Space')) this._kinVy = Math.max(this._kinVy || 0, 2.8 * swimMul);
      else if (keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('KeyC')) {
        this._kinVy = Math.min(this._kinVy || 0, -2.4 * swimMul);
      } else if (waterBuffs.breatheUnderwater) {
        // Fin: slight neutral buoyancy (hold depth)
        this._kinVy = (this._kinVy || 0) * 0.9;
      }
    }

    // Breath / drown
    this._tickUnderwaterBreath(dt, waterBuffs);

    // Face: focus → match camera; free → A/D already turned body
    this._updateFacingToAim(dt, moving);

    // ── Jump / double-jump / S+Space backflip ─────────────────────────
    this._handleJump(dt, keys, moving);

    // Frontflip slight forward push
    if (this._frontflipBoostT > 0) {
      this._frontflipBoostT -= dt;
      const sp = settings.drc?.frontflipSpeed ?? 3.2;
      vx = this._frontflipDir.x * sp;
      vz = this._frontflipDir.z * sp;
    }

    // Backflip: hard stop → reverse dash (horizontal-heavy)
    if (this._backflipHardStopT > 0) {
      this._backflipHardStopT -= dt;
      vx = 0;
      vz = 0;
    } else if (this._backflipBoostT > 0) {
      this._backflipBoostT -= dt;
      const sp = settings.drc?.backflipSpeed ?? 6.8;
      vx = this._backflipDir.x * sp;
      vz = this._backflipDir.z * sp;
    }

    // Hang gravity window (after backflip — air attacks)
    if (this._hangT > 0) {
      this._hangT -= dt;
      if (this._hangT <= 0) {
        this.physics?.setGravityScale?.(1);
        this._kinGravityScale = 1;
      }
    }

    // Vertical velocity sample for fall state machine
    let sampleVy = this._kinVy || 0;
    if (this.physics?.ready && this._usePhysics) {
      const pose = this.physics.movePlayer(vx, vz, dt);
      this.character.root.position.set(pose.x, pose.y, pose.z);
      // Prefer physics vertical speed when available
      if (Number.isFinite(pose.vy)) sampleVy = pose.vy;
      else if (Number.isFinite(pose.velocityY)) sampleVy = pose.velocityY;
      else sampleVy = (pose.y - (this._lastPoseY ?? pose.y)) / Math.max(1e-4, dt);
      this._lastPoseY = pose.y;

      const wasGrounded = this._grounded;
      this._grounded = !!pose.grounded;
      if (this._grounded) {
        if (!wasGrounded && this._airborne) {
          // Deterministic land: impact vy + horizontal speed
          this._impactVy = this._lastVy < 0 ? this._lastVy : sampleVy;
          const horiz = Math.hypot(vx, vz);
          const wantRoll =
            keys?.has?.('KeyW') || keys?.has?.('ShiftLeft') || keys?.has?.('ShiftRight');
          const land = this.character.playFallLand?.({
            impactVy: this._impactVy,
            horizSpeed: horiz,
            wantRoll
          });
          if (!land?.ok) {
            this.character.clearFlip?.();
            this.character.clearAirJumpHold?.();
          }
        } else {
          this.character.clearFlip?.();
        }
        this._jumpsLeft = settings.drc?.maxJumps ?? 2;
        this._airborne = false;
        this._airTime = 0;
        this._backflipBoostT = 0;
        this._backflipHardStopT = 0;
        this._frontflipBoostT = 0;
        this._hangT = 0;
        this._flipHoldYaw = null;
        this.physics?.setGravityScale?.(1);
      } else {
        this._airborne = true;
        this._airTime = (this._airTime || 0) + dt;
        this._lastVy = sampleVy;
        // Jump hold → fallLoop when descending (author fall FBX)
        this.character.updateAirLocomotion?.({
          airborne: true,
          vy: sampleVy,
          airTime: this._airTime,
          flipping: !!(this.character._flipActive || this._backflipBoostT > 0 || this._frontflipBoostT > 0)
        });
      }
    } else {
      // Kinematic fallback (no Rapier)
      if (moving || this._backflipBoostT > 0 || this._frontflipBoostT > 0) {
        this.character.root.position.x += vx * dt;
        this.character.root.position.z += vz * dt;
      }
      this._integrateKinematicJump(dt, keys);
      if (!this._grounded) {
        this._airTime = (this._airTime || 0) + dt;
        this._lastVy = this._kinVy || 0;
        this.character.updateAirLocomotion?.({
          airborne: true,
          vy: this._kinVy || 0,
          airTime: this._airTime,
          flipping: !!(this.character._flipActive || this._backflipBoostT > 0)
        });
      } else {
        this._airTime = 0;
      }
    }

    // Gait: lock during jump/flip one-shots
    // Focus: intelligent strafe — world move vs camera right/forward (not pure A/D only)
    if (!this.character._gaitLocked && this._grounded) {
      if (!moving) {
        this.character.setGait?.(0, false);
      } else {
        let strafe = null;
        if (focusOn && moving) {
          // lateral = move · cameraRight ; fwd = move · cameraFwd
          const lat = _move.x * rx + _move.z * rz;
          const fwd = _move.x * fx + _move.z * fz;
          const absLat = Math.abs(lat);
          const absFwd = Math.abs(fwd);
          // Prefer side gait when lateral dominates or strong side component
          if (absLat > 0.28 && absLat >= absFwd * 0.55) {
            // KeyA → ix +1 maps to camera-left; lat sign matches move vs right
            strafe = lat > 0 ? 'right' : 'left';
          }
        }
        this.character.setGait?.(this._sprinting ? 2 : 1, this._sprinting, { strafe });
      }
    } else if (!this._grounded && !this.character._gaitLocked) {
      // Air: keep last gait weight low — jump clip owns pose when present
      this.character.setGait?.(0, false);
    }
  }

  /**
   * Facing:
   *  - Focus ON (RMB toggle): character rotates **with camera** (cam-forward)
   *  - Focus OFF: A/D tank-turn only (already applied in update); no cam rotate
   *  - Backflip / roll / dodge lock own facing while active
   * @param {number} dt
   * @param {boolean} moving
   */
  _updateFacingToAim(dt, moving) {
    // Backflip = setup move: keep facing look direction (do NOT snap body/cam 180°)
    if (this.character?.isBackflip || (this._backflipBoostT > 0 && this._flipHoldYaw != null)) {
      const hold =
        this.character?._flipCameraHoldYaw ??
        this._flipHoldYaw ??
        this.character.facing;
      this._yaw = hold;
      this.character.setFacing(hold);
      return;
    }
    if (this._dodgeT > 0) return;
    const locked = this.character._gaitLocked;
    const st = this.character.animState;
    if (locked && (st === 'dodge' || st === 'roll' || st === 'slide' || st === 'flip')) return;

    const focusOn = !!this.combatFocus?.focusEnabled;
    // Free aim: body yaw only from A/D tank turn in update() — do not follow camera/aim
    if (!focusOn) {
      this._yaw = this.character.facing;
      return;
    }

    // Focus: lag-follow camera yaw — do NOT snap body to every mouse twitch
    if (settings.aim?.focusTurnOnlyWhenMoving && !moving) {
      this._yaw = this.character.facing;
      return;
    }
    this.camera.getWorldDirection(_fwd);
    _fwd.y = 0;
    if (_fwd.lengthSq() < 1e-6) return;
    _fwd.normalize();
    const targetYaw = Math.atan2(_fwd.x, _fwd.z);

    let cur = this.character.facing;
    let diff = targetYaw - cur;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;

    // Deadzone: ignore small look offsets so camera pans without spinning body
    const dead =
      MathUtils.degToRad(settings.aim?.focusTurnDeadzoneDeg ?? 16);
    if (Math.abs(diff) < dead) {
      this._yaw = cur;
      return;
    }
    // Pull only excess past deadzone (so we don't overshoot into twitchy center)
    const sign = Math.sign(diff);
    const excess = Math.abs(diff) - dead;
    const turn = settings.aim?.focusTurnSpeed ?? 6.5;
    const maxStep = turn * dt;
    const step = Math.min(excess, maxStep);
    cur += sign * step;
    this._yaw = cur;
    this.character.setFacing(cur);
  }

  /**
   * Sprint: toggle on Shift press (default) or hold while Shift down.
   * @param {Set<string>} keys
   */
  _updateSprint(keys) {
    const shiftDown = keys.has('ShiftLeft') || keys.has('ShiftRight');
    const toggle = settings.controls?.sprintToggle !== false;
    if (toggle) {
      if (shiftDown && !this._wasShiftDown) {
        this._sprintLatched = !this._sprintLatched;
        this.onToast?.(this._sprintLatched ? 'Sprint ON' : 'Sprint OFF');
      }
      this._sprinting = this._sprintLatched || this._autoTraverse;
    } else {
      this._sprinting = shiftDown || this._autoTraverse;
      this._sprintLatched = false;
    }
    this._wasShiftDown = shiftDown;
  }

  /** Toggle ` auto run / freeride sail-row. */
  toggleAutoTraverse() {
    this._autoTraverse = !this._autoTraverse;
    if (this._autoTraverse) this._sprintLatched = true;
    this.onToast?.(this._autoTraverse ? 'Auto RUN/SAIL ON (`)' : 'Auto OFF (`)');
    return this._autoTraverse;
  }

  isAutoTraverse() {
    return !!this._autoTraverse;
  }

  /**
   * Edge-detect Space:
   *  - Ground → jump anim blend
   *  - Air 2nd → frontflip (standard)
   *  - Air 2nd + S → hard stop + horizontal backflip + hang (air attacks)
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
      // Hard stop → reverse horizontal boost · keep look yaw (setup for air attack)
      this.camera.getWorldDirection(_fwd);
      _fwd.y = 0;
      if (_fwd.lengthSq() < 1e-6) {
        const yaw0 = this.character.facing;
        _fwd.set(Math.sin(yaw0), 0, Math.cos(yaw0));
      } else _fwd.normalize();
      // Hold look: do not face reverse
      this._flipHoldYaw = Math.atan2(_fwd.x, _fwd.z);
      this._backflipDir.set(-_fwd.x, 0, -_fwd.z);
      this._backflipHardStopT = cfg.backflipHardStop ?? 0.1;
      this._backflipBoostT = cfg.backflipDuration ?? 0.52;
      this._frontflipBoostT = 0;
      const jv = cfg.backflipVertical ?? 2.4;
      if (this.physics?.ready) {
        this.physics.zeroVerticalVelocity?.();
        this.physics.jump(jv);
        this.physics.setGravityScale?.(cfg.backflipHangGravity ?? 0.32);
      } else {
        this._kinVy = jv;
        this._kinGravityScale = cfg.backflipHangGravity ?? 0.32;
      }
      this._hangT = cfg.backflipHangDuration ?? 1.15;
      this.character.playBackflip?.(cfg.backflipDuration ?? 0.52, {
        holdYaw: this._flipHoldYaw
      });
      this.character.setFacing(this._flipHoldYaw);
      this._yaw = this._flipHoldYaw;
      this._jumpsLeft = 0;
      this._grounded = false;
      this._airborne = true;
      this.onToast?.('Backflip · camera hold · air setup');
      return;
    }

    if (isSecond) {
      // Standard double jump = quick frontflip
      const yaw = this.character.facing;
      this._frontflipDir.set(Math.sin(yaw), 0, Math.cos(yaw));
      this._frontflipBoostT = cfg.frontflipDuration ?? 0.48;
      this._backflipBoostT = 0;
      this._backflipHardStopT = 0;
      const jv = cfg.doubleJumpVelocity ?? 5.0;
      if (this.physics?.ready) this.physics.jump(jv);
      else this._kinVy = jv;
      this.character.playFrontflip?.(cfg.frontflipDuration ?? 0.48);
      this._jumpsLeft = 0;
      this._grounded = false;
      this._airborne = true;
      this.onToast?.('Frontflip');
      return;
    }

    // First jump — blend jump clip, hold pose while airborne
    const jv = cfg.jumpVelocity ?? 5.4;
    if (this.physics?.ready) this.physics.jump(jv);
    else this._kinVy = jv;
    this.character.playJump?.(0.1, { holdAir: true });
    this._jumpsLeft -= 1;
    this._grounded = false;
    this._airborne = true;
  }

  /** Simple ballistic Y when Rapier unavailable. */
  _integrateKinematicJump(dt, keys) {
    if (this._kinVy === undefined) this._kinVy = 0;
    if (this._kinGravityScale === undefined) this._kinGravityScale = 1;
    const g = -9.81 * this._kinGravityScale;
    if (this._grounded && this._kinVy <= 0) {
      this.character.root.position.y = 0;
      this._kinVy = 0;
      this._jumpsLeft = settings.drc?.maxJumps ?? 2;
      this._kinGravityScale = 1;
      return;
    }
    this._kinVy += g * dt;
    this.character.root.position.y += this._kinVy * dt;
    if (this.character.root.position.y <= 0) {
      const impactVy = this._kinVy;
      this.character.root.position.y = 0;
      this._kinVy = 0;
      this._grounded = true;
      this._jumpsLeft = settings.drc?.maxJumps ?? 2;
      this._backflipBoostT = 0;
      this._backflipHardStopT = 0;
      this._frontflipBoostT = 0;
      this._hangT = 0;
      this._kinGravityScale = 1;
      this.character.clearFlip?.();
      const wantRoll =
        keys?.has?.('KeyW') || keys?.has?.('ShiftLeft') || keys?.has?.('ShiftRight');
      const land = this.character.playFallLand?.({
        impactVy,
        horizSpeed: 2.5,
        wantRoll
      });
      if (!land?.ok) this.character.clearAirJumpHold?.();
    } else {
      this._grounded = false;
      // fall loop driven by outer updateAirLocomotion
    }
  }

  get isCasting() {
    return !!this._cast;
  }

  getCastBarState() {
    if (!this._cast) return null;
    const c = this._cast;
    const prog = MathUtils.clamp(
      (this.elapsed - c.startedAt) / Math.max(0.001, c.duration),
      0,
      1,
    );
    return {
      active: true,
      label: c.label,
      progress01: prog,
      duration: c.duration,
      remaining: Math.max(0, c.endsAt - this.elapsed),
      element: c.element || 'arcane',
    };
  }

  _beginCast(opts) {
    const duration = Math.max(0, Number(opts.duration) || 0);
    if (duration < 0.06) {
      opts.onComplete?.();
      return true;
    }
    if (this._cast) this._interruptCast('replaced', false);
    this._cast = {
      label: opts.label || 'Casting',
      element: opts.element || 'arcane',
      startedAt: this.elapsed,
      duration,
      endsAt: this.elapsed + duration,
      onComplete: opts.onComplete,
      interruptible: opts.interruptible !== false,
      aim: opts.aim || null,
      showCharge: opts.showCharge !== false,
      skill: opts.skill || null
    };
    this.character.setCasting?.(true, opts.aim || null);
    this.character.playWeaponCombat?.('cast') ||
      this.character.playCastFlourish?.() ||
      this.character.requestOneShot?.('cast');
    try {
      playForWeaponSkillCast(opts.skill || { element: opts.element, label: opts.label }, {
        duration
      });
    } catch (_) {}
    // Small elemental charge shell (kamehameha bake) at tip during cast
    if (this._cast.showCharge && this.projectiles?.spawnCharge) {
      this._chargeOrigin = this._chargeOrigin || new Vector3();
      this._getChargeOrigin(this._chargeOrigin);
      void this.projectiles.spawnCharge({
        origin: this._chargeOrigin,
        element: this._cast.element,
        meshUrl: opts.chargeMeshUrl || STAFF_CHARGE_MESH,
        size: 0.32
      });
    }
    this.onCastBar?.(this.getCastBarState());
    return true;
  }

  /** Staff tip / cast hand for charge shell. */
  _getChargeOrigin(out) {
    if (typeof this.character.getWeaponTip === 'function') {
      this.character.getWeaponTip(out, settings.residual?.tipOffset ?? 0.55);
      return out;
    }
    this.character.getCastOrigin?.(out) || out.copy(this.character.position);
    out.y += 1.1;
    return out;
  }

  _tickCast(dt, keys) {
    if (!this._cast) return;
    if (this._cast.interruptible && settings.drc?.castInterruptOnMove !== false) {
      const moving =
        keys?.has?.('KeyW') ||
        keys?.has?.('KeyA') ||
        keys?.has?.('KeyS') ||
        keys?.has?.('KeyD') ||
        keys?.has?.('ArrowUp') ||
        keys?.has?.('ArrowDown') ||
        keys?.has?.('ArrowLeft') ||
        keys?.has?.('ArrowRight');
      if (moving && this.elapsed - this._cast.startedAt > 0.12) {
        this._interruptCast('moved');
        return;
      }
    }
    if (this.elapsed >= this._cast.endsAt) {
      const done = this._cast.onComplete;
      this._clearCast();
      try {
        done?.();
      } catch (e) {
        console.warn('[DrcCombat] cast complete', e);
      }
      this.onCastBar?.(null);
      return;
    }
    this.character.setCasting?.(true, this._cast.aim || null);
    // Pulse charge shell at tip while channeling
    if (this._cast.showCharge && this.projectiles?.updateCharge) {
      this._chargeOrigin = this._chargeOrigin || new Vector3();
      this._getChargeOrigin(this._chargeOrigin);
      const prog = MathUtils.clamp(
        (this.elapsed - this._cast.startedAt) / Math.max(0.01, this._cast.duration),
        0,
        1
      );
      this.projectiles.updateCharge(this._chargeOrigin, dt, prog);
    }
    this.onCastBar?.(this.getCastBarState());
  }

  _interruptCast(reason = 'cancel', toast = true) {
    if (!this._cast) return;
    this._clearCast();
    this.character.setCasting?.(false);
    if (toast) this.onToast(reason === 'moved' ? 'Cast interrupted' : 'Cast cancelled');
    this.onCastBar?.({ active: false, interrupted: true });
  }

  _clearCast() {
    this.projectiles?.clearCharge?.();
    this._cast = null;
    this.character.setCasting?.(false);
  }

  /**
   * F key — equipped weapon skill (primary / Showcase bind `f`).
   * Full cast-time + prefab path. Not residual, not class ability.
   * @returns {boolean}
   */
  useWeaponSkillF() {
    if (!this.inCombat) {
      this.onToast('Enter combat (Q) for weapon skills');
      return false;
    }
    if (this._cast) {
      this.onToast('Already casting');
      return false;
    }
    const skill = skillForFKey();
    if (!skill) {
      this.onToast('No weapon skill — equip a weapon (I → Weapon)');
      return false;
    }
    // Chargeable F (Charged Shot) — begin hold; App should call release on keyup
    return this.beginWeaponCharge('f', { skill });
  }

  /**
   * Weapon rest / GCD gate (best rest after charged shot).
   * @param {boolean} [toast]
   */
  _weaponReady(toast = true) {
    if (this.elapsed < this._weaponRestUntil) {
      if (toast) this.onToast('Weapon rest…');
      return false;
    }
    if (this.elapsed < this._weaponGcdUntil) {
      if (toast) this.onToast('…');
      return false;
    }
    return true;
  }

  /**
   * Begin hold-to-charge (keydown). Tap→release fires quick; hold builds Charged Shot.
   * @param {number|string} slot
   * @param {{ skill?: object }} [opts]
   */
  beginWeaponCharge(slot, opts = {}) {
    if (!this.inCombat) {
      this.onToast('Enter combat (Q) to use weapon skills');
      return false;
    }
    if (this.weaponCharge?.active) return true;
    if (!this._weaponReady(true)) return false;
    if (this._cast) {
      this.onToast('Already casting');
      return false;
    }

    let skill = opts.skill || (slot === 'f' || slot === -1 ? skillForFKey() : skillBySlot(slot));
    if (!skill) return false;

    const pack = this.character?.animPackId || '';
    const weapon = typeof getEquippedWeapon === 'function' ? getEquippedWeapon() : null;
    const flintCtx = isFlintlockContext(skill, weapon, pack);

    if (flintCtx && this.flintlock) {
      this.flintlock.tick(this.elapsed);
      const slotN = slot === 'f' || slot === -1 ? 0 : Number(slot);
      if (
        (slotN === 0 || slot === 'f' || slot === -1) &&
        this.flintlock.isEmpty() &&
        !this.flintlock.isReloading()
      ) {
        return this.useSkill(slot, { skill: makeReloadSkillDef(), skipCharge: true });
      }
      if (skillNeedsLoad(skill) && (this.flintlock.isEmpty() || this.flintlock.isReloading())) {
        this.onToast(this.flintlock.isReloading() ? 'Reloading…' : 'Empty · press 1 to Reload');
        return false;
      }
    }

    if (!isChargeableWeaponSkill(skill, { animPack: pack, weaponId: weapon?.id })) {
      return this.useSkill(slot, { skill, skipCharge: true });
    }

    const animRole =
      pack === 'pistol' || flintCtx
        ? 'skill2'
        : skill.animRole === 'skill2'
          ? 'skill2'
          : 'cast';
    this.weaponCharge.begin(
      slot === 'f' || slot === -1 ? 0 : Number(slot),
      skill,
      this.elapsed,
      animRole
    );
    this.character.beginWeaponChargeAnim?.(animRole) ||
      this.character.requestOneShot?.(animRole) ||
      this.character.requestOneShot?.('cast');
    this.onCastBar?.(chargeBarState({ holdSec: 0, skill, active: true }));
    this.onToast(`${skill.label} · hold to charge`);
    return true;
  }

  /**
   * Keyup — tap fire or charged release.
   * @param {{ cancel?: boolean }} [opts]
   */
  releaseWeaponCharge(opts = {}) {
    if (!this.weaponCharge?.active) return false;
    const payload = this.weaponCharge.end(opts.cancel ? 'cancel' : 'release');
    this.onCastBar?.(null);
    this.character.endWeaponChargeAnim?.(payload.reason === 'release' && payload.isCharged);

    if (payload.reason === 'cancel' || opts.cancel) {
      this._weaponRestUntil = this.elapsed + payload.restSec;
      this.onToast('Charge cancel');
      return false;
    }

    const skill = payload.skill;
    if (!skill) return false;

    return this.useSkill(payload.slot, {
      skill,
      skipCharge: true,
      chargeHoldSec: payload.isCharged ? payload.holdSec : 0,
      chargeDamageMul: payload.isCharged ? payload.damageMul : 1,
      chargeIntensity: payload.isCharged ? payload.intensity : 1,
      chargeLevel: payload.level,
      forceAnimRole: payload.isCharged
        ? 'skill2'
        : skill.animRole || (skill.style === 'ranged' ? 'attack' : null)
    });
  }

  /** @param {number} dt @param {Set<string>} [keys] */
  _tickWeaponCharge(dt, keys) {
    if (!this.weaponCharge?.active) return;
    const cfg = weaponChargeConfig();
    const u = this.weaponCharge.update(dt, this.elapsed);
    if (u.tick || u.levelChanged) {
      this.onCastBar?.(
        chargeBarState({
          holdSec: u.holdSec,
          skill: this.weaponCharge.skill,
          active: true
        })
      );
      this.character.tickWeaponChargeAnim?.(u.progress01, u.holdSec);
      if (u.levelChanged && u.level.id !== 'tap') {
        this.onToast(`${this.weaponCharge.skill?.label || 'Charge'} · ${u.level.label}`);
      }
    }
    if (u.holdSec >= cfg.maxHoldSec) {
      this.releaseWeaponCharge();
    }
  }

  /**
   * Fire weapon skill slot 0–3, or F via opts.
   * @param {number|string} slot 0–3 or 'f'
   * @param {{
   *   skill?: object,
   *   bound?: object|null,
   *   skipCharge?: boolean,
   *   chargeHoldSec?: number,
   *   chargeDamageMul?: number,
   *   chargeIntensity?: number,
   *   chargeLevel?: object,
   *   forceAnimRole?: string
   * }} [opts]
   * @returns {boolean}
   */
  useSkill(slot, opts = {}) {
    if (!this.inCombat) {
      this.onToast('Enter combat (Q) to use weapon skills');
      return false;
    }
    const g = this.gates;
    if (g && !g.combatSkills) {
      this.onToast('Skills locked');
      return false;
    }
    // Windsurf freeride: allow ranged/staff skills (tslda boat combat feel)
    if (this.character._rideActive && !this._allowRideSkill()) return false;

    if (this.weaponCharge?.active && !opts.skipCharge) {
      return true;
    }

    if (!opts.skipCharge && !this._weaponReady(true)) return false;

    let skill = opts.skill || (slot === 'f' || slot === -1 ? skillForFKey() : skillBySlot(slot));
    if (!skill) return false;

    // Route chargeable → hold UX (unless release/tap already set skipCharge)
    if (!opts.skipCharge) {
      const pack0 = this.character?.animPackId || '';
      const weapon0 = typeof getEquippedWeapon === 'function' ? getEquippedWeapon() : null;
      if (isChargeableWeaponSkill(skill, { animPack: pack0, weaponId: weapon0?.id })) {
        return this.beginWeaponCharge(slot, { skill });
      }
    }

    // ── Flintlock chamber: empty → digit 1 is Reload (production Warlords) ──
    const pack = this.character?.animPackId || '';
    const weapon = typeof getEquippedWeapon === 'function' ? getEquippedWeapon() : null;
    const flintCtx = isFlintlockContext(skill, weapon, pack);
    if (flintCtx && this.flintlock) {
      this.flintlock.tick(this.elapsed);
      const slotN = slot === 'f' || slot === -1 ? 0 : Number(slot);
      // Key 1 (slot 0) or F primary when empty → Reload
      if (
        (slotN === 0 || slot === 'f' || slot === -1) &&
        this.flintlock.isEmpty() &&
        !this.flintlock.isReloading() &&
        !skill.isReload
      ) {
        skill = makeReloadSkillDef();
        this.onToast('Empty · Reload');
      } else if (skillNeedsLoad(skill) && this.flintlock.isEmpty()) {
        this.onToast('Empty · press 1 to Reload');
        return false;
      } else if (skillNeedsLoad(skill) && this.flintlock.isReloading()) {
        this.onToast('Reloading…');
        return false;
      } else if (
        (skill.isReload || /reload/i.test(`${skill.id} ${skill.label}`)) &&
        this.flintlock.isLoaded()
      ) {
        this.onToast('Already loaded');
        return false;
      }
    }

    // Catalog binding (Showcase) — true master-weaponSkills id when set
    const bound =
      opts.bound !== undefined
        ? opts.bound
        : getSkillBinding(slot === -1 ? 'f' : slot);
    const boundName = bound?.name || skill.label;

    // Merge WEAPON_SKILLS STAFF row only — no invented skills
    const staffId = bound?.skillId || skill.catalogSkillId || skill.id;
    const staffB =
      bindFromCatalogSkill({
        id: staffId,
        name: bound?.name || skill.label,
        description: skill.description || '',
        damageType: bound?.damageType || skill.damageType,
        effects: skill.effects,
        cooldown: skill.cooldown,
        castTime: skill.castDuration,
        range: skill.rangeM,
        damage: skill.damage,
        slotType: skill.slotType
      }) || staffBindFor(staffId);
    if (staffB) {
      skill = {
        ...skill,
        element: staffB.element,
        abilityElement: staffB.element,
        pathMode: staffB.pathMode,
        presentation: staffB.presentation,
        castEffectId: staffB.castEffectId,
        travelEffectId: staffB.travelEffectId,
        impactEffectId: staffB.impactEffectId,
        abilityClass: staffB.abilityClass,
        animRole: 'cast',
        rangeM: staffB.rangeM || skill.rangeM,
        castDuration: staffB.castDuration || skill.castDuration,
        cooldown: staffB.cooldown || skill.cooldown,
        catalogSkillId: staffId,
        label: boundName || staffB.name || skill.label,
        description: staffB.description,
        effects: staffB.effects,
        useOrbProjectile: staffB.useOrbProjectile ?? skill.useOrbProjectile,
        projectileMeshUrl: staffB.projectileMeshUrl || skill.projectileMeshUrl,
        chargeMeshUrl: staffB.chargeMeshUrl || skill.chargeMeshUrl
      };
    }

    const readyAt = this._cdUntil.get(skill.id) || 0;
    if (this.elapsed < readyAt) {
      this.onToast(`${skill.label} CD`);
      return false;
    }
    // Digit / charged: hold intensity scales cost (Charged Shot)
    const holdSec = Number(opts.chargeHoldSec) || 0;
    const costs = skillCastCosts(skill, holdSec, 0);
    if (!this._spendResources(costs.mana, costs.stamina, skill.label)) return false;
    this._cdUntil.set(skill.id, this.elapsed + skill.cooldown);
    if (this._cast) {
      this.onToast('Already casting');
      return false;
    }
    // Charge mul on damage / force for this cast
    const dmgMul = Number(opts.chargeDamageMul) || 1;
    if (dmgMul > 1.01) {
      skill = {
        ...skill,
        damage: Math.round((Number(skill.damage) || 0) * dmgMul),
        force: (Number(skill.force) || 6) * dmgMul,
        _chargeMul: dmgMul,
        _chargeLevel: opts.chargeLevel?.id || null,
        _chargeHoldSec: holdSec
      };
    }
    if (opts.forceAnimRole) {
      skill = { ...skill, animRole: opts.forceAnimRole };
    }
    // Production hit package for projectiles / melee residual
    this._lastSkill = skill;
    // Combat timer: short GCD + best rest after any weapon fire
    const cfgCh = weaponChargeConfig();
    this._weaponGcdUntil = this.elapsed + cfgCh.gcdSec;
    this._weaponRestUntil =
      this.elapsed +
      weaponRestAfterFire(holdSec, opts.chargeIntensity || costs.intensity || 1, cfgCh);

    // Flintlock reload path (baked pistol/reload + procedural powder pose)
    if (
      skill.isReload ||
      skill.skillKind === 'reload' ||
      /reload/i.test(`${skill.id} ${skill.label}`)
    ) {
      if (flintCtx && this.flintlock) {
        const dur = FLINTLOCK_RELOAD.durationSec;
        if (!this.flintlock.beginReload(dur, this.elapsed)) {
          this.onToast(this.flintlock.isLoaded() ? 'Already loaded' : 'Reload busy');
          return false;
        }
        // Baked clip first
        this.character.playPistolReload?.({ power: false }) ||
          this.character.requestOneShot?.('reload') ||
          this.character.requestOneShot?.('draw');
        this._cdUntil.set(skill.id, this.elapsed + Math.max(skill.cooldown || 0, 0.5));
        // Complete chamber when reload anim ends
        setTimeout(() => {
          try {
            this.flintlock?.completeReload();
            this.onToast('Loaded · flintlock ready');
            this.onSession?.({ flintlock: this.flintlock?.state });
          } catch {
            /* */
          }
        }, Math.round(dur * 1000));
        this.onToast('Reload · powder + ball');
        this.onSession?.({ flintlock: this.flintlock.state });
        return true;
      }
    }

    const yaw = this.character.facing;
    // Focus: snow-brawl 3D launch vector; free: horizontal aim forward
    const use3d =
      settings.aim?.use3dLaunch !== false &&
      this.aim?.forward3d &&
      this.aim.forward3d.lengthSq() > 1e-6 &&
      this.aim?.valid;
    if (use3d) _fwd.copy(this.aim.forward3d).normalize();
    else if (this.aim?.valid) _fwd.copy(this.aim.forward);
    else _fwd.set(Math.sin(yaw), 0, Math.cos(yaw));
    this.character.getCastOrigin(_origin);
    // Prefer MouseAim.computeLaunch origin when available (hand offset + chest)
    let spawnOrigin = _origin.clone();
    let aimTarget = this.aim?.hitPoint?.clone?.() || null;
    if (this.aim?.computeLaunch && this.character?.position) {
      try {
        const launch = this.aim.computeLaunch(this.character.position, {
          hand: this._throwHand === 'left' ? 'left' : 'right'
        });
        if (launch?.origin) spawnOrigin.copy(launch.origin);
        if (launch?.direction) _fwd.copy(launch.direction);
        if (launch?.target) aimTarget = launch.target.clone();
        this._throwHand = this._throwHand === 'left' ? 'right' : 'left';
      } catch {
        /* keep cast origin */
      }
    }
    const rangeM = skill.rangeM || 8;
    const pose = {
      origin: spawnOrigin.clone(),
      forward: _fwd.clone(),
      aim:
        aimTarget ||
        _end.copy(spawnOrigin).addScaledVector(_fwd, rangeM * 0.65)
    };
    const aimPt = { x: pose.aim.x, y: pose.aim.y, z: pose.aim.z };
    const castDur =
      skill.style === 'melee'
        ? 0
        : Math.max(0, Number(skill.castDuration ?? skill.castTime ?? 0.55));

    const releaseSpell = () => {
    // Catalog VFX when bound; else DRC skill beauty
    if (bound) {
      const vfxId = vfxIdForSkill({
        id: bound.skillId,
        name: bound.name,
        description: '',
        damageType: bound.damageType,
        labStyle: bound.labPack === 'magic' ? 'spell' : skill.style
      });
      this.vfx?.deploy?.(vfxId, { ...pose, intensity: 1.1 });
    } else {
      this.vfx?.deploySkill?.(skill.id, pose, 'cast');
    }

    // Catalog buffs: Focus (next spell) · Take Cover / Nature Ward (self DR)
    if (skill.isFocus || skill.isWard || skill.skillKind === 'buff') {
      const dur = skill.focusDurationSec || 3;
      if (skill.castEffectId) {
        this.vfx?.deploy?.(skill.castEffectId, { ...pose, intensity: 0.85 });
      }
      if (skill.isFocus) {
        this._focusUntil = this.elapsed + dur;
        this._focusMul = skill.focusDamageMul || 1.35;
        this.onToast(`Focus · next spell +${Math.round((this._focusMul - 1) * 100)}% (${dur}s)`);
      } else if (
        skill.isWard ||
        /ward|shield|cover|guard|brace|lumber/i.test(`${skill.id} ${skill.label}`)
      ) {
        // Take Cover / Nature Ward — self damage reduction for catalog duration
        const reduce =
          skill.wardDamageReduce != null
            ? Number(skill.wardDamageReduce)
            : (() => {
                const blob = (skill.effects || []).join(' ').toLowerCase();
                const pct = /(\d+)\s*%/.exec(blob);
                return pct ? Math.min(0.9, Number(pct[1]) / 100) : 0.2;
              })();
        this._wardUntil = this.elapsed + dur;
        this._wardReduce = reduce;
        this.statuses?.applyHit?.({
          target: { id: 'player', kind: 'player' },
          skill: {
            ...skill,
            statuses: skill.statuses?.length
              ? skill.statuses
              : [{ id: 'ward', durationSec: dur, magnitude: reduce }]
          },
          applyToPlayer: true,
          character: this.character,
          physics: this.physics,
          drc: this
        });
        this.vfx?.deploy?.(skill.impactEffectId || 'earth_surge', {
          ...pose,
          intensity: 0.9
        });
        this.onToast(
          `${skill.label} · −${Math.round(reduce * 100)}% dmg taken · ${dur}s`
        );
      } else {
        this.onToast(`${skill.label} · buff ${dur}s`);
      }
      return;
    }

    // ── Elemental × linear plan (learned LinearAbilityCasting + staff skills) ──
    const focusOnPre = this.elapsed < this._focusUntil;
    const focusMulPre = focusOnPre ? this._focusMul || 1.35 : 1;
    const castPlan = planElementalLinearCast(skill, {
      focusCombat: !!this.combatFocus?.focusEnabled || this.inCombat,
      pathDrawn: false,
      intensity: focusMulPre
    });
    skill._castPlan = castPlan;

    // Linear LINE/ZONE skillshot (castToward — no Alt+Shift arm required)
    if (castPlan.useLinear && this.linearSkills) {
      try {
        const feet = this.character.position.clone();
        const aimPt3 =
          pose.aim?.clone?.() ||
          feet.clone().addScaledVector(pose.forward, skill.rangeM || 12);
        const okLin = fireLinearFromPlan(this.linearSkills, castPlan, {
          origin: pose.origin,
          feet,
          aim: aimPt3
        });
        if (okLin) skill._deliveryLabel = `Linear · ${castPlan.linearId}`;
      } catch (e) {
        console.warn('[DrcCombat] linear cast', e);
      }
    }

    // Delivery pattern (over/under/around/projectile) + mesh force projectiles
    try {
      const deliv = this._deploySkillDelivery(skill, pose);
      if (deliv?.deliveryLabel) {
        skill._deliveryLabel = deliv.deliveryLabel;
      }
    } catch (e) {
      console.warn('[DrcCombat] delivery', e);
    }

    // VFX: spell → elemental ability + creative presentation (volley/meteor/vines/…)
    if (skill.style === 'spell' && (skill.element || skill.abilityElement)) {
      // Product element (fire|storm|ice|nature|holy|arcane) or legacy — AbilityManager maps pool
      const el = skill.element || skill.abilityElement;
      const pathMode = skill.pathMode || 'stream';
      // Path Ability beauty when plan says so (staffCast learning + presentation)
      if (castPlan.usePathAbility !== false) {
        const curve = this._curveForPathMode(pathMode, skill.rangeM);
        this.abilities.select(el);
        this.abilities.cast(curve, el);
      }

      const focusOn = this.elapsed < this._focusUntil;
      const focusMul = focusOn ? this._focusMul || 1.35 : 1;
      const intensity = focusOn ? 1.0 * focusMul : 1.0;
      if (focusOn) {
        // Consume focus on first damaging spell
        this._focusUntil = 0;
      }
      // Push intensity into linear global knobs (live sample mid-cast)
      this.linearSkills?.applyIntensity?.(intensity);

      const isMeteor =
        /meteor|inferno/i.test(skill.id + skill.label + (skill.catalogSkillId || '')) ||
        skill.presentation === 'meteor';
      const isVolley =
        /volley|spark|practice/i.test(skill.id + skill.label) ||
        skill.presentation === 'volley' ||
        ((el === 'fire' || el === 'arcane') && !/meteor/i.test(skill.id + skill.label));
      const isLightning =
        el === 'storm' ||
        /lightning|chain.?lightning|tempest|storm/i.test(skill.id + skill.label) ||
        skill.presentation === 'lightning';
      const isShield =
        /shield|ward|guard/i.test(skill.id + skill.label) || skill.presentation === 'shield';
      // Catalog presentation only (staff school style — no invented skill systems)
      const pathFromBind = skill.pathMode || pathMode;
      const presStyle = skill.presentation || skill.prefab?.presentation || null;

      this.vfx?.deployPresentation?.(el, { ...pose, intensity }, {
        pathKind: pathFromBind,
        presentation: presStyle,
        meteor: isMeteor || presStyle === 'meteor',
        volley: (isVolley && !isLightning) || presStyle === 'volley',
        lightning: (isLightning && !isShield) || presStyle === 'lightning',
        chain: isLightning,
        shield: isShield || presStyle === 'shield' || pathFromBind === 'wall'
      });

      const dmg = skill.damage ? ` · ${Math.round(skill.damage * focusMul)} dmg` : '';
      const cat = skill.catalogSkillId ? ` → ${skill.catalogSkillId}` : '';
      const focusTag = focusOn ? ' · FOCUSED' : '';
      const styleTag = presStyle ? ` · ${presStyle}` : '';
      const linTag = castPlan.useLinear ? ` · lin:${castPlan.linearId}` : '';
      const layerTag =
        castPlan.layers?.length > 1 ? ` · [${castPlan.layers.slice(0, 3).join('+')}]` : '';
      this.onToast(
        bound
          ? `${boundName} · ${bound.skillId}${linTag}`
          : `${skill.label}${skill.pathMode ? ` · ${skill.pathMode}` : ''}${styleTag}${dmg}${focusTag}${linTag}${layerTag}${cat}`
      );
      return;
    }

    if (skill.style === 'melee') {
      // Guard / ward: no residual slash
      if (!(skill.isWard || skill.animRole === 'block' || skill.skillKind === 'buff')) {
        const aoe = skill.residualAoe;
        this._fireMeleeResidual(skill, pose, {
          rangeOverride: skill.rangeM,
          hit: {
            kind: skill.animRole === 'finisher' ? 'finisher' : 'light',
            step: /^attack([123])$/.exec(skill.animRole || '')?.[1]
              ? Number(RegExp.$1) - 1
              : 0
          }
        });
        // Wider contact for Wide Sweep etc.
        if (aoe > 0 && settings.residual) {
          /* residualFromSettings already used; rangeOverride covers reach */
        }
      }
      this.onToast(bound ? `${boundName} · ${bound.skillId}` : skill.label);
      return;
    }

    // Ranged (flintlock · bow · xbow) — delivery already fired bullets/arrows
    if (skill.style === 'ranged') {
      const n = pistolBulletCount(skill);
      const dmg = skill.damage ? ` · ${skill.damage} dmg` : '';
      const multi = n > 1 ? ` · ×${n}` : '';
      const del = skill._deliveryLabel ? ` · ${skill._deliveryLabel}` : '';
      this.onToast(
        bound
          ? `${boundName} · ${bound.skillId}${multi}`
          : `${skill.label}${dmg}${multi}${del}`
      );
      return;
    }

    // Bound catalog skill on a spell-less bar slot — still fire residual / path
    if (bound) {
      this._fireMeleeResidual(skill, pose);
      this.onToast(`${boundName} · ${bound.skillId}`);
      return;
    }
    };

    // Instant melee / ranged / near-zero castDuration
    if (skill.style === 'melee' || skill.style === 'ranged' || castDur < 0.08) {
      const animRole =
        skill.animRole ||
        (bound
          ? animRoleForSkill({
              labStyle:
                bound.labPack === 'magic'
                  ? 'spell'
                  : bound.labPack === 'longbow'
                    ? 'ranged'
                    : skill.style,
              animation: null,
              id: bound.skillId,
              name: bound.name,
              slotType: 'ability'
            })
          : 'attack');
      // T0 / catalog roles: attack1–3 light, block guard, attack ranged, cast buff
      if (animRole === 'block' || animRole === 'parry' || skill.isWard) {
        this.character.playParry?.() ||
          this.character.requestOneShot?.('block') ||
          this.character.requestOneShot?.('parry');
        try {
          // Wards / magic kits → lightning wizard parry; else metal
          const magic =
            skill.isWard ||
            skill.style === 'spell' ||
            this._isMagicParryContext() ||
            /ward|barrier|shield|arcane|magic|holy/.test(
              String(skill.id || '') + String(skill.label || '')
            );
          playParrySfx({ magic });
        } catch (_) {}
      } else if (animRole === 'dodgeB' || /evade/i.test(skill.id + skill.label)) {
        this.character.playDodge?.('back') || this.character.requestOneShot?.('dodgeB');
      } else if (/^attack[123]$/.test(animRole)) {
        this.character.requestOneShot?.(animRole) ||
          this.character.playMeleeComboLight?.() ||
          this.character.playWeaponAttack?.();
      } else if (animRole === 'finisher' || animRole === 'finisherAir') {
        this.character.playMeleeFinisher?.({
          airborne: animRole === 'finisherAir' || !!this._airborne
        });
      } else if (skill.style === 'ranged' || animRole === 'attack') {
        this.character.playWeaponCombat?.('attack') ||
          this.character.requestOneShot?.('attack') ||
          this.character.playWeaponAttack?.();
      } else if (skill.style === 'melee') {
        this.character.playMeleeAttack?.({
          airborne: !!this._airborne || !this._grounded,
          largeMmTowardTarget: this._isLargeMmTowardTarget?.()
        }) ||
          this.character.playWeaponCombat?.('attack') ||
          this.character.playWeaponAttack?.() ||
          this.character.requestOneShot?.('attack');
      } else {
        this.character.playWeaponCombat?.('cast') ||
          this.character.requestOneShot?.(animRole || skill.animRole) ||
          this.character.playCastFlourish?.();
      }
      releaseSpell();
      return true;
    }

    const el = skill.element || skill.abilityElement || 'arcane';
    const staffNormal = isStaffNormalAttack(skill) || skill.style === 'spell';
    this._beginCast({
      label: skill.label,
      duration: castDur,
      element: el,
      interruptible: true,
      aim: aimPt,
      onComplete: releaseSpell,
      showCharge: staffNormal,
      chargeMeshUrl: skill.chargeMeshUrl || STAFF_CHARGE_MESH,
      skill
    });
    this.onToast(
      staffNormal
        ? `${skill.label} · normal · charge → orb`
        : `${skill.label} · cast ${castDur.toFixed(1)}s`
    );
    return true;
  }

  /** Skills while on windsurf: staff / bow packs only (settings.walk.skillsWhileRide). */
  _allowRideSkill() {
    if (settings.walk?.skillsWhileRide === false) return false;
    const pack = this.character.animPackId || '';
    return pack === 'longbow' || pack === 'magic' || pack.includes('bow') || pack.includes('magic');
  }

  /**
   * @deprecated Use useWeaponSkillF — F is weapon skill, not residual-only strike.
   * Kept for callers; routes to weapon skill path.
   */
  useMeleeStrike() {
    return this.useWeaponSkillF();
  }

  /**
   * Large MM toward focus/aim: sprinting into aim or recent forward mobility impulse.
   * Threshold from settings.meleeCombo.finisherMm (100 MM = 1 m).
   */
  _isLargeMmTowardTarget() {
    const thrMm = settings.meleeCombo?.finisherMm ?? 280;
    // Active dodge/lunge already large
    if (this._dodgeT > 0 && this._dodgeVel.lengthSq() > 1e-6) {
      const speed = this._dodgeVel.length();
      const estMm = mToMm(speed * Math.max(this._dodgeDur, 0.2));
      if (estMm >= thrMm * 0.55) return true;
    }
    // Sprint while moving roughly toward aim / focus
    if (!this._sprinting) return false;
    if (this.aim?.valid) {
      _fwd.copy(this.aim.forward);
    } else {
      this.camera.getWorldDirection(_fwd);
    }
    _fwd.y = 0;
    if (_fwd.lengthSq() < 1e-6) return false;
    _fwd.normalize();
    // Body forward vs aim
    const yaw = this.character.facing;
    const bx = Math.sin(yaw);
    const bz = Math.cos(yaw);
    const align = bx * _fwd.x + bz * _fwd.z;
    if (align < 0.55) return false;
    // Sprint speed as continuous MM (sprint ≈ 3.6*1.65 m/s → ~594 MM/s)
    const sprintMps = this.moveSpeed * this.sprintMul;
    const continuousMm = mToMm(sprintMps * 0.55);
    return continuousMm >= thrMm * 0.5 && (this._moveZ > 0.35 || align > 0.85);
  }

  /**
   * Melee residual at attack apex + weapon-tip trail during the swing.
   * Trail samples tip each frame; at hitFrameDelay (apex) fires:
   *   getsuga_slash · fire-style blur path · physics residual past blade.
   * Combo: each attack1/2/3 / finisher calls this again → apex per hit.
   *
   * @param {import('./drcSkills.js').DrcWeaponSkill} skill
   * @param {{ origin: Vector3, forward: Vector3 }} pose
   * @param {{ rangeOverride?: number, hit?: { kind?: string, step?: number } }} [opts]
   */
  _fireMeleeResidual(skill, pose, opts = {}) {
    const prim = residualFromSettings();
    if (settings.residual?.enabled === false) return;

    const range = opts.rangeOverride ?? prim.range ?? skill.rangeM ?? 3.2;
    const hitFrameDelay = prim.hitFrameDelay ?? settings.residual?.hitFrameDelay ?? 0.18;
    const step = opts.hit?.step;
    // Combo lights: slightly shorter trail; finishers longer + fire blur
    const isFin =
      opts.hit?.kind === 'finisher' ||
      opts.hit?.kind === 'finisherAir' ||
      skill.animRole === 'finisher';
    const trailDur =
      (settings.residual?.trailDuration ?? 0.34) *
      (isFin ? 1.25 : step === 2 ? 1.1 : 1);
    const fireBlur =
      settings.residual?.fireTrail !== false &&
      (isFin || settings.residual?.fireTrail === true);

    let fwd = pose.forward?.clone?.() || new Vector3(0, 0, 1);
    if (typeof this.character.getWeaponForward === 'function') {
      this.character.getWeaponForward(_fwd);
      if (_fwd.lengthSq() > 1e-8) fwd = _fwd.clone().normalize();
    }

    // Prefer tip-trail system (ribbon + apex projectile). Fallback to legacy timeout.
    if (this.tipTrail?.beginSwing) {
      this.tipTrail.beginSwing({
        duration: trailDur,
        hitFrameDelay,
        forward: fwd,
        skill,
        hit: opts.hit || {
          kind: isFin ? 'finisher' : 'light',
          step: Number.isFinite(step) ? step : 0
        },
        rangeM: range,
        fireBlur,
        color: fireBlur
          ? settings.residual?.trailColor || '#ff6a22'
          : settings.residual?.color || '#7dd3fc',
        beyondBladeM: settings.residual?.beyondBladeM ?? 0.38,
        width:
          (settings.residual?.trailWidth ?? 0.14) *
          (isFin ? 1.35 : 1 + (Number(step) || 0) * 0.08)
      });
      return;
    }

    // Legacy fallback (no scene / tipTrail)
    const delayMs = Math.max(0, hitFrameDelay * 1000);
    const intensity =
      (prim.intensity ?? 1) *
      (settings.effect?.intensity ?? 1) *
      (isFin ? 1.25 : 1);
    const fire = () => {
      const tipOff = prim.tipOffset ?? settings.residual?.tipOffset ?? 0.55;
      if (typeof this.character.getWeaponTip === 'function') {
        this.character.getWeaponTip(_tip, tipOff);
      } else {
        this.character.getCastOrigin(_tip);
        _tip.addScaledVector(fwd, tipOff);
      }
      const beyond = settings.residual?.beyondBladeM ?? 0.38;
      _tip.addScaledVector(fwd, beyond);
      const pathRange = MathUtils.clamp(range, 1, 10);
      _end.copy(_tip).addScaledVector(fwd, pathRange);
      _end.y = Math.max(0.12, _tip.y * 0.4);
      _mid.lerpVectors(_tip, _end, 0.45);
      _mid.y = Math.max(_tip.y, _mid.y) + pathRange * 0.04;
      const curve = new CatmullRomCurve3(
        [_tip.clone(), _mid.clone(), _end.clone()],
        false,
        'catmullrom',
        0.5
      );
      this.vfx?.deploy?.('getsuga_slash', {
        origin: _tip.clone(),
        forward: fwd.clone(),
        aim: _end.clone(),
        fromTip: true,
        intensity,
        aoe: prim.aoe,
        size: prim.size,
        speed: prim.speed,
        color: prim.color
      });
      try {
        playForImpact(fireBlur ? 'fire' : skill?.element, {
          skill,
          kind: fireBlur ? 'fire' : 'residual'
        });
      } catch (_) {}
      if (settings.residual?.enabled !== false) {
        const el = fireBlur ? 'fire' : this.abilities.selected || 'storm';
        this.abilities.cast(curve, el);
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
    // Prefer 3D focus launch, else horizontal mouse aim
    if (
      settings.aim?.use3dLaunch !== false &&
      this.aim?.forward3d &&
      this.aim.forward3d.lengthSq() > 1e-6
    ) {
      _fwd.copy(this.aim.forward3d).normalize();
    } else if (this.aim?.valid) {
      _fwd.copy(this.aim.forward);
    } else {
      const yaw = this.character.facing;
      _fwd.set(Math.sin(yaw), 0, Math.cos(yaw));
    }
    if (this.aim?.hitPoint && this.aim.valid) {
      // Path endpoint uses true 3D hit for elevated / soft-lock aims
      _end.copy(this.aim.hitPoint);
      _mid.lerpVectors(_origin, _end, 0.45);
      _mid.y += Math.min(2.2, _origin.distanceTo(_end) * 0.08);
      return new CatmullRomCurve3([_origin.clone(), _mid.clone(), _end.clone()]);
    }
    _end.copy(_origin).addScaledVector(_fwd, rangeM);
    _end.y = Math.max(0.15, _origin.y * 0.35);
    _mid.lerpVectors(_origin, _end, 0.5);
    _mid.y = Math.max(_origin.y, _mid.y) + rangeM * 0.06;

    const pts = [_origin.clone(), _mid.clone(), _end.clone()];
    return new CatmullRomCurve3(pts, false, 'catmullrom', 0.5);
  }

  /**
   * Curve shaped by kit pathMode (stream · aoe · spikes · wall).
   * @param {'stream'|'aoe'|'spikes'|'wall'} pathMode
   * @param {number} rangeM
   */
  _curveForPathMode(pathMode, rangeM) {
    const mode = pathMode || 'stream';
    if (mode === 'aoe') {
      // Short hop into aim point — FireAbility / impact place
      this.character.getCastOrigin(_origin);
      if (this.aim?.valid) _fwd.copy(this.aim.forward);
      else _fwd.set(Math.sin(this.character.facing), 0, Math.cos(this.character.facing));
      _end.copy(_origin).addScaledVector(_fwd, Math.min(rangeM, 4.5));
      _end.y = Math.max(0.12, _origin.y * 0.25);
      _mid.copy(_end).add(new Vector3(0, 0.9, 0));
      const start = _end.clone().add(new Vector3(0.05, 1.1, 0.05));
      return new CatmullRomCurve3([start, _mid.clone(), _end.clone()], false, 'catmullrom', 0.5);
    }
    if (mode === 'wall') {
      // Wider lateral stroke for barrier feel
      this.character.getCastOrigin(_origin);
      if (this.aim?.valid) _fwd.copy(this.aim.forward);
      else _fwd.set(Math.sin(this.character.facing), 0, Math.cos(this.character.facing));
      const right = new Vector3(-_fwd.z, 0, _fwd.x);
      const len = Math.max(rangeM * 0.85, 8);
      const a = _origin.clone().addScaledVector(right, -len * 0.35).addScaledVector(_fwd, 1.2);
      const b = _origin.clone().addScaledVector(_fwd, len * 0.55);
      const c = _origin.clone().addScaledVector(right, len * 0.35).addScaledVector(_fwd, 1.2);
      a.y = b.y = c.y = Math.max(0.15, _origin.y * 0.3);
      return new CatmullRomCurve3([a, b, c], false, 'catmullrom', 0.5);
    }
    if (mode === 'spikes') {
      // Medium ground-hugging path
      const curve = this._aimCurve(Math.min(rangeM, 10));
      const pts = curve.getPoints(4).map((p, i) => {
        const q = p.clone();
        q.y = 0.12 + i * 0.08;
        return q;
      });
      return new CatmullRomCurve3(pts, false, 'catmullrom', 0.5);
    }
    // stream — full range arc
    return this._aimCurve(rangeM);
  }

  /**
   * Switch 10-spell kit page for 1–4 bar (0=1–4, 1=5–8, 2=9–10).
   * @param {number} page
   */
  setSpellKitPage(page) {
    setSkillKitPage(page);
    this.skills = getActiveSkills();
    this.onToast(`Spell kit page ${page + 1}/3 · ${this.skills.map((s) => s.label).join(' · ')}`);
    return this.skills;
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
    // Mobility utilities blocked on board; combat skills ok if ride skill allowed
    if (this.character._rideActive) {
      if (actionId === 'dodge' || actionId === 'parry' || actionId === 'block') return false;
      if (!this._allowRideSkill() && actionId !== 'mode') return false;
    }

    switch (actionId) {
      case 'primary':
      case 'interact':
      case 'fskill':
        // Weapon skill F (cast bar + prefab) — pickup/harvest handled in App before this
        return this.useWeaponSkillF();
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
        // E = block / guard (fleet SSOT). C = parry.
        return this._utilityAction('block', 0.4, settings.drc?.parryStamina ?? 4, () => {
          this.character.playParry?.() || this.character.requestOneShot?.('block');
          try {
            playParrySfx({ magic: this._isMagicParryContext() });
          } catch (_) {}
          this.onToast('Block (E)');
        });
      case 'heavy':
        // Heavy = same weapon skill path for now (class ability later)
        return this.useWeaponSkillF();
      case 'kick':
        return this._utilityAction('kick', 0.9, 6, () => {
          this.character.playWeaponAttack?.();
          this.onToast('Kick (V)');
        });
      case 'heal':
        return this._utilityAction('heal', 4.0, 0, () => {
          this.stamina = Math.min(this.maxStamina, this.stamina + 35);
          try {
            playHealSfx();
          } catch (_) {}
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
          // Lab: brief self-burn so soft burn loop is audible (status-driven, not impact SFX)
          try {
            this.statuses?.applyHit?.({
              target: { id: 'player', kind: 'player' },
              skill: {
                id: 'bomb',
                element: 'fire',
                damage: 8,
                statuses: [{ id: 'burn', durationSec: 4.0, magnitude: 3 }]
              },
              hit: { element: 'fire' },
              character: this.character,
              applyToPlayer: true
            });
          } catch (_) {}
          this.vfx?.deploy?.('inferno', {
            origin,
            forward: _fwd.clone(),
            intensity: 1.1
          });
          this.onToast('Bomb (H) · burning');
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
    if (actionId === 'fskill' || actionId === 'interact' || actionId === 'primary') {
      const fs = skillForFKey();
      return fs ? this.cooldown01(fs.id) : 0;
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
   * Edge-detect double-tap A/D/W for left/right/forward dodge (not while Ctrl).
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
   * Ctrl alone = roll (Ghost Rider).
   * Ctrl+A/D/W/S = roll that direction; Ctrl tap with no dir = forward roll.
   * Not active while Shift held (that channel is slide).
   * @param {Set<string>} keys
   * @param {boolean} ctrlHeld
   */
  _pollCtrlRoll(keys, ctrlHeld) {
    if (this._dodgeT > 0) return;
    // Shift+Ctrl = slide — never roll while sprinting
    if (this._sprinting) {
      this._rollKeyWas = { KeyA: false, KeyD: false, KeyW: false, KeyS: false, Control: false };
      return;
    }
    if (!ctrlHeld) {
      this._rollKeyWas = { KeyA: false, KeyD: false, KeyW: false, KeyS: false, Control: false };
      return;
    }
    const pairs = [
      ['KeyA', 'left'],
      ['KeyD', 'right'],
      ['KeyW', 'forward'],
      ['KeyS', 'back']
    ];
    let dirPressed = false;
    for (const [code, dir] of pairs) {
      const down = keys.has(code);
      const was = !!this._rollKeyWas[code];
      if (down && !was) {
        this.roll(dir);
        dirPressed = true;
      }
      this._rollKeyWas[code] = down;
    }
    // Ctrl edge with no direction key → forward roll
    const ctrlEdge = ctrlHeld && !this._ctrlWasDown;
    if (ctrlEdge && !dirPressed) {
      const anyDir =
        keys.has('KeyA') ||
        keys.has('KeyD') ||
        keys.has('KeyW') ||
        keys.has('KeyS') ||
        keys.has('ArrowLeft') ||
        keys.has('ArrowRight') ||
        keys.has('ArrowUp') ||
        keys.has('ArrowDown');
      if (!anyDir) this.roll('forward');
    }
  }

  /**
   * Shift (sprint hold) + tap Ctrl → running slide.
   * @param {Set<string>} keys
   * @param {boolean} ctrlHeld
   */
  _pollSlide(keys, ctrlHeld) {
    if (this._dodgeT > 0) return;
    if (!this._sprinting) return;
    const ctrlEdge = ctrlHeld && !this._ctrlWasDown;
    if (ctrlEdge) this.slide();
  }

  /**
   * World impulse basis from aim/facing (matches move).
   * After A/D invert: left = +right basis of pre-invert, so use same
   * inverted mapping as locomotion (A moves +ix → +right of pre-fix basis).
   * For rolls we want semantic left/right of look: left = −right_vec.
   */
  _mobilityBasis() {
    if (this.aim?.valid && settings.aim?.enabled !== false) {
      _fwd.copy(this.aim.forward);
    } else {
      const yaw = this.character.facing;
      _fwd.set(Math.sin(yaw), 0, Math.cos(yaw));
    }
    const rx = _fwd.z;
    const rz = -_fwd.x;
    return { fx: _fwd.x, fz: _fwd.z, rx, rz };
  }

  /**
   * @param {'left'|'right'|'forward'|'back'} dir
   * @param {number} dist
   * @param {number} dur
   */
  _startMobilityImpulse(dir, dist, dur) {
    const { fx, fz, rx, rz } = this._mobilityBasis();
    // Match inverted A/D feel: "left" follows corrected A (screen-left of look)
    // Corrected A moves with +ix on inverted keys = +right of old basis = what
    // players call left after fix. Use semantic: left = −right of aim.
    let wx = 0;
    let wz = 0;
    if (dir === 'forward') {
      wx = fx;
      wz = fz;
    } else if (dir === 'back') {
      wx = -fx;
      wz = -fz;
    } else if (dir === 'left') {
      // Match walk A after invert: A uses ix=+1 → +right of aim basis
      wx = rx;
      wz = rz;
    } else {
      // right matches walk D after invert
      wx = -rx;
      wz = -rz;
    }
    const speed = dist / Math.max(0.12, dur);
    this._dodgeVel.set(wx * speed, 0, wz * speed);
    this._dodgeT = dur;
    this._dodgeDur = dur;

    // MM dash bounce — grounded hop so the dash clears terrain lips
    const bounceVy = settings.drc?.dashBounceVy ?? 0;
    if (bounceVy > 0 && this.physics?.ready && this._usePhysics && this._grounded) {
      this.physics.jump(bounceVy);
    }
  }

  /**
   * Directional dodge (AA/DD/WW double-tap · X back).
   * Uses motion-math (MM) distance profiles: AA/DD lateral = 3× baseline (7.2 m).
   * Spawns wind-style mesh afterimages + full invuln for the dodge window.
   * @param {'left'|'right'|'forward'|'back'} dir
   */
  dodge(dir) {
    const d = dir === 'left' || dir === 'right' || dir === 'forward' || dir === 'back' ? dir : 'back';
    const stam = settings.drc?.dodgeStamina ?? 10;
    const cd = 0.75;
    return this._utilityAction(`dodge_${d}`, cd, stam, () => {
      this._cdUntil.set('dodge', this.elapsed + cd);
      this._cdMax.set('dodge', cd);

      const dist = dodgeDistanceM(d, settings.drc || {});
      const dur = settings.drc?.dodgeDuration ?? 0.42;
      this._startMobilityImpulse(d, dist, dur);

      // I-frames for entire MM dodge + afterimage window
      const inv = settings.drc?.dodgeInvuln;
      this.invuln = Math.max(this.invuln, inv > 0 ? inv : dur);

      // Path afterimage (trailing model copies) along the escape vector
      const origin = this.character.root?.position?.clone?.() || this.character.position?.clone?.();
      if (origin && this._dodgeVel.lengthSq() > 1e-6) {
        _fwd.set(this._dodgeVel.x, 0, this._dodgeVel.z).normalize();
        const src = this.character.model || this.character.root;
        this.vfx?.afterimage?.(src, origin, _fwd, dist, {
          count: settings.drc?.afterimage?.count ?? 6,
          life: Math.max(settings.drc?.afterimage?.life ?? 0.45, dur)
        });
      }

      const played = this.character.playDodge?.(d);
      const lat = d === 'left' || d === 'right';
      const labels = { left: 'AA left', right: 'DD right', forward: 'WW forward', back: 'X back' };
      this.onToast(
        `${labels[d] || d} dodge · ${dist.toFixed(1)}m MM` +
          `${lat ? ' ×3' : ''}` +
          `${played ? '' : ' (no clip)'}` +
          ' · invuln'
      );
    });
  }

  /**
   * Ghost Rider roll (Ctrl+A left · Ctrl+D right).
   * Impulse duration matches clip so feet travel with the tumble (no foot-slide deform).
   * @param {'left'|'right'|'forward'|'back'} dir
   */
  roll(dir) {
    const d = dir === 'left' || dir === 'right' || dir === 'forward' || dir === 'back' ? dir : 'back';
    const stam = settings.drc?.rollStamina ?? 12;
    const cd = 0.85;
    return this._utilityAction(`roll_${d}`, cd, stam, () => {
      this._cdUntil.set('roll', this.elapsed + cd);
      this._cdMax.set('roll', cd);
      const dist = settings.drc?.rollDistance ?? 3.0;
      // Sync body travel to clip length (Ghost Rider ~0.77s)
      const clipDur =
        this.character.getRollClipDuration?.(d) ?? settings.drc?.rollDuration ?? 0.55;
      const dur = Math.max(0.42, Math.min(1.1, clipDur * 0.98));
      const played = this.character.playRoll?.(d);
      const useDur =
        played && typeof played === 'object' && played.duration > 0 ? played.duration : dur;
      this._startMobilityImpulse(d, dist, useDur);
      // Side rolls keep aim facing (clip is lateral). F/B face the impulse.
      if ((d === 'forward' || d === 'back') && this._dodgeVel.lengthSq() > 1e-6) {
        this._yaw = Math.atan2(this._dodgeVel.x, this._dodgeVel.z);
        this.character.setFacing?.(this._yaw);
      }
      const labels = {
        left: 'Ctrl+A left roll',
        right: 'Ctrl+D right roll',
        forward: 'Ctrl+W roll',
        back: 'Ctrl+S roll'
      };
      const ok = played === true || played?.ok;
      this.onToast(`${labels[d] || d}${ok ? ' · Ghost Rider' : ' (no clip)'}`);
    });
  }

  /**
   * Sprint slide (Shift+Ctrl). Uses prod running-slide bake.
   */
  slide() {
    const stam = settings.drc?.slideStamina ?? 14;
    const cd = 1.1;
    return this._utilityAction('slide', cd, stam, () => {
      const dist = settings.drc?.slideDistance ?? 4.2;
      const dur = settings.drc?.slideDuration ?? 0.72;
      // Slide along current facing / sprint forward
      if (this.aim?.valid && settings.aim?.enabled !== false) {
        _fwd.copy(this.aim.forward);
      } else {
        const yaw = this.character.facing;
        _fwd.set(Math.sin(yaw), 0, Math.cos(yaw));
      }
      // Prefer last move dir if still holding WASD
      if (_move.lengthSq() > 1e-6) {
        _fwd.set(_move.x, 0, _move.z).normalize();
      }
      const speed = dist / Math.max(0.12, dur);
      this._dodgeVel.set(_fwd.x * speed, 0, _fwd.z * speed);
      this._dodgeT = dur;
      this._dodgeDur = dur;
      this._yaw = Math.atan2(_fwd.x, _fwd.z);
      this.character.setFacing?.(this._yaw);
      const played = this.character.playSlide?.();
      this.onToast(played ? 'Slide · running-slide' : 'Slide (no clip)');
    });
  }

  /**
   * Staff / wand / magic pack → magical parry SFX; otherwise metal parry.wav.
   * @returns {boolean}
   */
  _isMagicParryContext() {
    const pack = String(this.character?.animPackId || '').toLowerCase();
    if (pack.includes('magic') || pack.includes('staff') || pack.includes('wand')) return true;
    try {
      const w = typeof getEquippedWeapon === 'function' ? getEquippedWeapon() : null;
      const blob = `${w?.id || ''} ${w?.name || ''} ${w?.category || ''} ${w?.type || ''}`.toLowerCase();
      if (/staff|wand|tome|rod|scepter|magic|arcane|spell/.test(blob)) return true;
    } catch (_) {}
    const el = String(this.abilities?.selected || settings?.element || '').toLowerCase();
    if (['fire', 'ice', 'storm', 'holy', 'arcane', 'nature', 'water', 'earth', 'wind'].includes(el)) {
      // Path-cast elements imply magical frame for ward/parry when on magic kit only
      if (pack.includes('magic')) return true;
    }
    return false;
  }

  /**
   * True if a world-space attack point intersects the equipped weapon cylinder
   * (mesh-fit + 0.02 m pad). Used for defensive parry success vs incoming strike.
   * @param {import('three').Vector3} attackPoint
   * @param {number} [attackRadius=0.15]
   */
  weaponVolumeBlocks(attackPoint, attackRadius = 0.15) {
    const vol = this.character?.weaponVolume;
    if (!vol || !attackPoint) return false;
    return pointHitsWeaponVolume(vol, attackPoint, attackRadius);
  }

  /** Parry with block/parry clip. SFX fires on **attempt** (key press), not only success. */
  parry() {
    try {
      playParrySfx({ magic: this._isMagicParryContext() });
    } catch (_) {}
    const stam = settings.drc?.parryStamina ?? 8;
    return this._utilityAction('parry', 0.65, stam, () => {
      // Ensure mesh cylinder is fresh for defensive tests this window
      try {
        this.character.rebuildWeaponVolume?.({ debug: false });
      } catch {
        /* optional */
      }
      /** Parry active until — weaponVolumeBlocks(point) valid in this window */
      this._parryUntil = this.elapsed + (settings.drc?.parryWindowSec ?? 0.35);
      this.character.playParry?.() || this.character.requestOneShot?.('block');
      _fwd.set(Math.sin(this.character.facing), 0, Math.cos(this.character.facing));
      this.vfx?.deploy?.('arcane_swirl', {
        origin: this.character.position.clone(),
        forward: _fwd.clone(),
        intensity: 0.75
      });
      this.onToast(this._isMagicParryContext() ? 'Magic parry (C)' : 'Parry (C)');
    });
  }

  /**
   * Incoming attack vs weapon cylinder during parry window.
   * Called from SkillStatusSystem.applyHit + _onProjectileHit (player contact).
   * Success consumes the window (one clean block per C press).
   * @param {import('three').Vector3} attackPoint
   * @param {number} [attackRadius]
   */
  tryParryBlock(attackPoint, attackRadius = 0.18) {
    if (!this._parryUntil || this.elapsed > this._parryUntil) return false;
    if (!this.weaponVolumeBlocks(attackPoint, attackRadius)) return false;
    this._parryUntil = 0;
    this.vfx?.deploy?.('arcane_swirl', {
      origin: attackPoint.clone?.() || this.character.position.clone(),
      forward: _fwd.set(0, 1, 0),
      intensity: 1.1
    });
    this.onToast('Parried!');
    return true;
  }

  /**
   * Spend mana + stamina. Returns false and toasts if short.
   * @param {number} mana
   * @param {number} stamina
   * @param {string} [label]
   */
  _spendResources(mana, stamina, label = 'Cast') {
    const needM = Math.max(0, mana | 0);
    const needS = Math.max(0, stamina | 0);
    if (this.mana < needM) {
      this.onToast(`Low mana · need ${needM}`);
      return false;
    }
    if (this.stamina < needS) {
      this.onToast(`Low stamina · need ${needS}`);
      return false;
    }
    this.mana -= needM;
    this.stamina -= needS;
    return true;
  }

  /**
   * Staff / combat path cast: classify stroke → aoe | spikes | wall | stream.
   * Costs mana+stamina scaled by LMB hold + path length (cast intensity).
   * @param {import('three').CatmullRomCurve3} curve
   * @param {number} length
   * @param {number} [holdSec]
   * @returns {{ kind: string, element: string, intensity?: number }|null}
   */
  castPathAbility(curve, length, holdSec = 0) {
    if (!curve) return null;
    if (!this.inCombat) {
      this.onToast('Enter combat (Q) to cast');
      return null;
    }
    const sc = settings.staffCast || {};
    if (sc.enabled === false) {
      const costs = pathCastCosts(holdSec, length, 'stream', this.abilities.selected);
      if (!this._spendResources(costs.mana, costs.stamina, 'Cast')) return null;
      this.lastCastIntensity = costs.intensity;
      this.abilities.cast(curve);
      return { kind: 'stream', element: this.abilities.selected, intensity: costs.intensity };
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

    const costs = pathCastCosts(holdSec, length, kind, element);
    if (!this._spendResources(costs.mana, costs.stamina, 'Path cast')) return null;
    this.lastCastIntensity = costs.intensity;
    const intensity = costs.intensity;
    // Cast time scales with hold (min 0.35s, max 1.6s) — bar + cast anim before release
    const pathCastTime = MathUtils.clamp(0.35 + holdSec * 0.35 + length * 0.02, 0.35, 1.6);
    const endPt = curve.getPoint(1);
    const aimPt = { x: endPt.x, y: endPt.y + 0.2, z: endPt.z };
    const labels = { aoe: 'AOE place', spikes: 'Spikes', wall: 'Wall', stream: 'Stream' };

    const releasePath = () => {
      const sig = signatureForElement(element === 'arcane' ? 'arcane' : element);
      if (intensity >= 2.4 && sig) {
        this.vfx?.deploy?.(sig.impactEffectId, {
          origin: this.character.position.clone(),
          forward: _fwd.set(Math.sin(this.character.facing), 0, Math.cos(this.character.facing)).clone(),
          intensity: intensity * 0.85
        });
      }
      const facing = _fwd.set(Math.sin(this.character.facing), 0, Math.cos(this.character.facing)).clone();
      const pathPose = {
        origin: this.character.position.clone(),
        forward: facing,
        aim: curve.getPoint(1),
        intensity
      };
      if (kind === 'aoe') {
        const end = curve.getPoint(1);
        const mid = end.clone();
        mid.y += 0.4;
        const start = end.clone().add(new Vector3(0.01, 0.8, 0.01));
        const short = new CatmullRomCurve3([start, mid, end], false, 'catmullrom', 0.5);
        this.abilities.select(element);
        this.abilities.cast(short, element);
        this.vfx?.deployPresentation?.(element, { ...pathPose, aim: end.clone() }, {
          pathKind: 'aoe',
          meteor: element === 'fire' && intensity >= 2.2
        });
      } else {
        this.abilities.select(element);
        this.abilities.cast(curve, element);
        this.vfx?.deployPresentation?.(element, pathPose, {
          pathKind: kind,
          meteor: kind === 'stream' && element === 'fire' && intensity >= 2.4,
          volley: kind === 'stream' && (element === 'fire' || element === 'arcane'),
          shield: kind === 'wall' && element === 'storm'
        });
      }
      const sigName = intensity >= 2.4 && sig ? ` · ${sig.label}` : '';
      this.onToast(
        `Staff · ${labels[kind]} (${element}) · ×${intensity.toFixed(1)} · −${costs.mana}MP −${costs.stamina}STA${sigName}`
      );
    };

    if (this._cast) this._interruptCast('replaced', false);
    this._beginCast({
      label: `${labels[kind]} · ${element}`,
      duration: pathCastTime,
      element,
      interruptible: true,
      aim: aimPt,
      onComplete: releasePath
    });
    return { kind, element, intensity, mana: costs.mana, stamina: costs.stamina, castTime: pathCastTime };
  }
}
