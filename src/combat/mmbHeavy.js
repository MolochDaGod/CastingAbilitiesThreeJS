/**
 * MMB = each class's intuitive melee / space-create move.
 * Eight product specs. Clips only from ANIM_ROLE_META / unarmed / sword_shield.
 * Pose (air, combo, range) *refines* the class move — it does not replace the spec.
 *
 * @see src/config/animLibrary.js ANIM_ROLE_META
 * @see src/combat/playClasses.js CLASS_IDS
 */

import { ANIM_ROLE_META } from '../config/animLibrary.js';

/**
 * Signature MMB per product class (humanoid). Worge *forms* use pickWorgeFormMmb.
 */
export const CLASS_MMB = Object.freeze({
  warrior: {
    label: 'Warrior heavy',
    kind: 'warriorHeavy',
    roles: ['uppercut', 'hurricane', 'finisher', 'attack3', 'kick', 'spin', 'stomp'],
    knockbackMm: 240,
    pose: true
  },
  raider: {
    label: 'Raider slam',
    kind: 'raiderSlam',
    roles: ['finisher', 'stomp', 'attack3', 'uppercut', 'hurricane'],
    knockbackMm: 280,
    pose: true
  },
  mage: {
    label: 'Staff melee',
    kind: 'casterMelee',
    roles: ['kick', 'stomp', 'attack3'],
    knockbackMm: 160
  },
  priest: {
    label: 'Tome shove',
    kind: 'casterMelee',
    roles: ['kick', 'attack3', 'stomp'],
    knockbackMm: 150
  },
  ranger: {
    label: 'Hop-shot',
    kind: 'kiteHopShot',
    dodge: 'back',
    roles: ['attack', 'skill1', 'gunplay'],
    knockbackMm: 80
  },
  thief: {
    label: 'Peel shot',
    kind: 'kiteHopShot',
    dodge: 'back',
    roles: ['gunplay', 'spin', 'kick', 'attack'],
    knockbackMm: 100
  },
  worge: {
    label: 'Pack typhoon',
    kind: 'typhoon',
    roles: ['hurricane', 'kick', 'attack3'],
    typhoon: { outM: 7, upM: 2 },
    noDamage: true
  },
  verduror: {
    label: 'Crane kick',
    kind: 'craneKick',
    roles: ['kick', 'hurricane', 'stomp', 'attack3'],
    knockbackMm: 180
  }
});

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
    if (classId === 'worge') return pickWorgeFormMmb(s);
    return { kind: 'none', roles: [], knockbackMm: 0 };
  }

  const spec = CLASS_MMB[classId] || CLASS_MMB.warrior;
  if (!spec.pose) {
    return { ...spec };
  }
  return refineMeleeMmb(spec, { air, step, last, dist, pack });
}

/** Warrior / raider: class identity + air / combo / range. */
function refineMeleeMmb(spec, p) {
  if (p.air) {
    return {
      ...spec,
      kind: 'airHeavy',
      label: `${spec.label} · air`,
      roles: ['hurricane', 'finisherAir', 'jumpAttack', 'uppercut', 'kick', ...spec.roles],
      knockbackMm: Math.max(spec.knockbackMm || 0, 300),
      knockupVy: 1.6
    };
  }
  if (p.step >= 2 || p.last === 'attack3' || p.last === 'finisher') {
    return {
      ...spec,
      kind: 'spinFinisher',
      label: `${spec.label} · finisher`,
      roles: ['spin', 'hurricane', 'finisher', 'uppercut', 'attack3'],
      knockbackMm: Math.max(spec.knockbackMm || 0, 340),
      knockupVy: 1.4
    };
  }
  if (p.step === 1 || p.last === 'attack2') {
    return {
      ...spec,
      kind: 'overhead',
      label: `${spec.label} · overhead`,
      roles: ['stomp', 'attack3', 'finisher', 'uppercut']
    };
  }
  if (p.dist < 1.85) {
    return {
      ...spec,
      kind: 'uppercut',
      label: `${spec.label} · uppercut`,
      roles: ['uppercut', 'kick', 'attack3', 'finisher'],
      knockupVy: 2.4
    };
  }
  if (p.dist > 4.2) {
    return {
      ...spec,
      kind: 'lunge',
      label: `${spec.label} · lunge`,
      roles: ['finisher', 'hurricane', 'kick', 'attack3'],
      dash: true
    };
  }
  return { ...spec };
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
