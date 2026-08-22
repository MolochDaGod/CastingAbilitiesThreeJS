/**
 * Learn skill: fire-bending projectile editor → every weapon shot / mist / volley.
 *
 * Author knobs: settings.fire (Editor → Fire)
 *   speed · flightArc · streamLength · explosionSize · smokeLifetime (≤6 s)
 *
 * Three uses (one learn, not a second projectile engine):
 *   bolt   — fast, little/no arc, trail long/short, impact small/large
 *            guns · crossbows · staff/wand normal · bows
 *   mist   — colored vapor up to 6 s (heal yellow · poison green · proc)
 *            melee impact · next-attack-will · passive tell
 *   volley — rapid / multi-shot (same bolt, staggered yaw)
 *
 * Sibling of learn_bending_path_trail (weaponTrailLearn.js).
 *
 * @see docs/BENDING_PRESETS_SSOT.md
 * @see src/config/settings.js settings.fire
 */

import { settings } from '../config/settings.js';
import { familyFromWeaponType } from '../character/weaponPrefabSpine.js';
import { PISTOL_BULLET } from './pistolBulletVfx.js';
import { fireBendingTrailKnobs } from './weaponTrailLearn.js';

export const PROJECTILE_LEARN_ID = 'learn_bending_projectile';

/** @typedef {'bolt'|'mist'|'volley'} ProjectileLearnUse */

export const PROJECTILE_USES = Object.freeze({
  bolt: {
    id: 'bolt',
    label: 'Fast bolt',
    blurb: 'Little/no arc · trail long or short · explosion small or large',
    weapons: ['gun', 'rifle', 'bow', 'staff', 'wand', 'crossbow']
  },
  mist: {
    id: 'mist',
    label: 'Smoke / vapor',
    blurb: 'Colored mist up to 6 s — heal yellow, poison green, proc / next-attack',
    weapons: ['staff', 'wand', 'mace', 'sword', 'dagger']
  },
  volley: {
    id: 'volley',
    label: 'Rapid / multi',
    blurb: 'Same bolt, staggered shots — burst, multishot, rapid fire',
    weapons: ['gun', 'rifle', 'bow', 'wand']
  }
});

/** Vapor tints (heal / poison / holy / proc). */
export const MIST_TINT = Object.freeze({
  heal: '#ffe08a',
  holy: '#ffd27a',
  poison: '#53e93f',
  nature: '#6bbf4a',
  fire: '#ff6a1e',
  ice: '#7ec8ff',
  storm: '#9fdcff',
  arcane: '#b070ff',
  proc: '#c8f0ff',
  next: '#eafcff'
});

/**
 * Family ballistic defaults. Fire editor speed/arc/explosion override when set.
 * Gun stays ~90 m/s lab (readable); staff uses settings.fire.speed (38.2).
 */
export const BOLT_BY_FAMILY = Object.freeze({
  gun: { speed: 90, arc: 0, trailFrac: 0.22, explosion: 0.3 },
  pistol: { speed: 90, arc: 0, trailFrac: 0.22, explosion: 0.3 },
  rifle: { speed: 95, arc: 0, trailFrac: 0.28, explosion: 0.35 },
  bow: { speed: 28, arc: 0, trailFrac: 0.55, explosion: 0.4 },
  crossbow: { speed: 42, arc: 0, trailFrac: 0.32, explosion: 0.32 },
  staff: { speed: 38.2, arc: 0, trailFrac: 1, explosion: 0.3 },
  wand: { speed: 32, arc: 0, trailFrac: 0.8, explosion: 0.28 },
  magic: { speed: 38.2, arc: 0, trailFrac: 1, explosion: 0.3 }
});

function fire() {
  return settings.fire || {};
}

function learnCfg() {
  return settings.projectileLearn || {};
}

