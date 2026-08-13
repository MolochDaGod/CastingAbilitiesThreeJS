/**
 * DRC weapon skills — fleet-shaped (FleetWeaponSkill) for Warlords migration.
 * Elements fire/water/earth/wind use Casting path ability + cast/travel/impact VFX.
 * Default bar = first 4 of CASTING_SPELL_KIT (10 learnable spells → WEAPON_SKILLS STAFF).
 *
 * @see castingSpellKit.js · elementWeaponSkills.js · WEAPON_SKILLS.html
 */

import { ARCANE_WEAPON_SKILLS, CASTING_ELEMENT_PHASE_VFX } from './elementWeaponSkills.js';
import { kitHotbarSkills, toDrcSkill, CASTING_SPELL_KIT } from './castingSpellKit.js';
import {
  t0ApprenticeWandHotbar,
  allT0WandSkills,
  setT0WandSlot3,
  getT0WandSlot3,
  T0_WAND_SLOT3_OPTIONS,
  toDrcT0
} from './t0ApprenticeWand.js';
import {
  equippedWeaponHotbar,
  getEquippedWeapon,
  ensureWeaponCatalog
} from './equippedWeaponRuntime.js';
import {
  hotbarForWeapon,
  T0_STARTER_WEAPON_IDS,
  getEquippableWeaponsCache,
  loadEquippableWeapons
} from '../api/t0WeaponCatalog.js';
import { getSkillBinding } from './skillBindings.js';
import { bindFromCatalogSkill, staffBindFor } from './staffWeaponSkillsBind.js';
import { cachedItemGrantedSkills } from './itemGrantedSkills.js';

/** @typedef {'melee'|'spell'|'ranged'} SkillStyle */

/**
 * @typedef {object} DrcWeaponSkill
 * @property {string} id
 * @property {string} label
 * @property {number} slot 0..3
 * @property {SkillStyle} style
 * @property {string} [element] fire|storm|ice|nature|holy|arcane
 * @property {string} animRole idle|cast|attack|block
 * @property {number} rangeM
 * @property {number} cooldown
 * @property {number} castDuration
 * @property {number} staminaCost
 * @property {string} [castEffectId]
 * @property {string} [impactEffectId]
 * @property {string} [travelEffectId]
 * @property {boolean} [attachToHand]
 * @property {string} hint
 */

const F = CASTING_ELEMENT_PHASE_VFX.fire;
const W = CASTING_ELEMENT_PHASE_VFX.ice;
const E = CASTING_ELEMENT_PHASE_VFX.nature;
const A = CASTING_ELEMENT_PHASE_VFX.storm;

/**
 * Melee residual (Getsuga-class) — standard attack frame (F when no interact target).
 * Not Space. Profile knobs: settings.residual.
 * Open SSOT: meleeStrikeFx.ts · MELEE_SLASH_FX.md
 */
/** @type {DrcWeaponSkill} */
export const DRC_MELEE_STRIKE = {
  id: 'drc_melee_strike',
  label: 'Blade Residual',
  slot: -1, // F key — not digit bar
  style: 'melee',
  animRole: 'attack',
  rangeM: 3.2,
  cooldown: 0.55,
  castDuration: 0.45,
  staminaCost: 8,
  castEffectId: 'getsuga_slash',
  impactEffectId: 'getsuga_slash',
  attachToHand: true,
  weaponId: 'sword',
  hint: 'F fallback — attack anim + residual from weapon tip (edit settings.residual)'
};

/**
 * Default combat bar = kit page 0 (spells 1–4 of 10).
 * F = interact / attack. Pages: setSkillKitPage(0|1|2).
 */
/** @type {DrcWeaponSkill[]} */
export const DRC_WEAPON_SKILLS = kitHotbarSkills(0);

/** Full 10 as DRC skills (kit browse / bind). */
export const DRC_SPELL_KIT_ALL = CASTING_SPELL_KIT.map(toDrcSkill);

