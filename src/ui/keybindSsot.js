/**
 * Casting production keybind display SSOT.
 * Matches ui.grudge-studio.com/hotkeys categories. Do not invent combat keys.
 * Display + Settings tab only — InputManager remains the runtime map.
 */

/** @typedef {{ id: string, action: string, category: 'Movement'|'Combat'|'Skills'|'UI', key: string, note?: string }} KeybindRow */

/** @type {KeybindRow[]} */
export const KEYBIND_ROWS = Object.freeze([
  { id: 'move', action: 'Move', category: 'Movement', key: 'WASD' },
  { id: 'sprint', action: 'Sprint', category: 'Movement', key: 'Shift' },
  { id: 'jump', action: 'Jump', category: 'Movement', key: 'Space', note: 'jump only — not attack' },
  { id: 'slide', action: 'Slide', category: 'Movement', key: 'Shift+Ctrl' },
  { id: 'roll', action: 'Roll', category: 'Movement', key: 'Ctrl+A/D' },
  { id: 'lmb', action: 'Select / path cast', category: 'Combat', key: 'LMB' },
  { id: 'rmb', action: 'Focus / cycle target', category: 'Combat', key: 'RMB' },
  { id: 'class0', action: 'Class skill 0', category: 'Combat', key: 'F', note: 'combat only' },
  { id: 'classItem', action: 'Class item / hold radial or skill tree', category: 'Combat', key: 'R', note: 'combat tap = item · hold = radial or tree · form = form R' },
  { id: 'mmb', action: 'Heavy / form MMB', category: 'Combat', key: 'MMB', note: 'finisher · ranger hop-shot · worge typhoon/bear stun' },
  { id: 'form4', action: 'Leave form', category: 'Skills', key: '4', note: 'in animal form only' },
  { id: 'harvestF', action: 'Harvest swing', category: 'Combat', key: 'F', note: 'harvest mode' },
  { id: 'block', action: 'Block', category: 'Combat', key: 'E', note: 'combat' },
  { id: 'parry', action: 'Parry', category: 'Combat', key: 'C', note: 'combat' },
  { id: 'swap', action: 'Weapon set A/B', category: 'Combat', key: 'Q', note: 'tap · combat' },
  { id: 'holdQ', action: 'Combat / harvest mode', category: 'Combat', key: 'Hold Q' },
  { id: 'harvestQ', action: 'Tool for nearest node', category: 'Combat', key: 'Tap Q', note: 'harvest' },
  { id: 's1', action: 'Weapon hotbar 1–4', category: 'Skills', key: '1–4' },
  { id: 's56', action: 'Staff / extra binds', category: 'Skills', key: '5–6' },
  { id: 'panel', action: 'Main Panel', category: 'UI', key: 'I' },
  { id: 'menu', action: 'Game menu', category: 'UI', key: 'Esc' },
  { id: 'help', action: 'Help / FPS', category: 'UI', key: '?' },
  { id: 'mode', action: 'Walk / cast mode', category: 'UI', key: 'M' },
  { id: 'vfx', action: 'VFX studio', category: 'UI', key: 'G / V' },
  { id: 'admin', action: 'Admin hub', category: 'UI', key: 'F1–F4 ]' }
]);

export function keybindsByCategory() {
  const out = { Movement: [], Combat: [], Skills: [], UI: [] };
  for (const row of KEYBIND_ROWS) out[row.category].push(row);
  return out;
}
