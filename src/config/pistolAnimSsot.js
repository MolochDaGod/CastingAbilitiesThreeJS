/**
 * T0 pistol animation SSOT — Mixamo Bip001 pack + Minecraft TPS timing reference.
 *
 * Live clips (Open): open.grudge-studio.com/anims/baked/pistol/*
 * Author FBX: gameopen/artifacts/animator/public/anim/pistol/
 *   gunplay.fbx · drawing-gun.fbx · charged-pistol.fbx · pistol-whip.fbx · loco*
 *
 * TPS reference (voxel gunplay mesh + short clips, NOT Bip001):
 *   _grudge-kit-extract/.../minecraft_tps_model_1780812780503.glb
 *   Lab copy: public/models/reference/minecraft_tps_pistol.glb
 *
 * Do not bind TPS clips onto grudge6 — skeleton is rigid Minecraft nodes
 * (Rightarm_14, Pistol_13, Slide_4…). Use for timing + prop motion only.
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
 * @param {'fire'|'draw'|'spin'|'charged'|'whip'} kind
 */
export function pistolTimeScale(kind = 'fire') {
  const tps = TPS_PISTOL_TIMING.clips;
  switch (kind) {
    case 'fire':
    case 'spin':
      // gunplay 0.567 → aim ~0.35s (between TPS fire and full flourish)
      return Math.min(2.2, PISTOL_BIP001_DURATION.gunplay / 0.35);
    case 'draw':
      return Math.min(1.8, PISTOL_BIP001_DURATION['drawing-gun'] / Math.max(0.35, tps.draw * 2));
    case 'charged':
      return 1.0;
    case 'whip':
      return 1.05;
    default:
      return 1.0;
  }
}

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
  const skills = ['skill1', 'skill2', 'skill3', 'skill4', 'skill5'];
  return skills[abilityIndex % skills.length] || 'gunplay';
}
