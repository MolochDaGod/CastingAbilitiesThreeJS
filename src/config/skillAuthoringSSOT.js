/**
 * Skill authoring organization SSOT — Casting lab → client production.
 *
 * Inspired by **uMMORPG / Unity ScriptableObject skill packs**:
 *   SkillTemplate (data) → SkillEffect modules → Target / Delivery → VFX bind
 *   Runtime only *activates* assets; it does not invent skill rows.
 *
 * Mapped onto **existing** Casting systems (no second combat engine):
 *
 * | uMMORPG idea              | Casting SSOT                                      |
 * |---------------------------|---------------------------------------------------|
 * | Scriptable Skill asset    | master-weaponSkills / t0 / `weaponSkillProduction` |
 * | Skill.cooldown / mana     | skill.cooldownSec · economy fields                |
 * | Target type               | soft-lock · aim · ground ring · self              |
 * | Projectile / AOE / Buff   | `SkillDeliveryPattern` in skillDelivery.js        |
 * | Scriptable effect modules | `EffectPrimitive[]` in effectPrefab.js            |
 * | Prefab visual             | VfxDirector effectId + meshId + settings knobs    |
 * | Engine scripting          | settings.js live knobs · prefab JSON export       |
 *
 * Authoring pipeline (one direction):
 *
 * ```
 * Catalog skill row
 *   → Delivery pattern (weapon · linear · over · under · aura · path…)
 *   → Effect primitives (trail · travel · cast · impact · residual · decal · aura)
 *   → Mesh / texture samples (orbs · slash · rocks)
 *   → Live knobs (settings.effect / residual / element)
 *   → Export EffectPrefab JSON → Warlords / Open
 * ```
 *
 * @see docs/SKILL_AUTHORING_STUDIO_SSOT.md
 * @see src/combat/skillDelivery.js
 * @see src/vfx/effectPrefab.js
 */

import { DELIVERY_META } from '../combat/skillDelivery.js';
import { EFFECT_KINDS, EFFECT_MESH_IDS, MESH_PATH_HINT } from '../vfx/effectPrefab.js';
import { VFX_CATALOG } from '../vfx/vfxCatalog.js';

/** Studio shell tabs — singular container, no parallel editors */
export const STUDIO_TABS = Object.freeze([
  {
    id: 'pipeline',
    label: 'Pipeline',
    icon: '⧉',
    hint: 'How skill data flows from catalog → delivery → VFX → export'
  },
  {
    id: 'skill',
    label: 'Skill',
    icon: '⚔',
    hint: 'Scriptable skill fields (uMMORPG SkillTemplate equivalent)'
  },
  {
    id: 'delivery',
    label: 'Delivery',
    icon: '◎',
    hint: 'Weapon · linear · over · under · around · aura · path'
  },
  {
    id: 'vfx',
    label: 'VFX',
    icon: '✦',
    hint: 'Primitives + catalog effectIds (cast / travel / impact / residual / aura)'
  },
  {
    id: 'linear',
    label: 'Linear',
    icon: '→',
    hint: 'Linear skillshots (ice / thunder / meteor / beam / snare)'
  },
  {
    id: 'samples',
    label: 'Samples',
    icon: '▣',
    hint: 'Mesh + color texture samples for authoring'
  },
  {
    id: 'knobs',
    label: 'Knobs',
    icon: '⚙',
    hint: 'Live settings (lil-gui) — intensity · AOE · residual · elements · post'
  },
  {
    id: 'export',
    label: 'Export',
    icon: '↑',
    hint: 'EffectPrefab JSON for client / Warlords production'
  }
]);

/**
 * Delivery groups for studio UI (maps skillDelivery patterns).
 * User-facing names match combat language: linear, over, under, aura…
 */
