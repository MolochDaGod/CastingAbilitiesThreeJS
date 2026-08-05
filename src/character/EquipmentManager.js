/**
 * Toon RTS / grudge6 equipment = child mesh visibility (never body GLB swap).
 * SSOT: grudge6-modular-characters
 */

import { EQUIP_SLOTS, WEAPON_SLOTS } from '../config/assets.js';

const RACE_PREFIX = /^(wk|brb|orc|elf|ud|dwf)_/i;

export function meshKey(name) {
  return String(name || '')
    .toLowerCase()
    .replace(RACE_PREFIX, '')
    .replace(/units_/g, '')
    .replace(/xtra_/g, '')
    .replace(/weapon_/g, 'weapon')
    .replace(/[^a-z0-9]/g, '');
}

function keysMatch(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  return a.endsWith(b) || b.endsWith(a);
}

/**
 * Classify a mesh into a loadout slot + variant letter (or _default).
 * @returns {{ slot: string, variant: string } | null}
 */
export function classifyMesh(name) {
  const key = meshKey(name);
  if (!key) return null;

  // Skip pure skeleton / helper names
  if (key.startsWith('bip') || key.includes('container') || key === 'armature') return null;

  const slotPatterns = [
    { slot: 'body', re: /^(?:units)?body([a-z])$/ },
    { slot: 'arms', re: /^(?:units)?arms([a-z])$/ },
    { slot: 'legs', re: /^(?:units)?legs([a-z])$/ },
    { slot: 'head', re: /^(?:units)?head([a-z])$/ },
    { slot: 'shoulders', re: /^(?:units)?shoulderpads?([a-z])$/ },
    { slot: 'sword', re: /^(?:weapon)?sword([a-z])?$/ },
    { slot: 'axe', re: /^(?:weapon)?axe([a-z])?$/ },
    { slot: 'hammer', re: /^(?:weapon)?hammer([a-z])?$/ },
    { slot: 'spear', re: /^(?:weapon)?spear([a-z])?$/ },
    { slot: 'staff', re: /^(?:weapon)?staff([a-z])?$/ },
    { slot: 'bow', re: /^(?:weapon)?bow([a-z])?$/ },
    { slot: 'shield', re: /^shield([a-z])?$/ },
    { slot: 'quiver', re: /^quiver([a-z])?$/ },
    { slot: 'bag', re: /^bag([a-z])?$/ }
  ];

  for (const { slot, re } of slotPatterns) {
    const m = key.match(re);
    if (m) {
      const variant = (m[1] || '_default').toUpperCase();
      return { slot, variant: variant === '_DEFAULT' ? '_default' : variant };
    }
  }

  // Looser contains match for odd author names
  for (const slot of EQUIP_SLOTS) {
    if (key.includes(slot.replace(/s$/, '')) || key.includes(slot)) {
      const letter = key.match(/([a-z])$/);
      return { slot, variant: letter ? letter[1].toUpperCase() : '_default' };
    }
  }

  return null;
}

export class EquipmentManager {
  /**
   * @param {import('three').Object3D} root kit scene root
   */
  constructor(root) {
    this.root = root;
    /** @type {Map<string, import('three').Object3D[]>} slot → meshes */
    this.bySlot = new Map();
    /** @type {Map<string, Map<string, import('three').Object3D[]>>} slot → variant → meshes */
    this.bySlotVariant = new Map();
    /** @type {import('three').Object3D[]} */
    this.equippable = [];
    /** @type {Record<string, string>} */
    this.loadout = {};
    this._catalog();
  }

  _catalog() {
    this.bySlot.clear();
    this.bySlotVariant.clear();
    this.equippable = [];

    this.root.traverse((node) => {
      if (!node.isMesh && !node.isSkinnedMesh) return;
      const info = classifyMesh(node.name);
      if (!info) return;

      this.equippable.push(node);
      if (!this.bySlot.has(info.slot)) this.bySlot.set(info.slot, []);
      this.bySlot.get(info.slot).push(node);

      if (!this.bySlotVariant.has(info.slot)) this.bySlotVariant.set(info.slot, new Map());
      const vm = this.bySlotVariant.get(info.slot);
      if (!vm.has(info.variant)) vm.set(info.variant, []);
      vm.get(info.variant).push(node);

      // index bare letter variants as A when author used unlettered names
      if (info.variant === '_default' && !vm.has('A')) {
        // keep _default only
      }
    });
  }

