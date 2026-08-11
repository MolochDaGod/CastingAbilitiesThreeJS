/**
 * Attach catalog weapon GLB to R_hand_container for equip preview / prefab QA.
 * Uses prod modelUrl from master-weapon-prefabs (SI scale).
 *
 * Wands/staffs: prefer controlled length; allow slightly wider silhouettes
 * (mushroom / resonance heads) without becoming 100× giants.
 */

import { Group, Box3, Vector3, MathUtils } from 'three';
import { sharedGltfLoader } from '../loaders/gltfPipeline.js';

const _box = new Box3();
const _size = new Vector3();

/**
 * @param {import('three').Object3D|null} handBone
 * @param {string|null} modelUrl
 * @param {{
 *   maxLengthM?: number,
 *   maxWidthM?: number,
 *   profile?: 'melee'|'wand'|'staff'|'bow'|'pistol'|'shield',
 *   clear?: boolean
 * }} [opts]
 * @returns {Promise<import('three').Object3D|null>}
 */
export async function attachWeaponModel(handBone, modelUrl, opts = {}) {
  if (!handBone) return null;
  clearWeaponAttach(handBone);

  if (!modelUrl) return null;

  const urlLow = String(modelUrl).toLowerCase();
  const profile =
    opts.profile ||
    (/t0-wand|wand\.glb|apprentice/i.test(urlLow)
      ? 'wand'
      : /t0-nature|staff|sapling|mushroom/i.test(urlLow)
        ? 'staff'
        : /pistol|handgun/i.test(urlLow)
          ? 'pistol'
          : /bow|crossbow/i.test(urlLow)
            ? 'bow'
            : /gun|rifle/i.test(urlLow)
              ? 'pistol'
              : /shield/i.test(urlLow)
                ? 'shield'
                : 'melee');

  // SI: human ~1.8 m — pistol handgun short; wand/staff longer
  const maxLen =
    opts.maxLengthM ??
    (profile === 'wand'
      ? 0.95
      : profile === 'staff'
        ? 1.25
        : profile === 'pistol'
          ? 0.48 // flintlock SI hand length
          : profile === 'bow'
            ? 1.4
            : 1.2);
  const maxWidth =
    opts.maxWidthM ??
    (profile === 'wand' || profile === 'staff'
      ? 0.55
      : profile === 'pistol'
        ? 0.28 // flintlock barrel + lock
        : 0.4);

  try {
    // Shared Draco/Meshopt/KTX2 — do not new bare GLTFLoader (compressed CDN weapons)
    const gltf = await sharedGltfLoader().loadAsync(modelUrl);
    const root = gltf.scene || gltf.scenes?.[0];
    if (!root) return null;

    // Separate mesh nodes stay named (do not merge) — useful for slot tint later
    root.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
        o.frustumCulled = true;
      }
    });

    const holder = new Group();
    holder.name = 'WeaponAttach';
    holder.userData.weaponAttach = true;
    holder.userData.profile = profile;
    holder.userData.modelUrl = modelUrl;
    holder.add(root);

    // Normalize length first, then soft-cap width (willing wider than long for heads)
    _box.setFromObject(root);
    _box.getSize(_size);
    const longest = Math.max(_size.x, _size.y, _size.z, 0.01);
    let s = maxLen / longest;
    root.scale.setScalar(s);
    _box.setFromObject(root);
    _box.getSize(_size);
    const width = Math.max(_size.x, _size.z);
    if (width > maxWidth) {
      s *= maxWidth / width;
      root.scale.setScalar(s);
    }

    // Grip: shaft along +Y local (Toon R_hand)
    root.rotation.x = MathUtils.degToRad(profile === 'bow' ? -75 : -90);
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
