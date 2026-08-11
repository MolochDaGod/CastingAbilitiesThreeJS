/**
 * Deep ocean seafloor at WORLD.oceanFloorY (−50 m by default).
 * Island shelf weld is WORLD.seafloorY (−5 m) — continuous slope is the
 * IslandHeightfield bathymetry; this plane is the deep sand under open sea.
 *
 * Water surface stays at waterY = 0 (StageWater only).
 */
import {
  Mesh,
  PlaneGeometry,
  MeshStandardMaterial,
  Color,
  RepeatWrapping,
  TextureLoader,
  CanvasTexture
} from 'three';
import { WORLD } from '../config/worldScale.js';
import { LAYER } from '../core/Layers.js';

function makeSandTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#8a6e48';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 4000; i++) {
    const x = Math.random() * 256;
    const y = Math.random() * 256;
    const v = 100 + Math.random() * 70;
    ctx.fillStyle = `rgb(${v},${v * 0.78},${v * 0.5})`;
    ctx.fillRect(x, y, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
  const tex = new CanvasTexture(c);
  tex.wrapS = tex.wrapT = RepeatWrapping;
  tex.repeat.set(64, 64);
  tex.needsUpdate = true;
  return tex;
}

export class Seafloor {
  constructor() {
    const size = WORLD.waterSize * 1.25;
    // Deep ocean floor — island heightfield handles −5 m shelf + slope
    const y = WORLD.oceanFloorY ?? WORLD.seafloorY ?? -50;
    const sand = new Color(WORLD.seafloorColor || WORLD.sandColor || '#8a7350');

    this.material = new MeshStandardMaterial({
      color: sand,
      map: makeSandTexture(),
      roughness: 0.97,
      metalness: 0.0,
      dithering: true
    });

    // Slight tessellation so fog/lighting doesn't read as infinite flat plastic
    const segs = 8;
    this.mesh = new Mesh(new PlaneGeometry(size, size, segs, segs), this.material);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.y = y;
    this.mesh.name = 'Seafloor';
    this.mesh.receiveShadow = true;
    this.mesh.castShadow = false;
    this.mesh.layers.set(LAYER.WORLD);
    this.mesh.renderOrder = -3;
    this.mesh.userData.seafloor = true;
    this.mesh.userData.oceanFloorY = y;
    this.mesh.userData.shelfY = WORLD.seafloorY ?? -5;
    this.group = this.mesh;

    this._tryLoadMap([
      'https://assets.grudge-studio.com/textures/terrain/sand_albedo.jpg',
      'https://assets.grudge-studio.com/textures/ground/sand.jpg'
    ]);
  }

  _tryLoadMap(urls) {
    const loader = new TextureLoader();
    loader.setCrossOrigin('anonymous');
    let i = 0;
    const next = () => {
      if (i >= urls.length) return;
      const url = urls[i++];
      loader.load(
        url,
        (tex) => {
          tex.wrapS = tex.wrapT = RepeatWrapping;
          tex.repeat.set(48, 48);
          tex.colorSpace = 'srgb';
          this.material.map = tex;
          this.material.needsUpdate = true;
          console.info('[Seafloor] sand map', url, 'y=', this.mesh.position.y);
        },
        undefined,
        () => next()
      );
    };
    next();
  }

  dispose() {
    this.mesh.geometry?.dispose?.();
    this.material.map?.dispose?.();
    this.material.dispose?.();
  }
}
