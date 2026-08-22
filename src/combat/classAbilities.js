/**
 * Class combat slots — ObjectStore trees + class relics.
 *
 *   F tap     → starter (slot f)
 *   Shift+1–5 → class abilities
 *   Hold F    → radial: rebind slot + pick sub-ability
 *
 * Eight Warlords specs. Do not invent skill ids — use master-skillTrees.json.
 * Weapon 1–3 stay on the equipped item (Digit 1–3, no Shift).
 *
 * @see api/classSkillTrees.js · master-classRelics.json
 */

import {
  CLASS_IDS,
  classIdFromRole,
  ensureClassSkillTrees,
  flattenClassSkills,
  getClassTree,
  resolveClassSkillIcon
} from '../api/classSkillTrees.js';
import { ASSETS_URL } from '../config/fleetEnv.js';
import { inferColliderClass, inferTravelClass, playDefaultsForClass } from './playClasses.js';
import { variantHintForElement } from '../vfx/effectVariants.js';
import { presentationFor } from './elementPresentation.js';

const LS_CLASS = 'casting.playerClass.v1';
const LS_SLOTS = 'casting.classAbilitySlots.v1';

/** ObjectStore class relics — identity item per class. */
export const CLASS_ITEMS = Object.freeze({
  warrior: {
    classId: 'warrior',
    id: 'dual_wield',
    name: 'Dual Wield',
    slot: 'mainhand',
    type: 'weapon_mastery',
    description:
      'Warriors fight with a blade in each hand. Unlocks paired 1H loadouts and attack-speed chains.',
    effect: 'Two 1H weapons · +30% attack speed · skills chain across both hands',
    iconPath: '/icons/skills_rpg/skill_dual_wield.png',
    ready: true
  },
  mage: {
    classId: 'mage',
    id: 'wand',
    name: 'Wand',
    slot: 'mainhand',
    type: 'weapon_mastery',
    description:
      'Mages channel through a wand. Fast-cast 1H spells pair with a tome off-hand. Priest is the disc healer spec.',
    effect: 'Wand main · tome off · rapid spell slots · arcane chains',
    iconPath: '/icons/pack/weapons/staff_31.png',
    ready: true
  },
  ranger: {
    classId: 'ranger',
    id: 'nimble_fingers',
    name: 'Nimble Fingers',
    slot: 'innate',
    type: 'passive_mastery',
    description:
      'Ranger Scouts rely on reflexes. Traps, reloads, and perfect-parry counters.',
    effect:
      '+15% attack speed · trap deploy · parry stun + dash counter · smoke-bomb invis (catalog invis/stealth)',
    iconPath: '/icons/skills_rpg/skill_quick_strike.png',
    ready: true
  },
  worge: {
    classId: 'worge',
    id: 't0-offhand-tome',
    name: 'Novice Tome',
    slot: 'offhand',
    type: 'offhand_relic',
    description: 'Worge shapeshifter — 1H + tome, then forms.',
    effect: 'Tome off-hand · form skills · pack hunt',
    iconPath: '/icons/pack/weapons/Book_1.png',
    ready: true
  },
  priest: {
    classId: 'priest',
    id: 'holy_tome',
    name: 'Discipline Tome',
    slot: 'offhand',
    type: 'offhand_relic',
    description: 'Priest channels Atonement through a holy tome. Wand or staff main.',
    effect: 'Tome off · smite feeds heals · shields and dispel',
    iconPath: '/icons/pack/weapons/Book_1.png',
    ready: true
  },
  raider: {
    classId: 'raider',
    id: 'two_hand',
    name: 'Two-Hand',
    slot: 'mainhand',
    type: 'weapon_mastery',
    description: 'Raiders fight with a two-hander. Parry is the armor.',
    effect: '2H only · parry window on every swing · Overpower after parry',
    iconPath: '/icons/skills_rpg/skill_dual_wield.png',
    ready: true
  },
  thief: {
    classId: 'thief',
    id: 'outlaw_pair',
    name: 'Outlaw Pair',
    slot: 'mainhand',
    type: 'weapon_mastery',
    description: 'Thief fights with blade and pistol. Combo spenders, peel, vanish.',
    effect: '1H + pistol · combo · interrupt · smoke bomb',
    iconPath: '/icons/skills_rpg/skill_quick_strike.png',
    ready: true
  },
  verduror: {
    classId: 'verduror',
    id: 'nature_staff',
    name: 'Jade Staff',
    slot: 'mainhand',
    type: 'weapon_mastery',
    description: 'Verduror mistweaver — nature staff, crane kicks, jade mist forms.',
    effect: 'Nature staff · mist HPS while moving · detox',
    iconPath: '/icons/pack/weapons/staff_31.png',
    ready: true
  }
});

