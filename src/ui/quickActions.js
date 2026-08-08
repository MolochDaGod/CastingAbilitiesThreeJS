/**
 * Danger Room / threejs-rapier quick-action catalog — 6+6 wing slots.
 * SSOT mirror: gameopen/artifacts/animator/src/hud/quickActions.ts
 *
 * Keybind SSOT (combat session):
 *   LMB primary · F best-next-action (pickup / harvest / standard attack)
 *   X dodge · C parry · E block · R heavy
 *   J heal · H bomb · V kick · Q mode (equip↔combat in casting lab)
 */

/** @typedef {'primary'|'fskill'|'interact'|'sig1'|'sig2'|'sig3'|'sig4'|'heavy'|'parry'|'block'|'dodge'|'kick'|'bomb'|'heal'|'mode'} QuickActionId */

/**
 * @typedef {object} QuickAction
 * @property {QuickActionId} id
 * @property {string} label
 * @property {string} glyph  short UI glyph (no icon pack required)
 * @property {string} key
 * @property {'action'|'skill'|'item'|'meta'} kind
 */

/** @type {Record<QuickActionId, QuickAction>} */
export const QUICK_ACTIONS = {
  primary: { id: 'primary', label: 'Attack', glyph: '⚔', key: 'LMB', kind: 'action' },
  /** F key — context: pickup → harvest → standard attack (residual on attack) */
  interact: {
    id: 'interact',
    label: 'Interact',
    glyph: '◎',
    key: 'F',
    kind: 'action'
  },
  /** @deprecated use interact — kept for bar slot id compatibility */
  fskill: { id: 'fskill', label: 'Interact', glyph: '◎', key: 'F', kind: 'action' },
  sig1: { id: 'sig1', label: 'Signature 1', glyph: '1', key: '1', kind: 'skill' },
  sig2: { id: 'sig2', label: 'Signature 2', glyph: '2', key: '2', kind: 'skill' },
  sig3: { id: 'sig3', label: 'Signature 3', glyph: '3', key: '3', kind: 'skill' },
  sig4: { id: 'sig4', label: 'Signature 4', glyph: '4', key: '4', kind: 'skill' },
  heavy: { id: 'heavy', label: 'Heavy', glyph: '◆', key: 'R', kind: 'action' },
  parry: { id: 'parry', label: 'Parry', glyph: '⛨', key: 'C', kind: 'action' },
  block: { id: 'block', label: 'Block', glyph: '▣', key: 'E', kind: 'action' },
  dodge: { id: 'dodge', label: 'Back dodge', glyph: '⟳', key: 'X', kind: 'action' },
  kick: { id: 'kick', label: 'Kick', glyph: '▹', key: 'V', kind: 'action' },
  bomb: { id: 'bomb', label: 'Bomb', glyph: '◉', key: 'H', kind: 'item' },
  heal: { id: 'heal', label: 'Heal', glyph: '✚', key: 'J', kind: 'item' },
  mode: { id: 'mode', label: 'Mode', glyph: '◎', key: 'Q', kind: 'meta' }
};

export const QUICK_SLOTS_PER_SIDE = 6;
export const QUICK_SLOT_COUNT = 12;

/**
 * Default 6+6 (threejs-rapier tight HUD):
 * Left  = offense + skills (LMB F 1 2 3 4)
 * Right = defense + utility (X C R V J H) — E block is key-only (not wing)
 * @returns {(QuickActionId|null)[]}
 */
export function defaultQuickSlots() {
  return [
    'primary',
    'interact',
    'sig1',
    'sig2',
    'sig3',
    'sig4',
    'dodge',
    'parry',
    'heavy',
    'kick',
    'heal',
    'bomb'
  ];
}

export function leftWingSlots(slots = defaultQuickSlots()) {
  return slots.slice(0, QUICK_SLOTS_PER_SIDE);
}

export function rightWingSlots(slots = defaultQuickSlots()) {
  return slots.slice(QUICK_SLOTS_PER_SIDE, QUICK_SLOT_COUNT);
}

export const COMBAT_KEY_LEGEND =
  'AA/DD/WW dodge · X back · C parry · E block · F interact · 1–4 · Space jump';

export const COMBAT_KEY_CHIPS = Object.freeze([
  'AA/DD/WW: Dodge',
  'X: Back dodge',
  'C: Parry',
  'E: Block',
  'F: Interact / attack',
  'LMB: Staff path',
  '1–4: Skills',
  'Space: Jump'
]);
