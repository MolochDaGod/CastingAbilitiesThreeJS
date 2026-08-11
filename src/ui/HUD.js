import { ELEMENTS, ELEMENT_META, MODES, MODE_META } from '../config/settings.js';
import { ELEMENT_SIGILS } from './glyphs.js';
import { getActiveSkills, skillForFKey } from '../combat/drcSkills.js';
import { getSkillBinding } from '../combat/skillBindings.js';
import { TightBar } from './TightBar.js';
import {
  applyCraftpixCssVars,
  preloadCraftpixUi,
  racePortraitUrl
} from './craftpixUi.js';
import { CastBar } from './CastBar.js';
import './tightBar.css';
import './showcase.css';
import './craftpix-hud.css';
import './castbar.css';

/**
 * Production-style combat HUD for Warlords casting frontend:
 *  - Player frame (self) top-left — real race/name, live STA/MP
 *  - Target frame top-right — only when soft-lock has a target
 *  - Ally strip — hidden until party members exist (no fake A1–A3)
 *  - Bottom action bar (1–6 elements + F residual) with CD overlays
 *  - Mode switch + compact help
 *
 * CraftPix / HYDRA layouts are the art SSOT — no invented Main Panel.
 */
export class HUD {
  constructor(root) {
    this.root = root;
    this.onSelect = null;
    this.onMode = null;
    this.onSkillSlot = null;
    this.onMelee = null;
    /** @type {((actionId: string) => void)|null} */
    this.onQuickAction = null;
    /** @type {((menuId: string) => void)|null} */
    this.onMenu = null;
    this._toastTimer = 0;
    this._statsAccumulator = 0;
    this._frames = 0;
    this._fps = 0;
    this._drcSession = 'combat';
    this._hp = 1;
    this._mana = 1;
    this._sta = 1;

    applyCraftpixCssVars(root);
    void preloadCraftpixUi();

    root.innerHTML = `
      <div class="hud__panel hud__title cp-panel">
        Grudge Warlords · Casting
        <span data-blurb>1–6 elements · path cast · Surf (M)</span>
      </div>

      <!-- Player unit frame — CraftPix UnitFrame layers -->
      <div class="hud-frame hud-frame--player cp-frame" data-player-frame>
        <div class="cp-frame__avatar" data-avatar>
          <div class="cp-frame__avatar-bg"></div>
          <img class="cp-frame__portrait-img" data-portrait-img alt="" />
          <div class="cp-frame__avatar-border"></div>
          <div class="cp-frame__avatar-overlay"></div>
          <span class="cp-frame__glyph" data-portrait>WK</span>
        </div>
        <div class="cp-frame__body">
          <div class="hud-frame__name" data-player-name>…</div>
          <div class="cp-bar cp-bar--hp" title="Health">
            <div class="cp-bar__track"></div>
            <div class="cp-bar__fill-wrap"><div class="cp-bar__fill" data-hp-fill style="width:100%"></div></div>
            <span class="hud-frame__val" data-hp-text>100%</span>
          </div>
          <div class="cp-bar cp-bar--mp" title="Mana">
            <div class="cp-bar__track cp-bar__track--sb"></div>
            <div class="cp-bar__fill-wrap"><div class="cp-bar__fill cp-bar__fill--mp" data-mp-fill style="width:100%"></div></div>
            <span class="hud-frame__val" data-mp-text>100</span>
          </div>
          <div class="cp-bar cp-bar--sta" title="Stamina">
            <div class="cp-bar__track cp-bar__track--sb"></div>
            <div class="cp-bar__fill-wrap"><div class="cp-bar__fill cp-bar__fill--sta" data-sta-fill style="width:100%"></div></div>
            <span class="hud-frame__val" data-sta-text>100</span>
          </div>
        </div>
      </div>

      <!-- Ally strip: hidden until setAllies receives members -->
      <div class="hud-allies is-empty" data-allies hidden aria-hidden="true"></div>

      <!-- Target unit frame — CraftPix hostile chrome -->
      <div class="hud-frame hud-frame--target cp-frame cp-frame--hostile is-empty" data-target-frame>
        <div class="cp-frame__body">
          <div class="hud-frame__name" data-target-name>No target</div>
          <div class="cp-bar cp-bar--hp cp-bar--hostile" title="Target health">
            <div class="cp-bar__track"></div>
            <div class="cp-bar__fill-wrap"><div class="cp-bar__fill cp-bar__fill--hostile" data-target-hp style="width:0%"></div></div>
            <span class="hud-frame__val" data-target-hp-text>—</span>
          </div>
        </div>
        <div class="cp-frame__avatar cp-frame__avatar--target" data-target-avatar>
          <div class="cp-frame__avatar-bg"></div>
          <div class="cp-frame__avatar-border"></div>
          <span class="cp-frame__glyph" data-target-portrait>?</span>
        </div>
      </div>

      <div class="hud__panel hud__stats">
        <div>FPS <b data-stat="fps">—</b></div>
        <div>STA <b data-stat="stamina">100</b></div>
        <div>Particles <b data-stat="particles">0</b></div>
        <div>Draw <b data-stat="calls">0</b></div>
      </div>

      <div class="hud__panel hud__help" data-help>
        <div><strong>Combat</strong> · staffs on 1–6 · F residual</div>
        <div><kbd>RMB</kbd> focus · LMB attack (focus) / select (free) · unlocked mouse free</div>
        <div><kbd>Shift</kbd> sprint · <kbd>Shift</kbd>+<kbd>Ctrl</kbd> slide · <kbd>Ctrl</kbd>+dir roll</div>
        <div><kbd>F</kbd> weapon skill · <kbd>1–4</kbd> bar · <kbd>LMB</kbd> path · <kbd>I</kbd> panel</div>
        <div><kbd>F1</kbd>–<kbd>F5</kbd> Admin · Player · Assets · Creatures · Prefabs · World · <kbd>Esc</kbd> close</div>
        <div><kbd>?</kbd>/<kbd>H</kbd> this help · prefab create/save in Admin</div>
        <div data-help-elements>Weapon skills (equip I→Weapon) · cast times on F / digits</div>
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
          const title = meta.hint || meta.staffLabel || meta.label;
          return `
            <div class="action-slot cp-slot" data-element="${element}" data-slot="${index}" data-staff="${meta.staffWeaponId || ''}" style="--accent:${meta.accent}" title="${title}">
              <div class="cp-slot__bg"></div>
              <div class="action-slot__cd cp-slot__cd" data-cd></div>
              <div class="action-slot__key">${index + 1}</div>
              <div class="action-slot__glyph">${ELEMENT_SIGILS[element] ?? meta.glyph}</div>
              <div class="action-slot__label" data-skill-label>${meta.short || meta.label}</div>
              <div class="cp-slot__border"></div>
              <div class="cp-slot__press"></div>
            </div>`;
        }).join('')}
        <div class="action-slot action-slot--melee cp-slot" data-melee="1" style="--accent:#7dd3fc" title="F — weapon skill (equip primary)">
          <div class="cp-slot__bg"></div>
          <div class="action-slot__cd cp-slot__cd" data-cd-melee></div>
          <div class="action-slot__key">F</div>
          <div class="action-slot__glyph">✦</div>
          <div class="action-slot__label" data-f-skill-label>Weapon</div>
          <div class="cp-slot__border"></div>
          <div class="cp-slot__press"></div>
        </div>
      </div>

      <div class="hud__crosshair" data-crosshair aria-hidden="true">
        <span class="hud__crosshair-range" data-xh-range aria-hidden="true"></span>
        <span class="hud__crosshair-tick hud__crosshair-tick--n"></span>
        <span class="hud__crosshair-tick hud__crosshair-tick--e"></span>
        <span class="hud__crosshair-tick hud__crosshair-tick--s"></span>
        <span class="hud__crosshair-tick hud__crosshair-tick--w"></span>
        <span class="hud__crosshair-dot"></span>
        <span class="hud__crosshair-ring"></span>
        <span class="hud__crosshair-hit" data-xh-hit aria-hidden="true">
          <span class="hud__crosshair-hit-line hud__crosshair-hit-tl"></span>
          <span class="hud__crosshair-hit-line hud__crosshair-hit-tr"></span>
          <span class="hud__crosshair-hit-line hud__crosshair-hit-bl"></span>
          <span class="hud__crosshair-hit-line hud__crosshair-hit-br"></span>
        </span>
      </div>

      <div class="hud__toast" data-toast></div>
    `;

    this.cards = new Map();
    for (const card of root.querySelectorAll('.action-slot[data-slot]')) {
      this.cards.set(card.dataset.element, card);
      card.addEventListener('pointerdown', (event) => {
        event.stopPropagation();
        this.onSelect?.(card.dataset.element);
        this.onSkillSlot?.(Number(card.dataset.slot));
      });
    }
    root.querySelector('[data-melee]')?.addEventListener('pointerdown', (event) => {
      event.stopPropagation();
      this.onMelee?.();
    });

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

    this._hpFill = root.querySelector('[data-hp-fill]');
    this._mpFill = root.querySelector('[data-mp-fill]');
    this._staFill = root.querySelector('[data-sta-fill]');
    this._hpText = root.querySelector('[data-hp-text]');
    this._mpText = root.querySelector('[data-mp-text]');
    this._staText = root.querySelector('[data-sta-text]');
    this._playerName = root.querySelector('[data-player-name]');
    this._portrait = root.querySelector('[data-portrait]');
    this._targetName = root.querySelector('[data-target-name]');
    this._targetHp = root.querySelector('[data-target-hp]');
    this._targetHpText = root.querySelector('[data-target-hp-text]');
    this._meleeCd = root.querySelector('[data-cd-melee]');
    this._crosshair = root.querySelector('[data-crosshair]');

    // Danger Room / threejs-rapier tight bar (6+6 + avatar + orbs)
    root.classList.add('hud--tight');
    this.tightBar = new TightBar({
      host: root,
      onAction: (id) => this.onQuickAction?.(id),
      onMenu: (id) => this.onMenu?.(id)
    });

    /** CraftPix cast bar (cast times + progress under reticle) */
    this.castBar = new CastBar(root);

    this.refreshSkillLabels();
  }

