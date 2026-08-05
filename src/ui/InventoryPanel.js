import { EQUIP_SLOTS, WEAPON_SLOTS } from '../config/assets.js';
import { settings } from '../config/settings.js';

/**
 * Inventory + equipment panel (I) — edit Toon RTS mesh slots and ability outputs.
 * Plain DOM; does not steal path-draw (pointer-events only on panel).
 */
export class InventoryPanel {
  /**
   * @param {{
   *   character: import('../animation/CharacterController.js').CharacterController,
   *   onToast?: (msg: string) => void,
   *   onEquip?: () => void
   * }} opts
   */
  constructor(opts) {
    this.character = opts.character;
    this.onToast = opts.onToast || (() => {});
    this.onEquip = opts.onEquip || (() => {});
    this.open = false;

    this.el = document.createElement('div');
    this.el.id = 'inventory-panel';
    this.el.className = 'inv-panel';
    this.el.hidden = true;
    document.body.appendChild(this.el);

    this._renderShell();
  }

  _renderShell() {
    this.el.innerHTML = `
      <header class="inv-panel__head">
        <div>
          <h2>Character &amp; Abilities</h2>
          <p class="inv-panel__sub">Toon RTS mesh equip · ability outputs</p>
        </div>
        <button type="button" class="inv-panel__close" data-close aria-label="Close">×</button>
      </header>
      <div class="inv-panel__tabs">
        <button type="button" class="inv-tab is-active" data-tab="equip">Equipment</button>
        <button type="button" class="inv-tab" data-tab="abilities">Ability outputs</button>
      </div>
      <div class="inv-panel__body">
        <section class="inv-section" data-panel="equip"></section>
        <section class="inv-section" data-panel="abilities" hidden></section>
      </div>
      <footer class="inv-panel__foot">
        <kbd>I</kbd> toggle · mesh visibility only (no body swap) · <kbd>F</kbd> weapon attack
      </footer>
    `;

    this.el.querySelector('[data-close]').addEventListener('click', () => this.setOpen(false));
    this.el.querySelectorAll('.inv-tab').forEach((btn) => {
      btn.addEventListener('click', () => this._setTab(btn.dataset.tab));
    });

    // Stop pointer events from reaching the canvas
    this.el.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.el.addEventListener('wheel', (e) => e.stopPropagation());
  }

  _setTab(tab) {
    this.el.querySelectorAll('.inv-tab').forEach((b) => {
      b.classList.toggle('is-active', b.dataset.tab === tab);
    });
    this.el.querySelectorAll('.inv-section').forEach((s) => {
      s.hidden = s.dataset.panel !== tab;
    });
  }

  toggle() {
    this.setOpen(!this.open);
  }

  setOpen(open) {
    this.open = !!open;
    this.el.hidden = !this.open;
    if (this.open) this.refresh();
  }

  refresh() {
    this._fillEquip();
    this._fillAbilities();
  }

  _fillEquip() {
    const host = this.el.querySelector('[data-panel="equip"]');
    if (!host) return;

    const c = this.character;
    const presets = c.presets || [];
    const catalog = c.equipment?.getCatalogSummary?.() || {};

    const presetOpts = presets
      .map(
        (p) =>
          `<option value="${p.id}" ${p.id === c.presetId ? 'selected' : ''}>${p.label || p.id}</option>`
      )
      .join('');

    const slotRows = EQUIP_SLOTS.map((slot) => {
      const info = catalog[slot];
      if (!info) return '';
      const opts = [
        `<option value="none">— none —</option>`,
        ...info.variants.map(
          (v) =>
            `<option value="${v}" ${info.selected === v ? 'selected' : ''}>${v === '_default' ? 'default' : v}</option>`
        )
      ].join('');
      const weaponNote = WEAPON_SLOTS.includes(slot) ? ' (exclusive weapon)' : '';
      return `
        <label class="inv-row">
          <span>${slot}${weaponNote}</span>
          <select data-slot="${slot}">${opts}</select>
        </label>`;
    }).join('');

    host.innerHTML = `
      <label class="inv-row">
        <span>Class preset</span>
        <select data-preset>${presetOpts}</select>
      </label>
      <p class="inv-hint">Pack: <b data-pack>${c.animPackId}</b> · matched mesh pieces re-ground feet after equip.</p>
      <div class="inv-slots">${slotRows || '<p class="inv-hint">No equippable slots found on kit.</p>'}</div>
      <button type="button" class="inv-btn" data-attack>Weapon attack (F)</button>
    `;

    host.querySelector('[data-preset]')?.addEventListener('change', (e) => {
      const id = e.target.value;
      const report = c.applyPreset(id);
      this.onToast(`Equipped ${id}${report?.missing?.length ? ` (missing ${report.missing.length})` : ''}`);
      this.onEquip();
      this.refresh();
    });

    host.querySelectorAll('[data-slot]').forEach((sel) => {
      sel.addEventListener('change', () => {
        const slot = sel.dataset.slot;
        const variant = sel.value;
        c.equipment?.setSlot(slot, variant === 'none' ? null : variant);
        c._reGroundAfterEquip?.();
        c.ik?.setBones(c.equipment.findBones());
        this.onToast(`${slot} → ${variant}`);
        this.onEquip();
      });
    });

    host.querySelector('[data-attack]')?.addEventListener('click', () => {
      if (c.playWeaponAttack()) this.onToast('Weapon attack');
      else this.onToast('No attack clip loaded');
    });
  }

  _fillAbilities() {
    const host = this.el.querySelector('[data-panel="abilities"]');
    if (!host) return;

    const g = settings.global;
    const fields = [
      ['speed', 'Travel speed', 0.1, 3, 0.05],
      ['lifetime', 'Lifetime', 0.1, 3, 0.05],
      ['particleSize', 'Particle size', 0.1, 3, 0.05],
      ['particleCount', 'Particle count', 0.1, 3, 0.05],
      ['emissionRate', 'Emission rate', 0.1, 3, 0.05],
      ['glow', 'Glow / bloom', 0, 3, 0.05],
      ['explosionIntensity', 'Explosion', 0, 3, 0.05],
      ['distortion', 'Distortion', 0, 3, 0.05],
      ['cameraShake', 'Camera shake', 0, 3, 0.05],
      ['lightIntensity', 'Light intensity', 0, 3, 0.05]
    ];

    host.innerHTML = `
      <p class="inv-hint">Global ability outputs (same SSOT as VFX editor <kbd>G</kbd>).</p>
      <div class="inv-sliders">
        ${fields
          .map(
            ([key, label, min, max, step]) => `
          <label class="inv-row inv-row--slider">
            <span>${label} <b data-val="${key}">${Number(g[key]).toFixed(2)}</b></span>
            <input type="range" min="${min}" max="${max}" step="${step}" value="${g[key]}" data-g="${key}" />
          </label>`
          )
          .join('')}
      </div>
      <button type="button" class="inv-btn inv-btn--ghost" data-reset-g>Reset ability outputs</button>
    `;

    host.querySelectorAll('[data-g]').forEach((input) => {
      input.addEventListener('input', () => {
        const key = input.dataset.g;
        g[key] = Number(input.value);
        const val = host.querySelector(`[data-val="${key}"]`);
        if (val) val.textContent = Number(g[key]).toFixed(2);
      });
    });

    host.querySelector('[data-reset-g]')?.addEventListener('click', () => {
      for (const [key] of fields) g[key] = 1.0;
      this.onToast('Ability outputs reset');
      this._fillAbilities();
    });
  }

  dispose() {
    this.el.remove();
  }
}
