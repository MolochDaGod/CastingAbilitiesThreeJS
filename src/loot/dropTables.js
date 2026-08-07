/**
 * Drop / tier rate SSOT runtime (fleet).
 *
 * Source JSON: info/objectstore api/v1/drop-tables.json
 * Local embed matches ObjectStore docs/DROP_TABLES_SSOT.md
 *
 * HARD:
 *  - Never drop tier 6, 7, or 8
 *  - Max drop tier = 5
 *  - T0 allowed/required for materials, potions, foods, thrown
 *  - playerLevel + difficulty shape rates
 */

export const DROP_TABLES_URL = 'https://info.grudge-studio.com/api/v1/drop-tables.json';
export const DROP_TABLES_MIRROR =
  'https://objectstore.grudge-studio.com/api/v1/drop-tables.json';

/** Hard cap — never raise without product decision */
export const MAX_DROP_TIER = 5;
export const BANNED_DROP_TIERS = Object.freeze([6, 7, 8]);

/** @typedef {'trivial'|'easy'|'normal'|'hard'|'elite'|'boss'|'raid'} DifficultyId */

export const DIFFICULTY = Object.freeze({
  trivial: { id: 'trivial', levelBias: -8, qtyMul: 0.7, rareMul: 0.35, t0WeightMul: 1.6 },
  easy: { id: 'easy', levelBias: -4, qtyMul: 0.85, rareMul: 0.6, t0WeightMul: 1.3 },
  normal: { id: 'normal', levelBias: 0, qtyMul: 1.0, rareMul: 1.0, t0WeightMul: 1.0 },
  hard: { id: 'hard', levelBias: 6, qtyMul: 1.15, rareMul: 1.45, t0WeightMul: 0.85 },
  elite: { id: 'elite', levelBias: 12, qtyMul: 1.35, rareMul: 1.9, t0WeightMul: 0.7 },
  boss: { id: 'boss', levelBias: 18, qtyMul: 1.6, rareMul: 2.4, t0WeightMul: 0.55 },
  raid: { id: 'raid', levelBias: 24, qtyMul: 2.0, rareMul: 3.0, t0WeightMul: 0.4 }
});

/** Soft target weight tables by maxTier */
const SOFT_BY_MAX = {
  1: { 0: 55, 1: 45 },
  2: { 0: 35, 1: 40, 2: 25 },
  3: { 0: 25, 1: 32, 2: 28, 3: 15 },
  4: { 0: 18, 1: 26, 2: 28, 3: 18, 4: 10 },
  5: { 0: 14, 1: 22, 2: 26, 3: 20, 4: 12, 5: 6 }
};

const DISTANCE_DECAY = 0.55;

/** Categories that always keep a T0 floor */
export const T0_CATEGORIES = Object.freeze([
  'materials',
  'potions',
  'foods',
  'thrown',
  'consumables',
  'junk'
]);

const T0_FLOOR = {
  materials: 0.2,
  potions: 0.25,
  foods: 0.3,
  thrown: 0.22,
  consumables: 0.25,
  junk: 0.5,
  weapons: 0.08,
  armor: 0.08
};

/** Source templates (weights + rolls) */
export const DROP_SOURCES = Object.freeze({
  mob_trash: {
    rolls: [0, 2],
    emptyChance: 0.35,
    defaultDifficulty: 'easy',
    categories: {
      junk: 35,
      materials: 30,
      foods: 15,
      potions: 10,
      thrown: 8,
      weapons: 1,
      armor: 1
    }
  },
  mob_normal: {
    rolls: [1, 3],
    emptyChance: 0.15,
    defaultDifficulty: 'normal',
    categories: {
      materials: 28,
      foods: 16,
      potions: 14,
      thrown: 12,
      junk: 12,
      weapons: 10,
      armor: 8
    }
  },
  mob_elite: {
    rolls: [2, 4],
    emptyChance: 0.05,
    defaultDifficulty: 'elite',
    categories: {
      materials: 20,
      potions: 16,
      thrown: 12,
      foods: 10,
      weapons: 22,
      armor: 18,
      junk: 2
    }
  },
  chest_common: {
    rolls: [2, 4],
    emptyChance: 0,
    defaultDifficulty: 'normal',
    categories: {
      materials: 25,
      foods: 20,
      potions: 20,
      thrown: 15,
      weapons: 10,
      armor: 8,
      junk: 2
    }
  },
  chest_uncommon: {
    rolls: [3, 5],
    emptyChance: 0,
    defaultDifficulty: 'hard',
    categories: {
      materials: 18,
      potions: 18,
      foods: 12,
      thrown: 12,
      weapons: 20,
      armor: 18,
      junk: 2
    }
  },
  boss: {
    rolls: [3, 6],
    emptyChance: 0,
    defaultDifficulty: 'boss',
    categories: {
      weapons: 28,
      armor: 24,
      materials: 16,
      potions: 14,
      thrown: 10,
      foods: 6,
      junk: 2
    },
    guaranteed: [
      { category: 'materials', tier: 0, qty: [2, 5] },
      { category: 'potions', tier: 0, qty: [1, 3] }
    ]
  },
  raid: {
    rolls: [5, 8],
    emptyChance: 0,
    defaultDifficulty: 'raid',
    categories: {
      weapons: 30,
      armor: 28,
      materials: 14,
      potions: 12,
      thrown: 8,
      foods: 6,
      junk: 2
    },
    guaranteed: [
      { category: 'materials', tier: 0, qty: [4, 10] },
      { category: 'foods', tier: 0, qty: [2, 6] },
      { category: 'potions', tier: 0, qty: [2, 5] }
    ]
  },
  harvest_node: {
    rolls: [1, 3],
    emptyChance: 0,
    defaultDifficulty: 'normal',
    categories: { materials: 85, foods: 10, junk: 5 },
    t0Boost: 1.5
  }
});

