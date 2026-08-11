/**
 * Production status effects for weapon skill hits.
 *
 * Catalog `effects[]` strings + numeric damage/force map here — not a second
 * combat engine. Applies to hostiles (CombatFocus targets) and lab self-tests.
 *
 * Statuses: push · freeze · stun · slow · burn · root · knockup · silence · shield_break
 *
 * @see docs/WEAPON_SKILL_PRODUCTION_SSOT.md
 */

import { Color } from 'three';
import { applyKnockback } from './hitReaction.js';
import { mmToM } from './motionMath.js';

/** @typedef {'push'|'freeze'|'stun'|'slow'|'burn'|'root'|'knockup'|'silence'|'shield_break'|'heal'|'focus_buff'|'ward'} StatusId */

/**
 * @typedef {object} StatusInstance
 * @property {StatusId} id
 * @property {number} until          elapsed time end
 * @property {number} [magnitude]
 * @property {string} [sourceSkillId]
 * @property {object|null} [target]
 */

/**
 * Parse catalog effect text → status specs (no invented skill rows).
 * @param {string[]|string|undefined} effects
 * @param {{ damage?: number, force?: number, knockbackMm?: number, element?: string }} [ctx]
 * @returns {{ id: StatusId, durationSec: number, magnitude: number }[]}
 */
export function parseCatalogEffects(effects, ctx = {}) {
  const list = Array.isArray(effects)
    ? effects
    : typeof effects === 'string'
      ? [effects]
      : [];
  const blob = list.join(' ').toLowerCase();
  const out = [];

  const pushSec = (id, durationSec, magnitude = 1) => {
    if (!out.find((x) => x.id === id)) out.push({ id, durationSec, magnitude });
  };

  if (/freeze|frozen|absolute.?zero|ice.?nova|glacial/.test(blob)) {
    pushSec('freeze', parseDuration(blob, 2.5), 1);
  }
  if (/\bstun\b|stunned|daze|knocked.?down|interrupt/.test(blob)) {
    pushSec('stun', parseDuration(blob, 1.2), 1);
  }
  if (/slow|chill|frost.?spark|hinder|cripple/.test(blob)) {
    pushSec('slow', parseDuration(blob, 2.0), parsePct(blob, 0.35));
  }
  if (/burn|ignite|ember|inferno|hellstorm|dot|damage over/.test(blob)) {
    pushSec('burn', parseDuration(blob, 3.0), Math.max(2, (ctx.damage || 10) * 0.15));
  }
  if (/root|snare|entangle|vine.?lash|immobil/.test(blob)) {
    pushSec('root', parseDuration(blob, 1.8), 1);
  }
  if (/silence|interrupt.?cast|anti.?magic/.test(blob)) {
    pushSec('silence', parseDuration(blob, 2.0), 1);
  }
  if (/knock.?up|launch|airborne|uppercut/.test(blob)) {
    pushSec('knockup', 0.5, ctx.knockupVy ?? 3.2);
  }
  if (/push|knock.?back|force|shove|slam|bash/.test(blob) || (ctx.force && ctx.force > 6)) {
    pushSec('push', 0.35, ctx.knockbackMm ?? 180);
  }
  if (/shield.?break|guard.?break|armor.?break/.test(blob)) {
    pushSec('shield_break', 0.1, 1);
  }
  if (/heal|sprout|radiant|restore/.test(blob) || (ctx.damage != null && ctx.damage < 0)) {
    pushSec('heal', 0.1, Math.abs(ctx.damage || 12));
  }
  if (/\+spell|\+dmg|next.?spell|focus|power.?stance|take.?aim/.test(blob)) {
    pushSec('focus_buff', parseDuration(blob, 3), parsePct(blob, 0.35) + 1);
  }
  // Take Cover / Guard Stance / Nature Ward — self DR (catalog "-dmg taken 2s" etc.)
  if (
    /ward|guard.?stance|defense|\+def|take.?cover|cover|−15%|-\d+%\s*damage|-\s*dmg\s*taken|dmg\s*taken|damage\s*taken/.test(
      blob
    )
  ) {
    const mag = /-\d+%/.test(blob) ? parsePct(blob, 0.15) : parsePct(blob, 0.2);
    pushSec('ward', parseDuration(blob, 2), mag);
  }
  // Suppressing Shot etc. — enemy attack / fire-rate slow (already caught by /slow/)
  if (/slow\s*fire|fire\s*rate|suppress/.test(blob) && !out.find((x) => x.id === 'slow')) {
    pushSec('slow', parseDuration(blob, 2.0), parsePct(blob, 0.35));
  }

  // Element defaults when catalog text empty but element known
  if (!out.length && ctx.element) {
    const el = String(ctx.element).toLowerCase();
    if (el === 'ice' || el === 'frost') pushSec('slow', 1.2, 0.25);
    if (el === 'fire') pushSec('burn', 2.0, Math.max(2, (ctx.damage || 10) * 0.1));
    if (el === 'storm') pushSec('stun', 0.4, 0.5);
  }

  return out;
}

