/**
 * World drops — unequipped prefabs on terrain / ocean.
 *
 * Presentation (in-game dropped state):
 *  - Ground ring (tier border color)
 *  - Soft glow disc (bloom-friendly additive)
 *  - Hovering icon sprite (billboard)
 *  - Optional miniature 3D model (prod gltf)
 *  - Bob + spin; Y snap to ground or water surface
 *
 * Not equipped. Pickup / throw-from-bag only.
 */

import {
  AdditiveBlending,
  CircleGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  RingGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Vector3
} from 'three';
import { WORLD } from '../config/worldScale.js';
import { presentPrefab, tierPresent } from '../loot/prefabAssets.js';

const _v = new Vector3();

/**
 * @typedef {object} WorldDropItem
 * @property {string} id
 * @property {Group} root
 * @property {object} present  from presentPrefab / bagItem
 * @property {number} bobPhase
 * @property {number} spin
 * @property {boolean} onWater
 * @property {Mesh|null} model
 * @property {Sprite|null} sprite
 */

export class WorldDrops {
  /**
   * @param {{
   *   scene: import('three').Scene,
   *   camera: import('three').Camera,
   *   assets: import('../loaders/AssetLoader.js').AssetLoader,
   *   waterY?: number,
   *   groundY?: number,
   *   onToast?: (s: string) => void
   * }} opts
   */
  constructor(opts) {
    this.scene = opts.scene;
    this.camera = opts.camera;
    this.assets = opts.assets;
    this.waterY = opts.waterY ?? WORLD.waterY ?? -0.04;
    this.groundY = opts.groundY ?? 0;
    this.onToast = opts.onToast || (() => {});

    /** @type {WorldDropItem[]} */
    this.items = [];
    this.group = new Group();
    this.group.name = 'WorldDrops';
    this.scene.add(this.group);

    this._texCache = new Map();
    this._modelCache = new Map();
    this._hoverH = 0.55;
  }

  /**
   * Surface Y at xz — simple stage: ground 0, water band uses waterY when far from origin island pad.
   * Lab stage is flat ground + water skirt; prefer ground near center, water further out.
   * @param {number} x
   * @param {number} z
   */
  surfaceY(x, z) {
    const r = Math.hypot(x, z);
    // Stage ground is large island pad; water around/below — use ground if r small
    if (r < 22) return this.groundY + 0.02;
    return Math.max(this.waterY + 0.06, this.groundY + 0.02);
  }

