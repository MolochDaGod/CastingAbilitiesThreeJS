/**
 * Attach catalog weapon GLB to R_hand_container for equip preview / prefab QA.
 * Uses prod modelUrl from master-weapon-prefabs (SI scale).
 */

import { Group, Box3, Vector3, MathUtils } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const _box = new Box3();
const _size = new Vector3();
const loader = new GLTFLoader();

/**
 * @param {import('three').Object3D|null} handBone
 * @param {string|null} modelUrl
 * @param {{ maxLengthM?: number, clear?: boolean }} [opts]
 * @returns {Promise<import('three').Object3D|null>}
 */
export async function attachWeaponModel(handBone, modelUrl, opts = {}) {
  if (!handBone) return null;
  clearWeaponAttach(handBone);

  if (!modelUrl) return null;

  const maxLen = opts.maxLengthM ?? 1.35;
  try {
    const gltf = await loader.loadAsync(modelUrl);
    const root = gltf.scene || gltf.scenes?.[0];
    if (!root) return null;

    const holder = new Group();
    holder.name = 'WeaponAttach';
    holder.userData.weaponAttach = true;
    holder.add(root);

    // Normalize to SI hand weapon length
    _box.setFromObject(root);
    _box.getSize(_size);
    const longest = Math.max(_size.x, _size.y, _size.z, 0.01);
    const s = maxLen / longest;
    root.scale.setScalar(s);

    // Grip: blade along +Y local (Toon hand often needs tweak per mesh)
    root.rotation.x = MathUtils.degToRad(-90);
    root.position.set(0, 0, 0);

    handBone.add(holder);
    return holder;
  } catch (err) {
    console.warn('[WeaponMeshAttach] load failed', modelUrl, err);
    return null;
  }
}

/**
 * @param {import('three').Object3D|null} handBone
 */
export function clearWeaponAttach(handBone) {
  if (!handBone) return;
  const doomed = [];
  handBone.traverse((o) => {
    if (o.userData?.weaponAttach || o.name === 'WeaponAttach') doomed.push(o);
  });
  // Only remove direct holders under hand (avoid double-dispose)
  for (const o of [...handBone.children]) {
    if (o.userData?.weaponAttach || o.name === 'WeaponAttach') {
      handBone.remove(o);
      o.traverse((c) => {
        if (c.geometry) c.geometry.dispose?.();
        if (c.material) {
          const mats = Array.isArray(c.material) ? c.material : [c.material];
          for (const m of mats) m.dispose?.();
        }
      });
    }
  }
}
