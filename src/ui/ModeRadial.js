/**
 * Hold-Q mode radial + Hold-R tool radial (DOM, Open ModeRadial / RadialMenu parity).
 */
import { MODE_SWITCH_RADIAL, HARVEST_TOOL_RADIAL, MODE_LABEL } from '../combat/playerActivity.js';
import './modeRadial.css';

export class ModeRadial {
  constructor() {
    this.el = document.createElement('div');
    this.el.className = 'mode-radial';
    this.el.hidden = true;
    this.el.setAttribute('role', 'dialog');
    document.body.appendChild(this.el);

    /** @type {'none'|'mode'|'tool'} */
    this.kind = 'none';
    /** @type {'combat'|'harvest'} */
    this.current = 'combat';
    /** @type {string|null} */
    this.aimId = null;
    this._toolId = 'pick';
  }

  /**
   * @param {{
   *   kind: 'mode'|'tool',
   *   current: 'combat'|'harvest',
   *   aimId?: string|null,
   *   toolId?: string
   * }} state
   */
  show(state) {
    this.kind = state.kind;
    this.current = state.current || 'combat';
    this.aimId = state.aimId ?? null;
    if (state.toolId) this._toolId = state.toolId;
    this.el.hidden = false;
    this._render();
  }

  hide() {
    this.kind = 'none';
    this.el.hidden = true;
    this.el.innerHTML = '';
  }

  /**
   * Pointer position → aim id (mode: up/down · tool: angle wedges).
   * @param {number} clientX
   * @param {number} clientY
   * @returns {string|null}
   */
  aimFromPointer(clientX, clientY) {
    const cx = window.innerWidth * 0.5;
    const cy = window.innerHeight * 0.5;
    if (this.kind === 'mode') {
      const dy = clientY - cy;
      // mouse up (negative dy) = combat
      this.aimId = dy < -12 ? 'mode_combat' : dy > 12 ? 'mode_harvest' : this.aimId;
      if (!this.aimId) {
        this.aimId = this.current === 'harvest' ? 'mode_harvest' : 'mode_combat';
      }
      this._render();
      return this.aimId;
    }
    if (this.kind === 'tool') {
      const opts = HARVEST_TOOL_RADIAL;
      const n = opts.length;
      const ang = (Math.atan2(clientY - cy, clientX - cx) * 180) / Math.PI;
      const slice = 360 / n;
      let a = (ang + 90 + 360) % 360;
      const idx = Math.floor(a / slice) % n;
      this.aimId = opts[idx]?.id || null;
      this._render();
      return this.aimId;
    }
    return null;
  }

  getAimId() {
    return this.aimId;
  }

  _render() {
    if (this.kind === 'mode') {
      const aim = this.aimId || (this.current === 'harvest' ? 'mode_harvest' : 'mode_combat');
      this.el.innerHTML = `
        <div class="mode-radial-ring">
          <div class="mode-radial-wedge mode-radial-up ${aim === 'mode_combat' ? 'hot' : ''} ${
            this.current === 'combat' ? 'active' : ''
          }">
            <span class="mode-radial-icon">⚔</span>
            <span class="mode-radial-label">Combat</span>
            <span class="mode-radial-hint">mouse up</span>
          </div>
          <div class="mode-radial-core">
            <span class="mode-radial-core-title">Q hold</span>
            <span class="mode-radial-core-sub">${MODE_LABEL[this.current] || this.current}</span>
          </div>
          <div class="mode-radial-wedge mode-radial-down ${aim === 'mode_harvest' ? 'hot' : ''} ${
            this.current === 'harvest' ? 'active' : ''
          }">
            <span class="mode-radial-icon">🪓</span>
            <span class="mode-radial-label">Harvest</span>
            <span class="mode-radial-hint">mouse down</span>
          </div>
        </div>
        <p class="mode-radial-foot">Release Q to confirm · tap Q toggles mode</p>
      `;
      return;
    }

    // Tool wheel
    const opts = HARVEST_TOOL_RADIAL;
    const n = opts.length;
    const wedges = opts
      .map((o, i) => {
        const rot = (360 / n) * i - 90;
        const hot = this.aimId === o.id || (!this.aimId && o.id === this._toolId);
        return `
          <div class="tool-radial-wedge ${hot ? 'hot' : ''}" style="--rot:${rot}deg">
            <span class="tool-radial-inner" style="--irot:${-rot}deg">
              <b>${o.glyph}</b>
              <small>${o.label}</small>
            </span>
          </div>`;
      })
      .join('');
    this.el.innerHTML = `
      <div class="tool-radial-ring">
        ${wedges}
        <div class="mode-radial-core tool-radial-core">
          <span class="mode-radial-core-title">R hold</span>
          <span class="mode-radial-core-sub">Tools</span>
        </div>
      </div>
      <p class="mode-radial-foot">Release R to equip · F harvests nearest for tool</p>
    `;
  }

  dispose() {
    this.el.remove();
  }
}
