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
import { DodgeAfterimage } from './DodgeAfterimage.js';
import {
  presentationFor,
  HYBRID_SPIKE_OVERLAY
} from '../combat/elementPresentation.js';
import { normalizeElement } from '../combat/elementWeaponSkills.js';
import { getEquippedWeapon } from '../combat/equippedWeaponRuntime.js';
import { trailVariantForUse } from './effectVariants.js';
import { HealFieldFollow } from './HealFieldFollow.js';
import { SlashWaveSystem } from '../effects/SlashWaveSystem.js';
import { FIRE_WAVE_PALETTE } from './fireWaveVfx.js';

const _p = new Vector3();
const _f = new Vector3();
const _g = new Vector3();
const _c = new Color();
const _emit = {};

/**
 * High-beauty VFX director for weapon skills — layers particles, bursts,
 * decals, lights, shake, flash using this app's existing systems.
 * Catalog / hotkeys aligned with https://vfxgrudge.puter.site/
 *
 * Also owns dodge MM afterimage trails (model trailing images).
 */
export class VfxDirector {
  /**
   * @param {object} ctx { scene, particles, lights, decals, bursts, shake, flash }
   */
  constructor(ctx) {
    this.ctx = ctx;
    this._systems = new Map();
    this._bootSystems();
    /** @type {DodgeAfterimage|null} */
    this.afterimages = ctx.scene ? new DodgeAfterimage(ctx.scene) : null;
    /** Fire orbit bank — 5 balls around caster, send one per hit */
    this._orbit = { stock: 0, max: 5 };
    /** Shared ocean / combat silk gusts (WindRibbonMaterial). */
    this.oceanWind = ctx.oceanWind || null;
    this.healField = ctx.scene
      ? new HealFieldFollow(ctx.scene, ctx.assets || null)
      : null;
    /** Isolated waveanimation.glb + lava/fire shaders — same SlashWave residual. */
    this.waves = ctx.scene ? new SlashWaveSystem(ctx.scene) : null;
    void this.waves?.preload?.(ctx.assets || null);
    this.heightSample = null;
  }

  setHeightSample(fn) {
    this.heightSample = typeof fn === 'function' ? fn : null;
    this.healField?.setHeightSample?.(this.heightSample);
  }

  /**
   * Nature / holy HoT disk — follows affected unit, above terrain, under feet.
   * @param {object} target character with .position
   * @param {{ duration?: number }} [opts]
   */
  attachNatureHealField(target, opts = {}) {
    const t = target || this.ctx.character;
    if (opts.curve) {
      void this.healField?.attachAlongCurve(opts.curve, {
        duration: opts.duration ?? 6,
        samples: opts.samples ?? 4,
        heightSample: this.heightSample
      });
    }
    if (!t) return;
    void this.healField?.attach(t, {
      duration: opts.duration ?? 8,
      heightSample: this.heightSample
    });
  }

