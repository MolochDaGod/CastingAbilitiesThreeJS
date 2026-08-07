/**
 * Warlords / grudge6 PLAY path — HARDENED parity of ObjectStore loadRaceKit.
 *
 * RIGHT SOURCE (do not invent another):
 *   info.grudge-studio.com/js/grudge6-kit.js  (loadRaceKit)
 *   api/v1/grudge6-warlords-play-contract.json
 *   info.grudge-studio.com/grudge6-race-scenes.html
 *
 * Pipeline:
 *   Toon RTS GLB → SkeletonUtils.clone → exclusive mesh_ids
 *   → normalize embeds (never forceAtlas)
 *   → fitRootUniformSi via BONE structural box (not unskinned mesh AABB)
 *   → face camera yaw 0
 *   → stamp warlordsPlayContract on root.userData
 *
 * BANNED (throw / never reintroduce): multi-pose, mesh AABB SI, facePlusZ default,
 * races/metaverse/FBX play defaults, forceAtlas on good embeds.
 */
export const WARLORDS_PLAY_CONTRACT_VERSION = '2026-08-07.harden.1';
import {
  Box3,
  ClampToEdgeWrapping,
  DoubleSide,
  SRGBColorSpace,
  Vector3
} from 'three';
import { clone as skeletonClone } from 'three/addons/utils/SkeletonUtils.js';
import { HUMAN_HEIGHT_M } from '../config/grudge6SSOT.js';

const _p = new Vector3();

function findNamed(root, names) {
  for (const n of names) {
    const o = root.getObjectByName(n);
    if (o) return o;
  }
  return null;
}

/**
 * Bone-driven structural AABB — ObjectStore measureBoneStructuralBBox.
 * Skinned modular Units_* geometry is local-bind; mesh AABB is wrong.
 */
export function measureBoneStructuralBBox(root) {
  if (!root) return null;
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    if (o.isSkinnedMesh && o.skeleton) o.skeleton.update();
  });

  const groups = [
    ['Bip001 Head', 'Bip001_Head', 'Head'],
    ['Bip001 HeadNub', 'Bip001_HeadNub'],
    ['Bip001 Pelvis', 'Bip001_Pelvis', 'Pelvis'],
    ['Bip001 Spine', 'Bip001_Spine'],
    ['Bip001 L Foot', 'Bip001_L_Foot'],
    ['Bip001 R Foot', 'Bip001_R_Foot'],
    ['Bip001 L Toe0', 'Bip001_L_Toe0'],
    ['Bip001 R Toe0', 'Bip001_R_Toe0'],
    ['Bip001 L Hand', 'Bip001_L_Hand'],
    ['Bip001 R Hand', 'Bip001_R_Hand'],
    ['Bip001 L Calf', 'Bip001_L_Calf'],
    ['Bip001 R Calf', 'Bip001_R_Calf']
  ];

  const box = new Box3();
  let n = 0;
  for (const names of groups) {
    const bone = findNamed(root, names);
    if (!bone) continue;
    bone.getWorldPosition(_p);
    if (!Number.isFinite(_p.x + _p.y + _p.z)) continue;
    if (n === 0) {
      box.min.copy(_p);
      box.max.copy(_p);
    } else box.expandByPoint(_p);
    n++;
  }
  if (n < 2) return null;

  const h = Math.max(box.max.y - box.min.y, 1e-4);
  const pad = Math.max(h * 0.1, h * 0.02);
  box.min.y -= pad * 0.55;
  box.max.y += pad * 0.45;
  box.min.x -= pad * 0.35;
  box.max.x += pad * 0.35;
  box.min.z -= pad * 0.35;
  box.max.z += pad * 0.35;
  return box;
}

/**
 * Uniform SI fit on ROOT only + plant feet (ObjectStore fitRootUniformSi).
 * Does NOT touch child mesh/bone scales. Does NOT unify skeletons.
 */
