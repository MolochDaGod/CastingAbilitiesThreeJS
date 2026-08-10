/**
 * Equipped weapon runtime — skills + assets follow the item, not a free skill tree.
 *
 * Equip t0-sword / t0-wand / … → anim pack · mesh slot · 3-slot hotbar · icon · 3D attach
 * Export → Warlords weapon prefab JSON for authoring.
 */

import {
  loadEquippableWeapons,
  hotbarForWeapon,
  exportWarlordsWeaponPrefab
} from '../api/t0WeaponCatalog.js';
import { attachWeaponModel, clearWeaponAttach } from '../character/WeaponMeshAttach.js';

/** @type {import('../api/t0WeaponCatalog.js').EquippableWeapon|null} */
let _equipped = null;
/** @type {string|null} */
let _slot3Id = null;
/** @type {import('three').Object3D|null} */
let _attach = null;
/** @type {Awaited<ReturnType<typeof loadEquippableWeapons>>|null} */
let _catalog = null;

export function getEquippedWeapon() {
  return _equipped;
}

export function getEquippedSlot3Id() {
  return _slot3Id || _equipped?.defaultSlot3Id || null;
}

export async function ensureWeaponCatalog() {
  if (_catalog) return _catalog;
  _catalog = await loadEquippableWeapons();
  // DO merge already runs inside loadEquippableWeapons (t0 + remote equip mirror)
  return _catalog;
}

/**
 * Force re-load catalog + re-merge Cloudflare DO equipWeaponById mirror.
 * Used after Casting promote / Multiverse push.
 */
export async function refreshWeaponCatalogFromDo() {
  const { clearEquippableWeaponsCache } =
    await import('../api/t0WeaponCatalog.js').catch(() => ({}));
  if (typeof clearEquippableWeaponsCache === 'function') clearEquippableWeaponsCache();
  _catalog = null;
  _catalog = await loadEquippableWeapons();
  return _catalog;
}

export function listEquippableWeapons() {
  return _catalog?.weapons || [];
}

/**
 * Hotbar for currently equipped weapon (used by drcSkills tree `equipped`).
 */
export function equippedWeaponHotbar() {
  if (!_equipped) return [];
  return hotbarForWeapon(_equipped, getEquippedSlot3Id());
}

/**
 * Choose slot-3 skill on equipped weapon.
 * @param {string} skillId
 */
export function setEquippedSlot3(skillId) {
  if (!_equipped) return null;
  const ok = _equipped.slot3Options.some((s) => s.id === skillId);
  if (ok) _slot3Id = skillId;
  return getEquippedSlot3Id();
}

/**
 * Equip by weapon id (t0-sword, t0-wand, …).
 * @param {string} weaponId
 * @param {{
 *   character: import('../animation/CharacterController.js').CharacterController,
 *   onToast?: (s: string) => void
 * }} ctx
 */
export async function equipWeaponById(weaponId, ctx) {
  const cat = await ensureWeaponCatalog();
  const weapon = cat.byId.get(weaponId);
  if (!weapon) throw new Error(`Unknown weapon ${weaponId}`);
  return equipWeapon(weapon, ctx);
}

/**
 * @param {import('../api/t0WeaponCatalog.js').EquippableWeapon} weapon
 * @param {{
 *   character: import('../animation/CharacterController.js').CharacterController,
 *   onToast?: (s: string) => void
 * }} ctx
 */
