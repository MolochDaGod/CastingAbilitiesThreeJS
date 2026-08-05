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
import {
  ANIM_PACK,
  CHARACTER_ATLAS_URL,
  CHARACTER_KIT_URL,
  TARGET_HEIGHT_M,
  bakedClipUrl
} from '../config/assets.js';
import { settings } from '../config/settings.js';
import { LAYER } from '../core/Layers.js';
import { disposeObject } from '../utils/dispose.js';
import { loadBakedClipJson, rematchClipToSkeleton } from './bakeClip.js';
import { SittingPose } from './SittingPose.js';

/**
 * Loads the grudge6 race kit from CDN, binds Bip001 magic-pack clips, and
 * drives a single AnimationMixer (fleet rule: no second mixer).
 *
 * Correctness (grudge-character-correctness):
 *  - Fit height ~1.8 m from skinned body AABB
 *  - Ground from body min.y (feet), not pelvis
 *  - Art-forward +Z (π/2 yaw once for Toon RTS export)
 *  - Rotation-only baked tracks
 *  - SittingPose is a post-mixer procedural layer (walk / T toggle)
 */
export class CharacterController {
  constructor(environment) {
    this.environment = environment;
    this.root = new Group();
    this.root.name = 'Character';

    // Position and heading live on `root`; bank (walk lean) on a joint under it.
    this.tilt = new Group();
    this.tilt.name = 'CharacterTilt';
    this.root.add(this.tilt);

    this.mixer = null;
    this.actions = new Map();
    this.current = null;
    this.height = 1.8;
    this.headPosition = new Vector3(0, 1.5, 0);
    /** The rig's own forward, in model space — the axis a bank rotates about. */
    this.forwardAxis = new Vector3(0, 0, 1);

    this.sitting = null;
    this._poseWeight = 0; // 0 = idle clip, 1 = seated
    this._poseTime = 0;
    this._poseBlend = null;
    this._castReturnTimer = 0;
  }

