import RAPIER from '@dimforge/rapier3d-compat';
import { Box3, Quaternion, Vector3 } from 'three';
import { PLAYER_CAPSULE, WORLD } from '../config/worldScale.js';
import { sampleMeshLocalPositions } from '../character/weaponMeshCollider.js';

const _p = new Vector3();
const _q = new Quaternion();
const _s = new Vector3();
const _up = new Vector3(0, 1, 0);
const _tan = new Vector3();

const SKIP_MESH_RE =
  /grass|water|helper|debug|collider_|volume|trail|particle|fog|sprite|afterimage|highlight|harvest_highlight|harvest_chip/i;

const _fragBox = new Box3();

/**
 * Fleet-style Rapier world for Casting Abilities.
 * SI meters, fixed 1/60, ground plane + human CCT capsule.
 * @see grudge-rapier · https://rapier.rs/docs/api/javascript/JavaScript3D
 */

export const FIXED_DT = 1 / 60;
/** Human capsule ~1.8–2.0 m hero (fleet SI) */
export const HUMAN_CAPSULE = { radius: PLAYER_CAPSULE.radius, halfHeight: PLAYER_CAPSULE.halfHeight };

let _initPromise = null;

export async function initRapier() {
  if (!_initPromise) {
    // rapier3d-compat 0.19 embeds base64 wasm and calls init(bytes) internally.
    // Vite plugin `fix-rapier-init-deprecation` normalizes that to
    // `{ module_or_path: bytes }` so the wasm-bindgen warn is gone.
    _initPromise = RAPIER.init().then(() => RAPIER);
  }
  return _initPromise;
}

export class PhysicsWorld {
  constructor() {
    /** @type {import('@dimforge/rapier3d-compat').World|null} */
    this.world = null;
    this.accumulator = 0;
    /** @type {Map<string, {body: any, collider: any, kind: string}>} */
    this.bodies = new Map();
    this.characterController = null;
    this.playerCollider = null;
    this.playerBody = null;
    this.ready = false;
    this.debug = typeof location !== 'undefined' && /[?&]physicsDebug=1/.test(location.search);
    /** Vertical velocity for jumps (m/s). Gravity integrates each step. */
    this.vy = 0;
    this.grounded = true;
    this.gravity = -9.81;
    this._follow = [];
    /** Spline VFX: kinematic shape head + effect sensor beads (one world). */
    this._splineVfx = [];
    /** Harvest mine chips — dynamic convex, density > 0 (Rapier law). */
    this._fragments = [];
    /** Multiplier on gravity (backflip hang = ~0.32 for air-aim window) */
    this.gravityScale = 1;
  }

