/**
 * VFX Studio — singular tabbed authoring shell for Casting lab.
 *
 * Hosts:
 *  - Pipeline / Skill / Delivery / VFX / Linear / Samples / Export (rich UI)
 *  - Knobs tab = existing lil-gui Editor (settings.js live SSOT)
 *
 * Does not invent a second combat engine or second mixer.
 * Preview uses App hooks (VfxDirector / residual / clear).
 *
 * @see src/config/skillAuthoringSSOT.js
 * @see docs/SKILL_AUTHORING_STUDIO_SSOT.md
 */

import {
  STUDIO_TABS,
  DELIVERY_GROUPS,
  PRIMITIVE_META,
  SAMPLE_LIBRARY,
  LINEAR_FAMILIES,
  SKILL_TEMPLATE_FIELDS,
  deliveryMetaList,
  catalogByCategory,
  EFFECT_KINDS,
  DELIVERY_META
} from '../../config/skillAuthoringSSOT.js';
import { settings } from '../../config/settings.js';
import {
  applyPrimitiveToSettings,
  buildActiveKindPrefab,
  buildEffectPrefab,
  downloadJson,
  residualFromSettings
} from '../../vfx/effectPrefab.js';
import './vfxStudio.css';

/**
 * @typedef {{
 *   editor: import('../Editor.js').Editor,
 *   onToast?: (m: string) => void,
 *   onPreviewEffect?: (effectId: string) => void,
 *   onPreviewDelivery?: (pattern: string) => void,
 *   onClear?: () => void,
 *   getActiveSkill?: () => object|null
 * }} VfxStudioHooks
 */

export class VfxStudio {
  /**
   * @param {VfxStudioHooks} hooks
   */
  constructor(hooks = {}) {
    this.hooks = hooks;
    this.editor = hooks.editor;
    this._open = true;
    this._tab = 'pipeline';
    this._selectedDelivery = 'caster_to_target';
    this._selectedPrimitive = settings.effect?.activeKind || 'impact';
    this._selectedSample = null;
    this._selectedVfxId = null;
    this._skillDraft = this._defaultSkillDraft();
    this._knobsDocked = false;

    this.root = document.createElement('div');
    this.root.className = 'vfx-studio';
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-label', 'VFX Studio');
    document.body.appendChild(this.root);

    this._buildShell();
    this._bindDrag();
    this.setTab('pipeline');

    // Dock lil-gui into Knobs when first opened to that tab
    // Keep editor visible through studio until knobs dock
    if (this.editor) {
      // Hide free-floating title chrome confusion: studio is the shell
      try {
        this.editor.gui.domElement.classList.add('vfx-studio-docked');
      } catch {
        /* */
      }
    }
  }

  _defaultSkillDraft() {
    return {
      id: 'lab_skill_draft',
      label: 'Lab skill',
      style: 'spell',
      element: 'fire',
      cooldownSec: 4,
      castTimeSec: 0.6,
      manaCost: 12,
      staminaCost: 0,
      rangeM: 18,
      damage: 24,
      delivery: 'caster_to_target',
      castEffectId: 'arcane_swirl',
      travelEffectId: 'fireball',
      impactEffectId: 'inferno'
    };
  }

