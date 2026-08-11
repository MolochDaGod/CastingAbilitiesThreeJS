import { Box3, Group, Vector3 } from 'three';
import { clone as skeletonClone } from 'three/addons/utils/SkeletonUtils.js';
import { WORLD } from '../config/worldScale.js';
import { LAYER } from '../core/Layers.js';

/**
 * Horizon island shells around the lab pad — CDN production mesh
 * (assets.grudge-studio.com/models/worlds/small_island.glb) for open-sea read.
 * Dev Island pad + harvest nodes stay SSOT (DevIslandHarvest).
 */
const ISLAND_CDN =
  'https://assets.grudge-studio.com/models/worlds/small_island.glb';

export class OpenSeaShells {
  /**
   * @param {object} opts
   * @param {import('three').Scene} opts.scene
   * @param {import('../loaders/AssetLoader.js').AssetLoader} opts.assets
   */
  constructor(opts) {
    this.scene = opts.scene;
    this.assets = opts.assets;
    this.group = new Group();
    this.group.name = 'OpenSeaShells';
    this.scene.add(this.group);
  }

  async init() {
    let gltf;
    try {
      gltf = await this.assets.loadGLTF(ISLAND_CDN);
    } catch (err) {
      console.warn('[OpenSeaShells] island CDN fail', err);
      return this;
    }
    const src = gltf.scene || gltf.scenes?.[0];
    if (!src) return this;

    const R = WORLD.islandRadius;
    const placements = [
      { a: 0.4, d: R * 2.4, s: 18 },
      { a: 1.8, d: R * 2.9, s: 22 },
      { a: 3.4, d: R * 2.55, s: 16 },
      { a: 4.9, d: R * 3.2, s: 28 },
      { a: 5.7, d: R * 2.7, s: 14 }
    ];

    const boxTmp = new Box3();
    const size = new Vector3();

    for (const p of placements) {
      const island = skeletonClone(src);
      island.name = 'HorizonIsland';
      island.traverse((o) => {
        if (o.isMesh) {
          o.castShadow = true;
          o.receiveShadow = true;
          o.layers.set(LAYER.WORLD);
        }
      });
      island.updateMatrixWorld(true);
      boxTmp.setFromObject(island);
      boxTmp.getSize(size);
      const max = Math.max(size.x, size.y, size.z, 1e-3);
      const s = p.s / max;
      island.scale.setScalar(s);
      island.updateMatrixWorld(true);
      boxTmp.setFromObject(island);
      island.position.set(
        Math.sin(p.a) * p.d,
        -boxTmp.min.y * 0.12 - 0.4,
        Math.cos(p.a) * p.d
      );
      island.rotation.y = p.a + 0.8;
      this.group.add(island);
    }
    console.info(`[OpenSeaShells] ${placements.length} horizon islands`);
    return this;
  }

  dispose() {
    this.group.removeFromParent();
  }
}
