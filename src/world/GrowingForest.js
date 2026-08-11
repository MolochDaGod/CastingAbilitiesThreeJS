/**
 * Growing forest + harvestable trees — forestoutline / snakey trees patterns.
 *
 * - Instanced / grouped trees with growth stages (seed → sapling → mature)
 * - Harvest chops mature trees (tool gate wood/hatchet); respawn regrows over time
 * - Placed on IslandHeightfield.sample for SI feet
 *
 * Does not invent a second harvest engine — feeds DevIslandHarvest-compatible nodes
 * or runs standalone via tryHarvest.
 *
 * @see Desktop forestoutline.html (instanced trees, SI scatter)
 * @see snakey-locomotion trees.ts
 */

import {
  Color,
  ConeGeometry,
  CylinderGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  Vector3
} from 'three';
import { WORLD } from '../config/worldScale.js';
import { heightAt, isDryLand, terrainOpts } from './IslandHeightfield.js';

const _m = new Matrix4();
const _q = new Quaternion();
const _p = new Vector3();
const _s = new Vector3();
const _up = new Vector3(0, 1, 0);

function mulberry(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * @typedef {object} GrowTree
 * @property {number} x
 * @property {number} z
 * @property {number} y
 * @property {number} age  0..1 growth
 * @property {number} growRate  /s
 * @property {number} hp
 * @property {number} maxHp
 * @property {boolean} alive
 * @property {number} respawnAt
 * @property {number} yaw
 * @property {number} scaleBase
 * @property {number} instanceIndex
 */

export class GrowingForest {
  /**
   * @param {{
   *   scene: import('three').Scene,
   *   heightSample?: (x: number, z: number) => number,
   *   count?: number,
   *   islandRadius?: number,
   *   clearRadius?: number,
   *   seed?: number,
   *   onToast?: (s: string) => void
   * }} opts
   */
  constructor(opts) {
    this.scene = opts.scene;
    this.heightSample = opts.heightSample || ((x, z) => heightAt(x, z));
    this.count = opts.count ?? 48;
    this.islandRadius = opts.islandRadius ?? WORLD.islandRadius * 0.92;
    this.clearRadius = opts.clearRadius ?? 10;
    this.seed = opts.seed ?? 1997;
    this.onToast = opts.onToast || (() => {});

    this.group = new Group();
    this.group.name = 'GrowingForest';
    this.scene.add(this.group);

    /** @type {GrowTree[]} */
    this.trees = [];
    this._elapsed = 0;

    // Trunk + crown templates (snakey-style simple SI proportions)
    const trunkGeo = new CylinderGeometry(0.12, 0.28, 1, 6, 1);
    trunkGeo.translate(0, 0.5, 0);
    const crownGeo = new ConeGeometry(0.55, 1.4, 7);
    crownGeo.translate(0, 1.35, 0);

    this.trunkMat = new MeshStandardMaterial({
      color: new Color(0.28, 0.18, 0.1),
      roughness: 1
    });
    this.leafMat = new MeshStandardMaterial({
      color: new Color(0.12, 0.38, 0.14),
      roughness: 0.9
    });
    // Wind sway on leaves (vertex) — mild
    this._uTime = { value: 0 };
    this.leafMat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = this._uTime;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
#ifdef USE_INSTANCING
{
  float ph = instanceMatrix[3].x * 0.13 + instanceMatrix[3].z * 0.17;
  float amt = smoothstep(0.4, 1.2, transformed.y) * 0.06;
  transformed.x += sin(uTime * 1.15 + ph) * amt;
  transformed.z += cos(uTime * 0.95 + ph * 1.2) * amt;
}
#endif`
        );
    };
    this.leafMat.customProgramCacheKey = () => 'grow-forest-leaf-v1';

    this.trunkMesh = new InstancedMesh(trunkGeo, this.trunkMat, this.count);
    this.crownMesh = new InstancedMesh(crownGeo, this.leafMat, this.count);
    this.trunkMesh.castShadow = true;
    this.crownMesh.castShadow = true;
    this.trunkMesh.frustumCulled = false;
    this.crownMesh.frustumCulled = false;
    this.group.add(this.trunkMesh, this.crownMesh);

    this._scatter();
  }

  _scatter() {
    const rnd = mulberry(this.seed);
    const placed = [];
    let guard = 0;
    while (this.trees.length < this.count && guard++ < this.count * 80) {
      const ang = rnd() * Math.PI * 2;
      const r =
        this.clearRadius +
        rnd() * Math.max(2, this.islandRadius - this.clearRadius - 2);
      const x = Math.cos(ang) * r;
      const z = Math.sin(ang) * r;
      if (!isDryLand(x, z, terrainOpts(), 0.08)) continue;
      if (Math.hypot(x, z) < this.clearRadius) continue;
      let ok = true;
      for (const p of placed) {
        if ((p[0] - x) ** 2 + (p[1] - z) ** 2 < 3.2 * 3.2) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      placed.push([x, z]);
      const y = this.heightSample(x, z);
      const idx = this.trees.length;
      this.trees.push({
        x,
        z,
        y,
        age: 0.35 + rnd() * 0.65, // start partially grown
        growRate: 0.02 + rnd() * 0.03,
        hp: 40,
        maxHp: 40,
        alive: true,
        respawnAt: 0,
        yaw: rnd() * Math.PI * 2,
        scaleBase: 0.85 + rnd() * 0.45,
        instanceIndex: idx
      });
    }
    this._writeInstances();
  }

  _writeInstances() {
    for (let i = 0; i < this.count; i++) {
      const t = this.trees[i];
      if (!t || !t.alive || t.age < 0.05) {
        _s.set(0, 0, 0);
        _m.compose(_p.set(0, -100, 0), _q.identity(), _s);
      } else {
        const g = Math.min(1, t.age);
        const s = t.scaleBase * (0.25 + 0.75 * g);
        _p.set(t.x, t.y, t.z);
        _q.setFromAxisAngle(_up, t.yaw);
        _s.set(s, s * (0.7 + 0.3 * g), s);
        _m.compose(_p, _q, _s);
      }
      this.trunkMesh.setMatrixAt(i, _m);
      this.crownMesh.setMatrixAt(i, _m);
    }
    this.trunkMesh.instanceMatrix.needsUpdate = true;
    this.crownMesh.instanceMatrix.needsUpdate = true;
    this.trunkMesh.count = this.trees.length;
    this.crownMesh.count = this.trees.length;
  }

  /**
   * @param {number} dt
   * @param {number} [now] performance.now()/1000 or elapsed
   */
  update(dt, now = this._elapsed) {
    this._elapsed += dt;
    this._uTime.value = this._elapsed;
    let dirty = false;
    for (const t of this.trees) {
      if (!t.alive) {
        if (now >= t.respawnAt) {
          t.alive = true;
          t.age = 0.08;
          t.hp = t.maxHp;
          t.y = this.heightSample(t.x, t.z);
          dirty = true;
        }
        continue;
      }
      if (t.age < 1) {
        t.age = Math.min(1, t.age + t.growRate * dt);
        dirty = true;
      }
    }
    if (dirty) this._writeInstances();
  }

  /**
   * Nearest mature harvestable tree within range.
   * @param {Vector3|{x:number,z:number}} pos
   * @param {number} rangeM
   */
  findNearest(pos, rangeM = 5) {
    let best = null;
    let bestD = rangeM * rangeM;
    for (const t of this.trees) {
      if (!t.alive || t.age < 0.55) continue; // must grow enough
      const d = (t.x - pos.x) ** 2 + (t.z - pos.z) ** 2;
      if (d < bestD) {
        bestD = d;
        best = t;
      }
    }
    return best;
  }

  /**
   * Chop tree — returns loot roll or null.
   * @param {GrowTree} tree
   * @param {number} damage
   */
  damage(tree, damage = 12) {
    if (!tree?.alive) return null;
    tree.hp -= damage;
    if (tree.hp > 0) {
      this.onToast(`Tree · ${Math.ceil(tree.hp)} hp`);
      return { chopped: false, hp: tree.hp };
    }
    tree.alive = false;
    tree.age = 0;
    tree.respawnAt = this._elapsed + 45; // regrow ~45 s
    this._writeInstances();
    this.onToast('Wood harvested · tree will regrow');
    return {
      chopped: true,
      loot: [
        { id: 'wood', label: 'Wood', qty: 2 + ((Math.random() * 3) | 0), icon: '🪵' }
      ]
    };
  }

  dispose() {
    this.group.removeFromParent();
    this.trunkMesh.geometry.dispose();
    this.crownMesh.geometry.dispose();
    this.trunkMat.dispose();
    this.leafMat.dispose();
  }
}
