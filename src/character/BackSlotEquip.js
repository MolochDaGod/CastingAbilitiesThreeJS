/**
 * Back-slot equipment attach — same family as WeaponMeshAttach (hand),
 * but for spine/back utilities (windsurf, glider, cape, pack).
 *
 * Industry layers (canonical-equipment-pattern):
 *  - Definition: slot = Back / Cloak / utility tag (ITEM-*)
 *  - Assets: modelUrl on CDN / local ride package
 *  - Presentation: stowed mesh on **quiver-family back bone** while land loco
 *  - Runtime: deploy → hide stow + vehicle seat (WalkController)
 *
 * Windsurf contract:
 *  - Equipped back item = **shrunk** `back_fly_windsurf.glb` on quiver bone
 *  - Sail = cloth material + vertex wind (SailCloth) — not a second physics body
 *  - Deploy (walk Space) = vehicle from HoverboardRide; stow hidden
 *  - Get-off (E) = vehicle removed; stow shown again
 *
 * @see docs/WINDSURF_RIDE_SSOT.md
 * @see docs/GAME_ITEM_PREFAB_PRODUCTION_SSOT.md (Back row)
 * @see src/materials/SailCloth.js
 * @see src/character/WeaponMeshAttach.js
 */

import { Box3, Group, MathUtils, Vector3 } from 'three';
import { clone as skeletonClone } from 'three/addons/utils/SkeletonUtils.js';
import {
  applySailClothMaterials,
  setSailClothMode,
  updateSailCloth
} from '../materials/SailCloth.js';
import { sharedGltfLoader } from '../loaders/gltfPipeline.js';

const _box = new Box3();
const _size = new Vector3();

/**
 * Known back-slot item ids → default local models / SI stow.
 * Stow size is **quiver-class** (back item), not full vehicle SI.
 */
export const BACK_SLOT_DEFS = Object.freeze({
  windsurf: {
    id: 'windsurf',
    slot: 'back',
    equipmentSlot: 'Back',
    category: 'utility',
    deployable: true,
    vehicle: 'windsurf',
    /**
     * Back-stow visual — Desktop `back_fly_windsurf.glb` (Para/sail pack).
     * Full ride vehicle stays `windsurf_package.glb` in HoverboardRide.
     */
    modelUrl: './models/ride/back_fly_windsurf.glb',
    /** Quiver-scale length (SI m) — human ~1.8 m; back item ~0.55–0.65 m */
    stowLengthM: 0.58,
    /** Local offset on quiver/spine bone: snug behind upper back */
    stowOffset: [0.02, 0.06, -0.14],
    /** Pitch so board/sail lies along back (not sticking out sideways) */
    stowEulerDeg: [8, 180, 0],
    label: 'Windsurf (back stow)',
    cloth: true
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
 * Resolve back attach bone — **same family as quiver**.
 * Prefer mesh parent of Xtra_quiver / quiver container, else Spine1/2.
 * @param {import('three').Object3D} root
 * @returns {import('three').Object3D|null}
 */
export function findBackBone(root) {
  if (!root) return null;
  const map = new Map();
  root.traverse((n) => {
    if (n.name) map.set(n.name, n);
  });

  // 1) Quiver mesh exists → attach to its parent bone (true quiver slot)
  let quiverMesh = null;
  root.traverse((n) => {
    if (quiverMesh) return;
    const k = (n.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    if (
      k.includes('xtraquiver') ||
      k.includes('quiver') ||
      k.includes('back_container') ||
      k.includes('backcontainer')
    ) {
      quiverMesh = n;
    }
  });
  if (quiverMesh) {
    let p = quiverMesh.parent;
    while (p && p !== root) {
      if (p.isBone || /spine|chest|clavicle|bip001/i.test(p.name || '')) return p;
      p = p.parent;
    }
    if (quiverMesh.parent) return quiverMesh.parent;
  }

  // 2) Named bones (Toon RTS Bip001 — Spine1 is standard quiver height)
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
      const gltf = await sharedGltfLoader().loadAsync(this.def.modelUrl);
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

      // Materials: sRGB base maps, cloth sail PBR + wind patch
      if (this.def.cloth !== false) {
        applySailClothMaterials(clone, { forceCloth: id === 'windsurf' });
        setSailClothMode(clone, 'stow');
      }

      // SI stow: longest axis → stowLengthM (quiver-class ~0.58 m)
      clone.updateMatrixWorld(true);
      _box.setFromObject(clone);
      _box.getSize(_size);
      const longest = Math.max(_size.x, _size.y, _size.z, 0.01);
      const maxLen = this.def.stowLengthM ?? 0.58;
      const s = maxLen / longest;
      // Guard absurd author scale (cm→m decade)
      clone.scale.setScalar(Number.isFinite(s) && s > 0 && s < 50 ? s : 0.01);

      const holder = new Group();
      holder.name = 'BackSlotAttach';
      holder.userData.backSlot = true;
      holder.userData.itemId = id;
      holder.userData.equipmentSlot = 'Back';
      holder.userData.deployable = !!this.def.deployable;
      holder.userData.stowLengthM = maxLen;
      holder.add(clone);

      const off = this.def.stowOffset || [0.02, 0.06, -0.14];
      holder.position.set(off[0], off[1], off[2]);
      const e = this.def.stowEulerDeg || [8, 180, 0];
      holder.rotation.set(
        MathUtils.degToRad(e[0] || 0),
        MathUtils.degToRad(e[1] || 0),
        MathUtils.degToRad(e[2] || 0)
      );

      this.backBone.add(holder);
      this.holder = holder;
      this.setDeployed(this.deployed);
      console.info(
        '[BackSlotEquip] stowed',
        id,
        'on',
        this.backBone.name,
        `len≈${maxLen}m scale=${(maxLen / longest).toFixed(4)}`
      );
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

  /**
   * Cloth wind tick (stow visible only). Call from character update.
   * @param {number} dt
   * @param {{ wind?: number }} [opts]
   */
  update(dt, opts = {}) {
    if (!this.holder || !this.holder.visible) return;
    updateSailCloth(this.holder, dt, { wind: opts.wind ?? 1, speed: 1 });
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
