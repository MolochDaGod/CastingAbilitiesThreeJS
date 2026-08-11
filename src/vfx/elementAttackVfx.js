/**
 * Element attack mesh + pattern SSOT (Casting lab).
 *
 * Extends skillDelivery / SkillProjectileSystem — does not invent skill rows.
 *
 * | Asset | Role |
 * |-------|------|
 * | bubbles (procedural) | Water travel / freeze field animation |
 * | freeze AOE | Radial blast from caster — freezes hostiles in radius |
 * | rock-0..7 | Earth: emerge from below terrain next to caster → linear or aimed |
 * | charge shell | kamehameha bake — earth emerge tell + staff charge |
 * | arrow-path | Linear attack path; distance → end event (explode/aoe/blink/return) |
 * | arrow-loft | Lofted throw / place device / trap / summon |
 *
 * @see docs/ELEMENT_ATTACK_MESHES_SSOT.md
 * @see scripts/split-element-attack-meshes.mjs
 */

import { Color, DoubleSide, MeshPhysicalMaterial, MeshStandardMaterial } from 'three';

/** Earth rocks — split from assorted_rock_pack (never load pack whole as one projectile). */
export const EARTH_ROCK_MESHES = Object.freeze([
  './models/vfx/rocks/rock-0.glb',
  './models/vfx/rocks/rock-1.glb',
  './models/vfx/rocks/rock-2.glb',
  './models/vfx/rocks/rock-3.glb',
  './models/vfx/rocks/rock-4.glb',
  './models/vfx/rocks/rock-5.glb',
  './models/vfx/rocks/rock-6.glb',
  './models/vfx/rocks/rock-7.glb'
]);

export const EARTH_ROCK_DIAMETER_M = 0.55;

/** Charge shell used as earth rise tell (same bake as staff charge). */
export const EARTH_EMERGE_CHARGE = './models/vfx/charge/staff-charge.glb';

/**
 * Two arrow systems (author art scaled SI).
 * - path (teleport_arrow): flat linear — attack path; size/distance → end event
 * - loft (arrow_curved): more loft — throw / place / trap / summon
 */
export const ARROW_SYSTEMS = Object.freeze({
  path: Object.freeze({
    id: 'arrow-path',
    mesh: './models/vfx/arrows/arrow-path.glb',
    source: 'teleport_arrow.glb',
    lengthM: 1.1,
    loft: 0,
    gravity: 0,
    role: 'linear_attack_path',
    /** Distance along path selects where the end event fires */
    endEvents: Object.freeze(['impact', 'explode', 'aoe', 'blink', 'return']),
    sizeScalesWithDistance: true
  }),
  loft: Object.freeze({
    id: 'arrow-loft',
    mesh: './models/vfx/arrows/arrow-loft.glb',
    source: 'arrow_curved.glb',
    lengthM: 0.95,
    loft: 0.42,
    gravity: -12,
    role: 'throw_place_trap_summon',
    endEvents: Object.freeze(['throw', 'place_device', 'trap', 'summon']),
    sizeScalesWithDistance: false
  })
});

/** Water bubble VFX — procedural (bubbles_2.glb is morph multipack; do not load whole). */
export const WATER_BUBBLE = Object.freeze({
  sourceNote: 'D:/Games/Models/bubbles_2.glb — sample morphs later; runtime uses procedural SI spheres',
  diameterM: 0.22,
  countTravel: 6,
  countNova: 14,
  color: 0x6ec8ff,
  opacity: 0.55
});

/** Freeze nova defaults (m, s). */
export const FREEZE_NOVA = Object.freeze({
  radiusM: 5.5,
  expandSec: 0.45,
  freezeSec: 2.5,
  damageScale: 0.85,
  color: 0xa8e8ff,
  bubbleCount: 16
});

/**
 * @param {number} [seed]
 * @returns {string} rock mesh url
 */
export function pickEarthRock(seed = Math.random()) {
  const i = Math.floor(seed * EARTH_ROCK_MESHES.length) % EARTH_ROCK_MESHES.length;
  return EARTH_ROCK_MESHES[i];
}

/**
 * @param {number} count
 * @returns {string[]}
 */
export function pickEarthRocks(count = 3) {
  const n = Math.max(1, Math.min(EARTH_ROCK_MESHES.length, count | 0));
  const out = [];
  const used = new Set();
  while (out.length < n) {
    const i = Math.floor(Math.random() * EARTH_ROCK_MESHES.length);
    if (used.has(i) && used.size < EARTH_ROCK_MESHES.length) continue;
    used.add(i);
    out.push(EARTH_ROCK_MESHES[i]);
  }
  return out;
}

/**
 * Infer element attack presentation from catalog skill (no new skill ids).
 * @param {object} skill
 * @returns {{
 *   kind: 'freeze_nova'|'earth_rocks'|'water_bubbles'|'arrow_path'|'arrow_loft'|'orb'|null,
 *   rockCount?: number,
 *   aimMode?: 'linear'|'aimed',
 *   endEvent?: string,
 *   freeze?: boolean,
 *   aoeM?: number
 * }}
 */
