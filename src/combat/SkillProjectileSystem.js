/**
 * Mesh skill projectiles with SI scale, contact sphere, force / knockback.
 *
 * Extends lab VFX — does **not** start a second physics engine for heroes.
 * Projectiles are kinematic; contact uses distance spheres vs targets.
 * On hit: explode mesh, VfxDirector impact, optional knockback callback.
 *
 * Summons: public/models/vfx/summons/summon-fire-fist.glb · summon-ice-shard.glb
 * (extracted from author multipack — never load whole fire__ice pack).
 */

import {
  Box3,
  Color,
  Group,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  Vector3
} from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { DRACO_DECODER_PATH } from '../config/assets.js';
import { mmToM } from './motionMath.js';
import { SUMMON_MESH_BY_ELEMENT } from './skillDelivery.js';

const _v = new Vector3();
const _box = new Box3();

/**
 * @typedef {object} ProjectileHit
 * @property {Vector3} point
 * @property {Vector3} forward
 * @property {number} force
 * @property {number} knockbackMm
 * @property {number} knockupVy
 * @property {number} aoe
 * @property {string} [element]
 * @property {object|null} [target]
 */

export class SkillProjectileSystem {
  /**
   * @param {{
   *   scene: import('three').Scene,
   *   vfx?: import('../vfx/VfxDirector.js').VfxDirector|null,
   *   onHit?: (hit: ProjectileHit) => void
   * }} opts
   */
  constructor(opts) {
    this.scene = opts.scene;
    this.vfx = opts.vfx || null;
    this.onHit = opts.onHit || (() => {});
    /** @type {object[]} */
    this._live = [];
    /** @type {Map<string, Group>} */
    this._templates = new Map();
    this._loader = null;
    this._placeholderGeo = new SphereGeometry(0.28, 12, 12);
  }

  _ensureLoader() {
    if (this._loader) return this._loader;
    const loader = new GLTFLoader();
    try {
      const draco = new DRACOLoader();
      draco.setDecoderPath(DRACO_DECODER_PATH);
      loader.setDRACOLoader(draco);
    } catch {
      /* optional */
    }
    this._loader = loader;
    return loader;
  }

  /**
   * Prefetch summon meshes.
   * @param {string[]} [urls]
   */
  async warm(urls) {
    const list =
      urls ||
      Object.values(SUMMON_MESH_BY_ELEMENT).filter(Boolean);
    await Promise.all(list.map((u) => this._loadTemplate(u).catch(() => null)));
  }