  _buildShell() {
    this.root.innerHTML = `
      <header class="vfx-studio__head" data-drag>
        <h2 class="vfx-studio__title">VFX Studio <span>skill · delivery · samples</span></h2>
        <button type="button" class="vfx-studio__head-btn" data-act="clear" title="Clear effects">⌀</button>
        <button type="button" class="vfx-studio__head-btn" data-act="close" title="Close (V)">×</button>
      </header>
      <nav class="vfx-studio__tabs" role="tablist"></nav>
      <div class="vfx-studio__body"></div>
      <footer class="vfx-studio__footer">
        <span data-foot-left>uMMORPG-shaped · catalog first</span>
        <span data-foot-right>settings.js live</span>
      </footer>
    `;

    const tabNav = this.root.querySelector('.vfx-studio__tabs');
    for (const t of STUDIO_TABS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'vfx-studio__tab';
      b.dataset.tab = t.id;
      b.setAttribute('role', 'tab');
      b.innerHTML = `<span class="vfx-studio__tab-icon">${t.icon}</span>${t.label}`;
      b.title = t.hint;
      b.addEventListener('click', () => this.setTab(t.id));
      tabNav.appendChild(b);
    }

    this.body = this.root.querySelector('.vfx-studio__body');
    this._panels = {};
    for (const t of STUDIO_TABS) {
      const panel = document.createElement('div');
      panel.className = 'vfx-studio__panel';
      panel.dataset.panel = t.id;
      panel.setAttribute('role', 'tabpanel');
      this.body.appendChild(panel);
      this._panels[t.id] = panel;
    }

    this._renderAllPanels();

    this.root.querySelector('[data-act="close"]').addEventListener('click', () => this.close());
    this.root.querySelector('[data-act="clear"]').addEventListener('click', () => {
      this.hooks.onClear?.();
      this.hooks.onToast?.('Effects cleared');
    });
  }

  _renderAllPanels() {
    this._renderPipeline(this._panels.pipeline);
    this._renderSkill(this._panels.skill);
    this._renderDelivery(this._panels.delivery);
    this._renderVfx(this._panels.vfx);
    this._renderLinear(this._panels.linear);
    this._renderSamples(this._panels.samples);
    this._renderKnobs(this._panels.knobs);
    this._renderExport(this._panels.export);
  }

  /* ---- panels ---- */

  _renderPipeline(el) {
    el.innerHTML = `
      <p class="vfx-studio__hint">${STUDIO_TABS.find((t) => t.id === 'pipeline').hint}</p>
      <ol class="vfx-studio__steps">
        <li><b>Catalog skill</b> — master-weaponSkills / T0 row (id · costs · style). Never invent ids.</li>
        <li><b>Delivery</b> — weapon · linear · over · under · around · aura · path (skillDelivery.js).</li>
        <li><b>Effect primitives</b> — trail · travel · cast · impact · residual · decal · aura.</li>
        <li><b>Samples</b> — mesh/orb/slash swatches → meshId + effectId bind.</li>
        <li><b>Knobs</b> — live settings.js (intensity · AOE · residual · element · post).</li>
        <li><b>Export</b> — EffectPrefab JSON → Warlords / Open client production.</li>
      </ol>
      <div class="vfx-studio__section">
        <h3 class="vfx-studio__section-title">uMMORPG ↔ Casting</h3>
        <p class="vfx-studio__hint" style="margin:0">
          ScriptableObject skill packs become <b>JSON skill rows + EffectPrefab</b>.
          Runtime only activates assets — DrcCombatController + VfxDirector + projectiles.
          No second ScriptMachine / second mixer.
        </p>
      </div>
      <div class="vfx-studio__actions">
        <button type="button" class="vfx-studio__btn vfx-studio__btn--primary" data-go="delivery">Open Delivery</button>
        <button type="button" class="vfx-studio__btn" data-go="samples">Open Samples</button>
        <button type="button" class="vfx-studio__btn" data-go="knobs">Open Knobs</button>
      </div>
    `;
    el.querySelectorAll('[data-go]').forEach((b) =>
      b.addEventListener('click', () => this.setTab(b.dataset.go))
    );
  }