export function inferElementAttackKind(skill) {
  if (!skill) return { kind: null };
  const blob = [
    skill.id,
    skill.label,
    skill.name,
    skill.description,
    skill.catalogSkillId,
    skill.pathMode,
    skill.presentation,
    skill.element,
    skill.abilityElement,
    ...(skill.effects || [])
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  // Freeze AOE — ice nova / absolute zero / freeze blast from self
  if (
    /freeze|absolute.?zero|ice.?nova|frost.?nova|glacial.?shield|blizzard/.test(blob) ||
    (skill.pathMode === 'aoe' && (skill.element === 'ice' || skill.element === 'frost')) ||
    (skill.presentation === 'groundFlood' && /nova|aoe/.test(blob))
  ) {
    if (/shield|ward/.test(blob) && !/nova|blast|zero/.test(blob)) {
      /* ward is aura, not freeze nova */
    } else if (/nova|blast|zero|freeze|aoe|around/.test(blob) || skill.pathMode === 'aoe') {
      return {
        kind: 'freeze_nova',
        freeze: true,
        aoeM: skill.rangeM ? Math.min(8, Math.max(3.5, skill.rangeM * 0.4)) : FREEZE_NOVA.radiusM
      };
    }
  }

  // Earth rocks — nature/earth quake/spike/meteor of stone
  if (
    /earth|quake|rock|stone|boulder|spike|upheaval|nature.?fury|vine.?lash|practice.?root/.test(blob) ||
    ((skill.element === 'nature' || skill.element === 'earth') &&
      (skill.pathMode === 'stream' || skill.pathMode === 'spikes' || skill.slotType === 'primary'))
  ) {
    const multi = /quake|meteor|barrage|several|volley|hellstorm|cataclysm/.test(blob);
    const linear =
      skill.pathMode === 'stream' ||
      skill.slotType === 'primary' ||
      /bolt|shot|linear|line/.test(blob);
    return {
      kind: 'earth_rocks',
      rockCount: multi ? 4 : skill.pathMode === 'spikes' ? 3 : 1,
      aimMode: linear ? 'linear' : 'aimed'
    };
  }

  // Water bubbles — water spray / stream / ice travel soft
  if (
    /water|bubble|spray|foam|tide|wave/.test(blob) ||
    ((skill.element === 'ice' || skill.element === 'water') &&
      skill.pathMode === 'stream' &&
      !/nova|freeze/.test(blob))
  ) {
    return { kind: 'water_bubbles' };
  }

  // Arrow systems — catalog / presentation hooks
  if (/blink|teleport|return.?arrow|path.?arrow|linear.?arrow/.test(blob)) {
    const end = /blink|teleport/.test(blob)
      ? 'blink'
      : /return/.test(blob)
        ? 'return'
        : /explode|boom/.test(blob)
          ? 'explode'
          : /aoe|zone/.test(blob)
            ? 'aoe'
            : 'impact';
    return { kind: 'arrow_path', endEvent: end };
  }
  if (/trap|place.?device|summon.?arrow|lob|throw.?arrow|curved.?arrow/.test(blob)) {
    const end = /trap/.test(blob)
      ? 'trap'
      : /summon/.test(blob)
        ? 'summon'
        : /place|device/.test(blob)
          ? 'place_device'
          : 'throw';
    return { kind: 'arrow_loft', endEvent: end };
  }

  return { kind: null };
}

/**
 * Procedural water bubble material (SI sphere clones).
 * @param {{ color?: number, opacity?: number }} [opts]
 */
export function createWaterBubbleMaterial(opts = {}) {
  const color = new Color(opts.color ?? WATER_BUBBLE.color);
  try {
    return new MeshPhysicalMaterial({
      color,
      transparent: true,
      opacity: opts.opacity ?? WATER_BUBBLE.opacity,
      roughness: 0.15,
      metalness: 0.05,
      transmission: 0.55,
      thickness: 0.2,
      ior: 1.33,
      side: DoubleSide,
      depthWrite: false
    });
  } catch {
    return new MeshStandardMaterial({
      color,
      transparent: true,
      opacity: opts.opacity ?? WATER_BUBBLE.opacity,
      roughness: 0.2,
      metalness: 0.05,
      emissive: color.clone().multiplyScalar(0.25),
      emissiveIntensity: 0.4,
      side: DoubleSide,
      depthWrite: false
    });
  }
}

/**
 * @param {string} endEvent
 * @param {'path'|'loft'} system
 */
export function resolveArrowEndEvent(endEvent, system = 'path') {
  const sys = ARROW_SYSTEMS[system] || ARROW_SYSTEMS.path;
  if (endEvent && sys.endEvents.includes(endEvent)) return endEvent;
  return system === 'loft' ? 'throw' : 'impact';
}
