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
    this.raceId = DEFAULT_RACE;
    this.animPackId = 'magic';
    this.presetId = 'mage';
    this.presets = FALLBACK_PRESETS.slice();

    /** 'idle' | 'cast_loop' | 'attack' | 'sit' */
    this.animState = 'idle';
    this._attackTimer = 0;
    this._castingExternal = false;
    this._boundPacks = new Set();
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

    // Art-forward +Z (Toon RTS export faces +X).
    kit.rotation.y = Math.PI / 2;
    kit.updateMatrixWorld(true);

    this._prepareMaterials(kit);

    this.equipment = new EquipmentManager(kit);
    const preset = this.presets.find((p) => p.id === this.presetId) || this.presets[0];
    this.animPackId = this._packFromPreset(preset);
    const report = this.equipment.applyLoadout(preset?.loadout || { body: 'A' });
    console.info('[CharacterController] equip', report);

    this._normalizeHeightAndGround(kit);

    this.tilt.add(kit);
    this.model = kit;
    this.headPosition.set(0, this.height * 0.86, 0);

    const bones = this.equipment.findBones();
    this.ik = new HandIK(kit, bones);

    this.sitting = new SittingPose(kit);
    if (this.sitting.valid) this.forwardAxis.copy(this.sitting.forward);

    this.mixer = new AnimationMixer(kit);
    this.actions.clear();
    this._boundPacks.clear();

    await this._bindPack(this.animPackId);
    // Always have cast + attack available for sandbox
    if (this.animPackId !== 'magic') await this._bindPack('magic');
    if (this.animPackId !== 'sword_shield') await this._bindPack('sword_shield');

    if (this.actions.has('idle')) this.play('idle', 0);
    else if (this.actions.size) this.play([...this.actions.keys()][0], 0);

    return this;
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

  _bodyBox(root) {
    const box = new Box3();
    let any = false;
    root.updateMatrixWorld(true);
    root.traverse((o) => {
      if (!o.isSkinnedMesh || !o.visible) return;
      o.geometry?.computeBoundingBox?.();
      if (!o.geometry?.boundingBox) return;
      const b = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld);
      if (!any) {
        box.copy(b);
        any = true;
      } else box.union(b);
    });
    if (!any) box.setFromObject(root);
    return box;
  }

  _normalizeHeightAndGround(kit) {
    kit.updateMatrixWorld(true);
    let box = this._bodyBox(kit);
    const size = new Vector3();
    box.getSize(size);
    const h = Math.max(0.001, size.y);
    kit.scale.multiplyScalar(TARGET_HEIGHT_M / h);
    kit.updateMatrixWorld(true);

    box = this._bodyBox(kit);
    box.getSize(size);
    const center = new Vector3();
    box.getCenter(center);
    this.height = size.y;

    kit.position.x -= center.x;
    kit.position.z -= center.z;
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
          if (!hasMap && this.atlas) {
            material.map = this.atlas;
            material.color.set(0xffffff);
            material.needsUpdate = true;
          }
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

  /** Melee / staff weapon attack one-shot (F). */
  playWeaponAttack() {
    if (this.isSitting) return false;
    const name = this.actions.has('attack')
      ? 'attack'
      : this.actions.has('sword_shield:attack')
        ? 'sword_shield:attack'
        : this.actions.has('cast')
          ? 'cast'
          : null;
    if (!name) return false;

    this.animState = 'attack';
    this.play(name, 0.1);
    const duration = this.actions.get(name)?.getClip()?.duration ?? 1.0;
    this._attackTimer = duration + 0.05;
    return true;
  }

  /** One-shot cast flourish if not already in cast loop. */
  playCastFlourish() {
    if (this.isSitting) return;
    if (this.actions.has('cast')) {
      this.animState = 'cast_loop';
      this.play('cast', 0.12);
    }
  }

  getCastOrigin(out) {
    return this.ik?.getCastOrigin(out) ?? this.root.getWorldPosition(out || new Vector3()).add(new Vector3(0, 1.4, 0.3));
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

    // State machine: attack timer > cast loop > idle
    if (this._attackTimer > 0) {
      this._attackTimer -= dt;
      if (this._attackTimer <= 0) {
        this.animState = this._castingExternal ? 'cast_loop' : 'idle';
        if (this._castingExternal && this.actions.has('cast')) this.play('cast', 0.2);
        else if (this.actions.has('idle')) this.play('idle', 0.25);
      }
    } else if (!this.isSitting) {
      if (this._castingExternal && this.actions.has('cast')) {
        if (this.animState !== 'cast_loop') {
          this.animState = 'cast_loop';
          this.play('cast', 0.15);
        }
      } else if (this.animState === 'cast_loop') {
        this.animState = 'idle';
        if (this.actions.has('idle')) this.play('idle', 0.25);
      }
    }

    this.mixer.timeScale = settings.global.animationSpeed;
    this.mixer.update(dt);

    // Hand soft-aim after mixer
    this.ik?.update();

    if (!this.sitting?.valid) return;
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
