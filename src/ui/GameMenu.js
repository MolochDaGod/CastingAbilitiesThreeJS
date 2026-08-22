/**
 * Esc game menu — CraftPix window chrome. Not a second HUD.
 * Resume · Character · Equipment · Inventory · Settings · Hotkeys · Help
 */
import { craftpixUrl } from './craftpixUi.js';
import './game-menu.css';

export class GameMenu {
  /**
   * @param {{
   *   onResume?: () => void,
   *   onOpenPanel?: (tab: string) => void,
   *   onHelp?: () => void,
   * }} opts
   */
  constructor(opts = {}) {
    this.onResume = opts.onResume || (() => {});
    this.onOpenPanel = opts.onOpenPanel || (() => {});
    this.onHelp = opts.onHelp || (() => {});
    this.open = false;
    this.el = document.createElement('div');
    this.el.className = 'gm-root is-hidden';
    this.el.setAttribute('role', 'dialog');
    this.el.innerHTML = `
      <div class="gm-veil" data-gm-veil></div>
      <div class="gm-window">
        <header class="gm-head">Menu</header>
        <nav class="gm-nav">
          <button type="button" class="gm-btn" data-gm="resume">Resume</button>
          <button type="button" class="gm-btn" data-gm="character">Character</button>
          <button type="button" class="gm-btn" data-gm="equip">Equipment</button>
          <button type="button" class="gm-btn" data-gm="inventory">Inventory</button>
          <button type="button" class="gm-btn" data-gm="settings">Settings</button>
          <button type="button" class="gm-btn" data-gm="hotkeys">Hotkeys</button>
          <button type="button" class="gm-btn" data-gm="help">Help</button>
        </nav>
        <p class="gm-foot">CraftPix MMO · ui.grudge-studio.com</p>
      </div>
    `;
    this.el.style.setProperty('--gm-header', `url("${craftpixUrl('window/header.png')}")`);
    this.el.style.setProperty('--gm-btn', `url("${craftpixUrl('btn/bg.png')}")`);
    this.el.style.setProperty('--gm-panel', `url("${craftpixUrl('panel/bg.png')}")`);
    document.body.appendChild(this.el);

    this.el.querySelector('[data-gm-veil]')?.addEventListener('click', () => this.setOpen(false));
    this.el.querySelectorAll('[data-gm]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.gm;
        if (id === 'resume') {
          this.setOpen(false);
          this.onResume();
          return;
        }
        if (id === 'help') {
          this.setOpen(false);
          this.onHelp();
          return;
        }
        this.setOpen(false);
        this.onOpenPanel(id);
      });
    });
  }

  toggle() {
    this.setOpen(!this.open);
  }

  setOpen(on) {
    this.open = !!on;
    this.el.classList.toggle('is-hidden', !this.open);
  }
}
