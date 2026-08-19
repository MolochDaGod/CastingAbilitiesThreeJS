/**
 * SI projectile saves — 5 families × 5 trail colors.
 *
 * Extends PathTrail · learn_bending_path_trail · settings.fire / wind silk.
 * Does not invent a second projectile engine. Dash stays silk gust
 * (OceanWindIndicators.spawnCombatGust) — never WindAbility tornado.
 *
 * @see scripts/split-projectile-color-saves.mjs
 * @see public/models/vfx/projectiles/projectile-saves.json
 */
import { Color, DoubleSide } from 'three';
import { PISTOL_BULLET } from './pistolBulletVfx.js';
import { ARROW_SYSTEMS } from './elementAttackVfx.js';
import { trailVariantForUse } from './effectVariants.js';
import { fireBendingTrailKnobs } from './weaponTrailLearn.js';

/** Five product colors (same palette as staff orbs). */
export const PROJECTILE_COLORS = Object.freeze([
  { id: 'fire', label: 'Fire', hex: '#ff6a1e', emissive: '#ff4008', trailId: 'fire_core_mid' },
  { id: 'ice', label: 'Ice', hex: '#6ec8ff', emissive: '#2a8cff', trailId: 'air_arrow' },
  { id: 'storm', label: 'Storm', hex: '#c9f0ff', emissive: '#4aa8ff', trailId: 'air_dash' },
  { id: 'holy', label: 'Holy', hex: '#ffe080', emissive: '#ffc94a', trailId: 'fire_gold_slash' },
  { id: 'nature', label: 'Nature', hex: '#80e060', emissive: '#2e9a28', trailId: 'air_slash' }
]);

/**
 * One sized source GLB per family. Color copies are tiny tints of these
 * (arrows/bolts baked) or runtime tint (bullet/cannon/magic — large sources).
 */
export const PROJECTILE_FAMILIES = Object.freeze({
  arrow: Object.freeze({
    id: 'arrow',
    label: 'Arrow',
    source: './models/vfx/arrows/arrow-path.glb',
    lengthM: 0.75,
    speed: 18,
    gravity: 0,
    contactRadius: 0.28,
    trailUse: 'arrow',
    kind: 'arrow',
    baked: true
  }),
  bolt: Object.freeze({
    id: 'bolt',
    label: 'Bolt',
    source: './models/vfx/arrows/arrow-loft.glb',
    lengthM: 0.42,
    speed: 24,
    gravity: -4,
    contactRadius: 0.22,
    trailUse: 'arrow',
    kind: 'bolt',
    baked: true
  }),
  bullet: Object.freeze({
    id: 'bullet',
    label: 'Bullet',
    source: PISTOL_BULLET.meshUrl,
    lengthM: PISTOL_BULLET.lengthM,
    speed: PISTOL_BULLET.speed,
    gravity: PISTOL_BULLET.gravity,
    contactRadius: PISTOL_BULLET.contactRadius,
    trailUse: 'tail',
    kind: 'bullet',
    baked: false
  }),
  cannon: Object.freeze({
    id: 'cannon',
    label: 'Cannon ball',
    source: './models/vfx/rocks/rock-0.glb',
    lengthM: 0.16,
    speed: 28,
    gravity: -18,
    contactRadius: 0.22,
    trailUse: 'tail',
    kind: 'cannon',
    baked: false
  }),
  magic: Object.freeze({
    id: 'magic',
    label: 'Magic spline + mist',
    source: './models/vfx/orbs/orb-fire.glb',
    impactMesh: './models/vfx/impact/sphering.glb',
    lengthM: 0.35,
    impactM: 0.55,
    speed: 14,
    gravity: 0,
    contactRadius: 0.4,
    trailUse: 'tail',
    kind: 'magic',
    spline: true,
    mist: true,
    baked: false
  })
});

export function projectileColor(id) {
  return PROJECTILE_COLORS.find((c) => c.id === id) || PROJECTILE_COLORS[0];
}

export function projectileFamily(id) {
  return PROJECTILE_FAMILIES[id] || PROJECTILE_FAMILIES.arrow;
}

