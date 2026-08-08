import {
  AdditiveBlending,
  Color,
  DoubleSide,
  Group,
  MathUtils,
  MeshBasicMaterial,
  NormalBlending,
  Vector3
} from 'three';
import { clone as skeletonClone } from 'three/addons/utils/SkeletonUtils.js';
import { settings } from '../config/settings.js';
import { LAYER } from '../core/Layers.js';

const _dir = new Vector3();
const _pos = new Vector3();
const _from = new Vector3();
const _c = new Color();

/**
 * Dodge afterimage — trailing copies of the **model itself** (blur of own colors).
 *
 * Not a flat cyan tint: each skinned mesh keeps a soft read of its map/color,
 * then dissipates **vaporously** (rise, expand, opacity falloff).
 *
 * Pattern from Animator afterimage + Casting wind residual fade feel.
 */
export class DodgeAfterimage {
  /**
   * @param {import('three').Scene} scene
   */
  constructor(scene) {
    this.scene = scene;
    /** @type {{ root: Group, mats: import('three').Material[], age: number, life: number, baseOpacity: number, baseScale: number }[]} */
    this._active = [];
    this._stampAcc = 0;
  }

  /**
   * @param {import('three').Object3D} source
   * @param {import('three').Vector3} from
   * @param {import('three').Vector3} dir
   * @param {number} distanceM
   * @param {{ count?: number, life?: number }} [opts]
   */
  spawnPath(source, from, dir, distanceM, opts = {}) {
    if (!source || !from || distanceM < 0.05) return;
    const cfg = settings.drc?.afterimage || {};
    const count = Math.max(2, Math.min(10, opts.count ?? cfg.count ?? 6));
    const life = opts.life ?? cfg.life ?? 0.55;

    _dir.copy(dir);
    _dir.y = 0;
    if (_dir.lengthSq() < 1e-6) _dir.set(0, 0, 1);
    else _dir.normalize();

    _from.copy(from);
    const yaw = this._sourceYaw(source);

    for (let i = 0; i < count; i++) {
      const f = (i + 1) / (count + 1);
      _pos.copy(_from).addScaledVector(_dir, distanceM * f);
      // Later ghosts thinner / shorter life (vapor chain)
      const op = 0.42 * (1 - i / (count + 0.5));
      this._spawnGhost(source, _pos, yaw, op, life * (0.75 + f * 0.35));
    }
  }

  /**
   * @param {import('three').Object3D} source
   * @param {import('three').Vector3} worldPos
   * @param {number} [yaw]
   */
  stamp(source, worldPos, yaw) {
    if (!source || !worldPos) return;
    const cfg = settings.drc?.afterimage || {};
    const life = cfg.stampLife ?? 0.32;
    this._spawnGhost(source, worldPos, yaw ?? this._sourceYaw(source), 0.32, life);
  }

  /**
   * @param {number} dt
   * @param {boolean} active
   * @param {import('three').Object3D|null} source
   * @param {import('three').Vector3|null} worldPos
   * @param {number} [yaw]
   */
  updateTrail(dt, active, source, worldPos, yaw) {
    this.update(dt);
    if (!active || !source || !worldPos) {
      this._stampAcc = 0;
      return;
    }
    const interval = settings.drc?.afterimage?.stampInterval ?? 0.048;
    this._stampAcc += dt;
    while (this._stampAcc >= interval) {
      this._stampAcc -= interval;
      this.stamp(source, worldPos, yaw);
    }
  }

  /** Vapor dissipate: opacity falloff + rise + soft expand. */
  update(dt) {
    const cfg = settings.drc?.afterimage || {};
    const rise = cfg.vaporRise ?? 0.55;
    const expand = cfg.vaporExpand ?? 0.28;

    for (let i = this._active.length - 1; i >= 0; i--) {
      const g = this._active[i];
      g.age += dt;
      const t = MathUtils.clamp(g.age / g.life, 0, 1);
      if (t >= 1) {
        this._disposeGhost(g);
        this._active.splice(i, 1);
        continue;
      }
      // Vapor curve: holds briefly then softens (ease-in-out power)
      const hold = cfg.vaporHold ?? 0.12;
      const u = t < hold ? 0 : (t - hold) / (1 - hold);
      const fade = Math.pow(1 - u, cfg.vaporPower ?? 2.4);
      const op = g.baseOpacity * fade;

      for (const mat of g.mats) {
        mat.opacity = op;
      }

      // Expand + drift up like steam
      const s = g.baseScale * (1 + expand * u * u);
      g.root.scale.setScalar(s);
      g.root.position.y = g.baseY + rise * u * u;
    }
  }

