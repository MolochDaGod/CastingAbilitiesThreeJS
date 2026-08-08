/**
 * All STAFF skills from master-weaponSkills / WEAPON_SKILLS.html
 * → Casting lab transit + beauty bind (anim, pathMode, Ability element, VFX).
 *
 * Catalog rows ship with empty prefab.vfxRef — this table is the lab SSOT
 * so every staff skill animates and shows effects at runtime.
 *
 * @see docs/ELEMENT_TRANSIT_MASTERY_SSOT.md
 * @see https://info.grudge-studio.com/WEAPON_SKILLS.html
 */

import { CASTING_ELEMENT_PHASE_VFX, normalizeElement } from './elementWeaponSkills.js';
import { abilityKeyForElement } from '../config/settings.js';
import { presentationFor } from './elementPresentation.js';

const CAST_CLIP = 'magic/standing 1h cast spell 01';

/**
 * @typedef {object} StaffSkillBind
 * @property {string} element fire|storm|ice|nature|holy|arcane
 * @property {'stream'|'aoe'|'spikes'|'wall'} pathMode
 * @property {string} [castEffectId]
 * @property {string} [travelEffectId]
 * @property {string} [impactEffectId]
 * @property {string} [presentation] volley|meteor|lightning|groundFlood|vineLash|natureTrap|shield|radiance|voidBolt
 * @property {string} [abilityClass]
 * @property {number} [rangeM]
 * @property {number} [castDuration]
 * @property {string} [animRole]
 * @property {string} [animPack]
 * @property {string} [castClip]
 * @property {string} [note]
 */

function phase(el) {
  return CASTING_ELEMENT_PHASE_VFX[normalizeElement(el)] || CASTING_ELEMENT_PHASE_VFX.fire;
}

const ABILITY_CLASS = {
  fire: 'FireAbility',
  water: 'WaterAbility',
  earth: 'EarthAbility',
  wind: 'WindAbility'
};

/** @param {string} el @param {Partial<StaffSkillBind>} extra */
function bind(el, pathMode, extra = {}) {
  const p = phase(el);
  const pres = presentationFor(el);
  const key = abilityKeyForElement(el);
  return {
    element: normalizeElement(el),
    pathMode,
    castEffectId: extra.castEffectId || p.cast,
    travelEffectId: extra.travelEffectId || p.travel,
    impactEffectId: extra.impactEffectId || p.impact,
    presentation: extra.presentation || pres.style,
    abilityClass: extra.abilityClass || ABILITY_CLASS[key] || 'WindAbility',
    rangeM: extra.rangeM ?? 14,
    castDuration: extra.castDuration ?? 0.85,
    animRole: 'cast',
    animPack: 'magic',
    castClip: CAST_CLIP,
    note: extra.note || ''
  };
}

/**
 * Complete STAFF catalog id map (WEAPON_SKILLS STAFF + T0 starters).
 * @type {Record<string, StaffSkillBind>}
 */
