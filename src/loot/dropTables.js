/**
 * Drop / tier rate SSOT runtime (fleet).
 *
 * Source JSON: info/objectstore api/v1/drop-tables.json
 *
 * TIER POLICY:
 *  - Prefabs exist for T0–T8 (full icon/model/world presentation).
 *  - NATURAL loot (mobs, common chests, harvest) max tier = 5.
 *  - T6/T7/T8 are NOT natural drops — only special sources:
 *      player_death (corpse of holder), special_chest, dungeon_loot, raid_mythic
 *  - T0 always allowed for materials, potions, foods, thrown.
 *  - playerLevel + difficulty shape natural rates.
 */

export const DROP_TABLES_URL = 'https://info.grudge-studio.com/api/v1/drop-tables.json';
export const DROP_TABLES_MIRROR =
  'https://objectstore.grudge-studio.com/api/v1/drop-tables.json';

/** Absolute catalog max (prefabs / craft / special loot) */
export const CATALOG_MAX_TIER = 8;

/** Natural world loot ceiling (mobs, common chests, harvest, normal bosses) */
export const NATURAL_MAX_DROP_TIER = 5;

/** Mythic+ — full prefab pattern, not natural RNG */
export const MYTHIC_TIERS = Object.freeze([6, 7, 8]);

/** @deprecated use NATURAL_MAX_DROP_TIER — kept for callers that still import MAX_DROP_TIER */
export const MAX_DROP_TIER = NATURAL_MAX_DROP_TIER;

/** @deprecated natural ban only — special sources may roll these */
export const BANNED_DROP_TIERS = MYTHIC_TIERS;

/** Sources that may include T6–T8 (still rate-limited) */
export const MYTHIC_ALLOWED_SOURCES = Object.freeze([
  'player_death',
  'special_chest',
  'dungeon_loot',
  'dungeon_boss',
  'raid_mythic',
  'event_reward'
]);

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

const SOFT_BY_MAX = {
  1: { 0: 55, 1: 45 },
  2: { 0: 35, 1: 40, 2: 25 },
  3: { 0: 25, 1: 32, 2: 28, 3: 15 },
  4: { 0: 18, 1: 26, 2: 28, 3: 18, 4: 10 },
  5: { 0: 14, 1: 22, 2: 26, 3: 20, 4: 12, 5: 6 },
  // Special-source soft curves (include mythic tails)
  6: { 0: 10, 1: 16, 2: 20, 3: 18, 4: 14, 5: 12, 6: 10 },
  7: { 0: 8, 1: 12, 2: 16, 3: 16, 4: 14, 5: 14, 6: 12, 7: 8 },
  8: { 0: 6, 1: 10, 2: 14, 3: 14, 4: 14, 5: 14, 6: 12, 7: 10, 8: 6 }
};

const DISTANCE_DECAY = 0.55;

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

