/**
 * HUD Tight bottom bar — threejs-rapier / Danger Room production chrome.
 * Port of gameopen TightBar.tsx + tightBar.css geometry (HUD.psd 3800×726).
 *
 * Layout: HP orb | 6 left slots | avatar arch | 6 right slots | STA orb
 */

import {
  QUICK_ACTIONS,
  QUICK_SLOTS_PER_SIDE,
  defaultQuickSlots
} from './quickActions.js';
import { getActiveSkills, DRC_MELEE_STRIKE } from '../combat/drcSkills.js';
import { getSkillBinding } from '../combat/skillBindings.js';

const TB_W = 3800;
const TB_H = 726;
const tbX = (px) => `${((px / TB_W) * 100).toFixed(3)}%`;
const tbY = (px) => `${((px / TB_H) * 100).toFixed(3)}%`;

const TB_CELL_W = 230;
const TB_CELL_H = 132;
const TB_COLS = [776, 1028, 1274, 2276, 2526, 2772];
const TB_ROWS = [378, 548];
const TB_ORB_R = 150;
const TB_ORB_HP = { cx: 354, cy: 360 };
const TB_ORB_MP = { cx: 3446, cy: 360 };

/** Prefer same-origin public art; fallback to Open CDN. */
export const TIGHT_BAR_ART = './hud-tight-bar.png';
export const TIGHT_BAR_ART_FALLBACK = 'https://open.grudge-studio.com/hud-tight-bar.png';

function tbSlotStyle(i) {
  const grid = i < QUICK_SLOTS_PER_SIDE ? 0 : 1;
  const j = i % QUICK_SLOTS_PER_SIDE;
  const col = grid * 3 + (j % 3);
  const row = Math.floor(j / 3);
  return {
    left: tbX(TB_COLS[col]),
    top: tbY(TB_ROWS[row]),
    width: tbX(TB_CELL_W),
    height: tbY(TB_CELL_H)
  };
}

function tbOrbStyle(orb) {
  return {
    left: tbX(orb.cx - TB_ORB_R),
    top: tbY(orb.cy - TB_ORB_R),
    width: tbX(TB_ORB_R * 2),
    height: tbY(TB_ORB_R * 2)
  };
}

/**
 * @typedef {object} TightBarState
 * @property {number} health
 * @property {number} maxHealth
 * @property {number} stamina
 * @property {number} maxStamina
 * @property {number} poise
 * @property {number} maxPoise
 * @property {string} character
 * @property {string} [raceId]
 * @property {string} [portraitUrl]
 * @property {(actionId: string) => number} [cd01]  0..1 remaining
 */

export class TightBar {
  /**
   * @param {{
   *   host: HTMLElement,
   *   onAction?: (actionId: string) => void,
   *   onMenu?: (menuId: string) => void
   * }} opts
   */
  constructor(opts) {
    this.host = opts.host;
    this.onAction = opts.onAction || (() => {});
    this.onMenu = opts.onMenu || (() => {});
    this.slots = defaultQuickSlots();
    /** @type {TightBarState} */
    this.state = {
      health: 100,
      maxHealth: 100,
      stamina: 100,
      maxStamina: 100,
      poise: 100,
      maxPoise: 100,
      character: 'Hero',
      raceId: 'WK'
    };
    this.el = document.createElement('div');
    this.el.className = 'tightbar-root';
    this.host.appendChild(this.el);
    this._render();
  }

  _skillLabels() {
    const bar = getActiveSkills();
    const b0 = getSkillBinding(0);
    const b1 = getSkillBinding(1);
    const b2 = getSkillBinding(2);
    const b3 = getSkillBinding(3);
    const bf = getSkillBinding('f');
    return {
      fskill: bf?.name || 'Interact',
      interact: bf?.name || 'Interact',
      sig1: b0?.name || bar.find((s) => s.slot === 0)?.label || 'Fire Bolt',
      sig2: b1?.name || bar.find((s) => s.slot === 1)?.label || 'Water Lash',
      sig3: b2?.name || bar.find((s) => s.slot === 2)?.label || 'Earth Spike',
      sig4: b3?.name || bar.find((s) => s.slot === 3)?.label || 'Wind Tempest'
    };
  }

