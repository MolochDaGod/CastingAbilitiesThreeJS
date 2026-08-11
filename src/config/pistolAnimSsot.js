/**
 * T0 pistol animation SSOT — Mixamo Bip001 pack + Minecraft TPS timing reference.
 *
 * Live clips (Open): open.grudge-studio.com/anims/baked/pistol/*
 * Author FBX: gameopen/artifacts/animator/public/anim/pistol/
 *   gunplay.fbx · drawing-gun.fbx · charged-pistol.fbx · pistol-whip.fbx · loco*
 *
 * Incoming author pack (2026-08): 
 *   D:\Games\Models\_anim_packs\grudge6_incoming_2026-08-01\grudgepistolzio\
 *   → one-hand gun / crossbow loco + kneel (Mixamo Bip001). Combat fire still uses
 *     Open baked gunplay/draw/whip until zio combat clips are baked to Open CDN.
 *
 * TPS reference (voxel gunplay mesh + short clips, NOT Bip001):
 *   Lab copy: public/models/reference/minecraft_tps_pistol.glb
 *
 * Do not bind TPS clips onto grudge6 — skeleton is rigid Minecraft nodes
 * (Rightarm_14, Pistol_13, Slide_4…). Use for timing + prop motion only.
 *
 * Weapon mesh: flintlock.glb → public/models/weapons/t0-flintlock.glb for t0-gun
 * Bullet: Styloo bullet1.glb → public/models/vfx/projectiles/bullet1.glb
 */

export const PISTOL_PACK_ID = 'pistol';

/** Live Bip001 baked roles (Casting ANIM_PACKS.pistol). */
export const PISTOL_BIP001_ROLES = Object.freeze({
  idle: 'pistol/idle',
  walk: 'pistol/walk-forward',
  run: 'pistol/run-forward',
  strafeL: 'pistol/strafe-left',
  strafeR: 'pistol/strafe-right',
  /** Gun spin / flourish (primary attack) */
  gunplay: 'pistol/gunplay',
  spin: 'pistol/gunplay',
  draw: 'pistol/drawing-gun',
  /** Powder reload — baked alias of drawing-gun until dedicated FBX */
  reload: 'pistol/reload',
  charged: 'pistol/charged-pistol',
  whip: 'pistol/pistol-whip',
  jump: 'pistol/pistol-jump'
});

/**
 * Minecraft TPS model clip timings (seconds) — author feel for T0 fire cadence.
 * Source: minecraft_tps_model_1780812780503.glb
 */
export const TPS_PISTOL_TIMING = Object.freeze({
  sourceGlb: 'minecraft_tps_model_1780812780503.glb',
  clips: {
    idle: 9.083,
    walk: 0.875,
    draw: 0.25,
    drawnidle: 1.958,
    fire: 0.208,
    drawaim: 0.167,
    drawaimidle: 1.625,
    fireaim: 0.208
  },
  nodes: {
    pistol: 'Pistol_13',
    slide: 'Slide_4',
    mag: 'Mag_6',
    trigger: 'Trigger_12',
    rightArm: 'Rightarm_14',
    leftArm: 'Leftarm_19'
  }
});

/**
 * Map TPS clip → Casting / Multiverse role.
 */
export const TPS_TO_FLEET_ROLE = Object.freeze({
  idle: 'idle',
  walk: 'walk',
  draw: 'draw',
  drawnidle: 'idle',
  fire: 'attack',
  drawaim: 'draw',
  drawaimidle: 'cast',
  fireaim: 'attack'
});

/**
 * Bip001 clip durations (approx from live bake) for timeScale / CD hints.
 */
export const PISTOL_BIP001_DURATION = Object.freeze({
  idle: 1.333,
  'walk-forward': 0.8,
  'run-forward': 0.5,
  gunplay: 0.567,
  'drawing-gun': 2.0,
  'charged-pistol': 2.533,
  'pistol-whip': 2.567
});

/**
 * Suggested timeScale so Mixamo gunplay/fire feels closer to TPS snap (~0.21s).
 * gunplay ~0.57s → scale ≈ 0.57/0.21 ≈ 2.7 for hyper-snap; use milder default.
 * @param {'fire'|'draw'|'spin'|'charged'|'whip'|'reload'} kind
 */
export function pistolTimeScale(kind = 'fire') {
  const tps = TPS_PISTOL_TIMING.clips;
  switch (kind) {
    case 'fire':
    case 'spin':
      // gunplay 0.567 → aim ~0.38s (readable flintlock snap, not hyper)
      return Math.min(1.85, PISTOL_BIP001_DURATION.gunplay / 0.38);
    case 'draw':
      return Math.min(1.55, PISTOL_BIP001_DURATION['drawing-gun'] / Math.max(0.45, tps.draw * 2.2));
    case 'reload':
      // drawing-gun as reload base — stretch slightly for powder pour overlay
      return Math.min(1.15, PISTOL_BIP001_DURATION['drawing-gun'] / FLINTLOCK_RELOAD.durationSec);
    case 'charged':
      return 0.95;
    case 'whip':
      return 1.05;
    default:
      return 1.0;
  }
}

/**
 * Flintlock fire cadence — hit frame + burst gap + muzzle (SI).
 * Aligned with TPS fire (~0.21s) on scaled gunplay (~0.38s wall).
 */
