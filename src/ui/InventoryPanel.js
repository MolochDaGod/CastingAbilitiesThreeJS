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
  setActiveSkillTree,
  setSkillKitPage,
  setT0WandSlot3,
  getT0WandSlot3,
  T0_WAND_SLOT3_OPTIONS
} from '../combat/drcSkills.js';
// setActiveSkillTree / getActiveSkills used by weapon equip
import { allElementWeaponSkillTrees } from '../combat/elementWeaponSkills.js';
import { CASTING_SPELL_KIT } from '../combat/castingSpellKit.js';
import {
  animPackForLoadout,
  activeWeaponSlot,
  packCombatBlurb,
  WEAPON_SLOT_TO_PACK
} from '../config/weaponAnimPack.js';
import {
  ensureWeaponCatalog,
  listEquippableWeapons,
  equipWeaponById,
  unequipWeapon,
  getEquippedWeapon,
  getEquippedSlot3Id,
  setEquippedSlot3,
  downloadEquippedPrefab,
  exportEquippedPrefab
} from '../combat/equippedWeaponRuntime.js';
import {
  loadGameItemCatalog,
  queryGameItems,
  exportItemPrefabSnapshot,
  PREFAB_CATEGORIES,
  ITEM_BROWSER_URL,
  WEAPON_SKILLS_HTML
} from '../api/gameItemCatalog.js';

