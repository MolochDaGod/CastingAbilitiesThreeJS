/**
 * Weapon-tip trail — samples grip→tip each frame during the attack window.
 *
 * SSOT stack (do not fork):
 *   getWeaponTip / WeaponAttach muzzle · settings.residual · VfxDirector getsuga
 *   · SkillProjectileSystem for physics residual at apex
 *
 * Visual: translucent ribbon + optional fire blur (distortion-style fade).
 * Hit: melee residual projectile starts slightly beyond tip (beyondBladeM).
 */

import {
  BufferAttribute,
  BufferGeometry,
  CatmullRomCurve3,
  Color,
  DoubleSide,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  Vector3
} from 'three';
import { settings } from '../config/settings.js';

const _p = new Vector3();
const _q = new Vector3();
const _side = new Vector3();
const _fwd = new Vector3();
const _up = new Vector3(0, 1, 0);

/**
 * @typedef {object} TipTrailSession
 * @property {number} endsAt
 * @property {number} apexAt
 * @property {boolean} apexFired
 * @property {Vector3[]} points
 * @property {Mesh|null} mesh
 * @property {string} color
 * @property {number} width
 * @property {number} beyondBladeM
 * @property {import('three').Vector3} forward
 * @property {object|null} skill
 * @property {object|null} hit
 * @property {number} rangeM
 * @property {boolean} fireBlur
 */

export class WeaponTipTrailSystem {
  /**
   * @param {{
   *   scene: import('three').Scene,
   *   character: { getWeaponTip?: Function, getWeaponForward?: Function, facing?: number },
   *   projectiles?: import('../combat/SkillProjectileSystem.js').SkillProjectileSystem|null,
   *   vfx?: { deploy?: Function }|null,
   *   abilities?: { cast?: Function, selected?: string }|null
   * }} opts
   */
  constructor(opts) {
    this.scene = opts.scene;
    this.character = opts.character;
    this.projectiles = opts.projectiles || null;
    this.vfx = opts.vfx || null;
    this.abilities = opts.abilities || null;
    /** @type {TipTrailSession[]} */
    this._sessions = [];
    this._elapsed = 0;
  }

  /**
   * Begin trail on attack start; apex residual fires after hitFrameDelay.
   * @param {{
   *   duration?: number,
   *   hitFrameDelay?: number,
   *   forward?: Vector3,
   *   skill?: object,
   *   hit?: { kind?: string, step?: number },
   *   rangeM?: number,
   *   color?: string,
   *   fireBlur?: boolean,
   *   width?: number,
   *   beyondBladeM?: number
   * }} [opts]
   */
  beginSwing(opts = {}) {
    const r = settings.residual || {};
    if (r.trailEnabled === false) return null;

    const duration = opts.duration ?? r.trailDuration ?? 0.32;
    const hitFrameDelay = opts.hitFrameDelay ?? r.hitFrameDelay ?? 0.18;
    const color =
      opts.color ||
      r.trailColor ||
      (opts.fireBlur || r.fireTrail ? '#ff6a22' : r.color) ||
      '#7dd3fc';
    const fireBlur = opts.fireBlur ?? !!r.fireTrail;
    const width = opts.width ?? r.trailWidth ?? 0.12;
    const beyondBladeM = opts.beyondBladeM ?? r.beyondBladeM ?? 0.35;

    const forward = (opts.forward?.clone?.() || new Vector3(0, 0, 1)).normalize();
    const session = {
      endsAt: this._elapsed + duration,
      apexAt: this._elapsed + hitFrameDelay,
      apexFired: false,
      points: [],
      mesh: null,
      color,
      width,
      beyondBladeM,
      forward,
      skill: opts.skill || null,
      hit: opts.hit || null,
      rangeM: opts.rangeM ?? r.range ?? 3.2,
      fireBlur
    };

    // Seed first tip sample immediately
    this._sampleTip(session);
    this._ensureMesh(session);
    this._sessions.push(session);
    return session;
  }