  /** @param {object|null} state from DrcCombatController.getCastBarState */
  setCastBar(state) {
    this.castBar?.setState(state);
  }

  /**
   * Pull labels from catalog bindings (preferred), DRC skills, or staff element meta.
   * Element slots stay tied to Fire/Ice/Nature/Storm staffs when no skill bind.
   */
  refreshSkillLabels() {
    const skills = getActiveSkills();
    let i = 0;
    for (const [element, card] of this.cards) {
      const lab = card.querySelector('[data-skill-label]');
      const bound = getSkillBinding(i);
      const sk = skills.find((s) => s.slot === i);
      const meta = ELEMENT_META[element];
      const staffFallback = meta?.short || meta?.label || element;
      if (lab) {
        lab.textContent = bound?.name || sk?.label || staffFallback;
      }
      if (meta?.hint) card.title = bound?.name ? `${bound.name} · ${meta.hint}` : meta.hint;
      i++;
    }
    const fLab =
      this.root.querySelector('[data-f-skill-label]') ||
      this.root.querySelector('[data-melee] .action-slot__label');
    const fSkill = skillForFKey();
    const fBound = getSkillBinding('f');
    if (fLab) {
      fLab.textContent = fBound?.name || fSkill?.label || 'Weapon';
    }
    const fSlot = this.root.querySelector('[data-melee]');
    if (fSlot && fSkill) {
      const ct = fSkill.castDuration ?? fSkill.castTime;
      fSlot.title = `F · ${fLab?.textContent || 'Weapon skill'}${
        ct > 0.05 ? ` · cast ${Number(ct).toFixed(1)}s` : ''
      }`;
    }
    this.tightBar?.refreshLabels?.();
  }

