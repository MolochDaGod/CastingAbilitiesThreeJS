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
  clearEquippableWeaponsCache,
  resolveT0WeaponId,
  T0_MODEL_CDN
} from '../api/t0WeaponCatalog.js';
import {
  attachWeaponModel,
  clearWeaponAttach,
  stampWeaponSpine
} from '../character/WeaponMeshAttach.js';
import { familyFromWeaponType } from '../character/weaponPrefabSpine.js';
import { loadEquipMap, saveEquipMap } from '../ui/mainPanelSlots.js';
import { normalizeHoldKind } from '../character/weaponHoldPose.js';
import { identifyPlayWeapon } from '../config/weaponAnimPack.js';
import { syncHotkeysFromSkills } from './skillBindings.js';
import { resolveWarlordsHandBone } from '../config/warlordsAdminLaw.js';

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
/** Per-weapon tree choice (slot 3) — survives reload */
let _slot3ByWeapon = /** @type {Record<string, string>} */ ({});

const LS_LOADOUT = 'casting.weaponLoadoutIndex.v1';
const LS_SLOT3 = 'casting.equippedSlot3ByWeapon.v1';

function _loadSlot3ByWeapon() {
  try {
    if (typeof localStorage === 'undefined') return {};
    const raw = localStorage.getItem(LS_SLOT3);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}
function _saveSlot3ByWeapon() {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(LS_SLOT3, JSON.stringify(_slot3ByWeapon));
  } catch {
    /* */
  }
}
_slot3ByWeapon = _loadSlot3ByWeapon();

export function getEquippedWeapon() {
  return _equipped;
}

export function getActiveLoadoutIndex() {
  return _loadoutIndex;
}

export function getEquippedSlot3Id() {
  const wid = _equipped?.id;
  const saved = wid ? _slot3ByWeapon[wid] : null;
  if (saved && _equipped?.slot3Options?.some((s) => s.id === saved)) return saved;
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
    _slot3ByWeapon[_equipped.id] = skillId;
    _saveSlot3ByWeapon();
    syncHotkeysFromSkills(equippedWeaponHotbar());
  }
  return getEquippedSlot3Id();
}

/**
 * Tree click / Showcase bind → hotkeys. Slots 1–2 are this weapon's
 * primary/secondary. Slot 3 is a choice from slot3Options. No 4th T0 key.
 * @param {string|number} slot  0|1|2|'f'
 * @param {string} [skillId]
 */
