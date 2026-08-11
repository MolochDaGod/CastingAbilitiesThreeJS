import RAPIER from '@dimforge/rapier3d-compat';
import { PLAYER_CAPSULE, WORLD } from '../config/worldScale.js';

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
      this.characterController.computeColliderMovement(this.playerCollider, desired);
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

    // Rapier heightfield: heights length (nrows+1)*(ncols+1)
    const nrows = desc.nrows | 0;
    const ncols = desc.ncols | 0;
    const scale = desc.scale || { x: 1, y: 1, z: 1 };
    const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, 0, 0));
    let colliderDesc;
    try {
      colliderDesc = RAPIER.ColliderDesc.heightfield(nrows, ncols, desc.heights, scale)
        .setFriction(0.95)
        .setRestitution(0.02);
    } catch (err) {
      console.warn('[PhysicsWorld] heightfield create failed — keep flat ground', err);
      // Restore flat
      const half = WORLD.physicsGroundHalf;
      const gb = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.05, 0));
      const gc = this.world.createCollider(
        RAPIER.ColliderDesc.cuboid(half, 0.05, half).setFriction(0.9),
        gb
      );
      this.bodies.set('ground', { body: gb, collider: gc, kind: 'ground' });
      return false;
    }
    const col = this.world.createCollider(colliderDesc, body);
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
    if (this.world) {
      this.world.free();
      this.world = null;
    }
    this.ready = false;
  }
}
