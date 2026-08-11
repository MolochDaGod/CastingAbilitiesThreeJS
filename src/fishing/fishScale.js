/**
 * SI fish mesh fit — longer than tall/wide, sized for water play.
 *
 * Grudge rule: 1 unit = 1 m. Fish use **lengthM** (nose→tail / longest swim axis).
 * Never cube-fit to max(x,y,z) alone without preferring horizontal length, and
 * never leave a pack mesh as a 2 m tall goldfish or a 5 cm shark.
 *
 * @see fishingCatalog.js · docs/FISHING_PROFESSION_SSOT.md
 */

import { Box3, Vector3 } from 'three';

const _box = new Box3();
const _size = new Vector3();
const _center = new Vector3();

/**
 * Size class → typical SI length band (m) for catalog defaults.
 * @type {Record<string, { min: number, max: number, label: string }>}
 */
export const SIZE_CLASS = Object.freeze({
  tiny: { min: 0.06, max: 0.14, label: 'Tiny' },
  small: { min: 0.15, max: 0.35, label: 'Small' },
  medium: { min: 0.4, max: 0.9, label: 'Medium' },
  large: { min: 1.0, max: 2.2, label: 'Large' },
  huge: { min: 2.3, max: 4.5, label: 'Huge' },
  titan: { min: 5.0, max: 12, label: 'Titan' }
});

/** Rank for skill-tree / rod gates (higher = bigger game) */
export const SIZE_RANK = Object.freeze({
  tiny: 0,
  small: 1,
  medium: 2,
  large: 3,
  huge: 4,
  titan: 5
});

/**
 * After load: uniform scale to lengthM on longest axis, then mild stretch so
 * swim length ≥ height and ≥ width (elongated fish silhouette).
 *
 * @param {import('three').Object3D} root
 * @param {{ lengthM?: number, lengthAspect?: number, sizeClass?: string }} species
 */
export function applyFishWorldScale(root, species = {}) {
  if (!root) return root;
  const lengthM = resolveLengthM(species);
  const aspect = species.lengthAspect ?? 1.25;

  root.updateMatrixWorld(true);
  _box.setFromObject(root);
  _box.getSize(_size);
  const rawMax = Math.max(_size.x, _size.y, _size.z, 1e-4);
  const u = lengthM / rawMax;
  root.scale.multiplyScalar(u);

  // Prefer elongated swim shape: longest horizontal ≥ height * aspect and ≥ lateral width
  root.updateMatrixWorld(true);
  _box.setFromObject(root);
  _box.getSize(_size);
  const h = Math.max(_size.y, 1e-4);
  const sx = Math.max(_size.x, 1e-4);
  const sz = Math.max(_size.z, 1e-4);
  const longH = Math.max(sx, sz);
  const shortH = Math.min(sx, sz);
  const needVsHeight = h * aspect;
  const needVsWidth = shortH * aspect;
  const needLen = Math.max(longH, needVsHeight, needVsWidth, lengthM * 0.98);
  if (needLen > longH * 1.02) {
    const stretch = needLen / longH;
    // Stretch along dominant horizontal axis in local scale
    if (sx >= sz) root.scale.x *= stretch;
    else root.scale.z *= stretch;
  }

  // Final uniform nudge if longest dim drifted from lengthM
  root.updateMatrixWorld(true);
  _box.setFromObject(root);
  _box.getSize(_size);
  const finalMax = Math.max(_size.x, _size.y, _size.z, 1e-4);
  if (Math.abs(finalMax - lengthM) / lengthM > 0.12) {
    root.scale.multiplyScalar(lengthM / finalMax);
  }

  return root;
}

/**
 * @param {{ lengthM?: number, sizeClass?: string, weightKg?: [number, number] }} species
 */
export function resolveLengthM(species = {}) {
  if (Number.isFinite(species.lengthM) && species.lengthM > 0) return species.lengthM;
  const cls = species.sizeClass && SIZE_CLASS[species.sizeClass];
  if (cls) return (cls.min + cls.max) * 0.5;
  // weight fallback: rough cube-root of mid kg → meters (lab heuristic)
  const w = species.weightKg;
  if (Array.isArray(w) && w.length >= 2) {
    const mid = (w[0] + w[1]) * 0.5;
    return Math.min(10, Math.max(0.08, 0.35 * Math.cbrt(Math.max(0.01, mid))));
  }
  return 0.35;
}

/**
 * Lure mesh SI size (small bobber / bait — not fish-scale).
 * @param {import('three').Object3D} root
 * @param {number} [lengthM=0.12]
 */
export function applyLureWorldScale(root, lengthM = 0.12) {
  if (!root) return root;
  root.updateMatrixWorld(true);
  _box.setFromObject(root);
  _box.getSize(_size);
  const rawMax = Math.max(_size.x, _size.y, _size.z, 1e-4);
  root.scale.multiplyScalar(lengthM / rawMax);
  return root;
}

/**
 * Pole mesh SI — rod length along primary axis (~1.4–2.2 m by tier).
 * @param {import('three').Object3D} root
 * @param {number} [lengthM=1.6]
 */
export function applyPoleWorldScale(root, lengthM = 1.6) {
  if (!root) return root;
  root.updateMatrixWorld(true);
  _box.setFromObject(root);
  _box.getSize(_size);
  const rawMax = Math.max(_size.x, _size.y, _size.z, 1e-4);
  root.scale.multiplyScalar(lengthM / rawMax);
  return root;
}

export function sizeRank(sizeClass) {
  return SIZE_RANK[sizeClass] ?? 1;
}