  /**
   * @param {{ name?: string, raceId?: string, hp01?: number, sta01?: number, mana01?: number }} info
   */
  setPlayerFrame(info = {}) {
    if (info.name && this._playerName) this._playerName.textContent = info.name;
    if (info.raceId && this._portrait) {
      this._portrait.textContent = String(info.raceId).slice(0, 3);
      const img = this.root.querySelector('[data-portrait-img]');
      if (img) {
        const url = racePortraitUrl(info.raceId);
        if (img.dataset.race !== String(info.raceId)) {
          img.dataset.race = String(info.raceId);
          img.src = url;
          img.onload = () => img.classList.add('is-loaded');
          img.onerror = () => img.classList.remove('is-loaded');
        }
      }
    }
    if (info.hp01 != null) {
      this._hp = Math.max(0, Math.min(1, info.hp01));
      if (this._hpFill) this._hpFill.style.width = `${Math.round(this._hp * 100)}%`;
      if (this._hpText) this._hpText.textContent = `${Math.round(this._hp * 100)}%`;
    }
    if (info.mana01 != null) {
      this._mana = Math.max(0, Math.min(1, info.mana01));
      if (this._mpFill) this._mpFill.style.width = `${Math.round(this._mana * 100)}%`;
      if (this._mpText) this._mpText.textContent = `${Math.round(this._mana * 100)}`;
    }
    if (info.sta01 != null) {
      this._sta = Math.max(0, Math.min(1, info.sta01));
      if (this._staFill) this._staFill.style.width = `${Math.round(this._sta * 100)}%`;
      if (this._staText) this._staText.textContent = `${Math.round(this._sta * 100)}`;
      if (this.stats.stamina) this.stats.stamina.textContent = String(Math.round(this._sta * 100));
    }
    // Legacy: if only sta01 and no mana bar data, keep mp as sta for old callers
    if (info.sta01 != null && info.mana01 == null && !this._staFill && this._mpFill) {
      this._mpFill.style.width = `${Math.round(this._sta * 100)}%`;
    }
    this.tightBar?.setState({
      character: info.name || this.tightBar.state.character,
      raceId: info.raceId || this.tightBar.state.raceId,
      health: (info.hp01 != null ? info.hp01 : this._hp) * 100,
      maxHealth: 100,
      stamina: (info.sta01 != null ? info.sta01 : this._sta) * 100,
      maxStamina: 100,
      mana: (info.mana01 != null ? info.mana01 : this._mana ?? 1) * 100,
      maxMana: 100
    });
  }

