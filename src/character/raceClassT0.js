/**
 * Race / class default T0 weapons — Casting lab test loadouts.
 *
 *   WK   → t0-sword   (melee pack)
 *   DWF  → t0-rifle
 *   BRB  → t0-gun
 *   ELF  → t0-bow
 *   ORC  → t0-axe1h
 *   UD   → t0-wand
 * Tome is off-hand only when paperdoll Off 1 is a tome — not the default for every kit.
 *
 * Eight Warlords specs. knight is a legacy alias of worge.
 *
 * @see src/api/classSkillTrees.js
 * @see docs/T0_RIFLE_SSOT.md
 */

import { equipWeaponById, ensureWeaponCatalog, attachOffhandById } from '../combat/equippedWeaponRuntime.js';
import { loadEquipMap, saveEquipMap } from '../ui/mainPanelSlots.js';
import { classIdFromRole } from '../api/classSkillTrees.js';

export const RACE_DEFAULT_T0 = Object.freeze({
  DWF: { main: 't0-rifle', off: null },
  BRB: { main: 't0-gun', off: null },
  WK: { main: 't0-sword', off: null },
  ELF: { main: 't0-bow', off: null },
  ORC: { main: 't0-axe1h', off: null },
  UD: { main: 't0-wand', off: null }
});

export const PISTOL_TOME = Object.freeze({
  main: 't0-gun',
  off: 't0-offhand-tome'
});

/**
 * @param {{ raceId?: string, presetId?: string, classId?: string, roleId?: string }} character
 */
export function resolveDefaultT0(character = {}) {
  const race = String(character.raceId || '').toUpperCase();
  if (RACE_DEFAULT_T0[race]) {
    const row = RACE_DEFAULT_T0[race];
    return { main: row.main, off: row.off, reason: `race ${race}` };
  }
  const cls = classIdFromRole(
    character.classId || character.presetId || character.roleId || ''
  );
  if (cls === 'worge' || character.presetId === 'worge') {
    return { main: 't0-sword', off: 't0-offhand-tome', reason: 'worge 1h+tome' };
  }
  return { main: 't0-sword', off: null, reason: 'warlords default sword' };
}

/**
 * Equip race/class defaults. URL `?t0=` / admin default still win if caller skips this.
 * @param {object} character
 * @param {{ onToast?: Function, force?: boolean }} [opts]
 */
export async function applyRaceClassT0(character, opts = {}) {
  if (!character) return null;
  const plan = resolveDefaultT0(character);
  if (!plan) return null;

  const toast = opts.onToast || (() => {});
  await ensureWeaponCatalog();

  const main = await equipWeaponById(plan.main, {
    character,
    onToast: toast
  });

  if (plan.off) {
    const map = loadEquipMap();
    map.offHand = { id: plan.off, kind: 'weapon' };
    map.mainHand = { id: plan.main, kind: 'weapon' };
    saveEquipMap(map);
    await attachOffhandById(character, plan.off);
  }

  toast(
    plan.off
      ? `${plan.reason} · ${plan.main} + ${plan.off}`
      : `${plan.reason} · ${plan.main}`
  );
  return { plan, main };
}

/** @deprecated use attachOffhandById — kept for Showcase/admin callers */
export async function attachOffhandT0(character, weaponId) {
  return attachOffhandById(character, weaponId);
}
