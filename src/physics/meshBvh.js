/**
 * three-mesh-bvh acceleration — same pattern as Open `@workspace/grudge-physics` meshBvh.ts.
 * Install once, then accelerateMesh on terrain / harvest / dummy GLTFs.
 */
import { BufferGeometry, Mesh } from 'three';

let installed = false;

export async function installMeshBvh() {
  if (installed) return true;
  try {
    const { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } = await import(
      'three-mesh-bvh'
    );
    if (!BufferGeometry.prototype.computeBoundsTree) {
      BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
      BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
      Mesh.prototype.raycast = acceleratedRaycast;
    }
    installed = true;
    return true;
  } catch (err) {
    console.warn('[meshBvh] three-mesh-bvh unavailable', err);
    return false;
  }
}

export function accelerateMesh(mesh) {
  const geo = mesh?.geometry;
  if (!geo || typeof geo.computeBoundsTree !== 'function') return false;
  try {
    geo.computeBoundsTree();
    return true;
  } catch {
    return false;
  }
}

export function accelerateObject3D(root) {
  let n = 0;
  root?.traverse?.((o) => {
    if (o.isMesh && o.geometry && !o.isInstancedMesh && accelerateMesh(o)) n += 1;
  });
  return n;
}

export function isMeshBvhInstalled() {
  return installed;
}
