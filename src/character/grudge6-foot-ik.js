/**
 * Warlords / grudge6 foot IK — post-mixer two-bone plant on terrain.
 * SSOT for ALL play kits (loadRaceKit stamp + Casting + Open FootGrounder).
 *
 * Order every frame:
 *   beginFrame() → mixer.update(dt) → apply(dt)
 *
 * Sampler MUST be the same height field as Rapier CCT / body ground.
 * Pelvis-as-feet is forbidden. Flat y=0 is a no-op when already planted.
 */
export function solveTwoBoneIk(upperLen, lowerLen, targetDist) {
  const reach = upperLen + lowerLen;
  const minDist = Math.abs(upperLen - lowerLen);
  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  if (targetDist >= reach) return { reachable: false, rootAngle: 0, jointAngle: Math.PI };
  const d = clamp(targetDist, minDist + 1e-6, reach - 1e-6);
  const rootCos = clamp(
    (upperLen * upperLen + d * d - lowerLen * lowerLen) / (2 * upperLen * d),
    -1,
    1,
  );
  const jointCos = clamp(
    (upperLen * upperLen + lowerLen * lowerLen - d * d) / (2 * upperLen * lowerLen),
    -1,
    1,
  );
  return { reachable: true, rootAngle: Math.acos(rootCos), jointAngle: Math.acos(jointCos) };
}

export function footPlantOffset(footY, groundY, maxLift, maxDrop) {
  const d = groundY - footY;
  const hi = Math.abs(maxLift);
  const lo = -Math.abs(maxDrop);
  return d < lo ? lo : d > hi ? hi : d;
}

export function pelvisDropForFeet(offsets) {
  let drop = 0;
  for (const o of offsets) if (o < drop) drop = o;
  return drop;
}

/**
 * Place skinned root so bone-feet sit on terrainY (world).
 * Uses Vector3 + Matrix4 — never assign root.y = terrain (that is pelvis-as-feet).
 * @param {import('three').Object3D} root
 * @param {number} terrainY
 * @param {typeof import('three')} THREE
 */
export function placeRootFeetAt(root, terrainY, THREE) {
  if (!root || !Number.isFinite(terrainY)) return 0;
  root.updateMatrixWorld(true);
  const v = new THREE.Vector3();
  let minY = Infinity;
  root.traverse((n) => {
    if (!n.isBone || !n.name) return;
    if (!/foot/i.test(n.name) || /toe|ball/i.test(n.name)) return;
    n.getWorldPosition(v);
    if (v.y < minY) minY = v.y;
  });
  if (!Number.isFinite(minY) || minY === Infinity) {
    const box = new THREE.Box3();
    root.traverse((o) => {
      if (o.isSkinnedMesh && o.skeleton) {
        o.skeleton.update();
        o.updateMatrixWorld(true);
      }
    });
    box.setFromObject(root);
    minY = box.min.y;
  }
  if (!Number.isFinite(minY)) return 0;
  const dy = terrainY - minY;
  if (Math.abs(dy) > 1e-4) root.position.y += dy;
  root.updateMatrixWorld(true);
  return dy;
}

export const FLAT_FOOT_SAMPLER = () => ({ y: 0, normal: null });

export function samplerFromHeightAt(heightAt, opts = {}) {
  const eps = opts.epsilon ?? 0.28;
  const withNormals = opts.withNormals !== false;
  return (x, z) => {
    const y = heightAt(x, z);
    if (y == null || !Number.isFinite(y)) return { y: Number.NaN, normal: null };
    if (!withNormals) return { y, normal: null };
    const yx0 = heightAt(x - eps, z);
    const yx1 = heightAt(x + eps, z);
    const yz0 = heightAt(x, z - eps);
    const yz1 = heightAt(x, z + eps);
    if (![yx0, yx1, yz0, yz1].every((v) => v != null && Number.isFinite(v))) {
      return { y, normal: { x: 0, y: 1, z: 0 } };
    }
    const nx = yx0 - yx1;
    const ny = 2 * eps;
    const nz = yz0 - yz1;
    const len = Math.hypot(nx, ny, nz) || 1;
    return { y, normal: { x: nx / len, y: ny / len, z: nz / len } };
  };
}

