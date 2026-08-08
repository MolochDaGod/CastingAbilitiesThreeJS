/**
 * Casting lab → 10 learnable spells → WEAPON_SKILLS / staffs.
 *
 * Each spell is grounded in real lab systems (not invented FX):
 *  - Element Ability scripts: FireAbility · WaterAbility · EarthAbility · WindAbility
 *  - Path modes: stream · aoe · spikes · wall (settings.staffCast + pathCastClassify)
 *  - VFX ids: vfxCatalog + CASTING_ELEMENT_PHASE_VFX
 *  - Anim: magic pack cast clip (weaponAnimPack staff → magic)
 *  - Catalog ids: info…/WEAPON_SKILLS.html · master-weaponSkills.json STAFF
 *
 * Browse: https://info.grudge-studio.com/WEAPON_SKILLS.html
 * Live lab: https://casting-abilities-threejs.vercel.app/
 */

import { CASTING_ELEMENT_PHASE_VFX } from './elementWeaponSkills.js';
import { STAFF_SIGNATURE_SKILLS } from './staffSignatureSkills.js';
import { abilityKeyForElement } from '../config/settings.js';

/** @typedef {'fire'|'storm'|'ice'|'nature'|'holy'|'arcane'} SpellElement */
/** @typedef {'stream'|'aoe'|'spikes'|'wall'} PathMode */

/**
 * @typedef {object} CastingSpell
 * @property {string} id lab id (casting_*)
 * @property {string} catalogSkillId master-weaponSkills STAFF id when known
 * @property {string} label
 * @property {string} description
 * @property {SpellElement} element
 * @property {PathMode} pathMode
 * @property {'spell'} style
 * @property {'cast'} animRole
 * @property {string} animPack magic
 * @property {string} castClip baked role path
 * @property {string} abilityClass FireAbility|WaterAbility|EarthAbility|WindAbility|arcane
 * @property {string} castEffectId
 * @property {string} travelEffectId
 * @property {string} impactEffectId
 * @property {string} staffWeaponId
 * @property {number} rangeM
 * @property {number} cooldown
 * @property {number} castDuration
 * @property {number} staminaCost
 * @property {number} [manaCost] default ~0.75× stamina if omitted
 * @property {number} slot hotbar 0–9 (lab kit)
 * @property {'primary'|'secondary'|'ability'|'ultimate'} slotType
 * @property {string} learnFrom short agent note
 * @property {string[]} assets textures/shaders/scripts to study
 */

const F = CASTING_ELEMENT_PHASE_VFX.fire;
const S = CASTING_ELEMENT_PHASE_VFX.storm;
const I = CASTING_ELEMENT_PHASE_VFX.ice;
const N = CASTING_ELEMENT_PHASE_VFX.nature;
const H = CASTING_ELEMENT_PHASE_VFX.holy;
const R = CASTING_ELEMENT_PHASE_VFX.arcane;
/** @deprecated legacy aliases used while core spells migrate */
const W = I;
const E = N;
const A = S;

const CAST_CLIP = 'magic/standing 1h cast spell 01';

/** Default mana from stamina when author omits manaCost */
export function manaFromStam(staminaCost) {
  return Math.max(4, Math.ceil((staminaCost || 10) * 0.75));
}

/**
 * Core ten + staff signatures (Inferno, Blizzard, Warp, Quake, Tempest).
 * Order: fire → ice → nature → storm → holy/arcane, then signatures.
 *
 * @type {readonly CastingSpell[]}
 */
