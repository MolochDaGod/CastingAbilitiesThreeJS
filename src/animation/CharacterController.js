import {
  AnimationMixer,
  Box3,
  ClampToEdgeWrapping,
  Group,
  LoopOnce,
  LoopRepeat,
  MathUtils,
  SRGBColorSpace,
  Vector3
} from 'three';
import {
  ANIM_PACKS,
  DODGE_ROLE,
  ROLL_ROLE,
  DEFAULT_RACE,
  FALLBACK_PRESETS,
  GEAR_PRESETS_URL,
  bakedClipUrlsForRole
} from '../config/assets.js';
import { animPackForLoadout, activeWeaponSlot, packCombatBlurb } from '../config/weaponAnimPack.js';
import { describeAnimLibrary, roleBlurb } from '../config/animLibrary.js';
import { pistolTimeScale, FLINTLOCK_FIRE } from '../config/pistolAnimSsot.js';
import { PistolReloadPose, findWeaponAttach, getMuzzleWorld, getBarrelForward } from './pistolReloadPose.js';
import { getWeaponAttachFromHand } from '../character/WeaponMeshAttach.js';
import {
  atlasUrlForRace,
  kitUrlForRace,
  loadoutToMeshIds,
  logSSOT,
  isToonRtsKitUrl,
  raceDef,
  GRUDGE6_SSOT_VERSION
} from '../config/grudge6SSOT.js';
import { EquipmentManager } from '../character/EquipmentManager.js';
import {
  deployToonPlayKit,
  reGroundToonKit,
  applyMeshIdsExclusive,
  diagnoseCharacterLook,
  countSkeletons
} from '../character/toonKitPlay.js';
import { RideIK } from '../character/RideIK.js';
import { BackSlotEquip } from '../character/BackSlotEquip.js';
import { LAYER } from '../core/Layers.js';
import { settings } from '../config/settings.js';
import { disposeObject } from '../utils/dispose.js';
import { loadBakedClipJson, rematchClipToSkeleton } from './bakeClip.js';
import { loadFbxClipRematched, FLIP_FBX_URLS } from './fbxClip.js';

const _castOrigin = new Vector3();
const _rideFwd = new Vector3();
const _rideLeft = new Vector3();
/** Local +X on tilt — backflip spin axis (pitch) */
const _flipAxis = new Vector3(1, 0, 0);

/**
 * Toon RTS / grudge6 combat hero — ObjectStore loadRaceKit parity ONLY.
 *
 * RIGHT SOURCE: info.grudge-studio.com/js/grudge6-kit.js + race-scenes
 *   Toon GLB → clone → mesh_ids → bone SI fit → yaw 0 → one mixer
 *
 * Purged (wrong paths that keep breaking Warlords heroes):
 *  - unifySkeletons + pose() on partial head skins → head at feet
 *  - setFromObject skinned mesh SI fit → explode / under-scale
 *  - facePlusZ π/2 on Toon play GLB
 *  - races bake / metaverse / FBX play fallback
 *  - SittingPose Mixamo / soft HandIK every frame
 *
 * RideIK only while WalkController ride is active.
 */
export class CharacterController {
  constructor(environment) {
    this.environment = environment;
    this.root = new Group();
    this.root.name = 'Character';

    this.tilt = new Group();
    this.tilt.name = 'CharacterTilt';
    this.root.add(this.tilt);

    this.mixer = null;
    this.actions = new Map();
    this.current = null;
    this.height = 1.8;
    this.headPosition = new Vector3(0, 1.5, 0);
    this.forwardAxis = new Vector3(0, 0, 1);

    this.equipment = null;
    /** @type {{ rHand?: object, lHand?: object, pelvis?: object }|null} */
    this.bones = null;
    this.raceId = DEFAULT_RACE;
    this.animPackId = 'magic';
    this.presetId = 'mage';
    this.presets = FALLBACK_PRESETS.slice();

    /** 'idle' | 'walk' | 'run' | 'cast_loop' | 'attack' */
    this.animState = 'idle';
    this._attackTimer = 0;
    this._oneShotTimer = 0;
    this._castingExternal = false;
    this._boundPacks = new Set();
    this._gait = 0;
    this._gaitKey = '0:fwd';
    this._strafe = null;
    this._gaitLocked = false;
    /** Hold jump clip until land (first jump) */
    this._airJumpHold = false;
    /** Melee combo index 0..2 after last light hit; -1 = idle */
    this._meleeComboStep = -1;
    /** performance.now()/1000 deadline to continue combo */
    this._meleeComboUntil = 0;

    this.sitting = null;
    /** @type {import('../character/RideIK.js').RideIK|null} */
    this.rideIk = null;
    /** @type {import('../character/BackSlotEquip.js').BackSlotEquip|null} */
    this.backSlot = null;
    this._rideActive = false;
    /** World heading for ride pole vectors (set by WalkController) */
    this._rideYaw = 0;
    /**
     * When true, root is parented under windsurf seat — do not write world XZ/Y
     * to root.position (board vehicle owns transform until dismount).
     */
    this._rideParented = false;
    /** Cached world feet for position getter while parented */
    this._worldPos = new Vector3();
    this.ik = null;

    /** Procedural flip on tilt (backflip / frontflip deploy) */
    this._flipActive = false;
    this._flipTime = 0;
    /** −1 = backflip, +1 = frontflip (pitch about local right) */
    this._flipSign = -1;
    this._flipDuration = 0.55;
    /** True when playing a real clip (no tilt spin) */
    this._flipUseClip = false;
    /** Look yaw to hold on camera during backflip setup */
    this._flipCameraHoldYaw = null;
  }

  /**
   * @param {import('../loaders/AssetLoader.js').AssetLoader} assets
   * @param {{ raceId?: string, presetId?: string }} [opts]
   */
  async load(assets, opts = {}) {
    this.assets = assets;
    this.raceId = opts.raceId || DEFAULT_RACE;
    this.presetId = opts.presetId || 'mage';
    logSSOT();

    await this._loadPresets();

    const race = raceDef(this.raceId);
    // PLAY: Toon RTS GLB only — no races-bake / metaverse / FBX fallback
    const kitUrl = kitUrlForRace(this.raceId);
    const atlasUrl = atlasUrlForRace(this.raceId);

    let gltf = null;
    try {
      gltf = await assets.loadGLTF(kitUrl);
    } catch (err) {
      console.error('[CharacterController] Toon RTS kit failed (no fallback)', kitUrl, err);
      throw err;
    }
    if (!gltf) throw new Error(`No Toon RTS race GLB: ${kitUrl}`);
    if (!isToonRtsKitUrl(kitUrl)) {
      throw new Error(`[CharacterController] refuse non-Toon play kit: ${kitUrl}`);
    }

    // Atlas optional — Toon embeds usually enough; only for missing maps
    const atlas = await assets.loadTexture(atlasUrl).catch((err) => {
      console.warn('[CharacterController] atlas failed (ok if embeds)', err);
      return null;
    });
    await assets.settled();

    if (atlas) {
      atlas.colorSpace = SRGBColorSpace;
      atlas.flipY = false;
      atlas.wrapS = ClampToEdgeWrapping;
      atlas.wrapT = ClampToEdgeWrapping;
      atlas.anisotropy = 8;
      atlas.needsUpdate = true;
      this.atlas = atlas;
    }

    // Clear previous kit
    while (this.tilt.children.length) {
      const c = this.tilt.children[0];
      this.tilt.remove(c);
      disposeObject(c);
    }

    // Preset → mesh_ids (no bag/wood/quiver in combat showcase)
    const preset = this.presets.find((p) => p.id === this.presetId) || this.presets[0];
    this.animPackId = this._packFromPreset(preset);
    const cleanLoadout = { ...(preset?.loadout || { body: 'A', arms: 'A', legs: 'A', head: 'A' }) };
    delete cleanLoadout.bag;
    delete cleanLoadout.wood;
    delete cleanLoadout.quiver;
    delete cleanLoadout.carry;
    delete cleanLoadout.showUtility;
    const meshIds = loadoutToMeshIds(race.prefix, cleanLoadout);

    // ★ ObjectStore loadRaceKit parity — no unify/pose, bone SI fit, yaw 0
    const deployed = deployToonPlayKit(gltf.scene, { meshIds });
    const kit = deployed.root;
    kit.name = `${race.short}_toon`;
    kit.userData.importUrl = kitUrl;
    kit.userData.playMesh = 'toon-rts';
    kit.userData.ssotVersion = GRUDGE6_SSOT_VERSION;
    const report = deployed.equip;

    this.equipment = new EquipmentManager(kit, { preserveVisibility: true });
    this.equipment.loadout = { ...cleanLoadout };
    this.equipment.carryMode = false;
    this.equipment.hideUtility();

    kit.traverse((o) => {
      if (!o.isMesh && !o.isSkinnedMesh) return;
      o.layers.set(LAYER.WORLD);
      o.layers.enable(LAYER.CONTACT);
      o.castShadow = true;
      o.receiveShadow = true;
      if (o.isSkinnedMesh) o.frustumCulled = false;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) if (m) this.environment?.registerShadowCaster?.(m);
    });

