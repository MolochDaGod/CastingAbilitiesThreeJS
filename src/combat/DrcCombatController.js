import { CatmullRomCurve3, MathUtils, Quaternion, Vector3 } from 'three';
import {
  loadAttributeCatalog,
  computeDerivedStats,
  defaultAllocForClass,
  resolveCombatDamage,
  applyHpDamage
} from './attributeStats.js';
import {
  getActiveSkills,
  getActiveSkillTree,
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
import { dodgeDistanceM, kiteDistanceM, mmToM, mToMm } from './motionMath.js';
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
import {
  isStaffNormalAttack,
  STAFF_NORMAL_ATTACK,
  staffProjectileMeshUrl
} from '../vfx/staffOrbVfx.js';
import { inferElementAttackKind } from '../vfx/elementAttackVfx.js';
import { inferProjectileFamily } from '../vfx/projectileSaves.js';
import { forEachVolleyShot, applyYawToForward, compileProjectileLearn } from '../vfx/projectileLearn.js';
import {
  isPistolBulletSkill,
  pistolBulletCount,
  PISTOL_BULLET
} from '../vfx/pistolBulletVfx.js';
import {
  FLINTLOCK_FIRE,
  FLINTLOCK_RELOAD,
  PISTOL_SOFT_LOCK,
  PISTOL_HAND_IK,
  pistolHitFrameSec
} from '../config/pistolAnimSsot.js';
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
  fireLinearFromPlan,
  hitFrameDelaySec
} from './elementalLinearCast.js';
import { SkillStatusSystem } from './skillStatusSystem.js';
import { WeaponTipTrailSystem } from '../vfx/weaponTipTrail.js';
import { pointHitsWeaponVolume } from '../character/weaponMeshCollider.js';
import { getBackWaterBuffs } from '../config/backSlotMobilitySsot.js';
import { WORLD } from '../config/worldScale.js';
import { pickMoveOctant, RIFLE_HAND_IK } from '../config/rifleAnimSsot.js';
import {
  classifyBendingPattern,
  resolveSkillSpline,
  shockwaveElementOf,
  nearestTotemWorldPos,
  skillWantsSpline,
  skillWantsHealSpline
} from '../vfx/bendingSkillAttach.js';
import { getEffectVariant } from '../vfx/effectVariants.js';
import { applyPullToward } from './hitReaction.js';
import {
  resolvePlayerClass,
  compileClassSkill,
  getClassLoadout
} from './classAbilities.js';

