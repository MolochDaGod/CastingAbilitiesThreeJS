/**
 * Fishing rod types + stats — Grudge Angler / Cute Fish Pack L1–L5 language
 * extended to fleet T0–T8 gathering tiers (ObjectStore professions.Fishing).
 *
 * Stats feed fight bar (power/control/line) + cast range + profession bonuses.
 * Mesh paths: public/models/fish/poles/*
 *
 * @see fishingCatalog.js · docs/FISHING_PROFESSION_SSOT.md
 */

const POLE = './models/fish/poles';

/**
 * @typedef {object} RodTypeDef
 * @property {string} id
 * @property {string} label
 * @property {number} tier 0..8
 * @property {string} meshUrl
 * @property {string} family shore|river|sea|deep|void
 * @property {number} power        reel zone width mul
 * @property {number} control      zone move speed mul
 * @property {number} lineStrength 0..1
 * @property {number} castRangeM
 * @property {number} reelSpeed    progress fill mul when reeling
 * @property {number} biteWindowS  base snag window
 * @property {number} nauticalSpeedMul  freeride/boat/swim bonus when equipped or trained
 * @property {string[]} abilities
 * @property {string} rarity
 * @property {string} blurb
 * @property {number} poleLengthM  SI rod mesh length
 * @property {number} maxSizeRank  0 tiny … 5 titan (size gate)
 * @property {number} maxFishLengthM  hard line limit (m)
 * @property {number} lureSlotTier  max lure tier this rod can seat
 */

/** @type {readonly RodTypeDef[]} */
export const ROD_TYPES = Object.freeze([
  {
    id: 't0-fishing-pole',
    label: 'Novice Stick Pole',
    tier: 0,
    meshUrl: `${POLE}/fishing_rod.glb`,
    family: 'shore',
    power: 1.0,
    control: 1.0,
    lineStrength: 0.5,
    castRangeM: 12,
    reelSpeed: 1.0,
    biteWindowS: 0.7,
    nauticalSpeedMul: 1.0,
    poleLengthM: 1.45,
    maxSizeRank: 1,
    maxFishLengthM: 0.45,
    lureSlotTier: 0,
    abilities: ['steady_hand'],
    rarity: 'common',
    blurb: 'T0 starter · shore · tiny/small only'
  },
  {
    id: 'fishing-pole-t1',
    label: 'Shore Angler T1',
    tier: 1,
    meshUrl: `${POLE}/fishing_rod-0yar0lg58p.glb`,
    family: 'shore',
    power: 1.12,
    control: 1.08,
    lineStrength: 0.58,
    castRangeM: 15,
    reelSpeed: 1.05,
    biteWindowS: 0.78,
    nauticalSpeedMul: 1.02,
    poleLengthM: 1.6,
    maxSizeRank: 2,
    maxFishLengthM: 1.0,
    lureSlotTier: 1,
    abilities: ['steady_hand', 'quick_snag'],
    rarity: 'common',
    blurb: 'Shore · up to medium · spinner lures'
  },
  {
    id: 'fishing-pole-t2',
    label: 'River Angler T2',
    tier: 2,
    meshUrl: `${POLE}/fishing_rod-9aohhrphe7.glb`,
    family: 'river',
    power: 1.25,
    control: 1.18,
    lineStrength: 0.68,
    castRangeM: 18,
    reelSpeed: 1.12,
    biteWindowS: 0.85,
    nauticalSpeedMul: 1.05,
    poleLengthM: 1.75,
    maxSizeRank: 3,
    maxFishLengthM: 2.0,
    lureSlotTier: 2,
    abilities: ['steady_hand', 'quick_snag', 'deep_cast'],
    rarity: 'uncommon',
    blurb: 'River/sea · large game (tuna class)'
  },
  {
    id: 'fishing-pole-t3',
    label: 'Sea Angler T3',
    tier: 3,
    meshUrl: `${POLE}/fishing_rod-aoabqwh68m.glb`,
    family: 'sea',
    power: 1.4,
    control: 1.28,
    lineStrength: 0.78,
    castRangeM: 24,
    reelSpeed: 1.2,
    biteWindowS: 0.9,
    nauticalSpeedMul: 1.08,
    poleLengthM: 1.95,
    maxSizeRank: 4,
    maxFishLengthM: 3.5,
    lureSlotTier: 3,
    abilities: ['steady_hand', 'quick_snag', 'deep_cast', 'iron_line'],
    rarity: 'rare',
    blurb: 'Open sea · dolphin / game shark class'
  },
  {
    id: 'fishing-pole-t4',
    label: 'Deep Sea Rod T4',
    tier: 4,
    meshUrl: `${POLE}/fishing_rod-ldlwqjn9zg.glb`,
    family: 'deep',
    power: 1.55,
    control: 1.35,
    lineStrength: 0.86,
    castRangeM: 30,
    reelSpeed: 1.28,
    biteWindowS: 0.95,
    nauticalSpeedMul: 1.12,
    poleLengthM: 2.15,
    maxSizeRank: 4,
    maxFishLengthM: 5.0,
    lureSlotTier: 4,
    abilities: ['steady_hand', 'quick_snag', 'deep_cast', 'iron_line', 'sea_legs'],
    rarity: 'epic',
    blurb: 'Deep · huge game · heavy + game rig'
  },
  {
    id: 'fishing-pole-t5',
    label: 'Abyss Angler T5',
    tier: 5,
    meshUrl: `${POLE}/fishing_rod-ldlwqjn9zg.glb`,
    family: 'void',
    power: 1.7,
    control: 1.45,
    lineStrength: 0.92,
    castRangeM: 36,
    reelSpeed: 1.35,
    biteWindowS: 1.0,
    nauticalSpeedMul: 1.15,
    poleLengthM: 2.35,
    maxSizeRank: 5,
    maxFishLengthM: 12,
    lureSlotTier: 5,
    abilities: ['steady_hand', 'quick_snag', 'deep_cast', 'iron_line', 'sea_legs', 'void_line'],
    rarity: 'legendary',
    blurb: 'Abyss · titan (whale) · titan hook'
  }
]);

