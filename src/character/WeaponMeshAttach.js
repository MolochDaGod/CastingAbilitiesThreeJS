/**
 * Attach catalog weapon GLB to R_hand_container for equip preview / prefab QA.
 * Uses prod modelUrl from master-weapon-prefabs (SI scale).
 *
 * Wands/staffs: prefer controlled length; allow slightly wider silhouettes
 * (mushroom / resonance heads) without becoming 100× giants.
 */

import { Group, Box3, Vector3, Quaternion, Matrix4, MathUtils, Object3D } from 'three';
import { sharedGltfLoader } from '../loaders/gltfPipeline.js';
import { FLINTLOCK_FIRE } from '../config/pistolAnimSsot.js';

const _box = new Box3();
const _size = new Vector3();
const _handW = new Vector3();
const _corner = new Vector3();
const _best = new Vector3();
const _boneScale = new Vector3();
const _axisQ = new Quaternion();
const _up = new Vector3(0, 1, 0);
const _gripV = new Vector3();
const _matRel = new Matrix4();
const _matRoot = new Matrix4();

/**
 * Sample vertex positions from every mesh under `root`, in root-local space.
 * Multi-mesh GLBs (orb + shaft + rings) fit as one body this way.
 * @param {import('three').Object3D} root
 * @param {number} [maxPerMesh]
 * @returns {Float32Array|null}
 */
function sampleObjectPositions(root, maxPerMesh = 256) {
  root.updateWorldMatrix(true, true);
  _matRoot.copy(root.matrixWorld).invert();
  /** @type {number[]} */
  const out = [];
  const v = _gripV;
  root.traverse((o) => {
    if (!o.isMesh || !o.geometry?.attributes?.position) return;
    _matRel.multiplyMatrices(_matRoot, o.matrixWorld);
    const pos = o.geometry.attributes.position;
    const step = Math.max(1, Math.floor(pos.count / maxPerMesh));
    for (let i = 0; i < pos.count; i += step) {
      v.set(pos.getX(i), pos.getY(i), pos.getZ(i)).applyMatrix4(_matRel);
      out.push(v.x, v.y, v.z);
    }
  });
  return out.length >= 9 ? new Float32Array(out) : null;
}

/**
 * PCA long axis + grip/tip ends from sampled points (root-local).
 * Same convention as weaponMeshCollider.fitWeaponCylinderFromMesh — axis is the
 * dominant eigenvector, ends are the extremes of the projection.
 *
 * Grip end resolution, in priority order:
 *  1. `flip` override (registry / lab) — authoritative
 *  2. pivot rule — the end nearer the mesh origin is the handle (authors and
 *     the asset pipeline put the pivot at or near the grip)
 *  3. per-kind silhouette rule when the pivot is ambiguous (centered):
 *     head weapons (wand/staff/axe/hammer/mace) grip the narrow end,
 *     blade weapons (sword/dagger/spear) grip the wide end (pommel+guard band)
 *
 * @param {Float32Array} samples
 * @param {{ kind?: string, flip?: boolean|null }} [opts]
 */
