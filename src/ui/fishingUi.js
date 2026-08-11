/**
 * Fishing fight HUD — bar / zone / fish pointer + progress + tension.
 */
import './fishing.css';

export class FishingUi {
  constructor(host = document.body) {
    this.root = document.createElement('div');
    this.root.className = 'fishing-hud';
    this.root.innerHTML = `
      <div class="fishing-hud__phase" data-phase>Ready</div>
      <div class="fishing-hud__bar">
        <div class="fishing-hud__zone" data-zone></div>
        <div class="fishing-hud__fish" data-fish></div>
      </div>
      <div class="fishing-hud__meters">
        <div class="fishing-hud__meter" title="Catch" data-progress-wrap><i data-progress></i></div>
        <div class="fishing-hud__meter fishing-hud__meter--tension" title="Tension" data-tension-wrap><i data-tension></i></div>
      </div>
      <div class="fishing-hud__hint" data-hint>RMB aim · LMB cast lure · S/RMB snag · wheel reel/slack</div>
      <div class="fishing-hud__catch" data-catch hidden></div>
    `;
    host.appendChild(this.root);
    this.el = {
      phase: this.root.querySelector('[data-phase]'),
      zone: this.root.querySelector('[data-zone]'),
      fish: this.root.querySelector('[data-fish]'),
      progress: this.root.querySelector('[data-progress]'),
      tension: this.root.querySelector('[data-tension]'),
      hint: this.root.querySelector('[data-hint]'),
      catch: this.root.querySelector('[data-catch]')
    };
  }

  setActive(on) {
    this.root.classList.toggle('is-active', !!on);
    if (!on) this.el.catch.hidden = true;
  }

  /**
   * @param {{
   *   phase: string,
   *   fight?: import('../fishing/fishingFight.js').FightState|null,
   *   catchLabel?: string|null,
   *   hint?: string
   * }} state
   */
  render(state) {
    const phaseLabels = {
      idle: 'Fishing · equip pole',
      aim: 'Aim · LMB cast lure',
      cast: 'Casting…',
      waiting: 'Waiting for bite…',
      bite: 'BITE! · S or RMB snag',
      fight: 'Fight · wheel reel / slack',
      won: 'Caught!',
      lost: 'Got away…'
    };
    this.el.phase.textContent = phaseLabels[state.phase] || state.phase;
    if (state.hint) this.el.hint.textContent = state.hint;

    const f = state.fight;
    if (f && (state.phase === 'fight' || state.phase === 'bite' || state.phase === 'waiting')) {
      const half = (f.zoneWidth || 0.18) * 50;
      const left = Math.max(0, (f.zoneCenter - f.zoneWidth / 2) * 100);
      this.el.zone.style.left = `${left}%`;
      this.el.zone.style.width = `${(f.zoneWidth || 0.18) * 100}%`;
      this.el.fish.style.left = `${(f.fishPos || 0.5) * 100}%`;
      this.el.progress.style.width = `${Math.round((f.progress || 0) * 100)}%`;
      this.el.tension.style.width = `${Math.round(Math.min(1, f.tension || 0) * 100)}%`;
    }

    if (state.catchLabel) {
      this.el.catch.hidden = false;
      this.el.catch.textContent = state.catchLabel;
    } else if (state.phase !== 'won') {
      this.el.catch.hidden = true;
    }
  }

  dispose() {
    this.root.remove();
  }
}
