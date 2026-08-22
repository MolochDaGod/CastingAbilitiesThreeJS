import { Group, Mesh, Quaternion, TorusGeometry, Vector3 } from 'three';
import { LAYER, setLayerRecursive } from '../core/Layers.js';
import { SlashWaveMaterial } from '../materials/SlashWaveMaterial.js';
import { LavaWaveMaterial } from '../materials/LavaWaveMaterial.js';
import { disposeMaterial } from '../utils/dispose.js';
import { clamp } from '../utils/math.js';
import { settings } from '../config/settings.js';
import {
  fireWaveById,
  fireWaveGeo,
  preloadFireWaves
} from '../vfx/fireWaveVfx.js';

const _travel = new Vector3();
const _swing = new Vector3();
const _right = new Vector3();
const _up = new Vector3();
const _worldUp = new Vector3(0, 1, 0);
const _z = new Vector3(0, 0, 1);
const _qAlign = new Quaternion();
const _qRoll = new Quaternion();
const _assist = { travel: new Vector3(), origin: new Vector3(), hover: 1.1 };

/**
 * Torus lives in XY (belly +Y, opening −Y, tips ±X).
 * Rx+Rz map that to: belly +Z (enemy), opening −Z (player), tips ±Y (swing).
 */
function poseBowMesh(mesh) {
  mesh.rotation.x = Math.PI / 2;
  mesh.rotation.z = Math.PI / 2;
  // Pull the string (tips) back to the spawn so the belly leads at the enemy.
  mesh.position.z = 0.55;
}

/** Shared bow geos — one GPU copy, many shots. */
let _bowGeo = null;
let _glowGeo = null;

function geos() {
  if (!_bowGeo) {
    // ~243° C — deep enough that both tips sit behind the belly.
    _bowGeo = new TorusGeometry(0.78, 0.065, 8, 48, Math.PI * 1.35);
    _glowGeo = new TorusGeometry(0.78, 0.12, 8, 40, Math.PI * 1.35);
  }
  return { bow: _bowGeo, glow: _glowGeo };
}

/**
 * Sample L0 land height (same callback as linear skillshots / FootIK).
 * @param {(x:number,z:number)=>number|null|undefined} [sample]
 */
export function landY(sample, x, z, fallback = 0) {
  if (typeof sample !== 'function') return fallback;
  const y = sample(x, z);
  return Number.isFinite(y) ? y : fallback;
}

/**
 * Linear-assist a blade residual so it can still deal damage.
 *
 * Travel heading = weapon-blade XZ (not body facing). If the blade points
 * sky/dirt (no usable XZ), fall back to the swing's XZ. Hover is tip height
 * above terrain, clamped to a human hit band. Path Y follows heightSample
 * so hills do not bury the wave and valleys do not leave it in the air.
 *
 * @param {import('three').Vector3} bladeDir  grip→tip / weapon forward
 * @param {import('three').Vector3|null} swingDir  recent tip-trail motion
 * @param {import('three').Vector3} tip  world tip (+ beyond)
 * @param {(x:number,z:number)=>number|null|undefined} [heightSample]
 * @param {{ travel: import('three').Vector3, origin: import('three').Vector3, hover: number }} out
 */
export function assistBladeLinear(bladeDir, swingDir, tip, heightSample, out) {
  const r = settings.residual || {};
  const hoverMin = r.hitHoverMin ?? 0.75;
  const hoverMax = r.hitHoverMax ?? 1.7;
  const minXz = 0.18;

  out.travel.set(bladeDir.x, 0, bladeDir.z);
  if (out.travel.lengthSq() < minXz * minXz && swingDir && swingDir.lengthSq() > 1e-8) {
    out.travel.set(swingDir.x, 0, swingDir.z);
  }
  if (out.travel.lengthSq() < 1e-8) out.travel.set(0, 0, 1);
  else out.travel.normalize();

  const gy = landY(heightSample, tip.x, tip.z, 0);
  out.hover = clamp(tip.y - gy, hoverMin, hoverMax);
  out.origin.set(tip.x, gy + out.hover, tip.z);
  return out;
}

/**
 * Classic RPG melee residual: crescent projectile from the blade.
 * Travel is **linear-assisted** on terrain (blade XZ + heightfield hover).
 * Roll matches the swing plane. Physics slug stays on SkillProjectileSystem.
 */
export class SlashWaveSystem {
  /**
   * @param {import('three').Scene} scene
   */
  constructor(scene) {
    this.scene = scene;
    this.group = new Group();
    this.group.name = 'SlashWaveResidual';
    scene.add(this.group);
    /** @type {object[]} */
    this.active = [];
    this._preload = null;
  }

