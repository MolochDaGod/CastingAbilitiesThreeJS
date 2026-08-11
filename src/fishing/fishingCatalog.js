/**
 * Fishing profession catalog — poles, lures, fish, buildables.
 *
 * Assets (no root clutter):
 *  - public/models/fish/species/        reef pack (v1)
 *  - public/models/fish/species/large/  game pack (v2 zip) — dolphin, shark, whale…
 *  - public/models/fish/poles|lures|docks
 *
 * SI: each species has lengthM + sizeClass; runtime fit via fishScale.js
 * (longer than tall/wide). Lures/rods gate size class + profession values.
 *
 * @see docs/FISHING_PROFESSION_SSOT.md · fishScale.js · fishingRodTypes.js
 */

import {
  ROD_TYPES,
  ROD_ABILITIES,
  resolveRodMods,
  rodById as rodTypeById
} from './fishingRodTypes.js';
import { sizeRank } from './fishScale.js';

const FISH = './models/fish/species';
const FISH_LG = './models/fish/species/large';
const LURE = './models/fish/lures';
const DOCK = './models/fish/docks';

/**
 * @typedef {object} FishSpecies
 * @property {string} id
 * @property {string} label
 * @property {string} meshUrl
 * @property {'common'|'uncommon'|'rare'|'epic'|'legendary'} rarity
 * @property {[number, number]} weightKg
 * @property {number} lengthM  SI nose→tail (water size)
 * @property {'tiny'|'small'|'medium'|'large'|'huge'|'titan'} sizeClass
 * @property {number} strength
 * @property {number} speed
 * @property {number} stamina
 * @property {number} difficulty
 * @property {number} zoneWidthBase
 * @property {string[]} preferredLures
 * @property {number} value  profession coin / craft value
 * @property {number} [xpMul]
 * @property {number} [minLevel]
 * @property {number} [minRodTier]
 * @property {string} [pack] reef|game
 */

