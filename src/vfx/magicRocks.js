/**
 * Isolated MagicRock_1–6 from magic_rocks.glb.
 * Never load the fused pack as a projectile, staff orb, or dungeon object.
 *
 * Slot-1 staff normal stays gd_orbs (`staffOrbVfx`). These rocks are:
 *   - nature / ice / holy staff travel (earth_rocks, crystal bolts)
 *   - effect projectiles (quake / stone path / frost lance)
 *   - shrine / fissure objects
 *
 * SI longest axis 0.45 m (staff orb SSOT).
 * CDN: https://assets.grudge-studio.com/models/vfx/rocks/magic-rock-N.glb
 *
 * Assorted `rock-0..7` stay debris / cannon — do not overwrite.
 * Skip `survival_game_propasset_pack` (modern jerrycan/radio — not Warlords).
 */

export const MAGIC_ROCK_DIAMETER_M = 0.45;
export const MAGIC_ROCK_R2_PREFIX = 'models/vfx/rocks/';
export const MAGIC_ROCK_CDN = 'https://assets.grudge-studio.com';

/** @typedef {'fire'|'ice'|'nature'|'storm'|'holy'|'arcane'} MagicRockElement */

/**
 * @typedef {object} MagicRockDef
 * @property {string} id
 * @property {string} sourceMesh
 * @property {string} path  local public path (Casting / dungeon)
 * @property {string} cdn   r2 key under assets.grudge-studio.com
 * @property {MagicRockElement} element
 * @property {string[]} use
 */

/** @type {readonly MagicRockDef[]} */
export const MAGIC_ROCKS = Object.freeze([
  {
    id: 'magic-rock-1',
    sourceMesh: 'MagicRock_1',
    path: './models/vfx/rocks/magic-rock-1.glb',
    cdn: 'models/vfx/rocks/magic-rock-1.glb',
    element: 'fire',
    use: ['staff-projectile', 'fissure', 'object']
  },
  {
    id: 'magic-rock-2',
    sourceMesh: 'MagicRock_2',
    path: './models/vfx/rocks/magic-rock-2.glb',
    cdn: 'models/vfx/rocks/magic-rock-2.glb',
    element: 'ice',
    use: ['staff-projectile', 'object']
  },
  {
    id: 'magic-rock-3',
    sourceMesh: 'MagicRock_3',
    path: './models/vfx/rocks/magic-rock-3.glb',
    cdn: 'models/vfx/rocks/magic-rock-3.glb',
    element: 'nature',
    use: ['staff-projectile', 'fissure', 'object']
  },
  {
    id: 'magic-rock-4',
    sourceMesh: 'MagicRock_4',
    path: './models/vfx/rocks/magic-rock-4.glb',
    cdn: 'models/vfx/rocks/magic-rock-4.glb',
    element: 'storm',
    use: ['staff-projectile', 'object']
  },
  {
    id: 'magic-rock-5',
    sourceMesh: 'MagicRock_5',
    path: './models/vfx/rocks/magic-rock-5.glb',
    cdn: 'models/vfx/rocks/magic-rock-5.glb',
    element: 'holy',
    use: ['staff-projectile', 'object']
  },
  {
    id: 'magic-rock-6',
    sourceMesh: 'MagicRock_6',
    path: './models/vfx/rocks/magic-rock-6.glb',
    cdn: 'models/vfx/rocks/magic-rock-6.glb',
    element: 'arcane',
    use: ['staff-projectile', 'object']
  }
]);

const BY_ELEMENT = Object.freeze(
  Object.fromEntries(MAGIC_ROCKS.map((r) => [r.element, r]))
);
const BY_ID = Object.freeze(Object.fromEntries(MAGIC_ROCKS.map((r) => [r.id, r])));

const ELEMENT_ALIAS = Object.freeze({
  frost: 'ice',
  water: 'ice',
  earth: 'nature',
  wind: 'storm',
  lightning: 'storm'
});

/** @param {string} [element] */
export function normalizeMagicRockElement(element) {
  const raw = String(element || '').toLowerCase();
  if (BY_ELEMENT[raw]) return raw;
  return ELEMENT_ALIAS[raw] || 'nature';
}

/** @param {string} [element] */
export function magicRockForElement(element) {
  return BY_ELEMENT[normalizeMagicRockElement(element)] || BY_ELEMENT.nature;
}

/** Local mesh URL for a staff / effect projectile. */
export function magicRockPath(element) {
  return magicRockForElement(element).path;
}

/** R2 / CDN key (no host). */
export function magicRockCdnKey(element) {
  return magicRockForElement(element).cdn;
}

export function magicRockCdnUrl(element) {
  return `${MAGIC_ROCK_CDN}/${magicRockCdnKey(element)}`;
}

export function magicRockById(id) {
  return BY_ID[id] || null;
}

/**
 * Pick N isolated magic rocks. First is the element match, rest are siblings.
 * Never returns the fused magic_rocks.glb pack.
 * @param {number} [count]
 * @param {string} [element]
 * @returns {string[]}
 */
export function pickMagicRocks(count = 1, element = 'nature') {
  const n = Math.max(1, Math.min(MAGIC_ROCKS.length, count | 0));
  const primary = magicRockForElement(element);
  const out = [primary.path];
  if (n === 1) return out;
  const rest = MAGIC_ROCKS.filter((r) => r.id !== primary.id);
  for (let i = 0; i < n - 1; i++) {
    out.push(rest[i % rest.length].path);
  }
  return out;
}

/** True when a catalog skill should travel as a magic-rock mesh (not gd_orb). */
export function skillUsesMagicRock(skill) {
  if (!skill) return false;
  if (skill.useMagicRock === true) return true;
  const el = normalizeMagicRockElement(skill.element || skill.abilityElement);
  const blob = `${skill.id || ''} ${skill.label || ''} ${skill.catalogSkillId || ''} ${skill.pathMode || ''}`.toLowerCase();
  if (/quake|stone|rock|earth|spike|upheaval|fissure|crystal|lance/.test(blob)) return true;
  if (el === 'nature' && skill.slot !== 0 && skill.slotType !== 'primary') return true;
  if ((el === 'ice' || el === 'holy') && /bolt|lance|path|surge/.test(blob)) return true;
  return false;
}
