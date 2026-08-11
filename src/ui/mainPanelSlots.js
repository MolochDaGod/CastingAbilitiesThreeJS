/**
 * Main Panel equipment + inventory slot SSOT (Casting production tester).
 *
 * Look SSOT: Tactical Infinity /equipment (dark paperdoll + dual columns)
 * Inventory slot chrome: public/ui/inventory/inventory-slots-set.png
 * Logic patterns: Player-Inventory-System (slots, equip, bag, LMB pick/place)
 *
 * Wire: InventoryPanel · AdminHub · grudge6 mesh_ids + hand attach
 */

/** @typedef {'mesh'|'hand'|'back'|'hud'|'mount'} SlotKind */

/**
 * Paperdoll columns — Warlords / TI layout.
 * Left = armour/mesh (ENHANCEMENTS) · Right = gear hands/relic (ENCHANT)
 */
export const PAPERDOLL_LEFT = Object.freeze([
  { id: 'head', label: 'Head', kind: 'mesh', meshSlot: 'head', accepts: ['armour', 'head'] },
  { id: 'body', label: 'Body', kind: 'mesh', meshSlot: 'body', accepts: ['armour', 'body'] },
  { id: 'arms', label: 'Arms', kind: 'mesh', meshSlot: 'arms', accepts: ['armour', 'arms'] },
  { id: 'legs', label: 'Legs', kind: 'mesh', meshSlot: 'legs', accepts: ['armour', 'legs'] },
  { id: 'shoulders', label: 'Shoulders', kind: 'mesh', meshSlot: 'shoulders', accepts: ['armour'] },
  { id: 'bag', label: 'Bag', kind: 'mesh', meshSlot: 'bag', accepts: ['utility', 'bag'] },
]);

export const PAPERDOLL_RIGHT = Object.freeze([
  { id: 'mainHand', label: 'Main hand', kind: 'hand', meshSlot: 'sword', accepts: ['weapon', 'tool'] },
  { id: 'offHand', label: 'Off hand', kind: 'hand', meshSlot: 'shield', accepts: ['weapon', 'shield', 'tome'] },
  { id: 'back', label: 'Back', kind: 'back', meshSlot: 'back', accepts: ['back', 'utility'] },
  { id: 'relic', label: 'Relic', kind: 'hud', meshSlot: null, accepts: ['relic'] },
  { id: 'mount', label: 'Mount', kind: 'mount', meshSlot: null, accepts: ['mount'] },
  { id: 'quiver', label: 'Quiver', kind: 'mesh', meshSlot: 'quiver', accepts: ['utility'] },
]);

export const ALL_PAPERDOLL_SLOTS = Object.freeze([...PAPERDOLL_LEFT, ...PAPERDOLL_RIGHT]);

/**
 * Bag grid — inventory.png Warlords layout: 9×3 main + hotbar row.
 * (was 4×3 + util; expanded to match full inventory shell.)
 */
export const BAG_LAYOUT = Object.freeze({
  mainCols: 9,
  mainRows: 3,
  utilSlots: 9,
  capacity: 9 * 3 + 9,
  /** CSS theme key into inventory-slots-set.png (skin index 0–9) */
  defaultSkin: 'steel',
});

export const BAG_SKINS = Object.freeze([
  { id: 'wood', label: 'Wood', row: 0, col: 0 },
  { id: 'steel', label: 'Steel', row: 0, col: 1 },
  { id: 'dark', label: 'Dark', row: 0, col: 2 },
  { id: 'copper', label: 'Copper', row: 0, col: 3 },
  { id: 'silver', label: 'Silver', row: 0, col: 4 },
  { id: 'orange', label: 'Orange', row: 1, col: 0 },
  { id: 'blue', label: 'Blue', row: 1, col: 1 },
  { id: 'purple', label: 'Purple', row: 1, col: 2 },
  { id: 'magenta', label: 'Magenta', row: 1, col: 3 },
  { id: 'green', label: 'Green', row: 1, col: 4 },
]);