export async function equipWeapon(weapon, ctx) {
  const character = ctx.character;
  const toast = ctx.onToast || (() => {});

  _equipped = weapon;
  _slot3Id = weapon.defaultSlot3Id;

  // 1) Kit mesh_ids exclusive weapon slot
  const slot = weapon.meshSlot;
  if (character.equipment) {
    const WEAPON_SLOTS = ['sword', 'axe', 'hammer', 'spear', 'staff', 'bow', 'shield', 'pistol'];
    for (const w of WEAPON_SLOTS) {
      if (w !== slot) character.equipment.setSlot?.(w, null);
    }
    // Prefer variant A / first available. Kit often has no pistol mesh_ids — skip set then.
    const summary = character.equipment.getCatalogSummary?.() || {};
    const variants = summary[slot]?.variants || [];
    if (variants.length) {
      const pick =
        variants.find((v) => v === 'A' || v === '_default') || variants[0] || 'A';
      character.equipment.setSlot?.(slot, pick);
    }
    character._reGroundAfterEquip?.();
    character.ik?.setBones?.(character.equipment.findBones?.());
  }

  // 2) Anim pack for weapon
  await character.setAnimPack?.(weapon.animPack);
  await character._bindPack?.('combat_mobility');

  // 3) 3D catalog model on hand (prefab model — for Warlords prefab QA)
  const bones = character.equipment?.findBones?.() || character.bones || {};
  const hand = bones.rHand || character.bones?.rHand;
  clearWeaponAttach(hand);
  _attach = null;
  if (weapon.modelUrl) {
    const wt = String(weapon.weaponType || '');
    const id = String(weapon.id || '');
    let profile = 'melee';
    if (/WAND/i.test(wt) || id === 't0-wand') profile = 'wand';
    else if (/STAFF|TOME|NATURE/i.test(wt) || /staff|sapling|tome/i.test(id)) profile = 'staff';
    else if (/PISTOL|HANDGUN/i.test(wt) || /pistol|handgun/i.test(id)) profile = 'pistol';
    else if (/GUN|RIFLE/i.test(wt) || /rifle|gun/i.test(id)) profile = 'pistol';
    else if (/BOW|CROSSBOW/i.test(wt) || /bow|crossbow/i.test(id)) profile = 'bow';
    else if (/SHIELD/i.test(wt)) profile = 'shield';
    const maxLengthM =
      profile === 'wand'
        ? 0.95
        : profile === 'staff'
          ? 1.25
          : profile === 'pistol'
            ? 0.45
            : profile === 'bow'
              ? 1.35
              : /SPEAR/i.test(wt) || /spear/i.test(id)
                ? 1.9
                : /GREAT|2H|GREATAXE|WARHAMMER/i.test(wt) || /great|2h|greataxe|hammer2h/i.test(id)
                  ? 1.75
                  : /DAGGER/i.test(wt) || /dagger/i.test(id)
                    ? 0.55
                    : /TOOL/i.test(wt) || /tool/i.test(id)
                      ? 0.9
                      : 1.2;
    _attach = await attachWeaponModel(hand, weapon.modelUrl, {
      profile,
      maxLengthM
    });
  }

  // 4) Skill bar — caller sets setActiveSkillTree('equipped') + drc.skills refresh

  toast(
    `Equipped ${weapon.name} · ${weapon.weaponType} · ${weapon.animPack} · skills ${weapon.slot1.name} / ${weapon.slot2.name}`
  );

  return {
    weapon,
    hotbar: equippedWeaponHotbar(),
    attach: _attach,
    prefabExport: exportWarlordsWeaponPrefab(weapon, { slot3Id: _slot3Id })
  };
}

export function unequipWeapon(ctx) {
  const character = ctx?.character;
  const bones = character?.equipment?.findBones?.() || character?.bones || {};
  clearWeaponAttach(bones.rHand || character?.bones?.rHand);
  _attach = null;
  _equipped = null;
  _slot3Id = null;
  ctx?.onToast?.('Unequipped');
}

/**
 * Download / copy Warlords prefab JSON for current equip.
 */
export function exportEquippedPrefab() {
  if (!_equipped) return null;
  return exportWarlordsWeaponPrefab(_equipped, { slot3Id: getEquippedSlot3Id() });
}

export function downloadEquippedPrefab() {
  const data = exportEquippedPrefab();
  if (!data) return false;
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${data.id}.warlords-weapon-prefab.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  return true;
}
