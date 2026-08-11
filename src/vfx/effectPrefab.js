/**
 * EffectPrefab — isolatable shared effect primitives for Warlords skill export.
 *
 * Lab authoring path:
 *   settings.effect + settings.residual (+ element blocks)
 *     → buildEffectPrefab(skillId)
 *     → JSON download / paste into Open · Warlords skill vfx arrays
 *
 * Do not invent a second VFX engine. Primitives compose existing systems:
 *   PathTrail · BurstSphere · GroundDecals · VfxDirector · Ability path
 *
 * @see docs/CASTING_LAB_SSOT.md
 * @see gameopen/docs/MELEE_SLASH_FX.md
 * @see gameopen/docs/vfx/STRAWBERRY_STRIKE_MULTI_FX.md
 */

import { settings } from '../config/settings.js';
import { CASTING_ELEMENT_PHASE_VFX } from '../combat/elementWeaponSkills.js';
import { SKILL_VFX_BIND, vfxCatalogById } from './vfxCatalog.js';
import { skillById } from '../combat/drcSkills.js';

/** @typedef {'trail'|'travel'|'cast'|'impact'|'residual'|'decal'|'aura'} EffectKind */

/**
 * @typedef {object} EffectPrimitive
 * @property {EffectKind} kind
 * @property {number} intensity  0..2
 * @property {number} aoe        metres
 * @property {number} speed      m/s
 * @property {number} size       SI scale
 * @property {string} color      #rrggbb
 * @property {string} [meshId]
 * @property {number} [duration]
 * @property {'R_hand'|'L_hand'|'root'|'feet'|'weapon_tip'} [attach]
 * @property {string} [effectId] catalog id when composed by VfxDirector
 */

/**
 * @typedef {object} EffectPrefab
 * @property {string} id
 * @property {string} label
 * @property {string} [skillId]
 * @property {string} [weaponId]
 * @property {'melee'|'spell'|'ranged'} [style]
 * @property {string} source  casting-lab
 * @property {string} version
 * @property {EffectPrimitive[]} primitives
 * @property {object} [anim]
 * @property {object} [economy]
 * @property {object} [meta]
 */

export const EFFECT_MESH_IDS = Object.freeze([
  'none',
  'slashblue',
  'slashred',
  'slashpurple',
  'slashyellow',
  'orb-fire',
  'orb-ember',
  'orb-core',
  'orb-flare',
  'orb-ice',
  'orb-nature',
  'orb-storm',
  'orb-holy',
  'orb-arcane',
  'staff-charge',
  'rock-0',
  'rock-1',
  'rock-2',
  'arrow-path',
  'arrow-loft',
  'summon-fire-fist',
  'summon-ice-shard'
]);

export const EFFECT_KINDS = Object.freeze([
  'trail',
  'travel',
  'cast',
  'impact',
  'residual',
  'decal',
  'aura'
]);

/** CDN / Open mesh path hints (not loaded here — document for ship). */
export const MESH_PATH_HINT = Object.freeze({
  none: null,
  slashblue: 'models/vfx/slash/slashblue.glb',
  slashred: 'models/vfx/slash/slashred.glb',
  slashpurple: 'models/vfx/slash/slashpurple.glb',
  slashyellow: 'models/vfx/slash/slashyellow.glb',
  'orb-fire': 'models/vfx/orbs/orb-fire.glb',
  'orb-ember': 'models/vfx/orbs/orb-ember.glb',
  'orb-core': 'models/vfx/orbs/orb-core.glb',
  'orb-flare': 'models/vfx/orbs/orb-flare.glb',
  'orb-ice': 'models/vfx/orbs/orb-ice.glb',
  'orb-nature': 'models/vfx/orbs/orb-nature.glb',
  'orb-storm': 'models/vfx/orbs/orb-storm.glb',
  'orb-holy': 'models/vfx/orbs/orb-holy.glb',
  'orb-arcane': 'models/vfx/orbs/orb-arcane.glb',
  'staff-charge': 'models/vfx/charge/staff-charge.glb',
  'rock-0': 'models/vfx/rocks/rock-0.glb',
  'rock-1': 'models/vfx/rocks/rock-1.glb',
  'rock-2': 'models/vfx/rocks/rock-2.glb',
  'arrow-path': 'models/vfx/arrows/arrow-path.glb',
  'arrow-loft': 'models/vfx/arrows/arrow-loft.glb',
  'summon-fire-fist': 'models/vfx/summons/summon-fire-fist.glb',
  'summon-ice-shard': 'models/vfx/summons/summon-ice-shard.glb'
});

