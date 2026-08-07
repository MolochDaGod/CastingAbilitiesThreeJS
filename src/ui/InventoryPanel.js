import { EQUIP_SLOTS, WEAPON_SLOTS, ANIM_PACKS, ANIM_PACK_META, RACES } from '../config/assets.js';
import { settings } from '../config/settings.js';
import {
  fleetApi,
  MAIN_PANEL_URL,
  OPEN_LIBRARY_URL,
  CHARACTER_FOUNDRY_URL,
  GRUDGE_ID_URL,
  FLEET_API_DEFAULT
} from '../api/fleetApi.js';
import {
  DRC_MELEE_STRIKE,
  getActiveSkills,
  setActiveSkillTree
} from '../combat/drcSkills.js';
import { allElementWeaponSkillTrees } from '../combat/elementWeaponSkills.js';

/**
 * Left-side Lab Panel — Main Panel / character production tester (not a fork).
 *
 * Tabs: Character · Equipment · Weapon · Race · Mesh · Mount · Anims · API
 * Production Main Panel stays Open/ui.grudge-studio.com — we link + exercise
 * the same contracts (mesh_ids, packs, fleet API).
 */
export class InventoryPanel {
  /**
   * @param {{
   *   character: import('../animation/CharacterController.js').CharacterController,
   *   onToast?: (msg: string) => void,
   *   onEquip?: () => void,
   *   onRace?: (raceId: string) => void|Promise<void>,
   *   onMountToggle?: (wantRide: boolean) => void,
   *   onMode?: (mode: 'casting'|'walk') => void,
   *   getDrc?: () => import('../combat/DrcCombatController.js').DrcCombatController|null
   * }} opts
   */
  constructor(opts) {
    this.character = opts.character;
    this.onToast = opts.onToast || (() => {});
    this.onEquip = opts.onEquip || (() => {});
    this.onRace = opts.onRace || null;
    this.onMountToggle = opts.onMountToggle || null;
    this.onMode = opts.onMode || null;
    this.getDrc = opts.getDrc || (() => null);
    this.open = false;
    this._tab = 'character';
    this._busy = false;
    this.api = fleetApi;

    this.el = document.createElement('div');
    this.el.id = 'inventory-panel';
    this.el.className = 'inv-panel inv-panel--lab';
    this.el.hidden = true;
    document.body.appendChild(this.el);

    this._renderShell();
  }

  _tabs() {
    return [
      { id: 'character', label: 'Character' },
      { id: 'equip', label: 'Equipment' },
      { id: 'weapon', label: 'Weapon' },
      { id: 'race', label: 'Race' },
      { id: 'mesh', label: 'Mesh' },
      { id: 'mount', label: 'Mount' },
      { id: 'anims', label: 'Anims' },
      { id: 'skills', label: 'Skills' },
      { id: 'api', label: 'API' }
    ];
  }

  _renderShell() {
    const tabs = this._tabs();
    this.el.innerHTML = `
      <header class="inv-panel__head">
        <div>
          <h2>Lab Panel</h2>
          <p class="inv-panel__sub">Character · equip · 6 races · packs · fleet API</p>
        </div>
        <button type="button" class="inv-panel__close" data-close aria-label="Close">×</button>
      </header>
      <div class="inv-panel__layout">
        <nav class="inv-panel__nav" data-nav>
          ${tabs
            .map(
              (t) =>
                `<button type="button" class="inv-nav-tab ${t.id === this._tab ? 'is-active' : ''}" data-tab="${t.id}">${t.label}</button>`
            )
            .join('')}
        </nav>
        <div class="inv-panel__body">
          <section class="inv-section" data-panel="character"></section>
          <section class="inv-section" data-panel="equip" hidden></section>
          <section class="inv-section" data-panel="weapon" hidden></section>
          <section class="inv-section" data-panel="race" hidden></section>
          <section class="inv-section" data-panel="mesh" hidden></section>
          <section class="inv-section" data-panel="mount" hidden></section>
          <section class="inv-section" data-panel="anims" hidden></section>
          <section class="inv-section" data-panel="skills" hidden></section>
          <section class="inv-section" data-panel="api" hidden></section>
        </div>
      </div>
      <footer class="inv-panel__foot">
        <kbd>I</kbd>/<kbd>Q</kbd> · mesh_ids only ·
        <a href="${MAIN_PANEL_URL}" target="_blank" rel="noopener">Main Panel ↗</a>
      </footer>
    `;

    this.el.querySelector('[data-close]').addEventListener('click', () => this.setOpen(false));
    this.el.querySelectorAll('[data-tab]').forEach((btn) => {
      btn.addEventListener('click', () => this._setTab(btn.dataset.tab));
    });
    this.el.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.el.addEventListener('wheel', (e) => e.stopPropagation());
  }

