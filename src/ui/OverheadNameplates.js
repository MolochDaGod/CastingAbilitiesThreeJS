/**
 * World-space overhead HP bars (Bars HUD pack).
 *
 * Enemy → overhead_health_003 · Ally → overhead_health_001 · fillers inside.
 * Screen-projects anchors each frame (no CSS2D dependency).
 *
 * @see barsHudUi.js · craftpix-rpg-mmo-ui § Bars pack
 */

import { Vector3 } from 'three';
import {
  createOverheadBarEl,
  setOverheadBarHp,
  applyBarsHudCssVars
} from './barsHudUi.js';
import './bars-hud.css';

const _v = new Vector3();

/**
 * @typedef {{
 *   id: string,
 *   kind: 'enemy'|'ally',
 *   object: import('three').Object3D,
 *   el: HTMLElement,
 *   offsetY: number,
 *   getHp01?: () => number
 * }} OhEntry
 */

export class OverheadNameplates {
  /**
   * @param {{ host?: HTMLElement, maxDist?: number }} [opts]
   */
  constructor(opts = {}) {
    this.maxDist = opts.maxDist ?? 42;
    /** @type {HTMLElement} */
    this.root = document.createElement('div');
    this.root.className = 'hud-overheads';
    this.root.setAttribute('aria-hidden', 'true');
    const host = opts.host || document.body;
    host.appendChild(this.root);
    applyBarsHudCssVars(document.documentElement);

    /** @type {Map<string, OhEntry>} */
    this._byId = new Map();
    this._seq = 0;
  }

  /**
   * @param {import('three').Object3D} object
   * @param {{
   *   kind?: 'enemy'|'ally',
   *   name?: string,
   *   id?: string,
   *   offsetY?: number,
   *   getHp01?: () => number
   * }} [opts]
   */
  attach(object, opts = {}) {
    if (!object) return null;
    const kind = opts.kind === 'ally' ? 'ally' : 'enemy';
    const id = opts.id || object.uuid || `oh_${++this._seq}`;
    this.detach(id);

    const el = createOverheadBarEl(kind, { name: opts.name || object.userData?.displayName });
    this.root.appendChild(el);

    const getHp01 =
      opts.getHp01 ||
      (() => {
        const h = object.userData?.hp01;
        return Number.isFinite(h) ? h : 1;
      });

    /** @type {OhEntry} */
    const entry = {
      id,
      kind,
      object,
      el,
      offsetY: opts.offsetY ?? (kind === 'ally' ? 2.05 : 2.15),
      getHp01
    };
    this._byId.set(id, entry);
    object.userData.overheadBarId = id;
    setOverheadBarHp(el, getHp01());
    return id;
  }

  /**
   * @param {string|import('three').Object3D} idOrObject
   */
  detach(idOrObject) {
    let id = typeof idOrObject === 'string' ? idOrObject : idOrObject?.userData?.overheadBarId;
    if (!id && idOrObject && typeof idOrObject === 'object') {
      for (const [k, e] of this._byId) {
        if (e.object === idOrObject) {
          id = k;
          break;
        }
      }
    }
    if (!id) return;
    const e = this._byId.get(id);
    if (!e) return;
    e.el.remove();
    this._byId.delete(id);
    if (e.object?.userData) delete e.object.userData.overheadBarId;
  }

  clear() {
    for (const id of [...this._byId.keys()]) this.detach(id);
  }

  /**
   * Rebind all training dummies (call after spawn / respawn).
   * @param {import('three').Object3D[]} dummies
   */
  bindDummies(dummies = []) {
    // Drop stale enemy plates not in list
    for (const [id, e] of [...this._byId]) {
      if (e.kind !== 'enemy') continue;
      if (!dummies.includes(e.object)) this.detach(id);
    }
    for (const d of dummies) {
      if (!d) continue;
      if (d.userData?.overheadBarId && this._byId.has(d.userData.overheadBarId)) continue;
      this.attach(d, {
        kind: 'enemy',
        name: d.userData?.displayName || d.name || 'Enemy',
        offsetY: 2.2
      });
    }
  }

  /**
   * @param {import('three').Camera} camera
   * @param {number} viewW
   * @param {number} viewH
   * @param {import('three').Vector3} [playerPos] for distance fade
   */
  update(camera, viewW, viewH, playerPos) {
    if (!camera || !viewW || !viewH) return;
    const maxD2 = this.maxDist * this.maxDist;

    for (const e of this._byId.values()) {
      const obj = e.object;
      if (!obj || !obj.visible || !obj.parent) {
        e.el.classList.add('is-hidden');
        continue;
      }

      // World head position
      obj.getWorldPosition(_v);
      _v.y += e.offsetY;

      if (playerPos) {
        const dx = _v.x - playerPos.x;
        const dy = _v.y - playerPos.y;
        const dz = _v.z - playerPos.z;
        if (dx * dx + dy * dy + dz * dz > maxD2) {
          e.el.classList.add('is-hidden');
          continue;
        }
      }

      _v.project(camera);
      if (_v.z > 1 || _v.z < -1 || _v.x < -1.15 || _v.x > 1.15 || _v.y < -1.2 || _v.y > 1.2) {
        e.el.classList.add('is-hidden');
        continue;
      }

      const x = (_v.x * 0.5 + 0.5) * viewW;
      const y = (-_v.y * 0.5 + 0.5) * viewH;
      e.el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
      e.el.classList.remove('is-hidden');

      const hp = e.getHp01?.() ?? 1;
      setOverheadBarHp(e.el, hp);
    }
  }

  dispose() {
    this.clear();
    this.root.remove();
  }
}
