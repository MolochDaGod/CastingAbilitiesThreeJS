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
  applyExclusiveMeshIds,
  countSkeletons,
  diagnoseCharacterLook,
  reGroundAfterAnimSample,
  scaffoldGrudge6Kit
} from '../character/grudge6Deploy.js';
import { settings } from '../config/settings.js';
import { disposeObject } from '../utils/dispose.js';
import { loadBakedClipJson, rematchClipToSkeleton } from './bakeClip.js';

const _castOrigin = new Vector3();

/**
 * Toon RTS / grudge6 combat hero — clean path only:
 *  SkeletonUtils.clone → unifySkeletons (+ prune orphans) → mesh_ids
 *  → SI deploy → body atlas → mixer + gait + one-shots.
 *
 * Purged from this controller (do not re-add without SSOT):
 *  - SittingPose (Mixamo procedural — corrupts Bip001)
 *  - RideIK / windsurf bone writes
 *  - Soft HandIK aim that rewrites hand quaternions every frame
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
    this._gaitLocked = false;

    // Stubs kept so WalkController / App do not throw if still referenced
    this.sitting = null;
    this.rideIk = null;
    this._rideActive = false;
    this.ik = null;
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

    // Clear previous kit
    while (this.tilt.children.length) {
      const c = this.tilt.children[0];
      this.tilt.remove(c);
      disposeObject(c);
    }

    const kit = skeletonClone(gltf.scene);
    kit.name = `${race.id}_Characters`;
    kit.userData.importPipeline = 'glb-baked';
    kit.userData.importUrl = kitUrl;

    // Preset → mesh_ids (no bag/wood/quiver)
    const preset = this.presets.find((p) => p.id === this.presetId) || this.presets[0];
    this.animPackId = this._packFromPreset(preset);
    const cleanLoadout = { ...(preset?.loadout || { body: 'A' }) };
    delete cleanLoadout.bag;
    delete cleanLoadout.wood;
    delete cleanLoadout.quiver;
    delete cleanLoadout.carry;
    const meshIds = loadoutToMeshIds(race.prefix, cleanLoadout);

    // FULL Open scaffold (was missing exclusive hide-all equip + fit math)
    //  unify → hide ALL meshes → exclusive mesh_ids → fit 1.8 → face+Z → materials
    const scaffold = scaffoldGrudge6Kit(kit, {
      meshIds,
      atlas: this.atlas,
      facePlusZ: true
    });

    // EquipmentManager for inventory UI re-equip (catalog after scaffold equip)
    this.equipment = new EquipmentManager(kit);
    // Re-sync loadout state without re-showing wardrobe
    this.equipment.loadout = { ...cleanLoadout };
    this.equipment.hideUtility();
    this.equipment.carryMode = false;

    kit.traverse((o) => {
      if (!o.isMesh && !o.isSkinnedMesh) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) if (m) this.environment?.registerShadowCaster?.(m);
    });

    this.tilt.add(kit);
    this.model = kit;
    this.height = scaffold.height || kit.userData.deployHeightM || 1.8;
    this.headPosition.set(0, this.height * 0.86, 0);
    this.bones = this.equipment.findBones();
    const report = scaffold.equip || { matched: 0, missing: [] };

    // 5) Single mixer — Bip001 packs only
    this.mixer = new AnimationMixer(kit);
    this.actions.clear();
    this._boundPacks.clear();

    await this._bindPack(this.animPackId);
    if (this.animPackId !== 'magic') await this._bindPack('magic');
    if (this.animPackId !== 'sword_shield') await this._bindPack('sword_shield');

    if (this.actions.has('idle')) this.play('idle', 0);
    else if (this.actions.size) this.play([...this.actions.keys()][0], 0);

    this.mixer.update(1 / 30);
    reGroundAfterAnimSample(kit, 0);

    const look = this.diagnoseLook();
    if (!look.ok) console.warn('[CharacterController] look', look);
    else {
      console.info(
        `[CharacterController] OK ${this.raceId} ${this.presetId} ` +
          `h=${look.heightM}m feet=${look.feetMinY} equip=${report.matched}/${meshIds.length} ` +
          `pelvis=${look.pelvis} clips=${this.actions.size}`
      );
    }

    return this;
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
    if (pack.includes('bow')) return 'magic';
    return ANIM_PACKS[pack] ? pack : 'magic';
  }

  async _bindPack(packId) {
    if (this._boundPacks.has(packId)) return;
    const pack = ANIM_PACKS[packId];
    if (!pack) return;

    const roleMap = {
      idle: LoopRepeat,
      cast: LoopRepeat,
      attack: LoopOnce,
      block: LoopOnce,
      walk: LoopRepeat,
      run: LoopRepeat
    };

    for (const [role, rel] of Object.entries(pack)) {
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
        this._registerClip(name, matched, roleMap[role] ?? LoopRepeat);
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

  applyLoadout(loadout, meta = {}) {
    if (!this.model) return { matched: 0, missing: ['no-model'] };
    if (meta.presetId) this.presetId = meta.presetId;
    if (meta.pack) this.animPackId = this._packFromPreset({ pack: meta.pack });
    const race = raceDef(this.raceId);
    const clean = { ...loadout };
    delete clean.bag;
    delete clean.wood;
    delete clean.quiver;
    const meshIds = loadoutToMeshIds(race.prefix, clean);
    // Exclusive scaffold equip (hide-all → one body / one weapon)
    const report = applyExclusiveMeshIds(this.model, meshIds, { allowUtility: false });
    this.equipment?.hideUtility?.();
    if (this.equipment) this.equipment.loadout = { ...clean };
    reGroundAfterAnimSample(this.model, 0);
    this.height = this.model.userData.deployHeightM || this.height;
    this.headPosition.set(0, this.height * 0.86, 0);
    this.bones = this.equipment?.findBones?.() || this.bones;
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

  setCasting(isCasting) {
    this._castingExternal = !!isCasting;
  }

  /**
   * @param {0|1|2|number} level 0 idle, 1 walk, 2 run
   * @param {boolean} [sprinting]
   */
  setGait(level, sprinting = false) {
    if (this._gaitLocked) return;
    if (this._castingExternal && level === 0) return;
    const g = sprinting ? 2 : MathUtils.clamp(level | 0, 0, 2);
    if (g === this._gait && this.animState !== 'attack') return;
    this._gait = g;
    if (g === 0) {
      if (this.actions.has('idle') && this.animState !== 'cast_loop') {
        this.animState = 'idle';
        this.play('idle', 0.2);
      }
    } else if (g === 1) {
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

  playWeaponAttack() {
    return this.requestOneShot('attack');
  }

  playCastFlourish() {
    this.requestOneShot('cast');
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

  // --- stubs: ride / sit purged ---
  setRideActive(_active) {
    this._rideActive = false;
  }
  setRideSockets() {}
  setPose(pose) {
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

    this.mixer.timeScale = settings.global.animationSpeed;
    this.mixer.update(dt);
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