  /**
   * @param {string} url
   * @returns {Promise<Group|null>}
   */
  async _loadTemplate(url) {
    if (!url) return null;
    if (this._templates.has(url)) return this._templates.get(url);
    const loader = this._ensureLoader();
    const gltf = await loader.loadAsync(url);
    const root = gltf.scene || gltf.scenes?.[0];
    if (!root) return null;
    // Normalize max dimension if author scale slipped
    _box.setFromObject(root);
    const size = new Vector3();
    _box.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z, 1e-4);
    if (maxDim > 1.2 || maxDim < 0.15) {
      const s = 0.55 / maxDim;
      root.scale.multiplyScalar(s);
    }
    root.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = false;
      }
    });
    this._templates.set(url, root);
    return root;
  }

  /**
   * Spawn a skill projectile.
   * @param {{
   *   origin: Vector3,
   *   target: Vector3,
   *   forward?: Vector3,
   *   element?: string,
   *   meshUrl?: string|null,
   *   speed?: number,
   *   gravity?: number,
   *   contactRadius?: number,
   *   life?: number,
   *   force?: number,
   *   knockbackMm?: number,
   *   knockupVy?: number,
   *   aoe?: number,
   *   size?: number,
   *   color?: string|number,
   *   targets?: { point: Vector3, mesh?: object, id?: string }[],
   *   explodeOnHit?: boolean
   * }} opts
   */
  async spawn(opts) {
    const origin = opts.origin.clone();
    const target = opts.target.clone();
    let forward = opts.forward?.clone?.();
    if (!forward || forward.lengthSq() < 1e-8) {
      forward = target.clone().sub(origin);
      if (forward.lengthSq() < 1e-8) forward.set(0, 0, 1);
      else forward.normalize();
    } else forward.normalize();

    const speed = opts.speed ?? 14;
    const url =
      opts.meshUrl ||
      SUMMON_MESH_BY_ELEMENT[opts.element || ''] ||
      SUMMON_MESH_BY_ELEMENT.fire;

    let mesh = null;
    if (url) {
      try {
        const tpl = await this._loadTemplate(url);
        if (tpl) {
          mesh = tpl.clone(true);
          mesh.traverse((o) => {
            if (o.isMesh && o.material) {
              o.material = o.material.clone();
              if (opts.color && o.material.color) {
                o.material.color = new Color(opts.color);
              }
              if (opts.element === 'holy' && o.material.emissive) {
                o.material.emissive = new Color('#ffe9a8');
                o.material.emissiveIntensity = 0.55;
              }
            }
          });
        }
      } catch (e) {
        console.warn('[SkillProjectile] mesh load', url, e);
      }
    }
    if (!mesh) {
      mesh = new Mesh(
        this._placeholderGeo,
        new MeshStandardMaterial({
          color: opts.color || (opts.element === 'ice' ? '#88d4ff' : '#ff6a33'),
          emissive: opts.element === 'holy' ? '#ffe9a8' : '#331100',
          emissiveIntensity: 0.4,
          roughness: 0.45,
          metalness: 0.1
        })
      );
    }

    const scale = opts.size ?? 0.55;
    mesh.scale.setScalar(scale / 0.55);
    mesh.position.copy(origin);
    this.scene.add(mesh);

    const vel = forward.clone().multiplyScalar(speed);
    // Drop shots (over target): aim velocity toward target, not only forward
    if (opts.gravity && opts.gravity < 0) {
      const dist = origin.distanceTo(target);
      const t = Math.max(0.25, dist / Math.max(4, speed));
      vel.copy(target).sub(origin).multiplyScalar(1 / t);
      // leave room for gravity arc
      vel.y += 0.5 * Math.abs(opts.gravity) * t * 0.35;
    }

    const proj = {
      mesh,
      vel,
      gravity: opts.gravity ?? 0,
      contactRadius: opts.contactRadius ?? 0.35,
      life: opts.life ?? 2.5,
      age: 0,
      force: opts.force ?? 8,
      knockbackMm: opts.knockbackMm ?? 180,
      knockupVy: opts.knockupVy ?? 2.2,
      aoe: opts.aoe ?? 1.2,
      element: opts.element || 'arcane',
      explodeOnHit: opts.explodeOnHit !== false,
      targets: opts.targets || [],
      hit: false
    };
    this._live.push(proj);
    return proj;
  }

  /**
   * Instant ring / nova (no travel) at point — still applies contact force.
   * @param {object} opts same as spawn + radius
   */
  pulse(opts) {
    const point = opts.origin?.clone?.() || opts.target?.clone?.() || new Vector3();
    const aoe = opts.aoe ?? 1.5;
    this.vfx?.deploy?.(opts.element === 'holy' ? 'moon_beam' : 'inferno', {
      origin: point,
      intensity: opts.intensity ?? 1.1
    });
    for (const t of opts.targets || []) {
      if (!t?.point) continue;
      const d = point.distanceTo(t.point);
      if (d <= aoe + 0.5) {
        const fwd = _v.subVectors(t.point, point);
        fwd.y = 0;
        if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, 1);
        else fwd.normalize();
        this.onHit({
          point: t.point.clone(),
          forward: fwd,
          force: opts.force ?? 8,
          knockbackMm: opts.knockbackMm ?? 180,
          knockupVy: opts.knockupVy ?? 2.5,
          aoe,
          element: opts.element,
          target: t
        });
      }
    }
  }

  /**
   * @param {number} dt
   */
  update(dt) {
    for (let i = this._live.length - 1; i >= 0; i--) {
      const p = this._live[i];
      p.age += dt;
      if (p.hit || p.age >= p.life) {
        this._destroy(i, p.hit);
        continue;
      }
      // Integrate
      p.vel.y += (p.gravity || 0) * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      // Face velocity
      if (p.vel.lengthSq() > 1e-4) {
        p.mesh.lookAt(p.mesh.position.clone().add(p.vel));
      }
      // Contact
      for (const t of p.targets) {
        if (!t?.point) continue;
        const d = p.mesh.position.distanceTo(t.point);
        if (d <= p.contactRadius + 0.45) {
          p.hit = true;
          const fwd = p.vel.lengthSq() > 1e-4 ? p.vel.clone().normalize() : new Vector3(0, 0, 1);
          this.onHit({
            point: p.mesh.position.clone(),
            forward: fwd,
            force: p.force,
            knockbackMm: p.knockbackMm,
            knockupVy: p.knockupVy,
            aoe: p.aoe,
            element: p.element,
            target: t
          });
          if (p.explodeOnHit) this._explode(p);
          this._destroy(i, true);
          break;
        }
      }
      // Ground hit for drop shots
      if (p.gravity < 0 && p.mesh.position.y <= 0.08) {
        p.hit = true;
        this.onHit({
          point: p.mesh.position.clone(),
          forward: new Vector3(0, -1, 0),
          force: p.force,
          knockbackMm: p.knockbackMm,
          knockupVy: p.knockupVy,
          aoe: p.aoe,
          element: p.element,
          target: null
        });
        if (p.explodeOnHit) this._explode(p);
        this._destroy(i, true);
      }
    }
  }

  _explode(p) {
    const id =
      p.element === 'ice' || p.element === 'frost' || p.element === 'water'
        ? 'frost_wave'
        : p.element === 'holy'
          ? 'moon_beam'
          : 'inferno';
    this.vfx?.deploy?.(id, {
      origin: p.mesh.position.clone(),
      intensity: 1.15,
      forward: p.vel.clone().normalize()
    });
  }

  _destroy(index, _hit) {
    const p = this._live[index];
    if (!p) return;
    this.scene.remove(p.mesh);
    p.mesh.traverse?.((o) => {
      if (o.geometry && o.geometry !== this._placeholderGeo) {
        /* shared template geos — do not dispose */
      }
      if (o.material && o.isMesh) {
        // cloned mats ok to dispose
        try {
          o.material.dispose?.();
        } catch {
          /* */
        }
      }
    });
    this._live.splice(index, 1);
  }

  clear() {
    while (this._live.length) this._destroy(0, false);
  }

  dispose() {
    this.clear();
    this._placeholderGeo.dispose();
    this._templates.clear();
  }
}
