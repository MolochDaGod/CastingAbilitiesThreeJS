import {
  AnimationMixer,
  ClampToEdgeWrapping,
  Group,
  LoopOnce,
  LoopRepeat,
  MathUtils,
  SRGBColorSpace,
  Vector3
} from 'three';
import { clone as skeletonClone } from 'three/addons/utils/SkeletonUtils.js';
import {
  ANIM_PACKS,
  DEFAULT_RACE,
  FALLBACK_PRESETS,
  GEAR_PRESETS_URL,
  bakedClipUrl
} from '../config/assets.js';
import {
  atlasUrlForRace,
  kitUrlForRace,
  loadoutToMeshIds,
  raceDef
} from '../config/grudge6SSOT.js';
import { EquipmentManager } from '../character/EquipmentManager.js';
import {
  applyBodyAtlas,
  countSkeletons,
  deployGrudge6Model,
  diagnoseCharacterLook,
  prepMeshFlags,
  reGroundAfterAnimSample,
  unifySkeletons
} from '../character/grudge6Deploy.js';
import { HandIK } from '../character/HandIK.js';
import { RideIK } from '../character/RideIK.js';
import { settings } from '../config/settings.js';
import { disposeObject } from '../utils/dispose.js';
import { loadBakedClipJson, rematchClipToSkeleton } from './bakeClip.js';
import { SittingPose } from './SittingPose.js';

