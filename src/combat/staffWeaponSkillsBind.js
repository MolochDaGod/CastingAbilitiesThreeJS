/**
 * STAFF skills = master-weaponSkills / WEAPON_SKILLS.html only.
 *
 * Does **not** invent skills, traps, or parallel systems.
 * Only fills empty prefab/anim/VFX so existing catalog ids play with
 * lab transit (Fire|Water|Earth|Wind Ability + staff-type textures).
 *
 * Source: https://info.grudge-studio.com/api/v1/master-weaponSkills.json
 * Browse: https://info.grudge-studio.com/WEAPON_SKILLS.html
 */

import { CASTING_ELEMENT_PHASE_VFX, normalizeElement } from './elementWeaponSkills.js';
import { abilityKeyForElement } from '../config/settings.js';
import {
  staffProjectileMeshUrl,
  STAFF_CHARGE,
  STAFF_NORMAL_ATTACK
} from '../vfx/staffOrbVfx.js';

const CAST_CLIP = 'magic/standing 1h cast spell 01';

const ABILITY_CLASS = {
  fire: 'FireAbility',
  water: 'WaterAbility',
  earth: 'EarthAbility',
  wind: 'WindAbility'
};

/**
 * Staff school → product element + existing Ability texture/style.
 * Schools come from catalog skill id/name/damageType — not new weapons.
 */
const SCHOOL = {
  fire: {
    element: 'fire',
    cast: 'fire_hand',
    travel: 'fireball',
    impact: 'inferno',
    style: 'volley'
  },
  frost: {
    element: 'ice',
    cast: 'arcane_swirl',
    travel: 'moon_beam',
    impact: 'frost_wave',
    style: 'groundFlood'
  },
  holy: {
    element: 'holy',
    cast: 'moon_beam',
    travel: 'moon_beam',
    impact: 'moon_beam',
    style: 'radiance'
  },
  lightning: {
    element: 'storm',
    cast: 'arcane_swirl',
    travel: 'chain_lightning',
    impact: 'ice_lightning_burst',
    style: 'lightning'
  },
  nature: {
    element: 'nature',
    cast: 'earth_surge',
    travel: 'earth_surge',
    impact: 'earth_surge',
    style: 'vineLash'
  },
  arcane: {
    element: 'arcane',
    cast: 'arcane_swirl',
    travel: 'chain_lightning',
    impact: 'inferno',
    style: 'voidBolt'
  }
};

/**
 * Catalog id → school (only ids that exist on WEAPON_SKILLS STAFF).
 * Effects follow catalog text (burn, chill, heal, shield, AoE, signature).
 */
const CATALOG_SCHOOL = Object.freeze({
  // Primaries / secondaries / abilities (catalog written)
  staff_fire_bolt: 'fire',
  staff_frost_bolt: 'frost',
  staff_holy_light: 'holy',
  staff_flame_wave: 'fire',
  staff_ice_nova: 'frost',
  staff_divine_wave: 'holy',
  staff_inferno_shield: 'fire',
  staff_glacial_shield: 'frost',
  staff_meteor_strike: 'fire',
  staff_blizzard: 'frost',
  staff_radiant_heal: 'holy',
  staff_hellstorm: 'fire',
  staff_absolute_zero: 'frost',
  // Signatures on STAFF type (catalog)
  staff_flame_nova: 'fire',
  staff_iceblood_eruption: 'frost',
  staff_holy_beacon: 'holy',
  staff_sacred_apocalypse: 'holy',
  staff_storm_call: 'lightning',
  staff_thunder_cataclysm: 'lightning',
  staff_wrath_of_the_tempest: 'lightning',
  staff_inferno_incarnate: 'fire',
  staff_generals_decree: 'arcane',
  staff_wrath_of_the_wilds: 'nature',
  staff_rune_apocalypse: 'arcane',
  staff_demon_lords_wrath: 'fire',
  staff_ghost_executioner: 'arcane',
  staff_thundergods_judgment: 'lightning',
  staff_earthquake: 'nature',
  staff_crusaders_light: 'holy',
  staff_manifest_destiny: 'holy',
  staff_royal_decree: 'arcane',
  staff_supernova: 'fire',
  staff_arcane_apotheosis: 'arcane',
  staff_army_of_the_dead: 'arcane',
  staff_retribution: 'holy',
  staff_omniscience: 'arcane',
  staff_storm_of_arrows: 'lightning',
  staff_warchiefs_fury: 'nature',
  staff_natures_fury: 'nature',
  staff_verdant_cataclysm: 'nature',
  staff_wild_apocalypse: 'nature',
  // T0 STAFF starters
  t0_staff_practice_root: 'nature',
  t0_staff_nature_ward: 'nature',
  t0_staff_vine_lash: 'nature',
  t0_staff_healing_sprout: 'nature'
});

