/**
 * Staff magic orbs + charge shell SSOT (Casting lab).
 *
 * Assets (split — never load multipack whole as projectile):
 *  - public/models/vfx/orbs/orb-{fire,ice,nature,storm,holy,arcane}.glb  ← gd_orbs_pack
 *  - public/models/vfx/charge/staff-charge.glb  ← kamehameha_charging (small)
 *
 * All weapon staffs share **slot 1 normal attack** = stream orb projectile.
 * Focus + LMB fires that primary (slot index 0 / hotbar 1).
 *
 * @see scripts/split-gd-orbs-and-charge.mjs
 * @see grudge-vfx-orbs-strike skill
 */

import { Color, AdditiveBlending, DoubleSide } from 'three';
import { CASTING_ELEMENT_PHASE_VFX, normalizeElement } from '../combat/elementWeaponSkills.js';

/** SI diameters after split bake */
export const STAFF_ORB_DIAMETER_M = 0.45;
export const STAFF_CHARGE_DIAMETER_M = 0.35;

/** Per-element orb mesh + tint (individually managed by staff attacks). */
export const STAFF_ORB_BY_ELEMENT = Object.freeze({
  fire: {
    id: 'orb-fire',
    path: './models/vfx/orbs/orb-fire.glb',
    color: 0xff6a1e,
    emissive: 0xff4008,
    emissiveIntensity: 0.85
  },
  ice: {
    id: 'orb-ice',
    path: './models/vfx/orbs/orb-ice.glb',
    color: 0x5fd6ff,
    emissive: 0x2a8cff,
    emissiveIntensity: 0.75
  },
  frost: {
    id: 'orb-ice',
    path: './models/vfx/orbs/orb-ice.glb',
    color: 0x5fd6ff,
    emissive: 0x2a8cff,
    emissiveIntensity: 0.75
  },
  nature: {
    id: 'orb-nature',
    path: './models/vfx/orbs/orb-nature.glb',
    color: 0x6bbf4a,
    emissive: 0x2e9a28,
    emissiveIntensity: 0.7
  },
  storm: {
    id: 'orb-storm',
    path: './models/vfx/orbs/orb-storm.glb',
    color: 0x9fdcff,
    emissive: 0x4aa8ff,
    emissiveIntensity: 0.9
  },
  holy: {
    id: 'orb-holy',
    path: './models/vfx/orbs/orb-holy.glb',
    color: 0xffe08a,
    emissive: 0xffc94a,
    emissiveIntensity: 0.95
  },
  arcane: {
    id: 'orb-arcane',
    path: './models/vfx/orbs/orb-arcane.glb',
    color: 0xb070ff,
    emissive: 0x7a28e8,
    emissiveIntensity: 0.9
  }
});

/** Small charge shell — tinted per element at runtime. */
export const STAFF_CHARGE = Object.freeze({
  id: 'staff-charge',
  path: './models/vfx/charge/staff-charge.glb',
  diameterM: STAFF_CHARGE_DIAMETER_M,
  tipScale: 0.85,
  pulseHz: 3.2
});

/**
 * Shared **normal attack** contract for every staff / wand primary (hotbar slot 1).
 * Catalog skill ids stay per-weapon; delivery/VFX is this pattern.
 */
export const STAFF_NORMAL_ATTACK = Object.freeze({
  slot: 0,
  slotType: 'primary',
  hotkey: '1',
  style: 'spell',
  pathMode: 'stream',
  presentation: 'volley',
  animRole: 'cast',
  animPack: 'magic',
  castClip: 'magic/standing 1h cast spell 01',
  rangeM: 14,
  cooldown: 0.45,
  castDuration: 0.5,
  projectileDiameterM: STAFF_ORB_DIAMETER_M,
  chargeMesh: STAFF_CHARGE.path,
  useOrbProjectile: true,
  label: 'Normal Attack',
  hint: '1 / focus LMB — staff normal (orb stream)'
});

/**
 * @param {string} [element]
 * @returns {{ id: string, path: string, color: number, emissive: number, emissiveIntensity: number }}
 */
export function staffOrbForElement(element) {
  const el = normalizeElement(element || 'arcane');
  return STAFF_ORB_BY_ELEMENT[el] || STAFF_ORB_BY_ELEMENT.arcane;
}

/**
 * @param {string} [element]
 * @returns {string} mesh URL for projectile
 */
export function staffProjectileMeshUrl(element) {
  return staffOrbForElement(element).path;
}

/**
 * @param {string} [element]
 * @returns {number} hex color
 */
export function staffElementColor(element) {
  const phase = CASTING_ELEMENT_PHASE_VFX[normalizeElement(element || 'arcane')];
  if (phase?.color != null) return phase.color;
  return staffOrbForElement(element).color;
}

/**
 * Apply elemental materials to an orb / charge mesh clone.
 * @param {import('three').Object3D} root
 * @param {string} [element]
 * @param {{ additive?: boolean, intensity?: number }} [opts]
 */
export function applyElementalOrbMaterials(root, element, opts = {}) {
  if (!root) return;
  const def = staffOrbForElement(element);
  const intensity = opts.intensity ?? 1;
  const col = new Color(def.color);
  const em = new Color(def.emissive);
  root.traverse((o) => {
    if (!o.isMesh || !o.material) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    const next = mats.map((m) => {
      const mat = m.clone();
      if (mat.color) mat.color.copy(col);
      if (mat.emissive) {
        mat.emissive.copy(em);
        mat.emissiveIntensity = (def.emissiveIntensity || 0.8) * intensity;
      }
      if (opts.additive) {
        mat.transparent = true;
        mat.depthWrite = false;
        mat.blending = AdditiveBlending;
        mat.opacity = Math.min(1, 0.55 + 0.35 * intensity);
      } else if (mat.opacity != null && mat.opacity < 1) {
        mat.transparent = true;
      }
      if (mat.side !== undefined) mat.side = DoubleSide;
      mat.needsUpdate = true;
      return mat;
    });
    o.material = next.length === 1 ? next[0] : next;
  });
}

/**
 * True when skill is a staff/wand normal (slot-1 primary stream bolt).
 * @param {object} skill
 */
export function isStaffNormalAttack(skill) {
  if (!skill) return false;
  if (skill.useOrbProjectile === true) return true;
  if (skill.isWeaponPrimary && skill.style === 'spell') return true;
  const slot = skill.slot;
  const isPrimary =
    slot === 0 ||
    slot === -1 ||
    skill.slotType === 'primary' ||
    skill.hotkey === '1' ||
    skill.hotkey === 'f';
  if (!isPrimary) return false;
  const style = skill.style || skill.labStyle;
  if (style === 'melee') return false;
  if (skill.isFocus || skill.isWard || skill.skillKind === 'buff') return false;
  // Staff / wand / magic catalog
  const blob = `${skill.id || ''} ${skill.weaponId || ''} ${skill.weaponTypeId || ''} ${skill.catalogSkillId || ''}`.toLowerCase();
  if (/staff|wand|magic|tome|apprentice|practice.?bolt|practice.?root|fire.?bolt|frost.?bolt|arcane.?bolt/.test(blob)) {
    return true;
  }
  if (skill.pathMode === 'stream' && (skill.element || skill.abilityElement)) return true;
  return false;
}

/**
 * Paths to warm (preload).
 * @returns {string[]}
 */
export function staffOrbWarmUrls() {
  const urls = new Set([STAFF_CHARGE.path]);
  for (const o of Object.values(STAFF_ORB_BY_ELEMENT)) urls.add(o.path);
  return [...urls];
}