export const DROP_SOURCES = Object.freeze({
  mob_trash: {
    rolls: [0, 2],
    emptyChance: 0.35,
    defaultDifficulty: 'easy',
    maxTierCap: NATURAL_MAX_DROP_TIER,
    allowMythic: false,
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
    maxTierCap: NATURAL_MAX_DROP_TIER,
    allowMythic: false,
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
    maxTierCap: NATURAL_MAX_DROP_TIER,
    allowMythic: false,
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
    maxTierCap: NATURAL_MAX_DROP_TIER,
    allowMythic: false,
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
    maxTierCap: NATURAL_MAX_DROP_TIER,
    allowMythic: false,
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
    maxTierCap: NATURAL_MAX_DROP_TIER,
    allowMythic: false,
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
    maxTierCap: NATURAL_MAX_DROP_TIER,
    allowMythic: false,
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
    maxTierCap: NATURAL_MAX_DROP_TIER,
    allowMythic: false,
    categories: { materials: 85, foods: 10, junk: 5 },
    t0Boost: 1.5
  },

  /* ── Special: may include T6–T8 (prefab systems fully supported) ── */

  /** Corpse of player — drops what they held (any tier including T6–8) */
  player_death: {
    rolls: [0, 0],
    emptyChance: 0,
    defaultDifficulty: 'normal',
    maxTierCap: CATALOG_MAX_TIER,
    allowMythic: true,
    allowHeldGear: true,
    categories: {
      weapons: 40,
      armor: 40,
      materials: 10,
      potions: 5,
      foods: 5
    },
    notes: 'Primary path: spill equipped/bag items as-is. Optional fill rolls use mythic-capable weights.'
  },
  special_chest: {
    rolls: [3, 6],
    emptyChance: 0,
    defaultDifficulty: 'elite',
    maxTierCap: CATALOG_MAX_TIER,
    allowMythic: true,
    mythicChance: 0.08,
    categories: {
      weapons: 30,
      armor: 28,
      materials: 12,
      potions: 14,
      thrown: 8,
      foods: 6,
      junk: 2
    },
    guaranteed: [{ category: 'materials', tier: 0, qty: [2, 4] }]
  },
  dungeon_loot: {
    rolls: [2, 5],
    emptyChance: 0.05,
    defaultDifficulty: 'hard',
    maxTierCap: CATALOG_MAX_TIER,
    allowMythic: true,
    mythicChance: 0.05,
    categories: {
      weapons: 26,
      armor: 24,
      materials: 16,
      potions: 14,
      thrown: 10,
      foods: 8,
      junk: 2
    }
  },
  dungeon_boss: {
    rolls: [4, 7],
    emptyChance: 0,
    defaultDifficulty: 'boss',
    maxTierCap: CATALOG_MAX_TIER,
    allowMythic: true,
    mythicChance: 0.12,
    categories: {
      weapons: 32,
      armor: 28,
      materials: 12,
      potions: 12,
      thrown: 8,
      foods: 6,
      junk: 2
    },
    guaranteed: [
      { category: 'materials', tier: 0, qty: [3, 6] },
      { category: 'potions', tier: 0, qty: [1, 3] }
    ]
  },
  raid_mythic: {
    rolls: [5, 9],
    emptyChance: 0,
    defaultDifficulty: 'raid',
    maxTierCap: CATALOG_MAX_TIER,
    allowMythic: true,
    mythicChance: 0.18,
    categories: {
      weapons: 34,
      armor: 30,
      materials: 12,
      potions: 10,
      thrown: 8,
      foods: 4,
      junk: 2
    },
    guaranteed: [
      { category: 'materials', tier: 0, qty: [4, 10] },
      { category: 'potions', tier: 0, qty: [2, 5] }
    ]
  },
  event_reward: {
    rolls: [1, 3],
    emptyChance: 0,
    defaultDifficulty: 'elite',
    maxTierCap: CATALOG_MAX_TIER,
    allowMythic: true,
    mythicChance: 0.1,
    categories: {
      weapons: 30,
      armor: 30,
      materials: 15,
      potions: 15,
      foods: 10
    }
  }
});

export function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

export function isMythicSource(sourceId) {
  return MYTHIC_ALLOWED_SOURCES.includes(sourceId);
}

export function isNaturalSource(sourceId) {
  return !isMythicSource(sourceId);
}

/**
 * Max natural drop tier from player level (never > 5).
 * @param {number} playerLevel
 */
export function maxTierFromPlayerLevel(playerLevel) {
  const lv = clamp(Number(playerLevel) || 1, 1, 999);
  if (lv < 10) return 1;
  if (lv < 20) return 2;
  if (lv < 30) return 3;
  if (lv < 40) return 4;
  return NATURAL_MAX_DROP_TIER;
}

export function effectiveLevel(playerLevel, difficulty = 'normal') {
  const d = typeof difficulty === 'string' ? DIFFICULTY[difficulty] : difficulty;
  const bias = d?.levelBias ?? 0;
  return clamp((Number(playerLevel) || 1) + bias, 1, 70);
}

/**
 * Max tier for a given source (natural ≤5, special ≤8).
 * @param {number} playerLevel
 * @param {DifficultyId|object} difficulty
 * @param {string} [sourceId]
 */
