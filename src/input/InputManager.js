import { Vector2 } from 'three';
import { EventEmitter } from '../utils/EventEmitter.js';

/**
 * Pointer + keyboard → events.
 *
 * LMB modes (combat, from CombatFocus):
 *   focus ON  → lmb:attack
 *   focus OFF → lmb:select (unlocked mouse)
 *   sandbox / walk path → draw:start|move|end
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

  _bind() {
    this.dom.addEventListener('pointerdown', this._onPointerDown);
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

  _onPointerDown = (event) => {
    if (!this.enabled) return;
    if (event.button !== 0) return;
    if (event.target !== this.dom) return;

    this._updatePointer(event);
    const mode = this.getLmbMode?.() || 'draw';

    if (mode === 'attack') {
      this.emit('lmb:attack', this.pointer.clone());
      return;
    }
    if (mode === 'select') {
      this.emit('lmb:select', this.pointer.clone());
      return;
    }

    // Path draw (casting sandbox / walk course)
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

    // Digit skills / element select (1–6 staffs: fire storm ice nature holy arcane)
    // Combat: emit skillHold:start for hold-to-charge (Charged Shot); keyup releases
    if (event.code === 'Digit1') {
      this.emit('element', 0);
      this.emit('skillHold:start', 0);
      return;
    }
    if (event.code === 'Digit2') {
      this.emit('element', 1);
      this.emit('skillHold:start', 1);
      return;
    }
    if (event.code === 'Digit3') {
      this.emit('element', 2);
      this.emit('skillHold:start', 2);
      return;
    }
    if (event.code === 'Digit4') {
      this.emit('element', 3);
      this.emit('skillHold:start', 3);
      return;
    }
    if (event.code === 'Digit5') {
      this.emit('element', 4);
      this.emit('skillHold:start', 4);
      return;
    }
    if (event.code === 'Digit6') {
      this.emit('element', 5);
      this.emit('skillHold:start', 5);
      return;
    }

    // F = best next action always (pickup / harvest / standard attack)
    // Alt+F is sandbox frost (handled above). Residual is attack fallback, not a free skill key.
    // Combat F also starts skillHold for Charged Shot when weapon skill is chargeable.
    if (event.code === 'KeyF') {
      event.preventDefault();
      this.emit('combatAction', 'interact');
      this.emit('skillHold:start', 'f');
      return;
    }

    // Danger Room combat actions when combatKeys
    // Harvest mode: R is tool radial (not heavy); Q is mode radial (not equip)
    if (this.combatKeys) {
      const combatMap = {
        KeyX: 'dodge',
        KeyC: 'parry',
        KeyE: 'block',
        KeyR: 'heavy',
        KeyV: 'kick',
        KeyJ: 'heal',
        KeyH: 'bomb'
      };
      if (event.code === 'KeyR' && this.activityMode === 'harvest') {
        event.preventDefault();
        this.emit('action', 'rHoldStart');
        return;
      }
      if (combatMap[event.code]) {
        event.preventDefault();
        this.emit('combatAction', combatMap[event.code]);
        return;
      }
    }

    switch (event.code) {
      case 'KeyQ':
        // Hold Q = mode radial (Open parity); Shift+Q = equip session toggle
        if (event.shiftKey) {
          this.emit('action', 'toggleDrcSession');
        } else {
          this.emit('action', 'qHoldStart');
        }
        break;
      case 'KeyR':
        // Non-combat: tool radial always available for harvest tools
        if (this.activityMode === 'harvest') {
          event.preventDefault();
          this.emit('action', 'rHoldStart');
        }
        break;
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
        this.emit('action', 'toggleMode');
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
        this.emit('action', 'closeAdmin');
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
    window.removeEventListener('pointermove', this._onPointerMove);
    window.removeEventListener('pointerup', this._onPointerUp);
    window.removeEventListener('pointercancel', this._onPointerUp);
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    this.clear();
  }
}
