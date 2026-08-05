import { ELEMENTS, ELEMENT_META, MODES, MODE_META } from '../config/settings.js';
import { ELEMENT_SIGILS } from './glyphs.js';

/**
 * Heads-up display: mode switch, element selector, controls, live stats and
 * toasts.
 *
 * Plain DOM — no framework. The switches are the only interactive parts; they
 * mirror the keyboard shortcuts and report back through `onSelect` / `onMode`.
 */
export class HUD {
  constructor(root) {
    this.root = root;
    this.onSelect = null;
    this.onMode = null;
    this._toastTimer = 0;
    this._statsAccumulator = 0;
    this._frames = 0;
    this._fps = 0;

    root.innerHTML = `
      <div class="hud__panel hud__title">
        Casting Abilities
        <span data-blurb>Grudge6 · draw a path · release to cast</span>
      </div>

      <div class="hud__panel hud__stats">
        <div>FPS <b data-stat="fps">—</b></div>
        <div>Particles <b data-stat="particles">0</b></div>
        <div>Draw calls <b data-stat="calls">0</b></div>
        <div>Abilities <b data-stat="abilities">0</b></div>
      </div>

      <div class="hud__panel hud__help">
        <div><strong>Hold left mouse</strong> — draw a path on the ground</div>
        <div><strong>Release</strong> — cast the selected element</div>
        <div><strong>Right drag</strong> — orbit the camera</div>
        <div><strong>Scroll</strong> — zoom in / out</div>
        <div style="margin-top:6px">
          <kbd>1</kbd><kbd>2</kbd><kbd>3</kbd><kbd>4</kbd> elements &nbsp;
          <kbd>Q</kbd><kbd>E</kbd> cycle
        </div>
        <div><kbd>G</kbd> editor &nbsp; <kbd>C</kbd> clear &nbsp; <kbd>P</kbd> pause &nbsp; <kbd>H</kbd> hide</div>
        <div><kbd>T</kbd> sit / stand &nbsp; <kbd>M</kbd> cast / walk</div>
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

      <div class="hud__elements">
        ${ELEMENTS.map((element, index) => {
          const meta = ELEMENT_META[element];
          return `
            <div class="element-card" data-element="${element}" style="--accent:${meta.accent}">
              <div class="element-card__key">${index + 1}</div>
              <div class="element-card__glyph">${ELEMENT_SIGILS[element] ?? meta.glyph}</div>
              <div class="element-card__label">${meta.label}</div>
            </div>`;
        }).join('')}
      </div>

      <div class="hud__toast" data-toast></div>
    `;

    this.cards = new Map();
    for (const card of root.querySelectorAll('.element-card')) {
      this.cards.set(card.dataset.element, card);
      card.addEventListener('pointerdown', (event) => {
        event.stopPropagation();
        this.onSelect?.(card.dataset.element);
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
      particles: root.querySelector('[data-stat="particles"]'),
      calls: root.querySelector('[data-stat="calls"]'),
      abilities: root.querySelector('[data-stat="abilities"]')
    };
    this.help = root.querySelector('.hud__help');
    this.toast = root.querySelector('[data-toast]');
    this.blurb = root.querySelector('[data-blurb]');
    this.elements = root.querySelector('.hud__elements');
  }

  setElement(element) {
    for (const [key, card] of this.cards) {
      card.classList.toggle('is-active', key === element);
    }
    const meta = ELEMENT_META[element];
    if (meta) this.showToast(`${meta.hint} selected`);
  }

  /** Reflect the interaction mode. Walk mode dims the (unused) element picker. */
  setMode(mode) {
    for (const [key, card] of this.modeCards) {
      card.classList.toggle('is-active', key === mode);
    }
    const meta = MODE_META[mode];
    if (!meta) return;
    this.blurb.textContent = meta.blurb;
    this.elements.classList.toggle('is-dimmed', mode !== 'casting');
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

  /**
   * @param {number} dt
   * @param {() => {particles:number, calls:number, abilities:number}} collect
   *   Called only when the readout actually refreshes, so gathering the numbers
   *   (which means walking the particle pools) stays off the hot path.
   */
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
    this.stats.abilities.textContent = info.abilities;
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