export const ROD_ABILITIES = Object.freeze({
  steady_hand: {
    id: 'steady_hand',
    label: 'Steady Hand',
    blurb: '+12% reel zone',
    zoneMul: 1.12
  },
  quick_snag: {
    id: 'quick_snag',
    label: 'Quick Snag',
    blurb: '+0.12s bite window',
    biteWindowBonus: 0.12
  },
  deep_cast: {
    id: 'deep_cast',
    label: 'Deep Cast',
    blurb: '+20% cast range',
    castRangeMul: 1.2
  },
  iron_line: {
    id: 'iron_line',
    label: 'Iron Line',
    blurb: '+15% line strength',
    lineMul: 1.15
  },
  sea_legs: {
    id: 'sea_legs',
    label: 'Sea Legs',
    blurb: '+6% nautical speed (boat/windsurf/swim)',
    nauticalMul: 1.06
  },
  void_line: {
    id: 'void_line',
    label: 'Void Line',
    blurb: '+10% reel speed · rare+ bite bias',
    reelMul: 1.1,
    rareBias: 1.15
  }
});

export function rodById(id) {
  return ROD_TYPES.find((r) => r.id === id) || ROD_TYPES[0];
}

export function rodsByTier(maxTier = 8) {
  return ROD_TYPES.filter((r) => r.tier <= maxTier);
}

/**
 * Aggregate rod + ability mods for fight / cast.
 * @param {RodTypeDef} rod
 * @param {string[]} [extraAbilities] from skill tree
 */
export function resolveRodMods(rod, extraAbilities = []) {
  const abs = [...(rod.abilities || []), ...extraAbilities];
  let zoneMul = rod.power;
  let castMul = 1;
  let lineMul = 1;
  let biteBonus = 0;
  let reelMul = rod.reelSpeed;
  let nautical = rod.nauticalSpeedMul;
  let rareBias = 1;
  for (const id of abs) {
    const a = ROD_ABILITIES[id];
    if (!a) continue;
    if (a.zoneMul) zoneMul *= a.zoneMul;
    if (a.castRangeMul) castMul *= a.castRangeMul;
    if (a.lineMul) lineMul *= a.lineMul;
    if (a.biteWindowBonus) biteBonus += a.biteWindowBonus;
    if (a.reelMul) reelMul *= a.reelMul;
    if (a.nauticalMul) nautical *= a.nauticalMul;
    if (a.rareBias) rareBias *= a.rareBias;
  }
  return {
    abilities: abs,
    power: zoneMul,
    control: rod.control,
    lineStrength: Math.min(1, rod.lineStrength * lineMul),
    castRangeM: rod.castRangeM * castMul,
    reelSpeed: reelMul,
    biteWindowS: rod.biteWindowS + biteBonus,
    nauticalSpeedMul: nautical,
    rareBias,
    poleLengthM: rod.poleLengthM ?? 1.6,
    maxSizeRank: rod.maxSizeRank ?? 1,
    maxFishLengthM: rod.maxFishLengthM ?? 0.5,
    lureSlotTier: rod.lureSlotTier ?? rod.tier ?? 0
  };
}
