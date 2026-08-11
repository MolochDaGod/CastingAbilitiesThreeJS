import { MathUtils, Raycaster, Vector2, Vector3 } from 'three';
import { settings } from '../config/settings.js';
import { projectToTerrain } from '../world/terrainGround.js';

const _ndc = new Vector2();
const _hit = new Vector3();
const _tmp = new Vector3();
const _tmp2 = new Vector3();
const _spawn = new Vector3();
const _dir = new Vector3();

/**
 * Combat mouse aim — snow-brawl style ray → world hit → launch vector.
 *
 * Free / focus: camera ray → **terrain mesh or height sample** (one SSOT),
 * then soft-lock bias + 3D launch dir. No separate heightmap here.
 *
 * @see world/terrainGround.js · docs/TERRAIN_PHYSICS_SSOT.md
 */
export class MouseAim {
  /**
   * @param {import('three').Camera} camera
   */
  constructor(camera) {
    this.camera = camera;
    this.raycaster = new Raycaster();
    this.raycaster.far = 400;
    /** World aim point (often ground / soft-lock blend) */
    this.point = new Vector3(0, 0, 4);
    /** 3D hit used for projectile targeting (may be above ground) */
    this.hitPoint = new Vector3(0, 1.2, 6);
    /** Camera ray origin / dir this frame */
    this.rayOrigin = new Vector3();
    this.rayDir = new Vector3(0, 0, -1);
    /** Unit XZ facing from player → aim (movement / body assist) */
    this.forward = new Vector3(0, 0, 1);
    /** Full 3D unit direction spawn → hit (projectiles) */
    this.forward3d = new Vector3(0, 0, 1);
    this.right = new Vector3(1, 0, 0);
    /** Horizontal aim yaw (atan2 x,z) */
    this.yaw = 0;
    this.valid = false;
    /** Screen NDC of last pointer / center */
    this.ndc = new Vector2();
    /** Optional colliders for ray (walls, props) — focus aim only */
    this.aimColliders = [];
    /** @type {import('../world/terrainGround.js').TerrainGround|null} */
    this.terrain = null;
  }

  /**
   * @param {import('three').Object3D[]} meshes
   */
  setAimColliders(meshes) {
    this.aimColliders = meshes || [];
  }

  /**
   * One terrain handle from App (mesh + sample). Same as PathDrawer.
   * @param {import('../world/terrainGround.js').TerrainGround|null} terrain
   */
  setTerrain(terrain) {
    this.terrain = terrain || null;
  }

  /**
   * Free cursor: NDC → terrain ground.
   * @param {Vector2|{x:number,y:number}} pointerNdc InputManager.pointer (-1..1)
   * @param {Vector3} playerPos character feet
   * @returns {boolean}
   */
  updateFromNdc(pointerNdc, playerPos) {
    const nx = pointerNdc?.x ?? 0;
    const ny = pointerNdc?.y ?? 0;
    this.ndc.set(nx, ny);
    _ndc.set(nx, ny);
    this.raycaster.setFromCamera(_ndc, this.camera);
    this.rayOrigin.copy(this.raycaster.ray.origin);
    this.rayDir.copy(this.raycaster.ray.direction).normalize();

    if (!projectToTerrain(this.raycaster, _hit, this.terrain)) {
      this.hitPoint.copy(this.rayOrigin).addScaledVector(this.rayDir, this._aimFar());
      const y =
        typeof this.terrain?.sample === 'function'
          ? this.terrain.sample(this.hitPoint.x, this.hitPoint.z)
          : 0;
      this.point.set(this.hitPoint.x, Number.isFinite(y) ? y : 0, this.hitPoint.z);
      this.valid = true;
      this._fromPlayer(playerPos);
      this._refreshLaunch(playerPos);
      return true;
    }
    this.point.copy(_hit);
    this.hitPoint.copy(_hit);
    this.hitPoint.y = Math.max(
      _hit.y + 0.15,
      (settings.aim?.projectileAimHeight ?? 1.15) * 0.2 + _hit.y
    );
    this.valid = true;
    this._fromPlayer(playerPos);
    this._refreshLaunch(playerPos);
    return true;
  }