  _setTab(tab) {
    this._tab = tab || 'character';
    this.el.querySelectorAll('.inv-nav-tab').forEach((b) => {
      b.classList.toggle('is-active', b.dataset.tab === this._tab);
    });
    this.el.querySelectorAll('.inv-section').forEach((s) => {
      s.hidden = s.dataset.panel !== this._tab;
    });
    this.refresh();
  }

  toggle() {
    this.setOpen(!this.open);
  }

  setOpen(open) {
    this.open = !!open;
    this.el.hidden = !this.open;
    if (this.open) this.refresh();
  }

  refresh() {
    if (!this.open) return;
    this._fillCharacter();
    this._fillEquip();
    this._fillWeapon();
    this._fillRace();
    this._fillMesh();
    this._fillMount();
    this._fillAnims();
    this._fillSkills();
    this._fillApi();
  }

  _busyGuard(fn) {
    return async (...args) => {
      if (this._busy) {
        this.onToast('Busy…');
        return;
      }
      this._busy = true;
      try {
        await fn(...args);
      } catch (err) {
        console.error(err);
        this.onToast(err?.message || String(err));
      } finally {
        this._busy = false;
        this.refresh();
        this.onEquip();
      }
    };
  }

  /* ── Character ─────────────────────────────────────────────── */

  _fillCharacter() {
    const host = this.el.querySelector('[data-panel="character"]');
    if (!host || this._tab !== 'character') return;
    const s = this.character.getLabSummary?.() || {};
    const presets = this.character.presets || [];
    const presetOpts = presets
      .map(
        (p) =>
          `<option value="${p.id}" ${p.id === this.character.presetId ? 'selected' : ''}>${p.label || p.id}</option>`
      )
      .join('');

    host.innerHTML = `
      <div class="inv-card">
        <div class="inv-card__row"><span>Race</span><b>${s.raceLabel || s.raceId || '—'}</b></div>
        <div class="inv-card__row"><span>Height</span><b>${(s.heightM ?? 0).toFixed(2)} m</b></div>
        <div class="inv-card__row"><span>Preset</span><b>${s.presetId || '—'}</b></div>
        <div class="inv-card__row"><span>Anim pack</span><b>${s.animPackId || '—'}</b></div>
        <div class="inv-card__row"><span>Weapon</span><b>${s.weaponSlot ? `${s.weaponSlot}:${s.weaponVariant}` : '—'}</b></div>
        <div class="inv-card__row"><span>Clips</span><b>${(s.clips || []).length}</b></div>
      </div>
      <label class="inv-row">
        <span>Class preset</span>
        <select data-preset>${presetOpts}</select>
      </label>
      <p class="inv-hint">Kit: <code class="inv-code">${(s.kitUrl || '').split('/').pop() || '—'}</code></p>
      <p class="inv-hint">Toon RTS GLB · mesh_ids equip · one mixer</p>
      <div class="inv-btn-row">
        <a class="inv-btn inv-btn--ghost" href="${CHARACTER_FOUNDRY_URL}" target="_blank" rel="noopener">Foundry ↗</a>
        <a class="inv-btn inv-btn--ghost" href="${MAIN_PANEL_URL}" target="_blank" rel="noopener">Main Panel ↗</a>
      </div>
    `;

    host.querySelector('[data-preset]')?.addEventListener(
      'change',
      this._busyGuard(async (e) => {
        const id = e.target.value;
        const report = this.character.applyPreset(id);
        const pack = this.character.animPackId;
        await this.character.setAnimPack?.(pack);
        this.onToast(
          `Equipped ${id}${report?.missing?.length ? ` (missing ${report.missing.length})` : ''}`
        );
      })
    );
  }