/**
 * Strawberry multi-mode → isolated primitives (learning map).
 * One mesh, many FX by scale+tint+attach — never whole fireball.glb.
 */
export const STRAWBERRY_MODE_PRESETS = Object.freeze({
  force: { kind: 'impact', size: 1.2, intensity: 1.25, aoe: 1.4, meshId: 'none' },
  trail: { kind: 'trail', size: 0.9, intensity: 0.9, aoe: 0, meshId: 'none', attach: 'weapon_tip' },
  slash: { kind: 'residual', size: 2.2, intensity: 1.1, aoe: 0.8, meshId: 'slashblue' },
  cool: { kind: 'impact', size: 1.6, intensity: 1.15, aoe: 1.2, meshId: 'none', color: '#88e0ff' }
});

/**
 * Build a residual primitive from live `settings.residual` + `settings.effect`.
 * @returns {EffectPrimitive}
 */
export function residualFromSettings() {
  const r = settings.residual || {};
  const e = settings.effect || {};
  return {
    kind: 'residual',
    intensity: r.intensity ?? e.intensity ?? 1,
    aoe: r.aoeRadius ?? e.aoe ?? 0.8,
    speed: r.speed ?? e.speed ?? 14,
    size: r.meshScale ?? e.size ?? 0.9,
    color: r.color || e.color || '#7dd3fc',
    meshId: r.variant || e.meshId || 'slashblue',
    duration: e.duration ?? 0.45,
    attach: 'weapon_tip',
    effectId: 'getsuga_slash',
    range: r.range ?? 3.2,
    contactRadius: r.contactRadius ?? 0.65,
    tipOffset: r.tipOffset ?? 0.55,
    hitFrameDelay: r.hitFrameDelay ?? 0.18
  };
}

/**
 * Universal primitive from `settings.effect` for the active editor kind.
 * @param {EffectKind} [kind]
 * @returns {EffectPrimitive}
 */
export function primitiveFromSettings(kind) {
  const e = settings.effect || {};
  const k = kind || e.activeKind || 'impact';
  if (k === 'residual') return residualFromSettings();

  const trail = settings.trail || {};
  const base = {
    kind: k,
    intensity: e.intensity ?? 1,
    aoe: e.aoe ?? 1.2,
    speed: e.speed ?? 12,
    size: e.size ?? 1,
    color: e.color || '#7dd3fc',
    meshId: e.meshId || 'none',
    duration: e.duration ?? 0.45,
    attach: e.attach || 'R_hand'
  };

  if (k === 'trail') {
    return {
      ...base,
      kind: 'trail',
      size: trail.width ?? base.size,
      speed: trail.flowSpeed ?? base.speed,
      color: trail.colorOuter || base.color,
      intensity: trail.glow ?? base.intensity
    };
  }
  return base;
}

/**
 * Layer cast / travel / impact for a DRC or element skill.
 * @param {string} skillId
 * @returns {EffectPrefab}
 */
