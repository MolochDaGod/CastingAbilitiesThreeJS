/**
 * T0 weapon grip SSOT — handle / shaft / trigger in the palm.
 * Applied by WeaponMeshAttach (not a second IK).
 *
 * Attach order:
 *   1. SI fit longest body axis
 *   2. Recenter socket (handle / shaft / trigger / stock / cover) to palm
 *   3. Align grip→tip to +Y (barrel / blade out) except bow / tome
 *   4. eulerDeg = Toon R_hand residual (usually −90°)
 *   5. grip[] = small palm tweak (metres)
 *
 * Review: `node scripts/review-t0-weapon-grip.mjs`
 * @see docs/WEAPON_HAND_SHEATH_SSOT.md
 */

/** @typedef {'handle'|'shaft'|'trigger'|'stock'|'cover'} GripSocket */

/**
 * @typedef {object} T0Grip
 * @property {string} profile  melee|wand|staff|bow|pistol|shield
 * @property {GripSocket} socket
 * @property {number} [socketFrac] 0..1 along body min→max (default per socket)
 * @property {string} facing   blade+Y | barrel+Y | head+Y | page
 * @property {'R'|'L'} hand
 * @property {number} maxLengthM
 * @property {number[]} grip  [x,y,z] m — extra palm tweak after recenter
 * @property {number[]} eulerDeg  [x,y,z] Toon hand residual after +Y align
 * @property {string} holdKind  weaponHoldPose key
 */

/** Default socket along the body long axis (pommel / butt = 0). */
export const SOCKET_FRAC = Object.freeze({
  handle: 0.12,
  shaft: 0.28,
  trigger: 0.38,
  stock: 0.32,
  cover: 0.5
});

