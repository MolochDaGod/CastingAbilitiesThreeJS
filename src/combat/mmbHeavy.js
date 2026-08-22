/**
 * Middle-mouse heavy — pick from ANIM_ROLE_META / unarmed / sword_shield.
 * Positionally aware: last combo step, air/ground, distance to target, pack, class.
 * Does not invent clip names.
 *
 * @see src/config/animLibrary.js ANIM_ROLE_META
 * @see src/config/unarmedAnimSsot.js
 */

import { ANIM_ROLE_META } from '../config/animLibrary.js';

/**
 * @param {{
 *   hotkeyCtx?: string,
 *   pack?: string,
 *   classId?: string,
 *   airborne?: boolean,
 *   comboStep?: number,
 *   lastRole?: string,
 *   distM?: number
 * }} s
 */
export function pickMmbMove(s = {}) {
  const ctx = s.hotkeyCtx || 'combat';
  const pack = String(s.pack || '');
  const classId = String(s.classId || '');
  const air = !!s.airborne;
  const step = Number.isFinite(s.comboStep) ? s.comboStep : -1;
  const dist = Number.isFinite(s.distM) ? s.distM : 3;
  const last = String(s.lastRole || '');

  if (ctx === 'inventory' || ctx === 'equip') {
    return { kind: 'none', roles: [], knockbackMm: 0 };
  }

  if (ctx === 'harvest') {
    return {
      kind: 'harvestHeavy',
      roles: ['stomp', 'kick', 'attack3', 'uppercut'],
      knockbackMm: 160,
      label: 'Harvest heavy'
    };
  }

  if (ctx === 'ride') {
    return {
      kind: 'rideKick',
      roles: ['kick', 'stomp'],
      knockbackMm: 120,
      label: 'Ride kick'
    };
  }

  if (s.formId) {
    if (s.classId === 'worge') return pickWorgeFormMmb(s);
    return { kind: 'none', roles: [], knockbackMm: 0 };
  }

  const ranger =
    pack === 'longbow' ||
    pack === 'rifle' ||
    pack === 'pistol' ||
    classId === 'ranger';
  const caster =
    pack === 'magic' ||
    classId === 'mage' ||
    classId === 'priest' ||
    classId === 'verduror';

  if (ranger) {
    return {
      kind: 'kiteHopShot',
      dodge: 'back',
      roles: pack === 'pistol' ? ['gunplay', 'spin', 'attack'] : ['attack', 'skill1', 'gunplay'],
      knockbackMm: 80,
      label: 'Hop-shot'
    };
  }

  if (caster) {
    return {
      kind: 'casterMelee',
      roles: dist < 2.2 ? ['kick', 'stomp', 'attack3'] : ['kick', 'attack3', 'stomp'],
      knockbackMm: dist < 2.2 ? 220 : 140,
      label: 'Staff / tome melee'
    };
  }

  if (air) {
    return {
      kind: 'airHeavy',
      roles: ['hurricane', 'finisherAir', 'jumpAttack', 'uppercut', 'kick'],
      knockbackMm: 300,
      knockupVy: 1.6,
      label: 'Air heavy'
    };
  }

  if (step >= 2 || last === 'attack3' || last === 'finisher') {
    return {
      kind: 'spinFinisher',
      roles: ['spin', 'hurricane', 'finisher', 'uppercut', 'attack3'],
      knockbackMm: 340,
      knockupVy: 1.4,
      label: 'Spin / finisher'
    };
  }

  if (step === 1 || last === 'attack2') {
    return {
      kind: 'overhead',
      roles: ['stomp', 'attack3', 'finisher', 'uppercut'],
      knockbackMm: 260,
      label: 'Overhead'
    };
  }

  if (dist < 1.85) {
    return {
      kind: 'uppercut',
      roles: ['uppercut', 'kick', 'attack3', 'finisher'],
      knockbackMm: 240,
      knockupVy: 2.4,
      label: 'Uppercut'
    };
  }

  if (dist > 4.2) {
    return {
      kind: 'lunge',
      roles: ['finisher', 'hurricane', 'kick', 'attack3'],
      knockbackMm: 220,
      dash: true,
      label: 'Lunge heavy'
    };
  }

  return {
    kind: 'heavy',
    roles: ['kick', 'hurricane', 'uppercut', 'attack3', 'spin', 'finisher'],
    knockbackMm: 200,
    label: 'Heavy'
  };
}

/** Worge animal MMB — better than claw-only (F/R/MMB extras). */
export function pickWorgeFormMmb(s = {}) {
  const form = String(s.formId || '');
  const dist = Number.isFinite(s.distM) ? s.distM : 3;
  if (form === 'bear') {
    if (dist < 3.2) {
      return {
        kind: 'bearStun',
        roles: ['stomp', 'uppercut', 'attack3'],
        knockbackMm: 80,
        stun: true,
        noDamage: true,
        label: 'Bear stun'
      };
    }
    return {
      kind: 'bearCharge',
      roles: ['hurricane', 'finisher', 'attack3'],
      knockbackMm: 200,
      dash: true,
      dashM: 7,
      stun: true,
      label: 'Bear charge'
    };
  }
  if (form === 'cheetah') {
    return {
      kind: 'formDash',
      roles: ['kick', 'attack1'],
      dodge: 'forward',
      knockbackMm: 40,
      noDamage: true,
      label: 'Cheetah dash'
    };
  }
  if (form === 'raptor') {
    return {
      kind: 'pounce',
      roles: ['hurricane', 'finisher', 'kick'],
      dash: true,
      dashM: 6,
      knockbackMm: 180,
      label: 'Raptor pounce'
    };
  }
  if (form === 'spider') {
    return {
      kind: 'web',
      roles: ['stomp', 'kick'],
      knockbackMm: 0,
      root: true,
      noDamage: true,
      label: 'Web root'
    };
  }
  return {
    kind: 'typhoon',
    roles: ['hurricane', 'cast', 'attack3'],
    knockbackMm: 0,
    typhoon: { outM: 7, upM: 2 },
    noDamage: true,
    label: 'Typhoon'
  };
}

/**
 * First library role actually bound on the mixer.
 * @param {import('../animation/CharacterController.js').CharacterController} character
 * @param {string[]} roles
 */
export function firstBoundMmbRole(character, roles = []) {
  if (!character?.actions) return null;
  for (const role of roles) {
    if (!role) continue;
    const names = [role, `unarmed:${role}`, `sword_shield:${role}`, `combat_mobility:${role}`];
    for (const n of names) {
      if (character.actions.has(n)) return n;
    }
  }
  return null;
}