export function fitRootUniformSi(root, targetH = HUMAN_HEIGHT_M, opts = {}) {
  const centerXZ = opts.centerXZ !== false;

  root.position.set(0, 0, 0);
  root.rotation.set(0, 0, 0);
  root.scale.setScalar(1);
  root.updateMatrixWorld(true);

  let box = measureBoneStructuralBBox(root);
  if (!box) {
    box = new Box3().setFromObject(root, false);
  }
  let h = Math.max(box.max.y - box.min.y, 1e-4);

  // Classic 100× (cm as m)
  if (h > 40) {
    root.scale.setScalar(0.01);
    root.updateMatrixWorld(true);
    box = measureBoneStructuralBBox(root) || new Box3().setFromObject(root, false);
    h = Math.max(box.max.y - box.min.y, 1e-4);
  }

  const s = targetH / h;
  root.scale.setScalar(root.scale.x * s);
  root.updateMatrixWorld(true);
  box = measureBoneStructuralBBox(root) || new Box3().setFromObject(root, false);

  // Feet = structural min.y (NOT pelvis)
  root.position.y -= box.min.y;
  if (centerXZ) {
    const cx = (box.min.x + box.max.x) * 0.5;
    const cz = (box.min.z + box.max.z) * 0.5;
    root.position.x -= cx;
    root.position.z -= cz;
  }
  root.updateMatrixWorld(true);
  box = measureBoneStructuralBBox(root) || new Box3().setFromObject(root, false);
  const finalH = box.max.y - box.min.y;

  root.userData.deployHeightM = finalH;
  root.userData.deployScaleFactor = root.scale.x;
  root.userData.grudgeHeightFit = true;
  root.userData.importPipeline = root.userData.importPipeline || 'toon-rts-glb';
  root.userData.artForwardSet = true;
  root.userData.artForwardYaw = 0;

  console.info(
    `[toonKitPlay] fitRootUniformSi boneH→${finalH.toFixed(2)}m scale=${root.scale.x.toFixed(4)} ` +
      `feetY=${box.min.y.toFixed(3)}`
  );
  return { height: finalH, scale: root.scale.x, targetH };
}

/** Toon RTS play GLBs are art-forward +Z — yaw 0 faces +Z camera. Never Math.PI. */
export function faceRootTowardCamera(root) {
  root.rotation.set(0, 0, 0);
}

/**
 * Hide all equippable → show mesh_ids (ObjectStore EquipmentManager.applyMeshIds style).
 */
export function applyMeshIdsExclusive(root, meshIds = []) {
  const want = (meshIds || []).map((id) => meshKey(id)).filter(Boolean);
  const shown = [];
  const missing = [];

  const meshes = [];
  root.traverse((n) => {
    if (n.isMesh || n.isSkinnedMesh) meshes.push(n);
  });

  for (const m of meshes) {
    if (!isEquippableName(m.name)) continue;
    m.visible = false;
  }

  if (!want.length) {
    // Default A armor
    for (const m of meshes) {
      if (/units_body_a|body_a/i.test(m.name) && !/weapon/i.test(m.name)) {
        m.visible = true;
        shown.push(m.name);
      }
      if (/units_arms_a|arms_a/i.test(m.name)) {
        m.visible = true;
        shown.push(m.name);
      }
      if (/units_legs_a|legs_a/i.test(m.name)) {
        m.visible = true;
        shown.push(m.name);
      }
      if (/units_head_a|head_a/i.test(m.name) && !/bip001/i.test(m.name)) {
        m.visible = true;
        shown.push(m.name);
      }
    }
    return { matched: shown.length, shown, missing: ['empty-loadout-used-A'] };
  }

  for (const w of want) {
    let hit = null;
    for (const m of meshes) {
      const k = meshKey(m.name);
      if (k === w || k.endsWith(w) || w.endsWith(k)) {
        hit = m;
        break;
      }
    }
    if (hit) {
      hit.visible = true;
      shown.push(hit.name);
    } else missing.push(w);
  }

  // Rescue body if nothing matched
  if (!shown.some((n) => /body/i.test(n))) {
    const body = meshes.find((m) => /body/i.test(m.name || '') && !/weapon/i.test(m.name || ''));
    if (body) {
      body.visible = true;
      shown.push(body.name);
    }
  }

  // Hard-hide utility
  for (const m of meshes) {
    if (/xtra_|quiver|bag|wood/i.test(m.name || '')) m.visible = false;
  }

  console.info(`[toonKitPlay] equip shown=${shown.length} missing=${missing.length}`, shown.slice(0, 8));
  return { matched: shown.length, shown, missing };
}

function meshKey(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/^wk_|^brb_|^orc_|^elf_|^ud_|^dwf_/, '')
    .replace(/units_/g, '')
    .replace(/xtra_/g, '')
    .replace(/weapon_/g, 'weapon')
    .replace(/[^a-z0-9]/g, '');
}

