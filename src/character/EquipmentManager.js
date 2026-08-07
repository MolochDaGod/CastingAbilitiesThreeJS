/**
 * Toon RTS / grudge6 equipment = child mesh visibility (never body GLB swap).
 * SSOT: grudge6-modular-characters
 *
 * Hard rules:
 *  - Hide ALL equippable first
 *  - Show only mesh_ids / loadout slots
 *  - NEVER show bag / wood / quiver unless carry mode (setCarryVisuals)
 */

import { EQUIP_SLOTS, WEAPON_SLOTS } from '../config/assets.js';
import { UTILITY_SLOTS } from '../config/grudge6SSOT.js';

const RACE_PREFIX = /^(wk|brb|orc|elf|ud|dwf)_/i;
/** Author names that must stay off for combat showcase */
const UTILITY_NAME_RE = /xtra_?(bag|wood|quiver)|bone_bag|bone_wood|quiver/i;

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

  // grudge6 / Toon RTS: WK_Units_Body_A → bodya after meshKey
  const slotPatterns = [
    { slot: 'body', re: /^(?:units)?body([a-z0-9])$/ },
    { slot: 'arms', re: /^(?:units)?arms([a-z0-9])$/ },
    { slot: 'legs', re: /^(?:units)?legs([a-z0-9])$/ },
    { slot: 'head', re: /^(?:units)?head([a-z0-9])$/ },
    { slot: 'shoulders', re: /^(?:units)?shoulderpads?([a-z0-9])$/ },
    { slot: 'sword', re: /^(?:weapon)?sword([a-z0-9])?$/ },
    { slot: 'axe', re: /^(?:weapon)?axe([a-z0-9])?$/ },
    { slot: 'hammer', re: /^(?:weapon)?hammer([a-z0-9])?$/ },
    { slot: 'spear', re: /^(?:weapon)?spear([a-z0-9])?$/ },
    { slot: 'staff', re: /^(?:weapon)?staff([a-z0-9])?$/ },
    { slot: 'bow', re: /^(?:weapon)?bow([a-z0-9])?$/ },
    { slot: 'shield', re: /^shield([a-z0-9])?$/ },
    { slot: 'quiver', re: /^quiver([a-z0-9])?$/ },
    { slot: 'bag', re: /^(?:xtra)?bag([a-z0-9])?$/ },
    { slot: 'wood', re: /^(?:xtra)?wood([a-z0-9])?$/ }
  ];

  for (const { slot, re } of slotPatterns) {
    const m = key.match(re);
    if (m) {
      const variant = (m[1] || '_default').toUpperCase();
      return { slot, variant: variant === '_DEFAULT' ? '_default' : variant };
    }
  }

  // Contains match — only armor/weapon keywords, require trailing letter when possible
  const contains = [
    ['shoulderpads', 'shoulders'],
    ['shoulder', 'shoulders'],
    ['body', 'body'],
    ['arms', 'arms'],
    ['legs', 'legs'],
    ['head', 'head'],
    ['sword', 'sword'],
    ['staff', 'staff'],
    ['shield', 'shield'],
    ['hammer', 'hammer'],
    ['spear', 'spear'],
    ['quiver', 'quiver'],
    ['bow', 'bow'],
    ['axe', 'axe'],
    ['bag', 'bag'],
    ['wood', 'wood']
  ];
  for (const [frag, slot] of contains) {
    if (!key.includes(frag)) continue;
    const m = key.match(new RegExp(`${frag}([a-z0-9])$`));
    const variant = m ? m[1].toUpperCase() : '_default';
    return { slot, variant };
  }

  return null;
}

