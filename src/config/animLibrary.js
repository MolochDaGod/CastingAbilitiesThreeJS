/**
 * Animation Library SSOT — language, families, and play channels for Casting lab.
 *
 * **Do not invent parallel role names.** Extend ANIM_PACKS (assets.js) + this
 * vocabulary, then wire play* on CharacterController / DrcCombatController.
 *
 * Docs: docs/ANIM_LIBRARY_SSOT.md · CASTING_LAB_SSOT.md
 *
 * Vocabulary (use these words in UI, toasts, agent notes):
 * | Term        | Meaning |
 * |-------------|---------|
 * | pack        | Named clip set: magic · sword_shield · longbow · combat_mobility |
 * | role        | Logical clip key: idle · walk · run · dodgeL · rollR · slide … |
 * | family      | gait | combat | mobility | utility |
 * | channel     | How it is driven: gait (setGait) · oneShot · mobility impulse |
 * | MM          | Motion-math displacement (100 MM = 1 m) — combat/motionMath.js |
 * | afterimage  | Trailing model ghosts during MM dodge — vfx/DodgeAfterimage.js |
 *
 * Bind order on hero load:
 *   1. weapon pack (magic | sword_shield | longbow)
 *   2. magic fallback if needed (idle/hands)
 *   3. combat_mobility (always — rolls, dodges, slide, parry)
 */

import { ANIM_PACKS, ANIM_PACK_META, DODGE_ROLE, ROLL_ROLE } from './assets.js';
import { DODGE_MM, mmToM } from '../combat/motionMath.js';

/** @typedef {'gait'|'combat'|'mobility'|'utility'} AnimFamily */
/** @typedef {'gait'|'oneShot'|'mobility'} AnimChannel */

/**
 * Canonical role → family + channel + human label.
 * Keys are primary action names (not pack-prefixed combat_mobility:rollL).
 * @type {Record<string, { family: AnimFamily, channel: AnimChannel, label: string, input?: string }>}
 */
export const ANIM_ROLE_META = Object.freeze({
  idle: { family: 'gait', channel: 'gait', label: 'Idle' },
  walk: { family: 'gait', channel: 'gait', label: 'Walk' },
  run: { family: 'gait', channel: 'gait', label: 'Run / sprint' },
  jump: { family: 'gait', channel: 'oneShot', label: 'Jump', input: 'Space' },

  cast: { family: 'combat', channel: 'oneShot', label: 'Cast', input: '1–4 / staff' },
  attack: { family: 'combat', channel: 'oneShot', label: 'Attack', input: 'F / LMB skill' },
  block: { family: 'combat', channel: 'oneShot', label: 'Block / guard', input: 'E' },
  parry: { family: 'combat', channel: 'oneShot', label: 'Parry', input: 'C' },

  dodgeL: {
    family: 'mobility',
    channel: 'mobility',
    label: 'Dodge left (MM escape)',
    input: 'AA double-tap'
  },
  dodgeR: {
    family: 'mobility',
    channel: 'mobility',
    label: 'Dodge right (MM escape)',
    input: 'DD double-tap'
  },
  dodgeF: {
    family: 'mobility',
    channel: 'mobility',
    label: 'Dodge forward',
    input: 'WW double-tap'
  },
  dodgeB: {
    family: 'mobility',
    channel: 'mobility',
    label: 'Dodge back',
    input: 'X'
  },
  rollL: {
    family: 'mobility',
    channel: 'mobility',
    label: 'Roll left (Ghost Rider)',
    input: 'Ctrl+A'
  },
  rollR: {
    family: 'mobility',
    channel: 'mobility',
    label: 'Roll right (Ghost Rider)',
    input: 'Ctrl+D'
  },
  rollF: {
    family: 'mobility',
    channel: 'mobility',
    label: 'Roll forward',
    input: 'Ctrl+W'
  },
  rollB: {
    family: 'mobility',
    channel: 'mobility',
    label: 'Roll back',
    input: 'Ctrl+S'
  },
  slide: {
    family: 'mobility',
    channel: 'mobility',
    label: 'Sprint slide',
    input: 'Shift+Ctrl'
  }
});

/** Shared mobility pack id — always bound after weapon pack. */
export const COMBAT_MOBILITY_PACK = 'combat_mobility';

/** Weapon packs that drive idle/walk/run/attack/cast. */
export const WEAPON_PACK_IDS = Object.freeze(['magic', 'sword_shield', 'longbow']);

/**
 * Mobility input map (agent / HUD copy). Roles resolve via DODGE_ROLE / ROLL_ROLE.
 */
