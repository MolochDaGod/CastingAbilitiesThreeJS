/**
 * Four T0 guns / tools — lab merge until ObjectStore t0-weapons.json ships them.
 *
 *   t0-gun     Flintlock Pistol   pistol pack · one-hand IK · barrel
 *   t0-rifle   Flintlock Rifle    rifle pack  · two-hand IK · barrel
 *   t0-poppy   Poppy Gune         rifle pack  · two-hand IK · barrel pellets
 *   t0-daax    DaAx               sword_shield · grip IK · forestry + engineer unlock
 *
 * Promote these rows into ObjectStore. Do not mint a second id per slug.
 *
 * @see docs/T0_GUNS_SSOT.md
 */

import { CDN } from '../loot/prefabAssets.js';

export const T0_FLINTLOCK_PISTOL_ID = 't0-gun';
export const T0_FLINTLOCK_RIFLE_ID = 't0-rifle';
export const T0_POPPY_ID = 't0-poppy';
export const T0_DAAX_ID = 't0-daax';

export const T0_GUN_IDS = Object.freeze([
  T0_FLINTLOCK_PISTOL_ID,
  T0_FLINTLOCK_RIFLE_ID,
  T0_POPPY_ID,
  T0_DAAX_ID
]);

export const T0_RIFLE_ID = T0_FLINTLOCK_RIFLE_ID;
export const T0_RIFLE_MESH_URL = `${CDN}/models/weapons/rifle.glb`;
export const T0_RIFLE_ICON_URL = `${CDN}/game-assets/icons/496_rpg_icons/W_Gun003.png`;
export const T0_POPPY_MESH_URL = `${CDN}/models/weapons/shotgun.glb`;
export const T0_POPPY_MESH_LOCAL = './models/weapons/t0-poppy.glb';
export const T0_DAAX_MESH_URL = `${CDN}/models/weapons/axe.glb`;

const sk = (uuid, id, name, description, extra = {}) => ({
  uuid,
  id,
  name,
  description,
  icon: extra.icon || '/icons/496_rpg_icons/W_Gun003.png',
  tier: 0,
  damageType: extra.damageType || 'physical',
  projectile: extra.projectile === undefined ? 'bullet' : extra.projectile,
  resourceCost: { mana: 0, stamina: extra.stamina ?? 3 },
  ...extra
});

function threeSlot(slot1, slot2, slot3a, slot3b) {
  return {
    slot1,
    slot2,
    slot3Options: [slot3a, slot3b],
    defaultSlot3: slot3a.id,
    slots: [
      {
        type: 'primary',
        label: 'Slot 1 · Starter Attack',
        unlockTier: 0,
        fixed: true,
        autoAssigned: true,
        skillIds: [slot1.id],
        skillUuids: [slot1.uuid]
      },
      {
        type: 'secondary',
        label: 'Slot 2',
        unlockTier: 0,
        fixed: true,
        autoAssigned: true,
        skillIds: [slot2.id],
        skillUuids: [slot2.uuid]
      },
      {
        type: 'ability',
        label: 'Slot 3 · Choose One',
        unlockTier: 0,
        fixed: false,
        choice: true,
        defaultSkillId: slot3a.id,
        skillIds: [slot3a.id, slot3b.id],
        skillUuids: [slot3a.uuid, slot3b.uuid]
      }
    ],
    skillUuids: [slot1.uuid, slot2.uuid, slot3a.uuid, slot3b.uuid],
    slotPattern: 'three-slot-starter'
  };
}

function weaponRow(opts, skills) {
  return Object.freeze({
    uuid: opts.uuid,
    baseUuid: opts.uuid,
    id: opts.id,
    name: opts.name,
    baseName: opts.name,
    category: opts.category,
    type: 'weapon',
    subCategory: opts.subCategory,
    weaponType: opts.weaponType,
    tier: 0,
    tierLabel: 'Starter',
    tierColor: '#6b7280',
    iconUrl: opts.iconUrl,
    modelUrl: opts.modelUrl,
    prodGltfUrl: opts.modelUrl,
    description: opts.description,
    stats: opts.stats,
    craftedBy: opts.craftedBy || 'Engineer',
    craftingRecipe: opts.craftingRecipe || {
      profession: opts.unlockProfessions?.[0] || null,
      station: 'Anywhere',
      materials: [
        { id: 'scrap-ingot', quantity: 3 },
        { id: 'driftwood-log', quantity: 1 }
      ],
      craftTime: 12,
      gold: 0
    },
    source: 'lab-starter',
    usedInT1Crafting: false,
    slotPattern: 'three-slot-starter',
    labMint: true,
    animPack: opts.animPack,
    meshSlot: opts.meshSlot,
    unlockProfessions: opts.unlockProfessions || null,
    objectStorePromote: 'Copy this row into t0-weapons.json — do not invent a second id',
    weaponSkills: skills,
    skills: {
      slots: skills.slots,
      skillUuids: skills.skillUuids,
      slotPattern: 'three-slot-starter'
    }
  });
}