  /**
   * @param {{ name?: string, hp01?: number, present?: boolean }|null} info
   */
  setTargetFrame(info) {
    if (!info || info.present === false) {
      if (this._targetName) this._targetName.textContent = 'No target';
      if (this._targetHp) this._targetHp.style.width = '0%';
      if (this._targetHpText) this._targetHpText.textContent = '—';
      this.root.querySelector('[data-target-frame]')?.classList.add('is-empty');
      return;
    }
    this.root.querySelector('[data-target-frame]')?.classList.remove('is-empty');
    if (info.name && this._targetName) this._targetName.textContent = info.name;
    const hp = Math.max(0, Math.min(1, info.hp01 ?? 1));
    if (this._targetHp) this._targetHp.style.width = `${Math.round(hp * 100)}%`;
    if (this._targetHpText) this._targetHpText.textContent = `${Math.round(hp * 100)}%`;
  }

  /**
   * @param {{ id: string, name: string, hp01?: number }[]} allies
   */
  setAllies(allies = []) {
    const host = this.root.querySelector('[data-allies]');
    if (!host) return;
    const list = Array.isArray(allies) ? allies.filter(Boolean) : [];
    if (!list.length) {
      host.innerHTML = '';
      host.classList.add('is-empty');
      host.hidden = true;
      host.setAttribute('aria-hidden', 'true');
      return;
    }
    host.hidden = false;
    host.setAttribute('aria-hidden', 'false');
    host.classList.remove('is-empty');
    host.innerHTML = list
      .slice(0, 4)
      .map((a) => {
        const pct = Math.round(Math.max(0, Math.min(1, a.hp01 ?? 1)) * 100);
        const label = a.name || a.id || 'Ally';
        return `<div class="hud-ally" title="${label}"><span>${label}</span><i style="width:${pct}%"></i></div>`;
      })
      .join('');
  }

  setElement(element) {
    for (const [key, card] of this.cards) {
      card.classList.toggle('is-active', key === element);
    }
  }

  setMode(mode) {
    this._mode = mode;
    for (const [key, card] of this.modeCards) {
      card.classList.toggle('is-active', key === mode);
    }
    const meta = MODE_META[mode];
    if (!meta) return;
    // Walk/Surf mode blurb wins over combat blurb for path-ride context
    if (mode === 'walk') {
      this.blurb.textContent = meta.blurb;
      this._setHelpMode('walk');
    } else if (this._drcSession === 'combat') {
      this.blurb.textContent = 'Aim · WASD · 1–6 elements · LMB path cast';
      this._setHelpMode('combat');
    } else {
      this.blurb.textContent = meta.blurb;
      this._setHelpMode('equip');
    }
  }

  /** Compact help line set by mode (no second help panel). */
  _setHelpMode(kind) {
    const el = this.root.querySelector('[data-help-elements]');
    if (!el) return;
    if (kind === 'walk') {
      el.textContent = 'Surf: Space deploy · path = course · WASD boat · skills on board';
    } else if (kind === 'equip') {
      el.textContent = 'Panel (I): race · mesh · weapon packs · skills · fleet API';
    } else {
      el.textContent = '1–6: Fire · Storm · Ice · Nature · Holy · Arcane · path cast';
    }
  }