  async init(opts = {}) {
    await initRapier();
    const g = opts.gravityY ?? -9.81;
    this.world = new RAPIER.World({ x: 0, y: g, z: 0 });
    this.world.timestep = FIXED_DT;

    // Default flat ground — replaced by addHeightfield when island terrain loads
    const groundBody = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.05, 0));
    const half = WORLD.physicsGroundHalf;
    const groundCol = this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(half, 0.05, half).setFriction(0.9).setRestitution(0.05),
      groundBody
    );
    this.bodies.set('ground', { body: groundBody, collider: groundCol, kind: 'ground' });
    /** Optional water surface Y sampler (ocean layer) */
    this.waterHeightAt = null;
    /** Optional land height sampler (matches heightfield) */
    this.landHeightAt = null;
    /** @type {{ id: string, mesh: import('three').Object3D, body: any }[]} */
    this._follow = [];
    this._splineVfx = [];
    this._fragments = [];

    // Player kinematic capsule (CCT)
    const r = opts.radius ?? HUMAN_CAPSULE.radius;
    const hh = opts.halfHeight ?? HUMAN_CAPSULE.halfHeight;
    const feetY = opts.feetY ?? 0;
    const centerY = feetY + r + hh;
    const bodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, centerY, 0);
    this.playerBody = this.world.createRigidBody(bodyDesc);
    this.playerCollider = this.world.createCollider(
      RAPIER.ColliderDesc.capsule(hh, r).setFriction(0.7).setDensity(0),
      this.playerBody
    );
    this.characterController = this.world.createCharacterController(0.01);
    this.characterController.setApplyImpulsesToDynamicBodies(true);
    // API is positional (maxHeight, minWidth, includeDynamicBodies) — not an object.
    this.characterController.enableAutostep(0.35, 0.2, true);
    this.characterController.enableSnapToGround(0.3);
    this.bodies.set('player', {
      body: this.playerBody,
      collider: this.playerCollider,
      kind: 'player',
      radius: r,
      halfHeight: hh
    });

    this.ready = true;
    return this;
  }

  /**
   * Apply jump impulse (m/s). Call once per jump press.
   * @param {number} impulseVy
   */
  jump(impulseVy) {
    if (!this.ready) return;
    this.vy = Math.max(this.vy, impulseVy);
    this.grounded = false;
  }

  /**
   * Scale world gravity for hang time (1 = normal). Clamped ≥ 0.05.
   * @param {number} scale
   */
  setGravityScale(scale = 1) {
    this.gravityScale = Math.max(0.05, Number(scale) || 1);
  }

  /** Kill vertical velocity (hard stop / float entry). */
  zeroVerticalVelocity() {
    this.vy = 0;
  }

  /**
   * Move player CCT with desired XZ velocity + integrated vertical jump.
   * @param {number} vx
   * @param {number} vz
   * @param {number} dt
   * @returns {{ x: number, y: number, z: number, grounded: boolean, vy: number }}
   */
  movePlayer(vx, vz, dt) {
    if (!this.ready || !this.playerBody || !this.characterController) {
      return { x: 0, y: 0, z: 0, grounded: true, vy: 0 };
    }
    const entry = this.bodies.get('player');
    const r = entry.radius;
    const hh = entry.halfHeight;
    const g = this.gravity * (this.gravityScale ?? 1);

    this.accumulator += Math.min(dt, 0.05);
    let grounded = this.grounded;
    while (this.accumulator >= FIXED_DT) {
      // Integrate vertical velocity (SI: m/s²)
      this.vy += g * FIXED_DT;
      // Slight ground snap when nearly landed and falling
      let dy = this.vy * FIXED_DT;
      if (grounded && this.vy <= 0) {
        this.vy = 0;
        dy = -0.35 * FIXED_DT; // keep CCT grounded settle
      }

      const desired = {
        x: vx * FIXED_DT,
        y: dy,
        z: vz * FIXED_DT
      };
      // Water / VFX sensors must not snag the CCT
      const skipSensors = RAPIER.QueryFilterFlags?.EXCLUDE_SENSORS ?? 8;
      this.characterController.computeColliderMovement(
        this.playerCollider,
        desired,
        skipSensors
      );
      const mv = this.characterController.computedMovement();
      grounded = this.characterController.computedGrounded();
      // If we hit ceiling, kill upward velocity
      if (this.vy > 0 && mv.y < desired.y * 0.5) this.vy = 0;
      // Landed
      if (grounded && this.vy <= 0) this.vy = 0;

      const t = this.playerBody.translation();
      this.playerBody.setNextKinematicTranslation({
        x: t.x + mv.x,
        y: t.y + mv.y,
        z: t.z + mv.z
      });
      this.world.step();
      this.accumulator -= FIXED_DT;
    }
    this.syncFragments();

    this.grounded = grounded;
    const t = this.playerBody.translation();
    let feetY = t.y - hh - r;
    // Snap feet to land sampler if CCT slightly floats (heightfield edge cases)
    if (grounded && typeof this.landHeightAt === 'function') {
      const landY = this.landHeightAt(t.x, t.z);
      if (Number.isFinite(landY) && Math.abs(feetY - landY) < 0.45) {
        feetY = landY;
      }
    }
    return {
      x: t.x,
      y: feetY,
      z: t.z,
      grounded,
      vy: this.vy
    };
  }

  /**
   * Teleport kinematic player (spawn / reset / ride mount glue).
   * Does not apply CCT gravity — keeps capsule under the board while mounted.
   */
  setPlayerFeet(x, y, z) {
    if (!this.playerBody) return;
    const entry = this.bodies.get('player');
    const centerY = y + entry.radius + entry.halfHeight;
    // Instant kinematic snap (no step) so ride mount is not knocked by gravity
    if (typeof this.playerBody.setTranslation === 'function') {
      this.playerBody.setTranslation({ x, y: centerY, z }, true);
    } else {
      this.playerBody.setNextKinematicTranslation({ x, y: centerY, z });
      this.world.step();
    }
  }

  getPlayerFeet() {
    if (!this.playerBody) return { x: 0, y: 0, z: 0 };
    const entry = this.bodies.get('player');
    const t = this.playerBody.translation();
    return { x: t.x, y: t.y - entry.halfHeight - entry.radius, z: t.z };
  }

  /**
   * Replace flat ground with Rapier heightfield (island terrain).
   * Official: https://rapier.rs/docs/user_guides/javascript/colliders#heightfield
   * three.js example: physics_rapier_terrain
   *
   * @param {{
   *   nrows: number,
   *   ncols: number,
   *   heights: Float32Array,
   *   scale: { x: number, y: number, z: number }
   * }} desc
   * @param {{ landHeightAt?: (x:number,z:number)=>number, waterHeightAt?: (x:number,z:number,t?:number)=>number }} [samplers]
   */
  _restoreFlatGround() {
    const half = WORLD.physicsGroundHalf;
    const gb = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.05, 0));
    const gc = this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(half, 0.05, half).setFriction(0.9).setRestitution(0.05),
      gb
    );
    this.bodies.set('ground', { body: gb, collider: gc, kind: 'ground' });
  }

  addHeightfield(desc, samplers = {}) {
    if (!this.ready || !this.world || !desc?.heights) return false;
    // Remove flat ground collider
    const old = this.bodies.get('ground');
    if (old) {
      try {
        if (old.collider) this.world.removeCollider(old.collider, true);
        if (old.body) this.world.removeRigidBody(old.body);
      } catch {
        /* ok */
      }
      this.bodies.delete('ground');
    }

    // Rapier: nrows/ncols = cells; heights length (nrows+1)*(ncols+1).
    // Passing vertex counts as nrows with n*n heights panics WASM (unreachable).
    let nrows = desc.nrows | 0;
    let ncols = desc.ncols | 0;
    const raw = desc.heights;
    const restoreFlat = (reason) => {
      console.warn(`[PhysicsWorld] heightfield skipped — ${reason}`);
      this._restoreFlatGround();
      this.landHeightAt = samplers.landHeightAt || this.landHeightAt;
      this.waterHeightAt = samplers.waterHeightAt || this.waterHeightAt;
      return false;
    };
    if (!raw || nrows < 1 || ncols < 1) return restoreFlat('missing grid');
    const len = raw.length | 0;
    if (len === nrows * ncols && nrows >= 3 && ncols >= 3) {
      nrows -= 1;
      ncols -= 1;
    }
    const expect = (nrows + 1) * (ncols + 1);
    if (len !== expect) {
      return restoreFlat(`size mismatch heights=${len} expect=${expect} (nrows=${nrows} cells)`);
    }
    const heights = raw instanceof Float32Array ? raw : new Float32Array(raw);
    for (let i = 0; i < heights.length; i++) {
      if (!Number.isFinite(heights[i])) heights[i] = 0;
    }
    const scale = desc.scale || { x: 1, y: 1, z: 1 };
    if (![scale.x, scale.y, scale.z].every((v) => Number.isFinite(v) && v > 0 && v < 1e6)) {
      return restoreFlat('invalid scale');
    }
    const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, 0, 0));
    let colliderDesc;
    try {
      colliderDesc = RAPIER.ColliderDesc.heightfield(nrows, ncols, heights, scale)
        .setFriction(0.95)
        .setRestitution(0.02);
    } catch (err) {
      console.warn('[PhysicsWorld] heightfield create failed — keep flat ground', err);
      try {
        this.world.removeRigidBody(body);
      } catch {
        /* */
      }
      return restoreFlat(err?.message || 'ColliderDesc.heightfield');
    }
    let col;
    try {
      col = this.world.createCollider(colliderDesc, body);
    } catch (err) {
      console.warn('[PhysicsWorld] heightfield collider panic — keep flat', err);
      try {
        this.world.removeRigidBody(body);
      } catch {
        /* */
      }
      return restoreFlat(err?.message || 'createCollider');
    }
    this.bodies.set('ground', { body, collider: col, kind: 'heightfield' });
    this.landHeightAt = samplers.landHeightAt || null;
    this.waterHeightAt = samplers.waterHeightAt || null;
    console.info(
      `[PhysicsWorld] heightfield ${nrows}×${ncols} scale=(${scale.x.toFixed(1)},${scale.y},${scale.z.toFixed(1)})`
    );
    return true;
  }

  /**
   * Water terrain layer — surface sensor + depth volume for buoyancy queries.
   * Solid walk is the heightfield (land + shore bathymetry under water).
   * Water "hits" terrain where landHeightAt < waterY (shore / shelf).
   * @param {{ waterY?: number, halfXZ?: number, deepY?: number }} [opts]
   */
  addWaterLayer(opts = {}) {
    if (!this.ready || !this.world) return;
    const waterY = opts.waterY ?? WORLD.waterY ?? 0;
    const deepY = opts.deepY ?? WORLD.oceanFloorY ?? -50;
    const half = opts.halfXZ ?? WORLD.physicsGroundHalf * 1.8;
    if (this.bodies.has('water')) return;

    // Thin sensor at surface (freeride / splash queries)
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(0, waterY - 0.15, 0)
    );
    const col = this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(half, 0.2, half).setSensor(true).setFriction(0),
      body
    );
    this.bodies.set('water', { body, collider: col, kind: 'water_sensor', waterY });

    // Deep water volume sensor (surface → deep floor) for submersion tests
    const depth = Math.max(2, waterY - deepY);
    const midY = (waterY + deepY) * 0.5;
    const volBody = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(0, midY, 0)
    );
    const volCol = this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(half * 1.05, depth * 0.5, half * 1.05)
        .setSensor(true)
        .setFriction(0),
      volBody
    );
    this.bodies.set('water_volume', {
      body: volBody,
      collider: volCol,
      kind: 'water_volume',
      waterY,
      deepY
    });
    console.info(
      `[PhysicsWorld] water surface y=${waterY} volume deepY=${deepY} (heightfield owns solid shore)`
    );
  }

  /**
   * True when land/seafloor height is under water surface (wet / swimming zone).
   * @param {number} x
   * @param {number} z
   * @param {number} [margin]
   */
  isSubmergedAt(x, z, margin = 0.05) {
    const land = this.sampleLandY(x, z);
    const water = this.sampleWaterY(x, z);
    return land < water - margin;
  }

  /**
   * Water column depth above terrain (0 on dry land).
   * @param {number} x
   * @param {number} z
   */
  waterDepthAt(x, z) {
    const land = this.sampleLandY(x, z);
    const water = this.sampleWaterY(x, z);
    return Math.max(0, water - land);
  }

  /**
   * Sample land height if sampler set (post-heightfield).
   * @param {number} x
   * @param {number} z
   */
  sampleLandY(x, z) {
    if (typeof this.landHeightAt === 'function') return this.landHeightAt(x, z);
    return 0;
  }

  /**
   * Sample water surface (waves) if set.
   * @param {number} x
   * @param {number} z
   * @param {number} [t]
   */
  sampleWaterY(x, z, t = 0) {
    if (typeof this.waterHeightAt === 'function') return this.waterHeightAt(x, z, t);
    return WORLD.waterY ?? -0.04;
  }

  /**
   * Dynamic sphere for skill projectile hit proxy (sensor).
   * @returns {string} id
   */
  /**
   * Skip helpers / skinned heroes / instanced grass — those are not static GLTF colliders.
   * @param {import('three').Object3D} o
   */
  _isStaticColliderMesh(o) {
    if (!o?.isMesh || o.isSkinnedMesh || o.isInstancedMesh) return false;
    if (!o.visible || !o.geometry?.attributes?.position) return false;
    const n = `${o.name || ''} ${o.parent?.name || ''}`;
    if (SKIP_MESH_RE.test(n)) return false;
    if (o.userData?.ignorePhysics || o.userData?.rigDebug) return false;
    return true;
  }

  /**
   * World-space packed xyz from a mesh (real GLTF verts, not a box guess).
   * @param {import('three').Mesh} mesh
   * @param {number} [maxVerts]
   */
  meshWorldVerts(mesh, maxVerts = 256) {
    const local = sampleMeshLocalPositions(mesh, maxVerts);
    if (!local || local.length < 12) return null;
    mesh.updateWorldMatrix(true, false);
    const out = new Float32Array(local.length);
    for (let i = 0; i < local.length; i += 3) {
      _p.set(local[i], local[i + 1], local[i + 2]).applyMatrix4(mesh.matrixWorld);
      out[i] = _p.x;
      out[i + 1] = _p.y;
      out[i + 2] = _p.z;
    }
    return out;
  }

  /**
   * Mesh-local verts with scale baked (body owns world translation + rotation).
   * @param {import('three').Mesh} mesh
   * @param {number} [maxVerts]
   */
  meshLocalScaledVerts(mesh, maxVerts = 96) {
    const local = sampleMeshLocalPositions(mesh, maxVerts);
    if (!local || local.length < 12) return null;
    mesh.updateWorldMatrix(true, false);
    mesh.matrixWorld.decompose(_p, _q, _s);
    const out = new Float32Array(local.length);
    for (let i = 0; i < local.length; i += 3) {
      out[i] = local[i] * _s.x;
      out[i + 1] = local[i + 1] * _s.y;
      out[i + 2] = local[i + 2] * _s.z;
    }
    return out;
  }

  /**
   * Fixed trimesh or convex from a GLTF mesh. Trimesh = fixed only (Rapier law).
   * Large meshes (>8k tris) fall back to convex hull of sampled verts.
   * @returns {string|null} body id
   */
  _vertsAreSafe(arr) {
    if (!arr || arr.length < 12) return false;
    for (let i = 0; i < arr.length; i++) {
      const v = arr[i];
      if (!Number.isFinite(v) || Math.abs(v) > 1e5) return false;
    }
    return true;
  }

  addMeshCollider(mesh, opts = {}) {
    if (!this.ready || !this._isStaticColliderMesh(mesh)) return null;
    const id = opts.id || `mesh_${mesh.uuid}`;
    if (this.bodies.has(id)) this.removeBody(id);

    const geo = mesh.geometry;
    const pos = geo.attributes.position;
    if (!pos || pos.count < 4) return null;
    const indexed = !!geo.index;
    const triCount = indexed ? geo.index.count / 3 : pos.count / 3;
    const useTrimesh = opts.shape !== 'convex' && triCount <= (opts.maxTris ?? 8000);

    mesh.updateWorldMatrix(true, false);
    mesh.matrixWorld.decompose(_p, _q, _s);
    if (![ _p.x, _p.y, _p.z, _s.x, _s.y, _s.z ].every(Number.isFinite)) return null;

    let desc = null;
    try {
      if (useTrimesh) {
        const verts = new Float32Array(pos.count * 3);
        mesh.updateWorldMatrix(true, false);
        for (let i = 0; i < pos.count; i++) {
          _p.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
          verts[i * 3] = _p.x;
          verts[i * 3 + 1] = _p.y;
          verts[i * 3 + 2] = _p.z;
        }
        if (this._vertsAreSafe(verts)) {
          const idx = indexed
            ? new Uint32Array(geo.index.array)
            : (() => {
                const n = pos.count;
                const a = new Uint32Array(n);
                for (let i = 0; i < n; i++) a[i] = i;
                return a;
              })();
          desc = RAPIER.ColliderDesc.trimesh(verts, idx);
        }
      }
      if (!desc) {
        const hull = this.meshWorldVerts(mesh, opts.hullVerts ?? 96);
        if (!hull || !this._vertsAreSafe(hull)) return null;
        desc = RAPIER.ColliderDesc.convexHull(hull);
      }
    } catch (err) {
      console.warn('[PhysicsWorld] mesh collider skipped', mesh.name, err);
      return null;
    }
    if (!desc) return null;
    desc.setFriction(opts.friction ?? 0.7).setRestitution(opts.restitution ?? 0.02);
    if (opts.sensor) desc.setSensor(true);

    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(0, 0, 0)
    );
    const col = this.world.createCollider(desc, body);
    const colliderClass = useTrimesh ? 'trimesh' : 'convex';
    mesh.userData.colliderClass = colliderClass;
    this.bodies.set(id, {
      body,
      collider: col,
      kind: colliderClass,
      colliderClass,
      mesh
    });
    return id;
  }

  /**
   * Walk a GLTF group and add real-mesh colliders (harvest, dummies, scenery).
   * Skips skinned kits and grass.
   * @returns {number} count
   */
  addGltfStaticColliders(root, opts = {}) {
    if (!this.ready || !root) return 0;
    let n = 0;
    root.updateMatrixWorld(true);
    root.traverse((o) => {
      if (!this._isStaticColliderMesh(o)) return;
      const id = this.addMeshCollider(o, {
        ...opts,
        id: opts.idPrefix ? `${opts.idPrefix}_${o.uuid}` : undefined,
        shape: opts.shape || 'convex'
      });
      if (id) n += 1;
    });
    return n;
  }

  /**
   * Drop every Rapier body whose mesh lives under `root` (harvest remain / break).
   * @param {import('three').Object3D} root
   * @returns {number}
   */
  removeBodiesForObject(root) {
    if (!root || !this.ready) return 0;
    const ids = [];
    for (const [id, e] of this.bodies) {
      if (!e?.mesh) continue;
      let o = e.mesh;
      while (o) {
        if (o === root) {
          ids.push(id);
          break;
        }
        o = o.parent;
      }
    }
    for (const id of ids) this.removeBody(id);
    return ids.length;
  }

  /**
   * Rebuild convex hull after a harvest remain scale (same mesh, new world verts).
   * @param {import('three').Object3D} root
   * @param {{ idPrefix?: string, shape?: string }} [opts]
   */
  rebuildGltfStaticColliders(root, opts = {}) {
    this.removeBodiesForObject(root);
    return this.addGltfStaticColliders(root, opts);
  }

  /**
   * Dynamic harvest chip — density > 0 or it will not fly (Rapier common mistake).
   * @param {import('three').Mesh} mesh
   * @param {{ linvel?: {x:number,y:number,z:number}, angvel?: {x:number,y:number,z:number}, density?: number, life?: number, id?: string }} [opts]
   */
  addDynamicFragment(mesh, opts = {}) {
    if (!this.ready || !mesh?.isMesh) return null;
    const id = opts.id || `frag_${mesh.uuid}`;
    if (this.bodies.has(id)) this.removeBody(id);
    const verts = this.meshLocalScaledVerts(mesh, opts.hullVerts ?? 24);
    if (!verts) return null;
    const desc = RAPIER.ColliderDesc.convexHull(verts);
    if (!desc) return null;
    desc.setDensity(opts.density ?? 2.1).setFriction(0.55).setRestitution(0.14);
    mesh.updateWorldMatrix(true, false);
    mesh.matrixWorld.decompose(_p, _q, _s);
    const lv = opts.linvel || { x: 0, y: 2.4, z: 0 };
    const av = opts.angvel || { x: 0, y: 0, z: 0 };
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(_p.x, _p.y, _p.z)
        .setRotation({ x: _q.x, y: _q.y, z: _q.z, w: _q.w })
        .setLinvel(lv.x, lv.y, lv.z)
        .setAngvel(av.x, av.y, av.z)
    );
    const col = this.world.createCollider(desc, body);
    mesh.userData.colliderClass = 'convex';
    this.bodies.set(id, {
      body,
      collider: col,
      kind: 'fragment',
      colliderClass: 'convex',
      mesh
    });
    this._fragments.push({
      id,
      mesh,
      body,
      born: performance.now() / 1000,
      life: opts.life ?? 2.8
    });
    return id;
  }

  /** Copy dynamic fragment poses onto Three meshes; despawn expired chips. */
  syncFragments() {
    if (!this._fragments?.length) return;
    const now = performance.now() / 1000;
    const keep = [];
    for (const f of this._fragments) {
      if (!f.body || now - f.born > f.life) {
        this.removeBody(f.id);
        f.mesh?.removeFromParent?.();
        continue;
      }
      const t = f.body.translation();
      const r = f.body.rotation();
      if (f.mesh) {
        f.mesh.position.set(t.x, t.y, t.z);
        f.mesh.quaternion.set(r.x, r.y, r.z, r.w);
      }
      keep.push(f);
    }
    this._fragments = keep;
  }

  /**
   * Fail-closed spawn: drop static harvest/scenery hulls whose AABB overlaps the CCT pad.
   * Never removes heightfield / player / water.
   * @returns {number} removed count
   */
  clearSpawnSolid(x = 0, z = 0, radiusM = 1.8) {
    if (!this.ready) return 0;
    const drop = [];
    for (const [id, e] of this.bodies) {
      if (!e?.mesh) continue;
      if (id === 'player' || e.kind === 'heightfield' || e.kind === 'ground' || e.kind === 'water') {
        continue;
      }
      try {
        e.mesh.updateWorldMatrix?.(true, false);
        _fragBox.setFromObject(e.mesh);
        const cx = Math.min(Math.max(x, _fragBox.min.x), _fragBox.max.x);
        const cz = Math.min(Math.max(z, _fragBox.min.z), _fragBox.max.z);
        if (Math.hypot(cx - x, cz - z) <= radiusM) drop.push(id);
      } catch {
        /* skip */
      }
    }
    for (const id of drop) this.removeBody(id);
    return drop.length;
  }

  /**
   * Kinematic convex hull that follows an animated mesh (weapon on Bip001 R Hand).
   * Sensor by default so the CCT does not snag the player's own blade.
   */
  attachFollowConvex(id, mesh, opts = {}) {
    if (!this.ready || !mesh?.isMesh) return null;
    this.detachFollow(id);
    const verts = this.meshLocalScaledVerts(mesh, opts.hullVerts ?? 64);
    if (!verts || !this._vertsAreSafe(verts)) return null;
    let desc = null;
    try {
      desc = RAPIER.ColliderDesc.convexHull(verts);
    } catch {
      return null;
    }
    if (!desc) return null;
    desc.setFriction(0.2);
    if (opts.sensor !== false) desc.setSensor(true);
    mesh.updateWorldMatrix(true, false);
    mesh.matrixWorld.decompose(_p, _q, _s);
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased()
        .setTranslation(_p.x, _p.y, _p.z)
        .setRotation({ x: _q.x, y: _q.y, z: _q.z, w: _q.w })
    );
    const col = this.world.createCollider(desc, body);
    mesh.userData.colliderClass = 'followConvex';
    this.bodies.set(id, { body, collider: col, kind: 'followConvex', colliderClass: 'followConvex', mesh });
    this._follow.push({ id, mesh, body });
    return id;
  }

  detachFollow(id) {
    this._follow = this._follow.filter((f) => f.id !== id);
    if (this.bodies.has(id)) this.removeBody(id);
  }

  /** Sync kinematic follow hulls from Three.js mesh world Matrix4. */
  syncFollowMeshes() {
    if (!this.ready) return;
    for (const f of this._follow) {
      if (!f.mesh || !f.body) continue;
      f.mesh.updateWorldMatrix(true, false);
      f.mesh.matrixWorld.decompose(_p, _q, _s);
      if (typeof f.body.setNextKinematicTranslation === 'function') {
        f.body.setNextKinematicTranslation({ x: _p.x, y: _p.y, z: _p.z });
        f.body.setNextKinematicRotation({ x: _q.x, y: _q.y, z: _q.z, w: _q.w });
      }
    }
  }

  /**
   * Best physics ray for GLTF play: Rapier scene query (not a second engine).
   * Excludes player CCT **and sensors** (water volume / VFX beads ate the aim ray).
   * Hits heightfield + static convex props.
   */
  castRay(origin, dir, maxToi = 80) {
    if (!this.ready || !this.world || !origin || !dir) return null;
    const lx = Number(dir.x);
    const ly = Number(dir.y);
    const lz = Number(dir.z);
    const len = Math.hypot(lx, ly, lz);
    if (len < 1e-8) return null;
    const nx = lx / len;
    const ny = ly / len;
    const nz = lz / len;
    const ray = new RAPIER.Ray(
      { x: origin.x, y: origin.y, z: origin.z },
      { x: nx, y: ny, z: nz }
    );
    const skipSensors = RAPIER.QueryFilterFlags?.EXCLUDE_SENSORS ?? 8;
    const hit = this.world.castRay(
      ray,
      maxToi,
      true,
      skipSensors,
      undefined,
      this.playerCollider || undefined,
      this.playerBody || undefined
    );
    if (!hit) return null;
    const toi = hit.timeOfImpact;
    if (!Number.isFinite(toi) || toi < 0) return null;
    return {
      toi,
      point: {
        x: origin.x + nx * toi,
        y: origin.y + ny * toi,
        z: origin.z + nz * toi
      }
    };
  }

  /**
   * Three Rapier VFX roles on this world (not three worlds):
   *   shape  — kinematic capsule, driven along a CatmullRom (mist/line head)
   *   slash  — followConvex weapon hull (attachFollowConvex)
   *   effect — kinematic sensor balls (heal mist, tether beads, totem field)
   *
   * @param {string} id
   * @param {{ x: number, y: number, z: number }} pos
   * @param {{ role?: 'shape'|'effect', shape?: 'capsule'|'ball', radius?: number, halfHeight?: number }} [opts]
   */
  spawnKinematicSensor(id, pos, opts = {}) {
    if (!this.ready || !pos) return null;
    if (this.bodies.has(id)) this.removeBody(id);
    const role = opts.role === 'shape' ? 'shape' : 'effect';
    const radius = Number(opts.radius) > 0 ? opts.radius : role === 'shape' ? 0.22 : 0.48;
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(pos.x, pos.y, pos.z)
    );
    const useCapsule = opts.shape === 'capsule' || role === 'shape';
    const desc = useCapsule
      ? RAPIER.ColliderDesc.capsule(opts.halfHeight ?? 0.32, radius)
      : RAPIER.ColliderDesc.ball(radius);
    desc.setSensor(true).setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
    const col = this.world.createCollider(desc, body);
    this.bodies.set(id, {
      body,
      collider: col,
      kind: role,
      colliderClass: 'sensor',
      vfxRole: role
    });
    return id;
  }

  /**
   * Shape capsule + effect beads along a CatmullRom. Head advances at constant m/s.
   * @param {string} id
   * @param {{ getPointAt: Function, getTangentAt?: Function, getLength?: Function, getPoints?: Function }} curve
   * @param {{ beads?: number, life?: number, speed?: number, heal?: boolean, effects?: boolean, shapeRadius?: number, effectRadius?: number }} [opts]
   */
  spawnSplineVfx(id, curve, opts = {}) {
    if (!this.ready || !curve) return null;
    this.clearSplineVfx(id);
    const beads = Math.max(2, Math.min(10, Math.round(opts.beads ?? 6)));
    const pts =
      typeof curve.getPoints === 'function'
        ? curve.getPoints(beads)
        : [curve.getPointAt(0), curve.getPointAt(1)];
    const start = pts[0];
    if (!start) return null;
    const shapeId = `${id}:shape`;
    this.spawnKinematicSensor(shapeId, start, {
      role: 'shape',
      shape: 'capsule',
      radius: opts.shapeRadius ?? 0.22,
      halfHeight: 0.32
    });
    const beadIds = [];
    if (opts.effects !== false) {
      for (let i = 0; i < pts.length; i++) {
        const bid = `${id}:fx:${i}`;
        this.spawnKinematicSensor(bid, pts[i], {
          role: 'effect',
          shape: 'ball',
          radius: opts.effectRadius ?? (opts.heal ? 0.7 : 0.48)
        });
        beadIds.push(bid);
      }
    }
    this._splineVfx.push({
      id,
      shapeId,
      beadIds,
      curve,
      u: 0,
      speed: opts.speed ?? 11,
      life: opts.life ?? 2.4,
      age: 0,
      heal: !!opts.heal
    });
    return id;
  }

  tickSplineVfx(dt) {
    if (!this.ready || !this._splineVfx.length) return;
    const keep = [];
    for (const s of this._splineVfx) {
      s.age += dt;
      if (s.age >= s.life) {
        this._disposeSplineRec(s);
        continue;
      }
      const len =
        (typeof s.curve.getLength === 'function' && s.curve.getLength()) || 8;
      s.u = Math.min(1, s.u + (s.speed * dt) / Math.max(0.6, len));
      const p =
        typeof s.curve.getPointAt === 'function' ? s.curve.getPointAt(s.u) : null;
      const shape = this.bodies.get(s.shapeId);
      if (p && shape?.body?.setNextKinematicTranslation) {
        shape.body.setNextKinematicTranslation({ x: p.x, y: p.y, z: p.z });
        if (typeof s.curve.getTangentAt === 'function' && shape.body.setNextKinematicRotation) {
          _tan.copy(s.curve.getTangentAt(s.u));
          if (_tan.lengthSq() > 1e-8) {
            _tan.normalize();
            _q.setFromUnitVectors(_up, _tan);
            shape.body.setNextKinematicRotation({
              x: _q.x,
              y: _q.y,
              z: _q.z,
              w: _q.w
            });
          }
        }
      }
      keep.push(s);
    }
    this._splineVfx = keep;
  }

  _disposeSplineRec(s) {
    if (!s) return;
    this.removeBody(s.shapeId);
    for (const b of s.beadIds || []) this.removeBody(b);
  }

  clearSplineVfx(id) {
    if (!id) {
      for (const s of this._splineVfx) this._disposeSplineRec(s);
      this._splineVfx = [];
      return;
    }
    const keep = [];
    for (const s of this._splineVfx) {
      if (s.id !== id) {
        keep.push(s);
        continue;
      }
      this._disposeSplineRec(s);
    }
    this._splineVfx = keep;
  }

  spawnProjectileSensor(x, y, z, radius = 0.25) {
    if (!this.ready) return null;
    const id = `proj_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic().setTranslation(x, y, z).setLinvel(0, 0, 0)
    );
    const col = this.world.createCollider(
      RAPIER.ColliderDesc.ball(radius).setSensor(true).setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
      body
    );
    this.bodies.set(id, { body, collider: col, kind: 'projectile' });
    return id;
  }

  removeBody(id) {
    const e = this.bodies.get(id);
    if (!e || !this.world) return;
    this.world.removeCollider(e.collider, true);
    this.world.removeRigidBody(e.body);
    this.bodies.delete(id);
  }

  dispose() {
    this.clearSplineVfx();
    this._follow = [];
    this._fragments = [];
    if (this.world) {
      this.world.free();
      this.world = null;
    }
    this.ready = false;
  }
}
