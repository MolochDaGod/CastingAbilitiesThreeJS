import { EQUIP_SLOTS, WEAPON_SLOTS, ANIM_PACKS, ANIM_PACK_META, RACES } from '../config/assets.js';
import { settings } from '../config/settings.js';
import {
  fleetApi,
  MAIN_PANEL_URL,
  OPEN_LIBRARY_URL,
  CHARACTER_FOUNDRY_URL,
  GRUDGE_ID_URL,
  FLEET_API_DEFAULT,
  CRAFT_SSOT_URL
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
  getActiveLoadoutIndex,
  downloadEquippedPrefab,
  exportEquippedPrefab
} from '../combat/equippedWeaponRuntime.js';
import './warlords-dev-ui.css';
import {
  loadGameItemCatalog,
  queryGameItems,
  exportItemPrefabSnapshot,
  PREFAB_CATEGORIES,
  ITEM_BROWSER_URL,
  WEAPON_SKILLS_HTML
} from '../api/gameItemCatalog.js';
import {
  loadPrefabScaffold,
  buildItemScaffoldPack,
  downloadJson,
  SCAFFOLD_ENDPOINTS
} from '../api/prefabScaffold.js';
import {
  exportWarlordsWeaponPrefab,
  getEquippableWeaponsCache
} from '../api/t0WeaponCatalog.js';
import {
  PAPERDOLL_LEFT,
  PAPERDOLL_RIGHT,
  BAG_LAYOUT,
  BAG_SKINS,
  PROFESSION_TREES,
  getPaperdollSlots,
  loadBag,
  saveBag,
  loadEquipMap,
  saveEquipMap,
  loadBagSkin,
  saveBagSkin,
  loadProfessionProgress,
  unlockProfessionNode,
  loadSlotAdminOverrides,
  saveSlotAdminOverrides,
  ensureDemoBag,
  bagAdd,
  bagRemoveAt,
  itemFitsSlot,
  ALL_PAPERDOLL_SLOTS,
  reenrichAllBagIcons,
  enrichBagSlotIcon
} from './mainPanelSlots.js';
import {
  withResolvedIcon,
  bagItemFromCatalogRow,
  resolveItemIcon
} from './iconResolve.js';
import './mainPanel.css';
import './itemContextMenu.css';
import {
  bindItemContextMenu,
  openItemContextMenu,
  unequipPaperdollSlot,
  closeItemContextMenu
} from './itemContextMenu.js';
import {
  applyMainPanelUiVars,
  MAIN_PANEL_PROD,
  UI_ASSET_CATALOG
} from './uiAssetCatalog.js';
import { fleetDeploySnapshot } from '../config/fleetEnv.js';