  _renderSkill(el) {
    const d = this._skillDraft;
    const fields = SKILL_TEMPLATE_FIELDS.map((f) => {
      if (f.type === 'enum') {
        const opts = (f.options || []).map(
          (o) => `<option value="${o}" ${d[f.key] === o ? 'selected' : ''}>${o}</option>`
        );
        return `<div class="vfx-studio__field"><label>${f.label}</label>
          <select data-sk="${f.key}">${opts.join('')}</select></div>`;
      }
      if (f.type === 'delivery') {
        const opts = Object.keys(DELIVERY_META)
          .map(
            (id) =>
              `<option value="${id}" ${d.delivery === id || d[f.key] === id ? 'selected' : ''}>${id}</option>`
          )
          .join('');
        return `<div class="vfx-studio__field"><label>${f.label}</label>
          <select data-sk="delivery">${opts}</select></div>`;
      }
      return `<div class="vfx-studio__field"><label>${f.label}</label>
        <input data-sk="${f.key}" value="${d[f.key] ?? ''}" /></div>`;
    }).join('');

    el.innerHTML = `
      <p class="vfx-studio__hint">Scriptable skill draft (lab). Production rows stay in catalog APIs.</p>
      <div class="vfx-studio__form">${fields}</div>
      <div class="vfx-studio__actions">
        <button type="button" class="vfx-studio__btn vfx-studio__btn--primary" data-act="apply-skill">Apply delivery → settings</button>
        <button type="button" class="vfx-studio__btn" data-act="pull-active">Pull active bar skill</button>
      </div>
    `;

    el.querySelectorAll('[data-sk]').forEach((input) => {
      const sync = () => {
        const k = input.dataset.sk;
        let v = input.value;
        if (['cooldownSec', 'castTimeSec', 'manaCost', 'staminaCost', 'rangeM', 'damage'].includes(k)) {
          v = Number(v);
        }
        this._skillDraft[k] = v;
        if (k === 'delivery') this._selectedDelivery = v;
      };
      input.addEventListener('change', sync);
      input.addEventListener('input', sync);
    });

    el.querySelector('[data-act="apply-skill"]').addEventListener('click', () => {
      this._selectedDelivery = this._skillDraft.delivery;
      settings.effect = settings.effect || {};
      if (this._skillDraft.element) {
        // soft bind color by element for authoring
        const map = {
          fire: '#ff6a1e',
          ice: '#9fdcff',
          storm: '#a0d8ff',
          holy: '#fff6c0',
          arcane: '#b070ff',
          nature: '#80e060',
          water: '#60c0e0',
          earth: '#c4a574'
        };
        const c = map[String(this._skillDraft.element).toLowerCase()];
        if (c) settings.effect.color = c;
      }
      this.editor?.refresh?.();
      this.hooks.onToast?.(
        `Skill draft · ${this._skillDraft.label} · ${this._skillDraft.delivery}`
      );
      this.setTab('delivery');
    });

    el.querySelector('[data-act="pull-active"]').addEventListener('click', () => {
      const s = this.hooks.getActiveSkill?.();
      if (!s) {
        this.hooks.onToast?.('No active skill on bar');
        return;
      }
      Object.assign(this._skillDraft, {
        id: s.id || this._skillDraft.id,
        label: s.label || s.name || s.id,
        style: s.style || 'spell',
        element: s.element || '',
        cooldownSec: s.cooldownSec ?? s.cooldown ?? 4,
        castTimeSec: s.castTimeSec ?? s.castTime ?? 0.5,
        manaCost: s.manaCost ?? s.mana ?? 0,
        staminaCost: s.staminaCost ?? 0,
        rangeM: s.rangeM ?? s.range ?? 12,
        damage: s.damage ?? 0,
        castEffectId: s.castEffectId || '',
        travelEffectId: s.travelEffectId || '',
        impactEffectId: s.impactEffectId || ''
      });
      this._renderSkill(el);
      this.hooks.onToast?.(`Pulled · ${this._skillDraft.label}`);
    });
  }

