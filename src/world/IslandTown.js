/**
 * Small river-town style settlement planted ON the play island (heightfield).
 * Not a snow map — warm timber / sand / thatch materials, SI scale.
 * Replaces oversized white/snow GLBs that towered above terrain.
 */
import {
  BoxGeometry,
  ConeGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Color,
  Vector3
} from 'three';
import { WORLD } from '../config/worldScale.js';
import { LAYER } from '../core/Layers.js';

const MATS = {
  timber: () =>
    new MeshStandardMaterial({ color: new Color('#6b4a2e'), roughness: 0.88, metalness: 0.02 }),
  plaster: () =>
    new MeshStandardMaterial({ color: new Color('#c4b49a'), roughness: 0.9, metalness: 0 }),
  thatch: () =>
    new MeshStandardMaterial({ color: new Color('#8a6b3a'), roughness: 0.95, metalness: 0 }),
  stone: () =>
    new MeshStandardMaterial({ color: new Color('#6a6660'), roughness: 0.92, metalness: 0.05 }),
  sand: () =>
    new MeshStandardMaterial({ color: new Color(WORLD.sandColor || '#c2a86a'), roughness: 0.97, metalness: 0 }),
  dock: () =>
    new MeshStandardMaterial({ color: new Color('#4a3828'), roughness: 0.9, metalness: 0 })
};

function house(mats, w, d, h) {
  const g = new Group();
  const body = new Mesh(new BoxGeometry(w, h, d), mats.plaster);
  body.position.y = h * 0.5;
  body.castShadow = body.receiveShadow = true;
  g.add(body);
  const roof = new Mesh(new ConeGeometry(Math.max(w, d) * 0.72, h * 0.55, 4), mats.thatch);
  roof.position.y = h + h * 0.22;
  roof.rotation.y = Math.PI / 4;
  roof.castShadow = true;
  g.add(roof);
  return g;
}

/**
 * @param {{
 *   sampleHeight?: (x:number,z:number)=>number,
 *   islandRadius?: number
 * }} opts
 */
export class IslandTown {
  constructor(opts = {}) {
    this.sampleHeight = opts.sampleHeight || ((x, z) => 0);
    this.islandRadius = opts.islandRadius ?? WORLD.islandRadius;
    this.group = new Group();
    this.group.name = 'IslandTown';
    this._mats = {
      timber: MATS.timber(),
      plaster: MATS.plaster(),
      thatch: MATS.thatch(),
      stone: MATS.stone(),
      sand: MATS.sand(),
      dock: MATS.dock()
    };
  }

  /**
   * Place a compact riverside hamlet on the NE shore of the pad (dry land).
   * Heights come from heightfield so town sits ON terrain, not floating snow slab.
   * No second ground plane, no second water mesh — pier rides WORLD.waterY only.
   */
  build() {
    const R = this.islandRadius;
    // Village center: inland from shore so feet stay dry (on play island)
    const cx = R * 0.38;
    const cz = R * 0.22;
    const baseY = this.sampleHeight(cx, cz);

    // Thin sand plaza flush to terrain (not a tall white slab)
    const plaza = new Mesh(
      new CylinderGeometry(6.5, 6.5, 0.08, 28),
      this._mats.sand
    );
    plaza.position.set(cx, baseY + 0.02, cz);
    plaza.receiveShadow = true;
    plaza.castShadow = false;
    plaza.name = 'town_plaza_sand';
    this.group.add(plaza);

    // Shallow sand creek bed (visual only — not a second water plane)
    const creek = new Mesh(
      new BoxGeometry(1.1, 0.06, 9.5),
      this._mats.sand
    );
    const creekY = this.sampleHeight(cx + 1.2, cz - 1.0);
    creek.position.set(cx + 1.2, creekY + 0.01, cz - 0.5);
    creek.rotation.y = 0.35;
    creek.receiveShadow = true;
    creek.name = 'town_creek_sand';
    this.group.add(creek);

    // Human-scale houses (~1.7–2.3 m eaves) — never towering snow GLBs
    const plots = [
      { x: -2.8, z: -1.8, w: 2.2, d: 1.9, h: 1.85, rot: 0.1 },
      { x: 2.4, z: -1.4, w: 1.9, d: 2.0, h: 1.75, rot: -0.2 },
      { x: -1.2, z: 2.4, w: 2.3, d: 1.85, h: 2.05, rot: 0.35 },
      { x: 2.9, z: 1.9, w: 1.7, d: 1.65, h: 1.65, rot: -0.45 },
      { x: 0.15, z: -3.0, w: 2.6, d: 1.9, h: 1.95, rot: 0.05 }
    ];

    for (const p of plots) {
      const wx = cx + p.x;
      const wz = cz + p.z;
      const y = this.sampleHeight(wx, wz);
      const h = house(this._mats, p.w, p.d, p.h);
      h.position.set(wx, y, wz);
      h.rotation.y = p.rot;
      this.group.add(h);
    }

    // Stone well
    const well = new Mesh(new CylinderGeometry(0.5, 0.58, 0.55, 12), this._mats.stone);
    well.position.set(cx + 0.35, this.sampleHeight(cx + 0.35, cz + 0.15) + 0.28, cz + 0.15);
    well.castShadow = true;
    this.group.add(well);

    // Short pier toward open sea — planks at waterY (0), not seafloor (−5)
    const pier = new Group();
    pier.name = 'town_pier';
    const dockY = WORLD.waterY ?? 0;
    for (let i = 0; i < 5; i++) {
      const plank = new Mesh(new BoxGeometry(1.15, 0.1, 0.85), this._mats.dock);
      const px = cx + 5.0 + i * 1.1;
      const pz = cz + 3.6 + i * 0.32;
      plank.position.set(px, dockY + 0.12, pz);
      plank.rotation.y = 0.3;
      plank.castShadow = true;
      pier.add(plank);
      const post = new Mesh(new CylinderGeometry(0.07, 0.09, 1.05, 6), this._mats.timber);
      post.position.set(px + 0.35, dockY + 0.45, pz + 0.3);
      pier.add(post);
    }
    this.group.add(pier);

    this.group.traverse((o) => {
      if (o.isMesh) o.layers.set(LAYER.WORLD);
    });

    console.info(
      `[IslandTown] riverside hamlet ON island @ (${cx.toFixed(1)}, ${baseY.toFixed(2)}, ${cz.toFixed(1)}) · waterY=${WORLD.waterY} seafloorY=${WORLD.seafloorY}`
    );
    return this;
  }

  dispose() {
    this.group.traverse((o) => {
      o.geometry?.dispose?.();
      if (o.material) {
        if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
        else o.material.dispose();
      }
    });
    this.group.removeFromParent();
  }
}
