import { Color, Vector3 } from 'three';
import { BurstMode } from '../effects/BurstSphere.js';
import { DecalType } from '../effects/GroundDecals.js';
import { ParticleShape } from '../particles/ParticleSystem.js';
import { RateEmitter } from '../particles/ParticleEngine.js';
import { frame } from '../core/FrameUniforms.js';
import { settings } from '../config/settings.js';
import { getColor } from '../utils/color.js';
import {
  ELEMENT_EFFECT_MAP,
  SKILL_VFX_BIND,
  VFX_SANDBOX_SHORTCUTS,
  vfxCatalogById
} from './vfxCatalog.js';

const _p = new Vector3();
const _f = new Vector3();
const _g = new Vector3();
const _c = new Color();
const _emit = {};

/**
 * High-beauty VFX director for weapon skills — layers particles, bursts,
 * decals, lights, shake, flash using this app's existing systems.
 * Catalog / hotkeys aligned with https://vfxgrudge.puter.site/
 */
export class VfxDirector {
  /**
   * @param {object} ctx { scene, particles, lights, decals, bursts, shake, flash }
   */
  constructor(ctx) {
    this.ctx = ctx;
    this._systems = new Map();
    this._bootSystems();
  }

  _bootSystems() {
    const make = (id, opts) => {
      const sys = this.ctx.particles.get(`vfx.${id}`, {
        capacity: opts.capacity ?? 600,
        shape: opts.shape ?? ParticleShape.SOFT,
        additive: opts.additive !== false,
        swirl: !!opts.swirl,
        softFade: opts.softFade ?? 0.35
      });
      if (opts.gravity) sys.uniforms.uGravity.value.set(0, opts.gravity, 0);
      if (opts.drag != null) sys.uniforms.uDrag.value = opts.drag;
      this._systems.set(id, { sys, emitter: new RateEmitter() });
      return sys;
    };
    make('ember', { capacity: 800, swirl: true, gravity: -0.4 });
    make('frost', { capacity: 700, swirl: true, gravity: -0.15 });
    make('spark', { capacity: 500, gravity: -1.2, softFade: 0.5 });
    make('mote', { capacity: 600, swirl: true, gravity: 0.05 });
    make('dust', { capacity: 500, additive: false, gravity: -0.8 });
  }

  /**
   * Deploy a catalog effect at origin with optional forward/aim.
   * @param {string} effectId
   * @param {{ origin: Vector3, forward?: Vector3, aim?: Vector3, intensity?: number }} opts
   */
  deploy(effectId, opts) {
    const entry = vfxCatalogById(effectId);
    // Live editor knobs (settings.effect) override catalog defaults when set
    const e = settings.effect || {};
    let color = entry?.color ?? 0xffffff;
    if (opts.color) {
      color = typeof opts.color === 'number' ? opts.color : new Color(opts.color).getHex();
    } else if (e.color && effectId === 'getsuga_slash') {
      color = new Color(e.color).getHex();
    }
    const origin = opts.origin.clone();
    const fwd = (opts.forward || new Vector3(0, 0, 1)).clone();
    fwd.y = 0;
    if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, 1);
    else fwd.normalize();

    const sizeMul = opts.size ?? e.size ?? 1;
    const aoeMul = opts.aoe ?? e.aoe ?? 1;
    const cast = origin.clone();
    // When origin is already weapon tip (residual), do not lift to chest
    if (opts.fromTip) {
      /* keep cast = tip */
    } else if (effectId !== 'getsuga_slash') {
      cast.y = origin.y + 1.15;
    }
    const front = cast.clone().addScaledVector(fwd, 1.15 * sizeMul);
    const ground = new Vector3(origin.x, 0.04, origin.z);
    const aim = opts.aim?.clone() || front.clone().addScaledVector(fwd, 6);
    const intensity =
      (opts.intensity ?? e.intensity ?? 1) *
      (settings.global?.glow ?? 1) *
      (settings.global?.explosionIntensity ?? 1);

