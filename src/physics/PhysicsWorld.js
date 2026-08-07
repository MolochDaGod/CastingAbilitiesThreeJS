import RAPIER from '@dimforge/rapier3d-compat';

/**
 * Fleet-style Rapier world for Casting Abilities.
 * SI meters, fixed 1/60, ground plane + human CCT capsule.
 * @see grudge-rapier · https://rapier.rs/docs/api/javascript/JavaScript3D
 */

export const FIXED_DT = 1 / 60;
/** Human capsule: r≈0.32, halfH≈0.55 → ~1.8 m tall */
export const HUMAN_CAPSULE = { radius: 0.32, halfHeight: 0.55 };

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
  }

  async init(opts = {}) {
    await initRapier();
    const g = opts.gravityY ?? -9.81;
    this.world = new RAPIER.World({ x: 0, y: g, z: 0 });
    this.world.timestep = FIXED_DT;

    // Infinite ground plane at y=0 (fixed cuboid thin slab)
    const groundBody = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.05, 0));
    const groundCol = this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(80, 0.05, 80).setFriction(0.9).setRestitution(0.05),
      groundBody
    );
    this.bodies.set('ground', { body: groundBody, collider: groundCol, kind: 'ground' });

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
    const g = this.gravity;

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
    const feetY = t.y - hh - r;
    return {
      x: t.x,
      y: Math.max(0, feetY),
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