  /* ── Equipment ─────────────────────────────────────────────── */

  _fillEquip() {
    const host = this.el.querySelector('[data-panel="equip"]');
    if (!host || this._tab !== 'equip') return;

    const c = this.character;
    const catalog = c.equipment?.getCatalogSummary?.() || {};

    const slotRows = EQUIP_SLOTS.map((slot) => {
      const info = catalog[slot];
      if (!info) return '';
      const opts = [
        `<option value="none">— none —</option>`,
        ...info.variants.map(
          (v) =>
            `<option value="${v}" ${info.selected === v ? 'selected' : ''}>${v === '_default' ? 'default' : v}</option>`
        )
      ].join('');
      const weaponNote = WEAPON_SLOTS.includes(slot) ? ' ⚔' : '';
      return `
        <label class="inv-row">
          <span>${slot}${weaponNote}</span>
          <select data-slot="${slot}">${opts}</select>
        </label>`;
    }).join('');

    host.innerHTML = `
      <p class="inv-hint">Visibility mesh_ids only — never body GLB swap. Pack: <b>${c.animPackId}</b></p>
      <div class="inv-slots">${slotRows || '<p class="inv-hint">No equippable slots on kit.</p>'}</div>
      <button type="button" class="inv-btn" data-attack>Weapon attack (F)</button>
    `;

    host.querySelectorAll('[data-slot]').forEach((sel) => {
      sel.addEventListener('change', () => {
        const slot = sel.dataset.slot;
        const variant = sel.value;
        c.equipment?.setSlot(slot, variant === 'none' ? null : variant);
        c._reGroundAfterEquip?.();
        c.ik?.setBones(c.equipment.findBones());
        this.onToast(`${slot} → ${variant}`);
        this.onEquip();
        if (this._tab === 'weapon') this._fillWeapon();
      });
    });

    host.querySelector('[data-attack]')?.addEventListener('click', () => {
      if (c.playWeaponAttack?.()) this.onToast('Weapon attack');
      else this.onToast('No attack clip');
    });
  }

  /* ── Weapon equipped ───────────────────────────────────────── */

  _fillWeapon() {
    const host = this.el.querySelector('[data-panel="weapon"]');
    if (!host || this._tab !== 'weapon') return;

    const c = this.character;
    const loadout = c.equipment?.loadout || {};
    const catalog = c.equipment?.getCatalogSummary?.() || {};
    const active = WEAPON_SLOTS.find((s) => loadout[s] && loadout[s] !== 'none') || null;

    const weaponCards = WEAPON_SLOTS.map((slot) => {
      const info = catalog[slot];
      const variants = info?.variants?.length ? info.variants : ['A', '_default'];
      const selected = loadout[slot] || 'none';
      const isOn = selected && selected !== 'none';
      return `
        <div class="inv-weapon ${isOn ? 'is-on' : ''}" data-weapon-slot="${slot}">
          <div class="inv-weapon__name">${slot}</div>
          <select data-wslot="${slot}">
            <option value="none">unequip</option>
            ${variants
              .map(
                (v) =>
                  `<option value="${v}" ${selected === v ? 'selected' : ''}>${v === '_default' ? 'default' : v}</option>`
              )
              .join('')}
          </select>
        </div>`;
    }).join('');

    host.innerHTML = `
      <p class="inv-hint">Active: <b>${active || 'none'}</b> · exclusive weapon (one at a time on kit)</p>
      <div class="inv-weapon-grid">${weaponCards}</div>
      <label class="inv-row">
        <span>Anim pack for weapon</span>
        <select data-wpack>
          ${Object.keys(ANIM_PACKS)
            .map(
              (id) =>
                `<option value="${id}" ${c.animPackId === id ? 'selected' : ''}>${ANIM_PACK_META[id]?.label || id}</option>`
            )
            .join('')}
        </select>
      </label>
      <button type="button" class="inv-btn" data-strike>F — residual / attack</button>
    `;

    host.querySelectorAll('[data-wslot]').forEach((sel) => {
      sel.addEventListener(
        'change',
        this._busyGuard(async () => {
          const slot = sel.dataset.wslot;
          const variant = sel.value;
          // Clear other weapons for exclusive
          for (const w of WEAPON_SLOTS) {
            if (w !== slot) c.equipment?.setSlot(w, null);
          }
          c.equipment?.setSlot(slot, variant === 'none' ? null : variant);
          c._reGroundAfterEquip?.();
          // Auto pack: staff → magic, bow → longbow, melee → sword_shield
          let pack = c.animPackId;
          if (variant !== 'none') {
            if (slot === 'staff') pack = 'magic';
            else if (slot === 'bow') pack = 'longbow';
            else pack = 'sword_shield';
          }
          await c.setAnimPack?.(pack);
          this.onToast(`${slot} → ${variant} · pack ${pack}`);
        })
      );
    });

    host.querySelector('[data-wpack]')?.addEventListener(
      'change',
      this._busyGuard(async (e) => {
        const id = await c.setAnimPack?.(e.target.value);
        this.onToast(`Anim pack · ${id}`);
      })
    );

    host.querySelector('[data-strike]')?.addEventListener('click', () => {
      const drc = this.getDrc?.();
      if (drc?.useMeleeStrike) drc.useMeleeStrike();
      else if (c.playWeaponAttack?.()) this.onToast('Attack');
    });
  }

