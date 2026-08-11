import { Raycaster, Vector3, CatmullRomCurve3, MathUtils } from 'three';
import { settings } from '../config/settings.js';
import { EventEmitter } from '../utils/EventEmitter.js';
import { PathTrail } from '../effects/PathTrail.js';
import { projectToTerrain } from '../world/terrainGround.js';

/**
 * Turns a mouse drag into a smooth, castable spline.
 *
 * Pipeline:
 *   pointer NDC → terrain ground (mesh / sample) → jitter-filtered samples
 *   → exponential smoothing → CatmullRomCurve3 → uniform arc-length resample.
 *
 * Ground projection is the same helper as MouseAim — no parallel height math.
 *
 * Emits: `cast` (curve, points, length), `start`, `cancel`.
 */
export class PathDrawer extends EventEmitter {
  constructor(camera) {
    super();
    this.camera = camera;
    this.raycaster = new Raycaster();
    this.raycaster.far = 500;

    /** Raw (filtered) samples on the ground. */
    this.samples = [];
    /** Smoothed + resampled polyline, reused every frame. */
    this.resampled = [];
    this.resampledCount = 0;

    this.trail = new PathTrail(240);
    this.active = false;
    /** performance.now() at begin — hold duration for staff wall/spikes */
    this._holdStart = 0;
    /** Last projected point (AOE place on short cancel) */
    this.lastHit = new Vector3();
    this._combatMinLength = null;
    /** @type {import('../world/terrainGround.js').TerrainGround|null} */
    this.terrain = null;

    this._hit = new Vector3();
    this._smoothed = new Vector3();
    this._tmp = new Vector3();

    // Pre-allocate the resample buffer so drawing never allocates.
    for (let i = 0; i < 320; i++) this.resampled.push(new Vector3());
  }

  /**
   * Same terrain handle as MouseAim (App sets once).
   * @param {import('../world/terrainGround.js').TerrainGround|null} terrain
   */
  setTerrain(terrain) {
    this.terrain = terrain || null;
  }

  /** Combat staff casts allow shorter paths (AOE place). */
  setCombatMinLength(m) {
    this._combatMinLength = Number.isFinite(m) ? m : null;
  }

  get object3D() {
    return this.trail.mesh;
  }

  /** Project pointer onto terrain. @returns {boolean} hit */
  _project(pointer, out) {
    this.raycaster.setFromCamera(pointer, this.camera);
    return projectToTerrain(this.raycaster, out, this.terrain);
  }

  begin(pointer) {
    if (!this._project(pointer, this._hit)) return;
    this.samples.length = 0;
    this._smoothed.copy(this._hit);
    this.samples.push(this._hit.clone());
    this.lastHit.copy(this._hit);
    this.active = true;
    this._holdStart = performance.now();
    this.trail.hide();
    this.emit('start', this._hit);
  }

  move(pointer) {
    if (!this.active) return;
    if (!this._project(pointer, this._hit)) return;

    const input = settings.input;

    // Exponential smoothing removes hand tremor without adding latency.
    this._smoothed.lerp(this._hit, MathUtils.clamp(1 - input.smoothing, 0.05, 1));

    const last = this.samples[this.samples.length - 1];
    if (last && this._smoothed.distanceTo(last) < input.minPointDistance) return;
    if (this.samples.length >= input.maxPoints) return;

    this.samples.push(this._smoothed.clone());
    this.lastHit.copy(this._smoothed);
    this._rebuild();
  }

  end() {
    if (!this.active) return;
    this.active = false;

    const length = this.pathLength();
    const holdSec = this._holdStart ? (performance.now() - this._holdStart) / 1000 : 0;
    const minLen =
      this._combatMinLength != null
        ? this._combatMinLength
        : settings.input.minPathLength;

    // Short stroke / tap: still emit cast when combat min allows AOE place
    if (this.samples.length < 2 || length < minLen) {
      this.trail.hide();
      if (this.samples.length >= 1 && minLen <= 1.2) {
        // Synthetic micro-curve at last hit for AOE placement
        const p = this.lastHit.clone();
        const a = p.clone().add(new Vector3(0.05, 0.2, 0));
        const b = p.clone().add(new Vector3(0, 0.5, 0.05));
        const curve = new CatmullRomCurve3([a, b, p], false, 'catmullrom', 0.5);
        this.emit('cast', curve, [p], 1, Math.max(length, 0.5), holdSec);
      } else {
        this.emit('cancel');
      }
      this.samples.length = 0;
      return;
    }

    const curve = this._buildCurve();
    this.trail.release(); // burn the preview away
    this.emit('cast', curve, this.resampled, this.resampledCount, length, holdSec);
    this.samples.length = 0;
  }

  pathLength() {
    let total = 0;
    for (let i = 1; i < this.samples.length; i++) total += this.samples[i].distanceTo(this.samples[i - 1]);
    return total;
  }

  _buildCurve() {
    // CatmullRom needs at least 2 points; we guarantee 3+ before calling.
    const curve = new CatmullRomCurve3(
      this.samples.map((p) => p.clone()),
      false,
      'catmullrom',
      settings.input.curveTension
    );
    curve.arcLengthDivisions = Math.max(64, this.samples.length * 8);
    return curve;
  }

  /** Resample the current stroke into `this.resampled` for the preview ribbon. */
  _rebuild() {
    if (this.samples.length < 2) return;

    const curve = this._buildCurve();
    const length = curve.getLength();
    const wanted = MathUtils.clamp(Math.round(length * settings.input.samplesPerUnit), 2, this.resampled.length);

    for (let i = 0; i < wanted; i++) {
      curve.getPointAt(i / (wanted - 1), this.resampled[i]);
      this.resampled[i].y = settings.trail.height;
    }
    this.resampledCount = wanted;
    this.trail.setPoints(this.resampled, wanted);
  }

  update(dt) {
    this.trail.update(dt);
  }

  dispose() {
    this.trail.dispose();
    this.clear();
  }
}