/**
 * Path mode from catalog role/text only (stream bolt · aoe · spikes · wall/shield).
 * @param {object} skill
 * @param {string} school
 */
function pathModeFromCatalog(skill, school) {
  const blob = `${skill?.id || ''} ${skill?.name || ''} ${skill?.description || ''} ${(skill?.effects || []).join(' ')}`.toLowerCase();
  const slot = String(skill?.slotType || skill?.slotLabel || '').toLowerCase();

  if (/shield|ward|absorb|reflect/.test(blob)) return 'wall';
  if (/meteor|delay/.test(blob)) return 'stream';
  if (/earthquake|quake/.test(blob)) return 'wall';
  if (/vine.?lash|spike|eruption/.test(blob)) return 'spikes';
  if (
    /aoe|nova|wave|blizzard|hellstorm|cataclysm|apocalypse|zone|field|channel|purge|massive|large/.test(
      blob
    ) ||
    slot === 'secondary' ||
    slot === 'ultimate'
  ) {
    // Single-target primaries stay stream even if ultimate is AoE
    if (slot === 'primary' && !/aoe|nova|wave/.test(blob)) return 'stream';
    return 'aoe';
  }
  if (school === 'lightning' && /storm.?call|thunder|judgment|arrow/.test(blob)) return 'stream';
  return 'stream';
}

/**
 * Presentation flag for existing VfxDirector recipes only (not new skill systems).
 * @param {object} skill
 * @param {string} school
 * @param {string} pathMode
 */
function presentationFromCatalog(skill, school, pathMode) {
  const blob = `${skill?.id || ''} ${skill?.name || ''} ${skill?.description || ''}`.toLowerCase();
  if (/meteor|hellstorm|supernova|incarnate|demon/.test(blob)) return 'meteor';
  if (pathMode === 'wall' || /shield|ward/.test(blob)) return 'shield';
  if (school === 'lightning') return 'lightning';
  if (school === 'holy' || /heal|radiant|divine|beacon|crusader|retribution|salvation/.test(blob))
    return 'radiance';
  if (school === 'nature') return 'vineLash';
  if (school === 'frost') return pathMode === 'aoe' ? 'groundFlood' : 'groundFlood';
  if (school === 'fire') return pathMode === 'stream' && !/meteor/.test(blob) ? 'volley' : 'volley';
  if (school === 'arcane') return 'voidBolt';
  return SCHOOL[school]?.style || 'volley';
}

/**
 * Infer school when id not in CATALOG_SCHOOL (unknown future catalog row).
 * @param {object} skill
 */
function schoolFromSkill(skill) {
  const id = skill?.id || '';
  if (CATALOG_SCHOOL[id]) return CATALOG_SCHOOL[id];

  const dmg = String(skill?.damageType || '').toLowerCase();
  if (dmg === 'fire') return 'fire';
  if (dmg === 'frost' || dmg === 'ice') return 'frost';
  if (dmg === 'holy' || dmg === 'light') return 'holy';
  if (dmg === 'lightning' || dmg === 'storm') return 'lightning';
  if (dmg === 'nature' || dmg === 'earth') return 'nature';
  if (dmg === 'arcane') return 'arcane';

  const blob = `${id} ${skill?.name || ''} ${skill?.description || ''}`.toLowerCase();
  if (/fire|flame|inferno|hell|meteor|ember|demon|nova|supernova/.test(blob)) return 'fire';
  if (/frost|ice|blizzard|glacial|chill|absolute.?zero|iceblood/.test(blob)) return 'frost';
  if (/holy|divine|sacred|radiant|crusader|beacon|retribution|light|salvation/.test(blob))
    return 'holy';
  if (/storm|thunder|lightning|tempest|arrow/.test(blob)) return 'lightning';
  if (/nature|vine|earth|quake|wild|verdant|root|sprout|ward|warchief/.test(blob)) return 'nature';
  return 'arcane';
}