  _resolve(id) {
    const def = QUICK_ACTIONS[id];
    if (!def) return null;
    const labels = this._skillLabels();
    const name =
      id === 'fskill' || id === 'interact'
        ? labels.interact || labels.fskill
        : id.startsWith('sig')
          ? labels[id] || def.label
          : def.label;
    const cd01 = this.state.cd01?.(id) ?? 0;
    return {
      id,
      keyLabel: def.key,
      name,
      glyph: def.glyph,
      accent: id === 'heavy' || id === 'parry',
      cd01,
      kind: def.kind
    };
  }

  _render() {
    const s = this.state;
    const hpPct = s.maxHealth > 0 ? Math.max(0, Math.min(100, (s.health / s.maxHealth) * 100)) : 0;
    const mpPct = s.maxStamina > 0 ? Math.max(0, Math.min(100, (s.stamina / s.maxStamina) * 100)) : 0;
    const poisePct = s.maxPoise > 0 ? Math.max(0, Math.min(100, (s.poise / s.maxPoise) * 100)) : 0;

    const slotHtml = this.slots
      .map((id, i) => {
        const style = tbSlotStyle(i);
        const styleAttr = `left:${style.left};top:${style.top};width:${style.width};height:${style.height}`;
        if (!id) {
          return `<div class="tb-slot tb-empty" style="${styleAttr}" title="Empty"><span class="tb-key">·</span></div>`;
        }
        const r = this._resolve(id);
        const onCd = r.cd01 > 0.02;
        const frac = onCd ? r.cd01 : 0;
        const sweep = onCd
          ? `<div class="tb-sweep" style="background:conic-gradient(rgba(4,10,20,0.78) ${frac * 360}deg, transparent 0deg)"></div>`
          : '';
        const cdTxt = onCd ? `<span class="tb-cd">${(frac * 10).toFixed(1)}</span>` : '';
        return `
          <button type="button" class="tb-slot ${r.accent ? 'tb-accent' : ''} ${onCd ? 'on-cd' : 'ready'}"
            style="${styleAttr}" data-action="${id}" title="${r.name} — ${r.keyLabel}">
            <span class="tb-glyph">${r.glyph}</span>
            ${sweep}${cdTxt}
            <span class="tb-key">${r.keyLabel}</span>
          </button>`;
      })
      .join('');

    const hpOrb = tbOrbStyle(TB_ORB_HP);
    const mpOrb = tbOrbStyle(TB_ORB_MP);

    this.el.innerHTML = `
      <div class="tightbar" data-tightbar style="background-image:url('${TIGHT_BAR_ART}')">
        <div class="tb-orb tb-orb-hp" style="left:${hpOrb.left};top:${hpOrb.top};width:${hpOrb.width};height:${hpOrb.height}" title="Health">
          <div class="tb-orb-drain" data-hp-drain style="height:${100 - hpPct}%"></div>
          <span class="tb-orb-val" data-hp-val>${Math.round(s.health)}</span>
        </div>
        <div class="tb-orb tb-orb-mp" style="left:${mpOrb.left};top:${mpOrb.top};width:${mpOrb.width};height:${mpOrb.height}" title="Stamina">
          <div class="tb-orb-drain" data-mp-drain style="height:${100 - mpPct}%"></div>
          <span class="tb-orb-val" data-mp-val>${Math.round(s.stamina)}</span>
        </div>
        ${slotHtml}
        <div class="tb-avatar" data-avatar title="${s.character}">
          <span class="tb-avatar-letter" data-avatar-letter>${(s.raceId || s.character || '?').slice(0, 2)}</span>
          <span class="tb-avatar-name" data-avatar-name>${s.character}</span>
        </div>
        <div class="tb-poise" title="Poise">
          <div class="tb-poise-fill" data-poise style="width:${poisePct}%"></div>
        </div>
      </div>
      <nav class="tb-menus" data-menus>
        <button type="button" class="tb-menu-btn" data-menu="showcase" title="Showcase · race/weapon/anim/skills">Show</button>
        <button type="button" class="tb-menu-btn" data-menu="loot" title="Spawn world drops (L)">Loot</button>
        <button type="button" class="tb-menu-btn" data-menu="bag" title="Drop bag · throw (B)">Bag</button>
        <button type="button" class="tb-menu-btn" data-menu="lab" title="Lab Panel (I)">Lab</button>
        <button type="button" class="tb-menu-btn" data-menu="editor" title="VFX Editor (G)">VFX</button>
        <button type="button" class="tb-menu-btn" data-menu="help" title="Help (F1)">?</button>
        <button type="button" class="tb-menu-btn" data-menu="clear" title="Clear VFX + drops (Shift+C)">Clr</button>
        <button type="button" class="tb-menu-btn" data-menu="mainpanel" title="Main Panel production">MP</button>
      </nav>
      <div class="tb-keychips" data-chips></div>
    `;

    // Art fallback
    const bar = this.el.querySelector('[data-tightbar]');
    const img = new Image();
    img.onerror = () => {
      if (bar) bar.style.backgroundImage = `url('${TIGHT_BAR_ART_FALLBACK}')`;
    };
    img.src = TIGHT_BAR_ART;

    this.el.querySelectorAll('[data-action]').forEach((btn) => {
      btn.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        e.preventDefault();
        this.onAction(btn.dataset.action);
      });
    });
    this.el.querySelectorAll('[data-menu]').forEach((btn) => {
      btn.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        e.preventDefault();
        this.onMenu(btn.dataset.menu);
      });
    });

    // Chips
    const chips = this.el.querySelector('[data-chips]');
    if (chips) {
      chips.innerHTML = ['1–4', 'F', 'X', 'C', 'E', 'R', 'Q', 'Space']
        .map((k) => `<span class="tb-chip">${k}</span>`)
        .join('');
    }

    this._nodes = {
      hpDrain: this.el.querySelector('[data-hp-drain]'),
      mpDrain: this.el.querySelector('[data-mp-drain]'),
      hpVal: this.el.querySelector('[data-hp-val]'),
      mpVal: this.el.querySelector('[data-mp-val]'),
      poise: this.el.querySelector('[data-poise]'),
      avatarName: this.el.querySelector('[data-avatar-name]'),
      avatarLetter: this.el.querySelector('[data-avatar-letter]')
    };
  }

  /**
   * @param {Partial<TightBarState>} patch
   */
  setState(patch) {
    Object.assign(this.state, patch);
    const s = this.state;
    const hpPct = s.maxHealth > 0 ? Math.max(0, Math.min(100, (s.health / s.maxHealth) * 100)) : 0;
    const mpPct = s.maxStamina > 0 ? Math.max(0, Math.min(100, (s.stamina / s.maxStamina) * 100)) : 0;
    const poisePct = s.maxPoise > 0 ? Math.max(0, Math.min(100, (s.poise / s.maxPoise) * 100)) : 0;
    if (this._nodes?.hpDrain) this._nodes.hpDrain.style.height = `${100 - hpPct}%`;
    if (this._nodes?.mpDrain) this._nodes.mpDrain.style.height = `${100 - mpPct}%`;
    if (this._nodes?.hpVal) this._nodes.hpVal.textContent = String(Math.round(s.health));
    if (this._nodes?.mpVal) this._nodes.mpVal.textContent = String(Math.round(s.stamina));
    if (this._nodes?.poise) this._nodes.poise.style.width = `${poisePct}%`;
    if (this._nodes?.avatarName) this._nodes.avatarName.textContent = s.character;
    if (this._nodes?.avatarLetter) {
      this._nodes.avatarLetter.textContent = (s.raceId || s.character || '?').slice(0, 2);
    }
    // Refresh CD overlays on slots without full rebuild when possible
    this.el.querySelectorAll('[data-action]').forEach((btn) => {
      const id = btn.dataset.action;
      const cd01 = s.cd01?.(id) ?? 0;
      const onCd = cd01 > 0.02;
      btn.classList.toggle('on-cd', onCd);
      btn.classList.toggle('ready', !onCd);
      let sweep = btn.querySelector('.tb-sweep');
      let cdEl = btn.querySelector('.tb-cd');
      if (onCd) {
        if (!sweep) {
          sweep = document.createElement('div');
          sweep.className = 'tb-sweep';
          btn.appendChild(sweep);
        }
        sweep.style.background = `conic-gradient(rgba(4,10,20,0.78) ${cd01 * 360}deg, transparent 0deg)`;
        if (!cdEl) {
          cdEl = document.createElement('span');
          cdEl.className = 'tb-cd';
          btn.appendChild(cdEl);
        }
        cdEl.textContent = (cd01 * 10).toFixed(1);
      } else {
        sweep?.remove();
        cdEl?.remove();
      }
    });
  }

  /** Rebuild labels when skill tree changes. */
  refreshLabels() {
    this._render();
    this.setState(this.state);
  }

  setVisible(visible) {
    this.el.classList.toggle('is-hidden', !visible);
  }

  dispose() {
    this.el.remove();
  }
}
