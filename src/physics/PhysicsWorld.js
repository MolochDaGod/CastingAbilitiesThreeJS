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
   * Move player CCT with desired XZ velocity + gravity.
   * @param {number} vx
   * @param {number} vz
   * @param {number} dt
   * @returns {{ x: number, y: number, z: number, grounded: boolean }}
   */
  movePlayer(vx, vz, dt) {
    if (!this.ready || !this.playerBody || !this.characterController) {
      return { x: 0, y: 0, z: 0, grounded: true };
    }
    const entry = this.bodies.get('player');
    const r = entry.radius;
    const hh = entry.halfHeight;

    // Accumulate fixed steps
    this.accumulator += Math.min(dt, 0.05);
    let grounded = false;
    while (this.accumulator >= FIXED_DT) {
      const desired = {
        x: vx * FIXED_DT,
        y: -9.81 * FIXED_DT * FIXED_DT * 0.5 - 0.35 * FIXED_DT, // settle + gravity bias
        z: vz * FIXED_DT
      };
      this.characterController.computeColliderMovement(this.playerCollider, desired);
      const mv = this.characterController.computedMovement();
      grounded = this.characterController.computedGrounded();
      const t = this.playerBody.translation();
      this.playerBody.setNextKinematicTranslation({
        x: t.x + mv.x,
        y: t.y + mv.y,
        z: t.z + mv.z
      });
      this.world.step();
      this.accumulator -= FIXED_DT;
    }

    const t = this.playerBody.translation();
    // Feet y for character root
    const feetY = t.y - hh - r;
    return { x: t.x, y: Math.max(0, feetY), z: t.z, grounded };
  }

  /** Teleport kinematic player (spawn / reset). */
  setPlayerFeet(x, y, z) {
    if (!this.playerBody) return;
    const entry = this.bodies.get('player');
    const centerY = y + entry.radius + entry.halfHeight;
    this.playerBody.setNextKinematicTranslation({ x, y: centerY, z });
    this.world.step();
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
