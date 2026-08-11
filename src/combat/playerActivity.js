/**
 * Player activity modes — Open Danger parity (combat / harvest).
 * SSOT port of gameopen playerMode.ts for Casting Dev Island.
 *
 * Hold Q → mode radial (↑ combat · ↓ harvest)
 * Tap Q · combat → dual weapon loadout swap (Weapon 1 ↔ Weapon 2 · skills · loco)
 * Tap Q · harvest → return to combat
 * Hold R (harvest) → tool radial
 * Tap R (harvest) → draw last tool (default pick) — auto stow weapon on harvest enter
 * F harvest → nearest node for tool in hand
 * Dodge stays AA / DD / X — Q never dodges
 *
 * State machine: playerActivityMachine.js (XState) — mode / hand / loco / tool memory.
 *
 * @see gameopen/artifacts/animator/src/three/playerMode.ts
 * @see playerActivityMachine.js
 * @see equippedWeaponRuntime.js swapWeaponLoadout
 */

/** @typedef {'combat'|'harvest'} ActivityMode */
/** @typedef {'none'|'mode'|'tool'} RadialKind */

export const ACTIVITY_MODES = Object.freeze(['combat', 'harvest']);

/** Default harvest tool when none remembered (product: pick). */
export const DEFAULT_HARVEST_TOOL = 'pick';

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
  { id: 'mode_combat', label: 'Combat', glyph: 'C', hint: 'Up', color: '#ff7a7a' },
  { id: 'mode_harvest', label: 'Harvest', glyph: 'H', hint: 'Down', color: '#7ee7a8' }
]);

/**
 * Hold-R harvest tools (equip intent).
 * Maps to tool tags used by DevIslandHarvest / equipWeaponById.
 * Default / first profession tool = pick (ore / rock).
 */
export const HARVEST_TOOL_RADIAL = Object.freeze([
  { id: 'pick', label: 'Pick', glyph: 'Pk', hint: 'ore', color: '#a0b0c8', weaponId: 't0-tool' },
  { id: 'hatchet', label: 'Hatchet', glyph: 'Ax', hint: 'wood', color: '#c98a3d', weaponId: 't0-axe1h' },
  { id: 'knife', label: 'Knife', glyph: 'Kn', hint: 'skin', color: '#e8a070', weaponId: 't0-dagger' },
  { id: 'hand', label: 'Hands', glyph: 'Hn', hint: 'herb', color: '#90d070', weaponId: null },
  { id: 'shovel', label: 'Shovel', glyph: 'Sh', hint: 'terrain', color: '#c4a070', weaponId: 't0-tool' },
  { id: 'back_slot', label: 'Back', glyph: 'Bk', hint: 'windsurf', color: '#b0c8ff', weaponId: null }
]);

/** Hold duration (s) before radial opens. Tap under this = toggle / draw last. */
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
