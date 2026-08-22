/**
 * Bending combat preset → weapon-skill attach.
 *
 * Author: D:\Games\Models\bending-presets (1).json
 *   "bulletspoisonaoesturf3n turnado"  (earth slot = holy)
 *
 * Spine start/end from weaponPrefabSpine. Patterns reuse Water/Fire/Earth/Wind
 * + PathTrail / DodgeAfterimage / ParticleSystem SMOKE — no second VFX engine.
 *
 * @see docs/BENDING_PRESETS_SSOT.md
 */

import { Vector3 } from 'three';
import { spinePointForVfxAnchor } from '../character/weaponPrefabSpine.js';

const _tmp = new Vector3();

/**
 * @typedef {'fire_bullet'|'fire_orbit'|'poison_mist'|'poison_trap'|'poison_shot'|'poison_bomb'|'poison_proc'|'tornado_pull'|'earth_stun'|'holy_smite'|'arrow_path'|'arrow_loft'|'fire_rain'|'shockwave'|'outline_beam'|'smoke_blink'|'ranger_invis'|'jade_mist'|'nature_vine'|'elemental_curve'} BendingPattern
 */

/**
 * Classify from catalog effects / presentation / id — never invent skill ids.
 * @param {object} skill
 * @returns {BendingPattern|null}
 */