  _renderDelivery(el) {
    const groups = DELIVERY_GROUPS.map((g) => {
      const sel = g.patterns.includes(this._selectedDelivery) ? ' is-selected' : '';
      return `<button type="button" class="vfx-studio__card${sel}" data-del-group="${g.id}" data-pattern="${g.patterns[0]}">
        <span class="vfx-studio__card-label">${g.label}</span>
        <span class="vfx-studio__card-meta">${g.blurb}</span>
        <span class="vfx-studio__card-meta">${g.patterns.join(' · ')}</span>
      </button>`;
    }).join('');

    const all = deliveryMetaList()
      .map((m) => {
        const sel = m.id === this._selectedDelivery ? ' is-selected' : '';
        return `<button type="button" class="vfx-studio__chip${sel}" data-pattern="${m.id}">${m.label}</button>`;
      })
      .join('');

    el.innerHTML = `
      <p class="vfx-studio__hint">Where the skill lives in space — SSOT: skillDelivery.js</p>
      <div class="vfx-studio__section">
        <h3 class="vfx-studio__section-title">Groups</h3>
        <div class="vfx-studio__grid">${groups}</div>
      </div>
      <div class="vfx-studio__section">
        <h3 class="vfx-studio__section-title">All patterns</h3>
        <div class="vfx-studio__chips">${all}</div>
      </div>
      <div class="vfx-studio__actions">
        <button type="button" class="vfx-studio__btn vfx-studio__btn--primary" data-act="preview-del">Preview pattern note</button>
      </div>
    `;

    const pick = (pattern) => {
      this._selectedDelivery = pattern;
      this._skillDraft.delivery = pattern;
      this._renderDelivery(el);
      this.hooks.onPreviewDelivery?.(pattern);
      this.hooks.onToast?.(`Delivery · ${pattern}`);
    };

    el.querySelectorAll('[data-pattern]').forEach((b) =>
      b.addEventListener('click', () => pick(b.dataset.pattern))
    );
    el.querySelector('[data-act="preview-del"]').addEventListener('click', () => {
      const meta = DELIVERY_META[this._selectedDelivery];
      this.hooks.onToast?.(meta?.description || this._selectedDelivery);
    });
  }

  _renderVfx(el) {
    const prims = EFFECT_KINDS.map((k) => {
      const m = PRIMITIVE_META[k] || { label: k, color: '#888', blurb: '' };
      const sel = k === this._selectedPrimitive ? ' is-selected' : '';
      return `<button type="button" class="vfx-studio__card${sel}" data-prim="${k}">
        <div class="vfx-studio__card-swatch" style="background:linear-gradient(135deg,${m.color},${m.color}88)"></div>
        <span class="vfx-studio__card-label">${m.label}</span>
        <span class="vfx-studio__card-meta">${m.blurb}</span>
      </button>`;
    }).join('');

    const byCat = catalogByCategory();
    let listHtml = '';
    for (const [cat, items] of Object.entries(byCat)) {
      listHtml += `<h3 class="vfx-studio__section-title">${cat}</h3><div class="vfx-studio__list">`;
      for (const e of items) {
        const hex = '#' + (e.color >>> 0).toString(16).padStart(6, '0');
        const sel = e.id === this._selectedVfxId ? ' is-selected' : '';
        listHtml += `<div class="vfx-studio__list-item${sel}" data-vfx="${e.id}">
          <span class="vfx-studio__dot" style="background:${hex}"></span>
          <span><b>${e.name}</b><br/><span class="vfx-studio__card-meta">${e.id} · ${e.tags?.slice(0, 3).join(', ')}</span></span>
        </div>`;
      }
      listHtml += '</div>';
    }

    el.innerHTML = `
      <p class="vfx-studio__hint">Primitives + VfxDirector catalog (sandbox Alt+V/B/F/G/T/C ids)</p>
      <div class="vfx-studio__section">
        <h3 class="vfx-studio__section-title">Primitives</h3>
        <div class="vfx-studio__grid">${prims}</div>
      </div>
      <div class="vfx-studio__section">
        <h3 class="vfx-studio__section-title">Catalog</h3>
        ${listHtml}
      </div>
    `;

    el.querySelectorAll('[data-prim]').forEach((b) =>
      b.addEventListener('click', () => {
        const k = b.dataset.prim;
        this._selectedPrimitive = k;
        settings.effect.activeKind = k;
        if (k === 'residual') {
          /* residual knobs already in settings.residual */
        }
        applyPrimitiveToSettings({
          kind: k,
          intensity: settings.effect.intensity,
          aoe: settings.effect.aoe,
          speed: settings.effect.speed,
          size: settings.effect.size,
          color: settings.effect.color,
          meshId: settings.effect.meshId,
          duration: settings.effect.duration,
          attach: settings.effect.attach
        });
        this.editor?.refresh?.();
        this._renderVfx(el);
        this.hooks.onToast?.(`Primitive · ${k}`);
      })
    );

    el.querySelectorAll('[data-vfx]').forEach((b) =>
      b.addEventListener('click', () => {
        const id = b.dataset.vfx;
        this._selectedVfxId = id;
        this.hooks.onPreviewEffect?.(id);
        this.hooks.onToast?.(`Preview · ${id}`);
        this._renderVfx(el);
      })
    );
  }