export const FLINTLOCK_FIRE = Object.freeze({
  /** Seconds into fire clip when bullet leaves barrel (after timeScale) */
  hitFrameSec: 0.14,
  /** Wall-clock fire clip target (s) after timeScale */
  fireDurationSec: 0.38,
  /** Burst Fire gap between rounds (s) */
  burstGapSec: 0.09,
  /** Small yaw fan per burst index (rad) */
  burstSpreadRad: 0.026,
  /** Hand → muzzle along barrel when marker missing (m) */
  muzzleFallbackM: 0.42,
  /** Delay after last bullet before reload pose (s) */
  reloadAfterShotSec: 0.12
});

/**
 * Procedural powder reload (power-shot refill feel).
 * Gun rotates toward body middle · off-hand to barrel · barrel tilts up.
 */
export const FLINTLOCK_RELOAD = Object.freeze({
  durationSec: 0.92,
  powerDurationSec: 1.25,
  /** Degrees barrel tilts up during pour phase */
  barrelTiltDeg: 22,
  /** 0..1 how hard gun pulls toward chest midline */
  gunInWeight: 0.72,
  /**
   * Auto procedural reload after every shot — OFF for production chamber model.
   * Empty → digit 1 is Reload (user must press 1). Lab can set true.
   */
  afterShot: false,
  /** Baked clip role (ANIM_PACKS.pistol.reload) */
  bakedRole: 'reload',
  bakedClip: 'pistol/reload'
});

/**
 * Soft-lock / crosshair assist when pistol pack is equipped.
 * Stronger magnetic pull than default melee — flintlock is loud not accurate.
 */
export const PISTOL_SOFT_LOCK = Object.freeze({
  softLockBlend: 0.82,
  softLockMaxAngleDeg: 34,
  softLockRange: 36,
  /** Crosshair spread when soft-lock snug */
  spreadSoft: 0.06,
  /** Crosshair spread free aim (homemade inaccurate) */
  spreadFree: 0.22,
  optimalRangeMin: 3,
  optimalRangeMax: 18,
  /** Auto-acquire nearest frontal target on fire if none selected */
  acquireOnFire: true
});

/** Lab reference GLB path (same-origin after copy). */
export const TPS_PISTOL_REF_URL = './models/reference/minecraft_tps_pistol.glb';

/**
 * Role to play for a weapon skill slot on pistol pack.
 * @param {'primary'|'secondary'|'ability'|string} slotType
 * @param {number} [abilityIndex]
 */
export function pistolRoleForSkillSlot(slotType, abilityIndex = 0) {
  if (slotType === 'primary') return 'attack'; // gunplay spin
  if (slotType === 'secondary') return 'draw';
  if (slotType === 'reload') return 'reload';
  const skills = ['skill1', 'skill2', 'skill3', 'skill4', 'skill5'];
  return skills[abilityIndex % skills.length] || 'gunplay';
}

/**
 * Open Danger weapon-live-packs pistol.skillSlots → casting / anim map.
 * @see gameopen/content/anims/weapon-live-packs.json
 */
export const OPEN_DANGER_PISTOL_SLOTS = Object.freeze([
  { id: 'pistol_shot', label: 'Shot', anim: 'gunplay', t0: 't0_gun_practice_shot', needsLoad: true },
  { id: 'pistol_double', label: 'Double/Burst', anim: 'gunplay', t0: 't0_gun_burst_fire', needsLoad: true },
  { id: 'pistol_fan', label: 'Fan/Suppress', anim: 'charged-pistol', t0: 't0_gun_suppressing_shot', needsLoad: true },
  { id: 'pistol_reload', label: 'Reload', anim: 'reload', t0: 't0_gun_reload', needsLoad: false }
]);

/**
 * Hit-frame delay (s) for bullet spawn — catalog override wins.
 * @param {object} [skill]
 */
export function pistolHitFrameSec(skill = {}) {
  if (skill.hitFrameDelay != null && Number(skill.hitFrameDelay) >= 0) {
    return Number(skill.hitFrameDelay);
  }
  return FLINTLOCK_FIRE.hitFrameSec;
}

/**
 * grudgepistolzio incoming author clips (review 2026-08).
 * One-hand guns + can cover crossbow-style loco; combat still Open bake.
 */
export const GRUDGE_PISTOL_ZIO_INCOMING = Object.freeze({
  path: 'D:/Games/Models/_anim_packs/grudge6_incoming_2026-08-01/grudgepistolzio',
  use: 'one_hand_gun_and_crossbow_loco',
  clips: Object.freeze([
    'pistol idle',
    'pistol walk',
    'pistol run',
    'pistol walk backward',
    'pistol run backward',
    'pistol strafe',
    'pistol strafe (2)',
    'pistol walk arc',
    'pistol walk arc (2)',
    'pistol run arc',
    'pistol run arc (2)',
    'pistol run backward arc',
    'pistol run backward arc (2)',
    'pistol walk backward arc',
    'pistol walk backward arc (2)',
    'pistol jump',
    'pistol jump (2)',
    'pistol stand to kneel',
    'pistol kneeling idle',
    'pistol kneel to stand',
    'Heavy_mixamo'
  ]),
  mapToFleet: Object.freeze({
    'pistol idle': 'idle',
    'pistol walk': 'walk',
    'pistol run': 'run',
    'pistol strafe': 'walkL',
    'pistol strafe (2)': 'walkR',
    'pistol jump': 'jump',
    'pistol kneeling idle': 'cast',
    Heavy_mixamo: 'attack' // review — may be heavy weapon, not flint fire
  }),
  note: 'Bake zio loco to open …/anims/baked/pistol/* when ready; keep combat gunplay/draw/whip from existing bake until author fire clips exist.'
});
