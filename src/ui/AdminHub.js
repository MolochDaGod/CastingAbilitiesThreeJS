/**
 * Admin Hub F1–F4 + ] World — tools / editors for prefab create, saves, deployables.
 *
 * F1 Player · F2 Assets · F3 Creatures · F4 Prefabs · ] World (not F5)
 * Esc closes · ? = keyboard help · ` = auto run / freeride sail
 *
 * Extends prefabScaffold + deployableContract — no parallel catalog mint.
 *
 * @see docs/ADMIN_HUB_F1_F5_SSOT.md
 */

import './adminHub.css';
import {
  ADMIN_TABS,
  DEPLOYABLE_KINDS,
  BUILDABLE_PURPOSES,
  CREATURE_ROLES,
  AI_BRAINS,
  DEPLOYABLE_ENDPOINTS,
  kindsForAdminTab,
  validateDeployableDraft
} from '../api/deployableContract.js';
import {
  listDrafts,
  getDraft,
  saveDraft,
  deleteDraft,
  createAndSaveDraft,
  duplicateDraft,
  downloadDraftExport,
  importDraftJson,
  draftStats
} from '../api/prefabDraftStore.js';
import {
  loadPrefabScaffold,
  buildItemScaffoldPack,
  downloadJson,
  SCAFFOLD_ENDPOINTS
} from '../api/prefabScaffold.js';
import {
  ensureWeaponCatalog,
  listEquippableWeapons,
  equipWeaponById
} from '../combat/equippedWeaponRuntime.js';
import {
  measureWeaponScale,
  importWeaponGlb,
  assignModelToDraft,
  equipWeaponForLab,
  setLiveWeaponScale,
  setLiveWeaponAppearance,
  formatScaleReadout
} from '../equipment/weaponPrefabLab.js';
import { getAppearance } from '../equipment/meshAppearance.js';
import { PREFAB_CATEGORIES, ITEM_BROWSER_URL, WEAPON_SKILLS_HTML } from '../api/gameItemCatalog.js';
import { raceDef, RACES as RACE_MAP, DEFAULT_RACE } from '../config/grudge6SSOT.js';

const RACE_IDS = Object.keys(RACE_MAP || { WK: 1 });

export class AdminHub {
  /**
   * @param {object} [opts]
   * @param {object} [opts.character]
   * @param {() => object|null} [opts.getDrc]
   * @param {(msg: string) => void} [opts.onToast]
   * @param {() => void} [opts.onOpenInventoryPrefabs]
   * @param {() => void} [opts.onHelp]
   * @param {object} [opts.session]
   * @param {(n?: number) => void|Promise<void>} [opts.spawnLoot]
   * @param {() => void|Promise<void>} [opts.respawnHarvest]
   * @param {() => void|Promise<void>} [opts.equipHarvestTool]
   * @param {() => void|Promise<void>} [opts.respawnDummies]
   */
  constructor(opts = {}) {
    this.character = opts.character || null;
    this.getDrc = opts.getDrc || (() => null);
    this.onToast = opts.onToast || (() => {});
    this.onOpenInventoryPrefabs = opts.onOpenInventoryPrefabs || null;
    this.onHelp = opts.onHelp || null;
    this.session = opts.session || null;
    this.spawnLoot = opts.spawnLoot || null;
    this.respawnHarvest = opts.respawnHarvest || null;
    this.equipHarvestTool = opts.equipHarvestTool || null;
    this.respawnDummies = opts.respawnDummies || null;

    this.open = false;
    this._tab = 'prefabs';
    /** @type {object|null} */
    this._selected = null;
    this._kind = 'weapon';
    this._form = {
      name: '',
      purpose: 'structure',
      role: 'enemy',
      raceId: DEFAULT_RACE || 'WK',
      brain: 'guard'
    };
    this._scaffold = null;

    this.el = document.createElement('div');
    this.el.id = 'admin-hub';
    this.el.className = 'admin-hub';
    this.el.hidden = true;
    document.body.appendChild(this.el);

    this.chips = document.createElement('div');
    this.chips.className = 'admin-hub-chips';
    this.chips.setAttribute('aria-label', 'Admin F1–F4 · ] World');
    document.body.appendChild(this.chips);

    this._renderChips();
    this._renderShell();
  }