  /**
   * Warm isolated waveanimation.glb geos. Torus remains fallback.
   * @param {{ loadGLTF?: Function }|null} [assets]
   */
  preload(assets) {
    if (!this._preload) this._preload = preloadFireWaves(assets).catch(() => null);
    return this._preload;
  }

  /**
   * @param {import('three').Vector3} origin  tip + beyond-blade
   * @param {import('three').Vector3} travelDir  blade vector (assisted inside)
   * @param {{
   *   swingDir?: import('three').Vector3,
   *   range?: number,
   *   speed?: number,
   *   size?: number,
   *   intensity?: number,
   *   hover?: number,
   *   heightSample?: (x:number,z:number)=>number|null,
   *   colorCore?: number|string,
   *   colorMid?: number|string,
   *   colorEdge?: number|string
   * }} [opts]
   */
  spawn(origin, travelDir, opts = {}) {
    const kind = opts.kind || fireWaveById(opts.meshId)?.role || 'travel';
    const sample = opts.heightSample;
    const groundKind = kind === 'aoe' || kind === 'impact';
    let hover = opts.hover ?? (groundKind ? 0.04 : 1.1);

    if (groundKind) {
      _travel.set(0, 0, 0);
    } else if (settings.residual?.terrainAssist !== false && travelDir) {
      const assisted = assistBladeLinear(
        travelDir,
        opts.swingDir || null,
        origin,
        sample,
        _assist
      );
      _travel.copy(assisted.travel);
      origin = assisted.origin;
      hover = assisted.hover;
    } else {
      _travel.copy(travelDir || _z);
      _travel.y = 0;
      if (_travel.lengthSq() < 1e-6) _travel.set(0, 0, 1);
      else _travel.normalize();
    }

    if (opts.swingDir && opts.swingDir.lengthSq() > 1e-6) {
      _swing.copy(opts.swingDir);
    } else {
      _swing.set(0, 1, 0);
    }

    const { root, mats, usedGlb } = this._makeBow(opts, kind);
    if (groundKind) {
      root.rotation.set(0, 0, 0);
    } else if (usedGlb) {
      root.rotation.set(0, Math.atan2(_travel.x, _travel.z), 0);
    } else {
      orientSlash(root, origin, _travel, _swing);
    }

    const gy = landY(sample, origin.x, origin.z, origin.y);
    if (usedGlb && !groundKind && opts.hover == null) hover = 0.08;
    if (groundKind || usedGlb) {
      root.position.set(origin.x, gy + hover, origin.z);
    } else {
      root.position.copy(origin);
    }

    const size = opts.size ?? (kind === 'impact' ? 0.7 : kind === 'aoe' ? 1.15 : 0.9);
    const range = groundKind ? 0 : Math.max(0.8, opts.range ?? 3.2);
    const speed = groundKind ? 0 : Math.max(4, opts.speed ?? 14);
    const life =
      opts.life ??
      (kind === 'impact' ? 0.42 : kind === 'aoe' ? 0.88 : range / Math.max(4, speed) + 0.06);

    const size0 = size * (kind === 'aoe' ? 0.38 : kind === 'impact' ? 0.45 : 0.72);
    const size1 = size * (kind === 'aoe' ? 1.15 : kind === 'impact' ? 1.22 : 1.05);
    root.scale.setScalar(size0);
    this.group.add(root);

    const shot = {
      root,
      mats,
      travel: _travel.clone(),
      speed,
      range,
      traveled: 0,
      age: 0,
      life,
      size0,
      size1,
      intensity: opts.intensity ?? 1,
      hover,
      heightSample: sample || null,
      kind
    };
    this.active.push(shot);
    return shot;
  }