const CASTING_SPELL_CORE = [
  {
    id: 'casting_fire_bolt',
    catalogSkillId: 'staff_fire_bolt',
    label: 'Fire Bolt',
    description: 'Volumetric fireball along a drawn path — FireAbility travel + detonation.',
    element: 'fire',
    pathMode: 'stream',
    style: 'spell',
    animRole: 'cast',
    animPack: 'magic',
    castClip: CAST_CLIP,
    abilityClass: 'FireAbility',
    castEffectId: F.cast,
    travelEffectId: F.travel,
    impactEffectId: F.impact,
    staffWeaponId: F.staffWeaponId,
    rangeM: 16,
    cooldown: 1.1,
    castDuration: 0.85,
    staminaCost: 12,
    manaCost: 10,
    slot: 0,
    slotType: 'primary',
    learnFrom: 'FireAbility.js · VolumetricFireMaterial · settings.fire',
    assets: [
      'src/abilities/FireAbility.js',
      'src/materials/VolumetricFireMaterial.js',
      'src/config/settings.js#fire',
      'vfx:fire_hand|fireball|inferno'
    ]
  },
  {
    id: 'casting_flame_wave',
    catalogSkillId: 'staff_flame_wave',
    label: 'Flame Wave',
    description: 'Short-path AOE place — fire impact burst at aim (staffCast aoe).',
    element: 'fire',
    pathMode: 'aoe',
    style: 'spell',
    animRole: 'cast',
    animPack: 'magic',
    castClip: CAST_CLIP,
    abilityClass: 'FireAbility',
    castEffectId: F.cast,
    travelEffectId: F.travel,
    impactEffectId: 'inferno',
    staffWeaponId: F.staffWeaponId,
    rangeM: 10,
    cooldown: 3.0,
    castDuration: 0.9,
    staminaCost: 16,
    manaCost: 12,
    slot: 1,
    slotType: 'secondary',
    learnFrom: 'pathCastClassify aoe · deployElementImpact fire',
    assets: [
      'src/combat/pathCastClassify.js',
      'src/config/settings.js#staffCast',
      'vfx:inferno|fire_aura'
    ]
  },
  {
    id: 'casting_frost_bolt',
    catalogSkillId: 'staff_frost_bolt',
    label: 'Frost Bolt',
    description: 'Water stream along path — WaterAbility ribbons + frost impact.',
    element: 'ice',
    pathMode: 'stream',
    style: 'spell',
    animRole: 'cast',
    animPack: 'magic',
    castClip: CAST_CLIP,
    abilityClass: 'WaterAbility',
    castEffectId: I.cast,
    travelEffectId: I.travel,
    impactEffectId: I.impact,
    staffWeaponId: I.staffWeaponId,
    rangeM: 14,
    cooldown: 1.2,
    castDuration: 0.9,
    staminaCost: 12,
    slot: 2,
    slotType: 'primary',
    learnFrom: 'WaterAbility.js · settings.water spray/foam',
    assets: [
      'src/abilities/WaterAbility.js',
      'src/config/settings.js#water',
      'vfx:moon_beam|frost_wave'
    ]
  },
  {
    id: 'casting_ice_nova',
    catalogSkillId: 'staff_ice_nova',
    label: 'Ice Nova',
    description: 'Medium path spikes — frost ground wave along stroke (staffCast spikes).',
    element: 'ice',
    pathMode: 'spikes',
    style: 'spell',
    animRole: 'cast',
    animPack: 'magic',
    castClip: CAST_CLIP,
    abilityClass: 'WaterAbility',
    castEffectId: I.cast,
    travelEffectId: I.travel,
    impactEffectId: 'frost_wave',
    staffWeaponId: I.staffWeaponId,
    rangeM: 12,
    cooldown: 3.5,
    castDuration: 0.95,
    staminaCost: 16,
    slot: 3,
    slotType: 'secondary',
    learnFrom: 'staffCast spikesElement water · frost_wave',
    assets: [
      'src/config/settings.js#staffCast.spikes',
      'vfx:frost_wave|ice_lightning_burst'
    ]
  },
  {
    id: 'casting_earth_spike',
    catalogSkillId: 'staff_earthquake',
    label: 'Earth Spike',
    description: 'Earth rise along path — EarthAbility + earth_surge (nature staff line).',
    element: 'nature',
    pathMode: 'spikes',
    style: 'spell',
    animRole: 'cast',
    animPack: 'magic',
    castClip: CAST_CLIP,
    abilityClass: 'EarthAbility',
    castEffectId: E.cast,
    travelEffectId: E.travel,
    impactEffectId: E.impact,
    staffWeaponId: E.staffWeaponId,
    rangeM: 12,
    cooldown: 1.4,
    castDuration: 1.0,
    staminaCost: 16,
    slot: 4,
    slotType: 'ability',
    learnFrom: 'EarthAbility.js · settings.earth · nature staff',
    assets: [
      'src/abilities/EarthAbility.js',
      'src/config/settings.js#earth',
      'vfx:earth_surge',
      'catalog:t0_staff_vine_lash'
    ]
  },
  {
    id: 'casting_stone_wall',
    catalogSkillId: 'staff_natures_fury',
    label: 'Stone Wall',
    description: 'Long path / hold → wall barrier (staffCast wall + earth).',
    element: 'nature',
    pathMode: 'wall',
    style: 'spell',
    animRole: 'cast',
    animPack: 'magic',
    castClip: CAST_CLIP,
    abilityClass: 'EarthAbility',
    castEffectId: E.cast,
    travelEffectId: E.travel,
    impactEffectId: 'earth_surge',
    staffWeaponId: E.staffWeaponId,
    rangeM: 14,
    cooldown: 6.0,
    castDuration: 1.1,
    staminaCost: 20,
    slot: 5,
    slotType: 'ability',
    learnFrom: 'staffCast wallMinLength · wallHoldSec',
    assets: [
      'src/combat/pathCastClassify.js',
      'src/config/settings.js#staffCast.wall',
      'vfx:earth_surge'
    ]
  },
  {
    id: 'casting_wind_tempest',
    catalogSkillId: 'staff_storm_call',
    label: 'Wind Tempest',
    description: 'Wind stream + lightning travel — WindAbility + chain arcs.',
    element: 'storm',
    pathMode: 'stream',
    style: 'spell',
    animRole: 'cast',
    animPack: 'magic',
    castClip: CAST_CLIP,
    abilityClass: 'WindAbility',
    castEffectId: A.cast,
    travelEffectId: A.travel,
    impactEffectId: A.impact,
    staffWeaponId: A.staffWeaponId,
    rangeM: 14,
    cooldown: 2.5,
    castDuration: 0.95,
    staminaCost: 14,
    slot: 6,
    slotType: 'ultimate',
    learnFrom: 'WindAbility.js · wind residual afterimage palette',
    assets: [
      'src/abilities/WindAbility.js',
      'src/config/settings.js#wind',
      'src/vfx/DodgeAfterimage.js',
      'vfx:chain_lightning|ice_lightning_burst'
    ]
  },
  {
    id: 'casting_gale_nova',
    catalogSkillId: 'staff_thunder_cataclysm',
    label: 'Gale Nova',
    description: 'Wind AOE place — lightning burst at endpoint.',
    element: 'storm',
    pathMode: 'aoe',
    style: 'spell',
    animRole: 'cast',
    animPack: 'magic',
    castClip: CAST_CLIP,
    abilityClass: 'WindAbility',
    castEffectId: A.cast,
    travelEffectId: A.travel,
    impactEffectId: 'ice_lightning_burst',
    staffWeaponId: A.staffWeaponId,
    rangeM: 10,
    cooldown: 5.0,
    castDuration: 1.0,
    staminaCost: 18,
    slot: 7,
    slotType: 'ultimate',
    learnFrom: 'Wind aoe place · ice_lightning_burst sandbox V',
    assets: ['vfx:ice_lightning_burst|chain_lightning', 'src/vfx/vfxCatalog.js']
  },
  {
    id: 'casting_holy_light',
    catalogSkillId: 'staff_holy_light',
    label: 'Holy Light',
    description: 'Arcane/holy cast tell + moon beam — purple staff / holy line.',
    element: 'arcane',
    pathMode: 'stream',
    style: 'spell',
    animRole: 'cast',
    animPack: 'magic',
    castClip: CAST_CLIP,
    abilityClass: 'arcane',
    castEffectId: R.cast,
    travelEffectId: 'moon_beam',
    impactEffectId: 'moon_beam',
    staffWeaponId: R.staffWeaponId,
    rangeM: 14,
    cooldown: 1.3,
    castDuration: 0.9,
    staminaCost: 12,
    slot: 8,
    slotType: 'primary',
    learnFrom: 'arcane phase VFX · moon_beam (sandbox B)',
    assets: [
      'src/combat/elementWeaponSkills.js#arcane',
      'vfx:arcane_swirl|moon_beam'
    ]
  },
  {
    id: 'casting_meteor_strike',
    catalogSkillId: 'staff_meteor_strike',
    label: 'Meteor Strike',
    description: 'Long fire stream — high intensity FireAbility + inferno impact.',
    element: 'fire',
    pathMode: 'stream',
    style: 'spell',
    animRole: 'cast',
    animPack: 'magic',
    castClip: CAST_CLIP,
    abilityClass: 'FireAbility',
    castEffectId: F.cast,
    travelEffectId: F.travel,
    impactEffectId: 'inferno',
    staffWeaponId: F.staffWeaponId,
    rangeM: 20,
    cooldown: 8.0,
    castDuration: 1.2,
    staminaCost: 24,
    slot: 9,
    slotType: 'ability',
    learnFrom: 'FireAbility full path · intensity knobs settings.effect',
    assets: [
      'src/abilities/FireAbility.js',
      'src/vfx/effectPrefab.js',
      'vfx:fireball|inferno',
      'settings.effect intensity/aoe/speed/size'
    ]
  }
];

