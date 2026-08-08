/**
 * Simple bag for world-drop throw / pickup demo.
 * Drag item onto canvas → throw to mouse aim on terrain/ocean.
 */

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
    this.el.className = 'drop-bag';
    this.el.hidden = true;
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
    this.el.innerHTML = `
      <header class="drop-bag__head">
        <h3>Bag · throw</h3>
        <button type="button" class="drop-bag__close" data-close>×</button>
      </header>
      <p class="drop-bag__hint">Drag item onto world to throw · E pickup drops</p>
      <div class="drop-bag__grid" data-grid>
        ${this.items
          .map(
            (it) => `
          <div class="drop-bag__slot" draggable="true" data-id="${it.id}"
            style="--tier:${it.borderColor || '#9aa3ad'}"
            title="${it.name} T${it.tier}">
            <img src="${it.iconUrl || ''}" alt="" draggable="false" />
            <span class="drop-bag__qty">${it.qty || 1}</span>
            <span class="drop-bag__name">${it.name || it.id}</span>
          </div>`
          )
          .join('') || '<p class="drop-bag__empty">Empty — spawn drops from Showcase / Loot</p>'}
      </div>
    `;

    this.el.querySelector('[data-close]')?.addEventListener('click', () => this.setOpen(false));
    this.el.addEventListener('pointerdown', (e) => e.stopPropagation());

    this.el.querySelectorAll('.drop-bag__slot').forEach((slot) => {
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
