/**
 * CraftPix cast bar — under-crosshair cast progress for Warlords casting.
 * Textures: public/ui/craftpix/cast/{bg,fill,icon_frame}.png
 */
import { craftpixUrl } from './craftpixUi.js';

export class CastBar {
  /**
   * @param {HTMLElement} host HUD root
   */
  constructor(host) {
    this.host = host;
    this.el = document.createElement('div');
    this.el.className = 'castbar is-hidden';
    this.el.setAttribute('aria-hidden', 'true');
    this.el.innerHTML = `
      <div class="castbar__icon-wrap">
        <div class="castbar__icon-frame"></div>
        <div class="castbar__icon" data-cast-icon></div>
      </div>
      <div class="castbar__body">
        <div class="castbar__name" data-cast-name>Casting</div>
        <div class="castbar__track">
          <div class="castbar__bg"></div>
          <div class="castbar__fill-wrap">
            <div class="castbar__fill" data-cast-fill style="width:0%"></div>
          </div>
        </div>
        <div class="castbar__meta">
          <span data-cast-time>0.0s</span>
          <span data-cast-left></span>
        </div>
      </div>
    `;
    host.appendChild(this.el);

    // Apply CraftPix images via CSS vars (also set on host by applyCraftpixCssVars)
    this.el.style.setProperty('--cp-cast-bg', `url("${craftpixUrl('cast/bg.png')}")`);
    this.el.style.setProperty('--cp-cast-fill', `url("${craftpixUrl('cast/fill.png')}")`);
    this.el.style.setProperty('--cp-cast-icon', `url("${craftpixUrl('cast/icon_frame.png')}")`);

    this._name = this.el.querySelector('[data-cast-name]');
    this._fill = this.el.querySelector('[data-cast-fill]');
    this._time = this.el.querySelector('[data-cast-time]');
    this._left = this.el.querySelector('[data-cast-left]');
    this._icon = this.el.querySelector('[data-cast-icon]');
    this._visible = false;
  }

  /**
   * @param {{
   *   active?: boolean,
   *   label?: string,
   *   progress01?: number,
   *   duration?: number,
   *   remaining?: number,
   *   element?: string,
   *   interrupted?: boolean
   * }|null} state
   */
  setState(state) {
    if (!state || !state.active) {
      this.hide(state?.interrupted);
      return;
    }
    if (!this._visible) {
      this.el.classList.remove('is-hidden', 'is-interrupt');
      this.el.setAttribute('aria-hidden', 'false');
      this._visible = true;
    }
    const p = Math.max(0, Math.min(1, state.progress01 ?? 0));
    const pct = Math.round(p * 100);
    if (this._fill) this._fill.style.width = `${pct}%`;
    if (this._name) this._name.textContent = state.label || 'Casting';
    const dur = state.duration ?? 0;
    const rem = state.remaining ?? Math.max(0, dur * (1 - p));
    if (this._time) this._time.textContent = `${dur.toFixed(1)}s`;
    if (this._left) this._left.textContent = rem > 0.05 ? `${rem.toFixed(1)}s` : 'release';
    if (state.element) {
      this.el.dataset.element = state.element;
      if (this._icon) this._icon.dataset.element = state.element;
    }
  }

  hide(interrupted = false) {
    if (!this._visible && !interrupted) return;
    if (interrupted) {
      this.el.classList.add('is-interrupt');
      window.setTimeout(() => {
        this.el.classList.add('is-hidden');
        this.el.classList.remove('is-interrupt');
        this.el.setAttribute('aria-hidden', 'true');
        this._visible = false;
      }, 180);
    } else {
      this.el.classList.add('is-hidden');
      this.el.setAttribute('aria-hidden', 'true');
      this._visible = false;
    }
    if (this._fill) this._fill.style.width = '0%';
  }

  dispose() {
    this.el.remove();
  }
}