export const MOBILITY_BINDINGS = Object.freeze({
  dodge: {
    id: 'dodge',
    label: 'MM dodge',
    input: 'AA / DD / WW double-tap · X back',
    roleMap: DODGE_ROLE,
    mm: true,
    afterimage: true,
    invuln: true,
    play: 'playDodge',
    notes: 'Lateral AA/DD use DODGE_MM.lateral (3× baseline). Wind mesh afterimages.'
  },
  roll: {
    id: 'roll',
    label: 'Ghost Rider roll',
    input: 'Ctrl+A left · Ctrl+D right · Ctrl+W/S',
    roleMap: ROLL_ROLE,
    mm: false,
    afterimage: false,
    invuln: false,
    play: 'playRoll',
    notes: 'Primary clips ghost_rider/roll_* · locomotion fallback · longbow dodge last.'
  },
  slide: {
    id: 'slide',
    label: 'Sprint slide',
    input: 'Shift+Ctrl while sprint',
    roleMap: { default: 'slide' },
    mm: false,
    afterimage: false,
    invuln: false,
    play: 'playSlide',
    notes: 'prod:extra/running-slide'
  }
});

/**
 * Strip pack prefix: `combat_mobility:rollL` → `rollL`
 * @param {string} roleName
 * @returns {string}
 */
export function baseRoleName(roleName) {
  const s = String(roleName || '');
  const i = s.lastIndexOf(':');
  return i >= 0 ? s.slice(i + 1) : s;
}

/**
 * @param {string} roleName action key from mixer map
 * @returns {{ family: AnimFamily, channel: AnimChannel, label: string, input?: string, base: string }}
 */
export function classifyRole(roleName) {
  const base = baseRoleName(roleName);
  const meta = ANIM_ROLE_META[base] || {
    family: /** @type {AnimFamily} */ ('utility'),
    channel: /** @type {AnimChannel} */ ('oneShot'),
    label: base
  };
  return { ...meta, base };
}

/**
 * Group bound clip names for library UI.
 * @param {string[]} roleNames
 * @returns {Record<AnimFamily, string[]>}
 */
export function groupRolesByFamily(roleNames) {
  /** @type {Record<AnimFamily, string[]>} */
  const out = { gait: [], combat: [], mobility: [], utility: [] };
  for (const name of roleNames || []) {
    const { family } = classifyRole(name);
    out[family].push(name);
  }
  for (const k of Object.keys(out)) out[k].sort();
  return out;
}

/**
 * Snapshot for Lab / Showcase / agent diagnostics.
 * @param {{ animPackId?: string, listAnimRoles?: () => string[], actions?: Map<string, unknown> }} character
 * @returns {object}
 */
export function describeAnimLibrary(character) {
  const roles = character?.listAnimRoles?.() || [...(character?.actions?.keys?.() || [])];
  const byFamily = groupRolesByFamily(roles);
  const packs = Object.keys(ANIM_PACKS).map((id) => ({
    id,
    label: ANIM_PACK_META[id]?.label || id,
    skills: ANIM_PACK_META[id]?.skills || '',
    locomotion: ANIM_PACK_META[id]?.locomotion || '',
    active: id === character?.animPackId
  }));
  return {
    version: '2026-08-08.anim-library.1',
    activePack: character?.animPackId || null,
    packs,
    roles,
    byFamily,
    mobility: MOBILITY_BINDINGS,
    dodgeMm: {
      lateralM: mmToM(DODGE_MM.lateral),
      forwardM: mmToM(DODGE_MM.forward),
      backM: mmToM(DODGE_MM.back),
      units: '100 MM = 1 m'
    },
    playApi: {
      gait: 'setGait(level, sprinting)',
      combat: 'playWeaponCombat(intent) | requestOneShot(role)',
      dodge: 'playDodge(dir) · DRC double-tap',
      roll: 'playRoll(dir) · Ctrl+A/D',
      slide: 'playSlide() · Shift+Ctrl',
      library: 'playLibraryClip(role) · Showcase Anims tab'
    },
    extendPattern:
      '1) Add role URLs to ANIM_PACKS in assets.js · 2) ANIM_ROLE_META here · ' +
      '3) roleMap LoopOnce in CharacterController._bindPack · 4) play* or DRC poll · 5) docs'
  };
}

/**
 * Short toast / HUD line for a role.
 * @param {string} roleName
 */
export function roleBlurb(roleName) {
  const c = classifyRole(roleName);
  const input = c.input ? ` · ${c.input}` : '';
  return `${c.label}${input} [${c.family}/${c.channel}]`;
}
