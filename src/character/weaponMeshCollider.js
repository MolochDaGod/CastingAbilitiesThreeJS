/**
 * Weapon mesh → collider volume SSOT (cylinder shell + tip / grip / axis).
 *
 * Best practice (melee / gun stock):
 *   1. Resolve the **visible weapon mesh** (WeaponAttach child or kit mesh_ids)
 *   2. Sample geometry vertices (mesh-local)
 *   3. Longest principal extent = blade/barrel axis (not hand +Y stick)
 *   4. Cylinder along that axis; **radius = max radial extent + pad (0.02 m)**
 *   5. Parent volume to the weapon mesh so it rides the animation
 *
 * Consumers (same volume — no parallel stacks):
 *   - melee residual / tip trail / projectiles → tip + axis + contact radius
 *   - IK grip target → grip point on axis near hand
 *   - effects spawn → tip / mid / grip markers
 *   - sounds (whoosh / impact) → tip velocity proxy
 *   - parry / block → cylinder intersection during guard window
 *
 * Convex hull note: full ConvexGeometry is optional (heavy). Oriented cylinder
 * + 2 cm pad is the fleet default for thin weapons; hull can replace radius
 * later without changing the consumer API.
 *
 * @see space/helpers/colliderHelpers.ts (Open /player-and-grass mesh-fit)
 * @see WeaponMeshAttach.placeMuzzleMarker
 */

import {
  Box3,
  BufferAttribute,
  CylinderGeometry,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  Quaternion,
  Vector3
} from 'three';

export const WEAPON_COLLIDER_PAD_M = 0.02;

const WEAPON_NAME_RE =
  /sword|axe|hammer|staff|spear|dagger|knife|blade|mace|scyth|scythe|pick|wand|club|pistol|gun|rifle|bow|crossbow|weapon/i;
const WEAPON_EXCLUDE_RE =
  /shield|quiver|bag|arrow|bow_arrow|collider_|helper_|WeaponMuzzle|WeaponTipTrail|WeaponVolume/i;

const _box = new Box3();
const _v = new Vector3();
const _a = new Vector3();
const _b = new Vector3();
const _c = new Vector3();
const _axis = new Vector3();
const _center = new Vector3();
const _tmp = new Vector3();
const _q = new Quaternion();
const _mat = new Matrix4();

/**
 * @typedef {object} WeaponMeshVolume
 * @property {import('three').Object3D} mesh
 * @property {import('three').Object3D} [attach] WeaponAttach group if any
 * @property {import('three').Vector3} tipLocal mesh-local tip
 * @property {import('three').Vector3} gripLocal mesh-local grip (hand end)
 * @property {import('three').Vector3} centerLocal
 * @property {import('three').Vector3} axisLocal unit long axis (grip → tip)
 * @property {number} radiusM cylinder radius including pad
 * @property {number} lengthM cylinder length (m)
 * @property {number} padM
 * @property {string} shape 'cylinder'
 * @property {import('three').Object3D|null} debugMesh
 * @property {import('three').Object3D|null} markers tip/grip/mid Object3Ds under mesh
 */

/**
 * Prefer catalog WeaponAttach mesh, else visible kit weapon meshes.
 * @param {import('three').Object3D|null} root character model
 * @param {import('three').Object3D|null} [weaponAttach]
 * @returns {import('three').Object3D|null}
 */
export function resolveWeaponMesh(root, weaponAttach = null) {
  // 1) WeaponAttach payload (catalog GLB under hand)
  if (weaponAttach) {
    let best = null;
    let bestVol = 0;
    weaponAttach.traverse((o) => {
      if (!o.isMesh || !o.visible) return;
      if (WEAPON_EXCLUDE_RE.test(o.name || '')) return;
      if (!o.geometry) return;
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox?.();
      const bb = o.geometry.boundingBox;
      if (!bb || bb.isEmpty()) return;
      const s = bb.getSize(_tmp);
      const vol = s.x * s.y * s.z;
      if (vol > bestVol) {
        bestVol = vol;
        best = o;
      }
    });
    if (best) return best;
    // whole attach as fallback
    return weaponAttach;
  }

  if (!root) return null;
  const hits = [];
  root.traverse((o) => {
    if (!o.isMesh || !o.visible) return;
    const n = o.name || '';
    if (WEAPON_EXCLUDE_RE.test(n)) return;
    if (WEAPON_NAME_RE.test(n) || o.userData?.labWeapon || o.userData?.equipGroup === 'weapon_r') {
      hits.push(o);
    }
  });
  hits.sort((a, b) => {
    const score = (m) =>
      /sword/i.test(m.name) ? 0 : /axe|hammer|spear/i.test(m.name) ? 1 : 2;
    return score(a) - score(b);
  });
  return hits[0] || null;
}

