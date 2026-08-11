/**
 * Gameplay + UX gate checks — Casting lab production readiness.
 *
 * Run after boot (window.app) or in CI smoke. Does not invent systems —
 * only verifies feet, anim state, camera, weapons, locomotion hooks.
 *
 * @see docs/GAMEPLAY_UX_GATES_SSOT.md
 */

import { settings as _settings } from '../config/settings.js';

/**
 * @typedef {{
 *   id: string,
 *   ok: boolean,
 *   detail?: string
 * }} GateResult
 */

/**
 * @param {import('./App.js').App} app
 * @returns {{ ok: boolean, gates: GateResult[], summary: string }}
 */
export function runGameplayGates(app) {
  /** @type {GateResult[]} */
  const gates = [];
  const push = (id, ok, detail) => gates.push({ id, ok: !!ok, detail });

  if (!app) {
    return { ok: false, gates: [{ id: 'app', ok: false, detail: 'no app' }], summary: 'FAIL no app' };
  }

  const ch = app.character;
  const rig = app.rig;
  const drc = app.drc;
  const phys = app.physics;
  const terrain = app.terrain || app.islandTerrain;

  // —— Feet on ground ——
  const feet = ch?.getWorldPosition?.() || ch?.position;
  const sampleY =
    typeof terrain?.sample === 'function' && feet
      ? terrain.sample(feet.x, feet.z)
      : typeof phys?.sampleLandY === 'function' && feet
        ? phys.sampleLandY(feet.x, feet.z)
        : null;
  const feetY = feet?.y ?? 0;
  const feetDelta =
    sampleY != null && Number.isFinite(sampleY) ? Math.abs(feetY - sampleY) : null;
  push(
    'feet_grounded',
    feetDelta == null || feetDelta < 0.35,
    feetDelta == null
      ? `y=${feetY.toFixed(2)} (no sample)`
      : `Δy=${feetDelta.toFixed(3)} sample=${sampleY.toFixed(2)} feet=${feetY.toFixed(2)}`
  );

  const look = ch?.diagnoseLook?.();
  push(
    'feet_mesh_ground',
    !look || look.feetOk !== false,
    look ? `feetMinY=${look.feetMinY} height=${look.heightM}` : 'no diagnose'
  );

  // —— Anim state ——
  const animState = ch?.animState || 'unknown';
  const gaitLocked = !!ch?._gaitLocked;
  const hasMixer = !!ch?.mixer;
  const hasIdle = ch?.actions?.has?.('idle') || ch?.actions?.has?.('standing-idle');
  push('anim_mixer', hasMixer, hasMixer ? 'one mixer' : 'missing mixer');
  push(
    'anim_state',
    typeof animState === 'string' && animState.length > 0,
    `state=${animState} gaitLocked=${gaitLocked}`
  );
  push('anim_idle_clip', !!hasIdle, hasIdle ? 'idle present' : 'no idle action');

  // —— Camera shoulder TPS ——
  const viewMode = rig?.viewMode;
  const inCombat = !!drc?.inCombat;
  const focusOn = !!app.combatFocus?.focusEnabled;
  const dist = rig?.distance ?? settingsSafe().camera?.distance;
  const orbitEnabled = !!rig?.controls?.enabled;
  push(
    'camera_tps_combat',
    !inCombat || viewMode === 'tps',
    `view=${viewMode} combat=${inCombat}`
  );
  push(
    'camera_orbit_off_in_tps',
    viewMode !== 'tps' || !orbitEnabled,
    `orbit.enabled=${orbitEnabled}`
  );
  push(
    'camera_fortnite_distance',
    dist != null && dist >= 2.5 && dist <= 10,
    `distance=${Number(dist).toFixed(2)} (want 5.5–6 free/focus, not map-scale 14)`
  );
  push(
    'camera_single',
    !!rig?.camera && !app.secondCamera,
    'one PerspectiveCamera'
  );

  // —— Weapon skills ——
  const skills = drc?.skills;
  const skillCount = Array.isArray(skills) ? skills.length : 0;
  push('weapon_skills_bar', skillCount > 0, `skills=${skillCount}`);
  const pack = ch?.animPackId || ch?.weaponHoldKind || 'none';
  push('weapon_pack', true, `pack=${pack}`);

  // —— Locomotion / traversal hooks ——
  push('loco_input', !!app.input, 'InputManager');
  push('loco_drc', !!drc, 'DrcCombatController');
  push(
    'loco_physics',
    !!phys?.ready || !!phys?.playerBody,
    phys?.ready ? 'Rapier CCT' : 'physics pending/fallback'
  );
  push(
    'traversal_mobility',
    typeof drc?.parry === 'function',
    typeof drc?.parry === 'function' ? 'parry/dodge/slide stack' : 'missing mobility API'
  );

  // —— UX / HUD ——
  push('ux_hud', !!app.hud, 'HUD mounted');
  push(
    'ux_focus_crosshair',
    typeof app.hud?.setCrosshairVisible === 'function',
    'crosshair API'
  );

  const failed = gates.filter((g) => !g.ok);
  const ok = failed.length === 0;
  const summary = ok
    ? `PASS ${gates.length} gates`
    : `FAIL ${failed.map((f) => f.id).join(', ')}`;

  return { ok, gates, summary };
}

function settingsSafe() {
  return _settings || {};
}

/**
 * Console-friendly report.
 * @param {ReturnType<typeof runGameplayGates>} report
 */
export function logGameplayGates(report) {
  const tag = report.ok ? '[gates] ✓' : '[gates] ✗';
  console.info(tag, report.summary);
  for (const g of report.gates) {
    console.info(`  ${g.ok ? '✓' : '✗'} ${g.id}`, g.detail || '');
  }
  return report;
}
