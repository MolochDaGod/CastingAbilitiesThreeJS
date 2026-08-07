import { Plane, Raycaster, Vector2, Vector3 } from 'three';

const GROUND = new Plane(new Vector3(0, 1, 0), 0);
const _ndc = new Vector2();
const _hit = new Vector3();

/**
 * Combat mouse aim — raycast pointer → ground plane.
 * Character faces aim; camera TPS follows facing; WASD relative to aim.
 */
export class MouseAim {
  /**
   * @param {import('three').Camera} camera
   */
  constructor(camera) {
    this.camera = camera;
    this.raycaster = new Raycaster();
    this.raycaster.far = 400;
    /** World aim point on ground */
    this.point = new Vector3(0, 0, 4);
    /** Valid hit this frame */
    this.valid = false;
    /** Horizontal aim yaw (atan2 x,z toward point from player) */
    this.yaw = 0;
    /** Unit XZ direction from player → aim */
    this.forward = new Vector3(0, 0, 1);
    this.right = new Vector3(1, 0, 0);
    /** Screen NDC of last pointer */
    this.ndc = new Vector2();
  }

  /**
   * @param {Vector2} pointerNdc InputManager.pointer (-1..1)
   * @param {Vector3} playerPos character feet
   * @returns {boolean}
   */
  updateFromNdc(pointerNdc, playerPos) {
    this.ndc.copy(pointerNdc);
    this.raycaster.setFromCamera(pointerNdc, this.camera);
    const hit = this.raycaster.ray.intersectPlane(GROUND, _hit);
    if (!hit) {
      this.valid = false;
      return false;
    }
    this.point.copy(_hit);
    this.valid = true;
    this._fromPlayer(playerPos);
    return true;
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

  _fromPlayer(playerPos) {
    const dx = this.point.x - playerPos.x;
    const dz = this.point.z - playerPos.z;
    const len = Math.hypot(dx, dz);
    if (len < 0.05) {
      // Keep last forward if aim is under feet
      return;
    }
    this.forward.set(dx / len, 0, dz / len);
    this.yaw = Math.atan2(this.forward.x, this.forward.z);
    // right = cross(forward, up)
    this.right.set(this.forward.z, 0, -this.forward.x);
  }

  /**
   * Distance on XZ from player to aim (m).
   * @param {Vector3} playerPos
   */
  distanceTo(playerPos) {
    return Math.hypot(this.point.x - playerPos.x, this.point.z - playerPos.z);
  }
}
