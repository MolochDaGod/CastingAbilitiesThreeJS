import { Box3, Group, Vector3, MeshStandardMaterial, Color } from 'three';
import { clone as skeletonClone } from 'three/addons/utils/SkeletonUtils.js';
import { WORLD } from '../config/worldScale.js';
import { LAYER } from '../core/Layers.js';

/**
 * Horizon island shells around the lab pad.
 * Weld mesh bottoms to WORLD.seafloorY shelf (−5 m); deep ocean is −50 m.
 * Water surface stays at waterY (0). Fix white/snow materials → sand/rock.
 */
const ISLAND_CDN =
  'https://assets.grudge-studio.com/models/worlds/small_island.glb';

const SAND = new Color(WORLD.sandColor || '#c2a86a');
const ROCK = new Color('#6a655c');
const DIRT = new Color('#5c4a32');

function fixIslandMaterials(root) {
  root.traverse((o) => {
    if (!o.isMesh || !o.material) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (let i = 0; i < mats.length; i++) {
      const m = mats[i];
      const hasMap = !!(m.map || m.emissiveMap);
      // White / snow / untextured → sand & rock
      const c = m.color;
      const isWhite =
        c && c.r > 0.85 && c.g > 0.85 && c.b > 0.85;
      const name = String(m.name || o.name || '').toLowerCase();
      const looksSnow = /snow|ice|winter|white/.test(name);
      if (!hasMap || isWhite || looksSnow) {
        const repl = new MeshStandardMaterial({
          color: looksSnow || isWhite ? SAND : ROCK,
          roughness: 0.94,
          metalness: 0.02,
          map: m.map || null,
          normalMap: m.normalMap || null
        });
        if (!repl.map) {
          // tint variation by mesh
          repl.color = o.id % 2 === 0 ? SAND.clone() : DIRT.clone();
        }
        mats[i] = repl;
        m.dispose?.();
      } else {
        // Pull pure white albedo down toward sand
        if (c && c.r > 0.9 && c.g > 0.9 && c.b > 0.9) {
          c.copy(SAND);
        }
        m.roughness = Math.max(m.roughness ?? 0.8, 0.85);
      }
    }
    o.material = Array.isArray(o.material) ? mats : mats[0];
    o.castShadow = true;
    o.receiveShadow = true;
    o.layers.set(LAYER.WORLD);
  });
}

/** Plant so world-space bbox.min.y === seafloorY (weld to ocean floor). */
function plantOnSeafloor(obj, seafloorY) {
  obj.updateMatrixWorld(true);
  const box = new Box3().setFromObject(obj);
  const dy = seafloorY - box.min.y;
  obj.position.y += dy;
  obj.updateMatrixWorld(true);
}

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
    const seafloorY = WORLD.seafloorY ?? -5;
    // Target island diameters (m) — SI, not snow mountains
    const placements = [
      { a: 0.4, d: R * 2.4, diameter: 14 },
      { a: 1.8, d: R * 2.9, diameter: 18 },
      { a: 3.4, d: R * 2.55, diameter: 12 },
      { a: 4.9, d: R * 3.2, diameter: 22 },
      { a: 5.7, d: R * 2.7, diameter: 11 }
    ];

    const boxTmp = new Box3();
    const size = new Vector3();

    for (const p of placements) {
      const island = skeletonClone(src);
      island.name = 'HorizonIsland';
      fixIslandMaterials(island);

      island.updateMatrixWorld(true);
      boxTmp.setFromObject(island);
      boxTmp.getSize(size);
      const maxXZ = Math.max(size.x, size.z, 1e-3);
      // Scale so island XZ diameter matches target (prevents towering snow peaks)
      const s = p.diameter / maxXZ;
      // Cap vertical scale — never taller than ~4 m above seafloor after plant
      island.scale.setScalar(s);
      island.updateMatrixWorld(true);
      boxTmp.setFromObject(island);
      const h = boxTmp.max.y - boxTmp.min.y;
      if (h > 6) {
        island.scale.multiplyScalar(5.5 / h);
      }

      island.position.set(Math.sin(p.a) * p.d, 0, Math.cos(p.a) * p.d);
      island.rotation.y = p.a + 0.8;
      plantOnSeafloor(island, seafloorY);

      this.group.add(island);
    }
    console.info(
      `[OpenSeaShells] ${placements.length} horizon islands welded seafloorY=${seafloorY} waterY=${WORLD.waterY}`
    );
    return this;
  }

  dispose() {
    this.group.removeFromParent();
  }
}
