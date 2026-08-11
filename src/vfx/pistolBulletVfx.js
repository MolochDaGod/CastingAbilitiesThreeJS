/**
 * Flintlock / handgun bullet VFX SSOT (Casting lab).
 *
 * Mesh: Styloo bullet1.glb (SI ~0.027 m raw — already bullet-scale)
 * Weapon: flintlock.glb → public/models/weapons/t0-flintlock.glb for t0-gun
 * Anims: grudgepistolzio (loco/kneel author) + Open baked pistol combat
 *
 * Trail: 20% of default magic-trail length
 * Speed: game-bullet (~90 m/s lab — true 300+ m/s is unreadable)
 * Impact:
 *  - living (hostile/npc/player/boss) → red liquid blood splatter
 *  - terrain / aim / props → micro explosion, no blood
 *
 * @see docs/PISTOL_FLINTLOCK_SSOT.md
 */

export const PISTOL_BULLET = Object.freeze({
  meshUrl: './models/vfx/projectiles/bullet1.glb',
  /** SI length of visual bullet (m) — Styloo pack already ~cm; normalize if needed */
  lengthM: 0.028,
  diameterM: 0.008,
  /** Lab ballistic speed (m/s) */
  speed: 90,
  /** Max life before despawn (s) — 90 m/s × 1.2 s ≈ 108 m */
  life: 1.2,
  gravity: -2.5,
  contactRadius: 0.12,
  force: 6,
  knockbackMm: 80,
  knockupVy: 0.4,
  aoe: 0.35,
  /** Trail length as fraction of default staff trail (~1.0 → 0.2) */
  trailLengthFrac: 0.2,
  trailWidthM: 0.018,
  trailColor: 0xffcc88,
  muzzleFlashColor: 0xffaa44,
  muzzleFlashLife: 0.08
});

export const FLINTLOCK_WEAPON = Object.freeze({
  catalogId: 't0-gun',
  label: 'Flintlock Pistol',
  localMesh: './models/weapons/t0-flintlock.glb',
  /** SI hand length after attach normalize */
  handLengthM: 0.48,
  animPack: 'pistol',
  meshSlot: 'pistol'
});

/** Living target kinds for blood (CombatFocus + fleet) */
export const LIVING_TARGET_KINDS = Object.freeze([
  'hostile',
  'npc',
  'player',
  'enemy',
  'boss',
  'creature',
  'unit',
  'ally'
]);

/**
 * @param {{ kind?: string, id?: string, mesh?: object }|null|undefined} target
 */
export function isLivingTarget(target) {
  if (!target) return false;
  const kind = String(target.kind || target.mesh?.userData?.kind || '').toLowerCase();
  if (LIVING_TARGET_KINDS.includes(kind)) return true;
  if (target.mesh?.userData?.isLiving === true) return true;
  if (target.mesh?.userData?.isBoss === true) return true;
  if (target.mesh?.userData?.isNpc === true) return true;
  if (target.mesh?.userData?.isPlayer === true) return true;
  // Soft-lock hostiles from DevIsland dummies
  if (target.mesh?.userData?.hostile === true) return true;
  if (kind === 'aim' || kind === 'terrain' || kind === 'prop' || kind === 'ground') return false;
  return false;
}

/**
 * Skill looks like flintlock / handgun bullet shot (Practice · Burst · Suppress).
 * Buffs (Take Cover) are excluded by callers via isWard / damage 0.
 * @param {object} skill
 */
export function isPistolBulletSkill(skill) {
  if (!skill) return false;
  if (skill.isWard || skill.isFocus || skill.skillKind === 'buff') return false;
  if (Number(skill.damage) === 0 && skill.skillKind !== 'ranged') return false;
  if (
    skill.projectileKind === 'bullet' ||
    skill.projectile === 'bullet' ||
    skill.useBulletProjectile === true
  ) {
    return true;
  }
  const blob = [
    skill.id,
    skill.label,
    skill.catalogSkillId,
    skill.weaponId,
    skill.weaponTypeId,
    skill.animPack,
    skill.description
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  // Catalog ids t0_gun_* match t0_gun
  if (/flint|pistol|handgun|t0-gun|t0_gun|gunplay|musket|revolver/.test(blob)) {
    // Exclude pure utility names without shot/fire language when damage is 0
    if (Number(skill.damage) <= 0) return false;
    return true;
  }
  if (
    skill.style === 'ranged' &&
    /physical|pierce|bullet/.test(String(skill.damageType || skill.element || '').toLowerCase())
  ) {
    if (
      skill.slotType === 'primary' ||
      skill.slotType === 'ability' ||
      skill.slot === 0 ||
      skill.slot === 2 ||
      skill.slot === -1 ||
      skill.isWeaponPrimary ||
      skill.animPack === 'pistol'
    ) {
      return /gun|pistol|flint|burst|suppress|shot/i.test(blob) || skill.animPack === 'pistol';
    }
  }
  return false;
}

/**
 * Burst / multi-round count for pistol skills (catalog-first).
 * @param {object} skill
 * @returns {number} 1 = single shot
 */
export function pistolBulletCount(skill) {
  if (!skill) return 1;
  const n = Number(skill.multiHit);
  if (n > 1) return Math.min(8, Math.floor(n));
  const blob = `${skill.id || ''} ${skill.label || ''} ${skill.description || ''} ${(skill.effects || []).join(' ')}`.toLowerCase();
  if (/three.?round|3.?round|triple/i.test(blob)) return 3;
  if (/double|twin|2.?hit|two.?round/i.test(blob)) return 2;
  if (/burst|multi.?hit/i.test(blob)) return 3;
  return 1;
}