export function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

/**
 * Max drop tier from player level alone (still capped at 5).
 * @param {number} playerLevel
 */
export function maxTierFromPlayerLevel(playerLevel) {
  const lv = clamp(Number(playerLevel) || 1, 1, 999);
  if (lv < 10) return 1;
  if (lv < 20) return 2;
  if (lv < 30) return 3;
  if (lv < 40) return 4;
  return MAX_DROP_TIER;
}

/**
 * @param {number} playerLevel
 * @param {DifficultyId|object} difficulty
 */
export function effectiveLevel(playerLevel, difficulty = 'normal') {
  const d = typeof difficulty === 'string' ? DIFFICULTY[difficulty] : difficulty;
  const bias = d?.levelBias ?? 0;
  return clamp((Number(playerLevel) || 1) + bias, 1, 70);
}

/**
 * Final max tier for a roll — never 6+.
 * @param {number} playerLevel
 * @param {DifficultyId|object} difficulty
 */
export function maxDropTier(playerLevel, difficulty = 'normal') {
  const el = effectiveLevel(playerLevel, difficulty);
  return Math.min(MAX_DROP_TIER, maxTierFromPlayerLevel(el));
}

/**
 * Soft target tier for weight peak (0..maxTier).
 * @param {number} playerLevel
 * @param {DifficultyId|object} difficulty
 */
export function targetDropTier(playerLevel, difficulty = 'normal') {
  const el = effectiveLevel(playerLevel, difficulty);
  const maxT = maxDropTier(playerLevel, difficulty);
  // ~1 tier per 10 levels
  return clamp(Math.floor((el - 1) / 10), 0, maxT);
}

/**
 * Relative weights for tiers 0..maxTier.
 * @param {number} playerLevel
 * @param {DifficultyId|object} difficulty
 * @param {string} category
 * @param {{ t0Boost?: number }} [opts]
 * @returns {Record<number, number>}
 */
export function tierWeights(playerLevel, difficulty = 'normal', category = 'materials', opts = {}) {
  const d = typeof difficulty === 'string' ? DIFFICULTY[difficulty] : difficulty || DIFFICULTY.normal;
  const maxT = maxDropTier(playerLevel, d);
  const target = targetDropTier(playerLevel, d);
  const soft = SOFT_BY_MAX[maxT] || SOFT_BY_MAX[5];
  /** @type {Record<number, number>} */
  const w = {};

  for (let t = 0; t <= maxT; t++) {
    if (BANNED_DROP_TIERS.includes(t)) continue;
    let wt = soft[t] ?? 1;
    const dist = Math.abs(t - target);
    wt *= Math.pow(DISTANCE_DECAY, dist);
    if (t >= 3) wt *= d.rareMul ?? 1;
    if (t === 0) {
      const floor = T0_FLOOR[category] ?? 0.1;
      let t0m = (d.t0WeightMul ?? 1) * (1 + floor);
      if (opts.t0Boost) t0m *= opts.t0Boost;
      if (T0_CATEGORIES.includes(category)) t0m = Math.max(t0m, 1 + floor);
      wt *= t0m;
    }
    w[t] = Math.max(0.001, wt);
  }
  // Absolute ban
  for (const ban of BANNED_DROP_TIERS) delete w[ban];
  return w;
}

/**
 * Pick tier 0..5 only.
 * @param {Record<number, number>} weights
 * @param {() => number} [rng] 0..1
 */