/** Purple arcane tree (optional bar: ?arcane=1 or setActiveSkillTree('arcane')). */
export const DRC_ARCANE_SKILLS = ARCANE_WEAPON_SKILLS;

/** @deprecated aliases for old element labels in toasts/docs */
export const DRC_LEGACY_ELEMENT_SKILLS = [
  {
    id: 'drc_fire_bolt',
    label: 'Fire Bolt',
    slot: 0,
    style: 'spell',
    element: 'fire',
    animRole: 'cast',
    rangeM: 16,
    cooldown: 1.1,
    castDuration: 0.85,
    staminaCost: 12,
    castEffectId: F.cast,
    travelEffectId: F.travel,
    impactEffectId: F.impact,
    attachToHand: true,
    weaponId: F.staffWeaponId,
    pathMode: 'stream',
    abilityElement: 'fire',
    catalogSkillId: 'staff_fire_bolt',
    hint: 'legacy → casting_fire_bolt'
  },
  {
    id: 'drc_water_lash',
    label: 'Water Lash',
    slot: 1,
    style: 'spell',
    element: 'ice',
    animRole: 'cast',
    rangeM: 14,
    cooldown: 1.2,
    castDuration: 0.9,
    staminaCost: 12,
    castEffectId: W.cast,
    travelEffectId: W.travel,
    impactEffectId: W.impact,
    attachToHand: true,
    weaponId: W.staffWeaponId,
    pathMode: 'stream',
    abilityelement: 'ice',
    catalogSkillId: 'staff_frost_bolt',
    hint: 'legacy → casting_frost_bolt'
  },
  {
    id: 'drc_earth_spike',
    label: 'Earth Spike',
    slot: 2,
    style: 'spell',
    element: 'nature',
    animRole: 'cast',
    rangeM: 12,
    cooldown: 1.4,
    castDuration: 1.0,
    staminaCost: 16,
    castEffectId: E.cast,
    travelEffectId: E.travel,
    impactEffectId: E.impact,
    attachToHand: true,
    weaponId: E.staffWeaponId,
    pathMode: 'spikes',
    abilityelement: 'nature',
    catalogSkillId: 'staff_earthquake',
    hint: 'legacy → casting_earth_spike'
  },
  {
    id: 'drc_wind_tempest',
    label: 'Wind Tempest',
    slot: 3,
    style: 'spell',
    element: 'storm',
    animRole: 'cast',
    rangeM: 14,
    cooldown: 2.5,
    castDuration: 0.95,
    staminaCost: 14,
    castEffectId: A.cast,
    travelEffectId: A.travel,
    impactEffectId: A.impact,
    attachToHand: true,
    weaponId: A.staffWeaponId,
    pathMode: 'stream',
    abilityelement: 'storm',
    catalogSkillId: 'staff_storm_call',
    hint: 'legacy → casting_wind_tempest'
  }
];

/** Active hotbar: kit | equipped catalog | t0 starters | arcane | legacy */
let _activeTree = 'kit';
let _kitPage = 0;
/** @type {DrcWeaponSkill[]} */
let _kitBar = kitHotbarSkills(0);
/** Slot-3 choice when using catalog starter without full equip */
let _catalogSlot3 = {
  [T0_STARTER_WEAPON_IDS.apprenticeWand]: 't0_wand_frost_spark',
  [T0_STARTER_WEAPON_IDS.saplingStaff]: 't0_staff_vine_lash'
};

export function setActiveSkillTree(tree) {
  if (tree === 'arcane') _activeTree = 'arcane';
  else if (tree === 'legacy' || tree === 'elements') _activeTree = 'legacy';
  else if (tree === 'wand' || tree === 't0_wand' || tree === 'apprentice_wand')
    _activeTree = 'wand';
  else if (tree === 'sapling' || tree === 't0_nature' || tree === 'nature_staff')
    _activeTree = 'sapling';
  else if (tree === 'equipped' || tree === 'weapon') _activeTree = 'equipped';
  else _activeTree = 'kit';
}

