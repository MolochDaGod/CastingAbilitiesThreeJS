/**
 * Attach catalog weapon GLB to R_hand_container for equip preview / prefab QA.
 * Uses prod modelUrl from master-weapon-prefabs (SI scale).
 *
 * Wands/staffs: prefer controlled length; allow slightly wider silhouettes
 * (mushroom / resonance heads) without becoming 100× giants.
 */

import { Group, Box3, Vector3, MathUtils, Object3D } from 'three';
import { sharedGltfLoader } from '../loaders/gltfPipeline.js';
import { FLINTLOCK_FIRE } from '../config/pistolAnimSsot.js';

const _box = new Box3();
const _size = new Vector3();
const _handW = new Vector3();
const _corner = new Vector3();
const _best = new Vector3();

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
    // Pistol: barrel should read forward of grip after orient — same -90 pitch as melee
    root.rotation.x = MathUtils.degToRad(profile === 'bow' ? -75 : -90);
    if (profile === 'pistol') {
      // Slight yaw so flintlock sits across palm → barrel out from body
      root.rotation.z = MathUtils.degToRad(8);
    }
    root.position.set(0, 0, 0);

    // SI fit metadata — lab scale editor multiplies this base
    holder.userData._fitScale = 1;
    holder.userData._appBaseScale = 1;
    holder.userData.fitLengthM = maxLen;
    holder.userData.sourceLongestM = longest;
    holder.userData.meshFitScale = s;
    root.userData.meshFitScale = s;

    // Parent first so world AABB / hand origin are valid for muzzle tip
    handBone.add(holder);
    // Barrel tip marker (muzzle) — farthest mesh extent from hand grip
    placeMuzzleMarker(holder, profile);
    handBone.updateWorldMatrix?.(true, true);
    _box.setFromObject(holder);
    _box.getSize(_size);
    holder.userData.worldLengthM = Math.max(_size.x, _size.y, _size.z);
    console.info(
      `[WeaponMeshAttach] ${profile} fit×${s.toFixed(3)} → ~${holder.userData.worldLengthM.toFixed(2)} m (target ${maxLen} m)`
    );
    return holder;
  } catch (err) {
    console.warn('[WeaponMeshAttach] load failed', modelUrl, err);
    return null;
  }
}

/**
 * Place Object3D muzzle at barrel tip (world-farthest from hand = tip heuristic).
 * @param {import('three').Object3D} holder WeaponAttach group
 * @param {string} profile
 */
export function placeMuzzleMarker(holder, profile = 'melee') {
  if (!holder) return null;
  // Clear old
  for (const c of [...holder.children]) {
    if (c.name === 'WeaponMuzzle' || c.userData?.isMuzzle) holder.remove(c);
  }

  const hand = holder.parent;
  if (hand) hand.getWorldPosition(_handW);
  else holder.getWorldPosition(_handW);

  // Prefer mesh AABB corners in world — tip ≈ max distance from grip
  _box.setFromObject(holder);
  const { min, max } = _box;
  const xs = [min.x, max.x];
  const ys = [min.y, max.y];
  const zs = [min.z, max.z];
  let bestD = -1;
  for (const x of xs) {
    for (const y of ys) {
      for (const z of zs) {
        _corner.set(x, y, z);
        const d = _corner.distanceToSquared(_handW);
        if (d > bestD) {
          bestD = d;
          _best.copy(_corner);
        }
      }
    }
  }

  // Fallback: local +Y scaled (pre -90 mesh long axis often Y)
  if (bestD < 1e-8) {
    const fb =
      profile === 'pistol'
        ? FLINTLOCK_FIRE.muzzleFallbackM
        : profile === 'bow'
          ? 0.9
          : 0.55;
    _best.set(0, fb, 0);
    holder.localToWorld(_best);
  }

  // Slightly past tip along grip→tip
  _corner.copy(_best).sub(_handW);
  if (_corner.lengthSq() > 1e-8) {
    _corner.normalize().multiplyScalar(0.012);
    _best.add(_corner);
  }

  const muzzle = new Object3D();
  muzzle.name = 'WeaponMuzzle';
  muzzle.userData.isMuzzle = true;
  holder.worldToLocal(_best);
  muzzle.position.copy(_best);
  holder.add(muzzle);
  holder.userData.muzzle = muzzle;
  holder.userData.muzzleLocal = muzzle.position.clone();
  return muzzle;
}

/**
 * Find WeaponAttach under a hand bone.
 * @param {import('three').Object3D|null} handBone
 */
export function getWeaponAttachFromHand(handBone) {
  if (!handBone) return null;
  for (const c of handBone.children) {
    if (c.userData?.weaponAttach || c.name === 'WeaponAttach') return c;
  }
  let found = null;
  handBone.traverse((o) => {
    if (!found && (o.userData?.weaponAttach || o.name === 'WeaponAttach')) found = o;
  });
  return found;
}

/**
 * World muzzle position.
 * @param {import('three').Object3D|null} attach
 * @param {import('three').Vector3} [out]
 */
export function getMuzzleWorldFromAttach(attach, out = new Vector3()) {
  if (!attach) return out.set(0, 0, 0);
  const m = attach.userData?.muzzle;
  if (m) {
    m.getWorldPosition(out);
    return out;
  }
  attach.getWorldPosition(out);
  return out;
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