    // root (world feet + yaw) → tilt → model
    this.tilt.add(kit);
    this.model = kit;
    this.root.position.set(0, 0, 0);
    this.root.rotation.set(0, 0, 0);
    this.tilt.position.set(0, 0, 0);
    this.tilt.quaternion.identity();

    this.height = deployed.height || kit.userData.deployHeightM || 1.8;
    this.headPosition.set(0, this.height * 0.86, 0);
    this.bones = this.equipment.findBones();

    // Single AnimationMixer — Bip001 packs, position tracks stripped, bones-only rematch
    this.mixer = new AnimationMixer(kit);
    this.actions.clear();
    this._boundPacks.clear();

    await this._bindPack(this.animPackId);
    if (this.animPackId !== 'magic' && this.animPackId !== 'sword_shield') {
      await this._bindPack('magic');
    }
    // Shared longbow directional dodges + parry (Danger Room AA/DD/WW/X)
    await this._bindPack('combat_mobility');
    // Hit reactions (knocked-up) — catalog combat hits
    await this._bindPack('reactions');
    if (this.animPackId !== 'longbow') {
      // Prefer longbow pack dodge roles when combat_mobility already set names
      await this._bindPack('longbow');
    }

    if (this.actions.has('idle')) this.play('idle', 0);
    else if (this.actions.size) this.play([...this.actions.keys()][0], 0);

    this.mixer.update(1 / 30);
    reGroundToonKit(kit, 0);
    this.root.position.y = 0;
    this.height = kit.userData.deployHeightM || this.height;

    if (this.rideIk) this.rideIk.rebind(kit);
    else this.rideIk = new RideIK(kit);
    this._rideActive = false;

    // Back-slot utility (windsurf stow on spine) — same equip family as hands
    const backId = settings.walk?.backSlot || 'windsurf';
    if (this.backSlot) this.backSlot.rebind(kit);
    else this.backSlot = new BackSlotEquip(kit);
    if (backId && backId !== 'none') {
      this.backSlot.equip(backId).catch((err) => console.warn('[Character] back slot', err));
    }

    const look = this.diagnoseLook();
    const vis = this._countVisibleSkinned();
    const uprightOk = deployed.upright !== false;
    console.info(
      `[CharacterController] toon-rts★ ${this.raceId}/${this.presetId} ` +
        `kit=${kitUrl.split('/').pop()} path=objectstore-parity ` +
        `h=${this.height.toFixed(2)}m equip=${report.matched} vis=${vis} clips=${this.actions.size} ` +
        `upright=${deployed.upright} headY=${deployed.headY?.toFixed(2)} footY=${deployed.footY?.toFixed(2)} ` +
        (uprightOk && vis >= 3 ? 'OK' : `WARN ${JSON.stringify(look.errors || [])}`),
    );