/**
 * Left-side Lab Panel — Main Panel / character production tester (not a fork).
 *
 * Tabs: Character · Equipment · Weapon · Prefabs · Race · Mesh · Mount · Anims · API
 * Prefabs = full game item import (weapons, armour, relics, mounts…) from info SSOT.
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
    /** @type {string} Prefabs category filter */
    this._prefabCat = 't0';
    this._prefabQ = '';
    this._prefabSelected = null;
    this._gameItems = null;

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
      { id: 'prefabs', label: 'Prefabs' },
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
          <section class="inv-section" data-panel="prefabs" hidden></section>
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
    this._fillPrefabs();
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
    const loadout = this.character.equipment?.loadout || {};
    const wSlot = activeWeaponSlot(loadout);
    const pack = animPackForLoadout(loadout, s.animPackId);
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
        <div class="inv-card__row"><span>Weapon</span><b>${wSlot || s.weaponSlot || '—'}</b></div>
        <div class="inv-card__row"><span>Anim pack</span><b>${pack || s.animPackId || '—'}</b></div>
        <div class="inv-card__row"><span>Combat roles</span><b>${packCombatBlurb(pack).split(': ')[1] || '—'}</b></div>
        <div class="inv-card__row"><span>Clips</span><b>${(s.clips || []).length}</b></div>
      </div>
      <p class="inv-hint">Weapon → pack: staff=magic · bow=longbow · sword/axe/hammer=sword_shield</p>
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

  /* ── Weapon equipped (catalog prefab + skills + icon + 3D) ─── */

  async _fillWeapon() {
    const host = this.el.querySelector('[data-panel="weapon"]');
    if (!host || this._tab !== 'weapon') return;

    const c = this.character;
    host.innerHTML = `<p class="inv-hint">Loading weapon prefabs + T0 skills…</p>`;

    try {
      await ensureWeaponCatalog();
    } catch (err) {
      host.innerHTML = `<p class="inv-hint">Catalog failed: ${err?.message || err}</p>`;
      return;
    }
    if (this._tab !== 'weapon') return;

    const weapons = listEquippableWeapons();
    const equipped = getEquippedWeapon();
    const slot3Id = getEquippedSlot3Id();
    const loadout = c.equipment?.loadout || {};
    const kitSlot = WEAPON_SLOTS.find((s) => loadout[s] && loadout[s] !== 'none') || null;

    const equipCards = weapons
      .map((w) => {
        const on = equipped?.id === w.id;
        const skills = [w.slot1?.name, w.slot2?.name, w.slot3Options?.[0]?.name]
          .filter(Boolean)
          .join(' · ');
        return `
        <button type="button" class="inv-weapon-card ${on ? 'is-on' : ''}" data-equip-id="${w.id}"
          title="${w.weaponType} · ${w.animPack}">
          <img class="inv-weapon-card__icon" src="${w.iconUrl || ''}" alt="" loading="lazy" />
          <div class="inv-weapon-card__body">
            <div class="inv-weapon-card__name">${w.name}</div>
            <div class="inv-weapon-card__meta">T${w.tier} · ${w.weaponType} · ${w.meshSlot}</div>
            <div class="inv-weapon-card__skills">${skills}</div>
          </div>
        </button>`;
      })
      .join('');

    const skillRows = equipped
      ? [
          equipped.slot1,
          equipped.slot2,
          ...(equipped.slot3Options || [])
        ]
          .filter(Boolean)
          .map((sk) => {
            const isS3 = (equipped.slot3Options || []).some((o) => o.id === sk.id);
            const active = !isS3 || sk.id === slot3Id;
            return `
            <button type="button" class="inv-skill ${active ? '' : 'is-dim'}" data-wskill="${sk.id}" data-choice="${isS3 ? '1' : '0'}">
              <img class="inv-skill__icon" src="${sk.iconUrl || equipped.iconUrl || ''}" alt="" />
              <span class="inv-skill__key">${sk.slotType === 'primary' ? '1' : sk.slotType === 'secondary' ? '2' : '3'}</span>
              <span>${sk.name}</span>
              <span class="inv-skill__meta">${sk.damageType || ''} · ${sk.damage || 0} dmg · CD ${sk.cooldown ?? '—'}</span>
            </button>`;
          })
          .join('')
      : '<p class="inv-hint">Equip a weapon to load its 3-slot skills.</p>';

    host.innerHTML = `
      <p class="inv-hint"><b>Import from</b> <a href="https://info.grudge-studio.com/WEAPON_SKILLS.html" target="_blank" rel="noopener">WEAPON_SKILLS.html</a> · <code>t0-weapons.json</code> — no local skill invent</p>
      <p class="inv-hint">Starters: <b>Apprentice Wand</b> (t0-wand) · <b>Sapling Staff</b> (t0-nature-staff). Mage Wand = later class item.</p>
      <p class="inv-hint">Equipped: <b>${equipped ? equipped.name : 'none'}</b> · kit mesh: <b>${kitSlot || '—'}</b> · pack: <b>${c.animPackId}</b></p>
      ${
        equipped
          ? `<div class="inv-equip-banner">
          <img src="${equipped.iconUrl || ''}" alt="" />
          <div>
            <div><b>${equipped.name}</b> · ${equipped.weaponType}</div>
            <div class="inv-hint">model: ${(equipped.modelUrl || '—').split('/').pop()}</div>
            <div class="inv-hint">icon: ${(equipped.iconUrl || '—').split('/').pop()}</div>
          </div>
        </div>`
          : ''
      }
      <div class="inv-weapon-equip-grid">${equipCards || '<p class="inv-hint">No T0 weapons</p>'}</div>
      <div class="inv-btn-row">
        <button type="button" class="inv-btn inv-btn--ghost" data-unequip>Unequip</button>
        <button type="button" class="inv-btn" data-export-prefab>Export Warlords prefab JSON</button>
        <button type="button" class="inv-btn inv-btn--ghost" data-copy-prefab>Copy prefab</button>
      </div>
      <p class="inv-hint">Skills on this weapon (1–2 fixed · 3 choose)</p>
      <div class="inv-skill-list">${skillRows}</div>
      <button type="button" class="inv-btn" data-strike>F — interact / attack</button>
      <p class="inv-hint">Combat Q · 1–3 weapon skills · mesh_ids kit + CDN GLB hand attach</p>
    `;

    host.querySelectorAll('[data-equip-id]').forEach((btn) => {
      btn.addEventListener(
        'click',
        this._busyGuard(async () => {
          const id = btn.dataset.equipId;
          try {
            const result = await equipWeaponById(id, {
              character: c,
              onToast: (m) => this.onToast(m)
            });
            setActiveSkillTree('equipped');
            const drc = this.getDrc?.();
            if (drc) drc.skills = getActiveSkills();
            this.onEquip?.();
            this.onToast(
              `Try skills 1–3 · ${result.hotbar.map((s) => s.label).join(' · ')}`
            );
            this.refresh();
          } catch (err) {
            this.onToast(err?.message || 'Equip failed');
          }
        })
      );
    });

    host.querySelector('[data-unequip]')?.addEventListener('click', () => {
      unequipWeapon({ character: c, onToast: (m) => this.onToast(m) });
      setActiveSkillTree('kit');
      const drc = this.getDrc?.();
      if (drc) drc.skills = getActiveSkills();
      this.refresh();
    });

    host.querySelector('[data-export-prefab]')?.addEventListener('click', () => {
      if (downloadEquippedPrefab()) this.onToast('Downloaded Warlords weapon prefab JSON');
      else this.onToast('Equip a weapon first');
    });

    host.querySelector('[data-copy-prefab]')?.addEventListener('click', async () => {
      const data = exportEquippedPrefab();
      if (!data) {
        this.onToast('Equip a weapon first');
        return;
      }
      try {
        await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
        this.onToast('Prefab JSON copied');
      } catch {
        this.onToast('Copy failed — use Export download');
      }
    });

    host.querySelectorAll('[data-wskill]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.wskill;
        const choice = btn.dataset.choice === '1';
        if (choice) {
          setEquippedSlot3(id);
          setActiveSkillTree('equipped');
          const drc = this.getDrc?.();
          if (drc) drc.skills = getActiveSkills();
          this.onToast(`Slot 3 · ${btn.querySelector('span:nth-child(3)')?.textContent || id}`);
          this.refresh();
          return;
        }
        // Fire skill by bar slot
        const bar = getActiveSkills();
        const idx = bar.findIndex((s) => s.id === id);
        if (idx >= 0) this.getDrc?.()?.useSkill?.(idx);
      });
    });

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

  /* ── Prefabs (full game items · production SSOT) ───────────── */

  async _fillPrefabs() {
    const host = this.el.querySelector('[data-panel="prefabs"]');
    if (!host || this._tab !== 'prefabs') return;

    host.innerHTML = `<p class="inv-hint">Loading game-library + master catalogs…</p>`;
    try {
      this._gameItems = await loadGameItemCatalog();
    } catch (err) {
      host.innerHTML = `<p class="inv-hint">Catalog load failed: ${err?.message || err}</p>`;
      return;
    }
    if (this._tab !== 'prefabs') return;

    const cat = this._gameItems;
    const counts = cat.counts || {};
    const rows = queryGameItems(cat, {
      category: this._prefabCat,
      q: this._prefabQ,
      limit: 60
    });
    const sel = this._prefabSelected;

    const catBtns = PREFAB_CATEGORIES.map(
      (c) =>
        `<button type="button" class="inv-btn inv-btn--ghost ${this._prefabCat === c.id ? 'is-on' : ''}" data-pcat="${c.id}">${c.label} (${counts[c.id] ?? 0})</button>`
    ).join('');

    const list = rows
      .map((r) => {
        const on = sel?.id === r.id;
        return `
        <button type="button" class="inv-weapon-card ${on ? 'is-on' : ''}" data-pitem="${r.id}" data-pcat-row="${r.category}">
          <img class="inv-weapon-card__icon" src="${r.iconUrl || ''}" alt="" loading="lazy" />
          <div class="inv-weapon-card__body">
            <div class="inv-weapon-card__name">${r.name}</div>
            <div class="inv-weapon-card__meta">T${r.tier} · ${r.category}${r.weaponType ? ' · ' + r.weaponType : ''}${r.slot ? ' · ' + r.slot : ''}</div>
            <div class="inv-weapon-card__skills">${r.equippable ? 'equippable' : 'catalog'} · ${r.source}</div>
          </div>
        </button>`;
      })
      .join('');

    const detail = sel
      ? `<div class="inv-equip-banner">
          <img src="${sel.iconUrl || ''}" alt="" />
          <div>
            <div><b>${sel.name}</b> · ${sel.category}</div>
            <div class="inv-hint">${(sel.description || '').slice(0, 160)}</div>
            <div class="inv-hint">id: ${sel.id}</div>
            <div class="inv-hint">model: ${(sel.modelUrl || '—').split('/').pop()}</div>
            <div class="inv-hint">stats: ${sel.stats ? JSON.stringify(sel.stats).slice(0, 120) : '—'}</div>
          </div>
        </div>
        <div class="inv-btn-row">
          ${sel.equippable ? `<button type="button" class="inv-btn" data-pequip>Equip (combat bar)</button>` : ''}
          <button type="button" class="inv-btn inv-btn--ghost" data-pexport>Export prefab JSON</button>
          <button type="button" class="inv-btn inv-btn--ghost" data-pcopy>Copy JSON</button>
        </div>`
      : '<p class="inv-hint">Select a row to inspect · export for Warlords / HUD / combat binds.</p>';

    host.innerHTML = `
      <p class="inv-hint"><b>Production prefab import</b> — weapons, armour, relics, mounts, class, off-hands, specials</p>
      <p class="inv-hint">
        <a href="${ITEM_BROWSER_URL}" target="_blank" rel="noopener">Item Database ↗</a> ·
        <a href="${WEAPON_SKILLS_HTML}" target="_blank" rel="noopener">WEAPON_SKILLS ↗</a> ·
        no invented ITEM-* ids
      </p>
      <div class="inv-btn-row" style="flex-wrap:wrap">${catBtns}</div>
      <input type="search" class="inv-input" data-pq placeholder="Search name / id…" value="${this._prefabQ.replace(/"/g, '&quot;')}" />
      ${detail}
      <div class="inv-weapon-equip-grid">${list || '<p class="inv-hint">No rows (try another category)</p>'}</div>
      <p class="inv-hint">Consumers: items · character HUD · UI · controller · combat · this lab. Doc: GAME_ITEM_PREFAB_PRODUCTION_SSOT.md</p>
    `;

    host.querySelectorAll('[data-pcat]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this._prefabCat = btn.dataset.pcat;
        this._prefabSelected = null;
        this._fillPrefabs();
      });
    });

    const search = host.querySelector('[data-pq]');
    search?.addEventListener('change', () => {
      this._prefabQ = search.value || '';
      this._fillPrefabs();
    });
    search?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        this._prefabQ = search.value || '';
        this._fillPrefabs();
      }
    });

    host.querySelectorAll('[data-pitem]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.pitem;
        const pool = queryGameItems(cat, {
          category: this._prefabCat,
          q: this._prefabQ,
          limit: 200
        });
        this._prefabSelected = pool.find((r) => r.id === id) || null;
        this._fillPrefabs();
      });
    });

    host.querySelector('[data-pequip]')?.addEventListener('click', async () => {
      if (!sel?.equippable) return;
      try {
        await equipWeaponById(sel.id, {
          character: this.character,
          onToast: (m) => this.onToast(m)
        });
        setActiveSkillTree('equipped');
        const drc = this.getDrc?.();
        if (drc) drc.skills = getActiveSkills();
        this.onToast(`Equipped ${sel.name} · combat 1–3`);
        this.onEquip?.();
      } catch (err) {
        this.onToast(err?.message || 'Equip failed (not a T0/weapon id?)');
      }
    });

    host.querySelector('[data-pexport]')?.addEventListener('click', () => {
      const snap = exportItemPrefabSnapshot(sel);
      if (!snap) return;
      const blob = new Blob([JSON.stringify(snap, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${snap.id}.game-item-prefab.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      this.onToast('Downloaded prefab snapshot');
    });

    host.querySelector('[data-pcopy]')?.addEventListener('click', async () => {
      const snap = exportItemPrefabSnapshot(sel);
      if (!snap) return;
      try {
        await navigator.clipboard.writeText(JSON.stringify(snap, null, 2));
        this.onToast('Prefab JSON copied');
      } catch {
        this.onToast('Copy failed');
      }
    });
  }

  /* ── Weapon skills (DRC / trees) ───────────────────────────── */

  _fillSkills() {
    const host = this.el.querySelector('[data-panel="skills"]');
    if (!host || this._tab !== 'skills') return;

    const bar = getActiveSkills();
    const melee = DRC_MELEE_STRIKE;
    const trees = allElementWeaponSkillTrees();
    const kit = CASTING_SPELL_KIT;

    const skillRows = [
      ...bar.map(
        (s) =>
          `<button type="button" class="inv-skill" data-slot="${s.slot}">
              <span class="inv-skill__key">${s.slot + 1}</span>
              <span>${s.label}</span>
              <span class="inv-skill__meta">${s.pathMode || s.style} · ${s.element || ''} · ${s.cooldown}s</span>
            </button>`
      ),
      `<button type="button" class="inv-skill" data-melee="1">
          <span class="inv-skill__key">F</span>
          <span>Interact / attack</span>
          <span class="inv-skill__meta">pickup · harvest · residual</span>
        </button>`
    ].join('');

    const kitRows = kit
      .map(
        (s) =>
          `<button type="button" class="inv-skill inv-skill--kit" data-kit-id="${s.id}" title="${s.catalogSkillId}">
            <span class="inv-skill__key">${s.slot + 1}</span>
            <span>${s.label}</span>
            <span class="inv-skill__meta">${s.element} · ${s.pathMode} · ${s.abilityClass}</span>
          </button>`
      )
      .join('');

    const slot3 = getT0WandSlot3();
    const wandChoice = T0_WAND_SLOT3_OPTIONS.map(
      (s) =>
        `<button type="button" class="inv-btn ${s.id === slot3 ? 'inv-btn--active' : 'inv-btn--ghost'}" data-wand-slot3="${s.id}">
          ${s.label} · ${s.damage} dmg
        </button>`
    ).join('');

    host.innerHTML = `
        <p class="inv-hint"><b>T0 Apprentice Wand</b> · three-slot starter → <a href="https://info.grudge-studio.com/WEAPON_SKILLS.html" target="_blank" rel="noopener">WEAPON_SKILLS</a> WAND</p>
        <div class="inv-btn-row">
          <button type="button" class="inv-btn" data-tree="wand">Apprentice Wand bar</button>
        </div>
        <p class="inv-hint">Slot 1 Auto · Practice Bolt · Slot 2 Auto · Focus · Slot 3 Choose One</p>
        <div class="inv-btn-row">${wandChoice}</div>
        <div class="inv-skill-list">${skillRows}</div>
        <p class="inv-hint"><b>10-spell kit</b> (staff learning) · pages on 1–4</p>
        <div class="inv-btn-row">
          <button type="button" class="inv-btn inv-btn--ghost" data-kit-page="0">1–4 Fire/Ice</button>
          <button type="button" class="inv-btn inv-btn--ghost" data-kit-page="1">5–8 Earth/Wind</button>
          <button type="button" class="inv-btn inv-btn--ghost" data-kit-page="2">9–10 Holy/Meteor</button>
        </div>
        <div class="inv-btn-row">
          <button type="button" class="inv-btn inv-btn--ghost" data-tree="kit">Kit bar</button>
          <button type="button" class="inv-btn inv-btn--ghost" data-tree="wand">Apprentice Wand</button>
          <button type="button" class="inv-btn inv-btn--ghost" data-tree="sapling">Sapling Staff</button>
          <button type="button" class="inv-btn inv-btn--ghost" data-tree="arcane">Arcane bar</button>
          <button type="button" class="inv-btn inv-btn--ghost" data-tree="legacy">Legacy 4</button>
        </div>
        <p class="inv-hint">Starters import from WEAPON_SKILLS · prefer <b>Weapon</b> tab equip for full catalog</p>
        <div class="inv-skill-list">${kitRows}</div>
        <p class="inv-hint">Trees: ${Object.keys(trees).join(', ')} · magic pack · cast role</p>
        <p class="inv-hint">1–3 T0 wand · 1–4 kit · F interact · E block · C parry</p>
      `;

    host.querySelectorAll('[data-kit-page]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const page = Number(btn.dataset.kitPage) || 0;
        setActiveSkillTree('kit');
        const drc = this.getDrc?.();
        if (drc?.setSpellKitPage) drc.setSpellKitPage(page);
        else {
          setSkillKitPage(page);
          if (drc) drc.skills = getActiveSkills();
        }
        this.onToast(`Spell kit page ${page + 1}`);
        this.refresh();
      });
    });

    host.querySelectorAll('[data-tree]').forEach((btn) => {
      btn.addEventListener('click', () => {
        setActiveSkillTree(btn.dataset.tree);
        const drc = this.getDrc?.();
        if (drc) {
          drc.skills = getActiveSkills();
          if (btn.dataset.tree === 'wand' || btn.dataset.tree === 'sapling') {
            this.character?.setAnimPack?.('magic');
            this.character?.setWeaponSlot?.('staff');
            // Warm catalog so bars use live t0-weapons.json
            void ensureWeaponCatalog?.();
          }
        }
        const treeMsg = {
          wand: 'Catalog Apprentice Wand · Practice Bolt · Focus · Frost Spark|Arcane Ping',
          sapling: 'Catalog Sapling Staff · Practice Root · Nature Ward · Vine Lash|Healing Sprout'
        };
        this.onToast(treeMsg[btn.dataset.tree] || `Skill tree · ${btn.dataset.tree}`);
        this.refresh();
      });
    });

    host.querySelectorAll('[data-wand-slot3]').forEach((btn) => {
      btn.addEventListener('click', () => {
        setT0WandSlot3(btn.dataset.wandSlot3);
        setActiveSkillTree('wand');
        const drc = this.getDrc?.();
        if (drc) drc.skills = getActiveSkills();
        this.onToast(`Slot 3 · ${btn.textContent.trim()}`);
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

    host.querySelectorAll('[data-kit-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.kitId;
        const spell = kit.find((s) => s.id === id);
        if (!spell) return;
        const page = Math.floor(spell.slot / 4);
        const barSlot = spell.slot % 4;
        setActiveSkillTree('kit');
        const drc = this.getDrc?.();
        if (drc?.setSpellKitPage) drc.setSpellKitPage(page);
        else setSkillKitPage(page);
        if (drc) {
          drc.skills = getActiveSkills();
          drc.useSkill?.(barSlot);
        }
        this.onToast(`${spell.label} → ${spell.catalogSkillId}`);
        this.refresh();
      });
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