/** @type {readonly FishSpecies[]} */
export const FISH_SPECIES = Object.freeze([
  // —— Reef pack (species/) — SI length for aquarium/shore sizes ——
  { id: 'tetra', label: 'Tetra', meshUrl: `${FISH}/tetra.glb`, pack: 'reef', rarity: 'common', sizeClass: 'tiny', lengthM: 0.08, weightKg: [0.02, 0.1], strength: 0.15, speed: 0.55, stamina: 12, difficulty: 0.15, zoneWidthBase: 0.24, preferredLures: ['worm', 'lure_basic'], value: 2, minLevel: 1, minRodTier: 0 },
  { id: 'goldfish', label: 'Goldfish', meshUrl: `${FISH}/goldfish.glb`, pack: 'reef', rarity: 'common', sizeClass: 'tiny', lengthM: 0.12, weightKg: [0.05, 0.25], strength: 0.2, speed: 0.4, stamina: 14, difficulty: 0.15, zoneWidthBase: 0.24, preferredLures: ['worm'], value: 3, minLevel: 1, minRodTier: 0 },
  { id: 'betta', label: 'Betta', meshUrl: `${FISH}/betta.glb`, pack: 'reef', rarity: 'common', sizeClass: 'tiny', lengthM: 0.1, weightKg: [0.03, 0.12], strength: 0.22, speed: 0.5, stamina: 15, difficulty: 0.2, zoneWidthBase: 0.22, preferredLures: ['lure_basic', 'worm'], value: 5, minLevel: 1, minRodTier: 0 },
  { id: 'clownfish', label: 'Clownfish', meshUrl: `${FISH}/clownfish.glb`, pack: 'reef', rarity: 'common', sizeClass: 'small', lengthM: 0.14, weightKg: [0.1, 0.4], strength: 0.25, speed: 0.45, stamina: 18, difficulty: 0.2, zoneWidthBase: 0.22, preferredLures: ['worm', 'lure_basic'], value: 4, minLevel: 1, minRodTier: 0 },
  { id: 'blue_tang', label: 'Blue Tang', meshUrl: `${FISH}/blue_tang.glb`, pack: 'reef', rarity: 'uncommon', sizeClass: 'small', lengthM: 0.28, weightKg: [0.3, 1.2], strength: 0.4, speed: 0.55, stamina: 22, difficulty: 0.35, zoneWidthBase: 0.18, preferredLures: ['lure_basic', 'lure_spinner'], value: 12, minLevel: 5, minRodTier: 0 },
  { id: 'yellow_tang', label: 'Yellow Tang', meshUrl: `${FISH}/yellow_tang.glb`, pack: 'reef', rarity: 'uncommon', sizeClass: 'small', lengthM: 0.26, weightKg: [0.25, 1.0], strength: 0.38, speed: 0.58, stamina: 20, difficulty: 0.34, zoneWidthBase: 0.18, preferredLures: ['lure_spinner'], value: 11, minLevel: 5, minRodTier: 0 },
  { id: 'puffer', label: 'Puffer', meshUrl: `${FISH}/puffer.glb`, pack: 'reef', rarity: 'uncommon', sizeClass: 'small', lengthM: 0.3, weightKg: [0.4, 1.5], strength: 0.5, speed: 0.3, stamina: 24, difficulty: 0.42, zoneWidthBase: 0.16, preferredLures: ['lure_basic', 'lure_spinner'], value: 15, minLevel: 8, minRodTier: 1 },
  { id: 'piranha', label: 'Piranha', meshUrl: `${FISH}/piranha.glb`, pack: 'reef', rarity: 'rare', sizeClass: 'small', lengthM: 0.35, weightKg: [0.5, 2.0], strength: 0.65, speed: 0.7, stamina: 26, difficulty: 0.55, zoneWidthBase: 0.14, preferredLures: ['lure_spinner', 'lure_deep'], value: 28, minLevel: 12, minRodTier: 1 },
  { id: 'lionfish', label: 'Lionfish', meshUrl: `${FISH}/lionfish.glb`, pack: 'reef', rarity: 'rare', sizeClass: 'small', lengthM: 0.38, weightKg: [0.4, 1.8], strength: 0.55, speed: 0.45, stamina: 30, difficulty: 0.58, zoneWidthBase: 0.13, preferredLures: ['lure_spinner'], value: 36, minLevel: 14, minRodTier: 1 },
  { id: 'koi', label: 'Koi', meshUrl: `${FISH}/koi.glb`, pack: 'reef', rarity: 'uncommon', sizeClass: 'medium', lengthM: 0.65, weightKg: [0.8, 3.5], strength: 0.45, speed: 0.35, stamina: 28, difficulty: 0.4, zoneWidthBase: 0.17, preferredLures: ['worm', 'lure_basic'], value: 18, minLevel: 10, minRodTier: 1 },
  { id: 'red_snapper', label: 'Red Snapper', meshUrl: `${FISH}/red_snapper.glb`, pack: 'reef', rarity: 'rare', sizeClass: 'medium', lengthM: 0.7, weightKg: [1.5, 6], strength: 0.6, speed: 0.5, stamina: 32, difficulty: 0.52, zoneWidthBase: 0.15, preferredLures: ['lure_deep', 'lure_spinner'], value: 32, minLevel: 15, minRodTier: 1 },
  { id: 'tuna', label: 'Tuna', meshUrl: `${FISH}/tuna.glb`, pack: 'reef', rarity: 'rare', sizeClass: 'large', lengthM: 1.6, weightKg: [5, 25], strength: 0.75, speed: 0.65, stamina: 40, difficulty: 0.65, zoneWidthBase: 0.12, preferredLures: ['lure_deep', 'lure_heavy', 'lure_game'], value: 48, xpMul: 1.2, minLevel: 20, minRodTier: 2 },
  { id: 'swordfish', label: 'Swordfish', meshUrl: `${FISH}/swordfish.glb`, pack: 'reef', rarity: 'epic', sizeClass: 'large', lengthM: 2.1, weightKg: [20, 90], strength: 0.88, speed: 0.8, stamina: 55, difficulty: 0.8, zoneWidthBase: 0.1, preferredLures: ['lure_heavy', 'lure_game'], value: 90, xpMul: 1.4, minLevel: 28, minRodTier: 3 },
  { id: 'shark', label: 'Reef Shark', meshUrl: `${FISH}/shark.glb`, pack: 'reef', rarity: 'epic', sizeClass: 'huge', lengthM: 2.6, weightKg: [40, 180], strength: 0.92, speed: 0.7, stamina: 60, difficulty: 0.85, zoneWidthBase: 0.09, preferredLures: ['lure_heavy', 'lure_game'], value: 120, xpMul: 1.5, minLevel: 32, minRodTier: 3 },
  { id: 'goblin_shark', label: 'Goblin Shark', meshUrl: `${FISH}/goblin_shark.glb`, pack: 'reef', rarity: 'legendary', sizeClass: 'huge', lengthM: 2.8, weightKg: [50, 200], strength: 0.95, speed: 0.55, stamina: 70, difficulty: 0.92, zoneWidthBase: 0.08, preferredLures: ['lure_heavy', 'lure_titan'], value: 200, xpMul: 1.8, minLevel: 40, minRodTier: 4 },
  { id: 'anglerfish', label: 'Anglerfish', meshUrl: `${FISH}/anglerfish.glb`, pack: 'reef', rarity: 'legendary', sizeClass: 'large', lengthM: 1.1, weightKg: [8, 40], strength: 0.85, speed: 0.4, stamina: 65, difficulty: 0.9, zoneWidthBase: 0.09, preferredLures: ['lure_deep', 'lure_heavy'], value: 180, xpMul: 1.7, minLevel: 38, minRodTier: 3 },

  // —— Game pack (species/large/) — Animated Fish Bundle zip (1) ——
  { id: 'fish_reef', label: 'Reef Runner', meshUrl: `${FISH_LG}/fish_reef.glb`, pack: 'game', rarity: 'common', sizeClass: 'medium', lengthM: 0.55, weightKg: [0.6, 2.5], strength: 0.42, speed: 0.52, stamina: 24, difficulty: 0.38, zoneWidthBase: 0.17, preferredLures: ['lure_basic', 'lure_spinner', 'worm'], value: 14, minLevel: 8, minRodTier: 1 },
  { id: 'fish_mid', label: 'Open-Water Fish', meshUrl: `${FISH_LG}/fish_mid.glb`, pack: 'game', rarity: 'uncommon', sizeClass: 'medium', lengthM: 0.75, weightKg: [1.2, 5], strength: 0.5, speed: 0.48, stamina: 28, difficulty: 0.45, zoneWidthBase: 0.16, preferredLures: ['lure_spinner', 'lure_deep'], value: 22, minLevel: 12, minRodTier: 1 },
  { id: 'fish_stream', label: 'Streamliner', meshUrl: `${FISH_LG}/fish_stream.glb`, pack: 'game', rarity: 'uncommon', sizeClass: 'medium', lengthM: 0.9, weightKg: [2, 8], strength: 0.55, speed: 0.62, stamina: 30, difficulty: 0.5, zoneWidthBase: 0.15, preferredLures: ['lure_deep', 'lure_spinner'], value: 30, minLevel: 15, minRodTier: 2 },
  { id: 'dolphin', label: 'Dolphin', meshUrl: `${FISH_LG}/dolphin.glb`, pack: 'game', rarity: 'epic', sizeClass: 'huge', lengthM: 2.4, weightKg: [80, 200], strength: 0.82, speed: 0.78, stamina: 52, difficulty: 0.78, zoneWidthBase: 0.1, preferredLures: ['lure_game', 'lure_heavy'], value: 140, xpMul: 1.55, minLevel: 30, minRodTier: 3 },
  { id: 'manta_ray', label: 'Manta Ray', meshUrl: `${FISH_LG}/manta_ray.glb`, pack: 'game', rarity: 'epic', sizeClass: 'huge', lengthM: 2.8, lengthAspect: 1.05, weightKg: [60, 160], strength: 0.8, speed: 0.42, stamina: 58, difficulty: 0.82, zoneWidthBase: 0.095, preferredLures: ['lure_game', 'lure_deep'], value: 155, xpMul: 1.6, minLevel: 34, minRodTier: 3 },
  { id: 'shark_game', label: 'Game Shark', meshUrl: `${FISH_LG}/shark_game.glb`, pack: 'game', rarity: 'legendary', sizeClass: 'huge', lengthM: 3.2, weightKg: [90, 280], strength: 0.94, speed: 0.72, stamina: 68, difficulty: 0.9, zoneWidthBase: 0.085, preferredLures: ['lure_heavy', 'lure_game', 'lure_titan'], value: 220, xpMul: 1.85, minLevel: 42, minRodTier: 4 },
  { id: 'whale', label: 'Whale', meshUrl: `${FISH_LG}/whale.glb`, pack: 'game', rarity: 'legendary', sizeClass: 'titan', lengthM: 8.5, weightKg: [2000, 12000], strength: 0.98, speed: 0.35, stamina: 90, difficulty: 0.97, zoneWidthBase: 0.07, preferredLures: ['lure_titan'], value: 500, xpMul: 2.5, minLevel: 50, minRodTier: 5 }
]);