function computeGripFrame(samples, opts = {}) {
  const n = samples.length / 3;
  let cx = 0, cy = 0, cz = 0;
  for (let i = 0; i < samples.length; i += 3) {
    cx += samples[i]; cy += samples[i + 1]; cz += samples[i + 2];
  }
  cx /= n; cy /= n; cz /= n;

  let cxx = 0, cxy = 0, cxz = 0, cyy = 0, cyz = 0, czz = 0;
  for (let i = 0; i < samples.length; i += 3) {
    const dx = samples[i] - cx, dy = samples[i + 1] - cy, dz = samples[i + 2] - cz;
    cxx += dx * dx; cxy += dx * dy; cxz += dx * dz;
    cyy += dy * dy; cyz += dy * dz; czz += dz * dz;
  }
  const axis = new Vector3(1, 0.2, 0.1).normalize();
  for (let it = 0; it < 12; it++) {
    axis.set(
      cxx * axis.x + cxy * axis.y + cxz * axis.z,
      cxy * axis.x + cyy * axis.y + cyz * axis.z,
      cxz * axis.x + cyz * axis.y + czz * axis.z
    );
    if (axis.lengthSq() < 1e-12) { axis.set(0, 1, 0); break; }
    axis.normalize();
  }

  let tMin = Infinity, tMax = -Infinity, rMax = 0;
  for (let i = 0; i < samples.length; i += 3) {
    _gripV.set(samples[i] - cx, samples[i + 1] - cy, samples[i + 2] - cz);
    const t = _gripV.dot(axis);
    if (t < tMin) tMin = t;
    if (t > tMax) tMax = t;
    const r = _gripV.addScaledVector(axis, -t).length();
    if (r > rMax) rMax = r;
  }
  const length = Math.max(1e-3, tMax - tMin);

  // Radial width of the outer 25% band at each end (head vs handle silhouette)
  const band = length * 0.25;
  let rLow = 0, rHigh = 0;
  for (let i = 0; i < samples.length; i += 3) {
    _gripV.set(samples[i] - cx, samples[i + 1] - cy, samples[i + 2] - cz);
    const t = _gripV.dot(axis);
    const r = _gripV.addScaledVector(axis, -t).length();
    if (t - tMin < band && r > rLow) rLow = r;
    if (tMax - t < band && r > rHigh) rHigh = r;
  }

  // Pivot rule: |origin projection| — origin sits at (0,0,0) in root-local
  _gripV.set(-cx, -cy, -cz);
  const tOrigin = _gripV.dot(axis);
  const dLow = Math.abs(tOrigin - tMin);
  const dHigh = Math.abs(tMax - tOrigin);
  const pivotAmbiguous = Math.abs(dLow - dHigh) < length * 0.15;

  let gripAtLow;
  if (!pivotAmbiguous) {
    gripAtLow = dLow < dHigh;
  } else {
    const kind = String(opts.kind || '').toLowerCase();
    const headWeapon = /wand|staff|axe|hammer|mace|pick|club/.test(kind);
    const bladeWeapon = /sword|dagger|knife|blade|spear|saber/.test(kind);
    if (headWeapon) gripAtLow = rLow <= rHigh;      // narrow end = handle
    else if (bladeWeapon) gripAtLow = rLow >= rHigh; // wide band = pommel+guard
    else gripAtLow = dLow <= dHigh;
  }
  if (opts.flip === true) gripAtLow = !gripAtLow;

  const center = new Vector3(cx, cy, cz);
  const grip = center.clone().addScaledVector(axis, gripAtLow ? tMin : tMax);
  const tip = center.clone().addScaledVector(axis, gripAtLow ? tMax : tMin);
  // axis always points grip → tip
  const gripAxis = gripAtLow ? axis.clone() : axis.clone().negate();
  return { axis: gripAxis, grip, tip, center, length, width: rMax * 2 };
}

