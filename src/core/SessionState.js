import { EventEmitter } from '../utils/EventEmitter.js';
import { settings, ELEMENTS, MODES } from '../config/settings.js';

/**
 * Lab session orchestration SSOT.
 *
 * **Two layers (do not collapse):**
 * | Layer | Owns | File |
 * |-------|------|------|
 * | **Tweaks** | Numbers, colors, speeds — editor binds live | `settings.js` |
 * | **Session** | Who owns input, path meaning, camera, ride | **this file** |
 *
 * **Pattern (consistent usage):**
 * 1. Controllers own *local* phase machines (Walk leap/ride, Ability travel/impact).
 * 2. Controllers **report** phase / session to `SessionState` via setters.
 * 3. App applies *side effects* once in `on('change')` (camera, inventory, HUD).
 * 4. Systems **read gates** (`session.gates.*`) instead of ad-hoc `if (ride && combat)`.
 * 5. Never invent a second store for mode/session/ride — extend this.
 *
 * settings.mode / settings.drc.session are **mirrors** for lil-gui + presets.
 *
 * @see docs/SESSION_STATE_SSOT.md
 */

/** @typedef {'casting'|'walk'} InteractionMode */
/** @typedef {'combat'|'equip'} DrcSession */
/** @typedef {'idle'|'leap'|'ride'|'freeride'|'dismount'} RidePhase */

export const INTERACTION_MODE = Object.freeze({
  CASTING: 'casting',
  WALK: 'walk'
});

export const DRC_SESSION = Object.freeze({
  COMBAT: 'combat',
  EQUIP: 'equip'
});

/** Mirrors WalkController Phase */
export const RIDE_PHASE = Object.freeze({
  IDLE: 'idle',
  LEAP: 'leap',
  RIDE: 'ride',
  FREERIDE: 'freeride',
  DISMOUNT: 'dismount'
});

/**
 * @typedef {object} SessionSnapshot
 * @property {InteractionMode} mode
 * @property {DrcSession} drc
 * @property {RidePhase} ridePhase
 * @property {string} element
 * @property {boolean} paused
 * @property {boolean} riding
 * @property {boolean} freeriding
 * @property {import('./SessionState.js').SessionGates} gates
 */

/**
 * @typedef {object} SessionGates
 * @property {boolean} landLoco       WASD land combat locomotion
 * @property {boolean} combatSkills   1–4 / F skills
 * @property {boolean} pathIsCast     stroke → AbilityManager
 * @property {boolean} pathIsRide     stroke → WalkController
 * @property {boolean} freerideDeploy Space deploy windsurf in walk mode
 * @property {boolean} rideParented   character under board seat
 * @property {boolean} combatKeys     Danger Room combat hotkeys
 * @property {boolean} tpsCamera      third-person follow
 * @property {boolean} orbitCamera    free orbit (equip / path draw)
 * @property {boolean} inventoryOk    equip panel allowed
 */

export class SessionState extends EventEmitter {
  constructor() {
    super();
    /** @type {InteractionMode} */
    this._mode = MODES.includes(settings.mode) ? settings.mode : INTERACTION_MODE.CASTING;
    /** @type {DrcSession} */
    this._drc = settings.drc?.session === 'equip' ? DRC_SESSION.EQUIP : DRC_SESSION.COMBAT;
    /** @type {RidePhase} */
    this._ridePhase = RIDE_PHASE.IDLE;
    /** @type {string} */
    this._element = ELEMENTS[0] || 'fire';
    this._paused = false;
    /** @type {SessionSnapshot|null} */
    this._lastSnap = null;
  }

  /* ── raw fields ───────────────────────────────────────────── */

  get mode() {
    return this._mode;
  }
  get drc() {
    return this._drc;
  }
  get ridePhase() {
    return this._ridePhase;
  }
  get element() {
    return this._element;
  }
  get paused() {
    return this._paused;
  }

  get riding() {
    return this._ridePhase !== RIDE_PHASE.IDLE;
  }

  get freeriding() {
    return this._ridePhase === RIDE_PHASE.FREERIDE;
  }

  get inCombat() {
    return this._drc === DRC_SESSION.COMBAT;
  }

  /* ── capability gates (read these everywhere) ─────────────── */

  /**
   * Derived permissions from mode × drc × ride.
   * @returns {SessionGates}
   */
  get gates() {
    const walk = this._mode === INTERACTION_MODE.WALK;
    const combat = this._drc === DRC_SESSION.COMBAT;
    const equip = this._drc === DRC_SESSION.EQUIP;
    const riding = this.riding;
    const freeride = this.freeriding;
    const leapOrRide =
      this._ridePhase === RIDE_PHASE.LEAP ||
      this._ridePhase === RIDE_PHASE.RIDE ||
      this._ridePhase === RIDE_PHASE.FREERIDE;
    const skillsWhileRide = settings.walk?.skillsWhileRide !== false;

    return {
      landLoco: combat && !walk && !riding,
      combatSkills: combat && (!riding || (skillsWhileRide && freeride) || (skillsWhileRide && leapOrRide)),
      pathIsCast: !walk,
      pathIsRide: walk,
      freerideDeploy: walk && !riding,
      rideParented: leapOrRide,
      combatKeys: combat,
      // TPS: combat land OR freeride; orbit: equip or walk path-draw idle
      tpsCamera: (combat && !walk) || freeride || (walk && riding && this._ridePhase !== RIDE_PHASE.LEAP),
      orbitCamera: equip || (walk && !riding),
      inventoryOk: equip && !riding
    };
  }

