import { MODES, MODE_META } from '../config/settings.js';
import { getActiveSkills } from '../combat/drcSkills.js';
import { getClassLoadout, compileClassSkill, resolvePlayerClass } from '../combat/classAbilities.js';

import {
  applyCraftpixCssVars,
  preloadCraftpixUi,
  racePortraitUrl
} from './craftpixUi.js';
import { applyBarsHudCssVars, preloadBarsHudUi } from './barsHudUi.js';
import { labPlayerLevel } from '../config/labAdmin.js';
import { loadWarlordsGameUi, playScreenFromActivity } from './grudgeGameUiHost.js';

import './showcase.css';
import './craftpix-hud.css';
import './bars-hud.css';
import './castbar.css';
import './prod-hud.css';

/**
 * Production-style combat HUD for Warlords casting frontend:
 *  - Player frame (self) top-left — real race/name, live STA/MP
 *  - Target frame top-right — only when soft-lock has a target
 *  - Ally strip — hidden until party members exist (no fake A1–A3)
 *  - Bottom action bar (1–6 elements + F residual) with CD overlays
 *  - Mode switch + compact help
 *
 * CraftPix / HYDRA layouts are the art SSOT — no invented Main Panel.
 * GrudgeGameUI (Warlords pack) is the one chrome. This class is the
 * **gameplay screen adapter**: bind HP/target/skills/cast into that pack.
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
    applyBarsHudCssVars(root);
    applyBarsHudCssVars(document.documentElement);
    void preloadCraftpixUi();
    void preloadBarsHudUi();

    this.ggui = null;
    this._screen = 'combat';
    root.classList.add('hud--ggui');
    root.innerHTML = `
      <div class="hud-ggui" data-ggui></div>
      <div class="hud__modes is-hidden" data-modes hidden></div>
      <div class="hud__panel hud__stats is-hidden" data-lab-stats>
        <div>FPS <b data-stat="fps">—</b></div>
        <div>STA <b data-stat="stamina">100</b></div>
        <div>Particles <b data-stat="particles">0</b></div>
        <div>Draw <b data-stat="calls">0</b></div>
      </div>
      <div class="hud__panel hud__help is-hidden" data-help>
        <div><strong>Combat</strong> · 1–4 weapon skills · F primary</div>
        <div><kbd>Hold Q</kbd> combat/harvest · <kbd>Tap Q</kbd> weapon 1↔2 · <kbd>Hold R</kbd> harvest tools</div>
        <div><kbd>RMB</kbd> focus · <kbd>F</kbd> skill · <kbd>1–4</kbd> bar · <kbd>I</kbd> panel</div>
        <div data-help-elements>Gameplay screen = GrudgeGameUI Warlords pack</div>
      </div>
      <div class="hud__lock-pip" data-lock-pip aria-hidden="true"></div>
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
    void this._bootGgui();

    this.cards = new Map();
    for (const card of root.querySelectorAll('.action-slot[data-slot]')) {
      this.cards.set(card.dataset.slot, card);
      card.addEventListener('pointerdown', (event) => {
        event.stopPropagation();
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
    this.blurb = null;
    this._labStats = root.querySelector('[data-lab-stats]');
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
    this._lockPip = root.querySelector('[data-lock-pip]');

    this.tightBar = null;
    this.castBar = null;

    root.querySelector('[data-menu-btn]')?.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.onMenu?.('game');
    });
    root.querySelector('[data-player-frame]')?.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this._charCard?.classList.toggle('is-hidden');
    });
    this._charCard = root.querySelector('[data-char-card]');
    this._chatLog = root.querySelector('[data-chat-log]');
    this._chatIn = root.querySelector('[data-chat-in]');
    this._chatIn?.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.code === 'Enter' && this._chatIn.value.trim()) {
        this.pushChat(this._chatIn.value.trim());
        this._chatIn.value = '';
      }
    });
    this._chatIn?.addEventListener('focus', () => {
      root.querySelector('[data-chat]')?.classList.remove('is-collapsed');
    });
    this.setXp(labPlayerLevel(), 0.12);

    this.refreshSkillLabels();
  }

  /** @param {number} level @param {number} pct01 */
  async _bootGgui() {
    const host = this.root.querySelector('[data-ggui]');
    if (!host) return;
    try {
      this.ggui = await loadWarlordsGameUi('warlords');
      this.ggui.mount(host, { scale: true });
      this.ggui.setState(this._screen || 'combat');
      this._wireGguiHotbar();
      this.refreshSkillLabels();
      this._pushPlayerToGgui();
    } catch (err) {
      console.warn('[HUD] GrudgeGameUI', err?.message || err);
    }
  }

  /**
   * Gameplay vs inventory vs harvest (explore). One pack, one setState.
   * @param {'combat'|'harvest'|'inventory'|'explore'|'menu'} kind
   */
  setPlayScreen(kind) {
    if (kind === 'menu' || kind === 'crafting' || kind === 'dialogue') {
      this._screen = kind;
    } else {
      this._screen = playScreenFromActivity(
        kind === 'harvest' ? 'harvest' : 'combat',
        kind === 'inventory'
      );
    }
    this.ggui?.setState(this._screen);
    this.root?.classList.toggle('hud--harvest', kind === 'harvest');
  }

  _wireGguiHotbar() {
    const root = this.ggui?.root;
    if (!root) return;
    root.querySelectorAll('.hbsl').forEach((el, i) => {
      el.style.pointerEvents = 'auto';
      el.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        if (i === 0) this.onMelee?.();
        else this.onSkillSlot?.(i - 1);
      });
    });
    root.querySelector('[data-type="menu-dock"]')?.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.onMenu?.('game');
    });
  }

  _pushPlayerToGgui() {
    if (!this.ggui) return;
    this.ggui.bindData({
      pf1: {
        name: this._playerNameText || 'Hero',
        level: labPlayerLevel(),
        hp: Math.round(this._hp * 100),
        hpMax: 100,
        mp: Math.round((this._mana ?? 1) * 100),
        mpMax: 100,
        portraitUrl: this._raceId ? racePortraitUrl(this._raceId) : undefined
      }
    });
  }

  setXp(level, pct01 = 0) {
    const fill = this.root.querySelector('.hud-xp__fill');
    const lab = this.root.querySelector('[data-xp-lab]');
    if (fill) fill.style.setProperty('--xp', `${Math.round(Math.max(0, Math.min(1, pct01)) * 100)}%`);
    if (lab) lab.textContent = `Lv ${level}`;
  }

  pushChat(line) {
    if (!this._chatLog) return;
    const p = document.createElement('p');
    p.textContent = line.slice(0, 160);
    this._chatLog.appendChild(p);
    while (this._chatLog.childElementCount > 24) this._chatLog.firstChild?.remove();
    this._chatLog.scrollTop = this._chatLog.scrollHeight;
  }

  /** @param {object|null} state from DrcCombatController.getCastBarState */
  setCastBar(state) {
    this.castBar?.setState(state);
    if (!this.ggui) return;
    if (!state || !state.active) {
      this.ggui.setCastBar?.({ hidden: true });
      return;
    }
    this.ggui.setCastBar?.({
      progress: state.progress01 ?? state.progress ?? 0,
      label: state.label || 'Casting',
      iconUrl: state.iconUrl || ''
    });
  }

  /**
   * Pull labels from catalog bindings (preferred), DRC skills, or staff element meta.
   * Element slots stay tied to Fire/Ice/Nature/Storm staffs when no skill bind.
   */
  refreshSkillLabels() {
    const skills = getActiveSkills();
    for (const [slotKey, card] of this.cards) {
      const i = Number(slotKey);
      const lab = card.querySelector('[data-skill-label]');
      const sk = skills.find((s) => s.slot === i) || skills[i];
      if (lab) lab.textContent = sk?.label || '—';
      card.title = sk?.hint
        ? `${sk.label} · ${sk.hint}`
        : sk?.label || `Skill ${i + 1}`;
    }
    const fLab =
      this.root.querySelector('[data-f-skill-label]') ||
      this.root.querySelector('[data-melee] .action-slot__label');
    const classId = resolvePlayerClass();
    const load = getClassLoadout(classId);
    const fSkill = compileClassSkill(classId, load.f);
    if (fLab) {
      fLab.textContent = fSkill?.label || 'Class 0';
    }
    const fSlot = this.root.querySelector('[data-melee]');
    if (fSlot && fSkill) {
      const ct = fSkill.castDuration ?? fSkill.castTime;
      fSlot.title = `F · ${fLab?.textContent || 'Weapon skill'}${
        ct > 0.05 ? ` · cast ${Number(ct).toFixed(1)}s` : ''
      }`;
    }
    if (this.ggui?.bindWeaponSkills) {
      const f = fSkill;
      const list = [];
      if (f) {
        list.push({
          id: f.id,
          name: f.label || 'F',
          iconUrl: f.iconUrl || '',
          hotkey: 'F'
        });
      }
      for (const sk of skills) {
        list.push({
          id: sk.id,
          name: sk.label || sk.id,
          iconUrl: sk.iconUrl || '',
          hotkey: String((sk.slot ?? list.length) + 1)
        });
      }
      this.ggui.bindWeaponSkills(list.slice(0, 10));
    }
  }

  /**
   * @param {{ name?: string, raceId?: string, hp01?: number, sta01?: number, mana01?: number }} info
   */
  setPlayerFrame(info = {}) {
    if (info.name) this._playerNameText = info.name;
    if (info.raceId) this._raceId = info.raceId;
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
    const cardName = this.root.querySelector('[data-card-name]');
    const cardRace = this.root.querySelector('[data-card-race]');
    if (info.name && cardName) cardName.textContent = info.name;
    if (info.raceId && cardRace) cardRace.textContent = String(info.raceId);
    if (info.hp01 != null) {
      const el = this.root.querySelector('[data-card-hp]');
      if (el) el.textContent = `${Math.round(this._hp * 100)}%`;
    }
    if (info.mana01 != null) {
      const el = this.root.querySelector('[data-card-mp]');
      if (el) el.textContent = `${Math.round(this._mana * 100)}`;
    }
    if (info.sta01 != null) {
      this._sta = Math.max(0, Math.min(1, info.sta01));
      if (this._staFill) this._staFill.style.width = `${Math.round(this._sta * 100)}%`;
      if (this._staText) this._staText.textContent = `${Math.round(this._sta * 100)}`;
      if (this.stats.stamina) this.stats.stamina.textContent = String(Math.round(this._sta * 100));
      const staEl = this.root.querySelector('[data-card-sta]');
      if (staEl) staEl.textContent = `${Math.round(this._sta * 100)}`;
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
    this._pushPlayerToGgui();
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
      const n = this.ggui?.root?.querySelector('.ggui-comp[data-id="tf1"]');
      if (n) {
        n.dataset.hidden = '1';
        n.style.display = 'none';
      }
      return;
    }
    if (this.ggui) {
      const hp = Math.round(Math.max(0, Math.min(1, info.hp01 ?? 1)) * 100);
      this.ggui.setTarget?.({
        name: info.name || 'Target',
        hp,
        hpMax: 100,
        hostile: true
      });
      const n = this.ggui.root?.querySelector('.ggui-comp[data-id="tf1"]');
      if (n) {
        n.dataset.hidden = '0';
        n.style.display = '';
      }
    }
    this.root.querySelector('[data-target-frame]')?.classList.remove('is-empty');
    if (info.name && this._targetName) this._targetName.textContent = info.name;
    const hp = Math.max(0, Math.min(1, info.hp01 ?? 1));
    if (this._targetHp) this._targetHp.style.width = `${Math.round(hp * 100)}%`;
    if (this._targetHpText) this._targetHpText.textContent = `${Math.round(hp * 100)}%`;
    if (info.auras) this.setAuras('target', info.auras);
    else this.setAuras('target', []);
  }

  /**
   * Buff / debuff chips under a unit frame (not hearts, not extra bars).
   * @param {'player'|'target'} which
   * @param {{ id: string, kind?: 'buff'|'debuff' }[]} auras
   */
  setAuras(which, auras = []) {
    const host = this.root.querySelector(
      which === 'target' ? '[data-target-auras]' : '[data-player-auras]'
    );
    if (!host) return;
    const list = Array.isArray(auras) ? auras.slice(0, 8) : [];
    host.replaceChildren();
    for (const a of list) {
      const chip = document.createElement('span');
      chip.className = `hud-aura hud-aura--${a.kind === 'buff' ? 'buff' : 'debuff'}`;
      chip.title = a.id;
      chip.textContent = String(a.id || '?').slice(0, 2);
      host.appendChild(chip);
    }
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
        return `<div class="hud-ally bars-ally" title="${label}"><span>${label}</span><i style="width:${pct}%"></i></div>`;
      })
      .join('');
  }

  /**
   * Nearby hostiles — character_panel right frames.
   * @param {{ id: string, name: string, hp01?: number }[]} enemies
   */
  setEnemies(enemies = []) {
    const host = this.root.querySelector('[data-enemies]');
    if (!host) return;
    const list = Array.isArray(enemies) ? enemies.filter(Boolean) : [];
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
      .map((e) => {
        const pct = Math.round(Math.max(0, Math.min(1, e.hp01 ?? 1)) * 100);
        const label = e.name || e.id || 'Enemy';
        return `<div class="hud-enemy bars-enemy" title="${label}"><span>${label}</span><i style="width:${pct}%"></i></div>`;
      })
      .join('');
  }

  setElement(elementOrSlot) {
    const slot =
      typeof elementOrSlot === 'number'
        ? elementOrSlot
        : Number.isFinite(Number(elementOrSlot))
          ? Number(elementOrSlot)
          : -1;
    for (const [key, card] of this.cards) {
      card.classList.toggle('is-active', Number(key) === slot);
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
      if (this.blurb) this.blurb.textContent = meta.blurb;
      this._setHelpMode('walk');
    } else if (this._drcSession === 'combat') {
      if (this.blurb) this.blurb.textContent = 'Aim · WASD · 1–4 weapon skills · F primary';
      this._setHelpMode('combat');
    } else {
      if (this.blurb) this.blurb.textContent = meta.blurb;
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
        if (this.blurb) this.blurb.textContent = MODE_META.walk?.blurb || 'Surf freeride';
        this._setHelpMode('walk');
      } else {
        if (this.blurb) this.blurb.textContent = 'Aim · WASD · 1–4 weapon skills · F primary';
        this._setHelpMode('combat');
      }
      this.actionbar?.classList.remove('is-dimmed');
      this.tightBar?.setVisible(true);
      this.setCrosshairVisible(this._mode !== 'walk' || true);
      this.refreshSkillLabels();
    } else {
      if (this.blurb) this.blurb.textContent = 'Panel · race · mesh · weapon packs · fleet API';
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
   * Screen-space pip on the soft-lock target (enemy / location).
   * Center crosshair stays the look ray; this shows what we are locked onto.
   * @param {{ visible?: boolean, x?: number, y?: number, onCrosshair?: boolean }} st
   */
  setLockPip(st = {}) {
    const el = this._lockPip;
    if (!el) return;
    const on = !!st.visible;
    el.classList.toggle('is-visible', on);
    el.classList.toggle('is-on-aim', !!st.onCrosshair);
    if (!on) return;
    if (Number.isFinite(st.x) && Number.isFinite(st.y)) {
      el.style.transform = `translate(${st.x}px, ${st.y}px) translate(-50%, -50%)`;
    }
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
    this.help?.classList.toggle('is-hidden');
    this._labStats?.classList.toggle('is-hidden');
  }

  showToast(message, duration = 1400) {
    this.pushChat?.(String(message || ''));
    if (!this.toast) return;
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
    if (this.stats.fps) this.stats.fps.textContent = this._fps;
    if (this.stats.particles) this.stats.particles.textContent = info.particles;
    if (this.stats.calls) this.stats.calls.textContent = info.calls;
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
    if (!this.element) return;
    setTimeout(() => {
      this.element.classList.add('is-hidden');
      // Fully remove from layout after fade (opacity alone left a black veil)
      this.element.style.display = 'none';
    }, 220);
  }
}