export function pickTier(weights, rng = Math.random) {
  const entries = Object.entries(weights)
    .map(([t, w]) => [Number(t), w])
    .filter(([t, w]) => t <= MAX_DROP_TIER && t >= 0 && !BANNED_DROP_TIERS.includes(t) && w > 0);
  const sum = entries.reduce((a, [, w]) => a + w, 0);
  if (sum <= 0) return 0;
  let r = rng() * sum;
  for (const [t, w] of entries) {
    r -= w;
    if (r <= 0) return t;
  }
  return entries[entries.length - 1][0];
}

/**
 * @param {Record<string, number>} weights
 * @param {() => number} [rng]
 */
export function pickWeightedKey(weights, rng = Math.random) {
  const entries = Object.entries(weights).filter(([, w]) => w > 0);
  const sum = entries.reduce((a, [, w]) => a + w, 0);
  if (sum <= 0) return null;
  let r = rng() * sum;
  for (const [k, w] of entries) {
    r -= w;
    if (r <= 0) return k;
  }
  return entries[entries.length - 1][0];
}

function randInt(min, max, rng = Math.random) {
  const a = Math.floor(min);
  const b = Math.floor(max);
  return a + Math.floor(rng() * (b - a + 1));
}

/**
 * Roll one loot package.
 * @param {{
 *   source: keyof typeof DROP_SOURCES,
 *   playerLevel: number,
 *   difficulty?: DifficultyId,
 *   rng?: () => number
 * }} opts
 * @returns {{ drops: object[], meta: object }}
 */
export function rollLoot(opts) {
  const sourceId = opts.source || 'mob_normal';
  const src = DROP_SOURCES[sourceId];
  if (!src) throw new Error(`Unknown drop source: ${sourceId}`);

  const difficultyId = opts.difficulty || src.defaultDifficulty || 'normal';
  const d = DIFFICULTY[difficultyId] || DIFFICULTY.normal;
  const playerLevel = clamp(Number(opts.playerLevel) || 1, 1, 999);
  const rng = opts.rng || Math.random;
  const maxT = maxDropTier(playerLevel, d);
  const target = targetDropTier(playerLevel, d);

  /** @type {object[]} */
  const drops = [];

  if (rng() < (src.emptyChance || 0)) {
    return {
      drops: [],
      meta: {
        sourceId,
        difficultyId,
        playerLevel,
        effectiveLevel: effectiveLevel(playerLevel, d),
        maxTier: maxT,
        targetTier: target,
        empty: true
      }
    };
  }

  const [rmin, rmax] = src.rolls;
  let n = randInt(rmin, rmax, rng);
  n = Math.max(0, Math.round(n * (d.qtyMul || 1)));

  for (let i = 0; i < n; i++) {
    const category = pickWeightedKey(src.categories, rng) || 'materials';
    const weights = tierWeights(playerLevel, d, category, { t0Boost: src.t0Boost });
    let tier = pickTier(weights, rng);
    tier = clamp(tier, 0, maxT);
    if (BANNED_DROP_TIERS.includes(tier)) tier = MAX_DROP_TIER; // should never happen
    if (tier > MAX_DROP_TIER) tier = MAX_DROP_TIER;

    drops.push({
      category,
      tier,
      qty: 1,
      sourceId,
      // Resolver fills itemId from catalogs
      itemId: null,
      name: null
    });
  }

  // Guaranteed T0 mats/pots etc.
  for (const g of src.guaranteed || []) {
    const qty = Array.isArray(g.qty) ? randInt(g.qty[0], g.qty[1], rng) : g.qty || 1;
    let tier = g.tier ?? 0;
    if (BANNED_DROP_TIERS.includes(tier) || tier > MAX_DROP_TIER) tier = 0;
    drops.push({
      category: g.category,
      tier,
      qty,
      sourceId,
      guaranteed: true,
      itemId: null,
      name: null
    });
  }

  return {
    drops,
    meta: {
      sourceId,
      difficultyId,
      playerLevel,
      effectiveLevel: effectiveLevel(playerLevel, d),
      maxTier: maxT,
      targetTier: target,
      empty: false,
      bannedTiers: BANNED_DROP_TIERS.slice()
    }
  };
}

/**
 * Assert a tier is legal for drops.
 * @param {number} tier
 */
export function assertDropTierLegal(tier) {
  const t = Number(tier);
  if (BANNED_DROP_TIERS.includes(t) || t > MAX_DROP_TIER) {
    throw new Error(`Illegal drop tier ${t}: max is ${MAX_DROP_TIER}; T6–T8 never drop`);
  }
  return true;
}

/**
 * Optional: fetch remote SSOT (after ObjectStore publish). Falls back to embedded rules.
 */
export async function loadDropTablesRemote() {
  for (const url of [DROP_TABLES_URL, DROP_TABLES_MIRROR]) {
    try {
      const res = await fetch(url, { mode: 'cors' });
      if (!res.ok) continue;
      return await res.json();
    } catch {
      /* next */
    }
  }
  return null;
}