/**
 * @param {string} blob
 * @param {number} fallback
 */
function parseDuration(blob, fallback) {
  const m = /(\d+(?:\.\d+)?)\s*s(?:ec)?/.exec(blob);
  if (m) return Math.min(12, Math.max(0.2, Number(m[1])));
  return fallback;
}

/**
 * @param {string} blob
 * @param {number} fallback 0..1
 */
function parsePct(blob, fallback) {
  const m = /(\d+)\s*%/.exec(blob);
  if (m) return Math.min(0.9, Math.max(0.05, Number(m[1]) / 100));
  return fallback;
}

/**
 * Runtime status registry on combat host.
 */
export class SkillStatusSystem {
  /**
   * @param {{
   *   onToast?: (s: string) => void,
   *   getElapsed?: () => number
   * }} [opts]
   */
  constructor(opts = {}) {
    this.onToast = opts.onToast || (() => {});
    this.getElapsed = opts.getElapsed || (() => 0);
    /** @type {Map<string, StatusInstance[]>} targetId → statuses */
    this._byTarget = new Map();
    /** @type {Map<string, object>} targetId → mesh/ref */
    this._targets = new Map();
  }

  /**
   * Apply hit package from a production skill.
   * @param {{
   *   target: { id?: string, point?: import('three').Vector3, mesh?: object, kind?: string }|null,
   *   skill?: object,
   *   hit?: object,
   *   character?: object,
   *   physics?: object,
   *   drc?: object,
   *   applyToPlayer?: boolean
   * }} opts
   */
  applyHit(opts) {
    const skill = opts.skill || {};
    const hit = opts.hit || {};
    const target = opts.target;
    const elapsed = this.getElapsed();
    const statuses = skill.statuses?.length
      ? skill.statuses
      : parseCatalogEffects(skill.effects, {
          damage: skill.damage ?? hit.damage,
          force: hit.force ?? skill.force,
          knockbackMm: hit.knockbackMm ?? skill.knockbackMm,
          knockupVy: hit.knockupVy ?? skill.knockupVy,
          element: skill.element || hit.element
        });

    // Damage toast / number (hosts wire HP later)
    const dmg = Number(skill.damage ?? hit.damage ?? 0);
    // Self / player hits always register under 'player' so burn SFX / move mul stay consistent
    const tid = opts.applyToPlayer
      ? 'player'
      : target?.id || target?.mesh?.uuid || 'aim';

    /**
     * Player defensive SSOT (P0):
     * Spatial contact hits (point present) → invuln / weapon-volume parry cancel
     * damage · status · knockback. Buffs (ward/heal) usually have no point — pass through.
     * @see DrcCombatController.tryParryBlock · weaponVolumeBlocks
     */
    const isPlayerHit =
      !!opts.applyToPlayer ||
      target?.kind === 'self' ||
      target?.kind === 'player' ||
      target?.id === 'player';
    const attackPoint = hit.point || target?.point || null;
    if (isPlayerHit && attackPoint && opts.drc) {
      const drc = opts.drc;
      if (drc.isInvincible || (Number(drc.invuln) || 0) > 0) {
        this.onToast('Invincible');
        return { targetId: 'player', damage: 0, statuses: [], blocked: 'invuln' };
      }
      const attackR =
        Number(hit.contactRadius ?? hit.radius ?? hit.hitRadius ?? 0.18) || 0.18;
      if (typeof drc.tryParryBlock === 'function' && drc.tryParryBlock(attackPoint, attackR)) {
        // tryParryBlock already toasts "Parried!" + VFX
        return { targetId: 'player', damage: 0, statuses: [], blocked: 'parry', damageWas: dmg };
      }
    }

    if (target?.mesh) this._targets.set(tid, target);
    if (opts.applyToPlayer) this._targets.set('player', target || { id: 'player', kind: 'player' });

    const applied = [];
    for (const st of statuses) {
      const until = elapsed + (st.durationSec || 1);
      const inst = {
        id: st.id,
        until,
        magnitude: st.magnitude ?? 1,
        sourceSkillId: skill.id,
        target
      };
      if (!this._byTarget.has(tid)) this._byTarget.set(tid, []);
      // Replace same status id
      const arr = this._byTarget.get(tid).filter((x) => x.id !== st.id);
      arr.push(inst);
      this._byTarget.set(tid, arr);
      this._applyVisual(tid, inst);
      applied.push(st.id);

      // Physics statuses
      if (st.id === 'push' && (target?.kind === 'hostile' || opts.applyToPlayer)) {
        applyKnockback(
          { character: opts.character, physics: opts.physics, drc: opts.drc },
          {
            forward: hit.forward,
            knockbackMm: st.magnitude || hit.knockbackMm || 180,
            knockupVy: hit.knockupVy ?? 0.8,
            playAnim: true
          }
        );
      }
      if (st.id === 'knockup') {
        applyKnockback(
          { character: opts.character, physics: opts.physics, drc: opts.drc },
          {
            forward: hit.forward,
            knockbackMm: 40,
            knockupVy: st.magnitude || 3.2,
            playAnim: true
          }
        );
      }
      if (st.id === 'freeze' && target?.mesh) {
        target.mesh.userData = target.mesh.userData || {};
        target.mesh.userData.frozenUntil = until;
        target.mesh.userData.frozen = true;
        target.mesh.userData.statusLocked = true;
      }
      if (st.id === 'stun' && target?.mesh) {
        target.mesh.userData = target.mesh.userData || {};
        target.mesh.userData.stunnedUntil = until;
        target.mesh.userData.statusLocked = true;
      }
      if (st.id === 'root' && target?.mesh) {
        target.mesh.userData = target.mesh.userData || {};
        target.mesh.userData.rootedUntil = until;
        target.mesh.userData.statusLocked = true;
      }
      if (st.id === 'slow' && target?.mesh) {
        target.mesh.userData = target.mesh.userData || {};
        target.mesh.userData.slowUntil = until;
        target.mesh.userData.slowMul = 1 - Math.min(0.85, st.magnitude || 0.35);
      }
    }

    // Direct push from hit physics even without status text
    if (
      !applied.includes('push') &&
      hit.knockbackMm > 40 &&
      (opts.applyToPlayer || target?.kind === 'self')
    ) {
      applyKnockback(
        { character: opts.character, physics: opts.physics, drc: opts.drc },
        {
          forward: hit.forward,
          knockbackMm: hit.knockbackMm,
          knockupVy: hit.knockupVy,
          playAnim: true
        }
      );
      applied.push('push');
    }

    const tags = [
      dmg ? `${dmg} dmg` : null,
      ...applied.map((a) => a.toUpperCase()),
      skill.element || hit.element || null
    ].filter(Boolean);
    if (tags.length) this.onToast(`Impact · ${tags.join(' · ')}`);
    return { targetId: tid, damage: dmg, statuses: applied };
  }