  /* ── Race (all 6 Toon RTS) ──────────────────────────────────── */

  _fillRace() {
    const host = this.el.querySelector('[data-panel="race"]');
    if (!host || this._tab !== 'race') return;

    const current = this.character.raceId;
    const cards = Object.values(RACES)
      .map((r) => {
        const file = (r.kitUrl || '').split('/').pop();
        return `
        <button type="button" class="inv-race ${r.id === current ? 'is-active' : ''}" data-race="${r.id}">
          <span class="inv-race__id">${r.id}</span>
          <span class="inv-race__label">${r.label}</span>
          <span class="inv-race__file">${file}</span>
        </button>`;
      })
      .join('');

    host.innerHTML = `
      <p class="inv-hint">Toon RTS GLB · assets…/asset-packs/toon-rts-characters/glb/characters/</p>
      <div class="inv-race-grid">${cards}</div>
      <p class="inv-hint">Atlas rebind optional — embeds preferred. No races-bake / FBX play path.</p>
    `;

    host.querySelectorAll('[data-race]').forEach((btn) => {
      btn.addEventListener(
        'click',
        this._busyGuard(async () => {
          const id = btn.dataset.race;
          this.onToast(`Loading ${id}…`);
          if (this.onRace) await this.onRace(id);
          else await this.character.setRace?.(id);
          this.onToast(`Race · ${id}`);
        })
      );
    });
  }

  /* ── Mesh catalog ──────────────────────────────────────────── */

  _fillMesh() {
    const host = this.el.querySelector('[data-panel="mesh"]');
    if (!host || this._tab !== 'mesh') return;

    const catalog = this.character.equipment?.getCatalogSummary?.() || {};
    const rows = Object.entries(catalog)
      .map(([slot, info]) => {
        const vis = info.selected && info.selected !== 'none' ? info.selected : '—';
        return `<tr><td>${slot}</td><td>${vis}</td><td>${(info.variants || []).length}</td></tr>`;
      })
      .join('');

    let meshList = '';
    this.character.model?.traverse((o) => {
      if (!o.isMesh && !o.isSkinnedMesh) return;
      if (!o.name) return;
      meshList += `<div class="inv-mesh-line ${o.visible ? 'is-vis' : ''}">${o.visible ? '●' : '○'} ${o.name}</div>`;
    });

    host.innerHTML = `
      <p class="inv-hint">Slot catalog + live kit mesh visibility</p>
      <table class="inv-table">
        <thead><tr><th>Slot</th><th>On</th><th>Vars</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="3">empty</td></tr>'}</tbody>
      </table>
      <div class="inv-mesh-list">${meshList || '<p class="inv-hint">No model</p>'}</div>
    `;
  }

