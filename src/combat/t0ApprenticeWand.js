/**
 * T0 Apprentice Wand — three-slot starter (WEAPON_SKILLS / t0-weapons SSOT).
 *
 * Slot 1 · Starter Attack (fixed): Practice Bolt
 * Slot 2 · Starter Style  (fixed): Focus (+spell dmg 3s)
 * Slot 3 · Choose One:     Frost Spark | Arcane Ping  (default Frost Spark)
 *
 * Catalog: master-weaponSkills WAND.starterSlots · t0-weapons id t0-wand
 * Lab: magic anim pack · arcane/frost VFX · wind Ability path for bolts
 */

const CAST_CLIP = 'magic/standing 1h cast spell 01';
const ICON = '/icons/pack/weapons/staff_34.png';
const WEAPON_ID = 't0-wand';
const WEAPON_NAME = 'Apprentice Wand';

/**
 * @typedef {object} T0WandSkill
 * @property {string} id
 * @property {string} catalogSkillId
 * @property {string} label
 * @property {string} description
 * @property {number} slot 0|1|2
 * @property {'primary'|'secondary'|'ability'} slotType
 * @property {boolean} [fixed]
 * @property {boolean} [choice]
 * @property {'spell'|'buff'} style
 * @property {'arcane'|'frost'} element
 * @property {'cast'} animRole
 * @property {string} animPack
 * @property {string} castClip
 * @property {string} [abilityElement] AbilityManager element
 * @property {string} [pathMode]
 * @property {number} rangeM
 * @property {number} cooldown
 * @property {number} castDuration
 * @property {number} staminaCost
 * @property {number} manaCost
 * @property {number} damage
 * @property {string} [castEffectId]
 * @property {string} [travelEffectId]
 * @property {string} [impactEffectId]
 * @property {string[]} effects
 * @property {boolean} [isFocus]
 * @property {number} [focusDurationSec]
 * @property {number} [focusDamageMul]
 */

/** @type {T0WandSkill} */
export const T0_WAND_PRACTICE_BOLT = Object.freeze({
  id: 't0_wand_practice_bolt',
  catalogSkillId: 't0_wand_practice_bolt',
  label: 'Practice Bolt',
  description: 'Flickering arcane bolt',
  slot: 0,
  slotType: 'primary',
  fixed: true,
  style: 'spell',
  element: 'arcane',
  animRole: 'cast',
  animPack: 'magic',
  castClip: CAST_CLIP,
  abilityElement: 'wind',
  pathMode: 'stream',
  rangeM: 12,
  cooldown: 0.45,
  castDuration: 0.5,
  staminaCost: 0,
  manaCost: 4,
  damage: 14,
  castEffectId: 'arcane_swirl',
  travelEffectId: 'chain_lightning',
  impactEffectId: 'arcane_swirl',
  effects: ['Starter'],
  icon: ICON,
  weaponId: WEAPON_ID,
  hint: '1 — Auto · Practice Bolt (T0)'
});

/** @type {T0WandSkill} */
export const T0_WAND_FOCUS = Object.freeze({
  id: 't0_wand_focus',
  catalogSkillId: 't0_wand_focus',
  label: 'Focus',
  description: 'Channel focus — next spell bonus',
  slot: 1,
  slotType: 'secondary',
  fixed: true,
  style: 'buff',
  element: 'arcane',
  animRole: 'cast',
  animPack: 'magic',
  castClip: CAST_CLIP,
  abilityElement: null,
  pathMode: null,
  rangeM: 0,
  cooldown: 5,
  castDuration: 0.3,
  staminaCost: 0,
  manaCost: 4,
  damage: 0,
  castEffectId: 'arcane_swirl',
  travelEffectId: null,
  impactEffectId: null,
  effects: ['+spell dmg 3s'],
  isFocus: true,
  focusDurationSec: 3,
  focusDamageMul: 1.35,
  icon: ICON,
  weaponId: WEAPON_ID,
  hint: '2 — Auto · Focus (next spell +dmg 3s)'
});

/** @type {T0WandSkill} */
export const T0_WAND_FROST_SPARK = Object.freeze({
  id: 't0_wand_frost_spark',
  catalogSkillId: 't0_wand_frost_spark',
  label: 'Frost Spark',
  description: 'Tiny frost projectile',
  slot: 2,
  slotType: 'ability',
  choice: true,
  style: 'spell',
  element: 'frost',
  animRole: 'cast',
  animPack: 'magic',
  castClip: CAST_CLIP,
  abilityElement: 'water',
  pathMode: 'stream',
  rangeM: 11,
  cooldown: 4,
  castDuration: 0.6,
  staminaCost: 0,
  manaCost: 4,
  damage: 12,
  castEffectId: 'arcane_swirl',
  travelEffectId: 'moon_beam',
  impactEffectId: 'frost_wave',
  effects: ['Slow 1s'],
  icon: ICON,
  weaponId: WEAPON_ID,
  hint: '3 — Choose · Frost Spark'
});

/** @type {T0WandSkill} */
export const T0_WAND_ARCANE_PING = Object.freeze({
  id: 't0_wand_arcane_ping',
  catalogSkillId: 't0_wand_arcane_ping',
  label: 'Arcane Ping',
  description: 'Quick arcane pulse',
  slot: 2,
  slotType: 'ability',
  choice: true,
  style: 'spell',
  element: 'arcane',
  animRole: 'cast',
  animPack: 'magic',
  castClip: CAST_CLIP,
  abilityElement: 'wind',
  pathMode: 'aoe',
  rangeM: 8,
  cooldown: 3,
  castDuration: 0.4,
  staminaCost: 0,
  manaCost: 2,
  damage: 10,
  castEffectId: 'arcane_swirl',
  travelEffectId: 'arcane_swirl',
  impactEffectId: 'arcane_swirl',
  effects: ['Low mana'],
  icon: ICON,
  weaponId: WEAPON_ID,
  hint: '3 — Choose · Arcane Ping'
});