export const STAFF_SKILL_BINDS = Object.freeze({
  /* ---- Primaries ---- */
  staff_fire_bolt: bind('fire', 'stream', { presentation: 'volley', rangeM: 16, note: 'single-target burn bolt' }),
  staff_frost_bolt: bind('ice', 'stream', { presentation: 'groundFlood', rangeM: 14, note: 'chill bolt' }),
  staff_holy_light: bind('holy', 'stream', { presentation: 'radiance', rangeM: 14, note: 'heal ally beam' }),

  /* ---- Secondaries ---- */
  staff_flame_wave: bind('fire', 'aoe', { presentation: 'volley', rangeM: 10, castDuration: 0.95, note: 'cone AoE DoT' }),
  staff_ice_nova: bind('ice', 'aoe', { presentation: 'groundFlood', rangeM: 8, castDuration: 1.0, note: 'AoE slow' }),
  staff_divine_wave: bind('holy', 'aoe', { presentation: 'radiance', rangeM: 10, note: 'AoE heal' }),

  /* ---- Abilities ---- */
  staff_inferno_shield: bind('fire', 'wall', { presentation: 'shield', castEffectId: 'fire_aura', impactEffectId: 'fire_aura', note: 'reflect shield' }),
  staff_glacial_shield: bind('ice', 'wall', { presentation: 'shield', castEffectId: 'frost_wave', impactEffectId: 'frost_wave', note: 'glacial absorb' }),
  staff_meteor_strike: bind('fire', 'stream', { presentation: 'meteor', rangeM: 18, castDuration: 1.2, note: 'sky meteor' }),
  staff_blizzard: bind('ice', 'aoe', { presentation: 'groundFlood', rangeM: 12, castDuration: 1.15, note: 'channel freeze field' }),
  staff_radiant_heal: bind('holy', 'aoe', { presentation: 'radiance', note: 'cleanse heal' }),

  /* ---- Ultimates / signatures (catalog names) ---- */
  staff_hellstorm: bind('fire', 'aoe', { presentation: 'meteor', rangeM: 16, castDuration: 1.2, note: 'wide burn AoE' }),
  staff_absolute_zero: bind('ice', 'aoe', { presentation: 'groundFlood', rangeM: 16, castDuration: 1.25, note: 'freeze field' }),
  staff_flame_nova: bind('fire', 'aoe', { presentation: 'volley', note: 'signature flame nova' }),
  staff_iceblood_eruption: bind('ice', 'spikes', { presentation: 'groundFlood', note: 'ice blood spikes' }),
  staff_holy_beacon: bind('holy', 'stream', { presentation: 'radiance', note: 'beacon' }),
  staff_sacred_apocalypse: bind('holy', 'aoe', { presentation: 'radiance', rangeM: 16, note: 'sacred AoE' }),
  staff_storm_call: bind('storm', 'stream', { presentation: 'lightning', note: 'chain lightning stream' }),
  staff_thunder_cataclysm: bind('storm', 'aoe', { presentation: 'lightning', rangeM: 14, note: 'thunder AoE' }),
  staff_wrath_of_the_tempest: bind('storm', 'stream', { presentation: 'lightning', rangeM: 18, castDuration: 1.15, note: 'tempest wrath' }),
  staff_inferno_incarnate: bind('fire', 'stream', { presentation: 'meteor', rangeM: 18, note: 'inferno incarnate' }),
  staff_generals_decree: bind('arcane', 'aoe', { presentation: 'voidBolt', note: 'general decree' }),
  staff_wrath_of_the_wilds: bind('nature', 'spikes', { presentation: 'vineLash', note: 'wilds wrath' }),
  staff_rune_apocalypse: bind('arcane', 'aoe', { presentation: 'voidBolt', note: 'rune apocalypse' }),
  staff_demon_lords_wrath: bind('fire', 'stream', { presentation: 'meteor', note: 'demon wrath' }),
  staff_ghost_executioner: bind('arcane', 'stream', { presentation: 'voidBolt', note: 'ghost executioner' }),
  staff_thundergods_judgment: bind('storm', 'stream', { presentation: 'lightning', rangeM: 20, note: 'thundergod' }),
  staff_earthquake: bind('nature', 'wall', { presentation: 'vineLash', note: 'quake wall' }),
  staff_crusaders_light: bind('holy', 'stream', { presentation: 'radiance', note: 'crusader light' }),
  staff_manifest_destiny: bind('holy', 'aoe', { presentation: 'radiance', note: 'manifest destiny' }),
  staff_royal_decree: bind('arcane', 'aoe', { presentation: 'voidBolt', note: 'royal decree' }),
  staff_supernova: bind('fire', 'aoe', { presentation: 'meteor', rangeM: 18, note: 'supernova' }),
  staff_arcane_apotheosis: bind('arcane', 'stream', { presentation: 'voidBolt', rangeM: 16, note: 'arcane apotheosis' }),
  staff_army_of_the_dead: bind('arcane', 'aoe', { presentation: 'voidBolt', note: 'army of the dead' }),
  staff_retribution: bind('holy', 'stream', { presentation: 'radiance', note: 'retribution' }),
  staff_omniscience: bind('arcane', 'aoe', { presentation: 'voidBolt', note: 'omniscience' }),
  staff_storm_of_arrows: bind('storm', 'stream', {
    presentation: 'lightning',
    travelEffectId: 'chain_lightning',
    note: 'storm arrows — wind + electric bolts'
  }),
  staff_warchiefs_fury: bind('nature', 'stream', { presentation: 'vineLash', note: 'warchief fury' }),
  staff_natures_fury: bind('nature', 'wall', { presentation: 'natureTrap', note: 'nature fury / wall trap' }),
  staff_verdant_cataclysm: bind('nature', 'aoe', { presentation: 'vineLash', rangeM: 16, note: 'verdant cataclysm' }),
  staff_wild_apocalypse: bind('nature', 'aoe', { presentation: 'natureTrap', rangeM: 14, note: 'wild purge trap field' }),

  /* Lab signatures also catalog-adjacent */
  staff_inferno: bind('fire', 'stream', { presentation: 'meteor', note: 'lab Inferno' }),
  staff_warp: bind('arcane', 'stream', { presentation: 'voidBolt', note: 'lab Warp' }),
  staff_quake: bind('nature', 'wall', { presentation: 'vineLash', note: 'lab Quake' }),
  staff_tempest: bind('storm', 'stream', { presentation: 'lightning', note: 'lab Tempest' }),

  /* T0 nature staff starters */
  t0_staff_practice_root: bind('nature', 'stream', { presentation: 'vineLash', rangeM: 10, castDuration: 0.5, note: 'T0 practice root' }),
  t0_staff_nature_ward: bind('nature', 'wall', {
    presentation: 'shield',
    castEffectId: 'earth_surge',
    impactEffectId: 'earth_surge',
    note: 'T0 nature ward'
  }),
  t0_staff_vine_lash: bind('nature', 'spikes', { presentation: 'vineLash', rangeM: 12, note: 'T0 vine lash' }),
  t0_staff_healing_sprout: bind('nature', 'aoe', {
    presentation: 'radiance',
    castEffectId: 'moon_beam',
    impactEffectId: 'moon_beam',
    note: 'T0 heal sprout'
  }),

  /* Nature trap skill (lab id — also alias for natures_fury style) */
  staff_nature_trap: bind('nature', 'stream', {
    presentation: 'natureTrap',
    rangeM: 12,
    castDuration: 1.0,
    note: 'ground trap → foot blast stun → cage walls 2s → free'
  })
});