/**
 * @param {import('three').Object3D|null} handBone
 * @param {string|null} modelUrl
 * @param {{
 *   maxLengthM?: number,
 *   maxWidthM?: number,
 *   profile?: 'melee'|'wand'|'staff'|'bow'|'pistol'|'shield',
 *   kind?: string,
 *   grip?: {
 *     flip?: boolean,
 *     offsetM?: number[],
 *     eulerDeg?: number[],
 *     scale?: number
 *   }|null,
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

    // The rig carries scale on its bones (Toon Bip001 ≈ 2.7×). Everything
    // parented under the hand inherits it, so all SI fits divide by it first —
    // skipping this is exactly the "weapon is giant in hand" bug.
    handBone.updateWorldMatrix?.(true, false);
    handBone.getWorldScale?.(_boneScale);
    const boneScale =
      Math.max(1e-4, (Math.abs(_boneScale.x) + Math.abs(_boneScale.y) + Math.abs(_boneScale.z)) / 3) || 1;

    const grip = opts.grip || null;
    const samples = sampleObjectPositions(root);
    const frame = samples
      ? computeGripFrame(samples, { kind: opts.kind || profile, flip: grip?.flip ?? null })
      : null;

    let s;
    if (frame && profile !== 'pistol' && profile !== 'shield') {
      // PCA fit: true long axis, real grip end. World SI length = target.
      s = maxLen / (frame.length * boneScale);
      const widthWorld = frame.width * s * boneScale;
      if (widthWorld > maxWidth) s *= maxWidth / widthWorld;
      root.scale.setScalar(s);

      // Rotate grip→tip axis onto hand +Y (shaft up out of the fist)
      _axisQ.setFromUnitVectors(frame.axis, _up);
      root.quaternion.copy(_axisQ);

      // Grip point → holder origin, then sink the handle into the palm a touch
      _gripV.copy(frame.grip).applyQuaternion(_axisQ).multiplyScalar(s);
      root.position.copy(_gripV).negate();
      const palmInsetM = profile === 'bow' ? 0 : Math.min(0.05, maxLen * 0.06);
      root.position.y -= palmInsetM / boneScale;
      if (profile === 'bow') {
        // Bows are gripped at the riser (middle), not an end
        _gripV.copy(frame.center).applyQuaternion(_axisQ).multiplyScalar(s);
        root.position.copy(_gripV).negate();
        root.rotateX(MathUtils.degToRad(15)); // slight cant across the forearm
      }
    } else {
      // Pistol / shield / no-geometry fallback — legacy orient, bone-scale aware
      _box.setFromObject(root);
      _box.getSize(_size);
      const longest = Math.max(_size.x, _size.y, _size.z, 0.01);
      s = maxLen / (longest * boneScale);
      root.scale.setScalar(s);
      _box.setFromObject(root);
      _box.getSize(_size);
      const width = Math.max(_size.x, _size.z) * boneScale;
      if (width > maxWidth) {
        s *= maxWidth / width;
        root.scale.setScalar(s);
      }
      root.rotation.x = MathUtils.degToRad(profile === 'bow' ? -75 : -90);
      if (profile === 'pistol') {
        // Slight yaw so flintlock sits across palm → barrel out from body
        root.rotation.z = MathUtils.degToRad(8);
      }
      root.position.set(0, 0, 0);
    }

    // Registry / lab authored grip override — authoritative on top of auto-fit.
    // Ships with the weapon prefab (ObjectStore → D1 → catalog), unlike the old
    // localStorage-only meshAppearance tune that never left the lab machine.
    if (grip) {
      if (Number.isFinite(grip.scale) && grip.scale > 0.05) {
        s *= grip.scale;
        root.scale.setScalar(root.scale.x * grip.scale);
      }
      if (Array.isArray(grip.eulerDeg) && grip.eulerDeg.length >= 3) {
        holder.rotation.set(
          MathUtils.degToRad(grip.eulerDeg[0] || 0),
          MathUtils.degToRad(grip.eulerDeg[1] || 0),
          MathUtils.degToRad(grip.eulerDeg[2] || 0)
        );
      }
      if (Array.isArray(grip.offsetM) && grip.offsetM.length >= 3) {
        holder.position.set(
          (grip.offsetM[0] || 0) / boneScale,
          (grip.offsetM[1] || 0) / boneScale,
          (grip.offsetM[2] || 0) / boneScale
        );
      }
    }

    // SI fit metadata — lab scale editor multiplies this base
    holder.userData._fitScale = 1;
    holder.userData._appBaseScale = 1;
    holder.userData.fitLengthM = maxLen;
    holder.userData.boneScale = boneScale;
    holder.userData.sourceLongestM = frame?.length ?? null;
    holder.userData.gripFrame = frame
      ? { axis: frame.axis.toArray(), grip: frame.grip.toArray(), length: frame.length }
      : null;
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