export class EquipmentManager {
  /**
   * @param {import('three').Object3D} root kit scene root
   * @param {{ preserveVisibility?: boolean }} [opts]
   *   preserveVisibility: true when scaffold already equipped — do NOT hideAll
   *   (that was wiping the hero to invisible after a correct equip).
   */
  constructor(root, opts = {}) {
    this.root = root;
    /** @type {Map<string, import('three').Object3D[]>} slot → meshes */
    this.bySlot = new Map();
    /** @type {Map<string, Map<string, import('three').Object3D[]>>} slot → variant → meshes */
    this.bySlotVariant = new Map();
    /** @type {import('three').Object3D[]} */
    this.equippable = [];
    /** @type {import('three').Object3D[]} bag/wood/quiver always tracked */
    this.utilityMeshes = [];
    /** @type {Record<string, string>} */
    this.loadout = {};
    /** When false (default combat), bag/wood/quiver stay hidden. */
    this.carryMode = false;
    this._preserveVisibility = !!opts.preserveVisibility;
    this._catalog();
    // Only nuke visibility on a fresh kit. After toonKitPlay deploy, meshes are
    // already exclusive-equipped — hideAll here made the character disappear.
    if (!this._preserveVisibility) {
      this.hideAll();
      this.hideUtility();
    } else {
      // Never hide armor/weapons during catalog; only strip utility
      this.hideUtility();
    }
  }

  _catalog() {
    this.bySlot.clear();
    this.bySlotVariant.clear();
    this.equippable = [];
    this.utilityMeshes = [];

    this.root.traverse((node) => {
      if (!node.isMesh && !node.isSkinnedMesh) return;
      const name = node.name || '';

      // Always track utility by name even if classify misses
      if (UTILITY_NAME_RE.test(name)) {
        this.utilityMeshes.push(node);
      }

      const info = classifyMesh(name);
      if (!info) {
        // Unclassified gear — only hide when building a fresh kit
        if (/weapon|shield|units_|xtra_/i.test(name)) {
          if (!this._preserveVisibility) node.visible = false;
          this.equippable.push(node);
        }
        return;
      }

      this.equippable.push(node);
      if (!this.bySlot.has(info.slot)) this.bySlot.set(info.slot, []);
      this.bySlot.get(info.slot).push(node);

      if (!this.bySlotVariant.has(info.slot)) this.bySlotVariant.set(info.slot, new Map());
      const vm = this.bySlotVariant.get(info.slot);
      if (!vm.has(info.variant)) vm.set(info.variant, []);
      vm.get(info.variant).push(node);
    });
  }

  /** RTS worker carry visuals — bag/wood only while carrying. */
  setCarryVisuals({ bag = false, wood = false, quiver = false } = {}) {
    this.carryMode = !!(bag || wood || quiver);
    this.hideUtility();
    if (bag) this._show('bag', this.variantsFor('bag')[0] || '_default');
    if (wood) this._show('wood', this.variantsFor('wood')[0] || '_default');
    if (quiver) this._show('quiver', this.variantsFor('quiver')[0] || '_default');
  }

