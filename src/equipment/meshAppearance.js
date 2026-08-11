/**
 * Mesh appearance lab — color · scale · rotate · offset on equipped weapon/armour.
 *
 * Extends WeaponMeshAttach / kit meshes — not a second equip system.
 * Persist per item id in localStorage for casting.* develop loop.
 *
 * @see docs/GAME_ITEM_PREFAB_PRODUCTION_SSOT.md
 */

import { Color, MathUtils } from 'three';

const LS_KEY = 'casting.meshAppearance.v1';

/**
 * @typedef {object} MeshAppearance
 * @property {string} [color] hex #rrggbb
 * @property {number} [emissive] 0..1
 * @property {number} [scale] uniform
 * @property {number[]} [eulerDeg] [x,y,z]
 * @property {number[]} [offset] [x,y,z] local metres
 * @property {number} [metalness]
 * @property {number} [roughness]
 */

/** @returns {Record<string, MeshAppearance>} */
export function loadAppearanceMap() {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || '{}') || {};
  } catch {
    return {};
  }
}

/** @param {Record<string, MeshAppearance>} map */
export function saveAppearanceMap(map) {
  localStorage.setItem(LS_KEY, JSON.stringify(map || {}));
}

/**
 * @param {string} itemId
 * @returns {MeshAppearance}
 */
export function getAppearance(itemId) {
  if (!itemId) return {};
  return loadAppearanceMap()[itemId] || {};
}

/**
 * @param {string} itemId
 * @param {MeshAppearance} patch
 */
export function setAppearance(itemId, patch) {
  if (!itemId) return;
  const map = loadAppearanceMap();
  map[itemId] = { ...(map[itemId] || {}), ...patch };
  saveAppearanceMap(map);
  return map[itemId];
}

/**
 * Apply appearance to a Three.js object tree (weapon attach / armour mesh).
 * @param {import('three').Object3D|null} root
 * @param {MeshAppearance} app
 */
export function applyMeshAppearance(root, app = {}) {
  if (!root) return;
  const color = app.color ? new Color(app.color) : null;
  const scale = Number.isFinite(app.scale) ? app.scale : null;
  const euler = app.eulerDeg;
  const offset = app.offset;

  // Prefer WeaponAttach / mesh holder under hand
  const holder =
    root.userData?.weaponAttach || root.name === 'WeaponAttach'
      ? root
      : root.children?.find?.((c) => c.userData?.weaponAttach || c.name === 'WeaponAttach') ||
        root;

  if (scale != null && scale > 0.05) {
    const base = holder.userData._appBaseScale || holder.scale.x || 1;
    if (!holder.userData._appBaseScale) holder.userData._appBaseScale = base;
    holder.scale.setScalar(holder.userData._appBaseScale * scale);
  }

  if (Array.isArray(euler) && euler.length >= 3) {
    holder.rotation.set(
      MathUtils.degToRad(euler[0] || 0),
      MathUtils.degToRad(euler[1] || 0),
      MathUtils.degToRad(euler[2] || 0)
    );
  }

  if (Array.isArray(offset) && offset.length >= 3) {
    holder.position.set(offset[0] || 0, offset[1] || 0, offset[2] || 0);
  }

  if (color || app.metalness != null || app.roughness != null || app.emissive != null) {
    holder.traverse((o) => {
      if (!o.isMesh || !o.material) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (let i = 0; i < mats.length; i++) {
        let m = mats[i];
        if (!m) continue;
        // Clone once so we don't paint shared materials
        if (!m.userData?._appCloned) {
          m = m.clone();
          m.userData = { ...(m.userData || {}), _appCloned: true };
          if (Array.isArray(o.material)) o.material[i] = m;
          else o.material = m;
        }
        if (color && m.color) m.color.copy(color);
        if (app.emissive != null && m.emissive) {
          m.emissive.copy(color || m.color || new Color(0xffffff));
          m.emissiveIntensity = MathUtils.clamp(Number(app.emissive) || 0, 0, 2);
        }
        if (app.metalness != null && 'metalness' in m) m.metalness = Number(app.metalness);
        if (app.roughness != null && 'roughness' in m) m.roughness = Number(app.roughness);
        m.needsUpdate = true;
      }
    });
  }
}

/**
 * Find weapon attach under character R_hand.
 * @param {import('../animation/CharacterController.js').CharacterController} character
 */
export function getWeaponAttachRoot(character) {
  return (
    character?.weaponAttach ||
    character?.bones?.rHand?.children?.find?.(
      (c) => c.userData?.weaponAttach || c.name === 'WeaponAttach'
    ) ||
    null
  );
}

/**
 * Apply saved appearance for equipped weapon id.
 * @param {import('../animation/CharacterController.js').CharacterController} character
 * @param {string} itemId
 */
export function applyWeaponAppearance(character, itemId) {
  const root = getWeaponAttachRoot(character);
  if (!root || !itemId) return false;
  applyMeshAppearance(root, getAppearance(itemId));
  return true;
}

/**
 * Apply tint to kit mesh_ids parts for an armour mesh slot.
 * @param {import('../animation/CharacterController.js').CharacterController} character
 * @param {string} meshSlot head|body|arms|legs|…
 * @param {string} itemId
 */
export function applyArmorAppearance(character, meshSlot, itemId) {
  const eq = character?.equipment;
  if (!eq || !meshSlot) return false;
  const app = getAppearance(itemId);
  // EquipmentManager may expose meshes by slot — soft apply via model traverse name match
  const model = character.model;
  if (!model) return false;
  const needle = String(meshSlot).toLowerCase();
  model.traverse((o) => {
    if (!o.isMesh) return;
    const n = (o.name || '').toLowerCase();
    if (!n.includes(needle) && !n.includes(needle.replace(/s$/, ''))) return;
    if (!o.visible) return;
    applyMeshAppearance(o, app);
  });
  return true;
}