/**
 * Default F + Shift+1–5 from catalog ids (L1 starter, then granted / actives).
 * Subs = other tree nodes the player can swap onto that slot.
 */
export const CLASS_SLOT_DEFAULTS = Object.freeze({
  warrior: {
    f: 'w_taunt',
    slots: ['w_quick_strike', 'w_guardian_aura', 'w_demoralizing_shout', 'w_life_drain', 'w_concussive_blow'],
    blurb: 'Taunt opener · dual-wield pressure · shouts and execute later'
  },
  mage: {
    f: 'm_arcane_focus',
    slots: ['m_mana_flow', 'm_flame_brand', 'm_blessing', 'm_chain_lightning', 'm_meteor'],
    blurb: 'Wand bolt · brands and heals · meteor / cataclysm as swaps'
  },
  ranger: {
    f: 'r_precision',
    slots: ['r_swift_draw', 'r_venom_arrow', 'r_hunters_mark', 'r_piercing', 'r_headshot'],
    blurb: 'Marked shot · poison / pierce · hunter mark as control'
  },
  worge: {
    f: 'wr_storm_touch',
    slots: ['wr_bark_skin', 'wr_lacerate', 'wr_soothing_rain', 'wr_thunderclap', 'wr_entangle'],
    blurb: 'Worge · forms and pack · ObjectStore tree keyed worge'
  },
  priest: {
    f: 'p_atonement',
    slots: ['p_smite', 'p_flash_mend', 'p_pw_shield', 'p_purify', 'p_pain_reflect'],
    blurb: 'Atonement heal from damage · shields · dispel · pain reflect'
  },
  raider: {
    f: 'rd_riposte',
    slots: ['rd_overpower', 'rd_rend', 'rd_mortal', 'rd_die_by_sword', 'rd_bladestorm'],
    blurb: '2H parry window · Overpower · mortal · last stand'
  },
  thief: {
    f: 't_between',
    slots: ['t_sinister', 't_pistol', 't_blade_flurry', 't_adrenaline', 't_killing_spree'],
    blurb: 'Outlaw combo · pistol interrupt · flurry · vanish'
  },
  verduror: {
    f: 'v_jade_mist',
    slots: ['v_soothing_mist', 'v_crane_kick', 'v_enveloping', 'v_revival', 'v_celestial'],
    blurb: 'Jade mist · crane kick heals · detox · celestial form'
  }
});

export { CLASS_IDS };

/**
 * F + Shift+1–5 — anim, catalog VFX, travel. ObjectStore ids only.
 * Catalog effectIds: fire_hand · inferno · frost_wave · earth_surge ·
 * arcane_swirl · moon_beam · chain_lightning · ice_lightning_burst ·
 * getsuga_slash · fire_aura. Never holy_burst (not in vfxCatalog).
 */