/** WCS profession skill trees (crafting SSOT surface) */
export const PROFESSION_TREES = Object.freeze([
  {
    id: 'miner',
    label: 'Miner',
    icon: 'https://grudgewarlords.com/craft/crafting-icons/miner.png',
    nodes: [
      { id: 'm1', name: 'Stone Sense', tier: 1, desc: 'Find ore nodes' },
      { id: 'm2', name: 'Copper Vein', tier: 2, desc: 'Unlock copper' },
      { id: 'm3', name: 'Iron Vein', tier: 3, desc: 'Unlock iron' },
      { id: 'm4', name: 'Deep Core', tier: 4, desc: 'Rare ore chance' },
      { id: 'm5', name: 'Master Miner', tier: 5, desc: 'Double chunk strip' },
    ],
  },
  {
    id: 'forester',
    label: 'Forester',
    icon: 'https://grudgewarlords.com/craft/crafting-icons/forester.png',
    nodes: [
      { id: 'f1', name: 'Timber Eye', tier: 1, desc: 'Find trees' },
      { id: 'f2', name: 'Hardwood', tier: 2, desc: 'Better wood' },
      { id: 'f3', name: 'Resin Tap', tier: 3, desc: 'Craft resin mats' },
      { id: 'f4', name: 'Grove Ward', tier: 4, desc: 'Faster respawn clear' },
      { id: 'f5', name: 'Master Forester', tier: 5, desc: 'Extra stick drop' },
    ],
  },
  {
    id: 'chef',
    label: 'Chef',
    icon: 'https://grudgewarlords.com/craft/crafting-icons/chef.png',
    nodes: [
      { id: 'c1', name: 'Campfire', tier: 1, desc: 'Cook basic food' },
      { id: 'c2', name: 'Stew', tier: 2, desc: 'Buff meals' },
      { id: 'c3', name: 'Feast', tier: 3, desc: 'Party food' },
      { id: 'c4', name: 'Preserves', tier: 4, desc: 'Long buffs' },
      { id: 'c5', name: 'Master Chef', tier: 5, desc: 'Double cook yield' },
    ],
  },
  {
    id: 'engineer',
    label: 'Engineer',
    icon: 'https://grudgewarlords.com/craft/crafting-icons/engineer.png',
    nodes: [
      { id: 'e1', name: 'Workbench', tier: 1, desc: 'Basic tools' },
      { id: 'e2', name: 'Gearworks', tier: 2, desc: 'Mechanisms' },
      { id: 'e3', name: 'Siege Parts', tier: 3, desc: 'Catapult parts' },
      { id: 'e4', name: 'Automata', tier: 4, desc: 'Auto-harvest kit' },
      { id: 'e5', name: 'Master Engineer', tier: 5, desc: 'Field repairs' },
    ],
  },
  {
    id: 'mystic',
    label: 'Mystic',
    icon: 'https://grudgewarlords.com/craft/crafting-icons/mystic.png',
    nodes: [
      { id: 'y1', name: 'Focus Herb', tier: 1, desc: 'Gather reagents' },
      { id: 'y2', name: 'Ink', tier: 2, desc: 'Inscription mats' },
      { id: 'y3', name: 'Charm', tier: 3, desc: 'Relic craft' },
      { id: 'y4', name: 'Ward Stone', tier: 4, desc: 'Defense craft' },
      { id: 'y5', name: 'Master Mystic', tier: 5, desc: 'Spell catalyst' },
    ],
  },
]);

const LS_BAG = 'casting.mainPanel.bag.v2';
const LS_EQUIP = 'casting.mainPanel.equip.v1';
const LS_PROF = 'casting.mainPanel.prof.v1';
const LS_SKIN = 'casting.mainPanel.bagSkin.v1';
const LS_SLOT_ADMIN = 'casting.mainPanel.slotAdmin.v1';

