import { Vector2 } from 'three';
import { EventEmitter } from '../utils/EventEmitter.js';

/**
 * Pointer + keyboard → events.
 *
 * Combat hotkeys mirror Danger Room / threejs-rapier quickActions SSOT:
 *   1–4 skills · F residual · X roll · C parry · E guard · R heavy
 *   J heal · H bomb · V kick · Q mode · Space jump
 *   Shift+C clear VFX · G editor · I lab panel · Alt+V/B/F/G/T/C sandbox VFX
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

    this._bind();
  }

  setCombatKeys(on) {
    this.combatKeys = !!on;
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

    // Alt+sandbox VFX (never steal bare combat keys)
    if (event.altKey) {
      const map = {
        KeyV: 'ice_lightning_burst',
        KeyB: 'moon_beam',
        KeyF: 'frost_wave',
        KeyG: 'fire_aura',
        KeyT: 'earth_surge',
        KeyC: 'fireball'
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

    // Digit skills always (combat + equip free-cast)
    if (event.code === 'Digit1') {
      this.emit('element', 0);
      return;
    }
    if (event.code === 'Digit2') {
      this.emit('element', 1);
      return;
    }
    if (event.code === 'Digit3') {
      this.emit('element', 2);
      return;
    }
    if (event.code === 'Digit4') {
      this.emit('element', 3);
      return;
    }

    // Danger Room combat actions when combatKeys
    if (this.combatKeys) {
      const combatMap = {
        KeyF: 'fskill',
        KeyX: 'dodge',
        KeyC: 'parry',
        KeyE: 'block',
        KeyR: 'heavy',
        KeyV: 'kick',
        KeyJ: 'heal',
        KeyH: 'bomb'
      };
      if (combatMap[event.code]) {
        event.preventDefault();
        this.emit('combatAction', combatMap[event.code]);
        return;
      }
    }

    switch (event.code) {
      case 'KeyQ':
        this.emit('action', 'toggleDrcSession');
        break;
      case 'KeyE':
        // Equip mode only: cycle element (combat uses E as guard)
        if (!this.combatKeys) this.emit('action', 'nextElement');
        break;
      case 'Slash':
      case 'KeyH':
        if (!this.combatKeys) this.emit('action', 'toggleHelp');
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
      case 'KeyF':
        if (!this.combatKeys) this.emit('action', 'weaponAttack');
        break;
      case 'F1':
        event.preventDefault();
        this.emit('action', 'toggleHelp');
        break;
      default:
        break;
    }
  };

  _onKeyUp = (event) => {
    this.keys.delete(event.code);
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