export const CLASS_SKILL_BIND = Object.freeze({
  w_taunt: { animRole: 'attack', cast: 'earth_surge', impact: 'earth_surge', travel: 'melee' },
  w_quick_strike: { animRole: 'attack1', impact: 'getsuga_slash', travel: 'melee' },
  w_guardian_aura: {
    animRole: 'cast',
    cast: 'fire_aura',
    impact: 'fire_aura',
    skillKind: 'buff',
    isWard: true
  },
  w_demoralizing_shout: {
    animRole: 'cast',
    cast: 'earth_surge',
    impact: 'earth_surge',
    skillKind: 'debuff'
  },
  w_life_drain: {
    animRole: 'cast',
    cast: 'arcane_swirl',
    impact: 'arcane_swirl',
    travel: 'linear',
    element: 'arcane',
    variant: 'arcane_bolt'
  },
  w_concussive_blow: { animRole: 'attack2', impact: 'earth_surge', travel: 'melee' },

  m_arcane_focus: { animRole: 'cast', cast: 'arcane_swirl', skillKind: 'buff', isFocus: true },
  m_mana_flow: { animRole: 'cast', cast: 'arcane_swirl', skillKind: 'buff' },
  m_flame_brand: {
    animRole: 'cast',
    cast: 'fire_hand',
    impact: 'inferno',
    travel: 'linear',
    element: 'fire',
    variant: 'fire_bolt'
  },
  m_blessing: { animRole: 'cast', cast: 'moon_beam', impact: 'moon_beam', skillKind: 'buff' },
  m_chain_lightning: {
    animRole: 'cast',
    cast: 'arcane_swirl',
    impact: 'ice_lightning_burst',
    travel: 'linear',
    element: 'storm',
    variant: 'arc_bolt'
  },
  m_meteor: {
    animRole: 'cast',
    cast: 'fire_hand',
    impact: 'inferno',
    travel: 'linear',
    element: 'fire',
    isAoE: true,
    variant: 'aoe_meteor',
    hitFrameDelay: 0.42
  },

  r_precision: { animRole: 'cast', cast: 'arcane_swirl', skillKind: 'buff', isFocus: true },
  r_swift_draw: { animRole: 'attack', impact: 'getsuga_slash', travel: 'linear', variant: 'arcane_fast' },
  r_venom_arrow: {
    animRole: 'attack',
    cast: 'earth_surge',
    impact: 'earth_surge',
    travel: 'bend',
    element: 'nature',
    variant: 'poison_arc'
  },
  r_hunters_mark: { animRole: 'cast', cast: 'arcane_swirl', skillKind: 'debuff' },
  r_piercing: { animRole: 'attack', impact: 'getsuga_slash', travel: 'linear', variant: 'arcane_bolt' },
  r_headshot: {
    animRole: 'attack',
    impact: 'earth_surge',
    travel: 'linear',
    variant: 'arcane_fast',
    hitFrameDelay: 0.22
  },

  wr_storm_touch: {
    animRole: 'cast',
    cast: 'arcane_swirl',
    impact: 'ice_lightning_burst',
    travel: 'linear',
    element: 'storm',
    variant: 'arc_bolt'
  },
  wr_bark_skin: {
    animRole: 'cast',
    cast: 'earth_surge',
    impact: 'earth_surge',
    skillKind: 'buff',
    isWard: true
  },
  wr_lacerate: { animRole: 'attack1', impact: 'getsuga_slash', travel: 'melee' },
  wr_soothing_rain: {
    animRole: 'cast',
    cast: 'frost_wave',
    impact: 'frost_wave',
    skillKind: 'buff'
  },
  wr_thunderclap: { animRole: 'attack2', impact: 'ice_lightning_burst', travel: 'melee', isAoE: true },
  wr_entangle: {
    animRole: 'cast',
    cast: 'earth_surge',
    impact: 'earth_surge',
    travel: 'bend',
    element: 'nature',
    variant: 'nature_vine'
  },

  p_atonement: {
    animRole: 'cast',
    cast: 'moon_beam',
    impact: 'moon_beam',
    travel: 'linear',
    element: 'holy',
    variant: 'holy_beam'
  },
  p_smite: {
    animRole: 'cast',
    cast: 'moon_beam',
    impact: 'moon_beam',
    travel: 'linear',
    element: 'holy',
    variant: 'holy_beam'
  },
  p_flash_mend: { animRole: 'cast', cast: 'arcane_swirl', impact: 'moon_beam', skillKind: 'buff' },
  p_pw_shield: {
    animRole: 'cast',
    cast: 'arcane_swirl',
    impact: 'arcane_swirl',
    skillKind: 'buff',
    isWard: true
  },
  p_purify: { animRole: 'cast', cast: 'moon_beam', impact: 'moon_beam', skillKind: 'buff' },
  p_pain_reflect: { animRole: 'cast', cast: 'arcane_swirl', impact: 'inferno', skillKind: 'buff' },

  rd_riposte: { animRole: 'attack', impact: 'getsuga_slash', travel: 'melee' },
  rd_overpower: { animRole: 'attack2', impact: 'getsuga_slash', travel: 'melee' },
  rd_rend: { animRole: 'attack1', impact: 'getsuga_slash', travel: 'melee' },
  rd_mortal: { animRole: 'attack3', impact: 'earth_surge', travel: 'melee' },
  rd_die_by_sword: {
    animRole: 'block',
    cast: 'earth_surge',
    impact: 'earth_surge',
    skillKind: 'buff',
    isWard: true
  },
  rd_bladestorm: { animRole: 'attack3', impact: 'getsuga_slash', travel: 'melee', isAoE: true },

  t_between: { animRole: 'dodgeB', impact: 'getsuga_slash', travel: 'melee' },
  t_sinister: { animRole: 'attack1', impact: 'getsuga_slash', travel: 'melee' },
  t_pistol: { animRole: 'gunplay', impact: 'earth_surge', travel: 'bullet' },
  t_blade_flurry: { animRole: 'attack2', impact: 'getsuga_slash', travel: 'melee', isAoE: true },
  t_adrenaline: { animRole: 'cast', cast: 'fire_aura', impact: 'fire_aura', skillKind: 'buff' },
  t_killing_spree: { animRole: 'attack3', impact: 'inferno', travel: 'melee' },

  v_jade_mist: {
    animRole: 'cast',
    cast: 'earth_surge',
    impact: 'earth_surge',
    travel: 'bend',
    element: 'nature',
    variant: 'jade_mist'
  },
  v_soothing_mist: {
    animRole: 'cast',
    cast: 'earth_surge',
    impact: 'earth_surge',
    travel: 'bend',
    element: 'nature',
    variant: 'jade_mist'
  },
  v_crane_kick: { animRole: 'attack', impact: 'earth_surge', travel: 'melee' },
  v_enveloping: {
    animRole: 'cast',
    cast: 'earth_surge',
    impact: 'earth_surge',
    travel: 'bend',
    element: 'nature',
    variant: 'nature_vine'
  },
  v_revival: {
    animRole: 'cast',
    cast: 'moon_beam',
    impact: 'earth_surge',
    skillKind: 'buff',
    isAoE: true
  },
  v_celestial: { animRole: 'cast', cast: 'moon_beam', impact: 'moon_beam', skillKind: 'buff' }
});

