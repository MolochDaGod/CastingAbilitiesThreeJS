/**
 * MMO item / equipment RMB context menu (Main Panel + DropBag).
 *
 * WoW/Albion-style: Equip · Use · Split · Drop · Inspect · Deposit.
 * Does not steal canvas combat RMB focus — only bound on UI slots.
 *
 * @see docs/MAIN_PANEL_INVENTORY_SSOT.md · mainPanelSlots.js
 */

import {
  ALL_PAPERDOLL_SLOTS,
  bagAdd,
  bagRemoveAt,
  itemFitsSlot,
  loadBag,
  loadEquipMap,
  saveBag,
  saveEquipMap
} from './mainPanelSlots.js';
import { MAIN_PANEL_PROD } from './uiAssetCatalog.js';

/** @typedef {'bag'|'paperdoll'|'dropbag'} ItemContextSource */

/**
 * @typedef {object} ItemContextTarget
 * @property {ItemContextSource} source
 * @property {object|null} item
 * @property {number} [bagIndex]
 * @property {string} [slotId] paperdoll
 * @property {string} [dropId]
 */

/**
 * @typedef {object} ItemContextHandlers
 * @property {(msg: string) => void} [onToast]
 * @property {(item: object, slotDef: object, bagIndex?: number) => void|Promise<void>} [onEquip]
 * @property {(slotId: string) => void|Promise<void>} [onUnequip]
 * @property {(item: object) => void} [onUse]
 * @property {(item: object, clientX: number, clientY: number) => void} [onDropWorld]
 * @property {(item: object) => void|Promise<void>} [onDeposit]
 * @property {() => void} [onRefresh]
 * @property {(slotId: string) => void} [onOpenSlotPicker]
 */

let _menuEl = null;
let _open = false;

function ensureMenu() {
  if (_menuEl) return _menuEl;
  const el = document.createElement('div');
  el.id = 'item-ctx-menu';
  el.className = 'item-ctx-menu';
  el.hidden = true;
  el.setAttribute('role', 'menu');
  document.body.appendChild(el);
  _menuEl = el;

  // Close on outside click / Esc
  document.addEventListener(
    'pointerdown',
    (e) => {
      if (!_open) return;
      if (el.contains(/** @type {Node} */ (e.target))) return;
      closeItemContextMenu();
    },
    true
  );
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeItemContextMenu();
  });
  return el;
}

export function closeItemContextMenu() {
  _open = false;
  if (_menuEl) {
    _menuEl.hidden = true;
    _menuEl.innerHTML = '';
  }
}

/**
 * Build actions for target.
 * @param {ItemContextTarget} target
 * @param {ItemContextHandlers} h
 */
function buildActions(target, h) {
  const item = target.item;
  /** @type {{ id: string, label: string, danger?: boolean, disabled?: boolean, run: () => void|Promise<void> }[]} */
  const actions = [];

  if (!item) {
    if (target.source === 'paperdoll' && target.slotId) {
      actions.push({
        id: 'pick',
        label: 'Choose from bag…',
        run: () => h.onOpenSlotPicker?.(target.slotId)
      });
    }
    return actions;
  }

  const name = item.name || item.id || 'Item';

  // Equip
  if (target.source === 'bag' || target.source === 'dropbag') {
    const slot = bestSlotForItem(item);
    actions.push({
      id: 'equip',
      label: slot ? `Equip → ${slot.label}` : 'Equip (no matching slot)',
      disabled: !slot,
      run: async () => {
        if (!slot) return;
        if (target.source === 'bag' && target.bagIndex != null) {
          await h.onEquip?.(item, slot, target.bagIndex);
        } else {
          // DropBag: add to main bag first then equip
          const r = bagAdd({ ...item, qty: 1 });
          if (r.ok) await h.onEquip?.(item, slot, r.index);
          else h.onToast?.('Main bag full');
        }
      }
    });
  }

  // Unequip paperdoll
  if (target.source === 'paperdoll' && target.slotId) {
    actions.push({
      id: 'unequip',
      label: 'Unequip',
      run: async () => {
        await h.onUnequip?.(target.slotId);
      }
    });
    actions.push({
      id: 'swap',
      label: 'Replace from bag…',
      run: () => h.onOpenSlotPicker?.(target.slotId)
    });
  }

  // Use (mats/consumable heuristics)
  const kind = String(item.kind || '').toLowerCase();
  if (/consumable|food|potion|use|mat|material/.test(kind) || item.useable) {
    actions.push({
      id: 'use',
      label: 'Use',
      run: () => h.onUse?.(item)
    });
  }

  // Split stack
  if ((item.qty || 1) > 1 && target.source === 'bag' && target.bagIndex != null) {
    actions.push({
      id: 'split',
      label: 'Split stack (½)',
      run: () => {
        splitBagStack(target.bagIndex);
        h.onToast?.(`Split ${name}`);
        h.onRefresh?.();
      }
    });
  }

  // Drop to world
  if (h.onDropWorld && (target.source === 'bag' || target.source === 'dropbag')) {
    actions.push({
      id: 'drop',
      label: 'Drop to world',
      danger: true,
      run: () => {
        const ix = target.bagIndex;
        if (target.source === 'bag' && ix != null) {
          const removed = bagRemoveAt(ix, 1);
          if (removed) h.onDropWorld(removed, window.innerWidth / 2, window.innerHeight / 2);
        } else {
          h.onDropWorld({ ...item, qty: 1 }, window.innerWidth / 2, window.innerHeight / 2);
        }
        h.onRefresh?.();
      }
    });
  }

  // Deposit account bag (Railway via craft)
  if (h.onDeposit) {
    actions.push({
      id: 'deposit',
      label: 'Deposit to account bag…',
      run: async () => {
        await h.onDeposit?.(item);
      }
    });
  }

  actions.push({
    id: 'inspect',
    label: 'Inspect',
    run: () => {
      const lines = [
        name,
        `id: ${item.id || '—'}`,
        `kind: ${item.kind || '—'}`,
        `tier: ${item.tier ?? '—'}`,
        `qty: ${item.qty || 1}`,
        item.slotHint ? `slot: ${item.slotHint}` : null
      ].filter(Boolean);
      h.onToast?.(lines.join(' · '));
      console.info('[ItemInspect]', item);
    }
  });

  actions.push({
    id: 'craft',
    label: 'Open Craft SSOT ↗',
    run: () => {
      window.open(MAIN_PANEL_PROD.craft, '_blank', 'noopener');
    }
  });

  return actions;
}

