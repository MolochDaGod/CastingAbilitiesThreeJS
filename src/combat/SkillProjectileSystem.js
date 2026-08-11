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
import { mmToM } from './motionMath.js';
import { SUMMON_MESH_BY_ELEMENT, STAFF_CHARGE_MESH } from './skillDelivery.js';
import { sharedGltfLoader } from '../loaders/gltfPipeline.js';
import {
  applyElementalOrbMaterials,
  staffOrbForElement,
  staffOrbWarmUrls,
  STAFF_CHARGE,
  STAFF_ORB_DIAMETER_M
} from '../vfx/staffOrbVfx.js';
import {
  ARROW_SYSTEMS,
  EARTH_EMERGE_CHARGE,
  EARTH_ROCK_DIAMETER_M,
  EARTH_ROCK_MESHES,
  FREEZE_NOVA,
  WATER_BUBBLE,
  createWaterBubbleMaterial,
  pickEarthRocks,
  resolveArrowEndEvent
} from '../vfx/elementAttackVfx.js';

const _v = new Vector3();
const _box = new Box3();
const _bubbleGeo = new SphereGeometry(0.5, 10, 10);

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
 * @property {boolean} [freeze]
 * @property {number} [freezeSec]
 * @property {string} [endEvent]
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
    /** Shared fleet GLTF (one Draco pool + Meshopt + KTX2 if bound) */
    this._loader = null;
    this._placeholderGeo = new SphereGeometry(0.28, 12, 12);
    /** @type {{ mesh: Group|Mesh, element: string, age: number, baseScale: number }|null} */
    this._charge = null;
  }

  _ensureLoader() {
    // Never new DRACOLoader here — thrash WASM workers vs AssetLoader
    if (!this._loader) this._loader = sharedGltfLoader();
    return this._loader;
  }

  /**
   * Prefetch summon meshes.
   * @param {string[]} [urls]
   */
  async warm(urls) {
    const list =
      urls ||
      [
        ...Object.values(SUMMON_MESH_BY_ELEMENT).filter(Boolean),
        ...staffOrbWarmUrls(),
        ...EARTH_ROCK_MESHES,
        ARROW_SYSTEMS.path.mesh,
        ARROW_SYSTEMS.loft.mesh,
        EARTH_EMERGE_CHARGE
      ];
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
    const orbDef = staffOrbForElement(opts.element);
    const url =
      opts.meshUrl ||
      orbDef.path ||
      SUMMON_MESH_BY_ELEMENT[opts.element || ''] ||
      SUMMON_MESH_BY_ELEMENT.fire;

    let mesh = null;
    if (url) {
      try {
        const tpl = await this._loadTemplate(url);
        if (tpl) {
          mesh = tpl.clone(true);
          // Staff orbs / charge: elemental materials (gd_orbs bake + runtime tint)
          if (/\/orbs\/orb-|staff-charge|kamehameha-charge/.test(url) || opts.useOrbMaterials !== false) {
            applyElementalOrbMaterials(mesh, opts.element, {
              additive: opts.additive === true,
              intensity: opts.intensity ?? 1
            });
          } else {
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
        }
      } catch (e) {
        console.warn('[SkillProjectile] mesh load', url, e);
      }
    }
    if (!mesh) {
      mesh = new Mesh(
        this._placeholderGeo,
        new MeshStandardMaterial({
          color: opts.color || orbDef.color || (opts.element === 'ice' ? '#88d4ff' : '#ff6a33'),
          emissive: opts.element === 'holy' ? '#ffe9a8' : orbDef.emissive || '#331100',
          emissiveIntensity: 0.55,
          roughness: 0.35,
          metalness: 0.12
        })
      );
    }

    // Orbs baked ~0.45 m; size is SI diameter multiplier
    const baseDiam = /\/orbs\/orb-/.test(url || '') ? STAFF_ORB_DIAMETER_M : 0.55;
    const scale = opts.size ?? baseDiam;
    mesh.scale.setScalar(scale / baseDiam);
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
   * Small elemental charge shell at staff tip / hand (kamehameha_charging bake).
   * One live charge at a time — managed by cast bar.
   * @param {{
   *   origin: Vector3,
   *   element?: string,
   *   size?: number,
   *   meshUrl?: string|null
   * }} opts
   */
  async spawnCharge(opts) {
    this.clearCharge();
    const url = opts.meshUrl || STAFF_CHARGE_MESH || STAFF_CHARGE.path;
    let mesh = null;
    try {
      const tpl = await this._loadTemplate(url);
      if (tpl) {
        mesh = tpl.clone(true);
        applyElementalOrbMaterials(mesh, opts.element, {
          additive: true,
          intensity: 1.1
        });
      }
    } catch (e) {
      console.warn('[SkillProjectile] charge mesh', url, e);
    }
    if (!mesh) {
      mesh = new Mesh(
        this._placeholderGeo,
        new MeshStandardMaterial({
          color: staffOrbForElement(opts.element).color,
          emissive: staffOrbForElement(opts.element).emissive,
          emissiveIntensity: 0.9,
          transparent: true,
          opacity: 0.75,
          depthWrite: false
        })
      );
    }
    const size = opts.size ?? STAFF_CHARGE.diameterM ?? 0.35;
    mesh.scale.setScalar(size / 0.35);
    mesh.position.copy(opts.origin);
    mesh.userData.staffCharge = true;
    this.scene.add(mesh);
    this._charge = {
      mesh,
      element: opts.element || 'arcane',
      age: 0,
      baseScale: size / 0.35
    };
    return this._charge;
  }

  /**
   * Follow cast origin while channeling.
   * @param {Vector3} origin
   * @param {number} [dt]
   * @param {number} [progress01]
   */
  updateCharge(origin, dt = 0, progress01 = 0) {
    if (!this._charge?.mesh) return;
    this._charge.age += dt;
    this._charge.mesh.position.copy(origin);
    const pulse =
      1 + 0.12 * Math.sin(this._charge.age * Math.PI * 2 * (STAFF_CHARGE.pulseHz || 3.2));
    const grow = 0.75 + 0.35 * Math.min(1, progress01);
    this._charge.mesh.scale.setScalar(this._charge.baseScale * pulse * grow);
    this._charge.mesh.rotation.y += dt * 4.5;
    this._charge.mesh.rotation.x += dt * 1.2;
  }

  clearCharge() {
    if (!this._charge?.mesh) {
      this._charge = null;
      return;
    }
    this.scene.remove(this._charge.mesh);
    this._charge.mesh.traverse?.((o) => {
      if (o.material && o.isMesh) {
        try {
          o.material.dispose?.();
        } catch {
          /* */
        }
      }
    });
    this._charge = null;
  }

  /**
   * Instant ring / nova (no travel) at point — still applies contact force.
   * @param {object} opts same as spawn + radius
   */
  pulse(opts) {
    const point = opts.origin?.clone?.() || opts.target?.clone?.() || new Vector3();
    const aoe = opts.aoe ?? 1.5;
    const vfxId =
      opts.freeze || opts.element === 'ice' || opts.element === 'frost'
        ? 'frost_wave'
        : opts.element === 'holy'
          ? 'moon_beam'
          : 'inferno';
    this.vfx?.deploy?.(vfxId, {
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
          target: t,
          freeze: !!opts.freeze,
          freezeSec: opts.freezeSec ?? FREEZE_NOVA.freezeSec
        });
      }
    }
  }

  /**
   * Freeze AOE — expands from caster in all directions; freezes hostiles in radius.
   * @param {{
   *   origin: Vector3,
   *   radiusM?: number,
   *   expandSec?: number,
   *   freezeSec?: number,
   *   targets?: object[],
   *   element?: string
   * }} opts
   */
  spawnFreezeNova(opts) {
    const origin = opts.origin.clone();
    origin.y = Math.max(0.05, origin.y);
    const radius = opts.radiusM ?? FREEZE_NOVA.radiusM;
    const expandSec = opts.expandSec ?? FREEZE_NOVA.expandSec;
    const freezeSec = opts.freezeSec ?? FREEZE_NOVA.freezeSec;

    this.vfx?.deploy?.('frost_wave', { origin: origin.clone(), intensity: 1.25 });
    this.vfx?.deploy?.('ice_lightning_burst', {
      origin: origin.clone(),
      intensity: 0.85
    });

    // Expanding bubble ring (water/ice animation feel from bubbles_2 concept)
    const ring = new Group();
    ring.position.copy(origin);
    const mat = createWaterBubbleMaterial({ color: FREEZE_NOVA.color, opacity: 0.5 });
    const n = FREEZE_NOVA.bubbleCount;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const m = new Mesh(_bubbleGeo, mat);
      m.scale.setScalar(WATER_BUBBLE.diameterM);
      m.position.set(Math.cos(a) * 0.35, 0.15 + Math.random() * 0.2, Math.sin(a) * 0.35);
      ring.add(m);
    }
    this.scene.add(ring);

    this._live.push({
      mesh: ring,
      vel: new Vector3(),
      gravity: 0,
      contactRadius: 0.1,
      life: expandSec + 0.35,
      age: 0,
      force: 4,
      knockbackMm: 40,
      knockupVy: 0.3,
      aoe: radius,
      element: opts.element || 'ice',
      explodeOnHit: false,
      targets: opts.targets || [],
      hit: false,
      kind: 'freeze_nova',
      freeze: true,
      freezeSec,
      expandSec,
      radiusM: radius,
      origin: origin.clone(),
      hitIds: new Set()
    });
    return true;
  }

  /**
   * Water bubble field along stream / impact (procedural — not whole bubbles_2 pack).
   * @param {{ origin: Vector3, target: Vector3, forward?: Vector3, count?: number, speed?: number, targets?: object[] }} opts
   */
  spawnBubbleStream(opts) {
    const origin = opts.origin.clone();
    const target = opts.target.clone();
    let forward = opts.forward?.clone?.();
    if (!forward || forward.lengthSq() < 1e-8) {
      forward = target.clone().sub(origin);
      if (forward.lengthSq() < 1e-8) forward.set(0, 0, 1);
      else forward.normalize();
    } else forward.normalize();

    const count = opts.count ?? WATER_BUBBLE.countTravel;
    const mat = createWaterBubbleMaterial();
    for (let i = 0; i < count; i++) {
      const mesh = new Mesh(_bubbleGeo, mat);
      const s = WATER_BUBBLE.diameterM * (0.7 + Math.random() * 0.6);
      mesh.scale.setScalar(s);
      const side = new Vector3(-forward.z, 0, forward.x).normalize();
      mesh.position
        .copy(origin)
        .addScaledVector(forward, -0.1 + i * 0.08)
        .addScaledVector(side, (Math.random() - 0.5) * 0.35)
        .add(new Vector3(0, (Math.random() - 0.2) * 0.25, 0));
      this.scene.add(mesh);
      const jitter = side
        .clone()
        .multiplyScalar((Math.random() - 0.5) * 1.2)
        .add(new Vector3(0, Math.random() * 0.8, 0));
      const vel = forward
        .clone()
        .multiplyScalar((opts.speed ?? 11) * (0.85 + Math.random() * 0.3))
        .add(jitter);
      this._live.push({
        mesh,
        vel,
        gravity: -1.5,
        contactRadius: 0.25,
        life: 1.6 + Math.random() * 0.4,
        age: 0,
        force: 3,
        knockbackMm: 60,
        knockupVy: 0.5,
        aoe: 0.6,
        element: 'ice',
        explodeOnHit: false,
        targets: opts.targets || [],
        hit: false,
        kind: 'bubble'
      });
    }
    this.vfx?.deploy?.('moon_beam', { origin, intensity: 0.7 });
  }

  /**
   * Earth rocks: pull from below terrain beside caster, then linear or aimed path.
   * @param {{
   *   casterPos: Vector3,
   *   target: Vector3,
   *   forward?: Vector3,
   *   rockCount?: number,
   *   aimMode?: 'linear'|'aimed',
   *   targets?: object[],
   *   speed?: number
   * }} opts
   */
  async spawnEarthRocks(opts) {
    const caster = opts.casterPos.clone();
    const target = opts.target.clone();
    let forward = opts.forward?.clone?.();
    if (!forward || forward.lengthSq() < 1e-8) {
      forward = target.clone().sub(caster);
      forward.y = 0;
      if (forward.lengthSq() < 1e-8) forward.set(0, 0, 1);
      else forward.normalize();
    } else {
      forward.y = 0;
      if (forward.lengthSq() > 1e-8) forward.normalize();
      else forward.set(0, 0, 1);
    }

    const count = opts.rockCount ?? 1;
    const urls = pickEarthRocks(count);
    const side = new Vector3(-forward.z, 0, forward.x);
    const aimMode = opts.aimMode || 'linear';
    const speed = opts.speed ?? 13;

    // Emerge charge tell at feet (kamehameha charge shell, earth tint)
    try {
      const chargeTpl = await this._loadTemplate(EARTH_EMERGE_CHARGE);
      if (chargeTpl) {
        const ch = chargeTpl.clone(true);
        applyElementalOrbMaterials(ch, 'nature', { additive: true, intensity: 0.9 });
        ch.position.set(caster.x, 0.05, caster.z);
        ch.scale.setScalar(0.9);
        this.scene.add(ch);
        this._live.push({
          mesh: ch,
          vel: new Vector3(),
          gravity: 0,
          contactRadius: 0,
          life: 0.45,
          age: 0,
          force: 0,
          knockbackMm: 0,
          knockupVy: 0,
          aoe: 0,
          element: 'nature',
          explodeOnHit: false,
          targets: [],
          hit: false,
          kind: 'emerge_tell'
        });
      }
    } catch {
      /* optional */
    }

    this.vfx?.deploy?.('earth_surge', {
      origin: caster.clone().setY(0.05),
      intensity: 1.0
    });

    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      const lateral = (i - (urls.length - 1) / 2) * 0.55;
      // Spawn underground next to caster
      const emerge = caster
        .clone()
        .addScaledVector(side, lateral)
        .addScaledVector(forward, 0.4 + Math.random() * 0.3);
      emerge.y = -0.85;

      let mesh = null;
      try {
        const tpl = await this._loadTemplate(url);
        if (tpl) {
          mesh = tpl.clone(true);
          mesh.traverse((o) => {
            if (o.isMesh && o.material) o.material = o.material.clone();
          });
        }
      } catch (e) {
        console.warn('[SkillProjectile] rock', url, e);
      }
      if (!mesh) {
        mesh = new Mesh(
          this._placeholderGeo,
          new MeshStandardMaterial({ color: 0x6a5a48, roughness: 0.9 })
        );
      }
      mesh.scale.setScalar(1);
      mesh.position.copy(emerge);
      this.scene.add(mesh);

      // Aimed = fly toward soft-lock/aim; linear = forward path
      const dest =
        aimMode === 'aimed'
          ? target.clone().add(new Vector3(lateral * 0.3, 0.4, 0))
          : caster
              .clone()
              .addScaledVector(forward, 12)
              .addScaledVector(side, lateral * 0.5)
              .setY(caster.y + 1.0);

      this._live.push({
        mesh,
        vel: new Vector3(),
        gravity: 0,
        contactRadius: EARTH_ROCK_DIAMETER_M * 0.55,
        life: 3.2,
        age: 0,
        force: 10,
        knockbackMm: 220,
        knockupVy: 2.8,
        aoe: 1.1,
        element: 'nature',
        explodeOnHit: true,
        targets: opts.targets || [],
        hit: false,
        kind: 'earth_rock',
        phase: 'emerge',
        emergeDur: 0.28 + i * 0.05,
        emergeFrom: emerge.clone(),
        emergeTo: emerge.clone().setY(0.45 + Math.random() * 0.15),
        flyTarget: dest,
        flySpeed: speed * (0.92 + Math.random() * 0.16),
        aimMode
      });
    }
  }

  /**
   * Dual arrow systems:
   *  - path: linear attack path; distance sets end event location
   *  - loft: throw / place / trap / summon (higher arc)
   * @param {{
   *   origin: Vector3,
   *   target: Vector3,
   *   system?: 'path'|'loft',
   *   endEvent?: string,
   *   distanceM?: number,
   *   targets?: object[],
   *   size?: number
   * }} opts
   */
  async spawnArrow(opts) {
    const system = opts.system === 'loft' ? 'loft' : 'path';
    const def = ARROW_SYSTEMS[system];
    const endEvent = resolveArrowEndEvent(opts.endEvent, system);
    const origin = opts.origin.clone();
    let target = opts.target.clone();
    const dist =
      opts.distanceM ??
      Math.max(2, Math.min(28, origin.distanceTo(target)));
    const dir = target.clone().sub(origin);
    if (dir.lengthSq() < 1e-8) dir.set(0, 0, 1);
    else dir.normalize();
    // Distance determines where event / end / aoe happens
    target = origin.clone().addScaledVector(dir, dist);
    if (system === 'loft') target.y = Math.max(0.1, target.y);

    let mesh = null;
    try {
      const tpl = await this._loadTemplate(def.mesh);
      if (tpl) {
        mesh = tpl.clone(true);
        mesh.traverse((o) => {
          if (o.isMesh && o.material) o.material = o.material.clone();
        });
      }
    } catch (e) {
      console.warn('[SkillProjectile] arrow', def.mesh, e);
    }
    if (!mesh) {
      mesh = new Mesh(
        this._placeholderGeo,
        new MeshStandardMaterial({
          color: system === 'loft' ? 0xff8833 : 0x55bbff,
          emissive: system === 'loft' ? 0x662200 : 0x114488,
          emissiveIntensity: 0.5
        })
      );
    }

    // Path: size can scale slightly with distance (skill reach feel)
    let sizeMul = opts.size ?? 1;
    if (def.sizeScalesWithDistance) {
      sizeMul *= 0.85 + Math.min(0.45, dist / 40);
    }
    mesh.scale.setScalar(sizeMul);
    mesh.position.copy(origin);
    this.scene.add(mesh);

    const speed = system === 'loft' ? 10 : 18;
    const travelT = Math.max(0.2, dist / speed);
    const vel = dir.clone().multiplyScalar(speed);
    if (system === 'loft') {
      // loft arc so curved arrow reads as throw
      vel.y += Math.abs(def.gravity || 12) * travelT * 0.45 * (def.loft || 0.4);
    }

    this._live.push({
      mesh,
      vel,
      gravity: def.gravity ?? 0,
      contactRadius: 0.35 * sizeMul,
      life: travelT + 0.35,
      age: 0,
      force: system === 'loft' ? 6 : 9,
      knockbackMm: system === 'loft' ? 100 : 160,
      knockupVy: system === 'loft' ? 1.2 : 1.8,
      aoe: endEvent === 'aoe' ? Math.min(3.5, 1.2 + dist * 0.06) : 0.9,
      element: 'arcane',
      explodeOnHit: endEvent === 'explode' || endEvent === 'impact',
      targets: opts.targets || [],
      hit: false,
      kind: 'arrow',
      arrowSystem: system,
      endEvent,
      endPoint: target.clone(),
      distanceM: dist,
      endFired: false
    });
  }

  /**
   * @param {number} dt
   */
  update(dt) {
    for (let i = this._live.length - 1; i >= 0; i--) {
      const p = this._live[i];
      p.age += dt;
      if (p.hit || p.age >= p.life) {
        if (p.kind === 'arrow' && !p.endFired) this._fireArrowEnd(p);
        if (p.kind === 'freeze_nova' && !p.hit) this._finishFreezeNova(p);
        this._destroy(i, p.hit);
        continue;
      }

      // ── Freeze expanding ring ──
      if (p.kind === 'freeze_nova') {
        const t = Math.min(1, p.age / Math.max(0.05, p.expandSec));
        const r = p.radiusM * t;
        p.mesh.scale.setScalar(Math.max(0.2, r / 0.5));
        p.mesh.rotation.y += dt * 2.5;
        for (const tgt of p.targets || []) {
          if (!tgt?.point || !tgt.id) continue;
          if (p.hitIds.has(tgt.id)) continue;
          const d = Math.hypot(tgt.point.x - p.origin.x, tgt.point.z - p.origin.z);
          if (d <= r + 0.4) {
            p.hitIds.add(tgt.id);
            const fwd = _v.subVectors(tgt.point, p.origin);
            fwd.y = 0;
            if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, 1);
            else fwd.normalize();
            this.onHit({
              point: tgt.point.clone(),
              forward: fwd,
              force: 3,
              knockbackMm: 30,
              knockupVy: 0.2,
              aoe: p.radiusM,
              element: 'ice',
              target: tgt,
              freeze: true,
              freezeSec: p.freezeSec
            });
          }
        }
        continue;
      }

      // ── Earth rock emerge → fly ──
      if (p.kind === 'earth_rock') {
        if (p.phase === 'emerge') {
          const u = Math.min(1, p.age / p.emergeDur);
          p.mesh.position.lerpVectors(p.emergeFrom, p.emergeTo, u);
          p.mesh.rotation.x += dt * 4;
          p.mesh.rotation.z += dt * 2;
          if (u >= 1) {
            p.phase = 'fly';
            const dir = p.flyTarget.clone().sub(p.mesh.position);
            if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1);
            else dir.normalize();
            p.vel.copy(dir).multiplyScalar(p.flySpeed);
            // slight upward for linear
            if (p.aimMode === 'linear') p.vel.y += 1.2;
            else p.vel.y += 2.0;
            p.gravity = -9;
          }
          continue;
        }
      }

      if (p.kind === 'emerge_tell') {
        p.mesh.scale.setScalar(0.9 + p.age * 1.5);
        p.mesh.rotation.y += dt * 6;
        continue;
      }

      // Integrate
      p.vel.y += (p.gravity || 0) * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      // Face velocity
      if (p.vel.lengthSq() > 1e-4 && p.kind !== 'bubble') {
        p.mesh.lookAt(p.mesh.position.clone().add(p.vel));
      }
      if (p.kind === 'bubble') {
        p.mesh.scale.multiplyScalar(1 + dt * 0.15);
      }

      // Arrow: fire end event at distance (even without target mesh hit)
      if (p.kind === 'arrow' && !p.endFired && p.endPoint) {
        if (p.mesh.position.distanceTo(p.endPoint) < 0.55 || p.age >= p.life - 0.05) {
          this._fireArrowEnd(p);
          p.hit = true;
          this._destroy(i, true);
          continue;
        }
      }

      // Contact
      for (const t of p.targets) {
        if (!t?.point) continue;
        const d = p.mesh.position.distanceTo(t.point);
        if (d <= p.contactRadius + 0.45) {
          p.hit = true;
          const fwd = p.vel.lengthSq() > 1e-4 ? p.vel.clone().normalize() : new Vector3(0, 0, 1);
          if (p.kind === 'arrow' && !p.endFired) this._fireArrowEnd(p, t);
          else {
            this.onHit({
              point: p.mesh.position.clone(),
              forward: fwd,
              force: p.force,
              knockbackMm: p.knockbackMm,
              knockupVy: p.knockupVy,
              aoe: p.aoe,
              element: p.element,
              target: t,
              freeze: p.freeze,
              freezeSec: p.freezeSec,
              endEvent: p.endEvent
            });
          }
          if (p.explodeOnHit) this._explode(p);
          this._destroy(i, true);
          break;
        }
      }
      // Ground hit for drop shots
      if (p.gravity < 0 && p.mesh.position.y <= 0.08 && p.kind !== 'emerge_tell') {
        p.hit = true;
        if (p.kind === 'arrow' && !p.endFired) this._fireArrowEnd(p);
        else {
          this.onHit({
            point: p.mesh.position.clone(),
            forward: new Vector3(0, -1, 0),
            force: p.force,
            knockbackMm: p.knockbackMm,
            knockupVy: p.knockupVy,
            aoe: p.aoe,
            element: p.element,
            target: null,
            endEvent: p.endEvent
          });
        }
        if (p.explodeOnHit) this._explode(p);
        this._destroy(i, true);
      }
    }
  }

  _finishFreezeNova(p) {
    this.vfx?.deploy?.('frost_wave', {
      origin: p.origin.clone(),
      intensity: 0.9
    });
  }

  /**
   * Arrow end events: explode / aoe / blink / return / throw / trap / place / summon
   * Distance already baked into endPoint.
   */
  _fireArrowEnd(p, target = null) {
    if (p.endFired) return;
    p.endFired = true;
    const at = p.mesh?.position?.clone?.() || p.endPoint?.clone?.() || new Vector3();
    const ev = p.endEvent || 'impact';
    const fwd =
      p.vel?.lengthSq?.() > 1e-4 ? p.vel.clone().normalize() : new Vector3(0, 0, 1);

    if (ev === 'explode' || ev === 'impact') {
      this.vfx?.deploy?.('inferno', { origin: at, intensity: 1.1 });
    } else if (ev === 'aoe') {
      this.vfx?.deploy?.('inferno', { origin: at, intensity: 1.2 });
      this.pulse({
        origin: at,
        aoe: p.aoe || 2.2,
        element: 'arcane',
        targets: p.targets,
        force: p.force
      });
    } else if (ev === 'blink') {
      // Teleport-style: flash at end; host may move character via onHit
      this.vfx?.deploy?.('arcane_swirl', { origin: at, intensity: 1.15 });
      this.vfx?.deploy?.('moon_beam', { origin: at, intensity: 0.8 });
    } else if (ev === 'return') {
      this.vfx?.deploy?.('chain_lightning', { origin: at, intensity: 0.9 });
    } else if (ev === 'trap' || ev === 'place_device') {
      this.vfx?.deploy?.('earth_surge', { origin: at, intensity: 0.85 });
    } else if (ev === 'summon') {
      this.vfx?.deploy?.('arcane_swirl', { origin: at, intensity: 1.0 });
    } else if (ev === 'throw') {
      this.vfx?.deploy?.('inferno', { origin: at, intensity: 0.75 });
    }

    this.onHit({
      point: at,
      forward: fwd,
      force: p.force,
      knockbackMm: p.knockbackMm,
      knockupVy: p.knockupVy,
      aoe: p.aoe,
      element: p.element,
      target,
      endEvent: ev
    });
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