  setDrcSession(session) {
    this._drcSession = session;
    if (session === 'combat') {
      if (this._mode === 'walk') {
        this.blurb.textContent = MODE_META.walk?.blurb || 'Surf freeride';
        this._setHelpMode('walk');
      } else {
        this.blurb.textContent = 'Aim · WASD · 1–6 elements · LMB path cast';
        this._setHelpMode('combat');
      }
      this.actionbar?.classList.remove('is-dimmed');
      this.tightBar?.setVisible(true);
      this.setCrosshairVisible(this._mode !== 'walk' || true);
      this.refreshSkillLabels();
    } else {
      this.blurb.textContent = 'Panel · race · mesh · weapon packs · fleet API';
      this.actionbar?.classList.add('is-dimmed');
      this.tightBar?.setVisible(true);
      this.setCrosshairVisible(false);
      this._setHelpMode('equip');
    }
  }

  setCrosshairVisible(on) {
    this._crosshair?.classList.toggle('is-visible', !!on);
  }

  /**
   * Dynamic reticle — GRUDOX animator parity:
   * centre dot + 4 ticks with bloom gap, range ring, hit-marker pulse.
   * @param {{
   *   softLock?: boolean,
   *   fire?: boolean,
   *   focus?: boolean,
   *   spread?: number,
   *   rangeState?: 'close'|'optimal'|'far'|'none',
   *   hitMarker?: number
   * }} [st]
   */
  setCrosshairState(st = {}) {
    const el = this._crosshair;
    if (!el) return;
    el.classList.toggle('is-softlock', !!st.softLock);
    el.classList.toggle('is-fire', !!st.fire);
    el.classList.toggle('is-focus', !!st.focus);
    // Animator: gap in px 0..28 from bloom (we map 0..1 → px)
    const spread01 = Math.max(0, Math.min(1, Number(st.spread) || 0));
    const gapPx = Math.round(spread01 * 22);
    el.style.setProperty('--xh-spread', String(spread01));
    el.style.setProperty('--ch-gap', `${gapPx}px`);
    const range = st.rangeState || 'none';
    el.dataset.range = range;
    el.classList.toggle('is-range-close', range === 'close');
    el.classList.toggle('is-range-optimal', range === 'optimal');
    el.classList.toggle('is-range-far', range === 'far');
    if (st.hitMarker != null && st.hitMarker > 0) {
      const hit = el.querySelector('[data-xh-hit]');
      if (hit) {
        hit.classList.remove('is-pulse');
        // reflow restart
        void hit.offsetWidth;
        hit.classList.add('is-pulse');
      }
    }
  }

  setCombatHud(cd01Fn, stamina, meleeCd01) {
    if (stamina != null) {
      this.setPlayerFrame({ sta01: stamina / 100 });
    }
    if (!cd01Fn) return;
    for (const card of this.cards.values()) {
      const slot = Number(card.dataset.slot);
      const cd = cd01Fn(slot);
      const el = card.querySelector('[data-cd]');
      if (el) el.style.setProperty('--cd', String(cd));
      card.classList.toggle('is-cooling', cd > 0.02);
    }
    if (this._meleeCd && meleeCd01 != null) {
      this._meleeCd.style.setProperty('--cd', String(meleeCd01));
      this.root.querySelector('[data-melee]')?.classList.toggle('is-cooling', meleeCd01 > 0.02);
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
    if (info.player) {
      this.setPlayerFrame(info.player);
    } else if (info.stamina != null || info.mana != null) {
      this.setPlayerFrame({
        sta01: info.stamina != null ? info.stamina / 100 : undefined,
        mana01: info.mana != null ? info.mana / 100 : undefined
      });
    }
    if (info.cooldown01 && this._drcSession === 'combat') {
      this.setCombatHud(info.cooldown01, info.stamina, info.meleeCd01);
    }
    if (info.target !== undefined) this.setTargetFrame(info.target);

    // Sync tight bar orbs + CDs every stats tick
    if (this.tightBar && (info.stamina != null || info.mana != null)) {
      this.tightBar.setState({
        stamina: info.stamina ?? this._sta * 100,
        maxStamina: 100,
        mana: info.mana ?? (this._mana ?? 1) * 100,
        maxMana: 100,
        health: (info.player?.hp01 ?? this._hp) * 100,
        character: info.player?.name || this.tightBar.state.character,
        raceId: info.player?.raceId || this.tightBar.state.raceId,
        cd01: info.quickCd01 || (() => 0)
      });
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
}