/**
 * Collect mesh-local vertex positions (handles indexed + non-indexed).
 * @param {import('three').Mesh} mesh
 * @param {number} [maxSamples]
 * @returns {Float32Array|null} xyz packed
 */
export function sampleMeshLocalPositions(mesh, maxSamples = 512) {
  const geo = mesh?.geometry;
  if (!geo) return null;
  const pos = geo.attributes?.position;
  if (!pos || !pos.count) return null;

  const n = pos.count;
  const step = Math.max(1, Math.floor(n / maxSamples));
  const count = Math.ceil(n / step);
  const out = new Float32Array(count * 3);
  let w = 0;
  for (let i = 0; i < n; i += step) {
    out[w++] = pos.getX(i);
    out[w++] = pos.getY(i);
    out[w++] = pos.getZ(i);
  }
  return out;
}

/**
 * Fit oriented cylinder to weapon mesh vertices + pad.
 * Axis = longest AABB extent in mesh-local (stable for blades/barrels).
 *
 * @param {import('three').Object3D} mesh
 * @param {{ padM?: number, maxSamples?: number }} [opts]
 * @returns {WeaponMeshVolume|null}
 */
export function fitWeaponCylinderFromMesh(mesh, opts = {}) {
  if (!mesh) return null;
  const padM = opts.padM != null ? opts.padM : WEAPON_COLLIDER_PAD_M;

  // Prefer raw geometry samples in mesh local
  let samples = mesh.isMesh ? sampleMeshLocalPositions(mesh, opts.maxSamples ?? 512) : null;

  // Fallback: world AABB → mesh local corners
  if (!samples || samples.length < 9) {
    mesh.updateWorldMatrix(true, true);
    _box.setFromObject(mesh);
    if (_box.isEmpty()) return null;
    const inv = new Matrix4().copy(mesh.matrixWorld).invert();
    const { min, max } = _box;
    const corners = [];
    for (const x of [min.x, max.x]) {
      for (const y of [min.y, max.y]) {
        for (const z of [min.z, max.z]) {
          _v.set(x, y, z).applyMatrix4(inv);
          corners.push(_v.x, _v.y, _v.z);
        }
      }
    }
    samples = new Float32Array(corners);
  }

  // Centroid
  let cx = 0;
  let cy = 0;
  let cz = 0;
  const nPts = samples.length / 3;
  for (let i = 0; i < samples.length; i += 3) {
    cx += samples[i];
    cy += samples[i + 1];
    cz += samples[i + 2];
  }
  cx /= nPts;
  cy /= nPts;
  cz /= nPts;
  _center.set(cx, cy, cz);

  // Covariance for principal axis (longest eigenvector ≈ blade)
  let cxx = 0;
  let cxy = 0;
  let cxz = 0;
  let cyy = 0;
  let cyz = 0;
  let czz = 0;
  for (let i = 0; i < samples.length; i += 3) {
    const dx = samples[i] - cx;
    const dy = samples[i + 1] - cy;
    const dz = samples[i + 2] - cz;
    cxx += dx * dx;
    cxy += dx * dy;
    cxz += dx * dz;
    cyy += dy * dy;
    cyz += dy * dz;
    czz += dz * dz;
  }
  // Power iteration for dominant eigenvector
  _axis.set(1, 0.2, 0.1).normalize();
  for (let it = 0; it < 12; it++) {
    const x = cxx * _axis.x + cxy * _axis.y + cxz * _axis.z;
    const y = cxy * _axis.x + cyy * _axis.y + cyz * _axis.z;
    const z = cxz * _axis.x + cyz * _axis.y + czz * _axis.z;
    _axis.set(x, y, z);
    if (_axis.lengthSq() < 1e-12) {
      _axis.set(0, 1, 0);
      break;
    }
    _axis.normalize();
  }

  // Project points onto axis → min/max scalar + radial max
  let tMin = Infinity;
  let tMax = -Infinity;
  let rMax = 0;
  for (let i = 0; i < samples.length; i += 3) {
    _v.set(samples[i] - cx, samples[i + 1] - cy, samples[i + 2] - cz);
    const t = _v.dot(_axis);
    if (t < tMin) tMin = t;
    if (t > tMax) tMax = t;
    _tmp.copy(_v).addScaledVector(_axis, -t);
    const r = _tmp.length();
    if (r > rMax) rMax = r;
  }

  let lengthM = Math.max(0.08, tMax - tMin);
  let radiusM = Math.max(0.015, rMax) + padM;

  // Grip = end closer to hand if hand provided later; default low-t = grip
  // Tip = high-t end of axis
  const gripLocal = new Vector3().copy(_center).addScaledVector(_axis, tMin);
  const tipLocal = new Vector3().copy(_center).addScaledVector(_axis, tMax);
  const centerLocal = new Vector3().copy(_center).addScaledVector(_axis, (tMin + tMax) * 0.5);
  const axisLocal = _axis.clone().normalize();

  /** @type {WeaponMeshVolume} */
  const vol = {
    mesh,
    attach: mesh.parent?.userData?.weaponAttach ? mesh.parent : null,
    tipLocal,
    gripLocal,
    centerLocal,
    axisLocal,
    radiusM,
    lengthM,
    padM,
    shape: 'cylinder',
    debugMesh: null,
    markers: null
  };
  return vol;
}