/** Full learnable kit: 10 core + 5 staff signatures */
export const CASTING_SPELL_KIT = Object.freeze([
  ...CASTING_SPELL_CORE,
  ...STAFF_SIGNATURE_SKILLS
]);

/** @type {Map<string, CastingSpell>} */
const BY_ID = new Map(CASTING_SPELL_KIT.map((s) => [s.id, s]));
/** @type {Map<string, CastingSpell>} */
const BY_CATALOG = new Map(CASTING_SPELL_KIT.map((s) => [s.catalogSkillId, s]));

export function spellById(id) {
  return BY_ID.get(id) || BY_CATALOG.get(id) || null;
}

export function spellBySlot(slot) {
  return CASTING_SPELL_KIT.find((s) => s.slot === slot) || null;
}

/** First four for classic DRC 1–4 bar (fire bolt, flame wave, frost bolt, ice nova). */
export function defaultBarSpells() {
  return CASTING_SPELL_KIT.filter((s) => s.slot < 4);
}

/** Full ten for kit panel / export. */
export function allCastingSpells() {
  return CASTING_SPELL_KIT.slice();
}

/**
 * Fleet / DRC-shaped skill from kit spell.
 * @param {CastingSpell} spell
 */
export function toDrcSkill(spell) {
  if (!spell) return null;
  return {
    id: spell.id,
    label: spell.label,
    slot: spell.slot % 4,
    kitSlot: spell.slot,
    style: 'spell',
    element: spell.element,
    /** Product element → ability pool (fire|water|earth|wind) */
    abilityElement: abilityKeyForElement(spell.element),
    pathMode: spell.pathMode,
    animRole: spell.animRole,
    animPack: spell.animPack,
    castClip: spell.castClip,
    rangeM: spell.rangeM,
    cooldown: spell.cooldown,
    castDuration: spell.castDuration,
    staminaCost: spell.staminaCost,
    manaCost: spell.manaCost ?? manaFromStam(spell.staminaCost),
    castEffectId: spell.castEffectId,
    travelEffectId: spell.travelEffectId,
    impactEffectId: spell.impactEffectId,
    attachToHand: true,
    weaponId: spell.staffWeaponId,
    catalogSkillId: spell.catalogSkillId,
    abilityClass: spell.abilityClass,
    hint: `${spell.label} · ${spell.pathMode} · MP${spell.manaCost ?? manaFromStam(spell.staminaCost)}/STA${spell.staminaCost} · → ${spell.catalogSkillId}`
  };
}

