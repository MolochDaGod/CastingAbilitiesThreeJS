/**
 * Showcase — review races, weapons, meshes, anims in the live environment
 * and bind master weapon skills (ObjectStore) to hotkeys 1–4 / F.
 *
 * Catalog SSOT: info.grudge-studio.com/api/v1/master-weaponSkills.json
 * UI ref:       info.grudge-studio.com/WEAPON_SKILLS.html
 */

import { Vector3 } from 'three';
import { RACES, ANIM_PACKS, ANIM_PACK_META, WEAPON_SLOTS } from '../config/assets.js';
import {
  loadWeaponSkillsCatalog,
  skillsForWeaponType,
  defaultHotbarForWeaponType,
  animRoleForSkill,
  vfxIdForSkill,
  WEAPON_SKILLS_HTML,
  INFO_DOCS_URL,
  iconCdnUrl,
  normalizeWeaponTypeId
} from '../api/weaponSkillsCatalog.js';
import {
  loadSkillBindings,
  setSkillBinding,
  bindHotbarFromSkills,
  getSkillBinding
} from '../combat/skillBindings.js';
import { packCombatBlurb } from '../config/weaponAnimPack.js';
import {
  groupRolesByFamily,
  classifyRole,
  MOBILITY_BINDINGS,
  roleBlurb
} from '../config/animLibrary.js';

export class ShowcasePanel {
  /**
   * @param {{
   *   character: import('../animation/CharacterController.js').CharacterController,
   *   getDrc?: () => import('../combat/DrcCombatController.js').DrcCombatController|null,
   *   onToast?: (msg: string) => void,
   *   onRace?: (id: string) => void|Promise<void>,
   *   onShowcaseMode?: (on: boolean) => void,
   *   onBindingsChanged?: () => void,
   *   playSkillPreview?: (skill: object) => void
   * }} opts
   */
  constructor(opts) {
    this.character = opts.character;
    this.getDrc = opts.getDrc || (() => null);
    this.onToast = opts.onToast || (() => {});
    this.onRace = opts.onRace || null;
    this.onShowcaseMode = opts.onShowcaseMode || null;
    this.onBindingsChanged = opts.onBindingsChanged || null;
    this.playSkillPreview = opts.playSkillPreview || null;

    this.open = false;
    this._busy = false;
    this._cat = null;
    this._weaponTypeId = 'SWORD';
    this._filter = '';
    this._selectedSkillId = null;
    this._bindSlot = '0';

    this.el = document.createElement('div');
    this.el.id = 'showcase-panel';
    this.el.className = 'showcase-panel';
    this.el.hidden = true;
    document.body.appendChild(this.el);
    this._renderShell();
  }

  _renderShell() {
    this.el.innerHTML = `
      <header class="showcase-panel__head">
        <div>
          <h2>Showcase</h2>
          <p class="showcase-panel__sub">Race · mesh · weapon · anim · bind real skills (master catalog)</p>
        </div>
        <button type="button" class="showcase-panel__close" data-close aria-label="Close">×</button>
      </header>
      <div class="showcase-panel__body">
        <section class="showcase-block" data-sec="env"></section>
        <section class="showcase-block" data-sec="weapon"></section>
        <section class="showcase-block" data-sec="anims"></section>
        <section class="showcase-block" data-sec="skills"></section>
        <section class="showcase-block" data-sec="bind"></section>
      </div>
      <footer class="showcase-panel__foot">
        <a href="${WEAPON_SKILLS_HTML}" target="_blank" rel="noopener">WEAPON_SKILLS ↗</a>
        ·
        <a href="${INFO_DOCS_URL}" target="_blank" rel="noopener">API docs ↗</a>
        · localStorage bindings
      </footer>
    `;
    this.el.querySelector('[data-close]').addEventListener('click', () => this.setOpen(false));
    this.el.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.el.addEventListener('wheel', (e) => e.stopPropagation());
  }

  toggle() {
    this.setOpen(!this.open);
  }

  setOpen(open) {
    this.open = !!open;
    this.el.hidden = !this.open;
    this.onShowcaseMode?.(this.open);
    if (this.open) {
      this.refresh();
      this._ensureCatalog();
    }
  }

