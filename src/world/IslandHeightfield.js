/**
 * Island heightfield SSOT — land terrain + water layer (Casting lab).
 *
 * Patterns learned (ported, not forked engines):
 *  - snakey-locomotion `heightAt` — FBM rolling + medium + micro (CPU = mesh = feet)
 *  - three-stylized Terrain — warped FBM, dirt/meadow, SI cell density
 *  - three.js Rapier terrain example — Float32 heights → heightfield collider
 *
 * **One height source** for mesh, Rapier, foot IK, harvest Y, path aim.
 * **Water** is a second layer: StageWater.sampleHeight outside the pad;
 * land height fades to water at shore (no cliff at edge).
 *
 * SI: 1 unit = 1 m; island radius from WORLD; height amp modest (≤ ~1.2 m hills).
 *
 * @see docs/ISLAND_STAGE_SSOT.md · grudge-rapier · worldScale.js
 */

import {
  BufferAttribute,
  Color,
  Float32BufferAttribute,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  Vector3
} from 'three';
import { WORLD } from '../config/worldScale.js';
import { settings } from '../config/settings.js';
import { getColor } from '../utils/color.js';
import { LAYER } from '../core/Layers.js';

function hash(x, z, seed) {
  const v = Math.sin(x * 127.1 + z * 311.7 + seed * 74.7) * 43758.5453123;
  return v - Math.floor(v);
}

function valueNoise(x, z, seed) {
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const tx = x - x0;
  const tz = z - z0;
  const sx = tx * tx * (3 - 2 * tx);
  const sz = tz * tz * (3 - 2 * tz);
  const a = hash(x0, z0, seed);
  const b = hash(x0 + 1, z0, seed);
  const c = hash(x0, z0 + 1, seed);
  const d = hash(x0 + 1, z0 + 1, seed);
  return (
    a * (1 - sx) * (1 - sz) +
    b * sx * (1 - sz) +
    c * (1 - sx) * sz +
    d * sx * sz
  );
}

function fbm(x, z, seed, octaves = 4) {
  let total = 0;
  let amp = 0.5;
  let norm = 0;
  let freq = 1;
  for (let o = 0; o < octaves; o++) {
    total += valueNoise(x * freq, z * freq, seed + o * 101) * amp;
    norm += amp;
    freq *= 2.03;
    amp *= 0.5;
  }
  return total / Math.max(1e-6, norm);
}

