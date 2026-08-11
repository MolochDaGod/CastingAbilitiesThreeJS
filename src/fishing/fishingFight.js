/**
 * Palworld / Angler-style fishing fight bar + SCUM snag window.
 *
 * Bar 0..1 horizontal:
 *  - fishPos moves randomly (speed from fish.stats)
 *  - reelZone [center, width] from equipment — player reels while fish is inside
 *
 * Controls (wired by FishingController):
 *  - Wheel down: reel in (progress + zone drifts toward fish / "up" on bar)
 *  - Wheel up: give slack (tension −, progress slow)
 *  - LMB click/hold: move zone right (up the bar)
 *  - RMB click/hold: move zone left
 *  - S / RMB in bite window: snag attempt
 */

/**
 * @typedef {object} FightState
 * @property {number} fishPos 0..1
 * @property {number} zoneCenter 0..1
 * @property {number} zoneWidth 0..1
 * @property {number} progress 0..1 catch fill
 * @property {number} tension 0..1 line stress
 * @property {number} fishVel
 * @property {number} biteWindow  remaining snag time (s) or 0
 * @property {boolean} hooked
 * @property {'waiting'|'bite'|'fight'|'won'|'lost'} phase
 */

/**
 * @param {{ zoneWidth: number, fishSpeed: number, fishStrength: number, lineMax: number, control: number, reelSpeed?: number }} params
 * @returns {FightState}
 */
export function createFightState(params) {
  return {
    fishPos: 0.35 + Math.random() * 0.3,
    zoneCenter: 0.5,
    zoneWidth: params.zoneWidth,
    progress: 0.12,
    tension: 0.15,
    fishVel: (Math.random() > 0.5 ? 1 : -1) * params.fishSpeed * 0.35,
    biteWindow: 0,
    hooked: false,
    phase: 'waiting',
    _params: params,
    _turnT: 0.4 + Math.random() * 0.8,
    _leviathanT: 2.5 + Math.random() * 2,
    leviathanEvent: null
  };
}

/**
 * @param {FightState} st
 * @param {number} dt
 * @param {{
 *   reelIn?: boolean,
 *   slack?: boolean,
 *   moveRight?: number,
 *   moveLeft?: number,
 *   snag?: boolean,
 *   reelSpeedMul?: number
 * }} input
 */
export function stepFight(st, dt, input = {}) {
  if (st.phase === 'won' || st.phase === 'lost') return st;
  const p = st._params;
  const control = p.control ?? 1;
  const reelMul = (input.reelSpeedMul || p.reelSpeed || 1);

  // —— Bite window (SCUM snag) ——
  if (st.phase === 'bite') {
    st.biteWindow -= dt;
    if (input.snag) {
      st.hooked = true;
      st.phase = 'fight';
      st.progress = Math.max(st.progress, 0.18);
      st.tension = 0.25;
    } else if (st.biteWindow <= 0) {
      st.phase = 'lost';
      st._loseReason = 'missed_snag';
    }
    return st;
  }

  if (st.phase !== 'fight') return st;

  // —— Fish random walk on bar ——
  st._turnT -= dt;
  if (st._turnT <= 0) {
    st._turnT = 0.25 + Math.random() * (1.1 - p.fishSpeed * 0.4);
    const burst = (Math.random() - 0.5) * 2 * p.fishSpeed;
    st.fishVel = burst * (0.55 + Math.random() * 0.55);
  }
  st.fishPos += st.fishVel * dt;
  if (st.fishPos < 0.02) {
    st.fishPos = 0.02;
    st.fishVel = Math.abs(st.fishVel);
  }
  if (st.fishPos > 0.98) {
    st.fishPos = 0.98;
    st.fishVel = -Math.abs(st.fishVel);
  }

  // —— Zone move (LMB right / RMB left) ——
  const moveSp = 0.55 * control;
  if (input.moveRight) st.zoneCenter += moveSp * input.moveRight * dt;
  if (input.moveLeft) st.zoneCenter -= moveSp * input.moveLeft * dt;

  // —— Reel / slack (wheel) ——
  const half = st.zoneWidth * 0.5;
  const inZone =
    st.fishPos >= st.zoneCenter - half && st.fishPos <= st.zoneCenter + half;

  if (input.reelIn) {
    // Reel pulls zone toward fish slightly + progress when on fish
    const pull = (st.fishPos - st.zoneCenter) * 0.9 * dt * control * reelMul;
    st.zoneCenter += pull;
    st.tension += (inZone ? 0.08 : 0.22) * p.fishStrength * dt;
    if (inZone) st.progress += (0.22 + 0.18 * control) * reelMul * dt;
    else st.progress -= 0.06 * dt;
  } else if (input.slack) {
    st.tension = Math.max(0, st.tension - 0.35 * dt);
    st.progress -= 0.03 * dt;
    // slack lets fish run
    st.fishVel *= 1 + 0.4 * dt;
  } else {
    // idle drift
    st.tension += (inZone ? -0.04 : 0.12 * p.fishStrength) * dt;
    if (inZone) st.progress += 0.06 * dt;
    else st.progress -= 0.1 * p.fishStrength * dt;
  }

  st.zoneCenter = Math.min(1 - half, Math.max(half, st.zoneCenter));

  // —— Leviathans attack passive titans (ocean creature / glow whale) ——
  st.leviathanEvent = null;
  if (p.preyOfLeviathans && st.phase === 'fight') {
    st._leviathanT = (st._leviathanT ?? 3) - dt;
    if (st._leviathanT <= 0) {
      st._leviathanT = 3.2 + Math.random() * 3.5;
      // Strike: thrash tension + snatch progress off the passive prey
      st.tension += 0.18 + Math.random() * 0.22;
      st.progress = Math.max(0, st.progress - (0.08 + Math.random() * 0.1));
      st.fishVel += (Math.random() - 0.5) * 1.2;
      st.leviathanEvent = 'Leviathan strikes the creature!';
      // Rare: leviathan steals the catch
      if (Math.random() < 0.06) {
        st.phase = 'lost';
        st._loseReason = 'leviathan_stole';
        st.leviathanEvent = 'Leviathan stole your catch!';
      }
    }
  }

  // Passive titans: soft fill (not thrashing). hardCatch (glow whale) resists more.
  if (p.behavior === 'passive_titan' && input.reelIn && inZone) {
    const soft = p.hardCatch ? 0.02 : 0.05;
    st.progress += soft * reelMul * dt;
  }

  st.progress = Math.min(1, Math.max(0, st.progress));
  st.tension = Math.min(1.15, Math.max(0, st.tension));

  if (st.tension > (p.lineMax ?? 0.7)) {
    st.phase = 'lost';
    st._loseReason = 'line_broke';
  } else if (st.progress >= 1) {
    st.phase = 'won';
  }
  return st;
}

/** Start bite window (seconds) */
export function beginBite(st, windowSec = 0.85) {
  st.phase = 'bite';
  st.biteWindow = windowSec;
  st.hooked = false;
  return st;
}