  async _ensureCatalog() {
    if (this._cat) return this._cat;
    try {
      this.onToast('Loading master-weaponSkills…');
      this._cat = await loadWeaponSkillsCatalog();
      this.onToast(`Catalog v${this._cat.version} · ${this._cat.totalSkills} skills`);
      this.refresh();
      return this._cat;
    } catch (err) {
      this.onToast(err?.message || 'Catalog load failed');
      return null;
    }
  }

  refresh() {
    if (!this.open) return;
    this._fillEnv();
    this._fillWeapon();
    this._fillAnims();
    this._fillSkills();
    this._fillBind();
  }

  _busyGuard(fn) {
    return async (...args) => {
      if (this._busy) return;
      this._busy = true;
      try {
        await fn(...args);
      } catch (e) {
        console.error(e);
        this.onToast(e?.message || String(e));
      } finally {
        this._busy = false;
        this.refresh();
      }
    };
  }

  /* ── Environment: race + mesh ─────────────────────────────── */

  _fillEnv() {
    const host = this.el.querySelector('[data-sec="env"]');
    if (!host) return;
    const c = this.character;
    const raceOpts = Object.values(RACES)
      .map(
        (r) =>
          `<option value="${r.id}" ${c.raceId === r.id ? 'selected' : ''}>${r.id} · ${r.label}</option>`
      )
      .join('');

    host.innerHTML = `
      <h3>Environment</h3>
      <label class="showcase-row">
        <span>Race (Toon RTS GLB)</span>
        <select data-race>${raceOpts}</select>
      </label>
      <label class="showcase-row">
        <span>Class preset</span>
        <select data-preset>
          ${(c.presets || [])
            .map(
              (p) =>
                `<option value="${p.id}" ${c.presetId === p.id ? 'selected' : ''}>${p.label || p.id}</option>`
            )
            .join('')}
        </select>
      </label>
      <p class="showcase-hint">Pack: <b>${c.animPackId}</b> · ${packCombatBlurb(c.animPackId)}</p>
      <div class="showcase-btn-row">
        <button type="button" class="showcase-btn" data-idle>Idle</button>
        <button type="button" class="showcase-btn" data-walk>Walk</button>
        <button type="button" class="showcase-btn" data-run>Run</button>
        <button type="button" class="showcase-btn" data-attack>Attack/Cast</button>
      </div>
    `;

    host.querySelector('[data-race]')?.addEventListener(
      'change',
      this._busyGuard(async (e) => {
        if (this.onRace) await this.onRace(e.target.value);
        else await c.setRace?.(e.target.value);
        this.onToast(`Race · ${e.target.value}`);
      })
    );
    host.querySelector('[data-preset]')?.addEventListener(
      'change',
      this._busyGuard(async (e) => {
        c.applyPreset(e.target.value);
        await c.syncAnimPackFromLoadout?.({ packHint: c.animPackId });
        this.onToast(`Preset · ${e.target.value}`);
      })
    );
    host.querySelector('[data-idle]')?.addEventListener('click', () => c.play?.('idle', 0.15));
    host.querySelector('[data-walk]')?.addEventListener('click', () => c.play?.('walk', 0.15) || c.play?.('run', 0.15));
    host.querySelector('[data-run]')?.addEventListener('click', () => c.play?.('run', 0.15));
    host.querySelector('[data-attack]')?.addEventListener('click', () => {
      c.playWeaponCombat?.('attack') || c.playWeaponCombat?.('cast');
    });
  }

  /* ── Weapon type (catalog) ────────────────────────────────── */

