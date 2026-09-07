/**
 * Attach catalog weapon GLB to R_hand_container for equip preview / prefab QA.
 * Uses prod modelUrl from master-weapon-prefabs (SI scale).
 *
 * Wands/staffs: prefer controlled length; allow slightly wider silhouettes
 * (mushroom / resonance heads) without becoming 100× giants.
 */

import * as THREE from 'three';
import { Group, Box3, Vector3, MathUtils, Object3D } from 'three';
import { sharedGltfLoader } from '../loaders/gltfPipeline.js';
import { FLINTLOCK_FIRE } from '../config/pistolAnimSsot.js';
import {
  familyFromAttachProfile,
  primaryCombatPointId,
  resolveWeaponSpine,
  SPINE_POINT_IDS
} from './weaponPrefabSpine.js';
import { bindTpsPistolProp, isTpsPistolUrl } from '../animation/tpsPistolProp.js';
import { gripEntryForWeapon, HAND_GRIP_WIDTH_M } from './weaponGripManifest.js';
import { applyCatalogGrip, gripForWeapon } from './t0WeaponGrip.js';

const _box = new Box3();
const _size = new Vector3();
const _handW = new Vector3();
const _corner = new Vector3();
const _best = new Vector3();
const _meshBox = new Box3();

/**
 * Longest axis of visible mesh geometry only — helpers/lights inflate setFromObject
 * and that is the 100× / floating-blade bug.
 * @param {import('three').Object3D} root
 */
function measureHeldMeshLongest(root) {
  _box.makeEmpty();
  let any = false;
  root.updateWorldMatrix(true, true);
  root.traverse((o) => {
    if (!o.isMesh && !o.isSkinnedMesh) return;
    if (o.visible === false) return;
    if (!o.geometry) return;
    try {
      _meshBox.setFromObject(o);
      if (_meshBox.isEmpty()) return;
      if (!any) {
        _box.copy(_meshBox);
        any = true;
      } else _box.union(_meshBox);
    } catch {
      /* skip */
    }
  });
  if (!any) _box.setFromObject(root);
  _box.getSize(_size);
  return Math.max(_size.x, _size.y, _size.z, 1e-4);
}

/**
 * @param {import('three').Object3D|null} handBone
 * @param {string|null} modelUrl
 * @param {{
 *   maxLengthM?: number,
 *   maxWidthM?: number,
 *   profile?: 'melee'|'wand'|'staff'|'bow'|'pistol'|'rifle'|'shield',
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
          : /rifle/i.test(urlLow)
            ? 'rifle'
            : /bow|crossbow/i.test(urlLow)
              ? 'bow'
              : /gun/i.test(urlLow)
                ? 'pistol'
                : /shield/i.test(urlLow)
                ? 'shield'
                : /claw/i.test(urlLow)
                  ? 'claw'
                : 'melee');

  // SI: human ~1.8 m — pistol handgun short; wand/staff longer
  const maxLen =
    opts.maxLengthM ??
    (profile === 'wand'
      ? 0.95
      : profile === 'staff'
        ? 1.55
        : profile === 'pistol'
          ? 0.48 // flintlock SI hand length
          : profile === 'rifle'
            ? 1.15
            : profile === 'bow'
            ? 1.4
            : profile === 'claw'
              ? 0.32
            : 1.2);
  const maxWidth =
    opts.maxWidthM ??
    (profile === 'wand' || profile === 'staff'
      ? 0.55
      : profile === 'pistol'
        ? 0.28 // flintlock barrel + lock
        : profile === 'claw'
          ? 0.2
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

    const grip = gripEntryForWeapon(opts.weaponId || modelUrl);
    const catalogGrip = gripForWeapon(opts.weaponId, profile);
    const holder = new Group();
    holder.name = 'WeaponAttach';
    holder.userData.weaponAttach = true;
    holder.userData.profile = profile;
    holder.userData.modelUrl = modelUrl;
    holder.userData.grip = grip;
    holder.userData.catalogGrip = catalogGrip;
    holder.userData.handGripWidthM = HAND_GRIP_WIDTH_M;
    // Never play author clips on a held prop — that is the free-spin / tome-hover bug.
    if (Array.isArray(gltf.animations)) gltf.animations.length = 0;
    root.animations = [];
    root.traverse((o) => {
      o.matrixAutoUpdate = true;
      if (o.animations) o.animations = [];
      if (o.userData) o.userData.skipMixer = true;
    });
    holder.add(root);
    if (profile === 'pistol' && isTpsPistolUrl(modelUrl)) {
      bindTpsPistolProp(holder, gltf);
    }

    // SI: mesh-only longest axis. Decade snap cm-as-m, then residual fit.
    root.scale.setScalar(1);
    let longest = measureHeldMeshLongest(root);
    if (longest > 40) {
      root.scale.setScalar(0.01);
      longest = measureHeldMeshLongest(root);
    }
    const targetLen = Number(catalogGrip.maxLengthM || maxLen) || 1.2;
    let s = root.scale.x * (targetLen / Math.max(longest, 1e-4));
    if (s > 8) s = 8;
    if (s < 0.04) s = 0.04;
    root.scale.setScalar(s);
    longest = measureHeldMeshLongest(root);
    const width = Math.max(_size.x, _size.z);
    if (width > maxWidth && width > 1e-4) {
      s *= maxWidth / width;
      root.scale.setScalar(s);
    }
    if (grip.scale_factor && grip.scale_factor !== 1) {
      s *= grip.scale_factor;
      root.scale.setScalar(s);
    }

    applyCatalogGrip(root, catalogGrip, THREE);
    const [gx, gy, gz] = grip.grip_offset_xyz || [0, 0, 0];
    if (gx || gy || gz) root.position.add(new Vector3(gx, gy, gz));

    // SI fit metadata — lab scale editor multiplies this base
    holder.userData._fitScale = 1;
    holder.userData._appBaseScale = 1;
    holder.userData.fitLengthM = maxLen;
    holder.userData.sourceLongestM = longest;
    holder.userData.meshFitScale = s;
    root.userData.meshFitScale = s;

    // Parent first so world AABB / hand origin are valid for muzzle tip
    handBone.add(holder);
    // Barrel tip marker (muzzle) + full spine (cast / barrel / tip / …)
    placeMuzzleMarker(holder, profile);
    stampWeaponSpine(holder, { profile, family: familyFromAttachProfile(profile) });
    holder.userData.bendingPreset = 'bulletspoisonaoestun turnado';
    holder.userData.bendingPatterns = [
      'fire_bullet',
      'poison_shot',
      'earth_stun',
      'tornado_pull'
    ];
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
 * Stamp family spine sockets as child Object3Ds (Open WEAPON_PREFAB.md §3).
 * Barrel marker aliases WeaponMuzzle when present so guns stay one origin.
 * @param {import('three').Object3D} holder
 * @param {{ profile?: string, family?: string, spine?: object }} [opts]
 */