function isEquippableName(name) {
  return /body|arms|legs|head|shoulder|weapon|sword|axe|hammer|mace|spear|bow|staff|shield|dagger|pick|quiver|bag|wood|xtra|units_/i.test(
    name || ''
  );
}

export function normalizeEmbeddedMaps(root) {
  let n = 0;
  root.traverse((obj) => {
    if (!obj.isMesh && !obj.isSkinnedMesh) return;
    obj.castShadow = true;
    obj.receiveShadow = true;
    if (obj.isSkinnedMesh) obj.frustumCulled = false;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const m of mats) {
      if (!m?.map) continue;
      m.map.colorSpace = SRGBColorSpace;
      m.map.flipY = false;
      m.map.wrapS = m.map.wrapT = ClampToEdgeWrapping;
      m.map.needsUpdate = true;
      if (m.color) m.color.setHex(0xffffff);
      if ('metalness' in m) m.metalness = Math.min(m.metalness ?? 0, 0.15);
      if ('roughness' in m && (m.roughness == null || m.roughness < 0.2)) m.roughness = 0.75;
      m.side = DoubleSide;
      m.needsUpdate = true;
      n++;
    }
  });
  return n;
}

/**
 * Full play deploy after GLTF load — ObjectStore loadRaceKit parity.
 * @param {import('three').Object3D} gltfScene
 * @param {{ meshIds?: string[], targetH?: number }} opts
 */
export function deployToonPlayKit(gltfScene, opts = {}) {
  // SkeletonUtils.clone required for multiple instances; do NOT unify/pose after
  const kit = skeletonClone(gltfScene);
  kit.userData.importPipeline = 'toon-rts-glb';
  kit.userData.playPath = 'objectstore-loadRaceKit-parity';
  kit.userData.grudge6Play = true;
  kit.userData.warlordsPlayContract = WARLORDS_PLAY_CONTRACT_VERSION;

  // Bind pose as loaded — never multi-pose
  kit.traverse((o) => {
    if (o.isSkinnedMesh && o.skeleton) {
      o.skeleton.update();
      o.frustumCulled = false;
    }
  });

  const meshIds = opts.meshIds || [];
  const equip = applyMeshIdsExclusive(kit, meshIds);
  const mats = normalizeEmbeddedMaps(kit);
  const fit = fitRootUniformSi(kit, opts.targetH ?? HUMAN_HEIGHT_M, { centerXZ: true });
  faceRootTowardCamera(kit);

  // Re-fit after materials (bbox unchanged for bone measure, but safe)
  fitRootUniformSi(kit, opts.targetH ?? HUMAN_HEIGHT_M, { centerXZ: true });
  faceRootTowardCamera(kit);

  const bones = measureBoneStructuralBBox(kit);
  const head = findNamed(kit, ['Bip001 Head', 'Bip001_Head']);
  const foot = findNamed(kit, ['Bip001 L Foot', 'Bip001_L_Foot', 'Bip001 R Foot']);
  let headY = null;
  let footY = null;
  if (head) {
    head.getWorldPosition(_p);
    headY = _p.y;
  }
  if (foot) {
    foot.getWorldPosition(_p);
    footY = _p.y;
  }
  const upright = headY != null && footY != null ? headY > footY + 0.3 : null;

  console.info(
    `[toonKitPlay] deploy equip=${equip.matched} mats=${mats} h=${fit.height.toFixed(2)}m ` +
      `headY=${headY?.toFixed(2)} footY=${footY?.toFixed(2)} upright=${upright} ` +
      `boneBox=${bones ? (bones.max.y - bones.min.y).toFixed(2) : '—'}`
  );

  return {
    root: kit,
    equip,
    fit,
    upright,
    height: fit.height,
    headY,
    footY
  };
}

/** Re-ground after anim sample using bone structural box. */
export function reGroundToonKit(root, groundY = 0) {
  if (!root) return 0;
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    if (o.isSkinnedMesh && o.skeleton) o.skeleton.update();
  });
  const box = measureBoneStructuralBBox(root);
  if (!box || !Number.isFinite(box.min.y)) return 0;
  const dy = groundY - box.min.y;
  if (Math.abs(dy) > 1e-5) root.position.y += dy;
  root.userData.deployHeightM = box.max.y - box.min.y;
  return dy;
}