/** Slot 3 options (choose one) */
export const T0_WAND_SLOT3_OPTIONS = Object.freeze([
  T0_WAND_FROST_SPARK,
  T0_WAND_ARCANE_PING
]);

export const T0_WAND_DEFAULT_SLOT3 = 't0_wand_frost_spark';

/**
 * Active slot-3 choice (session).
 * @type {string}
 */
let _slot3Id = T0_WAND_DEFAULT_SLOT3;

export function setT0WandSlot3(skillId) {
  const ok = T0_WAND_SLOT3_OPTIONS.some((s) => s.id === skillId);
  if (ok) _slot3Id = skillId;
  return _slot3Id;
}

export function getT0WandSlot3() {
  return _slot3Id;
}

/**
 * Hotbar for Apprentice Wand: [Practice Bolt, Focus, Slot3 choice].
 * Digit 4 empty (T0 is three-slot pattern).
 * @returns {object[]}
 */
export function t0ApprenticeWandHotbar() {
  const slot3 =
    T0_WAND_SLOT3_OPTIONS.find((s) => s.id === _slot3Id) || T0_WAND_FROST_SPARK;
  return [
    toDrcT0(T0_WAND_PRACTICE_BOLT, 0),
    toDrcT0(T0_WAND_FOCUS, 1),
    toDrcT0(slot3, 2)
  ];
}

/**
 * @param {T0WandSkill} sk
 * @param {number} barSlot
 */
export function toDrcT0(sk, barSlot = sk.slot) {
  return {
    id: sk.id,
    label: sk.label,
    slot: barSlot,
    style: sk.style === 'buff' ? 'spell' : sk.style,
    skillKind: sk.style,
    element: sk.element === 'frost' ? 'water' : sk.element === 'arcane' ? 'arcane' : sk.element,
    abilityElement: sk.abilityElement,
    pathMode: sk.pathMode || 'stream',
    animRole: sk.animRole,
    animPack: sk.animPack,
    castClip: sk.castClip,
    rangeM: sk.rangeM,
    cooldown: sk.cooldown,
    castDuration: sk.castDuration,
    staminaCost: sk.staminaCost,
    manaCost: sk.manaCost,
    damage: sk.damage,
    castEffectId: sk.castEffectId,
    travelEffectId: sk.travelEffectId,
    impactEffectId: sk.impactEffectId,
    attachToHand: true,
    weaponId: sk.weaponId || WEAPON_ID,
    catalogSkillId: sk.catalogSkillId,
    isFocus: !!sk.isFocus,
    focusDurationSec: sk.focusDurationSec || 0,
    focusDamageMul: sk.focusDamageMul || 1,
    effects: sk.effects || [],
    fixed: !!sk.fixed,
    choice: !!sk.choice,
    tier: 0,
    hint: sk.hint || sk.label
  };
}

export function allT0WandSkills() {
  return [T0_WAND_PRACTICE_BOLT, T0_WAND_FOCUS, ...T0_WAND_SLOT3_OPTIONS];
}

/** Prefab bind for master-weaponSkills enrichment */
export function t0WandPrefabBind(sk) {
  return {
    castingLab: true,
    t0: true,
    weaponId: WEAPON_ID,
    weaponName: WEAPON_NAME,
    skillId: sk.id,
    animPack: sk.animPack,
    animationClip: sk.castClip,
    animRole: sk.animRole,
    pathMode: sk.pathMode,
    element: sk.element,
    castEffectId: sk.castEffectId,
    travelEffectId: sk.travelEffectId,
    impactEffectId: sk.impactEffectId,
    isFocus: !!sk.isFocus,
    focusDurationSec: sk.focusDurationSec || null,
    focusDamageMul: sk.focusDamageMul || null,
    liveLab: 'https://casting-abilities-threejs.vercel.app/',
    source: 'CastingAbilitiesThreeJS/t0ApprenticeWand'
  };
}

export function exportT0ApprenticeWandJson() {
  return {
    version: '1.0.0',
    generated: new Date().toISOString(),
    weaponId: WEAPON_ID,
    weaponName: WEAPON_NAME,
    slotPattern: 'three-slot-starter',
    weaponSkillsHtml: 'https://info.grudge-studio.com/WEAPON_SKILLS.html',
    slots: {
      slot1: {
        label: 'Slot 1 · Starter Attack',
        fixed: true,
        auto: true,
        skill: { ...T0_WAND_PRACTICE_BOLT, prefab: t0WandPrefabBind(T0_WAND_PRACTICE_BOLT) }
      },
      slot2: {
        label: 'Slot 2 · Starter Style',
        fixed: true,
        auto: true,
        skill: { ...T0_WAND_FOCUS, prefab: t0WandPrefabBind(T0_WAND_FOCUS) }
      },
      slot3: {
        label: 'Slot 3 · Choose One',
        fixed: false,
        choice: true,
        defaultSkillId: T0_WAND_DEFAULT_SLOT3,
        options: T0_WAND_SLOT3_OPTIONS.map((s) => ({
          ...s,
          prefab: t0WandPrefabBind(s)
        }))
      }
    }
  };
}

export { WEAPON_ID as T0_WAND_WEAPON_ID, WEAPON_NAME as T0_WAND_WEAPON_NAME };