  /**
   * @param {number} dt
   * @param {number} [elapsed] absolute combat clock if available
   */
  update(dt, elapsed) {
    if (Number.isFinite(elapsed)) this._elapsed = elapsed;
    else this._elapsed += dt;

    for (let i = this._sessions.length - 1; i >= 0; i--) {
      const s = this._sessions[i];
      if (this._elapsed < s.endsAt) {
        this._sampleTip(s);
        this._rebuildRibbon(s);
      }

      // Apex of this swing / combo hit
      if (!s.apexFired && this._elapsed >= s.apexAt) {
        s.apexFired = true;
        this._fireApex(s);
      }

      if (this._elapsed >= s.endsAt + 0.08) {
        this._disposeSession(s);
        this._sessions.splice(i, 1);
      } else if (this._elapsed >= s.endsAt && s.mesh?.material) {
        // Fade tail after window
        const fade = 1 - MathUtils.clamp((this._elapsed - s.endsAt) / 0.08, 0, 1);
        s.mesh.material.opacity = (s.fireBlur ? 0.55 : 0.72) * fade;
      }
    }
  }

  clear() {
    for (const s of this._sessions) this._disposeSession(s);
    this._sessions.length = 0;
  }

  _sampleTip(session) {
    const ch = this.character;
    if (!ch?.getWeaponTip) return;
    const tipOff = settings.residual?.tipOffset ?? 0.55;
    ch.getWeaponTip(_p, tipOff);
    // Keep short dense trail (blur feel)
    const maxPts = settings.residual?.trailMaxPoints ?? 18;
    session.points.push(_p.clone());
    while (session.points.length > maxPts) session.points.shift();
  }

  _ensureMesh(session) {
    if (session.mesh) return;
    const geo = new BufferGeometry();
    // 2 verts per point (ribbon strip)
    const maxPts = settings.residual?.trailMaxPoints ?? 18;
    const pos = new Float32Array(maxPts * 2 * 3);
    geo.setAttribute('position', new BufferAttribute(pos, 3));
    geo.setDrawRange(0, 0);

    const mat = new MeshBasicMaterial({
      color: new Color(session.color),
      transparent: true,
      opacity: session.fireBlur ? 0.55 : 0.72,
      depthWrite: false,
      side: DoubleSide,
      toneMapped: false
    });
    // Fire blur: warmer + additive-ish via higher opacity mid samples
    if (session.fireBlur) {
      mat.color.set(session.color || '#ff6a22');
      mat.opacity = 0.48;
    }

    const mesh = new Mesh(geo, mat);
    mesh.name = 'WeaponTipTrail';
    mesh.frustumCulled = false;
    mesh.renderOrder = 12;
    mesh.userData.weaponTipTrail = true;
    this.scene.add(mesh);
    session.mesh = mesh;
  }

