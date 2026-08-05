import { ELEMENTS, ELEMENT_META, MODES, MODE_META } from '../config/settings.js';
import { ELEMENT_SIGILS } from './glyphs.js';

const SKILL_LABELS = ['Fire Bolt', 'Water Lash', 'Earth Spike', 'Blade'];

/**
 * HUD: DRC combat action bar (default) + sandbox mode switch + stats.
 * Plain DOM — no framework.
 */
export class HUD {
  constructor(root) {
    this.root = root;
    this.onSelect = null;
    this.onMode = null;
    this.onSkillSlot = null;
    this._toastTimer = 0;
    this._statsAccumulator = 0;
    this._frames = 0;
    this._fps = 0;
    this._drcSession = 'combat';

    root.innerHTML = `
      <div class="hud__panel hud__title">
        Grudge Casting · Toon RTS
        <span data-blurb>DRC combat · Bip001 · weapon skills</span>
      </div>

      <div class="hud__panel hud__stats">
        <div>FPS <b data-stat="fps">—</b></div>
        <div>STA <b data-stat="stamina">100</b></div>
        <div>Particles <b data-stat="particles">0</b></div>
        <div>Draw <b data-stat="calls">0</b></div>
      </div>

      <div class="hud__panel hud__help">
        <div><strong>Combat (default)</strong></div>
        <div><kbd>WASD</kbd> move · <kbd>Shift</kbd> sprint · TPS camera</div>
        <div><kbd>1</kbd>–<kbd>4</kbd> weapon skills · <kbd>F</kbd> blade strike</div>
        <div><kbd>Q</kbd> equip / inventory · <kbd>I</kbd> panel</div>
        <div><kbd>C</kbd> clear VFX · <kbd>P</kbd> pause · <kbd>G</kbd> editor</div>
        <div style="margin-top:6px;opacity:.75">Sandbox: hold LMB draw path to free-cast</div>
      </div>

      <div class="hud__modes">
        ${MODES.map((mode) => {
          const meta = MODE_META[mode];
          return `
            <div class="mode-card" data-mode="${mode}">
              <span class="mode-card__glyph">${meta.glyph}</span>${meta.label}
            </div>`;
        }).join('')}
        <span class="hud__modes-key">M</span>
      </div>

      <div class="hud__actionbar" data-actionbar>
        ${ELEMENTS.map((element, index) => {
          const meta = ELEMENT_META[element];
          return `
            <div class="action-slot" data-element="${element}" data-slot="${index}" style="--accent:${meta.accent}">
              <div class="action-slot__cd" data-cd></div>
              <div class="action-slot__key">${index + 1}</div>
              <div class="action-slot__glyph">${ELEMENT_SIGILS[element] ?? meta.glyph}</div>
              <div class="action-slot__label">${SKILL_LABELS[index] || meta.label}</div>
            </div>`;
        }).join('')}
      </div>

      <div class="hud__toast" data-toast></div>
    `;

    this.cards = new Map();
    for (const card of root.querySelectorAll('.action-slot')) {
      this.cards.set(card.dataset.element, card);
      card.addEventListener('pointerdown', (event) => {
        event.stopPropagation();
        this.onSelect?.(card.dataset.element);
        this.onSkillSlot?.(Number(card.dataset.slot));
      });
    }

    this.modeCards = new Map();
    for (const card of root.querySelectorAll('.mode-card')) {
      this.modeCards.set(card.dataset.mode, card);
      card.addEventListener('pointerdown', (event) => {
        event.stopPropagation();
        this.onMode?.(card.dataset.mode);
      });
    }

    this.stats = {
      fps: root.querySelector('[data-stat="fps"]'),
      stamina: root.querySelector('[data-stat="stamina"]'),
      particles: root.querySelector('[data-stat="particles"]'),
      calls: root.querySelector('[data-stat="calls"]')
    };
    this.help = root.querySelector('.hud__help');
    this.toast = root.querySelector('[data-toast]');
    this.blurb = root.querySelector('[data-blurb]');
    this.actionbar = root.querySelector('[data-actionbar]');
    this.elements = this.actionbar;
  }

  setElement(element) {
    for (const [key, card] of this.cards) {
      card.classList.toggle('is-active', key === element);
    }
  }

  setMode(mode) {
    for (const [key, card] of this.modeCards) {
      card.classList.toggle('is-active', key === mode);
    }
    const meta = MODE_META[mode];
    if (!meta) return;
    if (this._drcSession !== 'combat') this.blurb.textContent = meta.blurb;
  }

  setDrcSession(session) {
    this._drcSession = session;
    if (session === 'combat') {
      this.blurb.textContent = 'DRC combat · WASD · 1–4 skills · TPS · F strike';
      this.actionbar?.classList.remove('is-dimmed');
      let i = 0;
      for (const card of this.cards.values()) {
        const lab = card.querySelector('.action-slot__label');
        if (lab && SKILL_LABELS[i]) lab.textContent = SKILL_LABELS[i];
        i++;
      }
    } else {
      this.blurb.textContent = 'Equip · I inventory · mesh loadout';
      this.actionbar?.classList.add('is-dimmed');
    }
  }

  setCombatHud(cd01Fn, stamina) {
    if (this.stats.stamina && stamina != null) {
      this.stats.stamina.textContent = String(Math.round(stamina));
    }
    if (!cd01Fn) return;
    for (const card of this.cards.values()) {
      const slot = Number(card.dataset.slot);
      const cd = cd01Fn(slot);
      const el = card.querySelector('[data-cd]');
      if (el) el.style.setProperty('--cd', String(cd));
      card.classList.toggle('is-cooling', cd > 0.02);
    }
  }

  toggleHelp() {
    this.help.classList.toggle('is-hidden');
  }

  showToast(message, duration = 1400) {
    this.toast.textContent = message;
    this.toast.classList.add('is-visible');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => this.toast.classList.remove('is-visible'), duration);
  }

  update(dt, collect) {
    this._frames++;
    this._statsAccumulator += dt;
    if (this._statsAccumulator < 0.4) return;

    this._fps = Math.round(this._frames / this._statsAccumulator);
    this._frames = 0;
    this._statsAccumulator = 0;

    const info = collect();
    this.stats.fps.textContent = this._fps;
    this.stats.particles.textContent = info.particles;
    this.stats.calls.textContent = info.calls;
    if (info.stamina != null && this.stats.stamina) {
      this.stats.stamina.textContent = String(Math.round(info.stamina));
    }
    if (info.cooldown01 && this._drcSession === 'combat') {
      this.setCombatHud(info.cooldown01, info.stamina);
    }
  }
}

/** Boot screen helper. */
export class LoadingScreen {
  constructor() {
    this.element = document.getElementById('loader');
    this.fill = document.getElementById('loader-fill');
    this.status = document.getElementById('loader-status');
  }

  setProgress(ratio, message) {
    this.fill.style.width = `${Math.round(Math.min(1, Math.max(0, ratio)) * 100)}%`;
    if (message) this.status.textContent = message;
  }

  hide() {
    this.setProgress(1);
    setTimeout(() => this.element.classList.add('is-hidden'), 220);
  }

  fail(message) {
    this.status.textContent = message;
    this.status.style.color = '#ff7a6a';
  }
}