  _fillWeapon() {
    const host = this.el.querySelector('[data-sec="weapon"]');
    if (!host) return;
    const types = this._cat?.weaponTypes || [];
    const opts = types.length
      ? types
          .map((wt) => {
            const id = normalizeWeaponTypeId(wt.id || wt.name);
            return `<option value="${id}" ${id === this._weaponTypeId ? 'selected' : ''}>${wt.name || id} (${wt.totalSkills || 0})</option>`;
          })
          .join('')
      : `<option value="${this._weaponTypeId}">${this._weaponTypeId}</option>`;

    host.innerHTML = `
      <h3>Weapon type (master catalog)</h3>
      <label class="showcase-row">
        <span>Type</span>
        <select data-wtype>${opts}</select>
      </label>
      <div class="showcase-btn-row">
        <button type="button" class="showcase-btn" data-apply-weapon>Equip mesh + pack</button>
        <button type="button" class="showcase-btn showcase-btn--ghost" data-t0-bar>Bind T0 hotbar 1–4</button>
      </div>
      <p class="showcase-hint">Maps to lab mesh_ids + anim pack (staff→magic, bow→longbow, sword→sword_shield)</p>
    `;

    host.querySelector('[data-wtype]')?.addEventListener('change', (e) => {
      this._weaponTypeId = e.target.value;
      this.refresh();
    });

    host.querySelector('[data-apply-weapon]')?.addEventListener(
      'click',
      this._busyGuard(async () => {
        await this._applyWeaponType(this._weaponTypeId);
      })
    );

    host.querySelector('[data-t0-bar]')?.addEventListener(
      'click',
      this._busyGuard(async () => {
        const cat = await this._ensureCatalog();
        if (!cat) return;
        const bar = defaultHotbarForWeaponType(cat, this._weaponTypeId);
        bindHotbarFromSkills(bar);
        this.onBindingsChanged?.();
        this.onToast(`Bound ${bar.length} skills → 1–4`);
      })
    );
  }

  async _applyWeaponType(typeId) {
    const cat = await this._ensureCatalog();
    const wt = cat?.weaponTypes?.find(
      (w) => normalizeWeaponTypeId(w.id || w.name) === normalizeWeaponTypeId(typeId)
    );
    const skills = cat ? skillsForWeaponType(cat, typeId) : [];
    const lab = skills[0]
      ? { pack: skills[0].labPack, slot: skills[0].labSlot }
      : { pack: 'sword_shield', slot: 'sword' };

    const c = this.character;
    // Clear weapons then equip A variant of lab slot
    for (const w of WEAPON_SLOTS) c.equipment?.setSlot?.(w, null);
    if (lab.slot && lab.slot !== 'shield') {
      c.equipment?.setSlot?.(lab.slot, 'A');
    }
    await c.setAnimPack?.(lab.pack);
    await c._bindPack?.('combat_mobility');
    this.onToast(`Equipped ${typeId} · pack ${lab.pack} · ${skills.length} skills in catalog`);
  }

  /* ── Anim library ─────────────────────────────────────────── */