const rifleSkills = threeSlot(
  sk('SKIL-T0-R1A1F0-8C3D21', 't0_rifle_practice_shot', 'Practice Shot', 'Flintlock rifle fire from the barrel', {
    damage: 22, cooldown: 0, castTime: null, range: 28, effects: ['Starter', 'Barrel']
  }),
  sk('SKIL-T0-R1B2E1-9D4E32', 't0_rifle_reload', 'Reload', 'Cycle the action', {
    damage: 0, cooldown: 4, castTime: 1.2, range: null, projectile: null, effects: ['Reload'], stamina: 2
  }),
  sk('SKIL-T0-R1C3D2-AE5F43', 't0_rifle_aimed_shot', 'Aimed Shot', 'ADS fire from the barrel', {
    damage: 28, cooldown: 3, castTime: 0.35, range: 42, effects: ['Aim', 'Barrel']
  }),
  sk('SKIL-T0-R1D4C3-BF6054', 't0_rifle_rapid_fire', 'Rapid Fire', 'Three-round burst from the barrel', {
    damage: 16, cooldown: 5, castTime: null, range: 24, effects: ['Burst 3', 'Barrel'], multiHit: 3
  })
);

const poppySkills = threeSlot(
  sk('SKIL-T0-P0P1A0-11C4E2', 't0_poppy_buckshot', 'Buckshot', 'Poppy Gune — pellet cone from the barrel', {
    damage: 14, cooldown: 0.8, castTime: null, range: 10, effects: ['Pellets 6', 'Barrel', 'Cone'],
    multiHit: 6, icon: '/icons/496_rpg_icons/W_Gun003.png'
  }),
  sk('SKIL-T0-P0P2B1-22D5F3', 't0_poppy_reload', 'Reload', 'Break action · load shells', {
    damage: 0, cooldown: 3.5, castTime: 1.4, range: null, projectile: null, effects: ['Reload'], stamina: 2
  }),
  sk('SKIL-T0-P0P3C2-33E604', 't0_poppy_slug', 'Slug', 'Single heavy slug from the barrel', {
    damage: 32, cooldown: 4, castTime: 0.2, range: 16, effects: ['Slug', 'Barrel']
  }),
  sk('SKIL-T0-P0P4D3-44F715', 't0_poppy_slam', 'Slam Fire', 'Two-shell slam from the hip', {
    damage: 12, cooldown: 6, castTime: null, range: 8, effects: ['Pellets 8', 'Burst 2', 'Barrel'], multiHit: 8
  })
);

const daaxSkills = threeSlot(
  sk('SKIL-T0-DAA1A0-55A826', 't0_daax_hew', 'Hew', 'Forestry swing — timber and salvage', {
    damage: 20, cooldown: 0, castTime: null, range: null, projectile: null,
    damageType: 'physical', effects: ['Harvest', 'Wood'], stamina: 4,
    icon: '/icons/496_rpg_icons/W_Axe001.png'
  }),
  sk('SKIL-T0-DAA2B1-66B937', 't0_daax_salvage', 'Salvage', 'Engineering strip — unlock parts', {
    damage: 16, cooldown: 3, castTime: 0.4, range: null, projectile: null,
    effects: ['Salvage', 'Engineer'], stamina: 5, icon: '/icons/496_rpg_icons/W_Axe001.png'
  }),
  sk('SKIL-T0-DAA3C2-77CA48', 't0_daax_clear', 'Clear Cut', 'Wide forestry chop', {
    damage: 18, cooldown: 5, castTime: null, range: null, projectile: null,
    effects: ['AoE', 'Wood'], icon: '/icons/496_rpg_icons/W_Axe001.png'
  }),
  sk('SKIL-T0-DAA4D3-88DB59', 't0_daax_brace', 'Brace', 'Tool guard', {
    damage: 0, cooldown: 8, castTime: null, range: null, projectile: null,
    effects: ['Ward'], stamina: 2, icon: '/icons/496_rpg_icons/W_Axe001.png'
  })
);

