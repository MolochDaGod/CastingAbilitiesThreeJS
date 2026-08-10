/**
 * Weapon skill **delivery patterns** — SSOT for how catalog skills deploy in space.
 *
 * Does not invent skill rows (those come from t0-weapons / master-weaponSkills).
 * Maps catalog text + style + pathMode → spawn / aim / projectile rules.
 *
 * @see docs/SKILL_DELIVERY_SSOT.md
 * @see docs/WEAPON_SKILLS_API_SSOT.md
 */

import { Vector3 } from 'three';

/**
 * Canonical delivery patterns (SI metres, caster-relative).
 * @typedef {'weapon'|'caster_to_target'|'over_target'|'under_target'|'around_caster'|'around_target'|'at_location'|'toggle_aura'|'path_stream'|'path_aoe'|'path_spikes'|'path_wall'} SkillDeliveryPattern
 */

/** @type {Record<SkillDeliveryPattern, { label: string, description: string }>} */
export const DELIVERY_META = Object.freeze({
  weapon: {
    label: 'Weapon',
    description: 'Physical residual / strike from weapon tip along aim (melee Getsuga-class).'
  },
  caster_to_target: {
    label: 'Caster → target',
    description: 'Projectile or beam from cast origin to soft-lock / aim point.'
  },
  over_target: {
    label: 'Over target',
    description: 'Spawn above target (or aim) and drop / rain (meteor, holy light).'
  },
  under_target: {
    label: 'Under target',
    description: 'Erupt from ground under target / aim (spikes, roots, ice bloom).'
  },
  around_caster: {
    label: 'Around caster',
    description: 'Ring / nova centered on caster feet (shield, flame nova).'
  },
  around_target: {
    label: 'Around target',
    description: 'Ring / nova centered on soft-lock or aim point.'
  },
  at_location: {
    label: 'At location',
    description: 'Place effect at ground aim / path endpoint (selected location).'
  },
  toggle_aura: {
    label: 'Toggle aura',
    description: 'On/off aura on caster (ward, shield) — no travel projectile.'
  },
  path_stream: {
    label: 'Path stream',
    description: 'Drawn path = stream travel (default long stroke).'
  },
  path_aoe: {
    label: 'Path AoE',
    description: 'Short path / tap = ground AoE at endpoint.'
  },
  path_spikes: {
    label: 'Path spikes',
    description: 'Medium stroke = line of eruptions under path.'
  },
  path_wall: {
    label: 'Path wall',
    description: 'Long hold / long stroke = barrier along path.'
  }
});

/**
 * Infer delivery from catalog skill (id, name, effects, style, pathMode).
 * Catalog-first — only heuristics when fields empty.
 *
 * @param {{
 *   id?: string,
 *   label?: string,
 *   name?: string,
 *   style?: string,
 *   pathMode?: string|null,
 *   effects?: string[],
 *   description?: string,
 *   skillKind?: string,
 *   isWard?: boolean,
 *   isFocus?: boolean,
 *   presentation?: string|null
 * }} skill
 * @returns {SkillDeliveryPattern}
 */
/**
 * Ground aim ring (world reticle) — only for skills that place / AoE / path on terrain.
 * Screen-center HUD crosshair stays for focus combat; ground ring is separate.
 *
 * @param {SkillDeliveryPattern|string|null|undefined} pattern
 * @returns {boolean}
 */
export function deliveryNeedsGroundMarker(pattern) {
  if (!pattern) return false;
  return (
    pattern === 'at_location' ||
    pattern === 'around_target' ||
    pattern === 'under_target' ||
    pattern === 'over_target' ||
    pattern === 'path_aoe' ||
    pattern === 'path_spikes' ||
    pattern === 'path_wall' ||
    pattern === 'path_stream'
  );
}

/**
 * @param {object|null|undefined} skill
 * @returns {boolean}
 */
export function skillNeedsGroundMarker(skill) {
  if (!skill) return false;
  // Explicit flag from catalog / DRC
  if (skill.needsGroundAim === true || skill.placement === true) return true;
  if (skill.needsGroundAim === false) return false;
  return deliveryNeedsGroundMarker(inferDeliveryPattern(skill));
}

