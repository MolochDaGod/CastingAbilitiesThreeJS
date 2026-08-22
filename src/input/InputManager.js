import { Vector2 } from 'three';
import { EventEmitter } from '../utils/EventEmitter.js';
import { matchKeyDown } from './hotkeyContext.js';

/**
 * Pointer + keyboard → events.
 *
 * LMB (grudge-combat-targeting — one pipeline, no camera steal):
 *   focus ON  → lmb:attack  (TPS look may lock)
 *   focus OFF → lmb:select  (free cursor · no pointer lock)
 *   staff sandbox / walk course → draw:start|move|end (free cursor)
 *
 * Combat hotkeys:
 *   1–4 skills · F interact/attack · X dodge · C parry · E block
 *   Shift hold sprint · Shift+Ctrl slide · Ctrl(+dir) roll
 *   RMB focus toggle · Space jump
 *   F1–F4 Admin · ] World · ` auto run / freeride sail
 */
export class InputManager extends EventEmitter {
  constructor(domElement) {
    super();
    this.dom = domElement;
    this.pointer = new Vector2();
    this.isDrawing = false;
    this.keys = new Set();
    this.enabled = true;
    /** When true, fleet combat keys win over sandbox (clear→Shift+C, etc.) */
    this.combatKeys = true;
    /** @type {import('./hotkeyContext.js').HotkeyCtx} */
    this.hotkeyCtx = 'combat';
    /**
     * App sets this: () => 'draw' | 'attack' | 'select'
     * @type {(() => 'draw'|'attack'|'select')|null}
     */
    this.getLmbMode = null;

    this._bind();
  }

  setCombatKeys(on) {
    this.combatKeys = !!on;
  }

  /**
   * Activity mode from App (combat | harvest) — gates R heavy vs tool radial.
   * @param {'combat'|'harvest'|string} mode
   */
  setActivityMode(mode) {
    this.activityMode = mode === 'harvest' ? 'harvest' : 'combat';
  }

  /** @param {import('./hotkeyContext.js').HotkeyCtx} ctx */
  setHotkeyContext(ctx) {
    this.hotkeyCtx = ctx || 'combat';
  }

  _bind() {
    this.dom.addEventListener('pointerdown', this._onPointerDown);
    this.dom.addEventListener('auxclick', this._onAuxClick);
    window.addEventListener('pointermove', this._onPointerMove);
    window.addEventListener('pointerup', this._onPointerUp);
    window.addEventListener('pointercancel', this._onPointerUp);
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    this.dom.addEventListener('contextmenu', (event) => event.preventDefault());
  }

  _updatePointer(event) {
    this.clientX = event.clientX;
    this.clientY = event.clientY;
    this.pointer.set(
      (event.clientX / window.innerWidth) * 2 - 1,
      -(event.clientY / window.innerHeight) * 2 + 1
    );
  }

  _onAuxClick = (event) => {
    if (event.button === 1) event.preventDefault();
  };

  _onPointerDown = (event) => {
    if (!this.enabled) return;
    if (event.target !== this.dom) return;
    if (event.button === 1) {
      event.preventDefault();
      this._updatePointer(event);
      this.emit('mmb', this.pointer.clone());
      return;
    }
    if (event.button !== 0) return;

    this._updatePointer(event);
    const mode = this.getLmbMode?.() || 'select';

    if (mode === 'attack') {
      this.emit('lmb:attack', this.pointer.clone());
      return;
    }

    // Select / draw need a free cursor — drop TPS lock so look does not eat the stroke
    if (document.pointerLockElement) {
      try {
        document.exitPointerLock?.();
      } catch {
        /* */
      }
    }

    if (mode === 'select') {
      this.emit('lmb:select', this.pointer.clone());
      return;
    }

    // Path draw (staff sandbox / walk course) — not combat attack
    this.isDrawing = true;
    this.dom.setPointerCapture?.(event.pointerId);
    this.emit('draw:start', this.pointer);
  };

  _onPointerMove = (event) => {
    this._updatePointer(event);
    if (this.isDrawing) this.emit('draw:move', this.pointer);
  };

  _onPointerUp = (event) => {
    if (!this.isDrawing) return;
    this._updatePointer(event);
    this.isDrawing = false;
    this.dom.releasePointerCapture?.(event.pointerId);
    this.emit('draw:end', this.pointer);
  };