/** Baked tint path when split wrote a small color GLB. */
export function projectileMeshUrl(familyId, colorId) {
  const fam = projectileFamily(familyId);
  const col = projectileColor(colorId);
  if (fam.baked) {
    return `./models/vfx/projectiles/${fam.id}-${col.id}.glb`;
  }
  if (fam.id === 'magic') {
    return `./models/vfx/orbs/orb-${col.id === 'storm' ? 'storm' : col.id}.glb`;
  }
  return fam.source;
}

export function projectileTrailPaint(familyId, colorId) {
  const fam = projectileFamily(familyId);
  const col = projectileColor(colorId);
  const fire = fireBendingTrailKnobs();
  const useFireLook = col.id === 'fire' || col.id === 'holy' || fam.id === 'bullet';
  const variant = trailVariantForUse(
    fam.trailUse,
    useFireLook ? 'fire' : 'wind',
  );
  const widthMul =
    fam.id === 'bullet' ? 0.35 : fam.id === 'cannon' ? 0.7 : fam.id === 'magic' ? 1.15 : 0.55;
  return {
    learnId: 'learn_bending_path_trail',
    use: fam.trailUse,
    followProjectile: true,
    color: useFireLook ? fire.colorInner : col.hex,
    colorOuter: useFireLook ? fire.colorOuter : col.emissive,
    width: Math.max(0.012, fire.width * widthMul),
    glow: fire.glow,
    opacity: fire.opacity,
    dissolveSpeed: fire.dissolveSpeed,
    taper: fire.taper,
    softness: fire.softness,
    sparkle: fire.sparkle,
    flowSpeed: fire.flowSpeed,
    noiseStrength: fire.noiseStrength,
    noiseFrequency: fire.noiseFrequency,
    life: fam.id === 'bullet' ? PISTOL_BULLET.life : 2.2,
    length: variant?.length ?? fire.length ?? (fam.id === 'bullet' ? 0.25 : 0.7)
  };
}

export function projectileTintHex(colorId) {
  const c = projectileColor(colorId);
  return {
    color: new Color(c.hex),
    emissive: new Color(c.emissive)
  };
}

/** Runtime tint — used for bullet / cannon / magic (no 1MB×5 dumps). */
export function applyProjectileTint(root, colorId) {
  if (!root) return;
  const { color, emissive } = projectileTintHex(colorId);
  root.traverse((o) => {
    if (!o.isMesh || !o.material) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    const next = mats.map((m) => {
      const mat = m.clone();
      if (mat.color) mat.color.copy(color);
      if (mat.emissive) {
        mat.emissive.copy(emissive);
        mat.emissiveIntensity = 0.75;
      }
      if (mat.side !== undefined) mat.side = DoubleSide;
      mat.needsUpdate = true;
      return mat;
    });
    o.material = next.length === 1 ? next[0] : next;
  });
}

export const PROJECTILE_SAVE_IDS = Object.freeze(
  Object.keys(PROJECTILE_FAMILIES).flatMap((fam) =>
    PROJECTILE_COLORS.map((c) => `${fam}-${c.id}`)
  )
);

/** Infer family from catalog skill text — no new skill ids. */
export function inferProjectileFamily(skill) {
  if (skill?.projectileFamily && PROJECTILE_FAMILIES[skill.projectileFamily]) {
    return skill.projectileFamily;
  }
  const blob = `${skill?.id || ''} ${skill?.label || ''} ${skill?.weaponTypeId || ''} ${(skill?.effects || []).join(' ')}`.toLowerCase();
  if (/cannon|cannonball|mortar/.test(blob)) return 'cannon';
  if (/bolt|crossbow|quarrel/.test(blob) && !/thunder|lightning|fire.?bolt|frost.?bolt/.test(blob)) {
    return 'bolt';
  }
  if (/arrow|longbow|bow_/.test(blob)) return 'arrow';
  if (/cannon|round.?shot/.test(blob)) return 'cannon';
  if (/mist|spline|magic.?bolt|wand/.test(blob) && skill?.style === 'spell') return 'magic';
  return null;
}

export function parseProjectileSaveId(id) {
  const [fam, col] = String(id || '').split('-');
  if (!PROJECTILE_FAMILIES[fam]) return null;
  return { family: fam, color: col || 'fire' };
}