export function applyWeaponTreeHotkey(slot, skillId) {
  if (!_equipped) return { ok: false, reason: 'equip a weapon first' };
  const key = String(slot);
  if (key === 'f' || key === '0') {
    if (skillId && skillId !== _equipped.slot1?.id) {
      return {
        ok: false,
        reason: `key 1 / F is ${_equipped.slot1?.name || 'primary'} (this weapon)`
      };
    }
    syncHotkeysFromSkills(equippedWeaponHotbar());
    return { ok: true, hotbar: equippedWeaponHotbar() };
  }
  if (key === '1') {
    if (skillId && skillId !== _equipped.slot2?.id) {
      return {
        ok: false,
        reason: `key 2 is ${_equipped.slot2?.name || 'secondary'} (this weapon)`
      };
    }
    syncHotkeysFromSkills(equippedWeaponHotbar());
    return { ok: true, hotbar: equippedWeaponHotbar() };
  }
  if (key === '2') {
    if (!skillId) return { ok: false, reason: 'pick a slot-3 option on this weapon' };
    const next = setEquippedSlot3(skillId);
    if (next !== skillId) {
      return { ok: false, reason: 'not a slot-3 option on this weapon' };
    }
    return { ok: true, hotbar: equippedWeaponHotbar() };
  }
  return { ok: false, reason: 'T0 tree is keys 1–3 only' };
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
  const raw = String(weaponId || '');
  const id = resolveT0WeaponId(raw);
  const cat = await ensureWeaponCatalog();
  const weapon = cat.byId.get(id);
  if (!weapon) throw new Error(`Unknown weapon ${weaponId}`);
  if (raw !== id && T0_MODEL_CDN[raw]) {
    return equipWeapon(
      { ...weapon, id: raw, modelUrl: T0_MODEL_CDN[raw], name: `${weapon.name} · training` },
      ctx
    );
  }
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
  if (weapon?.id === 't0-daax' || weapon?.unlockProfessions) {
    try {
      const { DAAX_RECIPE_UNLOCKS } = await import('../api/t0GunsCatalog.js');
      const { unlockProfessionNode } = await import('../ui/mainPanelSlots.js');
      const pairs = weapon.unlockProfessions
        ? DAAX_RECIPE_UNLOCKS.filter(([p]) => weapon.unlockProfessions.includes(p))
        : DAAX_RECIPE_UNLOCKS;
      for (const [prof, node] of pairs) unlockProfessionNode(prof, node);
      toast('DaAx · Forester + Engineer recipes unlocked');
    } catch {
      /* optional */
    }
  }
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

  // 1) Kit weapons OFF when a catalog GLB will attach. Showing both is the
  //    "free spinning / floating" bug (skinned kit prop + CDN holder).
  const slot = weapon.meshSlot;
  const hasCatalogMesh = !!weapon.modelUrl;
  if (character.equipment) {
    const WEAPON_SLOTS = ['sword', 'axe', 'hammer', 'spear', 'staff', 'bow', 'shield', 'pistol'];
    if (hasCatalogMesh && typeof character.equipment.hideKitWeapons === 'function') {
      character.equipment.hideKitWeapons();
    } else {
      for (const w of WEAPON_SLOTS) {
        if (w !== slot) character.equipment.setSlot?.(w, null);
      }
      const summary = character.equipment.getCatalogSummary?.() || {};
      const variants = summary[slot]?.variants || [];
      if (variants.length) {
        const pick =
          variants.find((v) => v === 'A' || v === '_default') || variants[0] || 'A';
        character.equipment.setSlot?.(slot, pick);
      }
    }
    character._reGroundAfterEquip?.();
    character.ik?.setBones?.(character.equipment.findBones?.());
  }

  // 2) Anim pack for weapon (identify — never default every item to magic/tome)
  const identMain = identifyPlayWeapon(weapon);
  await character.setAnimPack?.(identMain.pack || weapon.animPack);
  await character._bindPack?.('combat_mobility');

  // 3) 3D catalog model on hand (prefab model — for Warlords prefab QA)
  const bones = character.equipment?.findBones?.() || character.bones || {};
  const handSlot = identMain.hand === 'off' ? 'off' : 'main';
  const hand =
    resolveWarlordsHandBone(character.model, handSlot) ||
    (handSlot === 'off' ? bones.lHand : bones.rHand) ||
    character.bones?.[handSlot === 'off' ? 'lHand' : 'rHand'];
  clearWeaponAttach(hand);
  _attach = null;
  if (weapon.modelUrl) {
    const ident = identifyPlayWeapon(weapon);
    const profile = ident.profile === 'tome' ? 'staff' : ident.profile;
    const maxLengthM = ident.maxLengthM;
    _attach = await attachWeaponModel(hand, weapon.modelUrl, {
      profile,
      maxLengthM,
      weaponId: weapon.id
    });
    if (!_attach) {
      console.warn('[equip] catalog mesh failed — kit weapons stay hidden (no spin-prop fallback)', weapon.id);
    }
    // Character keeps pointer for getWeaponTip / reload pose
    if (character) {
      character.weaponAttach = _attach;
      if (_attach) {
        stampWeaponSpine(_attach, {
          profile,
          family: familyFromWeaponType(weapon.weaponType || weapon.kind || weapon.id),
          spine: weapon.spine || weapon.mesh?.spine || weapon.contract?.locations?.spine
        });
      }
      character.weaponHoldKind = ident.holdKind || normalizeHoldKind(weapon.weaponType || weapon.id);
      character.syncWeaponAttach?.();
      // Oriented cylinder from weapon mesh (+0.02 m pad) → tip / residual / parry
      try {
        character.rebuildWeaponVolume?.({ debug: false });
      } catch {
        /* optional */
      }
      // Lab mesh appearance (color / scale / rotate) if saved
      try {
        const { applyWeaponAppearance } = await import('../equipment/meshAppearance.js');
        applyWeaponAppearance(character, weapon.id);
      } catch {
        /* optional */
      }
    }
  } else if (character) {
    character.weaponHoldKind = identMain.holdKind || normalizeHoldKind(weapon.weaponType || weapon.id);
    try {
      character.rebuildWeaponVolume?.({ debug: false });
    } catch {
      /* optional */
    }
  }

  // 3b) Off-hand (shield / tome / 1H) on L_hand_container — not a second mixer
  const lHand =
    resolveWarlordsHandBone(character.model, 'off') ||
    bones.lHand ||
    character.bones?.lHand;
  if (character) {
    character.weaponHoldOffKind = null;
    character.offhandAttach = null;
    if (lHand && lHand !== hand) clearWeaponAttach(lHand);
  }
  const offId = loadEquipMap()?.[offSlotForLoadout()]?.id;
  if (offId && offId !== weapon.id && character && lHand) {
    const offAtt = await attachOffhandById(character, offId, lHand);
    if (offAtt) character.offhandAttach = offAtt;
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

  // 5) Skill bar — tree selections own keys 1–3 + F
  try {
    if (_equipped.id && _slot3ByWeapon[_equipped.id]) {
      setEquippedSlot3(_slot3ByWeapon[_equipped.id]);
    }
    syncHotkeysFromSkills(equippedWeaponHotbar());
  } catch {
    /* persist optional */
  }

  if (!ctx.quiet) {
    toast(
      `Equipped ${weapon.name} · ${identMain.holdKind} · ${identMain.pack} · ${weapon.slot1?.name || ''} / ${weapon.slot2?.name || ''}`
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

/**
 * Off-hand catalog mesh on L_hand_container. Tome/shield/1H dual.
 * @param {object} character
 * @param {string} weaponId
 * @param {import('three').Object3D|null} [handBone]
 */
export async function attachOffhandById(character, weaponId, handBone = null) {
  const cat = await ensureWeaponCatalog();
  const w = cat?.byId?.get?.(weaponId);
  if (!w?.modelUrl || !character) return null;
  const ident = identifyPlayWeapon(w);
  const hand =
    handBone ||
    resolveWarlordsHandBone(character.model, 'off') ||
    character.equipment?.findBones?.()?.lHand ||
    character.bones?.lHand;
  if (!hand) return null;
  const profile = ident.profile === 'tome' ? 'staff' : ident.profile;
  const attach = await attachWeaponModel(hand, w.modelUrl, {
    profile,
    maxLengthM: ident.maxLengthM,
    weaponId: w.id
  });
  character.weaponHoldOffKind = ident.holdKind;
  character.offhandAttach = attach;
  return attach;
}

export function unequipWeapon(ctx) {
  const character = ctx?.character;
  const bones = character?.equipment?.findBones?.() || character?.bones || {};
  clearWeaponAttach(bones.rHand || character?.bones?.rHand);
  clearWeaponAttach(bones.lHand || character?.bones?.lHand);
  _attach = null;
  if (character) {
    character.weaponAttach = null;
    character.offhandAttach = null;
    character.weaponHoldOffKind = null;
  }
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