/**
 * Build runtime bind from a **catalog** skill row only.
 * @param {object} skill flattened master-weaponSkills skill
 */
export function bindFromCatalogSkill(skill) {
  if (!skill?.id) return null;
  const school = schoolFromSkill(skill);
  const s = SCHOOL[school] || SCHOOL.arcane;
  const pathMode = pathModeFromCatalog(skill, school);
  const presentation = presentationFromCatalog(skill, school, pathMode);
  const el = normalizeElement(s.element);
  const key = abilityKeyForElement(el);
  const phase = CASTING_ELEMENT_PHASE_VFX[el] || CASTING_ELEMENT_PHASE_VFX.arcane;

  // Shields: aura-style impacts from existing catalog effects
  let cast = s.cast;
  let travel = s.travel;
  let impact = s.impact;
  if (pathMode === 'wall' && school === 'fire') {
    cast = travel = impact = 'fire_aura';
  } else if (pathMode === 'wall' && school === 'frost') {
    cast = 'frost_wave';
    travel = 'moon_beam';
    impact = 'frost_wave';
  } else if (pathMode === 'wall' && school === 'nature') {
    cast = travel = impact = 'earth_surge';
  }
  // Ice nova / freeze blast → around_caster freeze presentation
  if (
    school === 'frost' &&
    (pathMode === 'aoe' || /ice.?nova|absolute.?zero|freeze|blizzard/i.test(`${skill?.id || ''} ${skill?.name || ''}`))
  ) {
    cast = 'frost_wave';
    travel = 'moon_beam';
    impact = 'frost_wave';
  }

  const castDuration =
    skill.castTime != null && skill.castTime > 0 ? Number(skill.castTime) : 0.85;
  const rangeM = skill.range != null && skill.range > 0 ? Number(skill.range) : 14;

  // Slot-1 / primary stream bolts share staff normal attack contract (orb + charge)
  const isPrimary =
    String(skill?.slotType || skill?.slotLabel || '').toLowerCase() === 'primary' ||
    /practice|bolt|spark|ping|root/.test(`${skill?.id || ''} ${skill?.name || ''}`.toLowerCase());
  const useOrb = pathMode === 'stream' || isPrimary;

  return {
    catalogSkillId: skill.id,
    name: skill.name || skill.id,
    school,
    element: el,
    pathMode,
    presentation,
    castEffectId: cast,
    travelEffectId: travel,
    impactEffectId: impact,
    abilityClass: ABILITY_CLASS[key] || 'WindAbility',
    rangeM: isPrimary ? STAFF_NORMAL_ATTACK.rangeM : rangeM,
    castDuration: isPrimary
      ? Math.min(castDuration, STAFF_NORMAL_ATTACK.castDuration + 0.15)
      : castDuration,
    cooldown:
      skill.cooldown != null
        ? Number(skill.cooldown)
        : isPrimary
          ? STAFF_NORMAL_ATTACK.cooldown
          : 1,
    damage: skill.damage,
    manaCost: skill.resourceCost?.mana ?? skill.manaCost ?? 5,
    animRole: 'cast',
    animPack: 'magic',
    castClip: CAST_CLIP,
    staffWeaponId: phase.staffWeaponId,
    // Per-element orb (gd_orbs) + charge shell — individually managed by staff attack
    useOrbProjectile: useOrb,
    projectileMeshUrl: useOrb ? staffProjectileMeshUrl(el) : null,
    chargeMeshUrl: STAFF_CHARGE.path,
    // Catalog text for UI/toasts — never invent effects
    description: skill.description || '',
    effects: skill.effects || [],
    damageType: skill.damageType || school
  };
}

