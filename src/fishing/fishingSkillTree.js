/**
 * Fishing harvest skill tree — Main Panel / ObjectStore gathering alignment.
 *
 * Fleet gathering: Mining · Logging · Skinning · **Fishing** · Herbalism · Scavenging
 * Chef foodSystem: ONE meal each Red / Green / Blue (SWG-style triple buff).
 *
 * Nodes grant: quantity, bite, zone, line, cast, and **nautical speed**.
 *
 * @see https://objectstore.grudge-studio.com/api/v1/professions.json gathering.Fishing
 */

/**
 * @typedef {object} FishTreeNode
 * @property {string} id
 * @property {string} label
 * @property {string} blurb
 * @property {number} x  0..100 tree layout
 * @property {number} y  0..100
 * @property {number} cost  skill points
 * @property {number} requiresLevel
 * @property {string[]} [requires]
 * @property {Record<string, number>} bonuses
 */

/** @type {readonly FishTreeNode[]} */
export const FISHING_SKILL_TREE = Object.freeze([
  {
    id: 'fish_init',
    label: "Fisher's Initiation",
    blurb: 'Unlock shore fishing · common catch',
    x: 50,
    y: 92,
    cost: 0,
    requiresLevel: 1,
    requires: [],
    bonuses: { fishingUnlocked: 1 }
  },
  {
    id: 'fish_qty_1',
    label: 'Double Hook',
    blurb: '+1 fish quantity on catch',
    x: 35,
    y: 78,
    cost: 1,
    requiresLevel: 5,
    requires: ['fish_init'],
    bonuses: { catchQty: 1 }
  },
  {
    id: 'fish_bite_1',
    label: 'Patient Angler',
    blurb: '+15% bite rate',
    x: 65,
    y: 78,
    cost: 1,
    requiresLevel: 5,
    requires: ['fish_init'],
    bonuses: { biteMul: 1.15 }
  },
  {
    id: 'fish_zone_1',
    label: 'Wider Reel',
    blurb: '+8% fight zone width',
    x: 50,
    y: 64,
    cost: 1,
    requiresLevel: 10,
    requires: ['fish_qty_1', 'fish_bite_1'],
    bonuses: { zoneMul: 1.08 }
  },
  {
    id: 'nautical_1',
    label: 'Sea Legs I',
    blurb: '+5% nautical speed (windsurf / boat / swim)',
    x: 22,
    y: 64,
    cost: 1,
    requiresLevel: 10,
    requires: ['fish_init'],
    bonuses: { nauticalSpeedMul: 1.05 }
  },
  {
    id: 'fish_line_1',
    label: 'Braided Line',
    blurb: '+10% line strength',
    x: 78,
    y: 64,
    cost: 1,
    requiresLevel: 12,
    requires: ['fish_bite_1'],
    bonuses: { lineMul: 1.1 }
  },
  {
    id: 'fish_qty_2',
    label: 'Net Haul',
    blurb: '+1 quantity (stack)',
    x: 35,
    y: 48,
    cost: 2,
    requiresLevel: 20,
    requires: ['fish_zone_1'],
    bonuses: { catchQty: 1 }
  },
  {
    id: 'nautical_2',
    label: 'Sea Legs II',
    blurb: '+8% nautical speed',
    x: 22,
    y: 48,
    cost: 2,
    requiresLevel: 20,
    requires: ['nautical_1'],
    bonuses: { nauticalSpeedMul: 1.08 }
  },
  {
    id: 'fish_rare_1',
    label: 'Lucky Tide',
    blurb: '+20% rare+ weight',
    x: 65,
    y: 48,
    cost: 2,
    requiresLevel: 22,
    requires: ['fish_line_1'],
    bonuses: { rareBias: 1.2 }
  },
  {
    id: 'fish_meal_link',
    label: "Fisher's Kitchen",
    blurb: 'Unlock fish meal crafts (Blue food slot)',
    x: 50,
    y: 34,
    cost: 2,
    requiresLevel: 25,
    requires: ['fish_qty_2', 'fish_rare_1'],
    bonuses: { mealCraft: 1 }
  },
  {
    id: 'nautical_3',
    label: 'Tide Runner',
    blurb: '+10% nautical · freeride focus',
    x: 22,
    y: 34,
    cost: 2,
    requiresLevel: 30,
    requires: ['nautical_2'],
    bonuses: { nauticalSpeedMul: 1.1 }
  },
  {
    id: 'fish_master',
    label: 'Grandmaster Angler',
    blurb: '+2 qty · +12% zone · legendary bias',
    x: 50,
    y: 18,
    cost: 3,
    requiresLevel: 50,
    requires: ['fish_meal_link', 'nautical_3'],
    bonuses: { catchQty: 2, zoneMul: 1.12, rareBias: 1.35, legendaryBias: 1.25 }
  }
]);

/**
 * Sum bonuses from unlocked node ids.
 * @param {string[]} unlocked
 */
export function sumTreeBonuses(unlocked = []) {
  const set = new Set(unlocked);
  /** @type {Record<string, number>} */
  const out = {
    catchQty: 0,
    biteMul: 1,
    zoneMul: 1,
    lineMul: 1,
    rareBias: 1,
    legendaryBias: 1,
    nauticalSpeedMul: 1,
    mealCraft: 0,
    fishingUnlocked: 0
  };
  for (const n of FISHING_SKILL_TREE) {
    if (!set.has(n.id)) continue;
    for (const [k, v] of Object.entries(n.bonuses || {})) {
      if (k.endsWith('Mul') || k.endsWith('Bias')) out[k] = (out[k] || 1) * v;
      else out[k] = (out[k] || 0) + v;
    }
  }
  return out;
}

export function treeNodeById(id) {
  return FISHING_SKILL_TREE.find((n) => n.id === id) || null;
}

/** Can unlock node given level + already unlocked */
export function canUnlockNode(node, level, unlocked) {
  if (!node) return false;
  if (unlocked.includes(node.id)) return false;
  if (level < node.requiresLevel) return false;
  return (node.requires || []).every((r) => unlocked.includes(r));
}