/** DRC bar skills (slots 0–3) from kit. */
export function kitHotbarSkills(page = 0) {
  const start = page * 4;
  return CASTING_SPELL_KIT.slice(start, start + 4).map(toDrcSkill);
}

/**
 * Prefab bind blob for master-weaponSkills enrichment / WEAPON_SKILLS page.
 * @param {CastingSpell} spell
 */
export function spellPrefabBind(spell) {
  return {
    castingLab: true,
    castingSpellId: spell.id,
    abilityClass: spell.abilityClass,
    pathMode: spell.pathMode,
    element: spell.element,
    animPack: spell.animPack,
    animationClip: spell.castClip,
    animRole: spell.animRole,
    castEffectId: spell.castEffectId,
    travelEffectId: spell.travelEffectId,
    impactEffectId: spell.impactEffectId,
    staffWeaponId: spell.staffWeaponId,
    learnFrom: spell.learnFrom,
    assets: spell.assets,
    source: 'CastingAbilitiesThreeJS',
    liveLab: 'https://casting-abilities-threejs.vercel.app/'
  };
}

/**
 * Export payload for ObjectStore / Warlords import.
 */
export function exportSpellKitJson() {
  return {
    version: '1.0.0',
    generated: new Date().toISOString(),
    title: 'Casting lab 10-spell kit → staff / WEAPON_SKILLS',
    liveLab: 'https://casting-abilities-threejs.vercel.app/',
    weaponSkillsHtml: 'https://info.grudge-studio.com/WEAPON_SKILLS.html',
    masterSkills: 'https://info.grudge-studio.com/api/v1/master-weaponSkills.json',
    rules: {
      animPack: 'magic for all staff spells',
      animRole: 'cast',
      spaceIsJump: true,
      residualIsAttackFrame: true,
      orbsNotWholeFireballGlb: true,
      pathModes: ['stream', 'aoe', 'spikes', 'wall']
    },
    spells: CASTING_SPELL_KIT.map((s) => ({
      ...s,
      prefab: spellPrefabBind(s),
      fleet: toDrcSkill(s)
    })),
    catalogIdMap: Object.fromEntries(
      CASTING_SPELL_KIT.map((s) => [s.catalogSkillId, s.id])
    )
  };
}

/**
 * Pattern for enriching any weapon skill (not only staff):
 * lab pack + anim role + VFX from damage type — used by catalog flatten.
 */
export const WEAPON_STYLE_SPELL_PATTERN = Object.freeze({
  spell: { animPack: 'magic', animRole: 'cast', defaultVfx: 'arcane_swirl' },
  melee: { animPack: 'sword_shield', animRole: 'attack', defaultVfx: 'getsuga_slash' },
  ranged: { animPack: 'longbow', animRole: 'attack', defaultVfx: 'getsuga_slash' }
});