    return this;
  }

  /** Visible skinned pieces (body/arms/legs/head should be ≥3–4). */
  _countVisibleSkinned() {
    let n = 0;
    this.model?.traverse((o) => {
      if (o.isSkinnedMesh && o.visible) n++;
    });
    return n;
  }

  /** World AABB of visible body (for camera / debug). */
  getWorldBodyBox(out = new Box3()) {
    if (!this.model) return out.makeEmpty();
    this.root.updateMatrixWorld(true);
    out.makeEmpty();
    let any = false;
    this.model.traverse((o) => {
      if (!o.isSkinnedMesh || !o.visible) return;
      if (/weapon|shield|staff|sword|bow|axe|hammer/i.test(o.name || '')) return;
      try {
        const b = new Box3().setFromObject(o, true);
        if (b.isEmpty()) return;
        if (!any) {
          out.copy(b);
          any = true;
        } else out.union(b);
      } catch {
        /* */
      }
    });
    return out;
  }

  /** Snap root feet to world XZ (physics / spawn). No-op while parented to board. */
  placeAt(x, y, z) {
    if (this._rideParented || this._rideActive) return;
    this.root.position.set(x, y ?? 0, z);
  }

  diagnoseLook() {
    if (!this.model) return { ok: false, reason: 'no-model' };
    const d = diagnoseCharacterLook(this.model, 0);
    const bones = this.equipment?.findBones?.() || this.bones || {};
    // Don't throw — boot must complete even if bone helpers missing
    let skelCount = 0;
    try {
      skelCount = countSkeletons(this.model);
    } catch {
      skelCount = -1;
    }
    const heightOk = (d.height ?? 0) >= 1.55 && (d.height ?? 0) <= 2.15;
    const feetOk = Math.abs((d.feetMinY ?? 99) - 0) < 0.12;
    return {
      ok: heightOk && feetOk && !!(bones.pelvis || d.bip001?.count >= 18),
      heightM: +(d.height ?? 0).toFixed(3),
      feetMinY: +(d.feetMinY ?? 0).toFixed(3),
      heightOk,
      feetOk,
      pelvis: !!bones.pelvis,
      rHand: !!bones.rHand,
      errors: d.errors || [],
      equipMatched: this.equipment?.loadout || {},
      skeletons: skelCount,
      bip001: d.bip001?.count ?? 0
    };
  }

  async _loadPresets() {
    try {
      const res = await fetch(GEAR_PRESETS_URL, { mode: 'cors' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const list = json.presets || json;
      if (Array.isArray(list) && list.length) this.presets = list;
    } catch (err) {
      console.warn('[CharacterController] presets CDN fail; using fallbacks', err);
      this.presets = FALLBACK_PRESETS.slice();
    }
  }

  _packFromPreset(preset) {
    const pack = preset?.pack || 'magic';
    if (pack === 'magic' || pack.startsWith('magic')) return 'magic';
    if (pack.includes('sword') || pack.includes('shield') || pack === '2h_melee') return 'sword_shield';
    if (pack.includes('pistol') || pack.includes('handgun') || pack === 'gun') return 'pistol';
    if (pack.includes('bow') || pack === 'longbow') return 'longbow';
    return ANIM_PACKS[pack] ? pack : 'magic';
  }

  /**
   * Swap Toon RTS race kit (all 6 races) — full reload, same preset when possible.
   * @param {string} raceId WK|ELF|BRB|ORC|UD|DWF
   */
  async setRace(raceId) {
    if (!this.assets) throw new Error('CharacterController.setRace: call load() first');
    const next = raceId || DEFAULT_RACE;
    if (next === this.raceId && this.model) return this;
    await this.load(this.assets, { raceId: next, presetId: this.presetId });
    return this;
  }

  /**
   * Bind / activate a weapon locomotion + skill anim pack.
   * @param {string} packId magic | sword_shield | longbow | locomotion_8way
   */
  async setAnimPack(packId) {
    const id = ANIM_PACKS[packId] ? packId : 'magic';
    this.animPackId = id;
    // Re-bind so primary role names (idle/walk/attack) match this pack
    this._boundPacks.delete(id);
    const pack = ANIM_PACKS[id];
    if (pack) {
      for (const role of Object.keys(pack)) {
        const prev = this.actions.get(role);
        if (prev) {
          try {
            prev.stop();
          } catch {
            /* ignore */
          }
          this.actions.delete(role);
        }
      }
    }
    await this._bindPack(id);
    if (this.actions.has('idle')) this.play('idle', 0.25);
    else if (this.actions.has(`${id}:idle`)) this.play(`${id}:idle`, 0.25);
    return id;
  }

  /** Bound clip roles for anim library UI. */
  listAnimRoles() {
    return [...this.actions.keys()].sort();
  }

  /**
   * Animation library snapshot (packs, families, mobility, play API).
   * Use for Showcase Anims tab + agent diagnostics — do not fork role names.
   * @see config/animLibrary.js · docs/ANIM_LIBRARY_SSOT.md
   */
  getAnimLibrary() {
    return describeAnimLibrary(this);
  }

  /** Human blurb for a bound role (toast / lab). */
  describeRole(roleName) {
    return roleBlurb(roleName);
  }

  /** Play a library clip by role name (one-shot for attack/block/jump). */
  playLibraryClip(role) {
    if (!role || !this.actions.has(role)) return false;
    const once =
      /attack|block|parry|jump|cast|dodge|roll|slide|gunplay|spin|draw|reload|skill\d/i.test(
        role
      );
    this.play(role, once ? 0.12 : 0.25);
    if (once) {
      const act = this.actions.get(role);
      // T0 pistol: fire / draw / reload timing from pistolAnimSsot
      if (this.animPackId === 'pistol' && act) {
        if (/reload/i.test(role)) act.timeScale = pistolTimeScale('reload');
        else if (/draw|cast|block/i.test(role)) act.timeScale = pistolTimeScale('draw');
        else if (/attack|gunplay|spin/i.test(role)) act.timeScale = pistolTimeScale('fire');
        else if (/charged|skill2/i.test(role)) act.timeScale = pistolTimeScale('charged');
        else if (/whip|skill3/i.test(role)) act.timeScale = pistolTimeScale('whip');
      } else if (act && act.timeScale !== 1) {
        act.timeScale = 1;
      }
      const dur = (act?.getClip?.()?.duration ?? 0.6) / (act?.timeScale || 1);
      this._oneShotTimer = Math.max(this._oneShotTimer, dur * 0.95);
      this._gaitLocked = true;
      this.animState = /attack|gunplay|spin/i.test(role)
        ? 'attack'
        : /reload/i.test(role)
          ? 'reload'
          : /roll/i.test(role)
            ? 'roll'
            : /slide/i.test(role)
              ? 'slide'
              : /dodge/i.test(role)
                ? 'dodge'
                : this.animState;
    }
    return true;
  }

  /**
   * Procedural flintlock powder reload: gun to body middle · L-hand to barrel · tilt up.
   * @param {{ power?: boolean, durationSec?: number }} [opts]
   */
  playPistolReload(opts = {}) {
    if (!this._pistolReload) this._pistolReload = new PistolReloadPose();
    return this._pistolReload.start(this, opts);
  }

  /**
   * Charged Shot wind-up — blend into charged-pistol / skill2, slow timeScale.
   * @param {string} [role]
   */
  beginWeaponChargeAnim(role = 'skill2') {
    const name =
      (this.actions.has(role) && role) ||
      (this.actions.has('skill2') && 'skill2') ||
      (this.actions.has('cast') && 'cast') ||
      (this.actions.has('attack') && 'attack');
    if (!name) return false;
    this._weaponChargeAnim = name;
    this._gaitLocked = true;
    this.animState = 'charge';
    // Longer blend into charge pose (production weapon UX)
    const blend = settings.character?.chargeBlend ?? 0.22;
    this.play(name, blend);
    const act = this.actions.get(name);
    if (act) {
      try {
        act.setLoop(LoopOnce, 1);
        act.clampWhenFinished = true;
        // Slow wind — charged-pistol ~2.5s feels like draw power
        act.timeScale =
          this.animPackId === 'pistol'
            ? Math.min(0.75, pistolTimeScale('charged') * 0.55)
            : 0.65;
        act.time = 0;
      } catch {
        /* */
      }
    }
    this._oneShotTimer = 99; // hold until endWeaponChargeAnim
    return true;
  }

  /**
   * Advance charge pose (scrub into clip by progress).
   * @param {number} progress01
   * @param {number} holdSec
   */
  tickWeaponChargeAnim(progress01, holdSec = 0) {
    const name = this._weaponChargeAnim;
    if (!name) return;
    const act = this.actions.get(name);
    if (!act) return;
    const clip = act.getClip?.();
    const dur = clip?.duration ?? 1;
    // Scrub first ~55% of charged clip while holding (windup rest pose)
    const t = Math.min(0.55, Math.max(0, progress01) * 0.55) * dur;
    try {
      act.time = t;
      act.paused = progress01 > 0.92; // hold full pose near max charge
      if (!act.paused && !act.isRunning()) act.play();
    } catch {
      /* */
    }
    this._oneShotTimer = 99;
  }

  /**
   * End charge windup — fire snap or cancel restore gait blend.
   * @param {boolean} [fireCharged]
   */
  endWeaponChargeAnim(fireCharged = false) {
    const name = this._weaponChargeAnim;
    this._weaponChargeAnim = null;
    const act = name ? this.actions.get(name) : null;
    if (act) {
      try {
        act.paused = false;
        if (fireCharged) {
          // Snap remaining clip at fire scale
          act.timeScale =
            this.animPackId === 'pistol' ? pistolTimeScale('charged') : 1.1;
          act.time = Math.max(act.time, (act.getClip?.()?.duration ?? 1) * 0.45);
          act.setLoop(LoopOnce, 1);
          act.clampWhenFinished = true;
          if (!act.isRunning()) act.play();
          this._oneShotTimer = Math.max(
            0.35,
            ((act.getClip?.()?.duration ?? 0.6) - act.time) / Math.max(0.1, act.timeScale)
          );
          this.animState = 'attack';
          return true;
        }
        // Cancel — fade out charge, restore gait
        act.fadeOut(settings.character?.gaitBlend ?? 0.28);
      } catch {
        /* */
      }
    }
    this._oneShotTimer = 0.08;
    this._gaitLocked = false;
    this.animState = 'idle';
    const g = this._gait;
    this._gait = -1;
    this.setGait?.(g, g >= 2);
    return true;
  }

  /** Refresh weaponAttach pointer from R_hand (after equip). */
  syncWeaponAttach() {
    const hand = this.bones?.rHand;
    this.weaponAttach =
      getWeaponAttachFromHand(hand) || findWeaponAttach(this) || this.weaponAttach || null;
    return this.weaponAttach;
  }

  /**
   * Directional dodge one-shot — longbow standing dodge L/R/F/B preferred.
   * @param {'left'|'right'|'forward'|'back'} dir
   * @returns {boolean}
   */
  playDodge(dir) {
    const role = DODGE_ROLE[dir] || 'dodgeB';
    const candidates = [role, `longbow:${role}`, `combat_mobility:${role}`];
    for (const name of candidates) {
      if (this.actions.has(name)) {
        this.play(name, 0.08, { exclusive: true });
        const act = this.actions.get(name);
        const dur = act?.getClip?.()?.duration ?? settings.drc?.dodgeDuration ?? 0.42;
        this._oneShotTimer = Math.max(this._oneShotTimer, dur * 0.92);
        this._gaitLocked = true;
        this.animState = 'dodge';
        return true;
      }
    }
    // Fallback: jump clip as mobility tell
    if (this.actions.has('jump')) {
      this.play('jump', 0.08, { exclusive: true });
      this._oneShotTimer = 0.35;
      this._gaitLocked = true;
      this.animState = 'dodge';
      return true;
    }
    return false;
  }

  /**
   * Directional roll one-shot — Ghost Rider roll_* preferred (Ctrl+A/D).
   * Exclusive mixer weight so retargeted rolls do not dual-bind deform.
   * @param {'left'|'right'|'forward'|'back'} dir
   * @returns {{ ok: boolean, duration: number, role: string|null }}
   */
  playRoll(dir) {
    const role = ROLL_ROLE[dir] || 'rollB';
    const candidates = [role, `combat_mobility:${role}`, DODGE_ROLE[dir], `longbow:${DODGE_ROLE[dir]}`];
    for (const name of candidates) {
      if (!name || !this.actions.has(name)) continue;
      // Exclusive: fade every other action (idle/walk residual = rubber limbs)
      this.play(name, 0.06, { exclusive: true });
      const act = this.actions.get(name);
      const clipDur = act?.getClip?.()?.duration ?? settings.drc?.rollDuration ?? 0.55;
      // Prefer full clip; impulse syncs to this in DRC
      const dur = Math.max(0.4, clipDur * 0.98);
      this._oneShotTimer = Math.max(this._oneShotTimer, dur);
      this._gaitLocked = true;
      this.animState = 'roll';
      this._airJumpHold = false;
      return { ok: true, duration: dur, role: name };
    }
    const dodged = this.playDodge(dir);
    return { ok: !!dodged, duration: settings.drc?.dodgeDuration ?? 0.42, role: dodged ? 'dodge' : null };
  }

  /** Last exclusive roll clip duration (for impulse sync). */
  getRollClipDuration(dir) {
    const role = ROLL_ROLE[dir] || 'rollB';
    for (const name of [role, `combat_mobility:${role}`]) {
      const act = this.actions.get(name);
      const d = act?.getClip?.()?.duration;
      if (d > 0) return d;
    }
    return settings.drc?.rollDuration ?? 0.55;
  }

  /**
   * Sprint slide one-shot — prod running-slide (Shift+Ctrl while sprint).
   * @returns {boolean}
   */
  playSlide() {
    for (const name of ['slide', 'combat_mobility:slide']) {
      if (!this.actions.has(name)) continue;
      this.play(name, 0.06);
      const act = this.actions.get(name);
      const dur = act?.getClip?.()?.duration ?? settings.drc?.slideDuration ?? 0.72;
      this._oneShotTimer = Math.max(this._oneShotTimer, dur * 0.92);
      this._gaitLocked = true;
      this.animState = 'slide';
      return true;
    }
    // Fallback: forward roll if slide bake missing
    return this.playRoll('forward');
  }

  /** Parry / block one-shot (sword_shield block clip as longbow has no parry bake). */
  playParry() {
    for (const name of ['parry', 'block', 'sword_shield:block', 'combat_mobility:parry']) {
      if (this.actions.has(name)) {
        this.play(name, 0.08);
        const act = this.actions.get(name);
        const dur = act?.getClip?.()?.duration ?? 0.45;
        this._oneShotTimer = Math.max(this._oneShotTimer, dur * 0.9);
        this._gaitLocked = true;
        this.animState = 'parry';
        return true;
      }
    }
    return false;
  }

  /** Summary for lab Character tab. */
  getLabSummary() {
    const race = raceDef(this.raceId);
    const loadout = this.equipment?.loadout || {};
    const weaponSlot = ['sword', 'axe', 'hammer', 'spear', 'staff', 'bow'].find(
      (s) => loadout[s] && loadout[s] !== 'none'
    );
    return {
      raceId: this.raceId,
      raceLabel: race?.label || this.raceId,
      raceShort: race?.short || '',
      kitUrl: kitUrlForRace(this.raceId),
      atlasUrl: atlasUrlForRace(this.raceId),
      presetId: this.presetId,
      animPackId: this.animPackId,
      heightM: this.height,
      weaponSlot: weaponSlot || null,
      weaponVariant: weaponSlot ? loadout[weaponSlot] : null,
      loadout: { ...loadout },
      clips: this.listAnimRoles(),
      rideActive: !!this._rideActive
    };
  }

  async _bindPack(packId) {
    if (this._boundPacks.has(packId)) return;
    const pack = ANIM_PACKS[packId];
    if (!pack) return;

    const roleMap = {
      idle: LoopRepeat,
      cast: LoopRepeat,
      attack: LoopOnce,
      attack1: LoopOnce,
      attack2: LoopOnce,
      attack3: LoopOnce,
      finisher: LoopOnce,
      finisherAir: LoopOnce,
      hitReact: LoopOnce,
      knockedUp: LoopOnce,
      block: LoopOnce,
      parry: LoopOnce,
      walk: LoopRepeat,
      run: LoopRepeat,
      walkL: LoopRepeat,
      walkR: LoopRepeat,
      runL: LoopRepeat,
      runR: LoopRepeat,
      jump: LoopOnce,
      dodgeL: LoopOnce,
      dodgeR: LoopOnce,
      dodgeF: LoopOnce,
      dodgeB: LoopOnce,
      rollL: LoopOnce,
      rollR: LoopOnce,
      rollF: LoopOnce,
      rollB: LoopOnce,
      slide: LoopOnce,
      frontflip: LoopOnce,
      backflip: LoopOnce
    };

    for (const [role, rel] of Object.entries(pack)) {
      const name =
        this.actions.has(role) && packId !== this.animPackId ? `${packId}:${role}` : role;
      const urls = bakedClipUrlsForRole(rel);
      let loaded = false;
      /** @type {{ url: string, matched: import('three').AnimationClip }|null} */
      let fallbackNoHands = null;
      for (const url of urls) {
        try {
          const raw = await loadBakedClipJson(url);
          raw.name = name;
          const matched = rematchClipToSkeleton(this.model, raw, { stripPositions: true });
          if (!matched.tracks.length) {
            console.warn(`[CharacterController] empty tracks: ${url}`);
            continue;
          }
          // Prefer clips that drive hands for idle (prod standing-idle has hands;
          // open magic/standing idle does not → broken bind-pose hands on Toon).
          if (role === 'idle') {
            const hasHand = matched.tracks.some((t) => /Hand\.quaternion$/i.test(t.name));
            if (!hasHand) {
              if (!fallbackNoHands) fallbackNoHands = { url, matched };
              console.warn(
                `[CharacterController] idle without Hand tracks (try next): ${url}`
              );
              continue;
            }
          }
          this._registerClip(name, matched, roleMap[role] ?? LoopRepeat);
          console.info(`[CharacterController] clip ${name} ← ${url} tracks=${matched.tracks.length}`);
          loaded = true;
          break;
        } catch {
          /* try next URL */
        }
      }
      if (!loaded && fallbackNoHands) {
        this._registerClip(name, fallbackNoHands.matched, roleMap[role] ?? LoopRepeat);
        console.warn(
          `[CharacterController] idle fallback (no hands) ← ${fallbackNoHands.url}`
        );
        loaded = true;
      }
      if (!loaded) {
        // Real flip FBX from Open when baked JSON missing (striker / extra packs)
        if ((role === 'frontflip' || role === 'backflip') && this.model) {
          const fbxList = FLIP_FBX_URLS[role] || [];
          for (const fbxUrl of fbxList) {
            try {
              const clip = await loadFbxClipRematched(fbxUrl, this.model, role);
              if (clip?.tracks?.length) {
                this._registerClip(name, clip, LoopOnce);
                console.info(
                  `[CharacterController] clip ${name} ← FBX ${fbxUrl} tracks=${clip.tracks.length}`
                );
                loaded = true;
                break;
              }
            } catch {
              /* next */
            }
          }
        }
      }
      if (!loaded) {
        console.warn(`[CharacterController] clip fail role=${role}`, rel);
      }
    }

    this._boundPacks.add(packId);
  }

  _registerClip(name, clip, loopMode) {
    if (!this.mixer) return;
    const action = this.mixer.clipAction(clip);
    action.setLoop(loopMode, loopMode === LoopOnce ? 1 : Infinity);
    action.clampWhenFinished = loopMode === LoopOnce;
    this.actions.set(name, action);
  }

  applyLoadout(loadout, meta = {}) {
    if (!this.model) return { matched: 0, missing: ['no-model'] };
    if (meta.presetId) this.presetId = meta.presetId;
    const race = raceDef(this.raceId);
    const clean = { ...loadout };
    delete clean.bag;
    delete clean.wood;
    delete clean.quiver;
    const meshIds = loadoutToMeshIds(race.prefix, clean);
    const report = applyMeshIdsExclusive(this.model, meshIds);
    this.equipment?.hideUtility?.();
    if (this.equipment) this.equipment.loadout = { ...clean };
    reGroundToonKit(this.model, 0);
    this.height = this.model.userData.deployHeightM || this.height;
    this.headPosition.set(0, this.height * 0.86, 0);
    this.bones = this.equipment?.findBones?.() || this.bones;

    // Weapon mesh → anim pack (staff→magic, bow→longbow, melee→sword_shield)
    const wantPack = animPackForLoadout(clean, meta.pack || this.animPackId);
    if (wantPack !== this.animPackId || meta.forcePack) {
      // Fire-and-forget bind; callers can await syncAnimPackFromLoadout
      this._pendingPack = wantPack;
      this.syncAnimPackFromLoadout({ packHint: meta.pack }).catch(() => {});
    } else if (this.actions.has('idle') && this.animState === 'idle') {
      this.play('idle', 0.2);
    }
    return report;
  }

  /**
   * Bind anim pack from current equipment loadout (weapon slot SSOT).
   * @param {{ packHint?: string }} [opts]
   */
  async syncAnimPackFromLoadout(opts = {}) {
    const loadout = this.equipment?.loadout || {};
    const pack = animPackForLoadout(loadout, opts.packHint || this.animPackId);
    const slot = activeWeaponSlot(loadout);
    await this.setAnimPack(pack);
    await this._bindPack('combat_mobility');
    await this._bindPack('reactions');
    console.info(
      `[CharacterController] weapon pack ${pack} slot=${slot || 'none'} · ${packCombatBlurb(pack)}`
    );
    return pack;
  }

  applyPreset(presetId) {
    const preset = this.presets.find((p) => p.id === presetId);
    if (!preset) return null;
    this.presetId = presetId;
    this.animPackId = this._packFromPreset(preset);
    return this.applyLoadout(preset.loadout, { pack: preset.pack, presetId, forcePack: true });
  }

  /**
   * Combat one-shot for equipped weapon pack (attack vs cast).
   * @param {'attack'|'cast'|'block'|'finisher'|'finisherAir'} intent
   */
  playWeaponCombat(intent = 'attack') {
    const pack = this.animPackId || 'magic';
    if (intent === 'block') return this.playParry() || this.requestOneShot('block');
    if (pack === 'magic' || intent === 'cast') {
      return this.requestOneShot('cast') || this.requestOneShot('attack');
    }
    if (intent === 'finisherAir') {
      return this.playMeleeFinisher({ airborne: true });
    }
    if (intent === 'finisher') {
      return this.playMeleeFinisher({ airborne: false });
    }
    // Default light: advance 3-hit combo (not the jump-dash finisher clip)
    if (pack === 'sword_shield' || intent === 'attack') {
      return this.playMeleeComboLight() || this.requestOneShot('attack');
    }
    return this.requestOneShot('attack') || this.requestOneShot('cast');
  }

  /**
   * Grounded light melee — cycles attack1 → attack2 → attack3 within chain window.
   * Does NOT play the jump-dash finisher (that is playMeleeFinisher).
   * @returns {{ ok: boolean, step: number, role: string|null, kind: 'light'|'none' }}
   */
  playMeleeComboLight() {
    const cfg = settings.meleeCombo || {};
    const maxHits = Math.max(1, Math.min(3, cfg.hits ?? 3));
    const windowS = cfg.chainWindow ?? 0.85;
    const now = performance.now() / 1000;
    let step = 0;
    if (this._meleeComboStep >= 0 && now <= this._meleeComboUntil) {
      step = Math.min(this._meleeComboStep + 1, maxHits - 1);
    } else {
      step = 0;
    }
    const roles = [`attack${step + 1}`, 'attack1', 'attack2', 'attack3'];
    // Prefer exact step role, then any light role, never jump-dash `attack` first
    let played = null;
    for (const role of roles) {
      if (this.requestOneShot(role)) {
        played = role;
        break;
      }
    }
    if (!played) {
      // Last resort: CDN slash if bound under attack without combo bakes
      if (this.requestOneShot('attack')) {
        played = 'attack';
      }
    }
    if (!played) return { ok: false, step, role: null, kind: 'none' };
    this._meleeComboStep = step;
    this._meleeComboUntil = now + windowS;
    this.animState = 'attack';
    return { ok: true, step, role: played, kind: 'light' };
  }

  /**
   * Finisher: current sword_shield “attack” (jump/dash) or air drop.
   * Resets light combo chain.
   * @param {{ airborne?: boolean }} [opts]
   * @returns {{ ok: boolean, step: number, role: string|null, kind: 'finisher'|'finisherAir'|'none' }}
   */
  playMeleeFinisher(opts = {}) {
    const air = !!opts.airborne;
    this._meleeComboStep = -1;
    this._meleeComboUntil = 0;
    const prefer = air
      ? ['finisherAir', 'attack', 'finisher', 'attack3']
      : ['finisher', 'attack', 'finisherAir', 'attack3'];
    for (const role of prefer) {
      if (this.requestOneShot(role)) {
        this.animState = 'attack';
        return { ok: true, step: -1, role, kind: air ? 'finisherAir' : 'finisher' };
      }
    }
    return { ok: false, step: -1, role: null, kind: 'none' };
  }

  /**
   * Resolve next melee one-shot from combat context.
   * @param {{ airborne?: boolean, largeMmTowardTarget?: boolean, forceFinisher?: boolean }} ctx
   */
  playMeleeAttack(ctx = {}) {
    const pack = this.animPackId || 'magic';
    if (pack === 'magic') {
      const ok = this.requestOneShot('cast') || this.requestOneShot('attack');
      return { ok, step: -1, role: ok ? 'cast' : null, kind: ok ? 'cast' : 'none' };
    }
    if (pack !== 'sword_shield' && pack !== 'longbow') {
      const ok = this.requestOneShot('attack');
      return { ok, step: -1, role: ok ? 'attack' : null, kind: ok ? 'light' : 'none' };
    }
    if (pack === 'longbow') {
      const ok = this.requestOneShot('attack');
      return { ok, step: -1, role: ok ? 'attack' : null, kind: ok ? 'ranged' : 'none' };
    }
    // sword_shield: air or large MM → finisher; else light combo
    if (ctx.forceFinisher || ctx.airborne || ctx.largeMmTowardTarget) {
      return this.playMeleeFinisher({ airborne: !!ctx.airborne });
    }
    return this.playMeleeComboLight();
  }

  /**
   * Play clip with improved locomotion/combat blending (Warlords production feel).
   * Gait uses longer fades; attacks/casts shorter.
   * @param {string} name
   * @param {number} [fadeDuration]
   * @param {{ exclusive?: boolean }} [opts] exclusive = fade out every other action (rolls)
   */
  play(name, fadeDuration = 0.35, opts = {}) {
    const next = this.actions.get(name);
    if (!next) return;
    if (next === this.current && next.isRunning() && !opts.exclusive) return;

    // Smoother gait blends; snappier combat one-shots
    const isGait =
      /^(idle|walk|run|walkL|walkR|runL|runR)$/i.test(name) ||
      /:idle$|:walk$|:run$/i.test(name);
    const isCombat =
      /attack|finisher|cast|dodge|roll|slide|jump|parry|block|skill|gunplay|charg|reload|whip/i.test(
        name
      );
    let fade = fadeDuration;
    if (isGait) fade = Math.max(fade, settings.character?.gaitBlend ?? 0.28);
    else if (/charg|skill2/i.test(name))
      fade = Math.max(fade, settings.character?.chargeBlend ?? 0.2);
    else if (isCombat) fade = Math.min(fade, settings.character?.combatBlend ?? 0.12);
    if (opts.exclusive) fade = Math.min(fade, 0.08);

    // Rolls/dodges: kill residual weights so limbs don't dual-bind (deform)
    if (opts.exclusive) {
      for (const [, act] of this.actions) {
        if (act === next) continue;
        try {
          if (act.isRunning() || act.getEffectiveWeight() > 0.02) {
            act.fadeOut(fade);
          }
        } catch {
          /* */
        }
      }
    }

    next.reset();
    next.enabled = true;
    next.setEffectiveTimeScale(1);
    next.setEffectiveWeight(1);
    try {
      if (opts.exclusive || isCombat) {
        next.setLoop(LoopOnce, 1);
        next.clampWhenFinished = true;
      }
    } catch {
      /* */
    }

    if (this.current && this.current !== next && fade > 0 && !opts.exclusive) {
      next.crossFadeFrom(this.current, fade, true);
    } else if (opts.exclusive) {
      next.fadeIn(fade);
    } else if (this.current && this.current !== next && fade > 0) {
      next.crossFadeFrom(this.current, fade, true);
    }
    next.play();
    this.current = next;
  }

  /**
   * Channel cast pose — loops cast clip while true; restores gait when false.
   * @param {boolean} isCasting
   * @param {{ aimX?: number, aimY?: number, aimZ?: number }} [aim]
   */
  setCasting(isCasting, aim = null) {
    const next = !!isCasting;
    if (aim && Number.isFinite(aim.aimX)) {
      this._castAim = { x: aim.aimX, y: aim.aimY ?? 1.2, z: aim.aimZ ?? 0 };
    }
    if (next === this._castingExternal) return;
    this._castingExternal = next;
    if (next) {
      // Hold gait lock + loop cast for channel window
      this._gaitLocked = true;
      this._oneShotTimer = 0;
      if (this.actions.has('cast')) {
        const act = this.actions.get('cast');
        try {
          act.setLoop(LoopRepeat, Infinity);
          act.clampWhenFinished = false;
        } catch {
          /* three version variance */
        }
        this.animState = 'cast_loop';
        this.play('cast', 0.12);
      } else if (this.actions.has('attack')) {
        this.animState = 'cast_loop';
        this.play('attack', 0.12);
      }
    } else {
      this._gaitLocked = false;
      this._castAim = null;
      // Restore one-shot loop mode on cast clip if needed
      if (this.actions.has('cast')) {
        try {
          const act = this.actions.get('cast');
          act.setLoop(LoopOnce, 1);
          act.clampWhenFinished = true;
        } catch {
          /* */
        }
      }
      if (this.animState === 'cast_loop') {
        this.animState = 'idle';
        if (this.actions.has('idle')) this.play('idle', 0.2);
      }
    }
  }

  /**
   * @param {0|1|2|number} level 0 idle, 1 walk, 2 run
   * @param {boolean} [sprinting]
   * @param {{ strafe?: 'left'|'right'|null }} [opts] focus-mode side gait
   */
  setGait(level, sprinting = false, opts = {}) {
    if (this._gaitLocked) return;
    if (this._castingExternal && level === 0) return;
    const g = sprinting ? 2 : MathUtils.clamp(level | 0, 0, 2);
    const strafe = opts.strafe === 'left' || opts.strafe === 'right' ? opts.strafe : null;
    const key = `${g}:${strafe || 'fwd'}`;
    if (key === this._gaitKey && this.animState !== 'attack') return;
    this._gait = g;
    this._gaitKey = key;
    this._strafe = strafe;

    if (g === 0) {
      if (this.actions.has('idle') && this.animState !== 'cast_loop') {
        this.animState = 'idle';
        this.play('idle', 0.2);
      }
      return;
    }

    // Focus strafe: prefer walkL/R or runL/R; fall back to forward walk/run
    if (strafe) {
      const side = strafe === 'left' ? 'L' : 'R';
      const prefer =
        g >= 2
          ? [`run${side}`, `walk${side}`, 'run', 'walk']
          : [`walk${side}`, `run${side}`, 'walk', 'run'];
      for (const role of prefer) {
        if (this.actions.has(role)) {
          this.animState = role.startsWith('run') ? 'run' : 'walk';
          this.play(role, 0.14);
          return;
        }
      }
    }

    if (g === 1) {
      const walk = this.actions.has('walk') ? 'walk' : this.actions.has('run') ? 'run' : null;
      if (walk) {
        this.animState = 'walk';
        this.play(walk, 0.18);
      }
    } else {
      const run = this.actions.has('run') ? 'run' : this.actions.has('walk') ? 'walk' : null;
      if (run) {
        this.animState = 'run';
        this.play(run, 0.15);
      }
    }
  }

  requestOneShot(role) {
    let name = null;
    const tryNames = [];
    if (role === 'attack') {
      tryNames.push('attack', 'sword_shield:attack', 'finisher', 'cast');
    } else if (role === 'cast') {
      tryNames.push('cast', 'attack');
    } else if (role === 'block') {
      tryNames.push('block');
    } else if (role === 'finisher') {
      tryNames.push('finisher', 'attack', 'sword_shield:attack');
    } else if (role === 'finisherAir') {
      tryNames.push('finisherAir', 'attack', 'finisher');
    } else if (/^attack[123]$/.test(role)) {
      tryNames.push(role, `sword_shield:${role}`, 'attack1', 'attack2', 'attack3');
    } else if (role === 'hitReact' || role === 'knockedUp') {
      tryNames.push('hitReact', 'knockedUp', 'reactions:hitReact', 'reactions:knockedUp');
    } else {
      tryNames.push(role);
    }
    for (const n of tryNames) {
      if (this.actions.has(n)) {
        name = n;
        break;
      }
    }
    if (!name) return false;

    this._gaitLocked = true;
    this.animState =
      role === 'cast'
        ? 'cast_loop'
        : role === 'reload' || /reload/i.test(name)
          ? 'reload'
          : 'attack';
    this.play(name, 0.1);
    const act = this.actions.get(name);
    // Pistol fire / draw / reload cadence (TPS-aligned timeScale)
    if (this.animPackId === 'pistol' && act) {
      if (/reload/i.test(role + name)) act.timeScale = pistolTimeScale('reload');
      else if (/draw|block|cast/i.test(role + name)) act.timeScale = pistolTimeScale('draw');
      else if (/whip|skill3/i.test(role + name)) act.timeScale = pistolTimeScale('whip');
      else if (/charged|skill2/i.test(role + name)) act.timeScale = pistolTimeScale('charged');
      else act.timeScale = pistolTimeScale('fire');
    } else if (act && act.timeScale !== 1) {
      act.timeScale = 1;
    }
    const duration =
      (act?.getClip?.()?.duration ?? 0.8) / Math.max(0.05, act?.timeScale || 1);
    // Light combo steps: don't lock gait for full clip (chain window needs free click)
    const isLight = /^attack[123]$/.test(role) || /^attack[123]$/.test(name);
    const lockDur = isLight ? Math.min(duration, 0.55) + 0.02 : duration + 0.04;
    this._oneShotTimer = lockDur;
    this._attackTimer = this._oneShotTimer;
    return true;
  }

  playWeaponAttack() {
    // Light combo for sword_shield; finisher only via playMeleeAttack context
    if (this.animPackId === 'sword_shield') {
      const r = this.playMeleeComboLight();
      return !!r.ok;
    }
    return this.requestOneShot('attack');
  }

  /**
   * Physical hit reaction — knocked-up bake (reactions pack).
   * @returns {boolean}
   */
  playHitReaction() {
    if (this.requestOneShot('hitReact') || this.requestOneShot('knockedUp')) {
      this.animState = 'attack';
      return true;
    }
    // Soft fallback: brief gait lock
    this._gaitLocked = true;
    this._oneShotTimer = Math.max(this._oneShotTimer, 0.45);
    return false;
  }

  playCastFlourish() {
    this.requestOneShot('cast');
  }

  /**
   * Jump one-shot (blend from gait). With holdAir, pose stays until land.
   * @param {number} [fade=0.08]
   * @param {{ holdAir?: boolean }} [opts]
   */
  playJump(fade = 0.08, opts = {}) {
    this._airJumpHold = !!opts.holdAir;
    if (this.actions.has('jump')) {
      this._gaitLocked = true;
      this.animState = 'jump';
      this.play('jump', fade);
      const duration = this.actions.get('jump')?.getClip()?.duration ?? 0.55;
      // Hold: clamp near end of jump clip until clearAirJumpHold (landing)
      if (this._airJumpHold) {
        this._oneShotTimer = 999;
        try {
          const act = this.actions.get('jump');
          act.clampWhenFinished = true;
        } catch {
          /* */
        }
      } else {
        this._oneShotTimer = Math.min(duration, 0.7) + 0.02;
      }
      this._attackTimer = this._oneShotTimer;
      return true;
    }
    this._gaitLocked = true;
    this.animState = 'jump';
    this._oneShotTimer = this._airJumpHold ? 999 : 0.45;
    return false;
  }

  /** Keep jump pose while airborne (called from combat loco). */
  holdAirJumpPose() {
    if (!this._airJumpHold) return;
    if (this._flipActive) return;
    if (this.animState === 'attack' || this.animState === 'cast_loop') return;
    if (this.actions.has('jump') && this.animState !== 'jump') {
      this.animState = 'jump';
      this.play('jump', 0.12);
    }
    this._gaitLocked = true;
    this._oneShotTimer = Math.max(this._oneShotTimer, 0.5);
  }

  /** Release jump hold on land. */
  clearAirJumpHold() {
    this._airJumpHold = false;
    if (this.animState === 'jump') {
      this._gaitLocked = false;
      this._oneShotTimer = 0;
      if (this.actions.has('idle')) {
        this.animState = 'idle';
        this.play('idle', 0.15);
      }
    }
  }

  /**
   * Backflip — prefer real striker/backflip clip; procedural tilt only as fallback.
   * Camera hold yaw is set by combat (setup move — do not whip cam 180°).
   * @param {number} duration seconds (used if procedural)
   * @param {{ holdYaw?: number }} [opts]
   */
  playBackflip(duration = 0.55, opts = {}) {
    this._airJumpHold = false;
    this._flipSign = -1;
    this._flipCameraHoldYaw = Number.isFinite(opts.holdYaw) ? opts.holdYaw : this.facing;
    // Real clip path
    if (this.actions.has('backflip') || this.actions.has('combat_mobility:backflip')) {
      const role = this.actions.has('backflip') ? 'backflip' : 'combat_mobility:backflip';
      this.play(role, 0.07, { exclusive: true });
      const act = this.actions.get(role);
      const dur = act?.getClip?.()?.duration ?? duration;
      this._flipUseClip = true;
      this._flipActive = false; // no procedural tilt spin
      this._flipTime = 0;
      this._flipDuration = Math.max(0.35, dur * 0.98);
      this._oneShotTimer = Math.max(this._oneShotTimer, this._flipDuration);
      this._gaitLocked = true;
      this.animState = 'flip';
      return true;
    }
    // Procedural fallback
    this._flipUseClip = false;
    this._flipTime = 0;
    this._flipDuration = Math.max(0.2, duration);
    this._flipActive = true;
    this.playJump(0.05, { holdAir: false });
    this._oneShotTimer = Math.max(this._oneShotTimer, duration + 0.05);
    this.animState = 'jump';
    return true;
  }

  /**
   * Frontflip — real extra/front-flip clip preferred (double-jump / windsurf).
   * @param {number} duration
   */
  playFrontflip(duration = 0.48) {
    this._airJumpHold = false;
    this._flipSign = 1;
    this._flipCameraHoldYaw = null; // frontflip may follow motion
    if (this.actions.has('frontflip') || this.actions.has('combat_mobility:frontflip')) {
      const role = this.actions.has('frontflip') ? 'frontflip' : 'combat_mobility:frontflip';
      this.play(role, 0.07, { exclusive: true });
      const act = this.actions.get(role);
      const dur = act?.getClip?.()?.duration ?? duration;
      this._flipUseClip = true;
      this._flipActive = false;
      this._flipDuration = Math.max(0.3, dur * 0.98);
      this._oneShotTimer = Math.max(this._oneShotTimer, this._flipDuration);
      this._gaitLocked = true;
      this.animState = 'flip';
      return true;
    }
    this._flipUseClip = false;
    this._flipTime = 0;
    this._flipDuration = Math.max(0.22, duration);
    this._flipActive = true;
    this.playJump(0.05, { holdAir: false });
    this._oneShotTimer = Math.max(this._oneShotTimer, duration + 0.05);
    this.animState = 'jump';
    return true;
  }

  /** True while clip or procedural flip is live. */
  get isFlipping() {
    return !!(this._flipActive || (this._flipUseClip && this.animState === 'flip'));
  }

  get isBackflip() {
    return this.isFlipping && this._flipSign < 0;
  }

  /** Cancel flip (land). */
  clearFlip() {
    this._flipActive = false;
    this._flipTime = 0;
    this._flipSign = -1;
    this._flipUseClip = false;
    this._flipCameraHoldYaw = null;
    this.setLean(0);
    if (this.animState === 'flip') {
      this._gaitLocked = false;
      this.animState = 'idle';
    }
  }

  /** World-space cast / projectile origin (hand container or approx chest). */
  getCastOrigin(out) {
    const target = out || _castOrigin;
    const hand = this.bones?.rHand;
    if (hand) {
      hand.getWorldPosition(target);
      return target;
    }
    this.root.getWorldPosition(target);
    target.y += this.height * 0.72;
    target.z += Math.cos(this.facing) * 0.25;
    target.x += Math.sin(this.facing) * 0.25;
    return target;
  }

  /**
   * Weapon tip / barrel muzzle world position.
   * Pistol: WeaponAttach muzzle marker (barrel tip). Melee: facing offset from grip.
   * @param {import('three').Vector3} [out]
   * @param {number} [tipOffsetM] metres along blade from grip (melee fallback)
   */
  getWeaponTip(out, tipOffsetM = 0.55) {
    const target = out || _castOrigin;
    const attach =
      this.weaponAttach || getWeaponAttachFromHand(this.bones?.rHand) || findWeaponAttach(this);
    if (attach) this.weaponAttach = attach;

    // Flintlock / any WeaponAttach with muzzle — true barrel tip
    if (attach?.userData?.muzzle || attach?.userData?.profile === 'pistol') {
      getMuzzleWorld(attach, target);
      if (target.lengthSq() > 1e-8) return target;
    }

    this.getCastOrigin(target);
    const off =
      this.animPackId === 'pistol'
        ? FLINTLOCK_FIRE.muzzleFallbackM
        : Number.isFinite(tipOffsetM)
          ? tipOffsetM
          : 0.55;
    // Blade roughly forward + slight up from hand (SI)
    target.x += Math.sin(this.facing) * off;
    target.z += Math.cos(this.facing) * off;
    target.y += off * 0.12;
    return target;
  }

  /**
   * Barrel / blade forward unit (world). Pistol uses grip→muzzle.
   * @param {import('three').Vector3} [out]
   */
  getWeaponForward(out = new Vector3()) {
    const attach =
      this.weaponAttach || getWeaponAttachFromHand(this.bones?.rHand) || findWeaponAttach(this);
    if (attach?.userData?.muzzle || attach?.userData?.profile === 'pistol') {
      return getBarrelForward(attach, out);
    }
    out.set(Math.sin(this.facing), 0.05, Math.cos(this.facing)).normalize();
    return out;
  }

  /**
   * Enable windsurf deck/boom IK. Only while WalkController ride is live.
   * DRC combat checks `_rideActive` and yields locomotion.
   * @param {boolean} active
   * @param {number} [yaw] board heading for knee/elbow poles
   */
  setRideActive(active, yaw) {
    this._rideActive = !!active;
    if (Number.isFinite(yaw)) this._rideYaw = yaw;
    if (this.rideIk) this.rideIk.setActive(this._rideActive);
    if (this._rideActive) {
      // Hold idle gait under ride — mixer still runs, IK overrides limbs
      this.setGait?.(0, false);
      this._gaitLocked = true;
    } else {
      this._gaitLocked = false;
      this._rideParented = false;
    }
  }

  /**
   * Mark that character.root is parented under the windsurf vehicle seat.
   * While true, placeAt / world locomotion must not write root.position.
   * @param {boolean} parented
   */
  setRideParented(parented) {
    this._rideParented = !!parented;
  }

  get isRideParented() {
    return !!this._rideParented;
  }

  /**
   * Vehicle deployed (hide stowed back mesh) or land (show stow).
   * @param {boolean} deployed
   */
  setBackSlotDeployed(deployed) {
    this.backSlot?.setDeployed?.(!!deployed);
  }

  /**
   * Equip / clear back utility (windsurf, future glider…).
   * @param {string} itemId
   * @param {{ modelUrl?: string }} [opts]
   */
  async equipBackSlot(itemId, opts = {}) {
    if (!this.backSlot && this.model) this.backSlot = new BackSlotEquip(this.model);
    if (!this.backSlot) return null;
    settings.walk = settings.walk || {};
    settings.walk.backSlot = itemId || 'none';
    return this.backSlot.equip(itemId || 'none', opts);
  }

  /**
   * World sockets from HoverboardRide.getIkWorldTargets().
   * @param {Record<string, import('three').Vector3|{x:number,y:number,z:number}>} worldSockets
   * @param {number} [yaw]
   */
  setRideSockets(worldSockets, yaw) {
    if (Number.isFinite(yaw)) this._rideYaw = yaw;
    if (!this.rideIk) return;
    this.rideIk.setTargets(worldSockets);
  }

  setPose(pose) {
    // Standing stance only on Bip001 (no Mixamo lotus)
    settings.character.pose = 'idle';
    return 'idle';
  }
  togglePose() {
    return this.setPose('idle');
  }
  get isSitting() {
    return false;
  }
  get poseWeight() {
    return 0;
  }

  setFacing(yaw) {
    // While parented to board, yaw is board group rotation — keep root local 0
    if (this._rideParented || this._rideActive) {
      this._rideYaw = yaw;
      this.root.rotation.y = 0;
      return;
    }
    this.root.rotation.y = yaw;
  }

  get facing() {
    if (this._rideParented || this._rideActive) {
      return this._rideYaw || 0;
    }
    return this.root.rotation.y;
  }

  setLean(angle) {
    if (this._flipActive) return; // backflip owns tilt
    // Board banks the vehicle; keep mild body lean only when not parented
    if (this._rideParented) return;
    this.tilt.quaternion.setFromAxisAngle(this.forwardAxis, angle);
  }

  resetPlacement() {
    if (this._rideParented) return; // WalkController owns unparent first
    this.root.position.y = 0;
    this.setLean(0);
    this.setRideActive(false);
  }

  /**
   * After windsurf dismount: land controller normal (no ride IK / no parent).
   * Call only after WalkController has unparented root to the scene.
   * @param {{ x?: number, y?: number, z?: number, yaw?: number }} [pose]
   */
  restoreFromRide(pose = {}) {
    this._rideParented = false;
    this.setRideActive(false);
    this._gaitLocked = false;
    this._softHipRide = 0;
    this.clearFlip?.();
    this.setLean(0);
    if (this.rideIk) {
      this.rideIk.setActive(false);
      this.rideIk.weight = 0;
      // Restore bind hip Y after absolute drop
      if (this.rideIk.hips && Number.isFinite(this.rideIk._hipBindY)) {
        this.rideIk.hips.position.y = this.rideIk._hipBindY;
      }
    }
    this.setBackSlotDeployed(false);
    // Free root orientation for land loco
    this.root.rotation.x = 0;
    this.root.rotation.z = 0;
    this.root.scale.set(1, 1, 1);
    if (Number.isFinite(pose.yaw)) this.root.rotation.y = pose.yaw;
    if (Number.isFinite(pose.x) || Number.isFinite(pose.z)) {
      this.root.position.set(
        Number.isFinite(pose.x) ? pose.x : this.root.position.x,
        Number.isFinite(pose.y) ? pose.y : 0,
        Number.isFinite(pose.z) ? pose.z : this.root.position.z
      );
    } else if (Number.isFinite(pose.y)) {
      this.root.position.y = pose.y;
    } else {
      this.root.position.y = 0;
    }
    this.setGait?.(0, false);
  }

  update(dt) {
    if (!this.mixer) return;

    // While riding, do not run combat one-shot / cast gait machine over limbs
    if (!this._rideActive) {
      if (this._oneShotTimer > 0) {
        this._oneShotTimer -= dt;
        this._attackTimer = this._oneShotTimer;
        if (this._oneShotTimer <= 0) {
          this._gaitLocked = false;
          if (this._castingExternal && this.actions.has('cast')) {
            this.animState = 'cast_loop';
            this.play('cast', 0.2);
          } else {
            const g = this._gait;
            this._gait = -1;
            this.setGait(g, g >= 2);
          }
        }
      } else if (!this._gaitLocked) {
        if (this._castingExternal && this.actions.has('cast') && this._gait === 0) {
          if (this.animState !== 'cast_loop') {
            this.animState = 'cast_loop';
            this.play('cast', 0.15);
          }
        } else if (this.animState === 'cast_loop' && !this._castingExternal) {
          this.animState = 'idle';
          if (this.actions.has('idle')) this.play('idle', 0.25);
        }
      }
    }

    this.mixer.timeScale = settings.global.animationSpeed;
    this.mixer.update(dt);

    // Flintlock procedural reload (post-mixer bone / weapon overlay)
    if (this._pistolReload?.active) {
      this._pistolReload.update(dt);
    }

    // Soft hand aim toward soft-lock / cast target (optional HandIK)
    if (this.ik?.aimWeight > 1e-3) this.ik.update?.();

    // Back-slot windsurf sail cloth (stow visible) — vertex wind only
    this.backSlot?.update?.(dt, { wind: this._gait >= 2 ? 1.35 : this._gait >= 1 ? 1.1 : 0.85 });

    // Procedural flip: full revolution about local right (X) on tilt
    // _flipSign −1 backflip · +1 frontflip (windsurf deploy)
    if (this._flipActive) {
      this._flipTime += dt;
      const u = MathUtils.clamp(this._flipTime / this._flipDuration, 0, 1);
      const sign = this._flipSign >= 0 ? 1 : -1;
      const angle = sign * u * Math.PI * 2;
      this.tilt.quaternion.setFromAxisAngle(_flipAxis, angle);
      if (u >= 1) {
        this._flipActive = false;
        this.setLean(0);
      }
    }

    // Ride IK: default here if WalkController did not call applyRiderIk this frame.
    // Preferred order (SSOT): walk.update → character.update (mixer) → walk.applyRiderIk
    if (!this._rideIkExternal) {
      this.applyRideIk(dt);
    }
    this._rideIkExternal = false;
  }

  /**
   * Post-mixer windsurf IK (feet deck · hands boom).
   * Call from WalkController.applyRiderIk after character.update so mixer wins first.
   * @param {number} dt
   */
  applyRideIk(dt) {
    if (!this.rideIk || !(this._rideActive || this.rideIk.weight > 1e-3)) return;
    const yaw = this._rideYaw || this.facing;
    _rideFwd.set(Math.sin(yaw), 0, Math.cos(yaw));
    _rideLeft.set(Math.cos(yaw), 0, -Math.sin(yaw));
    this.rideIk.update(dt, {
      boardForward: _rideFwd,
      boardLeft: _rideLeft,
      hipDrop: (settings.walk?.hipDrop ?? 0.1) + (this._softHipRide || 0)
    });
  }

  /**
   * World feet position. While parented to windsurf, root.position is local —
   * always return world so camera / dust / systems do not "drag" local coords.
   */
  get position() {
    const p = this.root.parent;
    const parented =
      this._rideParented ||
      p?.name === 'RideSeat' ||
      p?.name?.startsWith?.('socket_') ||
      p?.name === 'RideBody';
    if (parented) {
      this.root.getWorldPosition(this._worldPos);
      return this._worldPos;
    }
    return this.root.position;
  }

  /** Write world feet into out (safe while parented). */
  getWorldPosition(out = this._worldPos) {
    this.root.getWorldPosition(out);
    return out;
  }

  dispose() {
    this.mixer?.stopAllAction();
    this.mixer = null;
    this.actions.clear();
    disposeObject(this.root);
  }
}