  _renderLinear(el) {
    const cards = LINEAR_FAMILIES.map((f) => {
      return `<button type="button" class="vfx-studio__card" data-lin="${f.id}">
        <span class="vfx-studio__card-label">${f.label}</span>
        <span class="vfx-studio__card-meta">${f.element} · ${f.delivery}</span>
      </button>`;
    }).join('');

    el.innerHTML = `
      <p class="vfx-studio__hint">Linear skillshots — elementalLinearCast + caster_to_target / over / under</p>
      <div class="vfx-studio__grid">${cards}</div>
      <div class="vfx-studio__actions">
        <button type="button" class="vfx-studio__btn" data-act="lin-ice">Preview ice-style color</button>
        <button type="button" class="vfx-studio__btn" data-act="lin-fire">Preview fire-style color</button>
      </div>
    `;

    el.querySelectorAll('[data-lin]').forEach((b) =>
      b.addEventListener('click', () => {
        const f = LINEAR_FAMILIES.find((x) => x.id === b.dataset.lin);
        if (!f) return;
        this._selectedDelivery = f.delivery;
        this._skillDraft.element = f.element;
        this._skillDraft.delivery = f.delivery;
        const map = {
          ice: '#9fdcff',
          fire: '#ff6a1e',
          storm: '#a0d8ff',
          arcane: '#b070ff',
          nature: '#80e060'
        };
        if (map[f.element]) settings.effect.color = map[f.element];
        settings.effect.activeKind = f.delivery === 'over_target' ? 'impact' : 'travel';
        this.editor?.refresh?.();
        this.hooks.onToast?.(`Linear · ${f.label}`);
      })
    );

    el.querySelector('[data-act="lin-ice"]').addEventListener('click', () => {
      settings.effect.color = '#9fdcff';
      this.editor?.refresh?.();
      this.hooks.onPreviewEffect?.('frost_wave');
    });
    el.querySelector('[data-act="lin-fire"]').addEventListener('click', () => {
      settings.effect.color = '#ff6a1e';
      this.editor?.refresh?.();
      this.hooks.onPreviewEffect?.('inferno');
    });
  }