  _fillAnims() {
    const host = this.el.querySelector('[data-sec="anims"]');
    if (!host) return;
    const c = this.character;
    const lib = c.getAnimLibrary?.() || null;
    const roles = lib?.roles || c.listAnimRoles?.() || [];
    const byFamily = lib?.byFamily || groupRolesByFamily(roles);
    const packOpts = Object.keys(ANIM_PACKS)
      .map(
        (id) =>
          `<option value="${id}" ${c.animPackId === id ? 'selected' : ''}>${ANIM_PACK_META[id]?.label || id}</option>`
      )
      .join('');

    const familyOrder = ['gait', 'combat', 'mobility', 'utility'];
    const familyLabels = {
      gait: 'Gait (setGait)',
      combat: 'Combat (one-shot)',
      mobility: 'Mobility (dodge · roll · slide)',
      utility: 'Other'
    };
    const sections = familyOrder
      .map((fam) => {
        const list = byFamily[fam] || [];
        if (!list.length) return '';
        const buttons = list
          .map((r) => {
            const meta = classifyRole(r);
            const title = roleBlurb(r).replace(/"/g, '&quot;');
            return `<button type="button" class="showcase-clip" data-clip="${r}" data-family="${fam}" title="${title}">${meta.base || r}</button>`;
          })
          .join('');
        return `<div class="showcase-anim-family" data-family="${fam}">
          <h4 class="showcase-subh">${familyLabels[fam] || fam}</h4>
          <div class="showcase-clip-grid">${buttons}</div>
        </div>`;
      })
      .join('');

    const mobilityHint = Object.values(MOBILITY_BINDINGS)
      .map((m) => `<li><b>${m.label}</b> — ${m.input}</li>`)
      .join('');

    const mm = lib?.dodgeMm;
    const mmLine = mm
      ? `MM dodge: L/R <b>${mm.lateralM} m</b> · F/B ${mm.forwardM}/${mm.backM} m (${mm.units})`
      : '';

    host.innerHTML = `
      <h3>Animation library</h3>
      <p class="showcase-hint">Packs + roles SSOT · <code>animLibrary.js</code> · watch in scene</p>
      <label class="showcase-row">
        <span>Weapon pack</span>
        <select data-pack>${packOpts}</select>
      </label>
      <p class="showcase-hint">${packCombatBlurb(c.animPackId || 'magic')}</p>
      <p class="showcase-hint">${mmLine}</p>
      <ul class="showcase-hint showcase-mobility-list">${mobilityHint}</ul>
      ${sections || '<p class="showcase-hint">No clips — load character first</p>'}
    `;

    host.querySelector('[data-pack]')?.addEventListener(
      'change',
      this._busyGuard(async (e) => {
        await c.setAnimPack?.(e.target.value);
        await c._bindPack?.('combat_mobility');
        this.onToast(`Pack · ${e.target.value} · mobility rebound`);
        this._fillAnims();
      })
    );
    host.querySelectorAll('[data-clip]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const role = btn.dataset.clip;
        const ok =
          c.playLibraryClip?.(role) || c.play?.(role, 0.12);
        this.onToast(ok ? roleBlurb(role) : `Missing · ${role}`);
      });
    });
  }

  /* ── Master skills list ───────────────────────────────────── */

  _fillSkills() {
    const host = this.el.querySelector('[data-sec="skills"]');
    if (!host) return;

    if (!this._cat) {
      host.innerHTML = `
        <h3>Weapon skills (catalog)</h3>
        <p class="showcase-hint">Loading master-weaponSkills.json…</p>
        <button type="button" class="showcase-btn" data-reload>Load catalog</button>
      `;
      host.querySelector('[data-reload]')?.addEventListener('click', () => this._ensureCatalog());
      return;
    }

    let list = skillsForWeaponType(this._cat, this._weaponTypeId);
    const q = this._filter.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.id.toLowerCase().includes(q) ||
          s.slotType.toLowerCase().includes(q)
      );
    }
    list = list.slice(0, 80);

    host.innerHTML = `
      <h3>Skills · ${this._weaponTypeId} (${list.length} shown)</h3>
      <label class="showcase-row">
        <span>Filter</span>
        <input type="search" data-filter value="${this._filter.replace(/"/g, '')}" placeholder="name / id / slot" />
      </label>
      <div class="showcase-skill-list">
        ${list
          .map((s) => {
            const sel = s.id === this._selectedSkillId ? 'is-selected' : '';
            const ic = s.iconUrl
              ? `<img src="${s.iconUrl}" alt="" width="28" height="28" loading="lazy" />`
              : `<span class="showcase-skill__glyph">⚔</span>`;
            return `
            <button type="button" class="showcase-skill ${sel}" data-sid="${s.id}">
              ${ic}
              <span class="showcase-skill__meta">
                <b>${s.name}</b>
                <i>${s.slotType} · CD ${s.cooldown}s · dmg ${s.damage}</i>
              </span>
            </button>`;
          })
          .join('') || '<p class="showcase-hint">No skills for this type</p>'}
      </div>
      <div class="showcase-btn-row">
        <button type="button" class="showcase-btn" data-preview>Preview selected</button>
      </div>
    `;

    host.querySelector('[data-filter]')?.addEventListener('input', (e) => {
      this._filter = e.target.value;
      this._fillSkills();
    });

    host.querySelectorAll('[data-sid]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this._selectedSkillId = btn.dataset.sid;
        this._fillSkills();
        this._fillBind();
      });
    });

    host.querySelector('[data-preview]')?.addEventListener('click', () => {
      const sk = this._cat.byId.get(this._selectedSkillId);
      if (!sk) {
        this.onToast('Select a skill');
        return;
      }
      this._previewSkill(sk);
    });
  }

  _previewSkill(sk) {
    const c = this.character;
    // Ensure pack matches skill weapon
    if (sk.labPack && sk.labPack !== c.animPackId) {
      c.setAnimPack?.(sk.labPack).then(() => {
        c._bindPack?.('combat_mobility');
        this._playSkillAnim(sk);
      });
    } else {
      this._playSkillAnim(sk);
    }
    this.playSkillPreview?.(sk);
    this.onToast(`Preview · ${sk.name}`);
  }

  _playSkillAnim(sk) {
    const role = animRoleForSkill(sk);
    const c = this.character;
    if (role === 'cast') c.playWeaponCombat?.('cast') || c.requestOneShot?.('cast');
    else if (role === 'block') c.playParry?.() || c.requestOneShot?.('block');
    else c.playWeaponCombat?.('attack') || c.requestOneShot?.('attack');

    const drc = this.getDrc?.();
    const vfx = vfxIdForSkill(sk);
    if (drc?.vfx?.deploy) {
      const yaw = c.facing;
      drc.vfx.deploy(vfx, {
        origin: c.position.clone(),
        forward: new Vector3(Math.sin(yaw), 0, Math.cos(yaw))
      });
    }
  }

  /* ── Bind to hotkey ───────────────────────────────────────── */

  _fillBind() {
    const host = this.el.querySelector('[data-sec="bind"]');
    if (!host) return;
    const binds = loadSkillBindings();
    const sk = this._cat?.byId?.get(this._selectedSkillId);

    const row = (slot, label) => {
      const b = binds[String(slot)];
      return `<div class="showcase-bind-row">
        <span class="showcase-bind-key">${label}</span>
        <span class="showcase-bind-name">${b?.name || '—'}</span>
        <button type="button" class="showcase-btn showcase-btn--tiny" data-clear-slot="${slot}">×</button>
      </div>`;
    };

    host.innerHTML = `
      <h3>Save to hotkey / weapon skill</h3>
      <p class="showcase-hint">Selected: <b>${sk?.name || 'none'}</b> · true catalog id for combat bar</p>
      <label class="showcase-row">
        <span>Slot</span>
        <select data-bind-slot>
          <option value="0" ${this._bindSlot === '0' ? 'selected' : ''}>1 · primary</option>
          <option value="1" ${this._bindSlot === '1' ? 'selected' : ''}>2 · secondary</option>
          <option value="2" ${this._bindSlot === '2' ? 'selected' : ''}>3 · ability</option>
          <option value="3" ${this._bindSlot === '3' ? 'selected' : ''}>4 · ultimate</option>
          <option value="f" ${this._bindSlot === 'f' ? 'selected' : ''}>F · interact fallback attack</option>
        </select>
      </label>
      <div class="showcase-btn-row">
        <button type="button" class="showcase-btn" data-bind>Bind selected → slot</button>
        <button type="button" class="showcase-btn showcase-btn--ghost" data-fire-bind>Fire bound slot</button>
      </div>
      <div class="showcase-binds">
        ${row(0, '1')}${row(1, '2')}${row(2, '3')}${row(3, '4')}${row('f', 'F')}
      </div>
    `;

    host.querySelector('[data-bind-slot]')?.addEventListener('change', (e) => {
      this._bindSlot = e.target.value;
    });

    host.querySelector('[data-bind]')?.addEventListener('click', () => {
      if (!sk) {
        this.onToast('Select a skill first');
        return;
      }
      setSkillBinding(this._bindSlot, {
        skillId: sk.id,
        name: sk.name,
        weaponTypeId: sk.weaponTypeId,
        labPack: sk.labPack,
        labSlot: sk.labSlot,
        iconUrl: sk.iconUrl,
        cooldown: sk.cooldown,
        damageType: sk.damageType
      });
      this.onBindingsChanged?.();
      this.onToast(`Bound ${sk.name} → ${this._bindSlot === 'f' ? 'F' : Number(this._bindSlot) + 1}`);
      this._fillBind();
    });

    host.querySelector('[data-fire-bind]')?.addEventListener('click', () => {
      const b = getSkillBinding(this._bindSlot);
      if (!b) {
        this.onToast('Empty slot');
        return;
      }
      const full = this._cat?.byId?.get(b.skillId) || b;
      this._previewSkill(full);
      const drc = this.getDrc?.();
      if (this._bindSlot === 'f') drc?.useMeleeStrike?.();
      else drc?.useSkill?.(Number(this._bindSlot));
    });

    host.querySelectorAll('[data-clear-slot]').forEach((btn) => {
      btn.addEventListener('click', () => {
        setSkillBinding(btn.dataset.clearSlot, null);
        this.onBindingsChanged?.();
        this._fillBind();
      });
    });
  }

  dispose() {
    this.el.remove();
  }
}