/**
 * @typedef {object} FishingPoleDef
 */

/** Poles = Grudge Angler rod types */
export const FISHING_POLES = Object.freeze(
  ROD_TYPES.map((r) => ({
    id: r.id,
    label: r.label,
    meshUrl: r.meshUrl,
    tier: r.tier,
    power: r.power,
    control: r.control,
    lineStrength: r.lineStrength,
    castRangeM: r.castRangeM,
    abilities: [...(r.abilities || [])],
    reelSpeed: r.reelSpeed,
    biteWindowS: r.biteWindowS,
    nauticalSpeedMul: r.nauticalSpeedMul,
    family: r.family,
    rarity: r.rarity,
    blurb: r.blurb,
    poleLengthM: r.poleLengthM,
    maxSizeRank: r.maxSizeRank,
    maxFishLengthM: r.maxFishLengthM,
    lureSlotTier: r.lureSlotTier,
    animPack: 'magic',
    weaponType: 'TOOL',
    professions: ['fishing']
  }))
);

/**
 * Lures — sizeClass bias + habitat + profession value.
 * Gameplay: wrong size bait → heavy weight penalty; preferred lure ×1.35.
 *
 * @typedef {object} LureDef
 * @property {string} id
 * @property {string} label
 * @property {string} meshUrl
 * @property {number} biteMul
 * @property {Record<string, number>} rarityBias
 * @property {string[]} sizeClass  which fish sizes this bait attracts
 * @property {number} tier
 * @property {number} meshLengthM  SI bait visual
 * @property {number} value  craft/shop
 * @property {number} [sinkRate] 0..1 deep preference
 * @property {string} blurb
 */