/** @param {string} skillId */
export function staffBindFor(skillId) {
  if (!skillId || !CATALOG_SCHOOL[skillId]) return null;
  return bindFromCatalogSkill({ id: skillId, name: skillId });
}

/**
 * Prefer full catalog row when available.
 * @param {object} skill
 */
export function inferStaffBind(skill) {
  return bindFromCatalogSkill(skill);
}

/**
 * Merge lab transit onto catalog skill in place (empty prefabs only filled).
 * Does not create new skill ids.
 * @param {object} skill
 */
export function enrichStaffSkill(skill) {
  if (!skill?.id) return skill;
  const isStaff =
    /staff/i.test(skill.weaponTypeId || '') ||
    /^staff_|^t0_staff_/.test(skill.id) ||
    skill.labSlot === 'staff';
  if (!isStaff) return skill;

  const b = bindFromCatalogSkill(skill);
  if (!b) return skill;

  skill.labElement = b.element;
  skill.labStyle = 'spell';
  skill.labPack = b.animPack;
  skill.pathMode = b.pathMode;
  skill.presentation = b.presentation;
  skill.castEffectId = b.castEffectId;
  skill.travelEffectId = b.travelEffectId;
  skill.impactEffectId = b.impactEffectId;
  skill.abilityClass = b.abilityClass;
  skill.animation = skill.animation || b.castClip;
  skill.animRole = 'cast';
  skill.useOrbProjectile = b.useOrbProjectile;
  skill.projectileMeshUrl = b.projectileMeshUrl;
  skill.chargeMeshUrl = b.chargeMeshUrl;
  if (skill.range == null) skill.range = b.rangeM;
  if (skill.castTime == null) skill.castTime = b.castDuration;

  skill.prefab = {
    ...(skill.prefab || {}),
    // Preserve any non-null catalog refs; fill nulls only
    castingLab: true,
    castingSpellId: skill.id,
    abilityClass: b.abilityClass,
    pathMode: b.pathMode,
    element: b.element,
    school: b.school,
    animPack: b.animPack,
    animationClip: skill.prefab?.animationClip || b.castClip,
    animRole: 'cast',
    castEffectId: skill.prefab?.castEffectId || b.castEffectId,
    travelEffectId: skill.prefab?.travelEffectId || b.travelEffectId,
    impactEffectId: skill.prefab?.impactEffectId || b.impactEffectId,
    presentation: b.presentation,
    vfxRef: skill.prefab?.vfxRef || b.impactEffectId,
    source: 'WEAPON_SKILLS STAFF · staffWeaponSkillsBind'
  };
  return skill;
}

/** Only real catalog STAFF ids we know. */
export function allStaffSkillIds() {
  return Object.keys(CATALOG_SCHOOL);
}

/**
 * DRC skill from catalog row (no invented fields beyond lab transit).
 * @param {object} catalogSkill
 */
export function catalogSkillToDrc(catalogSkill) {
  const s = enrichStaffSkill({ ...catalogSkill });
  const b = bindFromCatalogSkill(s);
  if (!b) return null;
  return {
    id: s.id,
    label: s.name || s.id,
    slot: 0,
    style: 'spell',
    element: b.element,
    abilityElement: b.element,
    pathMode: b.pathMode,
    presentation: b.presentation,
    animRole: 'cast',
    animPack: 'magic',
    castClip: CAST_CLIP,
    rangeM: b.rangeM,
    cooldown: b.cooldown,
    castDuration: b.castDuration,
    staminaCost: 8,
    manaCost: b.manaCost,
    castEffectId: b.castEffectId,
    travelEffectId: b.travelEffectId,
    impactEffectId: b.impactEffectId,
    attachToHand: true,
    weaponId: b.staffWeaponId || 'staff',
    catalogSkillId: s.id,
    abilityClass: b.abilityClass,
    damage: s.damage,
    hint: `${s.name} · ${b.school} · ${b.pathMode} · catalog ${s.id}`
  };
}

export { CATALOG_SCHOOL, SCHOOL };