  dispose() {
    for (const g of this._active) this._disposeGhost(g);
    this._active.length = 0;
  }

  /* ------------------------------------------------------------------ */

  _sourceYaw(source) {
    return source.rotation?.y ?? source.parent?.rotation?.y ?? 0;
  }

  /**
   * Pull a soft tint from a source material (map keeps silhouette of gear colors).
   * @param {import('three').Material|import('three').Material[]|null} srcMat
   * @param {number} opacity
   * @returns {MeshBasicMaterial}
   */
  _ghostMaterialFrom(srcMat, opacity) {
    const src = Array.isArray(srcMat) ? srcMat[0] : srcMat;
    const map = src?.map || null;
    if (src?.color) _c.copy(src.color);
    else _c.setHex(0xc8c0b8);
    // Soften toward mid-grey so additive doesn't blow out
    _c.lerp(new Color(0xb0aaa4), 0.15);

    const mat = new MeshBasicMaterial({
      color: _c.clone(),
      map: map || null,
      transparent: true,
      opacity,
      // Soft vapor: mostly normal so model colors show, slight additive lift
      blending: map ? NormalBlending : AdditiveBlending,
      depthWrite: false,
      side: DoubleSide,
      toneMapped: false,
      fog: false
    });
    if (map) {
      mat.map = map;
      // Do not dispose shared map on ghost death
      mat.userData.sharedMap = true;
    }
    return mat;
  }

  /**
   * @param {import('three').Object3D} source
   * @param {import('three').Vector3} pos
   * @param {number} yaw
   * @param {number} opacity
   * @param {number} life
   */
  _spawnGhost(source, pos, yaw, opacity, life) {
    let ghost;
    try {
      ghost = skeletonClone(source);
    } catch {
      ghost = source.clone(true);
    }

    ghost.position.set(0, 0, 0);
    ghost.rotation.set(0, 0, 0);
    ghost.scale.copy(source.scale);

    /** @type {import('three').Material[]} */
    const mats = [];

    ghost.traverse((o) => {
      if (o.isLight || o.isCamera) {
        o.visible = false;
        return;
      }
      if (!o.isMesh && !o.isSkinnedMesh) return;
      o.layers?.set?.(LAYER.VFX);
      o.frustumCulled = false;
      o.castShadow = false;
      o.receiveShadow = false;

      const srcMats = Array.isArray(o.material) ? o.material : [o.material];
      if (srcMats.length > 1) {
        const multi = srcMats.map((m) => {
          const g = this._ghostMaterialFrom(m, opacity);
          mats.push(g);
          return g;
        });
        o.material = multi;
      } else {
        const g = this._ghostMaterialFrom(srcMats[0], opacity);
        mats.push(g);
        o.material = g;
      }
    });

    const root = new Group();
    root.name = 'DodgeAfterimage';
    root.position.copy(pos);
    root.rotation.set(0, yaw, 0);
    root.add(ghost);
    this.scene.add(root);

    const baseScale = root.scale.x || 1;
    this._active.push({
      root,
      mats,
      age: 0,
      life: Math.max(0.1, life),
      baseOpacity: opacity,
      baseScale,
      baseY: pos.y
    });
  }

  _disposeGhost(g) {
    this.scene.remove(g.root);
    g.root.traverse((o) => {
      if (o.isMesh || o.isSkinnedMesh) {
        o.geometry = null;
        o.skeleton = null;
      }
    });
    for (const mat of g.mats) {
      // Never dispose shared textures from live hero
      if (mat.map && mat.userData?.sharedMap) mat.map = null;
      mat.dispose();
    }
  }
}