export const FISHING_LURES = Object.freeze([
  {
    id: 'worm',
    label: 'Worm',
    meshUrl: `${LURE}/worm.glb`,
    biteMul: 1.2,
    rarityBias: { common: 1.25 },
    sizeClass: ['tiny', 'small'],
    tier: 0,
    meshLengthM: 0.08,
    value: 1,
    sinkRate: 0.2,
    blurb: 'Shore bait · tiny/small only'
  },
  {
    id: 'lure_basic',
    label: 'Basic Lure',
    meshUrl: `${LURE}/lure.glb`,
    biteMul: 1.0,
    rarityBias: {},
    sizeClass: ['tiny', 'small', 'medium'],
    tier: 0,
    meshLengthM: 0.1,
    value: 3,
    sinkRate: 0.35,
    blurb: 'General shore/reef'
  },
  {
    id: 'lure_spinner',
    label: 'Spinner',
    meshUrl: `${LURE}/lure-2dkfirm95d.glb`,
    biteMul: 1.12,
    rarityBias: { uncommon: 1.35, rare: 1.15 },
    sizeClass: ['small', 'medium'],
    tier: 1,
    meshLengthM: 0.12,
    value: 8,
    sinkRate: 0.4,
    blurb: 'Flash · small–medium predators'
  },
  {
    id: 'lure_deep',
    label: 'Deep Lure',
    meshUrl: `${LURE}/lure-3pcaourgtu.glb`,
    biteMul: 0.95,
    rarityBias: { rare: 1.4, epic: 1.2 },
    sizeClass: ['medium', 'large'],
    tier: 2,
    meshLengthM: 0.14,
    value: 18,
    sinkRate: 0.75,
    blurb: 'Deep drop · snapper/tuna class'
  },
  {
    id: 'lure_heavy',
    label: 'Heavy Lure',
    meshUrl: `${LURE}/lure-h6fxsojx9b.glb`,
    biteMul: 0.82,
    rarityBias: { epic: 1.5, legendary: 1.35 },
    sizeClass: ['large', 'huge'],
    tier: 3,
    meshLengthM: 0.18,
    value: 40,
    sinkRate: 0.85,
    blurb: 'Big game · sharks / sword'
  },
  {
    id: 'lure_game',
    label: 'Game Rig',
    meshUrl: `${LURE}/lure-jknxyvhxtd.glb`,
    biteMul: 0.88,
    rarityBias: { epic: 1.45, legendary: 1.25 },
    sizeClass: ['large', 'huge'],
    tier: 4,
    meshLengthM: 0.2,
    value: 55,
    sinkRate: 0.7,
    blurb: 'Sport rig · dolphin / manta / game shark'
  },
  {
    id: 'lure_titan',
    label: 'Titan Hook',
    meshUrl: `${LURE}/lure-swjbrn0kvz.glb`,
    biteMul: 0.7,
    rarityBias: { legendary: 1.8 },
    sizeClass: ['huge', 'titan'],
    tier: 5,
    meshLengthM: 0.28,
    value: 120,
    sinkRate: 0.95,
    blurb: 'Abyss · whale / titan class only'
  }
]);

