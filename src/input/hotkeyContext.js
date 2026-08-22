/**
 * Hotkey state — one table, one derived context.
 *
 * Runtime: InputManager looks up this table. Display: keybindSsot reads the same ids.
 * Mode owner: XState playerActivityMachine + SessionState.gates (derived, not a 2nd machine).
 * Chrome: CSS `html[data-hotkey-ctx]` / `#hud[data-hotkey-ctx]`.
 *
 * Not HudSettings / HYDRA Q=block. Not Lua. Scriptable play stays JSON catalogs.
 *
 * @see docs/HOTKEY_CONTEXT_SSOT.md
 * @see playerActivityMachine.js
 */

/** @typedef {'combat'|'harvest'|'equip'|'inventory'|'ride'} HotkeyCtx */

export const HOTKEY_CONTEXTS = Object.freeze([
  'combat',
  'harvest',
  'equip',
  'inventory',
  'ride'
]);

/**
 * @param {{
 *   activity?: string,
 *   drcSession?: string,
 *   inventoryOpen?: boolean,
 *   riding?: boolean
 * }} s
 * @returns {HotkeyCtx}
 */
export function resolveHotkeyContext(s = {}) {
  if (s.inventoryOpen) return 'inventory';
  if (s.riding) return 'ride';
  if (s.drcSession === 'equip') return 'equip';
  if (s.activity === 'harvest') return 'harvest';
  return 'combat';
}

export function applyHotkeyCss(ctx, root = document.documentElement) {
  const v = HOTKEY_CONTEXTS.includes(ctx) ? ctx : 'combat';
  root.dataset.hotkeyCtx = v;
  const hud = document.getElementById('hud');
  if (hud) hud.dataset.hotkeyCtx = v;
}

/**
 * Bindings: first match wins after Alt / Alt+Shift lab maps.
 * `ctx` empty = every play context. `shift`/`alt` must match exactly.
 *
 * @type {readonly {
 *   id: string,
 *   code: string,
 *   ctx: HotkeyCtx[],
 *   shift?: boolean,
 *   alt?: boolean,
 *   channel: string,
 *   payload?: string|number,
 *   prevent?: boolean
 * }[]}
 */
export const HOTKEY_BINDINGS = Object.freeze([
  {
    id: 'classSkill0',
    code: 'KeyF',
    ctx: ['combat'],
    channel: 'classSkill',
    payload: 'f',
    prevent: true
  },
  {
    id: 'harvestSwing',
    code: 'KeyF',
    ctx: ['harvest'],
    channel: 'combatAction',
    payload: 'interact',
    prevent: true
  },
  {
    id: 'classRadialStart',
    code: 'KeyR',
    ctx: ['combat'],
    channel: 'action',
    payload: 'rHoldStart',
    prevent: true
  },
  {
    id: 'harvestToolStart',
    code: 'KeyR',
    ctx: ['harvest'],
    channel: 'action',
    payload: 'rHoldStart',
    prevent: true
  },
  {
    id: 'drcSession',
    code: 'KeyQ',
    ctx: ['combat', 'harvest', 'equip', 'ride'],
    shift: true,
    channel: 'action',
    payload: 'toggleDrcSession'
  },
  {
    id: 'modeHold',
    code: 'KeyQ',
    ctx: ['combat', 'harvest', 'equip', 'ride'],
    shift: false,
    channel: 'action',
    payload: 'qHoldStart'
  },
  {
    id: 'block',
    code: 'KeyE',
    ctx: ['combat'],
    channel: 'combatAction',
    payload: 'block',
    prevent: true
  },
  {
    id: 'parry',
    code: 'KeyC',
    ctx: ['combat'],
    channel: 'combatAction',
    payload: 'parry',
    prevent: true
  },
  {
    id: 'dodge',
    code: 'KeyX',
    ctx: ['combat'],
    channel: 'combatAction',
    payload: 'dodge',
    prevent: true
  },
  {
    id: 'kick',
    code: 'KeyV',
    ctx: ['combat'],
    channel: 'combatAction',
    payload: 'kick',
    prevent: true
  },
  {
    id: 'weapon0',
    code: 'Digit1',
    ctx: ['combat'],
    channel: 'skillHold:start',
    payload: 0
  },
  {
    id: 'weapon1',
    code: 'Digit2',
    ctx: ['combat'],
    channel: 'skillHold:start',
    payload: 1
  },
  {
    id: 'weapon2',
    code: 'Digit3',
    ctx: ['combat'],
    channel: 'skillHold:start',
    payload: 2
  },
  {
    id: 'weapon3',
    code: 'Digit4',
    ctx: ['combat'],
    channel: 'skillHold:start',
    payload: 3
  }
]);

/**
 * @param {KeyboardEvent} event
 * @param {HotkeyCtx} ctx
 */
export function matchKeyDown(event, ctx) {
  const shift = !!event.shiftKey;
  const alt = !!event.altKey;
  if (alt) return null;
  for (const b of HOTKEY_BINDINGS) {
    if (b.code !== event.code) continue;
    if (b.ctx.length && !b.ctx.includes(ctx)) continue;
    if (b.shift === true && !shift) continue;
    if (b.shift === false && shift) continue;
    if (b.alt === true && !alt) continue;
    if (b.alt === false && alt) continue;
    return b;
  }
  return null;
}