  /** @param {number} dt */
  update(dt) {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const s = this.active[i];
      s.age += dt;
      const step = s.speed * dt;
      s.traveled += step;
      s.root.position.addScaledVector(s.travel, step);
      if (s.heightSample) {
        const gy = landY(s.heightSample, s.root.position.x, s.root.position.z, s.root.position.y - s.hover);
        s.root.position.y = gy + s.hover;
      }

      const u = s.range > 1e-4 ? Math.min(1, s.traveled / s.range) : Math.min(1, s.age / Math.max(0.05, s.life));
      const grow = s.size0 + (s.size1 - s.size0) * Math.min(1, s.age / Math.max(0.1, s.life * 0.38));
      s.root.scale.setScalar(grow);

      const fade = u > 0.72 ? 1 - (u - 0.72) / 0.28 : 1;
      const pulse = 0.85 + 0.15 * Math.sin(s.age * 16);
      for (const mat of s.mats) mat.sync(s.age, fade * s.intensity, pulse);

      if ((s.range > 1e-4 && s.traveled >= s.range) || s.age >= s.life) {
        this.group.remove(s.root);
        for (const mat of s.mats) disposeMaterial(mat);
        this.active.splice(i, 1);
      }
    }
  }

  _makeBow(opts, kind = 'travel') {
    const def = fireWaveById(opts.meshId);
    const geo = def ? fireWaveGeo(def.id) : null;
    const shader = opts.shader || def?.shader || 'fire';
    const coreCol = opts.colorCore ?? 0xfff1c2;
    const midCol = opts.colorMid ?? 0xff4a14;
    const edgeCol = opts.colorEdge ?? 0x7a0500;
    const makeMat = () => {
      const mat = shader === 'lava' ? new LavaWaveMaterial() : new SlashWaveMaterial();
      mat.setColors(coreCol, midCol, edgeCol);
      return mat;
    };

    if (geo) {
      const matA = makeMat();
      const matB = makeMat();
      matB.uniforms.uOpacity.value = 0.3;
      const root = new Group();
      root.name = def.id;
      const core = new Mesh(geo, matA);
      const glow = new Mesh(geo, matB);
      glow.scale.setScalar(1.07);
      core.frustumCulled = false;
      glow.frustumCulled = false;
      core.renderOrder = 18;
      glow.renderOrder = 17;
      root.add(glow, core);
      setLayerRecursive(root, LAYER.VFX);
      return { root, mats: [matA, matB], usedGlb: true };
    }

    const { bow, glow } = geos();
    const matA = makeMat();
    const matB = makeMat();
    matB.uniforms.uOpacity.value = 0.32;

    const root = new Group();
    root.name = def?.id || 'slashWave';
    const bowMesh = new Mesh(bow, matA);
    const glowMesh = new Mesh(glow, matB);
    if (kind === 'aoe' || kind === 'impact') {
      bowMesh.rotation.x = Math.PI / 2;
      glowMesh.rotation.x = Math.PI / 2;
    } else {
      poseBowMesh(bowMesh);
      poseBowMesh(glowMesh);
    }
    bowMesh.frustumCulled = false;
    glowMesh.frustumCulled = false;
    bowMesh.renderOrder = 18;
    glowMesh.renderOrder = 17;
    root.add(glowMesh, bowMesh);
    setLayerRecursive(root, LAYER.VFX);
    return { root, mats: [matA, matB], usedGlb: false };
  }

  dispose() {
    for (const s of this.active) {
      this.group.remove(s.root);
      for (const mat of s.mats) disposeMaterial(mat);
    }
    this.active.length = 0;
    this.scene.remove(this.group);
  }
}

/**
 * +Z = travel (arc points at the enemy). +Y = swing.
 * Bow tips sit on −Z (back at the player).
 * @param {import('three').Object3D} root
 * @param {import('three').Vector3} origin
 * @param {import('three').Vector3} travel unit
 * @param {import('three').Vector3} swing
 */
export function orientSlash(root, origin, travel, swing) {
  _qAlign.setFromUnitVectors(_z, travel);

  _swing.copy(swing);
  _swing.addScaledVector(travel, -_swing.dot(travel));
  if (_swing.lengthSq() < 1e-6) _swing.copy(_worldUp);
  _swing.normalize();

  _up.copy(_worldUp);
  _up.addScaledVector(travel, -_up.dot(travel));
  if (_up.lengthSq() < 1e-6) _up.set(1, 0, 0);
  else _up.normalize();

  _right.crossVectors(_up, travel).normalize();
  const x = _swing.dot(_right);
  const y = _swing.dot(_up);
  const roll = Math.atan2(x, y);
  _qRoll.setFromAxisAngle(travel, roll);
  root.quaternion.copy(_qRoll).multiply(_qAlign);
}

/**
 * Swing vector from recent tip samples (blade path at apex).
 * @param {import('three').Vector3[]} points
 * @param {import('three').Vector3} fallback
 */
export function swingFromTipPoints(points, fallback) {
  if (!points || points.length < 2) return fallback.clone();
  const n = points.length;
  const a = points[Math.max(0, n - 7)];
  const b = points[n - 1];
  _swing.copy(b).sub(a);
  if (_swing.lengthSq() < 1e-6) return fallback.clone();
  return _swing.clone();
}