  /* ── setters (only path that mutates + emits) ─────────────── */

  /**
   * @param {InteractionMode|string} mode
   * @param {{ silent?: boolean }} [opts]
   */
  setMode(mode, opts = {}) {
    const next = MODES.includes(mode) ? mode : INTERACTION_MODE.CASTING;
    if (next === this._mode) return false;
    this._mode = next;
    settings.mode = next;
    // Leaving walk ends ride report (controller still cancel() from App)
    if (next !== INTERACTION_MODE.WALK && this._ridePhase !== RIDE_PHASE.IDLE) {
      this._ridePhase = RIDE_PHASE.IDLE;
    }
    if (!opts.silent) this._emitChange('mode');
    return true;
  }

  /**
   * @param {DrcSession|string} session
   * @param {{ silent?: boolean }} [opts]
   */
  setDrc(session, opts = {}) {
    const next = session === DRC_SESSION.EQUIP ? DRC_SESSION.EQUIP : DRC_SESSION.COMBAT;
    if (next === this._drc) return false;
    this._drc = next;
    settings.drc = settings.drc || {};
    settings.drc.session = next;
    // Equip cancels ride intent
    if (next === DRC_SESSION.EQUIP && this._ridePhase !== RIDE_PHASE.IDLE) {
      this._ridePhase = RIDE_PHASE.IDLE;
    }
    if (!opts.silent) this._emitChange('drc');
    return true;
  }

  /**
   * WalkController reports phase here — does not cancel ride itself.
   * @param {RidePhase|string} phase
   * @param {{ silent?: boolean }} [opts]
   */
  setRidePhase(phase, opts = {}) {
    const allowed = Object.values(RIDE_PHASE);
    const next = allowed.includes(phase) ? phase : RIDE_PHASE.IDLE;
    if (next === this._ridePhase) return false;
    this._ridePhase = next;
    if (!opts.silent) this._emitChange('ridePhase');
    return true;
  }

  /**
   * @param {string} element
   * @param {{ silent?: boolean }} [opts]
   */
  setElement(element, opts = {}) {
    const next = ELEMENTS.includes(element) ? element : ELEMENTS[0];
    if (next === this._element) return false;
    this._element = next;
    if (!opts.silent) this._emitChange('element');
    return true;
  }

  /**
   * @param {boolean} on
   * @param {{ silent?: boolean }} [opts]
   */
  setPaused(on, opts = {}) {
    const next = !!on;
    if (next === this._paused) return false;
    this._paused = next;
    if (!opts.silent) this._emitChange('paused');
    return true;
  }

  /** Pull mode/session from settings after preset import (editor). */
  syncFromSettings() {
    let dirty = false;
    if (MODES.includes(settings.mode) && settings.mode !== this._mode) {
      this._mode = settings.mode;
      dirty = true;
    }
    const want = settings.drc?.session === 'equip' ? DRC_SESSION.EQUIP : DRC_SESSION.COMBAT;
    if (want !== this._drc) {
      this._drc = want;
      dirty = true;
    }
    if (dirty) this._emitChange('sync');
  }

  /** Full snapshot for HUD / debug / agents. */
  snapshot() {
    return {
      mode: this._mode,
      drc: this._drc,
      ridePhase: this._ridePhase,
      element: this._element,
      paused: this._paused,
      riding: this.riding,
      freeriding: this.freeriding,
      gates: this.gates
    };
  }

  /**
   * Human blurb for title strip.
   * @returns {string}
   */
  blurb() {
    const g = this.gates;
    if (this._mode === INTERACTION_MODE.WALK) {
      if (this.freeriding) return 'Surf freeride · WASD boat · skills on board';
      if (this.riding) return `Surf · ${this._ridePhase}`;
      return 'Surf · Space deploy · draw path = course';
    }
    if (this._drc === DRC_SESSION.EQUIP) return 'Equip / Lab · race · mesh · packs';
    return 'Aim · WASD · 1–4 staff skills · LMB path cast';
  }

  /* ── private ──────────────────────────────────────────────── */

  _emitChange(reason) {
    const snap = this.snapshot();
    const prev = this._lastSnap;
    this._lastSnap = snap;
    this.emit('change', snap, prev, reason);
    this.emit(reason, snap, prev);
  }
}

/** Singleton optional — App owns instance; export factory for tests. */
export function createSessionState() {
  return new SessionState();
}
