/**
 * Fishing profession catalog — poles, lures, fish, buildables.
 *
 * Sources reviewed:
 *  - Dgrudge-fishing-game (Vite scaffold only — no mechanics)
 *  - FishingBar/Target/Pointer/Template.png (2D minigame UI language)
 *  - Cute Fish Pack rods L1–L5 + lures + species (stats designed from rarity tiers)
 *  - gameopen humanPropsFishing (pole idle/cast, bucket, profession table)
 *  - Animated Fish Bundle GLB (production meshes under public/models/fish/)
 *
 * Mechanics adopted: SCUM-style snag window + Palworld/Angler fight bar
 * (see docs/FISHING_PROFESSION_SSOT.md).
 */

import {
  ROD_TYPES,
  ROD_ABILITIES,
  resolveRodMods,
  rodById as rodTypeById
} from './fishingRodTypes.js';

const FISH = './models/fish/species';
const LURE = './models/fish/lures';
const DOCK = './models/fish/docks';

/**
 * @typedef {object} FishSpecies
 * @property {string} id
 * @property {string} label
 * @property {string} meshUrl
 * @property {'common'|'uncommon'|'rare'|'epic'|'legendary'} rarity
 * @property {[number, number]} weightKg
 * @property {number} strength   0..1 fight pull
 * @property {number} speed      0..1 bar movement
 * @property {number} stamina    fight duration seconds baseline
 * @property {number} difficulty 0..1
 * @property {number} zoneWidthBase 0..1 reel zone width before gear
 * @property {string[]} preferredLures
 * @property {number} value
 */

