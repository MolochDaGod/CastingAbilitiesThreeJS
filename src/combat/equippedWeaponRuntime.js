/**
 * Equipped weapon runtime — skills + assets follow the item, not a free skill tree.
 *
 * Dual loadout (paperdoll):
 *  - Set A: mainHand + offHand
 *  - Set B: weapon2 + offHand2
 * Combat **Q** (tap) swaps active set → mesh, anim pack, hotbar skills.
 *
 * Equip t0-sword / t0-wand / … → anim pack · mesh slot · 3-slot hotbar · icon · 3D attach
 */

import {
  loadEquippableWeapons,
  hotbarForWeapon,
  exportWarlordsWeaponPrefab,
  warmProductionOverrides,
  clearEquippableWeaponsCache
} from '../api/t0WeaponCatalog.js';
import { attachWeaponModel, clearWeaponAttach } from '../character/WeaponMeshAttach.js';
import { loadEquipMap, saveEquipMap } from '../ui/mainPanelSlots.js';
import { normalizeHoldKind } from '../character/weaponHoldPose.js';

/** @type {import('../api/t0WeaponCatalog.js').EquippableWeapon|null} */
let _equipped = null;
/** @type {string|null} */
let _slot3Id = null;
/** @type {import('three').Object3D|null} */
let _attach = null;
/** @type {Awaited<ReturnType<typeof loadEquippableWeapons>>|null} */
let _catalog = null;

/**
 * Active weapon set: 0 = Weapon 1 (mainHand) · 1 = Weapon 2 (weapon2)
 * @type {0|1}
 */
let _loadoutIndex = 0;

/** Per-set slot3 skill choice */
let _slot3BySet = /** @type {Record<number, string|null>} */ ({ 0: null, 1: null });

const LS_LOADOUT = 'casting.weaponLoadoutIndex.v1';

export function getEquippedWeapon() {
  return _equipped;
}

export function getActiveLoadoutIndex() {
  return _loadoutIndex;
}

export function getEquippedSlot3Id() {
  return (
    _slot3BySet[_loadoutIndex] ||
    _slot3Id ||
    _equipped?.defaultSlot3Id ||
    null
  );
}

/**
 * Paperdoll slot id for active set main hand.
 * @param {0|1} [idx]
 */
export function mainSlotForLoadout(idx = _loadoutIndex) {
  return idx === 1 ? 'weapon2' : 'mainHand';
}

/**
 * @param {0|1} [idx]
 */
export function offSlotForLoadout(idx = _loadoutIndex) {
  return idx === 1 ? 'offHand2' : 'offHand';
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
  clearEquippableWeaponsCache();
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
  if (ok) {
    _slot3Id = skillId;
    _slot3BySet[_loadoutIndex] = skillId;
  }
  return getEquippedSlot3Id();
}

/**
 * Resolve paperdoll weapon item id for a set index.
 * @param {0|1} idx
 */
export function getLoadoutWeaponId(idx) {
  const map = loadEquipMap();
  const mainId = map[mainSlotForLoadout(idx)]?.id || null;
  return mainId;
}

/**
 * Swap active weapon set (0 ↔ 1). Re-applies mesh, anim pack, skills.
 * @param {{
 *   character: import('../animation/CharacterController.js').CharacterController,
 *   onToast?: (s: string) => void,
 *   onSkills?: () => void
 * }} ctx
 * @param {0|1} [forceIndex] optional force set
 */