export function maxDropTier(playerLevel, difficulty = 'normal', sourceId = 'mob_normal') {
  const src = DROP_SOURCES[sourceId];
  const el = effectiveLevel(playerLevel, difficulty);
  const fromLevel = maxTierFromPlayerLevel(el);
  if (src?.allowMythic) {
    // Special: allow up to 8, but soft-scale by level (T6 at high level, T8 rare)
    const specialCap = src.maxTierCap ?? CATALOG_MAX_TIER;
    const mythicUnlock = el >= 45 ? 6 : NATURAL_MAX_DROP_TIER;
    const t7 = el >= 55 ? 7 : mythicUnlock;
    const t8 = el >= 65 ? 8 : t7;
    return Math.min(specialCap, Math.max(fromLevel, Math.min(t8, specialCap)));
  }
  return Math.min(NATURAL_MAX_DROP_TIER, fromLevel, src?.maxTierCap ?? NATURAL_MAX_DROP_TIER);
}

export function targetDropTier(playerLevel, difficulty = 'normal', sourceId = 'mob_normal') {
  const el = effectiveLevel(playerLevel, difficulty);
  const maxT = maxDropTier(playerLevel, difficulty, sourceId);
  return clamp(Math.floor((el - 1) / 10), 0, maxT);
}

/**
 * @param {number} playerLevel
 * @param {DifficultyId|object} difficulty
 * @param {string} category
 * @param {{ t0Boost?: number, sourceId?: string }} [opts]
 */
export function tierWeights(playerLevel, difficulty = 'normal', category = 'materials', opts = {}) {
  const d = typeof difficulty === 'string' ? DIFFICULTY[difficulty] : difficulty || DIFFICULTY.normal;
  const sourceId = opts.sourceId || 'mob_normal';
  const maxT = maxDropTier(playerLevel, d, sourceId);
  const target = targetDropTier(playerLevel, d, sourceId);
  const soft = SOFT_BY_MAX[maxT] || SOFT_BY_MAX[5];
  const src = DROP_SOURCES[sourceId];
  /** @type {Record<number, number>} */
  const w = {};

  for (let t = 0; t <= maxT; t++) {
    // Natural sources never weight T6–8
    if (!src?.allowMythic && MYTHIC_TIERS.includes(t)) continue;

    let wt = soft[t] ?? 1;
    const dist = Math.abs(t - target);
    wt *= Math.pow(DISTANCE_DECAY, dist);
    if (t >= 3 && t <= 5) wt *= d.rareMul ?? 1;
    // Mythic tail: rare even on special sources
    if (MYTHIC_TIERS.includes(t)) {
      const mc = src?.mythicChance ?? 0.05;
      wt *= mc * (t === 6 ? 1.0 : t === 7 ? 0.55 : 0.3);
    }
    if (t === 0) {
      const floor = T0_FLOOR[category] ?? 0.1;
      let t0m = (d.t0WeightMul ?? 1) * (1 + floor);
      if (opts.t0Boost) t0m *= opts.t0Boost;
      if (T0_CATEGORIES.includes(category)) t0m = Math.max(t0m, 1 + floor);
      wt *= t0m;
    }
    w[t] = Math.max(0.001, wt);
  }
  return w;
}

export function pickTier(weights, rng = Math.random) {
  const entries = Object.entries(weights)
    .map(([t, w]) => [Number(t), w])
    .filter(([t, w]) => t >= 0 && t <= CATALOG_MAX_TIER && w > 0);
  const sum = entries.reduce((a, [, w]) => a + w, 0);
  if (sum <= 0) return 0;
  let r = rng() * sum;
  for (const [t, w] of entries) {
    r -= w;
    if (r <= 0) return t;
  }
  return entries[entries.length - 1][0];
}

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
 * Roll loot. Natural sources never emit T6–8. Special sources may.
 * @param {{
 *   source: keyof typeof DROP_SOURCES,
 *   playerLevel: number,
 *   difficulty?: DifficultyId,
 *   heldItems?: object[],
 *   rng?: () => number
 * }} opts
 */
