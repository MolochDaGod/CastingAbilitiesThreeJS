/**
 * Back-slot equipment attach — same family as WeaponMeshAttach (hand),
 * but for spine/back utilities (windsurf, glider, cape, pack).
 *
 * Industry layers (canonical-equipment-pattern):
 *  - Definition: slot = Back / Cloak / utility tag (ITEM-*)
 *  - Assets: modelUrl on CDN / local ride package
 *  - Presentation: stowed mesh on Bip001 Spine while land loco
 *  - Runtime: deploy → hide stow + vehicle seat (WalkController)
 *
 * Windsurf contract:
 *  - Equipped back item = stowed board on spine (small SI)
 *  - Deploy (walk Space) = vehicle from HoverboardRide; stow hidden
 *  - Get-off (E) = vehicle removed; stow shown again
 *
 * @see docs/WINDSURF_RIDE_SSOT.md
 * @see docs/GAME_ITEM_PREFAB_PRODUCTION_SSOT.md (Back row)
 * @see src/character/WeaponMeshAttach.js
 */

import { Box3, Group, MathUtils, Vector3 } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as skeletonClone } from 'three/addons/utils/SkeletonUtils.js';

const loader = new GLTFLoader();
const _box = new Box3();
const _size = new Vector3();

/** Known back-slot item ids → default local models / SI stow */
export const BACK_SLOT_DEFS = Object.freeze({
  windsurf: {
    id: 'windsurf',
    slot: 'back',
    equipmentSlot: 'Back',
    category: 'utility',
    deployable: true,
    vehicle: 'windsurf',
    /** Full ride package — stow uses a scaled-down clone, not a second engine */
    modelUrl: './models/ride/windsurf_package.glb',
    /** Stow length along spine (SI m) — human ~1.8 m yardstick */
    stowLengthM: 0.85,
    /** Local offset on spine: behind shoulders */
    stowOffset: [0, 0.08, -0.18],
    stowEulerDeg: [12, 0, 0],
    label: 'Windsurf board'
  },
  none: {
    id: 'none',
    slot: 'back',
    equipmentSlot: 'Back',
    deployable: false,
    modelUrl: null
  }
});

/**
 * Resolve spine attach bone (Toon RTS Bip001).
 * Prefer upper back (Spine1/2) so board sits behind shoulders.
 * @param {import('three').Object3D} root
 * @returns {import('three').Object3D|null}
 */