/** @param {string} skillId */
export function staffBindFor(skillId) {
  if (!skillId) return null;
  return STAFF_SKILL_BINDS[skillId] || null;
}

/**
 * Infer bind when id missing from table (name/damageType heuristics).
 * @param {{ id?: string, name?: string, description?: string, damageType?: string, labElement?: string }} skill
 */
export function inferStaffBind(skill) {
  const known = staffBindFor(skill?.id);
  if (known) return known;
  const blob = `${skill?.id || ''} ${skill?.name || ''} ${skill?.description || ''}`.toLowerCase();
  let el = skill?.labElement || 'arcane';
  if (/fire|inferno|flame|hell|meteor|nova|ember|demon/i.test(blob)) el = 'fire';
  else if (/frost|ice|blizzard|glacial|absolute.?zero|chill/i.test(blob)) el = 'ice';
  else if (/holy|divine|sacred|radiant|crusader|beacon|retribution|light/i.test(blob)) el = 'holy';
  else if (/storm|thunder|lightning|tempest|arrow/i.test(blob)) el = 'storm';
  else if (/nature|vine|earth|quake|wild|verdant|root|sprout|ward/i.test(blob)) el = 'nature';
  else if (/arcane|rune|ghost|void|omni|royal|apotheosis|decree/i.test(blob)) el = 'arcane';

  let pathMode = 'stream';
  if (/nova|aoe|wave|blizzard|hellstorm|apocalypse|cataclysm|field/i.test(blob)) pathMode = 'aoe';
  else if (/spike|lash|eruption/i.test(blob)) pathMode = 'spikes';
  else if (/shield|wall|ward|cage|trap|earthquake|fury$/i.test(blob)) pathMode = 'wall';

  let presentation = presentationFor(el).style;
  if (/meteor|hellstorm|supernova|incarnate/i.test(blob)) presentation = 'meteor';
  if (/lightning|thunder|storm.?call|tempest/i.test(blob)) presentation = 'lightning';
  if (/trap|cage|capture|natures.?fury|wild.?apocalypse/i.test(blob)) presentation = 'natureTrap';
  if (/shield|ward/i.test(blob)) presentation = 'shield';

  return bind(el, pathMode, { presentation, note: 'inferred from catalog name' });
}