/** Bolt knobs from the Fire editor (speed, arc, stream, explosion). */
export function fireBendingBoltKnobs() {
  const f = fire();
  const trail = fireBendingTrailKnobs();
  return {
    speed: f.speed ?? 38.2,
    arc: f.flightArc ?? 0,
    gravity: (f.flightArc ?? 0) > 0.05 ? -9.8 * (f.flightArc ?? 0) : 0,
    trailLength: f.streamLength ?? 1.5,
    trailWidth: f.flameWidth ?? 0.12,
    explosionSize: f.explosionSize ?? 0.3,
    explosionBrightness: f.explosionBrightness ?? 0.2,
    explosionShake: f.explosionShake ?? 0.34,
    explosionFlash: f.explosionFlash ?? 0.21,
    colorInner: trail.colorInner,
    colorOuter: trail.colorOuter
  };
}

/**
 * Mist / vapor knobs from Fire smoke editor. Duration clamped to 6 s.
 * @param {string} [tintHex]
 */
export function fireBendingMistKnobs(tintHex) {
  const f = fire();
  const maxSec = learnCfg().mistMaxSec ?? 6;
  const life = Math.min(maxSec, Math.max(0.2, f.smokeLifetime ?? 0.65));
  return {
    duration: life,
    size: Math.max(0.25, (f.smokeSize ?? 0.31) * 3.2),
    density: f.smokeDensity ?? 0.09,
    speed: f.smokeSpeed ?? 0.52,
    color: tintHex || f.colorSmoke || '#181616',
    enabled: false
  };
}