  /**
   * @param {import('../loaders/AssetLoader.js').AssetLoader} assets
   */
  async load(assets) {
    const [gltf, atlas] = await Promise.all([
      assets.loadGLTF(CHARACTER_KIT_URL),
      assets.loadTexture(CHARACTER_ATLAS_URL).catch((err) => {
        console.warn('[CharacterController] atlas load failed; keeping GLB maps', err);
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

    const kit = gltf.scene;
    kit.name = 'WK_Characters';

    // Toon RTS / grudge6 FBX art faces +X; world expects local +Z when yaw = 0.
    kit.rotation.y = Math.PI / 2;
    kit.updateMatrixWorld(true);

    this._prepareMaterials(kit);
    this._normalizeHeightAndGround(kit);

    this.tilt.add(kit);
    this.model = kit;
    this.headPosition.set(0, this.height * 0.86, 0);

    // Bake seated pose while the rig is still in bind pose (before mixer).
    this.sitting = new SittingPose(kit);
    if (this.sitting.valid) this.forwardAxis.copy(this.sitting.forward);

    this.mixer = new AnimationMixer(kit);

    // Baked magic pack — idle loop + cast one-shot on ability fire.
    await this._bindMagicClips();

    // Fallback: any clips embedded in the GLB (usually none on race kits).
    if (this.actions.size === 0 && gltf.animations?.length) {
      for (const clip of gltf.animations) {
        this._registerClip(clip.name || 'idle', clip, LoopRepeat);
      }
      this.play([...this.actions.keys()][0], 0);
    }

    if (!this.actions.has('idle') && this.actions.size > 0) {
      this.play([...this.actions.keys()][0], 0);
    }

    return this;
  }

  async _bindMagicClips() {
    const entries = [
      { role: 'idle', rel: ANIM_PACK.idle, loop: LoopRepeat },
      { role: 'cast', rel: ANIM_PACK.cast, loop: LoopOnce }
    ];

    for (const { role, rel, loop } of entries) {
      try {
        const raw = await loadBakedClipJson(bakedClipUrl(rel));
        raw.name = role;
        const matched = rematchClipToSkeleton(this.model, raw, { stripPositions: true });
        if (!matched.tracks.length) {
          console.warn(`[CharacterController] empty tracks after rematch: ${rel}`);
          continue;
        }
        this._registerClip(role, matched, loop);
      } catch (err) {
        console.warn(`[CharacterController] failed to load ${rel}`, err);
      }
    }

    if (this.actions.has('idle')) this.play('idle', 0);
  }

  _registerClip(name, clip, loopMode) {
    const action = this.mixer.clipAction(clip);
    action.setLoop(loopMode, loopMode === LoopOnce ? 1 : Infinity);
    action.clampWhenFinished = loopMode === LoopOnce;
    this.actions.set(name, action);
  }

  /**
   * Fit skinned body to ~1.8 m and ground feet (body min.y → 0).
   * Never use pelvis Y as feet.
   */
  _normalizeHeightAndGround(kit) {
    kit.updateMatrixWorld(true);

    const box = new Box3();
    let hasSkin = false;
    kit.traverse((node) => {
      if (node.isSkinnedMesh) {
        hasSkin = true;
        node.geometry.computeBoundingBox();
        const b = node.geometry.boundingBox.clone();
        b.applyMatrix4(node.matrixWorld);
        box.union(b);
      }
    });
    if (!hasSkin) box.setFromObject(kit);

    const size = new Vector3();
    box.getSize(size);
    const h = Math.max(0.001, size.y);
    const scale = TARGET_HEIGHT_M / h;
    kit.scale.multiplyScalar(scale);
    kit.updateMatrixWorld(true);

    // Re-measure after scale
    box.makeEmpty();
    kit.traverse((node) => {
      if (node.isSkinnedMesh) {
        node.geometry.computeBoundingBox();
        const b = node.geometry.boundingBox.clone();
        b.applyMatrix4(node.matrixWorld);
        box.union(b);
      }
    });
    if (box.isEmpty()) box.setFromObject(kit);

    box.getSize(size);
    const center = new Vector3();
    box.getCenter(center);
    this.height = size.y;

    // Centre XZ on body; feet on y = 0
    kit.position.x -= center.x;
    kit.position.z -= center.z;
    kit.position.y -= box.min.y;
    kit.updateMatrixWorld(true);
  }

  /** PBR materials + optional atlas rebind when GLB maps are missing. */
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

        // Keep existing Standard/Physical maps; convert Phong leftovers.
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

  /** Cross-fade to a named action. */
  play(name, fadeDuration = 0.35) {
    const next = this.actions.get(name);
    if (!next || next === this.current) return;

    next.reset();
    next.enabled = true;
    next.setEffectiveTimeScale(1);
    next.setEffectiveWeight(1);

    if (this.current && fadeDuration > 0) {
      next.crossFadeFrom(this.current, fadeDuration, true);
    }
    next.play();
    this.current = next;
  }

  /**
   * Fire the magic cast one-shot (if loaded), then return to idle.
   * Safe no-op when only idle is available.
   */
  playCastFlourish() {
    const cast = this.actions.get('cast');
    if (!cast) return;
    // Do not interrupt meditation sit with a cast clip.
    if (this.isSitting) return;

    this.play('cast', 0.12);
    const duration = cast.getClip()?.duration ?? 1.2;
    this._castReturnTimer = duration + 0.05;
  }

  /* ------------------------------------------------------------------ */
  /* pose layer                                                          */
  /* ------------------------------------------------------------------ */

  /**
   * @param {'idle'|'sitting'} pose
   * @param {number|null} [blend] seconds for *this* transition only
   */
  setPose(pose, blend = null) {
    this._poseBlend = blend;
    settings.character.pose = pose === 'sitting' ? 'sitting' : 'idle';
    return settings.character.pose;
  }

  /** Flip between the idle clip and the meditation sit. @returns {string} */
  togglePose() {
    return this.setPose(settings.character.pose === 'sitting' ? 'idle' : 'sitting');
  }

  get isSitting() {
    return settings.character.pose === 'sitting';
  }

  get poseWeight() {
    return this._poseWeight;
  }

  /* ------------------------------------------------------------------ */
  /* placement — driven by walk mode, inert otherwise                    */
  /* ------------------------------------------------------------------ */

  /** Heading, radians about world +Y. 0 faces +Z. */
  setFacing(yaw) {
    this.root.rotation.y = yaw;
  }

  get facing() {
    return this.root.rotation.y;
  }

  /**
   * Bank the body about its own forward axis. Positive angles roll the head to
   * the rig's right, so leaning into a left-hand turn is a negative angle.
   */
  setLean(angle) {
    this.tilt.quaternion.setFromAxisAngle(this.forwardAxis, angle);
  }

  /** Put the character back on the floor, upright and facing where it was. */
  resetPlacement() {
    this.root.position.y = 0;
    this.setLean(0);
  }

  update(dt) {
    if (!this.mixer) return;

    if (this.sitting?.valid && this.sitting.stale) this.sitting.build();

    this.mixer.timeScale = settings.global.animationSpeed;
    this.mixer.update(dt);

    // Return to idle after cast flourish.
    if (this._castReturnTimer > 0) {
      this._castReturnTimer -= dt;
      if (this._castReturnTimer <= 0 && this.actions.has('idle')) {
        this.play('idle', 0.25);
      }
    }

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