  update(dt) {
    this.healField?.update(dt);
    this.waves?.update(dt);
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
    // threejs-games smoke puffs — ParticleShape.SMOKE, not a second engine
    make('smoke', {
      capacity: 900,
      shape: ParticleShape.SMOKE,
      additive: false,
      swirl: true,
      gravity: 0.35,
      softFade: 0.7
    });
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
        this.ctx.shake?.add(0.045 * intensity, 0.9, 22);
        this._flash(color, 0.07);
        break;
      case 'moon_beam': {
        const beam = aim.clone();
        beam.y = 0.08;
        this._auraRing(beam, color, 1.7, intensity);
        this._castAura(beam.clone().setY(1.3), color, intensity);
        this._burst(beam.clone().setY(2.0), color, 22, 2.6, intensity);
        this._nova(beam.clone().setY(1.5), 0xe8f4ff, intensity * 0.9);
        this._flash(color, 0.05);
        break;
      }
      case 'frost_wave':
        this._frostPlate(ground, 4.4, color, intensity * 1.15);
        this._shockwave(ground, color, 4.6, intensity);
        this._burst(front, color, 26, 3.6, intensity);
        this._waveMesh('fire-wave-aoe', ground, fwd, {
          kind: 'aoe',
          shader: 'fire',
          size: 1.2 * sizeMul * aoeMul,
          intensity,
          palette: 'ice',
          colorCore: color
        });
        this.ctx.shake?.add(0.035 * intensity, 0.85, 18);
        break;
      case 'fire_aura':
        this._castAura(cast, color, intensity);
        this._auraRing(ground, color, 2.5, intensity);
        this._embers(cast, 50, intensity);
        break;
      case 'earth_surge': {
        // Small plate (jump-attack feet) when aoe is an explicit metre radius < 3.5.
        const plate = Number(opts.aoe);
        const smallPlate = Number.isFinite(plate) && plate > 0 && plate < 3.5;
        const rad = smallPlate ? plate / Math.max(0.2, intensity) : 5.0 * sizeMul;
        this._shockwave(ground, 0xc4a574, rad, intensity);
        this._shockwave(
          ground.clone().setY(0.07),
          0x8b7355,
          smallPlate ? rad * 0.72 : 3.6,
          intensity * 0.85
        );
        this._dustBurst(ground, smallPlate ? Math.max(8, Math.round(36 * intensity)) : 36, intensity);
        this._burst(
          front,
          0xc4a574,
          smallPlate ? Math.max(8, Math.round(28 * intensity)) : 28,
          smallPlate ? 2.2 * sizeMul : 4.0,
          intensity
        );
        this._waveMesh('lava-wave-aoe', ground, fwd, {
          kind: 'aoe',
          shader: 'lava',
          size: (smallPlate ? 0.55 : 1.25) * sizeMul,
          intensity,
          palette: 'earth',
          life: smallPlate ? 0.55 : 0.92
        });
        this.ctx.shake?.add(
          (smallPlate ? 0.025 : 0.055) * intensity,
          smallPlate ? 0.55 : 0.95,
          smallPlate ? 12 : 16
        );
        break;
      }
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
        this._waveMesh('lava-wave-aoe', ground, fwd, {
          kind: 'aoe',
          shader: 'lava',
          size: 1.15 * sizeMul * aoeMul,
          intensity,
          palette: 'lava'
        });
        this._waveMesh('fire-wave-aoe', ground, fwd, {
          kind: 'aoe',
          shader: 'fire',
          size: 0.9 * sizeMul,
          intensity: intensity * 0.9,
          palette: 'fire',
          life: 0.7
        });
        this._waveMesh('fire-wave-impact', front, fwd, {
          kind: 'impact',
          shader: 'fire',
          size: 0.75 * sizeMul,
          intensity,
          palette: 'fire'
        });
        this._waveMesh('fire-wave-drop', ground, fwd, {
          kind: 'impact',
          shader: 'fire',
          size: 0.45 * sizeMul,
          intensity: intensity * 0.85,
          palette: 'fire',
          life: 0.36
        });
        this.ctx.shake?.add(0.06 * intensity, 1.0, 20);
        this._flash(color, 0.08);
        break;
      case 'arcane_swirl':
        this._castAura(cast, color, intensity);
        this._auraRing(ground, color, 1.9, intensity * 0.85);
        this._motes(cast, color, 40, intensity);
        break;
      case 'getsuga_slash': {
        // Residual: tip-spawned slash + isolated fire-wave-attack (shader fire)
        const r = settings.residual || {};
        const rInt = intensity * (r.intensity ?? 1) * sizeMul;
        this._slashArc(cast, fwd, color, rInt);
        this._burst(front, color, 18, 2.8 * (opts.speed ? opts.speed / 12 : 1), rInt);
        const aoeR = (opts.aoe ?? r.aoeRadius ?? aoeMul) * sizeMul;
        if (aoeR > 0.05) {
          this._shockwave(ground, color, Math.max(1.2, aoeR * 2.2), rInt * 0.85);
        }
        this._waveMesh('fire-wave-attack', cast, fwd, {
          kind: 'travel',
          shader: 'fire',
          size: (opts.size ?? r.meshScale ?? 0.9) * sizeMul,
          range: r.range ?? 3.2,
          speed: opts.speed ?? r.speed ?? 14,
          intensity: rInt,
          palette: r.fireTrail === false ? null : 'fire',
          colorCore: color,
          swingDir: opts.swingDir || null
        });
        this.ctx.shake?.add(0.03 * rInt, 0.7, 26);
        break;
      }
      case 'fire_hand':
        this._castAura(cast, color, intensity * 1.1);
        this._embers(cast, 36, intensity);
        break;
      case 'lightning_bolt':
        this._deployLightningBolt(cast, aim, color, intensity, { chain: false });
        break;
      case 'chain_lightning':
        this._deployLightningBolt(cast, aim, color, intensity, { chain: true });
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
   * Accepts product elements (fire|storm|ice|nature|holy|arcane) or legacy.
   */
  deployElementCast(element, pose) {
    const pres = presentationFor(element);
    const map = ELEMENT_EFFECT_MAP[pres.abilityKey] || ELEMENT_EFFECT_MAP[element];
    const id = pres.castEffectId || map?.cast;
    if (id) this.deploy(id, { ...pose, intensity: 1, color: pres.color });
  }

  /**
   * Element ability impact — beauty layer on top of Ability impact.
   */
  deployElementImpact(element, pose) {
    const pres = presentationFor(element);
    const map = ELEMENT_EFFECT_MAP[pres.abilityKey] || ELEMENT_EFFECT_MAP[element];
    const id = pres.impactEffectId || map?.impact;
    if (id) this.deploy(id, { ...pose, intensity: 1.05, color: pres.color });
  }

  /**
   * Creative presentation for a product element (volley, meteor, vines, shield, …).
   * Uses existing particles/bursts/decals only — no second VFX engine.
   *
   * @param {string} element product element id
   * @param {{ origin: import('three').Vector3, forward?: import('three').Vector3, aim?: import('three').Vector3, intensity?: number, kind?: string, skillId?: string }} pose
   * @param {{ meteor?: boolean, volley?: boolean, pathKind?: string }} [opts]
   */
  deployPresentation(element, pose, opts = {}) {
    const el = normalizeElement(element);
    const pres = presentationFor(el);
    const p = settings.presentation || {};
    const intensity = pose.intensity ?? 1;
    const origin = pose.origin?.clone?.() || new Vector3();
    const fwd = (pose.forward || new Vector3(0, 0, 1)).clone();
    fwd.y = 0;
    if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, 1);
    else fwd.normalize();
    const aim = pose.aim?.clone?.() || origin.clone().addScaledVector(fwd, 8);
    const ground = new Vector3(origin.x, 0.04, origin.z);
    const cast = origin.clone();
    cast.y += 1.15;

    // Cast tell always (storm lightning uses a snappier tell below)
    if (!(pres.lightning && el === 'storm' && opts.pathKind !== 'wall')) {
      this.deploy(pres.castEffectId, {
        origin,
        forward: fwd,
        aim,
        intensity: intensity * 0.9,
        color: pres.color
      });
    }

    // Hybrid path spikes: earth motion already from Ability — beauty overlay by element
    if (opts.pathKind === 'spikes') {
      const hy = HYBRID_SPIKE_OVERLAY[el];
      if (hy) {
        this.deploy(hy.beauty, {
          origin: aim,
          forward: fwd,
          aim,
          intensity: intensity * 0.9,
          color: hy.color
        });
      }
    }

    if (pres.multiShot || opts.volley) {
      this._deployVolley(pres, cast, fwd, aim, intensity, p);
    }

    // Meteor: fire signature / explicit skill flag (sky shards + small ground blasts)
    if (opts.meteor === true || (el === 'fire' && opts.pathKind === 'stream' && intensity >= 1.35)) {
      this._deployMeteor(pres, aim, intensity, p);
    }

    if (pres.groundFlood || (opts.pathKind === 'aoe' && el === 'ice')) {
      this._deployGroundFlood(pres, ground, aim, intensity, p);
    }

    // Nature school = EarthAbility green + vine/earth_surge (catalog skills only)
    if (pres.style === 'vineLash' || el === 'nature' || opts.presentation === 'vineLash') {
      this._deployVineLash(pres, ground, aim, fwd, intensity, p);
    }

    // Storm: offense = narrow chain lightning + wind residual; wall/shield = defensive aura
    if (el === 'storm' || pres.lightning) {
      const wantShield =
        opts.shield === true ||
        opts.pathKind === 'wall' ||
        (pres.shield && opts.pathKind === 'wall');
      if (wantShield) {
        this._deployStormShield(pres, ground, cast, intensity, p);
      }
      if (!wantShield || opts.pathKind === 'stream' || opts.pathKind === 'spikes' || opts.pathKind === 'aoe') {
        if (pres.lightning !== false && opts.lightning !== false) {
          this._deployLightningBolt(cast, aim, pres.color, intensity, {
            chain: pres.chain !== false && opts.chain !== false,
            wind: true
          });
        }
      }
    }

    if (pres.style === 'voidBolt' || el === 'arcane') {
      this._deployArcaneVoid(pres, cast, fwd, aim, intensity, p);
    }

    if (pres.style === 'radiance' || el === 'holy') {
      this.deploy('moon_beam', {
        origin: aim,
        forward: fwd,
        aim,
        intensity: intensity * 0.95,
        color: pres.color
      });
      if (pres.healAura) {
        this._auraRing(ground, pres.color, 2.2, intensity * 0.85);
        this._castAura(cast, pres.colorB || pres.color, intensity * 0.7);
        this.attachNatureHealField(opts.target || opts.character || this.ctx.character, {
          duration: p.natureHealDuration ?? 8
        });
      }
    }

    // Default soft impact when style did not already schedule one
    if (
      !pres.multiShot &&
      el !== 'storm' &&
      el !== 'arcane' &&
      el !== 'nature' &&
      el !== 'ice'
    ) {
      this.deploy(pres.impactEffectId, {
        origin: aim,
        forward: fwd,
        aim,
        intensity: intensity * 0.85,
        color: pres.color
      });
    }
  }