/**
 * Build tip / mid / grip marker Object3Ds under the weapon mesh (mesh-local).
 * @param {WeaponMeshVolume} vol
 * @param {{ debug?: boolean }} [opts]
 */
export function attachWeaponVolumeMarkers(vol, opts = {}) {
  if (!vol?.mesh) return null;
  // Clear previous
  const old = vol.mesh.getObjectByName('WeaponVolume');
  if (old) vol.mesh.remove(old);

  const root = new Object3D();
  root.name = 'WeaponVolume';
  root.userData.weaponVolume = true;
  root.userData.radiusM = vol.radiusM;
  root.userData.lengthM = vol.lengthM;
  root.userData.padM = vol.padM;

  const tip = new Object3D();
  tip.name = 'WeaponTip';
  tip.userData.isWeaponTip = true;
  tip.position.copy(vol.tipLocal);
  root.add(tip);

  const grip = new Object3D();
  grip.name = 'WeaponGrip';
  grip.userData.isWeaponGrip = true;
  grip.position.copy(vol.gripLocal);
  root.add(grip);

  const mid = new Object3D();
  mid.name = 'WeaponMid';
  mid.userData.isWeaponMid = true;
  mid.position.copy(vol.centerLocal);
  root.add(mid);

  // Axis helper: +Y of empty points grip→tip for lookAt consumers
  root.userData.tip = tip;
  root.userData.grip = grip;
  root.userData.mid = mid;
  root.userData.axisLocal = vol.axisLocal.clone();

  if (opts.debug) {
    // Cylinder along local axis: default CylinderGeometry is +Y; rotate to axis
    const cyl = new CylinderGeometry(vol.radiusM, vol.radiusM, vol.lengthM, 10, 1, true);
    const mat = new MeshBasicMaterial({
      color: 0xff3344,
      wireframe: true,
      transparent: true,
      opacity: 0.55,
      depthWrite: false
    });
    const debug = new Mesh(cyl, mat);
    debug.name = 'WeaponVolumeDebug';
    debug.position.copy(vol.centerLocal);
    // Align +Y to axisLocal
    const yUp = new Vector3(0, 1, 0);
    _q.setFromUnitVectors(yUp, vol.axisLocal.clone().normalize());
    debug.quaternion.copy(_q);
    debug.userData.layer = 'helpers';
    root.add(debug);
    vol.debugMesh = debug;
  }

  vol.mesh.add(root);
  vol.markers = root;
  // Mirror tip on attach for getWeaponTip / muzzle parity
  const attach = vol.attach || (vol.mesh.parent?.userData?.weaponAttach ? vol.mesh.parent : null);
  if (attach) {
    attach.userData.muzzle = tip;
    attach.userData.weaponTip = tip;
    attach.userData.weaponGrip = grip;
    attach.userData.weaponVolume = vol;
  }
  vol.mesh.userData.weaponVolume = vol;
  return root;
}

/**
 * Orient grip toward hand: if grip is farther from hand than tip, flip axis.
 * @param {WeaponMeshVolume} vol
 * @param {import('three').Object3D|null} handBone
 */
export function orientVolumeGripToHand(vol, handBone) {
  if (!vol?.mesh || !handBone) return vol;
  vol.mesh.updateWorldMatrix(true, true);
  handBone.updateWorldMatrix?.(true, true);
  handBone.getWorldPosition(_a);
  _b.copy(vol.gripLocal);
  vol.mesh.localToWorld(_b);
  _c.copy(vol.tipLocal);
  vol.mesh.localToWorld(_c);
  const dGrip = _a.distanceToSquared(_b);
  const dTip = _a.distanceToSquared(_c);
  if (dTip < dGrip) {
    // Flip: tip was closer to hand
    const t = vol.tipLocal.clone();
    vol.tipLocal.copy(vol.gripLocal);
    vol.gripLocal.copy(t);
    vol.axisLocal.negate();
  }
  return vol;
}