export async function swapWeaponLoadout(ctx, forceIndex) {
  const character = ctx.character;
  const toast = ctx.onToast || (() => {});
  const map = loadEquipMap();
  const a = map.mainHand?.id;
  const b = map.weapon2?.id;
  if (!a && !b) {
    toast('No dual weapons — equip Weapon 1 and Weapon 2');
    return { ok: false, index: _loadoutIndex };
  }
  // Only one weapon → stay / equip that one
  if (a && !b) {
    await equipWeaponById(a, ctx);
    _loadoutIndex = 0;
    localStorage.setItem(LS_LOADOUT, '0');
    ctx.onSkills?.();
    toast(`Weapon 1 · ${_equipped?.name || a}`);
    return { ok: true, index: 0, weapon: _equipped };
  }
  if (!a && b) {
    await equipWeaponById(b, ctx);
    _loadoutIndex = 1;
    localStorage.setItem(LS_LOADOUT, '1');
    ctx.onSkills?.();
    toast(`Weapon 2 · ${_equipped?.name || b}`);
    return { ok: true, index: 1, weapon: _equipped };
  }

  const next =
    forceIndex === 0 || forceIndex === 1
      ? forceIndex
      : /** @type {0|1} */ (_loadoutIndex === 0 ? 1 : 0);
  const id = getLoadoutWeaponId(next);
  if (!id) {
    toast('Empty weapon set');
    return { ok: false, index: _loadoutIndex };
  }
  _loadoutIndex = next;
  localStorage.setItem(LS_LOADOUT, String(next));
  _slot3Id = _slot3BySet[next] || null;
  await equipWeaponById(id, { ...ctx, skipPaperdollWrite: true, quiet: true });
  // Keep paperdoll: active set is logical only — items stay in their slots
  ctx.onSkills?.();
  toast(
    `Weapon ${next + 1} · ${_equipped?.name || id} · ${_equipped?.animPack || ''} · skills swapped`
  );
  return { ok: true, index: next, weapon: _equipped };
}

/** Restore loadout index after page reload (call after equip map ready). */
export function restoreLoadoutIndex() {
  const raw = localStorage.getItem(LS_LOADOUT);
  _loadoutIndex = raw === '1' ? 1 : 0;
  return _loadoutIndex;
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
  if (!_slot3BySet[_loadoutIndex]) {
    _slot3Id = weapon.defaultSlot3Id;
    _slot3BySet[_loadoutIndex] = weapon.defaultSlot3Id;
  } else {
    _slot3Id = _slot3BySet[_loadoutIndex];
  }

  // If equipping into a specific paperdoll set (from Inventory), set index
  if (ctx.weaponSet === 0 || ctx.weaponSet === 1) {
    _loadoutIndex = ctx.weaponSet;
    localStorage.setItem(LS_LOADOUT, String(_loadoutIndex));
  }

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
    // Character keeps pointer for getWeaponTip / reload pose
    if (character) {
      character.weaponAttach = _attach;
      // Hold-pose kind SSOT (main-panel + play equip share applyWeaponHoldPose)
      character.weaponHoldKind = normalizeHoldKind(
        weapon.weaponType || weapon.kind || weapon.id || profile
      );
      character.syncWeaponAttach?.();
      // Lab mesh appearance (color / scale / rotate) if saved
      try {
        const { applyWeaponAppearance } = await import('../equipment/meshAppearance.js');
        applyWeaponAppearance(character, weapon.id);
      } catch {
        /* optional */
      }
    }
  } else if (character) {
    character.weaponHoldKind = normalizeHoldKind(weapon.weaponType || weapon.kind || weapon.id);
  }

  // 4) Warm production skill overrides (public/skills/production/<id>.json) before hotbar compile
  try {
    const ids = [
      weapon.slot1?.id,
      weapon.slot2?.id,
      weapon.defaultSlot3Id,
      ...(weapon.slot3Options || []).map((s) => s?.id)
    ].filter(Boolean);
    await warmProductionOverrides(ids);
  } catch {
    /* optional overrides */
  }

  // 5) Skill bar — caller sets setActiveSkillTree('equipped') + drc.skills refresh

  if (!ctx.quiet) {
    toast(
      `Equipped ${weapon.name} · ${weapon.weaponType} · ${weapon.animPack} · skills ${weapon.slot1.name} / ${weapon.slot2.name}`
    );
  }

  return {
    weapon,
    hotbar: equippedWeaponHotbar(),
    attach: _attach,
    prefabExport: exportWarlordsWeaponPrefab(weapon, { slot3Id: _slot3Id })
  };
}

export function getWeaponAttach() {
  return _attach;
}

export function unequipWeapon(ctx) {
  const character = ctx?.character;
  const bones = character?.equipment?.findBones?.() || character?.bones || {};
  clearWeaponAttach(bones.rHand || character?.bones?.rHand);
  _attach = null;
  if (character) character.weaponAttach = null;
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
