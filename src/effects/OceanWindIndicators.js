/**
 * Ocean wind indications — soft, nearly invisible ambient gusts over water.
 *
 * Reuses **wind attack** primitives (same family as WindAbility / storm residual):
 *  - WindRibbonMaterial (silk hairline sheets)
 *  - Soft cyan motes (VfxDirector wind residual palette)
 *
 * Tuned for open ocean: low opacity, low glow, low height, sparse spawn —
 * readable as air moving over the sea without competing with skills.
 *
 * @see materials/WindMaterial.js
 * @see abilities/WindAbility.js
 * @see vfx/VfxDirector.js wind residual
 */

import { Group, Mesh, Vector3, Color, MathUtils, BufferAttribute } from 'three';
import { RibbonGeometry, RibbonMode } from './RibbonGeometry.js';
import { WindRibbonMaterial } from '../materials/WindMaterial.js';
import { LAYER } from '../core/Layers.js';
import { settings } from '../config/settings.js';
import { ParticleShape } from '../particles/ParticleSystem.js';
import { RateEmitter } from '../particles/ParticleEngine.js';
import { WORLD } from '../config/worldScale.js';

const POINTS = 28;
const MAX_GUSTS = 6;
const _p = new Vector3();
const _dir = new Vector3();
const _side = new Vector3();
const _emit = {};

/**
 * @typedef {object} Gust
 * @property {import('./RibbonGeometry.js').RibbonGeometry} ribbon
 * @property {Mesh} mesh
 * @property {Vector3[]} points
 * @property {number} seed
 * @property {number} age
 * @property {number} life
 * @property {number} speed
 * @property {number} yaw
 * @property {number} baseY
 * @property {boolean} live
 */

export class OceanWindIndicators {
  /**
   * @param {{
   *   scene: import('three').Scene,
   *   particles?: import('../particles/ParticleEngine.js').ParticleEngine,
   * }} ctx
   */
  constructor(ctx) {
    this.ctx = ctx;
    this.group = new Group();
    this.group.name = 'OceanWindIndicators';
    this.group.frustumCulled = false;
    ctx.scene.add(this.group);

    this.enabled = true;
    this._spawnTimer = 0;
    this._elapsed = 0;

    // Shared silk material — same shader as wind attacks, ghost opacity
    this.material = new WindRibbonMaterial();
    this._applyGhostLook();

    /** @type {Gust[]} */
    this.gusts = [];
    for (let i = 0; i < MAX_GUSTS; i++) {
      const ribbon = new RibbonGeometry(POINTS - 1);
      const mesh = new Mesh(ribbon.geometry, this.material);
      mesh.frustumCulled = false;
      mesh.matrixAutoUpdate = false;
      mesh.layers.set(LAYER.VFX);
      mesh.renderOrder = 6; // under skill VFX
      mesh.visible = false;
      this.group.add(mesh);

      const seed = (i * 0.6180339887) % 1;
      const seeds = new Float32Array(POINTS * 2).fill(seed);
      ribbon.geometry.setAttribute('aSeed', new BufferAttribute(seeds, 1));

      const points = [];
      for (let p = 0; p < POINTS; p++) points.push(new Vector3());

      this.gusts.push({
        ribbon,
        mesh,
        points,
        seed,
        age: 0,
        life: 4,
        speed: 3,
        yaw: 0,
        baseY: 0.12,
        live: false
      });
    }

    // Soft wind motes (same system id family as attack residual)
    this.motes = null;
    this.moteEmitter = new RateEmitter();
    if (ctx.particles) {
      this.motes = ctx.particles.get('ocean.wind.motes', {
        capacity: 400,
        shape: ParticleShape.SOFT,
        additive: true,
        softFade: 0.55,
        swirl: true
      });
      if (this.motes.uniforms?.uGravity) this.motes.uniforms.uGravity.value.set(0, 0.02, 0);
      if (this.motes.uniforms?.uDrag) this.motes.uniforms.uDrag.value = 0.96;
      if (this.motes.uniforms?.uEndSize) this.motes.uniforms.uEndSize.value = 0.4;
    }
  }

