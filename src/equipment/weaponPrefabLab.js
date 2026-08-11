/**
 * Weapon prefab lab — import GLB, assign modelUrl, live scale/edit, measure SI length.
 *
 * Used by Admin Hub F4 Prefabs. Appearance persists via meshAppearance (per item id).
 * Draft modelUrl lives on prefab drafts (localStorage).
 *
 * @see equipment/meshAppearance.js · character/WeaponMeshAttach.js
 */

import { Box3, Vector3 } from 'three';
import {
  getAppearance,
  setAppearance,
  applyWeaponAppearance,
  getWeaponAttachRoot
} from './meshAppearance.js';
import { attachWeaponModel, clearWeaponAttach } from '../character/WeaponMeshAttach.js';
import { saveDraft, getDraft } from '../api/prefabDraftStore.js';
import {
  ensureWeaponCatalog,
  equipWeaponById,
  listEquippableWeapons,
  getEquippedWeapon
} from '../combat/equippedWeaponRuntime.js';
import { normalizeHoldKind } from '../character/weaponHoldPose.js';

const _box = new Box3();
const _size = new Vector3();

/** Local blob URL registry for imported GLBs (session) */
const _imports = new Map(); // id → { url, name, sizeBytes }

/**
 * Measure world-space AABB of equipped weapon attach (metres).
 * @param {import('../animation/CharacterController.js').CharacterController|null} character
 * @returns {{ lengthM: number, widthM: number, heightM: number, scale: number }|null}
 */
export function measureWeaponScale(character) {
  const root = getWeaponAttachRoot(character);
  if (!root) return null;
  root.updateWorldMatrix?.(true, true);
  _box.setFromObject(root);
  _box.getSize(_size);
  const lengthM = Math.max(_size.x, _size.y, _size.z);
  const scale = root.scale?.x ?? 1;
  return {
    lengthM,
    widthM: Math.min(_size.x, _size.z),
    heightM: _size.y,
    scale,
    fitScale: root.userData?._fitScale ?? root.userData?._appBaseScale ?? scale,
    profile: root.userData?.profile || 'melee',
    modelUrl: root.userData?.modelUrl || null
  };
}

/**
 * Import a local GLB/GLTF File → blob URL, register under item id.
 * @param {File} file
 * @param {string} itemId
 * @returns {Promise<{ url: string, name: string, sizeBytes: number }>}
 */
export async function importWeaponGlb(file, itemId) {
  if (!file) throw new Error('No file');
  const name = file.name || 'weapon.glb';
  if (!/\.(glb|gltf)$/i.test(name)) throw new Error('Need .glb or .gltf');
  const prev = _imports.get(itemId);
  if (prev?.url?.startsWith('blob:')) {
    try {
      URL.revokeObjectURL(prev.url);
    } catch {
      /* ok */
    }
  }
  const url = URL.createObjectURL(file);
  const rec = { url, name, sizeBytes: file.size || 0, importedAt: Date.now() };
  _imports.set(itemId, rec);
  return rec;
}

/**
 * Assign modelUrl (CDN or blob) onto a local prefab draft and persist.
 * @param {string} draftId
 * @param {string} modelUrl
 * @param {{ name?: string, maxLengthM?: number, scale?: number }} [meta]
 */
export function assignModelToDraft(draftId, modelUrl, meta = {}) {
  const d = getDraft(draftId);
  if (!d) throw new Error('Draft not found');
  d.modelUrl = modelUrl;
  d.assets = { ...(d.assets || {}), modelUrl, modelName: meta.name || d.assets?.modelName };
  if (meta.maxLengthM != null) d.maxLengthM = meta.maxLengthM;
  if (meta.scale != null) {
    d.meshScale = meta.scale;
    setAppearance(d.id, { scale: meta.scale });
  }
  d.layers = d.layers || {};
  d.layers.assets = {
    ...(d.layers.assets || {}),
    modelUrl,
    iconUrl: d.iconUrl || d.layers.assets?.iconUrl || null
  };
  return saveDraft(d);
}

/**
 * Equip catalog weapon or draft (draft needs modelUrl + id).
 * @param {string} weaponId
 * @param {{ character: object, onToast?: (s:string)=>void }} ctx
 * @param {{ modelUrl?: string, maxLengthM?: number, profile?: string }} [override]
 */
export async function equipWeaponForLab(weaponId, ctx, override = {}) {
  await ensureWeaponCatalog();
  const catalog = listEquippableWeapons();
  let id = weaponId;
  const draft = getDraft(weaponId);

  // Catalog equip path
  if (catalog.some((w) => w.id === weaponId) && !override.modelUrl) {
    await equipWeaponById(weaponId, ctx);
  } else if (draft || override.modelUrl) {
    // Manual attach from draft / import without full catalog entry
    const character = ctx.character;
    const bones = character?.equipment?.findBones?.() || character?.bones || {};
    const hand = bones.rHand || character?.bones?.rHand;
    const modelUrl = override.modelUrl || draft?.modelUrl;
    if (!hand || !modelUrl) throw new Error('Need hand bone + modelUrl');
    clearWeaponAttach(hand);
    const profile =
      override.profile ||
      (draft?.weaponType
        ? /WAND/i.test(draft.weaponType)
          ? 'wand'
          : /STAFF/i.test(draft.weaponType)
            ? 'staff'
            : /BOW/i.test(draft.weaponType)
              ? 'bow'
              : /PISTOL|GUN/i.test(draft.weaponType)
                ? 'pistol'
                : 'melee'
        : 'melee');
    const maxLengthM = override.maxLengthM ?? draft?.maxLengthM ?? 1.2;
    const attach = await attachWeaponModel(hand, modelUrl, { profile, maxLengthM });
    if (character) {
      character.weaponAttach = attach;
      character.weaponHoldKind = normalizeHoldKind(draft?.weaponType || profile);
      character.syncWeaponAttach?.();
      character.rebuildWeaponVolume?.({ debug: false });
      applyWeaponAppearance(character, draft?.id || weaponId);
    }
    id = draft?.id || weaponId;
  } else {
    await equipWeaponById(weaponId, ctx);
  }

  // Apply appearance scale after attach
  applyWeaponAppearance(ctx.character, id);
  return { id, measure: measureWeaponScale(ctx.character), equipped: getEquippedWeapon() };
}

/**
 * Live scale edit — writes meshAppearance + reapplies on hand.
 * @param {string} itemId
 * @param {number} scale
 * @param {object} character
 */
export function setLiveWeaponScale(itemId, scale, character) {
  const s = Math.max(0.15, Math.min(4, Number(scale) || 1));
  setAppearance(itemId, { scale: s });
  applyWeaponAppearance(character, itemId);
  return measureWeaponScale(character);
}

/**
 * Full appearance patch (scale, euler, offset, color).
 * @param {string} itemId
 * @param {import('./meshAppearance.js').MeshAppearance} patch
 * @param {object} character
 */
export function setLiveWeaponAppearance(itemId, patch, character) {
  setAppearance(itemId, patch);
  applyWeaponAppearance(character, itemId);
  return { appearance: getAppearance(itemId), measure: measureWeaponScale(character) };
}

/**
 * Format SI readout for UI.
 * @param {ReturnType<typeof measureWeaponScale>} m
 */
export function formatScaleReadout(m) {
  if (!m) return 'No weapon mesh — equip or import first';
  return `length ${m.lengthM.toFixed(2)} m · scale ×${(m.scale || 1).toFixed(2)} · ${m.profile}`;
}

export function listSessionImports() {
  return [..._imports.entries()].map(([id, rec]) => ({ id, ...rec }));
}
