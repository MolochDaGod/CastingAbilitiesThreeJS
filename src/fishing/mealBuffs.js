/**
 * SWG-style meal buffs — **one active meal per color** (Red · Green · Blue).
 *
 * Fleet SSOT: ObjectStore professions.chef.foodSystem
 *   Red  = Land meat  → HP / attack / defense…
 *   Blue = Ocean/soup → spell / mana / **nautical** (fisher meals)
 *   Green = Plants    → stamina / movement / crit…
 *
 * Main Panel professions (WCS) use the same RGB food slots.
 * Lab applies temporary modifiers for freeride + fishing + combat soft stats.
 *
 * @see https://objectstore.grudge-studio.com/api/v1/professions.json
 */

/**
 * @typedef {'red'|'green'|'blue'} MealColor
 * @typedef {object} MealDef
 * @property {string} id
 * @property {string} label
 * @property {MealColor} color
 * @property {string} blurb
 * @property {number} durationSec
 * @property {string[]} needs  ingredient tags
 * @property {Record<string, number>} buffs  flat or mul keys
 * @property {number} [tier]
 */

/** @type {readonly MealDef[]} */
export const MEAL_RECIPES = Object.freeze([
  // —— Blue (ocean / fish) ——
  {
    id: 'meal_fish_stew',
    label: 'Fish Stew',
    color: 'blue',
    blurb: 'SWG-style blue food · mana regen + light spell power',
    durationSec: 900,
    tier: 1,
    needs: ['raw_fish', 'herb'],
    buffs: { manaRegenMul: 1.15, spellDamageMul: 1.05, nauticalSpeedMul: 1.03 }
  },
  {
    id: 'meal_salmon_broth',
    label: 'Salmon Broth',
    color: 'blue',
    blurb: 'Blue · spell speed + nautical',
    durationSec: 1200,
    tier: 2,
    needs: ['raw_fish', 'vegetables'],
    buffs: { spellSpeedMul: 1.08, manaPoolMul: 1.06, nauticalSpeedMul: 1.05 }
  },
  {
    id: 'meal_tuna_curry',
    label: 'Tuna Curry',
    color: 'blue',
    blurb: 'Blue · spell crit + resist + nautical',
    durationSec: 1500,
    tier: 3,
    needs: ['raw_fish', 'spice'],
    buffs: { spellCritMul: 1.1, resistMul: 1.05, nauticalSpeedMul: 1.08 }
  },
  {
    id: 'meal_moonfish_soup',
    label: 'Moonfish Soup',
    color: 'blue',
    blurb: 'Blue epic · strong mana + nautical tide',
    durationSec: 1800,
    tier: 4,
    needs: ['raw_fish', 'pearl'],
    buffs: { manaRegenMul: 1.25, spellDamageMul: 1.12, nauticalSpeedMul: 1.12 }
  },
  // —— Red (land meat — chef path; fish can substitute lightly) ——
  {
    id: 'meal_grilled_filet',
    label: 'Grilled Filet',
    color: 'red',
    blurb: 'Red food · HP regen + attack',
    durationSec: 900,
    tier: 1,
    needs: ['raw_fish', 'fuel'],
    buffs: { healthRegenMul: 1.12, attackDamageMul: 1.06, maxHealthMul: 1.04 }
  },
  {
    id: 'meal_piranha_seared',
    label: 'Seared Piranha',
    color: 'red',
    blurb: 'Red · attack + counter',
    durationSec: 1200,
    tier: 2,
    needs: ['raw_fish', 'fuel'],
    buffs: { attackDamageMul: 1.1, counterMul: 1.08, defenseMul: 1.04 }
  },
  // —— Green (plants / stamina — light fisher travel food) ——
  {
    id: 'meal_shore_salad',
    label: 'Shore Salad',
    color: 'green',
    blurb: 'Green · stamina + move (not fish-exclusive)',
    durationSec: 900,
    tier: 1,
    needs: ['herb', 'vegetables'],
    buffs: { staminaMul: 1.12, moveSpeedMul: 1.06, attackSpeedMul: 1.03 }
  },
  {
    id: 'meal_seaweed_wrap',
    label: 'Seaweed Wrap',
    color: 'green',
    blurb: 'Green · move + armor',
    durationSec: 1200,
    tier: 2,
    needs: ['herb', 'shellfish'],
    buffs: { moveSpeedMul: 1.1, armorMul: 1.06, staminaMul: 1.08 }
  }
]);

/**
 * Active meal slots — one per color (SWG / fleet chef rule).
 * @typedef {{ red: MealDef|null, green: MealDef|null, blue: MealDef|null, expires: Record<string, number> }} MealSlots
 */

export function emptyMealSlots() {
  return {
    red: null,
    green: null,
    blue: null,
    /** @type {Record<string, number>} color → expire elapsed time */
    expires: { red: 0, green: 0, blue: 0 }
  };
}

/**
 * Eat meal into its color slot (replaces previous of same color).
 * @param {MealSlots} slots
 * @param {MealDef} meal
 * @param {number} nowElapsed
 */
export function applyMeal(slots, meal, nowElapsed) {
  const c = meal.color;
  slots[c] = meal;
  slots.expires[c] = nowElapsed + (meal.durationSec || 900);
  return slots;
}

/**
 * Clear expired meals.
 * @param {MealSlots} slots
 * @param {number} nowElapsed
 */
export function tickMeals(slots, nowElapsed) {
  for (const c of ['red', 'green', 'blue']) {
    if (slots[c] && (slots.expires[c] || 0) <= nowElapsed) {
      slots[c] = null;
      slots.expires[c] = 0;
    }
  }
  return slots;
}

/**
 * Combined buffs from all three slots (multiplicative for *Mul keys).
 * @param {MealSlots} slots
 */
export function sumMealBuffs(slots) {
  /** @type {Record<string, number>} */
  const out = {};
  for (const c of ['red', 'green', 'blue']) {
    const m = slots[c];
    if (!m?.buffs) continue;
    for (const [k, v] of Object.entries(m.buffs)) {
      if (k.endsWith('Mul')) out[k] = (out[k] || 1) * v;
      else out[k] = (out[k] || 0) + v;
    }
  }
  return out;
}

export function mealById(id) {
  return MEAL_RECIPES.find((m) => m.id === id) || null;
}

/** Blue meals craftable from fish (Fisher's Kitchen tree node) */
export function fishMealRecipes() {
  return MEAL_RECIPES.filter((m) => m.color === 'blue' || m.needs?.includes('raw_fish'));
}