  /* ── Mount ─────────────────────────────────────────────────── */

  _fillMount() {
    const host = this.el.querySelector('[data-panel="mount"]');
    if (!host || this._tab !== 'mount') return;

    const ride = !!this.character._rideActive;
    const mode = settings.mode;

    host.innerHTML = `
      <p class="inv-hint">Windsurf / hoverboard ride — Walk mode path draw. RideIK feet + hands only while mounted.</p>
      <div class="inv-card">
        <div class="inv-card__row"><span>Mode</span><b>${mode}</b></div>
        <div class="inv-card__row"><span>Ride active</span><b>${ride ? 'yes' : 'no'}</b></div>
      </div>
      <div class="inv-btn-row">
        <button type="button" class="inv-btn" data-walk>Walk mode (M)</button>
        <button type="button" class="inv-btn inv-btn--ghost" data-cast>Cast mode</button>
      </div>
      <p class="inv-hint">Draw path in Walk mode → board ride. Dismount at path end. Not a second mount engine.</p>
    `;

    host.querySelector('[data-walk]')?.addEventListener('click', () => {
      this.onMode?.('walk');
      this.onMountToggle?.(true);
      this.onToast('Walk / mount mode — draw a path');
      this.refresh();
    });
    host.querySelector('[data-cast]')?.addEventListener('click', () => {
      this.onMode?.('casting');
      this.onMountToggle?.(false);
      this.onToast('Cast mode');
      this.refresh();
    });
  }

  /* ── Animations library ────────────────────────────────────── */