export const T0_RIFLE_WEAPON = weaponRow(
  {
    id: T0_FLINTLOCK_RIFLE_ID,
    uuid: 'ITEM-20260818220000-000016-7A4C91E2',
    name: 'Flintlock Rifle',
    category: 'rifles',
    subCategory: '2h',
    weaponType: 'RIFLE',
    iconUrl: T0_RIFLE_ICON_URL,
    modelUrl: T0_RIFLE_MESH_URL,
    description: 'Flintlock long gun — rifle pack, two-hand IK, fire from the barrel.',
    stats: { damage: 22, speed: 110, combo: 0, crit: 2, block: 0, defense: 4 },
    animPack: 'rifle',
    meshSlot: 'rifle'
  },
  rifleSkills
);

export const T0_POPPY_WEAPON = weaponRow(
  {
    id: T0_POPPY_ID,
    uuid: 'ITEM-20260818220000-000017-8B5D02F3',
    name: 'Poppy Gune',
    category: 'shotguns',
    subCategory: '2h',
    weaponType: 'SHOTGUN',
    iconUrl: T0_RIFLE_ICON_URL,
    modelUrl: T0_POPPY_MESH_URL,
    description: 'T0 shotgun — rifle pack, two-hand IK, pellet cone from the barrel.',
    stats: { damage: 26, speed: 85, combo: 0, crit: 1, block: 0, defense: 3 },
    animPack: 'rifle',
    meshSlot: 'rifle'
  },
  poppySkills
);

export const T0_DAAX_WEAPON = weaponRow(
  {
    id: T0_DAAX_ID,
    uuid: 'ITEM-20260818220000-000018-9C6E1304',
    name: 'DaAx',
    category: 'tools',
    subCategory: '1h',
    weaponType: 'AXE',
    iconUrl: `${CDN}/game-assets/icons/496_rpg_icons/W_Axe001.png`,
    modelUrl: T0_DAAX_MESH_URL,
    description: 'Engineering + forestry starter axe. Equipping unlocks Forester and Engineer recipes.',
    stats: { damage: 16, speed: 90, combo: 0, crit: 1, block: 2, defense: 5 },
    craftedBy: 'Engineer',
    animPack: 'sword_shield',
    meshSlot: 'axe',
    unlockProfessions: ['forester', 'engineer']
  },
  daaxSkills
);

/** Relabel live ObjectStore t0-gun without replacing skill UUIDs. */
export function labelFlintlockPistol(row) {
  if (!row || row.id !== T0_FLINTLOCK_PISTOL_ID) return row;
  return {
    ...row,
    name: row.name && /flint/i.test(row.name) ? row.name : 'Flintlock Pistol',
    baseName: 'Flintlock Pistol',
    animPack: 'pistol',
    meshSlot: 'pistol'
  };
}

/**
 * Inject lab guns. Does not replace ObjectStore skill bodies on t0-gun.
 * @param {object[]} list
 */
export function mergeT0GunsIntoList(list = []) {
  const arr = Array.isArray(list) ? list.map((w) => labelFlintlockPistol(w)) : [];
  const have = new Set(arr.map((w) => w?.id));
  if (!have.has(T0_FLINTLOCK_RIFLE_ID)) arr.push(T0_RIFLE_WEAPON);
  else {
    const i = arr.findIndex((w) => w.id === T0_FLINTLOCK_RIFLE_ID);
    if (i >= 0) arr[i] = { ...arr[i], name: 'Flintlock Rifle', baseName: 'Flintlock Rifle' };
  }
  if (!have.has(T0_POPPY_ID)) arr.push(T0_POPPY_WEAPON);
  if (!have.has(T0_DAAX_ID)) arr.push(T0_DAAX_WEAPON);
  return arr;
}

/** @deprecated use mergeT0GunsIntoList */
export const mergeT0RifleIntoList = mergeT0GunsIntoList;

/** Profession nodes DaAx unlocks on equip. */
export const DAAX_RECIPE_UNLOCKS = Object.freeze([
  ['forester', 'f1'],
  ['forester', 'f2'],
  ['engineer', 'e1'],
  ['engineer', 'e2']
]);

export const T0_GUN_PREFABS = Object.freeze({
  [T0_FLINTLOCK_PISTOL_ID]: { pack: 'pistol', ik: 'pistol', spine: 'barrel' },
  [T0_FLINTLOCK_RIFLE_ID]: { pack: 'rifle', ik: 'rifle', spine: 'barrel' },
  [T0_POPPY_ID]: { pack: 'rifle', ik: 'rifle', spine: 'barrel' },
  [T0_DAAX_ID]: { pack: 'sword_shield', ik: 'grip', spine: 'tip' }
});