function safeParse(raw, fallback) {
  try {
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export function loadBagSkin() {
  return localStorage.getItem(LS_SKIN) || BAG_LAYOUT.defaultSkin;
}

export function saveBagSkin(id) {
  localStorage.setItem(LS_SKIN, id);
}

/** @returns {{ slots: (object|null)[] }} */
export function loadBag() {
  const data = safeParse(localStorage.getItem(LS_BAG), null);
  if (data?.slots?.length === BAG_LAYOUT.capacity) return data;
  return { slots: Array(BAG_LAYOUT.capacity).fill(null) };
}

export function saveBag(bag) {
  localStorage.setItem(LS_BAG, JSON.stringify(bag));
}

/** @returns {Record<string, object|null>} */
export function loadEquipMap() {
  return safeParse(localStorage.getItem(LS_EQUIP), {});
}

export function saveEquipMap(map) {
  localStorage.setItem(LS_EQUIP, JSON.stringify(map || {}));
}

/** @returns {Record<string, { level: number, xp: number, unlocked: string[] }>} */
export function loadProfessionProgress() {
  const base = {};
  for (const t of PROFESSION_TREES) {
    base[t.id] = { level: 1, xp: 0, unlocked: [t.nodes[0]?.id].filter(Boolean) };
  }
  return { ...base, ...safeParse(localStorage.getItem(LS_PROF), {}) };
}

export function saveProfessionProgress(map) {
  localStorage.setItem(LS_PROF, JSON.stringify(map));
}

export function unlockProfessionNode(profId, nodeId) {
  const map = loadProfessionProgress();
  const p = map[profId] || { level: 1, xp: 0, unlocked: [] };
  if (!p.unlocked.includes(nodeId)) p.unlocked.push(nodeId);
  p.level = Math.max(p.level, p.unlocked.length);
  map[profId] = p;
  saveProfessionProgress(map);
  return p;
}

/**
 * Admin overrides for slot accept filters / labels.
 * @returns {Record<string, Partial<{ label: string, accepts: string[], enabled: boolean }>>}
 */
export function loadSlotAdminOverrides() {
  return safeParse(localStorage.getItem(LS_SLOT_ADMIN), {});
}

export function saveSlotAdminOverrides(map) {
  localStorage.setItem(LS_SLOT_ADMIN, JSON.stringify(map || {}));
}

export function getPaperdollSlots() {
  const ovr = loadSlotAdminOverrides();
  return ALL_PAPERDOLL_SLOTS.map((s) => {
    const o = ovr[s.id] || {};
    if (o.enabled === false) return null;
    return {
      ...s,
      label: o.label || s.label,
      accepts: o.accepts || s.accepts,
    };
  }).filter(Boolean);
}

/**
 * Add item to first free bag slot (icons resolved via iconResolve).
 * @param {{ id: string, name: string, icon?: string, iconUrl?: string, kind?: string, qty?: number, slotHint?: string }} item
 */
export function bagAdd(item) {
  const bag = loadBag();
  const qty = item.qty || 1;
  const normalized = enrichBagSlotIcon({ ...item, qty });
  // Stack same id
  for (let i = 0; i < bag.slots.length; i++) {
    const s = bag.slots[i];
    if (s && s.id === item.id) {
      s.qty = (s.qty || 1) + qty;
      if (!s.icon && normalized.icon) {
        s.icon = normalized.icon;
        s.iconUrl = normalized.iconUrl;
      }
      saveBag(bag);
      return { ok: true, index: i, stacked: true };
    }
  }
  const free = bag.slots.findIndex((s) => !s);
  if (free < 0) return { ok: false, full: true };
  bag.slots[free] = normalized;
  saveBag(bag);
  return { ok: true, index: free };
}

export function bagRemoveAt(index, qty = 1) {
  const bag = loadBag();
  const s = bag.slots[index];
  if (!s) return null;
  s.qty = (s.qty || 1) - qty;
  if (s.qty <= 0) bag.slots[index] = null;
  saveBag(bag);
  return s;
}

/** Seed demo bag if empty (production lab) — icons from CDN + lab minerals. */
export function ensureDemoBag() {
  const bag = loadBag();
  if (bag.slots.some(Boolean)) {
    // Repair missing icons on existing bag
    let dirty = false;
    for (let i = 0; i < bag.slots.length; i++) {
      const s = bag.slots[i];
      if (s && !s.icon && !s.iconUrl) {
        bag.slots[i] = enrichBagSlotIcon(s);
        dirty = true;
      }
    }
    if (dirty) saveBag(bag);
    return bag;
  }
  const demos = [
    {
      id: 't0-sword',
      name: 'Training Sword',
      kind: 'weapon',
      slotHint: 'mainHand',
      qty: 1
    },
    {
      id: 't0-wand',
      name: 'Apprentice Wand',
      kind: 'weapon',
      slotHint: 'mainHand',
      qty: 1
    },
    {
      id: 't0-tool',
      name: 'Field Pick',
      kind: 'tool',
      slotHint: 'mainHand',
      qty: 1
    },
    { id: 'mat-wood', name: 'Wood', kind: 'mat', qty: 12 },
    { id: 'mat-stone', name: 'Stone', kind: 'mat', qty: 8 },
    { id: 'mat-ore-chunk', name: 'Ore chunk', kind: 'mat', qty: 3 },
    {
      id: 'kit_body_a',
      name: 'Body kit A',
      kind: 'armour',
      slotHint: 'body',
      qty: 1
    }
  ];
  for (const d of demos) bagAdd(enrichBagSlotIcon(d));
  return loadBag();
}

/**
 * Ensure icon fields on a bag slot (used by ensureDemoBag + refresh).
 * @param {object} item
 */
export function enrichBagSlotIcon(item) {
  if (!item) return item;
  // Inline map (keep mainPanelSlots free of hard import cycles with iconResolve)
  const CDN = 'https://assets.grudge-studio.com/icons/496_rpg_icons';
  const LAB_STONE = './icons/dev-island/minerals/FD_Minerals_Stones.png';
  const byId = {
    't0-sword': `${CDN}/W_Sword001.png`,
    't0-wand': `${CDN}/W_Wand001.png`,
    't0-tool': `${CDN}/W_PickAxe001.png`,
    'mat-wood': `${CDN}/I_Wood01.png`,
    t0_wood: `${CDN}/I_Wood01.png`,
    'mat-stone': LAB_STONE,
    t0_stone: LAB_STONE,
    'mat-ore-chunk': `${CDN}/I_Coal.png`,
    kit_body_a: `${CDN}/A_Armour01.png`
  };
  const icon =
    item.iconUrl ||
    item.icon ||
    byId[item.id] ||
    (String(item.kind || '').includes('weapon')
      ? `${CDN}/W_Sword001.png`
      : String(item.kind || '').includes('tool')
        ? `${CDN}/W_PickAxe001.png`
        : String(item.kind || '').includes('armour')
          ? `${CDN}/A_Armour01.png`
          : `${CDN}/I_Bag.png`);
  return { ...item, icon, iconUrl: icon };
}

/**
 * Re-resolve icons for every bag slot (after catalog load).
 */
export function reenrichAllBagIcons() {
  const bag = loadBag();
  let n = 0;
  for (let i = 0; i < bag.slots.length; i++) {
    if (!bag.slots[i]) continue;
    const before = bag.slots[i].icon || bag.slots[i].iconUrl;
    bag.slots[i] = enrichBagSlotIcon(bag.slots[i]);
    if ((bag.slots[i].icon || bag.slots[i].iconUrl) !== before) n++;
  }
  saveBag(bag);
  return n;
}

export function itemFitsSlot(item, slotDef) {
  if (!item || !slotDef) return false;
  const kind = String(item.kind || item.slotType || '').toLowerCase();
  const hint = String(item.slotHint || item.equipSlot || '').toLowerCase();
  if (slotDef.accepts?.some((a) => kind.includes(a) || hint.includes(a) || a === kind)) return true;
  if (hint === slotDef.id.toLowerCase() || hint === slotDef.meshSlot) return true;
  return false;
}