  _fillAnims() {
    const host = this.el.querySelector('[data-panel="anims"]');
    if (!host || this._tab !== 'anims') return;

    const c = this.character;
    const roles = c.listAnimRoles?.() || [...(c.actions?.keys?.() || [])];
    const packMeta = ANIM_PACK_META[c.animPackId] || {};

    host.innerHTML = `
      <label class="inv-row">
        <span>Active pack</span>
        <select data-pack>
          ${Object.keys(ANIM_PACKS)
            .map(
              (id) =>
                `<option value="${id}" ${c.animPackId === id ? 'selected' : ''}>${ANIM_PACK_META[id]?.label || id}</option>`
            )
            .join('')}
        </select>
      </label>
      <p class="inv-hint">Skills: ${packMeta.skills || '—'} · Loco: ${packMeta.locomotion || '—'}</p>
      <div class="inv-clip-grid">
        ${roles
          .map((r) => `<button type="button" class="inv-clip" data-clip="${r}">${r}</button>`)
          .join('') || '<p class="inv-hint">No clips bound</p>'}
      </div>
      <p class="inv-hint">Baked Bip001 · open/prod anims · one mixer · rotation-only rematch</p>
    `;

    host.querySelector('[data-pack]')?.addEventListener(
      'change',
      this._busyGuard(async (e) => {
        const id = await c.setAnimPack?.(e.target.value);
        this.onToast(`Pack · ${id}`);
      })
    );

    host.querySelectorAll('[data-clip]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const role = btn.dataset.clip;
        if (c.playLibraryClip?.(role) || c.play?.(role, 0.15)) {
          this.onToast(`Play · ${role}`);
        }
      });
    });
  }

  /* ── Weapon skills (DRC / trees) ───────────────────────────── */

  _fillSkills() {
    const host = this.el.querySelector('[data-panel="skills"]');
    if (!host || this._tab !== 'skills') return;

    const bar = getActiveSkills();
    const melee = DRC_MELEE_STRIKE;
    const trees = allElementWeaponSkillTrees();

    const skillRows = [
      ...bar.map(
        (s) =>
          `<button type="button" class="inv-skill" data-slot="${s.slot}">
              <span class="inv-skill__key">${s.slot + 1}</span>
              <span>${s.label}</span>
              <span class="inv-skill__meta">${s.style} · ${s.cooldown}s</span>
            </button>`
      ),
      `<button type="button" class="inv-skill" data-melee="1">
          <span class="inv-skill__key">F</span>
          <span>${melee.label}</span>
          <span class="inv-skill__meta">melee residual</span>
        </button>`
    ].join('');

    host.innerHTML = `
        <div class="inv-btn-row">
          <button type="button" class="inv-btn inv-btn--ghost" data-tree="elements">Elements bar</button>
          <button type="button" class="inv-btn inv-btn--ghost" data-tree="arcane">Arcane bar</button>
        </div>
        <div class="inv-skill-list">${skillRows}</div>
        <p class="inv-hint">Warlords trees (export seed): ${Object.keys(trees).join(', ')}</p>
        <p class="inv-hint">1–4 cast · F residual · Alt+V/B/F/G/T/C VFX preview</p>
      `;

    host.querySelectorAll('[data-tree]').forEach((btn) => {
      btn.addEventListener('click', () => {
        setActiveSkillTree(btn.dataset.tree);
        const drc = this.getDrc?.();
        if (drc) drc.skills = getActiveSkills();
        this.onToast(`Skill tree · ${btn.dataset.tree}`);
        this.refresh();
      });
    });

    host.querySelectorAll('[data-slot]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.getDrc?.()?.useSkill?.(Number(btn.dataset.slot));
      });
    });
    host.querySelector('[data-melee]')?.addEventListener('click', () => {
      this.getDrc?.()?.useMeleeStrike?.();
    });
  }

  /* ── Fleet API ─────────────────────────────────────────────── */

  _fillApi() {
    const host = this.el.querySelector('[data-panel="api"]');
    if (!host || this._tab !== 'api') return;

    const health = this.api.lastHealth;
    host.innerHTML = `
      <p class="inv-hint">Deployable game API (Railway). Account bag / characters — not localStorage heroes.</p>
      <div class="inv-card">
        <div class="inv-card__row"><span>Base</span><b class="inv-code">${FLEET_API_DEFAULT.replace('https://', '')}</b></div>
        <div class="inv-card__row"><span>Health</span><b data-health>${health ? (health.ok ? `OK ${health.latencyMs}ms` : health.message) : 'not checked'}</b></div>
      </div>
      <div class="inv-btn-row">
        <button type="button" class="inv-btn" data-ping>Ping health</button>
        <button type="button" class="inv-btn inv-btn--ghost" data-chars>List characters</button>
      </div>
      <pre class="inv-pre" data-api-out>—</pre>
      <div class="inv-btn-row">
        <a class="inv-btn inv-btn--ghost" href="${GRUDGE_ID_URL}" target="_blank" rel="noopener">Grudge ID ↗</a>
        <a class="inv-btn inv-btn--ghost" href="${OPEN_LIBRARY_URL}" target="_blank" rel="noopener">Open ↗</a>
        <a class="inv-btn inv-btn--ghost" href="${MAIN_PANEL_URL}" target="_blank" rel="noopener">Main Panel ↗</a>
      </div>
      <p class="inv-hint">Lab does not invent auth — token from localStorage grudge_token if present. CORS may block browser calls; server proxy is production path.</p>
    `;

    const out = host.querySelector('[data-api-out]');
    host.querySelector('[data-ping]')?.addEventListener('click', async () => {
      out.textContent = 'ping…';
      const st = await this.api.health();
      host.querySelector('[data-health]').textContent = st.ok
        ? `OK ${st.latencyMs}ms`
        : st.message;
      out.textContent = JSON.stringify(st, null, 2);
      this.onToast(st.ok ? 'API healthy' : 'API unreachable');
    });

    host.querySelector('[data-chars]')?.addEventListener('click', async () => {
      out.textContent = 'fetch…';
      const r = await this.api.listCharacters();
      out.textContent = JSON.stringify(
        {
          message: r.message,
          count: r.characters.length,
          sample: r.characters.slice(0, 5).map((c) => ({
            id: c.id || c.characterId,
            name: c.name || c.displayName,
            race: c.race || c.raceId,
            era: c.gameEra || c.era
          }))
        },
        null,
        2
      );
      this.onToast(r.message);
    });
  }

  dispose() {
    this.el.remove();
  }
}