export function buildEffectPrefab(skillId) {
  const skill = skillById(skillId);
  const bind = SKILL_VFX_BIND[skillId];
  const element = skill?.element;
  const phase = element ? CASTING_ELEMENT_PHASE_VFX[element] : null;

  /** @type {EffectPrimitive[]} */
  const primitives = [];

  if (skill?.style === 'melee' || skillId === 'drc_melee_strike') {
    primitives.push(residualFromSettings());
    primitives.push({
      kind: 'trail',
      intensity: 0.85,
      aoe: 0,
      speed: settings.residual?.speed ?? 14,
      size: 0.55,
      color: settings.residual?.color || '#7dd3fc',
      attach: 'weapon_tip',
      duration: 0.25
    });
  } else {
    const castId = bind?.cast || phase?.cast || skill?.castEffectId;
    const travelId = bind?.travel || phase?.travel || skill?.travelEffectId;
    const impactId = bind?.impact || phase?.impact || skill?.impactEffectId;
    const e = settings.effect || {};

    if (castId) {
      const cat = vfxCatalogById(castId);
      primitives.push({
        kind: 'cast',
        intensity: e.intensity ?? 1,
        aoe: 0,
        speed: 0,
        size: e.size ?? 1,
        color: e.color || (cat ? `#${cat.color.toString(16).padStart(6, '0')}` : '#ffffff'),
        meshId: 'none',
        duration: 0.35,
        attach: skill?.attachToHand ? 'R_hand' : 'root',
        effectId: castId
      });
    }
    if (travelId) {
      const cat = vfxCatalogById(travelId);
      const elCfg = element && settings[element] ? settings[element] : {};
      primitives.push({
        kind: 'travel',
        intensity: e.intensity ?? 1,
        aoe: 0,
        speed: elCfg.speed ?? e.speed ?? 12,
        size: e.size ?? 1,
        color: e.color || (cat ? `#${cat.color.toString(16).padStart(6, '0')}` : '#ff6a1e'),
        meshId: e.meshId?.startsWith?.('orb') ? e.meshId : element === 'fire' ? 'orb-fire' : 'none',
        duration: elCfg.lifetime ?? e.duration ?? 2,
        attach: 'R_hand',
        effectId: travelId
      });
    }
    if (impactId) {
      const cat = vfxCatalogById(impactId);
      primitives.push({
        kind: 'impact',
        intensity: (e.intensity ?? 1) * (settings.global?.explosionIntensity ?? 1),
        aoe: e.aoe ?? 1.2,
        speed: 0,
        size: e.size ?? 1,
        color: e.color || (cat ? `#${cat.color.toString(16).padStart(6, '0')}` : '#ffffff'),
        meshId: 'none',
        duration: 0.7,
        attach: 'root',
        effectId: impactId
      });
    }
  }

  return {
    id: `prefab_${skillId || 'custom'}`,
    label: skill?.label || skillId || 'Custom effect',
    skillId: skillId || null,
    weaponId: skill?.weaponId || phase?.staffWeaponId || null,
    style: skill?.style || (skillId === 'drc_melee_strike' ? 'melee' : 'spell'),
    source: 'casting-lab',
    version: '1.0.0',
    primitives,
    anim: {
      role: skill?.animRole || (skill?.style === 'melee' ? 'attack' : 'cast'),
      castDuration: skill?.castDuration ?? 0.85
    },
    economy: skill
      ? {
          cooldown: skill.cooldown,
          staminaCost: skill.staminaCost,
          rangeM: skill.rangeM
        }
      : undefined,
    meta: {
      meshPaths: primitives
        .map((p) => (p.meshId ? MESH_PATH_HINT[p.meshId] : null))
        .filter(Boolean),
      bans: ['whole_fireball.glb', 'space_getsuga', 'second_mixer'],
      exportedAt: new Date().toISOString()
    }
  };
}

/** Prefab for the editor's active kind (no skill bind). */
export function buildActiveKindPrefab() {
  const prim = primitiveFromSettings();
  return {
    id: `prefab_${prim.kind}_solo`,
    label: `Solo ${prim.kind}`,
    skillId: null,
    weaponId: null,
    style: prim.kind === 'residual' ? 'melee' : 'spell',
    source: 'casting-lab',
    version: '1.0.0',
    primitives: [prim],
    meta: {
      meshPaths: prim.meshId && MESH_PATH_HINT[prim.meshId] ? [MESH_PATH_HINT[prim.meshId]] : [],
      exportedAt: new Date().toISOString()
    }
  };
}

/**
 * Download JSON file in browser.
 * @param {object} data
 * @param {string} filename
 */
export function downloadJson(data, filename = 'effect-prefab.json') {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Apply intensity/aoe/speed/size/color/mesh from a prefab primitive into settings.
 * @param {EffectPrimitive} prim
 */
export function applyPrimitiveToSettings(prim) {
  if (!prim || !settings.effect) return;
  const e = settings.effect;
  if (prim.intensity != null) e.intensity = prim.intensity;
  if (prim.aoe != null) e.aoe = prim.aoe;
  if (prim.speed != null) e.speed = prim.speed;
  if (prim.size != null) e.size = prim.size;
  if (prim.color) e.color = prim.color;
  if (prim.meshId) e.meshId = prim.meshId;
  if (prim.duration != null) e.duration = prim.duration;
  if (prim.attach) e.attach = prim.attach;
  if (prim.kind) e.activeKind = prim.kind;

  if (prim.kind === 'residual' && settings.residual) {
    const r = settings.residual;
    if (prim.intensity != null) r.intensity = prim.intensity;
    if (prim.aoe != null) r.aoeRadius = prim.aoe;
    if (prim.speed != null) r.speed = prim.speed;
    if (prim.size != null) r.meshScale = prim.size;
    if (prim.color) r.color = prim.color;
    if (prim.meshId && String(prim.meshId).startsWith('slash')) r.variant = prim.meshId;
    if (prim.range != null) r.range = prim.range;
    if (prim.contactRadius != null) r.contactRadius = prim.contactRadius;
  }
}
