import { ELEMENTS, ELEMENT_META, MODES, MODE_META } from '../config/settings.js';
import { ELEMENT_SIGILS } from './glyphs.js';
import { getActiveSkills, DRC_MELEE_STRIKE } from '../combat/drcSkills.js';
import { TightBar } from './TightBar.js';
import './tightBar.css';

/**
 * Production-style combat HUD for casting lab:
 *  - Player frame (self) top-left
 *  - Target frame top-right (lab placeholder until targeting wired)
 *  - Ally strip under player frame
 *  - Bottom action bar (1–4 + F residual) with CD overlays
 *  - Mode switch + compact help
 *
 * CraftPix / HYDRA layouts are the art SSOT — this is functional chrome
 * for the lab (no invented Main Panel).
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
    this._mp = 1;
    this._sta = 1;

    root.innerHTML = `
      <div class="hud__panel hud__title">
        Grudge Casting · Warlords lab
        <span data-blurb>DRC · Toon RTS · Lab Panel (I)</span>
      </div>

      <!-- Player unit frame -->
      <div class="hud-frame hud-frame--player" data-player-frame>
        <div class="hud-frame__portrait" data-portrait>WK</div>
        <div class="hud-frame__body">
          <div class="hud-frame__name" data-player-name>Hero</div>
          <div class="hud-frame__bar hud-frame__bar--hp">
            <div class="hud-frame__fill" data-hp-fill style="width:100%"></div>
            <span class="hud-frame__val" data-hp-text>100%</span>
          </div>
          <div class="hud-frame__bar hud-frame__bar--mp">
            <div class="hud-frame__fill" data-mp-fill style="width:100%"></div>
            <span class="hud-frame__val" data-mp-text>STA</span>
          </div>
        </div>
      </div>

      <!-- Ally strip -->
      <div class="hud-allies" data-allies>
        <div class="hud-ally is-empty" title="Ally slot (lab)"><span>A1</span></div>
        <div class="hud-ally is-empty" title="Ally slot (lab)"><span>A2</span></div>
        <div class="hud-ally is-empty" title="Ally slot (lab)"><span>A3</span></div>
      </div>

      <!-- Target unit frame -->
      <div class="hud-frame hud-frame--target" data-target-frame>
        <div class="hud-frame__body">
          <div class="hud-frame__name" data-target-name>No target</div>
          <div class="hud-frame__bar hud-frame__bar--hp hud-frame__bar--hostile">
            <div class="hud-frame__fill" data-target-hp style="width:0%"></div>
            <span class="hud-frame__val" data-target-hp-text>—</span>
          </div>
        </div>
        <div class="hud-frame__portrait hud-frame__portrait--target" data-target-portrait>?</div>
      </div>

      <div class="hud__panel hud__stats">
        <div>FPS <b data-stat="fps">—</b></div>
        <div>STA <b data-stat="stamina">100</b></div>
        <div>Particles <b data-stat="particles">0</b></div>
        <div>Draw <b data-stat="calls">0</b></div>
      </div>

      <div class="hud__panel hud__help">
        <div><strong>Danger Room HUD (tight 6+6)</strong></div>
        <div><kbd>WASD</kbd> · <kbd>Space</kbd> jump · <kbd>1</kbd>–<kbd>4</kbd> skills · <kbd>F</kbd> residual</div>
        <div><kbd>AA</kbd>/<kbd>DD</kbd>/<kbd>WW</kbd> dodge · <kbd>X</kbd> back · <kbd>C</kbd> parry</div>
        <div><kbd>LMB</kbd> hold-draw staff: AOE · spikes · wall · stream</div>
        <div><kbd>E</kbd> guard · <kbd>R</kbd> heavy · <kbd>Q</kbd> mode · <kbd>I</kbd> Lab · <kbd>G</kbd> VFX</div>
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
              <div class="action-slot__label" data-skill-label>${meta.label}</div>
            </div>`;
        }).join('')}
        <div class="action-slot action-slot--melee" data-melee="1" style="--accent:#7dd3fc">
          <div class="action-slot__cd" data-cd-melee></div>
          <div class="action-slot__key">F</div>
          <div class="action-slot__glyph">⚔</div>
          <div class="action-slot__label">${DRC_MELEE_STRIKE.label}</div>
        </div>
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
    this._hpText = root.querySelector('[data-hp-text]');
    this._mpText = root.querySelector('[data-mp-text]');
    this._playerName = root.querySelector('[data-player-name]');
    this._portrait = root.querySelector('[data-portrait]');
    this._targetName = root.querySelector('[data-target-name]');
    this._targetHp = root.querySelector('[data-target-hp]');
    this._targetHpText = root.querySelector('[data-target-hp-text]');
    this._meleeCd = root.querySelector('[data-cd-melee]');

    // Danger Room / threejs-rapier tight bar (6+6 + avatar + orbs)
    root.classList.add('hud--tight');
    this.tightBar = new TightBar({
      host: root,
      onAction: (id) => this.onQuickAction?.(id),
      onMenu: (id) => this.onMenu?.(id)
    });

    this.refreshSkillLabels();
  }

  /** Pull labels from active DRC skill tree. */
  refreshSkillLabels() {
    const skills = getActiveSkills();
    let i = 0;
    for (const card of this.cards.values()) {
      const lab = card.querySelector('[data-skill-label]');
      const sk = skills.find((s) => s.slot === i);
      if (lab && sk) lab.textContent = sk.label;
      i++;
    }
    this.tightBar?.refreshLabels?.();
  }

  /**
   * @param {{ name?: string, raceId?: string, hp01?: number, sta01?: number }} info
   */
  setPlayerFrame(info = {}) {
    if (info.name && this._playerName) this._playerName.textContent = info.name;
    if (info.raceId && this._portrait) this._portrait.textContent = String(info.raceId).slice(0, 3);
    if (info.hp01 != null) {
      this._hp = Math.max(0, Math.min(1, info.hp01));
      if (this._hpFill) this._hpFill.style.width = `${Math.round(this._hp * 100)}%`;
      if (this._hpText) this._hpText.textContent = `${Math.round(this._hp * 100)}%`;
    }
    if (info.sta01 != null) {
      this._sta = Math.max(0, Math.min(1, info.sta01));
      if (this._mpFill) this._mpFill.style.width = `${Math.round(this._sta * 100)}%`;
      if (this._mpText) this._mpText.textContent = `${Math.round(this._sta * 100)}`;
      if (this.stats.stamina) this.stats.stamina.textContent = String(Math.round(this._sta * 100));
    }
    this.tightBar?.setState({
      character: info.name || this.tightBar.state.character,
      raceId: info.raceId || this.tightBar.state.raceId,
      health: (info.hp01 != null ? info.hp01 : this._hp) * 100,
      maxHealth: 100,
      stamina: (info.sta01 != null ? info.sta01 : this._sta) * 100,
      maxStamina: 100
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
    const slots = host.querySelectorAll('.hud-ally');
    slots.forEach((el, i) => {
      const a = allies[i];
      if (!a) {
        el.classList.add('is-empty');
        el.innerHTML = `<span>A${i + 1}</span>`;
        return;
      }
      el.classList.remove('is-empty');
      const pct = Math.round(Math.max(0, Math.min(1, a.hp01 ?? 1)) * 100);
      el.innerHTML = `<span>${a.name || a.id}</span><i style="width:${pct}%"></i>`;
    });
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
      this.blurb.textContent = 'Danger HUD · 6+6 · X/C/E/R · 1–4 · F · Q mode';
      this.actionbar?.classList.remove('is-dimmed');
      this.tightBar?.setVisible(true);
      this.refreshSkillLabels();
    } else {
      this.blurb.textContent = 'Equip / Lab Panel · race · mesh · packs';
      this.actionbar?.classList.add('is-dimmed');
      // Keep tight bar visible for reference; dim via class
      this.tightBar?.setVisible(true);
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
    if (info.stamina != null) {
      this.setPlayerFrame({ sta01: info.stamina / 100 });
    }
    if (info.cooldown01 && this._drcSession === 'combat') {
      this.setCombatHud(info.cooldown01, info.stamina, info.meleeCd01);
    }
    if (info.player) this.setPlayerFrame(info.player);
    if (info.target !== undefined) this.setTargetFrame(info.target);

    // Sync tight bar orbs + CDs every stats tick
    if (this.tightBar && info.stamina != null) {
      this.tightBar.setState({
        stamina: info.stamina,
        maxStamina: 100,
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