export const FISHING_BUILDABLES = Object.freeze([
  { id: 'dock_long', label: 'Long Dock', meshUrl: `${DOCK}/dock_long.glb`, kind: 'buildable', spanM: 8, professions: ['fishing'] },
  { id: 'dock_wide', label: 'Wide Dock', meshUrl: `${DOCK}/dock_wide.glb`, kind: 'buildable', spanM: 6, professions: ['fishing'] },
  { id: 'dock_stairs', label: 'Dock Stairs', meshUrl: `${DOCK}/dock_stairs.glb`, kind: 'buildable', spanM: 3, professions: ['fishing'] },
  { id: 'fishing_boat', label: 'Fishing Boat', meshUrl: `${DOCK}/boat.glb`, kind: 'buildable', spanM: 4, professions: ['fishing'] },
  { id: 'fish_bucket', label: 'Fish Bucket', meshUrl: './models/fish/lures/worm.glb', kind: 'container', capacity: 12, professions: ['fishing', 'cooking'] }
]);

export const POLE_ABILITIES = ROD_ABILITIES;
export { ROD_TYPES, ROD_ABILITIES, resolveRodMods, rodTypeById };

export function fishById(id) {
  return FISH_SPECIES.find((f) => f.id === id) || null;
}

export function poleById(id) {
  return FISHING_POLES.find((p) => p.id === id) || FISHING_POLES[0];
}

export function lureById(id) {
  return FISHING_LURES.find((l) => l.id === id) || FISHING_LURES[1];
}

/**
 * Can this rod + lure + skill tree land this species?
 * @param {FishSpecies} fish
 * @param {{ rodTier?: number, maxSizeRank?: number, maxFishLengthM?: number, lureTier?: number, fishingLevel?: number, treeMaxSizeRank?: number }} gates
 */
export function fishAllowedByGear(fish, gates = {}) {
  if (!fish) return false;
  const rank = sizeRank(fish.sizeClass);
  // Hard: rod line class AND skill-tree unlock (need both)
  const rodRank = gates.maxSizeRank ?? 1;
  const treeRank = gates.treeMaxSizeRank ?? 1;
  const maxRank = Math.min(rodRank, treeRank);
  if (rank > maxRank) return false;
  if ((fish.lengthM || 0) > (gates.maxFishLengthM ?? 99)) return false;
  if ((fish.minRodTier || 0) > (gates.rodTier ?? 0)) return false;
  const lureTier = gates.lureTier ?? 0;
  // Titan / huge need matching lure tier (gameplay)
  if (rank >= 5 && lureTier < 5) return false;
  if (rank >= 4 && lureTier < 3) return false;
  return true;
}