/**
 * grudge6 / Toon RTS character:
 *  - GLTFLoader path (via AssetLoader) + SkeletonUtils.clone
 *  - EquipmentManager mesh visibility
 *  - single AnimationMixer
 *  - cast loop while abilities active; weapon attack one-shot
 *  - HandIK cast origin + soft aim
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

    this.sitting = null;
    this._poseWeight = 0;
    this._poseTime = 0;
    this._poseBlend = null;

    this.equipment = null;
    this.ik = null;
    /** @type {import('../character/RideIK.js').RideIK|null} */
    this.rideIk = null;
    this._rideActive = false;
    this.raceId = DEFAULT_RACE;
    this.animPackId = 'magic';
    this.presetId = 'mage';
    this.presets = FALLBACK_PRESETS.slice();

    /** 'idle' | 'walk' | 'run' | 'cast_loop' | 'attack' | 'sit' */
    this.animState = 'idle';
    this._attackTimer = 0;
    this._oneShotTimer = 0;
    this._castingExternal = false;
    this._boundPacks = new Set();
    /** Gait: 0 idle, 1 walk, 2 run/sprint */
    this._gait = 0;
    this._gaitLocked = false; // true during one-shots
  }

  /**
   * @param {import('../loaders/AssetLoader.js').AssetLoader} assets
   * @param {{ raceId?: string, presetId?: string }} [opts]
   */
  async load(assets, opts = {}) {
    this.raceId = opts.raceId || DEFAULT_RACE;
    this.presetId = opts.presetId || 'mage';

    await this._loadPresets();

    const race = raceDef(this.raceId);
    const kitUrl = kitUrlForRace(this.raceId);
    const atlasUrl = atlasUrlForRace(this.raceId);

    const [gltf, atlas] = await Promise.all([
      assets.loadGLTF(kitUrl),
      assets.loadTexture(atlasUrl).catch((err) => {
        console.warn('[CharacterController] atlas failed', err);
        return null;
      })
    ]);
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

    // NEVER plain scene.clone() on skinned kits — bag-blob / broken skinning.
    const kit = skeletonClone(gltf.scene);
    kit.name = `${race.id}_Characters`;
    kit.userData.importPipeline = 'glb-baked';
    kit.userData.importUrl = kitUrl;

    // REQUIRED: modular grudge6 kits ship many disconnected skeletons.
    // Without unify, idle clips only move one bone tree → exploded mesh.
    const skBefore = countSkeletons(kit);
    unifySkeletons(kit);
    const skAfter = countSkeletons(kit);
    if (skBefore > 1) {
      console.info(`[CharacterController] skeletons ${skBefore} → ${skAfter} (unify)`);
    }

    // Multiverse CRITICAL order after unify:
    // 1) SI deploy while full kit still visible (bodyBox skips weapons)
    // 2) body-only atlas (keep weapon embeds)
    // 3) mesh_ids equip
    // 4) re-ground
    const deploy = deployGrudge6Model(kit, { facePlusZ: true, groundY: 0, unify: false });
    prepMeshFlags(kit);
    if (this.atlas) applyBodyAtlas(kit, this.atlas);
    else applyBodyAtlas(kit, null); // colorSpace fix on embeds only
    // Contact-shadow casters (Environment depth pass)
    kit.traverse((o) => {
      if (!o.isMesh && !o.isSkinnedMesh) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) if (m) this.environment?.registerShadowCaster?.(m);
    });

    this.equipment = new EquipmentManager(kit);
    const preset = this.presets.find((p) => p.id === this.presetId) || this.presets[0];
    this.animPackId = this._packFromPreset(preset);
    const meshIds = loadoutToMeshIds(race.prefix, preset?.loadout || { body: 'A' });
    const report = this.equipment.applyMeshIds(meshIds);
    if (report.missing?.length) {
      console.warn('[CharacterController] mesh_ids missing', report);
    }
    reGroundAfterAnimSample(kit, 0);

    this.tilt.add(kit);
    this.model = kit;
    this.height = deploy.height || kit.userData.deployHeightM || 1.8;
    this.headPosition.set(0, this.height * 0.86, 0);

    const bones = this.equipment.findBones();
    this.ik = new HandIK(kit, bones);
    this.rideIk = new RideIK(kit);

    this.sitting = new SittingPose(kit);
    if (this.sitting.valid) this.forwardAxis.copy(this.sitting.forward);

    this.mixer = new AnimationMixer(kit);
    this.actions.clear();
    this._boundPacks.clear();

    await this._bindPack(this.animPackId);
    if (this.animPackId !== 'magic') await this._bindPack('magic');
    if (this.animPackId !== 'sword_shield') await this._bindPack('sword_shield');

    if (this.actions.has('idle')) this.play('idle', 0);
    else if (this.actions.size) this.play([...this.actions.keys()][0], 0);

    // Sample idle (rotation-only tracks) → re-ground residual hip float
    this.mixer.update(1 / 30);
    reGroundAfterAnimSample(kit, 0);

    const look = this.diagnoseLook();
    if (!look.ok) console.warn('[CharacterController] look', look);
    else {
      console.info(
        `[CharacterController] ${this.raceId} ${this.presetId} h=${look.heightM}m ` +
          `feet=${look.feetMinY} meshes=${report.matched}/${meshIds.length}`
      );
    }

    return this;
  }

  /**
   * Fleet diagnose: height band, feet, pelvis, hands.
   */
  diagnoseLook() {
    if (!this.model) return { ok: false, reason: 'no-model' };
    const d = diagnoseCharacterLook(this.model, 0);
    const bones = this.equipment?.findBones?.() || {};
    return {
      ok: d.ok && !!bones.pelvis,
      heightM: +(d.height ?? 0).toFixed(3),
      feetMinY: +(d.feetMinY ?? 0).toFixed(3),
      heightOk: d.ok,
      feetOk: Math.abs((d.feetMinY ?? 99) - 0) < 0.12,
      pelvis: !!bones.pelvis,
      rHand: !!bones.rHand,
      errors: d.errors,
      equipMatched: this.equipment?.loadout || {}
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
    // longbow / spear — still use sword_shield attack or magic idle
    if (pack.includes('bow')) return 'magic';
    return ANIM_PACKS[pack] ? pack : 'magic';
  }

  async _bindPack(packId) {
    if (this._boundPacks.has(packId)) return;
    const pack = ANIM_PACKS[packId];
    if (!pack) return;

    const roleMap = {
      idle: { loop: LoopRepeat },
      cast: { loop: LoopRepeat }, // loop while casting — ability manager drives state
      attack: { loop: LoopOnce },
      block: { loop: LoopOnce },
      walk: { loop: LoopRepeat },
      run: { loop: LoopRepeat }
    };

    for (const [role, rel] of Object.entries(pack)) {
      const actionName = role; // shared names: idle/cast/attack prefer primary pack
      // Secondary pack: prefix if role already bound from primary
      const name =
        this.actions.has(role) && packId !== this.animPackId ? `${packId}:${role}` : role;
      try {
        const raw = await loadBakedClipJson(bakedClipUrl(rel));
        raw.name = name;
        const matched = rematchClipToSkeleton(this.model, raw, { stripPositions: true });
        if (!matched.tracks.length) {
          console.warn(`[CharacterController] empty tracks: ${rel}`);
          continue;
        }
        const loop = roleMap[role]?.loop ?? LoopRepeat;
        this._registerClip(name, matched, loop);
      } catch (err) {
        console.warn(`[CharacterController] clip fail ${rel}`, err);
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

  /**
   * Re-apply equip from inventory panel (no full reload).
   * @param {Record<string, string>} loadout
   * @param {{ pack?: string, presetId?: string }} [meta]
   */
  applyLoadout(loadout, meta = {}) {
    if (!this.equipment) return { matched: 0, missing: ['no-equipment'] };
    if (meta.presetId) this.presetId = meta.presetId;
    if (meta.pack) this.animPackId = this._packFromPreset({ pack: meta.pack });
    const race = raceDef(this.raceId);
    const meshIds = loadoutToMeshIds(race.prefix, loadout);
    const report = this.equipment.applyMeshIds(meshIds);
    if (this.model) {
      reGroundAfterAnimSample(this.model, 0);
      this.height = this.model.userData.deployHeightM || this.height;
      this.headPosition.set(0, this.height * 0.86, 0);
    }
    this.ik?.setBones(this.equipment.findBones());
    if (this.actions.has('idle') && this.animState === 'idle') this.play('idle', 0.2);
    return report;
  }

  applyPreset(presetId) {
    const preset = this.presets.find((p) => p.id === presetId);
    if (!preset) return null;
    this.presetId = presetId;
    this.animPackId = this._packFromPreset(preset);
    return this.applyLoadout(preset.loadout, { pack: preset.pack, presetId });
  }

  play(name, fadeDuration = 0.35) {
    const next = this.actions.get(name);
    if (!next) return;
    if (next === this.current && next.isRunning()) return;

    next.reset();
    next.enabled = true;
    next.setEffectiveTimeScale(1);
    next.setEffectiveWeight(1);

    if (this.current && this.current !== next && fadeDuration > 0) {
      next.crossFadeFrom(this.current, fadeDuration, true);
    }
    next.play();
    this.current = next;
  }

  /**
   * External: ability manager has active casts → cast loop; else idle.
   * @param {boolean} isCasting
   * @param {{ aimX?: number, aimY?: number, aimZ?: number } | null} aim
   */
  setCasting(isCasting, aim = null) {
    this._castingExternal = !!isCasting;
    if (isCasting && aim && Number.isFinite(aim.aimX)) {
      this.ik?.setAimTarget(aim.aimX, aim.aimY ?? 1.2, aim.aimZ, 0.55);
    } else if (!isCasting) {
      this.ik?.clearAim();
    }
  }

  /**
   * AnimationDirector-style gait (locomotion under overlays).
   * @param {0|1|2|number} level 0 idle, 1 walk, 2 run
   * @param {boolean} [sprinting]
   */
  setGait(level, sprinting = false) {
    if (this._gaitLocked || this._rideActive || this.isSitting) return;
    if (this._castingExternal && level === 0) {
      /* keep cast loop while abilities fly */
      return;
    }
    const g = sprinting ? 2 : MathUtils.clamp(level | 0, 0, 2);
    if (g === this._gait && this.animState !== 'attack') return;
    this._gait = g;
    if (g === 0) {
      if (this.actions.has('idle') && this.animState !== 'cast_loop') {
        this.animState = 'idle';
        this.play('idle', 0.2);
      }
    } else if (g === 1) {
      const walk = this.actions.has('walk')
        ? 'walk'
        : this.actions.has('run')
          ? 'run'
          : null;
      if (walk) {
        this.animState = 'walk';
        this.play(walk, 0.18);
      }
    } else {
      const run = this.actions.has('run')
        ? 'run'
        : this.actions.has('walk')
          ? 'walk'
          : null;
      if (run) {
        this.animState = 'run';
        this.play(run, 0.15);
      }
    }
  }

  /**
   * Overlay one-shot (DRC skill / attack) — gait resumes after clip.
   * @param {'attack'|'cast'|'block'|string} role
   */
  requestOneShot(role) {
    if (this.isSitting || this._rideActive) return false;
    let name = null;
    if (role === 'attack') {
      name = this.actions.has('attack')
        ? 'attack'
        : this.actions.has('sword_shield:attack')
          ? 'sword_shield:attack'
          : this.actions.has('cast')
            ? 'cast'
            : null;
    } else if (role === 'cast') {
      name = this.actions.has('cast') ? 'cast' : this.actions.has('attack') ? 'attack' : null;
    } else if (role === 'block') {
      name = this.actions.has('block') ? 'block' : null;
    } else if (this.actions.has(role)) {
      name = role;
    }
    if (!name) return false;

    this._gaitLocked = true;
    this.animState = role === 'cast' ? 'cast_loop' : 'attack';
    this.play(name, 0.1);
    const duration = this.actions.get(name)?.getClip()?.duration ?? 0.8;
    this._oneShotTimer = duration + 0.04;
    this._attackTimer = this._oneShotTimer;
    return true;
  }

  /** Melee / staff weapon attack one-shot (F). */
  playWeaponAttack() {
    return this.requestOneShot('attack');
  }

  /** One-shot cast flourish if not already in cast loop. */
  playCastFlourish() {
    if (this.isSitting) return;
    this.requestOneShot('cast');
  }

  getCastOrigin(out) {
    return this.ik?.getCastOrigin(out) ?? this.root.getWorldPosition(out || new Vector3()).add(new Vector3(0, 1.4, 0.3));
  }

  /**
   * Windsurf/hoverboard ride: plant feet + hands on manifest sockets.
   * @param {boolean} active
   */
  setRideActive(active) {
    this._rideActive = !!active;
    this.rideIk?.setActive(this._rideActive);
    // Prefer standing idle on the deck (not lotus sit)
    if (active) this.setPose('idle', settings.walk?.poseBlend ?? 0.35);
  }

  /**
   * @param {Record<string, import('three').Vector3|{x:number,y:number,z:number}>} worldSockets
   */
  setRideSockets(worldSockets) {
    this.rideIk?.setTargets(worldSockets);
  }

  setPose(pose, blend = null) {
    this._poseBlend = blend;
    settings.character.pose = pose === 'sitting' ? 'sitting' : 'idle';
    return settings.character.pose;
  }

  togglePose() {
    return this.setPose(settings.character.pose === 'sitting' ? 'idle' : 'sitting');
  }

  get isSitting() {
    return settings.character.pose === 'sitting';
  }

  get poseWeight() {
    return this._poseWeight;
  }

  setFacing(yaw) {
    this.root.rotation.y = yaw;
  }

  get facing() {
    return this.root.rotation.y;
  }

  setLean(angle) {
    this.tilt.quaternion.setFromAxisAngle(this.forwardAxis, angle);
  }

  resetPlacement() {
    this.root.position.y = 0;
    this.setLean(0);
  }

  update(dt) {
    if (!this.mixer) return;

    if (this.sitting?.valid && this.sitting.stale) this.sitting.build();

    // One-shot unlock → return to gait / cast loop / idle
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
    } else if (!this.isSitting && !this._gaitLocked) {
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

    this.mixer.timeScale = settings.global.animationSpeed;
    this.mixer.update(dt);

    // Hand soft-aim after mixer (cast aim); ride IK takes over feet+hands on board
    if (this._rideActive && this.rideIk) {
      this.rideIk.update(dt);
    } else {
      this.ik?.update();
    }

    // Skip lotus sit while riding
    if (this._rideActive || !this.sitting?.valid) return;
    this._poseTime += dt;

    const target = this.isSitting ? 1 : 0;
    const step = dt / Math.max(0.001, this._poseBlend ?? settings.character.blendTime);
    this._poseWeight = MathUtils.clamp(
      this._poseWeight + MathUtils.clamp(target - this._poseWeight, -step, step),
      0,
      1
    );

    this.sitting.apply(MathUtils.smoothstep(this._poseWeight, 0, 1), this._poseTime);
  }

  get position() {
    return this.root.position;
  }

  dispose() {
    this.mixer?.stopAllAction();
    this.mixer = null;
    this.actions.clear();
    disposeObject(this.root);
  }
}