  _renderSamples(el) {
    const cards = SAMPLE_LIBRARY.map((s) => {
      const g = `linear-gradient(145deg, ${s.swatch[0]} 0%, ${s.swatch[1]} 55%, ${s.swatch[2]} 100%)`;
      const sel = s.id === this._selectedSample ? ' is-selected' : '';
      return `<button type="button" class="vfx-studio__card${sel}" data-sample="${s.id}">
        <div class="vfx-studio__card-swatch" style="background:${g}" title="${s.path}"></div>
        <span class="vfx-studio__card-label">${s.label}</span>
        <span class="vfx-studio__card-meta">${s.tags.join(' · ')}</span>
      </button>`;
    }).join('');

    el.innerHTML = `
      <p class="vfx-studio__hint">Texture / mesh samples — pick to set meshId + color for authoring</p>
      <div class="vfx-studio__grid vfx-studio__grid--3">${cards}</div>
      <p class="vfx-studio__hint" style="margin-top:0.6rem">
        Paths under <code>public/models/vfx/</code>. Slash variants are catalog mesh ids (not always local GLB).
      </p>
    `;

    el.querySelectorAll('[data-sample]').forEach((b) =>
      b.addEventListener('click', () => {
        const s = SAMPLE_LIBRARY.find((x) => x.id === b.dataset.sample);
        if (!s) return;
        this._selectedSample = s.id;
        settings.effect.meshId = s.id;
        if (s.swatch?.[0]) settings.effect.color = s.swatch[0];
        // residual slash variants
        if (s.id.startsWith('slash') && settings.residual) {
          settings.residual.variant = s.id;
          settings.residual.color = s.swatch[0];
        }
        this.editor?.refresh?.();
        this._renderSamples(el);
        this.hooks.onToast?.(`Sample · ${s.label} → meshId`);
      })
    );
  }

  _renderKnobs(el) {
    el.innerHTML = `
      <p class="vfx-studio__hint">Live knobs — same settings.js fields the frame loop reads. No rebuild.</p>
      <div class="vfx-studio__knobs-host" data-knobs-host></div>
    `;
    this._dockEditor(el.querySelector('[data-knobs-host]'));
  }

  _dockEditor(host) {
    if (!this.editor?.gui?.domElement || !host) return;
    const guiEl = this.editor.gui.domElement;
    if (guiEl.parentElement !== host) {
      host.appendChild(guiEl);
      guiEl.classList.add('vfx-studio-docked');
      this._knobsDocked = true;
    }
    // Ensure visible when studio open
    this.editor.gui.show(this._open);
    this._hiddenGuiSync = true;
  }

  _renderExport(el) {
    el.innerHTML = `
      <p class="vfx-studio__hint">Export EffectPrefab packs for client production (Warlords / Open).</p>
      <div class="vfx-studio__section">
        <h3 class="vfx-studio__section-title">Current draft</h3>
        <pre style="font-size:0.65rem;opacity:0.8;overflow:auto;max-height:120px;background:rgba(0,0,0,0.3);padding:0.5rem;border-radius:6px;margin:0" data-export-preview></pre>
      </div>
      <div class="vfx-studio__actions">
        <button type="button" class="vfx-studio__btn vfx-studio__btn--primary" data-exp="solo">Export active kind</button>
        <button type="button" class="vfx-studio__btn" data-exp="melee">Export melee residual</button>
        <button type="button" class="vfx-studio__btn" data-exp="fire">Export fire bolt</button>
        <button type="button" class="vfx-studio__btn" data-exp="pack">Export skill pack</button>
      </div>
    `;

    const prev = el.querySelector('[data-export-preview]');
    try {
      const snap = {
        skillDraft: this._skillDraft,
        delivery: this._selectedDelivery,
        primitive: this._selectedPrimitive,
        residual: residualFromSettings(),
        effect: { ...settings.effect }
      };
      prev.textContent = JSON.stringify(snap, null, 2);
    } catch {
      prev.textContent = '{}';
    }

    el.querySelector('[data-exp="solo"]').addEventListener('click', () => {
      const prefab = buildActiveKindPrefab();
      downloadJson(prefab, `${prefab.id}.json`);
      this.hooks.onToast?.(`Exported ${prefab.id}`);
    });
    el.querySelector('[data-exp="melee"]').addEventListener('click', () => {
      const prefab = buildEffectPrefab('drc_melee_strike');
      downloadJson(prefab, 'prefab_drc_melee_strike.json');
      this.hooks.onToast?.('Exported melee residual');
    });
    el.querySelector('[data-exp="fire"]').addEventListener('click', () => {
      const prefab = buildEffectPrefab('drc_fire_bolt');
      downloadJson(prefab, 'prefab_drc_fire_bolt.json');
      this.hooks.onToast?.('Exported fire bolt');
    });
    el.querySelector('[data-exp="pack"]').addEventListener('click', () => {
      const ids = [
        'drc_melee_strike',
        'drc_fire_bolt',
        'drc_water_lash',
        'drc_earth_spike',
        'drc_wind_tempest'
      ];
      const pack = {
        source: 'casting-lab-vfx-studio',
        version: '1.1.0',
        skillDraft: this._skillDraft,
        delivery: this._selectedDelivery,
        exportedAt: new Date().toISOString(),
        prefabs: ids.map((id) => buildEffectPrefab(id))
      };
      downloadJson(pack, 'casting-effect-prefabs.json');
      this.hooks.onToast?.(`Exported pack ×${pack.prefabs.length}`);
    });
  }