export function findBackBone(root) {
  if (!root) return null;
  const prefer = [
    'Bip001 Spine1',
    'Bip001_Spine1',
    'Bip001 Spine2',
    'Bip001_Spine2',
    'Bip001 Spine',
    'Bip001_Spine',
    'Spine2',
    'Spine1',
    'Spine',
    'mixamorig:Spine2',
    'mixamorig:Spine1',
    'mixamorig:Spine'
  ];
  const map = new Map();
  root.traverse((n) => {
    if (n.name) map.set(n.name, n);
  });
  for (const name of prefer) {
    if (map.has(name)) return map.get(name);
  }
  // Fuzzy
  let found = null;
  root.traverse((n) => {
    if (found) return;
    const k = (n.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    if (k.includes('spine1') || k.includes('spine2') || k === 'bip001spine') found = n;
  });
  return found;
}

/**
 * Manages stowed back-item mesh on the character kit.
 */
export class BackSlotEquip {
  /**
   * @param {import('three').Object3D|null} kitRoot character model root
   */
  constructor(kitRoot = null) {
    /** @type {import('three').Object3D|null} */
    this.kitRoot = kitRoot;
    /** @type {import('three').Object3D|null} */
    this.backBone = kitRoot ? findBackBone(kitRoot) : null;
    /** @type {Group|null} */
    this.holder = null;
    /** @type {string} */
    this.itemId = 'none';
    /** @type {object|null} */
    this.def = null;
    /** Vehicle deployed — stow mesh hidden */
    this.deployed = false;
    this._loadToken = 0;
  }

  /**
   * Rebind after race kit swap.
   * @param {import('three').Object3D|null} kitRoot
   */
  rebind(kitRoot) {
    this.clear();
    this.kitRoot = kitRoot;
    this.backBone = kitRoot ? findBackBone(kitRoot) : null;
    if (this.itemId && this.itemId !== 'none') {
      this.equip(this.itemId).catch(() => {});
    }
  }

  /**
   * Equip a back-slot item by id (windsurf | none | future glider…).
   * @param {string} itemId
   * @param {{ modelUrl?: string }} [opts]
   */
  async equip(itemId, opts = {}) {
    const id = itemId || 'none';
    const base = BACK_SLOT_DEFS[id] || {
      id,
      slot: 'back',
      equipmentSlot: 'Back',
      deployable: true,
      modelUrl: opts.modelUrl || null,
      stowLengthM: 0.85,
      stowOffset: [0, 0.08, -0.18],
      stowEulerDeg: [12, 0, 0],
      label: id
    };
    this.def = { ...base, modelUrl: opts.modelUrl || base.modelUrl };
    this.itemId = id;

    if (id === 'none' || !this.def.modelUrl) {
      this.clear();
      this.itemId = 'none';
      return null;
    }
    if (!this.backBone && this.kitRoot) this.backBone = findBackBone(this.kitRoot);
    if (!this.backBone) {
      console.warn('[BackSlotEquip] no spine bone — cannot stow', id);
      return null;
    }

    const token = ++this._loadToken;
    try {
      const gltf = await loader.loadAsync(this.def.modelUrl);
      if (token !== this._loadToken) return null;
      const src = gltf.scene || gltf.scenes?.[0];
      if (!src) return null;

      this.clearMeshOnly();
      const clone = skeletonClone(src);
      clone.name = 'BackSlotMesh';
      clone.traverse((o) => {
        if (o.isMesh) {
          o.castShadow = true;
          o.receiveShadow = true;
          o.frustumCulled = true;
        }
      });

      // SI stow: longest axis → stowLengthM
      _box.setFromObject(clone);
      _box.getSize(_size);
      const longest = Math.max(_size.x, _size.y, _size.z, 0.01);
      const maxLen = this.def.stowLengthM ?? 0.85;
      clone.scale.setScalar(maxLen / longest);

      const holder = new Group();
      holder.name = 'BackSlotAttach';
      holder.userData.backSlot = true;
      holder.userData.itemId = id;
      holder.userData.equipmentSlot = 'Back';
      holder.userData.deployable = !!this.def.deployable;
      holder.add(clone);

      const off = this.def.stowOffset || [0, 0.08, -0.18];
      holder.position.set(off[0], off[1], off[2]);
      const e = this.def.stowEulerDeg || [12, 0, 0];
      holder.rotation.set(
        MathUtils.degToRad(e[0] || 0),
        MathUtils.degToRad(e[1] || 0),
        MathUtils.degToRad(e[2] || 0)
      );

      this.backBone.add(holder);
      this.holder = holder;
      this.setDeployed(this.deployed);
      console.info('[BackSlotEquip] stowed', id, 'on', this.backBone.name);
      return holder;
    } catch (err) {
      console.warn('[BackSlotEquip] load failed', this.def.modelUrl, err);
      return null;
    }
  }

  /**
   * Vehicle live → hide stow; land → show stow.
   * @param {boolean} deployed
   */
  setDeployed(deployed) {
    this.deployed = !!deployed;
    if (this.holder) this.holder.visible = !this.deployed && this.itemId !== 'none';
  }

  /** @returns {boolean} */
  get canDeploy() {
    return !!(this.def?.deployable && this.itemId && this.itemId !== 'none');
  }

  clearMeshOnly() {
    if (!this.holder) return;
    const parent = this.holder.parent;
    parent?.remove(this.holder);
    this.holder.traverse((c) => {
      if (c.geometry) c.geometry.dispose?.();
      if (c.material) {
        const mats = Array.isArray(c.material) ? c.material : [c.material];
        for (const m of mats) m.dispose?.();
      }
    });
    this.holder = null;
  }

  clear() {
    this.clearMeshOnly();
    this.itemId = 'none';
    this.def = BACK_SLOT_DEFS.none;
    this.deployed = false;
  }

  dispose() {
    this.clear();
    this.kitRoot = null;
    this.backBone = null;
  }
}
