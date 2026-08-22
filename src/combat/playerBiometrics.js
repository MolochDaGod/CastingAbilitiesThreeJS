/**
 * Player vitals / food / auras for Main Panel Biometric tab.
 * Food slots match fishing RGB meals (SWG-style). Statuses from SkillStatusSystem.
 */
const LS = 'casting.foodBuffs.v1';

export const FOOD_SLOT_IDS = Object.freeze(['red', 'green', 'blue']);

export function loadFoodBuffs() {
  try {
    const raw = JSON.parse(localStorage.getItem(LS) || 'null');
    if (raw && typeof raw === 'object') return { red: raw.red || null, green: raw.green || null, blue: raw.blue || null };
  } catch {
    /* */
  }
  return { red: null, green: null, blue: null };
}

export function saveFoodBuffs(map) {
  try {
    localStorage.setItem(LS, JSON.stringify(map));
  } catch {
    /* */
  }
}

export function foodSlotForItem(item) {
  const blob = `${item?.id || ''} ${item?.name || ''} ${item?.category || ''} ${item?.color || ''}`.toLowerCase();
  if (/red|meat|str|power/.test(blob)) return 'red';
  if (/green|herb|agi|stam/.test(blob)) return 'green';
  if (/blue|fish|mana|int|wis/.test(blob)) return 'blue';
  return 'red';
}

/**
 * @param {object} item bag row
 * @returns {{ slot: string, until: number, label: string, itemId: string }}
 */
export function eatFood(item, durationSec = 600) {
  const slot = foodSlotForItem(item);
  const map = loadFoodBuffs();
  map[slot] = {
    slot,
    itemId: item.id,
    label: item.name || item.id,
    iconUrl: item.iconUrl || '',
    until: Date.now() + durationSec * 1000
  };
  saveFoodBuffs(map);
  return map[slot];
}

export function liveFoodBuffs() {
  const now = Date.now();
  const map = loadFoodBuffs();
  let dirty = false;
  for (const id of FOOD_SLOT_IDS) {
    if (map[id] && map[id].until < now) {
      map[id] = null;
      dirty = true;
    }
  }
  if (dirty) saveFoodBuffs(map);
  return map;
}

export function isFoodItem(item) {
  const c = String(item?.category || item?.type || '').toLowerCase();
  const blob = `${item?.id || ''} ${item?.name || ''}`.toLowerCase();
  return c === 'food' || c === 'consumable' || /food|meal|meat|fish|herb|ration|potion/.test(blob);
}