  _renderChips() {
    this.chips.innerHTML = ADMIN_TABS.map(
      (t) =>
        `<button type="button" class="admin-hub-chip" data-tab="${t.id}" title="${t.blurb}"><kbd>${t.key}</kbd>${t.label}</button>`
    ).join('');
    this.chips.querySelectorAll('[data-tab]').forEach((btn) => {
      btn.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        e.preventDefault();
        this.openTab(btn.dataset.tab);
      });
    });
  }

  _renderShell() {
    this.el.innerHTML = `
      <header class="admin-hub__head">
        <div>
          <h2>Admin Hub</h2>
          <p class="admin-hub__sub" data-sub>Tools · editors · prefab create/save · deployables</p>
        </div>
        <button type="button" class="admin-hub__close" data-close aria-label="Close">×</button>
      </header>
      <nav class="admin-hub__tabs" data-tabs></nav>
      <div class="admin-hub__body" data-body></div>
      <footer class="admin-hub__foot">
        <span><kbd>F1</kbd>-<kbd>F4</kbd> · <kbd>]</kbd> World · <kbd>Esc</kbd> close · <kbd>?</kbd> help · <kbd>&#96;</kbd> auto</span>
        <span data-stats></span>
      </footer>
    `;
    this.el.querySelector('[data-close]').addEventListener('click', () => this.setOpen(false));
    this.el.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.el.addEventListener('wheel', (e) => e.stopPropagation());
    this._paintTabs();
  }

  _paintTabs() {
    const nav = this.el.querySelector('[data-tabs]');
    if (!nav) return;
    nav.innerHTML = ADMIN_TABS.map(
      (t) =>
        `<button type="button" class="admin-hub__tab ${t.id === this._tab ? 'is-active' : ''}" data-tab="${t.id}"><kbd>${t.key}</kbd>${t.label}</button>`
    ).join('');
    nav.querySelectorAll('[data-tab]').forEach((btn) => {
      btn.addEventListener('click', () => this.openTab(btn.dataset.tab));
    });
    this.chips.querySelectorAll('[data-tab]').forEach((b) => {
      b.classList.toggle('is-active', this.open && b.dataset.tab === this._tab);
    });
  }

  toggle() {
    this.setOpen(!this.open);
  }

  setOpen(open) {
    this.open = !!open;
    this.el.hidden = !this.open;
    if (this.open) this.refresh();
    else this._paintTabs();
  }

  /**
   * Open hub on a tab. Same key toggles close if already on that tab.
   * @param {string} tabId
   */
  openTab(tabId) {
    const tab = ADMIN_TABS.find((t) => t.id === tabId);
    if (!tab) return;
    if (this.open && this._tab === tabId) {
      this.setOpen(false);
      return;
    }
    this._tab = tabId;
    // default create kind for tab
    const kinds = kindsForAdminTab(tabId);
    if (kinds.length) this._kind = kinds[0].id;
    this.setOpen(true);
  }

  /**
   * Hotkey by key label or KeyboardEvent.code.
   * @param {string} key  'F1'..'F4' | ']' | 'BracketRight'
   */
  openByKey(key) {
    const k = String(key || '');
    // F5 intentionally unbound — World is ]
    if (k === 'F5') return;
    const tab = ADMIN_TABS.find((t) => t.key === k || t.keyCode === k);
    if (tab) this.openTab(tab.id);
  }

  refresh() {
    if (!this.open) return;
    this._paintTabs();
    const meta = ADMIN_TABS.find((t) => t.id === this._tab);
    const sub = this.el.querySelector('[data-sub]');
    if (sub && meta) sub.textContent = meta.blurb;
    const stats = draftStats();
    const st = this.el.querySelector('[data-stats]');
    if (st) st.textContent = `Drafts ${stats.total}/${stats.max}`;

    const body = this.el.querySelector('[data-body]');
    if (!body) return;
    switch (this._tab) {
      case 'player':
        body.innerHTML = this._htmlPlayer();
        this._bindPlayer(body);
        break;
      case 'assets':
        body.innerHTML = this._htmlCreateSave('assets');
        this._bindCreateSave(body, 'assets');
        break;
      case 'creatures':
        body.innerHTML = this._htmlCreateSave('creatures');
        this._bindCreateSave(body, 'creatures');
        break;
      case 'prefabs':
        body.innerHTML = this._htmlPrefabs();
        this._bindPrefabs(body);
        break;
      case 'world':
        body.innerHTML = this._htmlWorld();
        this._bindWorld(body);
        break;
      default:
        body.innerHTML = '<p class="admin-hint">Unknown tab</p>';
    }
  }

  /* ── F1 Player ─────────────────────────────────────────────── */

  _htmlPlayer() {
    const c = this.character;
    const s = c?.getLabSummary?.() || {};
    const snap = this.session?.snapshot?.() || {};
    const eq = c?.equipment?.loadout || {};
    const raceOpts = RACE_IDS.map((rid) => {
      const lab = raceDef?.(rid)?.label || rid;
      return `<option value="${rid}" ${s.raceId === rid ? 'selected' : ''}>${lab}</option>`;
    }).join('');

    const act = typeof window !== 'undefined' ? window.app?.activityMode || 'combat' : 'combat';
    return `
      <div class="admin-card">
        <h3>Hero session</h3>
        <div class="admin-row"><span>Race</span><b>${s.raceLabel || s.raceId || '—'}</b></div>
        <div class="admin-row"><span>Height</span><b>${(s.heightM ?? 0).toFixed?.(2) ?? s.heightM ?? '—'} m</b></div>
        <div class="admin-row"><span>Cast mode</span><b>${snap.mode || '—'}</b></div>
        <div class="admin-row"><span>Activity</span><b>${act} · Hold Q radial</b></div>
        <div class="admin-row"><span>DRC</span><b>${snap.drc || '—'} · Shift+Q equip</b></div>
        <div class="admin-row"><span>Anim pack</span><b>${s.animPackId || '—'}</b></div>
        <div class="admin-row"><span>Main hand</span><b>${eq.mainHand || s.weaponSlot || '—'}</b></div>
        <div class="admin-row"><span>Back slot</span><b>windsurf vehicle</b></div>
      </div>
      <div class="admin-card">
        <h3>Activity · equipment</h3>
        <p class="admin-hint">Hold Q = mode radial · Tap Q combat = weapon 1↔2 · Hold R harvest tools · F nearest · I paperdoll.</p>
        <label class="admin-label">Race kit
          <select data-race>${raceOpts || '<option value="WK">WK</option>'}</select>
        </label>
        <div class="admin-btn-row">
          <button type="button" class="admin-btn admin-btn--primary" data-act="open-lab">Main Panel · Character</button>
          <button type="button" class="admin-btn" data-act="mode-combat">Combat</button>
          <button type="button" class="admin-btn" data-act="mode-harvest">Harvest</button>
        </div>
        <div class="admin-btn-row">
          <button type="button" class="admin-btn" data-act="equip-t0-sword">T0 Sword</button>
          <button type="button" class="admin-btn" data-act="equip-t0-tool">T0 Tool (pick)</button>
          <button type="button" class="admin-btn" data-act="equip-t0-wand">T0 Wand</button>
          <button type="button" class="admin-btn" data-act="open-slots">Slot admin</button>
        </div>
      </div>
      <div class="admin-card">
        <h3>Main Panel · inventory / equipment</h3>
        <p class="admin-hint">LMB pick · <b>RMB item menu</b> (Equip/Unequip/Split/Drop) · paperdoll slots · bag · mini bag (B) · API tab = fleet panel + Railway.</p>
        <div class="admin-btn-row">
          <button type="button" class="admin-btn" data-act="open-character">Paperdoll</button>
          <button type="button" class="admin-btn" data-act="open-inventory">Inventory · RMB</button>
          <button type="button" class="admin-btn" data-act="open-api">API / production UI</button>
          <button type="button" class="admin-btn" data-act="open-professions">Professions</button>
          <button type="button" class="admin-btn" data-act="open-bag">Mini bag (B)</button>
          <a class="admin-btn admin-btn--ghost" href="https://ui.grudge-studio.com/main-panel.html?era=warlords&amp;embed=1&amp;tab=equipment" target="_blank" rel="noopener">ui Equipment ↗</a>
          <a class="admin-btn admin-btn--ghost" href="https://grudgewarlords.com/craft/" target="_blank" rel="noopener">Craft ↗</a>
        </div>
      </div>
      <div class="admin-card">
        <h3>Windsurf / freeride</h3>
        <p class="admin-hint">M Surf mode · Space deploy · W thrust · coast on water · Space hop · E dismount · ranged = non-focus path cast on board.</p>
        <div class="admin-btn-row">
          <button type="button" class="admin-btn" data-act="surf-mode">Enter Surf (M)</button>
        </div>
      </div>
      <div class="admin-card">
        <h3>Identity / fleet</h3>
        <p class="admin-hint">Player · bag · wallet = Railway. Lab drafts local. Catalog = ObjectStore.</p>
        <div class="admin-btn-row">
          <a class="admin-btn admin-btn--ghost" href="https://character.grudge-studio.com/foundry" target="_blank" rel="noopener">Foundry ↗</a>
          <a class="admin-btn admin-btn--ghost" href="https://id.grudge-studio.com" target="_blank" rel="noopener">Grudge ID ↗</a>
        </div>
      </div>
    `;
  }

  _bindPlayer(body) {
    body.querySelector('[data-act="open-lab"]')?.addEventListener('click', () => {
      this.setOpen(false);
      window.__castingInventory?.openTab?.('character');
    });
    body.querySelector('[data-act="open-character"]')?.addEventListener('click', () => {
      this.setOpen(false);
      window.__castingInventory?.openTab?.('character');
    });
    body.querySelector('[data-act="open-api"]')?.addEventListener('click', () => {
      this.setOpen(false);
      window.__castingInventory?.openTab?.('api');
    });
    body.querySelector('[data-act="open-slots"]')?.addEventListener('click', () => {
      this.setOpen(false);
      if (typeof window !== 'undefined' && window.__castingInventory?.openTab) {
        window.__castingInventory.openTab('slots');
      } else {
        this.onOpenInventoryPrefabs?.();
      }
    });
    body.querySelector('[data-act="open-inventory"]')?.addEventListener('click', () => {
      this.setOpen(false);
      window.__castingInventory?.openTab?.('inventory');
    });
    body.querySelector('[data-act="open-professions"]')?.addEventListener('click', () => {
      this.setOpen(false);
      window.__castingInventory?.openTab?.('professions');
    });
    body.querySelector('[data-act="equip-t0-sword"]')?.addEventListener('click', async () => {
      try {
        await ensureWeaponCatalog();
        await equipWeaponById('t0-sword', {
          character: this.character,
          onToast: this.onToast
        });
        this.onToast('Equipped T0 Training Sword');
      } catch (e) {
        this.onToast(e?.message || 'Equip failed');
      }
    });
    body.querySelector('[data-act="equip-t0-tool"]')?.addEventListener('click', async () => {
      try {
        await ensureWeaponCatalog();
        await equipWeaponById('t0-tool', {
          character: this.character,
          onToast: this.onToast
        });
        this.onToast('Equipped T0 Tool · F harvest');
      } catch (e) {
        this.onToast(e?.message || 'Equip failed');
      }
    });
    body.querySelector('[data-act="equip-t0-wand"]')?.addEventListener('click', async () => {
      try {
        await ensureWeaponCatalog();
        await equipWeaponById('t0-wand', {
          character: this.character,
          onToast: this.onToast
        });
        this.onToast('Equipped T0 Wand · freeride path cast OK');
      } catch (e) {
        this.onToast(e?.message || 'Equip failed');
      }
    });
    body.querySelector('[data-act="mode-combat"]')?.addEventListener('click', () => {
      window.app?.setActivityMode?.('combat');
      this.onToast('Activity · COMBAT');
      this.refresh();
    });
    body.querySelector('[data-act="mode-harvest"]')?.addEventListener('click', () => {
      window.app?.setActivityMode?.('harvest');
      this.onToast('Activity · HARVEST');
      this.refresh();
    });
    body.querySelector('[data-act="open-bag"]')?.addEventListener('click', () => {
      this.setOpen(false);
      window.app?.dropBag?.toggle?.();
    });
    body.querySelector('[data-act="surf-mode"]')?.addEventListener('click', () => {
      this.setOpen(false);
      window.app?.setMode?.('walk');
      this.onToast('Surf · Space deploy windsurf');
    });
    body.querySelector('[data-race]')?.addEventListener('change', async (e) => {
      const id = e.target.value;
      try {
        await this.character?.setRace?.(id);
        this.onToast(`Race · ${raceDef?.(id)?.label || id}`);
        this.refresh();
      } catch (err) {
        this.onToast(err?.message || 'Race failed');
      }
    });
  }

  /* ── F2 / F3 create + save ─────────────────────────────────── */

  _htmlCreateSave(tabId) {
    const kinds = kindsForAdminTab(tabId);
    if (!kinds.find((k) => k.id === this._kind)) this._kind = kinds[0]?.id || 'buildable';
    const drafts = listDrafts({ adminTab: tabId });
    const sel = this._selected && this._selected.adminTab === tabId ? this._selected : null;
    const val = sel ? validateDeployableDraft(sel) : null;

    const kindOpts = kinds
      .map((k) => `<option value="${k.id}" ${k.id === this._kind ? 'selected' : ''}>${k.label}</option>`)
      .join('');

    let extraFields = '';
    if (tabId === 'assets') {
      const purp = BUILDABLE_PURPOSES.map(
        (p) =>
          `<option value="${p.id}" ${this._form.purpose === p.id ? 'selected' : ''}>${p.label}</option>`
      ).join('');
      extraFields = `
        <label class="admin-label">Purpose
          <select data-field="purpose">${purp}</select>
        </label>
        <p class="admin-hint">Scripts + purpose define place / interact / harvest jobs. Not decoration-only unless purpose=decoration.</p>
      `;
    }
    if (tabId === 'creatures') {
      const roles = CREATURE_ROLES.map(
        (r) =>
          `<option value="${r.id}" ${this._form.role === r.id ? 'selected' : ''}>${r.label}</option>`
      ).join('');
      const brains = AI_BRAINS.map(
        (b) =>
          `<option value="${b.id}" ${this._form.brain === b.id ? 'selected' : ''}>${b.label}</option>`
      ).join('');
      const races = RACE_IDS.map(
        (r) =>
          `<option value="${r}" ${this._form.raceId === r ? 'selected' : ''}>${raceDef?.(r)?.label || r}</option>`
      ).join('');
      extraFields = `
        <label class="admin-label">Role
          <select data-field="role">${roles}</select>
        </label>
        <label class="admin-label">Race kit
          <select data-field="raceId">${races}</select>
        </label>
        <label class="admin-label">AI brain
          <select data-field="brain">${brains}</select>
        </label>
        <p class="admin-hint">Models + anim packs + AI brains. CDN: grudge6 race GLBs. Training dummy role for arena targets.</p>
      `;
    }

    const listHtml =
      drafts.length === 0
        ? `<p class="admin-hint">No local drafts yet — create one below.</p>`
        : `<div class="admin-list">${drafts
            .map(
              (d) => `
            <button type="button" class="admin-list__item ${sel?.id === d.id ? 'is-selected' : ''}" data-pick="${d.id}">
              <span>
                <strong>${escapeHtml(d.name)}</strong>
                <small>${d.kind} · ${d._savedAt ? d._savedAt.slice(0, 16) : 'unsaved'}</small>
              </span>
              <span class="admin-score">${validateDeployableDraft(d).score}</span>
            </button>`
            )
            .join('')}</div>`;

    const detail = sel
      ? `
      <div class="admin-card">
        <h3>Selected · ${escapeHtml(sel.name)}</h3>
        <div class="admin-row"><span>id</span><b>${escapeHtml(sel.id)}</b></div>
        <div class="admin-row"><span>kind</span><b>${sel.kind}</b></div>
        <div class="admin-row"><span>score</span><b>${val.score}</b></div>
        ${
          val.warnings?.length
            ? val.warnings.map((w) => `<p class="admin-warn">⚠ ${escapeHtml(w)}</p>`).join('')
            : ''
        }
        <div class="admin-chips">
          ${(sel.jobs || []).map((j) => `<span class="admin-chip">${j}</span>`).join('')}
        </div>
        ${
          sel.layers?.purpose
            ? `<p class="admin-hint">Purpose: <b>${sel.layers.purpose.label}</b> — ${escapeHtml(sel.layers.purpose.note || '')}</p>`
            : ''
        }
        ${
          sel.layers?.script?.module
            ? `<div class="admin-code">${escapeHtml(JSON.stringify(sel.layers.script.module, null, 2))}</div>`
            : ''
        }
        ${
          sel.layers?.kit
            ? `<p class="admin-hint">Kit: ${escapeHtml(sel.layers.kit.raceId)} · ${escapeHtml(sel.layers.kit.kitUrl || '')}</p>
               <p class="admin-hint">AI: ${escapeHtml(sel.layers.ai?.brain || '—')} · HP ${sel.layers.combat?.hp ?? '—'}</p>`
            : ''
        }
        <div class="admin-btn-row">
          <button type="button" class="admin-btn admin-btn--primary" data-act="save">Save</button>
          <button type="button" class="admin-btn" data-act="export">Export JSON</button>
          <button type="button" class="admin-btn" data-act="dup">Duplicate</button>
          <button type="button" class="admin-btn admin-btn--danger" data-act="del">Delete</button>
        </div>
      </div>`
      : '';

    return `
      <div class="admin-card">
        <h3>${tabId === 'assets' ? 'Buildables & assets' : 'Creatures & kits'}</h3>
        <p class="admin-hint">Create drafts · save locally · export for ObjectStore / CDN deploy. No UUID mint in lab.</p>
        <label class="admin-label">Kind
          <select data-kind>${kindOpts}</select>
        </label>
        <label class="admin-label">Name
          <input type="text" data-field="name" value="${escapeHtml(this._form.name)}" placeholder="e.g. Timber Wall / Bandit Scout" />
        </label>
        ${extraFields}
        <div class="admin-btn-row">
          <button type="button" class="admin-btn admin-btn--primary" data-act="create">Create + save draft</button>
          <button type="button" class="admin-btn" data-act="import">Import JSON…</button>
          <input type="file" accept="application/json,.json" data-import hidden />
        </div>
      </div>
      <div class="admin-card">
        <h3>Local drafts (${drafts.length})</h3>
        ${listHtml}
      </div>
      ${detail}
      <div class="admin-card">
        <h3>Authorities</h3>
        <p class="admin-hint">CDN ${DEPLOYABLE_ENDPOINTS.cdn}</p>
        <p class="admin-hint">${kinds.map((k) => k.authority).join(' · ')}</p>
      </div>
    `;
  }

  _bindCreateSave(body, tabId) {
    body.querySelector('[data-kind]')?.addEventListener('change', (e) => {
      this._kind = e.target.value;
      this.refresh();
    });
    body.querySelectorAll('[data-field]').forEach((el) => {
      el.addEventListener('change', () => {
        this._form[el.dataset.field] = el.value;
      });
      el.addEventListener('input', () => {
        if (el.dataset.field === 'name') this._form.name = el.value;
      });
    });
    body.querySelectorAll('[data-pick]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this._selected = getDraft(btn.dataset.pick);
        this.refresh();
      });
    });
    body.querySelector('[data-act="create"]')?.addEventListener('click', () => {
      const name = this._form.name || `New ${this._kind}`;
      const fields = {
        name,
        purpose: this._form.purpose,
        role: this._form.role,
        raceId: this._form.raceId,
        brain: this._form.brain
      };
      try {
        const d = createAndSaveDraft(this._kind, fields);
        this._selected = d;
        this._form.name = '';
        this.onToast(`Saved draft · ${d.name}`);
        this.refresh();
      } catch (e) {
        this.onToast(e?.message || 'Save failed');
      }
    });
    body.querySelector('[data-act="save"]')?.addEventListener('click', () => {
      if (!this._selected) return;
      this._selected = saveDraft(this._selected);
      this.onToast('Draft saved');
      this.refresh();
    });
    body.querySelector('[data-act="export"]')?.addEventListener('click', () => {
      if (!this._selected) return;
      downloadDraftExport(this._selected);
      this.onToast('Exported deployable JSON');
    });
    body.querySelector('[data-act="dup"]')?.addEventListener('click', () => {
      if (!this._selected) return;
      const d = duplicateDraft(this._selected.id);
      this._selected = d;
      this.onToast('Duplicated');
      this.refresh();
    });
    body.querySelector('[data-act="del"]')?.addEventListener('click', () => {
      if (!this._selected) return;
      deleteDraft(this._selected.id);
      this._selected = null;
      this.onToast('Deleted');
      this.refresh();
    });
    const fileIn = body.querySelector('[data-import]');
    body.querySelector('[data-act="import"]')?.addEventListener('click', () => fileIn?.click());
    fileIn?.addEventListener('change', async () => {
      const file = fileIn.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        const d = importDraftJson(data);
        this._selected = d;
        this.onToast(`Imported · ${d.name}`);
        this.refresh();
      } catch (e) {
        this.onToast(e?.message || 'Import failed');
      } finally {
        fileIn.value = '';
      }
    });
  }

  /* ── F4 Prefabs ────────────────────────────────────────────── */

  _htmlPrefabs() {
    const drafts = listDrafts({ adminTab: 'prefabs' });
    const weapons = (() => {
      try {
        return listEquippableWeapons() || [];
      } catch {
        return [];
      }
    })();
    const t0 = weapons.filter((w) => w.tier === 0).slice(0, 16);
    const sel = this._selected?.adminTab === 'prefabs' ? this._selected : null;
    const val = sel ? validateDeployableDraft(sel) : null;
    const measure = measureWeaponScale(this.character);
    const scaleReadout = formatScaleReadout(measure);
    const appId = sel?.id || this._labWeaponId || '';
    const app = appId ? getAppearance(appId) : {};
    const scaleVal = app.scale ?? 1;

    const t0Html = t0.length
      ? t0
          .map(
            (w) =>
              `<button type="button" class="admin-list__item" data-t0="${w.id}">
                <span><strong>${escapeHtml(w.name)}</strong><small>${w.id} · T${w.tier}${w.modelUrl ? ' · mesh' : ''}</small></span>
                <span class="admin-score">T0</span>
              </button>`
          )
          .join('')
      : `<p class="admin-hint">Catalog not loaded — press Refresh catalog.</p>`;

    const draftHtml =
      drafts.length === 0
        ? `<p class="admin-hint">No weapon/armour drafts. Create from T0 or blank.</p>`
        : drafts
            .map(
              (d) =>
                `<button type="button" class="admin-list__item ${sel?.id === d.id ? 'is-selected' : ''}" data-pick="${d.id}">
                  <span><strong>${escapeHtml(d.name)}</strong><small>${d.kind}${d.modelUrl ? ' · model' : ''}</small></span>
                  <span class="admin-score">${validateDeployableDraft(d).score}</span>
                </button>`
            )
            .join('');

    return `
      <div class="admin-card">
        <h3>Weapon & item prefabs</h3>
        <p class="admin-hint">Edit · import GLB · assign model · live SI scale. Scaffold / UUID mint stays ObjectStore.</p>
        <div class="admin-btn-row">
          <button type="button" class="admin-btn admin-btn--primary" data-act="refresh-cat">Refresh catalog</button>
          <button type="button" class="admin-btn" data-act="open-inv">Lab Prefabs tab</button>
          <button type="button" class="admin-btn" data-act="new-weapon">New weapon draft</button>
          <button type="button" class="admin-btn" data-act="new-armour">New armour draft</button>
        </div>
        <div class="admin-chips">
          ${PREFAB_CATEGORIES.map((c) => `<span class="admin-chip">${c.label}</span>`).join('')}
        </div>
      </div>

      <div class="admin-card admin-card--weapon-lab">
        <h3>Live weapon scale & mesh</h3>
        <p class="admin-hint" data-scale-readout>${escapeHtml(scaleReadout)}</p>
        <div class="admin-row"><span>SI length</span><b data-len-m>${measure ? measure.lengthM.toFixed(2) + ' m' : '—'}</b></div>
        <div class="admin-row"><span>Lab scale</span><b data-lab-scale>×${Number(scaleVal).toFixed(2)}</b></div>
        <label class="admin-row admin-row--slider">
          <span>Scale</span>
          <input type="range" data-wlab-scale min="0.25" max="3" step="0.02" value="${scaleVal}" ${appId ? '' : 'disabled'} />
        </label>
        <label class="admin-row admin-row--slider">
          <span>Yaw °</span>
          <input type="range" data-wlab-yaw min="-180" max="180" step="1" value="${app.eulerDeg?.[1] ?? 0}" ${appId ? '' : 'disabled'} />
        </label>
        <label class="admin-row admin-row--slider">
          <span>Pitch °</span>
          <input type="range" data-wlab-pitch min="-90" max="90" step="1" value="${app.eulerDeg?.[0] ?? 0}" ${appId ? '' : 'disabled'} />
        </label>
        <label class="admin-row">
          <span>modelUrl</span>
          <input type="text" data-wlab-url class="admin-input" placeholder="https://…/weapon.glb or blob:" value="${escapeHtml(sel?.modelUrl || '')}" />
        </label>
        <div class="admin-btn-row">
          <button type="button" class="admin-btn admin-btn--primary" data-act="wlab-equip" ${appId || sel ? '' : 'disabled'}>Equip on hand</button>
          <button type="button" class="admin-btn" data-act="wlab-assign" ${sel ? '' : 'disabled'}>Assign URL → draft</button>
          <label class="admin-btn" style="cursor:pointer">
            Import GLB
            <input type="file" data-wlab-import accept=".glb,.gltf,model/gltf-binary" hidden />
          </label>
          <button type="button" class="admin-btn" data-act="wlab-measure">Re-measure</button>
        </div>
        <p class="admin-hint">Select a T0 or draft first. Import attaches a local GLB blob to that prefab id. Scale is live on the hero hand.</p>
      </div>

      <div class="admin-card">
        <h3>T0 starters (equip / draft)</h3>
        <div class="admin-list">${t0Html}</div>
      </div>
      <div class="admin-card">
        <h3>Local prefab drafts</h3>
        <div class="admin-list">${draftHtml}</div>
      </div>
      ${
        sel
          ? `<div class="admin-card">
              <h3>${escapeHtml(sel.name)}</h3>
              <div class="admin-row"><span>score</span><b>${val.score}</b></div>
              <div class="admin-row"><span>model</span><b style="font-size:10px;word-break:break-all">${escapeHtml(sel.modelUrl || '—')}</b></div>
              ${val.warnings?.map((w) => `<p class="admin-warn">⚠ ${escapeHtml(w)}</p>`).join('') || ''}
              <div class="admin-btn-row">
                <button type="button" class="admin-btn admin-btn--primary" data-act="export">Export</button>
                <button type="button" class="admin-btn" data-act="scaffold">Scaffold pack</button>
                <button type="button" class="admin-btn admin-btn--danger" data-act="del">Delete</button>
              </div>
            </div>`
          : ''
      }
      <div class="admin-card">
        <h3>Endpoints</h3>
        <p class="admin-hint"><a href="${ITEM_BROWSER_URL}" target="_blank" rel="noopener">Item browser</a> ·
        <a href="${WEAPON_SKILLS_HTML}" target="_blank" rel="noopener">Weapon skills</a></p>
        <p class="admin-hint">${SCAFFOLD_ENDPOINTS.weaponPrefabs}</p>
        <p class="admin-hint">Pipeline: ${DEPLOYABLE_ENDPOINTS.pipelines.weapons}</p>
      </div>
    `;
  }

  _bindPrefabs(body) {
    const refreshMeasure = () => {
      const m = measureWeaponScale(this.character);
      const el = body.querySelector('[data-scale-readout]');
      const len = body.querySelector('[data-len-m]');
      const lab = body.querySelector('[data-lab-scale]');
      if (el) el.textContent = formatScaleReadout(m);
      if (len) len.textContent = m ? `${m.lengthM.toFixed(2)} m` : '—';
      if (lab) {
        const id = this._selected?.id || this._labWeaponId;
        const sc = id ? getAppearance(id).scale ?? 1 : 1;
        lab.textContent = `×${Number(sc).toFixed(2)}`;
      }
    };

    body.querySelector('[data-act="refresh-cat"]')?.addEventListener('click', async () => {
      try {
        await ensureWeaponCatalog();
        this._scaffold = await loadPrefabScaffold();
        this.onToast('Catalog + scaffold loaded');
        this.refresh();
      } catch (e) {
        this.onToast(e?.message || 'Load failed');
      }
    });
    body.querySelector('[data-act="open-inv"]')?.addEventListener('click', () => {
      this.onOpenInventoryPrefabs?.();
    });
    body.querySelector('[data-act="new-weapon"]')?.addEventListener('click', () => {
      const d = createAndSaveDraft('weapon', { name: 'New weapon draft', weaponType: 'SWORD' });
      this._selected = d;
      this._labWeaponId = d.id;
      this.onToast('Weapon draft saved');
      this.refresh();
    });
    body.querySelector('[data-act="new-armour"]')?.addEventListener('click', () => {
      const d = createAndSaveDraft('armour', { name: 'New armour draft', slot: 'body' });
      this._selected = d;
      this.onToast('Armour draft saved');
      this.refresh();
    });

    // ── Live scale / import / assign ────────────────────────────
    body.querySelector('[data-wlab-scale]')?.addEventListener('input', (e) => {
      const id = this._selected?.id || this._labWeaponId;
      if (!id || !this.character) return;
      const sc = Number(e.target.value) || 1;
      setLiveWeaponScale(id, sc, this.character);
      refreshMeasure();
    });
    const applyEuler = () => {
      const id = this._selected?.id || this._labWeaponId;
      if (!id || !this.character) return;
      const pitch = Number(body.querySelector('[data-wlab-pitch]')?.value) || 0;
      const yaw = Number(body.querySelector('[data-wlab-yaw]')?.value) || 0;
      const scale = Number(body.querySelector('[data-wlab-scale]')?.value) || 1;
      setLiveWeaponAppearance(id, { scale, eulerDeg: [pitch, yaw, 0] }, this.character);
      refreshMeasure();
    };
    body.querySelector('[data-wlab-yaw]')?.addEventListener('input', applyEuler);
    body.querySelector('[data-wlab-pitch]')?.addEventListener('input', applyEuler);

    body.querySelector('[data-act="wlab-equip"]')?.addEventListener('click', async () => {
      const id = this._selected?.id || this._labWeaponId;
      if (!id) return this.onToast('Select a weapon draft or T0 first');
      try {
        const url = body.querySelector('[data-wlab-url]')?.value?.trim();
        const catalogId = id.replace(/^draft-from-/, '');
        await equipWeaponForLab(
          catalogId.startsWith('t0-') ? catalogId : id,
          { character: this.character, onToast: this.onToast },
          url ? { modelUrl: url } : {}
        );
        this._labWeaponId = id;
        this.onToast(`Equipped · ${formatScaleReadout(measureWeaponScale(this.character))}`);
        refreshMeasure();
      } catch (e) {
        this.onToast(e?.message || 'Equip failed');
      }
    });

    body.querySelector('[data-act="wlab-assign"]')?.addEventListener('click', () => {
      if (!this._selected?.id) return this.onToast('Select a draft');
      const url = body.querySelector('[data-wlab-url]')?.value?.trim();
      if (!url) return this.onToast('Paste a modelUrl or import GLB first');
      try {
        const scale = Number(body.querySelector('[data-wlab-scale]')?.value) || 1;
        this._selected = assignModelToDraft(this._selected.id, url, { scale });
        this.onToast(`Assigned model → ${this._selected.name}`);
        this.refresh();
      } catch (e) {
        this.onToast(e?.message || 'Assign failed');
      }
    });

    body.querySelector('[data-wlab-import]')?.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      let id = this._selected?.id;
      if (!id) {
        const d = createAndSaveDraft('weapon', {
          name: file.name.replace(/\.(glb|gltf)$/i, ''),
          weaponType: 'SWORD'
        });
        this._selected = d;
        id = d.id;
      }
      try {
        const rec = await importWeaponGlb(file, id);
        this._selected = assignModelToDraft(id, rec.url, { name: rec.name });
        body.querySelector('[data-wlab-url]').value = rec.url;
        await equipWeaponForLab(id, { character: this.character, onToast: this.onToast }, {
          modelUrl: rec.url
        });
        this._labWeaponId = id;
        this.onToast(`Imported ${rec.name} · ${formatScaleReadout(measureWeaponScale(this.character))}`);
        this.refresh();
      } catch (err) {
        this.onToast(err?.message || 'Import failed');
      }
    });

    body.querySelector('[data-act="wlab-measure"]')?.addEventListener('click', () => {
      refreshMeasure();
      this.onToast(formatScaleReadout(measureWeaponScale(this.character)));
    });

    body.querySelectorAll('[data-pick]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this._selected = getDraft(btn.dataset.pick);
        this._labWeaponId = this._selected?.id;
        this.refresh();
      });
    });
    body.querySelectorAll('[data-t0]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.t0;
        try {
          await ensureWeaponCatalog();
          const w = listEquippableWeapons().find((x) => x.id === id);
          if (!w) throw new Error('Weapon not found');
          // Equip immediately so scale is visible on the hero
          await equipWeaponById(id, { character: this.character, onToast: this.onToast });
          this._labWeaponId = id;
          const pack = await buildItemScaffoldPack(w);
          downloadJson(pack, `scaffold-${id}.json`);
          // also save a draft linked to catalog id
          const d = createAndSaveDraft('weapon', {
            id: `draft-from-${id}`,
            name: w.name,
            weaponType: w.weaponType,
            tier: w.tier,
            meshSlot: w.meshSlot,
            animPack: w.animPack,
            stats: w.stats,
            iconUrl: w.iconUrl,
            modelUrl: w.modelUrl
          });
          if (w.uuid) d.notes = `Source catalog uuid ${w.uuid} — do not re-mint`;
          d.layers.skills = {
            slots: [],
            skillUuids: [w.slot1?.uuid, w.slot2?.uuid].filter(Boolean),
            note: 'From T0 catalog — full bodies in scaffold export'
          };
          this._selected = saveDraft(d);
          this._labWeaponId = d.id;
          this.onToast(
            `Equipped + draft · ${w.name} · ${formatScaleReadout(measureWeaponScale(this.character))}`
          );
          this.refresh();
        } catch (e) {
          this.onToast(e?.message || 'Scaffold failed');
        }
      });
    });
    body.querySelector('[data-act="export"]')?.addEventListener('click', () => {
      if (!this._selected) return;
      downloadDraftExport(this._selected);
      this.onToast('Exported');
    });
    body.querySelector('[data-act="scaffold"]')?.addEventListener('click', async () => {
      try {
        await ensureWeaponCatalog();
        const w =
          listEquippableWeapons().find((x) => x.id === this._selected?.id?.replace(/^draft-from-/, '')) ||
          listEquippableWeapons().find((x) => x.name === this._selected?.name);
        if (w) {
          const pack = await buildItemScaffoldPack(w);
          downloadJson(pack, `scaffold-${w.id}.json`);
          this.onToast('Scaffold pack downloaded');
        } else {
          downloadDraftExport(this._selected);
          this.onToast('No catalog match — exported draft');
        }
      } catch (e) {
        this.onToast(e?.message || 'Failed');
      }
    });
    body.querySelector('[data-act="del"]')?.addEventListener('click', () => {
      if (!this._selected) return;
      deleteDraft(this._selected.id);
      this._selected = null;
      this.onToast('Deleted');
      this.refresh();
    });
  }

  /* ── ] World ──────────────────────────────────────────────── */

  _htmlWorld() {
    return `
      <div class="admin-card">
        <h3>World / Dev Island <kbd>]</kbd></h3>
        <p class="admin-hint">Baked rocks · harvest · dummies · windsurf pad. Hold Q mode · Hold R tools · F nearest ≤5 m.</p>
        <div class="admin-btn-row">
          <button type="button" class="admin-btn admin-btn--primary" data-act="loot">Spawn sample loot (L)</button>
          <button type="button" class="admin-btn" data-act="harvest">Respawn harvest nodes</button>
          <button type="button" class="admin-btn" data-act="tool">Equip t0-tool (pick)</button>
          <button type="button" class="admin-btn" data-act="dummies">Respawn dummies</button>
          <button type="button" class="admin-btn" data-act="help">Keyboard help (?)</button>
          <a class="admin-btn" href="./devnode.html" target="_blank" rel="noopener">Training Room editor ↗</a>
        </div>
        <p class="admin-hint">Training Room = DevIsland = /devnode — one island map (terrain L0–L3 + harvest + PvE). Export layout → play.</p>
      </div>
      <div class="admin-card">
        <h3>Input contract (Open parity)</h3>
        <div class="admin-row"><span>Hold Q</span><b>Mode radial · ↑ combat · ↓ harvest</b></div>
        <div class="admin-row"><span>Tap Q</span><b>Combat: swap Weapon 1 ↔ 2 (skills+loco)</b></div>
        <div class="admin-row"><span>Hold R</span><b>Tool radial (harvest only)</b></div>
        <div class="admin-row"><span>F</span><b>pickup → harvest ≤5 m → skill</b></div>
        <div class="admin-row"><span>Shift+Q</span><b>Equip session (lab panel)</b></div>
        <div class="admin-row"><span>I / B</span><b>Main Panel · Mini bag</b></div>
        <div class="admin-row"><span>M · Space · E</span><b>Surf · deploy/hop · dismount</b></div>
      </div>
      <div class="admin-card">
        <h3>Harvest / windsurf</h3>
        <div class="admin-row"><span>Range</span><b>5 m</b></div>
        <div class="admin-row"><span>Meshes</span><b>public/models/dev-island/rock__*</b></div>
        <div class="admin-row"><span>Board art yaw</span><b>+90° travel frame</b></div>
        <div class="admin-row"><span>Water coast</span><b>low freerideDrag · release W glides</b></div>
        <div class="admin-row"><span>Ranged freeride</span><b>non-focus path cast</b></div>
      </div>
      <div class="admin-card">
        <h3>Deploy surfaces</h3>
        <div class="admin-row"><span>Lab</span><b>casting.grudge-studio.com</b></div>
        <div class="admin-row"><span>Open</span><b>open.grudge-studio.com</b></div>
        <div class="admin-row"><span>Forge</span><b>forge.grudge-studio.com</b></div>
        <div class="admin-row"><span>CDN</span><b>assets.grudge-studio.com</b></div>
        <div class="admin-row"><span>Catalog</span><b>info.grudge-studio.com</b></div>
      </div>
      <div class="admin-card">
        <h3>What we deploy from hub</h3>
        <div class="admin-chips">
          ${DEPLOYABLE_KINDS.map((k) => `<span class="admin-chip">${k.label}</span>`).join('')}
        </div>
        <p class="admin-hint">Create/save here → export JSON → ObjectStore pipeline + R2 → fleet clients consume.</p>
      </div>
    `;
  }

  _bindWorld(body) {
    body.querySelector('[data-act="loot"]')?.addEventListener('click', () => {
      this.spawnLoot?.(3);
    });
    body.querySelector('[data-act="harvest"]')?.addEventListener('click', async () => {
      try {
        await this.respawnHarvest?.();
        this.onToast('Harvest nodes respawned');
      } catch (e) {
        this.onToast(e?.message || 'Harvest respawn failed');
      }
    });
    body.querySelector('[data-act="tool"]')?.addEventListener('click', async () => {
      try {
        await this.equipHarvestTool?.();
      } catch (e) {
        this.onToast(e?.message || 'Tool equip failed');
      }
    });
    body.querySelector('[data-act="dummies"]')?.addEventListener('click', () => {
      this.respawnDummies?.();
      this.onToast('Training dummies respawned');
    });
    body.querySelector('[data-act="help"]')?.addEventListener('click', () => {
      this.onHelp?.();
    });
  }

  dispose() {
    this.el?.remove();
    this.chips?.remove();
  }
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