export function classifyBendingPattern(skill) {
  if (!skill) return null;
  const blob = [
    skill.id,
    skill.label,
    skill.description,
    skill.presentation,
    skill.variantHint,
    skill.element,
    skill.abilityElement,
    ...(skill.effects || [])
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  const el = String(skill.element || skill.abilityElement || '').toLowerCase();
  const travel = String(skill.travelMode || '').toLowerCase();

  if (/\binvis|stealth|smoke.?bomb|ranger.?invis|hidden.?from.?sight/.test(blob))
    return 'ranger_invis';
  if (/smoke.?blink|vanish.?blast|shadow.?step|jump.?hide|blink.?smoke/.test(blob))
    return 'smoke_blink';
  if (/outline.?beam|blur.?dash|afterimage.?dash|mobility.?dash|ghost.?dash/.test(blob))
    return 'outline_beam';
  if (/fire.?rain|meteor.?rain|raining.?fire|rain.?of.?fire/.test(blob)) return 'fire_rain';
  if (/shockwave|shock.?wave|pressure.?wave/.test(blob)) return 'shockwave';
  if (/arrow.?loft|curved.?arrow|lob.?arrow/.test(blob)) return 'arrow_loft';
  if (/\barrow\b|arrow.?path|volley.?arrow/.test(blob) && !/poison|venom/.test(blob))
    return 'arrow_path';
  if (/tornado|cyclone|vortex|whirlwind|pull/.test(blob)) return 'tornado_pull';
  if (/poison.?trap|trap.?poison|aoe.?trap/.test(blob)) return 'poison_trap';
  if (/poison.?bomb|bomb.?poison|poison.?nova/.test(blob)) return 'poison_bomb';
  if (/jade.?mist|soothing.?mist|enveloping|gas.?cloud|poison.?mist|mist.?poison/.test(blob))
    return 'jade_mist';
  if (/vine|entangle|lash|whip/.test(blob)) return 'nature_vine';
  if (/poison.?shot|poison.?bolt|venom.?arrow|venom.?shot/.test(blob)) return 'poison_shot';
  if (/\bpoison\b|venom|toxic|proc.?poison/.test(blob)) return 'poison_proc';
  if (/holy|smite|radiance|divine|bless|atonement/.test(blob)) return 'holy_smite';
  if (/earth.?stun|stun.?aoe|quake|tremor|stomp/.test(blob)) return 'holy_smite';
  if (/orbit|circle.?ball|five.?ball|5.?ball|stock.?orb/.test(blob)) return 'fire_orbit';
  if (
    (skill.style === 'spell' && /fire|ember|bolt/.test(blob)) ||
    skill.useBulletProjectile ||
    skill.projectile === 'bullet'
  ) {
    if (/fire|ember|flame/.test(blob) || el === 'fire') return 'fire_bullet';
  }
  if (el === 'fire') return travel === 'bend' ? 'fire_bullet' : 'fire_orbit';
  if (el === 'nature' && /poison|venom/.test(blob)) return 'poison_shot';
  if (el === 'nature') return /mist/.test(blob) ? 'jade_mist' : 'nature_vine';
  if (el === 'holy' || el === 'earth') return 'holy_smite';
  if (el === 'storm') return 'tornado_pull';
  if (el === 'ice') return 'elemental_curve';
  if (el === 'arcane' || el === 'shadow') return 'elemental_curve';
  if (travel === 'bend') return el === 'fire' ? 'fire_bullet' : 'elemental_curve';
  return null;
}

/** Shockwave palette key from skill element / blob. */
export function shockwaveElementOf(skill) {
  const el = String(skill?.element || skill?.abilityElement || '').toLowerCase();
  if (el === 'fire') return 'fire';
  if (el === 'ice' || el === 'water') return 'ice';
  if (el === 'holy' || el === 'earth') return 'holy';
  if (el === 'storm' || el === 'wind') return 'storm';
  if (el === 'arcane') return 'arcane';
  if (el === 'nature') return 'nature';
  const blob = `${skill?.id || ''} ${skill?.label || ''} ${(skill?.effects || []).join(' ')}`.toLowerCase();
  if (/poison|venom/.test(blob)) return 'poison';
  if (/holy|smite|divine/.test(blob)) return 'holy';
  if (/ice|frost/.test(blob)) return 'ice';
  if (/fire|ember/.test(blob)) return 'fire';
  if (/storm|thunder|lightning/.test(blob)) return 'storm';
  return 'holy';
}

/**
 * World start (spine / barrel / cast) and end (aim) for a skill.
 * @param {object} character
 * @param {object} skill
 * @param {{ origin?: Vector3, aim?: Vector3, forward?: Vector3 }} [pose]
 */
export function resolveSkillSpline(character, skill, pose = {}) {
  const startId = spinePointForVfxAnchor(
    skill?.spinePoint || skill?.startAnchor || pose.startAnchor
  );
  const endId = skill?.endAnchor
    ? spinePointForVfxAnchor(skill.endAnchor)
    : null;
  const start = new Vector3();
  if (character?.getWeaponSpinePoint) {
    character.getWeaponSpinePoint(startId, start);
  } else if (pose.origin) {
    start.copy(pose.origin);
  }
  const end = new Vector3();
  if (pose.aim) end.copy(pose.aim);
  else if (endId && character?.getWeaponSpinePoint) {
    character.getWeaponSpinePoint(endId, end);
    end.add(_tmp.set(0, 0, 2));
  } else if (pose.origin && pose.forward) {
    end.copy(pose.origin).addScaledVector(pose.forward, skill?.rangeM || 8);
  } else {
    end.copy(start).add(new Vector3(0, 0, 8));
  }
  return { start, end, startId, endId: endId || 'aim' };
}

/**
 * Nearest fire/air totem in the scene (training-room palette or named GLB).
 * Spline tethers retarget here instead of a second attach system.
 * @param {import('three').Object3D|null} root
 * @param {import('three').Vector3} from
 * @param {number} [maxM]
 * @returns {import('three').Vector3|null}
 */
export function nearestTotemWorldPos(root, from, maxM = 22) {
  if (!root || !from) return null;
  let best = null;
  let bestD = maxM;
  root.traverse((o) => {
    const blob = `${o.name || ''} ${o.userData?.paletteId || ''} ${o.userData?.kind || ''} ${o.userData?.skillId || ''}`;
    if (!/totem/i.test(blob)) return;
    if (o.parent && /totem/i.test(`${o.parent.name || ''} ${o.parent.userData?.paletteId || ''}`)) {
      return;
    }
    o.getWorldPosition(_tmp);
    const d = _tmp.distanceTo(from);
    if (d < bestD) {
      bestD = d;
      best = _tmp.clone();
    }
  });
  return best;
}

/**
 * Heal / mist / tether / vine skills ride the spline (not click-spawn).
 * @param {object} skill
 */
export function skillWantsSpline(skill) {
  if (!skill) return false;
  if (skill.travelMode === 'bend' || skill.travelMode === 'linear') return true;
  const blob = `${skill.id || ''} ${skill.label || ''} ${skill.variantHint || ''} ${(skill.effects || []).join(' ')}`.toLowerCase();
  return /mist|vine|tether|totem|envelop|heal|jade|soothing/.test(blob);
}

/** Heal-field along the same spline (mist / envelop / revival). */
export function skillWantsHealSpline(skill) {
  if (!skill) return false;
  const blob = `${skill.id || ''} ${skill.label || ''} ${skill.variantHint || ''} ${(skill.effects || []).join(' ')}`.toLowerCase();
  return /mist|heal|envelop|revival|soothing|jade|mend/.test(blob);
}
