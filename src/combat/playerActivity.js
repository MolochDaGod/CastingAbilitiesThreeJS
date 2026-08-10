/**
 * Player activity modes — Open Danger parity (combat / harvest).
 * SSOT port of gameopen playerMode.ts for Casting Dev Island.
 *
 * Hold Q → mode radial (↑ combat · ↓ harvest); tap Q toggles
 * Hold R (harvest) → tool radial
 * F harvest → nearest node for tool in hand
 *
 * @see gameopen/artifacts/animator/src/three/playerMode.ts
 */

/** @typedef {'combat'|'harvest'} ActivityMode */
/** @typedef {'none'|'mode'|'tool'} RadialKind */

export const ACTIVITY_MODES = Object.freeze(['combat', 'harvest']);

export const MODE_LABEL = Object.freeze({
  combat: 'COMBAT',
  harvest: 'HARVEST'
});

export const MODE_COLOR = Object.freeze({
  combat: '#ff7a7a',
  harvest: '#7ee7a8'
});

/** Hold-Q wedges (vertical aim). */
export const MODE_SWITCH_RADIAL = Object.freeze([
  { id: 'mode_combat', label: 'Combat', glyph: '⚔', hint: '↑', color: '#ff7a7a' },
  { id: 'mode_harvest', label: 'Harvest', glyph: '🌿', hint: '↓', color: '#7ee7a8' }
]);

/**
 * Hold-R harvest tools (equip intent).
 * Maps to tool tags used by DevIslandHarvest / equipWeaponById.
 */
export const HARVEST_TOOL_RADIAL = Object.freeze([
  { id: 'pick', label: 'Pick', glyph: '⛏', hint: 'ore', color: '#a0b0c8', weaponId: 't0-tool' },
  { id: 'hatchet', label: 'Hatchet', glyph: '🪓', hint: 'wood', color: '#c98a3d', weaponId: 't0-axe1h' },
  { id: 'knife', label: 'Knife', glyph: '🥩', hint: 'skin', color: '#e8a070', weaponId: 't0-dagger' },
  { id: 'hand', label: 'Hands', glyph: '✋', hint: 'herb', color: '#90d070', weaponId: null },
  { id: 'shovel', label: 'Shovel', glyph: '⛏', hint: 'terrain', color: '#c4a070', weaponId: 't0-tool' },
  { id: 'back_slot', label: 'Back', glyph: '🪽', hint: 'windsurf', color: '#b0c8ff', weaponId: null }
]);

/** Hold duration (s) before radial opens. */
export const RADIAL_HOLD_S = 0.18;

/**
 * @param {ActivityMode} mode
 */
export function nextActivityMode(mode) {
  return mode === 'harvest' ? 'combat' : 'harvest';
}

/**
 * Map tool radial id → harvest class preferences.
 * @param {string} toolId
 */
export function toolPreferClasses(toolId) {
  switch (toolId) {
    case 'pick':
      return ['ore', 'rock'];
    case 'hatchet':
      return ['wood'];
    case 'knife':
      return ['herb', 'fiber'];
    case 'hand':
      return ['herb', 'fiber', 'rock'];
    case 'shovel':
      return ['rock'];
    default:
      return null;
  }
}