export function getSavedClassId() {
  try {
    const v = localStorage.getItem(LS_CLASS);
    if (v === 'knight' || v === 'worg') return 'worge';
    if (CLASS_IDS.includes(v)) return v;
  } catch {
    /* */
  }
  return null;
}

export function saveClassId(classId) {
  const id = classIdFromRole(classId);
  try {
    localStorage.setItem(LS_CLASS, id);
  } catch {
    /* */
  }
  return id;
}

/**
 * Resolve product class: saved pick → look preset → warrior (not mage-for-everyone).
 * @param {{ presetId?: string, classId?: string }|null} character
 */
export function resolvePlayerClass(character) {
  const saved = getSavedClassId();
  if (saved) return saved;
  if (character?.classId && CLASS_IDS.includes(character.classId)) return character.classId;
  return classIdFromRole(character?.presetId || character?.roleId || 'warrior');
}

export function classItemFor(classId) {
  const id = classIdFromRole(classId);
  const item = CLASS_ITEMS[id];
  if (!item) return CLASS_ITEMS.warrior;
  return {
    ...item,
    iconUrl: item.iconPath ? `${ASSETS_URL}${item.iconPath}` : ''
  };
}

function loadSlotMap() {
  try {
    const raw = JSON.parse(localStorage.getItem(LS_SLOTS) || '{}');
    return raw && typeof raw === 'object' ? raw : {};
  } catch {
    return {};
  }
}

function saveSlotMap(map) {
  try {
    localStorage.setItem(LS_SLOTS, JSON.stringify(map));
  } catch {
    /* */
  }
}

