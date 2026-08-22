/**
 * Advanced play classes — one SSOT for collider, travel, and Warlords specs.
 *
 * Collider classes (Rapier):
 *   cct | heightfield | convex | trimesh | followConvex | sensor | hurtbox
 * Travel classes (weapon / class skills):
 *   melee | bullet | linear | bend
 * Product classes (eight specs, four families):
 *   warrior · raider · mage · priest · ranger · thief · worge · verduror
 *
 * Do not invent skill ids. Do not add a second physics engine.
 *
 * @see src/physics/PhysicsWorld.js
 * @see src/combat/weaponSkillProduction.js
 * @see src/combat/classAbilities.js
 */

import { FAMILY_OF, classIdFromRole } from '../api/classSkillTrees.js';

export const COLLIDER_CLASSES = Object.freeze({
  cct: {
    id: 'cct',
    shape: 'capsule',
    body: 'player',
    kinematic: true,
    si: { radius: 0.35, halfHeight: 0.55 }
  },
  heightfield: {
    id: 'heightfield',
    shape: 'heightfield',
    body: 'terrain',
    fixed: true
  },
  convex: {
    id: 'convex',
    shape: 'convexHull',
    body: 'static-gltf',
    fixed: true,
    from: 'mesh-verts'
  },
  trimesh: {
    id: 'trimesh',
    shape: 'trimesh',
    body: 'static-gltf',
    fixed: true,
    maxTris: 8000,
    ban: 'dynamic'
  },
  followConvex: {
    id: 'followConvex',
    shape: 'convexHull',
    body: 'weapon',
    kinematic: true,
    sensor: true,
    follow: 'Bip001 R Hand / R_hand_container'
  },
  sensor: {
    id: 'sensor',
    shape: 'any',
    body: 'trigger',
    sensor: true
  },
  hurtbox: {
    id: 'hurtbox',
    shape: 'sphere',
    body: 'bone',
    follows: 'skeleton'
  }
});

export const TRAVEL_CLASSES = Object.freeze(['melee', 'bullet', 'linear', 'bend']);

/**
 * Three Rapier VFX roles on the one PhysicsWorld — not three worlds.
 * Spline (CatmullRom) drives shape + effect; slash hull follows the weapon mesh.
 */
export const RAPIER_VFX_SYSTEMS = Object.freeze({
  shape: {
    id: 'shape',
    colliderClass: 'sensor',
    body: 'kinematicPositionBased',
    shape: 'capsule',
    use: '3d shape animation — mist/line head along CatmullRom'
  },
  slash: {
    id: 'slash',
    colliderClass: 'followConvex',
    body: 'kinematicPositionBased',
    shape: 'convexHull',
    use: 'weapon slash hull on Bip001 R Hand'
  },
  effect: {
    id: 'effect',
    colliderClass: 'sensor',
    body: 'kinematicPositionBased',
    shape: 'ball',
    use: 'heal mist beads, totem tether, AoE trigger'
  }
});

/** Family → default travel + weapon collider for class skills. */
export const CLASS_PLAY_DEFAULTS = Object.freeze({
  warrior: { travelMode: 'melee', colliderClass: 'followConvex', pack: 'sword_shield' },
  raider: { travelMode: 'melee', colliderClass: 'followConvex', pack: 'sword_shield' },
  mage: { travelMode: 'linear', colliderClass: 'sensor', pack: 'magic' },
  priest: { travelMode: 'linear', colliderClass: 'sensor', pack: 'magic' },
  ranger: { travelMode: 'linear', colliderClass: 'followConvex', pack: 'longbow' },
  thief: { travelMode: 'bullet', colliderClass: 'followConvex', pack: 'pistol' },
  worge: { travelMode: 'melee', colliderClass: 'followConvex', pack: 'sword_shield' },
  verduror: { travelMode: 'bend', colliderClass: 'sensor', pack: 'magic' }
});

/**
 * @param {string} classId
 */
export function playDefaultsForClass(classId) {
  const id = classIdFromRole(classId);
  return CLASS_PLAY_DEFAULTS[id] || CLASS_PLAY_DEFAULTS.warrior;
}

/**
 * Infer travel class from style/effects, falling back to the spec default.
 * @param {{ style?: string, element?: string, effects?: string[], useBulletProjectile?: boolean, pathMode?: string, classId?: string }} skill
 */
export function inferTravelClass(skill = {}) {
  if (TRAVEL_CLASSES.includes(skill.travelMode)) return skill.travelMode;
  if (skill.useBulletProjectile || skill.projectileKind === 'bullet') return 'bullet';
  if (skill.skillKind === 'buff' || skill.style === 'heal' || skill.style === 'buff' || skill.style === 'debuff') {
    return playDefaultsForClass(skill.classId).travelMode;
  }
  const blob = `${skill.id || ''} ${skill.style || ''} ${skill.element || ''} ${(skill.effects || []).join(' ')} ${skill.pathMode || ''}`.toLowerCase();
  if (/pistol|flintlock|handgun/.test(blob)) return 'bullet';
  if (/wall|spikes|stream|path_|bend|mist|vine|entangle|jade/.test(blob)) return 'bend';
  if (skill.style === 'spell' || /bolt|orb|meteor|smite|shot|arrow/.test(blob)) return 'linear';
  if (skill.style === 'physical' || skill.style === 'melee') return 'melee';
  const spec = playDefaultsForClass(skill.classId);
  return spec.travelMode;
}

/**
 * Collider class for a compiled skill (weapon hull vs sensor AoE vs CCT).
 * @param {{ style?: string, travelMode?: string, classId?: string, isAoE?: boolean }} skill
 */
export function inferColliderClass(skill = {}) {
  if (skill.colliderClass && COLLIDER_CLASSES[skill.colliderClass]) return skill.colliderClass;
  const travel = inferTravelClass(skill);
  if (skill.isAoE || travel === 'bend' || skill.style === 'buff' || skill.style === 'heal') return 'sensor';
  if (travel === 'melee' || travel === 'bullet') return 'followConvex';
  if (travel === 'linear') return 'sensor';
  return playDefaultsForClass(skill.classId).colliderClass;
}

export function familyOfClass(classId) {
  const id = classIdFromRole(classId);
  return FAMILY_OF[id] || 'warrior';
}

export const PLAY_CLASS_CONTRACT = Object.freeze({
  productClasses: ['warrior', 'raider', 'mage', 'priest', 'ranger', 'thief', 'worge', 'verduror'],
  colliderClasses: Object.keys(COLLIDER_CLASSES),
  travelClasses: [...TRAVEL_CLASSES],
  rapierVfxSystems: Object.keys(RAPIER_VFX_SYSTEMS),
  note: 'Eight specs · four families. Weapon 1–3 stay on the item. Class F / Shift+1–5 use these travel+collider stamps. VFX Rapier: shape + slash + effect on one world, spline-driven mist/tether.'
});