  /**
   * Focus mode: crosshair at screen center (pointer-lock look).
   * Camera ray → ground/colliders/far · soft-lock bias · 3D launch vector.
   * @param {Vector3} playerPos feet
   * @param {{
   *   softTarget?: Vector3|null,
   *   softBlend?: number,
   *   maxSoftAngleDeg?: number,
   *   reticleNdc?: {x:number,y:number}
   * }} [opts]
   */
  updateFocusAim(playerPos, opts = {}) {
    const reticle = opts.reticleNdc || { x: 0, y: 0 };
    this.ndc.set(reticle.x ?? 0, reticle.y ?? 0);
    this.raycaster.far = this._aimFar();
    this.raycaster.setFromCamera(this.ndc, this.camera);
    this.rayOrigin.copy(this.raycaster.ray.origin);
    this.rayDir.copy(this.raycaster.ray.direction).normalize();

    // 1) Prefer mesh colliders (walls / props)
    let hit3 = null;
    if (this.aimColliders.length) {
      const hits = this.raycaster.intersectObjects(this.aimColliders, true);
      if (hits[0]) hit3 = hits[0].point.clone();
    }
    // 2) Terrain mesh / height sample (same SSOT as free aim + path draw)
    if (!hit3 && projectToTerrain(this.raycaster, _hit, this.terrain)) {
      hit3 = _hit.clone();
      const aimH = settings.aim?.projectileAimHeight ?? 1.15;
      hit3.y = _hit.y + aimH * 0.15;
    }
    // 3) Far point along look ray
    if (!hit3) {
      hit3 = this.rayOrigin.clone().addScaledVector(this.rayDir, this._aimFar());
    }

    this.hitPoint.copy(hit3);

    // Soft-lock magnetic pull (within cone — keeps accuracy when near crosshair)
    const soft = opts.softTarget;
    if (soft) {
      const blend = opts.softBlend ?? settings.aim?.softLockBlend ?? 0.55;
      const maxAng = MathUtils.degToRad(
        opts.maxSoftAngleDeg ?? settings.aim?.softLockMaxAngleDeg ?? 18
      );
      _dir.copy(soft).sub(this.rayOrigin);
      if (_dir.lengthSq() > 1e-6) {
        _dir.normalize();
        const ang = this.rayDir.angleTo(_dir);
        if (ang <= maxAng) {
          const closeness = 1 - ang / Math.max(1e-4, maxAng);
          const w = blend * (0.35 + closeness * 0.75);
          this.hitPoint.lerp(soft, MathUtils.clamp(w, 0, 0.9));
        }
      }
    }

    // Ground marker on terrain surface under hit
    const gy =
      typeof this.terrain?.sample === 'function'
        ? this.terrain.sample(this.hitPoint.x, this.hitPoint.z)
        : 0;
    this.point.set(
      this.hitPoint.x,
      (Number.isFinite(gy) ? gy : 0) + 0.05,
      this.hitPoint.z
    );
    this.valid = true;
    this._fromPlayer(playerPos);
    this._refreshLaunch(playerPos);
    return true;
  }

  /**
   * Focus mode: aim from screen center (crosshair), not free cursor.
   * @param {Vector3} playerPos
   * @deprecated prefer updateFocusAim
   */
  updateFromCenter(playerPos) {
    return this.updateFocusAim(playerPos);
  }

  /**
   * @param {number} clientX
   * @param {number} clientY
   * @param {Vector3} playerPos
   */
  updateFromClient(clientX, clientY, playerPos) {
    _ndc.set(
      (clientX / window.innerWidth) * 2 - 1,
      -(clientY / window.innerHeight) * 2 + 1
    );
    return this.updateFromNdc(_ndc, playerPos);
  }

  _aimFar() {
    return settings.aim?.aimRayFar ?? 80;
  }

  _fromPlayer(playerPos) {
    const dx = this.point.x - playerPos.x;
    const dz = this.point.z - playerPos.z;
    const len = Math.hypot(dx, dz);
    if (len < 0.05) {
      // Fall back to camera XZ
      _tmp.set(this.rayDir.x, 0, this.rayDir.z);
      if (_tmp.lengthSq() > 1e-6) {
        _tmp.normalize();
        this.forward.copy(_tmp);
        this.yaw = Math.atan2(this.forward.x, this.forward.z);
        this.right.set(this.forward.z, 0, -this.forward.x);
      }
      return;
    }
    this.forward.set(dx / len, 0, dz / len);
    this.yaw = Math.atan2(this.forward.x, this.forward.z);
    this.right.set(this.forward.z, 0, -this.forward.x);
  }

  /**
   * 3D unit direction from cast-height spawn to hit (snow-brawl spawn→target).
   * @param {Vector3} playerPos feet
   */
  _refreshLaunch(playerPos) {
    const chestY = settings.aim?.spawnHeight ?? 1.35;
    _spawn.set(playerPos.x, playerPos.y + chestY, playerPos.z);
    // Nudge spawn slightly along body forward so projectile clears the mesh
    _spawn.addScaledVector(this.forward, settings.aim?.spawnForwardM ?? 0.55);
    _dir.subVectors(this.hitPoint, _spawn);
    if (_dir.lengthSq() < 1e-8) {
      this.forward3d.copy(this.rayDir);
    } else {
      this.forward3d.copy(_dir).normalize();
    }
  }

  /**
   * Snow-brawl style projectile launch pose.
   * @param {Vector3} playerPos feet
   * @param {{ hand?: 'left'|'right', handOffsetM?: number, height?: number }} [opts]
   * @returns {{ origin: Vector3, direction: Vector3, target: Vector3, yaw: number }}
   */
  computeLaunch(playerPos, opts = {}) {
    const height = opts.height ?? settings.aim?.spawnHeight ?? 1.35;
    const hand = opts.hand || 'right';
    const handOff = opts.handOffsetM ?? settings.aim?.handOffsetM ?? 0.28;
    const side = hand === 'left' ? -1 : 1;

    const origin = new Vector3(
      playerPos.x,
      playerPos.y + height,
      playerPos.z
    );
    origin.addScaledVector(this.forward, settings.aim?.spawnForwardM ?? 0.55);
    origin.addScaledVector(this.right, side * handOff);

    const target = this.hitPoint.clone();
    const direction = target.clone().sub(origin);
    if (direction.lengthSq() < 1e-8) direction.copy(this.rayDir);
    else direction.normalize();

    return { origin, direction, target, yaw: this.yaw };
  }

  /**
   * Distance on XZ from player to aim (m).
   * @param {Vector3} playerPos
   */
  distanceTo(playerPos) {
    return Math.hypot(this.point.x - playerPos.x, this.point.z - playerPos.z);
  }

  /**
   * 3D distance spawn→hit.
   * @param {Vector3} playerPos
   */
  range3d(playerPos) {
    const h = settings.aim?.spawnHeight ?? 1.35;
    _spawn.set(playerPos.x, playerPos.y + h, playerPos.z);
    return _spawn.distanceTo(this.hitPoint);
  }
}
