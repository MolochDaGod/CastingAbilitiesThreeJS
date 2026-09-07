/**
 * Independent weapon attach bookkeeping.
 * Weapons parent to R_hand_container / L_hand_container — never mesh-merge.
 * Grip width SSOT: 0.10 m (human palm). Meshy does not auto-align grips.
 */
export const HAND_GRIP_WIDTH_M = 0.10;
export const WEAPON_SOCKET = Object.freeze({
  main: 'R_hand_container',
  off: 'L_hand_container',
  shield: 'L_shield_container'
});

/**
 * @typedef {object} WeaponGripEntry
 * @property {string} weapon_name
 * @property {string} socket_point
 * @property {[number, number, number]} grip_offset_xyz
 * @property {number} scale_factor  1 = already SI vs 0.10 m palm
 * @property {string} [profile]
 */

/** Catalog T0 + kit-family defaults. Tune after measure — do not regenerate mesh. */
export const WEAPON_GRIP_MANIFEST = Object.freeze({
  't0-sword': {
    weapon_name: 't0-sword',
    category: 'weapon',
    socket_point: WEAPON_SOCKET.main,
    grip_offset_xyz: [0, 0, 0],
    scale_factor: 1,
    profile: 'melee'
  },
  't0-wand': {
    weapon_name: 't0-wand',
    category: 'weapon',
    socket_point: WEAPON_SOCKET.main,
    grip_offset_xyz: [0, 0, 0],
    scale_factor: 1,
    profile: 'wand'
  },
  't0-nature-staff': {
    weapon_name: 't0-nature-staff',
    category: 'weapon',
    socket_point: WEAPON_SOCKET.main,
    grip_offset_xyz: [0, 0, 0],
    scale_factor: 1,
    profile: 'staff'
  },
  't0-rifle': {
    weapon_name: 't0-rifle',
    category: 'weapon',
    socket_point: WEAPON_SOCKET.main,
    grip_offset_xyz: [0, 0, 0],
    scale_factor: 1,
    profile: 'rifle'
  },
  't0-gun': {
    weapon_name: 't0-gun',
    category: 'weapon',
    socket_point: WEAPON_SOCKET.main,
    grip_offset_xyz: [0, 0, 0],
    scale_factor: 1,
    profile: 'pistol'
  }
});

export function gripEntryForWeapon(weaponIdOrUrl) {
  const raw = String(weaponIdOrUrl || '');
  const id = raw.toLowerCase();
  if (WEAPON_GRIP_MANIFEST[raw]) return WEAPON_GRIP_MANIFEST[raw];
  for (const [k, v] of Object.entries(WEAPON_GRIP_MANIFEST)) {
    if (id.includes(k.toLowerCase())) return v;
  }
  return {
    weapon_name: raw || 'unknown',
    category: 'weapon',
    socket_point: WEAPON_SOCKET.main,
    grip_offset_xyz: [0, 0, 0],
    scale_factor: 1,
    profile: 'melee'
  };
}