export function rollLoot(opts) {
  const sourceId = opts.source || 'mob_normal';
  const src = DROP_SOURCES[sourceId];
  if (!src) throw new Error(`Unknown drop source: ${sourceId}`);

  const difficultyId = opts.difficulty || src.defaultDifficulty || 'normal';
  const d = DIFFICULTY[difficultyId] || DIFFICULTY.normal;
  const playerLevel = clamp(Number(opts.playerLevel) || 1, 1, 999);
  const rng = opts.rng || Math.random;
  const maxT = maxDropTier(playerLevel, d, sourceId);
  const target = targetDropTier(playerLevel, d, sourceId);
  const allowMythic = !!src.allowMythic;

  /** @type {object[]} */
  const drops = [];

  // Player death: spill held gear first (any tier, full prefab identity)
  if (src.allowHeldGear && Array.isArray(opts.heldItems)) {
    for (const held of opts.heldItems) {
      const tier = clamp(Number(held.tier) ?? 0, 0, CATALOG_MAX_TIER);
      drops.push({
        category: held.category || 'weapons',
        tier,
        qty: held.qty || 1,
        sourceId,
        fromPlayerDeath: true,
        itemId: held.id || held.itemId || null,
        uuid: held.uuid || null,
        name: held.name || null,
        iconUrl: held.iconUrl || null,
        modelUrl: held.modelUrl || null,
        present: held
      });
    }
  }

  if (rng() < (src.emptyChance || 0) && !drops.length) {
    return emptyResult(sourceId, difficultyId, playerLevel, d, maxT, target, allowMythic, true);
  }

  const [rmin, rmax] = src.rolls;
  let n = rmin === 0 && rmax === 0 ? 0 : randInt(rmin, rmax, rng);
  n = Math.max(0, Math.round(n * (d.qtyMul || 1)));

  for (let i = 0; i < n; i++) {
    const category = pickWeightedKey(src.categories, rng) || 'materials';
    const weights = tierWeights(playerLevel, d, category, {
      t0Boost: src.t0Boost,
      sourceId
    });
    let tier = pickTier(weights, rng);
    tier = clamp(tier, 0, maxT);

    // Enforce natural ban even if weights misconfigured
    if (!allowMythic && MYTHIC_TIERS.includes(tier)) {
      tier = NATURAL_MAX_DROP_TIER;
    }

    drops.push({
      category,
      tier,
      qty: 1,
      sourceId,
      mythic: MYTHIC_TIERS.includes(tier),
      itemId: null,
      name: null
    });
  }

  for (const g of src.guaranteed || []) {
    const qty = Array.isArray(g.qty) ? randInt(g.qty[0], g.qty[1], rng) : g.qty || 1;
    let tier = g.tier ?? 0;
    if (!allowMythic && MYTHIC_TIERS.includes(tier)) tier = 0;
    if (tier > maxT) tier = Math.min(tier, maxT);
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
      allowMythic,
      naturalMaxTier: NATURAL_MAX_DROP_TIER,
      catalogMaxTier: CATALOG_MAX_TIER,
      mythicTiers: MYTHIC_TIERS.slice(),
      empty: drops.length === 0
    }
  };
}

function emptyResult(sourceId, difficultyId, playerLevel, d, maxT, target, allowMythic, empty) {
  return {
    drops: [],
    meta: {
      sourceId,
      difficultyId,
      playerLevel,
      effectiveLevel: effectiveLevel(playerLevel, d),
      maxTier: maxT,
      targetTier: target,
      allowMythic,
      naturalMaxTier: NATURAL_MAX_DROP_TIER,
      catalogMaxTier: CATALOG_MAX_TIER,
      mythicTiers: MYTHIC_TIERS.slice(),
      empty
    }
  };
}

/**
 * Natural loot: reject T6–8. Special: allow 0–8.
 * @param {number} tier
 * @param {string} [sourceId]
 */
export function assertDropTierLegal(tier, sourceId = 'mob_normal') {
  const t = Number(tier);
  if (t < 0 || t > CATALOG_MAX_TIER) {
    throw new Error(`Illegal tier ${t}: catalog is T0–T8`);
  }
  if (!isMythicSource(sourceId) && MYTHIC_TIERS.includes(t)) {
    throw new Error(
      `Illegal natural drop tier ${t}: T6–T8 only from player_death / special_chest / dungeon / raid_mythic`
    );
  }
  return true;
}

/**
 * Spill equipped + bag items on player death (any tier keeps prefab systems).
 * @param {object[]} heldItems
 * @param {{ playerLevel?: number }} [opts]
 */
export function rollPlayerDeathDrops(heldItems, opts = {}) {
  return rollLoot({
    source: 'player_death',
    playerLevel: opts.playerLevel ?? 1,
    difficulty: 'normal',
    heldItems: heldItems || []
  });
}

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