/**
 * Weighted pick — lure size bias · rod gates · skill · rareBias.
 * @param {{
 *   lureId?: string,
 *   fishingSkill?: number,
 *   rareBias?: number,
 *   legendaryBias?: number,
 *   poleId?: string,
 *   treeMaxSizeRank?: number
 * }} [ctx]
 */
export function rollFishSpecies(ctx = {}) {
  const lure = lureById(ctx.lureId || 'lure_basic');
  const rod = poleById(ctx.poleId || 't0-fishing-pole');
  const skill = Number(ctx.fishingSkill) || 0;
  const rareBias = Number(ctx.rareBias) || 1;
  const legendaryBias = Number(ctx.legendaryBias) || 1;
  const treeMax = Number(ctx.treeMaxSizeRank) || 0;
  const gates = {
    rodTier: rod.tier ?? 0,
    maxSizeRank: rod.maxSizeRank ?? 1,
    maxFishLengthM: rod.maxFishLengthM ?? 0.5,
    lureTier: lure.tier ?? 0,
    fishingLevel: skill,
    treeMaxSizeRank: treeMax
  };

  const lureSizes = new Set(lure.sizeClass || ['small', 'medium']);

  const weights = FISH_SPECIES.map((f) => {
    if (!fishAllowedByGear(f, gates)) return 0;

    let w = 1;
    if (f.rarity === 'common') w = 40;
    else if (f.rarity === 'uncommon') w = 22;
    else if (f.rarity === 'rare') w = 10 * rareBias;
    else if (f.rarity === 'epic') w = 3 * rareBias;
    else w = 1 * rareBias * legendaryBias;

    w *= lure.rarityBias?.[f.rarity] || 1;

    // Lure size match — primary mechanic
    if (lureSizes.has(f.sizeClass)) w *= 1.5;
    else w *= 0.12;

    // Preferred lure
    if (f.preferredLures?.includes(lure.id)) w *= 1.4;

    // Level gate soft
    if ((f.minLevel || 1) > skill) w *= 0.25 + skill * 0.01;

    // Difficulty vs skill
    if (f.difficulty > 0.3 + skill * 0.01) w *= 0.4 + skill * 0.015;

    // Sink: deep lures prefer large/huge slightly when matched
    if ((lure.sinkRate || 0) > 0.6 && sizeRank(f.sizeClass) >= 3) w *= 1.15;

    return Math.max(0, w);
  });

  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0) {
    // Failsafe: smallest allowed
    return FISH_SPECIES.find((f) => fishAllowedByGear(f, gates)) || FISH_SPECIES[0];
  }
  let r = Math.random() * sum;
  for (let i = 0; i < FISH_SPECIES.length; i++) {
    r -= weights[i];
    if (r <= 0) return FISH_SPECIES[i];
  }
  return FISH_SPECIES[0];
}

/** Effective reel zone width 0..1 */
export function computeReelZoneWidth(pole, fish, abilityIds = [], extraZoneMul = 1) {
  const rod = rodTypeById(pole?.id);
  const mods = resolveRodMods(rod || pole, abilityIds);
  let w = (fish?.zoneWidthBase ?? 0.18) * (mods.power || pole?.power || 1) * (extraZoneMul || 1);
  // Bigger fish = slightly tighter base already on species; clamp
  return Math.min(0.42, Math.max(0.055, w));
}

export function computeLineMax(pole, abilityIds = [], extraLineMul = 1) {
  const rod = rodTypeById(pole?.id);
  const mods = resolveRodMods(rod || pole, abilityIds);
  return Math.min(1, (mods.lineStrength || pole?.lineStrength || 0.55) * (extraLineMul || 1));
}

export function computeCastRange(pole, abilityIds = []) {
  const rod = rodTypeById(pole?.id);
  const mods = resolveRodMods(rod || pole, abilityIds);
  return mods.castRangeM || pole?.castRangeM || 14;
}

/** Profession XP from a catch */
export function catchXp(fish, qty = 1) {
  const base = 10 + (fish.difficulty || 0.2) * 35 + (fish.value || 0) * 0.12;
  return Math.round(base * (fish.xpMul || 1) * Math.max(1, qty));
}
