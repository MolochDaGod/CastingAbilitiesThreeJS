import {
  AnimationMixer,
  Box3,
  ClampToEdgeWrapping,
  Group,
  LoopOnce,
  LoopRepeat,
  MathUtils,
  MeshStandardMaterial,
  SRGBColorSpace,
  Vector3
} from 'three';
import { clone as skeletonClone } from 'three/addons/utils/SkeletonUtils.js';
import {
  ANIM_PACKS,
  DEFAULT_RACE,
  FALLBACK_PRESETS,
  GEAR_PRESETS_URL,
  RACES,
  TARGET_HEIGHT_M,
  atlasUrlForRace,
  bakedClipUrl,
  kitUrlForRace
} from '../config/assets.js';
import { EquipmentManager } from '../character/EquipmentManager.js';
import { HandIK } from '../character/HandIK.js';
import { RideIK } from '../character/RideIK.js';
import { settings } from '../config/settings.js';
import { LAYER } from '../core/Layers.js';
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

    const race = RACES[this.raceId] || RACES[DEFAULT_RACE];
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
      atlas.needsUpdate = true;
      this.atlas = atlas;
    }

    // NEVER plain scene.clone() on skinned kits — breaks skinning / bag-blob.
    const kit = skeletonClone(gltf.scene);
    kit.name = `${race.id}_Characters`;

    // Art-forward +Z (Toon RTS export faces +X). Idempotent once.
    kit.rotation.y = Math.PI / 2;
    kit.updateMatrixWorld(true);
    // Force skeleton bind matrices before equip / Box3 (precise skinned bounds).
    kit.traverse((o) => {
      if (o.isSkinnedMesh && o.skeleton) o.skeleton.update();
    });

    this._prepareMaterials(kit);

    this.equipment = new EquipmentManager(kit);
    const preset = this.presets.find((p) => p.id === this.presetId) || this.presets[0];
    this.animPackId = this._packFromPreset(preset);
    // Hide equippable first so height fit uses body armor only (not full kit blob)
    const report = this.equipment.applyLoadout(preset?.loadout || { body: 'A' });
    if (report.missing?.length) {
      console.warn('[CharacterController] equip missing', report);
    }

    // SI fit after equip: skinned body ~1.8 m, feet on y=0
    this._normalizeHeightAndGround(kit);

    this.tilt.add(kit);
    this.model = kit;
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

    // Sample idle so skinned bounds settle, then re-ground (fleet character-correctness)
    this.mixer.update(1 / 30);
    kit.traverse((o) => {
      if (o.isSkinnedMesh && o.skeleton) o.skeleton.update();
    });
    this._reGroundAfterEquip();
    this._centerOnPelvis(kit);
    // Re-ground after pelvis XZ shift (height unchanged, but precise bounds may drift)
    this._reGroundAfterEquip();

    const look = this.diagnoseLook();
    if (!look.ok) console.warn('[CharacterController] look', look);
    else {
      console.info(
        `[CharacterController] ${this.raceId} ${this.presetId} h=${look.heightM}m feet=${look.feetMinY} equip=${report.matched}`
      );
    }

    return this;
  }

  /**
   * Fleet diagnose: height band, feet, pelvis, hands.
   */
  diagnoseLook() {
    if (!this.model) return { ok: false, reason: 'no-model' };
    this.model.updateMatrixWorld(true);
    const box = this._bodyBox(this.model);
    const size = new Vector3();
    box.getSize(size);
    const bones = this.equipment?.findBones?.() || {};
    const h = size.y;
    const feetOk = Math.abs(box.min.y) < 0.12;
    const heightOk = h >= 1.55 && h <= 2.15;
    return {
      ok: heightOk && feetOk && !!bones.pelvis,
      heightM: +h.toFixed(3),
      feetMinY: +box.min.y.toFixed(3),
      heightOk,
      feetOk,
      pelvis: !!bones.pelvis,
      rHand: !!bones.rHand,
      equipMatched: this.equipment?.loadout || {}
    };
  }

  /** Shift kit so pelvis sits at local XZ origin (not full prop bbox). */
  _centerOnPelvis(kit) {
    const bones = this.equipment?.findBones?.();
    const pelvis = bones?.pelvis;
    if (!pelvis || !kit) return;
    kit.updateMatrixWorld(true);
    const wp = new Vector3();
    pelvis.getWorldPosition(wp);
    // World → kit parent (tilt) local
    const parent = kit.parent;
    if (parent) {
      const local = parent.worldToLocal(wp.clone());
      kit.position.x -= local.x;
      kit.position.z -= local.z;
    } else {
      kit.position.x -= wp.x - this.root.position.x;
      kit.position.z -= wp.z - this.root.position.z;
    }
    kit.updateMatrixWorld(true);
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
    const report = this.equipment.applyLoadout(loadout);
    this._reGroundAfterEquip();
    this.ik?.setBones(this.equipment.findBones());
    // Prefer idle from current pack
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

  _reGroundAfterEquip() {
    if (!this.model) return;
    this.model.updateMatrixWorld(true);
    const box = this._bodyBox(this.model);
    if (box.isEmpty()) return;
    this.model.position.y -= box.min.y;
    this.model.updateMatrixWorld(true);
    const size = new Vector3();
    box.getSize(size);
    // re-measure
    const box2 = this._bodyBox(this.model);
    box2.getSize(size);
    this.height = size.y;
    this.headPosition.set(0, this.height * 0.86, 0);
  }

  /**
   * Skinned body AABB only (visible body/arms/legs/head). Ignores weapons so
   * staff length does not distort height fit. Uses precise skinned bounds.
   */
  _bodyBox(root) {
    const box = new Box3();
    let any = false;
    root.updateMatrixWorld(true);
    const armorHint = /body|arms|legs|head|shoulder|units_/i;
    root.traverse((o) => {
      if (!o.isSkinnedMesh || !o.visible) return;
      // Prefer armor pieces for measurement
      if (o.name && !armorHint.test(o.name) && /weapon|sword|staff|shield|bow|axe|hammer/i.test(o.name)) {
        return;
      }
      try {
        // three r152+: setFromObject(object, precise) accounts for skinning
        const b = new Box3().setFromObject(o, true);
        if (!Number.isFinite(b.min.y) || b.isEmpty()) return;
        if (!any) {
          box.copy(b);
          any = true;
        } else box.union(b);
      } catch {
        o.geometry?.computeBoundingBox?.();
        if (!o.geometry?.boundingBox) return;
        const b = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld);
        if (!any) {
          box.copy(b);
          any = true;
        } else box.union(b);
      }
    });
    if (!any) box.setFromObject(root, true);
    return box;
  }

  _normalizeHeightAndGround(kit) {
    kit.updateMatrixWorld(true);
    let box = this._bodyBox(kit);
    const size = new Vector3();
    box.getSize(size);
    let h = Math.max(0.001, size.y);

    // Classic 100× unit fix if raw kit is giant (cm as m)
    let unitFix = 1;
    if (h > 12) unitFix = 0.01;
    else if (h > 4) unitFix = TARGET_HEIGHT_M / h;
    if (unitFix !== 1) {
      kit.scale.multiplyScalar(unitFix);
      kit.updateMatrixWorld(true);
      box = this._bodyBox(kit);
      box.getSize(size);
      h = Math.max(0.001, size.y);
    }

    // Residual fit to ~1.8 m (clamp aesthetic residual)
    const fit = TARGET_HEIGHT_M / h;
    const fitClamped = MathUtils.clamp(fit, 1 / 12, 12);
    kit.scale.multiplyScalar(fitClamped);
    kit.updateMatrixWorld(true);

    box = this._bodyBox(kit);
    box.getSize(size);
    this.height = size.y;

    // Feet on ground plane relative to kit local (parent at world origin later)
    kit.position.y -= box.min.y;
    kit.updateMatrixWorld(true);
  }

  _prepareMaterials(root) {
    const converted = new Map();

    root.traverse((node) => {
      if (!node.isMesh && !node.isSkinnedMesh) return;

      node.castShadow = true;
      node.receiveShadow = true;
      node.frustumCulled = false;
      node.layers.set(LAYER.WORLD);
      node.layers.enable(LAYER.CONTACT);

      const source = Array.isArray(node.material) ? node.material : [node.material];
      const result = source.map((material) => {
        if (!material) return material;
        if (converted.has(material)) return converted.get(material);

        const hasMap = !!material.map;
        const map = hasMap ? material.map : this.atlas ?? null;
        if (map) {
          map.colorSpace = SRGBColorSpace;
          if (!hasMap) map.flipY = false;
        }

        if (material.isMeshStandardMaterial || material.isMeshPhysicalMaterial) {
          // Always prefer race atlas for grudge6 FBX-path kits (avoid yellow sludge)
          if (this.atlas) {
            material.map = this.atlas;
            material.color.set(0xffffff);
            material.map.colorSpace = SRGBColorSpace;
            material.map.flipY = false;
            material.vertexColors = false;
            material.needsUpdate = true;
          } else if (hasMap) {
            material.map.colorSpace = SRGBColorSpace;
          }
          material.metalness = material.metalness ?? 0;
          material.roughness = material.roughness ?? 0.75;
          this.environment.registerShadowCaster(material);
          converted.set(material, material);
          return material;
        }

        const standard = new MeshStandardMaterial({
          name: material.name,
          color: 0xffffff,
          map,
          normalMap: material.normalMap ?? null,
          roughness: 0.75,
          metalness: 0,
          transparent: material.transparent ?? false,
          opacity: material.opacity ?? 1,
          side: material.side
        });
        this.environment.registerShadowCaster(standard);
        material.dispose?.();
        converted.set(material, standard);
        return standard;
      });

      node.material = Array.isArray(node.material) ? result : result[0];
    });
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