  /** Nearly invisible silk — reads as heat/air shimmer, not a cast. */
  _applyGhostLook() {
    const u = this.material.uniforms;
    const w = settings.wind || {};
    // Steal wind attack palette, crush intensity
    u.uColorInner.value.set(w.colorInner || '#f4fcff');
    u.uColorOuter.value.set(w.colorOuter || '#b6d8ea');
    u.uOpacity.value = 0.07; // nearly invisible
    u.uGlow.value = 0.22;
    u.uFresnel.value = 0.85;
    u.uNoiseStrength.value = (w.noiseStrength ?? 0.71) * 0.55;
    u.uNoiseFrequency.value = (w.noiseFrequency ?? 0.9) * 0.7;
    u.uSwirlSpeed.value = (w.swirlSpeed ?? 2.2) * 0.45;
    u.uFilaments.value = Math.max(12, Math.min(22, (w.filamentCount ?? 28) * 0.55));
    u.uFilamentSharp.value = Math.min(0.5, w.filamentSharpness ?? 0.56);
    u.uTurbulence.value = (w.turbulence ?? 0.8) * 0.4;
    u.uHaze.value = 0.55;
    u.uTailFade.value = 0.28;
    this.material.needsUpdate = true;
  }

  /**
   * @param {number} dt
   * @param {import('three').Vector3} focus  player / camera focus XZ
   * @param {{
   *   waterY?: number,
   *   islandRadius?: number,
   *   windYaw?: number,
   *   windSpeed?: number,
   *   enabled?: boolean
   * }} [opts]
   */
  update(dt, focus, opts = {}) {
    if (opts.enabled === false || settings.walk?.oceanWindIndicators === false) {
      this._hideAll();
      return;
    }
    if (!(dt > 0) || !focus) return;

    this._elapsed += dt;
    this._applyGhostLook(); // live editor knobs via settings.wind

    const waterY = opts.waterY ?? WORLD.waterY ?? -0.04;
    const islandR = opts.islandRadius ?? WORLD.islandRadius ?? 14;
    const windYaw =
      Number.isFinite(opts.windYaw)
        ? opts.windYaw
        : (settings.walk?.oceanWindYaw ?? 0.7) + Math.sin(this._elapsed * 0.07) * 0.25;
    const windSpeed = opts.windSpeed ?? settings.walk?.oceanWindSpeed ?? 4.2;

    // Spawn cadence — sparse so ocean stays soft
    this._spawnTimer -= dt;
    if (this._spawnTimer <= 0) {
      this._spawnTimer = MathUtils.randFloat(1.4, 3.2);
      this._trySpawn(focus, waterY, islandR, windYaw, windSpeed);
    }

    // Soft mote field around player over water (not on island pad)
    this._emitMotes(dt, focus, waterY, islandR, windYaw, windSpeed);

    for (const g of this.gusts) {
      if (!g.live) continue;
      g.age += dt;
      if (g.age >= g.life) {
        g.live = false;
        g.mesh.visible = false;
        continue;
      }

      // Advect polyline along wind + gentle sin meander
      const t = g.age / g.life;
      const fade = Math.sin(Math.PI * Math.min(1, t * 1.15)) * (1 - t * 0.35);
      const step = g.speed * dt;
      _dir.set(Math.sin(g.yaw), 0, Math.cos(g.yaw));
      _side.set(_dir.z, 0, -_dir.x);

      for (let i = 0; i < g.points.length; i++) {
        const pt = g.points[i];
        const along = i / (g.points.length - 1);
        pt.addScaledVector(_dir, step);
        // Soft lateral meander (wind attack turbulence, reduced)
        const meander =
          Math.sin(this._elapsed * 1.1 + along * 4.5 + g.seed * 12) * 0.012 * dt * 60;
        pt.addScaledVector(_side, meander);
        // Stay slightly above water, rise/fall with wave feel
        pt.y =
          g.baseY +
          waterY +
          Math.sin(this._elapsed * 1.4 + along * 3.0 + g.seed * 8) * 0.04;
      }

      // Width profile: thin whisker ends (WindAbility WIDTH_PROFILE lite)
      const widthAt = (u) => {
        const open = Math.min(1, u / 0.25);
        const close = Math.min(1, (1 - u) / 0.3);
        const body = open * open * (3 - 2 * open) * close * close * (3 - 2 * close);
        return (0.35 + 0.9 * body) * fade; // metres — soft low curtain
      };

      g.ribbon.build(g.points, {
        mode: RibbonMode.UPRIGHT,
        width: 0.55 * fade,
        widthProfile: widthAt
      });
      g.mesh.visible = fade > 0.02;
      g.mesh.matrixWorld.identity();
    }
  }