/** @type {Record<string, T0Grip>} */
export const T0_WEAPON_GRIP = Object.freeze({
  't0-sword': {
    profile: 'melee',
    socket: 'handle',
    socketFrac: 0.12,
    facing: 'blade+Y',
    hand: 'R',
    maxLengthM: 1.15,
    grip: [0, 0, 0],
    eulerDeg: [-90, 0, 0],
    holdKind: 'sword'
  },
  't0-axe1h': {
    profile: 'melee',
    socket: 'handle',
    socketFrac: 0.14,
    facing: 'head+Y',
    hand: 'R',
    maxLengthM: 0.95,
    grip: [0, 0, 0],
    eulerDeg: [-90, 0, 4],
    holdKind: 'axe'
  },
  't0-axe-training': {
    profile: 'melee',
    socket: 'handle',
    socketFrac: 0.14,
    facing: 'head+Y',
    hand: 'R',
    maxLengthM: 0.95,
    grip: [0, 0, 0],
    eulerDeg: [-90, 0, 4],
    holdKind: 'axe'
  },
  't0-dagger': {
    profile: 'melee',
    socket: 'handle',
    socketFrac: 0.18,
    facing: 'blade+Y',
    hand: 'R',
    maxLengthM: 0.55,
    grip: [0, 0, 0.006],
    eulerDeg: [-90, 0, 6],
    holdKind: 'dagger'
  },
  't0-mace': {
    profile: 'melee',
    socket: 'handle',
    socketFrac: 0.16,
    facing: 'head+Y',
    hand: 'R',
    maxLengthM: 0.65,
    grip: [0, 0, 0],
    eulerDeg: [-90, 0, 4],
    holdKind: 'mace'
  },
  't0-hammer1h': {
    profile: 'melee',
    socket: 'handle',
    socketFrac: 0.14,
    facing: 'head+Y',
    hand: 'R',
    maxLengthM: 0.9,
    grip: [0, 0, 0],
    eulerDeg: [-90, 0, 2],
    holdKind: 'hammer'
  },
  't0-spear': {
    profile: 'melee',
    socket: 'shaft',
    socketFrac: 0.28,
    facing: 'blade+Y',
    hand: 'R',
    maxLengthM: 1.9,
    grip: [0, 0, 0],
    eulerDeg: [-90, 0, 0],
    holdKind: 'spear'
  },
  't0-greatsword': {
    profile: 'melee',
    socket: 'handle',
    socketFrac: 0.1,
    facing: 'blade+Y',
    hand: 'R',
    maxLengthM: 1.75,
    grip: [0, 0, 0],
    eulerDeg: [-90, 0, 0],
    holdKind: 'greatsword'
  },
  't0-greataxe': {
    profile: 'melee',
    socket: 'handle',
    socketFrac: 0.12,
    facing: 'head+Y',
    hand: 'R',
    maxLengthM: 1.7,
    grip: [0, 0, 0],
    eulerDeg: [-90, 0, 3],
    holdKind: 'greataxe'
  },
  't0-hammer2h': {
    profile: 'melee',
    socket: 'shaft',
    socketFrac: 0.22,
    facing: 'head+Y',
    hand: 'R',
    maxLengthM: 1.7,
    grip: [0, 0, 0],
    eulerDeg: [-90, 0, 0],
    holdKind: 'hammer'
  },
  't0-bow': {
    profile: 'bow',
    socket: 'handle',
    socketFrac: 0.5,
    facing: 'riser',
    hand: 'L',
    maxLengthM: 1.35,
    grip: [0, 0.02, 0],
    eulerDeg: [-75, 0, -8],
    holdKind: 'bow'
  },
  't0-crossbow': {
    profile: 'bow',
    socket: 'stock',
    socketFrac: 0.32,
    facing: 'barrel+Y',
    hand: 'R',
    maxLengthM: 1.15,
    grip: [0, 0.01, 0.02],
    eulerDeg: [-88, 0, 4],
    holdKind: 'crossbow'
  },
  't0-gun': {
    profile: 'pistol',
    socket: 'trigger',
    socketFrac: 0.38,
    facing: 'barrel+Y',
    hand: 'R',
    maxLengthM: 0.45,
    grip: [0, 0, 0.018],
    eulerDeg: [-90, 0, 8],
    holdKind: 'pistol'
  },
  't0-rifle': {
    profile: 'rifle',
    socket: 'stock',
    socketFrac: 0.28,
    facing: 'barrel+Y',
    hand: 'R',
    maxLengthM: 1.15,
    grip: [0, 0, 0.01],
    eulerDeg: [-90, 0, 0],
    holdKind: 'pistol'
  },
  't0-poppy': {
    profile: 'rifle',
    socket: 'stock',
    socketFrac: 0.3,
    facing: 'barrel+Y',
    hand: 'R',
    maxLengthM: 0.95,
    grip: [0, 0, 0.012],
    eulerDeg: [-90, 0, 2],
    holdKind: 'pistol'
  },
  't0-daax': {
    profile: 'melee',
    socket: 'handle',
    socketFrac: 0.14,
    facing: 'head+Y',
    hand: 'R',
    maxLengthM: 0.95,
    grip: [0, 0, 0],
    eulerDeg: [-90, 0, 4],
    holdKind: 'axe'
  },
  't0-wand': {
    profile: 'wand',
    socket: 'handle',
    socketFrac: 0.16,
    facing: 'tip+Y',
    hand: 'R',
    maxLengthM: 0.95,
    grip: [0, 0, 0.008],
    eulerDeg: [-90, 0, 4],
    holdKind: 'wand'
  },
  't0-nature-staff': {
    profile: 'staff',
    socket: 'shaft',
    socketFrac: 0.32,
    facing: 'head+Y',
    hand: 'R',
    maxLengthM: 1.25,
    grip: [0, 0, 0],
    eulerDeg: [-90, 0, 0],
    holdKind: 'staff'
  },
  't0-tool': {
    profile: 'melee',
    socket: 'handle',
    socketFrac: 0.16,
    facing: 'head+Y',
    hand: 'R',
    maxLengthM: 0.9,
    grip: [0, 0, 0],
    eulerDeg: [-90, 0, 2],
    holdKind: 'hammer'
  },
  't0-fishing-pole': {
    profile: 'staff',
    socket: 'shaft',
    socketFrac: 0.18,
    facing: 'tip+Y',
    hand: 'R',
    maxLengthM: 1.6,
    grip: [0, 0, 0],
    eulerDeg: [-90, 0, 0],
    holdKind: 'staff'
  },
  't0-offhand-tome': {
    profile: 'staff',
    socket: 'cover',
    socketFrac: 0.5,
    facing: 'page',
    hand: 'L',
    maxLengthM: 0.35,
    grip: [0.02, 0.02, 0.04],
    eulerDeg: [-20, 12, 18],
    holdKind: 'tome'
  }
});

/**
 * @param {string|null|undefined} weaponId
 * @returns {T0Grip|null}
 */
export function gripForT0Weapon(weaponId) {
  const id = String(weaponId || '');
  return T0_WEAPON_GRIP[id] || null;
}