function keyOf(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

export function findLegChain(root, side) {
  const sideRe = side === 'L' ? /(^|[^a-z])l(eft)?([^a-z]|$)/i : /(^|[^a-z])r(ight)?([^a-z]|$)/i;
  const toeRe = /toe|ball/i;
  const footRe = /foot|ankle/i;
  const upperRe = /thigh|upleg|upperleg|hip(?!s)/i;
  const lowerRe = /calf|shin|lowerleg|leg/i;
  let upper = null;
  let lower = null;
  let foot = null;
  root.traverse((n) => {
    if (!n.isBone || !n.name) return;
    if (!sideRe.test(n.name) || toeRe.test(n.name)) return;
    if (!foot && footRe.test(n.name)) foot = n;
    else if (!upper && /thigh|upleg|upperleg/i.test(n.name)) upper = n;
    else if (!lower && /calf|shin|lowerleg/i.test(n.name)) lower = n;
  });
  if (!lower) {
    root.traverse((n) => {
      if (lower || !n.isBone) return;
      if (!sideRe.test(n.name) || toeRe.test(n.name)) return;
      if (n !== upper && n !== foot && lowerRe.test(n.name) && !upperRe.test(n.name)) lower = n;
    });
  }
  return upper && lower && foot ? { upper, lower, foot } : null;
}

export function findPelvis(root) {
  let best = null;
  let bestScore = -1;
  root.traverse((n) => {
    if (!n.isBone || !n.name) return;
    const key = keyOf(n.name);
    let score = 0;
    if (key === 'bip001pelvis' || key === 'pelvis') score = 100;
    else if (key.endsWith('pelvis')) score = 90;
    else if (key === 'mixamorighips' || key === 'hips') score = 80;
    else if (key.endsWith('hips')) score = 70;
    if (score > bestScore) {
      bestScore = score;
      best = n;
    }
  });
  return best;
}

/**
 * @param {typeof import('three')} THREE
 */
export function createFootGrounder(THREE) {
  const _a = new THREE.Vector3();
  const _b = new THREE.Vector3();
  const _c = new THREE.Vector3();
  const _ab = new THREE.Vector3();
  const _bc = new THREE.Vector3();
  const _ac = new THREE.Vector3();
  const _at = new THREE.Vector3();
  const _nAc = new THREE.Vector3();
  const _nAb = new THREE.Vector3();
  const _nBc = new THREE.Vector3();
  const _nAt = new THREE.Vector3();
  const _axis = new THREE.Vector3();
  const _qParent = new THREE.Quaternion();
  const _qRot = new THREE.Quaternion();
  const _qDelta = new THREE.Quaternion();
  const _footWorld = new THREE.Vector3();
  const _pole = new THREE.Vector3();
  const _nUp = new THREE.Vector3();
  const _qAlign = new THREE.Quaternion();
  const _qClamp = new THREE.Quaternion();
  const _qId = new THREE.Quaternion();
  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

  function rotateBoneWorld(bone, axis, angle) {
    if (!bone.parent || Math.abs(angle) < 1e-5) return;
    bone.parent.getWorldQuaternion(_qParent);
    _qRot.setFromAxisAngle(axis, angle);
    _qDelta.copy(_qParent).invert().multiply(_qRot).multiply(_qParent);
    bone.quaternion.premultiply(_qDelta);
    bone.updateWorldMatrix(false, true);
  }
  function rotateBoneWorldQuat(bone, qWorld) {
    if (!bone.parent) return;
    bone.parent.getWorldQuaternion(_qParent);
    _qDelta.copy(_qParent).invert().multiply(qWorld).multiply(_qParent);
    bone.quaternion.premultiply(_qDelta);
    bone.updateWorldMatrix(false, true);
  }
  function solveLegToTarget(chain, target, poleHint) {
    const { upper, lower, foot } = chain;
    upper.getWorldPosition(_a);
    lower.getWorldPosition(_b);
    foot.getWorldPosition(_c);
    const lab = _a.distanceTo(_b);
    const lbc = _b.distanceTo(_c);
    if (lab < 1e-5 || lbc < 1e-5) return;
    _at.copy(target).sub(_a);
    const lat = clamp(_at.length(), 1e-4, lab + lbc - 1e-4);
    _ab.copy(_b).sub(_a);
    _bc.copy(_c).sub(_b);
    _ac.copy(_c).sub(_a);
    _nAb.copy(_ab).normalize();
    _nBc.copy(_bc).normalize();
    _nAc.copy(_ac).normalize();
    _nAt.copy(_at).normalize();
    const acab0 = Math.acos(clamp(_nAc.dot(_nAb), -1, 1));
    const babc0 = Math.acos(clamp(-_nAb.dot(_nBc), -1, 1));
    const sol = solveTwoBoneIk(lab, lbc, lat);
    _axis.copy(_ac).cross(_ab);
    if (_axis.lengthSq() < 1e-8 && poleHint) {
      _axis.copy(_ac).cross(poleHint);
    }
    if (_axis.lengthSq() < 1e-8) return;
    _axis.normalize();
    rotateBoneWorld(upper, _axis, sol.rootAngle - acab0);
    rotateBoneWorld(lower, _axis, sol.jointAngle - babc0);
    upper.getWorldPosition(_a);
    foot.getWorldPosition(_c);
    _ac.copy(_c).sub(_a).normalize();
    _nAt.copy(target).sub(_a).normalize();
    _axis.copy(_ac).cross(_nAt);
    if (_axis.lengthSq() > 1e-10) {
      _axis.normalize();
      const swing = Math.acos(clamp(_ac.dot(_nAt), -1, 1));
      rotateBoneWorld(upper, _axis, swing);
    }
  }

  return {
    enabled: true,
    maxLift: 0.28,
    maxDrop: 0.18,
    minHipClearanceM: 0.78,
    alignFeet: true,
    maxTilt: 0.5,
    smooth: 16,
    left: null,
    right: null,
    pelvis: null,
    sampler: FLAT_FOOT_SAMPLER,
    smLeft: 0,
    smRight: 0,
    smDrop: 0,
    primed: false,
    pelvisBindLocal: new THREE.Vector3(),
    pelvisBindCaptured: false,
    bind(root) {
      this.left = findLegChain(root, 'L');
      this.right = findLegChain(root, 'R');
      this.pelvis = findPelvis(root);
      if (this.pelvis) {
        this.pelvisBindLocal.copy(this.pelvis.position);
        this.pelvisBindCaptured = true;
      } else this.pelvisBindCaptured = false;
      return this.isBound;
    },
    get isBound() {
      return !!(this.left && this.right);
    },
    beginFrame() {
      if (!this.enabled || !this.pelvisBindCaptured || !this.pelvis) return;
      this.pelvis.position.copy(this.pelvisBindLocal);
    },
    setGroundSampler(fn) {
      this.sampler = fn || FLAT_FOOT_SAMPLER;
      this.primed = false;
    },
    setEnabled(on) {
      if (!on && this.pelvisBindCaptured && this.pelvis) {
        this.pelvis.position.copy(this.pelvisBindLocal);
        this.pelvis.updateWorldMatrix(false, true);
      }
      this.enabled = !!on;
      if (!on) this.primed = false;
    },
    footSample(chain) {
      if (!chain) return null;
      chain.foot.getWorldPosition(_footWorld);
      const s = this.sampler(_footWorld.x, _footWorld.z);
      const ny = s && s.normal;
      const normal =
        ny && typeof ny.y === 'number'
          ? ny.isVector3
            ? ny
            : new THREE.Vector3(ny.x, ny.y, ny.z)
          : null;
      if (!s || !Number.isFinite(s.y)) return { offset: 0, normal: null };
      return {
        offset: footPlantOffset(_footWorld.y, s.y, this.maxLift, this.maxDrop),
        normal,
      };
    },
    plant(chain, offset, poleHint) {
      if (!chain || Math.abs(offset) < 1e-4) return;
      chain.foot.getWorldPosition(_footWorld);
      _footWorld.y += offset;
      solveLegToTarget(chain, _footWorld, poleHint);
    },
    align(chain, normal) {
      if (!chain || !normal || !this.alignFeet) return;
      _nUp.set(0, 1, 0);
      const n = normal.isVector3 ? normal : _nAt.set(normal.x, normal.y, normal.z);
      _qAlign.setFromUnitVectors(_nUp, n);
      const ang = 2 * Math.acos(Math.min(1, Math.abs(_qAlign.w)));
      if (ang < 1e-4) return;
      const t = ang > this.maxTilt ? this.maxTilt / ang : 1;
      _qId.identity();
      _qClamp.copy(_qId).slerp(_qAlign, t);
      rotateBoneWorldQuat(chain.foot, _qClamp);
    },
    apply(dt) {
      if (!this.enabled || !this.left || !this.right) return;
      const ls = this.footSample(this.left);
      const rs = this.footSample(this.right);
      if (!ls || !rs) return;
      const k = this.primed ? 1 - Math.exp(-this.smooth * Math.max(dt, 1e-4)) : 1;
      this.smLeft += (ls.offset - this.smLeft) * k;
      this.smRight += (rs.offset - this.smRight) * k;
      const drop = pelvisDropForFeet([this.smLeft, this.smRight]);
      this.smDrop += (drop - this.smDrop) * k;
      this.primed = true;
      if (this.pelvis && this.smDrop < -1e-4) {
        const p = this.pelvis;
        p.getWorldPosition(_footWorld);
        const ground = this.sampler(_footWorld.x, _footWorld.z);
        const gY = ground && Number.isFinite(ground.y) ? ground.y : _footWorld.y;
        let drop = this.smDrop;
        if (_footWorld.y + drop < gY + this.minHipClearanceM) {
          drop = Math.min(0, gY + this.minHipClearanceM - _footWorld.y);
        }
        _footWorld.y += drop;
        p.parent?.worldToLocal(_footWorld);
        p.position.copy(_footWorld);
        p.updateWorldMatrix(false, true);
      }
      _pole.set(0, 0, 1);
      this.plant(this.left, this.smLeft - this.smDrop, _pole);
      this.plant(this.right, this.smRight - this.smDrop, _pole);
      this.align(this.left, ls.normal);
      this.align(this.right, rs.normal);
    },
  };
}

export const FOOT_IK_CONTRACT = {
  enabled: true,
  order: 'beginFrame → mixer.update → apply',
  sampler: 'same height field as Rapier CCT / body Y',
  bones: 'Bip001 L/R Thigh+Calf+Foot + Pelvis',
  ban: ['pelvis-as-feet', 'second mixer', 'second physics engine', 'IK before mixer'],
};