/**
 * Full pipeline: resolve mesh → fit cylinder → markers → optional debug.
 * @param {import('three').Object3D|null} characterRoot
 * @param {{
 *   weaponAttach?: import('three').Object3D|null,
 *   handBone?: import('three').Object3D|null,
 *   padM?: number,
 *   debug?: boolean
 * }} [opts]
 * @returns {WeaponMeshVolume|null}
 */
export function buildWeaponMeshVolume(characterRoot, opts = {}) {
  const mesh = resolveWeaponMesh(characterRoot, opts.weaponAttach || null);
  if (!mesh) return null;
  const vol = fitWeaponCylinderFromMesh(mesh, { padM: opts.padM ?? WEAPON_COLLIDER_PAD_M });
  if (!vol) return null;
  if (opts.weaponAttach) vol.attach = opts.weaponAttach;
  orientVolumeGripToHand(vol, opts.handBone || null);
  attachWeaponVolumeMarkers(vol, { debug: !!opts.debug });
  return vol;
}

/**
 * World tip from volume (or fallback).
 * @param {WeaponMeshVolume|null} vol
 * @param {import('three').Vector3} [out]
 */
export function getVolumeTipWorld(vol, out = new Vector3()) {
  if (!vol?.mesh) return out.set(0, 0, 0);
  const tip = vol.markers?.userData?.tip;
  if (tip) {
    tip.getWorldPosition(out);
    return out;
  }
  out.copy(vol.tipLocal);
  vol.mesh.localToWorld(out);
  return out;
}

/**
 * World grip for IK / whoosh origin.
 * @param {WeaponMeshVolume|null} vol
 * @param {import('three').Vector3} [out]
 */
export function getVolumeGripWorld(vol, out = new Vector3()) {
  if (!vol?.mesh) return out.set(0, 0, 0);
  const grip = vol.markers?.userData?.grip;
  if (grip) {
    grip.getWorldPosition(out);
    return out;
  }
  out.copy(vol.gripLocal);
  vol.mesh.localToWorld(out);
  return out;
}

/**
 * Unit axis grip→tip in world space.
 * @param {WeaponMeshVolume|null} vol
 * @param {import('three').Vector3} [out]
 */
export function getVolumeAxisWorld(vol, out = new Vector3()) {
  if (!vol?.mesh) return out.set(0, 0, 1);
  _a.copy(vol.gripLocal);
  _b.copy(vol.tipLocal);
  vol.mesh.localToWorld(_a);
  vol.mesh.localToWorld(_b);
  out.copy(_b).sub(_a);
  if (out.lengthSq() < 1e-10) out.set(0, 0, 1);
  else out.normalize();
  return out;
}

/**
 * Melee contact radius for residual / parry (cylinder radius).
 * @param {WeaponMeshVolume|null} vol
 * @param {number} [extraBeyond=0]
 */
export function getVolumeContactRadius(vol, extraBeyond = 0) {
  const r = vol?.radiusM ?? 0.05;
  return r + Math.max(0, extraBeyond);
}

/**
 * Point-vs-cylinder test in world space (for parry / block).
 * @param {WeaponMeshVolume|null} vol
 * @param {import('three').Vector3} worldPoint
 * @param {number} [pointRadius=0]
 */
export function pointHitsWeaponVolume(vol, worldPoint, pointRadius = 0) {
  if (!vol?.mesh || !worldPoint) return false;
  getVolumeGripWorld(vol, _a);
  getVolumeTipWorld(vol, _b);
  _axis.copy(_b).sub(_a);
  const len = _axis.length();
  if (len < 1e-6) return false;
  _axis.multiplyScalar(1 / len);
  _tmp.copy(worldPoint).sub(_a);
  let t = _tmp.dot(_axis);
  t = Math.max(0, Math.min(len, t));
  _c.copy(_a).addScaledVector(_axis, t);
  const dist = _c.distanceTo(worldPoint);
  return dist <= vol.radiusM + pointRadius;
}

/**
 * Serialize for prefab / save (SI metres, mesh-local).
 * @param {WeaponMeshVolume|null} vol
 */
export function weaponVolumeToJSON(vol) {
  if (!vol) return null;
  return {
    shape: 'cylinder',
    padM: vol.padM,
    radiusM: vol.radiusM,
    lengthM: vol.lengthM,
    meshName: vol.mesh?.name || null,
    tipLocal: { x: vol.tipLocal.x, y: vol.tipLocal.y, z: vol.tipLocal.z },
    gripLocal: { x: vol.gripLocal.x, y: vol.gripLocal.y, z: vol.gripLocal.z },
    centerLocal: { x: vol.centerLocal.x, y: vol.centerLocal.y, z: vol.centerLocal.z },
    axisLocal: { x: vol.axisLocal.x, y: vol.axisLocal.y, z: vol.axisLocal.z }
  };
}
