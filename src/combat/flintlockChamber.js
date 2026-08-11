/**
 * Flintlock chamber / load state (Warlords T0 gun production).
 *
 * Classic single-load: empty until reload, one powder load fires Practice / Burst / Suppress.
 * When empty, digit **1** is **Reload** (not Practice Shot).
 *
 * Aligns Open Danger skill slots (weapon-live-packs):
 *   pistol_shot · pistol_double · pistol_fan · pistol_reload
 *
 * @see config/pistolAnimSsot.js · docs/PISTOL_FLINTLOCK_SSOT.md
 * @see gameopen/content/anims/weapon-live-packs.json → pistol.skillSlots
 */

/** Open Danger / weapon-live-packs skill slot ids (review SSOT) */
export const OPEN_PISTOL_SKILL_SLOTS = Object.freeze({
  pistol_shot: {
    role: 'attack',
    clip: 'pistol/gunplay',
    castingId: 't0_gun_practice_shot',
    label: 'Practice Shot',
    needsLoad: true
  },
  pistol_double: {
    role: 'attack',
    clip: 'pistol/gunplay',
    castingId: 't0_gun_burst_fire',
    label: 'Burst Fire',
    needsLoad: true,
    multiHit: 3
  },
  pistol_fan: {
    role: 'skill2',
    clip: 'pistol/charged-pistol',
    castingId: 't0_gun_suppressing_shot',
    label: 'Suppressing Shot',
    needsLoad: true
  },
  pistol_reload: {
    role: 'reload',
    clip: 'pistol/reload',
    castingId: 't0_gun_reload',
    label: 'Reload',
    needsLoad: false
  },
  /** Melee review — not T0 bar default */
  pistol_whip: {
    role: 'skill3',
    clip: 'pistol/pistol-whip',
    castingId: null,
    label: 'Pistol Whip',
    needsLoad: false
  },
  pistol_charged: {
    role: 'skill2',
    clip: 'pistol/charged-pistol',
    castingId: null,
    label: 'Charged Pistol',
    needsLoad: true
  }
});

/** Review matrix for Showcase / lab toast */
export const FLINTLOCK_ANIM_REVIEW = Object.freeze([
  { role: 'idle', clip: 'pistol/idle', use: 'loco' },
  { role: 'walk', clip: 'pistol/walk-forward', use: 'loco' },
  { role: 'run', clip: 'pistol/run-forward', use: 'loco' },
  { role: 'attack', clip: 'pistol/gunplay', use: 'fire · Practice Shot' },
  { role: 'reload', clip: 'pistol/reload', use: 'empty · key 1 · powder load' },
  { role: 'draw', clip: 'pistol/drawing-gun', use: 'draw / reload fallback' },
  { role: 'skill2', clip: 'pistol/charged-pistol', use: 'power / fan review' },
  { role: 'skill3', clip: 'pistol/pistol-whip', use: 'melee whip review' },
  { role: 'jump', clip: 'pistol/pistol-jump', use: 'jump' }
]);

/**
 * @typedef {object} ChamberState
 * @property {number} loaded   0 or 1 (single chamber)
 * @property {number} capacity always 1 for T0 flintlock
 * @property {boolean} reloading
 * @property {number} reloadEndsAt elapsed time
 */

/**
 * @param {{ capacity?: number }} [opts]
 */
export function createFlintlockChamber(opts = {}) {
  const capacity = Math.max(1, Math.min(1, Number(opts.capacity) || 1)); // T0: single load
  /** @type {ChamberState} */
  const state = {
    loaded: capacity, // start loaded for playtest
    capacity,
    reloading: false,
    reloadEndsAt: 0
  };

  return {
    get state() {
      return state;
    },
    isLoaded() {
      return state.loaded > 0 && !state.reloading;
    },
    isEmpty() {
      return state.loaded <= 0;
    },
    isReloading() {
      return state.reloading;
    },
    /** @returns {boolean} true if a shot was consumed */
    consume() {
      if (state.loaded <= 0 || state.reloading) return false;
      state.loaded = 0;
      return true;
    },
    /**
     * Begin reload — call completeReload when anim finishes.
     * @param {number} durationSec
     * @param {number} elapsed
     */
    beginReload(durationSec, elapsed) {
      if (state.reloading) return false;
      if (state.loaded >= state.capacity) return false;
      state.reloading = true;
      state.reloadEndsAt = elapsed + Math.max(0.2, durationSec || 0.92);
      return true;
    },
    /** Fill chamber after reload anim */
    completeReload() {
      state.reloading = false;
      state.loaded = state.capacity;
      state.reloadEndsAt = 0;
      return true;
    },
    cancelReload() {
      state.reloading = false;
      state.reloadEndsAt = 0;
    },
    /** Tick auto-complete if elapsed past end (failsafe) */
    tick(elapsed) {
      if (state.reloading && elapsed >= state.reloadEndsAt) {
        this.completeReload();
        return true;
      }
      return false;
    },
    label() {
      if (state.reloading) return 'Reloading…';
      if (state.loaded > 0) return 'Loaded';
      return 'Empty';
    },
    /** HUD / hotbar slot1 presentation */
    slot1Presentation() {
      if (state.reloading) {
        return { id: 't0_gun_reload', label: 'Reloading…', isReload: true, empty: true };
      }
      if (state.loaded <= 0) {
        return { id: 't0_gun_reload', label: 'Reload', isReload: true, empty: true };
      }
      return {
        id: 't0_gun_practice_shot',
        label: 'Practice Shot',
        isReload: false,
        empty: false
      };
    }
  };
}

/**
 * Skill needs a powder load (bullet skills).
 * @param {object} skill
 */
export function skillNeedsLoad(skill) {
  if (!skill) return false;
  if (skill.isWard || skill.isFocus || skill.skillKind === 'buff') return false;
  if (skill.isReload || skill.skillKind === 'reload' || /reload/i.test(`${skill.id} ${skill.label}`)) {
    return false;
  }
  if (skill.useBulletProjectile || skill.projectileKind === 'bullet' || skill.projectile === 'bullet') {
    return true;
  }
  if (/t0_gun_(practice|burst|suppress)/i.test(String(skill.id || ''))) return true;
  return false;
}

/**
 * Is this the flintlock / t0-gun context?
 * @param {object} [skill]
 * @param {object} [weapon]
 * @param {string} [animPack]
 */
export function isFlintlockContext(skill, weapon, animPack) {
  if (animPack === 'pistol') return true;
  if (weapon?.id === 't0-gun' || weapon?.meshSlot === 'pistol') return true;
  const blob = `${skill?.id || ''} ${skill?.weaponId || ''} ${skill?.catalogSkillId || ''}`.toLowerCase();
  return /t0-gun|t0_gun|flint|pistol/.test(blob);
}

/** Synthetic reload skill for empty slot-1 */
export function makeReloadSkillDef() {
  return {
    id: 't0_gun_reload',
    catalogSkillId: 't0_gun_reload',
    label: 'Reload',
    description: 'Powder and ball — reload the flintlock',
    damage: 0,
    cooldown: 0.5,
    castDuration: 0,
    staminaCost: 4,
    manaCost: 0,
    style: 'ranged',
    skillKind: 'reload',
    isReload: true,
    animRole: 'reload',
    animPack: 'pistol',
    effects: ['Reload'],
    rangeM: 0,
    hitFrameDelay: 0.45
  };
}