const _origin = new Vector3();
const _tip = new Vector3();
const _fwd = new Vector3();
const _tiltQ = new Quaternion();
const _upZ = new Vector3(0, 0, 1);
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
     * Learned paint = LMB PathTrail (tail / slash / special).
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
            abilities: this.abilities,
            getTargets: () => this._collectHitTargets()
          })
        : null);
    if (this.projectiles && this.tipTrail) this.projectiles.tipTrail = this.tipTrail;
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

    this.moveSpeed = settings.drc?.moveSpeed ?? 7.2;
    this.sprintMul = settings.drc?.sprintMul ?? 1.9;
    this._moveX = 0;
    this._moveZ = 0;
    /** Combat-style XZ momentum (accel 18 / 14) */
    this._vx = 0;
    this._vz = 0;
    this._sprinting = false;
    /** Toggle-sprint latch (when settings.controls.sprintToggle) */
    this._sprintLatched = false;
    /**
     * Backtick (`) auto run / freeride sail — holds forward + sprint until toggled off.
     * Same intent as Multiverse mvAutoTraverse.
     */
    this._autoTraverse = false;
    /** Harvest RMB walk-to — world XZ, cancelled by WASD */
    this._approach = null;
    this._wasShiftDown = false;
    this._yaw = 0;
    this._usePhysics = true;

    /** Jump state machine */
    this._jumpsLeft = settings.drc?.maxJumps ?? 2;
    this._wasJumpDown = false;
    this._grounded = true;
    this._airborne = false;
    /** After landing, LMB still uses jump-attack for a short window */
    this._justLandedUntil = 0;
    this._jumpDashUntil = 0;
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

    this.attrAlloc = defaultAllocForClass('warrior');
    this.derivedStats = computeDerivedStats(this.attrAlloc);
    void loadAttributeCatalog().then(() => {
      this.derivedStats = computeDerivedStats(this.attrAlloc);
      const hp = this.derivedStats.health || 100;
      this.maxHp = hp;
      if (this.hp == null) this.hp = hp;
      if (this.derivedStats.stamina > 0) {
        this.maxStamina = this.derivedStats.stamina;
        this.stamina = Math.min(this.stamina ?? this.maxStamina, this.maxStamina);
      }
      if (this.derivedStats.mana > 0) {
        this.maxMana = this.derivedStats.mana;
        this.mana = Math.min(this.mana ?? this.maxMana, this.maxMana);
      }
    });
    this._airTiltOn = false;
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
    return !!this.getBackWaterBuffs().sharkAggroImmune || this.isStealthed;
  }

  /** Ranger invis — hidden from players, monsters, bosses. */
  get isStealthed() {
    return (
      !!this.character?.userData?.hiddenFromSight ||
      !!this.statuses?.hasStatus?.('player', 'stealth')
    );
  }

  get hiddenFromSight() {
    return this.isStealthed;
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
    this.character.physics = physics;
    if (typeof physics?.landHeightAt === 'function') {
      this.setHeightSample(physics.landHeightAt);
    }
  }

  /**
   * Apply CCT pose as feet plant (Vector3 + Matrix4) — never root.y = pose.y.
   * pose.y from PhysicsWorld.movePlayer is already capsule feet.
   */
  _applyFeetPose(pose) {
    if (!pose || !this.character) return;
    this.character.placeAt(pose.x, pose.y, pose.z);
  }

  /**
   * Same L0 height sample as Rapier / aim / FootIK.
   * @param {(x:number,z:number)=>number|null} fn
   */
  setHeightSample(fn) {
    this.heightSample = typeof fn === 'function' ? fn : null;
    this.character?.setHeightSample?.(this.heightSample);
    if (this.tipTrail) this.tipTrail.heightSample = this.heightSample;
    this.vfx?.setHeightSample?.(this.heightSample);
  }

  _landY(x, z) {
    const y = this.heightSample?.(x, z);
    return Number.isFinite(y) ? y : 0;
  }

  setVfx(vfx) {
    this.vfx = vfx;
    this.vfx?.setHeightSample?.(this.heightSample);
    if (this.tipTrail) this.tipTrail.vfx = vfx;
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
      const ly = this._landY(hit.point.x, hit.point.z);
      this.character.placeAt(hit.point.x, ly, hit.point.z);
      this.physics?.setPlayerFeet?.(hit.point.x, ly, hit.point.z);
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

    const isHostile = hit.target?.kind === 'hostile' || hit.target?.mesh?.userData?.trainingDummy;
    const applyToPlayer =
      hit.target?.kind === 'self' ||
      hit.target?.kind === 'player' ||
      hit.target?.id === 'player' ||
      !!hit.target?.applyToPlayer;

    // P0 defensive early-out (also enforced in SkillStatusSystem.applyHit):
    // invuln / C-parry weapon cylinder vs incoming projectile contact on player.
    if (applyToPlayer && hit.point) {
      if (this.isStealthed) {
        this.onToast?.('Unseen');
        return;
      }
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
            : skill.procs?.length
              ? skill.procs.filter((p) => (p.chance ?? 1) >= 1 || Math.random() < (p.chance ?? 1))
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
   * Living hostiles in range + optional aim point (projectile contact list).
   * @param {Vector3} [aimPoint]
   */
  _collectHitTargets(aimPoint) {
    const targets = [];
    const seen = new Set();
    const feet = this.character?.position;
    const list =
      feet && this.combatFocus?.listTargetsInRange
        ? this.combatFocus.listTargetsInRange(feet)
        : [];
    for (const t of list) {
      if (!t?.point) continue;
      const id = t.id || t.mesh?.uuid;
      if (id) seen.add(id);
      targets.push({
        id: id || 'hostile',
        point: t.point.clone ? t.point.clone() : t.point,
        mesh: t.mesh,
        kind: t.kind || 'hostile'
      });
    }
    const sel = this.combatFocus?.selectedTarget;
    if (sel?.point && !seen.has(sel.id)) {
      targets.push({
        id: sel.id,
        point: sel.point.clone ? sel.point.clone() : sel.point,
        mesh: sel.mesh,
        kind: sel.kind || 'hostile'
      });
    }
    if (aimPoint) {
      targets.push({
        id: 'aim',
        point: aimPoint.clone ? aimPoint.clone() : aimPoint,
        kind: 'aim'
      });
    }
    return targets;
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
    // Spine location (barrel / cast / tip) — skill.spinePoint when compiled
    if (typeof this.character.getWeaponSpinePoint === 'function' && skill?.spinePoint) {
      this.character.getWeaponSpinePoint(skill.spinePoint, _tip);
    } else if (typeof this.character.getWeaponTip === 'function') {
      const tipOff =
        this.character.animPackId === 'pistol' || this.character.animPackId === 'rifle'
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

    // Hostiles as projectile contact targets (all in range + aim)
    const targets = this._collectHitTargets(resolved.target);

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
          speed: phys.speed ?? 13,
          trail: enriched.trail,
          skill: enriched
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
          targets,
          trail: enriched.trail,
          skill: enriched
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
          targets,
          trail: enriched.trail,
          skill: enriched
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
      if (this.projectiles?.spawnUttvmAura && this.character) {
        void this.projectiles.spawnUttvmAura({
          origin: resolved.origin.clone(),
          element: el,
          mode: pattern === 'toggle_aura' ? 'loop' : 'cast',
          follow: pattern === 'around_target' || pattern === 'at_location' ? null : this.character,
          size: Math.max(1.5, phys.aoe ?? 1.7),
          life: phys.life,
          intensity: 1.1
        });
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
        const volley = enriched.projectileLearn?.volley;
        const count = Math.max(pistolBulletCount(enriched), volley?.count || 1);
        const speed = enriched.projectileSpeed || enriched.projectileLearn?.bolt?.speed || PISTOL_BULLET.speed;
        const meshUrl = enriched.projectileMeshUrl || PISTOL_BULLET.meshUrl;
        // Charged Shot: slightly longer hit-frame (wind-up already played)
        const chargeMul = Number(enriched._chargeMul) || 1;
        const hitSec =
          pistolHitFrameSec(enriched) *
          (chargeMul > 1.01 ? (settings.drc?.weaponCharge?.hitFrameMul ?? 1.15) : 1);
        const gapSec = volley?.gapSec ?? FLINTLOCK_FIRE.burstGapSec;
        const spreadRad = volley?.spreadRad ?? FLINTLOCK_FIRE.burstSpreadRad;
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
            meshUrl,
            trail: enriched.trail,
            skill: enriched
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
          speed: phys.speed ?? 14,
          trail: enriched.trail,
          skill: enriched
        });
        return enriched;
      }
      // Ice/water: staff normal = one orb. Bubbles only when that is the mesh kind.
      if (
        (el === 'ice' || el === 'frost' || el === 'water') &&
        this.projectiles.spawnBubbleStream &&
        !isStaffNormalAttack(enriched) &&
        inferElementAttackKind(enriched)?.kind === 'water_bubbles'
      ) {
        this.projectiles.spawnBubbleStream({
          origin: resolved.origin,
          target: resolved.target,
          forward: resolved.forward,
          count: 4,
          speed: phys.speed ?? 12,
          targets,
          trail: enriched.trail,
          skill: enriched
        });
        enriched._deliveryLabel = 'Water Bubbles';
        return enriched;
      }
      const saveFam = inferProjectileFamily(enriched);
      if (saveFam && this.projectiles.spawnProjectileSave) {
        void this.projectiles.spawnProjectileSave({
          family: saveFam,
          color: el,
          origin: resolved.origin,
          target: resolved.target,
          forward: resolved.forward,
          targets,
          skill: enriched
        });
        enriched._deliveryLabel = `${saveFam} · ${el} trail`;
        return enriched;
      }
      const meshUrl =
        enriched.projectileMeshUrl ||
        enriched.summonMeshUrl ||
        (isStaffNormalAttack(enriched) ? staffProjectileMeshUrl(el) : null);
      const orbSize =
        enriched.useOrbProjectile || isStaffNormalAttack(enriched)
          ? STAFF_NORMAL_ATTACK.projectileDiameterM
          : phys.size;
      const volley = enriched.projectileLearn?.volley;
      const bolt = enriched.projectileLearn?.bolt;
      const fireMesh = (fwd) => {
        void this.projectiles.spawn({
          origin: resolved.origin.clone(),
          target: resolved.target.clone(),
          forward: fwd,
          element: el,
          meshUrl,
          speed: phys.speed ?? bolt?.speed ?? 16,
          gravity: phys.gravity ?? bolt?.gravity,
          contactRadius: phys.contactRadius ?? 0.4,
          life: phys.life,
          force: phys.force,
          knockbackMm: phys.knockbackMm,
          knockupVy: phys.knockupVy,
          aoe: phys.aoe ?? bolt?.explosionSize,
          size: orbSize,
          targets,
          explodeOnHit: phys.explodeOnHit !== false,
          useOrbMaterials: true,
          trail: enriched.trail,
          skill: enriched
        });
      };
      if (volley?.count > 1) {
        forEachVolleyShot(volley, ({ yaw, delay }) => {
          const f = resolved.forward.clone();
          applyYawToForward(f, yaw);
          if (delay <= 0) fireMesh(f);
          else {
            setTimeout(() => {
              try {
                fireMesh(f);
              } catch {
                /* disposed */
              }
            }, Math.round(delay * 1000));
          }
        });
        enriched._deliveryLabel = `Bolt · volley ×${volley.count}`;
      } else {
        fireMesh(resolved.forward);
      }
    }
    return enriched;
  }

  update(dt, keys) {
    this.elapsed += dt;
    this.physics?.syncFollowMeshes?.();
    this.physics?.tickSplineVfx?.(dt);
    this.projectiles?.update?.(dt);
    this.tipTrail?.update?.(dt, this.elapsed);
    this.statuses?.update?.(this.elapsed);
    if (this.character?.userData?.hiddenFromSight && !this.statuses?.hasStatus?.('player', 'stealth')) {
      this._breakStealth(null);
    }
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
      this._vx = 0;
      this._vz = 0;
      const vx = this._dodgeVel.x;
      const vz = this._dodgeVel.z;
      if (this.physics?.ready && this._usePhysics) {
        const pose = this.physics.movePlayer(vx, vz, dt);
        this._applyFeetPose(pose);
        this._grounded = !!pose.grounded;
        this.character.setFootGrounded?.(this._grounded);
      } else {
        this.character.root.position.x += vx * dt;
        this.character.root.position.z += vz * dt;
        // Knock-up / jump Y still integrates during horizontal push
        this._integrateKinematicJump(dt, keys);
      }
      // Continuous model afterimage trail while MM dodge / invuln runs
      const src = this.character.model || this.character.root;
      const pos = this.character.root?.position;
      this.vfx?.update?.(dt);
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
      this._updateAirDiveTilt(dt);
      return;
    }

    // Fade leftover afterimages when not dodging
    this.vfx?.updateDodgeTrail?.(dt, false, null, null);
    this.vfx?.update?.(dt);
    this._updateAirDiveTilt(dt);

    // ── WASD locomotion (combat SaberGame) ───────────────────────────
    // Always camera-relative unless aim.tankWhenUnfocused.
    // Ctrl held: A/D reserved for roll · Shift = sprint
    const focusOn = !!this.combatFocus?.focusEnabled;
    const tank =
      !focusOn && settings.aim?.tankWhenUnfocused === true;
    let ix = 0;
    let iz = 0;
    const wasd =
      keys.has('KeyW') ||
      keys.has('KeyA') ||
      keys.has('KeyS') ||
      keys.has('KeyD') ||
      keys.has('ArrowUp') ||
      keys.has('ArrowLeft') ||
      keys.has('ArrowDown') ||
      keys.has('ArrowRight');
    if (wasd && this._approach) this.clearApproach();

    if (keys.has('KeyW') || keys.has('ArrowUp') || this._autoTraverse) iz -= 1;
    if ((keys.has('KeyS') || keys.has('ArrowDown')) && !this._autoTraverse) iz += 1;

    if (tank && !ctrlHeld) {
      const turnRate = settings.aim?.tankTurnSpeed ?? 2.6;
      let turn = 0;
      if (keys.has('KeyA') || keys.has('ArrowLeft')) turn += 1;
      if (keys.has('KeyD') || keys.has('ArrowRight')) turn -= 1;
      if (turn !== 0) {
        const yaw = this.character.facing + turn * turnRate * dt;
        this._yaw = yaw;
        this.character.setFacing(yaw);
      }
    } else if (!ctrlHeld) {
      if (keys.has('KeyA') || keys.has('ArrowLeft')) ix += 1;
      if (keys.has('KeyD') || keys.has('ArrowRight')) ix -= 1;
    }

    const len = Math.hypot(ix, iz);
    if (len > 1e-4) {
      ix /= len;
      iz /= len;
    }

    if (tank) {
      const yaw = this.character.facing;
      _fwd.set(Math.sin(yaw), 0, Math.cos(yaw));
    } else {
      this.camera.getWorldDirection(_fwd);
      _fwd.y = 0;
      if (_fwd.lengthSq() < 1e-6) _fwd.set(0, 0, 1);
      else _fwd.normalize();
    }

    const fx = _fwd.x;
    const fz = _fwd.z;
    const rx = fz;
    const rz = -fx;

    _move.set(0, 0, 0);
    if (tank) {
      _move.x = fx * -iz;
      _move.z = fz * -iz;
    } else {
      _move.x = fx * -iz + rx * ix;
      _move.z = fz * -iz + rz * ix;
    }
    if (_move.lengthSq() > 1e-6) _move.normalize();

    // Harvest RMB: walk in world XZ to node (same loco, not a second controller)
    if (this._approach && !wasd) {
      const pos = this.character?.root?.position || this.character?.position;
      if (pos) {
        const dx = this._approach.x - pos.x;
        const dz = this._approach.z - pos.z;
        const d = Math.hypot(dx, dz);
        const stop = this._approach.stopM ?? 1.6;
        if (d <= stop) {
          const arrived = this._approach.onArrive;
          this.clearApproach();
          arrived?.();
        } else {
          _move.set(dx, 0, dz).normalize();
          const yaw = Math.atan2(dx, dz);
          this._yaw = yaw;
          this.character.setFacing?.(yaw);
        }
      }
    }

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
    const wantX = moving ? _move.x * speed : 0;
    const wantZ = moving ? _move.z * speed : 0;
    const accel = moving ? 18 : 14;
    const blend = Math.min(1, dt * accel);
    this._vx += (wantX - this._vx) * blend;
    this._vz += (wantZ - this._vz) * blend;
    if (!moving && this._vx * this._vx + this._vz * this._vz < 0.04) {
      this._vx = 0;
      this._vz = 0;
    }
    let vx = this._vx;
    let vz = this._vz;

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
      this._applyFeetPose(pose);
      // Prefer physics vertical speed when available
      if (Number.isFinite(pose.vy)) sampleVy = pose.vy;
      else if (Number.isFinite(pose.velocityY)) sampleVy = pose.velocityY;
      else sampleVy = (pose.y - (this._lastPoseY ?? pose.y)) / Math.max(1e-4, dt);
      this._lastPoseY = pose.y;

      const wasGrounded = this._grounded;
      this._grounded = !!pose.grounded;
      this.character.setFootGrounded?.(this._grounded);
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
          this._justLandedUntil =
            this.elapsed + (settings.meleeCombo?.jumpAttack?.justLandedSec ?? 0.48);
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
    // Rifle: full 8-way octant. Other packs: L/R strafe when lateral wins.
    if (!this.character._gaitLocked && this._grounded) {
      const lat = _move.x * rx + _move.z * rz;
      const fwd = _move.x * fx + _move.z * fz;
      const octant = moving ? pickMoveOctant(fwd, lat) : null;
      let strafe = null;
      if (moving && (focusOn || this.character.animPackId === 'rifle')) {
        const absLat = Math.abs(lat);
        const absFwd = Math.abs(fwd);
        if (absLat > 0.28 && absLat >= absFwd * 0.55) {
          strafe = lat > 0 ? 'right' : 'left';
        }
      }
      if (!moving) {
        this.character.setGait?.(0, false, { aiming: focusOn });
      } else {
        this.character.setGait?.(this._sprinting ? 2 : 1, this._sprinting, {
          strafe,
          octant,
          aiming: focusOn
        });
      }
    } else if (!this._grounded && !this.character._gaitLocked) {
      // Air: keep last gait weight low — jump clip owns pose when present
      this.character.setGait?.(0, false, { aiming: focusOn });
    }

    this._syncGunHandAim(focusOn);
  }

  /**
   * Rifle two-hand / pistol one-hand IK toward aim. Other packs clear.
   * @param {boolean} focusOn
   */
  _syncGunHandAim(focusOn) {
    const ch = this.character;
    if (!ch?.setHandAim) return;
    const pack = ch.animPackId;
    if (pack !== 'rifle' && pack !== 'pistol') {
      ch.setHandAim(null, 0);
      return;
    }
    const ik = pack === 'pistol' ? PISTOL_HAND_IK : RIFLE_HAND_IK;
    const pt =
      (this.aim?.valid && this.aim.hitPoint) ||
      (this.aim?.valid && this.aim.point) ||
      null;
    const w = focusOn ? ik.aimWeight : ik.restWeight;
    if (pt) {
      ch.setHandAim(pt, w);
      return;
    }
    if (this.aim?.forward3d || this.aim?.forward) {
      const origin = ch.position || ch.root?.position;
      const dir = this.aim.forward3d || this.aim.forward;
      if (origin && dir) {
        _origin.copy(origin).addScaledVector(dir, 12);
        if (Number.isFinite(this.aim.forward3d?.y)) {
          /* keep 3d */
        } else {
          _origin.y += 1.35;
        }
        ch.setHandAim(_origin, w);
        return;
      }
    }
    ch.setHandAim(null, 0);
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

    if (settings.aim?.tankWhenUnfocused && !this.combatFocus?.focusEnabled) {
      this._yaw = this.character.facing;
      return;
    }
    if (settings.aim?.focusTurnOnlyWhenMoving && !moving) {
      this._yaw = this.character.facing;
      return;
    }

    this.camera.getWorldDirection(_fwd);
    _fwd.y = 0;
    if (_fwd.lengthSq() < 1e-6) return;
    _fwd.normalize();

    // Combat: RMB / focus → strafe-lock to camera heading; else face velocity
    const rmb = !!this.combatFocus?.rmbHeld || !!this.combatFocus?.focusEnabled;
    const spd2 = this._vx * this._vx + this._vz * this._vz;
    let targetYaw;
    if (rmb || !moving) {
      targetYaw = Math.atan2(_fwd.x, _fwd.z);
    } else if (spd2 > 0.25) {
      targetYaw = Math.atan2(this._vx, this._vz);
    } else {
      targetYaw = Math.atan2(_fwd.x, _fwd.z);
    }

    let cur = this.character.facing;
    let diff = targetYaw - cur;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;

    const turn = settings.aim?.focusTurnSpeed ?? 14;
    cur += diff * Math.min(1, dt * turn);
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
    if (this._autoTraverse) this.clearApproach();
    this.onToast?.(this._autoTraverse ? 'Auto RUN/SAIL ON (`)' : 'Auto OFF (`)');
    return this._autoTraverse;
  }

  /**
   * Walk in a straight line to world XZ (harvest RMB). WASD cancels.
   * @param {number} x
   * @param {number} z
   * @param {{ stopM?: number, onArrive?: () => void }} [opts]
   */
  setApproachTarget(x, z, opts = {}) {
    this._approach = {
      x,
      z,
      stopM: opts.stopM ?? 1.6,
      onArrive: typeof opts.onArrive === 'function' ? opts.onArrive : null
    };
  }

  clearApproach() {
    this._approach = null;
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
      {
        const feet = this.character.root?.position || this.character.position;
        this._airTrailFrom(
          feet,
          this._backflipDir,
          cfg.airTrail?.backflipLen ?? 3.6,
          'backflip'
        );
      }
      this.onToast?.('Backflip · hang · air trail');
      return;
    }

    if (isSecond && moving) {
      const yaw = this.character.facing;
      this._frontflipDir.set(Math.sin(yaw), 0, Math.cos(yaw));
      this._dodgeVel.set(this._frontflipDir.x * 8, 0, this._frontflipDir.z * 8);
      this._dodgeT = 0.7;
      this._dodgeDur = 0.7;
      this._hangT = Math.max(this._hangT || 0, 0.4);
      this.physics?.setGravityScale?.(0.5);
      this.character.playAirDash?.('forward');
      this._jumpsLeft -= 1;
      this._grounded = false;
      this._airborne = true;
      this.onToast?.('Air dash');
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
      {
        const feet = this.character.root?.position || this.character.position;
        const upFwd = this._frontflipDir.clone();
        upFwd.y = 0.55;
        this._airTrailFrom(feet, upFwd, cfg.airTrail?.jump2Len ?? 2.4, 'jump2');
      }
      this.onToast?.('Frontflip · 2nd jump air');
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
    const feet = this.character.root.position;
    const landY = this._landY(feet.x, feet.z);
    if (this._grounded && this._kinVy <= 0) {
      this.character.placeAt(feet.x, landY, feet.z);
      this._kinVy = 0;
      this._jumpsLeft = settings.drc?.maxJumps ?? 2;
      this._kinGravityScale = 1;
      this.character.setFootGrounded?.(true);
      return;
    }
    this._kinVy += g * dt;
    this.character.root.position.y += this._kinVy * dt;
    const hip = Number.isFinite(this.character._hipAboveFeet) ? this.character._hipAboveFeet : 0;
    const soleY = this.character.root.position.y - hip;
    if (soleY <= landY) {
      const impactVy = this._kinVy;
      const wasAir = !this._grounded || this._airborne;
      this.character.placeAt(feet.x, landY, feet.z);
      this._kinVy = 0;
      this._grounded = true;
      this._airborne = false;
      if (wasAir) {
        this._justLandedUntil =
          this.elapsed + (settings.meleeCombo?.jumpAttack?.justLandedSec ?? 0.48);
      }
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
      this._airborne = true;
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
    const skipAnim =
      opts.skipAnim ||
      opts.skill?._castPlan?.useLinear ||
      opts.skill?._castPlan?.usePathAbility;
    if (!skipAnim) {
      this._playSkillAnim(opts.skill);
    }
    // Linear owns its own muzzle. Charge orb is the ugly particle-bolt look.
    const showCharge =
      this._cast.showCharge && !opts.skill?._castPlan?.useLinear;
    if (showCharge && this.projectiles?.spawnCharge) {
      this._chargeOrigin = this._chargeOrigin || new Vector3();
      this._getChargeOrigin(this._chargeOrigin);
      void this.projectiles.spawnCharge({
        origin: this._chargeOrigin,
        element: this._cast.element,
        meshUrl: opts.chargeMeshUrl || STAFF_CHARGE_MESH,
        size: 0.32
      });
      if (this.projectiles.spawnUttvmAura && this.character) {
        void this.projectiles.spawnUttvmAura({
          origin: this.character.position.clone(),
          element: this._cast.element,
          mode: 'cast',
          follow: this.character,
          size: 1.7,
          intensity: 1.05
        });
      }
    }
    this.onCastBar?.(this.getCastBarState());
    return true;
  }

  /**
   * Catalog `animRole` (or animRoleForSkill) on the one mixer. No elemental flourish.
   * @param {object|null} skill
   */
  _playSkillAnim(skill) {
    if (!skill || !this.character) return;
    const animRole =
      skill.animRole ||
      animRoleForSkill(skill) ||
      (skill.style === 'ranged' ? 'attack' : skill.style === 'spell' ? 'cast' : 'attack');
    if (animRole === 'block' || animRole === 'parry' || skill.isWard) {
      this.character.playParry?.() ||
        this.character.requestOneShot?.('block') ||
        this.character.requestOneShot?.('parry');
      return;
    }
    if (skill.style === 'melee' && this._isJumpAttackWindow?.() && animRole !== 'dodgeB') {
      this.character.playMeleeFinisher?.({ airborne: true }) ||
        this.character.requestOneShot?.('jumpAttack');
      return;
    }
    if (animRole === 'dodgeB' || /evade/i.test(skill.id + skill.label)) {
      this.character.playDodge?.('back') || this.character.requestOneShot?.('dodgeB');
      return;
    }
    if (
      /^skill[1-5]$/.test(animRole) ||
      animRole === 'gunplay' ||
      animRole === 'draw' ||
      animRole === 'reload' ||
      animRole === 'spin'
    ) {
      this.character.requestOneShot?.(animRole) || this.character.playWeaponAttack?.();
      return;
    }
    if (/^attack[123]$/.test(animRole)) {
      this.character.requestOneShot?.(animRole) || this.character.playMeleeComboLight?.();
      return;
    }
    if (animRole === 'finisher' || animRole === 'finisherAir' || animRole === 'jumpAttack') {
      this.character.playMeleeFinisher?.({
        airborne: animRole !== 'finisher' || !!this._airborne
      });
      return;
    }
    if (skill.style === 'ranged' || animRole === 'attack') {
      this.character.requestOneShot?.(animRole) ||
        this.character.playWeaponCombat?.('attack') ||
        this.character.playWeaponAttack?.();
      return;
    }
    if (skill.style === 'melee') {
      this.character.playMeleeAttack?.({
        airborne: !!this._airborne || !this._grounded,
        justLanded: this.elapsed < (this._justLandedUntil || 0)
      }) || this.character.requestOneShot?.('attack');
      return;
    }
    this.character.requestOneShot?.(animRole) ||
      this.character.playWeaponCombat?.('cast') ||
      this.character.requestOneShot?.('cast');
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
   * Tap F — class starter. Pickup / harvest handled in App before this.
   * @returns {boolean}
   */
  useClassStarter() {
    return this.useClassAbility('f');
  }

  /**
   * Shift+1–5 or F starter. Plays ObjectStore class tree node via existing mixer / status.
   * @param {number|'f'} slot
   */
  useClassAbility(slot) {
    if (!this.inCombat) {
      this.onToast('Class skills need combat session (Shift+Q). Tap Q swaps weapons; hold Q is combat/harvest.');
      return false;
    }
    if (this._cast) {
      this.onToast('Already casting');
      return false;
    }
    const classId = resolvePlayerClass(this.character);
    const load = getClassLoadout(classId);
    const skillId = slot === 'f' || slot === -1 ? load.f : load.slots[Number(slot)];
    const skill = compileClassSkill(classId, skillId);
    if (!skill) {
      this.onToast('No class skill — I → Class');
      return false;
    }
    if (skill.passive) {
      this.onToast(`${skill.label} · passive`);
      return false;
    }
    const key = slot === 'f' || slot === -1 ? 'f' : `s${slot}`;
    const until = this._classCdUntil || (this._classCdUntil = {});
    if (this.elapsed < (until[key] || 0)) {
      this.onToast(`${skill.label} CD`);
      return false;
    }
    until[key] = this.elapsed + (Number(skill.cooldown) || 4);

    const hasTravel =
      skill.travelMode === 'linear' ||
      skill.travelMode === 'bend' ||
      skill.travelMode === 'bullet' ||
      (skill.style === 'melee' && skill.skillKind !== 'buff');
    const self =
      !hasTravel &&
      (skill.skillKind === 'buff' ||
        skill.target === 'self' ||
        skill.style === 'buff' ||
        skill.style === 'heal' ||
        skill.style === 'debuff');
    if (self) {
      this.statuses?.applyHit?.({
        skill,
        applyToPlayer: true,
        character: this.character,
        drc: this,
        hit: { damage: skill.style === 'heal' ? -(skill.granted?.healPercent || 0.1) * 40 : 0 }
      });
      this.character.playWeaponCombat?.('cast') || this.character.requestOneShot?.('cast');
      this.onToast(`${skill.label} · class`);
      if (skill.castEffectId) {
        this.vfx?.deploy?.(skill.castEffectId, {
          origin: this.character?.position,
          intensity: 0.85
        });
      }
      if (skillWantsHealSpline(skill)) {
        this.vfx?.attachNatureHealField?.(this.character, { duration: 6 });
      }
      return true;
    }
    return this.useSkill(-1, { skill, skipCharge: true });
  }

  /**
   * F key — equipped weapon skill (primary / Showcase bind `f`).
   * Full cast-time + prefab path. Not residual, not class ability.
   * @returns {boolean}
   */
  useWeaponSkillF() {
    if (!this.inCombat) {
      this.onToast('Combat session (Shift+Q) — tap Q swaps weapons for weapon skills');
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
      this.onToast('Combat session (Shift+Q) — tap Q swaps weapons to use weapon skills');
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
      this.onToast('Combat session (Shift+Q) — tap Q swaps weapons to use weapon skills');
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
    // Barrel must be in the hand — never fire from spine/hip stow
    this.character.weaponSheath?.unsheath?.('combat');

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

    // Tree owns hotkeys. Showcase localStorage binds are a HUD mirror only —
    // they must not replace the equipped production skill (or force animRole cast).
    const tree = getActiveSkillTree();
    const treeOwns = tree === 'equipped' || tree === 'wand' || tree === 'sapling';
    const bound =
      opts.bound !== undefined
        ? opts.bound
        : treeOwns
          ? null
          : getSkillBinding(slot === -1 ? 'f' : slot);
    const boundName = skill.label;

    // Staff bind enriches *this* catalog id (same skill) — never swaps a sword for a bolt.
    const staffId = skill.catalogSkillId || skill.id;
    const staffB =
      skill.style === 'spell'
        ? bindFromCatalogSkill({
            id: staffId,
            name: skill.label,
            description: skill.description || '',
            damageType: skill.damageType,
            effects: skill.effects,
            cooldown: skill.cooldown,
            castTime: skill.castDuration,
            range: skill.rangeM,
            damage: skill.damage,
            slotType: skill.slotType
          }) || staffBindFor(staffId)
        : null;
    if (staffB && !treeOwns) {
      skill = {
        ...skill,
        element: staffB.element,
        abilityElement: staffB.element,
        pathMode: staffB.pathMode,
        presentation: staffB.presentation,
        castEffectId: staffB.castEffectId || skill.castEffectId,
        travelEffectId: staffB.travelEffectId || skill.travelEffectId,
        impactEffectId: staffB.impactEffectId || skill.impactEffectId,
        abilityClass: staffB.abilityClass,
        animRole: skill.animRole || animRoleForSkill(skill) || 'cast',
        rangeM: staffB.rangeM || skill.rangeM,
        castDuration: staffB.castDuration || skill.castDuration,
        cooldown: staffB.cooldown || skill.cooldown,
        catalogSkillId: staffId,
        label: boundName || staffB.name || skill.label,
        description: staffB.description || skill.description,
        effects: staffB.effects || skill.effects,
        useOrbProjectile: staffB.useOrbProjectile ?? skill.useOrbProjectile,
        projectileMeshUrl: staffB.projectileMeshUrl || skill.projectileMeshUrl,
        chargeMeshUrl: staffB.chargeMeshUrl || skill.chargeMeshUrl
      };
    } else if (staffB && treeOwns && skill.style === 'spell') {
      skill = {
        ...skill,
        element: skill.element || staffB.element,
        abilityElement: skill.abilityElement || staffB.element,
        pathMode: skill.pathMode || staffB.pathMode,
        presentation: skill.presentation || staffB.presentation,
        castEffectId: skill.castEffectId || staffB.castEffectId,
        travelEffectId: skill.travelEffectId || staffB.travelEffectId,
        impactEffectId: skill.impactEffectId || staffB.impactEffectId,
        useOrbProjectile: skill.useOrbProjectile ?? staffB.useOrbProjectile,
        projectileMeshUrl: skill.projectileMeshUrl || staffB.projectileMeshUrl,
        chargeMeshUrl: skill.chargeMeshUrl || staffB.chargeMeshUrl
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
    const stealthCast =
      classifyBendingPattern(skill) === 'ranger_invis' ||
      /\binvis|stealth|smoke.?bomb/.test(`${skill.id} ${skill.label} ${(skill.effects || []).join(' ')}`);
    if (!stealthCast && Number(skill.damage) > 0 && this.isStealthed) {
      this._breakStealth('Invis broken');
    }
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
    // Wand / barrel tip — never snow-brawl chest + alternating L/R (that + a
    // leftover mesh AABB is what put Practice Bolt ~10 m left of the wand).
    if (typeof this.character.getWeaponSpinePoint === 'function') {
      this.character.getWeaponSpinePoint(skill?.spinePoint || skill?.startAnchor, _origin);
    } else if (typeof this.character.getWeaponTip === 'function') {
      this.character.getWeaponTip(_origin, settings.residual?.tipOffset ?? 0.55);
    } else {
      this.character.getCastOrigin(_origin);
    }
    let spawnOrigin = _origin.clone();
    {
      const feetW = this.character.getWorldPosition?.() || this.character.position;
      const dx = spawnOrigin.x - feetW.x;
      const dz = spawnOrigin.z - feetW.z;
      const horiz = Math.hypot(dx, dz);
      if (horiz > 1.8) {
        const s = 1.8 / horiz;
        spawnOrigin.x = feetW.x + dx * s;
        spawnOrigin.z = feetW.z + dz * s;
      }
    }
    let aimTarget = this.aim?.hitPoint?.clone?.() || null;
    if (this.aim?.computeLaunch && this.character?.position) {
      try {
        const launch = this.aim.computeLaunch(this.character.position, {
          hand: 'right'
        });
        if (launch?.direction) _fwd.copy(launch.direction);
        if (launch?.target) aimTarget = launch.target.clone();
      } catch {
        /* keep tip origin */
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
    {
      const spline = resolveSkillSpline(this.character, skill, pose);
      pose.origin.copy(spline.start);
      pose.aim.copy(spline.end);
    }
    const aimPt = { x: pose.aim.x, y: pose.aim.y, z: pose.aim.z };
    const castDur =
      skill.style === 'melee'
        ? 0
        : Math.max(0, Number(skill.castDuration ?? skill.castTime ?? 0.55));

    const releaseSpell = () => {
    const focusOnPre = this.elapsed < this._focusUntil;
    const focusMulPre = focusOnPre ? this._focusMul || 1.35 : 1;
    const castPlan = planElementalLinearCast(skill, {
      focusCombat: !!this.combatFocus?.focusEnabled || this.inCombat,
      pathDrawn: false,
      intensity: focusMulPre
    });
    skill._castPlan = castPlan;
    // Linear abilities own muzzle/flash. Do not stack swirl / chain_lightning tells.
    const travelOwnsTell = !!(
      castPlan.useLinear ||
      castPlan.useMeshDelivery ||
      castPlan.usePathAbility
    );
    if (!travelOwnsTell && !castPlan.layers?.includes('buff')) {
      if (isStaffNormalAttack(skill)) {
        this.vfx?.deploy?.(skill.castEffectId || 'arcane_swirl', { ...pose, intensity: 0.95 });
      } else if (skill.castEffectId) {
        this.vfx?.deploy?.(skill.castEffectId, { ...pose, intensity: 0.9 });
      }
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

    // Linear LINE/ZONE skillshot (castToward — no Alt+Shift arm required)
    if (castPlan.useLinear && this.linearSkills) {
      try {
        const feet = this.character.position.clone();
        const aimPt3 =
          pose.aim?.clone?.() ||
          feet.clone().addScaledVector(pose.forward, skill.rangeM || 12);
        const okLin = fireLinearFromPlan(this.linearSkills, castPlan, {
          origin: pose.origin,
          feet: this.character.getWorldPosition?.() || feet,
          aim: aimPt3
        });
        if (okLin) skill._deliveryLabel = `Linear · ${castPlan.linearId}`;
        if (okLin && this.physics?.spawnSplineVfx && pose.origin && pose.aim) {
          const mid = pose.origin.clone().lerp(pose.aim, 0.5);
          mid.y += Math.min(1.6, pose.origin.distanceTo(pose.aim) * 0.08);
          const line = new CatmullRomCurve3(
            [pose.origin.clone(), mid, pose.aim.clone()],
            false,
            'catmullrom',
            0.5
          );
          this.physics.spawnSplineVfx(`lin_${skill.id}`, line, {
            beads: 4,
            life: 1.1,
            speed: 16,
            heal: false,
            effectRadius: 0.38,
            shapeRadius: 0.16
          });
        }
      } catch (e) {
        console.warn('[DrcCombat] linear cast', e);
      }
    }

    // Bend / spline travel (verduror mist, vines) — same pose, after hit frame
    if (castPlan.usePathAbility && !castPlan.useLinear) {
      try {
        this._deployBendingSkill(skill, pose);
        if (castPlan.variantHint) skill._deliveryLabel = `Bend · ${castPlan.variantHint}`;
        if (skill.impactEffectId) {
          const v = getEffectVariant(castPlan.variantHint || skill.variantHint);
          const dist = pose.origin.distanceTo(pose.aim);
          const speed = v?.speed || 1;
          const travelSec = Math.max(0.08, Math.min(0.42, dist / (14 * speed)));
          const impactPose = {
            origin: pose.aim.clone(),
            aim: pose.aim.clone(),
            forward: pose.forward,
            intensity: 0.95,
            color: v?.color || undefined
          };
          const fireImpact = () => this.vfx?.deploy?.(skill.impactEffectId, impactPose);
          if (travelSec >= 0.1) setTimeout(fireImpact, Math.round(travelSec * 1000));
          else fireImpact();
        }
      } catch (e) {
        console.warn('[DrcCombat] bend cast', e);
      }
    }

    // Mesh orb / rocks / bullets — only when this plan owns travel
    if (castPlan.useMeshDelivery) {
      try {
        const deliv = this._deploySkillDelivery(skill, pose);
        if (deliv?.deliveryLabel) {
          skill._deliveryLabel = deliv.deliveryLabel;
        }
      } catch (e) {
        console.warn('[DrcCombat] delivery', e);
      }
    }

    // VFX: spell → elemental ability + creative presentation (volley/meteor/vines/…)
    if (skill.style === 'spell' && (skill.element || skill.abilityElement)) {
      // Product element (fire|storm|ice|nature|holy|arcane) or legacy — AbilityManager maps pool
      const el = skill.element || skill.abilityElement;
      const pathMode = skill.pathMode || 'stream';
      // Path AbilityManager is LMB stroke only (castPathAbility). Digit/F never
      // also fire the elemental ribbon — weapon skill owns travel + anim.

      const focusOn = this.elapsed < this._focusUntil;
      const focusMul = focusOn ? this._focusMul || 1.35 : 1;
      const intensity = focusOn ? 1.0 * focusMul : 1.0;
      if (focusOn) {
        this._focusUntil = 0;
      }
      this.linearSkills?.applyIntensity?.(intensity);

      const presStyle = skill.presentation || skill.prefab?.presentation || null;
      // Presentation is beauty-only when NOTHING else is travelling (no orb/linear/ribbon)
      if (
        !castPlan.useLinear &&
        !castPlan.useMeshDelivery &&
        !castPlan.usePathAbility
      ) {
        this.vfx?.deployPresentation?.(el, { ...pose, intensity }, {
          pathKind: skill.pathMode || pathMode,
          presentation: presStyle
        });
      }

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
        if (this._isJumpAttackWindow()) this._commitJumpAttack(skill, pose);
        const aoe = skill.residualAoe;
        this._fireMeleeResidual(skill, pose, {
          rangeOverride: this._isJumpAttackWindow()
            ? settings.meleeCombo?.jumpAttack?.residualRange ?? 6.5
            : skill.rangeM,
          hit: {
            kind: this._isJumpAttackWindow()
              ? 'jumpAttack'
              : skill.animRole === 'finisher'
                ? 'finisher'
                : 'light',
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
      this._deployBendingSkill(skill, pose);
      this.onToast(bound ? `${boundName} · ${bound.skillId}` : skill.label);
      return;
    }

    // Ranged (flintlock · bow · xbow) — delivery already fired bullets/arrows
    if (skill.style === 'ranged') {
      this._deployBendingSkill(skill, pose);
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

    // Linear / bend: play clip first, fire travel at anim apex (not click).
    const linearPlan = planElementalLinearCast(skill, {
      focusCombat: !!this.combatFocus?.focusEnabled || this.inCombat,
      pathDrawn: false,
      intensity: 1
    });
    const timedTravel =
      (linearPlan.useLinear && this.linearSkills) ||
      (linearPlan.usePathAbility && !linearPlan.useLinear);
    if (timedTravel) {
      skill._castPlan = linearPlan;
      this._playSkillAnim(skill);
      if (skill.castEffectId) {
        this.vfx?.deploy?.(skill.castEffectId, { ...pose, intensity: 0.72 });
      }
      const hit = hitFrameDelaySec(skill, castDur);
      if (hit >= 0.06) {
        this._beginCast({
          label: skill.label,
          duration: hit,
          element: skill.element || skill.abilityElement || 'arcane',
          skill,
          aim: aimPt,
          showCharge: false,
          interruptible: true,
          skipAnim: true,
          onComplete: releaseSpell
        });
      } else {
        releaseSpell();
      }
      return true;
    }

    // Instant melee / ranged / near-zero castDuration
    if (skill.style === 'melee' || skill.style === 'ranged' || castDur < 0.08) {
      this._playSkillAnim(skill);
      if (skill.style === 'melee' && this._isJumpAttackWindow?.()) {
        this._commitJumpAttack(skill, pose);
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
   * LMB melee: air combo starters (dive then aerial 2/3) · ground light combo.
   */
  useMeleeStrike() {
    if (this._isJumpAttackWindow()) {
      const air = this.character.playMeleeComboAir?.() || this.character.playMeleeAttack?.({ airborne: true });
      if (air?.ok && (air.step === 0 || air.role === 'jumpAttack' || air.kind === 'air')) {
        if (air.step === 0) this._useJumpAttackLmb({ skipAnim: true });
        else {
          const from =
            this.character?.position?.clone?.() ||
            this.character?.root?.position?.clone?.() ||
            new Vector3();
          const aim = this._softLockAimPoint(this.aim?.hitPoint) || from.clone().add(new Vector3(0, 0, 3));
          const forward = aim.clone().sub(from);
          forward.y = 0;
          if (forward.lengthSq() < 1e-6) forward.set(0, 0, 1);
          else forward.normalize();
          this._fireMeleeResidual(
            { style: 'melee', animRole: air.role, label: 'Air combo', damage: this.derivedStats?.damage },
            { origin: from, forward, aim },
            { hit: { kind: 'air', step: air.step } }
          );
          this.onToast(`Air combo ${air.step + 1} · ${air.role}`);
        }
        return true;
      }
      const ok = this._useJumpAttackLmb();
      if (ok || (this._jumpDashUntil && this.elapsed < this._jumpDashUntil)) return true;
      return false;
    }
    const pack = this.character?.animPackId || '';
    if (pack === 'sword_shield' || pack === 'unarmed') {
      const played =
        this.character.playMeleeComboLight?.() ||
        this.character.playWeaponCombat?.('attack') ||
        this.character.playWeaponAttack?.();
      if (played) return true;
    }
    return this.character.playMeleeAttack?.({}) || this.useWeaponSkillF();
  }

  /** Air or just-landed window for greatsword jump attack. */
  _isJumpAttackWindow() {
    if (this._airborne || !this._grounded) return true;
    return this.elapsed < (this._justLandedUntil || 0);
  }

  /**
   * LMB jump attack — greatsword jumpAttack clip + soft-lock dash + blade slash + earth.
   * Does not consume the F-slot skill CD.
   */
  _useJumpAttackLmb(opts = {}) {
    if (!this.inCombat) {
      this.onToast('Combat session (Shift+Q) — tap Q swaps weapons for jump attack');
      return false;
    }
    if (this._cast) return false;
    if (this._jumpDashUntil && this.elapsed < this._jumpDashUntil) return false;
    const lock = this._softLockAimPoint(this.aim?.hitPoint);
    const from =
      this.character?.position?.clone?.() ||
      this.character?.root?.position?.clone?.() ||
      new Vector3();
    const aim = lock || from.clone().add(new Vector3(
      Math.sin(this.character?.facing || 0) * 4,
      0,
      Math.cos(this.character?.facing || 0) * 4
    ));
    const forward = aim.clone().sub(from);
    forward.y = 0;
    if (forward.lengthSq() < 1e-6) {
      forward.set(Math.sin(this.character?.facing || 0), 0, Math.cos(this.character?.facing || 0));
    } else {
      forward.normalize();
    }
    const pose = { origin: from, forward, aim };
    const skill = {
      ...(getMeleeStrikeSkill() || {}),
      style: 'melee',
      animRole: 'jumpAttack',
      label: 'Jump attack'
    };
    if (!opts.skipAnim) {
      this.character.playMeleeFinisher?.({ airborne: true }) ||
        this.character.requestOneShot?.('jumpAttack') ||
        this.character.requestOneShot?.('finisherAir') ||
        this.character.requestOneShot?.('attack');
    }
    this._commitJumpAttack(skill, pose);
    this._airTiltOn = true;
    const ja = settings.meleeCombo?.jumpAttack || {};
    this._fireMeleeResidual(skill, pose, {
      rangeOverride: ja.residualRange ?? 6.5,
      hit: { kind: 'jumpAttack', step: -1 }
    });
    this.onToast('Jump attack · soft-lock dash');
    return true;
  }

  /**
   * Soft-lock point: selected target, else acquire best in cone, else aim.
   * @param {import('three').Vector3} [fallback]
   */
  _softLockAimPoint(fallback) {
    const sel = this.combatFocus?.selectedTarget;
    if (sel?.mesh?.position) return sel.mesh.position.clone();
    if (sel?.point) return sel.point.clone();
    const feet = this.character?.position || this.character?.root?.position;
    const fwd =
      this.aim?.forward?.clone?.() ||
      new Vector3(Math.sin(this.character?.facing || 0), 0, Math.cos(this.character?.facing || 0));
    if (feet && this.combatFocus?.acquireBest) {
      this.combatFocus.acquireBest(feet, fwd);
      const t = this.combatFocus.selectedTarget;
      if (t?.mesh?.position) return t.mesh.position.clone();
      if (t?.point) return t.point.clone();
    }
    return fallback?.clone?.() || null;
  }

  /**
   * Jump-attack: dash on soft-lock vector, slash residual at clip end, earth under feet.
   */
  _commitJumpAttack(skill, pose) {
    if (this._jumpDashUntil && this.elapsed < this._jumpDashUntil) return;
    const ja = settings.meleeCombo?.jumpAttack || {};
    const from =
      this.character?.position?.clone?.() ||
      this.character?.root?.position?.clone?.() ||
      pose?.origin?.clone?.();
    if (!from) return;
    const aim = this._softLockAimPoint(pose?.aim) || pose?.aim;
    const to = aim?.clone?.() || from.clone().add(new Vector3(0, 0, 4));
    const dir = to.clone().sub(from);
    dir.y = 0;
    const distM = dir.length();
    if (distM > 0.08) dir.normalize();
    else dir.set(Math.sin(this.character.facing || 0), 0, Math.cos(this.character.facing || 0));

    this.character.facing = Math.atan2(dir.x, dir.z);
    this.character.root.rotation.y = this.character.facing;

    const dashM = (ja.dashMm ?? 480) / 100;
    const stop = ja.stopShortM ?? 0.85;
    const travel = Math.max(0.4, Math.min(dashM, Math.max(0.4, distM - stop)));
    const dur = ja.dashDur ?? 0.44;
    this._startVectorDash(dir.x, dir.z, travel, dur);
    this._airTrailFrom(from, dir, settings.drc?.airTrail?.dashLen ?? travel, 'dash');
    const hitDelay = ja.hitFrameDelay ?? 0.46;
    this._jumpDashUntil = this.elapsed + Math.max(dur, hitDelay) + 0.05;

    const earthDelay = Math.round(hitDelay * 1000);
    window.setTimeout(() => {
      const feet =
        this.character?.position?.clone?.() ||
        this.character?.root?.position?.clone?.() ||
        from;
      feet.y = 0.05;
      this.vfx?.deploy?.('earth_surge', {
        origin: feet,
        forward: dir,
        aim: feet,
        intensity: ja.earthIntensity ?? 0.38,
        aoe: ja.earthRadius ?? 1.15,
        size: 0.28
      });
    }, earthDelay);
  }

  /**
   * Air-bending silk trail along a mobility vector (dash / 2nd jump / backflip).
   * @param {Vector3} from
   * @param {Vector3} dir
   * @param {number} len
   * @param {string} source
   */
  _airTrailFrom(from, dir, len, source) {
    if (!from || !dir) return;
    this.vfx?.airTrail?.(from, dir, len, { source });
  }

  /**
   * Dash along a world XZ vector (soft-lock jump attack). Reuses dodge impulse.
   * @param {number} wx
   * @param {number} wz
   * @param {number} distM
   * @param {number} dur
   */
  _startVectorDash(wx, wz, distM, dur) {
    const len = Math.hypot(wx, wz) || 1;
    const nx = wx / len;
    const nz = wz / len;
    const speed = distM / Math.max(0.12, dur);
    this._dodgeVel.set(nx * speed, 0, nz * speed);
    this._dodgeT = dur;
    this._dodgeDur = dur;
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
    const ja = settings.meleeCombo?.jumpAttack || {};
    const isJumpAtk =
      opts.hit?.kind === 'jumpAttack' ||
      opts.hit?.kind === 'finisherAir' ||
      skill.animRole === 'jumpAttack';
    const hitFrameDelay = isJumpAtk
      ? ja.hitFrameDelay ?? 0.46
      : prim.hitFrameDelay ?? settings.residual?.hitFrameDelay ?? 0.18;
    const step = opts.hit?.step;
    // Combo lights: slightly shorter trail; finishers longer + fire blur
    const isFin =
      opts.hit?.kind === 'finisher' ||
      opts.hit?.kind === 'finisherAir' ||
      opts.hit?.kind === 'jumpAttack' ||
      skill.animRole === 'finisher' ||
      skill.animRole === 'jumpAttack';
    const trailDur =
      (settings.residual?.trailDuration ?? 0.34) *
      (isFin ? 1.25 : step === 2 ? 1.1 : 1);
    const fireBlur =
      settings.residual?.fireTrail !== false &&
      (isFin || settings.residual?.fireTrail === true);

    const mist = skill?.projectileLearn?.mist || compileProjectileLearn(skill || {}).mist;
    if (mist?.enabled && this.vfx?.puffMist) {
      const at = pose.origin?.clone?.() || this.character?.position?.clone?.();
      if (at) {
        at.y = (at.y || 0) + 0.9;
        this.vfx.puffMist(at, {
          ...mist,
          intensity: isFin ? 1.15 : 0.7,
          duration: Math.min(6, mist.duration)
        });
      }
    }

    let fwd = pose.forward?.clone?.() || new Vector3(0, 0, 1);
    if (typeof this.character.getWeaponForward === 'function') {
      this.character.getWeaponForward(_fwd);
      if (_fwd.lengthSq() > 1e-8) fwd = _fwd.clone().normalize();
    }

    this._applyCatalogHits(skill, pose);

    // Prefer tip-trail system (ribbon + apex projectile). Fallback to legacy timeout.
    if (this.tipTrail?.beginSwing) {
      const paint = skill?.trail || null;
      const lockAim = isJumpAtk
        ? this._softLockAimPoint(pose.aim) || pose.aim
        : null;
      this.tipTrail.beginSwing({
        duration: trailDur,
        hitFrameDelay,
        forward: fwd,
        skill,
        paint,
        spineId: paint?.spine,
        hit: opts.hit || {
          kind: isFin ? 'finisher' : 'light',
          step: Number.isFinite(step) ? step : 0
        },
        rangeM: range,
        fireBlur,
        aim: lockAim,
        color: fireBlur
          ? settings.residual?.trailColor || '#ff6a22'
          : paint?.color || settings.residual?.color || '#7dd3fc',
        beyondBladeM: settings.residual?.beyondBladeM ?? 0.38,
        width:
          (paint?.width ?? settings.residual?.trailWidth ?? 0.14) *
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
      // Residual slash is the travel. Do not also spawn an Ability ribbon.
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
    if (typeof this.character.getWeaponTip === 'function') {
      this.character.getWeaponTip(_origin, 0.12);
    } else {
      this.character.getCastOrigin(_origin);
    }
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
      if (typeof this.character.getWeaponTip === 'function') this.character.getWeaponTip(_origin, 0.12);
      else this.character.getCastOrigin(_origin);
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
      if (typeof this.character.getWeaponTip === 'function') this.character.getWeaponTip(_origin, 0.12);
      else this.character.getCastOrigin(_origin);
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
      this.onToast('Combat session (Shift+Q) — tap Q swaps weapons');
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
          this.onToast('Block (E)');
        });
      case 'heavy':
        // Heavy = same weapon skill path for now (class ability later)
        return this.useWeaponSkillF();
      case 'kick':
        return this._utilityAction('kick', 0.9, 6, () => {
          this.character.playUnarmedKick?.() || this.character.playWeaponAttack?.();
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
    if (this._isRangedKite()) pairs.push(['KeyS', 'back']);
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
  }

  /** Staff / bow / wand — kite sidestep instead of 7.2 m melee escape. */
  _isRangedKite() {
    const w = getEquippedWeapon();
    const pack = String(w?.animPack || w?.id || w?.holdKind || '');
    return /magic|longbow|bow|staff|wand|tome|rifle|pistol/i.test(pack);
  }

  _updateAirDiveTilt(dt) {
    const root = this.character?.root;
    if (!root) return;
    const air = !this._grounded;
    const diving =
      air &&
      (this._dodgeT > 0 || (this._jumpDashUntil && this.elapsed < this._jumpDashUntil));
    if (!diving) {
      if (this._airTiltOn) {
        this._airTiltOn = false;
        this.character.setFacing?.(this.character.facing);
      }
      return;
    }
    this._airTiltOn = true;
    const vx = this._dodgeVel.x;
    const vz = this._dodgeVel.z;
    const horiz = Math.hypot(vx, vz) || 1;
    _fwd.set(vx / horiz, -0.85, vz / horiz).normalize();
    _tiltQ.setFromUnitVectors(_upZ, _fwd);
    root.quaternion.slerp(_tiltQ, 1 - Math.exp(-10 * dt));
  }

  /**
   * info.* combatFormulas vs hostiles in range.
   */
  _applyCatalogHits(skill, pose) {
    const incoming = Number(skill?.damage) > 0 ? Number(skill.damage) : this.derivedStats?.damage || 12;
    const atk = this.derivedStats || {};
    const list = this._collectHitTargets(pose?.aim) || [];
    for (const t of list) {
      if (!t?.mesh || t.kind === 'aim' || t.kind === 'ally') continue;
      const def = t.mesh.userData?.derivedStats || t.mesh.userData?.stats || {};
      const r = resolveCombatDamage({ incoming, attacker: atk, defender: def });
      const hp01 = applyHpDamage(t.mesh, r.damage, t.mesh.userData?.maxHp || 100);
      if (r.crit) this.onToast?.(`Crit ${Math.round(r.damage)}`);
      if (hp01 <= 0) this.onToast?.(`${t.id || 'foe'} down`);
    }
  }

  bindClassAttributes(classId) {
    this.attrAlloc = defaultAllocForClass(classId || resolvePlayerClass(this.character));
    this.derivedStats = computeDerivedStats(this.attrAlloc);
    const hp = this.derivedStats.health || 100;
    this.maxHp = hp;
    this.hp = hp;
  }

  /**
   * Directional dodge (AA/DD/WW · X back). Ranged uses shorter kite MM.
   * @param {'left'|'right'|'forward'|'back'} dir
   */
  dodge(dir) {
    const d = dir === 'left' || dir === 'right' || dir === 'forward' || dir === 'back' ? dir : 'back';
    const stam = settings.drc?.dodgeStamina ?? 10;
    const kite = this._isRangedKite() && d !== 'forward';
    const cd = kite ? 0.42 : 0.75;
    return this._utilityAction(`dodge_${d}`, cd, stam, () => {
      this._cdUntil.set('dodge', this.elapsed + cd);
      this._cdMax.set('dodge', cd);

      const air = !this._grounded;
      const dist = air
        ? settings.drc?.airDashDistance ?? 5.5
        : kite
          ? kiteDistanceM(d)
          : dodgeDistanceM(d, settings.drc || {});
      const dur = air
        ? settings.drc?.airDashDuration ?? 0.72
        : kite
          ? Math.min(settings.drc?.dodgeDuration ?? 0.42, 0.32)
          : settings.drc?.dodgeDuration ?? 0.42;
      this._startMobilityImpulse(d, dist, dur);
      if (air) {
        this._hangT = Math.max(this._hangT || 0, 0.38);
        this.physics?.setGravityScale?.(0.45);
        this._kinGravityScale = 0.45;
      }

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

      const played = air
        ? this.character.playAirDash?.(d)
        : this.character.playDodge?.(d);
      const lat = d === 'left' || d === 'right';
      const labels = { left: 'AA left', right: 'DD right', forward: 'WW forward', back: 'X back' };
      const ok = played === true || played?.ok;
      this.onToast(
        `${air ? 'airdash ' : kite ? 'kite ' : ''}${labels[d] || d} · ${dist.toFixed(1)}m` +
          `${!air && !kite && lat ? ' ×3' : ''}` +
          `${ok ? '' : ' (no clip)'}` +
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

  /** Parry with block/parry clip. */
  parry() {
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
      this.onToast('Combat session (Shift+Q) — tap Q swaps weapons to cast');
      return null;
    }
    const sc = settings.staffCast || {};
    if (sc.enabled === false) {
      const costs = pathCastCosts(holdSec, length, 'stream', this.abilities.selected);
      if (!this._spendResources(costs.mana, costs.stamina, 'Cast')) return null;
      this.lastCastIntensity = costs.intensity;
      this.abilities.clear?.();
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
        aim: curve.getPoint(1)
      };
      if (kind === 'aoe') {
        const end = curve.getPoint(1);
        const mid = end.clone();
        mid.y += 0.4;
        const start = end.clone().add(new Vector3(0.01, 0.8, 0.01));
        const short = new CatmullRomCurve3([start, mid, end], false, 'catmullrom', 0.5);
        this.abilities.select(element);
        this.abilities.clear?.();
        this.abilities.cast(short, element);
      } else {
        this.abilities.select(element);
        this.abilities.clear?.();
        this.abilities.cast(curve, element);
      }
      const sigName = intensity >= 2.4 && sig ? ` · ${sig.label}` : '';
      this.onToast(
        `Staff · ${labels[kind]} (${element}) · ×${intensity.toFixed(1)} · −${costs.mana}MP −${costs.stamina}STA${sigName}`
      );
    };

    if (this._cast) this._interruptCast('replaced', false);
    const pathSkill = skillForFKey() || skillBySlot?.(0) || getActiveSkills()?.[0] || null;
    this._beginCast({
      label: `${labels[kind]} · ${pathSkill?.label || element}`,
      duration: pathCastTime,
      element,
      interruptible: true,
      aim: aimPt,
      onComplete: releasePath,
      skill: pathSkill
    });
    return { kind, element, intensity, mana: costs.mana, stamina: costs.stamina, castTime: pathCastTime };
  }

  /**
   * Attach bending combat VFX to spine start → aim end.
   * @param {object} skill
   * @param {{ origin: import('three').Vector3, aim: import('three').Vector3, forward: import('three').Vector3 }} pose
   */
  _deployBendingSkill(skill, pose) {
    const classified = classifyBendingPattern(skill);
    const wantBend =
      skill.travelMode === 'bend' ||
      skill._castPlan?.usePathAbility ||
      classified === 'jade_mist' ||
      classified === 'nature_vine' ||
      classified === 'elemental_curve';
    const pattern = classified || (wantBend ? 'elemental_curve' : null);
    if (!pattern) return;
    const spline = resolveSkillSpline(this.character, skill, pose);
    const src = this.character?.model || this.character?.root;
    const behind = spline.end
      .clone()
      .addScaledVector(pose.forward || new Vector3(0, 0, 1), -(settings.presentation?.mobility?.pullBehindM ?? 1.65));
    behind.y = spline.end.y;
    const variant = getEffectVariant(skill._castPlan?.variantHint || skill.variantHint);
    const el = skill.element || skill.abilityElement || 'nature';
    const scene = this.scene || this.vfx?.ctx?.scene || this.character?.model?.parent;
    const totem = nearestTotemWorldPos(scene, spline.end, skill.rangeM || 22);
    if (totem && skillWantsSpline(skill)) {
      spline.end.copy(totem);
    }
    let curve = null;
    if (wantBend && spline.start && spline.end) {
      try {
        const dist = spline.start.distanceTo(spline.end);
        const ang = ((variant?.angleDeg || 18) * Math.PI) / 180;
        const fwd = pose.forward || new Vector3(0, 0, 1);
        const right = new Vector3(-fwd.z, 0, fwd.x);
        if (right.lengthSq() < 1e-6) right.set(1, 0, 0);
        else right.normalize();
        const mid = spline.start.clone().lerp(spline.end, 0.45);
        mid.addScaledVector(right, Math.sin(ang) * dist * 0.22);
        mid.y += Math.min(2.4, dist * 0.12);
        curve = new CatmullRomCurve3(
          [spline.start.clone(), mid, spline.end.clone()],
          false,
          'catmullrom',
          0.5
        );
        if (this.abilities?.cast) {
          this.abilities.select?.(el);
          this.abilities.cast(curve, el);
        }
        const heal = skillWantsHealSpline(skill) || pattern === 'jade_mist';
        this.physics?.spawnSplineVfx?.(`bend_${skill.id}`, curve, {
          beads: heal ? 7 : 5,
          life: heal ? 5.2 : 2.2,
          speed: variant?.speed ? 8 * variant.speed : 10,
          heal,
          effectRadius: heal ? 0.72 : 0.48,
          shapeRadius: 0.22
        });
      } catch (e) {
        console.warn('[DrcCombat] bend path', e);
      }
    }
    if (!this.vfx?.deployBendingPattern) return;
    this.vfx.deployBendingPattern(
      pattern,
      {
        start: spline.start,
        end: spline.end,
        forward: pose.forward,
        intensity: 1
      },
      {
        source: src,
        behind,
        variant,
        curve,
        healTarget: this.character,
        shockwaveElement: shockwaveElementOf(skill),
        onTornado: (aim, spec) => this._applyTornadoPull(aim, spec),
        onEarthStun: (aim, spec) => this._applyEarthStunAoe(aim, spec),
        onHolyStun: (aim, spec) => this._applyEarthStunAoe(aim, spec),
        onArrow: (system, pts) => {
          this.projectiles?.spawnArrow?.({
            origin: pts.start,
            target: pts.end,
            system,
            targets: this._collectHitTargets?.() || []
          });
        },
        onOutlineDash: (from, to, fwd, dist) => this._mobilityOutlineDash(fwd, dist),
        onSmokeBlink: (from, dest) => this._mobilitySmokeBlink(from, dest),
        onRangerInvis: () => this._applyRangerInvis(skill)
      }
    );
  }

  _applyTornadoPull(aim, spec = {}) {
    const r = spec.pullRadius || settings.presentation?.tornado?.pullRadius || 3.5;
    const mm = spec.pullMm || settings.presentation?.tornado?.pullMm || 220;
    const list = this.combatFocus?.listTargetsInRange?.(aim, r) || [];
    for (const t of list) {
      if (t.mesh) applyPullToward(t.mesh, aim, mm);
      this.statuses?.applyHit?.({
        target: t,
        skill: { effects: ['tornado', 'pull'], damage: 6 },
        hit: { origin: aim, aim }
      });
    }
  }

  _applyEarthStunAoe(aim, spec = {}) {
    const r =
      spec.radius ||
      settings.presentation?.holy?.radius ||
      settings.presentation?.earthStun?.radius ||
      2.8;
    const list = this.combatFocus?.listTargetsInRange?.(aim, r) || [];
    for (const t of list) {
      this.statuses?.applyHit?.({
        target: t,
        skill: { effects: ['stun aoe', 'holy'], damage: 8 },
        hit: { origin: aim }
      });
    }
  }

  /** Blur dash — play dodge anim + afterimage outline beam (no new hotkey). */
  _mobilityOutlineDash(fwd, dist) {
    const d = dist || settings.presentation?.mobility?.dashDist || 7.2;
    const dir =
      Math.abs(fwd?.z || 0) >= Math.abs(fwd?.x || 0)
        ? fwd.z >= 0
          ? 'forward'
          : 'back'
        : fwd.x >= 0
          ? 'right'
          : 'left';
    this.dodge?.(dir);
  }

  /** Ranger invis: smoke bomb at feet + self outline; hidden from all sight. */
  _applyRangerInvis(skill) {
    const dur =
      skill?.statuses?.find?.((s) => s.id === 'stealth')?.durationSec ||
      settings.presentation?.stealth?.durationSec ||
      6;
    this.statuses?.applyHit?.({
      target: { id: 'player', kind: 'player', mesh: this.character?.model || this.character?.root },
      skill: {
        ...skill,
        effects: ['invis', 'stealth', 'smoke bomb'],
        statuses: [{ id: 'stealth', durationSec: dur, magnitude: 1 }]
      },
      applyToPlayer: true,
      character: this.character,
      physics: this.physics,
      drc: this
    });
    this.character?.setStealthLook?.(true);
    if (this.character) {
      this.character.userData = this.character.userData || {};
      this.character.userData.hiddenFromSight = true;
    }
    this.onToast(`Invis · unseen ${dur.toFixed(0)}s`);
  }

  _breakStealth(reason) {
    if (!this.isStealthed && !this.character?.userData?.hiddenFromSight) return;
    this.character?.setStealthLook?.(false);
    if (this.character?.userData) this.character.userData.hiddenFromSight = false;
    const arr = this.statuses?._byTarget?.get?.('player');
    if (arr) {
      this.statuses._byTarget.set(
        'player',
        arr.filter((s) => s.id !== 'stealth')
      );
    }
    if (reason) this.onToast(reason);
  }

  /** Jump → hide body → appear behind dest with smoke implode. */
  _mobilitySmokeBlink(from, dest) {
    const hideSec = settings.presentation?.mobility?.blinkHideSec ?? 0.22;
    this.character?.playJump?.() || this.character?.requestOneShot?.('jump');
    this.character?.setBodyHidden?.(true);
    const land = dest?.clone?.() || from?.clone?.();
    window.setTimeout(() => {
      if (land && this.character?.root) {
        const ly = Number.isFinite(land.y) ? land.y : this._landY(land.x, land.z);
        this.character.placeAt(land.x, ly, land.z);
        this.physics?.setPlayerFeet?.(land.x, ly, land.z);
      }
      this.character?.setBodyHidden?.(false);
    }, Math.round(hideSec * 1000));
  }
}