    switch (effectId) {
      case 'ice_lightning_burst':
        this._frostPlate(ground, 3.2, color, intensity);
        this._nova(front, color, intensity * 1.1);
        this._burst(front, color, 32, 4.2, intensity);
        this._sparks(front, 0x7ec8ff, 40, 5, intensity);
        this.ctx.shake?.add(0.12 * intensity, 0.7, 28);
        this._flash(color, 0.18);
        break;
      case 'moon_beam': {
        const beam = aim.clone();
        beam.y = 0.08;
        this._auraRing(beam, color, 1.7, intensity);
        this._castAura(beam.clone().setY(1.3), color, intensity);
        this._burst(beam.clone().setY(2.0), color, 22, 2.6, intensity);
        this._nova(beam.clone().setY(1.5), 0xe8f4ff, intensity * 0.9);
        this._flash(color, 0.12);
        break;
      }
      case 'frost_wave':
        this._frostPlate(ground, 4.4, color, intensity * 1.15);
        this._shockwave(ground, color, 4.6, intensity);
        this._burst(front, color, 26, 3.6, intensity);
        this.ctx.shake?.add(0.1 * intensity, 0.65, 22);
        break;
      case 'fire_aura':
        this._castAura(cast, color, intensity);
        this._auraRing(ground, color, 2.5, intensity);
        this._embers(cast, 50, intensity);
        break;
      case 'earth_surge':
        this._shockwave(ground, 0xc4a574, 5.0, intensity);
        this._shockwave(ground.clone().setY(0.07), 0x8b7355, 3.6, intensity * 0.85);
        this._dustBurst(ground, 36, intensity);
        this._burst(front, 0xc4a574, 28, 4.0, intensity);
        this.ctx.shake?.add(0.16 * intensity, 0.85, 18);
        break;
      case 'fireball':
        this._castAura(cast, color, intensity * 0.9);
        this._embers(cast, 30, intensity);
        this._projectileTell(cast, fwd, color, intensity);
        break;
      case 'inferno':
        this._nova(front, color, intensity * 1.25);
        this._burst(front, color, 48, 5.5, intensity * 1.2);
        this._shockwave(ground, color, 3.8, intensity);
        this._embers(front, 60, intensity);
        this.ctx.shake?.add(0.2 * intensity, 0.9, 24);
        this._flash(color, 0.22);
        break;
      case 'arcane_swirl':
        this._castAura(cast, color, intensity);
        this._auraRing(ground, color, 1.9, intensity * 0.85);
        this._motes(cast, color, 40, intensity);
        break;
      case 'getsuga_slash': {
        // Residual: tip-spawned slash + optional ground AOE from settings.residual
        const r = settings.residual || {};
        const rInt = intensity * (r.intensity ?? 1) * sizeMul;
        this._slashArc(cast, fwd, color, rInt);
        this._burst(front, color, 18, 2.8 * (opts.speed ? opts.speed / 12 : 1), rInt);
        const aoeR = (opts.aoe ?? r.aoeRadius ?? aoeMul) * sizeMul;
        if (aoeR > 0.05) {
          this._shockwave(ground, color, Math.max(1.2, aoeR * 2.2), rInt * 0.85);
        }
        this.ctx.shake?.add(0.08 * rInt, 0.5, 30);
        break;
      }
      case 'fire_hand':
        this._castAura(cast, color, intensity * 1.1);
        this._embers(cast, 36, intensity);
        break;
      case 'chain_lightning':
        this._sparks(front, color, 50, 6, intensity);
        this._burst(front, color, 20, 3.2, intensity);
        this._nova(front, 0xa8e0ff, intensity * 0.7);
        break;
      default:
        this._burst(front, color, 20, 3, intensity);
        break;
    }
  }

  /**
   * Layer cast + impact beauty for a DRC skill fire.
   * @param {string} skillId
   * @param {{ origin: Vector3, forward: Vector3, aim?: Vector3 }} pose
   * @param {'cast'|'impact'|'full'} [phase]
   */
  deploySkill(skillId, pose, phase = 'full') {
    const bind = SKILL_VFX_BIND[skillId];
    if (!bind) {
      this.deploy('arcane_swirl', pose);
      return;
    }
    if (phase === 'cast' || phase === 'full') {
      if (bind.cast) this.deploy(bind.cast, { ...pose, intensity: 1.05 });
    }
    if (phase === 'impact' || phase === 'full') {
      if (bind.impact) {
        const impactPose = {
          origin: pose.aim || pose.origin,
          forward: pose.forward,
          aim: pose.aim,
          intensity: 1.15
        };
        this.deploy(bind.impact, impactPose);
      }
    }
  }

  /**
   * Element ability path start — cast tell at hand.
   * @param {'fire'|'water'|'earth'|'wind'} element
   */
  deployElementCast(element, pose) {
    const map = ELEMENT_EFFECT_MAP[element];
    if (map?.cast) this.deploy(map.cast, { ...pose, intensity: 1 });
  }

  /**
   * Element ability impact — beauty layer on top of Ability impact.
   */
  deployElementImpact(element, pose) {
    const map = ELEMENT_EFFECT_MAP[element];
    if (map?.impact) this.deploy(map.impact, { ...pose, intensity: 1.2 });
  }

  /** Alt+hotkey sandbox preview (vfxgrudge.puter.site). */
  deployFromHotkey(code) {
    const row = VFX_SANDBOX_SHORTCUTS.find((s) => s.code === code);
    return row?.effectId || null;
  }

  /* ---- primitives (compose beauty) ---- */

  _flash(color, strength = 0.15) {
    this.ctx.flash?.trigger?.(new Color(color), strength, 0.0005);
  }

  _burst(pos, color, count, speed, intensity = 1) {
    const mode =
      color === 0xff6a1e || color === 0xff5510 || color === 0xff6020
        ? BurstMode.FIRE
        : color === 0x9fdcff || color === 0x7ec8ff
          ? BurstMode.WATER
          : color === 0xc4a574
            ? BurstMode.EARTH
            : BurstMode.AIR;
    this.ctx.bursts?.spawn(mode, pos, {
      radius: 0.35 * intensity,
      endRadius: 2.8 * intensity,
      life: 0.55,
      intensity: 1.1 * intensity * (settings.global?.glow ?? 1),
      fresnel: 1.4,
      displace: 0.28,
      colorA: new Color(color),
      colorB: new Color(color).lerp(new Color(0xffffff), 0.35),
      colorC: new Color(0xffffff)
    });
    this._emitBurst('ember', pos, count * intensity, speed, color);
  }

  _nova(pos, color, intensity = 1) {
    this.ctx.decals?.spawn(DecalType.SHOCKWAVE, _p.copy(pos).setY(0.03), {
      radius: 2.4 * intensity,
      life: 0.7,
      width: 0.06,
      intensity: 0.85 * intensity,
      colorA: new Color(color),
      colorB: new Color(0xffffff)
    });
  }

  _shockwave(ground, color, radius, intensity = 1) {
    this.ctx.decals?.spawn(DecalType.SHOCKWAVE, ground, {
      radius: radius * intensity,
      life: 0.85,
      width: 0.08,
      intensity: 0.9 * intensity,
      colorA: new Color(color),
      colorB: new Color(color).multiplyScalar(0.6)
    });
  }

  _frostPlate(ground, radius, color, intensity = 1) {
    this.ctx.decals?.spawn(DecalType.DUSTRING, ground, {
      radius: radius * intensity,
      life: 1.2,
      intensity: 0.75 * intensity,
      colorA: new Color(color),
      colorB: new Color(0xffffff)
    });
    this._emitBurst('frost', ground.clone().setY(0.2), 28 * intensity, 2.2, color);
  }

  _auraRing(ground, color, radius, intensity = 1) {
    this.ctx.decals?.spawn(DecalType.DUSTRING, ground, {
      radius: radius * intensity,
      life: 0.9,
      intensity: 0.7 * intensity,
      colorA: new Color(color),
      colorB: new Color(color)
    });
  }

  _castAura(pos, color, intensity = 1) {
    const light = this.ctx.lights?.acquire?.();
    if (light) {
      this.ctx.lights.set(
        light,
        pos,
        new Color(color),
        8 * intensity * (settings.global?.lightIntensity ?? 1),
        5,
        0.016
      );
      // release next frames via pool decay — schedule soft release
      setTimeout(() => this.ctx.lights?.release?.(light), 420);
    }
    this._emitBurst('mote', pos, 24 * intensity, 1.8, color);
  }

  _embers(pos, count, intensity = 1) {
    this._emitBurst('ember', pos, count * intensity, 2.8, 0xff6a1e);
  }

  _sparks(pos, color, count, speed, intensity = 1) {
    this._emitBurst('spark', pos, count * intensity, speed, color);
  }

  _motes(pos, color, count, intensity = 1) {
    this._emitBurst('mote', pos, count * intensity, 1.6, color);
  }

  _dustBurst(pos, count, intensity = 1) {
    this._emitBurst('dust', pos, count * intensity, 3.5, 0xc4a574);
  }

  _projectileTell(pos, fwd, color, intensity = 1) {
    _f.copy(fwd).normalize();
    this._emitBurst('ember', pos.clone().addScaledVector(_f, 0.4), 20 * intensity, 4, color);
  }

  _slashArc(hand, fwd, color, intensity = 1) {
    _f.copy(fwd).normalize();
    const tip = hand.clone().addScaledVector(_f, 1.4);
    tip.y += 0.2;
    this._emitBurst('spark', tip, 28 * intensity, 4.5, color);
    this.ctx.bursts?.spawn(BurstMode.AIR, tip, {
      radius: 0.2,
      endRadius: 1.8 * intensity,
      life: 0.35,
      intensity: 0.95 * intensity,
      fresnel: 1.6,
      displace: 0.2,
      colorA: new Color(color),
      colorB: new Color(0xffffff),
      colorC: new Color(color)
    });
  }

  _emitBurst(sysId, position, count, speed, color) {
    const pack = this._systems.get(sysId);
    if (!pack || count < 1) return;
    const n = Math.min(80, Math.round(count * (settings.global?.particleCount ?? 1)));
    _c.set(typeof color === 'number' ? color : 0xffffff);
    _emit.position = position;
    _emit.radius = 0.15;
    _emit.direction = null;
    _emit.speed = speed;
    _emit.speedVariance = 0.55;
    _emit.spread = 1.1;
    _emit.inherit = null;
    _emit.anchor = position;
    _emit.size = 0.1;
    _emit.sizeVariance = 0.5;
    _emit.life = 0.7;
    _emit.lifeVariance = 0.4;
    _emit.spin = 2;
    _emit.tint = _c;
    _emit.time = frame.uTime?.value ?? 0;
    pack.sys.emit(n, _emit);
  }
}