  /**
   * Lightning / chain lightning — narrow, fast electric motion + optional wind residual.
   * Design: white-hot core, cyan glow, zigzag segments, hop chain, short life (not fat orbs).
   *
   * @param {Vector3} from cast hand / chest
   * @param {Vector3} to primary aim
   * @param {number} color
   * @param {number} intensity
   * @param {{ chain?: boolean, wind?: boolean }} [opts]
   */
  _deployLightningBolt(from, to, color, intensity = 1, opts = {}) {
    const L = settings.presentation?.lightning || {};
    const core = new Color(L.coreColor || '#eef9ff').getHex();
    const glow = typeof color === 'number' ? color : new Color(L.glowColor || '#6ec8ff').getHex();
    const arc = new Color(L.arcColor || '#a8e8ff').getHex();
    const segs = Math.max(3, Math.round(L.segments ?? 7));
    const zigzag = L.zigzag ?? 0.28;
    const boltSpeed = L.boltSpeed ?? 42;
    const boltLife = L.boltLife ?? 0.14;
    const coreSize = L.coreSize ?? 0.045;
    const glowSize = L.glowSize ?? 0.09;
    const wind = opts.wind !== false && L.windResidual !== false;
    const flashStr = (L.flash ?? 0.05) * intensity * (settings.global?.flashStrength ?? 1);

    // Hand crackle (tiny, not a ball)
    this._emitDirected('spark', from, to.clone().sub(from).normalize(), 10 * intensity, boltSpeed * 0.35, core, {
      size: coreSize * 0.7,
      life: boltLife * 0.8,
      spread: 0.22
    });
    this._castAura(from, glow, intensity * 0.45);

    // Primary bolt: zigzag polyline cast → aim (narrow directed sparks)
    this._electricPath(from, to, segs, zigzag, core, glow, arc, intensity, {
      boltSpeed,
      boltLife,
      coreSize,
      glowSize,
      wind
    });

    // Soft impact pin (small, not inferno)
    this._sparks(to, core, 14 * intensity, 5.5, intensity * 0.85);
    this._burst(to, glow, 10, 2.4, intensity * 0.55);
    this._nova(to.clone().setY(Math.max(0.05, to.y * 0.2 + 0.05)), arc, intensity * 0.45);
    if (flashStr > 0.001) this._flash(core, flashStr);
    this.ctx.shake?.add(0.028 * intensity, 1.1, 32);

    // Chain hops — fast cascade to lateral virtual targets (until real combat targets exist)
    if (opts.chain !== false) {
      const hops = Math.max(0, Math.round(L.chainHops ?? 3));
      const hopDelay = L.hopDelayMs ?? 38;
      const hopR = L.hopRadius ?? 3.2;
      const hopRange = L.hopRange ?? 5.5;
      let prev = to.clone();
      const baseFwd = to.clone().sub(from);
      baseFwd.y = 0;
      if (baseFwd.lengthSq() < 1e-6) baseFwd.set(0, 0, 1);
      else baseFwd.normalize();
      const side = new Vector3(-baseFwd.z, 0, baseFwd.x);

      for (let h = 0; h < hops; h++) {
        const t = (h + 1) * hopDelay;
        const lat = (Math.random() * 2 - 1) * hopR;
        const along = 0.6 + Math.random() * hopRange * 0.35;
        const next = prev
          .clone()
          .addScaledVector(side, lat)
          .addScaledVector(baseFwd, along * (0.4 + Math.random() * 0.4));
        next.y = 0.9 + Math.random() * 0.6;
        const fromHop = prev.clone();
        setTimeout(() => {
          this._electricPath(fromHop, next, Math.max(3, segs - 1 - h), zigzag * 0.85, core, glow, arc, intensity * (0.9 - h * 0.12), {
            boltSpeed: boltSpeed * 1.08,
            boltLife: boltLife * 0.9,
            coreSize: coreSize * (0.95 - h * 0.08),
            glowSize: glowSize * (0.95 - h * 0.08),
            wind
          });
          this._sparks(next, core, 8 * intensity, 4.5, intensity * 0.6);
          this._burst(next, glow, 6, 2.0, intensity * 0.4);
        }, t);
        prev = next;
      }
    }
  }