  /**
   * @param {object} present presentPrefab() result or bag item
   * @param {Vector3|{x,y,z}} pos
   * @param {{ skipModel?: boolean }} [opts]
   */
  async spawn(present, pos, opts = {}) {
    if (!present) return null;
    const p = present.iconUrl ? present : presentPrefab(present.raw || present);
    if (!p) return null;

    const root = new Group();
    root.name = `drop_${p.id}`;
    root.position.set(pos.x, this.surfaceY(pos.x, pos.z), pos.z);
    root.userData.worldDrop = true;
    root.userData.present = p;

    const tier = Math.max(0, Math.min(8, p.tier ?? 0));
    const tp = tierPresent(tier);
    const glowHex = p.glowColor ?? tp.glow;
    const borderHex = p.borderColor ?? tp.border;
    // Mythic+ slightly larger glow (still same prefab systems)
    const glowScale = tier >= 6 ? 1.25 : 1;

    // Glow disc (additive — feeds bloom)
    const glow = new Mesh(
      new CircleGeometry(0.42 * glowScale, 32),
      new MeshBasicMaterial({
        color: glowHex,
        transparent: true,
        opacity: tier >= 6 ? 0.55 : 0.45,
        blending: AdditiveBlending,
        depthWrite: false,
        side: DoubleSide
      })
    );
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = 0.015;
    root.add(glow);

    // Border ring
    const border = new Mesh(
      new RingGeometry(0.38 * glowScale, 0.48 * glowScale, 40),
      new MeshBasicMaterial({
        color: borderHex,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
        side: DoubleSide
      })
    );
    border.rotation.x = -Math.PI / 2;
    border.position.y = 0.02;
    root.add(border);

    // Soft emissive halo for bloom (standard material)
    const halo = new Mesh(
      new CircleGeometry(0.55 * glowScale, 24),
      new MeshStandardMaterial({
        color: 0x000000,
        emissive: glowHex,
        emissiveIntensity: tier >= 6 ? 2.0 : 1.4,
        transparent: true,
        opacity: 0.35,
        depthWrite: false,
        side: DoubleSide
      })
    );
    halo.rotation.x = -Math.PI / 2;
    halo.position.y = 0.01;
    root.add(halo);

    // Icon sprite
    let sprite = null;
    try {
      const tex = await this._loadTexture(p.iconUrl);
      const mat = new SpriteMaterial({
        map: tex,
        transparent: true,
        depthWrite: false,
        fog: false
      });
      sprite = new Sprite(mat);
      sprite.scale.set(0.55, 0.55, 0.55);
      sprite.position.y = this._hoverH;
      root.add(sprite);
    } catch {
      // placeholder diamond
      const stub = new Mesh(
        new CircleGeometry(0.2, 6),
        new MeshBasicMaterial({ color: borderHex, transparent: true, opacity: 0.85 })
      );
      stub.position.y = this._hoverH;
      root.add(stub);
    }

    // Optional 3D model mini
    let model = null;
    if (!opts.skipModel && p.modelUrl) {
      try {
        model = await this._loadModelMini(p.modelUrl);
        if (model) {
          model.position.y = this._hoverH * 0.55;
          root.add(model);
        }
      } catch {
        /* sprite only */
      }
    }

    this.group.add(root);
    const item = {
      id: `${p.id}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      root,
      present: p,
      bobPhase: Math.random() * Math.PI * 2,
      spin: 0.6 + Math.random() * 0.8,
      onWater: Math.hypot(pos.x, pos.z) >= 22,
      model,
      sprite,
      qty: present.qty || 1
    };
    this.items.push(item);
    return item;
  }

  /**
   * Throw from inventory: arc from player hand toward aim point.
   * @param {object} present
   * @param {Vector3} from
   * @param {Vector3} to
   */
  async throwFrom(present, from, to) {
    const item = await this.spawn(present, to, { skipModel: false });
    if (!item) return null;
    // Start at thrower, animate to landing over ~0.45s
    item.root.position.copy(from);
    item.throw = {
      from: from.clone(),
      to: new Vector3(to.x, this.surfaceY(to.x, to.z), to.z),
      t: 0,
      dur: 0.48
    };
    return item;
  }

  /**
   * Pickup nearest within radius. Returns bag item or null.
   * @param {Vector3} playerPos
   * @param {number} [radius=2.2]
   */
  tryPickup(playerPos, radius = 2.2) {
    let best = null;
    let bestD = radius * radius;
    for (const it of this.items) {
      if (it.throw) continue;
      const dx = it.root.position.x - playerPos.x;
      const dz = it.root.position.z - playerPos.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < bestD) {
        bestD = d2;
        best = it;
      }
    }
    if (!best) return null;
    this._remove(best);
    const bag = {
      id: best.present.id,
      uuid: best.present.uuid,
      name: best.present.name,
      tier: best.present.tier,
      qty: best.qty || 1,
      iconUrl: best.present.iconUrl,
      modelUrl: best.present.modelUrl,
      weaponType: best.present.weaponType,
      category: best.present.category,
      borderColor: best.present.borderColor,
      glowColor: best.present.glowColor
    };
    this.onToast(`Picked up ${bag.name} (T${bag.tier})`);
    return bag;
  }

  _remove(item) {
    const i = this.items.indexOf(item);
    if (i >= 0) this.items.splice(i, 1);
    this.group.remove(item.root);
    item.root.traverse((o) => {
      if (o.geometry) o.geometry.dispose?.();
      if (o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) {
          if (m.map && !this._texCache.has(m.map.uuid)) m.map.dispose?.();
          m.dispose?.();
        }
      }
    });
  }

  /**
   * @param {number} dt
   */
  update(dt) {
    const t = performance.now() * 0.001;
    for (const it of this.items) {
      if (it.throw) {
        it.throw.t += dt;
        const u = Math.min(1, it.throw.t / it.throw.dur);
        const e = 1 - (1 - u) * (1 - u);
        it.root.position.lerpVectors(it.throw.from, it.throw.to, e);
        it.root.position.y =
          it.throw.from.y * (1 - e) +
          it.throw.to.y * e +
          Math.sin(u * Math.PI) * 1.4;
        if (u >= 1) {
          it.root.position.copy(it.throw.to);
          it.throw = null;
          it.onWater = Math.hypot(it.root.position.x, it.root.position.z) >= 22;
        }
        continue;
      }

      const baseY = this.surfaceY(it.root.position.x, it.root.position.z);
      const bob = Math.sin(t * 2.2 + it.bobPhase) * 0.06;
      it.root.position.y = baseY;

      if (it.sprite) {
        it.sprite.position.y = this._hoverH + bob;
        // face camera (Sprite already billboards)
      }
      if (it.model) {
        it.model.position.y = this._hoverH * 0.5 + bob * 0.5;
        it.model.rotation.y += dt * it.spin;
      }

      // Pulse glow opacity slightly
      const glow = it.root.children.find((c) => c.material?.blending === AdditiveBlending);
      if (glow?.material) {
        glow.material.opacity = 0.35 + 0.15 * (0.5 + 0.5 * Math.sin(t * 3 + it.bobPhase));
      }
    }
  }

  async _loadTexture(url) {
    if (!url) throw new Error('no icon');
    if (this._texCache.has(url)) return this._texCache.get(url);
    const tex = await this.assets.loadTexture(url);
    tex.colorSpace = SRGBColorSpace;
    this._texCache.set(url, tex);
    return tex;
  }

  async _loadModelMini(url) {
    if (this._modelCache.has(url)) {
      return this._modelCache.get(url).clone(true);
    }
    try {
      const gltf = await this.assets.loadGLTF(url);
      const root = gltf.scene.clone(true);
      // Normalize size ~0.45 m
      root.updateMatrixWorld(true);
      let box = null;
      root.traverse((o) => {
        if (o.isMesh) {
          o.castShadow = true;
          o.frustumCulled = false;
        }
      });
      // crude scale
      root.scale.setScalar(0.35);
      this._modelCache.set(url, root);
      return root.clone(true);
    } catch {
      return null;
    }
  }

  clear() {
    while (this.items.length) this._remove(this.items[0]);
  }

  dispose() {
    this.clear();
    this.scene.remove(this.group);
  }
}
