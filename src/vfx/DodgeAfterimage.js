import {
  AdditiveBlending,
  Color,
  DoubleSide,
  Group,
  MeshBasicMaterial,
  Vector3
} from 'three';
import { clone as skeletonClone } from 'three/addons/utils/SkeletonUtils.js';
import { settings } from '../config/settings.js';
import { getColor } from '../utils/color.js';
import { LAYER } from '../core/Layers.js';

const _dir = new Vector3();
const _pos = new Vector3();
const _from = new Vector3();

/**
 * Full-mesh trailing images of the Toon hero during dodge (MM escape).
 *
 * Ports Animator Studio `Vfx.afterimage` pattern:
 *  - SkeletonUtils clone of live rig (frozen pose)
 *  - additive wind-cyan ghosts spaced along dash path
 *  - optional continuous stamps while the dodge impulse runs
 *
 * Wind residual feel (post-wind-cast ribbons): pale cyan/white additive fade,
 * no depth write — same “high-level motion blur” read as ability trails.
 */
export class DodgeAfterimage {
  /**
   * @param {import('three').Scene} scene
   */
  constructor(scene) {
    this.scene = scene;
    /** @type {{ root: Group, mats: MeshBasicMaterial[], age: number, life: number }[]} */
    this._active = [];
    this._stampAcc = 0;
  }

  /**
   * Path-spaced afterimage at dodge start (MM distance along dir).
   * @param {import('three').Object3D} source model or root with skinned meshes
   * @param {import('three').Vector3} from world feet / root
   * @param {import('three').Vector3} dir unit XZ
   * @param {number} distanceM
   * @param {{ count?: number, life?: number, color?: number|string }} [opts]
   */
  spawnPath(source, from, dir, distanceM, opts = {}) {
    if (!source || !from || distanceM < 0.05) return;
    const cfg = settings.drc?.afterimage || {};
    const count = Math.max(2, Math.min(10, opts.count ?? cfg.count ?? 6));
    const life = opts.life ?? cfg.life ?? 0.42;
    const color = this._color(opts.color ?? cfg.color);

    _dir.copy(dir);
    _dir.y = 0;
    if (_dir.lengthSq() < 1e-6) _dir.set(0, 0, 1);
    else _dir.normalize();

    _from.copy(from);
    const yaw = source.rotation?.y ?? source.parent?.rotation?.y ?? 0;

    for (let i = 0; i < count; i++) {
      const f = (i + 1) / (count + 1);
      _pos.copy(_from).addScaledVector(_dir, distanceM * f);
      this._spawnGhost(source, _pos, yaw, color, 0.5 * (1 - i / count), life * (0.85 + f * 0.2));
    }
  }

  /**
   * One ghost stamp at current model pose (call while dodge is live).
   * @param {import('three').Object3D} source
   * @param {import('three').Vector3} worldPos
   * @param {number} [yaw]
   */
  stamp(source, worldPos, yaw) {
    if (!source || !worldPos) return;
    const cfg = settings.drc?.afterimage || {};
    const color = this._color(cfg.color);
    const life = (cfg.stampLife ?? 0.28);
    const y = yaw ?? source.rotation?.y ?? 0;
    this._spawnGhost(source, worldPos, y, color, 0.38, life);
  }

  /**
   * Continuous trail while dodge/invuln runs.
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
    const interval = settings.drc?.afterimage?.stampInterval ?? 0.055;
    this._stampAcc += dt;
    while (this._stampAcc >= interval) {
      this._stampAcc -= interval;
      this.stamp(source, worldPos, yaw);
    }
  }

  /** Fade + dispose finished ghosts. */
  update(dt) {
    for (let i = this._active.length - 1; i >= 0; i--) {
      const g = this._active[i];
      g.age += dt;
      const k = 1 - g.age / g.life;
      if (k <= 0) {
        this._disposeGhost(g);
        this._active.splice(i, 1);
        continue;
      }
      for (const mat of g.mats) {
        mat.opacity = g.baseOpacity * k;
      }
    }
  }

  dispose() {
    for (const g of this._active) this._disposeGhost(g);
    this._active.length = 0;
  }

  /* ------------------------------------------------------------------ */

  _color(c) {
    if (typeof c === 'number') return c;
    if (typeof c === 'string') return getColor(c).getHex();
    // Wind residual cyan (matches WindAbility ribbon inner)
    try {
      return getColor(settings.wind?.colorInner || '#ebf7ff').getHex();
    } catch {
      return 0xaee6ff;
    }
  }

  /**
   * @param {import('three').Object3D} source
   * @param {import('three').Vector3} pos
   * @param {number} yaw
   * @param {number} colorHex
   * @param {number} opacity
   * @param {number} life
   */
  _spawnGhost(source, pos, yaw, colorHex, opacity, life) {
    let ghost;
    try {
      ghost = skeletonClone(source);
    } catch {
      // Fallback: shallow clone (no skinned bind) — still reads as a silhouette
      ghost = source.clone(true);
    }

    ghost.position.copy(pos);
    ghost.rotation.set(0, yaw, 0);
    ghost.scale.copy(source.scale);
    ghost.traverse((o) => {
      if (o.isLight || o.isCamera) {
        o.visible = false;
        return;
      }
      if (o.isSkinnedMesh || o.isMesh) {
        o.layers?.set?.(LAYER.VFX);
        o.frustumCulled = false;
        o.castShadow = false;
        o.receiveShadow = false;
      }
    });

    const mats = [];
    const ghostMat = new MeshBasicMaterial({
      color: new Color(colorHex),
      transparent: true,
      opacity,
      blending: AdditiveBlending,
      depthWrite: false,
      side: DoubleSide,
      toneMapped: false
    });
    mats.push(ghostMat);

    ghost.traverse((o) => {
      if (!o.isMesh && !o.isSkinnedMesh) return;
      // Shared geometry with source — only replace materials
      if (Array.isArray(o.material)) {
        o.material = o.material.map(() => ghostMat);
      } else {
        o.material = ghostMat;
      }
    });

    const root = new Group();
    root.name = 'DodgeAfterimage';
    root.add(ghost);
    this.scene.add(root);

    this._active.push({
      root,
      mats,
      age: 0,
      life: Math.max(0.08, life),
      baseOpacity: opacity
    });
  }

  _disposeGhost(g) {
    this.scene.remove(g.root);
    g.root.traverse((o) => {
      // Do NOT dispose geometry — shared with live hero via SkeletonUtils
      if (o.isMesh || o.isSkinnedMesh) {
        o.geometry = null;
        o.skeleton = null;
      }
    });
    for (const mat of g.mats) mat.dispose();
  }
}
