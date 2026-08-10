/**
 * Lab bag for world-drop throw / pickup + harvest loot.
 * Skin: Warlords miniinventory.png (9×4 + hotbar 1–10 chrome).
 *
 * @see docs/WARLORDS_DEV_UI_SSOT.md · warlordsUiSkin.js
 */

import { MINI_INV } from './warlordsUiSkin.js';
import './dropBag.css';
import './warlords-dev-ui.css';

const STORAGE = 'casting.lab.dropBag.v1';

export class DropBag {
  /**
   * @param {{
   *   onToast?: (s: string) => void,
   *   onThrow?: (item: object, clientX: number, clientY: number) => void
   * }} opts
   */
  constructor(opts = {}) {
    this.onToast = opts.onToast || (() => {});
    this.onThrow = opts.onThrow || (() => {});
    /** @type {object[]} */
    this.items = this._load();
    this.open = false;

    this.el = document.createElement('div');
    this.el.id = 'drop-bag';
    this.el.className = 'drop-bag wl-mini-inv';
    this.el.hidden = true;
    this.el.setAttribute('aria-label', 'Mini inventory');
    document.body.appendChild(this.el);
    this._render();
  }

  _load() {
    try {
      const raw = localStorage.getItem(STORAGE);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  _save() {
    localStorage.setItem(STORAGE, JSON.stringify(this.items));
  }

  setOpen(on) {
    this.open = !!on;
    this.el.hidden = !this.open;
    if (this.open) this._render();
  }

  toggle() {
    this.setOpen(!this.open);
  }

  /**
   * @param {object} item bag item
   */
  add(item) {
    if (!item) return;
    const existing = this.items.find((x) => x.id === item.id && x.tier === item.tier);
    if (existing) existing.qty = (existing.qty || 1) + (item.qty || 1);
    else this.items.push({ ...item, qty: item.qty || 1 });
    this._save();
    this._render();
  }

  /**
   * Remove one qty; returns item or null.
   * @param {string} id
   */
  takeOne(id) {
    const i = this.items.findIndex((x) => x.id === id);
    if (i < 0) return null;
    const it = this.items[i];
    it.qty = (it.qty || 1) - 1;
    const out = { ...it, qty: 1 };
    if (it.qty <= 0) this.items.splice(i, 1);
    this._save();
    this._render();
    return out;
  }

  _render() {
    const bagSlots = MINI_INV.bagSlots;
    const hotN = MINI_INV.hotbarSlots;
    const cells = [];
    for (let i = 0; i < bagSlots; i++) {
      const it = this.items[i];
      if (it) {
        cells.push(`
          <div class="drop-bag__slot" draggable="true" data-id="${it.id}"
            style="--tier:${it.borderColor || '#c9a87a'}"
            title="${escapeAttr(it.name || it.id)} · T${it.tier ?? 0} ×${it.qty || 1}">
            ${it.iconUrl ? `<img src="${escapeAttr(it.iconUrl)}" alt="" draggable="false" />` : '<span class="drop-bag__name">' + escapeHtml(it.name || '?') + '</span>'}
            <span class="drop-bag__qty">${it.qty || 1}</span>
          </div>`);
      } else {
        cells.push(`<div class="drop-bag__slot drop-bag__slot--empty" data-empty="${i}" title="Empty"></div>`);
      }
    }

    const hotbar = Array.from({ length: hotN }, (_, i) => {
      const n = i + 1;
      // First 10 bag items can mirror as hotbar preview (visual only — combat bar stays DRC)
      const it = this.items[i];
      return `
        <div class="drop-bag__hotbar-slot" data-n="${n}" title="${it ? escapeAttr(it.name) : 'Hotbar ' + n}">
          ${it?.iconUrl ? `<img src="${escapeAttr(it.iconUrl)}" alt="" draggable="false" style="width:70%;height:70%;object-fit:contain" />` : ''}
        </div>`;
    }).join('');

    this.el.innerHTML = `
      <header class="drop-bag__head">
        <h3>Bag · harvest loot</h3>
        <button type="button" class="drop-bag__close" data-close aria-label="Close">×</button>
      </header>
      <p class="drop-bag__hint">Drag onto world to throw · F pickup · harvest fills bag · 9×4 miniinventory</p>
      <div class="drop-bag__grid" data-grid>
        ${cells.join('') || '<p class="drop-bag__empty">Empty — harvest nodes or spawn loot (L)</p>'}
      </div>
      <div class="drop-bag__hotbar" data-hotbar aria-hidden="true">
        ${hotbar}
      </div>
    `;

    this.el.querySelector('[data-close]')?.addEventListener('click', () => this.setOpen(false));
    this.el.addEventListener('pointerdown', (e) => e.stopPropagation());

    this.el.querySelectorAll('.drop-bag__slot[draggable="true"]').forEach((slot) => {
      slot.addEventListener('dragstart', (e) => {
        e.dataTransfer?.setData('text/drop-item-id', slot.dataset.id || '');
        e.dataTransfer.effectAllowed = 'copy';
        slot.classList.add('is-dragging');
      });
      slot.addEventListener('dragend', () => slot.classList.remove('is-dragging'));
    });
  }

  /**
   * Call from canvas dragover/drop.
   * @param {DragEvent} event
   */
  handleCanvasDrop(event) {
    const id = event.dataTransfer?.getData('text/drop-item-id');
    if (!id) return false;
    const item = this.takeOne(id);
    if (!item) return false;
    this.onThrow(item, event.clientX, event.clientY);
    return true;
  }

  dispose() {
    this.el.remove();
  }
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeAttr(s) {
  return escapeHtml(s).replace(/"/g, '&quot;');
}