/**
 * Choose slot-3 for catalog T0 starter trees (wand / sapling).
 * @param {'t0-wand'|'t0-nature-staff'|string} weaponId
 * @param {string} skillId
 */
export function setCatalogStarterSlot3(weaponId, skillId) {
  if (!weaponId || !skillId) return;
  _catalogSlot3[weaponId] = skillId;
  if (weaponId === T0_STARTER_WEAPON_IDS.apprenticeWand) setT0WandSlot3(skillId);
}

export function getCatalogStarterSlot3(weaponId) {
  return _catalogSlot3[weaponId] || null;
}

/** Kit page 0 = spells 1–4, 1 = 5–8, 2 = 9–10 (+ pads). */
export function setSkillKitPage(page = 0) {
  _kitPage = Math.max(0, Math.min(2, Number(page) || 0));
  _kitBar = kitHotbarSkills(_kitPage);
  _kitBar = _kitBar.map((s, i) => ({ ...s, slot: i }));
  if (_activeTree === 'kit') return _kitBar;
  return getActiveSkills();
}

export function getSkillKitPage() {
  return _kitPage;
}

/**
 * Hotbar from live t0-weapons.json (WEAPON_SKILLS.html).
 * @param {string} weaponId t0-wand | t0-nature-staff
 */
function hotbarFromCachedStarter(weaponId) {
  const equipped = getEquippedWeapon?.();
  if (equipped?.id === weaponId) return equippedWeaponHotbar();
  const cache = getEquippableWeaponsCache();
  if (!cache?.byId) {
    void ensureWeaponCatalog?.().catch(() => {});
    return null;
  }
  const w = cache.byId.get(weaponId);
  if (!w) return null;
  const s3 = _catalogSlot3[weaponId] || w.defaultSlot3Id;
  return hotbarForWeapon(w, s3);
}

export function getActiveSkills() {
  if (_activeTree === 'arcane') return DRC_ARCANE_SKILLS;
  if (_activeTree === 'legacy') return DRC_LEGACY_ELEMENT_SKILLS;
  if (_activeTree === 'wand') {
    // Live catalog first; local t0ApprenticeWand only if cache cold
    const bar = hotbarFromCachedStarter(T0_STARTER_WEAPON_IDS.apprenticeWand);
    return bar?.length ? bar : t0ApprenticeWandHotbar();
  }
  if (_activeTree === 'sapling') {
    const bar = hotbarFromCachedStarter(T0_STARTER_WEAPON_IDS.saplingStaff);
    // Sapling has no local fork — empty until catalog warms (equip Weapon tab)
    return bar?.length ? bar : [];
  }
  if (_activeTree === 'equipped') {
    const bar = equippedWeaponHotbar();
    // Gear / relic granted skills ride after the weapon slots (same compile
    // pipeline — see itemGrantedSkills.js). Empty until items carry grants.
    const grants = cachedItemGrantedSkills();
    if (bar.length || grants.length) return [...bar, ...grants];
    return _kitBar;
  }
  return _kitBar;
}

export function getActiveSkillTree() {
  return _activeTree;
}

export function skillBySlot(slot) {
  return getActiveSkills().find((s) => s.slot === slot) || null;
}

export function skillById(id) {
  if (id === DRC_MELEE_STRIKE.id) return DRC_MELEE_STRIKE;
  const t0 = allT0WandSkills().find((s) => s.id === id || s.catalogSkillId === id);
  if (t0) return toDrcT0(t0);
  return (
    DRC_SPELL_KIT_ALL.find((s) => s.id === id) ||
    DRC_SPELL_KIT_ALL.find((s) => s.catalogSkillId === id) ||
    DRC_LEGACY_ELEMENT_SKILLS.find((s) => s.id === id) ||
    DRC_ARCANE_SKILLS.find((s) => s.id === id) ||
    null
  );
}

