/**
 * Ocean seafloor at WORLD.seafloorY (−5 m by default).
 * Sand plane under StageWater (waterY = 0). One floor — no snow / white default mats.
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
  ctx.fillStyle = '#b8955c';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 4000; i++) {
    const x = Math.random() * 256;
    const y = Math.random() * 256;
    const v = 140 + Math.random() * 80;
    ctx.fillStyle = `rgb(${v},${v * 0.82},${v * 0.55})`;
    ctx.fillRect(x, y, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
  const tex = new CanvasTexture(c);
  tex.wrapS = tex.wrapT = RepeatWrapping;
  tex.repeat.set(48, 48);
  tex.needsUpdate = true;
  return tex;
}

export class Seafloor {
  constructor() {
    const size = WORLD.waterSize * 1.15;
    const y = WORLD.seafloorY ?? -5;
    const sand = new Color(WORLD.seafloorColor || WORLD.sandColor || '#8a7350');

    this.material = new MeshStandardMaterial({
      color: sand,
      map: makeSandTexture(),
      roughness: 0.96,
      metalness: 0.0,
      dithering: true
    });

    this.mesh = new Mesh(new PlaneGeometry(size, size, 1, 1), this.material);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.y = y;
    this.mesh.name = 'Seafloor';
    this.mesh.receiveShadow = true;
    this.mesh.castShadow = false;
    this.mesh.layers.set(LAYER.WORLD);
    this.mesh.renderOrder = -2;
    this.mesh.userData.seafloor = true;
    this.group = this.mesh;

    // Prefer CDN sand albedo when available
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
          tex.repeat.set(32, 32);
          tex.colorSpace = 'srgb';
          this.material.map = tex;
          this.material.needsUpdate = true;
          console.info('[Seafloor] sand map', url);
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