/** Animated Fish Bundle species with SI-tuned fight stats */
export const FISH_SPECIES = Object.freeze(
  /** @type {FishSpecies[]} */ ([
    { id: 'clownfish', label: 'Clownfish', meshUrl: `${FISH}/clownfish.glb`, rarity: 'common', weightKg: [0.1, 0.4], strength: 0.25, speed: 0.45, stamina: 18, difficulty: 0.2, zoneWidthBase: 0.22, preferredLures: ['worm', 'lure_basic'], value: 4 },
    { id: 'goldfish', label: 'Goldfish', meshUrl: `${FISH}/goldfish.glb`, rarity: 'common', weightKg: [0.05, 0.25], strength: 0.2, speed: 0.4, stamina: 14, difficulty: 0.15, zoneWidthBase: 0.24, preferredLures: ['worm'], value: 3 },
    { id: 'tetra', label: 'Tetra', meshUrl: `${FISH}/tetra.glb`, rarity: 'common', weightKg: [0.02, 0.1], strength: 0.15, speed: 0.55, stamina: 12, difficulty: 0.18, zoneWidthBase: 0.23, preferredLures: ['worm', 'lure_basic'], value: 2 },
    { id: 'betta', label: 'Betta', meshUrl: `${FISH}/betta.glb`, rarity: 'common', weightKg: [0.03, 0.12], strength: 0.22, speed: 0.5, stamina: 15, difficulty: 0.22, zoneWidthBase: 0.21, preferredLures: ['lure_basic'], value: 5 },
    { id: 'blue_tang', label: 'Blue Tang', meshUrl: `${FISH}/blue_tang.glb`, rarity: 'uncommon', weightKg: [0.3, 1.2], strength: 0.4, speed: 0.55, stamina: 22, difficulty: 0.35, zoneWidthBase: 0.18, preferredLures: ['lure_basic', 'lure_spinner'], value: 12 },
    { id: 'yellow_tang', label: 'Yellow Tang', meshUrl: `${FISH}/yellow_tang.glb`, rarity: 'uncommon', weightKg: [0.25, 1.0], strength: 0.38, speed: 0.58, stamina: 20, difficulty: 0.34, zoneWidthBase: 0.18, preferredLures: ['lure_spinner'], value: 11 },
    { id: 'koi', label: 'Koi', meshUrl: `${FISH}/koi.glb`, rarity: 'uncommon', weightKg: [0.8, 3.5], strength: 0.45, speed: 0.35, stamina: 28, difficulty: 0.4, zoneWidthBase: 0.17, preferredLures: ['worm', 'lure_basic'], value: 18 },
    { id: 'puffer', label: 'Puffer', meshUrl: `${FISH}/puffer.glb`, rarity: 'uncommon', weightKg: [0.4, 1.5], strength: 0.5, speed: 0.3, stamina: 24, difficulty: 0.42, zoneWidthBase: 0.16, preferredLures: ['lure_basic'], value: 15 },
    { id: 'piranha', label: 'Piranha', meshUrl: `${FISH}/piranha.glb`, rarity: 'rare', weightKg: [0.5, 2.0], strength: 0.65, speed: 0.7, stamina: 26, difficulty: 0.55, zoneWidthBase: 0.14, preferredLures: ['lure_spinner', 'lure_deep'], value: 28 },
    { id: 'red_snapper', label: 'Red Snapper', meshUrl: `${FISH}/red_snapper.glb`, rarity: 'rare', weightKg: [1.5, 6], strength: 0.6, speed: 0.5, stamina: 32, difficulty: 0.52, zoneWidthBase: 0.15, preferredLures: ['lure_deep'], value: 32 },
    { id: 'tuna', label: 'Tuna', meshUrl: `${FISH}/tuna.glb`, rarity: 'rare', weightKg: [5, 25], strength: 0.75, speed: 0.65, stamina: 40, difficulty: 0.65, zoneWidthBase: 0.12, preferredLures: ['lure_deep', 'lure_heavy'], value: 48 },
    { id: 'lionfish', label: 'Lionfish', meshUrl: `${FISH}/lionfish.glb`, rarity: 'rare', weightKg: [0.4, 1.8], strength: 0.55, speed: 0.45, stamina: 30, difficulty: 0.58, zoneWidthBase: 0.13, preferredLures: ['lure_spinner'], value: 36 },
    { id: 'swordfish', label: 'Swordfish', meshUrl: `${FISH}/swordfish.glb`, rarity: 'epic', weightKg: [20, 90], strength: 0.88, speed: 0.8, stamina: 55, difficulty: 0.8, zoneWidthBase: 0.1, preferredLures: ['lure_heavy'], value: 90 },
    { id: 'shark', label: 'Shark', meshUrl: `${FISH}/shark.glb`, rarity: 'epic', weightKg: [40, 180], strength: 0.92, speed: 0.7, stamina: 60, difficulty: 0.85, zoneWidthBase: 0.09, preferredLures: ['lure_heavy'], value: 120 },
    { id: 'goblin_shark', label: 'Goblin Shark', meshUrl: `${FISH}/goblin_shark.glb`, rarity: 'legendary', weightKg: [50, 200], strength: 0.95, speed: 0.55, stamina: 70, difficulty: 0.92, zoneWidthBase: 0.08, preferredLures: ['lure_heavy'], value: 200 },
    { id: 'anglerfish', label: 'Anglerfish', meshUrl: `${FISH}/anglerfish.glb`, rarity: 'legendary', weightKg: [8, 40], strength: 0.85, speed: 0.4, stamina: 65, difficulty: 0.9, zoneWidthBase: 0.09, preferredLures: ['lure_deep', 'lure_heavy'], value: 180 }
  ])
);

/**
 * @typedef {object} FishingPoleDef
 * @property {string} id
 * @property {string} label
 * @property {string} meshUrl
 * @property {number} tier 0..5 lab (fleet T0–T8 later)
 * @property {number} power      reel zone width multiplier
 * @property {number} control    zone move speed
 * @property {number} lineStrength tension max 0..1
 * @property {number} castRangeM
 * @property {string[]} abilities
 * @property {string} animPack
 * @property {number} [nauticalSpeedMul]
 * @property {string} [family]
 */

/** Poles = Grudge Angler rod types (Animated Fish Bundle meshes) */
export const FISHING_POLES = Object.freeze(
  /** @type {FishingPoleDef[]} */ (
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
      animPack: 'magic',
      weaponType: 'TOOL',
      professions: ['fishing']
    }))
  )
);

