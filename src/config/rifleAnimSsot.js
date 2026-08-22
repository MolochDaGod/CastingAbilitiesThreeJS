/**
 * Rifle / long-gun animation SSOT — Mixamo 8-way pack + two-hand HandIK.
 *
 * Author: D:\Games\Models\_anim_packs\rifle\  (37 FBX)
 * Lab:    public/anim/rifle/*.fbx
 *
 * Bind on the existing CharacterController mixer (rotation-only rematch).
 * Do not add a second animator. HandIK layers after mixer for barrel aim.
 *
 * Walk set is 4-way (F/B/L/R). Run set is full 8-way. Diagonals on walk
 * fall back to the stronger cardinal via rifleGaitRoles().
 */

/** Logical 8-way octants (camera / aim relative). */
export const RIFLE_OCTANTS = Object.freeze([
  'F',
  'FR',
  'R',
  'BR',
  'B',
  'BL',
  'L',
  'FL'
]);

/**
 * Same-origin Mixamo FBX first (lab), then Open when promoted.
 * @type {Readonly<Record<string, readonly string[]>>}
 */
export const RIFLE_FBX_URLS = Object.freeze({
  idle: ['./anim/rifle/idle.fbx'],
  idleAim: ['./anim/rifle/idle-aiming.fbx', './anim/rifle/rifle-aiming-idle.fbx'],
  walk: ['./anim/rifle/walking.fbx'],
  walkB: ['./anim/rifle/walking-backwards.fbx'],
  walkL: ['./anim/rifle/strafe-left.fbx'],
  walkR: ['./anim/rifle/strafe-right.fbx'],
  run: ['./anim/rifle/run-forward.fbx', './anim/rifle/rifle-run.fbx'],
  runB: ['./anim/rifle/run-backward.fbx'],
  runL: ['./anim/rifle/run-left.fbx'],
  runR: ['./anim/rifle/run-right.fbx'],
  runFL: ['./anim/rifle/run-forward-left.fbx'],
  runFR: ['./anim/rifle/run-forward-right.fbx'],
  runBL: ['./anim/rifle/run-backward-left.fbx'],
  runBR: ['./anim/rifle/run-backward-right.fbx'],
  attack: ['./anim/rifle/firing-rifle.fbx'],
  reload: ['./anim/rifle/reloading.fbx'],
  jump: ['./anim/rifle/rifle-jump.fbx']
});

/**
 * Role prefer lists per gait + octant. First bound clip wins.
 * Walk has no diagonal FBX — fall back to F/B then L/R.
 * @type {Readonly<Record<number, Readonly<Record<string, readonly string[]>>>>}
 */
export const RIFLE_GAIT_ROLES = Object.freeze({
  1: Object.freeze({
    F: ['walk'],
    B: ['walkB', 'walk'],
    L: ['walkL', 'walk'],
    R: ['walkR', 'walk'],
    FL: ['walkFL', 'walk', 'walkL'],
    FR: ['walkFR', 'walk', 'walkR'],
    BL: ['walkBL', 'walkB', 'walkL'],
    BR: ['walkBR', 'walkB', 'walkR']
  }),
  2: Object.freeze({
    F: ['run'],
    B: ['runB', 'walkB', 'run'],
    L: ['runL', 'run'],
    R: ['runR', 'run'],
    FL: ['runFL', 'run', 'runL'],
    FR: ['runFR', 'run', 'runR'],
    BL: ['runBL', 'runB', 'runL'],
    BR: ['runBR', 'runB', 'runR']
  })
});

/**
 * Pick F/B/L/R/FL/FR/BL/BR from move · forward / move · right.
 * Sign matches existing DRC strafe (lat>0 = right).
 * @param {number} fwd
 * @param {number} lat
 * @returns {'F'|'FR'|'R'|'BR'|'B'|'BL'|'L'|'FL'}
 */
export function pickMoveOctant(fwd, lat) {
  const f = Number(fwd) || 0;
  const l = Number(lat) || 0;
  if (f * f + l * l < 1e-8) return 'F';
  const deg = (Math.atan2(l, f) * 180) / Math.PI;
  const sector = Math.round(deg / 45);
  switch (sector) {
    case 0:
      return 'F';
    case 1:
      return 'FR';
    case 2:
      return 'R';
    case 3:
      return 'BR';
    case 4:
    case -4:
      return 'B';
    case -3:
      return 'BL';
    case -2:
      return 'L';
    case -1:
      return 'FL';
    default:
      return 'F';
  }
}

/**
 * Prefer-list for a gait level + octant.
 * @param {1|2|number} gait
 * @param {string} octant
 * @returns {readonly string[]}
 */
export function rifleGaitRoles(gait, octant) {
  const g = gait >= 2 ? 2 : 1;
  const table = RIFLE_GAIT_ROLES[g];
  const key = RIFLE_OCTANTS.includes(octant) ? octant : 'F';
  return table[key] || table.F;
}

/** Soft HandIK weights — clip owns the grip; IK only points the barrel. */
export const RIFLE_HAND_IK = Object.freeze({
  /** Focus / ADS */
  aimWeight: 0.4,
  /** Hip-fire / no focus — keep Mixamo pose */
  restWeight: 0.16,
  /** Left forestock vs right grip */
  supportScale: 0.7,
  /** Metres along barrel from grip for left-hand target */
  forestockM: 0.28
});