  /** Variants available for a slot (sorted). */
  variantsFor(slot) {
    const vm = this.bySlotVariant.get(slot);
    if (!vm) return [];
    return [...vm.keys()].sort((a, b) => {
      if (a === '_default') return -1;
      if (b === '_default') return 1;
      return a.localeCompare(b);
    });
  }

  /** Hide every equippable mesh. */
  hideAll() {
    for (const m of this.equippable) m.visible = false;
  }

  /**
   * Apply loadout: one variant per armor slot; exclusive weapons.
   * @param {Record<string, string>} loadout e.g. { body:'D', staff:'A' }
   * @returns {{ matched: number, missing: string[] }}
   */
  applyLoadout(loadout) {
    this.loadout = { ...(loadout || {}) };
    this.hideAll();

    const missing = [];
    let matched = 0;

    // Exclusive weapon group: only one weapon_r / weapon_l
    const weaponKeys = WEAPON_SLOTS.filter((s) => this.loadout[s]);
    // Prefer staff for mage, else first listed
    let activeWeapon = null;
    if (weaponKeys.includes('staff')) activeWeapon = 'staff';
    else if (weaponKeys.includes('bow')) activeWeapon = 'bow';
    else if (weaponKeys.length) activeWeapon = weaponKeys[0];

    for (const [slot, variant] of Object.entries(this.loadout)) {
      if (WEAPON_SLOTS.includes(slot) && slot !== activeWeapon) continue;

      const shown = this._show(slot, variant);
      if (shown) matched += shown;
      else missing.push(`${slot}:${variant}`);
    }

    // Always try to show something if armor empty (first body variant)
    if (!this.loadout.body) {
      const bodies = this.variantsFor('body');
      if (bodies[0]) this._show('body', bodies[0]);
    }

    return { matched, missing };
  }

  _show(slot, variant) {
    const vm = this.bySlotVariant.get(slot);
    if (!vm) return 0;

    let list = vm.get(variant);
    if (!list?.length && variant !== '_default') {
      // try case-insensitive / letter-only
      for (const [k, arr] of vm) {
        if (k.toUpperCase() === String(variant).toUpperCase()) {
          list = arr;
          break;
        }
      }
    }
    if (!list?.length) {
      // fallback: first available for slot
      list = vm.values().next().value;
    }
    if (!list?.length) return 0;

    for (const mesh of list) mesh.visible = true;
    return list.length;
  }

  /** Toggle a single slot to a variant (updates loadout). */
  setSlot(slot, variant) {
    if (WEAPON_SLOTS.includes(slot)) {
      // clear other weapons
      for (const w of WEAPON_SLOTS) delete this.loadout[w];
    }
    if (!variant || variant === 'none') {
      delete this.loadout[slot];
    } else {
      this.loadout[slot] = variant;
    }
    return this.applyLoadout(this.loadout);
  }

  /** Snapshot for UI. */
  getCatalogSummary() {
    const slots = {};
    for (const slot of EQUIP_SLOTS) {
      const variants = this.variantsFor(slot);
      if (variants.length) {
        slots[slot] = {
          variants,
          selected: this.loadout[slot] || null
        };
      }
    }
    return slots;
  }

  /**
   * Find hand / shield containers for IK attach.
   * @returns {{ rHand: import('three').Object3D|null, lHand: import('three').Object3D|null, shield: import('three').Object3D|null, pelvis: import('three').Object3D|null }}
   */
  findBones() {
    let rHand = null;
    let lHand = null;
    let shield = null;
    let pelvis = null;

    this.root.traverse((n) => {
      const name = n.name || '';
      if (/R_hand_container/i.test(name) || name === 'Bip001 R Hand') rHand = rHand || n;
      if (/L_hand_container/i.test(name) || name === 'Bip001 L Hand') lHand = lHand || n;
      if (/L_shield_container/i.test(name)) shield = shield || n;
      if (/Bip001 Pelvis/i.test(name) || name === 'Bip001 Pelvis') pelvis = pelvis || n;
    });

    return { rHand, lHand, shield, pelvis };
  }
}

/** Fuzzy match helper exported for diagnostics. */
export function matchMeshById(root, meshId) {
  const want = meshKey(meshId);
  let found = null;
  root.traverse((n) => {
    if (found || (!n.isMesh && !n.isSkinnedMesh)) return;
    if (keysMatch(meshKey(n.name), want)) found = n;
  });
  return found;
}