  /* ---- chrome ---- */

  setTab(id) {
    if (!this._panels[id]) return;
    this._tab = id;
    this.root.querySelectorAll('.vfx-studio__tab').forEach((t) => {
      t.classList.toggle('is-active', t.dataset.tab === id);
    });
    Object.entries(this._panels).forEach(([k, p]) => {
      p.classList.toggle('is-active', k === id);
    });
    const foot = this.root.querySelector('[data-foot-right]');
    if (foot) foot.textContent = STUDIO_TABS.find((t) => t.id === id)?.hint?.slice(0, 42) || '';

    if (id === 'knobs') {
      this._renderKnobs(this._panels.knobs);
      this.editor?.gui?.show?.(this._open);
    } else if (this._knobsDocked) {
      // Keep docked DOM hidden with panel; no free-float
      this.editor?.gui?.show?.(false);
    }
    if (id === 'export') {
      this._renderExport(this._panels.export);
    }
    document.body.classList.toggle('vfx-studio-open', this._open);
  }

  open() {
    this._open = true;
    this.root.classList.remove('is-hidden');
    // Keep lil-gui docked in Knobs panel (hidden until that tab) — never free-float
    if (!this._knobsDocked) {
      this._renderKnobs(this._panels.knobs);
    }
    // Only show gui chrome when Knobs tab active (avoids empty floating panel)
    this.editor?.gui?.show?.(this._tab === 'knobs');
    document.body.classList.add('vfx-studio-open');
  }

  close() {
    this._open = false;
    this.root.classList.add('is-hidden');
    this.editor?.close?.();
    document.body.classList.remove('vfx-studio-open');
  }

  toggle() {
    if (this._open) this.close();
    else this.open();
  }

  get isOpen() {
    return this._open;
  }

  refresh() {
    this.editor?.refresh?.();
    if (this._tab === 'export') this._renderExport(this._panels.export);
  }

  _bindDrag() {
    const head = this.root.querySelector('[data-drag]');
    let ox = 0;
    let oy = 0;
    let dragging = false;
    head.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button')) return;
      dragging = true;
      const r = this.root.getBoundingClientRect();
      ox = e.clientX - r.left;
      oy = e.clientY - r.top;
      head.setPointerCapture(e.pointerId);
    });
    head.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const x = Math.max(0, Math.min(window.innerWidth - 80, e.clientX - ox));
      const y = Math.max(0, Math.min(window.innerHeight - 80, e.clientY - oy));
      this.root.style.left = `${x}px`;
      this.root.style.top = `${y}px`;
      this.root.style.right = 'auto';
    });
    head.addEventListener('pointerup', () => {
      dragging = false;
    });
  }

  dispose() {
    // Return gui to body if docked
    try {
      const guiEl = this.editor?.gui?.domElement;
      if (guiEl && guiEl.parentElement !== document.body) {
        document.body.appendChild(guiEl);
      }
    } catch {
      /* */
    }
    this.root.remove();
    document.body.classList.remove('vfx-studio-open');
  }
}

export default VfxStudio;
