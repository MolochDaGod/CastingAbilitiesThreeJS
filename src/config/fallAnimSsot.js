/**
 * Jump / fall locomotion SSOT — deterministic air states + blend roles.
 *
 * Author FBX (disk → public same-origin):
 *   D:\Games\Models\Falling.fbx              → fall
 *   D:\Games\Models\Fall A Loop.fbx          → fallLoop
 *   D:\Games\Models\Falling To Landing.fbx   → fallLand
 *   D:\Games\Models\Falling To Roll.fbx      → fallRoll
 *   (optional) Falling Idle.fbx              → fallIdle
 *
 * State machine (deterministic, velocity-driven — no RNG):
 *
 *   ground ──Space──► jump (hold apex)
 *   jump / air rise ──vy < fallStartVy──► fallLoop (loop)
 *   fallLoop ──optional──► fall (long one-shot if loaded)
 *   air + land impact < rollVy ──► fallLand → idle/walk
 *   air + land impact ≥ rollVy + forward ──► fallRoll → idle/walk
 *
 * Blends: gaitBlend into fall · combatBlend out of land/roll · exclusive land/roll
 *
 * @see animation/fbxClip.js FALL_FBX_URLS
 * @see docs/ANIM_LIBRARY_SSOT.md
 */

/** Logical roles (ANIM_PACKS.combat_mobility + weapon packs inherit) */
export const FALL_ROLES = Object.freeze({
  fallLoop: 'fallLoop',
  fall: 'fall',
  fallLand: 'fallLand',
  fallRoll: 'fallRoll',
  fallIdle: 'fallIdle'
});

/**
 * Same-origin FBX (lab) then Open CDN when promoted.
 * Prefer local public first for deterministic author review.
 */
export const FALL_FBX_URLS = Object.freeze({
  fallLoop: [
    './anim/locomotion/fall/fall-loop.fbx',
    'https://open.grudge-studio.com/anim/locomotion/fall/fall-loop.fbx'
  ],
  fall: [
    './anim/locomotion/fall/falling.fbx',
    'https://open.grudge-studio.com/anim/locomotion/fall/falling.fbx'
  ],
  fallLand: [
    './anim/locomotion/fall/fall-to-landing.fbx',
    'https://open.grudge-studio.com/anim/locomotion/fall/fall-to-landing.fbx'
  ],
  fallRoll: [
    './anim/locomotion/fall/fall-to-roll.fbx',
    'https://open.grudge-studio.com/anim/locomotion/fall/fall-to-roll.fbx'
  ],
  fallIdle: [
    './anim/locomotion/fall/fall-idle.fbx',
    'https://open.grudge-studio.com/anim/locomotion/fall/fall-idle.fbx'
  ]
});

/** Baked JSON candidates when promoted to Open CDN */
export const FALL_BAKED_CANDIDATES = Object.freeze({
  fallLoop: ['locomotion/fall-loop', 'locomotion/fall_a_loop', 'extra/fall-loop'],
  fall: ['locomotion/falling', 'locomotion/fall', 'extra/falling'],
  fallLand: ['locomotion/fall-to-landing', 'locomotion/falling-to-landing'],
  fallRoll: ['locomotion/fall-to-roll', 'locomotion/falling-to-roll'],
  fallIdle: ['locomotion/fall-idle', 'locomotion/falling-idle']
});

/**
 * Deterministic thresholds (SI m/s). Tune in settings.drc.fall later if needed.
 */
export const FALL_THRESHOLDS = Object.freeze({
  /** Enter fallLoop when vertical velocity below this (descending) */
  fallStartVy: -0.55,
  /** Soft land if |impactVy| below this */
  softLandVy: 4.2,
  /** Hard land / roll if |impactVy| at or above this and moving forward */
  rollImpactVy: 6.5,
  /** Min horizontal speed (m/s) to prefer fallRoll over fallLand on hard impact */
  rollMinHoriz: 1.8,
  /** Blend into fallLoop from jump (s) */
  fallInBlend: 0.16,
  /** Blend out land/roll to gait (s) */
  landOutBlend: 0.14,
  /** Min airborne time before fallLoop (avoid flicker on small hops) */
  minAirBeforeFall: 0.12,
  /** fallLand / fallRoll lock duration floor (s) if clip missing */
  landLockFloor: 0.35
});

/**
 * Pick land recovery role from impact (deterministic).
 * @param {{ impactVy: number, horizSpeed: number, wantRoll?: boolean }} opts
 * @returns {'fallRoll'|'fallLand'}
 */
export function pickLandRole(opts) {
  const t = FALL_THRESHOLDS;
  const iv = Math.abs(Number(opts.impactVy) || 0);
  const h = Math.abs(Number(opts.horizSpeed) || 0);
  const hard = iv >= t.rollImpactVy;
  const rolling =
    opts.wantRoll === true || (hard && h >= t.rollMinHoriz);
  if (rolling && hard) return FALL_ROLES.fallRoll;
  return FALL_ROLES.fallLand;
}

/**
 * Should switch from jump hold → fall loop?
 * @param {{ airborne: boolean, vy: number, airTime: number, flipping?: boolean }} s
 */
export function shouldEnterFall(s) {
  if (!s.airborne || s.flipping) return false;
  if ((s.airTime || 0) < FALL_THRESHOLDS.minAirBeforeFall) return false;
  return (s.vy || 0) <= FALL_THRESHOLDS.fallStartVy;
}

/**
 * Author map for docs / bake scripts.
 */
export const FALL_AUTHOR_MAP = Object.freeze([
  {
    role: 'fallLoop',
    disk: 'D:/Games/Models/Fall A Loop.fbx',
    public: 'public/anim/locomotion/fall/fall-loop.fbx',
    loop: true,
    use: 'Descending air cycle'
  },
  {
    role: 'fall',
    disk: 'D:/Games/Models/Falling.fbx',
    public: 'public/anim/locomotion/fall/falling.fbx',
    loop: true,
    use: 'Long falling body (alt / deep fall)'
  },
  {
    role: 'fallLand',
    disk: 'D:/Games/Models/Falling To Landing.fbx',
    public: 'public/anim/locomotion/fall/fall-to-landing.fbx',
    loop: false,
    use: 'Soft / default landing recovery'
  },
  {
    role: 'fallRoll',
    disk: 'D:/Games/Models/Falling To Roll.fbx',
    public: 'public/anim/locomotion/fall/fall-to-roll.fbx',
    loop: false,
    use: 'Hard impact + forward momentum → roll out'
  }
]);