  _onKeyDown = (event) => {
    if (event.repeat) return;
    const target = event.target;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable))
      return;

    this.keys.add(event.code);

    if (event.code === 'Space') {
      event.preventDefault();
    }

    // Alt+Shift+Q/E/R/F/V/G = Linear skillshots (MOBA line/zone aim)
    if (event.altKey && event.shiftKey) {
      const linearMap = {
        KeyQ: 'ice',
        KeyE: 'thunder',
        KeyR: 'meteor',
        KeyF: 'beam',
        KeyV: 'snare',
        KeyG: 'glacier'
      };
      if (linearMap[event.code]) {
        event.preventDefault();
        this.emit('linearSkill', linearMap[event.code]);
        return;
      }
    }

    // Alt+sandbox VFX (never steal bare combat keys)
    if (event.altKey) {
      const map = {
        KeyV: 'ice_lightning_burst',
        KeyB: 'moon_beam',
        KeyF: 'frost_wave',
        KeyG: 'fire_aura',
        KeyT: 'earth_surge',
        KeyC: 'fireball',
        KeyL: 'chain_lightning'
      };
      if (map[event.code]) {
        event.preventDefault();
        this.emit('sandboxVfx', map[event.code]);
        return;
      }
    }

    // Shift+C = clear VFX (combat C is parry)
    if (event.shiftKey && event.code === 'KeyC') {
      event.preventDefault();
      this.emit('action', 'clear');
      return;
    }

    const bound = matchKeyDown(event, this.hotkeyCtx);
    if (bound) {
      if (bound.prevent) event.preventDefault();
      this.emit(bound.channel, bound.payload);
      if (bound.channel === 'skillHold:start' && typeof bound.payload === 'number') {
        this.emit('element', bound.payload);
      }
      return;
    }

    // Digit 5–6 staffs — combat context only (1–4 are in HOTKEY_BINDINGS)
    if (this.hotkeyCtx === 'combat' && (event.code === 'Digit5' || event.code === 'Digit6')) {
      const i = event.code === 'Digit5' ? 4 : 5;
      this.emit('element', i);
      this.emit('skillHold:start', i);
      return;
    }

    // Danger leftover: J/H heals/bomb only in combat (not in table to keep table small)
    if (this.hotkeyCtx === 'combat' && this.combatKeys) {
      if (event.code === 'KeyJ') {
        event.preventDefault();
        this.emit('combatAction', 'heal');
        return;
      }
      if (event.code === 'KeyH') {
        event.preventDefault();
        this.emit('combatAction', 'bomb');
        return;
      }
    }

    switch (event.code) {
      case 'KeyE':
        // Equip mode only: cycle element (combat uses E as block)
        if (!this.combatKeys) this.emit('action', 'nextElement');
        break;
      case 'Slash':
      case 'KeyH':
        // ? / H = keyboard help (F1–F4 Admin · ] World — not help)
        if (!this.combatKeys) this.emit('action', 'toggleHelp');
        break;
      case 'Backquote':
        // ` = auto run / freeride sail-row
        event.preventDefault();
        this.emit('action', 'toggleAutoTraverse');
        break;
      case 'KeyG':
        this.emit('action', 'toggleEditor');
        break;
      case 'KeyC':
        if (!this.combatKeys) this.emit('action', 'clear');
        break;
      case 'KeyP':
        this.emit('action', 'togglePause');
        break;
      case 'KeyT':
        this.emit('action', 'togglePose');
        break;
      case 'KeyM':
        event.preventDefault();
        this.emit('action', 'mHoldStart');
        break;
      case 'KeyI':
        this.emit('action', 'toggleInventory');
        break;
      case 'KeyO':
        // Showcase review (race / weapon / anim / bind skills)
        this.emit('action', 'toggleShowcase');
        break;
      case 'KeyB':
        // Drop bag (throw / pickups)
        this.emit('action', 'toggleDropBag');
        break;
      case 'KeyL':
        // Spawn sample world loot prefabs
        this.emit('action', 'spawnLoot');
        break;
      case 'Tab':
        // Soft-lock cycle (Shift+Tab = previous) — combat / focus targeting
        event.preventDefault();
        this.emit('action', 'cycleTarget', { reverse: !!event.shiftKey });
        break;
      case 'F1':
      case 'F2':
      case 'F3':
      case 'F4':
        // Admin Hub: F1 Player · F2 Assets · F3 Creatures · F4 Prefabs
        event.preventDefault();
        this.emit('action', 'adminTab', event.code);
        break;
      case 'BracketRight':
        // ] = World admin (replaces F5)
        event.preventDefault();
        this.emit('action', 'adminTab', 'BracketRight');
        break;
      case 'F5':
        // Unbound — World moved to ]
        break;
      case 'Escape':
        this.emit('action', 'escape');
        break;
      default:
        break;
    }
  };

  _onKeyUp = (event) => {
    this.keys.delete(event.code);
    if (event.code === 'KeyQ' && !event.shiftKey) {
      this.emit('action', 'qHoldEnd');
    }
    if (event.code === 'KeyR') {
      this.emit('action', 'rHoldEnd');
    }
    if (event.code === 'KeyM') {
      this.emit('action', 'mHoldEnd');
    }
    // Digit / F release — Charged Shot release or tap fire
    const digitMap = {
      Digit1: 0,
      Digit2: 1,
      Digit3: 2,
      Digit4: 3,
      Digit5: 4,
      Digit6: 5,
      KeyF: 'f'
    };
    if (digitMap[event.code] !== undefined) {
      this.emit('skillHold:end', digitMap[event.code]);
    }
  };

  dispose() {
    this.dom.removeEventListener('pointerdown', this._onPointerDown);
    this.dom.removeEventListener('auxclick', this._onAuxClick);
    window.removeEventListener('pointermove', this._onPointerMove);
    window.removeEventListener('pointerup', this._onPointerUp);
    window.removeEventListener('pointercancel', this._onPointerUp);
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    this.clear();
  }
}