/** Family defaults when the prefab is T1+ (Sunfire Staff, …) not a T0 id. */
export const PROFILE_GRIP = Object.freeze({
  staff: {
    profile: 'staff',
    socket: 'shaft',
    socketFrac: 0.3,
    facing: 'head+Y',
    hand: 'R',
    maxLengthM: 1.55,
    grip: [0, 0, 0],
    eulerDeg: [-90, 0, 0],
    holdKind: 'staff'
  },
  wand: {
    profile: 'wand',
    socket: 'handle',
    socketFrac: 0.16,
    facing: 'tip+Y',
    hand: 'R',
    maxLengthM: 0.95,
    grip: [0, 0, 0.008],
    eulerDeg: [-90, 0, 4],
    holdKind: 'wand'
  },
  melee: {
    profile: 'melee',
    socket: 'handle',
    socketFrac: 0.12,
    facing: 'blade+Y',
    hand: 'R',
    maxLengthM: 1.2,
    grip: [0, 0, 0],
    eulerDeg: [-90, 0, 0],
    holdKind: 'sword'
  },
  bow: {
    profile: 'bow',
    socket: 'handle',
    socketFrac: 0.5,
    facing: 'riser',
    hand: 'L',
    maxLengthM: 1.35,
    grip: [0, 0.02, 0],
    eulerDeg: [-75, 0, -8],
    holdKind: 'bow'
  },
  pistol: {
    profile: 'pistol',
    socket: 'trigger',
    socketFrac: 0.38,
    facing: 'barrel+Y',
    hand: 'R',
    maxLengthM: 0.45,
    grip: [0, 0, 0.018],
    eulerDeg: [-90, 0, 8],
    holdKind: 'pistol'
  },
  rifle: {
    profile: 'rifle',
    socket: 'stock',
    socketFrac: 0.28,
    facing: 'barrel+Y',
    hand: 'R',
    maxLengthM: 1.15,
    grip: [0, 0, 0.01],
    eulerDeg: [-90, 0, 0],
    holdKind: 'pistol'
  },
  shield: {
    profile: 'shield',
    socket: 'cover',
    socketFrac: 0.5,
    facing: 'page',
    hand: 'L',
    maxLengthM: 0.7,
    grip: [0, 0, 0],
    eulerDeg: [0, 0, 0],
    holdKind: 'shield'
  }
});

/**
 * T0 table first, then attach profile (T1 staffs, family GLBs).
 * @param {string|null|undefined} weaponId
 * @param {string} [profile]
 * @returns {T0Grip}
 */
export function gripForWeapon(weaponId, profile = 'melee') {
  return (
    gripForT0Weapon(weaponId) ||
    PROFILE_GRIP[profile] ||
    PROFILE_GRIP.melee
  );
}

/**
 * Palm lock: socketFrac along the long axis → origin, long axis → +Y, then eulerDeg.
 * Call after SI scale, before parenting to the hand. No second IK.
 */
export function applyCatalogGrip(root, spec, THREE) {
  if (!root || !spec || !THREE) return spec;
  const { Box3, Vector3, Quaternion, Euler, MathUtils } = THREE;
  // Keep SI scale; identity pose so AABB axes = local axes (helpers ignored).
  const keptScale = root.scale.clone();
  root.position.set(0, 0, 0);
  root.quaternion.identity();
  root.scale.copy(keptScale);
  root.updateWorldMatrix(true, true);
  const box = new Box3();
  let any = false;
  const piece = new Box3();
  root.traverse((o) => {
    if (!o.isMesh && !o.isSkinnedMesh) return;
    if (o.visible === false || !o.geometry) return;
    try {
      piece.setFromObject(o);
      if (piece.isEmpty()) return;
      if (!any) {
        box.copy(piece);
        any = true;
      } else box.union(piece);
    } catch {
      /* skip */
    }
  });
  if (!any) box.setFromObject(root);
  if (box.isEmpty()) return spec;
  const size = box.getSize(new Vector3());
  const frac = Number.isFinite(spec.socketFrac)
    ? spec.socketFrac
    : SOCKET_FRAC[spec.socket] ?? 0.14;
  const long = new Vector3();
  const grip = new Vector3();
  if (size.y >= size.x && size.y >= size.z) {
    long.set(0, 1, 0);
    grip.set((box.min.x + box.max.x) * 0.5, box.min.y + size.y * frac, (box.min.z + box.max.z) * 0.5);
  } else if (size.x >= size.z) {
    long.set(1, 0, 0);
    grip.set(box.min.x + size.x * frac, (box.min.y + box.max.y) * 0.5, (box.min.z + box.max.z) * 0.5);
  } else {
    long.set(0, 0, 1);
    grip.set((box.min.x + box.max.x) * 0.5, (box.min.y + box.max.y) * 0.5, box.min.z + size.z * frac);
  }
  const gripLocal = root.worldToLocal(grip.clone());
  root.position.sub(gripLocal);
  root.quaternion.premultiply(new Quaternion().setFromUnitVectors(long.normalize(), new Vector3(0, 1, 0)));
  const e = spec.eulerDeg || [-90, 0, 0];
  root.quaternion.multiply(
    new Quaternion().setFromEuler(
      new Euler(
        MathUtils.degToRad(e[0] || 0),
        MathUtils.degToRad(e[1] || 0),
        MathUtils.degToRad(e[2] || 0),
        'XYZ'
      )
    )
  );
  const g = spec.grip || [0, 0, 0];
  root.position.x += g[0] || 0;
  root.position.y += g[1] || 0;
  root.position.z += g[2] || 0;
  root.userData.catalogGrip = {
    socket: spec.socket,
    socketFrac: frac,
    profile: spec.profile
  };
  return spec;
}