export {
  CASTING_SPELL_KIT,
  setT0WandSlot3,
  getT0WandSlot3,
  T0_WAND_SLOT3_OPTIONS,
  allT0WandSkills,
  t0ApprenticeWandHotbar
};

/**
 * @deprecated Residual profile only — not the F key product skill.
 * F = weapon skill (see skillForFKey). Kept for sword residual VFX profiles.
 */
export function getMeleeStrikeSkill() {
  return DRC_MELEE_STRIKE;
}

/**
 * F key → weapon skill (not class ability, not residual default).
 *
 * Priority:
 *  1. Showcase / saved bind `f`
 *  2. Equipped weapon hotbar slot 0 (starter attack / primary)
 *  3. Active tree slot 0
 *
 * Class abilities stay deferred — strengthen weapon skill + prefab pattern first.
 * @returns {DrcWeaponSkill|null}
 */
export function skillForFKey() {
  // 1) Showcase / saved F bind → catalog skill as weapon skill
  const bind = getSkillBinding('f');
  if (bind?.skillId) {
    const fromId = skillById(bind.skillId);
    const staffB =
      bindFromCatalogSkill({
        id: bind.skillId,
        name: bind.name,
        damageType: bind.damageType,
        cooldown: bind.cooldown
      }) || staffBindFor(bind.skillId);
    if (fromId || staffB) {
      return {
        ...(fromId || {}),
        id: bind.skillId,
        label: bind.name || fromId?.label || staffB?.name || bind.skillId,
        slot: -1,
        hotkey: 'f',
        isWeaponPrimary: true,
        style: fromId?.style || (bind.labPack === 'magic' ? 'spell' : 'spell'),
        element: fromId?.element || staffB?.element,
        abilityElement: fromId?.abilityElement || staffB?.element,
        castDuration: fromId?.castDuration || staffB?.castDuration || 0.5,
        cooldown: bind.cooldown ?? fromId?.cooldown ?? staffB?.cooldown ?? 1,
        animRole: fromId?.animRole || 'cast',
        rangeM: fromId?.rangeM || staffB?.rangeM || 14,
        castEffectId: fromId?.castEffectId || staffB?.castEffectId,
        travelEffectId: fromId?.travelEffectId || staffB?.travelEffectId,
        impactEffectId: fromId?.impactEffectId || staffB?.impactEffectId,
        pathMode: fromId?.pathMode || staffB?.pathMode || 'stream',
        catalogSkillId: bind.skillId,
        staminaCost: fromId?.staminaCost ?? 10,
        manaCost: fromId?.manaCost,
        weaponTypeId: bind.weaponTypeId
      };
    }
  }
  // 2) Equipped weapon primary (slot 0) — T0 starter attack / weapon prefab
  const equipped = equippedWeaponHotbar();
  if (equipped?.length) {
    const primary = equipped.find((s) => s.slot === 0) || equipped[0];
    if (primary) return { ...primary, slot: -1, hotkey: 'f', isWeaponPrimary: true };
  }
  // 3) Active tree first skill (kit page weapon skills)
  const bar = getActiveSkills();
  const s0 = bar.find((s) => s.slot === 0) || bar[0];
  if (s0) return { ...s0, slot: -1, hotkey: 'f', isWeaponPrimary: true };
  return null;
}

/**
 * Minimal readiness check (fleet assessWeaponSkillReadiness analogue).
 * @param {DrcWeaponSkill} skill
 */
export function assessSkill(skill) {
  const missing = [];
  if (!skill?.id) missing.push('id');
  if (skill.style === 'spell' && !skill.element) missing.push('element');
  if (!skill.animRole) missing.push('animRole');
  if (!(skill.cooldown >= 0)) missing.push('cooldown');
  return { ok: missing.length === 0, missing };
}