  /**
   * Draw a zigzag electric polyline with directed narrow sparks + optional wind silk residual.
   */
  _electricPath(from, to, segments, zigzag, core, glow, arc, intensity, p) {
    const n = Math.max(2, segments | 0);
    const dir = to.clone().sub(from);
    const len = dir.length() || 1;
    dir.multiplyScalar(1 / len);
    // Perpendicular for zigzag (prefer world up cross for visible jag)
    const side = new Vector3().crossVectors(dir, new Vector3(0, 1, 0));
    if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
    else side.normalize();
    const up = new Vector3().crossVectors(side, dir).normalize();

    let prev = from.clone();
    for (let i = 1; i <= n; i++) {
      const u = i / n;
      const jag = i < n ? (Math.random() * 2 - 1) * zigzag * (0.5 + Math.random() * 0.5) : 0;
      const jagY = i < n ? (Math.random() * 2 - 1) * zigzag * 0.35 : 0;
      const pt = from
        .clone()
        .addScaledVector(dir, len * u)
        .addScaledVector(side, jag)
        .addScaledVector(up, jagY);
      if (i === n) pt.copy(to);

      const segDir = pt.clone().sub(prev);
      const segLen = segDir.length() || 0.01;
      segDir.multiplyScalar(1 / segLen);
      const mid = prev.clone().lerp(pt, 0.5);

      // Core: thin, fast, short life
      this._emitDirected('spark', mid, segDir, Math.max(4, 7 * intensity), p.boltSpeed, core, {
        size: p.coreSize,
        life: p.boltLife,
        spread: 0.08,
        radius: 0.04
      });
      // Glow sheath
      this._emitDirected('mote', mid, segDir, Math.max(3, 5 * intensity), p.boltSpeed * 0.75, glow, {
        size: p.glowSize,
        life: p.boltLife * 1.15,
        spread: 0.14,
        radius: 0.06
      });
      // Arc fringe
      this._emitDirected('frost', mid, segDir, Math.max(2, 3 * intensity), p.boltSpeed * 0.55, arc, {
        size: p.glowSize * 0.7,
        life: p.boltLife * 1.3,
        spread: 0.2,
        radius: 0.05
      });

      // Wind residual silk — soft cyan motes lagging the bolt (WindAbility family)
      if (p.wind) {
        this._emitDirected('mote', mid.clone().addScaledVector(segDir, -0.15), segDir, 3 * intensity, p.boltSpeed * 0.25, 0xc9f0ff, {
          size: 0.07,
          life: 0.35,
          spread: 0.45,
          radius: 0.1
        });
      }

      prev = pt;
    }
  }

  /**
   * Directed narrow emission for electric/arrow-like travel (low spread, high speed, short life).
   */
  _emitDirected(sysId, position, direction, count, speed, color, opts = {}) {
    const pack = this._systems.get(sysId);
    if (!pack || count < 1) return;
    const n = Math.min(48, Math.round(count * (settings.global?.particleCount ?? 1)));
    _c.set(typeof color === 'number' ? color : 0xffffff);
    _f.copy(direction).normalize();
    _emit.position = position;
    _emit.radius = opts.radius ?? 0.05;
    _emit.direction = _f;
    _emit.speed = speed;
    _emit.speedVariance = opts.speedVariance ?? 0.18;
    _emit.spread = opts.spread ?? 0.12;
    _emit.inherit = null;
    _emit.anchor = position;
    _emit.size = opts.size ?? 0.05;
    _emit.sizeVariance = opts.sizeVariance ?? 0.25;
    _emit.life = opts.life ?? 0.16;
    _emit.lifeVariance = opts.lifeVariance ?? 0.2;
    _emit.spin = opts.spin ?? 6;
    _emit.tint = _c;
    _emit.time = frame.uTime?.value ?? 0;
    pack.sys.emit(n, _emit);
  }

  /** Fire/arcane micro volley — first shot is bullet-sized for cheap reads. */
  _deployVolley(pres, cast, fwd, aim, intensity, p) {
    const n = Math.max(1, Math.round(p.fireVolleyCount ?? 5));
    const delay = p.fireVolleyDelayMs ?? 65;
    const micro = p.microBulletSize ?? 0.14;
    const body = p.fireVolleySize ?? 0.32;
    for (let i = 0; i < n; i++) {
      const t = i * delay;
      const size = i === 0 && pres.microFirst ? micro : body * (0.85 + (i % 3) * 0.08);
      const lateral = ((i % 3) - 1) * 0.35;
      const side = new Vector3(-fwd.z, 0, fwd.x).multiplyScalar(lateral);
      const from = cast.clone().add(side).addScaledVector(fwd, 0.4 + i * 0.15);
      const to = aim.clone().add(side).addScaledVector(fwd, i * 0.4);
      setTimeout(() => {
        this._projectileTell(from, fwd, pres.color, intensity * (0.55 + size));
        this._emitBurst('ember', from, 8 * intensity, 3 + size * 4, pres.color);
        if (i === n - 1) {
          this.deploy(pres.impactEffectId, {
            origin: to,
            forward: fwd,
            aim: to,
            intensity: intensity * 0.75,
            color: pres.color,
            size
          });
        }
      }, t);
    }
  }