  /** Force bag / wood / quiver off (combat default). */
  hideUtility() {
    for (const m of this.utilityMeshes) m.visible = false;
    for (const slot of UTILITY_SLOTS) {
      const list = this.bySlot.get(slot) || [];
      for (const m of list) m.visible = false;
      delete this.loadout[slot];
    }
    // Name fallback for any that skipped catalog
    this.root.traverse((n) => {
      if ((!n.isMesh && !n.isSkinnedMesh) || !n.name) return;
      if (UTILITY_NAME_RE.test(n.name)) n.visible = false;
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
   * Multiverse path: hide all → show exact mesh_ids (fuzzy name match).
   * @param {string[]} meshIds e.g. ['WK_Units_Body_D', 'WK_weapon_staff_A']
   * @returns {{ matched: number, missing: string[], shown: string[] }}
   */
  applyMeshIds(meshIds = []) {
    this.hideAll();
    this.loadout = {};
    const wanted = (meshIds || []).map(String).filter(Boolean);
    const missing = [];
    const shown = [];
    let matched = 0;

    for (const id of wanted) {
      const want = meshKey(id);
      let hit = null;
      for (const m of this.equippable) {
        if (keysMatch(meshKey(m.name), want) || m.name === id) {
          hit = m;
          break;
        }
      }
      // Also search non-catalog meshes (rare naming)
      if (!hit) {
        this.root.traverse((n) => {
          if (hit || (!n.isMesh && !n.isSkinnedMesh)) return;
          if (n.name === id || keysMatch(meshKey(n.name), want)) hit = n;
        });
      }
      if (hit) {
        hit.visible = true;
        matched += 1;
        shown.push(hit.name);
        const info = classifyMesh(hit.name);
        if (info) this.loadout[info.slot] = info.variant;
      } else {
        missing.push(id);
      }
    }

    // Fail-safe: at least one body
    const anyBody = (this.bySlot.get('body') || []).some((m) => m.visible);
    if (!anyBody) {
      const bodies = this.variantsFor('body');
      if (bodies[0]) {
        this._show('body', bodies[0]);
        this.loadout.body = bodies[0];
        matched += 1;
      }
    }

    // Combat default: never leave bag/wood/quiver on unless carryMode
    if (!this.carryMode) this.hideUtility();

    return {
      matched,
      missing,
      shown: shown.filter((n) => !UTILITY_NAME_RE.test(n)),
      slots: Object.keys(this.loadout),
      catalogSlots: [...this.bySlot.keys()]
    };
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

    // Exclusive weapon group: only one main weapon visible
    const weaponKeys = WEAPON_SLOTS.filter((s) => this.loadout[s]);
    let activeWeapon = null;
    if (weaponKeys.includes('staff')) activeWeapon = 'staff';
    else if (weaponKeys.includes('bow')) activeWeapon = 'bow';
    else if (weaponKeys.length) activeWeapon = weaponKeys[0];

    // Armor first so body exists before weapons
    const armorSlots = ['body', 'arms', 'legs', 'head', 'shoulders'];
    for (const slot of armorSlots) {
      const variant = this.loadout[slot];
      if (!variant) continue;
      const shown = this._show(slot, variant);
      if (shown) matched += shown;
      else missing.push(`${slot}:${variant}`);
    }

    for (const [slot, variant] of Object.entries(this.loadout)) {
      if (armorSlots.includes(slot)) continue;
      if (WEAPON_SLOTS.includes(slot) && slot !== activeWeapon) continue;
      const shown = this._show(slot, variant);
      if (shown) matched += shown;
      else missing.push(`${slot}:${variant}`);
    }

    // Fail-safe: always one body variant so kit is never empty/invisible
    const anyBody = (this.bySlot.get('body') || []).some((m) => m.visible);
    if (!anyBody) {
      const bodies = this.variantsFor('body');
      if (bodies[0]) {
        this._show('body', bodies[0]);
        this.loadout.body = bodies[0];
        matched += 1;
      }
    }

    if (!this.carryMode) this.hideUtility();

    return {
      matched,
      missing,
      slots: Object.keys(this.loadout),
      catalogSlots: [...this.bySlot.keys()],
      activeWeapon
    };
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
    /** Prefer Bone instances (same name may exist as Object3D). */
    const preferBone = (cur, next) => {
      if (!cur) return next;
      if (next?.isBone && !cur.isBone) return next;
      return cur;
    };

    this.root.traverse((n) => {
      const name = n.name || '';
      if (/R_hand_container/i.test(name) || /^Bip001[\s_]R[\s_]Hand$/i.test(name)) {
        rHand = preferBone(rHand, n);
      }
      if (/L_hand_container/i.test(name) || /^Bip001[\s_]L[\s_]Hand$/i.test(name)) {
        lHand = preferBone(lHand, n);
      }
      if (/L_shield_container/i.test(name)) shield = shield || n;
      if (/^Bip001[\s_]Pelvis$/i.test(name) || name === 'Bip001 Pelvis') {
        pelvis = preferBone(pelvis, n);
      }
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