function smooth01(v, e0, e1) {
  const t = Math.min(1, Math.max(0, (v - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

/**
 * Terrain knobs (settings.terrain overrides when present).
 */
export function terrainOpts() {
  const t = settings.terrain || {};
  return {
    seed: t.seed ?? 17,
    /** Peak hill height on pad interior (m) — keep modest for SI human yardstick */
    amp: t.amp ?? 0.85,
    /** Segments for mesh (higher = smoother) */
    segments: t.segments ?? 96,
    /** Heightfield grid resolution (verts per side) for Rapier */
    grid: t.grid ?? 65,
    /** Shore blend width (m) inside islandRadius */
    shoreBand: t.shoreBand ?? WORLD.shoreBand ?? 4.5,
    islandRadius: t.islandRadius ?? WORLD.islandRadius,
    waterY: t.waterY ?? WORLD.waterY ?? -0.04,
    /** Flat pad radius (spawn / path cast comfort) before hills rise */
    flatCore: t.flatCore ?? 8
  };
}

/**
 * Exact CPU land height at world XZ (metres). Same function as mesh bake.
 * Returns waterY outside island (ocean floor for swimming / board — visual water separate).
 * @param {number} x
 * @param {number} z
 * @param {ReturnType<typeof terrainOpts>} [opts]
 */
export function heightAt(x, z, opts = terrainOpts()) {
  const r = Math.hypot(x, z);
  const pad = opts.islandRadius;
  const waterY = opts.waterY;
  if (r >= pad) return waterY;

  // Snakey-style multi-band FBM (scaled down for lab SI)
  const rolling = (fbm(x * 0.012 + 13.7, z * 0.012 + 71.3, opts.seed, 3) - 0.5) * 2.0;
  const medium = (fbm(x * 0.05 + 3.1, z * 0.05 + 9.4, opts.seed + 7, 3) - 0.5) * 0.55;
  const micro = (fbm(x * 0.22, z * 0.22, opts.seed + 13, 2) - 0.5) * 0.12;
  let h = (rolling + medium + micro) * opts.amp;

  // Flat core for spawn / combat pad (smooth rise outward)
  const core = smooth01(r, opts.flatCore * 0.65, opts.flatCore * 1.35);
  h *= core;

  // Shore: blend land height down to waterY so feet walk into sea gently
  const shoreInner = Math.max(0, pad - opts.shoreBand);
  const shore = smooth01(r, shoreInner, pad);
  h = h * (1 - shore) + waterY * shore;

  return h;
}

/**
 * True if (x,z) is dry land (above water with margin).
 */
export function isDryLand(x, z, opts = terrainOpts(), margin = 0.04) {
  return heightAt(x, z, opts) > (opts.waterY ?? 0) + margin;
}

/**
 * Bilinear sample from a pre-baked height grid (matches Rapier heightfield).
 * @param {Float32Array} heights  (n+1)*(n+1) column-major? we use row-major j*stride+i
 * @param {number} n  segments (ncols = nrows = n)
 * @param {number} size  full extent metres
 * @param {number} x
 * @param {number} z
 */
export function heightAtFromGrid(heights, n, size, x, z) {
  const verts = n + 1;
  const half = size * 0.5;
  const u = (x + half) / size;
  const v = (z + half) / size;
  if (u < 0 || u > 1 || v < 0 || v > 1) return terrainOpts().waterY;
  const fx = u * n;
  const fz = v * n;
  const i0 = Math.floor(fx);
  const j0 = Math.floor(fz);
  const i1 = Math.min(n, i0 + 1);
  const j1 = Math.min(n, j0 + 1);
  const tx = fx - i0;
  const tz = fz - j0;
  const h00 = heights[j0 * verts + i0];
  const h10 = heights[j0 * verts + i1];
  const h01 = heights[j1 * verts + i0];
  const h11 = heights[j1 * verts + i1];
  const hx0 = h00 * (1 - tx) + h10 * tx;
  const hx1 = h01 * (1 - tx) + h11 * tx;
  return hx0 * (1 - tz) + hx1 * tz;
}

/**
 * Bake Float32 height grid for Rapier + mesh.
 * @returns {{ heights: Float32Array, n: number, size: number, verts: number }}
 */
export function bakeHeightGrid(opts = terrainOpts()) {
  const n = Math.max(8, (opts.grid | 0) - 1); // segments
  const verts = n + 1;
  const size = opts.islandRadius * 2.15; // slightly past shore for collider
  const half = size * 0.5;
  const heights = new Float32Array(verts * verts);
  for (let j = 0; j < verts; j++) {
    for (let i = 0; i < verts; i++) {
      const x = -half + (i / n) * size;
      const z = -half + (j / n) * size;
      heights[j * verts + i] = heightAt(x, z, opts);
    }
  }
  return { heights, n, size, verts };
}

/**
 * Visual + sample terrain mesh for the island pad.
 */
export class IslandHeightfield {
  constructor(opts = {}) {
    this.opts = { ...terrainOpts(), ...opts };
    const baked = bakeHeightGrid(this.opts);
    this.heights = baked.heights;
    this.n = baked.n;
    this.size = baked.size;
    this.verts = baked.verts;

    const segs = this.opts.segments;
    const geo = new PlaneGeometry(this.size, this.size, segs, segs);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    /**
     * Lab-readable meadow — NEVER use environment.floorColor (#14181d-class void).
     * Dark stage slab color is for Ground dissolve only; island must read as grass/dirt
     * or the whole playfield is pitch black against fog/backdrop (live bug 2026-08).
     */
    const t = settings.terrain || {};
    const meadow = getColor(t.meadowColor || '#3f6b3a').clone();
    const shore = getColor(t.shoreColor || settings.environment?.shoreColor || '#8a7355').clone();
    const dirt = getColor(t.dirtColor || '#6f5435').clone();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const h = this.sample(x, z);
      pos.setY(i, h);
      const r = Math.hypot(x, z);
      const shoreAmt = smooth01(r, this.opts.islandRadius - this.opts.shoreBand, this.opts.islandRadius);
      const dirtAmt = fbm(x * 0.27, z * 0.27, this.opts.seed + 3, 3);
      const c = meadow.clone().lerp(dirt, dirtAmt * 0.35 * (1 - shoreAmt)).lerp(shore, shoreAmt * 0.7);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new Float32BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    geo.computeBoundingSphere();

    this.material = new MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.85,
      metalness: 0.0,
      dithering: true,
      // Readable on cinematic stage even if fill light is low
      emissive: new Color(0x1a2e14),
      emissiveIntensity: 0.28
    });
    this.mesh = new Mesh(geo, this.material);
    this.mesh.name = 'IslandHeightfield';
    this.mesh.receiveShadow = true;
    this.mesh.castShadow = false;
    this.mesh.userData.terrain = true;
    this.mesh.userData.heightfield = true;
    // Render LAYER.WORLD (bit 0) — not TERRAIN_LAYER L0–L3 (authoring labels only)
    this.mesh.layers.set(LAYER.WORLD);
  }

  /**
   * Height at world XZ (grid bilinear inside field, formula outside).
   * @param {number} x
   * @param {number} z
   */
  sample(x, z) {
    const half = this.size * 0.5;
    if (x < -half || x > half || z < -half || z > half) {
      return heightAt(x, z, this.opts);
    }
    return heightAtFromGrid(this.heights, this.n, this.size, x, z);
  }

  /**
   * Water surface Y at xz (StageWater should own waves; this is static base).
   */
  waterBaseY() {
    return this.opts.waterY;
  }

  /** Data for PhysicsWorld.addHeightfield */
  rapierDesc() {
    // Rapier expects nrows/ncols cells → heights length (nrows+1)*(ncols+1)
    // column-major in some versions; fleet uses row-major j*verts+i matching threejs example
    return {
      nrows: this.n,
      ncols: this.n,
      heights: this.heights,
      scale: { x: this.size, y: 1, z: this.size }
    };
  }

  dispose() {
    this.mesh.geometry?.dispose?.();
    this.material?.dispose?.();
  }
}