  /** Sky meteor: small falling shards + staggered ground explosions (render-friendly). */
  _deployMeteor(pres, aim, intensity, p) {
    const h = p.meteorHeight ?? 14;
    const shards = Math.max(1, Math.round(p.meteorShards ?? 4));
    const delay = p.meteorDelayMs ?? 90;
    for (let i = 0; i < shards; i++) {
      const ox = (Math.random() - 0.5) * 2.4;
      const oz = (Math.random() - 0.5) * 2.4;
      const sky = new Vector3(aim.x + ox, h, aim.z + oz);
      const hit = new Vector3(aim.x + ox * 0.4, 0.08, aim.z + oz * 0.4);
      setTimeout(() => {
        // Thin projectile tell from sky (not full FireAbility volume)
        this._sparks(sky, pres.color, 12, 2, intensity * 0.6);
        this._embers(sky, 16, intensity * 0.5);
        this.deploy('fireball', {
          origin: sky,
          forward: new Vector3(0, -1, 0),
          aim: hit,
          intensity: intensity * 0.55,
          color: pres.color,
          size: 0.4
        });
        this.deploy('inferno', {
          origin: hit,
          forward: new Vector3(0, 1, 0),
          aim: hit,
          intensity: intensity * 0.55,
          color: pres.color,
          size: 0.55
        });
      }, 120 + i * delay);
    }
  }

  /** Ice: frost plate crawl then erupt (earth timing, water shaders). */
  _deployGroundFlood(pres, ground, aim, intensity, p) {
    const r = p.iceFloodRadius ?? 4.2;
    const delay = p.iceEruptDelayMs ?? 280;
    this._frostPlate(ground, r * 0.55, pres.color, intensity * 0.9);
    this._shockwave(ground, pres.color, r * 0.7, intensity * 0.75);
    setTimeout(() => {
      const up = aim.clone();
      up.y = 1.4;
      this.deploy('frost_wave', {
        origin: ground,
        forward: new Vector3(0, 1, 0),
        aim: up,
        intensity: intensity * 1.05,
        color: pres.color
      });
      this._burst(up, pres.color, 28, 3.8, intensity);
      // "swallow" ring — expanding water plate
      this._frostPlate(ground, r, pres.colorB || pres.color, intensity * 1.1);
    }, delay);
  }

  /** Nature school (catalog): green earth_surge + vine lashes + heal aura. */
  _deployVineLash(pres, ground, aim, fwd, intensity, p) {
    const n = Math.max(1, Math.round(p.natureVineCount ?? 3));
    const green = pres.color;
    const dark = pres.colorB || 0x2d6b3a;
    // Underground rumble (soft)
    this.deploy('earth_surge', {
      origin: ground,
      forward: fwd,
      aim,
      intensity: intensity * 0.85,
      color: green
    });
    for (let i = 0; i < n; i++) {
      const t = 80 + i * 110;
      const side = new Vector3(-fwd.z, 0, fwd.x).multiplyScalar((i - (n - 1) / 2) * 0.9);
      const root = ground.clone().add(side).addScaledVector(fwd, 1.2 + i * 0.8);
      setTimeout(() => {
        // Lash: shockwave + burst rising like water jet but earth/green
        this._shockwave(root, green, 1.6, intensity * 0.8);
        this._dustBurst(root, 18, intensity * 0.7);
        this._burst(root.clone().setY(1.1), green, 16, 3.2, intensity);
        this._emitBurst('mote', root.clone().setY(0.8), 14, 2.4, dark);
      }, t);
    }
    if (pres.healAura && p.natureHealAura !== false) {
      this._auraRing(ground, green, 2.6, intensity * 0.7);
      this._castAura(ground.clone().setY(1.0), green, intensity * 0.55);
      this.attachNatureHealField(this.ctx.character, {
        duration: p.natureHealDuration ?? 8
      });
    }
  }

  /** Storm: defensive wind shield + spark rim. */
  _deployStormShield(pres, ground, cast, intensity, p) {
    const r = p.stormShieldRadius ?? 2.4;
    this._auraRing(ground, pres.color, r, intensity * 0.95);
    this._auraRing(ground.clone().setY(0.08), pres.colorB || 0xe8f7ff, r * 0.72, intensity * 0.7);
    this._castAura(cast, pres.color, intensity * 0.8);
    this._sparks(cast, pres.color, 24, 3.5, intensity * 0.75);
    this.deploy('arcane_swirl', {
      origin: cast,
      forward: new Vector3(0, 1, 0),
      intensity: intensity * 0.65,
      color: pres.color
    });
  }

  /** Arcane: purple core + void black secondary. */
  _deployArcaneVoid(pres, cast, fwd, aim, intensity, p) {
    const purple = pres.color;
    const voidC = typeof p.arcaneCore === 'string' ? new Color(p.arcaneCore).getHex() : pres.colorB || 0x1a0a28;
    this._castAura(cast, purple, intensity);
    this._auraRing(new Vector3(cast.x, 0.04, cast.z), voidC, 1.6, intensity * 0.9);
    this._motes(cast, purple, 36, intensity);
    this._motes(cast, voidC, 18, intensity * 0.7);
    this._projectileTell(cast, fwd, purple, intensity * 0.85);
    setTimeout(() => {
      this.deploy('inferno', {
        origin: aim,
        forward: fwd,
        aim,
        intensity: intensity * 0.7,
        color: purple
      });
      this._burst(aim, voidC, 20, 3.5, intensity * 0.8);
    }, 220);
  }

