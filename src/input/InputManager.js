import { Vector2 } from 'three';
import { EventEmitter } from '../utils/EventEmitter.js';

/**
 * Normalises pointer + keyboard input into a small event vocabulary.
 *
 * Events: `draw:start`, `draw:move`, `draw:end`, `element`, `action`.
 * Pointer events that begin on top of DOM UI (the editor, the HUD) are ignored
 * so dragging a slider never starts drawing a path.
 */
export class InputManager extends EventEmitter {
  constructor(domElement) {
    super();
    this.dom = domElement;
    this.pointer = new Vector2(); // NDC
    this.isDrawing = false;
    this.keys = new Set();
    this.enabled = true;

    this._bind();
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
    if (event.button !== 0) return; // left button draws; right orbits
    if (event.target !== this.dom) return; // started on UI

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
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;

    this.keys.add(event.code);

    // Alt+V/B/F/G/T/C → vfxgrudge.puter.site sandbox beauty previews
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

    switch (event.code) {
      case 'Digit1':
        this.emit('element', 0);
        break;
      case 'Digit2':
        this.emit('element', 1);
        break;
      case 'Digit3':
        this.emit('element', 2);
        break;
      case 'Digit4':
        this.emit('element', 3);
        break;
      case 'KeyQ':
        // DRC: equip ↔ combat (was prevElement)
        this.emit('action', 'toggleDrcSession');
        break;
      case 'KeyE':
        this.emit('action', 'nextElement');
        break;
      case 'KeyH':
        this.emit('action', 'toggleHelp');
        break;
      case 'KeyG':
        this.emit('action', 'toggleEditor');
        break;
      case 'KeyC':
        this.emit('action', 'clear');
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
      case 'KeyF':
        this.emit('action', 'weaponAttack');
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
