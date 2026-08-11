/**
 * Stylized instanced grass on L0 heightfield (three-stylized patterns).
 *
 * Learns from Steve245270533/three-stylized:
 *  - Instanced blades on generated or external surface
 *  - Wind uniforms (strength / speed / direction)
 *  - Blade height ~ SI (here max ~0.55 m under human 1.8 m)
 *  - Caller-owned height sample — never a second heightmap
 *
 * Does **not** vendor the full three-stylized package; ports the meadow layer
 * pattern onto IslandHeightfield.
 *
 * @see docs/THREE_LAYER_TERRAIN_SSOT.md
 * @see https://github.com/Steve245270533/three-stylized
 */

import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  Vector3
} from 'three';
import { isDryLand, terrainOpts } from './IslandHeightfield.js';
import { WORLD } from '../config/worldScale.js';
import { settings } from '../config/settings.js';

const _m = new Matrix4();
const _q = new Quaternion();
const _p = new Vector3();
const _s = new Vector3();
const _up = new Vector3(0, 1, 0);

function mulberry(seed) {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Simple 3-vert blade geometry (root → tip) for instancing. */
function makeBladeGeo() {
  const geo = new BufferGeometry();
  // Triangle strip: base left, base right, tip
  const pos = new Float32Array([
    -0.5, 0, 0,
    0.5, 0, 0,
    0, 1, 0.02
  ]);
  const uv = new Float32Array([0, 0, 1, 0, 0.5, 1]);
  geo.setAttribute('position', new BufferAttribute(pos, 3));
  geo.setAttribute('uv', new BufferAttribute(uv, 2));
  geo.computeVertexNormals();
  return geo;
}

export class StylizedGrassLayer {
  /**
   * @param {{
   *   scene: import('three').Scene,
   *   heightSample: (x: number, z: number) => number,
   *   islandRadius?: number,
   *   clearRadius?: number,
   *   density?: number,
   *   seed?: number,
   *   bladeMaxHeight?: number,
   *   bladeMinHeight?: number
   * }} opts
   */
  constructor(opts) {
    this.scene = opts.scene;
    this.heightSample = opts.heightSample;
    this.islandRadius = opts.islandRadius ?? WORLD.islandRadius * 0.88;
    this.clearRadius = opts.clearRadius ?? 6;
    this.density = opts.density ?? 28; // blades per unit along ring sampling
    this.seed = opts.seed ?? 401;
    this.bladeMaxHeight = opts.bladeMaxHeight ?? 0.55;
    this.bladeMinHeight = opts.bladeMinHeight ?? 0.22;

    this.group = new Group();
    this.group.name = 'StylizedGrassLayer';
    this.group.userData.terrainLayer = 'L2_vegetation';
    this.scene.add(this.group);

    this._elapsed = 0;
    this._uTime = { value: 0 };
    this._uWind = { value: 0.22 };
    this._uWindDir = { value: new Vector3(0.6, 0, 0.4).normalize() };

    const t = settings.terrain || {};
    const bottom = new Color(t.grassColorBottom || '#3d6b1a');
    const top = new Color(t.grassColorTop || '#a8d44a');

    this.material = new MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.85,
      metalness: 0,
      side: DoubleSide,
      vertexColors: false
    });

    // Wind lean on upper verts (three-stylized-like)
    this.material.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = this._uTime;
      shader.uniforms.uWind = this._uWind;
      shader.uniforms.uWindDir = this._uWindDir;
      shader.uniforms.uColorBottom = { value: bottom };
      shader.uniforms.uColorTop = { value: top };
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
uniform float uTime;
uniform float uWind;
uniform vec3 uWindDir;
varying float vBladeH;`
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
vBladeH = transformed.y;
#ifdef USE_INSTANCING
{
  float h = transformed.y;
  float lean = h * h * uWind;
  float ph = instanceMatrix[3].x * 0.21 + instanceMatrix[3].z * 0.17;
  float wave = sin(uTime * 1.35 + ph) * 0.55 + sin(uTime * 0.7 + ph * 1.7) * 0.45;
  transformed.x += uWindDir.x * lean * wave;
  transformed.z += uWindDir.z * lean * wave;
}
#endif`
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
varying float vBladeH;
uniform vec3 uColorBottom;
uniform vec3 uColorTop;`
        )
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
diffuseColor.rgb = mix(uColorBottom, uColorTop, clamp(vBladeH, 0.0, 1.0));`
        );
    };
    this.material.customProgramCacheKey = () => 'stylized-grass-v1';

    this._buildInstances();
  }

  _buildInstances() {
    const rnd = mulberry(this.seed);
    const positions = [];
    // Disk sample with density (forestoutline / stylized scatter style)
    const area =
      Math.PI *
      (this.islandRadius * this.islandRadius - this.clearRadius * this.clearRadius);
    const target = Math.min(12000, Math.max(200, Math.floor(area * this.density * 0.08)));
    let guard = 0;
    while (positions.length < target && guard++ < target * 40) {
      const ang = rnd() * Math.PI * 2;
      const r =
        this.clearRadius +
        rnd() * Math.max(1, this.islandRadius - this.clearRadius);
      const x = Math.cos(ang) * r;
      const z = Math.sin(ang) * r;
      if (!isDryLand(x, z, terrainOpts(), 0.06)) continue;
      const y = this.heightSample(x, z);
      const h =
        this.bladeMinHeight +
        rnd() * (this.bladeMaxHeight - this.bladeMinHeight);
      const yaw = rnd() * Math.PI * 2;
      const w = 0.04 + rnd() * 0.08;
      positions.push({ x, y, z, h, yaw, w });
    }

    this.count = positions.length;
    const geo = makeBladeGeo();
    this.mesh = new InstancedMesh(geo, this.material, Math.max(1, this.count));
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    this.mesh.name = 'StylizedGrassBlades';

    for (let i = 0; i < this.count; i++) {
      const p = positions[i];
      _p.set(p.x, p.y, p.z);
      _q.setFromAxisAngle(_up, p.yaw);
      _s.set(p.w, p.h, p.w);
      _m.compose(_p, _q, _s);
      this.mesh.setMatrixAt(i, _m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.count = this.count;
    this.group.add(this.mesh);
  }

  /**
   * @param {number} dt
   * @param {number} [windStrength]
   */
  update(dt, windStrength) {
    this._elapsed = (this._elapsed || 0) + dt;
    this._uTime.value = this._elapsed;
    if (windStrength != null) this._uWind.value = windStrength;
    else {
      const w = settings.terrain?.grassWind ?? 0.22;
      this._uWind.value = w;
    }
  }

  /**
   * Sync sun for future lighting uniforms (API parity with three-stylized).
   * @param {import('three').DirectionalLight} [light]
   */
  syncDirectionalLight(light) {
    if (!light?.position) return;
    this._uWindDir.value
      .set(light.position.x, 0, light.position.z)
      .normalize();
    if (this._uWindDir.value.lengthSq() < 1e-6) {
      this._uWindDir.value.set(0.6, 0, 0.4).normalize();
    }
  }

  dispose() {
    this.mesh?.geometry?.dispose?.();
    this.material?.dispose?.();
    this.group.removeFromParent();
  }
}