  /**
   * Bending combat patterns (poison water / fire bullets / tornado / earth stun).
   * Start/end come from spine attach.
   */
  deployBendingPattern(pattern, pose, opts = {}) {
    const origin = pose.start || pose.origin;
    const aim = pose.end || pose.aim || origin;
    const fwd = pose.forward || new Vector3(0, 0, 1);
    const intensity = pose.intensity ?? 1;
    const P = settings.presentation || {};
    const poison = P.poison || {};
    const variant = opts.variant || null;
    const varCol = variant?.color ? new Color(variant.color).getHex() : null;
    const green = varCol || 0x53e93f;
    const foam = 0x9ed963;
    const sizeMul = variant?.size || 1;
    const aoeM = variant?.aoe > 0 ? variant.aoe : null;

    if (pattern === 'fire_orbit' || pattern === 'fire_bullet') {
      this._deployFireOrbit(origin, aim, fwd, intensity, pattern === 'fire_bullet');
      return;
    }
    if (pattern === 'poison_mist' || pattern === 'poison_trap' || pattern === 'jade_mist') {
      const r =
        aoeM ||
        (pattern === 'poison_trap' ? poison.trapRadius || 2.4 : poison.mistSize || 3.2) * sizeMul;
      this._auraRing(aim.clone().setY(0.05), green, r, intensity);
      this._castAura(aim, foam, intensity * 0.8);
      this.deploy('earth_surge', {
        origin: aim,
        forward: fwd,
        aim,
        intensity: intensity * 0.7,
        color: green,
        size: r * 0.35,
        aoe: r
      });
      if (opts.curve || opts.healTarget) {
        this.attachNatureHealField(opts.healTarget || this.ctx.character, {
          curve: opts.curve,
          duration: 6,
          samples: 4
        });
      }
      return;
    }
    if (pattern === 'nature_vine') {
      const r = aoeM || 2.2 * sizeMul;
      this._projectileTell(origin, fwd, green, intensity);
      this.deploy('earth_surge', {
        origin,
        forward: fwd,
        aim,
        intensity: intensity * 0.55,
        color: green
      });
      this.deploy('earth_surge', {
        origin: aim,
        forward: fwd,
        aim,
        intensity,
        color: green,
        aoe: r
      });
      this._auraRing(aim.clone().setY(0.05), green, r, intensity * 0.85);
      return;
    }
    if (pattern === 'elemental_curve') {
      const col = varCol || 0xb070ff;
      const r = aoeM || 1.6 * sizeMul;
      this._projectileTell(origin, fwd, col, intensity);
      this.deploy('arcane_swirl', {
        origin,
        forward: fwd,
        aim,
        intensity: intensity * 0.7,
        color: col
      });
      this._shockwave(aim.clone().setY(0.05), col, r, intensity);
      this._burst(aim, col, 16, 3.2 * sizeMul, intensity);
      return;
    }
    if (pattern === 'poison_shot') {
      this._projectileTell(origin, fwd, green, intensity);
      this._emitBurst('ember', origin, 10 * intensity, 8, green);
      this.deploy('moon_beam', {
        origin,
        forward: fwd,
        aim,
        intensity: intensity * 0.6,
        color: green
      });
      return;
    }
    if (pattern === 'poison_bomb') {
      const r = poison.bombRadius || 3.6;
      this._burst(aim, green, 22, 4.2, intensity);
      this._nova(aim.clone().setY(0.06), foam, intensity);
      this._auraRing(aim.clone().setY(0.05), green, r, intensity * 0.9);
      return;
    }
    if (pattern === 'poison_proc') {
      const r = poison.procSize || 0.9;
      this._sparks(aim, green, 12, 3, intensity);
      this._auraRing(aim.clone().setY(0.04), foam, r, intensity * 0.6);
      return;
    }
    if (pattern === 'tornado_pull') {
      this.deploy('earth_surge', {
        origin: aim,
        forward: fwd,
        aim,
        intensity: intensity * 0.4,
        color: 0x8af0c9
      });
      this._auraRing(aim.clone().setY(0.06), 0x8af0c9, settings.wind.tornadoRadius || 3.5, intensity);
      this._burst(aim, 0xf4fcff, 16, 5, intensity * 0.7);
      opts.onTornado?.(aim, settings.presentation?.tornado || {});
      return;
    }
    if (pattern === 'earth_stun' || pattern === 'holy_smite') {
      const holy = P.holy || P.earthStun || {};
      const r = holy.radius || 2.8;
      const gold = 0xffe08a;
      this.deploy('moon_beam', {
        origin: aim,
        forward: fwd,
        aim,
        intensity,
        color: gold
      });
      this._shockwave(aim.clone().setY(0.05), gold, r, intensity);
      this._nova(aim.clone().setY(0.08), 0xfff6d8, intensity);
      opts.onHolyStun?.(aim, { radius: r, stunSec: holy.stunSec || 1.2 });
      opts.onEarthStun?.(aim, { radius: r, stunSec: holy.stunSec || 1.2 });
      return;
    }
    if (pattern === 'arrow_path' || pattern === 'arrow_loft') {
      this._projectileTell(origin, fwd, 0x55bbff, intensity);
      this.deploy('getsuga_slash', {
        origin,
        forward: fwd,
        aim,
        intensity: intensity * 0.55,
        color: 0x7dd3fc
      });
      opts.onArrow?.(pattern === 'arrow_loft' ? 'loft' : 'path', { start: origin, end: aim, forward: fwd });
      return;
    }
    if (pattern === 'fire_rain') {
      const rain = P.fireRain || {};
      const n = rain.count ?? 6;
      const rad = rain.radius ?? 4.2;
      const h = rain.dropHeight ?? 8.5;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + i * 0.35;
        const drop = aim.clone().add(new Vector3(Math.cos(a) * rad * 0.45, 0, Math.sin(a) * rad * 0.45));
        const sky = drop.clone().setY(drop.y + h);
        this.deploy('fireball', {
          origin: sky,
          forward: new Vector3(0, -1, 0),
          aim: drop,
          intensity: intensity * 0.7,
          color: 0xffb02e,
          size: rain.size ?? 0.22
        });
        this.deploy('inferno', {
          origin: drop,
          forward: fwd,
          aim: drop,
          intensity: intensity * 0.45,
          color: 0xff6a1e,
          size: 0.28
        });
      }
      this._shockwave(aim.clone().setY(0.05), 0xff6a1e, rad * 0.7, intensity * 0.8);
      return;
    }
    if (pattern === 'shockwave') {
      const sw = P.shockwave || {};
      const el = opts.shockwaveElement || 'holy';
      const hex = sw[el] || sw.holy || '#ffe08a';
      const col = new Color(hex).getHex();
      const r = sw.radius ?? 3.6;
      this._shockwave(aim.clone().setY(0.05), col, r, intensity);
      this._shockwave(aim.clone().setY(0.09), col, r * 0.62, intensity * 0.75);
      this._nova(aim.clone().setY(0.06), col, intensity);
      this._emitBurst('spark', aim.clone().setY(0.4), 22 * intensity, 5, col);
      return;
    }
    if (pattern === 'outline_beam') {
      const src = opts.source || null;
      const dist = origin.distanceTo(aim) || P.mobility?.dashDist || 7.2;
      if (src) {
        this.afterimage(src, origin, fwd, dist, { count: 4, life: 0.55 });
      }
      this.deploy('moon_beam', {
        origin,
        forward: fwd,
        aim,
        intensity: intensity * 0.85,
        color: 0xeafcff
      });
      this._projectileTell(origin, fwd, 0xeafcff, intensity);
      opts.onOutlineDash?.(origin, aim, fwd, dist);
      return;
    }
    if (pattern === 'ranger_invis') {
      const st = P.stealth || {};
      const feet = origin.clone();
      feet.y = Math.min(origin.y, 0.08);
      const green = new Color(st.smokeColor || '#b8efc4').getHex();
      this._smokeBlast(feet, st.smokeSize ?? 1.15, intensity * 0.75, false, green);
      this._auraRing(feet.clone().setY(0.04), green, 1.1, intensity * 0.45);
      opts.onRangerInvis?.(feet);
      return;
    }
    if (pattern === 'smoke_blink') {
      const mob = P.mobility || {};
      const behind = opts.behind || aim.clone().addScaledVector(fwd, -(mob.pullBehindM ?? 1.65));
      this._smokeBlast(origin, mob.smokeSize ?? 1.85, intensity, false);
      this._shockwave(origin.clone().setY(0.05), 0xc8c0b8, 2.2, intensity * 0.7);
      opts.onSmokeBlink?.(origin, behind, fwd);
      // Implode at land — scheduled so hide window reads
      const dest = behind.clone();
      setTimeout(() => {
        this._smokeBlast(dest, (mob.smokeSize ?? 1.85) * 0.85, intensity * 0.9, true);
        this._nova(dest.clone().setY(0.06), 0xd8d0c8, intensity * 0.6);
      }, Math.round((mob.blinkHideSec ?? 0.22) * 1000));
    }
  }

  _deployFireOrbit(origin, aim, fwd, intensity, bulletOnly) {
    const p = settings.presentation || {};
    const max = p.fireOrbitCount ?? 5;
    const col = 0xffb02e;
    if (this._orbit.stock <= 0) {
      this._orbit.stock = max;
      this._orbit.max = max;
      const r = p.fireOrbitRadius ?? 0.85;
      for (let i = 0; i < max; i++) {
        const a = (i / max) * Math.PI * 2;
        const pos = origin.clone().add(new Vector3(Math.cos(a) * r, 1.1, Math.sin(a) * r));
        this._castAura(pos, col, intensity * 0.55);
        this._embers(pos, 8, intensity * 0.45);
      }
      if (!bulletOnly) return;
    }
    this._orbit.stock = Math.max(0, this._orbit.stock - 1);
    this._projectileTell(origin, fwd, col, intensity);
    this.deploy('fireball', {
      origin,
      forward: fwd,
      aim,
      intensity: intensity * 0.75,
      color: col,
      size: p.microBulletSize ?? 0.12
    });
    if (this._orbit.stock === 0) {
      this.deploy('inferno', {
        origin: aim,
        forward: fwd,
        aim,
        intensity: intensity * 0.55,
        color: col,
        size: 0.35
      });
    }
  }

  /** Alt+hotkey sandbox preview (vfxgrudge.puter.site). */
  deployFromHotkey(code) {
    const row = VFX_SANDBOX_SHORTCUTS.find((s) => s.code === code);
    return row?.effectId || null;
  }

  /* ---- primitives (compose beauty) ---- */

  /**
   * Isolated waveanimation.glb mesh + shader fire / lava.
   * Torus fallback until preload finishes.
   */
  _waveMesh(meshId, origin, forward, opts = {}) {
    if (!this.waves) return;
    const pal =
      FIRE_WAVE_PALETTE[opts.palette] ||
      FIRE_WAVE_PALETTE.fire;
    this.waves.spawn(origin, forward || new Vector3(0, 0, 1), {
      meshId,
      kind: opts.kind || 'travel',
      shader: opts.shader,
      size: opts.size ?? 1,
      range: opts.range,
      speed: opts.speed,
      life: opts.life,
      intensity: opts.intensity ?? 1,
      hover: opts.hover,
      heightSample: this.heightSample,
      swingDir: opts.swingDir || null,
      colorCore: opts.colorCore ?? pal.core,
      colorMid: opts.colorMid ?? pal.mid,
      colorEdge: opts.colorEdge ?? pal.edge
    });
  }

  _flash(color, strength = 0.15) {
    this.ctx.flash?.trigger?.(new Color(color), strength, 0.0005);
  }

  _burst(pos, color, count, speed, intensity = 1) {
    const mode =
      color === 0xff6a1e || color === 0xff5510 || color === 0xff6020
        ? BurstMode.FIRE
        : color === 0x9fdcff || color === 0x7ec8ff || color === 0x5fd6ff
          ? BurstMode.WATER
          : color === 0xc4a574 || color === 0x4ecf6a || color === 0x2d6b3a || color === 0x6bbf4a
            ? BurstMode.EARTH
            : color === 0xb070ff || color === 0x1a0a28
              ? BurstMode.AIR
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

  /**
   * Motion-math dodge afterimage: path-spaced trailing copies of the hero.
   * Wind residual palette (cyan additive) — same family as post-cast air trails.
   * @param {import('three').Object3D} source model
   * @param {import('three').Vector3} from
   * @param {import('three').Vector3} dir
   * @param {number} distanceM
   * @param {object} [opts]
   */
  afterimage(source, from, dir, distanceM, opts = {}) {
    if (settings.drc?.afterimage?.enabled === false) return;
    this.afterimages?.setTint(opts.color ?? this._dashTint());
    this.afterimages?.spawnPath(source, from, dir, distanceM, opts);
    // Soft wind-like dust along the path start
    if (from) {
      this._emitBurst('mote', from.clone().setY((from.y || 0) + 0.9), 18, 2.4, 0xc9f0ff);
      this._emitBurst('frost', from.clone().setY((from.y || 0) + 0.4), 10, 1.6, 0xaee6ff);
    }
    if (opts.airTrail !== false) {
      this.airTrail(from, dir, distanceM, {
        source: opts.source || 'dash',
        life: opts.life
      });
    }
  }

  /**
   * Air-bending trail projectile — same silk ribbon as WindAbility / ocean gusts.
   * Used on dash, 2nd jump, backflip hang. sampleWind() is the future AI hook.
   * @param {import('three').Vector3} from
   * @param {import('three').Vector3} dir
   * @param {number} lengthM
   * @param {{ source?: string, life?: number, y?: number }} [opts]
   */
  airTrail(from, dir, lengthM, opts = {}) {
    if (settings.drc?.airTrail?.enabled === false) return false;
    const use = opts.source === 'jump2' || opts.source === 'backflip' || opts.source === 'dash'
      ? opts.source
      : 'dash';
    const preset = trailVariantForUse(use, 'wind');
    const len = lengthM ?? preset?.length ?? settings.drc?.airTrail?.dashLen ?? 3.6;
    const ok = this.oceanWind?.spawnCombatGust?.(from, dir, len, {
      life: opts.life ?? settings.drc?.airTrail?.life ?? 0.52,
      y: opts.y,
      source: opts.source || 'air'
    });
    if (from) {
      this._emitBurst('mote', from.clone().setY((from.y || 0) + 0.75), 12, 2.0, 0xc9f0ff);
    }
    return !!ok;
  }

  /** Wind velocity at a point (m/s). Pathfinding / controller AI later. */
  sampleWind(pos) {
    return this.oceanWind?.sampleWind?.(pos) || null;
  }

  /**
   * Continuous trail while dodge invuln is live.
   * @param {number} dt
   * @param {boolean} active
   * @param {import('three').Object3D|null} source
   * @param {import('three').Vector3|null} worldPos
   * @param {number} [yaw]
   */
  updateDodgeTrail(dt, active, source, worldPos, yaw) {
    if (active) this.afterimages?.setTint(this._dashTint());
    this.afterimages?.updateTrail(dt, active, source, worldPos, yaw);
  }

  /**
   * Dash rim color from the equipped weapon — staff brand / melee steel / gun ember.
   * Falls back to wind cyan. Not a second palette.
   */
  _dashTint() {
    const fallback = settings.drc?.afterimage?.color ?? 0xc9f0ff;
    if (settings.drc?.afterimage?.weaponTint === false) return fallback;
    const w = typeof getEquippedWeapon === 'function' ? getEquippedWeapon() : null;
    if (!w) return fallback;
    const rawEl = w.element || w.abilityElement || w.labElement || '';
    if (rawEl) {
      const pres = presentationFor(rawEl);
      if (pres?.color) return pres.color;
    }
    const wt = String(w.weaponType || w.animPack || '').toUpperCase();
    if (/BOW|LONGBOW/.test(wt)) return 0x8ed89a;
    if (/PISTOL|RIFLE|GUN|FLINT/.test(wt)) return 0xff6a1e;
    if (/DAGGER/.test(wt)) return 0xb8a0ff;
    if (/WAND|STAFF|MAGIC/.test(wt)) return 0xb070ff;
    if (/SWORD|AXE|MACE|HAMMER|SHIELD/.test(wt)) return 0xffe08a;
    return fallback;
  }

  /**
   * Colored vapor (heal yellow · poison green · proc) — ParticleShape.SMOKE.
   * Duration clamped to 6 s (learn_bending_projectile mist).
   */
  puffMist(origin, opts = {}) {
    if (!origin) return;
    const hex =
      typeof opts.color === 'number'
        ? opts.color
        : opts.color
          ? new Color(opts.color).getHex()
          : undefined;
    this._smokeBlast(
      origin,
      opts.size ?? 0.9,
      opts.intensity ?? 1,
      !!opts.inward,
      hex,
      Math.min(6, opts.duration ?? settings.fire?.smokeLifetime ?? 1.2)
    );
  }

  _smokeBlast(pos, sizeM, intensity = 1, inward = false, colorHex, lifeSec) {
    const pack = this._systems.get('smoke');
    if (!pack || !pos) return;
    const n = Math.min(64, Math.round(36 * intensity * (settings.global?.particleCount ?? 1)));
    const tint =
      colorHex != null
        ? colorHex
        : new Color(settings.presentation?.stealth?.smokeColor || '#b8efc4').getHex();
    _c.set(tint);
    _emit.position = pos.clone().setY((pos.y || 0) + sizeM * 0.5);
    _emit.radius = inward ? sizeM * 0.9 : sizeM * 0.5;
    _emit.direction = new Vector3(0, inward ? -0.4 : 1, 0);
    _emit.speed = inward ? 1.1 : 3.6;
    _emit.speedVariance = 0.45;
    _emit.spread = inward ? 2.6 : 1.3;
    _emit.inherit = null;
    _emit.anchor = _emit.position;
    _emit.size = Math.max(0.18, sizeM * 0.28);
    _emit.sizeVariance = 0.4;
    _emit.life = Math.min(
      6,
      lifeSec ?? settings.fire?.smokeLifetime ?? settings.presentation?.mobility?.smokeLife ?? 1.35
    );
    _emit.lifeVariance = 0.35;
    _emit.spin = 1.4;
    _emit.tint = _c;
    _emit.time = frame.uTime?.value ?? 0;
    pack.sys.emit(n, _emit);
    this._emitBurst('dust', pos.clone().setY(0.12), 14 * intensity, inward ? 1.2 : 2.2, tint);
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