export function stampWeaponSpine(holder, opts = {}) {
  if (!holder) return null;
  const family = opts.family || familyFromAttachProfile(opts.profile || holder.userData?.profile);
  const spine = resolveWeaponSpine({ family, spine: opts.spine || holder.userData?.spineAuthor });
  holder.userData.spineFamily = family;
  holder.userData.spine = spine;
  holder.userData.primarySpine = primaryCombatPointId(family);

  for (const c of [...holder.children]) {
    if (c.userData?.isSpinePoint && c.name !== 'WeaponMuzzle') holder.remove(c);
  }

  const markers = {};
  for (const id of SPINE_POINT_IDS) {
    const p = spine.points[id];
    if (!p?.pos) continue;
    if (id === 'barrel' && holder.userData.muzzle) {
      const m = holder.userData.muzzle;
      m.userData.spineId = 'barrel';
      m.userData.isSpinePoint = true;
      markers.barrel = m;
      continue;
    }
    const node = new Object3D();
    node.name = `WeaponSpine_${id}`;
    node.userData.isSpinePoint = true;
    node.userData.spineId = id;
    node.position.set(p.pos[0] || 0, p.pos[1] || 0, p.pos[2] || 0);
    holder.add(node);
    markers[id] = node;
  }
  if (!markers.barrel && holder.userData.muzzle) {
    markers.barrel = holder.userData.muzzle;
  }
  holder.userData.spineMarkers = markers;
  return spine;
}

/**
 * World position of a spine point on WeaponAttach.
 * @param {import('three').Object3D|null} attach
 * @param {string} pointId
 * @param {import('three').Vector3} [out]
 */
export function getSpineWorldFromAttach(attach, pointId, out = new Vector3()) {
  if (!attach) return out.set(0, 0, 0);
  const id = String(pointId || attach.userData?.primarySpine || 'tip');
  const markers = attach.userData?.spineMarkers;
  const node =
    markers?.[id] ||
    (id === 'barrel' || id === 'tip' ? attach.userData?.muzzle : null);
  if (node) {
    node.getWorldPosition(out);
    return out;
  }
  return getMuzzleWorldFromAttach(attach, out);
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
  for (const o of [...handBone.children]) {
    if (o.isBone || o.type === 'Bone') continue;
    if (/container|nub|socket/i.test(o.name || '')) continue;
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