  _rebuildRibbon(session) {
    const pts = session.points;
    if (!session.mesh || pts.length < 2) return;
    const pos = session.mesh.geometry.attributes.position;
    const halfW = session.width * 0.5;
    let vi = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[Math.min(i + 1, pts.length - 1)];
      _fwd.copy(b).sub(a);
      if (_fwd.lengthSq() < 1e-10) {
        _fwd.copy(session.forward);
      } else _fwd.normalize();
      _side.crossVectors(_up, _fwd);
      if (_side.lengthSq() < 1e-10) _side.set(1, 0, 0);
      else _side.normalize();
      // Taper: head wider, tail thinner + more transparent feel via width
      const t = i / Math.max(1, pts.length - 1);
      const w = halfW * (0.35 + 0.65 * t) * (session.fireBlur ? 1.35 : 1);
      pos.setXYZ(vi++, a.x + _side.x * w, a.y + _side.y * w, a.z + _side.z * w);
      pos.setXYZ(vi++, a.x - _side.x * w, a.y - _side.y * w, a.z - _side.z * w);
    }
    pos.needsUpdate = true;
    session.mesh.geometry.setDrawRange(0, vi);
    session.mesh.geometry.computeBoundingSphere?.();
  }

  /**
   * Attack apex: residual slash VFX + physics projectile a bit past the blade.
   * @param {TipTrailSession} session
   */
  _fireApex(session) {
    const r = settings.residual || {};
    if (r.enabled === false) return;

    const ch = this.character;
    const tipOff = r.tipOffset ?? 0.55;
    if (ch?.getWeaponTip) ch.getWeaponTip(_p, tipOff);
    else return;

    // Live blade direction if available
    if (ch?.getWeaponForward) {
      ch.getWeaponForward(_fwd);
      if (_fwd.lengthSq() > 1e-8) session.forward.copy(_fwd).normalize();
    }

    // Beyond tip: residual starts past blade (melee hit volume)
    const beyond = session.beyondBladeM ?? 0.35;
    _q.copy(_p).addScaledVector(session.forward, beyond);

    const range = MathUtils.clamp(session.rangeM ?? r.range ?? 3.2, 1, 12);
    const pathEnd = _q.clone().addScaledVector(session.forward, range);
    pathEnd.y = Math.max(0.12, _q.y * 0.45);
    const mid = _q.clone().lerp(pathEnd, 0.45);
    mid.y = Math.max(_q.y, mid.y) + range * 0.04;

    const intensity =
      (r.intensity ?? 1) *
      (settings.effect?.intensity ?? 1) *
      (session.hit?.kind === 'finisher' || session.hit?.kind === 'finisherAir' ? 1.25 : 1);

    // Contact radius from weapon mesh cylinder (+ pad) when available
    const vol = ch.weaponVolume;
    const meshRadius = vol?.radiusM ?? 0.05;
    const contact =
      Math.max(r.contactRadius ?? 0.65, meshRadius + beyond * 0.5);

    // Beauty residual (Getsuga / slash) from beyond-blade point
    this.vfx?.deploy?.('getsuga_slash', {
      origin: _q.clone(),
      forward: session.forward.clone(),
      aim: pathEnd.clone(),
      fromTip: true,
      intensity,
      aoe: r.aoeRadius ?? 0.8,
      size: r.meshScale ?? 0.9,
      speed: r.speed ?? 14,
      color: session.fireBlur ? session.color || r.color : r.color
    });

    // Fire-style blur residual path (Ability trail primitive — same FireAbility family)
    if (settings.residual?.pathTrail !== false && this.abilities?.cast) {
      const curve = new CatmullRomCurve3([_q.clone(), mid, pathEnd], false, 'catmullrom', 0.5);
      const el =
        session.fireBlur || r.fireTrail
          ? 'fire'
          : this.abilities.selected || 'storm';
      try {
        this.abilities.cast(curve, el);
      } catch {
        /* optional */
      }
    }

    // Physics projectile along blade axis — radius from mesh cylinder
    if (this.projectiles?.spawn && r.physicsProjectile !== false) {
      void this.projectiles.spawn({
        origin: _q.clone(),
        target: pathEnd.clone(),
        forward: session.forward.clone(),
        element: session.fireBlur || r.fireTrail ? 'fire' : 'arcane',
        speed: r.speed ?? 16,
        gravity: 0,
        contactRadius: contact,
        life: Math.min(1.2, range / Math.max(6, r.speed ?? 16) + 0.15),
        force: 10 * intensity,
        knockbackMm: 160,
        aoe: r.aoeRadius ?? 0.8,
        size: Math.max(0.12, meshRadius * 2.2),
        color: session.color || r.color || '#ff8844',
        meshUrl: null,
        explodeOnHit: true
      });
    }
  }

  _disposeSession(session) {
    if (session.mesh) {
      this.scene.remove(session.mesh);
      session.mesh.geometry?.dispose?.();
      session.mesh.material?.dispose?.();
      session.mesh = null;
    }
    session.points.length = 0;
  }
}