/**
 * Main Panel — Warlords / TI equipment look · inventory slots · production tester.
 *
 * Character: paperdoll (LMB slot → inventory picker)
 * Equipment / Inventory: bag grid + equip map
 * Skills: WCS profession skill trees + combat trees
 * Admin: slot accept filters (F1 / this panel)
 *
 * Refs: tactical-infinity equipment · Sample-InventorySlotsSet · Player-Inventory-System
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
   *   getDrc?: () => import('../combat/DrcCombatController.js').DrcCombatController|null,
   *   onDropWorld?: (item: object, cx: number, cy: number) => void,
   *   onDepositItem?: (item: object) => void|Promise<void>
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
    this.onDropWorld = opts.onDropWorld || null;
    this.onDepositItem = opts.onDepositItem || null;
    applyMainPanelUiVars();
    this.open = false;
    this._tab = 'character';
    this._busy = false;
    this.api = fleetApi;
    /** @type {string} Prefabs category filter */
    this._prefabCat = 't0';
    this._prefabQ = '';
    this._prefabSelected = null;
    this._gameItems = null;
    /** LMB equip target paperdoll slot id */
    this._equipTarget = null;
    /** Bag index currently “picked” (Player-Inventory-System style) */
    this._pickedBagIndex = null;
    this._profTab = 'miner';
    ensureDemoBag();

    this.el = document.createElement('div');
    this.el.id = 'inventory-panel';
    this.el.className = 'inv-panel inv-panel--lab inv-panel--main wl-inv-shell';
    this.el.hidden = true;
    document.body.appendChild(this.el);

    this._renderShell();
  }

  _tabs() {
    return [
      { id: 'character', label: 'Character' },
      { id: 'equip', label: 'Equipment' },
      { id: 'inventory', label: 'Inventory' },
      { id: 'weapon', label: 'Weapon' },
      { id: 'skills', label: 'Skills' },
      { id: 'professions', label: 'Professions' },
      { id: 'prefabs', label: 'Prefabs' },
      { id: 'race', label: 'Race' },
      { id: 'mesh', label: 'Mesh' },
      { id: 'mount', label: 'Mount' },
      { id: 'anims', label: 'Anims' },
      { id: 'slots', label: 'Slots' },
      { id: 'api', label: 'API' }
    ];
  }

  _renderShell() {
    const tabs = this._tabs();
    this.el.innerHTML = `
      <header class="inv-panel__head">
        <div>
          <h2>Main Panel</h2>
          <p class="inv-panel__sub">MMO equipment · bag · RMB item menus · API · production lab</p>
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
          <section class="inv-section" data-panel="inventory" hidden></section>
          <section class="inv-section" data-panel="weapon" hidden></section>
          <section class="inv-section" data-panel="skills" hidden></section>
          <section class="inv-section" data-panel="professions" hidden></section>
          <section class="inv-section" data-panel="prefabs" hidden></section>
          <section class="inv-section" data-panel="race" hidden></section>
          <section class="inv-section" data-panel="mesh" hidden></section>
          <section class="inv-section" data-panel="mount" hidden></section>
          <section class="inv-section" data-panel="anims" hidden></section>
          <section class="inv-section" data-panel="slots" hidden></section>
          <section class="inv-section" data-panel="api" hidden></section>
        </div>
      </div>
      <footer class="inv-panel__foot">
        <kbd>I</kbd> panel · <kbd>LMB</kbd> pick/equip · <kbd>RMB</kbd> item menu ·
        <a href="${CRAFT_SSOT_URL}" target="_blank" rel="noopener">Craft SSOT ↗</a> ·
        <a href="${MAIN_PANEL_PROD.equipment}" target="_blank" rel="noopener">ui Equipment ↗</a>
      </footer>
    `;

    this.el.querySelector('[data-close]').addEventListener('click', () => this.setOpen(false));
    this.el.querySelectorAll('[data-tab]').forEach((btn) => {
      btn.addEventListener('click', () => this._setTab(btn.dataset.tab));
    });
    this.el.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.el.addEventListener('wheel', (e) => e.stopPropagation());
    // Allow native context menu only on our item menu (we open custom)
    this.el.addEventListener('contextmenu', (e) => {
      // Let slot handlers preventDefault; don't block bubbling to them
      if (!e.target?.closest?.('[data-bag-i],[data-pd-slot]')) {
        e.preventDefault();
      }
    });
  }

  /** Shared handlers for bag + paperdoll RMB */
  _itemCtxHandlers() {
    return {
      onToast: this.onToast,
      onEquip: (item, slotDef, bagIndex) => this._equipItemToSlot(item, slotDef, bagIndex),
      onUnequip: async (slotId) => {
        const it = unequipPaperdollSlot(slotId);
        if (it) {
          try {
            const active = getActiveLoadoutIndex();
            const activeMain = active === 1 ? 'weapon2' : 'mainHand';
            const activeOff = active === 1 ? 'offHand2' : 'offHand';
            // Clear live 3D only when removing the active set main hand
            if (slotId === activeMain) {
              await unequipWeapon({ character: this.character, onToast: this.onToast });
            } else if (slotId === activeOff) {
              // Off-hand paperdoll only for now (shield mesh optional later)
            }
          } catch {
            /* ok */
          }
          this.onToast(`Unequipped ${it.name || it.id}`);
          this.onEquip();
        }
      },
      onUse: (item) => {
        this.onToast(`Use ${item.name || item.id} (lab — wire consumable later)`);
      },
      onDropWorld: this.onDropWorld
        ? (item, cx, cy) => this.onDropWorld(item, cx, cy)
        : null,
      onDeposit: async (item) => {
        // Prefer Railway deposit; fall back to craft SSOT
        try {
          const r = await this.api.depositItem(withResolvedIcon(item));
          if (r.ok) {
            this.onToast(r.message);
            return;
          }
          if (r.authRequired) {
            this.onToast(r.message);
            window.open(GRUDGE_ID_URL, '_blank', 'noopener');
            return;
          }
          if (this.onDepositItem) {
            await this.onDepositItem(item);
            return;
          }
          if (r.openCraft) {
            window.open(MAIN_PANEL_PROD.craft, '_blank', 'noopener');
          }
          this.onToast(r.message);
        } catch (err) {
          this.onToast(err?.message || 'Deposit failed');
        }
      },
      onRefresh: () => this.refresh(),
      onOpenSlotPicker: (slotId) => {
        this._setTab('character');
        // After refresh, open picker
        requestAnimationFrame(() => {
          const host = this.el.querySelector('[data-panel="character"]');
          if (host) this._onPaperdollSlotClick(slotId, host);
        });
      },
      onOpenCatalogPicker: (slotId) => {
        this._setTab('character');
        requestAnimationFrame(() => {
          const host = this.el.querySelector('[data-panel="character"]');
          if (host) this._openCatalogPicker(slotId, host);
        });
      },
      onEditMesh: (item) => {
        this._setTab('character');
        requestAnimationFrame(() => this._openMeshEditor(item));
      }
    };
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

  /** Open lab panel on a tab (e.g. Admin Hub → Prefabs). */
  openTab(tab) {
    this.setOpen(true);
    this._setTab(tab || 'character');
  }

  toggle() {
    this.setOpen(!this.open);
  }

  setOpen(open) {
    this.open = !!open;
    this.el.hidden = !this.open;
    if (this.open) {
      reenrichAllBagIcons();
      this.refresh();
      // Pull catalog icons in background (weapons/tools for bag + prefabs)
      void this._warmCatalogIcons();
    }
  }

  refresh() {
    if (!this.open) return;
    this._fillCharacter();
    this._fillEquip();
    this._fillInventory();
    this._fillWeapon();
    this._fillPrefabs();
    this._fillRace();
    this._fillMesh();
    this._fillMount();
    this._fillAnims();
    this._fillSkills();
    this._fillProfessions();
    this._fillSlotsAdmin();
    this._fillApi();
  }

  async _warmCatalogIcons() {
    try {
      const cat = await loadGameItemCatalog();
      this._gameItems = cat;
      const all = Object.values(cat?.byCategory || {}).flat();
      const byId = new Map(all.map((r) => [r.id, r]));
      // Enrich bag slots from info/objectstore catalog icons
      const bag = loadBag();
      let dirty = false;
      for (let i = 0; i < bag.slots.length; i++) {
        const s = bag.slots[i];
        if (!s?.id) continue;
        const row = byId.get(s.id);
        if (row?.iconUrl) {
          bag.slots[i] = {
            ...s,
            icon: row.iconUrl,
            iconUrl: row.iconUrl,
            name: s.name || row.name,
            tier: s.tier ?? row.tier
          };
          dirty = true;
        } else {
          const en = enrichBagSlotIcon(s);
          if (en.icon && en.icon !== s.icon) {
            bag.slots[i] = en;
            dirty = true;
          }
        }
      }
      if (dirty) {
        saveBag(bag);
        if (this._tab === 'inventory' || this._tab === 'character') this.refresh();
      }
    } catch (err) {
      console.warn('[MainPanel] catalog icons', err);
    }
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

  /* ── Character paperdoll (TI / Warlords) ───────────────────── */

  _slotButtonHtml(slot, equipMap, activeSet = 0) {
    const item = equipMap[slot.id];
    const isTarget = this._equipTarget === slot.id;
    const setIdx = slot.weaponSet;
    const isActiveSet =
      setIdx === 0 || setIdx === 1 ? setIdx === activeSet : false;
    const setCls =
      setIdx === 0 || setIdx === 1
        ? `mp-slot--set${setIdx}${isActiveSet ? ' is-active-set' : ''}`
        : '';
    return `
      <button type="button" class="mp-slot ${item ? 'is-filled' : ''} ${isTarget ? 'is-target' : ''} ${setCls}"
        data-pd-slot="${slot.id}"
        data-weapon-set="${setIdx ?? ''}"
        title="${slot.label}${isActiveSet ? ' · ACTIVE (Q swap)' : setIdx === 0 || setIdx === 1 ? ' · Q combat swap' : ''} · LMB bag · RMB equip">
        ${
          item
            ? `<img class="mp-slot__icon" src="${resolveItemIcon(item) || item.icon || ''}" alt="" referrerpolicy="no-referrer" />`
            : `<span class="mp-slot__empty">+</span>`
        }
        <span class="mp-slot__label">${slot.label}${isActiveSet ? ' ●' : ''}</span>
      </button>`;
  }

  _renderPaperdoll(host) {
    const s = this.character.getLabSummary?.() || {};
    const equipMap = loadEquipMap();
    const activeSet = getActiveLoadoutIndex();
    const left = PAPERDOLL_LEFT.map((sl) =>
      this._slotButtonHtml(sl, equipMap, activeSet)
    ).join('');
    const right = PAPERDOLL_RIGHT.map((sl) =>
      this._slotButtonHtml(sl, equipMap, activeSet)
    ).join('');
    const pack = s.animPackId || '—';
    const w1 = equipMap.mainHand?.name || equipMap.mainHand?.id || '—';
    const w2 = equipMap.weapon2?.name || equipMap.weapon2?.id || '—';

    host.innerHTML = `
      <div class="mp-doll" data-doll data-active-set="${activeSet}">
        <div class="mp-doll__col">
          <div class="mp-doll__col-title">Armour · Relic</div>
          ${left}
        </div>
        <div class="mp-doll__center">
          <div class="mp-doll__silhouette" aria-hidden="true"></div>
          <div class="mp-doll__stats">${s.raceLabel || s.raceId || 'Hero'} · ${(s.heightM ?? 1.8).toFixed?.(2) || '1.80'} m · ${pack}</div>
          <div class="mp-doll__loadout">Active <b>Weapon ${activeSet + 1}</b> · Q swap · set1 ${w1} · set2 ${w2}</div>
        </div>
        <div class="mp-doll__col">
          <div class="mp-doll__col-title">Weapons · Back · Mount</div>
          ${right}
        </div>
        <div class="mp-picker" data-picker hidden></div>
      </div>
      <p class="inv-hint"><b>RMB slot</b> → T0–T1 catalog · <b>Weapon 1/2 + Off 1/2</b> dual loadout · combat <b>Q</b> swaps set · Relic/Back (no belt/amulet/ring/cloak). <a href="${MAIN_PANEL_PROD.equipment}" target="_blank" rel="noopener">ui equipment ↗</a></p>
      <div class="inv-btn-row">
        <button type="button" class="inv-btn" data-open-inv>Open Inventory</button>
        <button type="button" class="inv-btn" data-seed-t0>Seed bag T0 weapons+back</button>
        <button type="button" class="inv-btn inv-btn--ghost" data-unequip-all>Clear paperdoll</button>
        <a class="inv-btn inv-btn--ghost" href="${MAIN_PANEL_PROD.full}" target="_blank" rel="noopener">Fleet Main Panel ↗</a>
        <a class="inv-btn inv-btn--ghost" href="${CRAFT_SSOT_URL}" target="_blank" rel="noopener">Craft bag ↗</a>
      </div>
    `;

    const h = this._itemCtxHandlers();
    host.querySelectorAll('[data-pd-slot]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this._onPaperdollSlotClick(btn.dataset.pdSlot, host);
      });
      bindItemContextMenu(
        btn,
        () => {
          const slotId = btn.dataset.pdSlot;
          const equipMap = loadEquipMap();
          return {
            source: 'paperdoll',
            slotId,
            item: equipMap[slotId] || null
          };
        },
        h
      );
    });
    host.querySelector('[data-open-inv]')?.addEventListener('click', () => this._setTab('inventory'));
    host.querySelector('[data-seed-t0]')?.addEventListener('click', async () => {
      try {
        const { listAllT0T1 } = await import('../api/gameItemCatalog.js');
        const rows = await listAllT0T1({ maxTier: 0 });
        let n = 0;
        for (const r of rows.slice(0, 24)) {
          bagAdd({
            id: r.id,
            name: r.name,
            kind: r.kind || r.category,
            slotHint: r.slotHint,
            icon: r.iconUrl,
            iconUrl: r.iconUrl,
            tier: r.tier,
            qty: 1
          });
          n++;
        }
        // Back mobility always
        for (const id of ['windsurf', 'holy_wings', 'traveler_wings']) {
          bagAdd({ id, name: id, kind: 'back', slotHint: 'back', qty: 1 });
          n++;
        }
        this.onToast(`Seeded ${n} catalog items into bag`);
        this.refresh();
      } catch (e) {
        this.onToast(e?.message || 'Seed failed');
      }
    });
    host.querySelector('[data-unequip-all]')?.addEventListener('click', () => {
      saveEquipMap({});
      this.onToast('Paperdoll cleared (local map)');
      this.refresh();
    });
  }

  _onPaperdollSlotClick(slotId, host) {
    const slotDef = ALL_PAPERDOLL_SLOTS.find((s) => s.id === slotId);
    if (!slotDef) return;

    // If bag item picked → try equip
    if (this._pickedBagIndex != null) {
      const bag = loadBag();
      const item = bag.slots[this._pickedBagIndex];
      if (item && itemFitsSlot(item, slotDef)) {
        this._equipItemToSlot(item, slotDef, this._pickedBagIndex);
        this._pickedBagIndex = null;
        this._equipTarget = null;
        this.refresh();
        return;
      }
      this.onToast('Item does not fit this slot');
    }

    this._equipTarget = slotId;
    const bag = loadBag();
    const fits = bag.slots
      .map((it, i) => (it && itemFitsSlot(it, slotDef) ? { it, i } : null))
      .filter(Boolean);

    const picker = host.querySelector('[data-picker]');
    if (!picker) return;
    picker.hidden = false;
    picker.innerHTML = `
      <h4>${slotDef.label} — bag options</h4>
      ${
        fits.length
          ? fits
              .map(
                ({ it, i }) => `
            <button type="button" class="mp-picker__item" data-pick-i="${i}">
              <img src="${it.icon || it.iconUrl || ''}" alt="" referrerpolicy="no-referrer" />
              <span>${it.name} ×${it.qty || 1}</span>
            </button>`
              )
              .join('')
          : `<p class="mp-picker__empty">No bag items for this slot.</p>`
      }
      <button type="button" class="inv-btn" data-open-catalog style="width:100%;margin-top:6px">Browse T0–T1 catalog…</button>
      <button type="button" class="inv-btn inv-btn--ghost" data-picker-close style="width:100%;margin-top:4px">Close</button>
    `;
    picker.querySelectorAll('[data-pick-i]').forEach((b) => {
      b.addEventListener('click', () => {
        const i = Number(b.dataset.pickI);
        const bag2 = loadBag();
        const item = bag2.slots[i];
        if (item) this._equipItemToSlot(item, slotDef, i);
        this._equipTarget = null;
        this.refresh();
      });
    });
    picker.querySelector('[data-open-catalog]')?.addEventListener('click', () => {
      this._openCatalogPicker(slotId, host);
    });
    picker.querySelector('[data-picker-close]')?.addEventListener('click', () => {
      picker.hidden = true;
      this._equipTarget = null;
      this.refresh();
    });
  }

  async _equipItemToSlot(item, slotDef, bagIndex) {
    const map = loadEquipMap();
    // Return previous to bag
    if (map[slotDef.id]) bagAdd(map[slotDef.id]);
    const equipped = {
      ...item,
      qty: 1,
      kind: item.kind || item.category || 'item',
      icon: item.icon || item.iconUrl,
      iconUrl: item.iconUrl || item.icon
    };
    map[slotDef.id] = equipped;
    saveEquipMap(map);
    // Remove one from bag (catalog equip may have no bag index)
    const bag = loadBag();
    if (bagIndex != null && bag.slots[bagIndex]) {
      const q = (bag.slots[bagIndex].qty || 1) - 1;
      if (q <= 0) bag.slots[bagIndex] = null;
      else bag.slots[bagIndex].qty = q;
      saveBag(bag);
    }

    // Live 3D: weapons · armour mesh_ids · back mobility · appearance
    try {
      if (slotDef.kind === 'hand' && item.id) {
        await ensureWeaponCatalog();
        const setIdx = slotDef.weaponSet === 1 ? 1 : 0;
        const isMain = slotDef.hand === 'main' || !slotDef.hand;
        try {
          if (isMain) {
            const active = getActiveLoadoutIndex();
            const otherMainId = setIdx === 0 ? map.weapon2?.id : map.mainHand?.id;
            // Apply live mesh/skills only for active set (or sole weapon equip)
            const applyLive = setIdx === active || !otherMainId;
            if (applyLive) {
              await equipWeaponById(item.id, {
                character: this.character,
                onToast: this.onToast,
                weaponSet: setIdx
              });
              setActiveSkillTree('equipped');
            } else {
              this.onToast(
                `Weapon ${setIdx + 1} ready · combat Q swaps to it (${item.name})`
              );
            }
          } else {
            // Off hand paperdoll — stored for set; 3D shield attach later
            this.onToast(`Off ${setIdx + 1} · ${item.name}`);
          }
        } catch {
          this.onToast(`Paperdoll ${item.name} (3D if model URL later)`);
        }
        const { applyWeaponAppearance } = await import('../equipment/meshAppearance.js');
        applyWeaponAppearance(this.character, item.id);
      } else if (slotDef.kind === 'mesh' && slotDef.meshSlot) {
        const cat = this.character.equipment?.getCatalogSummary?.() || {};
        const variants = cat[slotDef.meshSlot]?.variants || [];
        // Prefer A / item variant hint
        const pick =
          variants.find((v) => v === item.variant || v === 'A' || v === '_default') ||
          variants[0] ||
          'A';
        this.character.equipment?.setSlot?.(slotDef.meshSlot, pick);
        this.character._reGroundAfterEquip?.();
        const { applyArmorAppearance } = await import('../equipment/meshAppearance.js');
        applyArmorAppearance(this.character, slotDef.meshSlot, item.id);
      } else if (slotDef.kind === 'back' || slotDef.id === 'back') {
        await this.character.equipBackSlot?.(item.id, {
          modelUrl: item.modelUrl || item.deployModelUrl || undefined
        });
        this.onToast(
          item.domain === 'water'
            ? `${item.name} stowed · water deploy only`
            : item.domain === 'air'
              ? `${item.name} stowed · flight next`
              : `Back · ${item.name}`
        );
      } else if (slotDef.id === 'relic' || slotDef.id === 'mount') {
        // HUD / passive lab — paperdoll map only for now
        this.onToast(`${slotDef.label} · ${item.name} (catalog)`);
      }
    } catch (e) {
      this.onToast(e?.message || 'Equip 3D skipped');
    }
    this.onToast(`Equipped ${item.name} → ${slotDef.label}`);
    this.onEquip();
  }

  /**
   * RMB empty/filled slot → browse live T0–T1 catalog with icons.
   * @param {string} slotId
   * @param {HTMLElement} host
   */
  async _openCatalogPicker(slotId, host) {
    const slotDef = ALL_PAPERDOLL_SLOTS.find((s) => s.id === slotId);
    if (!slotDef) return;
    const picker = host.querySelector('[data-picker]');
    if (!picker) return;
    picker.hidden = false;
    picker.innerHTML = `<h4>${slotDef.label} — T0–T1 catalog…</h4><p class="mp-picker__empty">Loading…</p>`;

    try {
      const { listT0T1ForSlot } = await import('../api/gameItemCatalog.js');
      const rows = await listT0T1ForSlot(slotId, { maxTier: 1 });
      const list = rows.slice(0, 80);
      picker.innerHTML = `
        <h4>${slotDef.label} — T0–T1 (${list.length}${rows.length > 80 ? '+' : ''})</h4>
        <input type="search" class="mp-picker__search" data-cat-q placeholder="Filter name…" />
        <div class="mp-picker__grid" data-cat-grid>
          ${
            list.length
              ? list
                  .map(
                    (r) => `
            <button type="button" class="mp-picker__item" data-cat-id="${r.id}" title="${r.source || ''}">
              <img src="${r.iconUrl || ''}" alt="" referrerpolicy="no-referrer" />
              <span>${r.name} <small>T${r.tier ?? 0}</small></span>
            </button>`
                  )
                  .join('')
              : `<p class="mp-picker__empty">No T0–T1 items for this slot (catalog empty / offline).</p>`
          }
        </div>
        <button type="button" class="inv-btn inv-btn--ghost" data-picker-close style="width:100%;margin-top:6px">Close</button>
      `;

      const bindRows = (items) => {
        const grid = picker.querySelector('[data-cat-grid]');
        if (!grid) return;
        grid.innerHTML = items
          .map(
            (r) => `
            <button type="button" class="mp-picker__item" data-cat-id="${r.id}">
              <img src="${r.iconUrl || ''}" alt="" referrerpolicy="no-referrer" />
              <span>${r.name} <small>T${r.tier ?? 0}</small></span>
            </button>`
          )
          .join('');
        grid.querySelectorAll('[data-cat-id]').forEach((b) => {
          b.addEventListener('click', async () => {
            const id = b.dataset.catId;
            const row = rows.find((x) => x.id === id);
            if (!row) return;
            // Equip from catalog without requiring bag first
            await this._equipItemToSlot(
              {
                id: row.id,
                name: row.name,
                kind: row.kind || row.category,
                slotHint: row.slotHint || slotDef.id,
                icon: row.iconUrl,
                iconUrl: row.iconUrl,
                modelUrl: row.modelUrl,
                tier: row.tier,
                domain: row.domain,
                category: row.category
              },
              slotDef,
              null
            );
            this._equipTarget = null;
            this.refresh();
          });
        });
      };
      bindRows(list);

      picker.querySelector('[data-cat-q]')?.addEventListener('input', (e) => {
        const q = String(e.target.value || '').toLowerCase();
        bindRows(
          rows
            .filter((r) => !q || `${r.name} ${r.id}`.toLowerCase().includes(q))
            .slice(0, 80)
        );
      });
      picker.querySelector('[data-picker-close]')?.addEventListener('click', () => {
        picker.hidden = true;
        this.refresh();
      });
    } catch (err) {
      picker.innerHTML = `<p class="mp-picker__empty">${err?.message || 'Catalog load failed'}</p>
        <button type="button" class="inv-btn" data-picker-close>Close</button>`;
      picker.querySelector('[data-picker-close]')?.addEventListener('click', () => {
        picker.hidden = true;
      });
    }
  }

  /**
   * Mesh appearance editor (color · scale · rotate · offset).
   * @param {object} item
   */
  _openMeshEditor(item) {
    if (!item?.id) return;
    const host = this.el.querySelector('[data-panel="character"]');
    if (!host) return;
    let panel = host.querySelector('[data-mesh-app]');
    if (!panel) {
      panel = document.createElement('div');
      panel.className = 'inv-card mp-mesh-app';
      panel.dataset.meshApp = '1';
      host.appendChild(panel);
    }
    import('../equipment/meshAppearance.js').then(
      ({ getAppearance, setAppearance, applyWeaponAppearance, applyArmorAppearance }) => {
        const app = getAppearance(item.id);
        panel.innerHTML = `
          <h4>Mesh · ${item.name || item.id}</h4>
          <p class="inv-hint">Color / scale / rotate / offset — saved per item id for casting lab develop.</p>
          <label class="inv-row"><span>Color</span><input type="color" data-app-color value="${app.color || '#c8a070'}" /></label>
          <label class="inv-row"><span>Scale</span><input type="range" data-app-scale min="0.4" max="2.2" step="0.02" value="${app.scale ?? 1}" /></label>
          <label class="inv-row"><span>Yaw °</span><input type="range" data-app-yaw min="-180" max="180" step="1" value="${app.eulerDeg?.[1] ?? 0}" /></label>
          <label class="inv-row"><span>Pitch °</span><input type="range" data-app-pitch min="-90" max="90" step="1" value="${app.eulerDeg?.[0] ?? 0}" /></label>
          <label class="inv-row"><span>Roll °</span><input type="range" data-app-roll min="-90" max="90" step="1" value="${app.eulerDeg?.[2] ?? 0}" /></label>
          <label class="inv-row"><span>Emissive</span><input type="range" data-app-em min="0" max="1.5" step="0.05" value="${app.emissive ?? 0}" /></label>
          <div class="inv-btn-row">
            <button type="button" class="inv-btn" data-app-apply>Apply</button>
            <button type="button" class="inv-btn inv-btn--ghost" data-app-reset>Reset</button>
          </div>
        `;
        const read = () => ({
          color: panel.querySelector('[data-app-color]')?.value,
          scale: Number(panel.querySelector('[data-app-scale]')?.value) || 1,
          eulerDeg: [
            Number(panel.querySelector('[data-app-pitch]')?.value) || 0,
            Number(panel.querySelector('[data-app-yaw]')?.value) || 0,
            Number(panel.querySelector('[data-app-roll]')?.value) || 0
          ],
          emissive: Number(panel.querySelector('[data-app-em]')?.value) || 0
        });
        const apply = () => {
          const next = setAppearance(item.id, read());
          const eq = loadEquipMap();
          // Apply to weapon if main hand
          if (
            eq.mainHand?.id === item.id ||
            eq.offHand?.id === item.id ||
            eq.weapon2?.id === item.id ||
            eq.offHand2?.id === item.id
          ) {
            applyWeaponAppearance(this.character, item.id);
          } else {
            // Try armour slots
            for (const sid of ['head', 'body', 'arms', 'legs', 'shoulders']) {
              if (eq[sid]?.id === item.id) {
                const def = ALL_PAPERDOLL_SLOTS.find((s) => s.id === sid);
                applyArmorAppearance(this.character, def?.meshSlot || sid, item.id);
              }
            }
          }
          this.onToast(`Mesh · ${item.name} · scale ${next.scale?.toFixed?.(2) ?? 1}`);
        };
        panel.querySelector('[data-app-apply]')?.addEventListener('click', apply);
        panel.querySelectorAll('input').forEach((inp) => {
          inp.addEventListener('input', () => {
            // Live preview
            setAppearance(item.id, read());
            applyWeaponAppearance(this.character, item.id);
          });
        });
        panel.querySelector('[data-app-reset]')?.addEventListener('click', () => {
          setAppearance(item.id, {
            color: '#c8a070',
            scale: 1,
            eulerDeg: [0, 0, 0],
            emissive: 0
          });
          applyWeaponAppearance(this.character, item.id);
          this._openMeshEditor(item);
        });
      }
    );
  }

  _fillCharacter() {
    const host = this.el.querySelector('[data-panel="character"]');
    if (!host || this._tab !== 'character') return;
    this._renderPaperdoll(host);
    const s = this.character.getLabSummary?.() || {};
    const presets = this.character.presets || [];
    const presetOpts = presets
      .map(
        (p) =>
          `<option value="${p.id}" ${p.id === this.character.presetId ? 'selected' : ''}>${p.label || p.id}</option>`
      )
      .join('');
    host.insertAdjacentHTML(
      'beforeend',
      `
      <div class="inv-card" style="margin-top:12px">
        <div class="inv-card__row"><span>Kit</span><b class="inv-code">${(s.kitUrl || '').split('/').pop() || 'Toon RTS'}</b></div>
        <div class="inv-card__row"><span>Clips</span><b>${(s.clips || []).length}</b></div>
      </div>
      <label class="inv-row"><span>Class preset</span><select data-preset>${presetOpts}</select></label>
      <div class="inv-btn-row">
        <a class="inv-btn inv-btn--ghost" href="${CHARACTER_FOUNDRY_URL}" target="_blank" rel="noopener">Foundry ↗</a>
        <a class="inv-btn inv-btn--ghost" href="${MAIN_PANEL_URL}" target="_blank" rel="noopener">ui.grudge Main Panel ↗</a>
      </div>
    `
    );
    host.querySelector('[data-preset]')?.addEventListener(
      'change',
      this._busyGuard(async (e) => {
        const id = e.target.value;
        this.character.applyPreset(id);
        await this.character.setAnimPack?.(this.character.animPackId);
        this.onToast(`Preset ${id}`);
      })
    );
  }

  /* ── Equipment (paperdoll + kit mesh selects) ─────────────── */

  _fillEquip() {
    const host = this.el.querySelector('[data-panel="equip"]');
    if (!host || this._tab !== 'equip') return;
    this._renderPaperdoll(host);

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
      return `
        <label class="inv-row">
          <span>${slot}${WEAPON_SLOTS.includes(slot) ? ' ⚔' : ''}</span>
          <select data-slot="${slot}">${opts}</select>
        </label>`;
    }).join('');

    host.insertAdjacentHTML(
      'beforeend',
      `
      <p class="inv-hint" style="margin-top:12px">Kit mesh_ids (live 3D) — never body GLB swap</p>
      <div class="inv-slots">${slotRows || '<p class="inv-hint">No mesh slots</p>'}</div>
      <button type="button" class="inv-btn" data-attack>Weapon attack (F)</button>
    `
    );
    host.querySelectorAll('[data-slot]').forEach((sel) => {
      sel.addEventListener('change', () => {
        const slot = sel.dataset.slot;
        const variant = sel.value;
        c.equipment?.setSlot(slot, variant === 'none' ? null : variant);
        c._reGroundAfterEquip?.();
        c.ik?.setBones(c.equipment.findBones());
        this.onToast(`${slot} → ${variant}`);
        this.onEquip();
      });
    });
    host.querySelector('[data-attack]')?.addEventListener('click', () => {
      if (c.playWeaponAttack?.()) this.onToast('Weapon attack');
      else this.onToast('No attack clip');
    });
  }

  /* ── Inventory bag (Sample-InventorySlotsSet layout) ──────── */

  _fillInventory() {
    const host = this.el.querySelector('[data-panel="inventory"]');
    if (!host || this._tab !== 'inventory') return;
    const bag = loadBag();
    const skin = loadBagSkin();
    const mainN = BAG_LAYOUT.mainCols * BAG_LAYOUT.mainRows;
    const mainSlots = bag.slots.slice(0, mainN);
    const utilSlots = bag.slots.slice(mainN);

    const cell = (item, i) => `
      <button type="button" class="mp-bag-slot ${this._pickedBagIndex === i ? 'is-pick' : ''}" data-bag-i="${i}"
        title="${item ? `${item.name} · LMB pick · RMB menu` : 'Empty'}">
        ${
          item
            ? `<img class="mp-slot__icon" src="${resolveItemIcon(item) || item.icon || item.iconUrl || ''}" alt="" referrerpolicy="no-referrer" />
               ${item.qty > 1 ? `<span class="mp-bag-slot__qty">${item.qty}</span>` : ''}`
            : ''
        }
      </button>`;

    host.innerHTML = `
      <div class="mp-bag">
        <div class="mp-bag__head">
          <h3>Inventory</h3>
          <label class="inv-row" style="margin:0">
            <span>Skin</span>
            <select data-bag-skin>
              ${BAG_SKINS.map((s) => `<option value="${s.id}" ${s.id === skin ? 'selected' : ''}>${s.label}</option>`).join('')}
            </select>
          </label>
        </div>
        <div class="mp-bag__grid">${mainSlots.map((it, i) => cell(it, i)).join('')}</div>
        <div class="mp-bag__util">${utilSlots.map((it, j) => cell(it, mainN + j)).join('')}</div>
        <p class="inv-hint"><b>LMB</b> pick · <b>RMB</b> Equip / Split / Drop / Deposit / Inspect · then Character paperdoll.</p>
        <div class="inv-btn-row">
          <button type="button" class="inv-btn inv-btn--ghost" data-seed-bag>Reset demo bag</button>
          <a class="mp-link-craft" href="${CRAFT_SSOT_URL}" target="_blank" rel="noopener">Warlords Craft bag ↗</a>
          <a class="mp-link-craft" href="${MAIN_PANEL_PROD.inventory}" target="_blank" rel="noopener">ui Inventory ↗</a>
        </div>
      </div>
    `;

    const h = this._itemCtxHandlers();
    host.querySelectorAll('[data-bag-i]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const i = Number(btn.dataset.bagI);
        if (this._pickedBagIndex === i) {
          this._pickedBagIndex = null;
        } else {
          this._pickedBagIndex = bag.slots[i] ? i : null;
          if (this._pickedBagIndex != null) {
            this.onToast(`Picked ${bag.slots[i].name} — Character tab + LMB slot, or RMB → Equip`);
          }
        }
        this._fillInventory();
      });
      bindItemContextMenu(
        btn,
        () => {
          const i = Number(btn.dataset.bagI);
          const bag2 = loadBag();
          return {
            source: 'bag',
            bagIndex: i,
            item: bag2.slots[i] || null
          };
        },
        h
      );
    });
    host.querySelector('[data-bag-skin]')?.addEventListener('change', (e) => {
      saveBagSkin(e.target.value);
      this.onToast(`Bag skin · ${e.target.value}`);
    });
    host.querySelector('[data-seed-bag]')?.addEventListener('click', () => {
      localStorage.removeItem('casting.mainPanel.bag.v2');
      localStorage.removeItem('casting.mainPanel.bag.v1');
      ensureDemoBag();
      this.refresh();
    });
  }

  _fillProfessions() {
    const host = this.el.querySelector('[data-panel="professions"]');
    if (!host || this._tab !== 'professions') return;
    const prog = loadProfessionProgress();
    const tree = PROFESSION_TREES.find((t) => t.id === this._profTab) || PROFESSION_TREES[0];
    const p = prog[tree.id] || { level: 1, unlocked: [] };

    host.innerHTML = `
      <p class="inv-hint">WCS profession skill trees — production craft SSOT
        <a href="${CRAFT_SSOT_URL}" target="_blank" rel="noopener">grudgewarlords.com/craft/</a>
      </p>
      <div class="mp-prof">
        <div class="mp-prof__tabs">
          ${PROFESSION_TREES.map(
            (t) => `
            <button type="button" class="mp-prof__tab ${t.id === tree.id ? 'is-on' : ''}" data-prof="${t.id}">
              <img src="${t.icon}" alt="" referrerpolicy="no-referrer" />
              ${t.label}
            </button>`
          ).join('')}
        </div>
        <div class="mp-prof__tree">
          <div class="inv-card__row"><span>${tree.label}</span><b>Lv ${p.level} · ${p.unlocked?.length || 0} nodes</b></div>
          ${tree.nodes
            .map((n) => {
              const on = p.unlocked?.includes(n.id);
              return `
              <div class="mp-prof__node ${on ? 'is-unlocked' : ''}">
                <span class="tier">T${n.tier}</span>
                <div>
                  <b>${n.name}</b>
                  <div class="inv-hint" style="margin:0">${n.desc}</div>
                </div>
                <button type="button" data-unlock="${n.id}" ${on ? 'disabled' : ''}>${on ? 'Unlocked' : 'Unlock'}</button>
              </div>`;
            })
            .join('')}
        </div>
      </div>
    `;
    host.querySelectorAll('[data-prof]').forEach((b) => {
      b.addEventListener('click', () => {
        this._profTab = b.dataset.prof;
        this._fillProfessions();
      });
    });
    host.querySelectorAll('[data-unlock]').forEach((b) => {
      b.addEventListener('click', () => {
        unlockProfessionNode(tree.id, b.dataset.unlock);
        this.onToast(`${tree.label} · unlocked`);
        this._fillProfessions();
      });
    });
  }

  _fillSlotsAdmin() {
    const host = this.el.querySelector('[data-panel="slots"]');
    if (!host || this._tab !== 'slots') return;
    const ovr = loadSlotAdminOverrides();
    host.innerHTML = `
      <p class="inv-hint">Admin · paperdoll slot labels &amp; accept filters (local). Used by LMB inventory picker.</p>
      <div class="mp-admin-slots">
        ${ALL_PAPERDOLL_SLOTS.map((s) => {
          const o = ovr[s.id] || {};
          return `
          <label>
            ${s.id}
            <input data-slot-label="${s.id}" value="${o.label || s.label}" placeholder="Label" />
            <input data-slot-accept="${s.id}" value="${(o.accepts || s.accepts).join(',')}" placeholder="accepts csv" />
          </label>`;
        }).join('')}
      </div>
      <div class="inv-btn-row" style="margin-top:12px">
        <button type="button" class="inv-btn" data-save-slots>Save slot system</button>
        <button type="button" class="inv-btn inv-btn--ghost" data-reset-slots>Reset defaults</button>
      </div>
      <p class="inv-hint">Dev tool: also under Admin F1 · Main Panel slots. Bag art: <code>/ui/inventory/inventory-slots-set.png</code></p>
    `;
    host.querySelector('[data-save-slots]')?.addEventListener('click', () => {
      const next = {};
      host.querySelectorAll('[data-slot-label]').forEach((inp) => {
        const id = inp.dataset.slotLabel;
        const acc = host.querySelector(`[data-slot-accept="${id}"]`)?.value || '';
        next[id] = {
          label: inp.value.trim(),
          accepts: acc
            .split(',')
            .map((x) => x.trim())
            .filter(Boolean),
        };
      });
      saveSlotAdminOverrides(next);
      this.onToast('Slot system saved');
    });
    host.querySelector('[data-reset-slots]')?.addEventListener('click', () => {
      saveSlotAdminOverrides({});
      this.refresh();
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

    // Scaffold pack for selected equippable (async fill below if needed)
    const eqCache = getEquippableWeaponsCache();
    const eqWeapon = sel && eqCache?.byId?.get?.(sel.id);

    const detail = sel
      ? `<div class="inv-equip-banner">
          <img src="${sel.iconUrl || ''}" alt="" />
          <div>
            <div><b>${sel.name}</b> · ${sel.category}</div>
            <div class="inv-hint">${(sel.description || '').slice(0, 160)}</div>
            <div class="inv-hint">id: ${sel.id}${sel.uuid ? ' · ' + sel.uuid : ''}</div>
            <div class="inv-hint">model: ${(sel.modelUrl || '—').split('/').pop()}</div>
            <div class="inv-hint">stats: ${sel.stats ? JSON.stringify(sel.stats).slice(0, 120) : '—'}</div>
          </div>
        </div>
        <div class="inv-btn-row" style="flex-wrap:wrap">
          ${sel.equippable ? `<button type="button" class="inv-btn" data-pequip>Equip (combat bar)</button>` : ''}
          <button type="button" class="inv-btn inv-btn--ghost" data-pexport>Export prefab</button>
          <button type="button" class="inv-btn inv-btn--ghost" data-pcopy>Copy JSON</button>
          <button type="button" class="inv-btn" data-pscaffold>Scaffold pack</button>
        </div>
        <div class="inv-btn-row" style="flex-wrap:wrap" data-scaffold-gen hidden>
          <button type="button" class="inv-btn inv-btn--ghost" data-pgen="icon">Gen icon brief</button>
          <button type="button" class="inv-btn inv-btn--ghost" data-pgen="sprite3d">Gen 3D sprite brief</button>
          <button type="button" class="inv-btn inv-btn--ghost" data-pgen="script">Item script stub</button>
          <button type="button" class="inv-btn inv-btn--ghost" data-pgen="craft">Craft formula</button>
          <button type="button" class="inv-btn inv-btn--ghost" data-pgen="full">Full scaffold JSON</button>
        </div>
        <div class="inv-hint" data-scaffold-status>${eqWeapon ? 'T0/equip row linked — open Scaffold pack' : 'Scaffold works best on T0 / weapon equip rows'}</div>
        <pre class="inv-hint" data-scaffold-out style="max-height:12rem;overflow:auto;white-space:pre-wrap;font-size:10px"></pre>`
      : '<p class="inv-hint">Select a row to inspect · scaffold · export. UUID graph + craft + gen briefs.</p>';

    host.innerHTML = `
      <p class="inv-hint"><b>Prefab scaffold control</b> — access catalogs · validate · generate briefs · export</p>
      <p class="inv-hint">
        <a href="${ITEM_BROWSER_URL}" target="_blank" rel="noopener">Item Database ↗</a> ·
        <a href="${WEAPON_SKILLS_HTML}" target="_blank" rel="noopener">WEAPON_SKILLS ↗</a> ·
        <a href="${SCAFFOLD_ENDPOINTS.hub}" target="_blank" rel="noopener">Hub ↗</a> ·
        <a href="${SCAFFOLD_ENDPOINTS.docs}" target="_blank" rel="noopener">API docs ↗</a>
      </p>
      <p class="inv-hint">No invented ITEM-*/SKIL-* · gen = drafts · mint in ObjectStore pipelines</p>
      <div class="inv-btn-row" style="flex-wrap:wrap">${catBtns}</div>
      <input type="search" class="inv-input" data-pq placeholder="Search name / id…" value="${this._prefabQ.replace(/"/g, '&quot;')}" />
      ${detail}
      <div class="inv-weapon-equip-grid">${list || '<p class="inv-hint">No rows (try another category)</p>'}</div>
      <p class="inv-hint">Docs: PREFAB_SCAFFOLD_CONTROL_SSOT · WEAPON_PREFAB_UUID_SSOT · GAME_ITEM_PREFAB_PRODUCTION</p>
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

    const statusEl = host.querySelector('[data-scaffold-status]');
    const outEl = host.querySelector('[data-scaffold-out]');
    const genRow = host.querySelector('[data-scaffold-gen]');

    const ensureScaffold = async () => {
      if (!sel) return null;
      if (this._scaffoldPack?.identity?.id === sel.id) return this._scaffoldPack;
      statusEl && (statusEl.textContent = 'Building scaffold pack…');
      await loadPrefabScaffold();
      const eq = getEquippableWeaponsCache()?.byId?.get?.(sel.id);
      const weapon =
        eq ||
        ({
          id: sel.id,
          uuid: sel.uuid,
          name: sel.name,
          tier: sel.tier,
          weaponType: sel.weaponType,
          stats: sel.stats,
          iconUrl: sel.iconUrl,
          modelUrl: sel.modelUrl,
          meshSlot: sel.slot || 'sword',
          animPack: 'sword_shield',
          labStyle: 'melee',
          slot1: null,
          slot2: null,
          slot3Options: [],
          rawPrefab: sel.raw,
          present: null
        });
      const pack = await buildItemScaffoldPack(weapon);
      this._scaffoldPack = pack;
      const v = pack.validation;
      statusEl &&
        (statusEl.textContent = `Scaffold · ${v?.score ?? '?'}/${v?.max ?? 6} layers · ${
          v?.ok ? 'OK' : 'gaps: ' + (v?.missing || []).join(', ')
        } · craft: ${pack.generation?.craft?.source || '—'}`);
      genRow?.removeAttribute('hidden');
      if (outEl) {
        outEl.textContent = JSON.stringify(
          {
            uuids: pack.exportPrefab?.uuids || pack.contract?.uuids,
            validation: pack.validation,
            craft: pack.generation?.craft,
            use: pack.use
          },
          null,
          2
        );
      }
      return pack;
    };

    host.querySelector('[data-pscaffold]')?.addEventListener('click', async () => {
      try {
        await ensureScaffold();
        this.onToast('Scaffold ready · gen briefs below');
      } catch (err) {
        this.onToast(err?.message || 'Scaffold failed');
      }
    });

    host.querySelectorAll('[data-pgen]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          const pack = await ensureScaffold();
          if (!pack) return;
          const kind = btn.dataset.pgen;
          const map = {
            icon: pack.generation?.icon,
            sprite3d: pack.generation?.sprite3d,
            script: pack.generation?.itemScript,
            craft: pack.generation?.craft,
            full: pack
          };
          const data = map[kind];
          if (!data) {
            this.onToast('No data for ' + kind);
            return;
          }
          if (outEl) outEl.textContent = JSON.stringify(data, null, 2);
          downloadJson(data, `${sel.id}.${kind}.json`);
          this.onToast(`Downloaded ${kind} · ${sel.id}`);
        } catch (err) {
          this.onToast(err?.message || 'Gen failed');
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
    const fleet = fleetDeploySnapshot();
    const assets = UI_ASSET_CATALOG.map(
      (a) =>
        `<div class="inv-card__row"><span>${a.id}</span><b title="${a.system}">${a.role}</b></div>`
    ).join('');
    const catCounts = this._gameItems?.counts
      ? Object.entries(this._gameItems.counts)
          .map(([k, v]) => `${k}:${v}`)
          .join(' · ')
      : 'not loaded';

    host.innerHTML = `
      <p class="inv-hint"><b>Dev + production</b> — icons CDN 496 + lab minerals; catalogs info/objectstore; player bag Railway.</p>
      <div class="inv-card">
        <div class="inv-card__row"><span>API base</span><b class="inv-code">${(FLEET_API_DEFAULT || 'same-origin').replace('https://', '')}</b></div>
        <div class="inv-card__row"><span>Health</span><b data-health>${health ? (health.ok ? `OK ${health.latencyMs}ms` : health.message) : 'not checked'}</b></div>
        <div class="inv-card__row"><span>Token</span><b data-token>—</b></div>
        <div class="inv-card__row"><span>Catalog</span><b data-cat>${catCounts}</b></div>
        <div class="inv-card__row"><span>Player</span><b>${fleet.authority.player}</b></div>
        <div class="inv-card__row"><span>Binaries</span><b>${fleet.authority.binaries}</b></div>
      </div>
      <div class="inv-btn-row">
        <button type="button" class="inv-btn" data-fleet-bundle>Fleet status bundle</button>
        <button type="button" class="inv-btn inv-btn--ghost" data-ping>Ping health</button>
        <button type="button" class="inv-btn inv-btn--ghost" data-chars>Characters</button>
        <button type="button" class="inv-btn inv-btn--ghost" data-inv>Account inventory</button>
      </div>
      <div class="inv-btn-row">
        <button type="button" class="inv-btn inv-btn--ghost" data-load-cat>Load item catalog icons</button>
        <button type="button" class="inv-btn inv-btn--ghost" data-seed-t0>Import T0 → bag</button>
        <button type="button" class="inv-btn inv-btn--ghost" data-open-equip>Open Equipment</button>
      </div>
      <div class="inv-btn-row">
        <a class="inv-btn" href="${MAIN_PANEL_PROD.equipment}" target="_blank" rel="noopener">Production equipment ↗</a>
        <a class="inv-btn inv-btn--ghost" href="${MAIN_PANEL_PROD.full}" target="_blank" rel="noopener">Fleet Main Panel ↗</a>
        <a class="inv-btn inv-btn--ghost" href="${MAIN_PANEL_PROD.craft}" target="_blank" rel="noopener">Craft bag ↗</a>
        <a class="inv-btn inv-btn--ghost" href="${ITEM_BROWSER_URL}" target="_blank" rel="noopener">Item DB ↗</a>
      </div>
      <div class="mp-embed-wrap" style="margin:10px 0;border:1px solid #1e4a6e;border-radius:8px;overflow:hidden;min-height:280px;background:#0a1018">
        <iframe title="Main Panel equipment" src="${MAIN_PANEL_PROD.equipment}" style="width:100%;height:320px;border:0;background:#0a1018" loading="lazy"></iframe>
      </div>
      <p class="inv-hint">UI assets (${UI_ASSET_CATALOG.length}) · harvest → Main bag + DropBag with icons</p>
      <div class="inv-card" style="max-height:140px;overflow:auto">${assets}</div>
      <pre class="inv-pre" data-api-out>—</pre>
      <div class="inv-btn-row">
        <a class="inv-btn inv-btn--ghost" href="${GRUDGE_ID_URL}" target="_blank" rel="noopener">Grudge ID ↗</a>
        <a class="inv-btn inv-btn--ghost" href="${OPEN_LIBRARY_URL}" target="_blank" rel="noopener">Open ↗</a>
        <a class="inv-btn inv-btn--ghost" href="${CHARACTER_FOUNDRY_URL}" target="_blank" rel="noopener">Foundry ↗</a>
      </div>
    `;

    const out = host.querySelector('[data-api-out]');
    host.querySelector('[data-token]').textContent = this.api.getToken() ? 'present' : 'none';

    host.querySelector('[data-fleet-bundle]')?.addEventListener('click', async () => {
      out.textContent = 'loading…';
      const b = await this.api.fleetStatusBundle();
      host.querySelector('[data-health]').textContent = b.health?.ok
        ? `OK ${b.health.latencyMs}ms`
        : b.health?.message || 'fail';
      host.querySelector('[data-token]').textContent = b.hasToken ? 'present' : 'none';
      out.textContent = JSON.stringify(b, null, 2);
      this.onToast(
        b.health?.ok
          ? `Fleet · chars ${b.characters?.characters?.length ?? 0} · inv ${b.inventory?.items?.length ?? 0}`
          : b.health?.message || 'done'
      );
    });

    host.querySelector('[data-ping]')?.addEventListener('click', async () => {
      out.textContent = 'ping…';
      const st = await this.api.health();
      host.querySelector('[data-health]').textContent = st.ok ? `OK ${st.latencyMs}ms` : st.message;
      out.textContent = JSON.stringify({ health: st, fleet: fleet.authority }, null, 2);
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
            race: c.race || c.raceId
          }))
        },
        null,
        2
      );
      this.onToast(r.message);
    });

    host.querySelector('[data-inv]')?.addEventListener('click', async () => {
      out.textContent = 'inventory…';
      const r = await this.api.listInventory();
      out.textContent = JSON.stringify(r, null, 2);
      this.onToast(r.message);
    });

    host.querySelector('[data-load-cat]')?.addEventListener('click', async () => {
      out.textContent = 'catalog…';
      await this._warmCatalogIcons();
      const c = this._gameItems;
      host.querySelector('[data-cat]').textContent = c?.counts
        ? Object.entries(c.counts)
            .map(([k, v]) => `${k}:${v}`)
            .join(' · ')
        : 'fail';
      out.textContent = JSON.stringify({ counts: c?.counts, urls: c?.urls }, null, 2);
      this.onToast('Catalog loaded · bag icons refreshed');
      this.refresh();
    });

    host.querySelector('[data-seed-t0]')?.addEventListener('click', async () => {
      try {
        const cat = this._gameItems || (await loadGameItemCatalog());
        this._gameItems = cat;
        const t0 = cat?.byCategory?.t0 || [];
        let n = 0;
        for (const row of t0.slice(0, 8)) {
          const bi = bagItemFromCatalogRow(row);
          if (bi) {
            bagAdd(bi);
            n++;
          }
        }
        for (const id of ['t0-sword', 't0-wand', 't0-tool']) {
          const row = t0.find((r) => r.id === id);
          if (row) bagAdd(bagItemFromCatalogRow(row));
          else
            bagAdd(
              enrichBagSlotIcon({
                id,
                name: id,
                kind: 'weapon',
                qty: 1,
                slotHint: 'mainHand'
              })
            );
        }
        this.onToast(`Imported ${n} T0 rows → bag`);
        this._setTab('inventory');
      } catch (err) {
        this.onToast(err?.message || 'T0 import fail');
      }
    });

    host.querySelector('[data-open-equip]')?.addEventListener('click', () => {
      this.openTab('character');
      this.onToast('Character paperdoll · RMB equip menu');
    });
  }

  dispose() {
    closeItemContextMenu();
    this.el.remove();
  }
}