/**
 * Merge bind onto a flattened catalog skill (runtime enrich).
 * @param {object} skill
 */
export function enrichStaffSkill(skill) {
  if (!skill) return skill;
  const isStaff =
    /staff/i.test(skill.weaponTypeId || '') ||
    /^staff_|^t0_staff_/.test(skill.id || '') ||
    skill.labSlot === 'staff';
  if (!isStaff) return skill;
  const b = inferStaffBind(skill);
  if (!b) return skill;
  skill.labElement = b.element;
  skill.labStyle = 'spell';
  skill.labPack = b.animPack;
  skill.pathMode = b.pathMode;
  skill.castEffectId = b.castEffectId;
  skill.travelEffectId = b.travelEffectId;
  skill.impactEffectId = b.impactEffectId;
  skill.presentation = b.presentation;
  skill.abilityClass = b.abilityClass;
  skill.animation = b.castClip;
  skill.animRole = b.animRole;
  skill.range = skill.range ?? b.rangeM;
  skill.castTime = skill.castTime ?? b.castDuration;
  skill.prefab = {
    ...(skill.prefab || {}),
    castingLab: true,
    castingSpellId: skill.id,
    abilityClass: b.abilityClass,
    pathMode: b.pathMode,
    element: b.element,
    animPack: b.animPack,
    animationClip: b.castClip,
    animRole: b.animRole,
    castEffectId: b.castEffectId,
    travelEffectId: b.travelEffectId,
    impactEffectId: b.impactEffectId,
    presentation: b.presentation,
    vfxRef: b.impactEffectId,
    source: 'staffWeaponSkillsBind'
  };
  return skill;
}

/** All bound catalog skill ids. */
export function allStaffSkillIds() {
  return Object.keys(STAFF_SKILL_BINDS);
}

/**
 * DRC-shaped skill from catalog + bind (for hotbar from STAFF type).
 * @param {object} catalogSkill flattened skill
 */
export function catalogSkillToDrc(catalogSkill) {
  const s = enrichStaffSkill({ ...catalogSkill });
  const b = inferStaffBind(s);
  return {
    id: s.id,
    label: s.name || s.id,
    slot: 0,
    style: 'spell',
    element: b.element,
    abilityElement: abilityKeyForElement(b.element),
    pathMode: b.pathMode,
    presentation: b.presentation,
    animRole: 'cast',
    animPack: 'magic',
    castClip: CAST_CLIP,
    rangeM: s.range || b.rangeM,
    cooldown: s.cooldown || 1,
    castDuration: s.castTime || b.castDuration,
    staminaCost: 10,
    manaCost: s.resourceCost?.mana ?? 8,
    castEffectId: b.castEffectId,
    travelEffectId: b.travelEffectId,
    impactEffectId: b.impactEffectId,
    attachToHand: true,
    weaponId: phase(b.element).staffWeaponId || 'staff',
    catalogSkillId: s.id,
    abilityClass: b.abilityClass,
    damage: s.damage,
    hint: `${s.name} · ${b.pathMode} · ${b.presentation} · → ${s.id}`
  };
}