/**
 * @param {string} classId
 * @returns {{ f: string, slots: string[] }}
 */
export function getClassLoadout(classId) {
  const id = classIdFromRole(classId);
  const def = CLASS_SLOT_DEFAULTS[id] || CLASS_SLOT_DEFAULTS.warrior;
  const saved = loadSlotMap()[id];
  const slots = Array.isArray(saved?.slots) ? saved.slots.slice(0, 5) : def.slots.slice();
  while (slots.length < 5) slots.push(def.slots[slots.length] || def.f);
  return {
    f: saved?.f && typeof saved.f === 'string' ? saved.f : def.f,
    slots
  };
}

/**
 * @param {string} classId
 * @param {'f'|0|1|2|3|4} slot
 * @param {string} skillId
 */
export function setClassLoadoutSlot(classId, slot, skillId) {
  const id = classIdFromRole(classId);
  const cur = getClassLoadout(id);
  if (slot === 'f' || slot === -1) cur.f = skillId;
  else {
    const i = Number(slot);
    if (i >= 0 && i < 5) cur.slots[i] = skillId;
  }
  const all = loadSlotMap();
  all[id] = cur;
  saveSlotMap(all);
  return cur;
}

export function classSkillById(classId, skillId) {
  const tree = getClassTree(classId);
  return flattenClassSkills(tree).find((s) => s.id === skillId || s.grantedAbility?.id === skillId) || null;
}

/**
 * Sub-ability candidates for a slot (same tree, prefer granted + actives).
 * @param {string} classId
 */
export function classAbilityCandidates(classId) {
  const tree = getClassTree(classId);
  const flat = flattenClassSkills(tree);
  const actives = flat.filter((s) => !s.passive);
  const list = actives.length ? actives : flat;
  return list.map((s) => ({
    id: s.id,
    name: s.grantedAbility?.name || s.name,
    iconUrl: resolveClassSkillIcon(s.iconUrl || s.icon || s.grantedAbility?.iconUrl),
    passive: !!s.passive,
    granted: !!s.grantedAbility,
    description: s.grantedAbility?.description || s.description || s.effect || '',
    requiredLevel: s.requiredLevel || 1
  }));
}

function playStyleFor(node) {
  const g = node?.grantedAbility || {};
  const t = String(g.type || node?.name || node?.effect || node?.description || '').toLowerCase();
  if (node?.passive && !g.id) return 'passive';
  if (/heal/.test(t) || g.healPercent) return 'heal';
  if (/buff|aura|regen|defense|ward/.test(t) && (g.target === 'self' || !g.damage)) return 'buff';
  if (/debuff|shout|taunt|mark|sleep|confuse/.test(t) && !(g.damage > 0)) return 'debuff';
  if (/magical|spell|arcane|fire|ice|storm|nature|holy/.test(t)) return 'spell';
  if (/physical|strike|shot|blow|slash/.test(t)) return 'physical';
  if (g.manaCost > 0) return 'spell';
  if (g.staminaCost > 0) return 'physical';
  return 'buff';
}

/**
 * Compile a tree node into a DRC-playable skill (no invented catalog ids).
 * @param {string} classId
 * @param {string} skillId
 */
