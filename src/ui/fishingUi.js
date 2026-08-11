/**
 * Fishing fight HUD — bar / zone / fish pointer + progress + tension
 * + profession strip (level · rod · nautical · SWG RGB meals).
 */
import './fishing.css';

export class FishingUi {
  constructor(host = document.body) {
    this.root = document.createElement('div');
    this.root.className = 'fishing-hud';
    this.root.innerHTML = `
      <div class="fishing-hud__prof" data-prof hidden></div>
      <div class="fishing-hud__meals" data-meals>
        <span class="meal-slot meal-slot--red" data-meal-red title="Red food">R</span>
        <span class="meal-slot meal-slot--green" data-meal-green title="Green food">G</span>
        <span class="meal-slot meal-slot--blue" data-meal-blue title="Blue food">B</span>
      </div>
      <div class="fishing-hud__phase" data-phase>Ready</div>
      <div class="fishing-hud__bar">
        <div class="fishing-hud__zone" data-zone></div>
        <div class="fishing-hud__fish" data-fish></div>
      </div>
      <div class="fishing-hud__meters">
        <div class="fishing-hud__meter" title="Catch" data-progress-wrap><i data-progress></i></div>
        <div class="fishing-hud__meter fishing-hud__meter--tension" title="Tension" data-tension-wrap><i data-tension></i></div>
      </div>
      <div class="fishing-hud__hint" data-hint>Shift+F fish · RMB aim · LMB cast · S snag · wheel reel</div>
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
      catch: this.root.querySelector('[data-catch]'),
      prof: this.root.querySelector('[data-prof]'),
      mealRed: this.root.querySelector('[data-meal-red]'),
      mealGreen: this.root.querySelector('[data-meal-green]'),
      mealBlue: this.root.querySelector('[data-meal-blue]')
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
   *   hint?: string,
   *   prof?: {
   *     level?: number,
   *     xp?: number,
   *     skillPoints?: number,
   *     pole?: string,
   *     nautical?: number,
   *     meals?: object
   *   }
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

    if (state.prof) {
      this.el.prof.hidden = false;
      const n = state.prof.nautical != null ? ` · ⛵×${Number(state.prof.nautical).toFixed(2)}` : '';
      const lure = state.prof.lure ? ` · ${state.prof.lure}` : '';
      const sz = state.prof.maxSize != null ? ` · size≤${state.prof.maxSize}` : '';
      this.el.prof.textContent = `Lv ${state.prof.level || 1} · ${state.prof.pole || 'rod'}${lure}${sz} · SP ${state.prof.skillPoints ?? 0}${n}`;
      this._paintMeals(state.prof.meals);
    }

    const f = state.fight;
    if (f && (state.phase === 'fight' || state.phase === 'bite' || state.phase === 'waiting')) {
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

  _paintMeals(meals) {
    if (!meals) return;
    for (const [c, el] of [
      ['red', this.el.mealRed],
      ['green', this.el.mealGreen],
      ['blue', this.el.mealBlue]
    ]) {
      const m = meals[c];
      el.classList.toggle('is-on', !!m);
      el.title = m ? `${m.label} (${c})` : `${c} food empty`;
      el.textContent = m ? m.label.slice(0, 1) : c[0].toUpperCase();
    }
  }

  dispose() {
    this.root.remove();
  }
}