export const FISHING_LURES = Object.freeze([
  { id: 'worm', label: 'Worm', meshUrl: `${LURE}/worm.glb`, biteMul: 1.15, rarityBias: { common: 1.2 }, tier: 0 },
  { id: 'lure_basic', label: 'Basic Lure', meshUrl: `${LURE}/lure.glb`, biteMul: 1.0, rarityBias: {}, tier: 0 },
  { id: 'lure_spinner', label: 'Spinner', meshUrl: `${LURE}/lure-2dkfirm95d.glb`, biteMul: 1.1, rarityBias: { uncommon: 1.3, rare: 1.1 }, tier: 1 },
  { id: 'lure_deep', label: 'Deep Lure', meshUrl: `${LURE}/lure-3pcaourgtu.glb`, biteMul: 0.95, rarityBias: { rare: 1.4, epic: 1.2 }, tier: 2 },
  { id: 'lure_heavy', label: 'Heavy Lure', meshUrl: `${LURE}/lure-h6fxsojx9b.glb`, biteMul: 0.85, rarityBias: { epic: 1.5, legendary: 1.4 }, tier: 3 }
]);

export const FISHING_BUILDABLES = Object.freeze([
  { id: 'dock_long', label: 'Long Dock', meshUrl: `${DOCK}/dock_long.glb`, kind: 'buildable', spanM: 8, professions: ['fishing'] },
  { id: 'dock_wide', label: 'Wide Dock', meshUrl: `${DOCK}/dock_wide.glb`, kind: 'buildable', spanM: 6, professions: ['fishing'] },
  { id: 'dock_stairs', label: 'Dock Stairs', meshUrl: `${DOCK}/dock_stairs.glb`, kind: 'buildable', spanM: 3, professions: ['fishing'] },
  { id: 'fishing_boat', label: 'Fishing Boat', meshUrl: `${DOCK}/boat.glb`, kind: 'buildable', spanM: 4, professions: ['fishing'] },
  { id: 'fish_bucket', label: 'Fish Bucket', meshUrl: './models/fish/lures/worm.glb', kind: 'container', capacity: 12, professions: ['fishing', 'cooking'] }
]);

/** Pole abilities — Grudge Angler parity (+ sea_legs · void_line) */
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
 * Weighted pick using lure rarity bias + skill + optional profession rareBias.
 * @param {{ lureId?: string, fishingSkill?: number, rareBias?: number, legendaryBias?: number }} [ctx]
 */
export function rollFishSpecies(ctx = {}) {
  const lure = lureById(ctx.lureId || 'lure_basic');
  const skill = Number(ctx.fishingSkill) || 0;
  const rareBias = Number(ctx.rareBias) || 1;
  const legendaryBias = Number(ctx.legendaryBias) || 1;
  const weights = FISH_SPECIES.map((f) => {
    let w = 1;
    if (f.rarity === 'common') w = 40;
    else if (f.rarity === 'uncommon') w = 22;
    else if (f.rarity === 'rare') w = 10 * rareBias;
    else if (f.rarity === 'epic') w = 3 * rareBias;
    else w = 1 * rareBias * legendaryBias;
    w *= lure.rarityBias?.[f.rarity] || 1;
    // Skill unlocks harder fish
    if (f.difficulty > 0.3 + skill * 0.01) w *= 0.35 + skill * 0.02;
    if (lure.preferred && f.preferredLures.includes(lure.id)) w *= 1.4;
    if (f.preferredLures.includes(lure.id)) w *= 1.35;
    return Math.max(0.05, w);
  });
  const sum = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * sum;
  for (let i = 0; i < FISH_SPECIES.length; i++) {
    r -= weights[i];
    if (r <= 0) return FISH_SPECIES[i];
  }
  return FISH_SPECIES[0];
}

/** Effective reel zone width 0..1 from pole + abilities + fish + tree zoneMul */
export function computeReelZoneWidth(pole, fish, abilityIds = [], extraZoneMul = 1) {
  const rod = rodTypeById(pole?.id);
  const mods = resolveRodMods(rod || pole, abilityIds);
  let w = (fish?.zoneWidthBase ?? 0.18) * (mods.power || pole?.power || 1) * (extraZoneMul || 1);
  return Math.min(0.42, Math.max(0.06, w));
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
