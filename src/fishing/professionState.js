/**
 * Lab profession progress for Fishing (+ meal slots).
 * Local SSOT for Casting; Main Panel / Railway own production character later.
 *
 * Storage: localStorage grudge.casting.fishing.profession.v1
 */

import { FISHING_SKILL_TREE, sumTreeBonuses, canUnlockNode } from './fishingSkillTree.js';
import {
  emptyMealSlots,
  applyMeal,
  tickMeals,
  sumMealBuffs,
  mealById
} from './mealBuffs.js';
import { resolveRodMods, rodById } from './fishingRodTypes.js';

const STORAGE_KEY = 'grudge.casting.fishing.profession.v1';

/**
 * @typedef {object} FishingProfessionState
 * @property {number} level 1..100
 * @property {number} xp
 * @property {number} skillPoints
 * @property {string[]} unlocked
 * @property {string} poleId
 * @property {string} lureId
 * @property {import('./mealBuffs.js').MealSlots} meals
 */

export function defaultProfessionState() {
  return {
    level: 1,
    xp: 0,
    skillPoints: 1,
    unlocked: ['fish_init'],
    poleId: 't0-fishing-pole',
    lureId: 'lure_basic',
    meals: emptyMealSlots()
  };
}

export function loadProfessionState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultProfessionState();
    const j = JSON.parse(raw);
    return {
      ...defaultProfessionState(),
      ...j,
      unlocked: Array.isArray(j.unlocked) ? j.unlocked : ['fish_init'],
      meals: j.meals || emptyMealSlots()
    };
  } catch {
    return defaultProfessionState();
  }
}

export function saveProfessionState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* private mode */
  }
  return state;
}

/** Simple XP curve aligned with fleet xpTable milestones */
export function xpToNext(level) {
  if (level >= 100) return Infinity;
  return Math.floor(80 * level + 20 * level * level * 0.15);
}

/**
 * @param {FishingProfessionState} state
 * @param {number} amount
 */
export function grantFishingXp(state, amount) {
  state.xp += Math.max(0, amount);
  let guard = 0;
  while (state.level < 100 && state.xp >= xpToNext(state.level) && guard++ < 20) {
    state.xp -= xpToNext(state.level);
    state.level += 1;
    state.skillPoints += 1;
  }
  return saveProfessionState(state);
}

/**
 * @param {FishingProfessionState} state
 * @param {string} nodeId
 */
export function unlockTreeNode(state, nodeId) {
  const node = FISHING_SKILL_TREE.find((n) => n.id === nodeId);
  if (!node || !canUnlockNode(node, state.level, state.unlocked)) return false;
  if (state.skillPoints < node.cost) return false;
  state.skillPoints -= node.cost;
  state.unlocked.push(nodeId);
  saveProfessionState(state);
  return true;
}

/**
 * Combined combat/fishing modifiers from tree + meals + rod.
 * @param {FishingProfessionState} state
 * @param {number} [elapsed]
 */
export function resolveProfessionMods(state, elapsed = 0) {
  tickMeals(state.meals, elapsed);
  const tree = sumTreeBonuses(state.unlocked);
  const meals = sumMealBuffs(state.meals);
  const rod = rodById(state.poleId);
  const rodMods = resolveRodMods(rod, []);

  const mul = (a, b) => (a || 1) * (b || 1);
  return {
    level: state.level,
    poleId: state.poleId,
    lureId: state.lureId,
    rod,
    rodMods,
    tree,
    meals,
    catchQty: 1 + (tree.catchQty || 0),
    biteMul: mul(tree.biteMul, 1),
    zoneMul: mul(tree.zoneMul, rodMods.power),
    lineMul: mul(tree.lineMul, 1),
    rareBias: mul(tree.rareBias, rodMods.rareBias),
    legendaryBias: tree.legendaryBias || 1,
    nauticalSpeedMul:
      mul(tree.nauticalSpeedMul, 1) *
      mul(meals.nauticalSpeedMul, 1) *
      (rodMods.nauticalSpeedMul || 1),
    moveSpeedMul: meals.moveSpeedMul || 1,
    mealBuffs: meals,
    mealCraft: !!tree.mealCraft
  };
}

/**
 * @param {FishingProfessionState} state
 * @param {string} mealId
 * @param {number} elapsed
 */
export function eatMeal(state, mealId, elapsed) {
  const meal = mealById(mealId);
  if (!meal) return false;
  applyMeal(state.meals, meal, elapsed);
  saveProfessionState(state);
  return true;
}

export { FISHING_SKILL_TREE, sumTreeBonuses, canUnlockNode, treeNodeById } from './fishingSkillTree.js';
export {
  MEAL_RECIPES,
  MEAL_RECIPES as MEALS,
  mealById,
  fishMealRecipes,
  emptyMealSlots,
  applyMeal,
  tickMeals,
  sumMealBuffs
} from './mealBuffs.js';
export { ROD_TYPES, ROD_ABILITIES, resolveRodMods, rodById, rodsByTier } from './fishingRodTypes.js';
