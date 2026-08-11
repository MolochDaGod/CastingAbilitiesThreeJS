/**
 * Single ground projection for aim / path / markers.
 *
 * Order (easy, no second heightmap):
 *  1. Raycast island terrain mesh if present
 *  2. Else ray ∩ y=0 plane, then lift Y via sample(x,z)
 *
 * Used by MouseAim + PathDrawer only — do not duplicate height math elsewhere.
 *
 * @see IslandHeightfield.sample
 */

import { Plane, Vector3 } from 'three';

const PLANE = new Plane(new Vector3(0, 1, 0), 0);
const _scratch = new Vector3();

/**
 * @typedef {{ mesh?: import('three').Object3D|null, sample?: ((x:number,z:number)=>number)|null }} TerrainGround
 */

/**
 * @param {import('three').Raycaster} raycaster  ray already setFromCamera
 * @param {import('three').Vector3} out
 * @param {TerrainGround|null|undefined} terrain
 * @returns {boolean}
 */
export function projectToTerrain(raycaster, out, terrain) {
  if (terrain?.mesh) {
    const hits = raycaster.intersectObject(terrain.mesh, false);
    if (hits[0]) {
      out.copy(hits[0].point);
      return true;
    }
  }

  if (raycaster.ray.intersectPlane(PLANE, out) == null) return false;

  if (typeof terrain?.sample === 'function') {
    const y = terrain.sample(out.x, out.z);
    if (Number.isFinite(y)) out.y = y;
  }
  return true;
}

/**
 * Lift an existing XZ point onto terrain (no ray).
 * @param {number} x
 * @param {number} z
 * @param {TerrainGround|null|undefined} terrain
 * @param {number} [fallbackY=0]
 */
export function surfaceY(x, z, terrain, fallbackY = 0) {
  if (typeof terrain?.sample === 'function') {
    const y = terrain.sample(x, z);
    if (Number.isFinite(y)) return y;
  }
  return fallbackY;
}

/**
 * Build the one terrain handle App passes around (avoid N lambdas).
 * @param {{ mesh?: import('three').Object3D, sample?: (x:number,z:number)=>number }|null} island
 * @returns {TerrainGround|null}
 */
export function terrainHandle(island) {
  if (!island?.sample && !island?.mesh) return null;
  return {
    mesh: island.mesh || null,
    sample: island.sample ? (x, z) => island.sample(x, z) : null
  };
}

export { PLANE as GROUND_PLANE, _scratch as terrainScratch };