  /**
   * @param {Vector3} focus
   * @param {number} waterY
   * @param {number} islandR
   * @param {number} windYaw
   * @param {number} windSpeed
   */
  _trySpawn(focus, waterY, islandR, windYaw, windSpeed) {
    const free = this.gusts.find((g) => !g.live);
    if (!free) return;

    // Spawn ring outside island pad so streaks read over ocean
    const dist = MathUtils.randFloat(islandR + 2.5, islandR + 18);
    const ang = Math.random() * Math.PI * 2;
    const ox = focus.x + Math.cos(ang) * dist;
    const oz = focus.z + Math.sin(ang) * dist;

    // Prefer not spawning on dry pad
    if (Math.hypot(ox - focus.x, oz - focus.z) < islandR * 0.85) return;

    free.live = true;
    free.age = 0;
    free.life = MathUtils.randFloat(3.2, 6.5);
    free.speed = windSpeed * MathUtils.randFloat(0.75, 1.15);
    free.yaw = windYaw + MathUtils.randFloat(-0.35, 0.35);
    free.baseY = MathUtils.randFloat(0.08, 0.35);

    _dir.set(Math.sin(free.yaw), 0, Math.cos(free.yaw));
    _side.set(_dir.z, 0, -_dir.x);
    const len = MathUtils.randFloat(6, 14);
    for (let i = 0; i < free.points.length; i++) {
      const u = i / (free.points.length - 1);
      free.points[i].set(
        ox + _dir.x * u * len + _side.x * Math.sin(u * 4 + free.seed * 6) * 0.35,
        waterY + free.baseY,
        oz + _dir.z * u * len + _side.z * Math.sin(u * 4 + free.seed * 6) * 0.35
      );
    }
    free.mesh.visible = true;
  }

  _emitMotes(dt, focus, waterY, islandR, windYaw, windSpeed) {
    if (!this.motes) return;
    // Very low rate — soft air indication only
    const rate = settings.walk?.oceanWindMoteRate ?? 8;
    const n = this.moteEmitter.tick(dt, rate);
    if (n < 1) return;

    _dir.set(Math.sin(windYaw), 0.05, Math.cos(windYaw)).normalize();
    // Ring just outside pad / over near water
    const r = islandR + MathUtils.randFloat(1, 12);
    const a = Math.random() * Math.PI * 2;
    _p.set(focus.x + Math.cos(a) * r, waterY + MathUtils.randFloat(0.15, 1.1), focus.z + Math.sin(a) * r);

    _emit.position = _p;
    _emit.radius = 1.8;
    _emit.direction = _dir;
    _emit.speed = windSpeed * 0.35;
    _emit.speedVariance = 0.4;
    _emit.spread = 0.55;
    _emit.inherit = null;
    _emit.anchor = null;
    _emit.size = 0.06;
    _emit.sizeVariance = 0.5;
    _emit.life = 1.4;
    _emit.lifeVariance = 0.5;
    _emit.spin = 0.4;
    _emit.tint = new Color(0xc9f0ff);
    _emit.time = this._elapsed;
    this.motes.emit(Math.min(6, n), _emit);
  }

  _hideAll() {
    for (const g of this.gusts) {
      g.live = false;
      g.mesh.visible = false;
    }
  }

  dispose() {
    this._hideAll();
    this.group.removeFromParent();
    this.material.dispose?.();
    for (const g of this.gusts) {
      g.ribbon.geometry?.dispose?.();
    }
  }
}