/**
 * @param {object} item
 */
export function bestSlotForItem(item) {
  const slots = ALL_PAPERDOLL_SLOTS;
  // Prefer explicit slotHint
  const hint = String(item.slotHint || item.equipSlot || '').toLowerCase();
  if (hint) {
    const exact = slots.find((s) => s.id.toLowerCase() === hint || s.meshSlot === hint);
    if (exact && itemFitsSlot(item, exact)) return exact;
  }
  return slots.find((s) => itemFitsSlot(item, s)) || null;
}

/**
 * @param {number} bagIndex
 */
function splitBagStack(bagIndex) {
  const bag = loadBag();
  const s = bag.slots[bagIndex];
  if (!s || (s.qty || 1) < 2) return;
  const half = Math.floor((s.qty || 1) / 2);
  s.qty = (s.qty || 1) - half;
  const free = bag.slots.findIndex((x) => !x);
  if (free < 0) {
    s.qty += half; // undo
    return;
  }
  bag.slots[free] = { ...s, qty: half };
  saveBag(bag);
}

/**
 * Open context menu at pointer.
 * @param {MouseEvent|PointerEvent} event
 * @param {ItemContextTarget} target
 * @param {ItemContextHandlers} handlers
 */
export function openItemContextMenu(event, target, handlers = {}) {
  event.preventDefault();
  event.stopPropagation();

  const el = ensureMenu();
  const actions = buildActions(target, handlers);
  if (!actions.length) {
    closeItemContextMenu();
    return;
  }

  const title = target.item?.name || target.slotId || 'Slot';
  el.innerHTML = `
    <div class="item-ctx-menu__head">${escapeHtml(title)}</div>
    <ul class="item-ctx-menu__list">
      ${actions
        .map(
          (a) => `
        <li>
          <button type="button" class="item-ctx-menu__item ${a.danger ? 'is-danger' : ''}"
            data-act="${a.id}" ${a.disabled ? 'disabled' : ''} role="menuitem">
            ${escapeHtml(a.label)}
          </button>
        </li>`
        )
        .join('')}
    </ul>
  `;

  el.hidden = false;
  _open = true;

  // Position — keep on screen
  const x = event.clientX;
  const y = event.clientY;
  el.style.left = '0px';
  el.style.top = '0px';
  const rect = el.getBoundingClientRect();
  const left = Math.min(x, window.innerWidth - rect.width - 8);
  const top = Math.min(y, window.innerHeight - rect.height - 8);
  el.style.left = `${Math.max(8, left)}px`;
  el.style.top = `${Math.max(8, top)}px`;

  el.querySelectorAll('[data-act]').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = btn.getAttribute('data-act');
      const act = actions.find((a) => a.id === id);
      closeItemContextMenu();
      try {
        await act?.run?.();
        handlers.onRefresh?.();
      } catch (err) {
        handlers.onToast?.(err?.message || String(err));
      }
    });
  });
}

/**
 * Bind RMB on a slot element.
 * @param {HTMLElement} el
 * @param {() => ItemContextTarget} getTarget
 * @param {ItemContextHandlers} handlers
 */
export function bindItemContextMenu(el, getTarget, handlers) {
  if (!el) return;
  el.addEventListener('contextmenu', (e) => {
    openItemContextMenu(e, getTarget(), handlers);
  });
}

/**
 * Unequip paperdoll slot → bag.
 * @param {string} slotId
 */
export function unequipPaperdollSlot(slotId) {
  const map = loadEquipMap();
  const item = map[slotId];
  if (!item) return null;
  bagAdd(item);
  delete map[slotId];
  saveEquipMap(map);
  return item;
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