export function inferDeliveryPattern(skill) {
  if (!skill) return 'caster_to_target';
  const blob = [
    skill.id,
    skill.label,
    skill.name,
    skill.description,
    skill.pathMode,
    skill.presentation,
    skill.skillKind,
    ...(skill.effects || [])
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  // Explicit path modes from path cast
  if (skill.pathMode === 'stream') return 'path_stream';
  if (skill.pathMode === 'aoe') return 'path_aoe';
  if (skill.pathMode === 'spikes') return 'path_spikes';
  if (skill.pathMode === 'wall') return 'path_wall';

  // Buff / ward / toggle
  if (skill.isWard || skill.isFocus || skill.skillKind === 'buff') return 'toggle_aura';
  if (/\b(ward|shield|aura|stance|guard|focus)\b/.test(blob) && (skill.damage === 0 || /buff|ward/.test(blob))) {
    return 'toggle_aura';
  }

  // Melee weapon residual
  if (skill.style === 'melee' || /\b(slash|thrust|sweep|strike|melee)\b/.test(blob)) {
    if (/\b(sweep|aoe|arc|nova)\b/.test(blob)) return 'around_caster';
    return 'weapon';
  }

  // Spatial keywords
  if (/\b(meteor|from above|sky|rain|comet|smite|holy light|radiant)\b/.test(blob)) {
    return 'over_target';
  }
  if (/\b(erupt|spike|root|under|ground|bloom|geyser|upheaval)\b/.test(blob)) {
    return 'under_target';
  }
  if (/\b(nova|around self|self aoe|flame nova|ice nova)\b/.test(blob)) {
    return 'around_caster';
  }
  if (/\b(around target|ring|encircle)\b/.test(blob)) {
    return 'around_target';
  }
  if (/\b(place|mark|zone|field|at location|beacon)\b/.test(blob)) {
    return 'at_location';
  }

  // Default spells: projectile caster → aim
  if (skill.style === 'spell' || skill.style === 'ranged') return 'caster_to_target';
  return 'caster_to_target';
}

/**
 * Resolve world spawn + aim points for a delivery pattern.
 *
 * @param {SkillDeliveryPattern} pattern
 * @param {{
 *   casterPos: Vector3,
 *   castOrigin: Vector3,
 *   aimPoint: Vector3,
 *   forward: Vector3,
 *   targetPoint?: Vector3|null,
 *   weaponTip?: Vector3|null,
 *   skyHeight?: number,
 *   groundY?: number
 * }} pose
 * @returns {{
 *   origin: Vector3,
 *   target: Vector3,
 *   forward: Vector3,
 *   height: number,
 *   pattern: SkillDeliveryPattern
 * }}
 */
export function resolveDeliveryPose(pattern, pose) {
  const sky = pose.skyHeight ?? 8;
  const groundY = pose.groundY ?? 0.05;
  const origin = new Vector3();
  const target = new Vector3();
  const forward = new Vector3();

  const aim = pose.aimPoint?.clone?.() || pose.casterPos.clone().add(pose.forward);
  const tgt = pose.targetPoint?.clone?.() || aim;
  const tip = pose.weaponTip || pose.castOrigin;
  const cast = pose.castOrigin || pose.casterPos;

  switch (pattern) {
    case 'weapon':
      origin.copy(tip);
      target.copy(aim);
      break;
    case 'caster_to_target':
      origin.copy(cast);
      target.copy(tgt);
      break;
    case 'over_target':
      target.copy(tgt);
      target.y = groundY;
      origin.set(tgt.x, groundY + sky, tgt.z);
      break;
    case 'under_target':
      origin.set(tgt.x, groundY - 0.15, tgt.z);
      target.set(tgt.x, groundY + 1.2, tgt.z);
      break;
    case 'around_caster':
      origin.copy(pose.casterPos);
      origin.y = groundY;
      target.copy(origin);
      break;
    case 'around_target':
      origin.set(tgt.x, groundY, tgt.z);
      target.copy(origin);
      break;
    case 'at_location':
      origin.set(aim.x, groundY, aim.z);
      target.copy(origin);
      break;
    case 'toggle_aura':
      origin.copy(pose.casterPos);
      origin.y = groundY + 0.1;
      target.copy(origin);
      break;
    case 'path_stream':
    case 'path_aoe':
    case 'path_spikes':
    case 'path_wall':
      origin.copy(cast);
      target.copy(aim);
      break;
    default:
      origin.copy(cast);
      target.copy(aim);
  }

  forward.subVectors(target, origin);
  if (forward.lengthSq() < 1e-6) {
    forward.copy(pose.forward || new Vector3(0, 0, 1));
  } else {
    forward.normalize();
  }

  return {
    origin,
    target,
    forward,
    height: Math.max(0.1, Math.abs(origin.y - target.y)),
    pattern
  };
}

/**
 * Projectile / physics profile for a delivery (SI).
 * @param {SkillDeliveryPattern} pattern
 * @param {{ speed?: number, aoe?: number, size?: number, intensity?: number, element?: string }} [knobs]
 */
export function deliveryPhysicsProfile(pattern, knobs = {}) {
  const speed = knobs.speed ?? 14;
  const aoe = knobs.aoe ?? 1.2;
  const size = knobs.size ?? 0.55;
  const intensity = knobs.intensity ?? 1;
  const base = {
    speed,
    aoe,
    size,
    intensity,
    /** contact sphere radius m */
    contactRadius: Math.max(0.25, size * 0.55),
    /** knockback horizontal MM (100 MM = 1 m) */
    knockbackMm: 180 * intensity,
    /** upward kick m/s on hit */
    knockupVy: 2.2 * intensity,
    /** impulse scale for rigid bodies */
    force: 8 * intensity,
    gravity: 0,
    life: 2.5,
    explodeOnHit: true,
    meshKey: null
  };

  switch (pattern) {
    case 'weapon':
      return {
        ...base,
        speed: speed * 0.9,
        life: 0.45,
        knockbackMm: 120 * intensity,
        knockupVy: 0.8 * intensity,
        meshKey: 'residual'
      };
    case 'over_target':
      return {
        ...base,
        speed: Math.max(6, speed * 0.7),
        gravity: -18,
        life: 2.2,
        knockbackMm: 220 * intensity,
        knockupVy: 3.5 * intensity,
        meshKey: 'summon'
      };
    case 'under_target':
      return {
        ...base,
        speed: 4,
        gravity: 0,
        life: 0.9,
        knockbackMm: 100 * intensity,
        knockupVy: 4.5 * intensity,
        meshKey: 'summon'
      };
    case 'around_caster':
    case 'around_target':
    case 'at_location':
    case 'toggle_aura':
      return {
        ...base,
        speed: 0,
        life: pattern === 'toggle_aura' ? 2.5 : 1.1,
        knockbackMm: 160 * intensity,
        knockupVy: 1.5 * intensity,
        meshKey: pattern === 'toggle_aura' ? null : 'burst'
      };
    case 'caster_to_target':
    default:
      return {
        ...base,
        gravity: knobs.element === 'holy' ? -2 : 0,
        meshKey: 'summon',
        life: 2.8
      };
  }
}

/**
 * Element → default summon mesh key (lab SI extracts).
 * Never load whole multipack — only split summons.
 */
export const SUMMON_MESH_BY_ELEMENT = Object.freeze({
  fire: './models/vfx/summons/summon-fire-fist.glb',
  ice: './models/vfx/summons/summon-ice-shard.glb',
  frost: './models/vfx/summons/summon-ice-shard.glb',
  water: './models/vfx/summons/summon-ice-shard.glb',
  holy: './models/vfx/summons/summon-fire-fist.glb', // tint gold at runtime until holy mesh
  storm: './models/vfx/summons/summon-fire-fist.glb',
  nature: './models/vfx/summons/summon-ice-shard.glb',
  arcane: './models/vfx/summons/summon-fire-fist.glb',
  physical: null
});

/**
 * Attach delivery + physics profile onto a DRC skill (non-destructive).
 * @param {object} skill
 */
export function enrichSkillDelivery(skill) {
  if (!skill) return skill;
  const pattern = skill.delivery || inferDeliveryPattern(skill);
  const physics = deliveryPhysicsProfile(pattern, {
    speed: skill.projectileSpeed,
    aoe: skill.rangeM ? Math.min(2.5, skill.rangeM * 0.15) : undefined,
    intensity: 1,
    element: skill.element || skill.abilityElement
  });
  return {
    ...skill,
    delivery: pattern,
    deliveryLabel: DELIVERY_META[pattern]?.label || pattern,
    deliveryPhysics: physics,
    summonMeshUrl:
      skill.summonMeshUrl ||
      SUMMON_MESH_BY_ELEMENT[skill.element] ||
      SUMMON_MESH_BY_ELEMENT[skill.abilityElement] ||
      null
  };
}