export const DELIVERY_GROUPS = Object.freeze([
  {
    id: 'weapon',
    label: 'Weapon',
    patterns: ['weapon'],
    blurb: 'Melee residual from tip (Getsuga-class). F attack frame.'
  },
  {
    id: 'linear',
    label: 'Linear',
    patterns: ['caster_to_target'],
    blurb: 'Caster → target bolt / beam / skillshot (default spell).'
  },
  {
    id: 'over',
    label: 'Over',
    patterns: ['over_target'],
    blurb: 'Spawn above target and drop (meteor, smite, rain).'
  },
  {
    id: 'under',
    label: 'Under',
    patterns: ['under_target'],
    blurb: 'Erupt under target (spikes, roots, ice bloom).'
  },
  {
    id: 'around',
    label: 'Around',
    patterns: ['around_caster', 'around_target'],
    blurb: 'Ring / nova on caster or target.'
  },
  {
    id: 'aura',
    label: 'Aura',
    patterns: ['toggle_aura'],
    blurb: 'Toggle ward / shield / stance — no travel projectile.'
  },
  {
    id: 'place',
    label: 'Place',
    patterns: ['at_location'],
    blurb: 'Ground aim placement (zone, beacon, field).'
  },
  {
    id: 'path',
    label: 'Path',
    patterns: ['path_stream', 'path_aoe', 'path_spikes', 'path_wall'],
    blurb: 'Drawn staff path: stream · AoE · spikes · wall.'
  }
]);

/** Effect primitive cards for VFX tab */
export const PRIMITIVE_META = Object.freeze({
  trail: {
    label: 'Trail',
    color: '#7dd3fc',
    blurb: 'Ribbon / path trail · blade tip · stroke'
  },
  travel: {
    label: 'Travel',
    color: '#ff8a4a',
    blurb: 'Projectile mesh along path · orbs'
  },
  cast: {
    label: 'Cast',
    color: '#c4a0ff',
    blurb: 'Hand / channel tell before travel'
  },
  impact: {
    label: 'Impact',
    color: '#ff6a3d',
    blurb: 'Hit burst · explosion · shockwave'
  },
  residual: {
    label: 'Residual',
    color: '#5eead4',
    blurb: 'Melee wave past blade (F apex)'
  },
  decal: {
    label: 'Decal',
    color: '#a3a3a3',
    blurb: 'Ground scorch / frost mark'
  },
  aura: {
    label: 'Aura',
    color: '#fbbf24',
    blurb: 'Ring / buff around body'
  }
});

/**
 * Texture / mesh sample cards for Samples tab.
 * Paths under public/ or CDN — CSS gradient fallback when no still image.
 */
export const SAMPLE_LIBRARY = Object.freeze([
  {
    id: 'orb-fire',
    label: 'Fire orb',
    kind: 'mesh',
    path: './models/vfx/orbs/orb-fire.glb',
    swatch: ['#ff6a1e', '#ffb020', '#3a0a00'],
    tags: ['travel', 'fire']
  },
  {
    id: 'orb-ice',
    label: 'Ice orb',
    kind: 'mesh',
    path: './models/vfx/orbs/orb-ice.glb',
    swatch: ['#9fdcff', '#e8f6ff', '#1a3a50'],
    tags: ['travel', 'ice']
  },
  {
    id: 'orb-storm',
    label: 'Storm orb',
    kind: 'mesh',
    path: './models/vfx/orbs/orb-storm.glb',
    swatch: ['#a0d8ff', '#7aa8ff', '#102040'],
    tags: ['travel', 'storm']
  },
  {
    id: 'orb-holy',
    label: 'Holy orb',
    kind: 'mesh',
    path: './models/vfx/orbs/orb-holy.glb',
    swatch: ['#fff6c0', '#ffe080', '#403010'],
    tags: ['travel', 'holy']
  },
  {
    id: 'orb-arcane',
    label: 'Arcane orb',
    kind: 'mesh',
    path: './models/vfx/orbs/orb-arcane.glb',
    swatch: ['#b070ff', '#e0c0ff', '#201040'],
    tags: ['travel', 'arcane']
  },
  {
    id: 'orb-nature',
    label: 'Nature orb',
    kind: 'mesh',
    path: './models/vfx/orbs/orb-nature.glb',
    swatch: ['#80e060', '#c0f0a0', '#103010'],
    tags: ['travel', 'nature']
  },
  {
    id: 'staff-charge',
    label: 'Staff charge',
    kind: 'mesh',
    path: './models/vfx/charge/staff-charge.glb',
    swatch: ['#60d0ff', '#ffffff', '#082030'],
    tags: ['cast', 'channel']
  },
  {
    id: 'slashblue',
    label: 'Slash blue',
    kind: 'mesh',
    path: 'slashblue',
    swatch: ['#7dd3fc', '#bae6fd', '#0c4a6e'],
    tags: ['residual', 'melee']
  },
  {
    id: 'slashred',
    label: 'Slash red',
    kind: 'mesh',
    path: 'slashred',
    swatch: ['#ff6a3d', '#ffb4a0', '#4a1010'],
    tags: ['residual', 'melee']
  },
  {
    id: 'rock-0',
    label: 'Rock 0',
    kind: 'mesh',
    path: './models/vfx/rocks/rock-0.glb',
    swatch: ['#8a7355', '#c4a574', '#2a2010'],
    tags: ['travel', 'earth']
  },
  {
    id: 'arrow-path',
    label: 'Arrow path',
    kind: 'mesh',
    path: './models/vfx/arrows/arrow-path.glb',
    swatch: ['#d4c4a0', '#8a7050', '#201808'],
    tags: ['travel', 'ranged']
  },
  {
    id: 'summon-fire-fist',
    label: 'Fire fist',
    kind: 'mesh',
    path: './models/vfx/summons/summon-fire-fist.glb',
    swatch: ['#ff5510', '#ffaa40', '#301000'],
    tags: ['impact', 'summon']
  },
  {
    id: 'summon-ice-shard',
    label: 'Ice shard',
    kind: 'mesh',
    path: './models/vfx/summons/summon-ice-shard.glb',
    swatch: ['#c8f0ff', '#60a0c0', '#102030'],
    tags: ['impact', 'summon']
  },
  {
    id: 'bullet1',
    label: 'Bullet',
    kind: 'mesh',
    path: './models/vfx/projectiles/bullet1.glb',
    swatch: ['#c0c8d0', '#606870', '#101418'],
    tags: ['travel', 'gun']
  }
]);