  /**
   * @param {string} targetId
   * @param {StatusId} id
   */
  hasStatus(targetId, id) {
    const elapsed = this.getElapsed();
    const arr = this._byTarget.get(targetId) || [];
    return arr.some((s) => s.id === id && s.until > elapsed);
  }

  /**
   * Movement multiplier for a target (1 = free, 0 = locked).
   * @param {string} targetId
   */
  moveMul(targetId) {
    const elapsed = this.getElapsed();
    const arr = this._byTarget.get(targetId) || [];
    let mul = 1;
    for (const s of arr) {
      if (s.until <= elapsed) continue;
      if (s.id === 'freeze' || s.id === 'stun' || s.id === 'root') return 0;
      if (s.id === 'slow') mul = Math.min(mul, 1 - Math.min(0.85, s.magnitude || 0.35));
    }
    return mul;
  }

  /**
   * @param {number} elapsed
   */
  update(elapsed) {
    for (const [tid, arr] of this._byTarget) {
      const live = arr.filter((s) => s.until > elapsed);
      if (live.length !== arr.length) {
        this._byTarget.set(tid, live);
        const mesh = this._targets.get(tid)?.mesh;
        if (mesh?.userData) {
          if (!live.find((s) => s.id === 'freeze')) {
            mesh.userData.frozen = false;
            mesh.userData.frozenUntil = 0;
          }
          if (!live.find((s) => s.id === 'stun')) mesh.userData.stunnedUntil = 0;
          if (!live.find((s) => s.id === 'root')) mesh.userData.rootedUntil = 0;
          if (!live.find((s) => ['freeze', 'stun', 'root'].includes(s.id))) {
            mesh.userData.statusLocked = false;
          }
        }
      }
      if (!live.length) this._byTarget.delete(tid);
    }
  }

  /**
   * @param {string} tid
   * @param {StatusInstance} inst
   */
  _applyVisual(tid, inst) {
    const ref = this._targets.get(tid);
    const mesh = ref?.mesh;
    if (!mesh?.traverse) return;
    const colors = {
      freeze: 0x88ddff,
      stun: 0xffe066,
      slow: 0xa0c4ff,
      burn: 0xff6622,
      root: 0x66aa44,
      silence: 0xcc88ff
    };
    const hex = colors[inst.id];
    if (!hex) return;
    mesh.traverse((o) => {
      if (!o.isMesh || !o.material?.emissive) return;
      try {
        if (!o.userData._statusEm) o.userData._statusEm = o.material.emissive.getHex?.();
        o.material.emissive.setHex(hex);
        o.material.emissiveIntensity = Math.max(o.material.emissiveIntensity || 0, 0.55);
      } catch {
        /* */
      }
    });
  }
}

export { mmToM };