export function compileClassSkill(classId, skillId) {
  const node = classSkillById(classId, skillId);
  if (!node) return null;
  const g = node.grantedAbility || {};
  const style = playStyleFor(node);
  const label = g.name || node.name || skillId;
  const cd = Number(g.cooldown ?? 4);
  const effects = [g.description, node.description, node.effect, g.effect?.type]
    .filter(Boolean)
    .join(' · ');
  const element =
    /fire|flame|ignite|burn/.test(effects) ? 'fire'
    : /ice|frost|sleep/.test(effects) ? 'ice'
    : /storm|thunder|lightning/.test(effects) ? 'storm'
    : /nature|vine|rain|bark|entangle/.test(effects) ? 'nature'
    : /holy|bless|divine|purify/.test(effects) ? 'holy'
    : style === 'spell' ? 'arcane'
    : null;
  const spec = playDefaultsForClass(classId);
  const bind = CLASS_SKILL_BIND[node.id] || CLASS_SKILL_BIND[skillId] || {};
  const el = bind.element || element;
  const pres = el ? presentationFor(el) : null;
  const skillKind =
    bind.skillKind ||
    (bind.travel
      ? 'attack'
      : style === 'heal' || style === 'buff' || style === 'debuff' || style === 'passive'
        ? 'buff'
        : 'attack');
  const drafted = {
    id: node.id,
    style: style === 'passive' ? 'buff' : style === 'physical' ? 'melee' : style,
    classId: classIdFromRole(classId),
    element: el,
    effects: [effects],
    isAoE: !!(bind.isAoE || g.isAoE),
    pathMode: /mist|vine|entangle|stream|jade/.test(effects) ? 'stream' : null,
    skillKind,
    travelMode: bind.travel
  };
  const travelMode =
    bind.travel || (skillKind === 'buff' ? undefined : inferTravelClass(drafted));
  const colliderClass = inferColliderClass({ ...drafted, travelMode });
  const playStyle =
    travelMode === 'bullet'
      ? 'ranged'
      : style === 'passive'
        ? 'buff'
        : style === 'physical'
          ? 'melee'
          : style;
  const aoe = !!(bind.isAoE || g.isAoE);
  const variantHint =
    bind.variant ||
    variantHintForElement(el || 'arcane', { aoe, bend: travelMode === 'bend' });
  return {
    id: node.id,
    catalogSkillId: g.id || node.id,
    label,
    classId: classIdFromRole(classId),
    isClassAbility: true,
    style: playStyle,
    skillKind,
    isFocus: !!bind.isFocus,
    isWard: !!bind.isWard,
    target: g.target || (playStyle === 'buff' || playStyle === 'heal' ? 'self' : 'enemy'),
    animRole: bind.animRole || (playStyle === 'melee' || playStyle === 'ranged' ? 'attack' : 'cast'),
    cooldown: cd,
    castDuration:
      playStyle === 'melee' || playStyle === 'ranged' ? 0.22 : bind.hitFrameDelay ? bind.hitFrameDelay + 0.12 : 0.4,
    staminaCost: Number(g.staminaCost ?? (playStyle === 'spell' || playStyle === 'heal' ? 0 : 12)),
    manaCost: Number(g.manaCost ?? (playStyle === 'spell' || playStyle === 'heal' ? 16 : 0)),
    rangeM: aoe ? 8 : playStyle === 'spell' ? 16 : 6,
    damage: Number(g.damage ?? 0),
    element: el,
    abilityElement: el,
    effects: [effects],
    granted: g,
    iconUrl: resolveClassSkillIcon(node.iconUrl || node.icon || g.iconUrl),
    description: g.description || node.description || node.effect || '',
    isAoE: aoe,
    passive: !!node.passive && !g.id,
    travelMode,
    colliderClass,
    animPack: spec.pack,
    hitFrameDelay:
      bind.hitFrameDelay ?? (playStyle === 'melee' || playStyle === 'ranged' ? 0.18 : 0.28),
    variantHint,
    castEffectId: bind.cast || pres?.castEffectId || 'arcane_swirl',
    travelEffectId: pres?.travelEffectId || null,
    impactEffectId:
      bind.impact ||
      pres?.impactEffectId ||
      (playStyle === 'melee' ? 'getsuga_slash' : 'arcane_swirl'),
    procs: [],
    editable: {
      intensity: true,
      aoe: true,
      travelMode: true,
      colliderClass: true,
      knobs: ['settings.effect', 'effectVariants', `skills/production/${node.id}.json`]
    }
  };
}

export function compileClassLoadout(classId) {
  const load = getClassLoadout(classId);
  return {
    f: compileClassSkill(classId, load.f),
    slots: load.slots.map((id) => compileClassSkill(classId, id))
  };
}

export async function ensureClassCombatReady() {
  await ensureClassSkillTrees();
  return true;
}

export function classSlotHotkey(slot) {
  if (slot === 'f' || slot === -1) return 'F';
  return `⇧${Number(slot) + 1}`;
}