/** Linear skillshot families (elemental linear cast) */
export const LINEAR_FAMILIES = Object.freeze([
  { id: 'ice', label: 'Ice bolt', element: 'ice', delivery: 'caster_to_target' },
  { id: 'thunder', label: 'Thunder', element: 'storm', delivery: 'caster_to_target' },
  { id: 'meteor', label: 'Meteor', element: 'fire', delivery: 'over_target' },
  { id: 'beam', label: 'Beam', element: 'arcane', delivery: 'caster_to_target' },
  { id: 'snare', label: 'Snare', element: 'nature', delivery: 'at_location' },
  { id: 'glacier', label: 'Glacier', element: 'ice', delivery: 'under_target' }
]);

/** Scriptable skill field template (uMMORPG SkillTemplate-shaped) */
export const SKILL_TEMPLATE_FIELDS = Object.freeze([
  { key: 'id', label: 'Skill id', type: 'string', required: true },
  { key: 'label', label: 'Display name', type: 'string' },
  { key: 'style', label: 'Style', type: 'enum', options: ['melee', 'spell', 'ranged'] },
  { key: 'element', label: 'Element', type: 'string' },
  { key: 'cooldownSec', label: 'Cooldown (s)', type: 'number' },
  { key: 'castTimeSec', label: 'Cast time (s)', type: 'number' },
  { key: 'manaCost', label: 'Mana', type: 'number' },
  { key: 'staminaCost', label: 'Stamina', type: 'number' },
  { key: 'rangeM', label: 'Range (m)', type: 'number' },
  { key: 'damage', label: 'Damage', type: 'number' },
  { key: 'delivery', label: 'Delivery pattern', type: 'delivery' },
  { key: 'castEffectId', label: 'Cast VFX id', type: 'vfxId' },
  { key: 'travelEffectId', label: 'Travel VFX id', type: 'vfxId' },
  { key: 'impactEffectId', label: 'Impact VFX id', type: 'vfxId' }
]);

export function deliveryMetaList() {
  return Object.entries(DELIVERY_META).map(([id, m]) => ({ id, ...m }));
}

export function catalogByCategory() {
  /** @type {Record<string, typeof VFX_CATALOG[number][]>} */
  const map = {};
  for (const e of VFX_CATALOG) {
    if (!map[e.category]) map[e.category] = [];
    map[e.category].push(e);
  }
  return map;
}

export {
  DELIVERY_META,
  EFFECT_KINDS,
  EFFECT_MESH_IDS,
  MESH_PATH_HINT,
  VFX_CATALOG
};