export function mistTintForSkill(skill) {
  const blob = [
    skill?.id,
    skill?.label,
    skill?.skillKind,
    skill?.element,
    skill?.abilityElement,
    ...(skill?.effects || []),
    ...(skill?.statuses || []).map((s) => s.id || s.kind)
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  if (/heal|renew|restore|hot|disc/.test(blob) || skill?.isHeal) return MIST_TINT.heal;
  if (/poison|venom|toxic/.test(blob)) return MIST_TINT.poison;
  if (/holy|smite|bless|radiance/.test(blob) || skill?.element === 'holy') return MIST_TINT.holy;
  if (/next.?attack|empower|proc|imbue/.test(blob)) return MIST_TINT.next;
  if (skill?.element === 'nature') return MIST_TINT.nature;
  if (skill?.element === 'ice' || skill?.element === 'frost') return MIST_TINT.ice;
  if (skill?.element === 'storm') return MIST_TINT.storm;
  if (skill?.element === 'arcane') return MIST_TINT.arcane;
  if (skill?.element === 'fire') return MIST_TINT.fire;
  return MIST_TINT.proc;
}

export function mistWanted(skill) {
  if (!skill) return false;
  if (skill.useMist === true || skill.mist === true) return true;
  const blob = [
    skill.id,
    skill.label,
    skill.presentation,
    skill.pathMode,
    ...(skill.effects || []),
    ...(skill.statuses || []).map((s) => s.id || s.kind)
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  if (/mist|vapor|smoke|gas|cloud|aoe|nova|proc|poison|heal|imbue|next.?attack|passive.?tell/.test(blob)) {
    return true;
  }
  if (skill.isHeal || skill.isWard) return true;
  if (skill.pathMode === 'aoe' || skill.style === 'spell' && /holy|nature/.test(String(skill.element || ''))) {
    if (skill.slotType === 'ability' || skill.slotType === 'ultimate' || (skill.slot | 0) >= 2) return true;
  }
  return false;
}

export function inferVolleyCount(skill) {
  const n = Number(skill?.multiHit);
  if (n > 1) return Math.min(8, Math.floor(n));
  const blob = `${skill?.id || ''} ${skill?.label || ''} ${skill?.description || ''} ${(skill?.effects || []).join(' ')}`.toLowerCase();
  if (/three.?round|3.?round|triple|multishot/.test(blob)) return 3;
  if (/double|twin|2.?hit|two.?round/.test(blob)) return 2;
  if (/burst|rapid|volley|multi.?shot/.test(blob)) return 3;
  return 1;
}

function familyBoltBase(family) {
  return BOLT_BY_FAMILY[family] || BOLT_BY_FAMILY.staff;
}

/**
 * Compile bolt + mist + volley for a catalog/production skill.
 * @param {object} skill
 * @param {{ family?: string, weaponType?: string }} [ctx]
 */
export function compileProjectileLearn(skill, ctx = {}) {
  const family =
    ctx.family ||
    skill?.family ||
    familyFromWeaponType(ctx.weaponType || skill?.weaponTypeId);
  const fireBolt = fireBendingBoltKnobs();
  const base = familyBoltBase(family);
  const phys = skill?.physics || {};
  const isGun = family === 'gun' || family === 'pistol' || family === 'rifle';
  const isBow = family === 'bow' || family === 'crossbow';
  const speed = Number(phys.speed) > 0
    ? Number(phys.speed)
    : isGun
      ? (PISTOL_BULLET.speed || base.speed)
      : isBow
        ? base.speed
        : fireBolt.speed || base.speed;
  const arc = phys.arc != null ? Number(phys.arc) : fireBolt.arc;
  const gravity =
    phys.gravity != null
      ? Number(phys.gravity)
      : arc > 0.05
        ? -9.8 * arc
        : isGun
          ? PISTOL_BULLET.gravity
          : 0;
  const explosionSize = Number(phys.aoeM || phys.aoe) > 0
    ? Number(phys.aoeM || phys.aoe)
    : fireBolt.explosionSize || base.explosion;
  const trailFrac = base.trailFrac;
  const trail = fireBendingTrailKnobs();
  const mist = fireBendingMistKnobs(mistTintForSkill(skill));
  mist.enabled = mistWanted(skill);
  if (mist.enabled && mist.duration < 1.2 && /heal|poison|aoe|nova/.test(`${skill?.id || ''} ${skill?.label || ''}`)) {
    mist.duration = Math.min(learnCfg().mistMaxSec ?? 6, Math.max(2.4, mist.duration * 4));
  }
  const count = inferVolleyCount(skill);
  return {
    learnId: PROJECTILE_LEARN_ID,
    family,
    bolt: {
      speed,
      arc,
      gravity,
      trailLength: (fireBolt.trailLength || 1.5) * trailFrac,
      trailWidth: Math.max(0.012, trail.width * (isGun ? 0.35 : isBow ? 0.5 : 1)),
      explosionSize,
      explosionBrightness: fireBolt.explosionBrightness,
      explosionShake: fireBolt.explosionShake,
      explosionFlash: fireBolt.explosionFlash,
      colorInner: trail.colorInner,
      colorOuter: trail.colorOuter
    },
    mist,
    volley: {
      count,
      gapSec: learnCfg().volleyGapSec ?? 0.08,
      spreadRad: learnCfg().volleySpreadRad ?? 0.045
    }
  };
}

/**
 * Staggered yaw shots for volley / rapid / multi.
 * @param {{ count?: number, gapSec?: number, spreadRad?: number }} volley
 * @param {(shot: { i: number, n: number, yaw: number, delay: number }) => void} fn
 */
export function forEachVolleyShot(volley, fn) {
  const n = Math.max(1, Math.min(8, (volley?.count | 0) || 1));
  const gap = Math.max(0, volley?.gapSec ?? 0.08);
  const spread = volley?.spreadRad ?? 0.045;
  for (let i = 0; i < n; i++) {
    const yaw = n === 1 ? 0 : (i - (n - 1) / 2) * spread;
    fn({ i, n, yaw, delay: i * gap });
  }
}

export function applyYawToForward(forward, yaw) {
  if (!forward || !yaw) return forward;
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const x = forward.x * c - forward.z * s;
  const z = forward.x * s + forward.z * c;
  forward.x = x;
  forward.z = z;
  if (forward.lengthSq() > 1e-8) forward.normalize();
  return forward;
}

/** Scriptable learn card — studio / worker. */
export function describeProjectileLearnSkill() {
  return {
    id: PROJECTILE_LEARN_ID,
    label: 'Bending projectile',
    source: 'settings.fire · Editor Fire (speed · arc · stream · explosion · smoke)',
    uses: Object.values(PROJECTILE_USES),
    apply: 'compileProjectileLearn(skill) → SkillProjectileSystem.spawn / puffMist / volley',
    ready: ['bolt', 'mist', 'volley'],
    mistMaxSec: 6
  };
}
